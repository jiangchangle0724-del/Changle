// One party room's session around party-base's state machine: who is connected, the speaker's
// clock, the host's actions turned into RoomEvents (stamped in speaker time) and through reduce(),
// the routine being played (src/shared/show.ts: when its warm-up, teaching, dance and cool-down
// are), the beats the phones send while it is danced, and what to tell whom. Pure: no sockets, no
// storage, no real clock (the room's clock is passed in), so the tests drive it directly.
// src/server/worker.ts is the Durable Object around it.
import { createRoom, reduce, RoomError, type RoomEvent, type RoomState } from "../../../party-base/src/index";
import { TEST_ROUTINE } from "../shared/catalog";
import { MAX_BEATS_PER_MSG, SONG_SYNC_MS, type ClientMsg, type HostAction, type Results, type RoutineInfo, type ServerMsg } from "../shared/protocol";
import { buildShow, introOf, phraseStart, songStart, type Anchors, type Show } from "../shared/show";
import { checkTapped, type Tapped } from "./tapped";
import { addBeats, clearFrom, emptyScores, floorOf, resultsOf, type Scores } from "./tally";

/** A speaker page that drops gets this long to come back before the room goes back to the lobby. */
export const SPEAKER_GRACE_MS = 8_000;
/** A phone that drops (screen locked, bad Wi-Fi) keeps its seat this long. */
export const PLAYER_GRACE_MS = 45_000;
/** A room nobody has used for this long is cleared away. */
export const IDLE_MS = 12 * 3_600_000;
/** A routine's first warm-up beat comes this long after the host starts it: time for every page to hear of it. */
export const LEAD_IN_MS = 3_000;
/** The speaker gets a phone's movement at most this often (a little dancer on the TV needs no more). */
export const PULSE_GAP_MS = 80;
/** 找拍子: a phone's taps go on to the speaker at most this often (no song's beat is faster). */
export const TAP_GAP_MS = 150;
/** 继续 after a pause: the run picks up this long after the tap, its last moments before the pause played again first. */
export const RESUME_LEAD_MS = 1_500;
export { SONG_SYNC_MS };
/**
 * 开始跳 and 这一段再来: the count-in's first beat comes this long after the tap, so the speaker
 * hears of it in time to play it (else the TV counts "3, 2, 1").
 */
export const COUNT_LEAD_MS = 600;
/** After a routine's last beat is heard, this long before the room finishes it. */
const FINISH_MARGIN_MS = 500;
/** 看结果 waits this long after the dance's last beat is heard: the phones' last bar is on its way. */
const LAST_BAR_MS = 1_000;

/** What the room keeps (Durable Object storage). Times are the room's clock unless they say speaker. */
export interface SessionData {
  state: RoomState;
  routine: RoutineInfo | null;
  /** The last dance's results, while the room shows them. */
  results: Results | null;
  /** The speaker's clock minus the room's: speaker time = room time + speakerOffset. */
  speakerOffset: number;
  /** speakerOffset is from the speaker's own pings (not just the guess made when the room was opened). */
  speakerSynced: boolean;
  /** When the speaker page went away (room time), while it has the grace period to come back. */
  speakerGoneAt: number | null;
  /** Phones gone away, and when (room time) they lose their seat. */
  leaving: Record<string, number>;
  /** Speaker time the part before the dance (warm-up, teaching) runs out and the dance follows on. */
  danceAt: number | null;
  /** Speaker time the routine being danced is over, its cool-down too. */
  finishAt: number | null;
  lastActive: number;
  /** The TV's delay was measured in this room (CALIBRATED), or the host skipped measuring it. */
  calibrated?: boolean;
  calSkipped?: boolean;
  /** A dance the host started before the TV's delay was measured: it starts once that's done (or skipped). */
  pending?: { routineId: string; mode: "learn" | "dance" } | null;
}

export type Role = "speaker" | "player";
export interface From {
  role: Role;
  playerId: string | null;
}
/**
 * A message for one player (by id), for the speaker, or for everyone; a player's phone to close; or
 * a song's beat found by 找拍子, for the songbook (the Durable Object keeps it for every room).
 */
export type Out = { to: "all" | "speaker" | { player: string }; msg: ServerMsg } | { close: string } | { songbook: { songId: string; tapped: Tapped } };

/**
 * A phone's id: what its page makes (letters, digits, - and _), and never the name of something
 * every object has ("toString", "__proto__"), which would go wrong as a key in the room's records.
 */
export function validPlayerId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) && !(id in Object.prototype);
}

const HOST_ACTIONS = new Set(["START_CALIBRATION", "SKIP_CALIBRATION", "START_LEARNING", "START_DANCING", "RESTART_SECTION", "FINISH_NOW", "PAUSE", "RESUME", "BACK_TO_LOBBY", "END_ROOM", "KICK"]);
const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export class Session {
  private out: Out[] = [];
  private changed = false;
  private scored = false;

  /**
   * `scores`: the beats of the dance being danced (kept apart from `d`: they change with every
   * bar, and the Durable Object stores them less often). `testRoutines`: the short routine of the
   * browser check can be started (local checks only).
   */
  constructor(
    public d: SessionData,
    private readonly now: () => number,
    public scores: Scores = emptyScores(),
    private readonly opts: { testRoutines?: boolean } = {},
  ) {
    // (a room stored before the dances were wired in)
    d.results ??= null;
    d.danceAt ??= null;
    if (d.routine) d.routine = { ...d.routine, mode: d.routine.mode ?? null, leadStartAt: d.routine.leadStartAt ?? null, fromBeat: d.routine.fromBeat ?? 0 };
  }

  /** A new room. `speakerAt`: the speaker page's clock when it asked, a first guess at its offset. */
  static create(code: string, now: number, speakerAt?: number): SessionData {
    const offset = fin(speakerAt) ? speakerAt - now : 0;
    return { state: createRoom(code, now + offset), routine: null, results: null, speakerOffset: offset, speakerSynced: false, speakerGoneAt: null, leaving: {}, danceAt: null, finishAt: null, lastActive: now };
  }

  /** The speaker's clock now, as well as the room knows it. */
  speakerNow(): number {
    return this.now() + this.d.speakerOffset;
  }

  expired(): boolean {
    return this.d.state.phase === "ended" || this.now() - this.d.lastActive >= IDLE_MS;
  }

  /** A page connected: the speaker, or a player's phone (with its id and name). */
  connect(from: From, name?: string): void {
    this.d.lastActive = this.now();
    if (from.role === "speaker") {
      this.d.speakerGoneAt = null;
      if (!this.d.state.speakerConnected) this.apply({ type: "SPEAKER_CONNECTED", at: this.speakerNow() });
      // (a speaker page reloaded mid-dance: the floor so far)
      if (this.d.state.phase === "dancing" && this.d.state.difficulty) this.out.push({ to: "speaker", msg: { t: "floor", ...floorOf(this.scores, this.d.state.difficulty) } });
      return;
    }
    if (!from.playerId || !validPlayerId(from.playerId)) return;
    delete this.d.leaving[from.playerId];
    const player = { id: from.playerId, name: cleanName(name), isHost: false };
    this.apply({ type: "PLAYER_JOINED", at: this.speakerNow(), player }, from);
  }

  /** A page's last connection closed. The seat (or the speaker) waits a while before it's gone. */
  disconnect(from: From): void {
    if (from.role === "speaker") {
      this.d.speakerGoneAt = this.now();
      this.changed = true;
    } else if (from.playerId && this.d.state.players.some((p) => p.id === from.playerId)) {
      this.d.leaving[from.playerId] = this.now() + PLAYER_GRACE_MS;
      this.changed = true;
    }
  }

  handle(from: From, msg: ClientMsg): void {
    if (!msg || typeof msg !== "object") return;
    // (a deadline gone by while the alarm was late, say the lead running out: dealt with before the
    // message, so a phone's first bar of the dance isn't turned away for coming before it)
    this.tick();
    switch (msg.t) {
      case "ping":
        // (not "activity": the speaker pings every second, and an idle room should still expire)
        this.send(from, { t: "pong", id: Number(msg.id) || 0, serverAt: this.now(), speakerAt: this.d.speakerSynced || from.role === "speaker" ? this.speakerNow() : null });
        return;
      case "clock":
        // (it moves by a millisecond or two every second: the Durable Object stores it when it has
        // moved enough, not on every report)
        if (from.role !== "speaker" || !fin(msg.offsetMs)) return;
        if (!this.d.speakerSynced) this.changed = true;
        this.d.speakerOffset = msg.offsetMs;
        this.d.speakerSynced = true;
        return;
      case "act":
        this.d.lastActive = this.now();
        if (from.role === "player" && from.playerId) this.act(from, msg.action);
        return;
      case "tap":
        this.tap(from, msg.at);
        return;
      case "calibrated":
        if (from.role !== "speaker" || !fin(msg.audioOffsetMs)) return;
        if (this.apply({ type: "CALIBRATED", at: this.speakerNow(), audioOffsetMs: Math.round(msg.audioOffsetMs) }, from)) {
          this.d.calibrated = true;
          this.startPending();
        }
        return;
      case "here":
        this.d.lastActive = this.now();
        if (from.role === "player" && from.playerId && this.d.state.players.some((p) => p.id === from.playerId)) {
          this.out.push({ to: "all", msg: { t: "here", playerId: from.playerId } });
        }
        return;
      case "beats":
        this.beats(from, msg.from, msg.offs);
        return;
      case "pulse":
        this.pulse(from, msg.e, msg.v);
        return;
      case "songAt":
        this.songAt(from, msg.startAt);
        return;
      case "songStall":
        this.songStall(from);
        return;
      case "songReady":
        this.songReady(from);
        return;
      case "songFailed":
        this.songFailed(from, msg.why);
        return;
      case "songTapped":
        this.songTapped(from, msg);
        return;
    }
  }

  /** When each phone's last 找拍子 tap went on to the speaker. */
  private readonly tappedAt = new Map<string, number>();

  /**
   * A tap, on to the speaker: the host's while calibrating; anyone's in the room while it finds a
   * song's beat (找拍子), at most one every TAP_GAP_MS from a phone.
   */
  private tap(from: From, at: unknown): void {
    const st = this.d.state;
    if (from.role !== "player" || !from.playerId || !fin(at)) return;
    if (st.phase === "calibrating") {
      if (this.isHost(from.playerId)) this.out.push({ to: "speaker", msg: { t: "tap", at, playerId: from.playerId } });
      return;
    }
    if (st.phase !== "learning" || !this.d.routine?.tapIn || !st.players.some((p) => p.id === from.playerId)) return;
    const now = this.now();
    const before = this.tappedAt.get(from.playerId);
    if (before !== undefined && now - before < TAP_GAP_MS) return;
    this.tappedAt.set(from.playerId, now);
    this.out.push({ to: "speaker", msg: { t: "tap", at, playerId: from.playerId } });
  }

  /**
   * The speaker found the song's beat (找拍子): checked as the songbook checks a tap-along, kept
   * (the songbook, for every room), and the song starts as any song does: the speaker holds its
   * video at its start again and says when it's ready (songReady).
   */
  private songTapped(from: From, body: unknown): void {
    const r = this.d.routine;
    const show = this.show();
    if (from.role !== "speaker" || this.d.state.phase !== "learning" || !r?.tapIn || !show || show.kind !== "song") return;
    const t = checkTapped(show.id, body, this.now());
    if (typeof t === "string") return this.send(from, { t: "error", code: "bad_taps", message: t });
    this.songbook[show.id] = t.firstBeatMs;
    const { tapIn: _done, ...rest } = r;
    this.d.routine = { ...rest, introMs: songStart(show, t.firstBeatMs) };
    this.changed = true;
    this.tappedAt.clear();
    // (only a room that measured its TV's delay keeps the beat for every room: without it, the
    // beat as heard here is late by the delay, and would be wrong everywhere else)
    if (this.d.calibrated) this.out.push({ songbook: { songId: show.id, tapped: { ...t, calibrated: true } } });
    this.out.push({ to: "all", msg: this.stateMsg() });
  }

  /** The speaker has the song's video held at its start: the song starts (its teaching, or its video) after the lead-in. */
  private songReady(from: From): void {
    const r = this.d.routine;
    const show = this.show();
    if (from.role !== "speaker" || this.d.state.phase !== "learning" || !r || !show || show.kind !== "song" || r.leadStartAt !== null || r.tapIn) return;
    const leadStartAt = Math.round(this.speakerNow() + LEAD_IN_MS);
    this.d.routine = { ...r, leadStartAt };
    this.d.danceAt = leadStartAt + show.leadMs;
    this.changed = true;
    this.out.push({ to: "all", msg: this.stateMsg() });
  }

  /** YouTube won't play the song here: back to the lobby, and everyone is told why. */
  private songFailed(from: From, why: unknown): void {
    const show = this.show();
    const st = this.d.state;
    if (from.role !== "speaker" || !show || show.kind !== "song" || (st.phase !== "learning" && st.phase !== "dancing")) return;
    const host = st.players.find((p) => p.isHost);
    if (!host) return;
    this.act({ role: "player", playerId: host.id }, { type: "BACK_TO_LOBBY" });
    if (why === "notap") this.out.push({ to: "all", msg: { t: "error", code: "song_notap", message: "nobody found the song's beat" } });
    else this.out.push({ to: "all", msg: { t: "error", code: why === "offline" ? "song_offline" : "song_blocked", message: "the song's video won't play here" } });
  }

  /**
   * The speaker, while a song plays: where the dance's first beat really is, from its video's
   * clock. The room moves the beat there (BEAT_MOVED) when it's more than SONG_SYNC_MS off, however
   * far that is; a dance held for its video (songStall) starts again from there.
   */
  private songAt(from: From, startAt: unknown): void {
    const st = this.d.state;
    const r = this.d.routine;
    const show = this.show();
    if (from.role !== "speaker" || typeof startAt !== "number" || !fin(startAt)) return;
    if (st.phase !== "dancing" || !show || show.kind !== "song" || st.routineStartAt === null || !r || r.fromBeat !== 0 || r.pausedAt !== undefined) return;
    const to = Math.round(startAt);
    const held = r.heldAt !== undefined;
    if (!held && Math.abs(to - st.routineStartAt) < SONG_SYNC_MS) return;
    if (held) {
      const { heldAt: _was, ...rest } = r;
      this.d.routine = rest;
      this.changed = true;
    }
    if (to !== st.routineStartAt && this.apply({ type: "BEAT_MOVED", at: this.speakerNow(), routineStartAt: to }, from)) this.d.finishAt = this.endOf(show);
    else if (held) {
      this.d.finishAt = this.endOf(show);
      this.out.push({ to: "all", msg: this.stateMsg() });
    }
  }

  /**
   * The speaker: the song's video should be playing and isn't (stalled, an ad, stopped till someone
   * taps it). The dance waits for it (heldAt): the coach and the phones stop with the song, and the
   * next songAt starts them again from where the video is, however long that took.
   */
  private songStall(from: From): void {
    const st = this.d.state;
    const r = this.d.routine;
    const show = this.show();
    if (from.role !== "speaker" || !r || !show || show.kind !== "song" || st.phase !== "dancing" || st.routineStartAt === null) return;
    if (r.pausedAt !== undefined || r.heldAt !== undefined || r.fromBeat !== 0) return;
    this.d.routine = { ...r, heldAt: Math.round(this.speakerNow()) };
    this.changed = true;
    this.out.push({ to: "all", msg: this.stateMsg() });
  }

  /** When each phone's last pulse went on to the speaker (not kept: a pulse is only for now). */
  private readonly pulsedAt = new Map<string, number>();

  /**
   * Each song's first beat in its video (ms) as someone tapped along to it (the songbook,
   * server/songbook.ts): the Durable Object fills this in before a song starts.
   */
  songbook: Record<string, number> = {};

  /**
   * A phone's pulse, while a dance plays: on to the speaker, at most one movement-only pulse every
   * PULSE_GAP_MS from a phone (one with a verdict always goes: there's one a beat).
   */
  private pulse(from: From, e: unknown, v: unknown): void {
    const st = this.d.state;
    if (from.role !== "player" || !from.playerId || (st.phase !== "learning" && st.phase !== "dancing")) return;
    if (!st.players.some((p) => p.id === from.playerId) || typeof e !== "number" || !Number.isFinite(e)) return;
    const verdict = v === "hit" || v === "close" || v === "miss" ? v : null;
    const now = this.now();
    const before = this.pulsedAt.get(from.playerId);
    if (!verdict && before !== undefined && now - before < PULSE_GAP_MS) return;
    this.pulsedAt.set(from.playerId, now);
    this.out.push({ to: "speaker", msg: { t: "pulse", playerId: from.playerId, e: Math.round(Math.min(1, Math.max(0, e)) * 100) / 100, v: verdict } });
  }

  /** A phone's beats of the dance being danced: kept, and the floor so far goes to the speaker. */
  private beats(from: From, first: unknown, offs: unknown): void {
    const st = this.d.state;
    const r = this.d.routine;
    if (from.role !== "player" || st.phase !== "dancing" || !r || st.routineStartAt === null || !st.difficulty) return;
    const player = st.players.find((p) => p.id === from.playerId);
    if (!player || !Array.isArray(offs) || offs.length > MAX_BEATS_PER_MSG || !Number.isInteger(first)) return;
    let f = first as number;
    let list: unknown[] = offs;
    let took = false;
    // beats before the one 这一段再来 went back to were danced before it, and stay: a bar of them
    // that comes in late still counts, whatever the time now
    if (f < r.fromBeat) {
      const before = Math.min(list.length, r.fromBeat - f);
      if (!addBeats(this.scores, player.id, player.name, f, list.slice(0, before), r.totalBeats, st.difficulty)) return;
      took = true;
      list = list.slice(before);
      f = r.fromBeat;
    }
    // the rest: only beats of this run that the room has heard (a beat of slack for the clocks)
    const heard = r.fromBeat + (this.speakerNow() - st.audioOffsetMs - st.routineStartAt) / (60000 / r.bpm);
    if (list.length && f + list.length - 1 <= heard + 1) took = addBeats(this.scores, player.id, player.name, f, list, r.totalBeats, st.difficulty) || took;
    if (!took) return;
    this.scored = true;
    this.out.push({ to: "speaker", msg: { t: "floor", ...floorOf(this.scores, st.difficulty) } });
  }

  private act(from: From, a: HostAction): void {
    if (!a || typeof a !== "object" || !HOST_ACTIONS.has(a.type)) return;
    const by = from.playerId!;
    const at = this.speakerNow();
    const r = this.d.routine;
    switch (a.type) {
      case "START_LEARNING": {
        if (!this.isHost(by)) return this.send(from, { t: "error", code: "not_host", message: `player ${by} is not the host` });
        const id = String(a.routineId).slice(0, 64);
        const show = id === TEST_ROUTINE.id && !this.opts.testRoutines ? null : buildShow(id, a.mode === "dance" ? "dance" : "learn");
        if (!show) return this.send(from, { t: "error", code: "no_routine", message: `unknown routine ${id}` });
        // the first dance of a room measures the TV's delay first (10 seconds, the host taps 8
        // clicks; the host can skip it), then starts by itself. Not the metronome or the checks'
        // test dance: they're for measuring
        if (!this.d.calibrated && !this.d.calSkipped && (this.d.state.phase === "lobby" || this.d.state.phase === "results") && show.kind !== "metronome" && show.id !== TEST_ROUTINE.id) {
          this.d.pending = { routineId: show.id, mode: show.mode ?? "learn" };
          if (!this.apply({ type: "START_CALIBRATION", at, byPlayerId: by }, from)) this.d.pending = null;
          return;
        }
        // the first warm-up beat a moment from now, on a whole millisecond (the metronome has none:
        // it waits for the host's START_DANCING; a song waits for the speaker to have its video
        // ready, songReady)
        const leadStartAt = show.lead.length && show.kind !== "song" ? Math.round(at + LEAD_IN_MS) : null;
        // a song's beat is where people tapped along to it once (the songbook): untapped, everyone
        // taps along to its video first (找拍子) and the song waits for that
        const tapped = show.kind === "song" ? this.songbook[show.id] : undefined;
        // (a song danced along its own parts has its beat measured: no 找拍子 for it)
        const known = (typeof tapped === "number" && Number.isFinite(tapped)) || !!show.song?.aligned;
        const introMs = Math.round(typeof tapped === "number" && Number.isFinite(tapped) ? songStart(show, tapped) : show.introMs);
        // (set first: the state message that goes out with the change carries them)
        const results = this.d.results;
        this.d.routine = { routineId: show.id, bpm: show.bpm, beatsPerBar: 4, totalBeats: show.dance.length, mode: show.mode, leadStartAt, fromBeat: 0, introMs, ...(show.kind === "song" && !known ? { tapIn: true } : {}) };
        this.tappedAt.clear();
        this.d.results = null;
        if (this.apply({ type: "START_LEARNING", at, byPlayerId: by, routineId: show.id, difficulty: show.difficulty, bpm: show.bpm }, from)) {
          this.d.danceAt = leadStartAt === null ? null : leadStartAt + show.leadMs;
          this.d.finishAt = null;
          this.resetScores();
        } else {
          this.d.routine = r;
          this.d.results = results;
        }
        return;
      }
      case "START_DANCING":
      case "RESTART_SECTION": {
        const show = this.show();
        if (!show || !r) return this.send(from, { t: "error", code: "no_routine", message: "pick a routine first" });
        // (找拍子 first: the dance would be off its beat)
        if (r.tapIn && this.d.state.phase === "learning") return this.send(from, { t: "error", code: "song_tapping", message: "find the song's beat first" });
        // (a song plays on in its video: no going back a phrase in it)
        if (a.type === "RESTART_SECTION" && show.kind === "song") return this.send(from, { t: "error", code: "not_for_songs", message: "a song can't go back a phrase" });
        // 这一段再来 goes back to the start of the 8-count the room is hearing (the metronome, and a
        // dance that hasn't begun: to the top); 开始跳 starts the dance from its first beat
        const fromBeat = a.type === "RESTART_SECTION" && show.routine && this.d.state.phase === "dancing" ? phraseStart(show, this.anchors(), at - this.d.state.audioOffsetMs) : 0;
        // the beat comes after a moment and a count-in (a song: its video from the start, and its
        // intro), on a whole millisecond
        const routineStartAt = Math.round(at + COUNT_LEAD_MS + introOf(show, this.anchors()));
        const results = this.d.results;
        const { pausedAt: _go, ...unpaused } = r;
        this.d.routine = { ...unpaused, leadStartAt: null, fromBeat };
        this.d.results = null;
        if (this.apply({ type: a.type, at, byPlayerId: by, routineStartAt }, from)) {
          this.d.danceAt = null;
          this.d.finishAt = this.endOf(show);
          if (fromBeat > 0) {
            clearFrom(this.scores, fromBeat);
            this.scored = true;
            if (this.d.state.difficulty) this.out.push({ to: "speaker", msg: { t: "floor", ...floorOf(this.scores, this.d.state.difficulty) } });
          } else this.resetScores();
        } else {
          this.d.routine = r;
          this.d.results = results;
        }
        return;
      }
      case "FINISH_NOW": {
        const show = this.show();
        const st = this.d.state;
        if (!this.isHost(by)) return this.send(from, { t: "error", code: "not_host", message: `player ${by} is not the host` });
        if (st.phase !== "dancing" || !show || !r || st.routineStartAt === null) return this.send(from, { t: "error", code: "bad_phase", message: `FINISH_NOW not allowed in phase ${st.phase}` });
        const danceOver = st.routineStartAt + (show.dance.length - r.fromBeat) * show.beatMs + st.audioOffsetMs + LAST_BAR_MS;
        if (at < danceOver) return this.send(from, { t: "error", code: "too_early", message: "the dance isn't over yet" });
        this.finish();
        return;
      }
      case "PAUSE": {
        const st = this.d.state;
        if (!this.isHost(by)) return this.send(from, { t: "error", code: "not_host", message: `player ${by} is not the host` });
        // (something has to be playing: the lead, or the dance)
        const playing = r && ((st.phase === "learning" && r.leadStartAt !== null) || st.phase === "dancing");
        if (!r || !playing || r.pausedAt !== undefined) return this.send(from, { t: "error", code: "bad_phase", message: `nothing to pause in phase ${st.phase}` });
        this.d.routine = { ...r, pausedAt: Math.round(at) };
        this.changed = true;
        this.out.push({ to: "all", msg: this.stateMsg() });
        return;
      }
      case "RESUME": {
        const st = this.d.state;
        if (!this.isHost(by)) return this.send(from, { t: "error", code: "not_host", message: `player ${by} is not the host` });
        if (!r || r.pausedAt === undefined) return this.send(from, { t: "error", code: "bad_phase", message: "not paused" });
        // everything moves later by the time paused: it picks up a moment from now, the last
        // moments before the pause first again (a run-up)
        const shift = Math.max(0, Math.round(at + RESUME_LEAD_MS - r.pausedAt));
        // (held for the video too: 继续 tells the video to play again; if it doesn't, it's held again)
        const { pausedAt: _was, heldAt: _held, ...rest } = r;
        if (st.phase === "dancing" && st.routineStartAt !== null) {
          this.d.routine = rest;
          if (!this.apply({ type: "RESUMED", at, byPlayerId: by, routineStartAt: st.routineStartAt + shift }, from)) {
            this.d.routine = r;
            return;
          }
          if (this.d.finishAt !== null) this.d.finishAt += shift;
          return;
        }
        this.d.routine = { ...rest, leadStartAt: rest.leadStartAt === null ? null : rest.leadStartAt + shift };
        if (this.d.danceAt !== null) this.d.danceAt += shift;
        this.changed = true;
        this.out.push({ to: "all", msg: this.stateMsg() });
        return;
      }
      case "SKIP_CALIBRATION":
        if (this.apply({ type: "SKIP_CALIBRATION", at, byPlayerId: by }, from)) {
          this.d.calSkipped = true;
          this.startPending();
        }
        return;
      case "KICK":
        if (this.apply({ type: "KICK", at, byPlayerId: by, playerId: String(a.playerId) }, from)) {
          delete this.d.leaving[String(a.playerId)];
          this.out.push({ close: String(a.playerId) });
        }
        return;
      case "BACK_TO_LOBBY":
      case "END_ROOM": {
        const results = this.d.results;
        const { tapIn: _stop, pausedAt: _paused, ...rest } = r ?? ({} as RoutineInfo);
        this.d.routine = r ? { ...rest, leadStartAt: null, fromBeat: 0 } : null;
        this.d.results = null;
        if (this.apply({ type: a.type, at, byPlayerId: by }, from)) {
          this.d.danceAt = null;
          this.d.finishAt = null;
          this.d.pending = null;
          this.resetScores();
        } else {
          this.d.routine = r;
          this.d.results = results;
        }
        return;
      }
      default:
        this.apply({ type: a.type, at, byPlayerId: by }, from);
    }
  }

  /** The room's clock reached a deadline: a speaker or a phone gone for good, the dance's turn, a routine over. */
  tick(): void {
    const now = this.now();
    if (this.d.speakerGoneAt !== null && now - this.d.speakerGoneAt >= SPEAKER_GRACE_MS) {
      this.d.speakerGoneAt = null;
      this.d.danceAt = null;
      this.d.finishAt = null;
      if (this.d.routine) this.d.routine = { ...this.d.routine, leadStartAt: null, fromBeat: 0 };
      this.apply({ type: "SPEAKER_DISCONNECTED", at: this.speakerNow() });
    }
    for (const [id, until] of Object.entries(this.d.leaving)) {
      if (now < until) continue;
      delete this.d.leaving[id];
      this.changed = true;
      this.apply({ type: "PLAYER_LEFT", at: this.speakerNow(), playerId: id });
    }
    // (paused, or held for the song's video: the lead's end and the dance's end wait)
    const paused = this.d.routine?.pausedAt !== undefined || this.d.routine?.heldAt !== undefined;
    if (!paused && this.d.danceAt !== null && this.speakerNow() >= this.d.danceAt) {
      const leadEnd = this.d.danceAt;
      this.d.danceAt = null;
      const show = this.show();
      // the dance follows the lead beat for beat: its first beat a count-in after the lead's last
      // (a song's: its intro after, the video starting as the lead ends)
      if (show && this.d.state.phase === "learning" && this.apply({ type: "LEARNING_DONE", at: this.speakerNow(), routineStartAt: leadEnd + introOf(show, this.anchors()) })) this.d.finishAt = this.endOf(show);
    }
    if (!paused && this.d.finishAt !== null && this.speakerNow() >= this.d.finishAt) {
      if (this.d.state.phase === "dancing") this.finish();
      else this.d.finishAt = null;
    }
  }

  /** The room's clock time of the next deadline, or null. */
  nextWake(): number | null {
    const times: number[] = [...Object.values(this.d.leaving)];
    if (this.d.speakerGoneAt !== null) times.push(this.d.speakerGoneAt + SPEAKER_GRACE_MS);
    // (paused: the lead's end and the dance's end wait for 继续; held: for the song's video)
    if (this.d.routine?.pausedAt === undefined && this.d.routine?.heldAt === undefined) {
      if (this.d.danceAt !== null) times.push(this.d.danceAt - this.d.speakerOffset);
      if (this.d.finishAt !== null) times.push(this.d.finishAt - this.d.speakerOffset);
    }
    times.push(this.d.lastActive + IDLE_MS);
    return Math.min(...times);
  }

  /**
   * What to send since the last flush, whether the stored data changed, and whether the beats of
   * the dance did (`scores`).
   */
  flush(): { out: Out[]; changed: boolean; scored: boolean } {
    const r = { out: this.out, changed: this.changed, scored: this.scored };
    this.out = [];
    this.changed = false;
    this.scored = false;
    return r;
  }

  /** The state message every page gets. */
  stateMsg(): ServerMsg {
    return { t: "state", state: this.d.state, routine: this.d.routine, results: this.d.results, ...(this.d.calibrated ? { calibrated: true } : {}) };
  }

  /** The dance the host started before the TV's delay was measured: now that it is (or was skipped). */
  private startPending(): void {
    const p = this.d.pending;
    this.d.pending = null;
    const host = this.d.state.players.find((x) => x.isHost);
    if (!p || !host) return;
    this.act({ role: "player", playerId: host.id }, { type: "START_LEARNING", routineId: p.routineId, mode: p.mode });
  }

  /** The routine the room is on, as a show. */
  private show(): Show | null {
    return this.d.routine ? buildShow(this.d.routine.routineId, this.d.routine.mode) : null;
  }

  private anchors(): Anchors {
    return { leadStartAt: this.d.routine?.leadStartAt ?? null, danceStartAt: this.d.state.routineStartAt, fromBeat: this.d.routine?.fromBeat ?? 0, introMs: this.d.routine?.introMs ?? null };
  }

  /** Speaker time the routine being danced is over: its last cool-down beat heard, and a margin. */
  private endOf(show: Show): number | null {
    const start = this.d.state.routineStartAt;
    if (start === null) return null;
    return start + (show.dance.length - (this.d.routine?.fromBeat ?? 0)) * show.beatMs + show.tailMs + this.d.state.audioOffsetMs + FINISH_MARGIN_MS;
  }

  /** The dance is over: the results from the beats the phones sent go out with the new state. */
  private finish(): void {
    const st = this.d.state;
    const r = this.d.routine;
    this.d.finishAt = null;
    this.d.results = r && st.difficulty ? resultsOf(this.scores, st.players.map((p) => p.id), r.routineId, st.difficulty, r.totalBeats) : null;
    if (!this.apply({ type: "FINISH", at: this.speakerNow() })) this.d.results = null;
  }

  private resetScores(): void {
    if (!Object.keys(this.scores.offs).length) return;
    this.scores = emptyScores();
    this.scored = true;
  }

  private isHost(playerId: string): boolean {
    return !!this.d.state.players.find((p) => p.id === playerId)?.isHost;
  }

  private send(from: From, msg: ServerMsg): void {
    this.out.push({ to: from.role === "speaker" ? "speaker" : { player: from.playerId ?? "" }, msg });
  }

  /** Through the state machine. A refused event goes back to whoever asked, as an error. */
  private apply(ev: RoomEvent, from?: From): boolean {
    try {
      this.d.state = reduce(this.d.state, ev);
      this.changed = true;
      this.out.push({ to: "all", msg: this.stateMsg() });
      return true;
    } catch (e) {
      if (!(e instanceof RoomError)) throw e;
      if (from) this.send(from, { t: "error", code: e.code, message: e.message });
      return false;
    }
  }
}

/** A name as a person typed it: trimmed, at most 16 characters, never empty. */
export function cleanName(name: string | undefined): string {
  const n = [...(name ?? "").replace(/\s+/g, " ").trim()].slice(0, 16).join("");
  return n || "Player";
}

/** A room code from 4 random characters of the alphabet. */
export function makeCode(alphabet: string, random: (n: number) => number): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[random(alphabet.length)];
  return s;
}

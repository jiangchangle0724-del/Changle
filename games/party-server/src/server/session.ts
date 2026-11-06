// One party room's session around party-base's state machine: who is connected, the speaker's
// clock, the host's actions turned into RoomEvents (stamped in speaker time) and through reduce(),
// the routine being played (src/shared/show.ts: when its warm-up, teaching, dance and cool-down
// are), the beats the phones send while it is danced, and what to tell whom. Pure: no sockets, no
// storage, no real clock (the room's clock is passed in), so the tests drive it directly.
// src/server/worker.ts is the Durable Object around it.
import { createRoom, reduce, RoomError, type RoomEvent, type RoomState } from "../../../party-base/src/index";
import { TEST_ROUTINE } from "../shared/catalog";
import { MAX_BEATS_PER_MSG, type ClientMsg, type HostAction, type Results, type RoutineInfo, type ServerMsg } from "../shared/protocol";
import { buildShow, phraseStart, type Anchors, type Show } from "../shared/show";
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
}

export type Role = "speaker" | "player";
export interface From {
  role: Role;
  playerId: string | null;
}
/** A message for one player (by id), for the speaker, or for everyone; or a player's phone to close. */
export type Out = { to: "all" | "speaker" | { player: string }; msg: ServerMsg } | { close: string };

/**
 * A phone's id: what its page makes (letters, digits, - and _), and never the name of something
 * every object has ("toString", "__proto__"), which would go wrong as a key in the room's records.
 */
export function validPlayerId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,64}$/.test(id) && !(id in Object.prototype);
}

const HOST_ACTIONS = new Set(["START_CALIBRATION", "SKIP_CALIBRATION", "START_LEARNING", "START_DANCING", "RESTART_SECTION", "FINISH_NOW", "BACK_TO_LOBBY", "END_ROOM", "KICK"]);
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
        // only the host's taps, only while calibrating, only to the speaker
        if (from.role !== "player" || !from.playerId || !fin(msg.at) || this.d.state.phase !== "calibrating") return;
        if (!this.isHost(from.playerId)) return;
        this.out.push({ to: "speaker", msg: { t: "tap", at: msg.at, playerId: from.playerId } });
        return;
      case "calibrated":
        if (from.role !== "speaker" || !fin(msg.audioOffsetMs)) return;
        this.apply({ type: "CALIBRATED", at: this.speakerNow(), audioOffsetMs: Math.round(msg.audioOffsetMs) }, from);
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
    }
  }

  /** When each phone's last pulse went on to the speaker (not kept: a pulse is only for now). */
  private readonly pulsedAt = new Map<string, number>();

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
        // the first warm-up beat a moment from now, on a whole millisecond (the metronome has none:
        // it waits for the host's START_DANCING)
        const leadStartAt = show.lead.length ? Math.round(at + LEAD_IN_MS) : null;
        // (set first: the state message that goes out with the change carries them)
        const results = this.d.results;
        this.d.routine = { routineId: show.id, bpm: show.bpm, beatsPerBar: 4, totalBeats: show.dance.length, mode: show.mode, leadStartAt, fromBeat: 0 };
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
        // 这一段再来 goes back to the start of the 8-count the room is hearing (the metronome, and a
        // dance that hasn't begun: to the top); 开始跳 starts the dance from its first beat
        const fromBeat = a.type === "RESTART_SECTION" && show.routine && this.d.state.phase === "dancing" ? phraseStart(show, this.anchors(), at - this.d.state.audioOffsetMs) : 0;
        // the beat comes after a moment and a count-in, on a whole millisecond
        const routineStartAt = Math.round(at + COUNT_LEAD_MS + show.countIn * show.beatMs);
        const results = this.d.results;
        this.d.routine = { ...r, leadStartAt: null, fromBeat };
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
      case "KICK":
        if (this.apply({ type: "KICK", at, byPlayerId: by, playerId: String(a.playerId) }, from)) {
          delete this.d.leaving[String(a.playerId)];
          this.out.push({ close: String(a.playerId) });
        }
        return;
      case "BACK_TO_LOBBY":
      case "END_ROOM": {
        const results = this.d.results;
        this.d.routine = r ? { ...r, leadStartAt: null, fromBeat: 0 } : null;
        this.d.results = null;
        if (this.apply({ type: a.type, at, byPlayerId: by }, from)) {
          this.d.danceAt = null;
          this.d.finishAt = null;
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
    if (this.d.danceAt !== null && this.speakerNow() >= this.d.danceAt) {
      const leadEnd = this.d.danceAt;
      this.d.danceAt = null;
      const show = this.show();
      // the dance follows the lead beat for beat: its first beat a count-in after the lead's last
      if (show && this.d.state.phase === "learning" && this.apply({ type: "LEARNING_DONE", at: this.speakerNow(), routineStartAt: leadEnd + show.countIn * show.beatMs })) this.d.finishAt = this.endOf(show);
    }
    if (this.d.finishAt !== null && this.speakerNow() >= this.d.finishAt) {
      if (this.d.state.phase === "dancing") this.finish();
      else this.d.finishAt = null;
    }
  }

  /** The room's clock time of the next deadline, or null. */
  nextWake(): number | null {
    const times: number[] = [...Object.values(this.d.leaving)];
    if (this.d.speakerGoneAt !== null) times.push(this.d.speakerGoneAt + SPEAKER_GRACE_MS);
    if (this.d.danceAt !== null) times.push(this.d.danceAt - this.d.speakerOffset);
    if (this.d.finishAt !== null) times.push(this.d.finishAt - this.d.speakerOffset);
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
    return { t: "state", state: this.d.state, routine: this.d.routine, results: this.d.results };
  }

  /** The routine the room is on, as a show. */
  private show(): Show | null {
    return this.d.routine ? buildShow(this.d.routine.routineId, this.d.routine.mode) : null;
  }

  private anchors(): Anchors {
    return { leadStartAt: this.d.routine?.leadStartAt ?? null, danceStartAt: this.d.state.routineStartAt, fromBeat: this.d.routine?.fromBeat ?? 0 };
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

// One party room's session around party-base's state machine: who is connected, the speaker's
// clock, the host's actions turned into RoomEvents (stamped in speaker time) and through reduce(),
// and what to tell whom. Pure: no sockets, no storage, no real clock (the room's clock is passed
// in), so the tests drive it directly. src/server/worker.ts is the Durable Object around it.
import { beatDurationMs, createRoom, reduce, RoomError, type RoomEvent, type RoomState } from "../../../party-base/src/index";
import { COUNT_IN_BEATS, METRONOME, type ClientMsg, type HostAction, type RoutineInfo, type ServerMsg } from "../shared/protocol";

/** A speaker page that drops gets this long to come back before the room goes back to the lobby. */
export const SPEAKER_GRACE_MS = 8_000;
/** A phone that drops (screen locked, bad Wi-Fi) keeps its seat this long. */
export const PLAYER_GRACE_MS = 45_000;
/** A room nobody has used for this long is cleared away. */
export const IDLE_MS = 12 * 3_600_000;
/** After a routine's last beat is heard, this long before the room finishes it. */
const FINISH_MARGIN_MS = 500;

/** What the room keeps (Durable Object storage). Times are the room's clock unless they say speaker. */
export interface SessionData {
  state: RoomState;
  routine: RoutineInfo | null;
  /** The speaker's clock minus the room's: speaker time = room time + speakerOffset. */
  speakerOffset: number;
  /** speakerOffset is from the speaker's own pings (not just the guess made when the room was opened). */
  speakerSynced: boolean;
  /** When the speaker page went away (room time), while it has the grace period to come back. */
  speakerGoneAt: number | null;
  /** Phones gone away, and when (room time) they lose their seat. */
  leaving: Record<string, number>;
  /** Speaker time the routine being danced is over. */
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

const HOST_ACTIONS = new Set(["START_CALIBRATION", "SKIP_CALIBRATION", "START_LEARNING", "START_DANCING", "RESTART_SECTION", "BACK_TO_LOBBY", "END_ROOM", "KICK"]);
const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const ROUTINES: Record<string, RoutineInfo> = { [METRONOME.routineId]: METRONOME };

export class Session {
  private out: Out[] = [];
  private changed = false;

  constructor(
    public d: SessionData,
    private readonly now: () => number,
  ) {}

  /** A new room. `speakerAt`: the speaker page's clock when it asked, a first guess at its offset. */
  static create(code: string, now: number, speakerAt?: number): SessionData {
    const offset = fin(speakerAt) ? speakerAt - now : 0;
    return { state: createRoom(code, now + offset), routine: null, speakerOffset: offset, speakerSynced: false, speakerGoneAt: null, leaving: {}, finishAt: null, lastActive: now };
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
      return;
    }
    if (!from.playerId) return;
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
        if (!this.d.state.players.find((p) => p.id === from.playerId)?.isHost) return;
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
    }
  }

  private act(from: From, a: HostAction): void {
    if (!a || typeof a !== "object" || !HOST_ACTIONS.has(a.type)) return;
    const by = from.playerId!;
    const at = this.speakerNow();
    switch (a.type) {
      case "START_LEARNING": {
        const routine = ROUTINES[a.routineId];
        if (!routine) return this.send(from, { t: "error", code: "no_routine", message: `unknown routine ${a.routineId}` });
        // (set first: the state message that goes out with the change carries it)
        const before = this.d.routine;
        this.d.routine = routine;
        if (this.apply({ type: "START_LEARNING", at, byPlayerId: by, routineId: routine.routineId, difficulty: a.difficulty === "medium" || a.difficulty === "hard" ? a.difficulty : "easy", bpm: routine.bpm }, from)) this.d.finishAt = null;
        else this.d.routine = before;
        return;
      }
      case "START_DANCING":
      case "RESTART_SECTION": {
        // beat 0 comes after a count-in, on a whole millisecond
        const bpm = this.d.state.bpm ?? this.d.routine?.bpm ?? METRONOME.bpm;
        const routineStartAt = Math.round(at + COUNT_IN_BEATS * beatDurationMs(bpm));
        if (this.apply({ type: a.type, at, byPlayerId: by, routineStartAt }, from)) {
          const beats = this.d.routine?.totalBeats ?? METRONOME.totalBeats;
          this.d.finishAt = routineStartAt + beats * beatDurationMs(bpm) + this.d.state.audioOffsetMs + FINISH_MARGIN_MS;
        }
        return;
      }
      case "KICK":
        if (this.apply({ type: "KICK", at, byPlayerId: by, playerId: String(a.playerId) }, from)) {
          delete this.d.leaving[String(a.playerId)];
          this.out.push({ close: String(a.playerId) });
        }
        return;
      default:
        if (this.apply({ type: a.type, at, byPlayerId: by }, from) && (a.type === "BACK_TO_LOBBY" || a.type === "END_ROOM" || a.type === "SKIP_CALIBRATION")) this.d.finishAt = null;
    }
  }

  /** The room's clock reached a deadline: a speaker or a phone gone for good, a routine over. */
  tick(): void {
    const now = this.now();
    if (this.d.speakerGoneAt !== null && now - this.d.speakerGoneAt >= SPEAKER_GRACE_MS) {
      this.d.speakerGoneAt = null;
      this.d.finishAt = null;
      this.apply({ type: "SPEAKER_DISCONNECTED", at: this.speakerNow() });
    }
    for (const [id, until] of Object.entries(this.d.leaving)) {
      if (now < until) continue;
      delete this.d.leaving[id];
      this.changed = true;
      this.apply({ type: "PLAYER_LEFT", at: this.speakerNow(), playerId: id });
    }
    if (this.d.finishAt !== null && this.speakerNow() >= this.d.finishAt) {
      this.d.finishAt = null;
      if (this.d.state.phase === "dancing") this.apply({ type: "FINISH", at: this.speakerNow() });
    }
  }

  /** The room's clock time of the next deadline, or null. */
  nextWake(): number | null {
    const times: number[] = [...Object.values(this.d.leaving)];
    if (this.d.speakerGoneAt !== null) times.push(this.d.speakerGoneAt + SPEAKER_GRACE_MS);
    if (this.d.finishAt !== null) times.push(this.d.finishAt - this.d.speakerOffset);
    times.push(this.d.lastActive + IDLE_MS);
    return Math.min(...times);
  }

  /** What to send since the last flush, and whether the stored data changed. */
  flush(): { out: Out[]; changed: boolean } {
    const r = { out: this.out, changed: this.changed };
    this.out = [];
    this.changed = false;
    return r;
  }

  /** The state message every page gets. */
  stateMsg(): ServerMsg {
    return { t: "state", state: this.d.state, routine: this.d.routine };
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

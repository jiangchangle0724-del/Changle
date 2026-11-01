// What the pages and the room say to each other over the room's WebSocket. Every time in here is
// speaker time (the speaker page's performance.now(), the room's one clock; see
// games/party-base/CONTRACTS.md), except `sentAt` and `serverAt`, which say whose clock they are.
import type { Difficulty, RoomState } from "../../../party-base/src/index";

/** Host actions a phone may ask for. The room stamps `at` and fills in what's its to decide. */
export type HostAction =
  | { type: "START_CALIBRATION" }
  | { type: "SKIP_CALIBRATION" }
  | { type: "START_LEARNING"; routineId: string; difficulty: Difficulty; bpm: number }
  | { type: "START_DANCING" }
  | { type: "RESTART_SECTION" }
  | { type: "BACK_TO_LOBBY" }
  | { type: "END_ROOM" }
  | { type: "KICK"; playerId: string };

export type ClientMsg =
  /** Anyone: answered at once with a pong. Phones use its speakerAt, the speaker its serverAt. */
  | { t: "ping"; id: number }
  /**
   * The speaker, every second: its clock minus the room's (speakerAt = serverAt + offsetMs),
   * from its own pings, and the round trip of the probes it used.
   */
  | { t: "clock"; offsetMs: number; rttMs: number }
  /** The host. */
  | { t: "act"; action: HostAction }
  /** The host while calibrating: a tap, in speaker time. Passed on to the speaker. */
  | { t: "tap"; at: number }
  /** The speaker after calibrateFromTaps(): how late the room hears its sound. */
  | { t: "calibrated"; audioOffsetMs: number }
  /** A phone's 我在 button: the big screen lights its name up. */
  | { t: "here" };

export type ServerMsg =
  | { t: "welcome"; role: "speaker" | "player"; you: string | null }
  | { t: "state"; state: RoomState; routine: RoutineInfo | null }
  /** serverAt: the room's clock when the ping came in; speakerAt: the speaker's then (null: no speaker yet). */
  | { t: "pong"; id: number; serverAt: number; speakerAt: number | null }
  | { t: "tap"; at: number; playerId: string }
  | { t: "here"; playerId: string }
  | { t: "error"; code: string; message: string }
  /** The connection is refused or the room is over; the page says so and stops. */
  | { t: "fatal"; key: "noRoom" | "full" | "ended" | "badRequest" };

/** The routine being danced: everything a page needs for the beat grid besides RoomState. */
export interface RoutineInfo {
  routineId: string;
  bpm: number;
  beatsPerBar: number;
  totalBeats: number;
}

/** A1 has one routine: a 120 BPM click track, two minutes, to test timing end to end. */
export const METRONOME: RoutineInfo = { routineId: "metronome-120", bpm: 120, beatsPerBar: 4, totalBeats: 240 };

/** Beats of count-in between START_DANCING and beat 0 (the phones' countdown). */
export const COUNT_IN_BEATS = 8;

/** Room codes: 4 characters that can't be mistaken for each other read off a TV. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

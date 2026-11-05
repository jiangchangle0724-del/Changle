/**
 * Shared contracts for changle.ca's 一起跳 · Dance Along (打碟 · DJ Booth was planned on them too,
 * then built in the site instead).
 * Pure types. See CONTRACTS.md for the rules behind each one.
 *
 * Time: every timestamp is "speaker time" — milliseconds on the speaker device's clock (the
 * speaker page's performance.timeOrigin + performance.now(): monotonic within the page, and it
 * carries on across a reload of it). Phones convert their local clock with the offset estimated
 * by beat-clock.ts. Never use a phone's Date.now() for beat math.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export type RoomPhase =
  | 'lobby'        // waiting for players; speaker may or may not be connected yet
  | 'calibrating'  // speaker plays 8 clicks, host taps; AirPlay offset is measured
  | 'learning'     // everything before the dance: warm-up, then the coach at 70% speed, 8 counts watch / 8 counts follow
  | 'dancing'      // count-in, the full-speed routine (phones score every beat), then the cool-down
  | 'results'      // awards / scores shown on the speaker screen
  | 'ended';       // room closed; no further transitions

export interface Player {
  id: string;
  name: string;
  joinedAt: number;      // speaker time
  isHost: boolean;
  seated?: boolean;      // easy mode "坐着跳"
}

export interface RoomState {
  code: string;                 // 4–6 char join code shown on the TV
  phase: RoomPhase;
  players: Player[];
  speakerConnected: boolean;
  routineId: string | null;
  difficulty: Difficulty | null;
  /** AirPlay / mirroring latency: how much later the room HEARS audio than the speaker clock says. */
  audioOffsetMs: number;
  /** When the current routine's beat 0 happened/will happen, speaker time. */
  routineStartAt: number | null;
  bpm: number | null;
  /** Hard cap enforced by the room: minutes of play before a forced break. */
  sessionMinutesLimit: number;
  createdAt: number;
  updatedAt: number;
}

export type RoomEvent =
  | { type: 'SPEAKER_CONNECTED'; at: number }
  | { type: 'SPEAKER_DISCONNECTED'; at: number }
  | { type: 'PLAYER_JOINED'; at: number; player: Omit<Player, 'joinedAt'> }
  | { type: 'PLAYER_LEFT'; at: number; playerId: string }
  | { type: 'KICK'; at: number; byPlayerId: string; playerId: string }
  | { type: 'START_CALIBRATION'; at: number; byPlayerId: string }
  | { type: 'CALIBRATED'; at: number; audioOffsetMs: number }
  | { type: 'SKIP_CALIBRATION'; at: number; byPlayerId: string }
  | { type: 'START_LEARNING'; at: number; byPlayerId: string; routineId: string; difficulty: Difficulty; bpm: number }
  | { type: 'START_DANCING'; at: number; byPlayerId: string; routineStartAt: number }
  /** From the room itself, like FINISH: the warm-up and teaching ran out, so the dance follows on. */
  | { type: 'LEARNING_DONE'; at: number; routineStartAt: number }
  | { type: 'RESTART_SECTION'; at: number; byPlayerId: string; routineStartAt: number }
  | { type: 'FINISH'; at: number }
  | { type: 'BACK_TO_LOBBY'; at: number; byPlayerId: string }
  | { type: 'END_ROOM'; at: number; byPlayerId: string };

/** A fixed-tempo beat grid for one routine or one DJ segment. */
export interface BeatMap {
  bpm: number;
  beatsPerBar: number;     // 4 for everything we ship
  startAt: number;         // speaker time of beat 0
  totalBeats: number;      // routine length in beats (2 min at 100 BPM = 200)
}

/** One phone's motion energy sample, already converted to speaker time. */
export interface MotionSample {
  t: number;   // speaker time, ms
  e: number;   // movement energy, gravity removed, >= 0 (m/s^2 magnitude or normalized)
}

/** A round-trip measurement used to estimate the phone→speaker clock offset. */
export interface ClockProbe {
  sentAt: number;      // phone local time when the ping left
  speakerAt: number;   // speaker time stamped on the pong
  receivedAt: number;  // phone local time when the pong arrived
}

export interface ClockOffsetEstimate {
  offsetMs: number;    // speakerTime ≈ phoneLocalTime + offsetMs
  rttMs: number;       // round-trip of the probes actually used
  samples: number;     // how many probes were used
  confident: boolean;  // true when at least 5 probes and the best RTT is under 120 ms
}

export interface CalibrationResult {
  ok: boolean;
  offsetMs: number;    // median(tap - click); positive = the room hears audio late
  spreadMs: number;    // inter-quartile-ish spread of the pairs; big spread = retry
  pairs: number;       // how many taps were paired to a click
  reason?: 'too_few_taps' | 'too_scattered';
}

export interface BeatScore {
  beat: number;              // 0-based beat index in the BeatMap
  moved: boolean;            // a peak exists within the (widened) window
  offsetMs: number | null;   // peak time - beat time, null when no peak
  hit: boolean;              // moved && |offset| <= window for the difficulty
}

export interface RoutineScore {
  difficulty: Difficulty;
  beats: BeatScore[];
  hitRate: number;           // hits / scored beats, 0..1
  movedRate: number;         // moved / scored beats, 0..1 (easy mode shows this)
  meanAbsOffsetMs: number;   // over hits only; NaN when no hits
  participation: number;     // 0..100, what easy mode displays
}

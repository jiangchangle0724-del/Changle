// What the pages and the room say to each other over the room's WebSocket. Every time in here is
// speaker time (the speaker page's timeOrigin + performance.now(), the room's one clock: client's
// common.ts pageClock, games/party-base/CONTRACTS.md), except `serverAt`, the room's own clock.
import type { Difficulty, RoomState } from "../../../party-base/src/index";
import type { Mode } from "./show";
import type { Verdict } from "./taps";

/** Host actions a phone may ask for. The room stamps `at` and fills in what's its to decide. */
export type HostAction =
  | { type: "START_CALIBRATION" }
  | { type: "SKIP_CALIBRATION" }
  /** Pick a routine and start it: the warm-up (and the teaching, unless mode is "dance"), then the dance by itself. */
  | { type: "START_LEARNING"; routineId: string; mode?: Mode }
  /** Skip what is left before the dance; from the results: the same dance again. */
  | { type: "START_DANCING" }
  /** 这一段再来: back to the start of the 8-count the room is in, after a count-in. */
  | { type: "RESTART_SECTION" }
  /** 看结果: skip the cool-down. Only once the whole dance has been heard. */
  | { type: "FINISH_NOW" }
  /** 暂停: everything stops where it is (the music, the video, the coach, the phones' judging). */
  | { type: "PAUSE" }
  /** 继续: after a moment's run-up the dance carries on from where it stopped. */
  | { type: "RESUME" }
  /** Stop: from the results, or in the middle of anything. */
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
  /**
   * A tap, in speaker time, passed on to the speaker: the host's while calibrating, and anyone's
   * while the room finds a song's beat (找拍子, RoutineInfo.tapIn).
   */
  | { t: "tap"; at: number }
  /** The speaker after calibrateFromTaps(): how late the room hears its sound. */
  | { t: "calibrated"; audioOffsetMs: number }
  /** A phone's 我在 button: the big screen lights its name up. */
  | { t: "here" }
  /**
   * A phone, while the dance plays: how its player did on dance beats `from`, `from + 1`, … (at most
   * MAX_BEATS_PER_MSG, each once it has been heard). A number: how far the move was from the beat as
   * the room heard it, in ms (negative: early); null: no move near it. The phone scores (party-base's
   * scoreBeats); the room keeps the beats and works out the floor and the results.
   */
  | { t: "beats"; from: number; offs: (number | null)[] }
  /**
   * A phone while a dance plays, a few times a second: how much its player is moving (0 to 1), and
   * with the first one after a beat is judged, that beat's verdict. Passed on to the speaker (each
   * player's little dancer on the TV) and not kept: the beats above are what counts.
   */
  | { t: "pulse"; e: number; v?: Verdict | null }
  /**
   * The speaker, while a song plays from YouTube: when the dance's first beat is (speaker time), as
   * its video is really playing. The room moves the beat there if it's off.
   */
  | { t: "songAt"; startAt: number }
  /** The speaker: the song picked is loaded and held at its start; the room starts it (after the lead-in). */
  | { t: "songReady" }
  /**
   * The speaker after 找拍子: where the song's first beat is in its video (ms), from how many taps,
   * how far they strayed (ms), and the video's length as its player gave it. The room keeps it in
   * the songbook for every room from then on, and starts the song.
   */
  | { t: "songTapped"; firstBeatMs: number; taps: number; spreadMs: number; durationMs: number | null }
  /**
   * The speaker: YouTube won't play the song here (bad), can't be reached (offline), or 找拍子
   * didn't find the beat in time (notap). Back to the lobby.
   */
  | { t: "songFailed"; why: "bad" | "offline" | "notap" };

export type ServerMsg =
  | { t: "welcome"; role: "speaker" | "player"; you: string | null }
  /** calibrated: this room has measured its TV's delay (a song's beat tapped here is kept for every room). */
  | { t: "state"; state: RoomState; routine: RoutineInfo | null; results: Results | null; calibrated?: boolean }
  /** serverAt: the room's clock when the ping came in; speakerAt: the speaker's then (null: no speaker yet). */
  | { t: "pong"; id: number; serverAt: number; speakerAt: number | null }
  | { t: "tap"; at: number; playerId: string }
  | { t: "here"; playerId: string }
  /** To the speaker: a phone's pulse (its player's movement now, a beat's verdict). */
  | { t: "pulse"; playerId: string; e: number; v: Verdict | null }
  /** To the speaker, each time a phone's beats come in: the floor so far. */
  | ({ t: "floor" } & Floor)
  | { t: "error"; code: string; message: string }
  /** The connection is refused or the room is over; the page says so and stops. */
  | { t: "fatal"; key: "noRoom" | "full" | "ended" | "badRequest" };

/**
 * The routine a room is on: with RoomState, everything a page needs to know which beat is when
 * (src/shared/show.ts builds the beats from the id and the mode).
 */
export interface RoutineInfo {
  routineId: string;
  /** the dance's tempo and length */
  bpm: number;
  beatsPerBar: number;
  totalBeats: number;
  /** null: the metronome, which has no warm-up, teaching or cool-down */
  mode: Mode | null;
  /** When the warm-up's first beat is, while the part before the dance plays (phase learning); else null. */
  leadStartAt: number | null;
  /** The dance beat RoomState.routineStartAt is: 0, or the 8-count a restart went back to. */
  fromBeat: number;
  /**
   * From the end of the part before the dance to its first beat (ms): the count-in, or for a song
   * its intro, as the songbook has it when the room picks the song (the show's own when absent).
   */
  introMs?: number;
  /**
   * A song nobody has tapped along to yet: before anything else the video plays from its start and
   * everyone taps along on their phones (找拍子) until the speaker has the beat (songTapped). Then
   * the song starts from its start as any other does.
   */
  tapIn?: boolean;
  /** Paused by the host at this speaker time: nothing plays until 继续 (RESUME) moves the run later. */
  pausedAt?: number;
}

/** The floor together, from the beats the phones have sent. */
export interface Floor {
  /** beats in a row, up to now, that most of those dancing hit */
  streak: number;
  /** the longest such run this dance */
  best: number;
  /** times a run filled the bar (COMBO_FULL beats): the screen sets off fireworks */
  bursts: number;
  /** phones sending beats now */
  dancers: number;
  /** each dancer's last 8 beats: the share hit, 0 to 1 */
  levels: Record<string, number>;
}

export interface PlayerResult {
  id: string;
  name: string;
  /** 0 to 100, party-base's summarize(): what the screens show */
  participation: number;
  hitRate: number;
  movedRate: number;
  /** over the beats hit; null when none */
  meanAbsOffsetMs: number | null;
  /** the dancer's own longest run of beats hit */
  bestStreak: number;
}

/** A dance's results: sent with the state while the room shows them. */
export interface Results {
  routineId: string;
  difficulty: Difficulty;
  /** beats in the dance */
  beats: number;
  /** everyone who sent a beat, in the order they joined */
  players: PlayerResult[];
  /** player ids. 最稳: closest to the beat; 最嗨: the longest run; 最努力: the most beats moved. */
  awards: { steady: string | null; hype: string | null; effort: string | null };
  /** the floor's longest run and how many times it filled the bar */
  bestStreak: number;
  bursts: number;
  /** the share of beats moved, over everyone who danced, 0 to 100 */
  together: number;
}

/** A song's beat moves to where the speaker measured it when it's this far off (ms). */
export const SONG_SYNC_MS = 20;

/** A floor's run this long fills the bar: fireworks, and the bar starts again. */
export const COMBO_FULL = 32;
/** A beat counts for the floor when this share of those dancing hit it (party-base's groupStreak). */
export const COMBO_QUORUM = 0.6;
/** A phone sends a bar at a time; at most this many beats in one message. */
export const MAX_BEATS_PER_MSG = 16;

/** Room codes: 4 characters that can't be mistaken for each other read off a TV. */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

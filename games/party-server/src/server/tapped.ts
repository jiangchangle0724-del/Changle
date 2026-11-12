// A speaker page's taps for a song (对拍), checked before they go into the songbook (songbook.ts):
// pure, so the tests can call it without the Workers runtime.
import { songById } from "../shared/songs";

export interface Tapped {
  /** when in the video the dance's first beat is (ms) */
  firstBeatMs: number;
  /** how many taps it came from, and how far they strayed from their beat (ms) */
  taps: number;
  spreadMs: number;
  /** when it was tapped (ms, Unix) */
  at: number;
  /**
   * tapped in a room whose TV delay was measured: only those are for every room (without the
   * delay taken out, the beat is late by it)
   */
  calibrated?: boolean;
}

/** At least this many taps, at most a fifth of a beat apart on average. */
export const MIN_TAPS = 8;
const MAX_SPREAD_SHARE = 0.2;

/** A speaker page's taps for a song, checked: the songbook's entry, or why not. */
export function checkTapped(songId: string, body: unknown, now: number): Tapped | string {
  const song = songById(songId);
  if (!song) return "no such song";
  const b = (body ?? {}) as Record<string, unknown>;
  const first = b.firstBeatMs;
  const taps = b.taps;
  const spread = b.spreadMs;
  const duration = b.durationMs;
  if (typeof first !== "number" || !Number.isFinite(first) || first < 0 || first > 120_000) return "firstBeatMs out of range";
  if (typeof taps !== "number" || !Number.isInteger(taps) || taps < MIN_TAPS || taps > 200) return "too few taps";
  const beatMs = 60000 / song.bpm;
  if (typeof spread !== "number" || !Number.isFinite(spread) || spread < 0 || spread > MAX_SPREAD_SHARE * beatMs) return "the taps were too spread out";
  // (the video's length as its player gave it: the dance has to be over before the video is)
  if (typeof duration === "number" && Number.isFinite(duration) && duration > 0 && first + song.beats * beatMs > duration) return "the dance would run past the end of the video";
  return { firstBeatMs: Math.round(first), taps, spreadMs: Math.round(spread), at: now, ...(b.calibrated === true ? { calibrated: true } : {}) };
}

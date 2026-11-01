/**
 * Beat clock: clock-offset estimation (phone ↔ speaker) and beat-grid math.
 * Pure functions, no I/O. The speaker device is the time base for the whole room.
 */
import type { BeatMap, ClockOffsetEstimate, ClockProbe } from './types';

/** Median of a numeric array (empty → NaN). */
export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * NTP-style offset estimate. Each probe gives offset = speakerAt - (sentAt + rtt/2).
 * We keep the probes with the lowest round-trip (they carry the least jitter), take their
 * median, and report confidence. Phones call this after sending ~8 pings on join and
 * again every minute while dancing.
 */
export function estimateClockOffset(probes: ClockProbe[], keepBest = 5): ClockOffsetEstimate {
  const valid = probes.filter((p) => p.receivedAt >= p.sentAt);
  if (valid.length === 0) return { offsetMs: 0, rttMs: Infinity, samples: 0, confident: false };
  const withRtt = valid.map((p) => {
    const rtt = p.receivedAt - p.sentAt;
    return { rtt, offset: p.speakerAt - (p.sentAt + rtt / 2) };
  });
  withRtt.sort((a, b) => a.rtt - b.rtt);
  const best = withRtt.slice(0, Math.max(1, Math.min(keepBest, withRtt.length)));
  const offsetMs = median(best.map((b) => b.offset));
  const rttMs = median(best.map((b) => b.rtt));
  return {
    offsetMs,
    rttMs,
    samples: best.length,
    confident: valid.length >= 5 && best[0]!.rtt <= 120,
  };
}

/** Convert a phone-local timestamp into speaker time. */
export function toSpeakerTime(phoneLocalMs: number, offsetMs: number): number {
  return phoneLocalMs + offsetMs;
}

export function beatDurationMs(bpm: number): number {
  if (!(bpm > 0)) throw new RangeError(`bpm must be > 0, got ${bpm}`);
  return 60000 / bpm;
}

/** Speaker time of beat n (may be fractional). */
export function beatTime(map: BeatMap, n: number): number {
  return map.startAt + n * beatDurationMs(map.bpm);
}

/** Fractional beat position at speaker time t (negative before the routine starts). */
export function beatAt(map: BeatMap, t: number): number {
  return (t - map.startAt) / beatDurationMs(map.bpm);
}

/** Nearest integer beat to time t and how far t is from it (ms, signed: + = late). */
export function nearestBeat(map: BeatMap, t: number): { beat: number; deltaMs: number } {
  const beat = Math.round(beatAt(map, t));
  return { beat, deltaMs: t - beatTime(map, beat) };
}

/** 1-based count inside the bar (1..beatsPerBar) for the "1 2 3 4 5 6 7 8" display. */
export function countInPhrase(map: BeatMap, beat: number, beatsPerPhrase = 8): number {
  const mod = ((beat % beatsPerPhrase) + beatsPerPhrase) % beatsPerPhrase;
  return mod + 1;
}

/**
 * Speaker time of the next phrase boundary at or after t. Both games change things
 * (moves, DJ weights) only here. `barsPerPhrase` = 2 → 8-count phrases at 4/4.
 */
export function nextPhraseStart(map: BeatMap, t: number, barsPerPhrase = 2): number {
  const beatsPerPhrase = map.beatsPerBar * barsPerPhrase;
  const b = beatAt(map, t);
  const nextPhraseBeat = Math.ceil(b / beatsPerPhrase) * beatsPerPhrase;
  return beatTime(map, nextPhraseBeat);
}

/** Is the routine over at time t (beat index past totalBeats - 1)? */
export function isFinished(map: BeatMap, t: number): boolean {
  return beatAt(map, t) >= map.totalBeats;
}

/**
 * The "apparent" beat map a phone should score against once AirPlay latency is known:
 * the room hears every beat `audioOffsetMs` later than the speaker clock says.
 */
export function withAudioOffset(map: BeatMap, audioOffsetMs: number): BeatMap {
  return { ...map, startAt: map.startAt + audioOffsetMs };
}

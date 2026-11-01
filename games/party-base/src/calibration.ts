/**
 * AirPlay / mirroring latency calibration.
 * The speaker page plays N clicks at known speaker times; the host taps along on the phone.
 * Taps arrive as speaker-time stamps (already offset-corrected). The median (tap - click)
 * is how late the room actually hears the audio. Rhythm games call this "audio offset".
 */
import { median } from './beat-clock';
import type { CalibrationResult } from './types';

export interface CalibrationOptions {
  minPairs?: number;        // default 6 (of 8 clicks)
  maxSpreadMs?: number;     // default 80: tighter than this = trustworthy
  /** A tap further than this from any click is ignored. Default: 45% of the click interval, max 400. */
  pairWindowMs?: number;
}

/**
 * Pair taps to clicks by global nearest-first matching (smallest distance wins, each click
 * and each tap used once). A per-tap greedy walk cascades when one tap lands between two
 * clicks; nearest-first does not.
 */
function pairTapsToClicks(clicks: number[], taps: number[], windowMs: number): number[] {
  const candidates: { ci: number; ti: number; d: number }[] = [];
  clicks.forEach((c, ci) => {
    taps.forEach((t, ti) => {
      const d = Math.abs(t - c);
      if (d <= windowMs) candidates.push({ ci, ti, d });
    });
  });
  candidates.sort((a, b) => a.d - b.d);
  const usedC = new Set<number>();
  const usedT = new Set<number>();
  const deltas: number[] = [];
  for (const { ci, ti } of candidates) {
    if (usedC.has(ci) || usedT.has(ti)) continue;
    usedC.add(ci);
    usedT.add(ti);
    deltas.push(taps[ti]! - clicks[ci]!);
  }
  return deltas;
}

export function calibrateFromTaps(
  clickTimes: number[],
  tapTimes: number[],
  opts: CalibrationOptions = {},
): CalibrationResult {
  const minPairs = opts.minPairs ?? 6;
  const maxSpreadMs = opts.maxSpreadMs ?? 80;

  const clicks = [...clickTimes].sort((a, b) => a - b);
  const taps = [...tapTimes].sort((a, b) => a - b);
  const interval = clicks.length > 1 ? median(clicks.slice(1).map((c, i) => c - clicks[i]!)) : 600;
  const pairWindowMs = opts.pairWindowMs ?? Math.min(400, 0.45 * interval);

  const deltas = pairTapsToClicks(clicks, taps, pairWindowMs);

  if (deltas.length < minPairs) {
    return { ok: false, offsetMs: 0, spreadMs: NaN, pairs: deltas.length, reason: 'too_few_taps' };
  }
  const med = median(deltas);
  const sorted = [...deltas].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)]!;
  const q3 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))]!;
  const spreadMs = q3 - q1;
  if (spreadMs > maxSpreadMs) {
    return { ok: false, offsetMs: med, spreadMs, pairs: deltas.length, reason: 'too_scattered' };
  }
  return { ok: true, offsetMs: med, spreadMs, pairs: deltas.length };
}

/**
 * Human reaction time is part of every tap (~100–200 ms even with zero audio latency).
 * We do NOT subtract it: the dance scoring windows are symmetric around the *heard* beat,
 * and players move with the same reaction delay they tapped with. Keep this comment —
 * it is the first thing someone will "fix" wrongly.
 */
export const REACTION_NOTE = 'reaction time is intentionally included in the offset';

/**
 * Motion scoring for 一起跳 · Dance Along.
 * Input: a phone's energy samples in speaker time (gravity already removed, ~60 Hz) and a
 * BeatMap (already shifted by the AirPlay offset via withAudioOffset).
 * Output: per-beat hit/miss and a routine summary.
 *
 * Design rule from the plan: we judge "did you move on the beat", never "was the move
 * correct". Easy mode counts participation, medium/hard count timing accuracy.
 */
import { beatTime } from './beat-clock';
import type { BeatMap, BeatScore, Difficulty, MotionSample, RoutineScore } from './types';

/** Scoring window (± ms) around each heard beat, per difficulty. */
export const WINDOW_MS: Record<Difficulty, number> = { easy: 150, medium: 100, hard: 80 };

/** Below this energy a sample is "not moving" (tune with the golden set; units = m/s^2). */
export const DEFAULT_PEAK_THRESHOLD = 1.5;

/**
 * Find local energy peaks: a sample higher than its neighbours, above threshold,
 * at least `minGapMs` after the previous accepted peak (so one arm swing = one peak).
 */
export function energyPeaks(
  samples: MotionSample[],
  threshold = DEFAULT_PEAK_THRESHOLD,
  minGapMs = 120,
): number[] {
  const s = [...samples].sort((a, b) => a.t - b.t);
  const peaks: number[] = [];
  let lastPeak = -Infinity;
  for (let i = 1; i < s.length - 1; i++) {
    const prev = s[i - 1]!, cur = s[i]!, next = s[i + 1]!;
    if (cur.e >= threshold && cur.e >= prev.e && cur.e > next.e && cur.t - lastPeak >= minGapMs) {
      peaks.push(cur.t);
      lastPeak = cur.t;
    }
  }
  return peaks;
}

/** Nearest peak to a beat time; null when none within `searchMs`. */
export function nearestPeakOffset(peaks: number[], beatT: number, searchMs: number): number | null {
  let best: number | null = null;
  for (const p of peaks) {
    const d = p - beatT;
    if (Math.abs(d) <= searchMs && (best === null || Math.abs(d) < Math.abs(best))) best = d;
  }
  return best;
}

/**
 * Score beats [fromBeat, toBeat) of a map against detected peaks.
 * `moved` uses a widened window (2× the difficulty window, capped at 300 ms) so a slightly
 * early/late mover on easy still counts as participating; `hit` uses the strict window.
 */
export function scoreBeats(
  peaks: number[],
  map: BeatMap,
  difficulty: Difficulty,
  fromBeat = 0,
  toBeat = map.totalBeats,
): BeatScore[] {
  const win = WINDOW_MS[difficulty];
  const movedWin = Math.min(300, win * 2);
  const out: BeatScore[] = [];
  for (let b = fromBeat; b < toBeat; b++) {
    const bt = beatTime(map, b);
    const off = nearestPeakOffset(peaks, bt, movedWin);
    const moved = off !== null;
    const hit = moved && Math.abs(off) <= win;
    out.push({ beat: b, moved, offsetMs: off, hit });
  }
  return out;
}

export function summarize(beats: BeatScore[], difficulty: Difficulty): RoutineScore {
  const n = beats.length;
  const hits = beats.filter((b) => b.hit);
  const moved = beats.filter((b) => b.moved);
  const hitRate = n ? hits.length / n : 0;
  const movedRate = n ? moved.length / n : 0;
  const meanAbsOffsetMs = hits.length
    ? hits.reduce((s, b) => s + Math.abs(b.offsetMs ?? 0), 0) / hits.length
    : NaN;
  // Easy: participation = moved rate. Medium: timing matters. Hard: timing dominates.
  const participation =
    difficulty === 'easy'
      ? Math.round(movedRate * 100)
      : difficulty === 'medium'
        ? Math.round((0.4 * movedRate + 0.6 * hitRate) * 100)
        : Math.round(hitRate * 100);
  return { difficulty, beats, hitRate, movedRate, meanAbsOffsetMs, participation };
}

/** Convenience: samples → peaks → beats → summary, in one call. */
export function scoreRoutine(
  samples: MotionSample[],
  map: BeatMap,
  difficulty: Difficulty,
  threshold = DEFAULT_PEAK_THRESHOLD,
): RoutineScore {
  const peaks = energyPeaks(samples, threshold);
  return summarize(scoreBeats(peaks, map, difficulty), difficulty);
}

/**
 * Group combo meter for the TV: a beat counts for the room when at least `quorum` of the
 * connected players hit it. Returns the current streak length ending at the last beat.
 */
export function groupStreak(perPlayerBeats: BeatScore[][], quorum = 0.6): number {
  const players = perPlayerBeats.length;
  if (players === 0) return 0;
  const len = Math.min(...perPlayerBeats.map((b) => b.length));
  let streak = 0;
  for (let i = len - 1; i >= 0; i--) {
    const hits = perPlayerBeats.filter((b) => b[i]?.hit).length;
    if (hits / players >= quorum) streak++;
    else break;
  }
  return streak;
}

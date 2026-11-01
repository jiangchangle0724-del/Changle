import { describe, expect, it } from 'vitest';
import { beatTime, withAudioOffset } from './beat-clock';
import { energyPeaks, groupStreak, scoreBeats, scoreRoutine, summarize } from './scoring';
import type { BeatMap, BeatScore, MotionSample } from './types';

const map: BeatMap = { bpm: 100, beatsPerBar: 4, startAt: 5_000, totalBeats: 16 }; // 600 ms/beat

/** Synthesize 60 Hz samples: a bump of energy around each given time, noise elsewhere. */
function synth(bumpTimes: number[], from: number, to: number, bump = 4, noise = 0.3): MotionSample[] {
  const out: MotionSample[] = [];
  for (let t = from; t <= to; t += 1000 / 60) {
    let e = noise * (0.5 + 0.5 * Math.sin(t / 37)); // deterministic "noise" below threshold
    for (const b of bumpTimes) {
      const d = Math.abs(t - b);
      if (d < 90) e += bump * (1 - d / 90);
    }
    out.push({ t, e });
  }
  return out;
}

describe('energyPeaks', () => {
  it('finds one peak per movement and ignores noise', () => {
    const bumps = [5_000, 5_600, 6_200];
    const peaks = energyPeaks(synth(bumps, 4_500, 7_000));
    expect(peaks.length).toBe(3);
    bumps.forEach((b, i) => expect(Math.abs(peaks[i]! - b)).toBeLessThanOrEqual(20));
  });

  it('merges peaks closer than the minimum gap', () => {
    const peaks = energyPeaks(synth([5_000, 5_050], 4_500, 5_500));
    expect(peaks.length).toBe(1);
  });
});

describe('scoreBeats + summarize', () => {
  it('perfectly on-beat dancer scores 100 on every difficulty', () => {
    const times = Array.from({ length: 16 }, (_, b) => beatTime(map, b));
    const samples = synth(times, 4_500, 15_000);
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const r = scoreRoutine(samples, map, d);
      expect(r.hitRate).toBe(1);
      expect(r.participation).toBe(100);
    }
  });

  it('a 120 ms late dancer passes easy, fails hard', () => {
    const times = Array.from({ length: 16 }, (_, b) => beatTime(map, b) + 120);
    const samples = synth(times, 4_500, 15_000);
    expect(scoreRoutine(samples, map, 'easy').hitRate).toBe(1);
    expect(scoreRoutine(samples, map, 'hard').hitRate).toBe(0);
    // ...but hard mode still sees them as "moved" (widened window), only timing failed
    expect(scoreRoutine(samples, map, 'hard').movedRate).toBe(1);
  });

  it('a couch potato scores 0 participation', () => {
    const samples = synth([], 4_500, 15_000);
    const r = scoreRoutine(samples, map, 'easy');
    expect(r.movedRate).toBe(0);
    expect(r.participation).toBe(0);
    expect(Number.isNaN(r.meanAbsOffsetMs)).toBe(true);
  });

  it('half-time mover (every other beat) gets ~50 on easy', () => {
    const times = Array.from({ length: 8 }, (_, i) => beatTime(map, i * 2));
    const r = scoreRoutine(synth(times, 4_500, 15_000), map, 'easy');
    expect(r.participation).toBe(50);
  });

  it('scores against the HEARD grid once the AirPlay offset is applied', () => {
    // Player moves exactly with what they hear: 200 ms after the speaker clock's beats.
    const heard = withAudioOffset(map, 200);
    const times = Array.from({ length: 16 }, (_, b) => beatTime(map, b) + 200);
    const samples = synth(times, 4_500, 15_500);
    expect(scoreRoutine(samples, map, 'hard').hitRate).toBe(0);   // uncalibrated: everything "late"
    expect(scoreRoutine(samples, heard, 'hard').hitRate).toBe(1); // calibrated: perfect
  });

  it('medium blends movement and timing', () => {
    const beats: BeatScore[] = Array.from({ length: 10 }, (_, b) => ({
      beat: b, moved: true, offsetMs: b < 5 ? 10 : 150, hit: b < 5,
    }));
    const r = summarize(beats, 'medium');
    expect(r.movedRate).toBe(1);
    expect(r.hitRate).toBe(0.5);
    expect(r.participation).toBe(70); // 0.4*1 + 0.6*0.5
  });
});

describe('groupStreak', () => {
  const mk = (hits: boolean[]): BeatScore[] =>
    hits.map((h, i) => ({ beat: i, moved: h, offsetMs: h ? 0 : null, hit: h }));

  it('counts trailing beats where 60% of players hit', () => {
    const room = [
      mk([true, true, true, true]),
      mk([true, false, true, true]),
      mk([false, true, true, true]),
      mk([true, true, false, true]),
      mk([true, true, true, false]), // 4/5 hit on the last beat → counts
    ];
    expect(groupStreak(room)).toBe(4);
  });

  it('breaks the streak when the room falls apart', () => {
    const room = [mk([true, true, false, true]), mk([true, true, false, true])];
    expect(groupStreak(room)).toBe(1);
    expect(groupStreak([])).toBe(0);
  });
});

describe('scoreBeats window edges', () => {
  it('uses strict window for hit and widened window for moved', () => {
    const peaks = [beatTime(map, 0) + 90, beatTime(map, 1) + 250, beatTime(map, 2) + 400];
    const res = scoreBeats(peaks, map, 'hard', 0, 3);
    expect(res[0]).toMatchObject({ moved: true, hit: false }); // 90 > 80 strict, < 160 widened
    expect(res[1]).toMatchObject({ moved: false, hit: false }); // 250 > 160
    expect(res[2]).toMatchObject({ moved: false, hit: false });
  });
});

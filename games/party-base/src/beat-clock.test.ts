import { describe, expect, it } from 'vitest';
import {
  beatAt, beatTime, countInPhrase, estimateClockOffset, isFinished, median,
  nearestBeat, nextPhraseStart, toSpeakerTime, withAudioOffset,
} from './beat-clock';
import type { BeatMap, ClockProbe } from './types';

const map: BeatMap = { bpm: 120, beatsPerBar: 4, startAt: 10_000, totalBeats: 64 };

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe('estimateClockOffset', () => {
  // Phone clock is 5000 ms behind the speaker; true one-way delay 20 ms.
  const mk = (sentAt: number, rtt: number, jitterMs = 0): ClockProbe => ({
    sentAt,
    speakerAt: sentAt + 5000 + rtt / 2 + jitterMs,
    receivedAt: sentAt + rtt,
  });

  it('recovers the offset from clean probes', () => {
    const probes = [0, 100, 200, 300, 400, 500].map((t) => mk(t, 40));
    const est = estimateClockOffset(probes);
    expect(est.offsetMs).toBeCloseTo(5000, 5);
    expect(est.confident).toBe(true);
  });

  it('prefers low-RTT probes over jittery ones', () => {
    const probes = [
      mk(0, 40), mk(100, 42), mk(200, 38), mk(300, 41), mk(400, 39),
      mk(500, 600, 250), mk(600, 900, -300), // Wi-Fi hiccups: huge RTT, wrong one-way split
    ];
    const est = estimateClockOffset(probes);
    expect(Math.abs(est.offsetMs - 5000)).toBeLessThan(3);
  });

  it('is not confident with too few or slow probes', () => {
    expect(estimateClockOffset([mk(0, 40), mk(1, 40)]).confident).toBe(false);
    const slow = [0, 100, 200, 300, 400].map((t) => mk(t, 400));
    expect(estimateClockOffset(slow).confident).toBe(false);
  });

  it('converts phone time to speaker time', () => {
    expect(toSpeakerTime(1234, 5000)).toBe(6234);
  });
});

describe('beat grid at 120 BPM (500 ms per beat)', () => {
  it('beatTime / beatAt are inverses', () => {
    expect(beatTime(map, 0)).toBe(10_000);
    expect(beatTime(map, 4)).toBe(12_000);
    expect(beatAt(map, 12_000)).toBe(4);
    expect(beatAt(map, 9_500)).toBe(-1);
  });

  it('nearestBeat reports signed lateness', () => {
    expect(nearestBeat(map, 12_040)).toEqual({ beat: 4, deltaMs: 40 });
    expect(nearestBeat(map, 11_980)).toEqual({ beat: 4, deltaMs: -20 });
    expect(nearestBeat(map, 12_260)).toEqual({ beat: 5, deltaMs: -240 });
  });

  it('counts 1..8 for the big on-screen numbers', () => {
    expect([0, 1, 7, 8, 9, 15].map((b) => countInPhrase(map, b))).toEqual([1, 2, 8, 1, 2, 8]);
    expect(countInPhrase(map, -1)).toBe(8);
  });

  it('nextPhraseStart snaps to 8-count boundaries', () => {
    // t = beat 3.2 → next phrase starts at beat 8
    expect(nextPhraseStart(map, 11_600)).toBe(beatTime(map, 8));
    // exactly on a boundary stays there
    expect(nextPhraseStart(map, beatTime(map, 16))).toBe(beatTime(map, 16));
    // 16-count phrases (4 bars)
    expect(nextPhraseStart(map, 11_600, 4)).toBe(beatTime(map, 16));
  });

  it('knows when the routine is over', () => {
    expect(isFinished(map, beatTime(map, 63.9))).toBe(false);
    expect(isFinished(map, beatTime(map, 64))).toBe(true);
  });

  it('shifts the grid by the AirPlay audio offset', () => {
    const heard = withAudioOffset(map, 180);
    expect(beatTime(heard, 0)).toBe(10_180);
    expect(heard.bpm).toBe(120);
  });
});

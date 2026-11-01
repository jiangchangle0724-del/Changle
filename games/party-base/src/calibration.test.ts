import { describe, expect, it } from 'vitest';
import { calibrateFromTaps } from './calibration';

const clicks = Array.from({ length: 8 }, (_, i) => 1000 + i * 600); // 100 BPM clicks

describe('calibrateFromTaps', () => {
  it('measures a consistent AirPlay delay', () => {
    const taps = clicks.map((c) => c + 180);
    const r = calibrateFromTaps(clicks, taps);
    expect(r.ok).toBe(true);
    expect(r.offsetMs).toBe(180);
    expect(r.pairs).toBe(8);
  });

  it('ignores a couple of mis-taps and still succeeds', () => {
    const taps = [...clicks.map((c) => c + 200 + ((c / 600) % 2 ? 15 : -15))];
    taps[3] = taps[3]! + 900; // a wild tap: too far from any click, dropped
    const r = calibrateFromTaps(clicks, taps);
    expect(r.ok).toBe(true);
    expect(Math.abs(r.offsetMs - 200)).toBeLessThanOrEqual(15);
    expect(r.pairs).toBe(7);
  });

  it('fails with too few taps', () => {
    const r = calibrateFromTaps(clicks, [1200, 1800, 2400]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too_few_taps');
  });

  it('fails when taps are all over the place', () => {
    const taps = clicks.map((c, i) => c + (i % 2 ? 40 : 180));
    const r = calibrateFromTaps(clicks, taps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too_scattered');
  });

  it('handles zero latency (HDMI cable)', () => {
    const r = calibrateFromTaps(clicks, clicks.map((c) => c + 5));
    expect(r.ok).toBe(true);
    expect(r.offsetMs).toBe(5);
  });
});

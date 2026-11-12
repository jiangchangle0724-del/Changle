// The phone's motion as moves: peaks of its acceleration, one per swing, on the beat. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MIN_GAP_MS, MIN_PEAK, PeakFinder } from "../src/shared/peaks";

/** A hand swinging on a beat: a sharp bump of acceleration at each beat, readings 60 times a second. */
function swing(beatMs: number, beats: number, peak: number, from = 1000, noise = 0.3) {
  const out: [number, number][] = [];
  for (let t = from - 200; t < from + beats * beatMs; t += 1000 / 60) {
    const k = Math.round((t - from) / beatMs);
    const d = t - (from + k * beatMs);
    const bump = k >= 0 && k < beats ? peak * Math.exp(-(d * d) / (2 * 45 * 45)) : 0;
    out.push([bump + noise * Math.abs(Math.sin(t * 0.37)), t]);
  }
  return out;
}

describe("the moves in a phone's motion", () => {
  it("one move per beat, within a frame or two of it", () => {
    const f = new PeakFinder();
    const peaks: number[] = [];
    for (const [a, t] of swing(500, 8, 9)) {
      const p = f.feed(a, t);
      if (p !== null) peaks.push(p);
    }
    assert.equal(peaks.length, 8);
    peaks.forEach((p, k) => assert.ok(Math.abs(p - (1000 + k * 500)) <= 35, `beat ${k}: ${p}`));
  });

  it("standing still, or a phone sliding about in a hand, is no move", () => {
    const f = new PeakFinder();
    let n = 0;
    for (let t = 0; t < 4000; t += 1000 / 60) if (f.feed(MIN_PEAK * 0.6 * Math.abs(Math.sin(t / 300)), t) !== null) n++;
    assert.equal(n, 0);
  });

  it("a jolt right after a move isn't a second one", () => {
    const f = new PeakFinder();
    const peaks: number[] = [];
    const feed = (a: number, t: number) => {
      const p = f.feed(a, t);
      if (p !== null) peaks.push(p);
    };
    [0, 0, 8, 2, 0].forEach((a, i) => feed(a, 1000 + i * 16));
    [0, 6, 1, 0].forEach((a, i) => feed(a, 1080 + i * 16));
    assert.equal(peaks.length, 1);
    assert.ok(MIN_GAP_MS > 100);
  });

  it("the energy for the TV: up with the moves, back down soon after they stop", () => {
    const f = new PeakFinder();
    const last = 1000 + 3 * 500;
    for (const [a, t] of swing(500, 4, 10)) if (t <= last + 20) f.feed(a, t);
    assert.ok(f.level(last + 20) > 0.6, String(f.level(last + 20)));
    assert.ok(f.level(last + 1500) < 0.05);
  });

  it("ignores readings that aren't numbers", () => {
    const f = new PeakFinder();
    assert.equal(f.feed(Number.NaN, 10), null);
    assert.equal(f.feed(5, Number.POSITIVE_INFINITY), null);
  });
});

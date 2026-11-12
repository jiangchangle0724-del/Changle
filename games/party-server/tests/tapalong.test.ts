// 对拍: a song's beat from someone tapping along to it. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tapAlong } from "../src/shared/tapalong";

const beat = 60000 / 132;
/** taps from the beat at `first` (ms in the video), `n` of them, each off by up to `jitter` (a steady pattern). */
const taps = (first: number, n: number, jitter: number, every = beat) => Array.from({ length: n }, (_, i) => first + i * every + jitter * Math.sin(i * 2.3));

describe("tapping along to a song", () => {
  it("finds the first beat from taps on every beat, a little off each", () => {
    const r = tapAlong(taps(12_345, 16, 25), beat);
    assert.ok(r.ok);
    assert.ok(Math.abs(r.firstBeatMs - 12_345) <= 12, String(r.firstBeatMs));
    assert.ok(r.spreadMs <= 25);
    assert.equal(r.taps, 16);
    assert.equal(r.halfBeats, false);
  });

  it("taps a little late or early all round move the beat with them", () => {
    const r = tapAlong(taps(5_000 + 40, 16, 10), beat);
    assert.ok(r.ok && Math.abs(r.firstBeatMs - 5_040) <= 8);
  });

  it("taps on every half beat (a fast song danced at half its tempo): the first tap is the first beat", () => {
    const slow = 60000 / 74.5;
    const r = tapAlong(taps(4_000, 16, 15, slow / 2), slow);
    assert.ok(r.ok);
    assert.equal(r.halfBeats, true);
    assert.ok(Math.abs(r.firstBeatMs - 4_000) <= 10);
  });

  it("turns away too few taps, taps at no steady beat, and taps all over the place", () => {
    assert.deepEqual(tapAlong(taps(1_000, 5, 0), beat), { ok: false, why: "few" });
    assert.deepEqual(tapAlong(taps(1_000, 16, 0, beat * 1.7), beat), { ok: false, why: "uneven" });
    // (steady on average, but each a quarter of a beat either side of it)
    const loose = Array.from({ length: 16 }, (_, i) => 1_000 + i * beat + (i % 4 < 2 ? 1 : -1) * beat * 0.25);
    assert.deepEqual(tapAlong(loose, beat), { ok: false, why: "spread" });
  });
});

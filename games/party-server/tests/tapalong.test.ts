// 对拍 and 找拍子: a song's beat from someone tapping along to it, or from everyone at once. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tapAlong, tapIn } from "../src/shared/tapalong";

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

describe("找拍子: everyone tapping along at once", () => {
  /** one person's taps: from beat `from` for `n` beats, each off by a little (their own pattern), `lag` late all round */
  const person = (first: number, from: number, n: number, lag: number, seed: number, every = beat) => Array.from({ length: n }, (_, i) => first + (from + i) * every + lag + 30 * Math.sin(seed + i * 1.7));

  it("finds the beat from three people starting at different beats, in any order; the earliest tap's beat is the first", () => {
    const all = [...person(8_000, 0, 7, 10, 1), ...person(8_000, 2, 8, -15, 2), ...person(8_000, 5, 6, 25, 3)].reverse();
    const r = tapIn(all, beat);
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(Math.abs(r.firstBeatMs - 8_000) <= 25, String(r.firstBeatMs));
    assert.equal(r.halfBeats, false);
    assert.equal(r.taps, 21);
  });

  it("a few stray taps are left out", () => {
    const all = [...person(3_000, 0, 10, 0, 1), ...person(3_000, 1, 9, 5, 4), 3_000 + 2.5 * beat, 3_000 + 7.4 * beat];
    const r = tapIn(all, beat);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.taps, 19);
    assert.ok(Math.abs(r.firstBeatMs - 3_000) <= 20);
  });

  it("a fast song danced at half its tempo, people tapping its own beat: the half beat nearest the earliest tap", () => {
    const slow = 60000 / 74.5;
    const all = [...person(4_000, 0, 10, 0, 1, slow / 2), ...person(4_000, 3, 10, 10, 2, slow / 2)];
    const r = tapIn(all, slow);
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.halfBeats, true);
    assert.ok(Math.abs(r.firstBeatMs - 4_000) <= 20);
  });

  it("turns away too few taps, one person tapping fast on the spot, and taps all over", () => {
    assert.deepEqual(tapIn(person(1_000, 0, 10, 0, 1), beat), { ok: false, why: "few" });
    const fast = Array.from({ length: 20 }, (_, i) => 1_000 + i * 30);
    assert.equal(tapIn(fast, beat).ok, false);
    const scattered = Array.from({ length: 24 }, (_, i) => 1_000 + i * beat * 0.61);
    assert.equal(tapIn(scattered, beat).ok, false);
  });
});

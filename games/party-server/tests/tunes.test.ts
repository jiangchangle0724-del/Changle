// The practice dances' own tunes (src/client/tunes.ts): one for each of the library's dances, each
// phrase a whole 8-count of notes that read, chords that read, the melody where a voice can sing it.
// Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ROUTINES } from "../src/shared/catalog";
import { TUNES, chordNotes, melodyEighths, readMelody, tuneFor } from "../src/client/tunes";

describe("the practice dances' tunes", () => {
  it("every dance in the library has its own, and they're all different", () => {
    for (const r of ROUTINES) assert.ok(tuneFor(r.id), r.id);
    assert.equal(new Set(TUNES.map((t) => t.phrases.map((p) => p.melody).join("|"))).size, TUNES.length);
    assert.equal(tuneFor("song-gangnam-style"), null);
    assert.equal(tuneFor(null), null);
  });

  it("every phrase is a whole 8-count of notes that read, over two chords that read", () => {
    for (const t of TUNES)
      for (const p of t.phrases) {
        assert.equal(melodyEighths(p.melody), 16, `${t.id}: ${p.melody}`);
        const notes = readMelody(p.melody);
        assert.ok(notes.length > 0);
        for (const n of notes) assert.ok(n.step >= 0 && n.step + n.len <= 32 && n.len >= 1, `${t.id}: ${p.melody}`);
        for (const c of p.chords) assert.ok(chordNotes(c).length >= 3, c);
      }
  });

  it("the melodies sit where their instrument sings (C4 to G6), the bass under them", () => {
    for (const t of TUNES) {
      for (const p of t.phrases)
        for (const n of readMelody(p.melody)) {
          const m = t.key + 12 * t.leadOct + n.semis;
          assert.ok(m >= 60 && m <= 91, `${t.id}: ${m}`);
        }
      assert.ok(t.key - 24 < 50, t.id);
    }
  });

  it("the drum patterns are whole 8-counts (16 eighths or 32 sixteenths)", () => {
    for (const t of TUNES)
      for (const kit of Object.values(t.kits))
        for (const line of Object.values(kit ?? {})) assert.ok([16, 32].includes(String(line).replace(/\s+/g, "").length), `${t.id}: ${line}`);
  });

  it("reads 简谱: octaves, holds, rests, sixteenths", () => {
    const n = readMelody("1 - 5, . 1' 3/5 . . . . . . . . . .");
    assert.deepEqual(
      n.map((x) => [x.step, x.semis, x.len]),
      [
        [0, 0, 4],
        [4, -5, 2],
        [8, 12, 2],
        [10, 4, 1],
        [11, 7, 1],
      ],
    );
    assert.deepEqual(chordNotes("6m"), [9, 12, 16]);
    assert.deepEqual(chordNotes("5_7"), [7, 11, 14, 17]);
  });
});

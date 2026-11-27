// What the room keeps of a dance and works out from it (src/server/tally.ts): the beats the phones
// send, the floor together (the TV's streak bar), the results and the three awards. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMBO_FULL } from "../src/shared/protocol";
import { LEARN_MOVES, UNSEEN, addBeats, clearFrom, emptyScores, floorOf, learnedShift, resultsOf } from "../src/server/tally";

describe("the beats the phones send", () => {
  it("kept by beat; a move too far from its beat counts as no move; nothing outside the dance", () => {
    const s = emptyScores();
    assert.equal(addBeats(s, "ann", "Ann", 2, [10.4, -299.6, 301, Number.NaN, "x"], 8, "easy"), true);
    assert.deepEqual(s.offs.ann, [UNSEEN, UNSEEN, 10, -300, null, null, null, UNSEEN]);
    assert.equal(s.names.ann, "Ann");
    assert.equal(addBeats(s, "ann", "Ann", 6, [0, 0, 0], 8, "easy"), false, "past the end");
    assert.equal(addBeats(s, "ann", "Ann", -1, [0], 8, "easy"), false);
    assert.equal(addBeats(s, "ann", "Ann", 1.5, [0], 8, "easy"), false);
    assert.equal(addBeats(s, "ann", "Ann", 0, [], 8, "easy"), false);
    // hard: a move counts within 160 ms
    addBeats(s, "bob", "Bob", 0, [159, 161], 8, "hard");
    assert.deepEqual(s.offs.bob!.slice(0, 2), [159, null]);
  });

  it("no player is named like something every object has", () => {
    const s = emptyScores();
    for (const id of ["__proto__", "toString", "constructor"]) assert.equal(addBeats(s, id, "Eve", 0, [0], 4, "easy"), false, id);
    assert.deepEqual(Object.keys(s.offs), []);
    assert.equal(Object.getPrototypeOf(s.offs), Object.prototype);
    // a room whose players include such an id (it can't happen: the room turns them away) still has results
    assert.deepEqual(resultsOf(s, ["toString", "constructor"], "pop-easy", "easy", 4).players, []);
  });

  it("这一段再来 clears the beats from where the dance goes back to", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, [0, 0, 0, 0, 0, 0], 8, "easy");
    clearFrom(s, 4);
    assert.deepEqual(s.offs.ann, [0, 0, 0, 0, UNSEEN, UNSEEN, UNSEEN, UNSEEN]);
  });
});

describe("the floor together", () => {
  it("a beat counts when most of those dancing hit it; each dancer's last 8 beats", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, [0, 0, 0, 0, 0, 0, 0, 0], 8, "easy");
    addBeats(s, "bob", "Bob", 0, [0, 0, null, 0, 0, 0, 0, 0], 8, "easy");
    addBeats(s, "cat", "Cat", 0, [null, null, null, 0, 0, 0, 0, 0], 8, "easy");
    // beats 0, 1: 2 of 3 hit (enough); 2: 1 of 3 (not); 3 to 7: everyone
    assert.deepEqual(floorOf(s, "easy"), { streak: 5, best: 5, bursts: 0, dancers: 3, levels: { ann: 1, bob: 7 / 8, cat: 5 / 8 } });
  });

  it("counts a beat once every phone still dancing has sent it; a phone that stopped holds nothing up", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, new Array(8).fill(0), 32, "easy");
    addBeats(s, "bob", "Bob", 0, [0, 0, 0, 0], 32, "easy");
    assert.equal(floorOf(s, "easy").streak, 4, "Bob's next bar is on its way");
    addBeats(s, "ann", "Ann", 8, new Array(16).fill(0), 32, "easy");
    const f = floorOf(s, "easy");
    assert.equal(f.dancers, 1, "Bob stopped 20 beats ago");
    assert.equal(f.streak, 24);
  });

  it("a run as long as the bar sets off fireworks, and the bar starts again", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, new Array(16).fill(0), 2 * COMBO_FULL + 8, "medium");
    for (let b = 16; b < 2 * COMBO_FULL + 8; b += 16) addBeats(s, "ann", "Ann", b, new Array(Math.min(16, 2 * COMBO_FULL + 8 - b)).fill(0), 2 * COMBO_FULL + 8, "medium");
    const f = floorOf(s, "medium");
    assert.equal(f.bursts, 2);
    assert.equal(f.streak, 2 * COMBO_FULL + 8);
  });

  it("medium: a move 101 ms off is not on the beat", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, [101, 99], 4, "medium");
    assert.deepEqual([floorOf(s, "medium").best, floorOf(s, "medium").levels.ann], [1, 0.5]);
  });
});

describe("the results", () => {
  it("everyone who danced, in the order they joined; the awards go round", () => {
    const s = emptyScores();
    const total = 16;
    addBeats(s, "cat", "Cat", 0, new Array(16).fill(200), total, "easy"); // close, never on the beat
    addBeats(s, "bob", "Bob", 0, new Array(16).fill(10), total, "easy"); // the steadiest
    addBeats(s, "ann", "Ann", 0, new Array(16).fill(-40), total, "easy");
    const r = resultsOf(s, ["ann", "bob", "cat", "dan"], "square-easy", "easy", total);
    assert.deepEqual(
      r.players.map((p) => [p.id, p.participation, p.meanAbsOffsetMs, p.bestStreak]),
      [
        ["ann", 100, 40, 16],
        ["bob", 100, 10, 16],
        ["cat", 100, null, 0],
      ],
    );
    // 最稳 Bob; 最嗨: Ann and Bob tie, Bob has one, so Ann; 最努力: all three moved on every beat, Cat has none yet
    assert.deepEqual(r.awards, { steady: "bob", hype: "ann", effort: "cat" });
    assert.deepEqual([r.beats, r.together, r.bestStreak, r.routineId, r.difficulty], [16, 100, 16, "square-easy", "easy"]);
  });

  it("the gold moves each dancer got: on easy a move near the beat, on medium on it", () => {
    const total = 192;
    const s = emptyScores();
    const row = (at: Record<number, number>) => Array.from({ length: total }, (_, b) => at[b] ?? null);
    addBeats(s, "ann", "Ann", 0, row({ 63: 20, 127: -250, 191: 0, 10: 0 }), total, "easy");
    addBeats(s, "bob", "Bob", 0, row({ 63: 20 }), total, "easy");
    const r = resultsOf(s, ["ann", "bob"], "square-easy", "easy", total);
    assert.equal(r.golds, 3);
    assert.deepEqual(r.players.map((p) => [p.id, p.gold]), [["ann", 3], ["bob", 1]]);
    const m = emptyScores();
    addBeats(m, "ann", "Ann", 0, row({ 63: 20, 127: -150, 191: 0 }), total, "medium");
    assert.equal(resultsOf(m, ["ann"], "square-medium", "medium", total).players[0]!.gold, 2, "150 ms off is moved, not on the beat");
    assert.equal(resultsOf(m, ["ann"], "metronome-120", "medium", total).golds, 0, "none in the metronome");
  });

  it("a beat not sent is a beat not moved; nobody who never moved gets an award", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, [0, 0, 0, 0], 8, "easy");
    addBeats(s, "dan", "Dan", 0, [null, null, null, null, null, null, null, null], 8, "easy");
    const r = resultsOf(s, ["dan", "ann"], "pop-easy", "easy", 8);
    assert.deepEqual(r.players.map((p) => [p.name, p.participation]), [["Dan", 0], ["Ann", 50]]);
    assert.deepEqual(r.awards, { steady: "ann", hype: "ann", effort: "ann" });
    assert.equal(r.together, 25);
  });

  it("medium and hard count the timing: 0.4 moved and 0.6 on the beat, or on the beat alone", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, [0, 150, null, null], 4, "medium");
    assert.equal(resultsOf(s, ["ann"], "pop-medium", "medium", 4).players[0]!.participation, 35); // moved 2/4, hit 1/4
    const h = emptyScores();
    addBeats(h, "ann", "Ann", 0, [0, 100, null, null], 4, "hard");
    assert.equal(resultsOf(h, ["ann"], "pop-hard", "hard", 4).players[0]!.participation, 25); // hit 1/4
  });

  it("a dancer who left before the end is still in the results, after those still here", () => {
    const s = emptyScores();
    addBeats(s, "zed", "Zed", 0, [0, 0, 0, 0], 4, "easy");
    addBeats(s, "ann", "Ann", 0, [0, 0, 0, 0], 4, "easy");
    assert.deepEqual(resultsOf(s, ["ann"], "pop-easy", "easy", 4).players.map((p) => p.name), ["Ann", "Zed"]);
  });

  it("for the steadiest, a quarter of the dance on the beat when anyone managed that", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, [0, 0, 0, 0, 0, 0, null, null], 8, "easy"); // 6 hits, 0 ms off
    addBeats(s, "bob", "Bob", 0, [100, 100, 100, 100, 100, null, null, null], 8, "easy"); // 5 hits, 100 ms off
    addBeats(s, "cat", "Cat", 0, [1, null, null, null, null, null, null, null], 8, "easy"); // 1 hit, 1 ms off
    const r = resultsOf(s, ["ann", "bob", "cat"], "pop-easy", "easy", 8);
    // 4 beats needed (a quarter of 8, at least 4): Cat's single beat doesn't make her the steadiest
    assert.equal(r.awards.steady, "ann");
  });
});

describe("the TV's delay, from how everyone danced", () => {
  /** n moves sitting `late` ms after the beat, give or take `jitter` */
  const moves = (n: number, late: number, jitter: number) => Array.from({ length: n }, (_, i) => late + ((i * 37) % (2 * jitter + 1)) - jitter);

  it("moves late by the same amount beat after beat: the room hears the beat that much later", () => {
    const s = emptyScores();
    addBeats(s, "ann", "Ann", 0, moves(24, 180, 30), 192, "easy");
    addBeats(s, "bob", "Bob", 40, [...moves(20, 190, 40), null, null], 192, "easy");
    const shift = learnedShift(s)!;
    assert.ok(Math.abs(shift - 184) <= 8, `${shift}`);
  });

  it("too few moves, or too scattered to say: nothing", () => {
    const few = emptyScores();
    addBeats(few, "ann", "Ann", 0, moves(LEARN_MOVES - 1, 180, 10), 192, "easy");
    assert.equal(learnedShift(few), null);
    const shaking = emptyScores();
    // (moves all over the beat: as many early as late, far apart)
    addBeats(shaking, "ann", "Ann", 0, moves(64, 0, 280), 192, "easy");
    assert.equal(learnedShift(shaking), null);
    // (beats not sent and beats with no move near them don't count)
    const idle = emptyScores();
    addBeats(idle, "ann", "Ann", 0, [...moves(20, 150, 10), ...new Array<null>(40).fill(null)], 192, "easy");
    assert.equal(learnedShift(idle), null);
    assert.equal(idle.offs.ann!.filter((o) => o === UNSEEN).length, 132);
  });
});

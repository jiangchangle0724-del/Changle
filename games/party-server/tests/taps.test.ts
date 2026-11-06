// A phone's judge (src/shared/taps.ts): its player's moves (taps on the big button for now) against
// the beats the room hears, the verdict on each scored beat once its window has closed, and the
// dance's beats gathered into the bars the phone sends. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunBeat, Stage } from "../src/shared/show";
import { BeatJudge, movedWindowMs } from "../src/shared/taps";

/** A run: 4 beats to follow (scored, not counted) at 1000, 1500, …, then 8 dance beats from 3000. */
function run(): RunBeat[] {
  const beat = (stage: Stage, t: number, danceBeat: number | null, count: number): RunBeat => ({ stage, move: null, count, at: 0, ms: 500, score: true, danceBeat, t });
  return [
    ...[0, 1, 2, 3].map((k) => beat("follow", 1000 + 500 * k, null, k + 1)),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => beat("dance", 3000 + 500 * k, k, k + 1)),
  ];
}

describe("a phone's judge", () => {
  it("the windows: on the beat within 150 ms (easy), a move within 300, else no move", () => {
    assert.deepEqual([movedWindowMs("easy"), movedWindowMs("medium"), movedWindowMs("hard")], [300, 200, 160]);
    const j = new BeatJudge(run(), "easy", 0);
    j.move(1010);
    j.move(2180);
    j.move(2440);
    assert.deepEqual(j.settle(1300), [], "beat 0's window is still open");
    const v = j.settle(2801);
    assert.deepEqual(
      v.map((x) => [x.i, x.verdict, x.off]),
      [
        [0, "hit", 10],
        [1, "miss", null],
        [2, "close", 180],
        [3, "hit", -60],
      ],
    );
  });

  it("the beats to follow are judged but not sent; the dance's go in bars", () => {
    const j = new BeatJudge(run(), "easy", 0);
    j.move(1000);
    for (const t of [3000, 3490, 4510, 5000, 5520, 6260]) j.move(t);
    j.settle(4801);
    assert.deepEqual(j.take(), [{ from: 0, offs: [0, -10, null, 10] }]);
    j.settle(6801);
    // (the tap at 6260 is near enough to both beat 6 and beat 7 to count as a move for each, as in
    // party-base's scoreBeats; on the beat it is for neither)
    assert.deepEqual(j.take(), [{ from: 4, offs: [0, 20, 260, -240] }]);
    assert.equal(j.done, true);
  });

  it("a phone sends nothing until its player moves; from then on, every beat", () => {
    const j = new BeatJudge(run(), "easy", 0);
    j.settle(5301);
    assert.deepEqual(j.take(true), [], "nobody has tapped yet");
    assert.equal(j.dancing, false);
    j.move(5510);
    j.settle(6801);
    assert.equal(j.dancing, true);
    assert.deepEqual(j.take(), [{ from: 5, offs: [10, null, null] }]);
  });

  it("a phone that came in late judges only the beats it heard whole", () => {
    const j = new BeatJudge(run(), "easy", 2200);
    j.move(2500);
    assert.deepEqual(j.settle(2801).map((x) => x.i), [3]);
  });

  it("what's left goes when the run ends early (a bar cut short)", () => {
    const j = new BeatJudge(run(), "easy", 0);
    j.move(3000);
    j.move(3500);
    j.settle(3801);
    assert.deepEqual(j.take(), [], "half a bar");
    assert.deepEqual(j.take(true), [{ from: 0, offs: [0, 0] }]);
  });

  it("a move counts for the nearest beat only once it's that beat's turn (old moves are let go)", () => {
    const j = new BeatJudge(run(), "easy", 0);
    for (const t of [3000, 3500, 4000, 4500]) j.move(t);
    const v = j.settle(10_000);
    assert.equal(v.filter((x) => x.beat.danceBeat !== null && x.verdict === "hit").length, 4);
    assert.equal(v.filter((x) => x.beat.danceBeat !== null && x.verdict === "miss").length, 4);
  });
});

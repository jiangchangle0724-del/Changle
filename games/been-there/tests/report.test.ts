// The finale's report card (src/client/ui/tripReport.ts): which awards a game earns, in what order, and
// the dice over the game.
import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyTally, type Tally } from "../src/room/protocol";
import { LONG_RUN, MAX_AWARDS, awards, diceOf } from "../src/client/ui/tripReport";

const seat = (o: Partial<Tally>): Tally => ({ ...emptyTally(), ...o });

test("awards: in order, nothing for nothing, a tie shared, five at most, the best average needs three throws", () => {
  const tally = [
    seat({ rentGot: 900, rentPaid: 100, topRent: { amount: 100, at: 3 }, throws: 10, pips: 80, doubles: 2, quizWins: 1, jail: 1 }),
    seat({ rentGot: 300, rentPaid: 1100, topRent: { amount: 650, at: 39 }, throws: 10, pips: 60, doubles: 2, auctionsWon: 2 }),
    seat({ throws: 2, pips: 24 }),
  ];
  const list = awards(tally);
  assert.deepEqual(
    list.map((a) => a.kind),
    ["landlord", "dearest", "quiz", "auction", "hotDice"],
  );
  assert.equal(list.length, MAX_AWARDS);
  assert.deepEqual(list[0], { kind: "landlord", value: 900, seats: [0] });
  assert.deepEqual(list[1], { kind: "dearest", value: 650, seats: [1], at: 39 });
  assert.deepEqual(list[4], { kind: "hotDice", value: 8, seats: [0] }, "seat 2 averaged 12 but threw only twice");
  // Doubles were a tie: past the five, but shared if there were room.
  const few = awards([seat({ doubles: 3 }), seat({ doubles: 3 }), seat({})]);
  assert.deepEqual(few, [{ kind: "doubles", value: 3, seats: [0, 1] }]);
  assert.deepEqual(awards([seat({}), seat({})]), [], "a game with nothing in it earns nothing");
});

test("the dice over the game: throws, the average, doubles, and each total against the long run", () => {
  const a = seat({ throws: 3, pips: 21, doubles: 1, totals: [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0] });
  const b = seat({ throws: 1, pips: 12, doubles: 1, totals: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1] });
  const d = diceOf([a, b]);
  assert.equal(d.throws, 4);
  assert.equal(d.avg, 33 / 4);
  assert.equal(d.doubles, 2);
  assert.deepEqual(d.totals, [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 1]);
  assert.ok(Math.abs(LONG_RUN.reduce((x, y) => x + y, 0) - 1) < 1e-12);
  assert.equal(LONG_RUN[5], 6 / 36);
  assert.deepEqual(diceOf([]), { throws: 0, doubles: 0, totals: Array(11).fill(0), avg: 0 });
});

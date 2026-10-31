// A move is worked out from the feed (src/client/ui/ridePlan.ts): which moves follow a throw, which
// way round each goes, how far, and when each beat of it plays, at which pace.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameEvent } from "../src/engine";
import type { FeedItem, RoomView } from "../src/room/protocol";
import {
  BEAT,
  MAX_EXTRA,
  OLD_MOMENT,
  paceOf,
  perSpace,
  planMove,
  planRide,
  rideUrgent,
  timesFor,
  walkOf,
  withTimes,
  type Leg,
  type RidePlan,
} from "../src/client/ui/ridePlan";

const now = Date.now();
let id = 0;
const ev = (e: GameEvent, ago = 200): FeedItem => ({ id: ++id, at: now - ago, t: "game", e });
/** A room's view with `turns` taken by seat 0 so far (it's seat `turn`'s go). */
const view = (feed: FeedItem[], seats = [0], turns = 0, turn = 0) =>
  ({ you: { seats }, game: { s: { turn, ps: [{ turns }, { turns: 0 }] } }, feed }) as unknown as RoomView;
const leg = (from: number, to: number, steps: number, more: Partial<Leg> = {}): Leg => ({ from, to, dir: 1, steps, salary: 0, by: "dice", cut: false, ...more });

test("a throw's move: the dice's, then the card's that sends the token on (a red-eye goes back three)", () => {
  const plan = planRide(
    view([
      ev({ t: "turn", p: 0 }),
      ev({ t: "roll", p: 0, dice: [3, 4], steps: 7 }),
      ev({ t: "move", p: 0, from: 0, to: 7 }),
      ev({ t: "land", p: 0, at: 7 }),
      ev({ t: "card", p: 0, deck: "journey", id: "redeye" }),
      ev({ t: "move", p: 0, from: 7, to: 4 }),
      ev({ t: "land", p: 0, at: 4 }),
    ]),
  );
  assert.ok(plan);
  assert.deepEqual(plan.legs, [leg(0, 7, 7), leg(7, 4, 3, { dir: -1, by: "card", card: "redeye" })]);
  assert.equal(plan.jail, false);
  assert.equal(plan.card, false, "the card sent the token on: it comes up on the way, not at the end");
  assert.equal(plan.cardId, "redeye");
  assert.deepEqual(plan.dice, [3, 4]);
  assert.equal(plan.thrown, 7);
});

test("the hitch-hiking card throws again in the same moment: one move, from the first throw", () => {
  const first = ev({ t: "roll", p: 0, dice: [3, 4], steps: 7 });
  const plan = planRide(
    view([
      first,
      ev({ t: "move", p: 0, from: 0, to: 7 }),
      ev({ t: "land", p: 0, at: 7 }),
      ev({ t: "card", p: 0, deck: "journey", id: "hitch" }),
      ev({ t: "roll", p: 0, dice: [1, 2], steps: 3 }),
      ev({ t: "move", p: 0, from: 7, to: 10 }),
    ]),
  );
  assert.equal(plan?.key, first.id);
  assert.deepEqual(plan?.legs, [leg(0, 7, 7), leg(7, 10, 3, { by: "card", card: "hitch" })]);
  // A far one is a quick fade, not a dash round the board.
  const far = planRide(
    view([
      ev({ t: "roll", p: 0, dice: [3, 4], steps: 7 }),
      ev({ t: "move", p: 0, from: 0, to: 7 }),
      ev({ t: "card", p: 0, deck: "journey", id: "hitch" }),
      ev({ t: "roll", p: 0, dice: [5, 6], steps: 11 }),
      ev({ t: "move", p: 0, from: 7, to: 18 }),
    ]),
  );
  assert.equal(far?.legs[1].cut, true);
  // Doubles: the next throw comes seconds later, and is a move of its own (at 0.85 at most).
  const again = planRide(
    view([
      ev({ t: "roll", p: 0, dice: [2, 2], steps: 4, doubles: true }, 5000),
      ev({ t: "move", p: 0, from: 0, to: 4 }, 5000),
      ev({ t: "roll", p: 0, dice: [1, 2], steps: 3 }),
      ev({ t: "move", p: 0, from: 4, to: 7 }),
    ]),
  );
  assert.deepEqual(again?.legs, [leg(4, 7, 3)]);
  assert.equal(again?.pace, 0.85);
});

test("a card drawn where the token lands, one that doesn't send it on, is the landing's", () => {
  const plan = planRide(
    view([
      ev({ t: "roll", p: 0, dice: [3, 4], steps: 7 }),
      ev({ t: "move", p: 0, from: 0, to: 7 }),
      ev({ t: "land", p: 0, at: 7 }),
      ev({ t: "card", p: 0, deck: "journey", id: "rate" }),
    ]),
  );
  assert.equal(plan?.card, true);
  assert.equal(plan?.cardId, null);
});

test("the dice always walk forward (Sydney turns the order of play round, not the board)", () => {
  const plan = planRide(view([ev({ t: "roll", p: 0, dice: [2, 3], steps: 5 }), ev({ t: "move", p: 0, from: 22, to: 27 })]));
  assert.deepEqual(plan?.legs, [leg(22, 27, 5)]);
});

test("Mexico City's ban on both dice: a hop where the token stands", () => {
  const plan = planRide(view([ev({ t: "roll", p: 0, dice: [2, 2], steps: 0, doubles: true }), ev({ t: "move", p: 0, from: 8, to: 8 })]));
  assert.deepEqual(plan?.legs, [leg(8, 8, 0)]);
  assert.equal(withTimes(plan!).t.legs[0].per, BEAT.hop);
});

test("passing Departure pays on the way; the Passport Expired corner sends the token to Immigration", () => {
  const plan = planRide(
    view([ev({ t: "roll", p: 0, dice: [4, 4], steps: 8, doubles: true }), ev({ t: "move", p: 0, from: 36, to: 4, salary: 200 })]),
  );
  assert.deepEqual(plan?.legs, [leg(36, 4, 8, { salary: 200 })]);
  const jailed = planRide(
    view([ev({ t: "roll", p: 0, dice: [1, 2], steps: 3 }), ev({ t: "move", p: 0, from: 27, to: 30 }), ev({ t: "jail", p: 0 })]),
  );
  assert.equal(jailed?.jail, true);
  assert.equal(withTimes(jailed!).t.ready - withTimes(jailed!).t.land, BEAT.stamp + BEAT.gate);
});

test("a car permit's move comes after its decision: it plays from the move, without the dice", () => {
  const plan = planRide(view([ev({ t: "roll", p: 0, dice: [3, 4], steps: 7 }, 4000), ev({ t: "move", p: 0, from: 0, to: 7 })]));
  assert.ok(plan);
  assert.equal(plan.rolled, false);
  assert.equal(plan.start, now - 200);
  const t = withTimes(plan).t;
  assert.equal(t.dice, 0);
  assert.equal(t.walk, BEAT.push);
});

test("no ride for another team's throw, an old throw, or a throw that didn't move (in Immigration)", () => {
  assert.equal(planRide(view([ev({ t: "roll", p: 1, dice: [3, 4], steps: 7 }), ev({ t: "move", p: 1, from: 0, to: 7 })])), null);
  assert.equal(planRide(view([ev({ t: "roll", p: 0, dice: [3, 4], steps: 7 }, 20_000), ev({ t: "move", p: 0, from: 0, to: 7 }, 20_000)])), null);
  assert.equal(planRide(view([ev({ t: "roll", p: 0, dice: [3, 4], steps: 7, jail: true })])), null);
  // The next turn's moves aren't this throw's.
  assert.deepEqual(
    planRide(view([ev({ t: "roll", p: 0, dice: [1, 1], steps: 2 }), ev({ t: "move", p: 0, from: 0, to: 2 }), ev({ t: "turn", p: 1 }), ev({ t: "move", p: 0, from: 2, to: 5 })]))?.legs.length,
    1,
  );
  // The big screen plays anyone's.
  assert.equal(planMove(view([ev({ t: "roll", p: 1, dice: [3, 4], steps: 7 }), ev({ t: "move", p: 1, from: 0, to: 7 })]), null)?.seat, 1);
});

test("the other phones walk the token in step with the thrower: from the push, at the thrower's pace", () => {
  const v = view([ev({ t: "roll", p: 1, dice: [3, 4], steps: 7 }), ev({ t: "move", p: 1, from: 0, to: 7 })], [0]);
  const w = walkOf(v, 1);
  assert.ok(w);
  assert.equal(w.start, now - 200 + BEAT.dice + BEAT.push);
  assert.equal(w.per, perSpace(7, 1));
  assert.equal(w.land, w.start + 7 * w.per);
  assert.equal(w.to, 7);
});

test("a ride gives way to what's on a clock: an auction, our Shanghai quiz, a vote it would leave no time for", () => {
  const legs = [leg(0, 3, 3)];
  const plan: RidePlan = {
    key: 1,
    seat: 0,
    legs,
    jail: false,
    card: false,
    cardId: null,
    dice: [1, 2],
    thrown: 3,
    doubles: false,
    rolled: true,
    start: Date.now() + 1000,
    pace: 1,
    t: timesFor(legs, false),
  };
  const at = (game: object) => ({ you: { seats: [0] }, game, feed: [] }) as unknown as RoomView;
  assert.equal(rideUrgent(at({ auction: {} }), plan), true);
  assert.equal(rideUrgent(at({ quiz: { visitor: 0 } }), plan), true);
  assert.equal(rideUrgent(at({ quiz: { visitor: 1 } }), plan), false, "another team's quiz");
  // Cape Town's vote has 25 s: plenty to answer after a short ride. Nearly out of time, no ride.
  assert.equal(rideUrgent(at({ deadline: Date.now() + 25_000 }), plan), false);
  assert.equal(rideUrgent(at({ deadline: Date.now() + 8_000 }), plan), true);
  assert.equal(rideUrgent(at({ deadline: Date.now() - 1 }), plan), false);
});

test("the beat clock: dice 0.6 s, push 0.3 s, 0.2 s a space (a long move runs), the stamp, the window", () => {
  const t = timesFor([leg(0, 7, 7)], false);
  assert.equal(t.dice, 600);
  assert.equal(t.walk, 900);
  assert.equal(t.legs[0].per, 200);
  assert.equal(t.land, 900 + 7 * 200);
  assert.equal(t.ready, t.land + 350);
  assert.equal(t.end, t.ready + 500);
  // Twelve spaces run at 0.15 s; the whole walk never takes more than 1.8 s.
  assert.equal(perSpace(12, 1), 150);
  for (let n = 1; n <= 12; n++) assert.ok(n * perSpace(n, 1) <= 1800);
  // A card's move after it: a pause on its space, then 0.15 s a space, or a fade when it's far.
  const card = timesFor([leg(0, 7, 7), leg(7, 4, 3, { dir: -1, by: "card" }), leg(4, 24, 20, { by: "card", cut: true })], false);
  assert.equal(card.legs[1].at, card.legs[0].at + 7 * 200 + BEAT.pause);
  assert.equal(card.legs[1].per, BEAT.cardStep);
  assert.equal(card.legs[2].at, card.legs[1].at + 3 * BEAT.cardStep + BEAT.pause);
  assert.equal(card.legs[2].cut, BEAT.cut);
  assert.equal(card.land, card.legs[2].at + BEAT.cut);
});

test("later turns go quicker, but never past 0.15 s a space (the camera turns 60 degrees a second at most)", () => {
  assert.equal(paceOf(1, false), 1);
  assert.equal(paceOf(3, false), 1);
  assert.equal(paceOf(4, false), 0.85);
  assert.equal(paceOf(10, false), 0.85);
  assert.equal(paceOf(11, false), 0.7);
  assert.equal(paceOf(2, true), 0.85, "a second throw after doubles");
  assert.equal(paceOf(20, true), 0.7);
  for (const pace of [1, 0.85, 0.7])
    for (let n = 1; n <= 24; n++) {
      const per = perSpace(n, pace);
      assert.ok(per >= BEAT.quick, `${n} spaces at ${pace}`);
      // a space is 9 degrees of the ring: the camera follows at per ms a space
      assert.ok((9 / per) * 1000 <= 60 + 1e-9);
    }
  // The pace comes from the team's own turns: its 4th turn goes at 0.85.
  const v = view([ev({ t: "roll", p: 0, dice: [3, 4], steps: 7 }), ev({ t: "move", p: 0, from: 0, to: 7 })], [0], 3, 0);
  assert.equal(planRide(v)?.pace, 0.85);
  const t = withTimes(planRide(v)!).t;
  assert.equal(t.walk, BEAT.dice + BEAT.push * 0.85);
});

test("from the tap to the decision: at most 4 s more than the 1.7 s before, the worst moves included", () => {
  const worst = [
    timesFor([leg(0, 12, 12)], true),
    timesFor([leg(0, 7, 7), leg(7, 30, 23, { by: "card", cut: true })], true),
    timesFor([leg(0, 7, 7), leg(7, 13, 6, { by: "card" })], true),
    timesFor([leg(0, 7, 7), leg(7, 4, 3, { dir: -1, by: "card" }), leg(4, 8, 4, { by: "card" })], true),
  ];
  for (const t of worst) assert.ok(t.ready <= OLD_MOMENT + MAX_EXTRA, `${t.ready}`);
});

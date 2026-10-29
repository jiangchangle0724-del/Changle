// The first-person move is worked out from the feed (src/client/ui/ridePlan.ts): which moves follow
// this phone's throw, which way round each goes, how far, and when each part of the ride happens.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameEvent } from "../src/engine";
import type { FeedItem, RoomView } from "../src/room/protocol";
import { RIDE, planRide, rideUrgent, stepMs, timesFor, type RidePlan } from "../src/client/ui/ridePlan";

const now = Date.now();
let id = 0;
const ev = (e: GameEvent, ago = 200): FeedItem => ({ id: ++id, at: now - ago, t: "game", e });
const view = (feed: FeedItem[], seats = [0]) => ({ you: { seats }, game: {}, feed }) as unknown as RoomView;

test("a throw's ride: the dice's move, then the card's that sends the token on (a red-eye goes back three)", () => {
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
  assert.deepEqual(plan.legs, [
    { from: 0, to: 7, dir: 1, steps: 7, salary: 0 },
    { from: 7, to: 4, dir: -1, steps: 3, salary: 0 },
  ]);
  assert.equal(plan.jail, false);
  assert.equal(plan.card, false, "the card sent the token on: it comes up on the way, not at the end");
});

test("the hitch-hiking card throws again in the same moment: one ride, from the first throw", () => {
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
  assert.deepEqual(plan?.legs, [
    { from: 0, to: 7, dir: 1, steps: 7, salary: 0 },
    { from: 7, to: 10, dir: 1, steps: 3, salary: 0 },
  ]);
  // Doubles: the next throw comes seconds later, and is a ride of its own.
  const again = planRide(
    view([
      ev({ t: "roll", p: 0, dice: [2, 2], steps: 4, doubles: true }, 5000),
      ev({ t: "move", p: 0, from: 0, to: 4 }, 5000),
      ev({ t: "roll", p: 0, dice: [1, 2], steps: 3 }),
      ev({ t: "move", p: 0, from: 4, to: 7 }),
    ]),
  );
  assert.deepEqual(again?.legs, [{ from: 4, to: 7, dir: 1, steps: 3, salary: 0 }]);
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
});

test("after Sydney turns the table round, the dice walk the other way", () => {
  const plan = planRide(view([ev({ t: "roll", p: 0, dice: [2, 3], steps: 5 }), ev({ t: "move", p: 0, from: 27, to: 22 })]));
  assert.deepEqual(plan?.legs, [{ from: 27, to: 22, dir: -1, steps: 5, salary: 0 }]);
});

test("passing Departure pays on the way; the Passport Expired corner sends the token to Immigration", () => {
  const plan = planRide(
    view([ev({ t: "roll", p: 0, dice: [4, 4], steps: 8, doubles: true }), ev({ t: "move", p: 0, from: 36, to: 4, salary: 200 })]),
  );
  assert.deepEqual(plan?.legs, [{ from: 36, to: 4, dir: 1, steps: 8, salary: 200 }]);
  const jailed = planRide(
    view([ev({ t: "roll", p: 0, dice: [1, 2], steps: 3 }), ev({ t: "move", p: 0, from: 27, to: 30 }), ev({ t: "jail", p: 0 })]),
  );
  assert.equal(jailed?.jail, true);
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
});

test("a ride gives way to what's on a clock: an auction, our Shanghai quiz, a vote it would leave no time for", () => {
  const legs = [{ from: 0, to: 3, dir: 1 as const, steps: 3, salary: 0 }];
  const plan: RidePlan = { key: 1, seat: 0, legs, jail: false, card: false, start: Date.now() + 1000, t: timesFor(legs, false) };
  const at = (game: object) => ({ you: { seats: [0] }, game, feed: [] }) as unknown as RoomView;
  assert.equal(rideUrgent(at({ auction: {} }), plan), true);
  assert.equal(rideUrgent(at({ quiz: { visitor: 0 } }), plan), true);
  assert.equal(rideUrgent(at({ quiz: { visitor: 1 } }), plan), false, "another team's quiz");
  // Cape Town's vote has 25 s: plenty to answer after a short ride. Nearly out of time, no ride.
  assert.equal(rideUrgent(at({ deadline: Date.now() + 25_000 }), plan), false);
  assert.equal(rideUrgent(at({ deadline: Date.now() + 8_000 }), plan), true);
  assert.equal(rideUrgent(at({ deadline: Date.now() - 1 }), plan), false);
});

test("the ride's clock: the camera, each leg's steps (a card's go twice as fast), the landing, the way back", () => {
  const legs = [
    { from: 0, to: 7, dir: 1 as const, steps: 7, salary: 0 },
    { from: 7, to: 15, dir: 1 as const, steps: 8, salary: 0 },
  ];
  const t = timesFor(legs, false);
  assert.equal(t.legs[0].at, RIDE.in);
  assert.equal(t.legs[0].step, stepMs(7));
  assert.equal(t.legs[1].at, RIDE.in + 7 * stepMs(7) + RIDE.pause);
  assert.equal(t.legs[1].step, stepMs(8, true));
  assert.ok(stepMs(8, true) < stepMs(8));
  assert.equal(t.land, t.legs[1].at + 8 * t.legs[1].step);
  assert.equal(t.out, t.land + RIDE.land);
  assert.equal(t.end, t.out + RIDE.out);
  // A long move runs rather than walks: no leg takes much more than 2.4 s.
  assert.ok(12 * stepMs(12) <= 2700);
  assert.equal(timesFor(legs, true).out, t.out + 500);
});

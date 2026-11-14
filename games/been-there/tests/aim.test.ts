// The spaces a question in play is about (ui/aim.ts), lit on the board.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { RoomView } from "../src/room/protocol";
import { aimOf } from "../src/client/ui/aim";
import { defaultConfig, newGame } from "../src/engine";

const view = (pending: unknown, pos: number[]) =>
  ({ game: { s: { turns: 7, pending, ps: pos.map((p) => ({ pos: p })) } } }) as unknown as RoomView;

test("Beijing's Central Axis: the space straight across, a path across the middle from the token", () => {
  const a = aimOf(view({ k: "jump", who: 1 }, [0, 23]))!;
  assert.deepEqual(a.spaces, [3]);
  assert.equal(a.from, 23);
  assert.equal(a.across, true);
  assert.equal(a.look, true);
  assert.equal(a.who, 1);
});

test("a car permit: as thrown first, then one less and one more, round past Departure", () => {
  const a = aimOf(view({ k: "permit", who: 0, steps: 3, again: false }, [38]))!;
  assert.deepEqual(a.spaces, [1, 0, 2]);
  assert.equal(a.from, 38);
  assert.equal(a.across, undefined);
  assert.equal(a.look, true);
});

test("an Air Miles card: the four routes, no path, the map stays", () => {
  const a = aimOf(view({ k: "card-route", who: 0 }, [7]))!;
  assert.deepEqual(a.spaces, [5, 15, 25, 35]);
  assert.equal(a.from, undefined);
  assert.equal(a.look, false);
});

test("the city up for auction, and the city whose rent is put to the vote: lit, the map goes there", () => {
  const auction = aimOf(view({ k: "auction", at: 14, bids: {} }, [14, 3]))!;
  assert.deepEqual(auction.spaces, [14]);
  assert.equal(auction.who, -1);
  assert.equal(auction.look, true);
  const freeze = aimOf(view({ k: "freeze", who: 1, at: 19, votes: {} }, [0, 19]))!;
  assert.deepEqual(freeze.spaces, [19]);
  assert.equal(freeze.look, true);
});

test("a card's free house, and Mumbai's: the team's own cities it can go on or come off, the map stays", () => {
  const s = newGame(defaultConfig(2), ["A", "B"], 1);
  // (A owns all of Africa, with a house on Cape Town; B owns Mumbai)
  for (const at of [1, 3]) s.deeds[at]!.owner = 0;
  s.deeds[3]!.houses = 1;
  s.deeds[13]!.owner = 1;
  const v = (pending: unknown) => ({ game: { s: { ...s, pending } } }) as unknown as RoomView;
  const review = aimOf(v({ k: "card-house", who: 0, card: "review" }))!;
  assert.ok(review.spaces.length > 0 && review.spaces.every((at) => s.deeds[at]!.owner === 0), String(review.spaces));
  assert.equal(review.look, false);
  const mumbai = aimOf(v({ k: "mumbai", who: 0 }))!;
  assert.deepEqual(mumbai.spaces, [3]);
  // (none to choose from: nothing lit)
  assert.equal(aimOf(v({ k: "mumbai", who: 1 })), null);
});

test("a question about no space, or none: nothing lit; a new question, a new key", () => {
  assert.equal(aimOf(view({ k: "buy", who: 0, at: 3, price: 60 }, [3])), null);
  assert.equal(aimOf(view({ k: "end", who: 0 }, [3])), null);
  assert.equal(aimOf(view(null, [3])), null);
  assert.notEqual(aimOf(view({ k: "jump", who: 0 }, [23]))!.key, aimOf(view({ k: "jump", who: 1 }, [0, 23]))!.key);
});

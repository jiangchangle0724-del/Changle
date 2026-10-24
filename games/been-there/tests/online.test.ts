// The online additions must not change how a game plays, and must work on their own.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  STYLES,
  act,
  configFor,
  decide,
  endAfterThisRound,
  newBrain,
  newGame,
  runBots,
  settleLiveAuction,
  whoMustAct,
  type GameState,
} from "../src/engine";

/** Pending kind as a plain string (strict asserts would otherwise narrow it). */
const kind = (s: GameState): string | undefined => s.pending?.k;
const strip = (s: GameState) => JSON.stringify({ ...s, events: null, log: null });

test("the event stream does not change the game", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const cfg = configFor({ n: 4, mode: "target" });
    const names = ["a", "b", "c", "d"];
    const quiet = newGame(structuredClone(cfg), names, seed);
    const loud = newGame(structuredClone(cfg), names, seed, { events: true });
    const brains = () => names.map((_, i) => newBrain(STYLES.balanced, seed * 7919 + i * 104729));
    runBots(quiet, brains());
    runBots(loud, brains());
    assert.equal(strip(loud), strip(quiet), `seed ${seed}`);
    assert.ok(loud.events!.length > 50);
    assert.equal(loud.events!.at(-1)!.t, "over");
  }
});

test("a live auction sells to the winner at their last bid", () => {
  const s = newGame(configFor({ n: 3, mode: "target" }), ["a", "b", "c"], 7, { events: true });
  s.forced = [1, 2]; // roll 3: Cape Town (space 3)
  assert.ok(act(s, 0, {}));
  // Cape Town's water vote first.
  for (const p of whoMustAct(s)) assert.ok(act(s, p, { use: false }));
  assert.equal(kind(s), "buy");
  assert.ok(act(s, 0, { yes: false }));
  assert.equal(kind(s), "auction");
  const before = s.ps[2].cash;
  assert.ok(settleLiveAuction(s, 2, 130));
  assert.equal(s.deeds[3]!.owner, 2);
  assert.equal(s.ps[2].cash, before - 130);
  assert.equal(kind(s), "end");
});

test("an auction nobody bids on leaves the city unowned", () => {
  const s = newGame(configFor({ n: 2, mode: "target" }), ["a", "b"], 3);
  s.forced = [3, 3]; // 6: Buenos Aires — tango first
  assert.ok(act(s, 0, {}));
  assert.equal(kind(s), "tango");
  assert.ok(act(s, 0, { partner: null }));
  assert.equal(kind(s), "buy");
  assert.ok(act(s, 0, { yes: false }));
  assert.ok(settleLiveAuction(s, null, 0));
  assert.equal(s.deeds[6]!.owner, -1);
});

test("time's up finishes the round in progress", () => {
  const cfg = configFor({ n: 3, mode: "target" });
  const s = newGame(cfg, ["a", "b", "c"], 11);
  const brains = ["a", "b", "c"].map((_, i) => newBrain(STYLES.balanced, i + 1));
  // Play until seat 1 is on turn in round 3, then call time.
  let guard = 0;
  while (!(s.turn === 1 && s.ps[0].turns === 3 && kind(s) === "roll") && guard++ < 5000) {
    const p = whoMustAct(s)[0];
    act(s, p, decide(s, p, brains));
  }
  endAfterThisRound(s);
  assert.deepEqual(s.cfg.end, { kind: "rounds", rounds: 3 });
  runBots(s, brains);
  assert.equal(s.over, true);
  assert.ok(["rounds", "last"].includes(s.reason));
  if (s.reason === "rounds") for (const p of s.ps) if (!p.out) assert.equal(p.turns, 3);
});

// 世界大动荡 · World upheaval (engine/world.ts and worldEvent in engine/play.ts): what each of the six does
// at once and for its two rounds, that it ends then, that none comes round again before all have, and
// that a set a meteor has left uneven can still be built back up and sold off.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AI_GIFT,
  BOARD,
  CITIES,
  GROUP_SPACES,
  ROUTE_SPACES,
  STYLES,
  WORLD,
  WORLD_IDS,
  act,
  buildCost,
  canBuild,
  canSell,
  configFor,
  decide,
  groupAt,
  houseCostAt,
  newBrain,
  newGame,
  rentAt,
  whoMustAct,
  worldEvent,
  type GameEvent,
  type GameState,
} from "../src/engine";

const at = (id: string) => BOARD.findIndex((sp) => sp.k === "city" && sp.id === id);
const brains = (n: number) => Array.from({ length: n }, (_, i) => newBrain(STYLES.balanced, i + 1));
const game = (n = 3, seed = 4): GameState =>
  newGame(configFor({ n, mode: "target" }), Array.from({ length: n }, (_, i) => `t${i}`), seed, { events: true });
const worldEvents = (s: GameState) => s.events!.filter((e): e is Extract<GameEvent, { t: "world" }> => e.t === "world");

/** Seat `p` owns the whole set of `city`, with `houses` on each. */
function ownSet(s: GameState, p: number, city: string, houses = 0) {
  for (const sp of GROUP_SPACES[groupAt(at(city))!]) Object.assign(s.deeds[sp]!, { owner: p, houses, mort: false });
}

/** Play on with the computer until `turns` turns have passed. */
function playTurns(s: GameState, turns: number) {
  const b = brains(s.ps.length);
  const until = s.turns + turns;
  for (let guard = 0; !s.over && s.turns < until && guard < 20_000; guard++) {
    const p = whoMustAct(s)[0];
    act(s, p, decide(s, p, b));
  }
}

test("six world events, three bad and three good, each with a title and what it does in both languages", () => {
  assert.deepEqual(WORLD_IDS, ["crash", "meteor", "terror", "ai", "invention", "boom"]);
  assert.deepEqual(
    WORLD.map((w) => w.good),
    [false, false, false, true, true, true],
  );
  for (const w of WORLD) for (const text of [w.title, w.text]) assert.ok(text.zh && text.en, w.id);
});

test("the financial crisis takes 15% of every team's cash (in tens) and halves all rent for two rounds", () => {
  const s = game(3);
  s.ps[0].cash = 1500;
  s.ps[1].cash = 333;
  s.ps[2].cash = 5;
  const tokyo = at("tokyo");
  s.deeds[tokyo]!.owner = 1;
  s.deeds[ROUTE_SPACES[0]]!.owner = 2;
  const before = [rentAt(s, tokyo, 7), rentAt(s, ROUTE_SPACES[0], 7)];
  assert.equal(worldEvent(s, "crash"), "crash");
  assert.deepEqual(
    s.ps.map((p) => p.cash),
    [1500 - 220, 333 - 40, 5],
  );
  const e = worldEvents(s).at(-1)!;
  assert.deepEqual(e.lost, [220, 40, 0]);
  assert.deepEqual([rentAt(s, tokyo, 7), rentAt(s, ROUTE_SPACES[0], 7)], before.map((r) => Math.round(r / 2)));
  // Two rounds later (three teams: six turns) it's over, and rent is back.
  playTurns(s, 6);
  assert.equal(s.world, null);
  assert.deepEqual(worldEvents(s).at(-1), { t: "world", id: "crash", on: false });
});

test("a meteor wrecks a city's buildings (insurance pays back half), and for two rounds the crater takes no rent and can't be bought or built on", () => {
  const s = game(2, 7);
  // Find which city this seed's meteor hits, then play it again with a hotel there.
  const probe = structuredClone(s);
  worldEvent(probe, "meteor");
  const hit = probe.world!.at!;
  assert.equal(BOARD[hit].k, "city");
  const city = CITIES.find((c) => at(c.id) === hit)!.id;
  ownSet(s, 1, city, 5);
  const cash = s.ps[1].cash;
  worldEvent(s, "meteor");
  assert.equal(s.world!.at, hit);
  assert.equal(s.deeds[hit]!.houses, 0, "the hotel is gone");
  assert.equal(s.ps[1].cash, cash + (5 * houseCostAt(s, hit)) / 2, "insurance pays half");
  const e = worldEvents(s).at(-1)!;
  assert.equal(e.houses, 5);
  assert.equal(e.owner, 1);
  assert.equal(rentAt(s, hit, 7), 0, "no rent in the crater");
  assert.equal(canBuild(s, 1, hit), false, "nothing built there");
  // The rest of the set, still at hotels, sells down even though the crater is bare…
  const rest = GROUP_SPACES[groupAt(hit)!].filter((x) => x !== hit);
  for (const x of rest) assert.equal(canSell(s, 1, x), true);
  // …and once the two rounds are over the crater can be built up again first.
  s.world = null;
  assert.equal(canBuild(s, 1, hit), true);
  for (const x of rest) assert.equal(canBuild(s, 1, x), false, "the hotels wait for the crater");
});

test("a team landing on the crater or the city locked down: no rent, no offer to buy, no city rule", () => {
  for (const id of ["meteor", "terror"] as const) {
    const s = game(2, 7);
    worldEvent(s, id);
    const hit = s.world!.at!;
    s.ps[0].pos = (hit - 5 + 40) % 40;
    const cash = s.ps[0].cash;
    s.forced = [2, 3];
    assert.ok(act(s, 0, {}));
    assert.equal(s.ps[0].pos, hit);
    assert.notEqual(s.pending?.k, "buy", id);
    assert.ok(s.pending?.k === "end" || s.pending?.k === "roll", `${id}: the turn just goes on (${s.pending?.k})`);
    assert.ok(s.ps[0].cash >= cash, `${id}: nothing paid`);
  }
});

test("a terror attack locks a city down and halves rent in the rest of its region, for two rounds", () => {
  const s = game(3, 11);
  worldEvent(s, "terror");
  const hit = s.world!.at!;
  const rest = GROUP_SPACES[groupAt(hit)!].filter((x) => x !== hit);
  for (const x of [hit, ...rest]) s.deeds[x]!.owner = 2;
  const elsewhere = at(groupAt(hit) === groupAt(at("tokyo")) ? "london" : "tokyo");
  s.deeds[elsewhere]!.owner = 2;
  assert.equal(rentAt(s, hit, 7), 0);
  const w = s.world;
  s.world = null;
  const base = [...rest, elsewhere].map((x) => rentAt(s, x, 7));
  s.world = w;
  assert.deepEqual(
    [...rest, elsewhere].map((x) => rentAt(s, x, 7)),
    [...base.slice(0, rest.length).map((r) => Math.round(r / 2)), base[rest.length]],
  );
});

test("the AI revolution gives every team $50 and halves building costs for two rounds", () => {
  const s = game(3);
  s.ps[2].out = true;
  const cash = s.ps.map((p) => p.cash);
  const cairo = at("cairo");
  const full = buildCost(s, cairo);
  worldEvent(s, "ai");
  assert.deepEqual(
    s.ps.map((p) => p.cash),
    [cash[0] + AI_GIFT, cash[1] + AI_GIFT, cash[2]],
  );
  assert.equal(buildCost(s, cairo), Math.round(full / 2));
});

test("the supersonic airliner doubles airline rent and the salary for passing Departure, for two rounds", () => {
  const s = game(2);
  s.deeds[ROUTE_SPACES[1]]!.owner = 1;
  const route = rentAt(s, ROUTE_SPACES[1], 7);
  const tokyo = at("tokyo");
  s.deeds[tokyo]!.owner = 1;
  const city = rentAt(s, tokyo, 7);
  worldEvent(s, "invention");
  assert.equal(rentAt(s, ROUTE_SPACES[1], 7), route * 2);
  assert.equal(rentAt(s, tokyo, 7), city, "cities as before");
  s.ps[0].pos = 37;
  const cash = s.ps[0].cash;
  s.forced = [2, 3];
  assert.ok(act(s, 0, {}));
  const move = s.events!.find((e) => e.t === "move" && e.p === 0);
  assert.equal(move && "salary" in move ? move.salary : 0, s.cfg.salary * 2);
  assert.ok(s.ps[0].cash >= cash + s.cfg.salary * 2 - 200, "the double salary was paid");
});

test("the travel boom puts all rent up by half for two rounds", () => {
  const s = game(2);
  const tokyo = at("tokyo");
  s.deeds[tokyo]!.owner = 1;
  const city = rentAt(s, tokyo, 7);
  worldEvent(s, "boom");
  assert.equal(rentAt(s, tokyo, 7), Math.round(city * 1.5));
});

test("no world event comes round again until all six have, then the bag starts again", () => {
  const s = game(2, 5);
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) ids.push(worldEvent(s)!);
  assert.equal(new Set(ids.slice(0, 6)).size, 6);
  assert.equal(new Set(ids.slice(6)).size, 6);
  // A new one ends the one in force first.
  const offs = worldEvents(s).filter((e) => !e.on);
  assert.equal(offs.length, 11);
});

test("without a world event, rent, building and the salary are as before (the same numbers as the step-3 rules)", () => {
  const s = game(3, 2);
  ownSet(s, 1, "paris", 2);
  for (const x of GROUP_SPACES[groupAt(at("paris"))!]) {
    assert.equal(rentAt(s, x, 7), s.cfg.rents[CITIES.find((c) => at(c.id) === x)!.id][3]);
    assert.equal(buildCost(s, x), houseCostAt(s, x));
  }
  // Even building, as before: on the ones with fewest, off the ones with most.
  const [a, b] = GROUP_SPACES[groupAt(at("paris"))!];
  s.deeds[a]!.houses = 3;
  assert.equal(canBuild(s, 1, a), false);
  assert.equal(canBuild(s, 1, b), true);
  assert.equal(canSell(s, 1, a), true);
  assert.equal(canSell(s, 1, b), false);
});

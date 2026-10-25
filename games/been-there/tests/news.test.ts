// Travel news: off unless the room switches it on; when on, a sourced piece every three rounds that
// changes one city's rules for two rounds.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOARD,
  NEWS,
  NEWS_EVERY,
  STYLES,
  act,
  configFor,
  decide,
  newBrain,
  newGame,
  priceOf,
  rentAt,
  runBots,
  whoMustAct,
  type GameEvent,
  type GameState,
} from "../src/engine";
import { tickNews } from "../src/engine/play";
import { random } from "../src/engine/rng";
import { Room, type RoomEnv } from "../src/room/room";

const at = (id: string) => BOARD.findIndex((sp) => sp.k === "city" && sp.id === id);
const brains = (n: number) => Array.from({ length: n }, (_, i) => newBrain(STYLES.balanced, i + 1));

function newsGame(n: number, seed: number): GameState {
  return newGame({ ...configFor({ n, mode: "target" }), news: true }, Array.from({ length: n }, (_, i) => `t${i}`), seed, { events: true });
}

/** Let the computer play until `stop` (or the game ends), collecting the news events with the turn they came on. */
function playUntil(s: GameState, stop: () => boolean) {
  const b = brains(s.ps.length);
  const news: { turns: number; e: Extract<GameEvent, { t: "news" }> }[] = [];
  for (let guard = 0; !s.over && !stop() && guard < 50_000; guard++) {
    const before = s.events!.length;
    const p = whoMustAct(s)[0];
    act(s, p, decide(s, p, b));
    for (const e of s.events!.slice(before)) if (e.t === "news") news.push({ turns: s.turns, e });
  }
  return news;
}

test("every piece of news is about a city in the game, says what it does, and has a source", () => {
  const ids = new Set(NEWS.map((n) => n.id));
  assert.equal(ids.size, NEWS.length);
  for (const n of NEWS) {
    assert.ok(n.cities.length > 0 && n.cities.every((c) => at(c) >= 0), n.id);
    assert.equal([n.rent, n.fee, n.buy].filter((x) => x !== undefined).length, 1, `${n.id}: exactly one effect`);
    for (const text of [n.title, n.text, n.basis]) assert.ok(text.zh && text.en, n.id);
    assert.match(n.source, /^https:\/\//, n.id);
  }
});

test("travel news is off unless the room switches it on, and then nothing changes", () => {
  const s = newGame(configFor({ n: 4, mode: "target" }), ["a", "b", "c", "d"], 9, { events: true });
  runBots(s, brains(4));
  assert.equal(s.news, null);
  assert.ok(!s.events!.some((e) => e.t === "news"));
});

test("with news on, a piece comes every three rounds and lasts two", () => {
  const s = newsGame(4, 5);
  const news = playUntil(s, () => s.turns >= 40);
  // Four teams: on at turns 12, 24, 36; each one over eight turns (two rounds) later.
  assert.deepEqual(
    news.map(({ turns, e }) => [turns, e.on]),
    [
      [12, true],
      [20, false],
      [24, true],
      [32, false],
      [36, true],
    ],
  );
  const ons = news.filter(({ e }) => e.on).map(({ e }) => e.id);
  assert.equal(new Set(ons).size, ons.length, "no repeats");
});

test("no piece of news comes round again until all of them have", () => {
  // Games end long before twelve pieces have come, so deal the deck at each news turn directly.
  const s = newsGame(2, 3);
  const ons: string[] = [];
  for (let i = 1; i <= NEWS.length * 2; i++) {
    s.turns = i * NEWS_EVERY * 2;
    tickNews(s);
    ons.push(s.news!.id);
  }
  assert.equal(new Set(ons.slice(0, NEWS.length)).size, NEWS.length);
  assert.equal(new Set(ons.slice(NEWS.length)).size, NEWS.length, "then the deck starts again");
});

test("a festival doubles the rent in its city; the monsoon halves Mumbai's", () => {
  const s = newsGame(2, 1);
  const tokyo = at("tokyo");
  const mumbai = at("mumbai");
  s.deeds[tokyo]!.owner = 1;
  s.deeds[mumbai]!.owner = 1;
  const base = [rentAt(s, tokyo, 0), rentAt(s, mumbai, 0)];
  s.news = { id: "sakura", until: 99 };
  assert.equal(rentAt(s, tokyo, 0), base[0] * 2);
  assert.equal(rentAt(s, mumbai, 0), base[1]);
  s.news = { id: "monsoon", until: 99 };
  assert.equal(rentAt(s, mumbai, 0), Math.round(base[1] / 2));
  // With the switch off, a stray piece of news does nothing.
  s.cfg.news = false;
  s.news = { id: "sakura", until: 99 };
  assert.equal(rentAt(s, tokyo, 0), base[0]);
});

test("Venice's access fee: a visiting team pays the bank $20 on landing; the owner doesn't", () => {
  const venice = at("venice");
  for (const owner of [1, 0]) {
    const s = newsGame(2, 1);
    s.deeds[venice]!.owner = owner;
    s.news = { id: "venicefee", until: 99 };
    s.ps[0].pos = venice - 5;
    s.forced = [2, 3];
    assert.ok(act(s, 0, {}));
    assert.equal(s.ps[0].pos, venice);
    const fee = s.events!.some((e) => e.t === "pay" && e.p === 0 && e.to === -1 && e.amount === 20);
    assert.equal(fee, owner !== 0, owner ? "visitor pays" : "owner doesn't");
  }
});

test("the Dubai Shopping Festival sells Dubai at 25% off", () => {
  const s = newsGame(2, 1);
  const dubai = at("dubai");
  s.news = { id: "dsf", until: 99 };
  s.ps[0].pos = dubai - 4;
  s.forced = [1, 3];
  assert.ok(act(s, 0, {}));
  // Dubai's own rule (a peek at the next cards) comes first.
  const b = brains(2);
  for (let guard = 0; s.pending?.k !== "buy" && guard < 10; guard++) act(s, whoMustAct(s)[0], decide(s, whoMustAct(s)[0], b));
  assert.equal(s.pending?.k, "buy");
  assert.equal((s.pending as { price: number }).price, Math.round(priceOf(s, dubai) * 0.75));
});

test("the lobby switch reaches the game", () => {
  const h = { seed: 1 };
  const env: RoomEnv = { now: () => 1_700_000_000_000, random: () => random(h) };
  for (const news of [false, true]) {
    const room = Room.create("1234", env);
    const id = "member-1-xxxxxxxx";
    assert.ok(room.join(id, "key-1-secret-xxxx", { name: "A" }));
    room.handle(id, { t: "team", op: "create" });
    room.handle(id, { t: "bot", op: "add", style: "balanced" });
    room.handle(id, { t: "settings", news });
    room.handle(id, { t: "start" });
    assert.equal(room.st.game?.s.cfg.news, news);
    assert.equal(room.view(id).settings.news, news);
  }
});

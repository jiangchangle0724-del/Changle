/* 一本正经 · In All Seriousness: the engine, the card bank and the two views. Run with `npx tsx tests/straightface.test.ts` */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CARDS, defaultPacks, PACK_AUDIENCE, PACKS } from "../src/data/straightface";
import { lintDeck, pickCard, validateCard, validateDeck } from "../src/shared/straightface/cards";
import { createGame, currentSpeaker, DEFAULT_OPTIONS, GameError, HONEST_CATCHUP_WEIGHT, leaderboard, privateView, publicView, reduce, roleOf, type Deps } from "../src/shared/straightface/engine";
import { mulberry32 } from "../src/shared/straightface/rng";
import type { Card, GameState, Player, RoundState, StraightFaceView } from "../src/shared/straightface/types";
import { roundLines } from "../src/shared/straightface/scoring";
import { freshRoom, RoomEngine } from "../src/shared/engine/room";
import { ONLINE_GAMES, ONLINE_MIN, type Action, type PenaltyEvent, type RoomEvent } from "../src/shared/protocol";

let failures = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  }
}
function throws(fn: () => void, pattern: RegExp | string, msg: string) {
  try {
    fn();
    ok(false, `${msg} (nothing thrown)`);
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    ok(e instanceof GameError && (pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern)), `${msg} (threw: ${text})`);
  }
}
function test(name: string, fn: () => void) {
  const before = failures;
  try {
    fn();
  } catch (e) {
    failures++;
    console.log("  THREW:", e);
  }
  console.log(`${failures === before ? "ok  " : "FAIL"} ${name}`);
}

const cards = CARDS;
const here = fileURLToPath(new URL("..", import.meta.url));
const deps: Deps = { cards };
const mk = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, seat: i }));

function toExplain(state: GameState): GameState {
  let s = reduce(state, { type: "START_ROUND", level: 2 }, deps);
  while (s.phase === "peek") s = reduce(s, { type: "PEEKED", playerId: s.current!.peekQueue[0] }, deps);
  return s;
}
function speakAll(state: GameState): GameState {
  let s = state;
  while (s.phase === "explain") s = reduce(s, { type: "NEXT_SPEAKER" }, deps);
  return s;
}
/** Everyone bets in phone order; `target(id)` picks whom each bettor bets on. */
function betAll(state: GameState, target: (id: string) => string): GameState {
  let s = state;
  while (s.phase === "bets") {
    const id = s.current!.betQueue[0];
    s = reduce(s, { type: "BET", playerId: id, targetId: target(id) }, deps);
  }
  return s;
}
const fakeRound = (i: number, judgeId: string, honestId: string, accusedId: string | null): RoundState => ({
  index: i,
  judgeId,
  honestId,
  cardId: cards[i].id,
  level: 2,
  peekQueue: [],
  peeked: [],
  speakOrder: [],
  speakerIdx: 0,
  suspectId: null,
  betQueue: [],
  bets: {},
  accusedId,
  result: null,
});

/* ---------- the card bank ---------- */

test("straightface: the card bank is valid, bilingual, sourced, has a fun fact everywhere and leaks nothing", () => {
  const errs = validateDeck(cards);
  ok(errs.length === 0, `validateDeck: ${errs.join("; ")}`);
  ok(cards.length >= 40, `${cards.length} cards`);
  const packs = new Set(cards.map((c) => c.pack));
  ok([...packs].sort().join() === [...PACKS].sort().join(), `packs: ${[...packs].join(",")}`);
  for (const c of cards) {
    ok(c.funFact.zh.length > 0 && c.funFact.en.length > 0, `${c.id} has a fun fact`);
    ok(c.source.length > 0, `${c.id} has a source`);
    // the term is shown to the whole table: no gloss in brackets
    ok(!/[（(]/.test(c.term.zh) && !/[（(]/.test(c.term.en), `${c.id}: no brackets in the term`);
  }
  ok(cards.filter((c) => c.adult).length === 0, "alcohol vocabulary is not adult content");
  const warns = lintDeck(cards);
  // every lint warning left is a name that repeats itself (蔡格尼克效应 / 蔡格尼克), not a gloss
  ok(warns.length <= 12, `lint warnings: ${warns.length}`);
});

test("straightface: validateCard requires funFact and source, refuses a bracketed gloss and a duplicate term", () => {
  const base = cards[0];
  ok(validateCard({ ...base, funFact: { zh: "", en: "" } }).some((e) => e.includes("funFact")), "missing funFact");
  ok(validateCard({ ...base, source: "" }).some((e) => e.includes("source")), "missing source");
  ok(validateCard({ ...base, source: "wikipedia" }).some((e) => e.includes("URL")), "a source that is not a URL");
  ok(validateCard({ ...base, term: { zh: "Mickey（一瓶酒）", en: "Mickey" } }).some((e) => e.includes("gloss")), "a bracketed gloss");
  ok(validateDeck([base, { ...base, id: "copy-of-first" }]).some((e) => e.includes("duplicate term")), "a duplicate term");
  const glossed: Card = { ...base, id: "glossed", term: { zh: "雨后泥土味 Petrichor", en: "Petrichor" } };
  ok(lintDeck([glossed]).length > 0, "lint flags a Chinese gloss");
  ok(lintDeck([base]).length === 0, "lint passes the plain term");
});

test("straightface: the bank holds 300 cards", () => {
  ok(cards.length >= 300, `${cards.length} cards`);
});

test("straightface: every pack has its table, its picture and enough cards; Chinese packs show the word with its reading, English packs the word itself", () => {
  for (const p of PACKS) {
    const deck = cards.filter((c) => c.pack === p);
    // fifteen: a game of nine from one pack never repeats a card, and every level has a few
    ok(deck.length >= 15, `${p}: ${deck.length} cards`);
    ok(["zh", "en", "both"].includes(PACK_AUDIENCE[p]), `${p} says which table it is for`);
    const art = join(here, "src/party/straightface/art/packs", `${p}.webp`);
    ok(existsSync(art) && statSync(art).size < 40_000, `${p} has a picture under 40 KB`);
    if (PACK_AUDIENCE[p] === "zh") {
      for (const c of deck) {
        ok(c.term.en.startsWith(c.term.zh) && c.term.en.length > c.term.zh.length, `${c.id}: the English side is the original characters plus a reading`);
        // every phone's font draws the basic CJK block; nothing rarer goes on the card
        ok([...c.term.zh].every((ch) => /[一-鿿A-Za-z0-9 ]/.test(ch)), `${c.id}: the card's characters are all in the basic CJK block`);
      }
    }
    if (PACK_AUDIENCE[p] === "en") for (const c of deck) ok(c.term.zh === c.term.en, `${c.id}: an English word is the same on both sides`);
  }
  for (const r of ["judge", "honest", "bluffer"]) ok(existsSync(join(here, "src/party/straightface/art/roles", `${r}.webp`)), `the ${r} is drawn`);
  ok(existsSync(join(here, "src/party/straightface/art/backdrop.webp")), "the room behind the game is drawn");
  const base = cards[0];
  const idiom: Card = { ...base, id: "idiom", term: { zh: "七月流火", en: "七月流火 qī yuè liú huǒ" }, definition: { zh: "七月流火说的是天要转凉。", en: "The heat is ending." } };
  ok(lintDeck([idiom]).length === 0, "a Chinese original may quote itself in its definition");
});

test("straightface: a Chinese table starts with the Chinese packs, an English table with the English ones, both with the packs any table can play", () => {
  const zh = defaultPacks("zh");
  const en = defaultPacks("en");
  ok(zh.every((p) => PACK_AUDIENCE[p] !== "en") && zh.some((p) => PACK_AUDIENCE[p] === "zh"), `zh: ${zh.join(",")}`);
  ok(en.every((p) => PACK_AUDIENCE[p] !== "zh") && en.some((p) => PACK_AUDIENCE[p] === "en"), `en: ${en.join(",")}`);
  ok(PACKS.filter((p) => PACK_AUDIENCE[p] === "both").every((p) => zh.includes(p) && en.includes(p)), "both tables get the packs for any table");
  // the public view says which pack the word came from (the picture on the card), nothing more
  const g = reduce(createGame(mk(4), { ...DEFAULT_OPTIONS, packs: ["chengyu"] }, 7), { type: "START_ROUND" }, deps);
  const pub = publicView(g, deps);
  ok(pub.pack === "chengyu", `the public view carries the pack (${pub.pack})`);
});

test("straightface: pickCard prefers the asked level, avoids used cards, falls back sanely, keeps adult cards out", () => {
  const rng = mulberry32(7);
  const used: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    const c = pickCard(cards, { level: 2, packs: [], used, allowAdult: true }, rng)!;
    ok(!used.includes(c.id), `fresh card ${c.id}`);
    used.push(c.id);
  }
  ok(pickCard(cards, { level: 2, packs: [], used, allowAdult: true }, rng) !== null, "a used-up deck still deals (reuse) instead of null");
  ok(pickCard(cards, { level: 2, packs: ["nope"], used: [], allowAdult: true }, rng) === null, "an empty pack deals nothing");
  const deck: Card[] = [
    { ...cards[1], id: "spicy", adult: true, level: 1 },
    { ...cards[1], id: "mild", level: 1, term: { zh: "Mild", en: "Mild" } },
  ];
  for (let i = 0; i < 50; i++) ok(pickCard(deck, { level: 1, packs: [], used: [], allowAdult: false }, rng)!.id === "mild", "adult stays out");
  const ids = new Set<string>();
  for (let i = 0; i < 50; i++) ids.add(pickCard(deck, { level: 1, packs: [], used: [], allowAdult: true }, rng)!.id);
  ok(ids.has("spicy"), "adult deals when allowed");
});

/* ---------- setup ---------- */

test("straightface: 3 to 9 players, deterministic for a seed, every player judges once per roundsPerPlayer", () => {
  throws(() => createGame(mk(2)), "player", "2 players refused");
  throws(() => createGame(mk(10)), "player", "10 players refused");
  ok(createGame(mk(3)).roundsPlanned === 3, "3 players: 3 rounds");
  ok(createGame(mk(9), { roundsPerPlayer: 2 }).roundsPlanned === 18, "9 players twice: 18 rounds");
  const a = toExplain(createGame(mk(5), {}, 42));
  const b = toExplain(createGame(mk(5), {}, 42));
  ok(JSON.stringify(a.current) === JSON.stringify(b.current), "same seed, same round");
  ok(new Set(createGame(mk(6), {}, 3).judgeOrder).size === 6, "judge order covers everyone");
});

/* ---------- a round ---------- */

test("straightface: one judge, one honest, the rest bluffers; honest is never the judge", () => {
  const s = reduce(createGame(mk(5), {}, 9), { type: "START_ROUND", level: 1 }, deps);
  const r = s.current!;
  ok(r.honestId !== r.judgeId, "honest is not the judge");
  const roles = mk(5).map((p) => roleOf(s, p.id));
  ok(roles.filter((x) => x === "judge").length === 1, "one judge");
  ok(roles.filter((x) => x === "honest").length === 1, "one honest");
  ok(roles.filter((x) => x === "bluffer").length === 3, "three bluffers");
});

test("straightface: honest is dealt with a soft catch-up (the one who never was gets it about half the time)", () => {
  let hits = 0;
  const trials = 400;
  for (let seedN = 1; seedN <= trials; seedN++) {
    const g = createGame(mk(5), { roundsPerPlayer: 2 }, seedN);
    const judge = g.judgeOrder[3];
    const others = g.players.map((p) => p.id).filter((id) => id !== judge);
    const fresh = others[0];
    // three rounds judged in turn, so the fourth judge is judgeOrder[3]; the fresh one was never honest
    const s: GameState = { ...g, phase: "between", rounds: [fakeRound(0, g.judgeOrder[0], others[1], null), fakeRound(1, g.judgeOrder[1], others[2], null), fakeRound(2, g.judgeOrder[2], others[3], null)] };
    if (reduce(s, { type: "START_ROUND" }, deps).current!.honestId === fresh) hits++;
  }
  const expected = HONEST_CATCHUP_WEIGHT / (HONEST_CATCHUP_WEIGHT + 3);
  const rate = hits / trials;
  ok(rate > expected - 0.1 && rate < expected + 0.1, `fresh player dealt honest ${Math.round(rate * 100)}% (expected about ${Math.round(expected * 100)}%)`);
});

test("straightface: pass mode goes round the table left of the judge; online peeks in any order", () => {
  const s = reduce(createGame(mk(5), {}, 9), { type: "START_ROUND" }, deps);
  const r = s.current!;
  const ids = s.players.map((p) => p.id);
  const j = ids.indexOf(r.judgeId);
  ok(r.peekQueue.join() === [...ids.slice(j + 1), ...ids.slice(0, j)].join(), "peek queue is seat order from the judge's left");
  ok(publicView(s, deps).phoneHolderId === r.peekQueue[0], "the TV knows who holds the phone");
  throws(() => reduce(s, { type: "PEEKED", playerId: r.peekQueue[1] }, deps), "phone should be with", "out-of-order peek refused");
  throws(() => reduce(s, { type: "PEEKED", playerId: r.judgeId }, deps), "judge", "the judge cannot peek");
  const o = reduce(createGame(mk(4), { mode: "online" }, 5), { type: "START_ROUND" }, deps);
  const q = o.current!.peekQueue;
  ok(publicView(o, deps).phoneHolderId === null, "online: no phone holder");
  let t = reduce(o, { type: "PEEKED", playerId: q[2] }, deps);
  t = reduce(t, { type: "PEEKED", playerId: q[0] }, deps);
  ok(t.phase === "peek", "online: still peeking after two");
  t = reduce(t, { type: "PEEKED", playerId: q[1] }, deps);
  ok(t.phase === "explain", "online: explain once all peeked");
});

test("straightface: speaking order is random, not seat order", () => {
  let differs = 0;
  for (let seedN = 1; seedN <= 30; seedN++) {
    const s = reduce(createGame(mk(6), {}, seedN), { type: "START_ROUND" }, deps);
    if (s.current!.speakOrder.join() !== s.current!.peekQueue.join()) differs++;
  }
  ok(differs > 25, `${differs}/30 seeds speak in an order other than seat order`);
});

test("straightface: explain → bets → accuse → reveal with scoring", () => {
  let s = toExplain(createGame(mk(5), {}, 11));
  ok(currentSpeaker(s) === null, "nobody speaks before the first NEXT_SPEAKER");
  ok(publicView(s, deps).phoneHolderId === s.current!.judgeId, "the judge holds the phone while people explain");
  s = reduce(s, { type: "NEXT_SPEAKER" }, deps);
  ok(currentSpeaker(s) === s.current!.speakOrder[0], "first speaker");
  const r = s.current!;
  const bluffer = r.speakOrder.find((id) => id !== r.honestId)!;
  s = reduce(s, { type: "TAG_SUSPECT", byPlayerId: r.judgeId, targetId: bluffer }, deps);
  throws(() => reduce(s, { type: "TAG_SUSPECT", byPlayerId: r.judgeId, targetId: r.honestId }, deps), "one tag", "one tag a round");
  ok(privateView(s, r.judgeId, deps).suspectId === bluffer, "the judge's view knows the tag");
  s = speakAll(s);
  ok(s.phase === "bets", "bets after the last speaker");
  s = betAll(s, (id) => r.speakOrder.find((x) => x !== id)!);
  ok(s.phase === "accuse", "accuse once everyone bet");
  s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.honestId }, deps);
  ok(s.phase === "reveal", "reveal after the accusation");
  const res = s.current!.result!;
  ok(res.outcome === "judge_right", "judge right");
  ok(res.deltas[r.judgeId] === r.level + 1, "judge: +L and +1 for the tag");
  ok(res.deltas[r.honestId] === r.level, "honest: +L");
  ok((res.deltas[bluffer] ?? 0) <= 0, "tagged bluffer: not above 0");
  ok(s.scores[r.judgeId] === r.level + 1, "scores carry the deltas");
});

test("straightface: pass-mode bets go round the table and mayBetNow follows the phone; online bets in any order", () => {
  let s = speakAll(toExplain(createGame(mk(5), {}, 17)));
  const r = s.current!;
  const ids = s.players.map((p) => p.id);
  const j = ids.indexOf(r.judgeId);
  ok(r.betQueue.join() === [...ids.slice(j + 1), ...ids.slice(0, j)].join(), "bet queue is seat order from the judge's left");
  const [first, second] = r.betQueue;
  ok(privateView(s, first, deps).mayBetNow && !privateView(s, second, deps).mayBetNow, "only the phone holder may bet now");
  ok(publicView(s, deps).phoneHolderId === first, "the TV knows who holds the phone to bet");
  throws(() => reduce(s, { type: "BET", playerId: second, targetId: first }, deps), "phone should be with", "out-of-order bet refused");
  s = reduce(s, { type: "BET", playerId: first, targetId: second }, deps);
  throws(() => reduce(s, { type: "BET", playerId: first, targetId: second }, deps), /already/, "a second bet by the same player refused");
  ok(privateView(s, second, deps).mayBetNow && publicView(s, deps).phoneHolderId === second, "the phone moves on");
  let o = reduce(createGame(mk(4), { mode: "online" }, 18), { type: "START_ROUND" }, deps);
  while (o.phase === "peek") o = reduce(o, { type: "PEEKED", playerId: o.current!.peekQueue[0] }, deps);
  o = speakAll(o);
  const q = o.current!.betQueue;
  o = reduce(o, { type: "BET", playerId: q[2], targetId: q[0] }, deps);
  o = reduce(o, { type: "BET", playerId: q[0], targetId: q[1] }, deps);
  ok(o.phase === "bets", "online: still betting after two");
  o = reduce(o, { type: "BET", playerId: q[1], targetId: q[0] }, deps);
  ok(o.phase === "accuse", "online: accuse once all bet");
});

test("straightface: a wrong accusation pays the bluffer, the judge nothing, and penalties go out", () => {
  let s = toExplain(createGame(mk(4), {}, 12));
  const r = s.current!;
  const bluffer = r.speakOrder.find((id) => id !== r.honestId)!;
  s = speakAll(s);
  s = reduce(s, { type: "CLOSE_BETS", byPlayerId: r.judgeId }, deps);
  s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: bluffer }, deps);
  const res = s.current!.result!;
  ok(res.outcome === "judge_wrong", "judge wrong");
  ok(res.deltas[bluffer] === r.level && res.deltas[r.judgeId] === 0 && res.deltas[r.honestId] === 0, "bluffer +L, judge 0, honest 0");
  ok(res.penalties.some((p) => p.playerId === r.judgeId && p.why === "fooled"), "the fooled judge drinks");
  ok(res.penalties.some((p) => p.playerId === bluffer && p.why === "master"), "the master bluffer hands out a drink");
});

test("straightface: tagging the honest player costs the judge 2, and the tagged player cannot be accused", () => {
  let s = toExplain(createGame(mk(4), {}, 13));
  const r = s.current!;
  const bluffer = r.speakOrder.find((id) => id !== r.honestId)!;
  s = reduce(s, { type: "NEXT_SPEAKER" }, deps);
  s = reduce(s, { type: "TAG_SUSPECT", byPlayerId: r.judgeId, targetId: r.honestId }, deps);
  s = speakAll(s);
  s = reduce(s, { type: "CLOSE_BETS", byPlayerId: r.judgeId }, deps);
  throws(() => reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.honestId }, deps), "tagged", "no hedging: the tagged one cannot be accused");
  s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: bluffer }, deps);
  ok(s.current!.result!.deltas[r.judgeId] === -2, "judge −2");
  ok(s.current!.result!.deltas[bluffer] === r.level, "accused bluffer +L");
});

test("straightface: side bets pay 1 to each correct bettor and ignore the honest player's own bet", () => {
  let s = toExplain(createGame(mk(5), {}, 14));
  const r = s.current!;
  s = speakAll(s);
  s = betAll(s, (id) => (id === r.honestId ? r.speakOrder.find((x) => x !== id)! : r.honestId));
  s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.honestId }, deps);
  const d = s.current!.result!.deltas;
  for (const id of r.speakOrder) if (id !== r.honestId) ok(d[id] === 1, `${id} +1 for the bet`);
  ok(d[r.honestId] === r.level, "the honest player's own bet earns nothing extra");
});

test("straightface: the reveal's preLines never say who was honest; lines carry the points", () => {
  let s = toExplain(createGame(mk(5), {}, 24));
  const r = s.current!;
  const bluffer = r.speakOrder.find((id) => id !== r.honestId)!;
  s = reduce(s, { type: "NEXT_SPEAKER" }, deps);
  s = reduce(s, { type: "TAG_SUSPECT", byPlayerId: r.judgeId, targetId: bluffer }, deps);
  s = speakAll(s);
  s = betAll(s, (id) => r.speakOrder.find((x) => x !== id)!);
  s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.honestId }, deps);
  const res = s.current!.result!;
  ok(res.preLines.length === 3, "accused, tag, bets");
  for (const l of res.preLines) {
    ok(!l.zh.includes("老实人") && !l.zh.includes("看穿") && !l.zh.includes("骗过"), `zh preLine gives nothing away: ${l.zh}`);
    ok(!l.en.toLowerCase().includes("honest"), `en preLine gives nothing away: ${l.en}`);
  }
  ok(res.lines.length === 3, "verdict, tag result, bet result");
  ok(res.lines[0].zh.includes(`+${r.level}`), "the verdict line carries the points");
});

test("straightface: 3 players skip the bets; guards hold", () => {
  let s = speakAll(toExplain(createGame(mk(3), {}, 15)));
  ok(s.phase === "accuse", "3 players: straight to accuse");
  s = toExplain(createGame(mk(5), {}, 16));
  const r = s.current!;
  const other = r.speakOrder[0];
  throws(() => reduce(s, { type: "TAG_SUSPECT", byPlayerId: other, targetId: r.speakOrder[1] }, deps), "only the judge", "a non-judge cannot tag");
  s = speakAll(s);
  throws(() => reduce(s, { type: "BET", playerId: r.judgeId, targetId: other }, deps), "judge", "the judge cannot bet");
  throws(() => reduce(s, { type: "BET", playerId: other, targetId: other }, deps), "another", "nobody bets on themselves");
  throws(() => reduce(s, { type: "ACCUSE", byPlayerId: other, targetId: r.honestId }, deps), "only the judge", "a non-judge cannot accuse");
  throws(() => reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.judgeId }, deps), "accuse a speaker", "the judge cannot accuse themselves");
});

test("straightface: NEXT_ROUND twice is refused, START_ROUND from reveal is refused, between → the next round", () => {
  let s = speakAll(toExplain(createGame(mk(4), {}, 25)));
  const r = s.current!;
  s = reduce(s, { type: "CLOSE_BETS", byPlayerId: r.judgeId }, deps);
  s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.speakOrder[0] }, deps);
  throws(() => reduce(s, { type: "START_ROUND" }, deps), "not allowed in reveal", "no new round straight from the reveal");
  s = reduce(s, { type: "NEXT_ROUND" }, deps);
  ok(s.phase === "between" && s.rounds.length === 1, "the round is recorded once");
  ok(publicView(s, deps).reveal?.honestId === r.honestId, "the reveal stays on screen in between");
  throws(() => reduce(s, { type: "NEXT_ROUND" }, deps), "not allowed in between", "a double tap is refused");
  const t = reduce(s, { type: "START_ROUND" }, deps);
  ok(t.current!.index === 1 && t.current!.judgeId === t.judgeOrder[1] && t.current!.judgeId !== r.judgeId, "the next round has the next judge");
});

/* ---------- the views never leak ---------- */

test("straightface: the public view has no roles, no definition, no honest id before the reveal", () => {
  let s = toExplain(createGame(mk(5), {}, 21));
  const json = JSON.stringify(publicView(s, deps));
  ok(!json.includes('"honestId"') && !json.includes('"suspectId"'), "no honest id, no tag in the public view");
  ok(!json.includes(cards.find((c) => c.id === s.current!.cardId)!.definition.zh), "no definition in the public view");
  ok(publicView(s, deps).term !== null, "the term is public");
  s = speakAll(s);
  const r = s.current!;
  s = reduce(s, { type: "CLOSE_BETS", byPlayerId: r.judgeId }, deps);
  s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.speakOrder[0] }, deps);
  const reveal = publicView(s, deps).reveal!;
  ok(reveal.honestId === r.honestId && reveal.funFact.zh.length > 0, "the reveal carries the honest player and the fun fact");
});

test("straightface: a bluffer never sees the definition, the honest never sees seeds, nobody sees a part before their turn", () => {
  let s = reduce(createGame(mk(5), {}, 22), { type: "START_ROUND" }, deps);
  const r = s.current!;
  const first = r.peekQueue[0];
  const second = r.peekQueue[1];
  ok(privateView(s, first, deps).mayPeekNow && privateView(s, first, deps).role !== null, "the one holding the phone may peek and sees their part");
  ok(!privateView(s, second, deps).mayPeekNow && privateView(s, second, deps).role === null && privateView(s, second, deps).definition === null, "the next in line sees nothing yet");
  ok(privateView(s, first, deps).definition !== null === (first === r.honestId), "the definition shows to the holder only if honest");
  while (s.phase === "peek") s = reduce(s, { type: "PEEKED", playerId: s.current!.peekQueue[0] }, deps);
  for (const p of s.players) {
    const v = privateView(s, p.id, deps);
    ok(v.level === r.level, "every phone knows the level");
    if (p.id === r.honestId) ok(v.definition !== null && v.bluffSeeds === null, "honest: definition, no seeds");
    else if (p.id === r.judgeId) ok(v.role === "judge" && v.definition === null && v.canTag, "judge: no definition, may tag");
    else ok(v.role === "bluffer" && v.definition === null && v.bluffSeeds?.length === 2, "bluffer: two seeds, no definition");
    if (p.id !== r.judgeId) ok(v.suspectId === null, "only the judge sees the tag");
  }
  let e = reduce(createGame(mk(4), { bluffSeeds: false }, 23), { type: "START_ROUND" }, deps);
  while (e.phase === "peek") e = reduce(e, { type: "PEEKED", playerId: e.current!.peekQueue[0] }, deps);
  const bluffer = e.current!.speakOrder.find((id) => id !== e.current!.honestId)!;
  ok(privateView(e, bluffer, deps).bluffSeeds === null, "expert mode: no seeds");
});

test("straightface: every phase × every role × both modes leaks nothing to the wrong phone", () => {
  for (const mode of ["pass", "online"] as const) {
    for (let seedN = 1; seedN <= 6; seedN++) {
      let s = reduce(createGame(mk(5), { mode }, 100 + seedN), { type: "START_ROUND", level: ((seedN % 3) + 1) as 1 | 2 | 3 }, deps);
      const r = s.current!;
      const card = cards.find((c) => c.id === r.cardId)!;
      const check = (label: string) => {
        for (const p of s.players) {
          const v = privateView(s, p.id, deps);
          const json = JSON.stringify(v);
          const revealed = ["reveal", "between", "finished"].includes(s.phase);
          if (p.id !== r.honestId && !revealed) ok(!json.includes(card.definition.zh) && !json.includes(card.definition.en), `${mode} ${label}: ${p.id} never sees the definition`);
          if (p.id !== r.judgeId) ok(v.suspectId === null, `${mode} ${label}: ${p.id} never sees the tag`);
          ok(!("honestId" in (v as unknown as Record<string, unknown>)), `${mode} ${label}: no honestId field on a phone`);
        }
        const pub = JSON.stringify(publicView(s, deps));
        if (!["reveal", "between", "finished"].includes(s.phase)) ok(!pub.includes('"honestId"') && !pub.includes(card.definition.zh), `${mode} ${label}: the TV is blind until the reveal`);
      };
      check("peek");
      while (s.phase === "peek") s = reduce(s, { type: "PEEKED", playerId: s.current!.peekQueue[0] }, deps);
      check("explain");
      s = reduce(s, { type: "NEXT_SPEAKER" }, deps);
      s = reduce(s, { type: "TAG_SUSPECT", byPlayerId: r.judgeId, targetId: r.speakOrder[1] }, deps);
      check("explain+tag");
      s = speakAll(s);
      check("bets");
      s = reduce(s, { type: "CLOSE_BETS", byPlayerId: r.judgeId }, deps);
      check("accuse");
      s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.speakOrder[0] }, deps);
      check("reveal");
    }
  }
});

/* ---------- a whole game ---------- */

test("straightface: a whole game rotates the judge, never repeats a card, ends finished", () => {
  let s = createGame(mk(6), {}, 31);
  const judges: string[] = [];
  const used = new Set<string>();
  while (s.phase !== "finished") {
    s = reduce(s, { type: "START_ROUND", level: ((judges.length % 3) + 1) as 1 | 2 | 3 }, deps);
    const r = s.current!;
    judges.push(r.judgeId);
    ok(!used.has(r.cardId), `card ${r.cardId} not dealt twice`);
    used.add(r.cardId);
    while (s.phase === "peek") s = reduce(s, { type: "PEEKED", playerId: s.current!.peekQueue[0] }, deps);
    s = speakAll(s);
    if (s.phase === "bets") s = reduce(s, { type: "CLOSE_BETS", byPlayerId: r.judgeId }, deps);
    s = reduce(s, { type: "ACCUSE", byPlayerId: r.judgeId, targetId: r.speakOrder[0] }, deps);
    s = reduce(s, { type: "NEXT_ROUND" }, deps);
  }
  ok(judges.length === 6 && new Set(judges).size === 6, "every player judged once");
  ok(s.rounds.length === 6, "six rounds recorded");
  ok(Object.values(s.scores).reduce((a, b) => a + b, 0) > 0, "points were scored");
  const board = leaderboard(s);
  ok(board[0].score >= board[5].score && board[0].place === 1, "the leaderboard is sorted");
  throws(() => reduce(s, { type: "START_ROUND" }, deps), "", "no round after the last");
});

test("straightface: the leaderboard breaks ties by who fooled the judge more, then shares the place", () => {
  const g = createGame(mk(4), {}, 32);
  const [a, b, c, d] = g.players.map((p) => p.id);
  // a and b both on 2 points; a fooled a judge once, b never did; c and d tied on 0 with nothing to split them
  const s: GameState = { ...g, phase: "finished", scores: { [a]: 2, [b]: 2, [c]: 0, [d]: 0 }, rounds: [fakeRound(0, c, d, a), fakeRound(1, d, b, b)] };
  const board = leaderboard(s);
  ok(board.map((x) => x.id).join() === [a, b, c, d].join(), `order: ${board.map((x) => x.id).join()}`);
  ok(board.map((x) => x.place).join() === "1,2,3,3", `places: ${board.map((x) => x.place).join()}`);
  ok(board[0].fooled === 1, "the tie-break counted");
});

/* ---------- online: the same engine behind the rooms server (src/shared/engine/games/straightface.ts) ---------- */

let clock = 1_000_000;
let roomSeed = 11;
const roomHost = { now: () => clock, rand: () => ((roomSeed = (roomSeed * 16807) % 2147483647) / 2147483647) };
const NAMES = ["Amy", "Ben", "Cat", "Dan", "Eve", "Fay", "Gus", "Hal", "Ivy", "Jo"];

/** A table of n phones at one room, the first one hosting. */
function table(n: number) {
  const eng = new RoomEngine(freshRoom("SFON", clock), roomHost);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  ok(eng.hello(ids[0], NAMES[0], true) === null, "the host opens the table");
  ids.slice(1).forEach((id, i) => ok(eng.hello(id, NAMES[i + 1], false) === null, `${id} sits down`));
  eng.flush();
  const events: RoomEvent[] = [];
  const act = (pid: string, a: Action) => {
    eng.act(pid, a);
    const o = eng.flush();
    events.push(...o.events);
    return o;
  };
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => act(pid, { a: "g", g: { x, ...rest } });
  const view = (pid: string) => eng.view(pid).game as StraightFaceView;
  const advance = (ms: number) => {
    clock += ms;
    eng.due();
    events.push(...eng.flush().events);
  };
  const pens = () => events.filter((e): e is PenaltyEvent => e.k === "penalty");
  /** who has which part this round, as their own phones say */
  const parts = () => {
    const v = view(ids[0]);
    const judge = v.table?.judgeId ?? "";
    const inGame = v.players;
    const honest = inGame.find((id) => view(id).me?.role === "honest") ?? "";
    return { judge, honest, bluffers: inGame.filter((id) => id !== judge && id !== honest) };
  };
  return { eng, ids, act, g, view, advance, events, pens, parts };
}
type Table = ReturnType<typeof table>;

function dealOnline(t: Table, packs = ["trivia", "food", "vancouver"]) {
  t.act(t.ids[0], { a: "start", game: "straightface" });
  t.g(t.ids[0], "config", { packs });
  t.g(t.ids[0], "deal");
}
function peekAll(t: Table) {
  for (const id of t.view(t.ids[0]).players) t.g(id, "peeked");
}
function speakOnline(t: Table) {
  const { judge } = t.parts();
  for (let i = 0; i < 12 && t.view(judge).phase === "explain"; i++) t.g(judge, "next", { at: t.eng.view(judge).game && (t.eng.d.game!.s as { g: GameState }).g.current!.speakerIdx });
}

const DRINKS = (x: { zh: string; en: string } | undefined) => !!x && (/喝(?!醉)|酒|干杯/.test(x.zh) || /\b(drinks?|drank|drinking|sips?|glass|downs?)\b/i.test(x.en));

test("straightface online: on the board, the host deals, everyone reads their own part at once", () => {
  ok(ONLINE_GAMES.includes("straightface") && ONLINE_MIN.straightface === 3, "an online game for three or more");
  const t = table(5);
  dealOnline(t);
  const v = t.view("p1");
  ok(v.phase === "peek" && v.players.length === 5 && !!v.table?.term, `dealt: ${v.phase}`);
  const { judge, honest, bluffers } = t.parts();
  ok(!!judge && !!honest && bluffers.length === 3, "one judge, one honest, three bluffers");
  const card = CARDS.find((c) => c.term.zh === v.table!.term!.zh)!;
  ok(!!card && ["trivia", "food", "vancouver"].includes(card.pack), `dealt from the packs the host picked (${card?.pack})`);
  ok(t.view(honest).me?.definition?.en === card.definition.en, "the honest phone has the real meaning straight away (no queue online)");
  for (const id of [judge, ...bluffers]) ok(!JSON.stringify(t.view(id)).includes(card.definition.en), `${id}'s phone never carries the real meaning`);
  for (const id of bluffers) ok(t.view(id).me?.role === "bluffer" && (t.view(id).me?.bluffSeeds?.length ?? 0) === 2, `${id} bluffs, with two seeds`);
  ok(t.view(judge).me?.role === "judge" && t.view(judge).me?.definition === null, "the judge knows only the word");
  const tv = t.view("tv-somewhere");
  ok(tv.me === null && tv.table?.reveal === null && tv.facts === null && !JSON.stringify(tv).includes(card.definition.en), "a big screen: the word, nobody's part, nothing of who is honest");
  ok(!JSON.stringify(t.eng.view("p1")).includes(`"seed"`), "the deal's seed stays on the server");
  // got it: once all four have, the explanations start; a second tap is nothing
  const before = t.view(judge).stepAt;
  clock += 1000;
  t.g(bluffers[0], "peeked");
  ok(t.view(judge).table?.peekedCount === 1, "one ready");
  t.g(bluffers[0], "peeked");
  ok(t.view(judge).table?.peekedCount === 1, "a second tap counts once");
  t.g(judge, "peeked");
  ok(t.view(judge).table?.peekedCount === 1, "the judge has nothing to read");
  for (const id of [honest, ...bluffers.slice(1)]) t.g(id, "peeked");
  ok(t.view(judge).phase === "explain" && t.view(judge).stepAt > before, "everyone has read theirs: explaining, a new clock");
  ok(t.view(honest).me?.definition?.en === card.definition.en, "the honest one can still look at it while explaining");
});

test("straightface online: the host can start without the slow ones; who may press what", () => {
  const t = table(4);
  dealOnline(t);
  const { judge, honest, bluffers } = t.parts();
  t.g([judge, honest, ...bluffers].find((id) => id !== "p0")!, "force");
  ok(t.view(judge).phase === "peek", "only the host forces the start");
  t.g("p0", "force");
  ok(t.view(judge).phase === "explain", "the host starts the explanations");
  ok(t.view(honest).me?.definition !== null, "whoever hadn't pressed got it still has their part");
  // before the first speaker, the judge (or the host) starts; a speaker can't
  const sp = () => (t.eng.d.game!.s as { g: GameState }).g.current!.speakerIdx;
  const order = t.view(judge).table!.speakOrder;
  const notHostOrJudge = order.find((id) => id !== "p0") ?? order[0];
  if (notHostOrJudge !== judge && notHostOrJudge !== "p0") {
    t.g(notHostOrJudge, "next", { at: -1 });
    ok(sp() === -1, "a speaker can't start the explanations");
  }
  t.g(judge, "next", { at: 7 });
  ok(sp() === -1, "a press for another speaker moves nothing");
  t.g(judge, "next", { at: -1 });
  ok(sp() === 0 && t.view(judge).table?.speakerId === order[0], "the judge starts: the first speaker is up");
  // the one speaking says done, the judge presses next at the same moment: one step
  t.g(order[0], "next", { at: 0 });
  t.g(judge, "next", { at: 0 });
  ok(sp() === 1, `two presses for the same speaker move on once (${sp()})`);
  // the tag: the judge's, once, on a speaker; nobody else sees it
  t.g(order[1], "tag", { target: order[0] });
  ok(t.view(judge).me?.suspectId === null, "only the judge tags");
  t.g(judge, "tag", { target: order[0] });
  ok(t.view(judge).me?.suspectId === order[0], "the judge tagged");
  ok(!JSON.stringify(t.view(order[1])).includes(`"suspectId":"${order[0]}"`) && t.view("tv").me === null, "the tag stays on the judge's phone");
  t.g(judge, "tag", { target: order[1] });
  ok(t.view(judge).me?.suspectId === order[0], "one tag a round");
  ok(bluffers.length === 2, "four players: two bluffers");
});

test("straightface online: bets at once, the judge's verdict, penalties after the reveal, the master bluffer's pick", () => {
  const t = table(5);
  dealOnline(t);
  peekAll(t);
  const { judge, honest, bluffers } = t.parts();
  speakOnline(t);
  ok(t.view(judge).phase === "bets", `five players: side bets (${t.view(judge).phase})`);
  t.g(judge, "bet", { target: honest });
  ok(t.view(judge).table?.betsPlaced === 0, "the judge doesn't bet");
  t.g(bluffers[0], "bet", { target: bluffers[0] });
  ok(t.view(judge).table?.betsPlaced === 0, "nobody bets on themselves");
  t.g(bluffers[0], "bet", { target: honest });
  t.g(bluffers[0], "bet", { target: bluffers[1] });
  ok(t.view(judge).table?.betsPlaced === 1, "one bet each");
  ok(t.view(judge).facts === null && !JSON.stringify(t.view(judge)).includes(`"bets":{"${bluffers[0]}"`), "bets stay secret until the reveal");
  t.g(bluffers[1], "close");
  ok(t.view(judge).phase === "bets", "only the judge (or the host) stops the bets");
  // the judge names a bluffer: fooled
  t.g(bluffers[0], "accuse", { target: bluffers[1] });
  ok(t.view(judge).phase === "bets", "only the judge accuses");
  t.g(judge, "accuse", { target: bluffers[1] });
  const v = t.view(judge);
  ok(v.phase === "reveal" && v.facts?.accusedId === bluffers[1] && v.facts?.honestId === honest, "the reveal: who was named, who was honest");
  ok(v.table?.reveal?.result.lines.length === 0 && v.table?.reveal?.result.penalties.length === 0, "no server wording in the view (each phone words it with names)");
  const lines = roundLines(v.facts!, (id) => NAMES[Number(id.slice(1))]);
  ok(lines.preLines[0].en.includes(NAMES[Number(judge.slice(1))]) && lines.lines[0].en.includes("fooled"), `worded with the names: ${lines.lines[0].en}`);
  ok(v.table!.scores[bluffers[1]] === v.facts!.level, "the named bluffer scored");
  ok(t.pens().length === 0, "no penalty before every phone has shown the honest one");
  t.advance(4500);
  const fooled = t.pens().find((p) => p.who.includes(judge));
  ok(!!fooled && !DRINKS(fooled.note) && fooled.kind === "sip", "then the fooled judge's penalty");
  ok(v.master === bluffers[1] && t.view(honest).master === bluffers[1], "the bluffer who fooled the judge picks someone");
  // the round can't move on under the pick, except by the host
  if (judge !== "p0") {
    t.g(judge, "round");
    ok(t.view(judge).phase === "reveal", "the judge waits for the pick");
  }
  t.g(bluffers[0], "pick", { target: honest });
  ok(t.view(judge).master === bluffers[1], "only the master bluffer picks");
  t.g(bluffers[1], "pick", { target: bluffers[1] });
  ok(t.view(judge).master === bluffers[1], "not themselves");
  const n = t.pens().length;
  t.g(bluffers[1], "pick", { target: honest });
  ok(t.pens().length === n + 1 && t.pens()[n].who.join() === honest && !DRINKS(t.pens()[n].note), "the pick lands on the one picked");
  ok(t.view(judge).master === null && t.view(judge).picked === honest, "picked, once");
  t.g(bluffers[1], "pick", { target: judge });
  ok(t.pens().length === n + 1, "a second pick is nothing");
  // the judge moves on; the next judge (or the host) starts the next round
  if (judge !== "p0") t.g(judge, "round");
  else t.g("p0", "round");
  const b = t.view(judge);
  ok(b.phase === "between" && !!b.nextJudge && b.nextJudge !== judge, `between rounds, the next judge: ${b.nextJudge}`);
  const someoneElse = t.ids.find((id) => id !== b.nextJudge && id !== "p0")!;
  t.g(someoneElse, "start");
  ok(t.view(judge).phase === "between", "not anyone's to start");
  t.g("p0", "config", { level: 3 });
  t.g(b.nextJudge!, "start");
  const r2 = t.view(judge);
  ok(r2.phase === "peek" && r2.table?.judgeId === b.nextJudge && r2.table?.roundNumber === 2, "round two, its judge up");
  ok(r2.table?.level === 3 || CARDS.filter((c) => c.level === 3 && ["trivia", "food", "vancouver"].includes(c.pack)).length < 2, "dealt at the difficulty the host set");
});

test("straightface online: with the table's own penalty, nothing says drink; a right judge, a tag on a bluffer", () => {
  const t = table(4);
  t.act("p0", { a: "penalty", text: "做十个深蹲" });
  dealOnline(t);
  peekAll(t);
  const { judge, honest, bluffers } = t.parts();
  const sp = () => (t.eng.d.game!.s as { g: GameState }).g.current!.speakerIdx;
  t.g(judge, "next", { at: -1 });
  t.g(judge, "tag", { target: bluffers[0] });
  while (t.view(judge).phase === "explain") t.g(judge, "next", { at: sp() });
  t.g(judge, "close");
  t.g(judge, "accuse", { target: bluffers[0] });
  ok(t.view(judge).phase !== "reveal", "the tagged one can't be named");
  t.g(judge, "accuse", { target: honest });
  ok(t.view(judge).phase === "reveal" && t.view(judge).master === null, "a right judge: nobody to pick");
  t.advance(4500);
  const caught = t.pens().find((p) => p.who.includes(bluffers[0]));
  ok(!!caught && !DRINKS(caught.note), `the tagged bluffer's penalty, no drinking in it (${caught?.note?.en})`);
  ok(t.pens().every((p) => !DRINKS(p.note)), "no note says drink");
  ok(!JSON.stringify(t.view(judge)).match(/喝一口|Drink\./), "no drinking line anywhere in the view");
});

test("straightface online: someone leaves: a bluffer drops out, a round that needs them is dealt again, too few ends it", () => {
  // a bluffer who is speaking leaves: the next one is up, and the bets don't wait for them
  let t = table(5);
  dealOnline(t);
  peekAll(t);
  let p = t.parts();
  const sp = () => (t.eng.d.game!.s as { g: GameState }).g.current!.speakerIdx;
  t.g(p.judge, "next", { at: -1 });
  const order = t.view(p.judge).table!.speakOrder;
  const leaver = order.find((id) => id !== "p0" && id !== p.honest)!;
  while (t.view(p.judge).table!.speakerId !== leaver) t.g(p.judge, "next", { at: sp() });
  const after = order[order.indexOf(leaver) + 1] ?? null;
  t.act(leaver, { a: "leave" });
  const v = t.view(p.judge);
  ok(!v.players.includes(leaver) && !v.table!.speakOrder.includes(leaver), "out of the game");
  ok(after ? v.table!.speakerId === after : v.phase !== "explain", "whoever was after them is up");
  ok(v.table!.roundsPlanned === 4, `four judges left: four rounds (${v.table!.roundsPlanned})`);
  // the judge leaves mid-round (the host can too: the table gets a new host): called off, dealt again
  t = table(5);
  dealOnline(t);
  p = t.parts();
  const firstCard = t.view("p1").table!.term!.zh;
  t.act(p.judge, { a: "leave" });
  const still = t.ids.find((id) => id !== p.judge)!;
  const w = t.view(still);
  ok(w.phase === "lobby" && w.nextJudge !== null && w.nextJudge !== p.judge && !w.players.includes(p.judge), `the judge left: the round is off, someone else judges next (${w.phase})`);
  t.g(t.eng.view(still).host, "start");
  ok(t.view(still).phase === "peek" && t.view(still).table!.term!.zh !== firstCard && t.view(still).table!.judgeId === w.nextJudge, "a new card, the next judge");
  // the honest one leaves: called off too, and the same judge deals again
  t = table(4);
  dealOnline(t);
  p = t.parts();
  t.act(p.honest, { a: "leave" });
  ok(t.view(p.judge).phase === "lobby", "the honest one left: the round is off");
  ok(t.view(p.judge).nextJudge === p.judge, "the same judge again");
  // down to two: the game is over
  t = table(3);
  dealOnline(t);
  const gone = t.ids.find((id) => id !== "p0")!;
  t.act(gone, { a: "leave" });
  ok(t.view("p0").phase === "finished", "two left: game over");
  t.g("p0", "again");
  ok(t.view("p0").phase === "setup", "the host goes again from the setup");
});

test("straightface online: a seat that only watches is no part of it; a whole game, everyone judges once", () => {
  const t = table(5);
  t.act("p3", { a: "watch", on: true });
  dealOnline(t);
  const v = t.view("p3");
  ok(!v.players.includes("p3") && v.me === null && v.players.length === 4, "the watcher isn't dealt in");
  t.g("p3", "peeked");
  ok(t.view("p0").table!.peekedCount === 0, "and makes no moves");
  const judges: string[] = [];
  for (let round = 0; round < 6 && t.view("p0").phase !== "finished"; round++) {
    const p = t.parts();
    judges.push(p.judge);
    peekAll(t);
    speakOnline(t);
    if (t.view(p.judge).phase === "bets") for (const id of t.view(p.judge).table!.speakOrder) t.g(id, "bet", { target: p.honest === id ? p.bluffers[0] : p.honest });
    t.g(p.judge, "accuse", { target: p.bluffers[0] });
    if (t.view(p.judge).master) t.g("p0", "round");
    else t.g(p.judge, "round");
    if (t.view("p0").phase === "between") t.g("p0", "start");
  }
  const end = t.view("p0");
  ok(end.phase === "finished" && new Set(judges).size === 4 && judges.length === 4, `four rounds, four judges (${judges.join()})`);
  ok(end.learned?.length === 4 && end.learned.every((l) => !!l.term.zh && !!l.definition.en), "the end: every word played, with its meaning");
  ok(Object.keys(end.table!.scores).length === 4, "a score for each of the four");
});

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall good");

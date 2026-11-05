/* 一本正经 · Straight Face: the engine, the card bank and the two views. Run with `npx tsx tests/straightface.test.ts` */
import { CARDS, PACKS } from "../src/data/straightface";
import { lintDeck, pickCard, validateCard, validateDeck } from "../src/shared/straightface/cards";
import { createGame, currentSpeaker, GameError, HONEST_CATCHUP_WEIGHT, leaderboard, privateView, publicView, reduce, roleOf, type Deps } from "../src/shared/straightface/engine";
import { mulberry32 } from "../src/shared/straightface/rng";
import type { Card, GameState, Player, RoundState } from "../src/shared/straightface/types";

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

test("straightface: the Chinese packs show the original word on both sides, may quote it, and each has enough cards", () => {
  for (const p of ["zi", "fangyan", "chengyu", "caiming"]) {
    const deck = cards.filter((c) => c.pack === p);
    ok(deck.length >= 12, `${p}: ${deck.length} cards`);
    for (const c of deck) {
      ok(c.term.en.startsWith(c.term.zh) && c.term.en.length > c.term.zh.length, `${c.id}: the English side is the original characters plus a reading`);
      // every phone's font draws the basic CJK block; nothing rarer goes on the card
      ok([...c.term.zh].every((ch) => /[一-鿿]/.test(ch)), `${c.id}: the card's characters are all in the basic CJK block`);
    }
  }
  const base = cards[0];
  const idiom: Card = { ...base, id: "idiom", term: { zh: "七月流火", en: "七月流火 qī yuè liú huǒ" }, definition: { zh: "七月流火说的是天要转凉。", en: "The heat is ending." } };
  ok(lintDeck([idiom]).length === 0, "a Chinese original may quote itself in its definition");
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
    const s: GameState = { ...g, phase: "between", rounds: [fakeRound(0, judge, others[1], null), fakeRound(1, judge, others[2], null), fakeRound(2, judge, others[3], null)] };
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

if (failures) {
  console.log(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall good");

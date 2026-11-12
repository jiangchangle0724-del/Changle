/**
 * Game engine for 一本正经 · In All Seriousness: a pure reducer plus two view builders.
 * No I/O. The pass-the-phone screen, the online GameDef (A3) and the TV screen all call this.
 */
import { pickCard } from "./cards";
import { mulberry32, type Rng } from "./rng";
import { scoreRound } from "./scoring";
import type { Awards, Card, GameEvent, GameOptions, GameState, Level, OwnCard, Player, PrivateView, PublicView, Role, RoundState } from "./types";

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 9;
/** Players who have been honest the fewest times so far are this many times more likely to be dealt honest. */
export const HONEST_CATCHUP_WEIGHT = 3;

export const DEFAULT_OPTIONS: GameOptions = {
  mode: "pass",
  roundsPerPlayer: 1,
  bluffSeeds: true,
  sideBets: true,
  penalties: true,
  peekSeconds: 15,
  explainSeconds: 30,
  accuseSeconds: 20,
  packs: [],
  allowAdult: false,
};

export class GameError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}

export interface Deps {
  cards: Card[];
}

/* ---------- 自己出题: the players' own words ---------- */

/** An own word's card id: the prefix and its author's id. Never a bank id, so stats and reports skip it. */
export const OWN_PREFIX = "own:";
/** The pack an own word shows under (its own picture and name on the screens). */
export const OWN_PACK = "own";
/** How long an own word may be, in characters. */
export const OWN_LIMITS = { term: 30, definition: 120, fact: 120 } as const;

export const isOwn = (id: string | null | undefined): boolean => !!id && id.startsWith(OWN_PREFIX);

/** Text a player typed, made safe to show: no control characters, spaces collapsed, cut to `max` characters. */
export function cleanOwn(v: unknown, max: number): string {
  return [...String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()].slice(0, max).join("").trim();
}

/** A player's word as the rounds play it: the same text in both languages, no bluff seeds. */
function ownAsCard(o: OwnCard, level: Level): Card {
  const both = (s: string) => ({ zh: s, en: s });
  return { id: o.id, pack: OWN_PACK, level, term: both(o.term), definition: both(o.definition), bluffSeeds: { zh: [], en: [] }, funFact: both(o.fact), source: "player" };
}

/** The card behind a round's word: from the bank, or a player's own (at the level the round was dealt). */
export function cardOf(state: GameState, deps: Deps, id: string, level: Level = 2): Card | null {
  const bank = deps.cards.find((c) => c.id === id);
  if (bank) return bank;
  const own = state.ownCards?.find((o) => o.id === id);
  return own ? ownAsCard(own, level) : null;
}

/** The judges of the rounds after this one, as nextJudge will name them. */
function laterJudges(state: GameState, judgeId: string): string[] {
  const count: Record<string, number> = Object.fromEntries(state.judgeOrder.map((id) => [id, 0]));
  for (const r of state.rounds) if (r.judgeId in count) count[r.judgeId] += 1;
  if (judgeId in count) count[judgeId] += 1;
  const out: string[] = [];
  for (let i = state.rounds.length + 1; i < state.roundsPlanned; i++) {
    const min = Math.min(...state.judgeOrder.map((id) => count[id]));
    const next = state.judgeOrder.find((id) => count[id] === min);
    if (!next) break;
    count[next] += 1;
    out.push(next);
  }
  return out;
}

/** How many of these authors' words can still be played, each in a round its author does not judge. */
function playable(authors: string[], judges: string[]): number {
  const taken: number[] = judges.map(() => -1);
  const place = (a: number, seen: boolean[]): boolean => {
    for (let j = 0; j < judges.length; j++) {
      if (seen[j] || judges[j] === authors[a]) continue;
      seen[j] = true;
      if (taken[j] === -1 || place(taken[j], seen)) {
        taken[j] = a;
        return true;
      }
    }
    return false;
  };
  let n = 0;
  for (let a = 0; a < authors.length; a++) if (place(a, judges.map(() => false))) n += 1;
  return n;
}

/**
 * This round's own word, if one is left that its judge did not write: chosen at random among those
 * that leave the most words still playable later (so the last judge is not left with only their own).
 */
function pickOwn(state: GameState, judgeId: string, rng: Rng): OwnCard | null {
  const played = new Set(state.rounds.map((r) => r.cardId));
  const left = (state.ownCards ?? []).filter((o) => !played.has(o.id));
  const fits = left.filter((o) => o.authorId !== judgeId);
  if (!fits.length) return null;
  const later = laterJudges(state, judgeId);
  const scored = fits.map((o) => ({ o, n: playable(left.filter((x) => x !== o).map((x) => x.authorId), later) }));
  const best = Math.max(...scored.map((x) => x.n));
  return rng.pick(scored.filter((x) => x.n === best).map((x) => x.o));
}

/** The RNG is re-derived from (seed, round index) so the reducer stays a pure function of state. */
function rngFor(state: GameState, salt: number): Rng {
  return mulberry32((state.seed ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0);
}

export function createGame(players: Player[], options: Partial<GameOptions> = {}, seed = Date.now() >>> 0): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new GameError("player_count", `需要 ${MIN_PLAYERS} 到 ${MAX_PLAYERS} 人 / needs ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  }
  const ids = new Set(players.map((p) => p.id));
  if (ids.size !== players.length) throw new GameError("dup_player", "duplicate player id");
  const opts: GameOptions = { ...DEFAULT_OPTIONS, ...options };
  if (opts.roundsPerPlayer < 1) throw new GameError("bad_rounds", "roundsPerPlayer must be ≥ 1");
  const bySeat = [...players].sort((a, b) => a.seat - b.seat);
  const start = mulberry32(seed).int(bySeat.length);
  const judgeOrder = [...bySeat.slice(start), ...bySeat.slice(0, start)].map((p) => p.id);
  return {
    players: bySeat,
    options: opts,
    seed,
    phase: "lobby",
    scores: Object.fromEntries(bySeat.map((p) => [p.id, 0])),
    usedCardIds: [],
    roundsPlanned: bySeat.length * opts.roundsPerPlayer,
    rounds: [],
    current: null,
    judgeOrder,
  };
}

function nonJudges(state: GameState, judgeId: string): string[] {
  return state.players.filter((p) => p.id !== judgeId).map((p) => p.id);
}

/** Pass-the-phone order: seats to the left of the judge, around the table. */
function passOrder(state: GameState, judgeId: string): string[] {
  const ids = state.players.map((p) => p.id);
  const j = ids.indexOf(judgeId);
  return [...ids.slice(j + 1), ...ids.slice(0, j)];
}

/**
 * Soft catch-up: whoever has been honest the fewest times so far gets HONEST_CATCHUP_WEIGHT,
 * everyone else 1. Not a guarantee, so the last round cannot be deduced from the earlier reveals.
 */
function dealHonest(state: GameState, candidates: string[], rng: Rng): string {
  const count: Record<string, number> = Object.fromEntries(candidates.map((id) => [id, 0]));
  for (const r of state.rounds) if (r.honestId in count) count[r.honestId] += 1;
  const min = Math.min(...candidates.map((id) => count[id]));
  const weights = candidates.map((id) => (count[id] === min ? HONEST_CATCHUP_WEIGHT : 1));
  let x = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    x -= weights[i];
    if (x < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

/**
 * Who judges the next round: the first in `judgeOrder` who has judged the fewest rounds so far. With
 * nobody leaving that is simply judgeOrder[rounds.length]; when someone leaves halfway (online), the
 * ones who have not judged yet still all get their turn.
 */
export function nextJudge(state: GameState): string | null {
  if (!state.judgeOrder.length) return null;
  const count: Record<string, number> = Object.fromEntries(state.judgeOrder.map((id) => [id, 0]));
  for (const r of state.rounds) if (r.judgeId in count) count[r.judgeId] += 1;
  const min = Math.min(...state.judgeOrder.map((id) => count[id]));
  return state.judgeOrder.find((id) => count[id] === min) ?? null;
}

function startRound(state: GameState, deps: Deps, level: Level | undefined): GameState {
  const index = state.rounds.length;
  if (index >= state.roundsPlanned) throw new GameError("no_rounds_left", "game is over");
  const judgeId = nextJudge(state);
  if (!judgeId) throw new GameError("no_rounds_left", "nobody left to judge");
  const rng = rngFor(state, index);
  const others = nonJudges(state, judgeId);
  const honestId = dealHonest(state, others, rng);
  const lvl: Level = level ?? 2;
  const tonight = state.rounds.map((r) => r.cardId);
  // the players' own words first (自己出题), then the bank
  const own = state.ownCards?.length ? pickOwn(state, judgeId, rng) : null;
  const card = own ? ownAsCard(own, lvl) : pickCard(deps.cards, { level: lvl, packs: state.options.packs, used: state.usedCardIds, tonight, allowAdult: state.options.allowAdult }, rng);
  if (!card) throw new GameError("no_cards", "no cards in the selected packs");
  const peekQueue = state.options.mode === "pass" ? passOrder(state, judgeId) : [...others];
  const round: RoundState = {
    index,
    judgeId,
    honestId,
    cardId: card.id,
    level: card.level,
    peekQueue,
    peeked: [],
    speakOrder: rng.shuffle(others),
    speakerIdx: -1,
    suspectId: null,
    betQueue: [],
    bets: {},
    accusedId: null,
    result: null,
    authorId: own ? own.authorId : null,
  };
  return { ...state, phase: "peek", current: round, usedCardIds: [...state.usedCardIds, card.id] };
}

function need(state: GameState, phases: GameState["phase"][], ev: string): RoundState {
  if (!phases.includes(state.phase)) throw new GameError("bad_phase", `${ev} not allowed in ${state.phase}`);
  if (!state.current) throw new GameError("no_round", "no round in progress");
  return state.current;
}

function betsPhaseApplies(state: GameState): boolean {
  return state.options.sideBets && state.players.length >= 4;
}

/** Who bets this round: every speaker but the one who wrote the word (they know it). */
function bettorsOf(r: RoundState): string[] {
  return r.speakOrder.filter((id) => id !== r.authorId);
}

/** Everyone has explained: on to the bets (4+ players, when on) or straight to the judge. */
function afterLastSpeaker(state: GameState, r: RoundState): GameState {
  const toBets = betsPhaseApplies(state);
  const bettors = bettorsOf(r);
  const betQueue = toBets ? (state.options.mode === "pass" ? passOrder(state, r.judgeId).filter((id) => bettors.includes(id)) : bettors) : [];
  return { ...state, phase: toBets ? "bets" : "accuse", current: { ...r, speakerIdx: r.speakOrder.length, betQueue } };
}

export function reduce(state: GameState, ev: GameEvent, deps: Deps): GameState {
  switch (ev.type) {
    case "START_ROUND": {
      // From "reveal" the UI must send NEXT_ROUND first, or the round would never be recorded.
      if (!["lobby", "between"].includes(state.phase)) throw new GameError("bad_phase", `START_ROUND not allowed in ${state.phase}`);
      return startRound(state, deps, ev.level);
    }

    case "PEEKED": {
      const r = need(state, ["peek"], ev.type);
      if (ev.playerId === r.judgeId) throw new GameError("judge_peek", "the judge has nothing to peek at");
      if (r.peeked.includes(ev.playerId)) throw new GameError("already_peeked", `${ev.playerId} already peeked`);
      if (state.options.mode === "pass" && r.peekQueue[0] !== ev.playerId) {
        throw new GameError("not_your_turn", `phone should be with ${r.peekQueue[0]}, not ${ev.playerId}`);
      }
      if (!r.peekQueue.includes(ev.playerId)) throw new GameError("not_a_player", `${ev.playerId} is not in this round`);
      const peekQueue = r.peekQueue.filter((id) => id !== ev.playerId);
      const peeked = [...r.peeked, ev.playerId];
      const done = peekQueue.length === 0;
      return { ...state, phase: done ? "explain" : "peek", current: { ...r, peekQueue, peeked } };
    }

    case "NEXT_SPEAKER": {
      const r = need(state, ["explain"], ev.type);
      const next = r.speakerIdx + 1;
      if (next < r.speakOrder.length) return { ...state, current: { ...r, speakerIdx: next } };
      return afterLastSpeaker(state, r);
    }

    case "TAG_SUSPECT": {
      const r = need(state, ["explain"], ev.type);
      if (ev.byPlayerId !== r.judgeId) throw new GameError("not_judge", "only the judge tags");
      if (ev.targetId === r.judgeId || !r.speakOrder.includes(ev.targetId)) throw new GameError("bad_target", "tag a speaker");
      if (r.suspectId) throw new GameError("already_tagged", "one tag per round");
      return { ...state, current: { ...r, suspectId: ev.targetId } };
    }

    case "BET": {
      const r = need(state, ["bets"], ev.type);
      if (ev.playerId === r.judgeId) throw new GameError("judge_bet", "the judge accuses, not bets");
      if (!r.speakOrder.includes(ev.playerId)) throw new GameError("not_a_player", `${ev.playerId} is not in this round`);
      if (ev.playerId === r.authorId) throw new GameError("author_bet", "the one who wrote the word knows it");
      if (ev.targetId === ev.playerId || !r.speakOrder.includes(ev.targetId)) throw new GameError("bad_target", "bet on another speaker");
      if (r.bets[ev.playerId]) throw new GameError("already_bet", `${ev.playerId} already bet`);
      if (state.options.mode === "pass" && r.betQueue[0] !== ev.playerId) {
        throw new GameError("not_your_turn", `phone should be with ${r.betQueue[0]}, not ${ev.playerId}`);
      }
      const bets = { ...r.bets, [ev.playerId]: ev.targetId };
      const betQueue = r.betQueue.filter((id) => id !== ev.playerId);
      const everyone = betQueue.length === 0;
      return { ...state, phase: everyone ? "accuse" : "bets", current: { ...r, bets, betQueue } };
    }

    case "CLOSE_BETS": {
      const r = need(state, ["bets"], ev.type);
      if (ev.byPlayerId !== r.judgeId) throw new GameError("not_judge", "only the judge closes bets");
      return { ...state, phase: "accuse", current: { ...r, betQueue: [] } };
    }

    case "ACCUSE": {
      const r = need(state, ["accuse", "bets"], ev.type);
      if (ev.byPlayerId !== r.judgeId) throw new GameError("not_judge", "only the judge accuses");
      if (ev.targetId === r.judgeId || !r.speakOrder.includes(ev.targetId)) throw new GameError("bad_target", "accuse a speaker");
      if (ev.targetId === r.suspectId) throw new GameError("tagged_target", "贴了疑点的人不能再被指认 / the tagged player cannot be accused");
      const accused = { ...r, accusedId: ev.targetId, betQueue: [] };
      const result = scoreRound(accused, state.players, state.options);
      const scores = { ...state.scores };
      for (const [id, d] of Object.entries(result.deltas)) scores[id] = (scores[id] ?? 0) + d;
      return { ...state, phase: "reveal", scores, current: { ...accused, result } };
    }

    case "NEXT_ROUND": {
      // Only from "reveal": a second NEXT_ROUND (a double tap) is refused instead of recording the round twice.
      const r = need(state, ["reveal"], ev.type);
      const rounds = [...state.rounds, r];
      const finished = rounds.length >= state.roundsPlanned;
      return { ...state, phase: finished ? "finished" : "between", rounds, current: r };
    }
  }
}

/** A round being played (dealt, not yet scored): what a leaver can still call off. */
const LIVE: GameState["phase"][] = ["peek", "explain", "bets", "accuse"];

/** A bluffer who left drops out of the round; bets placed on them are void, so those players bet again. */
function dropFromRound(r: RoundState, id: string): RoundState {
  const at = r.speakOrder.indexOf(id);
  const bets: Record<string, string> = {};
  const again: string[] = [];
  for (const [bettor, target] of Object.entries(r.bets)) {
    if (bettor === id) continue;
    if (target === id) again.push(bettor);
    else bets[bettor] = target;
  }
  const betQueue = r.betQueue.filter((x) => x !== id);
  return {
    ...r,
    peekQueue: r.peekQueue.filter((x) => x !== id),
    peeked: r.peeked.filter((x) => x !== id),
    speakOrder: r.speakOrder.filter((x) => x !== id),
    // whoever spoke after them keeps their place in line (the one after a current speaker who left is up now)
    speakerIdx: at >= 0 && at < r.speakerIdx ? r.speakerIdx - 1 : r.speakerIdx,
    suspectId: r.suspectId === id ? null : r.suspectId,
    betQueue: [...betQueue, ...again.filter((b) => !betQueue.includes(b))],
    bets,
  };
}

/** Rounds left to play so that everyone still here judges `roundsPerPlayer` times, plus those already played. */
function plannedRounds(state: GameState): number {
  const per = state.options.roundsPerPlayer;
  const playing = !!state.current && [...LIVE, "reveal"].includes(state.phase);
  const judged: Record<string, number> = Object.fromEntries(state.players.map((p) => [p.id, 0]));
  for (const r of state.rounds) if (r.judgeId in judged) judged[r.judgeId] += 1;
  if (playing && state.current!.judgeId in judged) judged[state.current!.judgeId] += 1;
  return state.rounds.length + (playing ? 1 : 0) + state.players.reduce((n, p) => n + Math.max(0, per - judged[p.id]), 0);
}

/**
 * Someone left the table halfway through (online): they leave the game too, out of every list and the
 * scores. A round that can't go on without them (theirs to judge, or theirs to tell straight) is called
 * off and dealt again with a new card; a bluffer just drops out of it, and a step that was only waiting
 * for them moves on. With fewer than MIN_PLAYERS left, the game is over.
 */
export function removePlayer(state: GameState, id: string): GameState {
  if (!state.players.some((p) => p.id === id)) return state;
  const scores = { ...state.scores };
  delete scores[id];
  let next: GameState = { ...state, players: state.players.filter((p) => p.id !== id), judgeOrder: state.judgeOrder.filter((x) => x !== id), scores };
  const r = state.current;
  const last = state.rounds.length ? state.rounds[state.rounds.length - 1] : null;
  if (r && LIVE.includes(state.phase)) {
    if (r.judgeId === id || r.honestId === id) {
      next = { ...next, phase: last ? "between" : "lobby", current: last };
    } else {
      const left = dropFromRound(r, id);
      next = { ...next, current: left };
      if (state.phase === "peek" && left.peekQueue.length === 0) next = { ...next, phase: "explain" };
      else if (state.phase === "explain" && left.speakerIdx >= left.speakOrder.length) next = afterLastSpeaker(next, left);
      else if (state.phase === "bets" && left.betQueue.length === 0) next = { ...next, phase: "accuse" };
    }
  }
  next = { ...next, roundsPlanned: plannedRounds(next) };
  const waiting = next.phase === "lobby" || next.phase === "between";
  if (next.players.length < MIN_PLAYERS || (waiting && next.rounds.length >= next.roundsPlanned)) {
    // a round still being played is called off (the last one played stays on screen); one already
    // scored counts
    if (next.phase === "reveal" && next.current) return { ...next, phase: "finished", rounds: [...next.rounds, next.current] };
    return { ...next, phase: "finished", current: LIVE.includes(next.phase) ? last : next.current };
  }
  return next;
}

export function roleOf(state: GameState, playerId: string): Role | null {
  const r = state.current;
  if (!r) return null;
  if (playerId === r.judgeId) return "judge";
  if (playerId === r.honestId) return "honest";
  return state.players.some((p) => p.id === playerId) ? "bluffer" : null;
}

export function currentSpeaker(state: GameState): string | null {
  const r = state.current;
  if (!r || state.phase !== "explain" || r.speakerIdx < 0 || r.speakerIdx >= r.speakOrder.length) return null;
  return r.speakOrder[r.speakerIdx];
}

/** Pass mode: who should be holding the phone right now. Null in online mode and outside a round. */
export function phoneHolder(state: GameState): string | null {
  const r = state.current;
  if (!r || state.options.mode !== "pass") return null;
  switch (state.phase) {
    case "peek":
      return r.peekQueue[0] ?? r.judgeId;
    case "bets":
      return r.betQueue[0] ?? r.judgeId;
    case "explain":
    case "accuse":
    case "reveal":
    case "between":
      return r.judgeId;
    default:
      return null;
  }
}

function isRevealed(state: GameState): boolean {
  return state.phase === "reveal" || state.phase === "between" || state.phase === "finished";
}

/** Everything ONE phone may show. Roles of others never appear here. */
export function privateView(state: GameState, playerId: string, deps: Deps): PrivateView {
  const r = state.current;
  const role = roleOf(state, playerId);
  const card = r ? cardOf(state, deps, r.cardId, r.level) : null;
  const revealed = isRevealed(state);
  const inRound = !!r && state.phase !== "lobby";
  const hasPeeked = !!r && r.peeked.includes(playerId);
  // pass mode: the phone is in this player's hands; online: their turn to look (everyone at once)
  const mayPeekNow = state.phase === "peek" && !!r && (state.options.mode === "pass" ? r.peekQueue[0] === playerId : r.peekQueue.includes(playerId));
  // PEEKED means "done looking": the part shows while it is their turn to look, and stays known after
  const seen = hasPeeked || mayPeekNow;
  const showsRole = role === "judge" || seen || revealed;
  return {
    playerId,
    role: showsRole ? role : null,
    term: inRound && card ? card.term : null,
    level: inRound && r ? r.level : null,
    definition: card && ((role === "honest" && seen) || revealed) ? card.definition : null,
    bluffSeeds: card && role === "bluffer" && seen && state.options.bluffSeeds && !revealed ? card.bluffSeeds.zh.map((zh, i) => ({ zh, en: card.bluffSeeds.en[i] ?? "" })) : null,
    mayPeekNow,
    mayBetNow: state.phase === "bets" && !!r && (state.options.mode === "pass" ? r.betQueue[0] === playerId : r.betQueue.includes(playerId)),
    isSpeaking: currentSpeaker(state) === playerId,
    canTag: state.phase === "explain" && role === "judge" && !r?.suspectId,
    canBet: state.phase === "bets" && role !== "judge" && !!r && r.betQueue.includes(playerId) && !r.bets[playerId],
    canAccuse: ["bets", "accuse"].includes(state.phase) && role === "judge",
    suspectId: role === "judge" && r ? r.suspectId : null,
    wrote: inRound && !!r && !!r.authorId && r.authorId === playerId,
  };
}

/** Everything the TV / observer may show. No roles, no definition until reveal. */
export function publicView(state: GameState, deps: Deps): PublicView {
  const r = state.current;
  const card = r ? cardOf(state, deps, r.cardId, r.level) : null;
  const inRound = !!r && state.phase !== "lobby";
  const speakers = r ? r.speakOrder.length : 0;
  return {
    phase: state.phase,
    roundNumber: r ? r.index + 1 : state.rounds.length,
    roundsPlanned: state.roundsPlanned,
    judgeId: inRound && r ? r.judgeId : null,
    term: inRound && card ? card.term : null,
    pack: inRound && card ? card.pack : null,
    level: inRound && r ? r.level : null,
    speakerId: currentSpeaker(state),
    speakOrder: inRound && r && state.phase !== "peek" ? r.speakOrder : [],
    phoneHolderId: phoneHolder(state),
    peekedCount: r ? r.peeked.length : 0,
    peekTotal: speakers,
    betsPlaced: r ? Object.keys(r.bets).length : 0,
    betsExpected: betsPhaseApplies(state) && r ? bettorsOf(r).length : 0,
    scores: state.scores,
    reveal: isRevealed(state) && r?.result && card ? { honestId: r.honestId, definition: card.definition, funFact: card.funFact, result: r.result } : null,
    timers: { peek: state.options.peekSeconds, explain: state.options.explainSeconds, accuse: state.options.accuseSeconds },
    own: inRound && !!r?.authorId,
    authorId: isRevealed(state) && r?.authorId ? r.authorId : null,
  };
}

/** Question prompts the judge's phone can show when the room goes quiet. */
export const JUDGE_PROMPTS: { zh: string; en: string }[] = [
  { zh: "它大概是什么时候出现的？", en: "Roughly when did this come about?" },
  { zh: "举一个用到它的例子。", en: "Give me one example of it in use." },
  { zh: "它和什么东西最容易搞混？", en: "What is it most often confused with?" },
  { zh: "你第一次听说它是在哪？", en: "Where did you first hear of it?" },
  { zh: "用一句话给小孩解释。", en: "Explain it to a child in one sentence." },
  { zh: "它是好事还是坏事？", en: "Is it a good thing or a bad thing?" },
];

/** How many times each player fooled a judge (accused while bluffing). Used as the tie-break. */
export function foolCounts(state: GameState): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(state.players.map((p) => [p.id, 0]));
  const done = state.phase === "reveal" && state.current ? [...state.rounds, state.current] : state.rounds;
  for (const r of done) {
    if (r.accusedId && r.accusedId !== r.honestId) out[r.accusedId] = (out[r.accusedId] ?? 0) + 1;
  }
  return out;
}

/**
 * Tonight's titles, for the end screen and the picture the table shares: who topped the board, who
 * fooled judges most, who bet best. Players who left are out of it; a title nobody earned is empty.
 */
export function awards(state: GameState): Awards {
  const ids = state.players.map((p) => p.id);
  const most = (counts: Record<string, number>) => {
    const max = Math.max(0, ...ids.map((id) => counts[id] ?? 0));
    return max > 0 ? ids.filter((id) => (counts[id] ?? 0) === max) : [];
  };
  const fooled = foolCounts(state);
  const rightBets: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const r of state.rounds) {
    for (const [who, target] of Object.entries(r.bets)) if (target === r.honestId && who in rightBets) rightBets[who] += 1;
  }
  const top = leaderboard(state).filter((b) => b.place === 1 && b.score > 0).map((b) => b.id);
  return { top, bluffer: most(fooled), bettor: most(rightBets), fooled, rightBets };
}

/** Sorted by score; ties broken by who fooled the judge more often; still tied = shared place (they drink together). */
export function leaderboard(state: GameState): { id: string; name: string; score: number; fooled: number; place: number }[] {
  const fooled = foolCounts(state);
  const rows = state.players
    .map((p) => ({ id: p.id, name: p.name, score: state.scores[p.id] ?? 0, fooled: fooled[p.id] ?? 0, place: 0 }))
    .sort((a, b) => b.score - a.score || b.fooled - a.fooled || a.name.localeCompare(b.name));
  rows.forEach((row, i) => {
    const prev = rows[i - 1];
    row.place = prev && prev.score === row.score && prev.fooled === row.fooled ? prev.place : i + 1;
  });
  return rows;
}

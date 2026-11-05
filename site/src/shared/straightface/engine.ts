/**
 * Game engine for 一本正经 · Straight Face: a pure reducer plus two view builders.
 * No I/O. The pass-the-phone screen, the online GameDef (A3) and the TV screen all call this.
 */
import { pickCard } from "./cards";
import { mulberry32, type Rng } from "./rng";
import { scoreRound } from "./scoring";
import type { Card, GameEvent, GameOptions, GameState, Level, Player, PrivateView, PublicView, Role, RoundState } from "./types";

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

function startRound(state: GameState, deps: Deps, level: Level | undefined): GameState {
  const index = state.rounds.length;
  if (index >= state.roundsPlanned) throw new GameError("no_rounds_left", "game is over");
  const judgeId = state.judgeOrder[index % state.judgeOrder.length];
  const rng = rngFor(state, index);
  const others = nonJudges(state, judgeId);
  const honestId = dealHonest(state, others, rng);
  const lvl: Level = level ?? 2;
  const card = pickCard(deps.cards, { level: lvl, packs: state.options.packs, used: state.usedCardIds, allowAdult: state.options.allowAdult }, rng);
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
      // past the last speaker
      const toBets = betsPhaseApplies(state);
      const betQueue = toBets ? (state.options.mode === "pass" ? passOrder(state, r.judgeId) : [...r.speakOrder]) : [];
      return { ...state, phase: toBets ? "bets" : "accuse", current: { ...r, speakerIdx: r.speakOrder.length, betQueue } };
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
  const card = r ? (deps.cards.find((c) => c.id === r.cardId) ?? null) : null;
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
  };
}

/** Everything the TV / observer may show. No roles, no definition until reveal. */
export function publicView(state: GameState, deps: Deps): PublicView {
  const r = state.current;
  const card = r ? (deps.cards.find((c) => c.id === r.cardId) ?? null) : null;
  const inRound = !!r && state.phase !== "lobby";
  const speakers = r ? r.speakOrder.length : 0;
  return {
    phase: state.phase,
    roundNumber: r ? r.index + 1 : state.rounds.length,
    roundsPlanned: state.roundsPlanned,
    judgeId: inRound && r ? r.judgeId : null,
    term: inRound && card ? card.term : null,
    level: inRound && r ? r.level : null,
    speakerId: currentSpeaker(state),
    speakOrder: inRound && r && state.phase !== "peek" ? r.speakOrder : [],
    phoneHolderId: phoneHolder(state),
    peekedCount: r ? r.peeked.length : 0,
    peekTotal: speakers,
    betsPlaced: r ? Object.keys(r.bets).length : 0,
    betsExpected: betsPhaseApplies(state) ? speakers : 0,
    scores: state.scores,
    reveal: isRevealed(state) && r?.result && card ? { honestId: r.honestId, definition: card.definition, funFact: card.funFact, result: r.result } : null,
    timers: { peek: state.options.peekSeconds, explain: state.options.explainSeconds, accuse: state.options.accuseSeconds },
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

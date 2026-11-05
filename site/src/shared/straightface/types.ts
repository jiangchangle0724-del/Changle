/**
 * 一本正经 · Straight Face: shared types.
 * A bluff-the-definition party game (the Call My Bluff / Fictionary family): one judge (裁判), one
 * honest player (老实人) who has read the true definition, everyone else bluffs (瞎编的人). The judge
 * must find the honest one.
 *
 * All names, cards and art are original. Nothing here reuses 瞎掰王 / 9UPPER material.
 * The engine is pure: the one-phone screen runs it in React state; the rooms server will run the
 * same code behind a GameDef (A3). Phones render only what `privateView` returns, big screens only
 * what `publicView` returns.
 */
import type { T } from "../../i18n";

export type Level = 1 | 2 | 3;
export type Role = "judge" | "honest" | "bluffer";
export type Mode = "pass" | "online";

export interface Card {
  id: string;
  pack: string; // "trivia" | "vancouver" | "food" | "slang" | ...
  level: Level; // 1 half-known, 2 niche, 3 obscure
  /** What the big screen shows. The original name or a transliteration only: never a gloss that explains it. */
  term: T;
  /** zh ≤ 60 chars, en ≤ 160 chars; what the honest player reads */
  definition: T;
  /** two wrong-but-plausible angles shown to bluffers (新手模式) */
  bluffSeeds: { zh: string[]; en: string[] };
  /** one line shown on the reveal screen; required */
  funFact: T;
  /** where the definition was checked: a URL, or "editorial" (reviewed by hand) */
  source: string;
  /** 18+: sexual or drug content only. Alcohol vocabulary is NOT adult. */
  adult?: boolean;
}

export interface Player {
  id: string;
  name: string;
  /** physical seat order, 0-based, used for pass-the-phone and judge rotation */
  seat: number;
}

export interface GameOptions {
  mode: Mode;
  /** every player judges this many times; default 1 */
  roundsPerPlayer: number;
  /** 新手模式: bluffers see two seeds */
  bluffSeeds: boolean;
  /** non-judges bet on the honest player after the last explanation (4+ players) */
  sideBets: boolean;
  /** emit drink/dare penalties with the reveal */
  penalties: boolean;
  /** pass mode: the same for everyone so duration leaks nothing; default 15 */
  peekSeconds: number;
  /** soft timer per speaker; default 30 */
  explainSeconds: number;
  /** soft timer for the judge; default 20. The engine never times anyone out. */
  accuseSeconds: number;
  /** empty = all packs */
  packs: string[];
  allowAdult: boolean;
}

export type Phase =
  | "lobby"
  | "peek" // term is public; non-judges privately learn their role (pass: one at a time; online: all at once)
  | "explain" // speakers explain in random order; judge may tag one suspect
  | "bets" // everyone but the judge bets on who is honest (pass: one at a time, in seat order)
  | "accuse" // judge names the honest player
  | "reveal" // definition, roles, points, penalties
  | "between" // the round is recorded; the reveal stays on screen until START_ROUND
  | "finished";

export type PenaltyWhy = "fooled" | "caught" | "master";

export interface RoundState {
  index: number; // 0-based
  judgeId: string;
  honestId: string;
  cardId: string;
  /** the level actually dealt (may differ from the level asked for when that pool is empty) */
  level: Level;
  /** pass mode: who holds the phone next; online: everyone who has not peeked */
  peekQueue: string[];
  peeked: string[];
  /** random, never seat order */
  speakOrder: string[];
  /** -1 before the first speaker */
  speakerIdx: number;
  /** the judge's one tag (疑点); the tagged player can no longer be accused */
  suspectId: string | null;
  /** pass mode: who holds the phone next to bet; online: everyone who has not bet */
  betQueue: string[];
  bets: Record<string, string>; // bettorId -> targetId
  accusedId: string | null;
  result: RoundResult | null;
}

export interface RoundResult {
  outcome: "judge_right" | "judge_wrong";
  deltas: Record<string, number>;
  /** shown BEFORE the honest player is revealed; never says who was honest */
  preLines: T[];
  /** shown AFTER the honest player is revealed: points and penalties */
  lines: T[];
  /**
   * fooled: the judge was fooled (drinks); caught: a tagged bluffer (drinks); master: the bluffer who
   * fooled the judge picks someone to drink. `reason` is the drinking line; a table with its own
   * penalty words it from `why` instead.
   */
  penalties: { playerId: string; why: PenaltyWhy; reason: T }[];
}

export interface GameState {
  players: Player[];
  options: GameOptions;
  /** never leaves the server in online mode: roles derive from it */
  seed: number;
  phase: Phase;
  scores: Record<string, number>;
  usedCardIds: string[];
  roundsPlanned: number;
  /** finished rounds */
  rounds: RoundState[];
  current: RoundState | null;
  /** seat order starting from a random seat */
  judgeOrder: string[];
}

export type GameEvent =
  | { type: "START_ROUND"; level?: Level }
  | { type: "PEEKED"; playerId: string }
  | { type: "NEXT_SPEAKER" }
  | { type: "TAG_SUSPECT"; byPlayerId: string; targetId: string }
  | { type: "BET"; playerId: string; targetId: string }
  | { type: "CLOSE_BETS"; byPlayerId: string }
  | { type: "ACCUSE"; byPlayerId: string; targetId: string }
  | { type: "NEXT_ROUND" };

/** What one phone may render. Built by privateView(); never contains anyone else's role. */
export interface PrivateView {
  playerId: string;
  role: Role | null;
  term: T | null;
  level: Level | null;
  /** honest player only */
  definition: T | null;
  /** bluffers only, when enabled */
  bluffSeeds: T[] | null;
  /** pass mode: it is this player's turn to hold the phone and peek */
  mayPeekNow: boolean;
  /** pass mode: it is this player's turn to hold the phone and bet */
  mayBetNow: boolean;
  isSpeaking: boolean;
  canTag: boolean;
  canBet: boolean;
  canAccuse: boolean;
  /** judge only: whom the judge tagged (cannot be accused) */
  suspectId: string | null;
}

/** What the TV / observer screen may render. Never contains roles or the definition before reveal. */
export interface PublicView {
  phase: Phase;
  roundNumber: number; // 1-based
  roundsPlanned: number;
  judgeId: string | null;
  term: T | null;
  level: Level | null;
  speakerId: string | null;
  speakOrder: string[];
  /** pass mode: who should be holding the phone right now */
  phoneHolderId: string | null;
  peekedCount: number;
  peekTotal: number;
  betsPlaced: number;
  betsExpected: number;
  scores: Record<string, number>;
  reveal: { honestId: string; definition: T; funFact: T; result: RoundResult } | null;
  timers: { peek: number; explain: number; accuse: number };
}

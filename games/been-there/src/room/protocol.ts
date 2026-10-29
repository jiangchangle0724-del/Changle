// What phones, the big screen and the server say to each other.
import type { Action, GameState, ManageKind, Mode, Offer, StyleId, Text } from "../engine";

export type Lang = "zh" | "en";
export type Role = "player" | "screen";

/** Room timings in milliseconds (scaled down by settings.speed in tests). */
export const TIMING = {
  /** Computer players think this long before each move. */
  bot: 900,
  /** First bid window of a live auction. */
  auctionOpen: 10_000,
  /** "Count to five": each bid restarts this countdown. */
  auctionStep: 5_000,
  /** Whole-table votes and sealed bids: people who haven't answered get the default after this. */
  vote: 25_000,
  /** Shanghai: time to answer the trash quiz. */
  quiz: 5_000,
  /** Seoul: the silent ten seconds. */
  silence: 10_000,
  /** Waiting players' quiz: time to answer. */
  trivia: 12_000,
  /** …then the answer and its source stay up this long. */
  triviaReveal: 6_000,
  /** A team whose phones have all dropped off is played by the computer after this. */
  takeover: 15_000,
  /** Open trade offers expire. */
  offer: 90_000,
  /** Rooms are deleted after this long with nobody around. */
  roomTtl: 3 * 24 * 3600_000,
};

/** What set off a party forfeit: a huge rent, Immigration, going broke, Seoul's silence broken, Shanghai's trash sorted wrong. */
export type PartyWhy = "rent" | "jail" | "broke" | "sound" | "quiz";

/** First right answer in the waiting players' quiz wins this. */
export const TRIVIA_PRIZE = 20;

export const MAX_TEAMS = 6;
export const MAX_TEAM_SIZE = 3;

export interface Settings {
  mode: Mode;
  /** Party forfeits (派对惩罚), off by default. */
  party: boolean;
  /** Travel news (旅行快讯), off by default. Missing in rooms and saves from before it. */
  news?: boolean;
  /** One device controls every human team (the single-device demo). */
  hotseat: boolean;
  /** Tests only: end after this many rounds. */
  testRounds?: number;
  /** Tests only: multiply all room timings by this. */
  speed?: number;
}

export type ClientMsg =
  | { t: "name"; name: string }
  | { t: "lang"; lang: Lang }
  | { t: "team"; op: "create" }
  | { t: "team"; op: "join"; team: string }
  | { t: "team"; op: "leave" }
  | { t: "team"; op: "rename"; name: string; team?: string }
  | { t: "bot"; op: "add"; style?: StyleId }
  | { t: "bot"; op: "remove"; team: string }
  | { t: "bot"; op: "style"; team: string; style: StyleId }
  | { t: "settings"; mode?: Mode; party?: boolean; news?: boolean }
  | { t: "start" }
  | { t: "act"; d: number; a: Action; seat?: number }
  | { t: "manage"; k: ManageKind; at: number; seat?: number }
  | { t: "bid"; aid: number; amount: number; seat?: number }
  | { t: "quiz"; qid: number; choice: number }
  | { t: "trivia"; id: number; choice: number; seat?: number }
  | { t: "offer"; to: number; give: Offer; get: Offer; seat?: number }
  | { t: "offer-reply"; id: number; accept: boolean }
  | { t: "offer-cancel"; id: number }
  | { t: "bet"; yes: boolean }
  | { t: "autoplay"; on: boolean; seat?: number }
  | { t: "pause"; on: boolean }
  | { t: "save" }
  | { t: "again" }
  | { t: "ping" };

export type ServerMsg =
  | { t: "view"; view: RoomView }
  | { t: "toast"; key: string; vars?: Record<string, string | number> }
  | { t: "saved"; code: string }
  | { t: "pong"; now: number }
  | { t: "fatal"; key: string };

/** A feed item: an engine event or a room event, numbered so clients can animate new ones. */
export type FeedItem = { id: number; at: number } & (
  | { t: "game"; e: import("../engine").GameEvent }
  | { t: "joined" | "left"; name: string }
  | { t: "autoplay"; seat: number; on: boolean; why?: "away" | "chosen" }
  | { t: "timeup" }
  | { t: "paused" | "resumed" }
  | { t: "offer"; from: number; to: number; give: Offer; get: Offer; byBot?: boolean }
  | { t: "offer-done"; from: number; to: number; accepted: boolean; why?: "invalid" | "expired" | "cancelled" }
  | { t: "bets"; seat: number; paidRent: boolean; right: number; wrong: number }
  | { t: "party"; seat: number; why: PartyWhy; /** Index into FORFEITS (party.ts); missing in rooms from before step 6. */ dare?: number }
  | { t: "quiz"; seat: number; item: number; bin: number; choice: number | null; right: boolean }
);

export interface MemberView {
  id: string;
  name: string;
  team: string | null;
  role: Role;
  online: boolean;
  score: number;
}

export interface TeamView {
  id: string;
  name: string;
  bot: StyleId | null;
  autoplay: boolean;
  color: number;
  members: string[];
  /** Seat in the running game, or null in the lobby. */
  seat: number | null;
  /** Computer is playing for this human team right now (all phones away or autoplay on). */
  covered: boolean;
}

export interface TradeView {
  id: number;
  from: number;
  to: number;
  give: Offer;
  get: Offer;
  expiresAt: number;
  byBot?: boolean;
}

export interface AuctionView {
  id: number;
  at: number;
  price: number;
  leader: number | null;
  endsAt: number;
  bids: number;
}

export interface QuizView {
  id: number;
  visitor: number;
  owner: number;
  /** Index into the flattened TRASH_QUIZ items list. */
  item: number;
  endsAt: number;
  answer?: { choice: number | null; bin: number; right: boolean };
}

/** The waiting players' quiz: a question about one of the cities, for the teams whose turn it isn't. */
export interface TriviaView {
  id: number;
  city: string;
  q: Text;
  /** In the order shown. */
  options: Text[];
  endsAt: number;
  open: boolean;
  /** The team this phone answers for (in the game, not on turn, hasn't answered), or null if it can't answer. */
  answerFor: number | null;
  /** What this phone's team picked. */
  mine: number | null;
  /** Teams that have answered. While the question is still open, every one of them got it wrong. */
  answered: number[];
  winner: number | null;
  /** Shown once the question closes, with the fact it comes from. */
  correct: number | null;
  fact: Text | null;
  source: string | null;
}

export interface GameView {
  /** The engine state with the secret parts removed (seed, card order, sealed votes and bids). */
  s: GameState;
  seats: string[];
  mustAct: number[];
  decision: number;
  startedAt: number;
  endsAt: number | null;
  timeUp: boolean;
  paused: boolean;
  deadline: number | null;
  silenceUntil: number | null;
  auction: AuctionView | null;
  quiz: QuizView | null;
  trivia: TriviaView | null;
  trades: TradeView[];
  /** Seats that have answered the current whole-table decision. */
  answered: number[];
  /** Dubai: the top Journey cards, only for the seat looking. */
  peek: number[] | null;
  bets: { seat: number; open: boolean; yes: number; no: number; mine: boolean | null } | null;
  worth: number[];
}

export interface RoomView {
  code: string;
  now: number;
  phase: "lobby" | "playing" | "over";
  you: { id: string; name: string; team: string | null; role: Role; host: boolean; seats: number[]; lang: Lang };
  hostId: string | null;
  /** The changle.ca table the game was started from (its 4-letter code), or null. */
  table: string | null;
  settings: Settings;
  members: MemberView[];
  teams: TeamView[];
  game: GameView | null;
  feed: FeedItem[];
}

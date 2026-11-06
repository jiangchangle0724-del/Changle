// What phones, the big screen and the server say to each other.
import type { Action, CashChoice, GameState, ManageKind, Mode, Offer, StyleId, Text } from "../engine";

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
  /**
   * Rio: a team that says it will dance gets a ready card, and the lesson starts when it presses
   * Start. Left alone this long, it starts by itself (nobody holds the game; not in the one-phone demo)…
   */
  danceReady: 60_000,
  /** …with a countdown of this long on every screen first… */
  danceCount: 5_000,
  /**
   * …and then the lesson every screen plays before the judges score it: eight figures of eight beats
   * at 100 a minute, and the pose (ui/Samba.tsx). The judges' 25 s start after it.
   */
  dance: 40_000,
  /** A computer team's dance (nobody to get ready, nobody to teach): two figures and the pose, straight away. */
  danceBot: 10_000,
  /** Shanghai: time to answer the trash quiz. */
  quiz: 5_000,
  /** Seoul: the silent ten seconds. */
  silence: 10_000,
  /**
   * Waiting players' quiz: at least this long between two questions. Once it has passed, the next
   * team to land on a city brings one, about that city.
   */
  triviaEvery: 8 * 60_000,
  /** …and this long from the start of a game to its first: a short game sees the quiz before it's half over. */
  triviaFirst: 4 * 60_000,
  /**
   * …which comes up this long after the landing, once every screen has played the move and its stamp
   * (ui/ridePlan.ts: 4.2 s at the most), so the question never says where a token is going to land.
   * After a team's first visit to the city it waits for `landing` instead: the landing scene plays first.
   * What the landing asks of the table comes first too (a purchase, an auction, a vote, Rio's dance):
   * after one the waiting teams had a part in, the question leaves them this long again to see how
   * it came out. And one that had to wait never comes up sooner than this after a team's throw.
   */
  triviaLand: 4_500,
  /** Waiting players' quiz: time to answer. */
  trivia: 12_000,
  /** …then the answer and its source stay up this long. */
  triviaReveal: 6_000,
  /**
   * The team on turn when a question came up joins in once its turn is over, if at least this long
   * is left to read and answer it.
   */
  triviaJoin: 4_000,
  /**
   * The turn clock: when the team the game is waiting for does nothing on a decision for this long,
   * everyone sees a countdown…
   */
  idle: 60_000,
  /** …of this long, and then the computer makes that one move for the team (as for a dropped phone). */
  idleWarn: 15_000,
  /**
   * A throw's ride and a first visit's landing scene play on the team's phone for up to this long
   * (ui/ridePlan.ts, ui/Touchdown.tsx): the turn clock starts after them.
   */
  landing: 10_000,
  /** A team whose phones have all dropped off is played by the computer after this. */
  takeover: 15_000,
  /** Open trade offers expire. */
  offer: 90_000,
  /** A party forfeit holds the game until it's done or skipped, but never longer than this. */
  forfeitMax: 120_000,
  /** Rooms are deleted after this long with nobody around. */
  roomTtl: 3 * 24 * 3600_000,
};

/** What set off a party forfeit: a huge rent, Immigration, going broke, Seoul's silence broken, Shanghai's trash sorted wrong. */
export type PartyWhy = "rent" | "jail" | "broke" | "sound" | "quiz";

/** First right answer in the waiting players' quiz wins this. */
export const TRIVIA_PRIZE = 20;
/**
 * A wrong answer costs this (never more than the team has). Two wrong options to one right one, so
 * guessing at random breaks even: knowing pays.
 */
export const TRIVIA_WRONG = 10;

/** How many of the waiting teams' questions a phone remembers having been asked (their ids), and sends when it joins. */
export const SEEN_KEEP = 200;

export const MAX_TEAMS = 6;
export const MAX_TEAM_SIZE = 3;

export interface Settings {
  mode: Mode;
  /** Party forfeits (派对惩罚), off by default. */
  party: boolean;
  /** Travel news (旅行快讯), off by default. Missing in rooms and saves from before it. */
  news?: boolean;
  /** The waiting teams' quiz (城市抢答), on unless the host turns it off. Missing (on) in rooms and saves from before the switch. */
  trivia?: boolean;
  /** More rules (更多规则), each missing in rooms and saves from before them: the starting cash ("normal", the step-3 game's $1,500), */
  cash?: CashChoice;
  /** whether a city its visitor doesn't buy goes to auction (on), */
  auctions?: boolean;
  /** and whether each team sees only its own cash and worth until the end (off). */
  hideCash?: boolean;
  /** Tests only: ms between two of the quiz's questions instead of TIMING.triviaEvery (0: every landing on a city brings one). */
  triviaEvery?: number;
  /** One device controls every human team (the single-device demo). */
  hotseat: boolean;
  /** Tests only: end after this many rounds. */
  testRounds?: number;
  /** Tests only: multiply all room timings by this. */
  speed?: number;
  /** Tests only: the game's first dice, in order (the same throws for a before-and-after film). */
  dice?: number[];
  /** Tests only: seats in the order the teams were made, instead of drawn (the first team made throws first). */
  inOrder?: boolean;
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
  | { t: "settings"; mode?: Mode; party?: boolean; news?: boolean; trivia?: boolean; cash?: CashChoice; auctions?: boolean; hideCash?: boolean }
  | { t: "start" }
  | { t: "act"; d: number; a: Action; seat?: number }
  | { t: "manage"; k: ManageKind; at: number; seat?: number }
  | { t: "bid"; aid: number; amount: number; seat?: number }
  | { t: "quiz"; qid: number; choice: number }
  | { t: "trivia"; id: number; choice: number; seat?: number }
  /** 这题不答: this phone passes on the waiting teams' question `id` (no charge). */
  | { t: "trivia-skip"; id: number }
  /** The waiting teams' questions this phone has been asked in earlier games (their ids), sent when it connects. */
  | { t: "seen"; ids: string[] }
  | { t: "offer"; to: number; give: Offer; get: Offer; seat?: number }
  | { t: "offer-reply"; id: number; accept: boolean }
  | { t: "offer-cancel"; id: number }
  | { t: "bet"; yes: boolean }
  | { t: "autoplay"; on: boolean; seat?: number }
  | { t: "pause"; on: boolean }
  /** The party forfeit `id` is over: done (its team), or skipped (the host). */
  | { t: "forfeit"; id: number; op: "done" | "skip" }
  /** Rio: the dancing team is ready (its Start button): the countdown begins, then the lesson. */
  | { t: "dance-go" }
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
  | { t: "party-done"; seat: number; how: "done" | "skip" | "timeout" }
  | { t: "quiz"; seat: number; item: number; bin: number; choice: number | null; right: boolean }
  /** The turn clock ran out: the computer made one move for this team. */
  | { t: "idle"; seat: number }
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

/** The waiting players' quiz: a question about the city a team has just landed on, for the teams whose turn it isn't. */
export interface TriviaView {
  /** This asking of it (a room-wide number). */
  id: number;
  /** The question's own id in the bank ("cairo-01"): phones remember the ones they've been asked. */
  key: string;
  city: string;
  q: Text;
  /** In the order shown. */
  options: Text[];
  endsAt: number;
  open: boolean;
  /**
   * The team this phone answers for now (one the question is for, in the game, hasn't answered), or
   * null if this phone can't answer (its team was on turn when it came up, it answered, it skipped).
   */
  answerFor: number | null;
  /** What this phone's team picked. */
  mine: number | null;
  /** This phone said 这题不答 to it. */
  skipped: boolean;
  /** This phone's team is one of the teams the question is for (it pops up on this phone). */
  forYou: boolean;
  /** Teams that have answered. While the question is still open, every one of them got it wrong. */
  answered: number[];
  winner: number | null;
  /** Shown once the question closes: the right option, the fact (你知道吗) and where it comes from. */
  correct: number | null;
  fact: Text | null;
  source: string | null;
}

/**
 * Rio's dance, as every screen plays it. A person's team gets a ready card first: the lesson starts
 * when it presses Start (or by itself at `auto`), after a countdown. A computer team dances the short
 * one straight away. Every time a screen needs is here (a test room's are shorter).
 */
export interface DanceView {
  seat: number;
  /** Server time the lesson's first beat falls, or null while the team hasn't started it. */
  at: number | null;
  /** The countdown every screen shows before `at`, in ms (0: none, a computer team's). */
  count: number;
  /** The lesson's length in ms: the judges' buttons light up at `at + ms`. */
  ms: number;
  /** The short lesson (a computer team's): two figures and the pose. */
  short: boolean;
  /** While it waits for Start: the server time it starts by itself, or null if it never does (the one-phone demo). */
  auto: number | null;
}

export interface ForfeitView {
  id: number;
  seat: number;
  why: PartyWhy;
  /** Index into FORFEITS (party.ts). */
  dare: number;
  /** Server time it came up. */
  at: number;
  /** More forfeits waiting their turn after this one. */
  waiting: number;
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
  /** The host paused the game. */
  paused: boolean;
  /** When the game stopped (a pause, or a party forfeit holding it), or null: countdowns stand still from here. */
  frozenAt: number | null;
  /** The party forfeit holding the game until its team has done it (or the host skips it). */
  forfeit: ForfeitView | null;
  deadline: number | null;
  /**
   * The turn clock for the decision up now: when its countdown starts (`warnAt`, server time) and
   * when the computer makes the move for `seat` (`at`). Null when there's none (computer teams, a
   * question on its own clock, the one-phone demo).
   */
  turnClock: { seat: number; warnAt: number; at: number } | null;
  silenceUntil: number | null;
  auction: AuctionView | null;
  quiz: QuizView | null;
  trivia: TriviaView | null;
  trades: TradeView[];
  /** Seats that have answered the current whole-table decision. */
  answered: number[];
  /** Dubai: the top Journey cards, only for the seat looking. */
  peek: number[] | null;
  /** Rio: a team's dance, the judges' buttons waiting until it's over. */
  dance: DanceView | null;
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

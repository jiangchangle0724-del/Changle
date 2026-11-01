/**
 * Wire protocol shared by the room server (Cloudflare Durable Object) and the phones.
 * Every text a phone shows comes as a bilingual T so each phone renders its own language.
 */
import type { T } from "../i18n";
import type { Rank, Suit } from "../data/rogue13";

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
export const MAX_SEATS = 15;

export type GameId =
  | "truth"
  | "rogue"
  | "superlatives"
  | "king"
  | "postit"
  | "limbo"
  | "prompts"
  | "euchre"
  | "dice"
  | "freeze"
  | "wheel"
  | "undercover"
  | "tune"
  | "punchline"
  | "draw"
  | "trip";
/** Every game, in the same spectrum order as the front door's board. */
export const ONLINE_GAMES: GameId[] = ["truth", "rogue", "trip", "superlatives", "king", "postit", "limbo", "prompts", "euchre", "dice", "freeze", "wheel", "undercover", "tune", "punchline", "draw"];
export const ONLINE_MIN: Record<GameId, number> = {
  truth: 2,
  rogue: 2,
  superlatives: 3,
  king: 3,
  postit: 2,
  limbo: 2,
  prompts: 2,
  euchre: 2,
  dice: 2,
  freeze: 2,
  wheel: 1,
  undercover: 4,
  tune: 2,
  punchline: 3,
  draw: 2,
  trip: 1,
};

export type PenaltyKind = "sip" | "two" | "full" | "everyone" | "safe";
export type Reaction = "cheers" | "nice" | "haha" | "drink";
export const REACTIONS: Reaction[] = ["cheers", "nice", "haha", "drink"];
export type SpinScope = "lobby" | "truth" | "wheel";

/** uid/av/ac: the seat's changle profile when signed in (avatar version and color). */
/** `fg`: the seat's figure cut out for the stages, by version (at /figure/:uid/cut); 0 or missing for none. */
export type SeatView = { id: string; name: string; on: boolean; uid?: string; av?: number; ac?: number; fg?: number; watch?: boolean };

export type Fx =
  | "start"
  | "card"
  | "shuffle"
  | "camera"
  | "nose"
  | "wc"
  | "dice"
  | "reveal"
  | "correct"
  | "crown"
  | "timeup"
  | "win"
  | "collide"
  | "grab"
  | "called"
  | "buzz"
  | "wrong"
  | "award"
  | "play"
  | "trick"
  | "freeze"
  | "out"
  | "level";

export type PenaltyEvent = { k: "penalty"; id: string; who: string[]; kind: PenaltyKind; note?: T; buddy?: string };
export type RoomEvent =
  | PenaltyEvent
  | { k: "drank"; pid: string; pen: string }
  | { k: "react"; pid: string; r: Reaction }
  | { k: "spin"; scope: SpinScope; by: string; index: number; delta: number; duration: number }
  | { k: "join"; pid: string }
  | { k: "left"; pid: string }
  | { k: "host"; pid: string }
  | { k: "fx"; fx: Fx; pid?: string; data?: number[] };

/* ---------- per-game views (what one phone is allowed to see) ---------- */

export type RoguePhase = "draw" | "pick" | "done" | "garden-pick" | "garden" | "grab" | "sevens-start" | "sevens";
export type RogueHolders = { buddy?: string; camera?: string; nose?: string; wc?: string; trouble?: string };
export type RogueView = {
  id: "rogue";
  turn: string;
  drawer: string | null;
  card: { rank: Rank; suit: Suit } | null;
  left: number;
  phase: RoguePhase;
  holders: RogueHolders;
  wcUsed: boolean;
  reshuffled: boolean;
  garden: { kind: number; speaker: string; endsAt: number; said: number } | null;
  grab: { next: number; claimed: Record<string, number>; endsAt: number } | null;
  sevens: { n: number; speaker: string; endsAt: number; log: { pid: string; n: number; pass: boolean }[] } | null;
  interrupt: { kind: "camera"; by: string; phase: "freeze" | "judge"; endsAt: number } | { kind: "nose"; by: string; endsAt: number; tapped: string[] } | null;
};

export type TruthView = {
  id: "truth";
  heat: 1 | 2;
  phase: "spin" | "choose" | "card";
  spinner: string;
  chosen: string | null;
  revealAt: number;
  kind: "truth" | "dare" | null;
  prompt: T | null;
};

export type UcRole = "civ" | "uc" | "blank";
export type UndercoverView = {
  id: "undercover";
  phase: "setup" | "word" | "talk" | "vote" | "reveal" | "end";
  uc: number;
  blank: boolean;
  maxSide: number;
  round: number;
  inGame: string[];
  alive: string[];
  ready: string[];
  order: string[];
  speaker: number;
  endsAt: number;
  desc: Record<string, string>;
  voted: string[];
  myVote: string | null;
  votes: Record<string, string> | null;
  out: { pid: string; role: UcRole } | null;
  tie: boolean;
  winner: "civ" | "uc" | null;
  myWord: T | null;
  isBlank: boolean;
  roles: Record<string, UcRole> | null;
  pair: { civ: T; uc: T } | null;
};

export type DrawView = {
  id: "draw";
  phase: "pick" | "draw" | "result";
  drawer: string;
  d: 1 | 2 | 3;
  endsAt: number;
  hint: { zh: number; en: string } | null;
  word: T | null;
  guesses: { pid: string; text: string; ok: boolean }[];
  solved: string[];
  scores: Record<string, number>;
  round: number;
};

export type KingView = {
  id: "king";
  phase: "deal" | "crown" | "command";
  round: number;
  inRound: string[];
  ready: string[];
  pulledIds: string[];
  king: string | null;
  cmd: { text: T; nums: number[] } | null;
  stepped: Record<string, string>;
  refused: string[];
  myToken: number | "K" | null;
  pulled: boolean;
  count: number;
};

export type PromptsView = {
  id: "prompts";
  mode: "never" | "likely";
  phase: "draw" | "answer" | "reveal";
  reader: string;
  card: T | null;
  endsAt: number;
  answered: string[];
  mine: boolean | string | null;
  result: { yes: string[]; counts: null; votes: null; top: null } | { yes: null; counts: Record<string, number>; votes: Record<string, string>; top: string[] } | null;
  left: number;
};

export type DiceOutcome = "seven" | "eight" | "nine" | "ones" | "safe";
export type DiceView = {
  id: "dice";
  turn: string;
  level: number;
  phase: "roll" | "result" | "assign";
  dice: [number, number];
  roll: number;
  rolledAt: number;
  outcome: DiceOutcome | null;
};

export type WheelSliceKind = "drink" | "safe" | "truth" | "dare" | "again" | "custom";
export type WheelSliceView = { id: string; label: T; kind: WheelSliceKind };
export type WheelView = {
  id: "wheel";
  turn: string;
  slices: WheelSliceView[];
  phase: "spin" | "spinning" | "result" | "pick" | "prompt";
  result: number | null;
  revealAt: number;
  prompt: T | null;
  promptKind: "truth" | "dare" | null;
};

export type SuperView = {
  id: "superlatives";
  phase: "vote" | "reveal" | "ceremony";
  round: number;
  total: number;
  title: T;
  /** written by the host rather than drawn from the deck */
  custom: boolean;
  endsAt: number;
  voted: string[];
  myVote: string | null;
  counts: Record<string, number> | null;
  winners: string[];
  awards: Record<string, T[]>;
};

export type PunchAnswer = {
  text: string;
  /** the rest is filled in at the result */
  by: string | null;
  votes: number | null;
  voters: string[] | null;
  points: number | null;
  safety: boolean | null;
};
export type PunchMatch = {
  k: number;
  /** matchup number within the round (1-based) and how many there are */
  n: number;
  of: number;
  final: boolean;
  prompt: T;
  /** answers show from the presentation on; names, votes and points at the result */
  answers: PunchAnswer[];
  canVote: boolean;
  /** how many answers this phone may pick (0 for a writer in this matchup) */
  maxVotes: number;
  myVotes: number[];
  /** which answer is this phone's own, if any */
  mine: number | null;
  /** who has voted so far (not what for) */
  voted: string[];
  /** how many may vote */
  voters: number;
  sweep: number | null;
  /** one writer left it blank: the other took it without a vote */
  forfeit: boolean;
};
export type PunchView = {
  id: "punchline";
  phase: "write" | "present" | "vote" | "result" | "scores" | "end";
  /** 1 and 2 are head-to-head rounds; the last round everyone answers the same prompt */
  round: number;
  rounds: number;
  /** server time this phase began: the show's animations count from here */
  phaseAt: number;
  endsAt: number;
  /** counts every change of phase (a host tap names it, so a double tap can't skip one) */
  step: number;
  /** who writes this game; everyone else at the table is the audience */
  players: string[];
  audience: string[];
  mine: { k: number; prompt: T; done: boolean; text: string; safety: boolean }[];
  writing: string[];
  match: PunchMatch | null;
  scores: Record<string, number>;
  /** scores when this round started */
  before: Record<string, number>;
  winners: string[] | null;
  last: string[] | null;
};

export type PostitReply = "yes" | "no" | "maybe";
export type PostitView = {
  id: "postit";
  phase: "write" | "play" | "end";
  endsAt: number;
  order: string[];
  /** write phase: whose note this phone writes */
  myTarget: string | null;
  written: string[];
  /** everyone's note; this phone's own stays null until it is guessed (or the game ends) */
  notes: Record<string, T | null>;
  turn: string;
  asking: string | null;
  replies: Record<string, PostitReply>;
  guess: { by: string; text: string; ok: boolean; at: number } | null;
  solved: string[];
  tries: Record<string, number>;
};

export type FreezeView = {
  id: "freeze";
  phase: "ready" | "dance" | "freeze" | "result" | "end";
  mode: "out" | "drink";
  round: number;
  groove: string;
  musicAt: number;
  stopAt: number;
  judgeAt: number;
  alive: string[];
  out: string[];
  moved: string[];
  sensors: string[];
  winner: string | null;
  /** rolls into the next round by itself */
  auto: boolean;
};

export type LimboView = {
  id: "limbo";
  phase: "ready" | "go" | "result" | "end";
  level: number;
  /** how far back each player must lean, in degrees */
  angle: number;
  /** the calypso started here (server time) and keeps going level after level */
  musicAt: number;
  startAt: number;
  endsAt: number;
  alive: string[];
  passed: string[];
  failed: string[];
  out: string[];
  best: Record<string, number>;
  sensors: string[];
  winner: string | null;
};

export type TuneView = {
  id: "tune";
  mode: "songs" | "melody" | "dj";
  /** songs mode: what the table listens to, "language:category" (see SongPool in shared/songs.ts) */
  pool: string;
  /** everyone answers at once from four titles, no buzzer */
  quiz: boolean;
  phase: "ready" | "listen" | "answer" | "reveal" | "end";
  round: number;
  total: number;
  /** index into the tune list, sent at the reveal (melody mode); -1 before that */
  tune: number;
  /** the notes every phone plays (melody mode) */
  clip: { bpm: number; notes: string; up: number } | null;
  /** server times when each longer clip starts playing */
  stageAt: number[];
  endsAt: number;
  buzzer: string | null;
  answerEndsAt: number;
  /** melody mode: four tunes to pick from once you buzz (from the start in a quiz) */
  options: number[] | null;
  locked: string[];
  correct: string | null;
  scores: Record<string, number>;
  last: { pid: string; ok: boolean } | null;
  /** pauses the clock while someone answers */
  pausedAt: number | null;
  /** songs mode: the 30-second preview every phone plays (not which song it is) */
  audio: string | null;
  /** server time the preview's first second plays (moves on after a pause) */
  startAt: number;
  /** ms into the preview where the reveal picks up */
  revealPos: number;
  /** the next preview, so phones can load it while this one plays */
  pre: string | null;
  /** four titles to pick from once you buzz (from the start in a quiz) */
  choices: { id: number; t: string; a: string; ae: string }[] | null;
  /** the song, once it's revealed */
  song: { id: number; t: string; a: string; ae: string; art: string; url: string; y: number; g: number; l: number } | null;
  /** songs mode: who sings this one (1 a man, 2 a woman, 3 a mixed group, 0 unknown): the stage shows it */
  singer: number;
  /** songs mode: how the song feels ("sad", "love", "hype", "rock", "groove", "classic" or ""), for the stage */
  mood: string;
  /** the pool the host picked has no songs: pick another */
  noSongs: boolean;
  /** quiz: who has answered (not what), this phone's own pick, and at the reveal everyone who got it */
  answered: string[];
  mine: number | null;
  right: string[];
};

export type ESuit = "S" | "H" | "D" | "C";
/** "9S", "10H", "JD", "QC", "KS", "AH" */
export type ECard = string;
export type EPlay = { seat: number; card: ECard };
export type EBid = { seat: number; act: "pass" | "order" | "call"; suit?: ESuit; alone?: boolean };
export type EuchreSeatView = { pid: string | null; bot: T | null };
export type EuchreView = {
  id: "euchre";
  phase: "setup" | "bid1" | "bid2" | "discard" | "play" | "trick" | "hand" | "end";
  /** four seats; seats 0 and 2 are one team, 1 and 3 the other */
  seats: EuchreSeatView[];
  mySeat: number | null;
  hand: ECard[];
  counts: number[];
  dealer: number;
  turn: number;
  upcard: ECard | null;
  trump: ESuit | null;
  maker: number | null;
  alone: boolean;
  sitter: number | null;
  bids: EBid[];
  trick: EPlay[];
  lastTrick: { plays: EPlay[]; winner: number } | null;
  tricks: [number, number];
  score: [number, number];
  legal: ECard[];
  result: { team: 0 | 1; points: number; makers: 0 | 1; euchre: boolean; march: boolean; alone: boolean } | null;
  winner: 0 | 1 | null;
  handNo: number;
  target: number;
};

/**
 * 到此一游 runs on its own server at changle.ca/trip. The table only knows the room there: the host's
 * phone opens it, and every phone and the big screen follow (no secrets, so the big screen sees it too).
 */
export type TripView = {
  id: "trip";
  /** the room's 4-digit number at changle.ca/trip, once the host has opened one */
  code: string | null;
  at: number;
};

export type GameView =
  | TripView
  | RogueView
  | TruthView
  | UndercoverView
  | DrawView
  | KingView
  | PromptsView
  | DiceView
  | WheelView
  | SuperView
  | PunchView
  | PostitView
  | FreezeView
  | LimboView
  | TuneView
  | EuchreView;

export type RoomView = {
  code: string;
  you: string;
  host: string;
  seats: SeatView[];
  penalty: string;
  front: number;
  game: GameView | null;
  /** which game is on, even when this view leaves its details out (a big screen) */
  playing: GameId | null;
  /** big screens (a TV or computer) showing this table right now */
  screens: number;
  v: number;
};

/* ---------- messages ---------- */

export type GameAction = { x: string; [k: string]: unknown };

export type Action =
  | { a: "spin"; scope: SpinScope; index: number; delta: number; duration: number }
  | { a: "start"; game: GameId }
  | { a: "end" }
  | { a: "kick"; pid: string }
  /** just watch (or play again): yourself, or the host for anyone */
  | { a: "watch"; pid?: string; on: boolean }
  | { a: "leave" }
  | { a: "makeHost"; pid: string }
  | { a: "rename"; name: string }
  | { a: "react"; r: Reaction }
  | { a: "drank"; pen: string }
  | { a: "buddy"; pen: string }
  | { a: "penalty"; text: string }
  | { a: "g"; g: GameAction };

/** Drawing ops; coordinates are 0..1 of the plate, width is a fraction of the plate size. */
export type StrokeOp =
  | { o: "b"; id: string; c: string; w: number; p: number[] }
  | { o: "p"; id: string; p: number[] }
  | { o: "e"; id: string }
  | { o: "u" }
  | { o: "c" };
export type Stroke = { id: string; c: string; w: number; p: number[] };

export type ClientMsg =
  | { t: "hello"; pid: string; name: string; create?: boolean; auth?: string; screen?: boolean; game?: string }
  | { t: "act"; a: Action }
  | { t: "stroke"; op: StrokeOp }
  | { t: "ping"; c: number };

export type ErrorCode = "no-room" | "exists" | "full" | "kicked" | "bad" | "busy" | "paused" | "banned";

export type ServerMsg =
  | { t: "room"; room: RoomView; now: number }
  | { t: "event"; e: RoomEvent; now: number }
  | { t: "stroke"; op: StrokeOp }
  | { t: "strokes"; list: Stroke[] }
  | { t: "pong"; c: number; s: number }
  | { t: "error"; code: ErrorCode };

export const INK_COLORS = ["#f5f4fd", "#ff5fa2", "#31b9ff", "#f5df3b", "#4be38f"];

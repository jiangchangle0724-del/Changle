/**
 * Wire protocol shared by the room server (Cloudflare Durable Object) and the phones.
 * Every text a phone shows comes as a bilingual T so each phone renders its own language.
 */
import type { T } from "../i18n";
import type { Rank, Suit } from "../data/rogue13";
import type { Dancer } from "./dj/dance";
import type { CrateSong, DeckState, DjPhase, Mix, Source, SongReq, StyleId, Track } from "./dj/types";
import type { LcColor, LcPending } from "./lastcard/cards";
import type { StraightFaceView } from "./straightface/types";

export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;
export const MAX_SEATS = 15;

export type GameId =
  | "truth"
  | "drama"
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
  | "trip"
  | "dj"
  | "hide"
  | "lastcard"
  | "straightface";
/**
 * Every game, in the same spectrum order as the front door's board. New games that aren't on the
 * board yet go on the end (a table's `front` is an index into this list).
 */
export const ONLINE_GAMES: GameId[] = ["truth", "rogue", "trip", "superlatives", "king", "drama", "postit", "limbo", "prompts", "euchre", "dice", "freeze", "wheel", "undercover", "tune", "punchline", "draw", "dj", "hide", "lastcard", "straightface"];
export const ONLINE_MIN: Record<GameId, number> = {
  truth: 2,
  drama: 3,
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
  dj: 1,
  hide: 2,
  lastcard: 2,
  straightface: 3,
};

export type PenaltyKind = "sip" | "two" | "full" | "everyone" | "safe";
export type Reaction = "cheers" | "nice" | "haha" | "drink";
export const REACTIONS: Reaction[] = ["cheers", "nice", "haha", "drink"];
export type SpinScope = "lobby" | "truth" | "wheel";

/** uid/av/ac: the seat's changle profile when signed in (avatar version and color). */
/** `fg`: the seat's figure cut out for the stages, by version (at /figure/:uid/cut); 0 or missing for none. */
/** `fr`: a reward frame round their face ("gold": a game they wished for went live). */
export type SeatView = { id: string; name: string; on: boolean; uid?: string; av?: number; ac?: number; fg?: number; fr?: string; watch?: boolean };

export type Fx =
  | "start"
  | "card"
  | "shuffle"
  | "camera"
  | "nose"
  | "wc"
  | "trouble"
  | "buddy"
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
  | "level"
  | "fire"
  | "cold"
  | "dance"
  | "drop"
  | "ask"
  | "req"
  | "pad"
  | "song"
  | "mix";

/** `say`: the penalty itself when the game names it ("15 push-ups"), shown instead of the drink. */
/** `times`: with the table's own penalty, how many times it's done (7-8-9's pot); none is once ("two" is twice). */
export type PenaltyEvent = { k: "penalty"; id: string; who: string[]; kind: PenaltyKind; note?: T; buddy?: string; say?: T; times?: number };
/**
 * How many times the table's own penalty is done: as the game says, else twice for two sips, once
 * otherwise. A forfeit the game names itself (`say`, Drama's "10 squats") is done once.
 */
export function timesOf(p: { kind: PenaltyKind; times?: number; say?: unknown }): number {
  return p.times ?? (p.kind === "two" && !p.say ? 2 : 1);
}
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
  /** the camera and the nose rest a minute after each use: when each may go again (ms) */
  cool?: { camera?: number; nose?: number };
  /** `last`: who finished just before `speaker` (the word the judge may be reacting to) */
  garden: { kind: number; speaker: string; endsAt: number; said: number; last?: string } | null;
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
  /** How long the word is: its Chinese characters and any letters in it (深夜emo is 2 and 3), the English as blanks. */
  hint: { zh: number; latin: number; en: string } | null;
  word: T | null;
  guesses: { pid: string; text: string; ok: boolean }[];
  solved: string[];
  scores: Record<string, number>;
  round: number;
  /** The drawer who left before their round was over: no penalty, and `drawer` already holds who draws next. */
  left: string | null;
  /** Nobody got it because nobody was left to guess (everyone else left): no penalty. */
  alone: boolean;
};

/** 你画我猜: the longest guess a phone sends and the rooms server keeps (every answer fits, with room to spare). */
export const DRAW_GUESS_MAX = 40;
/** 你画我猜: one round's clock, online as on one phone (the game's card says a minute). */
export const DRAW_ROUND_MS = 60_000;

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
  /** With the table's own penalty the glass is a pot of it: how many times it holds (from 1). */
  pot: number;
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
  /** this ballot's number: a vote names it (`g: { x: "vote", target, ballot }`), and one for an older ballot is dropped */
  ballot: number;
  endsAt: number;
  /** when the winner's stamp (or the ceremony's toast) lands, on the room's clock; 0 once it has: the host moves on only after */
  stampAt: number;
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
  /** everyone else has theirs: this is `turn`'s last chance before the glass (absent from a server not yet updated) */
  final?: boolean;
  /** at the end: who drinks the glass, or null when nobody does (absent from a server not yet updated) */
  last?: string | null;
  /** where the notes nobody writes come from: a one-phone deck's id, or "mix" (absent from a server not yet updated: the mix) */
  pick?: string;
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

/** Limbo's variants of a bar: classic, hold steady (稳住), moving bar (跟着动的杆), tilt through (歪着过). */
export type LimboKind = "classic" | "steady" | "moving" | "tilt";

/** One Limbo bar: which variant it is and what it asks for. The rules make it: shared/engine/games/limbo.ts. */
export type LimboBar = {
  kind: LimboKind;
  /** steady: how long to hold perfectly still, in ms */
  hold: number;
  /** tilt: how far to tilt sideways as well, in degrees; below 0 is to the left */
  side: number;
  /** moving: the bar sways up `swing` degrees from the bar's angle and back, once every `period` ms */
  swing: number;
  period: number;
  /** moving: how long it moves after the start, in ms; then each phone says whether it kept up */
  moveMs: number;
};

export type LimboView = {
  id: "limbo";
  phase: "ready" | "go" | "result" | "end";
  /**
   * classic: lean past the bar; steady, moving, tilt: those variants every bar; party: a random one
   * of the four each bar; blind: lean to the target without seeing your own angle
   */
  mode: LimboKind | "party" | "blind";
  /** the bar now (blind: a classic one) */
  bar: LimboBar;
  /** blind: who has locked an angle this round */
  locked: string[];
  /** blind: everyone's locked angle, shown once the round is over */
  locks: Record<string, number>;
  level: number;
  /** how far back each player must lean, in degrees (blind: this round's target; moving: the deepest the bar goes) */
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
  /** songs mode: the four titles come without their singers, the wrong ones by the same singer */
  hard: boolean;
  /** songs mode: one second first, then three, then the rest (each from `hook`) */
  snap: boolean;
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
  /** one second: ms into the preview where every snippet starts */
  hook: number;
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
 * 最后一张 · Last Card: what just happened at the table, newest last (`i` counts up). Only cards that
 * went face up on the pile are named; a card drawn stays unnamed to everyone.
 */
export type LcLog =
  | { i: number; k: "deal"; n: number }
  | { i: number; k: "play"; p: string; c: number; col?: LcColor }
  | { i: number; k: "draw"; p: string }
  | { i: number; k: "keep"; p: string }
  | { i: number; k: "pass"; p: string }
  | { i: number; k: "take"; p: string; n: number }
  | { i: number; k: "skip"; p: string }
  | { i: number; k: "rev"; d: 1 | -1 }
  | { i: number; k: "call"; p: string }
  | { i: number; k: "catch"; p: string; by: string }
  | { i: number; k: "auto"; p: string }
  | { i: number; k: "win"; p: string }
  | { i: number; k: "shuffle" };

/**
 * 最后一张 · Last Card (rules: shared/engine/games/lastcard.ts, cards: shared/lastcard/cards.ts). A
 * hand is secret: `hand`, `legal` and `drawn` are this phone's own and empty for everyone else, the
 * big screen included; the table sees only how many cards each player holds.
 */
export type LastCardView = {
  id: "lastcard";
  /** setup: the host picks the house rules and deals; play; round: someone went out; end: the match is won */
  phase: "setup" | "play" | "round" | "end";
  /** stacking: a +2 answers a +2 and a +4 a +4, and whoever can't takes the lot */
  stack: boolean;
  /** rounds to win the match; 0 is no target (just play rounds) */
  target: number;
  /** this round's number (0 before the first deal) */
  round: number;
  /** who is in this round, in turn order (in setup: who the deal would take, 10 at most) */
  order: string[];
  /** cards each player holds */
  counts: Record<string, number>;
  /** this phone's own cards, sorted; empty for anyone not in the round */
  hand: number[];
  /** which of `hand` may be played now (only on this phone's turn) */
  legal: number[];
  /** the card this phone just drew and may still play (only to its owner, on its turn) */
  drawn: number | null;
  /** the face-up card on the pile, and the colour in force (a wild's is the one picked) */
  top: number | null;
  color: LcColor | null;
  /** whose turn it is, during play */
  turn: string | null;
  /** the way play goes round `order`: 1 forward, -1 back */
  dir: 1 | -1;
  /** cards left in the draw pile, and how many are on the discard pile */
  pile: number;
  under: number;
  /** stacking: the cards the player on turn takes unless they answer with another of `pendingKind` */
  pending: number;
  pendingKind: LcPending;
  /** called last card: safe at one card */
  called: string[];
  /** down to one card without calling: anyone else can catch them until the next player moves */
  open: string | null;
  /** counts the turns: a phone's move names the turn it was made on, so a late or doubled tap lands nowhere */
  tn: number;
  log: LcLog[];
  /** rounds won, by player */
  wins: Record<string, number>;
  /** who went out this round; who won the match */
  winner: string | null;
  champ: string | null;
  /** at a round's end: who was left holding the most cards (they drink) */
  most: string[];
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

/**
 * 藏在人群里 · Hide in the Crowd runs on its own server at changle.ca/hide, like 到此一游: the table
 * only knows the room there. The host's phone opens it, and every phone and the big screen follow.
 */
export type HideView = {
  id: "hide";
  /** the room's 4-digit number at changle.ca/hide, once the host's phone has opened one */
  code: string | null;
  at: number;
};

/**
 * 戏精大赏: a few players act a scene, one of them secretly the culprit; the rest guess who and
 * rate the acting. An actor's own card (`me`) reaches only that actor until the reveal.
 */
export type DramaCard = { secret: T; culprit: boolean; task: T };
/** Whose everyday a scene is set in: Chinese, Canadian, South Asian, Filipino, Korean, Japanese, Iranian, European. */
export type DramaGroupKey = "cn" | "ca" | "sa" | "ph" | "kr" | "jp" | "ir" | "eu";

export type DramaView = {
  id: "drama";
  phase: "setup" | "brief" | "act" | "vote" | "reveal" | "end";
  /** a scene with a hidden culprit, a quick acting duel, or a famous film or TV moment */
  mode: "show" | "pk" | "classic";
  level: "all" | "spicy";
  diff: "easy" | "hard";
  /** what the losers do: drink, exercise, or a forfeit */
  pen: "drink" | "move" | "prank";
  round: number;
  total: number;
  /** `group`: whose everyday it's set in (none: anyone's) */
  scene: { id: string; kind: string; title: T; setup: T; ask: T; culprit: T; group?: DramaGroupKey } | null;
  /** who plays whom, in order (a famous scene: `brief` is how to play the part, `first` its opening line) */
  cast: { pid: string; role: T; brief: T; first?: T }[];
  pk: { line: T; styles: Record<string, T> } | null;
  /** this phone's own card while acting */
  me: DramaCard | null;
  ready: string[];
  endsAt: number;
  /** the scene's length, for the timer */
  actMs: number;
  twistAt: number;
  /** the twist, once it has landed */
  twist: T | null;
  voted: string[];
  myVote: { guess: string | null; stars: Record<string, number> } | null;
  result: {
    culprit: string | null;
    caught: boolean;
    counts: Record<string, number>;
    /** average stars, one decimal */
    stars: Record<string, number>;
    cards: Record<string, DramaCard>;
    best: string[];
    losers: string[];
    right: string[];
    /** the penalty drawn for the round (exercise or forfeit); null when it's a drink */
    penalty: T | null;
    /** points each player got this round */
    gained: Record<string, number>;
    /** a monologue: which of `options` was the actor's real secret */
    answer?: number | null;
  } | null;
  scores: Record<string, number>;
  /** best-actor awards so far */
  awards: Record<string, number>;
  /** who wrote the scene on now: someone at the table (`pid`), or a name from the public library */
  credit: { pid: string | null; name: string } | null;
  /** scenes written at this table: titles only until they are played */
  mine: { id: string; title: T; by: string | null; played: boolean }[];
  /** how many public-library scenes this table has drawn */
  lib: number;
  /** who wants to act in the next scene, and who only wants to watch (no entry: either) */
  want?: Record<string, "act" | "watch">;
  /** the next scene's cast: `lo` to `hi` actors (one number once anyone volunteers); `ok` false when nobody can go on */
  next?: { lo: number; hi: number; ok: boolean; auto: boolean };
  /** nobody is watching: the actors vote on each other */
  peer?: boolean;
  /** a monologue: three secrets, one of them the actor's, for the audience to choose from */
  options?: T[] | null;
  /** 名场面: the set the host picked (Chinese film and TV, or English) */
  cset?: "zh" | "en";
  /** whose stories come first: the groups the host picked (none: everyone's only) */
  groups?: DramaGroupKey[];
  /** the famous scene on now; `see` is what to search for to watch the original */
  classic?: { id: string; set: "zh" | "en"; show: T; year: number; title: T; setup: T; beats: T[]; see: string } | null;
};

/** 打碟 · DJ Booth (the shapes behind it: src/shared/dj/types.ts). */
export type DjView = {
  id: "dj";
  phase: DjPhase;
  /** server time the music started (0 before); the phase's start; when it moves on by itself (0: it doesn't) */
  liveAt: number;
  phaseAt: number;
  nextAt: number;
  /** the set ends itself here (0 before the music starts) */
  capAt: number;
  /** what the speaker plays */
  mix: Mix;
  /** 0 to 1: how hard the music should hit now */
  energy: number;
  source: Source;
  /** the latest 🔥 presses (who and when, server time), oldest first */
  fires: { pid: string; at: number }[];
  /** 🔥 per player, all night */
  total: Record<string, number>;
  /** the latest ❄️ presses (who and when, server time), oldest first */
  colds: { pid: string; at: number }[];
  /** everyone's style knobs, -1 (less) to 1 (more); a style at 0 is left out */
  knobs: Record<string, Partial<Record<StyleId, number>>>;
  /** the latest drop requests (who and when, server time), oldest first */
  drops: { pid: string; at: number }[];
  /** songs asked for, oldest first; see DjTrack */
  queue: DjTrack[];
  /**
   * This table may try Lyria RealTime: one of the site owner's accounts has a seat at it (the
   * private test, CONTRACTS.md "Lyria"). The rooms server checks again before it opens a stream.
   */
  lab: boolean;
  /** which set this is (a new one after the host says "again") */
  set: number;
  /** the beginner deck: the two decks, the fader, the pads, the build-up and the drop */
  deck: DeckView;
  /** the host's own songs on the speaker's computer: how many, a count of their changes (the list
   *  itself: GET /room/CODE/data), and the two on the decks by name (a night of them) */
  crateN: number;
  crateV: number;
  /** the host wants the night on their songs (they play once the big screen has some) */
  mine: boolean;
  onDecks: { a: CrateSong | null; b: CrateSong | null };
  /** 报幕: the big screen says who a song asked for is from (the host's switch) */
  voice: boolean;
  /** the 歌单 plays in a random order (the host's switch), else first come, first played */
  shuffle: boolean;
  /** 点歌模式 (the host's switch): no build-up or DROP, the songs asked for one after another */
  juke: boolean;
  /** the song's video over the whole TV (anyone's switch), else in its corner */
  full: boolean;
  /** 跟着跳: each dancer's night, and the floor's combo (0 to 1; full: fireworks) */
  dance: Record<string, Dancer>;
  combo: number;
  /** the speaker's reports added up this night (the recap, 今晚回顾: how the sound held up) */
  speaker: { stalls: number; resets: number; seconds: number };
};

/** The beginner deck as every phone and screen sees it (CONTRACTS.md, "The beginner deck"). */
export type DeckView = Omit<DeckState, "pending" | "padAt" | "voteAt" | "reqAt" | "mixAt" | "gridFrom" | "speakerAt" | "decksAt" | "srcAt" | "crateAt" | "reqs" | "up" | "now" | "heard"> & {
  reqs: ReqView[];
  up: ReqView | null;
  now: ReqView | null;
  heard: ReqView[];
};

/** A song asked for by name, as a phone or screen reads it: a name the player typed (not picked from
 *  the song list) is null to everyone but them and the host. */
export type ReqView = Omit<SongReq, "text"> & { text: string | null };

/**
 * A song in the booth's queue as one phone or screen sees it. What a player wrote (`ask`) is null
 * for everyone but them and the host until it has passed the text check, and only they and the
 * host see a refused one at all: nothing a player types reaches the big screen unchecked.
 */
export type DjTrack = Omit<Track, "ask"> & { ask: string | null };

export type GameView =
  | DjView
  | DramaView
  | TripView
  | HideView
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
  | EuchreView
  | LastCardView
  | StraightFaceView;

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

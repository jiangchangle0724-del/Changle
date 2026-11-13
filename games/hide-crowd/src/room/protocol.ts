// What the room's server and the pages say to each other. Every word a player reads is chosen by
// the page (src/client/i18n.ts) from these keys and numbers, in its own language.
import type { ArenaId, AwardKey, MomentKind, Pose } from "../engine";

export type Lang = "zh" | "en";
/** a phone in someone's hand, or a big screen (a TV, a computer, a phone mirrored to a TV) */
export type Role = "player" | "screen";

export type ClientMsg =
  | { t: "move"; x: number; y: number }
  | { t: "punch" }
  | { t: "blend" }
  /** a passer-by across the crowd throws a punch at nothing (twice a round) */
  | { t: "distract" }
  | { t: "vote"; arena: ArenaId }
  /** the host: start a round (from the lobby, or again after one) */
  | { t: "start" }
  /** the host: back to the lobby after a round (to pick another arena) */
  | { t: "lobby" }
  /** the host: turn the round's penalty on or off */
  | { t: "penalties"; on: boolean }
  /** the host: everyone goes back to the changle.ca table */
  | { t: "end" }
  | { t: "leave" }
  | { t: "ping" };

export type ServerMsg =
  | { t: "view"; view: RoomView }
  | { t: "fatal"; key: "noRoom" | "full" | "identity" }
  | { t: "pong"; now: number };

export interface PlayerView {
  name: string;
  online: boolean;
  host: boolean;
  /** playing the round that's on (false: joined during it, plays the next) */
  inRound: boolean;
  /** this phone */
  you: boolean;
  /** tags landed this round */
  score: number;
  /** times spotted (tagged) this round */
  tagged: number;
}

/**
 * One body in the crowd, as every screen draws it. Nothing here says who is a player: the list is
 * in a shuffled order, and only a phone's own body is marked (`me`), on that phone.
 */
export interface AvatarView {
  x: number;
  y: number;
  /** facing, in radians */
  f: number;
  /** velocity */
  vx: number;
  vy: number;
  p: Pose;
  me?: 1;
  /** once the round is over: the player in this body (no body has one while the round is on) */
  n?: string;
  /** once the round is over: this body won it */
  w?: 1;
}

export interface EventView {
  id: number;
  t: "tag" | "foul" | "swing" | "hide" | "bite" | "feast" | "decoy" | "over";
  /** bite: the night market's stall that was tasted (everyone sees which; only the taster's phone sees byYou) */
  stall?: number;
  /** this phone did it (a tag, a foul, a miss) or it happened to this phone's player (slipped away) */
  byYou: boolean;
  /** this phone's player was tagged */
  onYou: boolean;
}

export interface MeView {
  punchReadyAt: number;
  blendReadyAt: number;
  /** top speed now, for predicting your own body between frames */
  maxSpeed: number;
  /** distractions left this round */
  distracts: number;
  /** the night market: the stalls you've tasted since your last feast (one bit each), the one you're tasting now (-1: none) and how far along (0 to 1) */
  bites: number;
  at: number;
  tasting: number;
}

export interface GameView {
  phase: "playing" | "over";
  arena: ArenaId;
  drift: { x: number; y: number };
  endsAt: number;
  remainingMs: number;
  scoreToWin: number;
  avatars: AvatarView[];
  events: EventView[];
  /** this phone's player, when it plays this round */
  me: MeView | null;
  /** the moment the whole crowd is reacting to (the ferry horn, the gong), while it lasts */
  moment: { kind: MomentKind; endsInMs: number } | null;
  /**
   * someone's distraction, for a moment: where its passer-by swung (every screen but the maker's
   * turns its camera there, as the Steam game pans away; nothing says whose it was)
   */
  glance?: { x: number; y: number; endsInMs: number } | null;
}

/** A nickname for the round (火眼金睛 Eagle Eye...), by name; `you` on that player's own phone. */
export interface AwardView {
  name: string;
  award: AwardKey;
  you: boolean;
}

/** The round's penalty, once it's over: who takes it, by name. */
export interface PenaltyView {
  kind: "sip" | "everyone";
  who: string[];
  /** how many times they were spotted */
  times: number;
}

export interface ResultView {
  round: number;
  winner: string | null;
  youWon: boolean;
  /** null when the host turned penalties off */
  penalty: PenaltyView | null;
  awards: AwardView[];
}

export interface RoomView {
  code: string;
  /** the changle.ca table this game came from (its back buttons lead there), or null */
  table: string | null;
  phase: "lobby" | "playing" | "over";
  /** rounds started so far */
  round: number;
  you: { role: Role; host: boolean; vote: ArenaId | null };
  arenaVotes: Record<ArenaId, number>;
  players: PlayerView[];
  screens: number;
  settings: {
    /** the round ends in a penalty moment */
    penalties: boolean;
    /** the table's own penalty, set by the host on changle.ca ("" means drinking) */
    custom: string;
  };
  game: GameView | null;
  result: ResultView | null;
  /** the host took everyone back to the table: every page goes there */
  ended: boolean;
  /** the server's clock when it sent this */
  now: number;
}

export interface RoomInfo {
  exists: boolean;
  phase?: "lobby" | "playing" | "over";
  players?: number;
  full?: boolean;
}

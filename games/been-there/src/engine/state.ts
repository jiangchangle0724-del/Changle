// The whole game is one plain JSON object, so the server can save it and send it around.
import type { GameConfig } from "./config";

export interface Player {
  name: string;
  cash: number;
  pos: number;
  /** Bankrupt: out of the game (becomes a spectator in the web version). */
  out: boolean;
  /** In Immigration (jail). */
  jail: boolean;
  /** Doubles rolled this turn. */
  dbl: number;
  /** Ids of cards kept in hand. */
  keep: string[];
  /** Passport: ids of cities visited. */
  stamps: string[];
  /** Passport bonus for all 8 regions already paid. */
  bonus: boolean;
  /** Holding a London (Lloyd's) policy: next rent halved. */
  policy: boolean;
  /** Singapore car permits held. */
  permits: number;
  /** Jet lag: roll one die next turn. */
  jetlag: boolean;
  turns: number;
}

export interface Deed {
  /** Seat index of the owner, or -1 for the bank. */
  owner: number;
  /** 0-4 houses, 5 = hotel. */
  houses: number;
  mort: boolean;
}

export interface Effects {
  /** Mexico City: dice faces that don't count until `by`'s next turn. */
  ban: { lo: number; hi: number; by: number } | null;
  /** Hong Kong: nobody pays rent until this seat's next turn. */
  typhoon: number | null;
  /** Paris: houses half price until this seat's next turn. */
  sales: number | null;
  salesUsed: number;
  /** Singapore car permits left in the bank. */
  permits: number;
  /** London policies left. */
  policies: number;
}

export type Votes<T> = Record<number, T>;

/** The decision the game is waiting for. `who` is the seat that must decide; simultaneous ones list votes/bids. */
export type Pending =
  | { k: "roll"; who: number; jail: boolean }
  | { k: "permit"; who: number; steps: number; again: boolean }
  | { k: "buy"; who: number; at: number; price: number }
  | { k: "auction"; at: number; bids: Votes<number> }
  | { k: "debt"; who: number; amount: number; to: number }
  | { k: "end"; who: number }
  | { k: "card-route"; who: number }
  | { k: "card-player"; who: number }
  | { k: "card-house"; who: number; card: string }
  | { k: "koi"; who: number; rent: number; to: number }
  | { k: "water"; votes: Votes<boolean> }
  | { k: "tango"; who: number }
  | { k: "tango-reply"; who: number; from: number }
  | { k: "ban"; who: number }
  | { k: "dance"; who: number }
  | { k: "scores"; dancer: number; votes: Votes<number> }
  | { k: "mumbai"; who: number }
  | { k: "peek"; who: number; cards: number[] }
  | { k: "bet"; who: number; at: number }
  | { k: "freeze"; who: number; at: number; votes: Votes<boolean> }
  | { k: "jump"; who: number }
  | { k: "quiz"; who: number; visitor: number; at: number }
  | { k: "splash"; who: number; votes: Votes<number> }
  | { k: "reverse"; who: number }
  | { k: "coe"; who: number; bids: Votes<number> }
  | { k: "barrier"; who: number; visitor: number; at: number }
  | { k: "sales"; who: number }
  | { k: "policy"; who: number; to: number }
  | { k: "silence"; who: number; at: number };

export type PendingKind = Pending["k"];

/** Work still to do this turn, run last-in first-out. */
export type StackItem =
  | { t: "land"; p: number; noTango?: boolean }
  | { t: "rule"; p: number; at: number; noTango?: boolean }
  | { t: "prop"; p: number; at: number; double?: boolean; base?: boolean; mult?: number; toBank?: boolean }
  | { t: "after"; p: number; at: number }
  | { t: "endMove"; p: number; again: boolean }
  | { t: "pay"; p: number; amount: number; to: number }
  | { t: "card"; p: number; deck: "journey" | "postcard" }
  | { t: "check" };

export interface Stats {
  landings: number[];
  rentByOwner: number[];
  rentBySpace: number[];
  boughtAt: number[];
  auctions: number;
  auctionTotal: number;
  trades: number;
  builds: number;
  ruleUses: Record<string, number>;
  bankrupt: number[];
}

export interface Offer {
  cash: number;
  deeds: number[];
  cards: string[];
}

/** What happened, for the game log and the big screen. Never read by the rules. */
export type GameEvent =
  | { t: "turn"; p: number }
  | { t: "roll"; p: number; dice: number[]; steps: number; jail?: boolean; doubles?: boolean }
  | { t: "move"; p: number; from: number; to: number; salary?: number }
  | { t: "land"; p: number; at: number }
  | { t: "stamp"; p: number; city: string }
  | { t: "passport"; p: number; amount: number }
  | { t: "buy"; p: number; at: number; price: number }
  | { t: "auction"; at: number; winner: number | null; price: number }
  | { t: "rent"; p: number; to: number; at: number; amount: number }
  | { t: "pay"; p: number; to: number; amount: number }
  | { t: "debt"; p: number; to: number; amount: number }
  | { t: "card"; p: number; deck: "journey" | "postcard"; id: string }
  | { t: "rule"; p: number; city: string; [detail: string]: unknown }
  | { t: "jail"; p: number }
  | { t: "manage"; p: number; k: "build" | "sell" | "mortgage" | "unmortgage"; at: number }
  | { t: "trade"; a: number; b: number; give: Offer; get: Offer }
  | { t: "bankrupt"; p: number; to: number }
  | { t: "bonus"; p: number; amount: number; why: string }
  | { t: "news"; id: string; on: boolean }
  | { t: "over"; reason: string; winner: number | null };

export interface GameState {
  cfg: GameConfig;
  /** RNG state. Secret: whoever knows it can predict the dice. */
  seed: number;
  ps: Player[];
  deeds: (Deed | null)[];
  /** Seat whose turn it is. */
  turn: number;
  /** 1 clockwise, -1 after Sydney reverses it. */
  dir: number;
  /** Card order; the top card is the last one. Secret. */
  decks: { journey: number[]; postcard: number[] };
  fx: Effects;
  /** Travel news in force (news.ts) until `turns` reaches `until`, and the ones already told. */
  news: { id: string; until: number } | null;
  newsSeen: string[];
  turns: number;
  pending: Pending | null;
  stack: StackItem[];
  dice: number[];
  over: boolean;
  winner: number | null;
  reason: string;
  stats: Stats;
  log: string[] | null;
  /** Dice to use instead of random ones (tests). */
  forced: number[];
  /** Event stream for the UI; null in simulations. */
  events: GameEvent[] | null;
}

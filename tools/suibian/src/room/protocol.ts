// What phones and the server say to each other.
import type { Ballot, Center, CuisineId, Lang, Limits, MoodPick, Place, RangeId, Rating, WaitEstimate, Warning } from "../engine";

export type { Lang };

/**
 * Where the app lives: changle.ca/tools/suibian (a Worker route; the rest of changle.ca is a
 * separate site). Every page, API and sign-in path starts with it. Also in wrangler.jsonc,
 * src/client/index.html and scripts/build.mjs.
 */
export const BASE = "/tools/suibian";

/** Room timings in milliseconds. */
export const TIMING = {
  /** Round 1: people who haven't finished by then keep what they tapped. */
  mood: 60_000,
  /** Round 2. */
  cards: 120_000,
  /** The tie-break spinner. */
  spin: 4_500,
  /** Rooms stay this long after the last activity, so people can rate the meal. */
  roomTtl: 3 * 24 * 3600_000,
};

export type Phase = "lobby" | "finding" | "mood" | "cards" | "spin" | "result";

export type ClientMsg =
  | { t: "name"; name: string }
  | { t: "lang"; lang: Lang }
  | { t: "limits"; limits: Limits }
  | { t: "start" }
  | { t: "mood"; picks: Partial<Record<CuisineId, MoodPick>>; done: boolean }
  | { t: "ballot"; approve: string[]; veto: string | null; done: boolean }
  /** Host: end this round now. */
  | { t: "next" }
  /** Host: back to the lobby for a new search (wider range, someone new). */
  | { t: "again"; range?: RangeId }
  | { t: "ping" };

export type ServerMsg =
  | { t: "view"; view: RoomView }
  | { t: "toast"; key: string; vars?: Record<string, string | number> }
  | { t: "pong"; now: number }
  | { t: "fatal"; key: string };

export interface MemberView {
  id: string;
  name: string;
  online: boolean;
  host: boolean;
  /** Has filled in their diet card (the contents are never shown). */
  ready: boolean;
  /** Finished the current round. */
  done: boolean;
}

export interface CardView {
  place: Place;
  /** Rough travel minutes from the room's starting point. */
  minutes: number;
  drive: boolean;
  wait: WaitEstimate;
  lastOrder?: number;
  warnings: Warning[];
  /** A cuisine someone banned in round 1, brought back because little else was left. */
  relaxed: boolean;
}

export interface RoomView {
  code: string;
  now: number;
  phase: Phase;
  phaseEnds: number | null;
  /** Sample restaurants (no Google key on this server). */
  demo: boolean;
  you: {
    id: string;
    name: string;
    host: boolean;
    limits: Limits | null;
    mood: Partial<Record<CuisineId, MoodPick>>;
    ballot: Ballot;
    rated: boolean;
  };
  members: MemberView[];
  center: Center;
  range: RangeId;
  /** Everyone's limits merged, with no names. */
  table: Limits;
  chips: { cuisine: CuisineId; count: number; likes: number; bans: number }[];
  cards: CardView[];
  result: { winner: string; tied: string[]; scores: { id: string; yes: number; vetoes: number }[] } | null;
  ratings: { n: number; up: number; mid: number; down: number; liked: number };
  /** Why the last search came back empty. */
  error: "nothingNearby" | "nothingFits" | "searchFailed" | null;
}

export interface RatingInput extends Rating {
  /** Device id; one rating per device. */
  cid: string;
}

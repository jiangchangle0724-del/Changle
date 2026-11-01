// What phones and the server say to each other.
import { RANGES, check, distanceMeters, estimateWait, minutesToLastOrder, travelMinutes, vancouverClock } from "../engine";
import type { Ballot, Center, CuisineId, Lang, Limits, MoodPick, Place, RangeId, Rating, SoloReason, WaitEstimate, Warning } from "../engine";

export type { Lang };

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

/** A place as a card, seen from the starting point, for the people whose limits are `limits`. */
export function cardView(p: Place, center: Center, range: RangeId, limits: Limits, now: number, relaxed = false): CardView {
  const drive = RANGES[range].drive;
  return {
    place: p,
    minutes: travelMinutes(distanceMeters(center, p), drive),
    drive,
    wait: estimateWait(p, vancouverClock(now)),
    lastOrder: minutesToLastOrder(p, now),
    warnings: check(p, limits).warnings,
    relaxed,
  };
}

/** One person's pick (POST /eat/api/solo): a card and why it was chosen. */
export interface SoloCard extends CardView {
  reasons: SoloReason[];
}

export interface SoloResponse {
  cards?: SoloCard[];
  /** The side of the menu asked for had too few places nearby, so others were let in. */
  relaxed?: boolean;
  demo?: boolean;
  error?: "nothingNearby" | "nothingFits" | "searchFailed" | "login" | "quota" | "badPlace";
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

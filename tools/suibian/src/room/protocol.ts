// What phones and the server say to each other.
import { PLANNED_FROM, RANGES, check, closingTime, distanceMeters, estimateWait, isOpen, lastOrderAt, reasonsFor, travelMinutes, vancouverClock } from "../engine";
import type { Ballot, Center, Concern, CuisineId, Lang, Limits, MoodPick, OccasionId, Place, RangeId, Rating, Reason, WaitEstimate, Warning } from "../engine";

export type { Lang };

/** Room timings in milliseconds. */
export const TIMING = {
  /** Round 1: people who haven't finished by then keep what they tapped. */
  mood: 90_000,
  /** Round 2. */
  cards: 120_000,
  /** The tie-break spinner. */
  spin: 4_500,
  /** Rooms stay this long after the last activity, so people can rate the meal. */
  roomTtl: 3 * 24 * 3600_000,
  /**
   * A phone that drops off (someone opens the map app or locks the screen) still counts as at the
   * table this long, so a round doesn't end without them while they look at a card's map.
   */
  awayGrace: 60_000,
};

/** People at one table, at most (a dinner, not a stadium; it also bounds the ratings it can give). */
export const MAX_MEMBERS = 20;
/**
 * Google searches one table may run (first try, a wider range, a second round...). Starting a table
 * counts toward the host's daily limit; this keeps one table from searching without end.
 */
export const MAX_SEARCHES = 4;
/** Ratings a table can give over its life: one per person, plus a little slack for someone who ate with
 * them without joining, or rated from a second browser. */
export const RATING_SLACK = 2;

export type Phase = "lobby" | "finding" | "mood" | "cards" | "spin" | "result";

export type ClientMsg =
  | { t: "name"; name: string }
  | { t: "lang"; lang: Lang }
  | { t: "limits"; limits: Limits }
  | { t: "start" }
  | { t: "mood"; picks: Partial<Record<CuisineId, MoodPick>>; done: boolean }
  | { t: "ballot"; approve: string[]; veto: string | null; done: boolean }
  /** Host: end this round now. `phase` is the round the button was on: a late or second tap is ignored. */
  | { t: "next"; phase?: Phase }
  /** Host: back to the lobby for a new search (wider range, someone new). */
  | { t: "again"; range?: RangeId }
  /** Host, in the lobby: when the table eats (ms since epoch), or null for now. */
  | { t: "when"; at: number | null }
  /** Host, in the lobby: what the meal is for. */
  | { t: "occasion"; occasion: OccasionId }
  | { t: "ping" };

export type ServerMsg =
  | { t: "view"; view: WireView }
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
  /** Its place on the list, from 1. */
  rank: number;
  /** From the starting point in a straight line, to the nearest 50 m (100 m past 1 km). */
  meters: number;
  /** Rough minutes there on foot and by car (see travelMinutes). */
  walkMin: number;
  driveMin: number;
  /** The table chose a driving range (or any distance), so the drive comes first. */
  drive: boolean;
  wait: WaitEstimate;
  /** A planned meal (ms since epoch): the card is about then. Absent for now. */
  at?: number;
  /** Open then: false never reaches a card; undefined when Google has no hours for it. */
  open?: boolean;
  /** When it closes after then, and when the kitchen likely stops taking orders (ms since epoch). */
  closesAt?: number;
  lastOrderAt?: number;
  warnings: Warning[];
  /** Why it is further down the list for this table; each comes with a note (tips.ts). */
  concerns: Concern[];
  /** Round 1: how many people liked its cuisine, and how many said no to it. */
  likes: number;
  bans: number;
  /** What speaks for it, best first, at most three. */
  reasons: Reason[];
}

const soon = (t: number | undefined, from: number) => (t !== undefined && t - from < 24 * 3600_000 ? t : undefined);

/** Distances a card shows: never so exact that the starting point could be worked out from them. */
export const roundMeters = (m: number) => (m < 1000 ? Math.max(50, Math.round(m / 50) * 50) : Math.round(m / 100) * 100);

export interface CardContext {
  center: Center;
  range: RangeId;
  /** The table's merged limits. */
  limits: Limits;
  now: number;
  /** A planned meal; now when absent. */
  at?: number;
  /** What the meal is for: a card says when a place suits it. */
  occasion?: OccasionId;
}

/** A place as a card at `rank` on the list, seen from the starting point, for the people whose limits are `limits`. */
export function cardView(p: Place, rank: number, ctx: CardContext, extra: { likes?: number; bans?: number; reasons?: Reason[] } = {}): CardView {
  const meters = distanceMeters(ctx.center, p);
  const v = check(p, ctx.limits);
  const likes = extra.likes ?? 0;
  const at = ctx.at !== undefined && ctx.at - ctx.now >= PLANNED_FROM ? ctx.at : undefined;
  // The week's opening hours stay on the server: the card says what they mean for this meal.
  const { hours: _hours, ...place } = p;
  return {
    place,
    rank,
    meters: roundMeters(meters),
    walkMin: travelMinutes(meters, false),
    driveMin: travelMinutes(meters, true),
    drive: RANGES[ctx.range].drive,
    wait: estimateWait(p, vancouverClock(at ?? ctx.now)),
    at,
    open: isOpen(p, ctx.now, at),
    // A closing time a day or more away means open around the clock: nothing to say.
    closesAt: soon(closingTime(p, ctx.now, at), at ?? ctx.now),
    lastOrderAt: soon(lastOrderAt(p, ctx.now, at), at ?? ctx.now),
    warnings: v.warnings,
    concerns: v.concerns,
    likes,
    bans: extra.bans ?? 0,
    reasons: extra.reasons ?? reasonsFor(p, { limits: ctx.limits, center: ctx.center, range: ctx.range, liked: likes > 0, occasion: ctx.occasion, now: ctx.now, at }),
  };
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
  range: RangeId;
  /** When the table eats (ms since epoch), or null for now. */
  at: number | null;
  /** What the meal is for. */
  occasion: OccasionId;
  /**
   * Everyone's limits merged, with no names, sent only with the result: shown live, a line appearing
   * as one person saves their card would give away whose it is.
   */
  table: Limits;
  /**
   * Round 1's menu: every cuisine, with how many liked it and said no to it (hidden while people
   * choose) and, once the search has run, how many of its places are on the list.
   */
  chips: { cuisine: CuisineId; count?: number; likes: number; bans: number }[];
  /** Round 2's list, best first: every place in range and budget. */
  cards: CardView[];
  /** Changes whenever `cards` would: a phone that has this one already is sent `cards: null`. */
  cardsRev: string;
  result: { winner: string; tied: string[]; scores: { id: string; yes: number; vetoes: number }[] } | null;
  /**
   * The winner's card, kept even if someone who joined afterwards can't eat there, so the result
   * never disappears. `unsafe`: someone at the table is severely allergic to something this kind
   * of food often uses, or it is over someone's budget.
   */
  winner: (CardView & { unsafe: false | "severe" | "budget" }) | null;
  ratings: { n: number; up: number; mid: number; down: number; liked: number };
  /** Why the last search came back empty. */
  error: "nothingNearby" | "nothingFits" | "searchFailed" | "searchLimit" | null;
}

/** A view as sent: `cards` is null when this phone already has that list (the same `cardsRev`). */
export type WireView = Omit<RoomView, "cards"> & { cards: CardView[] | null };

export interface RatingInput extends Rating {
  /** Device id; one rating per device. */
  cid: string;
}

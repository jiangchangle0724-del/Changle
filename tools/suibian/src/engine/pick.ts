// From the places nearby to the cuisine chips (round 1) and the ranked list (round 2, and one
// person's picks). Only being closed, closing soon and the budget leave a place out (the owner's
// call, 2026-11-11: everything in range and budget is on the list). Someone's diet and round 1's
// "no" move a place down, with a line on its card saying why and what can still be ordered.
import { CUISINES } from "./cuisines";
import { LAST_ORDER_BEFORE_CLOSE, MIN_MINUTES_BEFORE_CLOSE, RANGES, distanceMeters, travelMinutes, vancouverClock } from "./clock";
import { check, type Concern } from "./limits";
import { NO_LIMITS, type Center, type CuisineId, type Limits, type Place, type RangeId } from "./types";
import { estimateWait } from "./wait";

/** Places the table can go to now: open, not closing soon, within everyone's budget. */
export function eligible(places: Place[], limits: Limits, now: number): Place[] {
  return places.filter((p) => {
    if (p.openNow === false) return false;
    if (p.closesAt !== undefined && p.closesAt - now < MIN_MINUTES_BEFORE_CLOSE * 60_000) return false;
    return check(p, limits).ok;
  });
}

/** When the kitchen likely stops taking orders (ms since epoch), if we know when it closes. */
export function lastOrderAt(p: Place): number | undefined {
  return p.closesAt === undefined ? undefined : p.closesAt - LAST_ORDER_BEFORE_CLOSE * 60_000;
}

/** Minutes until the kitchen likely stops taking orders, if we know when it closes. */
export function minutesToLastOrder(p: Place, now: number): number | undefined {
  const at = lastOrderAt(p);
  return at === undefined ? undefined : Math.round((at - now) / 60_000);
}

export const MAX_CHIPS = 12;

/**
 * Round 1: the cuisines actually on offer, most places first. Cuisines that someone at the table is
 * severely allergic to something in come last, so the twelve that fit on screen are ones the table
 * can eat; their places are still on round 2's list, at the bottom.
 */
export function chips(places: Place[], limits?: Limits): { cuisine: CuisineId; count: number }[] {
  const n = new Map<CuisineId, number>();
  for (const p of places) n.set(p.cuisine, (n.get(p.cuisine) ?? 0) + 1);
  const severe = (c: CuisineId) => (check({ id: "", name: "", cuisine: c, lat: 0, lng: 0 }, limits ?? NO_LIMITS).concerns.some((x) => x.k === "allergy" && x.level === "severe") ? 1 : 0);
  return [...n.entries()]
    .map(([cuisine, count]) => ({ cuisine, count }))
    .sort((a, b) => severe(a.cuisine) - severe(b.cuisine) || b.count - a.count || Object.keys(CUISINES).indexOf(a.cuisine) - Object.keys(CUISINES).indexOf(b.cuisine))
    .slice(0, MAX_CHIPS);
}

/** Starting weights for the score. To be tuned against post-meal ratings (decision 10). */
export const WEIGHTS = {
  /** Google rating, shrunk toward PRIOR_RATING by PRIOR_COUNT imaginary average ratings. */
  google: 1,
  ours: 1.2,
  likes: 0.6,
  distance: 0.35,
  wait: 0.15,
  closingSoon: 0.2,
  /** Google has no hours for it: maybe open, maybe not, so places known to be open come first. */
  unknownHours: 0.3,
  /** Steve's own pick (picks.json), and a place on a Greater Vancouver list (lists.json). */
  recommend: 0.25,
  badges: 0.15,
  /** Hardly any Google ratings (fewer than FEW_RATINGS): an unknown, not an average place. */
  fewRatings: 0.4,
};
const PRIOR_RATING = 4.2;
const PRIOR_COUNT = 80;
export const FEW_RATINGS = 20;

export interface ScoreContext {
  likes: Partial<Record<CuisineId, number>>;
  members: number;
  center: Center;
  range: RangeId;
  now: number;
}

/** How good a place looks for this table, before anyone's diet or round 1's "no". */
export function score(p: Place, ctx: ScoreContext): number {
  const n = p.ratings ?? 0;
  const bayes = (PRIOR_COUNT * PRIOR_RATING + n * (p.rating ?? PRIOR_RATING)) / (PRIOR_COUNT + n);
  let s = WEIGHTS.google * Math.min(1, Math.max(0, (bayes - 3.5) / 1.5));
  const o = p.ours;
  const total = o ? o.up + o.mid + o.down : 0;
  if (o && total) s += WEIGHTS.ours * Math.min(1, total / 4) * ((o.up + 0.5 * o.mid) / total - 0.5);
  s += WEIGHTS.likes * ((ctx.likes[p.cuisine] ?? 0) / Math.max(1, ctx.members));
  s -= WEIGHTS.distance * Math.min(1.5, distanceMeters(ctx.center, p) / RANGES[ctx.range].meters);
  s -= WEIGHTS.wait * estimateWait(p, vancouverClock(ctx.now)).level;
  const last = minutesToLastOrder(p, ctx.now);
  if (last !== undefined && last < 60) s -= WEIGHTS.closingSoon;
  if (p.openNow === undefined) s -= WEIGHTS.unknownHours;
  if (p.recommend) s += WEIGHTS.recommend;
  if (p.badges?.length) s += WEIGHTS.badges;
  if (n < FEW_RATINGS && !p.recommend) s -= WEIGHTS.fewRatings;
  return s;
}

/**
 * How far each reason moves a place down, in score points: from 3.5 to 5 Google stars is 1 point,
 * so a star is about 0.67. Nothing here leaves a place out. A severe allergy isn't a number: those
 * places go below all the others (see rank()).
 */
export const DEMOTE = {
  /** Someone doesn't eat something most dishes of this cuisine use; each such thing, at most `avoidMax`. */
  avoid: 0.5,
  avoidMax: 1,
  /** Someone eats halal and the place doesn't say it is: a little for cuisines that often are. */
  halalLikely: 0.3,
  halal: 1.5,
  /** Someone is vegetarian: Google says there's nothing for them, or nobody says either way. */
  vegNone: 1.5,
  vegUnsure: 0.3,
  /** Someone said no to the cuisine in round 1; more the bigger the share of the table. */
  ban: 0.5,
  banShare: 0.7,
};

/** Points off for everything but a severe allergy (see DEMOTE). */
export function demotion(concerns: readonly Concern[], banned: number, members: number): number {
  let avoid = 0;
  let d = 0;
  for (const c of concerns) {
    if (c.k === "allergy") {
      if (c.level === "avoid") avoid += DEMOTE.avoid;
    } else if (c.k === "halal") d += c.likely ? DEMOTE.halalLikely : DEMOTE.halal;
    else d += c.known ? DEMOTE.vegNone : DEMOTE.vegUnsure;
  }
  d += Math.min(DEMOTE.avoidMax, avoid);
  if (banned > 0) d += DEMOTE.ban + DEMOTE.banShare * Math.min(1, banned / Math.max(1, members));
  return d;
}

/** The top of a table's list: full cards with photos; the rest are shorter rows. */
export const TOP_COUNT = 6;
export const MAX_PER_CUISINE = 2;

export interface RankInput extends ScoreContext {
  /** Already eligible (see eligible()). */
  places: Place[];
  /** Everyone's limits merged: what moves places down. */
  limits: Limits;
  /** How many people said no to each cuisine in round 1. */
  bans: Partial<Record<CuisineId, number>>;
  /** Extra points for a place (one person's mood and side of the menu). */
  boost?: (p: Place) => number;
  /** How many make the top, and at most how many of one cuisine there. */
  top?: number;
  perCuisine?: number;
}

interface Scored {
  p: Place;
  /** Severe allergies to what this cuisine often uses: any at all puts it below every place with none. */
  severe: number;
  /** Points off (demotion()). */
  down: number;
  s: number;
}

/** Fewer severe problems first, then the better score, then more Google ratings, then a fixed order. */
const better = (a: Scored, b: Scored) => a.severe - b.severe || b.s - a.s || (b.p.ratings ?? 0) - (a.p.ratings ?? 0) || a.p.id.localeCompare(b.p.id);

/**
 * Every place, best first. Places with a severe allergy problem go to the bottom; the rest by score.
 * The top takes at most `perCuisine` of a cuisine so the first few are a real choice, and only from
 * places nobody has a problem with. The same search gives the same list (nothing random).
 */
export function rank(input: RankInput): string[] {
  const top = input.top ?? TOP_COUNT;
  const per = input.perCuisine ?? MAX_PER_CUISINE;
  const scored: Scored[] = input.places
    .map((p) => {
      const concerns = check(p, input.limits).concerns;
      const down = demotion(concerns, input.bans[p.cuisine] ?? 0, input.members);
      const severe = concerns.filter((c) => c.k === "allergy" && c.level === "severe").length;
      return { p, severe, down, s: score(p, input) + (input.boost?.(p) ?? 0) - down };
    })
    .sort(better);
  const head: Scored[] = [];
  const count = new Map<CuisineId, number>();
  for (const x of scored) {
    if (head.length >= top) break;
    if (x.severe || x.down > 0 || (count.get(x.p.cuisine) ?? 0) >= per) continue;
    head.push(x);
    count.set(x.p.cuisine, (count.get(x.p.cuisine) ?? 0) + 1);
  }
  // Not enough variety nearby, or too few places without a problem: the next best, whatever they are.
  for (const x of scored) if (head.length < top && !head.includes(x)) head.push(x);
  head.sort(better);
  return [...head, ...scored.filter((x) => !head.includes(x))].map((x) => x.p.id);
}

export type Reason = "pick" | "list" | "liked" | "mood" | "side" | "fans" | "topRated" | "budget" | "near";

export interface ReasonContext {
  limits: Limits;
  center: Center;
  range: RangeId;
  /** Someone at the table liked this cuisine in round 1. */
  liked?: boolean;
  /** It fits the one person's mood, or the side of the menu they chose. */
  mood?: boolean;
  side?: boolean;
}

/** What speaks for a place, best reasons first, at most three. */
export function reasonsFor(p: Place, c: ReasonContext): Reason[] {
  const out: Reason[] = [];
  if (p.recommend) out.push("pick");
  if (p.badges?.length) out.push("list");
  if (c.liked) out.push("liked");
  if (c.mood) out.push("mood");
  if (c.side) out.push("side");
  const o = p.ours;
  const total = o ? o.up + o.mid + o.down : 0;
  if (o && total >= 3 && o.up / total >= 0.7) out.push("fans");
  if ((p.rating ?? 0) >= 4.5 && (p.ratings ?? 0) >= 200) out.push("topRated");
  if (c.limits.budget > 0 && p.price !== undefined && p.price <= c.limits.budget) out.push("budget");
  if (travelMinutes(distanceMeters(c.center, p), RANGES[c.range].drive) <= 10) out.push("near");
  return out.slice(0, 3);
}

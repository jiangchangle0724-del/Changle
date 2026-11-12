// From the places found to round 2's ranked list. Only being closed, closing soon and the budget
// leave a place out (the owner's call, 2026-11-11: everything in range and budget is on the list).
// Round 1's 👍 puts a cuisine's places first, its 🚫 after the rest, a severe allergy at the very
// bottom; someone's diet moves a place down within that, with a line on its card saying why and
// what can still be ordered. The occasion and the meal weigh a lot (occasion.ts): a place that
// plainly isn't for them comes after the ones that are, with a line on its card too.
import { CUISINES } from "./cuisines";
import { LAST_ORDER_BEFORE_CLOSE, MIN_MINUTES_BEFORE_CLOSE, PLANNED_FROM, RANGES, distanceMeters, travelMinutes, vancouverClock } from "./clock";
import { check, type Concern } from "./limits";
import { occasionFit, type Fit, type OccasionId } from "./occasion";
import { NO_LIMITS, type Center, type CuisineId, type Limits, type Place, type RangeId } from "./types";
import { estimateWait } from "./wait";

/** The stretch of its opening hours that `at` falls in, if any. */
const openSpan = (p: Place, at: number) => p.hours?.find(([a, b]) => a <= at && at < b);

/**
 * Is it open at `at` (now unless a meal is planned)? Now: Google's own "open now". Planned: its
 * hours for that day. Undefined when we can't tell.
 */
export function isOpen(p: Place, now: number, at = now): boolean | undefined {
  if (at - now < PLANNED_FROM) return p.openNow;
  return p.hours ? !!openSpan(p, at) : undefined;
}

/** When it closes after `at`, if we know. */
export function closingTime(p: Place, now: number, at = now): number | undefined {
  if (at - now < PLANNED_FROM) return p.closesAt;
  return openSpan(p, at)?.[1];
}

/** Open at `at` (now unless planned) and not closing soon after. */
function openThen(p: Place, now: number, at: number): boolean {
  if (isOpen(p, now, at) === false) return false;
  const close = closingTime(p, now, at);
  return close === undefined || close - Math.max(at, now) >= MIN_MINUTES_BEFORE_CLOSE * 60_000;
}

/** Places the table can go to at `at` (now unless planned): open, not closing soon, within everyone's budget. */
export function eligible(places: Place[], limits: Limits, now: number, at = now): Place[] {
  return places.filter((p) => openThen(p, now, at) && check(p, limits).ok);
}

/** Open then and not closing soon, but over someone's budget: how many places the budget left out. */
export function overBudget(places: Place[], limits: Limits, now: number, at = now): number {
  return limits.budget ? places.filter((p) => openThen(p, now, at) && !check(p, limits).ok).length : 0;
}

/** When the kitchen likely stops taking orders (ms since epoch), if we know when it closes. */
export function lastOrderAt(p: Place, now: number, at = now): number | undefined {
  const close = closingTime(p, now, at);
  return close === undefined ? undefined : close - LAST_ORDER_BEFORE_CLOSE * 60_000;
}

/** Minutes from `at` until the kitchen likely stops taking orders, if we know when it closes. */
export function minutesToLastOrder(p: Place, now: number, at = now): number | undefined {
  const last = lastOrderAt(p, now, at);
  return last === undefined ? undefined : Math.round((last - Math.max(at, now)) / 60_000);
}

/** How many places of each cuisine are on the list (shown on round 1's menu once it's known). */
export function counts(places: Place[]): Partial<Record<CuisineId, number>> {
  const n: Partial<Record<CuisineId, number>> = {};
  for (const p of places) n[p.cuisine] = (n[p.cuisine] ?? 0) + 1;
  return n;
}

/** Is someone at the table severely allergic to something this cuisine often uses? */
export const severeFor = (c: CuisineId, limits: Limits) =>
  check({ id: "", name: "", cuisine: c, lat: 0, lng: 0 }, limits ?? NO_LIMITS).concerns.some((x) => x.k === "allergy" && x.level === "severe");

/** Starting weights for the score. To be tuned against post-meal ratings (decision 10). */
export const WEIGHTS = {
  /** Google rating, shrunk toward PRIOR_RATING by PRIOR_COUNT imaginary average ratings. */
  google: 1,
  ours: 1.2,
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
  center: Center;
  range: RangeId;
  now: number;
  /** A planned meal (ms since epoch); now when absent. */
  at?: number;
  /** What the meal is for (occasion.ts). */
  occasion?: OccasionId;
}

/** How well a place suits the table's occasion and meal (occasion.ts). */
export function fitFor(p: Place, ctx: ScoreContext): Fit {
  const at = ctx.at ?? ctx.now;
  return occasionFit(p, ctx.occasion, { at, close: closingTime(p, ctx.now, at) });
}

/** How good a place looks for this table and occasion, before round 1 and anyone's diet. */
export function score(p: Place, ctx: ScoreContext): number {
  const n = p.ratings ?? 0;
  const bayes = (PRIOR_COUNT * PRIOR_RATING + n * (p.rating ?? PRIOR_RATING)) / (PRIOR_COUNT + n);
  let s = WEIGHTS.google * Math.min(1, Math.max(0, (bayes - 3.5) / 1.5));
  const o = p.ours;
  const total = o ? o.up + o.mid + o.down : 0;
  if (o && total) s += WEIGHTS.ours * Math.min(1, total / 4) * ((o.up + 0.5 * o.mid) / total - 0.5);
  s -= WEIGHTS.distance * Math.min(1.5, distanceMeters(ctx.center, p) / RANGES[ctx.range].meters);
  const at = ctx.at ?? ctx.now;
  s -= WEIGHTS.wait * estimateWait(p, vancouverClock(at)).level;
  const last = minutesToLastOrder(p, ctx.now, at);
  if (last !== undefined && last < 60) s -= WEIGHTS.closingSoon;
  if (isOpen(p, ctx.now, at) === undefined) s -= WEIGHTS.unknownHours;
  if (p.recommend) s += WEIGHTS.recommend;
  if (p.badges?.length) s += WEIGHTS.badges;
  if (n < FEW_RATINGS && !p.recommend) s -= WEIGHTS.fewRatings;
  s += fitFor(p, ctx).points;
  return s;
}

/**
 * How far each diet reason moves a place down, in score points: from 3.5 to 5 Google stars is 1
 * point, so a star is about 0.67. Nothing here leaves a place out. A severe allergy and round 1's
 * 🚫 aren't numbers: they put places below the others (see rank()).
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
};

/** Points off for the diet, but a severe allergy (see DEMOTE). */
export function demotion(concerns: readonly Concern[]): number {
  let avoid = 0;
  let d = 0;
  for (const c of concerns) {
    if (c.k === "allergy") {
      if (c.level === "avoid") avoid += DEMOTE.avoid;
    } else if (c.k === "halal") d += c.likely ? DEMOTE.halalLikely : DEMOTE.halal;
    else d += c.known ? DEMOTE.vegNone : DEMOTE.vegUnsure;
  }
  d += Math.min(DEMOTE.avoidMax, avoid);
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
  /** Round 1: how many people liked, and said no to, each cuisine. */
  likes: Partial<Record<CuisineId, number>>;
  bans: Partial<Record<CuisineId, number>>;
  /** How many make the top, and at most how many of one cuisine there when nobody liked anything. */
  top?: number;
  perCuisine?: number;
}

interface Scored {
  p: Place;
  /** 0: a cuisine more people liked than refused; 1: the rest; 2: more refused than liked; 3: a severe allergy. */
  tier: number;
  /** Likes minus refusals for its cuisine. */
  net: number;
  /** Points off for the diet (demotion()). */
  down: number;
  /** Plainly not for the occasion or the meal (occasion.ts): after the ones that are. */
  off: boolean;
  s: number;
}

/**
 * The higher tier first, the more-liked cuisine first, places for the occasion before the ones
 * plainly not, then the better score, more Google ratings, a fixed order.
 */
const better = (a: Scored, b: Scored) =>
  a.tier - b.tier || b.net - a.net || Number(a.off) - Number(b.off) || b.s - a.s || (b.p.ratings ?? 0) - (a.p.ratings ?? 0) || a.p.id.localeCompare(b.p.id);

/**
 * Every place, best first: the cuisines round 1 liked first (more 👍, higher), then the rest, then
 * the ones it said no to, and places someone is severely allergic to the food of at the very bottom.
 * Within that, places for the occasion and the meal before the ones plainly not, then the score:
 * Google's rating, ours, distance, wait, the occasion, the diet. When nobody
 * liked anything, the top takes at most `perCuisine` of a cuisine so the first few are a real choice.
 * The same search gives the same list (nothing random).
 */
export function rank(input: RankInput): string[] {
  const top = input.top ?? TOP_COUNT;
  const per = input.perCuisine ?? MAX_PER_CUISINE;
  const scored: Scored[] = input.places
    .map((p) => {
      const concerns = check(p, input.limits).concerns;
      const severe = concerns.some((c) => c.k === "allergy" && c.level === "severe");
      const net = (input.likes[p.cuisine] ?? 0) - (input.bans[p.cuisine] ?? 0);
      const down = demotion(concerns);
      const off = !!fitFor(p, input).off;
      return { p, tier: severe ? 3 : net > 0 ? 0 : net < 0 ? 2 : 1, net, down, off, s: score(p, input) - down };
    })
    .sort(better);
  if (scored.some((x) => x.tier === 0)) return scored.map((x) => x.p.id);
  const head: Scored[] = [];
  const count = new Map<CuisineId, number>();
  for (const x of scored) {
    if (head.length >= top) break;
    if (x.tier > 1 || x.down > 0 || x.off || (count.get(x.p.cuisine) ?? 0) >= per) continue;
    head.push(x);
    count.set(x.p.cuisine, (count.get(x.p.cuisine) ?? 0) + 1);
  }
  // Not enough variety nearby, or too few places without a problem: the next best, whatever they are.
  for (const x of scored) if (head.length < top && !head.includes(x)) head.push(x);
  head.sort(better);
  return [...head, ...scored.filter((x) => !head.includes(x))].map((x) => x.p.id);
}

export type Reason = "pick" | "list" | "liked" | "fits" | "fans" | "topRated" | "budget" | "near";

export interface ReasonContext {
  limits: Limits;
  center: Center;
  range: RangeId;
  /** Someone at the table liked this cuisine in round 1. */
  liked?: boolean;
  /** What the meal is for, and when (the occasion's points need the hours then). */
  occasion?: OccasionId;
  now: number;
  at?: number;
}

/** What speaks for a place, best reasons first, at most three. */
export function reasonsFor(p: Place, c: ReasonContext): Reason[] {
  const out: Reason[] = [];
  if (p.recommend) out.push("pick");
  if (p.badges?.length) out.push("list");
  if (c.liked) out.push("liked");
  if (fitFor(p, c).suits) out.push("fits");
  const o = p.ours;
  const total = o ? o.up + o.mid + o.down : 0;
  if (o && total >= 3 && o.up / total >= 0.7) out.push("fans");
  if ((p.rating ?? 0) >= 4.5 && (p.ratings ?? 0) >= 200) out.push("topRated");
  if (c.limits.budget > 0 && p.price !== undefined && p.price <= c.limits.budget) out.push("budget");
  if (travelMinutes(distanceMeters(c.center, p), RANGES[c.range].drive) <= 10) out.push("near");
  return out.slice(0, 3);
}

// From the places nearby to the cuisine chips (round 1) and the candidate cards (round 2).
import { CUISINES } from "./cuisines";
import { LAST_ORDER_BEFORE_CLOSE, MIN_MINUTES_BEFORE_CLOSE, RANGES, distanceMeters, vancouverClock } from "./clock";
import { check } from "./limits";
import type { Center, CuisineId, Limits, Place, RangeId } from "./types";
import { estimateWait } from "./wait";

/** Places the whole table can go to now: open, not closing soon, inside everyone's limits. */
export function eligible(places: Place[], limits: Limits, now: number): Place[] {
  return places.filter((p) => {
    if (p.openNow === false) return false;
    if (p.closesAt !== undefined && p.closesAt - now < MIN_MINUTES_BEFORE_CLOSE * 60_000) return false;
    return check(p, limits).ok;
  });
}

/** Minutes until the kitchen likely stops taking orders, if we know when it closes. */
export function minutesToLastOrder(p: Place, now: number): number | undefined {
  if (p.closesAt === undefined) return undefined;
  return Math.round((p.closesAt - now) / 60_000) - LAST_ORDER_BEFORE_CLOSE;
}

export const MAX_CHIPS = 12;

/** Round 1: the cuisines actually on offer, most places first. */
export function chips(places: Place[]): { cuisine: CuisineId; count: number }[] {
  const n = new Map<CuisineId, number>();
  for (const p of places) n.set(p.cuisine, (n.get(p.cuisine) ?? 0) + 1);
  return [...n.entries()]
    .map(([cuisine, count]) => ({ cuisine, count }))
    .sort((a, b) => b.count - a.count || Object.keys(CUISINES).indexOf(a.cuisine) - Object.keys(CUISINES).indexOf(b.cuisine))
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
};
const PRIOR_RATING = 4.2;
const PRIOR_COUNT = 80;

export interface ScoreContext {
  likes: Partial<Record<CuisineId, number>>;
  members: number;
  center: Center;
  range: RangeId;
  now: number;
}

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
  return s;
}

export const CARD_COUNT = 6;
export const MAX_PER_CUISINE = 2;

export interface PickInput extends ScoreContext {
  /** Already eligible (see eligible()). */
  places: Place[];
  /** How many people banned each cuisine in round 1. */
  bans: Partial<Record<CuisineId, number>>;
  count?: number;
}

/**
 * Round 2's cards: the best-scoring places, at most two per cuisine so the choice is real.
 * Banned cuisines are left out unless that leaves fewer than three places; then the least-banned
 * come back, marked so the cards can say "someone wasn't keen".
 */
export function pick(input: PickInput): { ids: string[]; relaxed: string[] } {
  const count = input.count ?? CARD_COUNT;
  const scored = input.places.map((p) => ({ p, s: score(p, input) })).sort((a, b) => b.s - a.s || a.p.id.localeCompare(b.p.id));
  const banned = (p: Place) => (input.bans[p.cuisine] ?? 0) > 0;
  let pool = scored.filter((x) => !banned(x.p));
  const relaxed: string[] = [];
  if (pool.length < 3) {
    const back = scored.filter((x) => banned(x.p)).sort((a, b) => (input.bans[a.p.cuisine] ?? 0) - (input.bans[b.p.cuisine] ?? 0) || b.s - a.s);
    for (const x of back.slice(0, 3 - pool.length)) relaxed.push(x.p.id);
    pool = scored.filter((x) => !banned(x.p) || relaxed.includes(x.p.id));
  }
  const ids: string[] = [];
  const per = new Map<CuisineId, number>();
  for (const x of pool) {
    if (ids.length >= count) break;
    if ((per.get(x.p.cuisine) ?? 0) >= MAX_PER_CUISINE) continue;
    ids.push(x.p.id);
    per.set(x.p.cuisine, (per.get(x.p.cuisine) ?? 0) + 1);
  }
  // Not enough variety nearby: fill up with the next best regardless of cuisine.
  for (const x of pool) if (ids.length < count && !ids.includes(x.p.id)) ids.push(x.p.id);
  return { ids, relaxed };
}

// One person who doesn't know what to eat: a few taps (mood, which side of the menu, budget, how
// far, diet card) become a short list of places, each with the reasons it was picked.
import { RANGES, distanceMeters, travelMinutes } from "./clock";
import { eligible, score } from "./pick";
import type { Center, CuisineId, Limits, Place, RangeId } from "./types";

export type SoloMood = "warm" | "bold" | "light" | "sweet" | "any";
export type SoloSide = "chinese" | "jk" | "asia" | "west" | "any";

export interface SoloAnswers {
  mood: SoloMood;
  side: SoloSide;
}

export const SOLO_MOODS: SoloMood[] = ["warm", "bold", "light", "sweet", "any"];
export const SOLO_SIDES: SoloSide[] = ["chinese", "jk", "asia", "west", "any"];

/** Cuisines that fit each mood. A place matching the mood gets a boost, not a guarantee. */
export const MOOD_CUISINES: Record<Exclude<SoloMood, "any">, CuisineId[]> = {
  warm: ["hotpot", "ramen", "vietnamese", "chinese", "cantonese", "korean", "taiwanese", "hk_cafe"],
  bold: ["sichuan", "hotpot", "korean", "thai", "indian", "mexican", "western", "sea"],
  light: ["japanese", "vietnamese", "vegetarian", "cantonese", "middle_eastern", "seafood", "taiwanese"],
  sweet: ["brunch", "hk_cafe", "taiwanese"],
};

/** Which side of the menu: these are kept when there are enough of them nearby. */
export const SIDE_CUISINES: Record<Exclude<SoloSide, "any">, CuisineId[]> = {
  chinese: ["cantonese", "hk_cafe", "sichuan", "hotpot", "taiwanese", "chinese"],
  jk: ["japanese", "ramen", "korean"],
  asia: ["vietnamese", "thai", "sea", "indian"],
  west: ["italian", "mexican", "western", "middle_eastern", "seafood", "brunch", "vegetarian"],
};

export type SoloReason = "mood" | "side" | "budget" | "near" | "list" | "pick" | "fans" | "topRated";

/** Shown in batches of this many; the second batch is behind "show me others". */
export const SOLO_BATCH = 3;
export const SOLO_COUNT = 6;
/** Below this many places on the chosen side, the side is relaxed and the rest come back. */
const SIDE_MIN = 3;
/** How much a mood match counts, in "people who liked it in round 1" (see pick.ts WEIGHTS.likes). */
const MOOD_BOOST = 1.5;

export function cleanAnswers(x: unknown): SoloAnswers {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const mood = SOLO_MOODS.includes(o.mood as SoloMood) ? (o.mood as SoloMood) : "any";
  const side = SOLO_SIDES.includes(o.side as SoloSide) ? (o.side as SoloSide) : "any";
  return { mood, side };
}

const moodFits = (a: SoloAnswers, c: CuisineId) => a.mood !== "any" && MOOD_CUISINES[a.mood].includes(c);
const sideFits = (a: SoloAnswers, c: CuisineId) => a.side !== "any" && SIDE_CUISINES[a.side].includes(c);

/** Why a place made the list, best reasons first, at most three. */
export function soloReasons(p: Place, a: SoloAnswers, limits: Limits, center: Center, range: RangeId): SoloReason[] {
  const out: SoloReason[] = [];
  if (p.recommend) out.push("pick");
  if (p.badges?.length) out.push("list");
  if (moodFits(a, p.cuisine)) out.push("mood");
  if (sideFits(a, p.cuisine)) out.push("side");
  const o = p.ours;
  const total = o ? o.up + o.mid + o.down : 0;
  if (o && total >= 3 && o.up / total >= 0.7) out.push("fans");
  if ((p.rating ?? 0) >= 4.5 && (p.ratings ?? 0) >= 200) out.push("topRated");
  if (limits.budget > 0 && p.price !== undefined && p.price <= limits.budget) out.push("budget");
  if (travelMinutes(distanceMeters(center, p), RANGES[range].drive) <= 10) out.push("near");
  return out.slice(0, 3);
}

export interface SoloInput {
  places: Place[];
  answers: SoloAnswers;
  limits: Limits;
  center: Center;
  range: RangeId;
  now: number;
  count?: number;
}

/**
 * The places for one person: open now, inside their diet card and budget, on the side of the menu
 * they asked for when there are enough of those, scored like the table's cards with the mood
 * standing in for round 1's thumbs-up. Each batch of three tries to show three different cuisines.
 * `relaxed` is true when the chosen side had too few places and others were let in.
 */
export function soloPick(input: SoloInput): { ids: string[]; relaxed: boolean } {
  const count = input.count ?? SOLO_COUNT;
  const { answers: a } = input;
  let pool = eligible(input.places, input.limits, input.now);
  let relaxed = false;
  if (a.side !== "any") {
    const onSide = pool.filter((p) => sideFits(a, p.cuisine));
    if (onSide.length >= SIDE_MIN) pool = onSide;
    else relaxed = pool.length > onSide.length;
  }
  const likes: Partial<Record<CuisineId, number>> = {};
  if (a.mood !== "any") for (const c of MOOD_CUISINES[a.mood]) likes[c] = MOOD_BOOST;
  const ctx = { likes, members: 1, center: input.center, range: input.range, now: input.now };
  const ranked = pool
    .map((p) => ({ p, s: score(p, ctx) + (p.recommend ? 0.25 : 0) + (p.badges?.length ? 0.15 : 0) }))
    .sort((x, y) => y.s - x.s || x.p.id.localeCompare(y.p.id))
    .map((x) => x.p);
  const ids: string[] = [];
  // Batch by batch: first a different cuisine for each slot, then whatever scores best.
  while (ids.length < count && ids.length < ranked.length) {
    const batch: Place[] = [];
    const used = new Set<CuisineId>();
    for (const p of ranked) {
      if (batch.length >= SOLO_BATCH) break;
      if (ids.includes(p.id) || used.has(p.cuisine)) continue;
      batch.push(p);
      used.add(p.cuisine);
    }
    for (const p of ranked) {
      if (batch.length >= SOLO_BATCH) break;
      if (!ids.includes(p.id) && !batch.includes(p)) batch.push(p);
    }
    if (!batch.length) break;
    ids.push(...batch.map((p) => p.id));
  }
  return { ids: ids.slice(0, count), relaxed };
}

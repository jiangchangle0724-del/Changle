// One person who doesn't know what to eat: a few taps (mood, which side of the menu, budget, how
// far, diet card) become a ranked list of every place open in range and budget, the ones that fit
// the mood and the side first, each with the reasons it is where it is.
import { eligible, rank, reasonsFor, type Reason } from "./pick";
import type { Center, CuisineId, Limits, Place, RangeId } from "./types";

export type SoloMood = "warm" | "bold" | "light" | "sweet" | "any";
export type SoloSide = "chinese" | "jk" | "asia" | "west" | "any";

export interface SoloAnswers {
  mood: SoloMood;
  side: SoloSide;
}

export const SOLO_MOODS: SoloMood[] = ["warm", "bold", "light", "sweet", "any"];
export const SOLO_SIDES: SoloSide[] = ["chinese", "jk", "asia", "west", "any"];

/** Cuisines that fit each mood. A place matching the mood moves up, nothing more. */
export const MOOD_CUISINES: Record<Exclude<SoloMood, "any">, CuisineId[]> = {
  warm: ["hotpot", "ramen", "vietnamese", "chinese", "cantonese", "korean", "taiwanese", "hk_cafe"],
  bold: ["sichuan", "hotpot", "korean", "thai", "indian", "mexican", "western", "sea"],
  light: ["japanese", "vietnamese", "vegetarian", "cantonese", "middle_eastern", "seafood", "taiwanese"],
  sweet: ["brunch", "hk_cafe", "taiwanese"],
};

/** Which side of the menu. Its places move up; the others stay on the list below them. */
export const SIDE_CUISINES: Record<Exclude<SoloSide, "any">, CuisineId[]> = {
  chinese: ["cantonese", "hk_cafe", "sichuan", "hotpot", "taiwanese", "chinese"],
  jk: ["japanese", "ramen", "korean"],
  asia: ["vietnamese", "thai", "sea", "indian"],
  west: ["italian", "mexican", "western", "middle_eastern", "seafood", "brunch", "vegetarian"],
};

/** The top of one person's list: full cards with photos, each a different cuisine. */
export const SOLO_TOP = 3;
/** How much a mood match counts, in "people who liked it in round 1" (see pick.ts WEIGHTS.likes). */
const MOOD_BOOST = 1.5;
/** The side of the menu asked for, in score points: about a Google star and a half. */
export const SIDE_BOOST = 1;

export function cleanAnswers(x: unknown): SoloAnswers {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const mood = SOLO_MOODS.includes(o.mood as SoloMood) ? (o.mood as SoloMood) : "any";
  const side = SOLO_SIDES.includes(o.side as SoloSide) ? (o.side as SoloSide) : "any";
  return { mood, side };
}

export const moodFits = (a: SoloAnswers, c: CuisineId) => a.mood !== "any" && MOOD_CUISINES[a.mood].includes(c);
export const sideFits = (a: SoloAnswers, c: CuisineId) => a.side !== "any" && SIDE_CUISINES[a.side].includes(c);

/** Why a place is where it is on one person's list, best reasons first, at most three. */
export function soloReasons(p: Place, a: SoloAnswers, limits: Limits, center: Center, range: RangeId): Reason[] {
  return reasonsFor(p, { limits, center, range, mood: moodFits(a, p.cuisine), side: sideFits(a, p.cuisine) });
}

export interface SoloInput {
  places: Place[];
  answers: SoloAnswers;
  limits: Limits;
  center: Center;
  range: RangeId;
  now: number;
}

/**
 * Every place open now and within the budget, best first: scored like a table's list, with the mood
 * standing in for round 1's thumbs-up and the side of the menu moving its places up. Someone's diet
 * moves places down the same way as at a table. The top three are three different cuisines.
 */
export function soloRank(input: SoloInput): string[] {
  const { answers: a } = input;
  const likes: Partial<Record<CuisineId, number>> = {};
  if (a.mood !== "any") for (const c of MOOD_CUISINES[a.mood]) likes[c] = MOOD_BOOST;
  return rank({
    places: eligible(input.places, input.limits, input.now),
    limits: input.limits,
    bans: {},
    likes,
    members: 1,
    center: input.center,
    range: input.range,
    now: input.now,
    boost: (p) => (sideFits(a, p.cuisine) ? SIDE_BOOST : 0),
    top: SOLO_TOP,
    perCuisine: 1,
  });
}

// Hard limits: allergies, halal, vegetarian, budget. They only filter; they are never traded off
// against taste. The table's limits are the union of everyone's, and nobody's name is attached.
import type { AllergenId, AllergyLevel, Budget, CuisineId, Limits, Place, Text } from "./types";

export const ALLERGENS: Record<AllergenId, Text> = {
  peanut: { zh: "花生", en: "Peanut" },
  treenut: { zh: "坚果", en: "Tree nuts" },
  shellfish: { zh: "虾蟹贝类", en: "Shellfish" },
  fish: { zh: "鱼", en: "Fish" },
  sesame: { zh: "芝麻", en: "Sesame" },
  soy: { zh: "大豆", en: "Soy" },
  egg: { zh: "鸡蛋", en: "Egg" },
  dairy: { zh: "奶制品", en: "Dairy" },
  gluten: { zh: "麸质（小麦）", en: "Gluten (wheat)" },
};

/**
 * DRAFT — needs review by people who live with these allergies.
 * A severe allergy rules out the cuisines where the allergen is in most dishes or in shared
 * sauces and fryers. Nobody publishes allergens per menu, so this is a cautious guess, and every
 * result still says "tell your server". Allergens not listed here (egg, dairy, gluten) are in too
 * many cuisines to rule any out; for those the card only warns.
 */
export const SEVERE_RULES_OUT: Partial<Record<AllergenId, CuisineId[]>> = {
  peanut: ["thai", "sea", "vietnamese", "sichuan"],
  treenut: ["indian", "middle_eastern"],
  shellfish: ["seafood", "cantonese", "japanese", "thai", "vietnamese", "sea"],
  fish: ["seafood", "japanese", "thai", "vietnamese", "sea", "korean"],
  sesame: ["korean", "middle_eastern", "japanese", "sichuan", "cantonese", "chinese", "taiwanese", "hotpot", "hk_cafe"],
  soy: ["cantonese", "hk_cafe", "sichuan", "hotpot", "taiwanese", "chinese", "japanese", "ramen", "korean"],
};

/** Cuisines that often have halal options; kept for a halal table with "please check". */
const HALAL_LIKELY: CuisineId[] = ["middle_eastern", "indian", "sea"];
/** Cuisines where vegetarians usually find plenty even when Google doesn't say. */
const VEG_FRIENDLY: CuisineId[] = ["vegetarian", "indian", "middle_eastern", "italian"];

export const BUDGETS: Budget[] = [0, 20, 35, 60];

/** Everyone's limits merged: the strictest of each. */
export function mergeLimits(all: Limits[]): Limits {
  const out: Limits = { allergies: {}, halal: false, vegetarian: false, budget: 0 };
  for (const l of all) {
    for (const [a, level] of Object.entries(l.allergies) as [AllergenId, AllergyLevel][]) {
      if (level === "severe" || !out.allergies[a]) out.allergies[a] = level;
    }
    out.halal ||= l.halal;
    out.vegetarian ||= l.vegetarian;
    if (l.budget && (!out.budget || l.budget < out.budget)) out.budget = l.budget;
  }
  return out;
}

export type Warning =
  | { k: "allergy"; allergen: AllergenId; level: AllergyLevel }
  | { k: "unknownCuisine" }
  | { k: "halalCheck" }
  | { k: "vegCheck" }
  | { k: "priceUnknown" };

export interface Verdict {
  ok: boolean;
  /** Why it was ruled out (first reason), for tests and the "nothing left" message. */
  why?: "allergy" | "halal" | "vegetarian" | "budget";
  warnings: Warning[];
}

/** May this table go to this place, and what should the card warn about? */
export function check(place: Place, l: Limits): Verdict {
  const warnings: Warning[] = [];
  for (const [a, level] of Object.entries(l.allergies) as [AllergenId, AllergyLevel][]) {
    if (level === "severe" && SEVERE_RULES_OUT[a]?.includes(place.cuisine)) return { ok: false, why: "allergy", warnings };
    warnings.push({ k: "allergy", allergen: a, level });
  }
  if (place.cuisine === "other" && Object.values(l.allergies).includes("severe")) warnings.push({ k: "unknownCuisine" });
  if (l.halal && place.halal !== "yes") {
    if (!HALAL_LIKELY.includes(place.cuisine)) return { ok: false, why: "halal", warnings };
    warnings.push({ k: "halalCheck" });
  }
  if (l.vegetarian) {
    if (place.veg === false) return { ok: false, why: "vegetarian", warnings };
    if (place.veg === undefined && !VEG_FRIENDLY.includes(place.cuisine)) warnings.push({ k: "vegCheck" });
  }
  if (l.budget) {
    if (place.price === undefined) warnings.push({ k: "priceUnknown" });
    else if (place.price > l.budget) return { ok: false, why: "budget", warnings };
  }
  return { ok: true, warnings };
}

/** Anything that would make a person's limits nonsense (from a phone we don't trust). */
export function cleanLimits(x: unknown): Limits {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const allergies: Limits["allergies"] = {};
  const a = (o.allergies && typeof o.allergies === "object" ? o.allergies : {}) as Record<string, unknown>;
  for (const id of Object.keys(ALLERGENS) as AllergenId[]) if (a[id] === "avoid" || a[id] === "severe") allergies[id] = a[id] as AllergyLevel;
  const budget = BUDGETS.includes(o.budget as Budget) ? (o.budget as Budget) : 0;
  return { allergies, halal: o.halal === true, vegetarian: o.vegetarian === true, budget };
}

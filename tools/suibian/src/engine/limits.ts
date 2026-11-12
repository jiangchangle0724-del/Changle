// Diet limits: allergies, halal, vegetarian, budget. Only the budget rules a place out. The rest
// move a place down the list and say what can still be ordered there (the owner's call, 2026-11-11:
// show everything in range and budget, ranked). The table's limits are the union of everyone's,
// and nobody's name is attached.
import type { AllergenId, AllergyLevel, Budget, CuisineId, CustomItem, Limits, Place, Text } from "./types";

export const ALLERGENS: Record<AllergenId, Text> = {
  peanut: { zh: "花生", en: "Peanut" },
  treenut: { zh: "坚果", en: "Tree nuts" },
  shellfish: { zh: "虾蟹贝类", en: "Shellfish" },
  fish: { zh: "鱼", en: "Fish" },
  sesame: { zh: "芝麻", en: "Sesame" },
  soy: { zh: "大豆", en: "Soy" },
  chili: { zh: "辣椒", en: "Chili" },
  egg: { zh: "鸡蛋", en: "Egg" },
  dairy: { zh: "奶制品", en: "Dairy" },
  gluten: { zh: "麸质（小麦）", en: "Gluten (wheat)" },
};

/**
 * The cuisines where each allergen is in most dishes, in shared sauces, broths and fryers, or is
 * the whole menu (eggs at brunch, wheat noodles at ramen). A place of one of them moves down the
 * list for someone who doesn't eat it, to the very bottom for a severe allergy, with a note on what
 * can still be ordered (tips.ts). Nobody publishes allergens per menu, so this is a cautious guess,
 * and every result still says "tell your server".
 *
 * Reviewed with the owner on 2026-11-05 (the review page 「随便 · 严重过敏规则（请帮忙看）」):
 * its suggested additions are in, each with its reason as a comment. Still open there, for friends
 * who live with these allergies: oyster sauce (other Chinese, HK café, Taiwanese for shellfish),
 * other Chinese for peanut, and mustard as an allergen of its own.
 */
export const COMMON_IN: Partial<Record<AllergenId, CuisineId[]>> = {
  // + hot pot (crushed peanuts at the sauce bar), HK café (peanut-butter toast, satay), Taiwanese (peanut powder)
  peanut: ["thai", "sea", "vietnamese", "sichuan", "hotpot", "hk_cafe", "taiwanese"],
  // + vegetarian (cashew cream and cheese), brunch and cafés (almond flour in baking)
  treenut: ["indian", "middle_eastern", "vegetarian", "brunch"],
  // + Korean (kimchi salted with shrimp), hot pot (seafood broths, shacha sauce with dried shrimp)
  shellfish: ["seafood", "cantonese", "japanese", "thai", "vietnamese", "sea", "korean", "hotpot"],
  // + ramen (bonito and dried-sardine broths), hot pot (fish balls, shacha sauce with dried fish)
  fish: ["seafood", "japanese", "thai", "vietnamese", "sea", "korean", "ramen", "hotpot"],
  // + ramen (sesame seeds and oil, tantanmen), western (sesame burger buns)
  sesame: ["korean", "middle_eastern", "japanese", "sichuan", "cantonese", "chinese", "taiwanese", "hotpot", "hk_cafe", "ramen", "western"],
  // + vegetarian (tofu, soy milk, mock meat), Southeast Asian (sweet soy sauce)
  soy: ["cantonese", "hk_cafe", "sichuan", "hotpot", "taiwanese", "chinese", "japanese", "ramen", "korean", "vegetarian", "sea"],
  chili: ["sichuan", "hotpot", "thai", "korean", "indian", "mexican", "sea"],
  // Brunch menus are mostly eggs.
  egg: ["brunch"],
  // Butter, cheese and cream throughout; ghee and paneer in Indian cooking.
  dairy: ["brunch", "italian", "indian"],
  // The whole menu is wheat noodles, pasta or pizza.
  gluten: ["ramen", "italian"],
};

/** Typed items: at most this many per person, each this long. */
export const MAX_CUSTOM = 6;
export const MAX_CUSTOM_LENGTH = 16;

/** Cuisines that often have halal options: near the top for a halal table, with "please check". */
export const HALAL_LIKELY: CuisineId[] = ["middle_eastern", "indian", "sea"];
/** Cuisines where vegetarians usually find plenty even when Google doesn't say. */
export const VEG_FRIENDLY: CuisineId[] = ["vegetarian", "indian", "middle_eastern", "italian"];

export const BUDGETS: Budget[] = [0, 20, 35, 60];

/** Everyone's limits merged: the strictest of each. */
export function mergeLimits(all: Limits[]): Limits {
  const out: Limits = { allergies: {}, custom: [], halal: false, vegetarian: false, budget: 0 };
  for (const l of all) {
    for (const [a, level] of Object.entries(l.allergies) as [AllergenId, AllergyLevel][]) {
      if (level === "severe" || !out.allergies[a]) out.allergies[a] = level;
    }
    for (const c of l.custom) {
      // "香菜" and "香菜 " or "Pork" and "pork" are the same thing.
      const same = out.custom.find((x) => x.name.toLowerCase() === c.name.toLowerCase());
      if (!same) out.custom.push({ ...c });
      else if (c.level === "severe") same.level = "severe";
    }
    out.halal ||= l.halal;
    out.vegetarian ||= l.vegetarian;
    if (l.budget && (!out.budget || l.budget < out.budget)) out.budget = l.budget;
  }
  return out;
}

export type Warning =
  | { k: "allergy"; allergen: AllergenId; level: AllergyLevel }
  | { k: "custom"; name: string; level: AllergyLevel }
  | { k: "unknownCuisine" }
  | { k: "priceUnknown" };

/** Why a place sits further down the list for this table; each comes with a note (tips.ts). */
export type Concern =
  /** Someone doesn't eat, or is severely allergic to, something common in this cuisine. */
  | { k: "allergy"; allergen: AllergenId; level: AllergyLevel }
  /** Someone eats halal and the place doesn't say it is. `likely`: a cuisine that often has halal options. */
  | { k: "halal"; likely: boolean }
  /** Someone is vegetarian. `known`: Google says it has no vegetarian food; otherwise nobody says. */
  | { k: "veg"; known: boolean };

export interface Verdict {
  /** False only over budget: the one limit that rules a place out. */
  ok: boolean;
  why?: "budget";
  warnings: Warning[];
  concerns: Concern[];
}

/** May this table go to this place, and what should the card warn about? */
export function check(place: Place, l: Limits): Verdict {
  const warnings: Warning[] = [];
  const concerns: Concern[] = [];
  for (const [a, level] of Object.entries(l.allergies) as [AllergenId, AllergyLevel][]) {
    warnings.push({ k: "allergy", allergen: a, level });
    if (COMMON_IN[a]?.includes(place.cuisine)) concerns.push({ k: "allergy", allergen: a, level });
  }
  for (const c of l.custom) warnings.push({ k: "custom", name: c.name, level: c.level });
  if (place.cuisine === "other" && Object.values(l.allergies).includes("severe")) warnings.push({ k: "unknownCuisine" });
  if (l.halal && place.halal !== "yes") concerns.push({ k: "halal", likely: HALAL_LIKELY.includes(place.cuisine) });
  if (l.vegetarian) {
    if (place.veg === false) concerns.push({ k: "veg", known: true });
    else if (place.veg === undefined && !VEG_FRIENDLY.includes(place.cuisine)) concerns.push({ k: "veg", known: false });
  }
  if (l.budget) {
    if (place.price === undefined) warnings.push({ k: "priceUnknown" });
    else if (place.price > l.budget) return { ok: false, why: "budget", warnings, concerns };
  }
  return { ok: true, warnings, concerns };
}

/** Anything that would make a person's limits nonsense (from a phone we don't trust). */
export function cleanLimits(x: unknown): Limits {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const allergies: Limits["allergies"] = {};
  const a = (o.allergies && typeof o.allergies === "object" ? o.allergies : {}) as Record<string, unknown>;
  for (const id of Object.keys(ALLERGENS) as AllergenId[]) if (a[id] === "avoid" || a[id] === "severe") allergies[id] = a[id] as AllergyLevel;
  const custom: CustomItem[] = [];
  for (const c of Array.isArray(o.custom) ? o.custom : []) {
    const x = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const name = typeof x.name === "string" ? x.name.replace(/\s+/g, " ").trim().slice(0, MAX_CUSTOM_LENGTH) : "";
    if (!name || custom.some((y) => y.name.toLowerCase() === name.toLowerCase())) continue;
    custom.push({ name, level: x.level === "severe" ? "severe" : "avoid" });
    if (custom.length >= MAX_CUSTOM) break;
  }
  const budget = BUDGETS.includes(o.budget as Budget) ? (o.budget as Budget) : 0;
  return { allergies, custom, halal: o.halal === true, vegetarian: o.vegetarian === true, budget };
}

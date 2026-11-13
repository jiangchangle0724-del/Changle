// Which Google searches one pick runs. Google gives at most 20 restaurants per search, so asking one
// circle the same two ways brought back the same 40 places every time. Round 1 now comes before the
// search, so it knows what the table wants: after the whole circle's most popular, it spends its
// other searches on the occasion (a business dinner: fine dining, steakhouses, seafood, Cantonese
// banquet rooms…), the cuisines liked the most (by Google's place types, or by words where Google
// has none, like Sichuan), then on more of the area: the nearest when walking, smaller circles
// inside a drive, other neighbourhoods for "any distance". Never more than SEARCHES_PER_PICK. For an
// occasion, the searches that aren't for a liked cuisine leave out kinds of place plainly not for it
// (no bagel shops or cafés for a business dinner, no bars for the family, no breakfast places at
// dinner time).
import { CUISINES } from "./cuisines";
import { NEIGHBOURHOODS, RANGES, distanceMeters } from "./clock";
import { mealOf, type OccasionId } from "./occasion";
import type { CuisineId, RangeId } from "./types";

export interface Point {
  lat: number;
  lng: number;
}

export interface SearchCall {
  center: Point;
  /** Meters. */
  radius: number;
  rank: "POPULARITY" | "DISTANCE";
  /** A Nearby Search for these Google place types (only ones from its "Table A"); or */
  types?: string[];
  /** a Text Search for these words, for a cuisine Google has no type for. */
  text?: string;
  /** The cuisine round 1 liked that this search is for. */
  cuisine?: CuisineId;
  /** The occasion this search is for (its kinds of place). */
  occasion?: OccasionId;
  /** Google main types it leaves out (Nearby Search only): kinds of place plainly not for the occasion. */
  exclude?: string[];
}

export interface PlanOptions {
  /** Round 1's liked cuisines, most liked first. */
  liked?: readonly CuisineId[];
  /** What the meal is for, and when (ms since epoch; the meal decides what's left out at dinner). */
  occasion?: OccasionId;
  at?: number;
}

/** Kinds of place each occasion looks for in a search of its own (all in Google's Table A). */
export const OCCASION_TYPES: Partial<Record<OccasionId, string[]>> = {
  business: ["fine_dining_restaurant", "steak_house", "seafood_restaurant", "oyster_bar_restaurant", "cantonese_restaurant", "french_restaurant", "sushi_restaurant"],
  date: ["fine_dining_restaurant", "french_restaurant", "italian_restaurant", "wine_bar", "mediterranean_restaurant", "tapas_restaurant", "spanish_restaurant", "oyster_bar_restaurant", "japanese_izakaya_restaurant", "bistro", "steak_house"],
  birthday: ["korean_barbecue_restaurant", "hot_pot_restaurant", "steak_house", "seafood_restaurant", "fine_dining_restaurant", "japanese_izakaya_restaurant", "cantonese_restaurant", "brazilian_restaurant"],
  family: ["family_restaurant", "dim_sum_restaurant", "cantonese_restaurant", "chinese_restaurant", "buffet_restaurant", "pizza_restaurant", "italian_restaurant", "japanese_restaurant", "korean_restaurant", "diner"],
  friends: ["hot_pot_restaurant", "korean_barbecue_restaurant", "japanese_izakaya_restaurant", "gastropub", "brewpub", "pub", "bar_and_grill", "mexican_restaurant", "tapas_restaurant", "yakitori_restaurant"],
  colleagues: ["hot_pot_restaurant", "korean_barbecue_restaurant", "chinese_restaurant", "cantonese_restaurant", "dim_sum_restaurant", "japanese_izakaya_restaurant", "gastropub", "korean_restaurant", "buffet_restaurant"],
  solo: ["ramen_restaurant", "noodle_shop", "chinese_noodle_restaurant", "vietnamese_restaurant", "dumpling_restaurant", "japanese_curry_restaurant", "soup_restaurant", "taiwanese_restaurant", "sushi_restaurant"],
  latenight: ["korean_barbecue_restaurant", "hot_pot_restaurant", "ramen_restaurant", "noodle_shop", "chinese_noodle_restaurant", "diner", "pub", "korean_restaurant", "japanese_izakaya_restaurant", "chicken_wings_restaurant", "dumpling_restaurant"],
};

/** Coffee, tea, bakeries, desserts and snacks. */
const SWEETS_T = ["coffee_shop", "coffee_stand", "coffee_roastery", "cat_cafe", "dog_cafe", "tea_house", "bakery", "cake_shop", "pastry_shop", "dessert_shop", "dessert_restaurant", "ice_cream_shop", "donut_shop", "juice_shop", "acai_shop", "candy_store", "chocolate_shop", "confectionery"];
/** Counters: fast food, sandwiches, food courts, takeout only. */
const COUNTER_T = ["fast_food_restaurant", "food_court", "sandwich_shop", "deli", "meal_takeaway", "meal_delivery", "pizza_delivery", "cafeteria", "snack_bar", "hot_dog_stand", "hot_dog_restaurant", "salad_shop"];
/** Cafés and breakfast places. */
const CAFE_T = ["cafe", "bagel_shop", "breakfast_restaurant", "brunch_restaurant"];
/** Bars. */
const BAR_T = ["bar", "pub", "irish_pub", "sports_bar", "night_club", "cocktail_bar", "lounge_bar", "wine_bar", "hookah_bar", "beer_garden", "brewery", "winery"];

/** What each occasion's general searches leave out. */
const EXCLUDE: Partial<Record<OccasionId, string[]>> = {
  business: [...SWEETS_T, ...COUNTER_T, ...CAFE_T],
  date: [...SWEETS_T, ...COUNTER_T],
  birthday: [...SWEETS_T, ...COUNTER_T, ...CAFE_T],
  colleagues: [...SWEETS_T, ...COUNTER_T],
  family: [...BAR_T, ...SWEETS_T],
  friends: SWEETS_T,
};
/** And at dinner, for an occasion other than "just a meal", late night or one person: breakfast places. */
const DINNER_EXCLUDE = ["bagel_shop", "breakfast_restaurant", "brunch_restaurant", "bakery", "donut_shop", "coffee_shop", "cafe"];

/** The Google main types an occasion's general searches leave out at `at`. */
export function excludedFor(occasion: OccasionId | undefined, at: number | undefined): string[] {
  if (!occasion) return [];
  const out = new Set(EXCLUDE[occasion] ?? []);
  const plain = occasion === "casual" || occasion === "latenight" || occasion === "solo";
  if (!plain && at !== undefined && mealOf(at) === "dinner") for (const x of DINNER_EXCLUDE) out.add(x);
  return [...out];
}

/** Google bills each search: this many at most for one pick (it was 2 until 2026-11-05). */
export const SEARCHES_PER_PICK = 4;
/** Of those, at most this many Text Searches (a separate Google quota). */
export const TEXT_SEARCHES_PER_PICK = 2;
/** Google takes at most this many types in one search. */
const MAX_TYPES = 50;

/** Circles at least this wide (walk 15 and up, every drive) are also asked in parts. */
export const SPLIT_FROM = 1200;
/** A part sits this far out from the middle and is this wide (both × the radius): inside the circle. */
const PART_OFFSET = 0.45;
const PART_RADIUS = 0.55;
/** "Any distance" asks around other neighbourhoods instead, each a circle this wide. */
const ANCHOR_RADIUS = 3000;

const RESTAURANT = ["restaurant"];

/**
 * The searches for one pick:
 * - the whole circle's most popular;
 * - the occasion's kinds of place, most popular in the whole circle (OCCASION_TYPES);
 * - each cuisine round 1 liked, most liked first: its most popular in the whole circle (Text
 *   Searches, for cuisines Google has no type for, at most TEXT_SEARCHES_PER_PICK); cuisines past the
 *   last search join the last typed one;
 * - what's left, up to SEARCHES_PER_PICK: walking, the nearest; driving, parts of the circle at a
 *   random turn; any distance, other neighbourhoods picked at random.
 * Every search but a liked cuisine's leaves out what the occasion rules out (excludedFor()).
 */
export function searchPlan(center: Point, range: RangeId, o: PlanOptions = {}, random: () => number = Math.random): SearchCall[] {
  const r = RANGES[range];
  const middle = { lat: center.lat, lng: center.lng };
  const leftOut = excludedFor(o.occasion, o.at);
  /** A search not for a liked cuisine: it leaves out what the occasion rules out (never a type it asks for). */
  const general = (c: SearchCall): SearchCall => {
    const exclude = leftOut.filter((x) => !c.types?.includes(x));
    return exclude.length && c.types ? { ...c, exclude } : c;
  };
  const calls: SearchCall[] = [general({ center: middle, radius: r.meters, rank: "POPULARITY", types: RESTAURANT })];
  const kinds = o.occasion && OCCASION_TYPES[o.occasion];
  if (kinds) calls.push(general({ center: middle, radius: r.meters, rank: "POPULARITY", types: [...kinds], occasion: o.occasion }));
  let texts = 0;
  for (const c of o.liked ?? []) {
    const want = CUISINES[c]?.search;
    if (!want) continue;
    if (calls.length < SEARCHES_PER_PICK) {
      if (want.types) calls.push({ center: middle, radius: r.meters, rank: "POPULARITY", types: [...want.types], cuisine: c });
      else if (want.text && texts < TEXT_SEARCHES_PER_PICK) {
        calls.push({ center: middle, radius: r.meters, rank: "POPULARITY", text: want.text, cuisine: c });
        texts += 1;
      }
    } else if (want.types) {
      // No search left for it: the last search for a liked cuisine by type asks for this one too.
      const last = [...calls].reverse().find((x) => x.cuisine && x.types);
      if (last?.types && last.types.length + want.types.length <= MAX_TYPES) last.types.push(...want.types);
    }
  }
  if (r.mode === "walk" && calls.length < SEARCHES_PER_PICK) calls.push(general({ center: middle, radius: r.meters, rank: "DISTANCE", types: RESTAURANT }));
  const left = SEARCHES_PER_PICK - calls.length;
  if (left <= 0) return calls;
  if (range === "any") {
    // Other neighbourhoods inside the circle, not the one this pick starts from.
    const others = NEIGHBOURHOODS.filter((n) => distanceMeters(middle, n) > ANCHOR_RADIUS && distanceMeters(middle, n) + ANCHOR_RADIUS <= r.meters);
    for (const n of shuffled(others, random).slice(0, left)) calls.push(general({ center: { lat: n.lat, lng: n.lng }, radius: ANCHOR_RADIUS, rank: "POPULARITY", types: RESTAURANT }));
  } else if (r.meters >= SPLIT_FROM) {
    const turn = random() * 2 * Math.PI;
    for (let i = 0; i < left; i++) {
      calls.push(general({ center: offset(middle, PART_OFFSET * r.meters, turn + (i * 2 * Math.PI) / left), radius: PART_RADIUS * r.meters, rank: "POPULARITY", types: RESTAURANT }));
    }
  }
  return calls;
}

/** A point `meters` from `c` in the direction `angle` (0 = north, clockwise). */
function offset(c: Point, meters: number, angle: number): Point {
  return {
    lat: c.lat + (meters * Math.cos(angle)) / 111_320,
    lng: c.lng + (meters * Math.sin(angle)) / (111_320 * Math.cos((c.lat * Math.PI) / 180)),
  };
}

function shuffled<T>(xs: readonly T[], random: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

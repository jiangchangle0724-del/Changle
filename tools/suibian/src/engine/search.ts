// Which Google searches one pick runs. Google gives at most 20 restaurants per search, so asking one
// circle the same two ways (most popular, nearest) brought back the same 40 every time: in a big
// area like Burnaby most restaurants never came up. Now a pick also asks smaller circles inside the
// area, each for its own most popular, turned a different way each time; "any distance" asks around
// other neighbourhoods; and one person who chose a side of the menu gets a search for that side's
// restaurants alone. Never more than SEARCHES_PER_PICK searches.
import { NEIGHBOURHOODS, RANGES, distanceMeters } from "./clock";
import type { SoloSide } from "./solo";
import type { RangeId } from "./types";

export interface Point {
  lat: number;
  lng: number;
}

export interface SearchCall {
  center: Point;
  /** Meters. */
  radius: number;
  rank: "POPULARITY" | "DISTANCE";
  /** Google place types; only ones Google takes in a search (its "Table A"). */
  types: string[];
}

/** Google bills each search: this many at most for one pick (it was 2). */
export const SEARCHES_PER_PICK = 4;

/**
 * Google's types for each side of the menu, all from its Table A (sichuan_restaurant and
 * singaporean_restaurant aren't: a search naming them is refused). Each one maps back to that side's
 * cuisines in cuisines.ts, so what this search brings stays on the side asked for.
 */
export const SIDE_TYPES: Record<Exclude<SoloSide, "any">, string[]> = {
  chinese: ["chinese_restaurant", "cantonese_restaurant", "dim_sum_restaurant", "hot_pot_restaurant", "taiwanese_restaurant", "chinese_noodle_restaurant", "dumpling_restaurant"],
  jk: [
    "japanese_restaurant",
    "sushi_restaurant",
    "ramen_restaurant",
    "japanese_izakaya_restaurant",
    "japanese_curry_restaurant",
    "tonkatsu_restaurant",
    "yakiniku_restaurant",
    "yakitori_restaurant",
    "korean_restaurant",
    "korean_barbecue_restaurant",
  ],
  asia: [
    "vietnamese_restaurant",
    "thai_restaurant",
    "indian_restaurant",
    "north_indian_restaurant",
    "south_indian_restaurant",
    "pakistani_restaurant",
    "indonesian_restaurant",
    "malaysian_restaurant",
    "filipino_restaurant",
  ],
  west: [
    "italian_restaurant",
    "pizza_restaurant",
    "mexican_restaurant",
    "latin_american_restaurant",
    "taco_restaurant",
    "american_restaurant",
    "hamburger_restaurant",
    "steak_house",
    "french_restaurant",
    "spanish_restaurant",
    "barbecue_restaurant",
    "seafood_restaurant",
    "mediterranean_restaurant",
    "middle_eastern_restaurant",
    "greek_restaurant",
    "lebanese_restaurant",
    "turkish_restaurant",
    "persian_restaurant",
    "brunch_restaurant",
    "breakfast_restaurant",
    "vegetarian_restaurant",
    "vegan_restaurant",
  ],
};

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
 * - walking: also the nearest (driving, the parts below cover the area better);
 * - one person who chose a side of the menu: that side's most popular in the whole circle;
 * - the rest, up to SEARCHES_PER_PICK: parts of the circle (walk 15 and up, drives), at a random
 *   turn so each pick looks in different corners, or for "any distance" other neighbourhoods,
 *   picked at random.
 */
export function searchPlan(center: Point, range: RangeId, side: SoloSide = "any", random: () => number = Math.random): SearchCall[] {
  const r = RANGES[range];
  const middle = { lat: center.lat, lng: center.lng };
  const calls: SearchCall[] = [{ center: middle, radius: r.meters, rank: "POPULARITY", types: RESTAURANT }];
  if (r.mode === "walk") calls.push({ center: middle, radius: r.meters, rank: "DISTANCE", types: RESTAURANT });
  if (side !== "any") calls.push({ center: middle, radius: r.meters, rank: "POPULARITY", types: SIDE_TYPES[side] });
  const left = SEARCHES_PER_PICK - calls.length;
  if (range === "any") {
    // Other neighbourhoods inside the circle, not the one this pick starts from.
    const others = NEIGHBOURHOODS.filter((n) => distanceMeters(middle, n) > ANCHOR_RADIUS && distanceMeters(middle, n) + ANCHOR_RADIUS <= r.meters);
    for (const n of shuffled(others, random).slice(0, left)) calls.push({ center: { lat: n.lat, lng: n.lng }, radius: ANCHOR_RADIUS, rank: "POPULARITY", types: RESTAURANT });
  } else if (r.meters >= SPLIT_FROM && left > 0) {
    const turn = random() * 2 * Math.PI;
    for (let i = 0; i < left; i++) {
      calls.push({ center: offset(middle, PART_OFFSET * r.meters, turn + (i * 2 * Math.PI) / left), radius: PART_RADIUS * r.meters, rank: "POPULARITY", types: RESTAURANT });
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

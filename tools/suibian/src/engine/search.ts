// Which Google searches one pick runs. Google gives at most 20 restaurants per search, so asking one
// circle the same two ways brought back the same 40 places every time. Round 1 now comes before the
// search, so it knows what the table wants: after the whole circle's most popular, it spends its
// other searches on the cuisines liked the most (by Google's place types, or by words where Google
// has none, like Sichuan), then on more of the area: the nearest when walking, smaller circles
// inside a drive, other neighbourhoods for "any distance". Never more than SEARCHES_PER_PICK.
import { CUISINES } from "./cuisines";
import { NEIGHBOURHOODS, RANGES, distanceMeters } from "./clock";
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
 * - each cuisine round 1 liked, most liked first: its most popular in the whole circle (Text
 *   Searches, for cuisines Google has no type for, at most TEXT_SEARCHES_PER_PICK); cuisines past the
 *   last search join the last typed one;
 * - what's left, up to SEARCHES_PER_PICK: walking, the nearest; driving, parts of the circle at a
 *   random turn; any distance, other neighbourhoods picked at random.
 */
export function searchPlan(center: Point, range: RangeId, liked: readonly CuisineId[] = [], random: () => number = Math.random): SearchCall[] {
  const r = RANGES[range];
  const middle = { lat: center.lat, lng: center.lng };
  const calls: SearchCall[] = [{ center: middle, radius: r.meters, rank: "POPULARITY", types: RESTAURANT }];
  let texts = 0;
  for (const c of liked) {
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
  if (r.mode === "walk" && calls.length < SEARCHES_PER_PICK) calls.push({ center: middle, radius: r.meters, rank: "DISTANCE", types: RESTAURANT });
  const left = SEARCHES_PER_PICK - calls.length;
  if (left <= 0) return calls;
  if (range === "any") {
    // Other neighbourhoods inside the circle, not the one this pick starts from.
    const others = NEIGHBOURHOODS.filter((n) => distanceMeters(middle, n) > ANCHOR_RADIUS && distanceMeters(middle, n) + ANCHOR_RADIUS <= r.meters);
    for (const n of shuffled(others, random).slice(0, left)) calls.push({ center: { lat: n.lat, lng: n.lng }, radius: ANCHOR_RADIUS, rank: "POPULARITY", types: RESTAURANT });
  } else if (r.meters >= SPLIT_FROM) {
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

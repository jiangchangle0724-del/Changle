// Which Google searches one pick runs (searchPlan): more of the area than the same 40 places, never
// more than four searches, and only place types Google takes in a search.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NEIGHBOURHOODS, RANGES, SEARCHES_PER_PICK, SIDE_CUISINES, SIDE_TYPES, distanceMeters, guessCuisine, searchPlan, type RangeId, type SoloSide } from "../src/engine";

const metrotown = NEIGHBOURHOODS.find((n) => n.en === "Burnaby Metrotown")!;
const ranges = Object.keys(RANGES) as RangeId[];
const sides: SoloSide[] = ["any", "chinese", "jk", "asia", "west"];

/**
 * The food types in Google's Table A (the ones a search may name), from
 * developers.google.com/maps/documentation/places/web-service/place-types, read 2026-11-05.
 * Only the ones this tool might use; sichuan_restaurant and singaporean_restaurant are NOT in it.
 */
const TABLE_A = new Set([
  "restaurant",
  "chinese_restaurant", "cantonese_restaurant", "dim_sum_restaurant", "hot_pot_restaurant", "taiwanese_restaurant", "chinese_noodle_restaurant", "dumpling_restaurant",
  "japanese_restaurant", "sushi_restaurant", "ramen_restaurant", "japanese_izakaya_restaurant", "japanese_curry_restaurant", "tonkatsu_restaurant", "yakiniku_restaurant", "yakitori_restaurant",
  "korean_restaurant", "korean_barbecue_restaurant",
  "vietnamese_restaurant", "thai_restaurant", "indian_restaurant", "north_indian_restaurant", "south_indian_restaurant", "pakistani_restaurant", "indonesian_restaurant", "malaysian_restaurant", "filipino_restaurant",
  "italian_restaurant", "pizza_restaurant", "mexican_restaurant", "latin_american_restaurant", "taco_restaurant", "american_restaurant", "hamburger_restaurant", "steak_house", "french_restaurant",
  "spanish_restaurant", "barbecue_restaurant", "seafood_restaurant", "mediterranean_restaurant", "middle_eastern_restaurant", "greek_restaurant", "lebanese_restaurant", "turkish_restaurant",
  "persian_restaurant", "brunch_restaurant", "breakfast_restaurant", "vegetarian_restaurant", "vegan_restaurant",
]);

const inside = (outer: { center: { lat: number; lng: number }; radius: number }, inner: { center: { lat: number; lng: number }; radius: number }) =>
  distanceMeters(outer.center, inner.center) + inner.radius <= outer.radius + 1;

test("plan: a short walk asks the circle twice, most popular and nearest, as before", () => {
  for (const range of ["walk5", "walk10"] as const) {
    const plan = searchPlan(metrotown, range);
    assert.deepEqual(plan.map((c) => c.rank), ["POPULARITY", "DISTANCE"]);
    for (const c of plan) assert.deepEqual(c, { center: { lat: metrotown.lat, lng: metrotown.lng }, radius: RANGES[range].meters, rank: c.rank, types: ["restaurant"] });
  }
});

test("plan: never more than four searches, always starting with the whole circle's most popular", () => {
  for (const range of ranges) {
    for (const side of sides) {
      const plan = searchPlan(metrotown, range, side, () => 0.3);
      assert.ok(plan.length >= 2 && plan.length <= SEARCHES_PER_PICK, `${range} ${side}: ${plan.length}`);
      assert.deepEqual(plan[0], { center: { lat: metrotown.lat, lng: metrotown.lng }, radius: RANGES[range].meters, rank: "POPULARITY", types: ["restaurant"] });
    }
  }
});

test("plan: a drive asks three parts of the area, inside the circle, turned differently each time", () => {
  const a = searchPlan(metrotown, "drive15", "any", () => 0.1);
  const b = searchPlan(metrotown, "drive15", "any", () => 0.6);
  assert.equal(a.length, 4);
  assert.ok(!a.some((c) => c.rank === "DISTANCE"), "driving: parts instead of the nearest 20");
  const whole = a[0];
  for (const plan of [a, b]) {
    for (const part of plan.slice(1)) {
      assert.ok(inside(whole, part), "each part inside the circle");
      assert.ok(part.radius < whole.radius);
    }
  }
  assert.notDeepEqual(a.slice(1).map((c) => c.center), b.slice(1).map((c) => c.center), "a different turn, different corners");
});

test("plan: one person's side of the menu gets its own search, and the parts make room for it", () => {
  const walk = searchPlan(metrotown, "walk10", "chinese");
  assert.equal(walk.length, 3);
  assert.deepEqual(walk[2], { center: { lat: metrotown.lat, lng: metrotown.lng }, radius: 800, rank: "POPULARITY", types: SIDE_TYPES.chinese });
  const drive = searchPlan(metrotown, "drive25", "jk", () => 0.5);
  assert.equal(drive.length, 4);
  assert.deepEqual(drive[1].types, SIDE_TYPES.jk);
  assert.equal(drive.slice(2).length, 2, "two parts left");
});

test("plan: any distance asks around other neighbourhoods, not the one it starts from", () => {
  const plan = searchPlan(metrotown, "any", "any", () => 0.7);
  assert.equal(plan.length, 4);
  for (const c of plan.slice(1)) {
    assert.ok(NEIGHBOURHOODS.some((n) => n.lat === c.center.lat && n.lng === c.center.lng), "a neighbourhood");
    assert.ok(distanceMeters(metrotown, c.center) > c.radius, "not where it starts");
    assert.ok(inside(plan[0], c));
  }
  assert.equal(new Set(plan.slice(1).map((c) => `${c.center.lat},${c.center.lng}`)).size, 3, "three different ones");
});

test("plan: every type it names is one Google takes in a search", () => {
  for (const side of sides) for (const range of ranges) for (const c of searchPlan(metrotown, range, side)) for (const t of c.types) assert.ok(TABLE_A.has(t), t);
});

test("plan: each side's types come back as that side's cuisines", () => {
  for (const [side, types] of Object.entries(SIDE_TYPES) as [Exclude<SoloSide, "any">, string[]][]) {
    for (const t of types) assert.ok(SIDE_CUISINES[side].includes(guessCuisine("Some Place", t)), `${t} → ${guessCuisine("Some Place", t)} is not ${side}`);
  }
});

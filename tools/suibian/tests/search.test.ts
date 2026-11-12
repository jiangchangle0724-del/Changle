// Which Google searches one pick runs (searchPlan): after round 1, the cuisines people liked and more
// of the area than the same 40 places, never more than four searches, and only place types Google
// takes in a search.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CUISINES, MENU, NEIGHBOURHOODS, OCCASION_IDS, OCCASION_TYPES, RANGES, SEARCHES_PER_PICK, TEXT_SEARCHES_PER_PICK, distanceMeters, excludedFor, guessCuisine, searchPlan, vancouverMs, type CuisineId, type RangeId } from "../src/engine";

const metrotown = NEIGHBOURHOODS.find((n) => n.en === "Burnaby Metrotown")!;
const middle = { lat: metrotown.lat, lng: metrotown.lng };
const ranges = Object.keys(RANGES) as RangeId[];
const likedSets: CuisineId[][] = [[], ["hotpot"], ["sichuan", "shanghai", "northern", "hk_cafe"], ["hotpot", "kbbq", "ramen", "japanese", "italian"], [...MENU]];

/**
 * The food types in Google's Table A (the ones a search may name), from
 * developers.google.com/maps/documentation/places/web-service/place-types, read 2026-11-05 and
 * 2026-11-11. Only the ones this tool might use; sichuan_restaurant, shanghainese_restaurant,
 * hong_kong_style_cafe and singaporean_restaurant are NOT in it (those get a Text Search).
 */
const TABLE_A = new Set([
  "restaurant",
  "chinese_restaurant", "cantonese_restaurant", "dim_sum_restaurant", "hot_pot_restaurant", "taiwanese_restaurant", "chinese_noodle_restaurant", "dumpling_restaurant",
  "japanese_restaurant", "sushi_restaurant", "ramen_restaurant", "japanese_izakaya_restaurant", "japanese_curry_restaurant", "tonkatsu_restaurant", "yakiniku_restaurant", "yakitori_restaurant",
  "korean_restaurant", "korean_barbecue_restaurant",
  "vietnamese_restaurant", "thai_restaurant", "indian_restaurant", "north_indian_restaurant", "south_indian_restaurant", "pakistani_restaurant", "indonesian_restaurant", "malaysian_restaurant", "filipino_restaurant",
  "italian_restaurant", "pizza_restaurant", "mexican_restaurant", "latin_american_restaurant", "taco_restaurant", "american_restaurant", "hamburger_restaurant", "bar_and_grill", "steak_house", "french_restaurant",
  "spanish_restaurant", "tapas_restaurant", "bistro", "barbecue_restaurant", "seafood_restaurant", "mediterranean_restaurant", "middle_eastern_restaurant", "greek_restaurant", "lebanese_restaurant", "turkish_restaurant",
  "persian_restaurant", "brunch_restaurant", "breakfast_restaurant", "vegetarian_restaurant", "vegan_restaurant", "cafe", "coffee_shop", "dessert_restaurant",
  // For the occasions (read 2026-11-12): their own searches, and the kinds of place they leave out.
  "fine_dining_restaurant", "oyster_bar_restaurant", "wine_bar", "family_restaurant", "buffet_restaurant", "diner", "gastropub", "brewpub", "pub", "irish_pub",
  "sports_bar", "night_club", "cocktail_bar", "lounge_bar", "hookah_bar", "beer_garden", "brewery", "winery", "bar", "brazilian_restaurant", "noodle_shop",
  "soup_restaurant", "chicken_wings_restaurant", "coffee_stand", "coffee_roastery", "cat_cafe", "dog_cafe", "tea_house", "bakery", "cake_shop", "pastry_shop",
  "dessert_shop", "ice_cream_shop", "donut_shop", "juice_shop", "acai_shop", "candy_store", "chocolate_shop", "confectionery", "fast_food_restaurant", "food_court",
  "sandwich_shop", "deli", "meal_takeaway", "meal_delivery", "pizza_delivery", "cafeteria", "snack_bar", "hot_dog_stand", "hot_dog_restaurant", "salad_shop", "bagel_shop",
]);

/** Tomorrow-ish at 18:30 and at noon in Vancouver: a dinner and a lunch. */
const DINNER = vancouverMs({ y: 2026, m: 11, d: 13 }, 18 * 60 + 30);
const LUNCH = vancouverMs({ y: 2026, m: 11, d: 13 }, 12 * 60);

const inside = (outer: { center: { lat: number; lng: number }; radius: number }, inner: { center: { lat: number; lng: number }; radius: number }) =>
  distanceMeters(outer.center, inner.center) + inner.radius <= outer.radius + 1;

test("plan: with nothing liked, a short walk asks the circle twice, most popular and nearest, as before", () => {
  for (const range of ["walk5", "walk10"] as const) {
    const plan = searchPlan(metrotown, range);
    assert.deepEqual(plan.map((c) => c.rank), ["POPULARITY", "DISTANCE"]);
    for (const c of plan) assert.deepEqual(c, { center: middle, radius: RANGES[range].meters, rank: c.rank, types: ["restaurant"] });
  }
});

test("plan: never more than four searches (two of them Text Searches), always starting with the whole circle's most popular", () => {
  for (const range of ranges) {
    for (const liked of likedSets) {
      const plan = searchPlan(metrotown, range, { liked }, () => 0.3);
      assert.ok(plan.length >= 2 && plan.length <= SEARCHES_PER_PICK, `${range} ${liked}: ${plan.length}`);
      assert.ok(plan.filter((c) => c.text).length <= TEXT_SEARCHES_PER_PICK);
      assert.deepEqual(plan[0], { center: middle, radius: RANGES[range].meters, rank: "POPULARITY", types: ["restaurant"] });
      for (const c of plan) assert.ok(!!c.types !== !!c.text, "a Nearby Search by types or a Text Search by words");
    }
  }
});

test("plan: each liked cuisine gets its own search over the whole circle, most liked first", () => {
  const walk = searchPlan(metrotown, "walk10", { liked: ["sichuan", "hotpot"] });
  assert.deepEqual(walk.slice(1), [
    { center: middle, radius: 800, rank: "POPULARITY", text: "Sichuan restaurant", cuisine: "sichuan" },
    { center: middle, radius: 800, rank: "POPULARITY", types: ["hot_pot_restaurant"], cuisine: "hotpot" },
    { center: middle, radius: 800, rank: "DISTANCE", types: ["restaurant"] },
  ]);
  // Driving: what's left goes to parts of the area.
  const drive = searchPlan(metrotown, "drive25", { liked: ["hotpot"] }, () => 0.5);
  assert.equal(drive.length, 4);
  assert.deepEqual(drive[1].types, ["hot_pot_restaurant"]);
  assert.ok(drive.slice(2).every((c) => !c.cuisine && c.radius < drive[0].radius), "two parts left");
});

test("plan: more liked cuisines than searches: the last one by type asks for the rest too", () => {
  const plan = searchPlan(metrotown, "walk10", { liked: ["hotpot", "kbbq", "ramen", "italian", "sichuan"] });
  assert.equal(plan.length, SEARCHES_PER_PICK);
  assert.deepEqual(plan.map((c) => c.cuisine), [undefined, "hotpot", "kbbq", "ramen"]);
  assert.deepEqual(plan[3].types, ["ramen_restaurant", "italian_restaurant", "pizza_restaurant"]);
  assert.ok(!plan.some((c) => c.rank === "DISTANCE"), "the liked come before the nearest");
});

test("plan: at most two Text Searches; a third word-only cuisine waits for another table", () => {
  const plan = searchPlan(metrotown, "walk10", { liked: ["sichuan", "shanghai", "northern"] });
  assert.deepEqual(plan.map((c) => c.cuisine ?? c.rank), ["POPULARITY", "sichuan", "shanghai", "DISTANCE"]);
});

test("plan: a drive asks three parts of the area, inside the circle, turned differently each time", () => {
  const a = searchPlan(metrotown, "drive15", {}, () => 0.1);
  const b = searchPlan(metrotown, "drive15", {}, () => 0.6);
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

test("plan: any distance asks around other neighbourhoods, not the one it starts from", () => {
  const plan = searchPlan(metrotown, "any", {}, () => 0.7);
  assert.equal(plan.length, 4);
  for (const c of plan.slice(1)) {
    assert.ok(NEIGHBOURHOODS.some((n) => n.lat === c.center.lat && n.lng === c.center.lng), "a neighbourhood");
    assert.ok(distanceMeters(metrotown, c.center) > c.radius, "not where it starts");
    assert.ok(inside(plan[0], c));
  }
  assert.equal(new Set(plan.slice(1).map((c) => `${c.center.lat},${c.center.lng}`)).size, 3, "three different ones");
});

test("plan: every type it names is one Google takes in a search", () => {
  for (const liked of [...likedSets, ...MENU.map((c) => [c])])
    for (const occasion of OCCASION_IDS)
      for (const range of ranges)
        for (const c of searchPlan(metrotown, range, { liked, occasion, at: DINNER }))
          for (const t of [...(c.types ?? []), ...(c.exclude ?? [])]) assert.ok(TABLE_A.has(t), `${occasion} ${t}`);
});

test("menu: each cuisine is searched for, and what its types find comes back as that cuisine", () => {
  for (const c of MENU) {
    const want = CUISINES[c].search;
    assert.ok(want && !!want.types !== !!want.text, `${c}: types or words`);
    for (const t of want.types ?? []) assert.equal(guessCuisine("Some Place", t), c, `${t} → ${guessCuisine("Some Place", t)} is not ${c}`);
  }
});

test("plan: an occasion gets a search of its own for its kinds of place, after the whole circle's most popular", () => {
  const plan = searchPlan(metrotown, "walk10", { occasion: "business", at: DINNER, liked: ["cantonese"] });
  assert.deepEqual(plan[1].types, OCCASION_TYPES.business);
  assert.equal(plan[1].occasion, "business");
  assert.equal(plan[2].cuisine, "cantonese", "then what round 1 liked");
  assert.equal(plan.length, SEARCHES_PER_PICK);
  // Just a meal: no search of its own, as before.
  assert.ok(!searchPlan(metrotown, "walk10", { occasion: "casual", at: DINNER }).some((c) => c.occasion));
});

test("plan: a business dinner's searches leave out bagel shops, cafés, bakeries and counters; a liked cuisine's never", () => {
  const plan = searchPlan(metrotown, "drive15", { occasion: "business", at: DINNER, liked: ["cafe"] }, () => 0.2);
  for (const c of plan) {
    if (c.cuisine) assert.equal(c.exclude, undefined, "someone liked cafés: that search finds them");
    else for (const t of ["bagel_shop", "cafe", "coffee_shop", "bakery", "fast_food_restaurant", "food_court", "dessert_shop"]) assert.ok(c.exclude?.includes(t), `${t} left out`);
    for (const t of c.exclude ?? []) assert.ok(!c.types?.includes(t), "never a type it asks for");
    assert.ok((c.exclude?.length ?? 0) <= 50, "Google takes at most 50");
  }
  // The family: no bars; at dinner no breakfast places, at lunch they stay.
  assert.ok(excludedFor("family", DINNER).includes("pub") && excludedFor("family", DINNER).includes("bagel_shop"));
  assert.ok(!excludedFor("family", LUNCH).includes("bagel_shop"));
  // Just a meal, late night and one person leave nothing out.
  for (const o of ["casual", "latenight", "solo"] as const) assert.deepEqual(excludedFor(o, DINNER), []);
  assert.deepEqual(excludedFor(undefined, DINNER), []);
});

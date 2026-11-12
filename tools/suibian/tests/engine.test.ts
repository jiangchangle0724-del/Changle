// The rules on their own: limits, cuisines, waits, the ranked list, counting votes.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PLANNED_FROM,
  cleanAt,
  closingTime,
  isOpen,
  mealSlots,
  mealTime,
  vancouverClock,
  vancouverDay,
  vancouverMs,
  ALLERGENS,
  AVOID_GENERIC,
  AVOID_TIPS,
  COMMON_IN,
  CUISINES,
  DISHES,
  MAX_DISHES,
  NO_VOTES_POOL,
  TOP_COUNT,
  avoidTip,
  check,
  counts,
  cleanBallot,
  cleanLimits,
  dishesFor,
  eligible,
  estimateWait,
  guessCuisine,
  mentionsQueue,
  mergeLimits,
  rank,
  RANGE_MODES,
  RANGES,
  MENU,
  OCCASIONS,
  OCCASION_IDS,
  isRange,
  occasionPoints,
  reasonsFor,
  tally,
  travelMinutes,
  type AllergenId,
  type CuisineId,
  type Limits,
  type Place,
  type RangeId,
} from "../src/engine";

const NOW = Date.parse("2026-10-23T02:00:00Z"); // Thursday 7 pm in Vancouver
const center = { lat: 49.2827, lng: -123.1207 };

let n = 0;
function place(o: Partial<Place> = {}): Place {
  n += 1;
  return { id: `p${n}`, name: `Place ${n}`, cuisine: "other", lat: center.lat + 0.001 * (n % 5), lng: center.lng, rating: 4.3, ratings: 300, openNow: true, closesAt: NOW + 3 * 3600_000, ...o };
}

/** A tiny repeatable random source. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const none: Limits = { allergies: {}, custom: [], halal: false, vegetarian: false, budget: 0 };
/** The ranked list for a table, with sensible defaults. */
const ranked = (places: Place[], o: Partial<Parameters<typeof rank>[0]> = {}) => rank({ places, limits: none, likes: {}, bans: {}, center, range: "walk20", now: NOW, ...o });
const severeIn = (p: Place, people: Limits[]) => people.some((l) => Object.entries(l.allergies).some(([a, level]) => level === "severe" && COMMON_IN[a as AllergenId]?.includes(p.cuisine)));

test("only the budget leaves a place out; a severe allergy puts its cuisines below every other place", () => {
  const cuisines = Object.keys(CUISINES) as CuisineId[];
  const allergens = Object.keys(ALLERGENS) as AllergenId[];
  const r = rng(7);
  for (let round = 0; round < 500; round++) {
    const places = Array.from({ length: 30 }, () => place({ cuisine: cuisines[Math.floor(r() * cuisines.length)], price: Math.floor(r() * 80), rating: 3.5 + r() * 1.5, ratings: Math.floor(r() * 3000) }));
    const people: Limits[] = Array.from({ length: 1 + Math.floor(r() * 6) }, () => {
      const allergies: Limits["allergies"] = {};
      for (const a of allergens) if (r() < 0.15) allergies[a] = r() < 0.5 ? "severe" : "avoid";
      return { allergies, custom: [], halal: r() < 0.1, vegetarian: r() < 0.15, budget: ([0, 20, 35, 60] as const)[Math.floor(r() * 4)] };
    });
    const table = mergeLimits(people);
    const ok = eligible(places, table, NOW);
    // Everything within everyone's budget is in, nothing over it.
    const budget = Math.min(...people.map((l) => l.budget || Infinity));
    assert.deepEqual(ok.map((p) => p.id).sort(), places.filter((p) => p.price! <= budget).map((p) => p.id).sort());
    const ids = ranked(ok, { limits: table });
    assert.equal(ids.length, ok.length, "every allowed place is on the list, once");
    assert.equal(new Set(ids).size, ids.length);
    const severe = ids.map((id) => severeIn(ok.find((p) => p.id === id)!, people));
    const firstSevere = severe.indexOf(true);
    if (firstSevere >= 0) assert.ok(severe.slice(firstSevere).every(Boolean), `round ${round}: a severe allergy's cuisine above a place without one`);
  }
});

test("merging limits keeps the strictest of each", () => {
  const t = mergeLimits([
    { allergies: { peanut: "avoid" }, custom: [], halal: false, vegetarian: false, budget: 60 },
    { allergies: { peanut: "severe", egg: "avoid" }, custom: [], halal: true, vegetarian: false, budget: 35 },
    { allergies: { peanut: "avoid" }, custom: [], halal: false, vegetarian: true, budget: 0 },
  ]);
  assert.deepEqual(t, { allergies: { peanut: "severe", egg: "avoid" }, custom: [], halal: true, vegetarian: true, budget: 35 });
});

test("halal: places that say so are fine, others move down, less for cuisines that often are", () => {
  const l = { ...none, halal: true };
  assert.deepEqual(check(place({ cuisine: "sichuan", halal: "yes" }), l).concerns, []);
  const me = check(place({ cuisine: "middle_eastern" }), l);
  assert.equal(me.ok, true);
  assert.deepEqual(me.concerns, [{ k: "halal", likely: true }]);
  const hot = check(place({ cuisine: "hotpot" }), l);
  assert.equal(hot.ok, true);
  assert.deepEqual(hot.concerns, [{ k: "halal", likely: false }]);
  const [hotpot, middle, sichuan] = [place({ cuisine: "hotpot" }), place({ cuisine: "middle_eastern" }), place({ cuisine: "sichuan", halal: "yes" })];
  assert.deepEqual(ranked([hotpot, middle, sichuan], { limits: l }), [sichuan.id, middle.id, hotpot.id]);
});

test("vegetarian: Google's 'no' moves a place well down, 'nobody says' a little, never out", () => {
  const l = { ...none, vegetarian: true };
  const no = place({ veg: false });
  assert.equal(check(no, l).ok, true);
  assert.deepEqual(check(no, l).concerns, [{ k: "veg", known: true }]);
  assert.deepEqual(check(place({ cuisine: "korean" }), l).concerns, [{ k: "veg", known: false }]);
  assert.deepEqual(check(place({ cuisine: "indian" }), l).concerns, []);
  const yes = place({ cuisine: "indian", rating: 4.0 });
  assert.deepEqual(ranked([no, yes], { limits: l }), [yes.id, no.id]);
});

test("closed, and closing within 45 minutes, are not suggested", () => {
  const open = place();
  const closed = place({ openNow: false });
  const closing = place({ closesAt: NOW + 30 * 60_000 });
  assert.deepEqual(
    eligible([open, closed, closing], cleanLimits({}), NOW).map((p) => p.id),
    [open.id],
  );
});

test("cuisine guesses use Chinese and English names", () => {
  assert.equal(guessCuisine("海底捞火锅 Haidilao Hot Pot", "chinese_restaurant"), "hotpot");
  assert.equal(guessCuisine("Golden Paramount Seafood Restaurant 金閣海鮮酒家", "chinese_restaurant"), "cantonese");
  assert.equal(guessCuisine("Chef Tony 點心", "restaurant"), "cantonese");
  assert.equal(guessCuisine("渝味小面", "chinese_restaurant"), "sichuan");
  assert.equal(guessCuisine("Pho Hoa", "restaurant"), "vietnamese");
  assert.equal(guessCuisine("Kintaro Ramen", "japanese_restaurant"), "japanese");
  assert.equal(guessCuisine("Kintaro Ramen", "ramen_restaurant"), "ramen");
  assert.equal(guessCuisine("Some Bistro", "restaurant", ["french_restaurant", "restaurant"]), "french");
  assert.equal(guessCuisine("Mystery Spot", "restaurant"), "other");
  // The finer menu (2026-11-11).
  assert.equal(guessCuisine("JOEY Burnaby", "restaurant", ["bar", "restaurant"]), "western");
  assert.equal(guessCuisine("HK BBQ Master", "chinese_restaurant"), "cantonese");
  assert.equal(guessCuisine("新疆烤串 Xinjiang Skewers", "chinese_restaurant"), "chinese_bbq");
  assert.equal(guessCuisine("老上海小笼馆", "chinese_restaurant"), "shanghai");
  assert.equal(guessCuisine("东北饺子王", "chinese_restaurant"), "northern");
  assert.equal(guessCuisine("老王面馆", "chinese_restaurant"), "noodles");
  assert.equal(guessCuisine("Gyu-Kaku", "yakiniku_restaurant"), "izakaya");
  assert.equal(guessCuisine("Gogi House", "korean_barbecue_restaurant"), "kbbq");
  assert.equal(guessCuisine("Manila Lechon House", "filipino_restaurant"), "filipino");
  assert.equal(guessCuisine("Jollibee", "fast_food_restaurant"), "filipino", "a weak type: the name says more");
  assert.equal(guessCuisine("Santorini Taverna", "greek_restaurant"), "mediterranean");
  assert.equal(guessCuisine("The Keg Steakhouse + Bar", "steak_house"), "steak");
  assert.equal(guessCuisine("Café Lingo", "cafe"), "cafe");
  assert.equal(guessCuisine("新星茶餐厅 New Star Cafe", "cafe"), "hk_cafe");
  assert.equal(guessCuisine("Liuyishou", "chinese_restaurant", ["chinese_restaurant", "hot_pot_restaurant", "restaurant"]), "hotpot", "its other types say more");
  assert.equal(guessCuisine("Golden Spot", "chinese_restaurant", ["chinese_restaurant", "restaurant"]), "chinese");
});

test("round 1's menu: every cuisine but 'other', each in a group, each with a way to search for it", () => {
  assert.ok(MENU.length >= 30, String(MENU.length));
  assert.ok(!MENU.includes("other"));
  for (const c of ["chinese", "sichuan", "cantonese", "mexican", "filipino", "vietnamese"] as const) assert.ok(MENU.includes(c), c);
  for (const c of MENU) {
    const s = CUISINES[c].search!;
    assert.ok(s && (s.types?.length || s.text), c);
    assert.ok(CUISINES[c].group, c);
  }
  // How many of each are on the list.
  assert.deepEqual(counts([place({ cuisine: "ramen" }), place({ cuisine: "thai" }), place({ cuisine: "thai" })]), { ramen: 1, thai: 2 });
});

test("the list: every place, at most two of a cuisine in the top, a banned cuisine further down but still there", () => {
  const ps = [
    ...Array.from({ length: 5 }, () => place({ cuisine: "hotpot", rating: 4.8, ratings: 2000 })),
    ...Array.from({ length: 3 }, () => place({ cuisine: "thai" })),
    ...Array.from({ length: 3 }, () => place({ cuisine: "korean" })),
    place({ cuisine: "italian", rating: 4.9, ratings: 3000 }),
  ];
  const ids = ranked(ps, { bans: { italian: 1 } });
  const cuisine = (id: string) => ps.find((p) => p.id === id)!.cuisine;
  assert.equal(ids.length, ps.length);
  const head = ids.slice(0, TOP_COUNT).map(cuisine);
  assert.equal(head.filter((c) => c === "hotpot").length, 2);
  assert.ok(!head.includes("italian"), "the best-rated, but someone said no");
  assert.ok(ids.map(cuisine).includes("italian"));
  // Further down, the order is the score: the other hot pots come straight after the top; the
  // cuisine someone said no to comes last.
  assert.deepEqual(ids.slice(TOP_COUNT, TOP_COUNT + 3).map(cuisine), ["hotpot", "hotpot", "hotpot"]);
  assert.equal(cuisine(ids[ids.length - 1]), "italian");
});

test("the list: when everyone said no to everything, all of it is still there, the least-refused first", () => {
  const ps = [place({ cuisine: "thai" }), place({ cuisine: "ramen" }), place({ cuisine: "korean" })];
  const ids = ranked(ps, { bans: { thai: 2, ramen: 1, korean: 3 } });
  assert.deepEqual(ids, [ps[1].id, ps[0].id, ps[2].id]);
});

test("the list: someone who doesn't eat chili moves Sichuan down, with a note on what else there is", () => {
  const sichuan = place({ cuisine: "sichuan", rating: 4.7, ratings: 2000 });
  const cantonese = place({ cuisine: "cantonese", rating: 4.3, ratings: 300 });
  const l = { ...none, allergies: { chili: "avoid" as const } };
  assert.deepEqual(ranked([sichuan, cantonese]), [sichuan.id, cantonese.id]);
  assert.deepEqual(ranked([sichuan, cantonese], { limits: l }), [cantonese.id, sichuan.id]);
  assert.deepEqual(check(sichuan, l).concerns, [{ k: "allergy", allergen: "chili", level: "avoid" }]);
  assert.match(avoidTip("chili", "sichuan").zh, /不辣/);
});

test("the list: the same search gives the same list (nothing random)", () => {
  const here = { lat: center.lat, lng: center.lng };
  const twins = [place({ ...here, cuisine: "korean" }), place({ ...here, cuisine: "italian" })];
  const once = ranked(twins);
  for (let i = 0; i < 20; i++) assert.deepEqual(ranked(twins), once);
  // Equal scores: the place more people rated comes first.
  const more = place({ ...here, cuisine: "thai", rating: 4.3, ratings: 300 });
  const fewer = place({ ...here, cuisine: "thai", rating: 4.3, ratings: 299 });
  assert.equal(ranked([fewer, more]).indexOf(more.id) < ranked([fewer, more]).indexOf(fewer.id), true);
});

test("unknown opening hours: still possible, but after places known to be open", () => {
  const known = place({ id: "known", openNow: true });
  const unknown = place({ id: "unknown", openNow: undefined });
  assert.deepEqual(ranked([unknown, known]), ["known", "unknown"]);
  assert.deepEqual(ranked([unknown]), ["unknown"]);
});

test("likes pull a cuisine up", () => {
  const a = place({ cuisine: "thai" });
  const b = place({ cuisine: "ramen" });
  assert.equal(ranked([a, b], { likes: { ramen: 2 } })[0], b.id);
  assert.equal(ranked([a, b], { likes: { thai: 2 } })[0], a.id);
});

test("every place of a liked cuisine comes before the rest, however well rated the rest (Steve, 2026-11-11)", () => {
  // His table liked hot pot; JOEY (4.7, a list badge) came third and the hot pots seventh and eighth.
  const joey = place({ cuisine: "western", rating: 4.7, ratings: 9610, badges: [{ source: "vanmag", label: { zh: "最佳连锁", en: "Best chain" } }] });
  const others = Array.from({ length: 5 }, () => place({ cuisine: "brunch", rating: 4.6, ratings: 3000 }));
  const hotpots = [place({ cuisine: "hotpot", rating: 4.1, ratings: 1845 }), place({ cuisine: "hotpot", rating: 4.3, ratings: 3461 }), place({ cuisine: "hotpot", rating: 3.9, ratings: 500 })];
  const ids = ranked([joey, ...others, ...hotpots], { likes: { hotpot: 1 } });
  assert.deepEqual(ids.slice(0, 3).sort(), hotpots.map((p) => p.id).sort(), "all three hot pots first, no two-per-cuisine cap");
  assert.equal(ids[3], joey.id);
  // Two liked cuisines: the one more people liked first.
  const ramen = place({ cuisine: "ramen", rating: 4.0 });
  const two = ranked([joey, ...hotpots, ramen], { likes: { hotpot: 1, ramen: 2 } });
  assert.equal(two[0], ramen.id);
  // Liked and refused by as many: neither first nor last.
  const even = ranked([joey, hotpots[0], ramen], { likes: { hotpot: 1 }, bans: { hotpot: 1, ramen: 1 } });
  assert.deepEqual(even, [joey.id, hotpots[0].id, ramen.id]);
  // A liked cuisine someone is severely allergic to the food of still goes to the bottom.
  const chili = ranked([joey, ...hotpots], { likes: { hotpot: 2 }, limits: { ...none, allergies: { chili: "severe" } } });
  assert.equal(chili[0], joey.id);
});

test("a place hardly anyone has rated gives way to rated ones, unless it is a pick or on a list", () => {
  const unknown = place({ cuisine: "chinese", rating: 5, ratings: 3 });
  const rated = place({ cuisine: "cantonese", rating: 4.2, ratings: 300 });
  assert.deepEqual(ranked([unknown, rated]), [rated.id, unknown.id]);
  const picked = { ...unknown, recommend: { note: { zh: "好吃", en: "Good" }, links: [] } };
  assert.equal(ranked([picked, rated])[0], picked.id);
});

test("wait: dinner peak at a very popular place is red; quiet afternoon is green; our reports win", () => {
  const busy = place({ ratings: 3000, waitQuote: { text: "排了40分钟", author: "x" } });
  assert.equal(estimateWait(busy, { dow: 5, minutes: 19 * 60 }).level, 2);
  assert.equal(estimateWait(place({ ratings: 100 }), { dow: 2, minutes: 15 * 60 }).level, 0);
  const ours = place({ ratings: 100, ours: { up: 3, mid: 0, down: 0, waits: [30, 45, 30] } });
  const e = estimateWait(ours, { dow: 5, minutes: 19 * 60 });
  assert.equal(e.level, 2);
  assert.equal(e.ours, 30);
  assert.equal(estimateWait(ours, { dow: 2, minutes: 15 * 60 }).level, 1);
});

test("wait: a green estimate doesn't list what would make a queue, only what helps", () => {
  const quietButFamous = place({ ratings: 3000, reservable: true });
  const e = estimateWait(quietButFamous, { dow: 2, minutes: 15 * 60 });
  assert.equal(e.level, 0);
  assert.deepEqual(e.reasons, ["reservable"]);
  const dinner = estimateWait(place({ ratings: 3000 }), { dow: 5, minutes: 19 * 60 });
  assert.ok(dinner.level > 0 && dinner.reasons.includes("peak") && dinner.reasons.includes("veryPopular"));
});

test("travel minutes: city streets nearby, faster roads for longer drives", () => {
  assert.equal(travelMinutes(800, false), 13);
  assert.equal(travelMinutes(2000, true), 7);
  // The edge of each drive circle stays within its label.
  for (const id of ["drive5", "drive10", "drive15", "drive25", "drive40"] as const) {
    assert.ok(travelMinutes(RANGES[id].meters, true) <= RANGES[id].minutes! + 1, id);
  }
  // Richmond Centre to Coquitlam Centre, about 25 km in a straight line: around 40 minutes.
  const m = travelMinutes(25000, true);
  assert.ok(m >= 35 && m <= 45, String(m));
});

test("weekend dim sum time is peak for Cantonese", () => {
  const p = place({ cuisine: "cantonese", ratings: 600 });
  assert.equal(estimateWait(p, { dow: 0, minutes: 11 * 60 }).level, 1);
  assert.equal(estimateWait(p, { dow: 2, minutes: 11 * 60 }).level, 0);
});

test("votes: a veto knocks a card out; most approvals wins; ties go to the spinner", () => {
  const t = tally(["a", "b", "c"], [
    { approve: ["a", "b"], veto: null },
    { approve: ["a"], veto: null },
    { approve: ["b"], veto: "a" },
  ], () => 0);
  assert.equal(t.winner, "b");
  assert.deepEqual(t.tied, ["b"]);
  const tie = tally(["a", "b", "c"], [{ approve: ["a"], veto: null }, { approve: ["b"], veto: null }], () => 0.99);
  assert.deepEqual(tie.tied, ["a", "b"]);
  assert.equal(tie.winner, "b");
});

test("votes: if everything is vetoed, the least-vetoed stay in; nobody voting still gives a winner", () => {
  const t = tally(["a", "b"], [{ approve: [], veto: "a" }, { approve: [], veto: "a" }, { approve: ["b"], veto: "b" }], () => 0);
  assert.equal(t.winner, "b");
  const none = tally(["a", "b"], [], () => 0.5);
  assert.deepEqual(none.tied, ["a", "b"]);
});

test("votes: with nobody ticking anything, the spinner turns between the top of the list only", () => {
  const list = Array.from({ length: 40 }, (_, i) => `p${i}`);
  const t = tally(list, [{ approve: [], veto: "p0" }], () => 0.99);
  assert.deepEqual(t.tied, list.slice(1, 1 + NO_VOTES_POOL));
  // One tick anywhere on the list beats the top.
  assert.equal(tally(list, [{ approve: ["p33"], veto: null }], () => 0).winner, "p33");
});

test("ballots from phones are cleaned: unknown cards dropped, a vetoed card isn't also approved", () => {
  assert.deepEqual(cleanBallot({ approve: ["a", "zz", "b", "a"], veto: "b" }, ["a", "b"]), { approve: ["a"], veto: "b" });
  assert.deepEqual(cleanBallot({ approve: "a", veto: 3 }, ["a"]), { approve: [], veto: null });
});

test("limits from phones are cleaned", () => {
  assert.deepEqual(cleanLimits({ allergies: { peanut: "severe", rocks: "severe", egg: "maybe" }, halal: "yes", budget: 999 }), {
    allergies: { peanut: "severe" },
    custom: [],
    halal: false,
    vegetarian: false,
    budget: 0,
  });
});

test("severe chili puts the spicy cuisines last; 'don't eat chili' moves them down; neither takes them off", () => {
  const severe = { ...cleanLimits({}), allergies: { chili: "severe" as const } };
  for (const c of ["sichuan", "hotpot"] as const) {
    const v = check(place({ cuisine: c }), severe);
    assert.equal(v.ok, true);
    assert.deepEqual(v.concerns, [{ k: "allergy", allergen: "chili", level: "severe" }]);
  }
  assert.deepEqual(check(place({ cuisine: "cantonese" }), severe).concerns, []);
  const avoid = { ...cleanLimits({}), allergies: { chili: "avoid" as const } };
  assert.deepEqual(check(place({ cuisine: "sichuan" }), avoid), {
    ok: true,
    warnings: [{ k: "allergy", allergen: "chili", level: "avoid" }],
    concerns: [{ k: "allergy", allergen: "chili", level: "avoid" }],
  });
  const best = place({ cuisine: "sichuan", rating: 5, ratings: 5000 });
  const plain = place({ cuisine: "cantonese", rating: 3.6, ratings: 40 });
  assert.deepEqual(ranked([best, plain], { limits: severe }), [plain.id, best.id]);
});

test("the reviewed table (2026-11-05): every allergen is common in the cuisines built on it", () => {
  const severe = (a: AllergenId) => ({ ...cleanLimits({}), allergies: { [a]: "severe" as const } });
  const down = (a: AllergenId, c: CuisineId) => check(place({ cuisine: c }), severe(a)).concerns.length > 0;
  // Added on review, one per reason on the page.
  for (const c of ["hotpot", "hk_cafe", "taiwanese"] as const) assert.ok(down("peanut", c), `peanut ${c}`);
  for (const c of ["vegetarian", "brunch"] as const) assert.ok(down("treenut", c), `tree nuts ${c}`);
  for (const c of ["korean", "hotpot"] as const) assert.ok(down("shellfish", c), `shellfish ${c}`);
  for (const c of ["ramen", "hotpot"] as const) assert.ok(down("fish", c), `fish ${c}`);
  for (const c of ["ramen", "western"] as const) assert.ok(down("sesame", c), `sesame ${c}`);
  for (const c of ["vegetarian", "sea"] as const) assert.ok(down("soy", c), `soy ${c}`);
  assert.ok(down("egg", "brunch"));
  for (const c of ["brunch", "italian", "indian"] as const) assert.ok(down("dairy", c), `dairy ${c}`);
  for (const c of ["ramen", "italian"] as const) assert.ok(down("gluten", c), `gluten ${c}`);
  // Still open on the page: oyster sauce, and other Chinese for peanut.
  for (const c of ["chinese", "hk_cafe", "taiwanese"] as const) assert.ok(!down("shellfish", c), `shellfish ${c} is still a question`);
  assert.ok(!down("peanut", "chinese"));
  // Every allergen on the card has a list, and nothing on it is ever ruled out.
  for (const a of Object.keys(ALLERGENS) as AllergenId[]) {
    assert.ok(COMMON_IN[a]?.length, `${a} has cuisines`);
    for (const level of ["avoid", "severe"] as const) {
      for (const c of COMMON_IN[a]!) assert.ok(check(place({ cuisine: c }), { ...cleanLimits({}), allergies: { [a]: level } }).ok, `${a} ${level} ${c}`);
    }
  }
});

test("notes: every allergen has a plain line, and each cuisine-specific one is about a cuisine it moves down", () => {
  for (const a of Object.keys(ALLERGENS) as AllergenId[]) {
    assert.ok(AVOID_GENERIC[a].zh && AVOID_GENERIC[a].en, `${a} generic`);
    for (const [c, tip] of Object.entries(AVOID_TIPS[a] ?? {})) {
      assert.ok(COMMON_IN[a]!.includes(c as CuisineId), `${a} tip for ${c}, which ${a} doesn't move down`);
      assert.ok(tip!.zh && tip!.en, `${a} ${c} in both languages`);
    }
    for (const c of COMMON_IN[a]!) assert.ok(avoidTip(a, c).zh.length > 4);
  }
  // Chili, the example from the owner: every spicy cuisine has its own line.
  for (const c of COMMON_IN.chili!) assert.notEqual(avoidTip("chili", c), AVOID_GENERIC.chili, c);
});

test("what a place mainly serves comes from its name and Google type, at most three, the specific over the general", () => {
  assert.deepEqual(dishesFor("台北牛肉面 Taipei Beef Noodle", ["taiwanese_restaurant", "restaurant"]), ["beef_noodle"]);
  assert.deepEqual(dishesFor("兰州拉面 Lanzhou Hand-Pulled Noodle", ["chinese_noodle_restaurant"]), ["lanzhou"]);
  assert.deepEqual(dishesFor("Kintaro Ramen", ["ramen_restaurant"], "ramen"), ["ramen"]);
  assert.deepEqual(dishesFor("Seoul Table BBQ", ["korean_restaurant"], "korean"), ["kbbq"]);
  assert.deepEqual(dishesFor("HK BBQ Master", ["chinese_restaurant"], "cantonese"), ["siu_mei"]);
  assert.deepEqual(dishesFor("Harbour Oyster Bar", ["seafood_restaurant"]), ["oysters"]);
  assert.deepEqual(dishesFor("小龙虾 Crawfish House", []), ["crawfish"]);
  assert.deepEqual(dishesFor("Golden Dragon", ["chinese_restaurant"]), [], "a name that says nothing more: nothing guessed");
  assert.ok(dishesFor("点心 粥 云吞面 Dim Sum Congee Wonton Noodle", ["dim_sum_restaurant"]).length <= MAX_DISHES);
  for (const d of dishesFor("麻辣烫 酸菜鱼 烤鱼 Pho Banh Mi Pizza", [])) assert.ok(DISHES[d], d);
  // Chinese hand-pulled noodles aren't a ramen shop.
  assert.equal(guessCuisine("兰州拉面", "chinese_restaurant"), "northern");
  assert.equal(guessCuisine("台北牛肉面", "chinese_restaurant"), "taiwanese");
});

test("typed items: cleaned, merged without duplicates, and only ever warn", () => {
  const a = cleanLimits({ custom: [{ name: "  香菜 ", level: "avoid" }, { name: "Pork", level: "severe" }, { name: "" }, { name: "香菜" }, 42] });
  assert.deepEqual(a.custom, [
    { name: "香菜", level: "avoid" },
    { name: "Pork", level: "severe" },
  ]);
  const b = cleanLimits({ custom: [{ name: "香菜", level: "severe" }, { name: "pork" }, { name: "x".repeat(40) }] });
  assert.equal(b.custom[2].name.length, 16);
  assert.equal(cleanLimits({ custom: Array.from({ length: 20 }, (_, i) => ({ name: `item ${i}` })) }).custom.length, 6);
  const table = mergeLimits([a, b]);
  assert.deepEqual(table.custom.slice(0, 2), [
    { name: "香菜", level: "severe" },
    { name: "Pork", level: "severe" },
  ]);
  const v = check(place({ cuisine: "sichuan" }), table);
  assert.equal(v.ok, true);
  assert.deepEqual(v.warnings[0], { k: "custom", name: "香菜", level: "severe" });
});

test("queue mentions in Chinese and English reviews", () => {
  for (const yes of ["周末排了40分钟", "要排很久", "排長隊", "等位一小时", "等了半天", "We waited 45 minutes", "long line out the door", "expect a lineup", "wait about 30 min"]) assert.ok(mentionsQueue(yes), yes);
  for (const no of ["服务很好，菜很好吃", "Great food, friendly staff", "排骨很好吃"]) assert.ok(!mentionsQueue(no), no);
});


// ---- how far ----

test("ranges: every range sits under one tab, nearer first; any distance is Google's widest circle", () => {
  const all = Object.keys(RANGES) as RangeId[];
  const listed = Object.values(RANGE_MODES).flat();
  assert.deepEqual([...listed].sort(), [...all].sort());
  for (const [mode, ids] of Object.entries(RANGE_MODES)) {
    for (const id of ids) assert.equal(RANGES[id].mode, mode);
    for (let i = 1; i < ids.length; i++) assert.ok(RANGES[ids[i]].meters > RANGES[ids[i - 1]].meters, `${ids[i]} reaches further`);
  }
  assert.equal(RANGES.any.meters, 50_000);
  // The old four keep their sizes, so tables started before this change still search the same.
  assert.deepEqual([RANGES.walk10.meters, RANGES.walk20.meters, RANGES.drive15.meters, RANGES.drive25.meters], [800, 1600, 6000, 12000]);
});

test("ranges: only real range names count (not 'toString' or anything else on an object)", () => {
  assert.ok(isRange("walk5") && isRange("any"));
  for (const bad of ["toString", "__proto__", "constructor", "walk7", "", null, 3]) assert.equal(isRange(bad), false);
});

// ---- what the meal is for ----

test("the occasion: what Google says about a place moves it a little, never off the list", () => {
  const plain = place({ cuisine: "italian", rating: 4.4, ratings: 800, price: 30 });
  const dateNight = place({ cuisine: "italian", rating: 4.4, ratings: 800, price: 30, reservable: true, traits: { wine: true, cocktails: true } });
  const fast = place({ cuisine: "western", rating: 4.4, ratings: 800, price: 12, traits: { fastFood: true } });
  const when = { at: NOW };
  assert.equal(occasionPoints(dateNight, "casual", when), 0);
  assert.ok(occasionPoints(dateNight, "date", when) > occasionPoints(plain, "date", when));
  assert.ok(occasionPoints(fast, "date", when) < 0);
  assert.deepEqual(ranked([fast, plain, dateNight], { occasion: "date" }), [dateNight.id, plain.id, fast.id]);
  assert.equal(ranked([fast, plain, dateNight], { occasion: "date" }).length, 3);
  // Groups and kids for a family; open late at night.
  const family = place({ traits: { kids: true, kidsMenu: true, groups: true }, reservable: true });
  assert.ok(occasionPoints(family, "family", when) >= 0.5);
  const late = place({ cuisine: "chinese_bbq", closesAt: NOW + 6 * 3600_000 });
  const early = place({ cuisine: "chinese_bbq", closesAt: NOW + 1 * 3600_000 });
  assert.ok(occasionPoints(late, "latenight", { at: NOW, close: late.closesAt }) > occasionPoints(early, "latenight", { at: NOW, close: early.closesAt }));
  // One person: noodles before a barbecue meant for a group.
  assert.ok(occasionPoints(place({ cuisine: "noodles", price: 15 }), "solo", when) > occasionPoints(place({ cuisine: "kbbq", price: 15 }), "solo", when));
  // A card says when a place suits the occasion.
  const r = reasonsFor(dateNight, { limits: none, center, range: "walk20", occasion: "date", now: NOW });
  assert.ok(r.includes("fits"));
  assert.ok(!reasonsFor(plain, { limits: none, center, range: "walk20", occasion: "casual", now: NOW }).includes("fits"));
  // Every occasion has both languages and an emoji.
  for (const o of OCCASION_IDS) assert.ok(OCCASIONS[o].zh && OCCASIONS[o].en && OCCASIONS[o].emoji, o);
});

// ---- planning ahead ----

test("Vancouver wall-clock times both ways, across the clock change", () => {
  for (const [day, minutes] of [[{ y: 2026, m: 3, d: 8 }, 12 * 60], [{ y: 2026, m: 7, d: 1 }, 18 * 60 + 30], [{ y: 2026, m: 11, d: 12 }, 18 * 60 + 30], [{ y: 2026, m: 12, d: 31 }, 23 * 60 + 30]] as const) {
    const ms = vancouverMs(day, minutes);
    assert.equal(vancouverClock(ms).minutes, minutes, JSON.stringify(day));
    assert.deepEqual(vancouverDay(ms), day);
  }
  // The day after, across a month's end.
  assert.deepEqual(vancouverDay(vancouverMs({ y: 2026, m: 10, d: 31 }, 20 * 60), 1), { y: 2026, m: 11, d: 1 });
});

test("a planned time from a phone: at least a quarter hour ahead and within the week Google has hours for", () => {
  assert.equal(cleanAt(NOW + 5 * 60_000, NOW), null, "that's now");
  assert.equal(cleanAt(NOW - 3600_000, NOW), null);
  assert.equal(cleanAt(NOW + 9 * 24 * 3600_000, NOW), null, "beyond Google's week");
  assert.equal(cleanAt("tomorrow", NOW), null);
  assert.equal(cleanAt(NOW + 3600_000 + 1234, NOW), NOW + 3600_000);
  // A plan whose time has come is now.
  assert.equal(mealTime(NOW + PLANNED_FROM - 1, NOW), NOW);
  assert.equal(mealTime(NOW + 2 * 3600_000, NOW), NOW + 2 * 3600_000);
  assert.equal(mealTime(null, NOW), NOW);
});

test("the quick choices are the lunches and dinners still ahead", () => {
  // NOW is Thursday 7 pm in Vancouver: tonight's dinner has started, tomorrow's lunch and dinner are ahead.
  assert.deepEqual(mealSlots(NOW).map((s) => s.id), ["lunch1", "dinner1"]);
  const morning = vancouverMs(vancouverDay(NOW), 9 * 60);
  assert.deepEqual(mealSlots(morning).map((s) => s.id), ["lunch0", "dinner0", "lunch1", "dinner1"]);
  assert.equal(vancouverClock(mealSlots(morning)[1].at).minutes, 18 * 60 + 30);
});

test("planned: open by its hours that day, now by Google's 'open now'", () => {
  const tomorrow = vancouverDay(NOW, 1);
  const lunchOnly = place({ openNow: true, closesAt: NOW + 2 * 3600_000, hours: [[vancouverMs(tomorrow, 11 * 60), vancouverMs(tomorrow, 15 * 60)]] });
  const dinner = place({ openNow: false, hours: [[vancouverMs(tomorrow, 17 * 60), vancouverMs(tomorrow, 22 * 60)]] });
  const noHours = place({ openNow: true });
  const lunch = vancouverMs(tomorrow, 12 * 60);
  const tea = vancouverMs(tomorrow, 14 * 60 + 30);
  assert.equal(isOpen(lunchOnly, NOW, lunch), true);
  assert.equal(isOpen(dinner, NOW, lunch), false);
  assert.equal(isOpen(noHours, NOW, lunch), undefined, "no hours: can't tell");
  assert.equal(isOpen(dinner, NOW), false, "now: Google's open-now");
  assert.equal(closingTime(lunchOnly, NOW, lunch), vancouverMs(tomorrow, 15 * 60));
  // Tomorrow's lunch: the lunch place and the one we can't tell about; not the dinner one. At 14:30
  // the lunch place closes too soon.
  assert.deepEqual(eligible([lunchOnly, dinner, noHours], none, NOW, lunch).map((p) => p.id), [lunchOnly.id, noHours.id]);
  assert.deepEqual(eligible([lunchOnly, dinner, noHours], none, NOW, tea).map((p) => p.id), [noHours.id]);
  // And now, as before: Google's open-now.
  assert.deepEqual(eligible([lunchOnly, dinner, noHours], none, NOW).map((p) => p.id), [lunchOnly.id, noHours.id]);
  // A place we have hours for comes before one we don't.
  assert.deepEqual(ranked([noHours, lunchOnly], { at: lunch }), [lunchOnly.id, noHours.id]);
});


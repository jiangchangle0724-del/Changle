// The rules on their own: limits, cuisines, waits, picking cards, counting votes.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ALLERGENS,
  CUISINES,
  SEVERE_RULES_OUT,
  check,
  chips,
  cleanBallot,
  cleanLimits,
  eligible,
  estimateWait,
  guessCuisine,
  mentionsQueue,
  mergeLimits,
  pick,
  RANGE_MODES,
  RANGES,
  cleanAnswers,
  isRange,
  soloPick,
  soloReasons,
  SIDE_CUISINES,
  tally,
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

test("a severe allergy never lets a ruled-out cuisine through, whatever else the table wants", () => {
  const cuisines = Object.keys(CUISINES) as CuisineId[];
  const allergens = Object.keys(ALLERGENS) as AllergenId[];
  const r = rng(7);
  for (let round = 0; round < 500; round++) {
    const places = Array.from({ length: 30 }, () => place({ cuisine: cuisines[Math.floor(r() * cuisines.length)], price: Math.floor(r() * 80) }));
    const people: Limits[] = Array.from({ length: 1 + Math.floor(r() * 6) }, () => {
      const allergies: Limits["allergies"] = {};
      for (const a of allergens) if (r() < 0.15) allergies[a] = r() < 0.5 ? "severe" : "avoid";
      return { allergies, custom: [], halal: r() < 0.1, vegetarian: r() < 0.15, budget: ([0, 20, 35, 60] as const)[Math.floor(r() * 4)] };
    });
    const table = mergeLimits(people);
    const ok = eligible(places, table, NOW);
    for (const p of ok) {
      for (const person of people) {
        for (const [a, level] of Object.entries(person.allergies)) {
          if (level === "severe") assert.ok(!SEVERE_RULES_OUT[a as AllergenId]?.includes(p.cuisine), `${p.cuisine} with severe ${a}`);
        }
        if (person.budget && p.price !== undefined) assert.ok(p.price <= person.budget);
      }
    }
    // And the cards are always a subset of what's allowed.
    const { ids } = pick({ places: ok, likes: {}, bans: {}, members: people.length, center, range: "walk20", now: NOW });
    for (const id of ids) assert.ok(ok.some((p) => p.id === id));
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

test("halal keeps halal places, and likely-halal cuisines with a 'check' warning", () => {
  const l = { allergies: {}, custom: [], halal: true, vegetarian: false, budget: 0 as const };
  assert.equal(check(place({ cuisine: "sichuan", halal: "yes" }), l).ok, true);
  const me = check(place({ cuisine: "middle_eastern" }), l);
  assert.equal(me.ok, true);
  assert.deepEqual(me.warnings, [{ k: "halalCheck" }]);
  assert.equal(check(place({ cuisine: "hotpot" }), l).why, "halal");
});

test("vegetarian: Google's 'no' rules out, unknown warns", () => {
  const l = { allergies: {}, custom: [], halal: false, vegetarian: true, budget: 0 as const };
  assert.equal(check(place({ veg: false }), l).ok, false);
  assert.deepEqual(check(place({ cuisine: "korean" }), l).warnings, [{ k: "vegCheck" }]);
  assert.deepEqual(check(place({ cuisine: "indian" }), l).warnings, []);
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
  assert.equal(guessCuisine("Some Bistro", "restaurant", ["french_restaurant", "restaurant"]), "western");
  assert.equal(guessCuisine("Mystery Spot", "restaurant"), "other");
});

test("chips list the cuisines on offer, most places first, at most 12", () => {
  const ps = [place({ cuisine: "ramen" }), place({ cuisine: "thai" }), place({ cuisine: "thai" })];
  assert.deepEqual(chips(ps), [
    { cuisine: "thai", count: 2 },
    { cuisine: "ramen", count: 1 },
  ]);
});

test("cards: at most two per cuisine, banned cuisines left out", () => {
  const ps = [
    ...Array.from({ length: 5 }, () => place({ cuisine: "hotpot", rating: 4.8, ratings: 2000 })),
    ...Array.from({ length: 3 }, () => place({ cuisine: "thai" })),
    ...Array.from({ length: 3 }, () => place({ cuisine: "korean" })),
    place({ cuisine: "italian" }),
  ];
  const { ids, relaxed } = pick({ places: ps, likes: {}, bans: { italian: 1 }, members: 3, center, range: "walk20", now: NOW });
  const by = (c: CuisineId) => ids.filter((id) => ps.find((p) => p.id === id)!.cuisine === c).length;
  assert.equal(ids.length, 6);
  assert.equal(by("hotpot"), 2);
  assert.equal(by("italian"), 0);
  assert.deepEqual(relaxed, []);
});

test("cards: when bans leave almost nothing, the least-banned come back, marked", () => {
  const ps = [place({ cuisine: "thai" }), place({ cuisine: "ramen" }), place({ cuisine: "korean" })];
  const { ids, relaxed } = pick({ places: ps, likes: {}, bans: { thai: 2, ramen: 1, korean: 3 }, members: 3, center, range: "walk20", now: NOW });
  assert.equal(ids.length, 3);
  assert.equal(relaxed.length, 3);
});

test("likes pull a cuisine up", () => {
  const a = place({ cuisine: "thai" });
  const b = place({ cuisine: "ramen" });
  const base = { places: [a, b], bans: {}, members: 2, center, range: "walk20" as const, now: NOW, count: 1 };
  assert.deepEqual(pick({ ...base, likes: { ramen: 2 } }).ids, [b.id]);
  assert.deepEqual(pick({ ...base, likes: { thai: 2 } }).ids, [a.id]);
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

test("severe chili rules out the spicy cuisines; 'don't eat chili' only warns", () => {
  const severe = { ...cleanLimits({}), allergies: { chili: "severe" as const } };
  assert.equal(check(place({ cuisine: "sichuan" }), severe).ok, false);
  assert.equal(check(place({ cuisine: "hotpot" }), severe).ok, false);
  assert.equal(check(place({ cuisine: "cantonese" }), severe).ok, true);
  const avoid = { ...cleanLimits({}), allergies: { chili: "avoid" as const } };
  assert.deepEqual(check(place({ cuisine: "sichuan" }), avoid), { ok: true, warnings: [{ k: "allergy", allergen: "chili", level: "avoid" }] });
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

// ---- one person, can't decide ----

const noLimits: Limits = { allergies: {}, custom: [], halal: false, vegetarian: false, budget: 0 };

test("solo: answers are cleaned; anything unexpected means 'any'", () => {
  assert.deepEqual(cleanAnswers({ mood: "warm", side: "jk" }), { mood: "warm", side: "jk" });
  assert.deepEqual(cleanAnswers({ mood: "toString", side: 5 }), { mood: "any", side: "any" });
  assert.deepEqual(cleanAnswers(null), { mood: "any", side: "any" });
});

test("solo: the chosen side of the menu is kept when there are at least three of it nearby", () => {
  const places = [
    ...["cantonese", "sichuan", "hotpot", "taiwanese"].map((c) => place({ cuisine: c as CuisineId })),
    ...["italian", "mexican", "japanese", "korean"].map((c) => place({ cuisine: c as CuisineId, rating: 4.9, ratings: 5000 })),
  ];
  const { ids, relaxed } = soloPick({ places, answers: { mood: "any", side: "chinese" }, limits: noLimits, center, range: "walk20", now: NOW });
  assert.equal(relaxed, false);
  assert.ok(ids.length >= 3);
  for (const id of ids) assert.ok(SIDE_CUISINES.chinese.includes(places.find((p) => p.id === id)!.cuisine), "only Chinese places");
});

test("solo: too few on the chosen side, so others come in and it says so", () => {
  const places = [place({ cuisine: "ramen" }), ...["italian", "mexican", "western", "thai"].map((c) => place({ cuisine: c as CuisineId }))];
  const { ids, relaxed } = soloPick({ places, answers: { mood: "any", side: "jk" }, limits: noLimits, center, range: "walk20", now: NOW });
  assert.equal(relaxed, true);
  assert.equal(ids.length, 5);
});

test("solo: the mood moves matching places up, and each batch of three tries three cuisines", () => {
  const places = [
    place({ cuisine: "brunch", rating: 4.2, ratings: 300 }),
    place({ cuisine: "hotpot", rating: 4.2, ratings: 300 }),
    place({ cuisine: "hotpot", rating: 4.2, ratings: 300 }),
    place({ cuisine: "ramen", rating: 4.2, ratings: 300 }),
    place({ cuisine: "italian", rating: 4.6, ratings: 900 }),
    place({ cuisine: "western", rating: 4.6, ratings: 900 }),
    place({ cuisine: "mexican", rating: 4.6, ratings: 900 }),
  ];
  const { ids } = soloPick({ places, answers: { mood: "warm", side: "any" }, limits: noLimits, center, range: "walk20", now: NOW });
  const first = ids.slice(0, 3).map((id) => places.find((p) => p.id === id)!.cuisine);
  assert.equal(new Set(first).size, 3, "three different cuisines");
  assert.ok(first.includes("hotpot") && first.includes("ramen"), "warm places first");
});

test("solo: the diet card and budget still rule places out, and closed places never show", () => {
  const places = [
    place({ cuisine: "sichuan", price: 25 }),
    place({ cuisine: "cantonese", price: 70 }),
    place({ cuisine: "hotpot", price: 30, openNow: false }),
    place({ cuisine: "taiwanese", price: 15 }),
  ];
  const limits: Limits = { ...noLimits, allergies: { chili: "severe" }, budget: 35 };
  const { ids } = soloPick({ places, answers: { mood: "any", side: "any" }, limits, center, range: "walk20", now: NOW });
  assert.deepEqual(ids, [places[3].id]);
});

test("solo: reasons say why, a pick and a list first, at most three", () => {
  const p = place({ cuisine: "hotpot", price: 20, rating: 4.7, ratings: 900, recommend: { note: { zh: "好吃", en: "Good" }, links: [] }, badges: [{ source: "michelin", label: { zh: "必比登", en: "Bib Gourmand" }, year: 2025 }] });
  const r = soloReasons(p, { mood: "warm", side: "chinese" }, { ...noLimits, budget: 35 }, center, "walk20");
  assert.deepEqual(r, ["pick", "list", "mood"]);
  const q = place({ cuisine: "italian", price: 20, rating: 4.0, ratings: 20 });
  assert.deepEqual(soloReasons(q, { mood: "any", side: "any" }, { ...noLimits, budget: 35 }, center, "walk20"), ["budget", "near"]);
});

// What the meal is for (a business dinner, a date, the kids, just me…), asked when a table starts,
// and which meal it is. Steve, 2026-11-11: a business dinner put a bagel shop first. So each occasion
// weighs everything we know about a place: what kind of place Google says it is (a café, a fine-dining
// room, a pub), its price, whether it takes bookings, drinks, groups, kids, how late it's open, the
// words of Google's descriptions ("upscale", "unfussy", "romantic"), and the lists it's on. A place
// that plainly isn't for the occasion (a bagel shop for a business dinner, a bar for the kids, a
// place that doesn't do dinner at dinner time) goes after the ones that are, with a line on its card
// saying why. Nothing is taken off the list. The searches use the same idea (search.ts).
import type { Badge, CuisineId, Place, PlaceKind, Text } from "./types";

export type OccasionId = "casual" | "friends" | "date" | "colleagues" | "family" | "birthday" | "business" | "solo" | "latenight";

export const OCCASIONS: Record<OccasionId, Text & { emoji: string }> = {
  casual: { zh: "随便吃吃", en: "Just a meal", emoji: "🍽️" },
  friends: { zh: "朋友聚会", en: "Friends", emoji: "🍻" },
  date: { zh: "约会", en: "Date", emoji: "💕" },
  colleagues: { zh: "同事聚餐", en: "Colleagues", emoji: "💼" },
  family: { zh: "家庭聚餐", en: "Family", emoji: "👨‍👩‍👧" },
  birthday: { zh: "生日聚餐", en: "Birthday", emoji: "🎂" },
  business: { zh: "商务宴请", en: "Business", emoji: "🤝" },
  solo: { zh: "一个人", en: "Just me", emoji: "🧍" },
  latenight: { zh: "宵夜", en: "Late night", emoji: "🌙" },
};

export const OCCASION_IDS = Object.keys(OCCASIONS) as OccasionId[];

export const isOccasion = (x: unknown): x is OccasionId => typeof x === "string" && Object.prototype.hasOwnProperty.call(OCCASIONS, x);

/** Badges on one card at most. */
export const MAX_BADGES = 4;

/** The badges a card shows: the lists for this occasion first (a date: the most romantic), up to four. */
export function badgesFor(badges: readonly Badge[] | undefined, o: OccasionId | undefined): Badge[] {
  if (!badges?.length) return [];
  const mine = (b: Badge) => !!o && !!b.occasions?.includes(o);
  return [...badges.filter(mine), ...badges.filter((b) => !mine(b))].slice(0, MAX_BADGES);
}

/** Breakfast, lunch, dinner or late, from the time of day in Vancouver (afternoon: none of them). */
export type Meal = "breakfast" | "lunch" | "afternoon" | "dinner" | "late";

export function mealOf(at: number): Meal {
  const m = minutesOfDay(at);
  if (m >= 5 * 60 && m < 10 * 60 + 30) return "breakfast";
  if (m >= 10 * 60 + 30 && m < 15 * 60) return "lunch";
  if (m >= 15 * 60 && m < 16 * 60 + 30) return "afternoon";
  if (m >= 16 * 60 + 30 && m < 22 * 60) return "dinner";
  return "late";
}

/** What speaks for a place on this occasion, for its card (at most three). */
export type FitWhy = "listed" | "upscale" | "romantic" | "private" | "reservable" | "drinks" | "groups" | "kids" | "kidsMenu" | "late" | "cheap";

/**
 * Why a place plainly isn't for it: the kind of place it is; the meal (it doesn't do dinner, or it
 * mostly does breakfast and coffee); or, late at night, that it closes soon after.
 */
export type Off = { k: "kind"; kind: PlaceKind } | { k: "meal"; meal: "dinner" | "lunch"; kind?: PlaceKind } | { k: "early" };

export interface Fit {
  /** Added to the place's score (a Google star is about 0.67). */
  points: number;
  /** It suits the occasion: its card says so, with `why`. */
  suits: boolean;
  why: FitWhy[];
  /** It plainly doesn't: after the ones that do, with a line on its card. */
  off?: Off;
}

/** At or above this many points (and not off), a card says the place suits the occasion. */
export const SUITS_FROM = 0.3;

/** Points off for a place that plainly isn't for the occasion, or the meal. */
export const OFF_POINTS = 1.5;

/** Kinds of food that suit each occasion (a little extra; nothing is left out). */
const CUISINES_FOR: Partial<Record<OccasionId, CuisineId[]>> = {
  business: ["cantonese", "seafood", "steak", "french", "japanese", "italian", "shanghai", "chinese", "mediterranean"],
  date: ["italian", "french", "japanese", "izakaya", "mediterranean", "steak", "seafood", "middle_eastern"],
  birthday: ["hotpot", "kbbq", "steak", "seafood", "cantonese", "izakaya", "italian", "korean", "chinese_bbq"],
  family: ["cantonese", "chinese", "shanghai", "taiwanese", "italian", "western", "japanese", "korean", "vietnamese", "noodles"],
  friends: ["hotpot", "kbbq", "izakaya", "chinese_bbq", "korean", "mexican", "steak", "sichuan"],
  colleagues: ["hotpot", "kbbq", "chinese", "cantonese", "izakaya", "korean", "chinese_bbq", "sichuan"],
  solo: ["ramen", "noodles", "northern", "vietnamese", "japanese", "hk_cafe", "taiwanese", "sea", "cafe"],
  latenight: ["chinese_bbq", "hk_cafe", "hotpot", "korean", "kbbq", "ramen", "noodles", "vietnamese", "izakaya"],
};

/** Mostly eaten in a group: lower for one person, a little less formal for business. */
const GROUP_FOOD: CuisineId[] = ["hotpot", "kbbq", "chinese_bbq"];

/** Words in Google's descriptions of a place (its editorial and AI summaries), English and Chinese. */
const WORDS = {
  upscale: /\b(upscale|elegant|refined|fine[- ]dining|sophisticated|luxur\w*|chic|stylish|tasting menus?|omakase|white[- ]tablecloth|high[- ]end|polished|swanky|posh|plush|dressy|swank)\b|高档|精致|奢华|高级/i,
  casual: /\b(casual|no[- ]frills|unfussy|down[- ]to[- ]earth|counter[- ]serve|counter[- ]service|quick|fast[- ]food|grab[- ]and[- ]go|food court|hole[- ]in[- ]the[- ]wall|cafeteria|kiosk|stall|walk[- ]up|simple|basic|no[- ]nonsense|bare[- ]bones)\b|快餐|小吃|档口|简餐/i,
  romantic: /\b(romantic|intimate|candle\w*|date[- ]night|moody|dim(ly)?[- ]lit|cozy|cosy|views?|waterfront|sunset)\b|浪漫|约会/i,
  private: /\b(private (dining )?rooms?|banquets?|banquet halls?|event space)\b|包间|包厢|宴会/i,
  family: /\b(famil(y|ies)|kids?|children|child[- ]friendly|kid[- ]friendly)\b|亲子|小孩|儿童/i,
  groups: /\b(groups?|large parties|share plates|sharing plates|family[- ]style|lively|communal|parties|round tables?)\b|聚会|聚餐/i,
  late: /\b(late[- ]night|open late|24[- /]?7|24 hours|after[- ]hours|night owls?)\b|宵夜|通宵/i,
};

const says = (p: Place, re: RegExp) => re.test(`${p.about ?? ""} ${p.summary?.text ?? ""}`);

/** Price per person: under about $15 is low, $40 and up is high; undefined when unknown. */
function priceClass(p: Place): "low" | "mid" | "high" | undefined {
  const price = p.price;
  if (price === undefined) return p.priceLabel ? (p.priceLabel.length >= 3 ? "high" : p.priceLabel.length === 1 ? "low" : "mid") : undefined;
  return price <= 15 ? "low" : price >= 40 ? "high" : "mid";
}

/** What kind of place it is: Google's, or for a café or a brunch place, what we guessed it serves. */
function kindOf(p: Place): PlaceKind | undefined {
  const k = p.traits?.kind;
  // A Hong Kong-style café (茶餐厅) is a restaurant, whatever Google calls it.
  if (p.cuisine === "hk_cafe" && (k === "cafe" || k === "breakfast")) return undefined;
  return k ?? (p.cuisine === "cafe" ? "cafe" : p.cuisine === "brunch" ? "breakfast" : undefined);
}

/**
 * How well a place suits the occasion and the meal at `at`, and why. `close`: when it closes after
 * the meal's time, if we know.
 */
export function occasionFit(p: Place, o: OccasionId | undefined, when: { at: number; close?: number }): Fit {
  const t = p.traits ?? {};
  const kind = kindOf(p);
  const price = priceClass(p);
  let points = 0;
  const why: FitWhy[] = [];
  let off: Off | undefined;
  const add = (yes: unknown, pts: number, w?: FitWhy) => {
    if (!yes) return;
    points += pts;
    if (w && pts > 0 && !why.includes(w)) why.push(w);
  };
  /** Kinds of place that plainly aren't for this occasion. */
  const notFor = (kinds: PlaceKind[]) => {
    if (kind && kinds.includes(kind)) off ??= { k: "kind", kind };
  };

  const cuisine = CUISINES_FOR[o ?? "casual"]?.includes(p.cuisine);
  // A list that recommends it for this very occasion (OpenTable's most romantic, Vancouver Magazine's
  // best private rooms…) says the most; a general one (Michelin, Canada's 100 Best…) says it's good.
  add(o && o !== "casual" && p.badges?.some((b) => b.occasions?.includes(o)), 0.6, "listed");
  const acclaimed = p.badges?.some((b) => !b.occasions?.length);
  const upscale = t.fineDining || says(p, WORDS.upscale);
  const casualWords = says(p, WORDS.casual);
  switch (o) {
    case "business":
      notFor(["cafe", "sweets", "breakfast", "counter", "fastFood"]);
      add(kind === "bar", -0.4);
      add(upscale, 0.5, "upscale");
      add(casualWords && !upscale, -0.4);
      add(says(p, WORDS.private), 0.3, "private");
      add(p.reservable === true, 0.35, "reservable");
      add(p.reservable === false, -0.3);
      add(t.wine || t.cocktails, 0.2, "drinks");
      add(price === "high", 0.45, "upscale");
      add(price === "mid", 0.1);
      add(price === "low", -0.5);
      add(cuisine, 0.2);
      add(GROUP_FOOD.includes(p.cuisine), -0.15);
      add(acclaimed, 0.35);
      add(t.groups, 0.1);
      break;
    case "date":
      notFor(["sweets", "counter", "fastFood"]);
      add(kind === "cafe", -0.5);
      add(upscale, 0.35, "upscale");
      add(says(p, WORDS.romantic), 0.4, "romantic");
      add(casualWords && !upscale, -0.3);
      add(p.reservable === true, 0.25, "reservable");
      add(t.wine || t.cocktails, 0.3, "drinks");
      add(price === "high", 0.2);
      add(price === "mid", 0.1);
      add(price === "low", -0.3);
      add(cuisine, 0.2);
      add(t.music, 0.1);
      add(acclaimed, 0.3);
      add(t.buffet, -0.3);
      break;
    case "birthday":
      notFor(["cafe", "sweets", "breakfast", "counter", "fastFood"]);
      add(t.groups, 0.35, "groups");
      add(says(p, WORDS.groups), 0.2, "groups");
      add(says(p, WORDS.private), 0.2, "private");
      add(p.reservable === true, 0.35, "reservable");
      add(t.dessert, 0.1);
      add(t.wine || t.cocktails, 0.1, "drinks");
      add(cuisine, 0.2);
      add(upscale, 0.15, "upscale");
      add(acclaimed, 0.2);
      add(price === "low", -0.2);
      break;
    case "family":
      notFor(["bar"]);
      add(kind === "sweets" || kind === "cafe", -0.4);
      add(kind === "counter", -0.3);
      add(t.kids === true, 0.4, "kids");
      add(t.kids === false, -0.4);
      add(t.kidsMenu, 0.3, "kidsMenu");
      add(t.family, 0.3, "kids");
      add(says(p, WORDS.family), 0.25, "kids");
      add(t.groups, 0.25, "groups");
      add(p.reservable === true, 0.15, "reservable");
      add(t.buffet, 0.15);
      add(cuisine, 0.15);
      add(t.fineDining, -0.3);
      break;
    case "friends":
      add(kind === "cafe" || kind === "sweets", -0.4);
      add(kind === "counter", -0.3);
      add(t.groups, 0.4, "groups");
      add(says(p, WORDS.groups), 0.2, "groups");
      add(t.beer || t.cocktails || t.wine, 0.2, "drinks");
      add(cuisine, 0.25);
      add(kind === "bar", 0.1);
      add(t.music, 0.1);
      add(t.fineDining, -0.25);
      break;
    case "colleagues":
      notFor(["sweets", "counter", "fastFood"]);
      add(kind === "cafe", -0.5);
      add(t.groups, 0.45, "groups");
      add(says(p, WORDS.groups), 0.2, "groups");
      add(says(p, WORDS.private), 0.15, "private");
      add(p.reservable === true, 0.3, "reservable");
      add(price === "mid", 0.15);
      add((p.price ?? 0) >= 80, -0.25);
      add(cuisine, 0.2);
      add(t.fineDining, -0.2);
      add(kind === "bar", -0.2);
      break;
    case "solo":
      add(price === "low" || (p.price !== undefined && p.price <= 25), 0.3, "cheap");
      add(cuisine, 0.25);
      add(GROUP_FOOD.includes(p.cuisine), -0.35);
      add(t.fineDining, -0.3);
      add(t.buffet, -0.3);
      break;
    case "latenight": {
      // Open till 11 pm or later that night, three hours or more past the meal, or around the clock.
      const late = when.close === undefined ? undefined : when.close - when.at >= 3 * 3600_000 || minutesOfDay(when.close) >= 23 * 60 || minutesOfDay(when.close) < 5 * 60;
      if (late === true) add(true, 0.8, "late");
      if (late === false) off ??= { k: "early" };
      add(says(p, WORDS.late), 0.2, "late");
      add(cuisine, 0.2);
      add(t.fineDining, -0.4);
      break;
    }
  }
  // The meal, whatever the occasion: at dinner, a place that doesn't do dinner, or mostly does
  // breakfast and coffee; at lunch, one that doesn't do lunch.
  const meal = mealOf(when.at);
  if (!off && meal === "dinner") {
    if (t.dinner === false) off = { k: "meal", meal: "dinner" };
    else if ((kind === "breakfast" || kind === "cafe" || kind === "sweets") && t.dinner !== true) off = { k: "meal", meal: "dinner", kind };
  } else if (!off && meal === "lunch" && t.lunch === false) off = { k: "meal", meal: "lunch" };
  if (off) points -= OFF_POINTS;
  return { points, suits: !!o && o !== "casual" && !off && points >= SUITS_FROM, why: why.slice(0, 3), off };
}

/** Minutes after midnight in Vancouver. */
function minutesOfDay(ms: number): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

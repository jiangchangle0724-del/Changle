// What the meal is for (a date, colleagues, a birthday, just me…), asked when a table starts. It
// moves places up or down a little, from what Google says about them (good for groups, for kids,
// serves wine, open late…), their kind of food and price. It never takes a place off the list.
import type { CuisineId, Place, Text } from "./types";

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

/** Kinds of food that suit each occasion (a little extra; nothing is left out). */
const SUITS: Partial<Record<OccasionId, CuisineId[]>> = {
  friends: ["hotpot", "kbbq", "izakaya", "chinese_bbq", "korean", "steak", "mexican"],
  date: ["italian", "french", "japanese", "izakaya", "mediterranean", "steak", "seafood"],
  family: ["cantonese", "chinese", "shanghai", "hotpot", "italian", "western"],
  birthday: ["hotpot", "kbbq", "steak", "seafood", "italian", "cantonese", "izakaya"],
  business: ["cantonese", "japanese", "steak", "seafood", "french", "italian"],
  solo: ["ramen", "noodles", "northern", "vietnamese", "japanese", "hk_cafe", "taiwanese", "cafe"],
  latenight: ["chinese_bbq", "hk_cafe", "hotpot", "korean", "kbbq", "ramen", "noodles", "vietnamese", "izakaya"],
};

/** Mostly eaten in a group: a little lower for one person. */
const GROUP_FOOD: CuisineId[] = ["hotpot", "kbbq"];

/** At or above this many points, a card says the place suits the occasion. */
export const SUITS_FROM = 0.2;

/**
 * Points for a place on this occasion (a Google star is about 0.67). `close`: when it closes after
 * the meal's time, if we know; `at`: the meal's time.
 */
export function occasionPoints(p: Place, o: OccasionId | undefined, when: { at: number; close?: number }): number {
  if (!o || o === "casual") return 0;
  const t = p.traits ?? {};
  const price = p.price ?? 0;
  let s = SUITS[o]?.includes(p.cuisine) ? 0.15 : 0;
  switch (o) {
    case "friends":
      if (t.groups) s += 0.2;
      if (t.beer || t.cocktails) s += 0.1;
      if (t.fineDining) s -= 0.1;
      break;
    case "date":
      if (p.reservable) s += 0.15;
      if (t.wine || t.cocktails) s += 0.15;
      if (price >= 25) s += 0.1;
      if (t.fastFood) s -= 0.4;
      break;
    case "colleagues":
      if (t.groups) s += 0.25;
      if (p.reservable) s += 0.15;
      if (t.fastFood) s -= 0.2;
      if (price >= 60) s -= 0.1;
      break;
    case "family":
      if (t.kids) s += 0.2;
      if (t.kidsMenu) s += 0.1;
      if (t.groups) s += 0.15;
      if (p.reservable) s += 0.1;
      if (t.bar) s -= 0.2;
      break;
    case "birthday":
      if (t.groups) s += 0.2;
      if (p.reservable) s += 0.2;
      if (t.dessert) s += 0.1;
      if (t.wine || t.cocktails) s += 0.05;
      break;
    case "business":
      if (p.reservable) s += 0.25;
      if (price >= 45) s += 0.15;
      if (t.wine) s += 0.1;
      if (t.fastFood) s -= 0.4;
      if (t.bar) s -= 0.2;
      break;
    case "solo":
      if (price > 0 && price <= 20) s += 0.1;
      if (GROUP_FOOD.includes(p.cuisine)) s -= 0.15;
      if (t.fineDining) s -= 0.1;
      break;
    case "latenight": {
      // Open till 11 pm or later that night, or around the clock.
      const late = when.close === undefined ? undefined : when.close - when.at >= 3 * 3600_000 || minutesOfDay(when.close) >= 23 * 60 || minutesOfDay(when.close) < 5 * 60;
      if (late === true) s += 0.3;
      if (late === false) s -= 0.2;
      break;
    }
  }
  return s;
}

/** Minutes after midnight in Vancouver. */
function minutesOfDay(ms: number): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

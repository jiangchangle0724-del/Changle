// Time and distance in Vancouver terms.
import type { Center, RangeId, RangeMode, Text } from "./types";

export const RANGES: Record<RangeId, Text & { meters: number; drive: boolean; mode: RangeMode; minutes?: number }> = {
  walk5: { zh: "走路 5 分钟", en: "5 min walk", meters: 400, drive: false, mode: "walk", minutes: 5 },
  walk10: { zh: "走路 10 分钟", en: "10 min walk", meters: 800, drive: false, mode: "walk", minutes: 10 },
  walk15: { zh: "走路 15 分钟", en: "15 min walk", meters: 1200, drive: false, mode: "walk", minutes: 15 },
  walk20: { zh: "走路 20 分钟", en: "20 min walk", meters: 1600, drive: false, mode: "walk", minutes: 20 },
  walk30: { zh: "走路 30 分钟", en: "30 min walk", meters: 2400, drive: false, mode: "walk", minutes: 30 },
  drive5: { zh: "开车 5 分钟", en: "5 min drive", meters: 1500, drive: true, mode: "drive", minutes: 5 },
  drive10: { zh: "开车 10 分钟", en: "10 min drive", meters: 3500, drive: true, mode: "drive", minutes: 10 },
  drive15: { zh: "开车 15 分钟", en: "15 min drive", meters: 6000, drive: true, mode: "drive", minutes: 15 },
  drive25: { zh: "开车 25 分钟", en: "25 min drive", meters: 12000, drive: true, mode: "drive", minutes: 25 },
  drive40: { zh: "开车 40 分钟", en: "40 min drive", meters: 20000, drive: true, mode: "drive", minutes: 40 },
  // Google's widest search circle (50 km): from anywhere in the city it covers Greater Vancouver.
  any: { zh: "不限距离", en: "Any distance", meters: 50000, drive: true, mode: "any" },
};

/** The ranges under each tab of the "how far" picker, nearest first. */
export const RANGE_MODES: Record<RangeMode, RangeId[]> = {
  walk: ["walk5", "walk10", "walk15", "walk20", "walk30"],
  drive: ["drive5", "drive10", "drive15", "drive25", "drive40"],
  any: ["any"],
};

export const isRange = (x: unknown): x is RangeId => typeof x === "string" && Object.prototype.hasOwnProperty.call(RANGES, x);

/** Starting points for a host who doesn't share GPS. */
export const NEIGHBOURHOODS: (Text & Center)[] = [
  { zh: "市中心 Downtown", en: "Downtown", lat: 49.2827, lng: -123.1207 },
  { zh: "唐人街 / 煤气镇", en: "Chinatown / Gastown", lat: 49.2799, lng: -123.1003 },
  { zh: "Kitsilano", en: "Kitsilano", lat: 49.2684, lng: -123.1683 },
  { zh: "Main St", en: "Main St", lat: 49.2496, lng: -123.1009 },
  { zh: "Commercial Dr", en: "Commercial Dr", lat: 49.2697, lng: -123.0697 },
  { zh: "Kerrisdale / Oakridge", en: "Kerrisdale / Oakridge", lat: 49.2297, lng: -123.1267 },
  { zh: "UBC", en: "UBC", lat: 49.2606, lng: -123.246 },
  { zh: "列治文 Richmond Centre / 时代坊", en: "Richmond Centre / Aberdeen", lat: 49.1724, lng: -123.1366 },
  { zh: "本拿比 Metrotown", en: "Burnaby Metrotown", lat: 49.2276, lng: -123.0076 },
  { zh: "本拿比 Brentwood", en: "Burnaby Brentwood", lat: 49.2665, lng: -123.0016 },
  { zh: "高贵林 Coquitlam Centre", en: "Coquitlam Centre", lat: 49.2781, lng: -122.7969 },
  { zh: "北温 Lonsdale", en: "North Van Lonsdale", lat: 49.3165, lng: -123.0723 },
  { zh: "素里 Surrey Central", en: "Surrey Central", lat: 49.1897, lng: -122.849 },
];

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rough minutes to get there: streets aren't straight (×1.3); walking ~4.8 km/h; driving ~30 km/h
 * for the first 5 km of city streets and ~60 km/h beyond (arterials, bridges, highways), plus 2
 * minutes to park. So a "40 min drive" place shows about 33 minutes at the edge of its circle, and
 * Richmond Centre to Coquitlam Centre about 40, not the hour and more a flat city speed gave.
 */
export function travelMinutes(meters: number, drive: boolean): number {
  const m = meters * 1.3;
  if (!drive) return Math.max(1, Math.round(m / 80));
  const city = Math.min(m, 5000);
  return Math.max(1, Math.round(city / 500 + (m - city) / 1000 + 2));
}

/** Day of week (0 = Sunday) and minutes since midnight, in Vancouver. */
export function vancouverClock(ms: number): { dow: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { dow, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Kitchens usually stop taking orders about this long before closing. */
export const LAST_ORDER_BEFORE_CLOSE = 30;
/** Don't suggest a place that closes sooner than this. */
export const MIN_MINUTES_BEFORE_CLOSE = 45;

// ---- planning ahead ----

/** A meal further ahead than this is planned: places are checked against their hours at that time. */
export const PLANNED_FROM = 15 * 60_000;
/** Lunch and dinner, in minutes after midnight, for the quick choices. */
export const LUNCH = 12 * 60;
export const DINNER = 18 * 60 + 30;

const parts = (ms: number) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), minutes: get("hour") * 60 + get("minute") };
};

/** A day in Vancouver: year, month (1–12), day of the month. */
export interface Day {
  y: number;
  m: number;
  d: number;
}

/** The Vancouver date `days` after the one `ms` falls on. */
export function vancouverDay(ms: number, days = 0): Day {
  const { y, m, d } = parts(ms);
  const x = new Date(Date.UTC(y, m - 1, d + days));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}

/** A wall-clock time in Vancouver (minutes after midnight on `day`) as ms since epoch. */
export function vancouverMs(day: Day, minutes: number): number {
  const wall = Date.UTC(day.y, day.m - 1, day.d, 0, minutes);
  // Vancouver is 7 or 8 hours behind UTC: try one, check what the clock says there, correct once.
  let t = wall + 8 * 3600_000;
  for (let i = 0; i < 2; i++) {
    const seen = parts(t);
    t += wall - Date.UTC(seen.y, seen.m - 1, seen.d, 0, seen.minutes);
  }
  return t;
}

/** Google gives opening hours for today and the next six days: a meal can be planned up to the end of that. */
export const planUntil = (now: number) => vancouverMs(vancouverDay(now, 7), 0);

/** A planned time from a phone: at least PLANNED_FROM ahead and within the week Google has hours for, or null for now. */
export function cleanAt(x: unknown, now: number): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  if (x - now < PLANNED_FROM || x > planUntil(now)) return null;
  return Math.round(x / 60_000) * 60_000;
}

/** When the meal is: the planned time while it's still ahead, otherwise now. */
export const mealTime = (at: number | null | undefined, now: number) => (at && at - now >= PLANNED_FROM ? at : now);

/** The quick choices still ahead: today's and tomorrow's lunch and dinner. */
export function mealSlots(now: number): { id: "lunch0" | "dinner0" | "lunch1" | "dinner1"; at: number }[] {
  const today = vancouverDay(now);
  const tomorrow = vancouverDay(now, 1);
  const slots = [
    { id: "lunch0" as const, at: vancouverMs(today, LUNCH) },
    { id: "dinner0" as const, at: vancouverMs(today, DINNER) },
    { id: "lunch1" as const, at: vancouverMs(tomorrow, LUNCH) },
    { id: "dinner1" as const, at: vancouverMs(tomorrow, DINNER) },
  ];
  return slots.filter((s) => s.at - now >= 2 * PLANNED_FROM);
}


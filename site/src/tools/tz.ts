/** Time zone math on top of Intl: no library, daylight saving handled by the browser's own tables. */

export type City = { id: string; tz: string; zh: string; en: string };

export const CITIES: City[] = [
  { id: "vancouver", tz: "America/Vancouver", zh: "温哥华", en: "Vancouver" },
  { id: "toronto", tz: "America/Toronto", zh: "多伦多", en: "Toronto" },
  { id: "paris", tz: "Europe/Paris", zh: "巴黎", en: "Paris" },
  { id: "china", tz: "Asia/Shanghai", zh: "中国", en: "China" },
  { id: "london", tz: "Europe/London", zh: "伦敦", en: "London" },
  { id: "tokyo", tz: "Asia/Tokyo", zh: "东京", en: "Tokyo" },
  { id: "sydney", tz: "Australia/Sydney", zh: "悉尼", en: "Sydney" },
  { id: "newyork", tz: "America/New_York", zh: "纽约", en: "New York" },
  { id: "losangeles", tz: "America/Los_Angeles", zh: "洛杉矶", en: "Los Angeles" },
  { id: "calgary", tz: "America/Edmonton", zh: "卡尔加里", en: "Calgary" },
  { id: "montreal", tz: "America/Toronto", zh: "蒙特利尔", en: "Montreal" },
  { id: "halifax", tz: "America/Halifax", zh: "哈利法克斯", en: "Halifax" },
  { id: "hongkong", tz: "Asia/Hong_Kong", zh: "香港", en: "Hong Kong" },
  { id: "taipei", tz: "Asia/Taipei", zh: "台北", en: "Taipei" },
  { id: "singapore", tz: "Asia/Singapore", zh: "新加坡", en: "Singapore" },
  { id: "seoul", tz: "Asia/Seoul", zh: "首尔", en: "Seoul" },
  { id: "bangkok", tz: "Asia/Bangkok", zh: "曼谷", en: "Bangkok" },
  { id: "delhi", tz: "Asia/Kolkata", zh: "新德里", en: "New Delhi" },
  { id: "dubai", tz: "Asia/Dubai", zh: "迪拜", en: "Dubai" },
  { id: "moscow", tz: "Europe/Moscow", zh: "莫斯科", en: "Moscow" },
  { id: "berlin", tz: "Europe/Berlin", zh: "柏林", en: "Berlin" },
  { id: "madrid", tz: "Europe/Madrid", zh: "马德里", en: "Madrid" },
  { id: "rome", tz: "Europe/Rome", zh: "罗马", en: "Rome" },
  { id: "auckland", tz: "Pacific/Auckland", zh: "奥克兰", en: "Auckland" },
  { id: "honolulu", tz: "Pacific/Honolulu", zh: "檀香山", en: "Honolulu" },
  { id: "mexicocity", tz: "America/Mexico_City", zh: "墨西哥城", en: "Mexico City" },
  { id: "saopaulo", tz: "America/Sao_Paulo", zh: "圣保罗", en: "São Paulo" },
];

export const CITY_BY_ID = Object.fromEntries(CITIES.map((c) => [c.id, c])) as Record<string, City>;
export const DEFAULT_CITIES = ["vancouver", "toronto", "paris", "china", "london", "tokyo", "sydney"];

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function partsIn(tz: string, ms: number): Parts {
  const out: Record<string, string> = {};
  for (const p of fmt(tz).formatToParts(new Date(ms))) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEK.indexOf(out.weekday),
  };
}

/** Minutes the zone is ahead of UTC at that instant. */
export function offsetMin(tz: string, ms: number) {
  const p = partsIn(tz, ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/** The instant when the wall clock in `tz` reads the given date and time. */
export function zonedToUtc(tz: string, year: number, month: number, day: number, hour: number, minute: number) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const off = offsetMin(tz, guess);
  let ms = guess - off * 60000;
  const off2 = offsetMin(tz, ms);
  if (off2 !== off) ms = guess - off2 * 60000;
  return ms;
}

/** A calendar-day difference between two zone-local dates. */
export function dayDiff(a: Parts, b: Parts) {
  return Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / 86400000);
}

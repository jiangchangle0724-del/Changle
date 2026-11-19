// The weather for a slot (天气, A4, 2026-11-18). Environment and Climate Change Canada forecasts
// Vancouver by the day (6:00 to 18:00) and the night (18:00 to 6:00 the next morning) for about six
// days ahead, and hour by hour for the next 24. The server reads that into a small shape
// (readForecast); the page asks what it says about a slot (weatherAt), in a few words
// (weatherText). Data Source: Environment and Climate Change Canada.
import { PART_HOURS, PERIOD_MINUTES } from "./slots";
import { addDays, instant, vancouverDay, weekday } from "./time";
import type { Day, Grain, Lang, Part } from "./types";

/** Vancouver's forecast, as JSON (MSC GeoMet's city page weather; Vancouver is bc-74). */
export const WEATHER_SOURCE = "https://api.weather.gc.ca/collections/citypageweather-realtime/items/bc-74?f=json";
/** The licence the data comes under: name the source and, where possible, link to the licence. */
export const WEATHER_LICENCE = "https://eccc-msc.github.io/open-data/licence/readme_en/";

/** What the sky does, as the page tells it apart. */
export type Sky = "clear" | "partly" | "cloudy" | "wind" | "haze" | "fog" | "smoke" | "drizzle" | "rain" | "snow" | "mixed" | "ice" | "storm";
/** ECCC's forecast icon codes, by what they show (its table of forecast conditions, checked against every Canadian city's forecast on 2026-11-18). */
const SKIES: ReadonlyMap<number, Sky> = new Map(
  (
    [
      ["clear", [0, 1, 30, 31]],
      ["partly", [2, 3, 4, 5, 22, 32, 34, 35]],
      ["cloudy", [10, 33]],
      ["wind", [43]],
      ["haze", [23]],
      ["fog", [24]],
      ["smoke", [44]],
      ["drizzle", [28]],
      ["rain", [6, 12, 13, 36]],
      ["snow", [8, 16, 17, 18, 38, 40]],
      ["mixed", [7, 15, 37]],
      ["ice", [14, 27]],
      ["storm", [9, 19, 39]],
    ] as const
  ).flatMap(([sky, codes]) => codes.map((code) => [code, sky] as const)),
);
/** null: a code the page doesn't know (29 is "not available"); it then says nothing. */
export const skyOf = (icon: number): Sky | null => SKIES.get(icon) ?? null;
/** In order of how much it matters to a plan: when hours differ, the page says the one furthest along. */
const ORDER: readonly Sky[] = ["clear", "partly", "cloudy", "wind", "haze", "fog", "smoke", "drizzle", "rain", "snow", "mixed", "ice", "storm"];
/** Something falls from the sky. */
const FALLS: ReadonlySet<Sky> = new Set(["drizzle", "rain", "snow", "mixed", "ice", "storm"]);
/** From this chance on (or with no chance given: ECCC gives one only from 30 to 60 percent), it's a day for indoors. */
export const WET_FROM = 60;

/** One day (6:00–18:00) or night (18:00–6:00 the next morning) of the forecast. `chance`: of rain or snow, in percent, when ECCC gives one. `temp`: the day's high, the night's low. */
export type WxPeriod = { day: Day; night: boolean; icon: number; chance: number | null; temp: number | null };
/** One hour of the next 24, from `at`. */
export type WxHour = { at: number; icon: number; chance: number; temp: number | null };
/** `at`: when it was issued. */
export type Forecast = { at: number; periods: WxPeriod[]; hours: WxHour[] };
export const NO_FORECAST: Forecast = { at: 0, periods: [], hours: [] };

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
/** The English of one of ECCC's two-language values ({ en, fr }). */
const en = (value: unknown): unknown => (value && typeof value === "object" ? (value as { en?: unknown }).en : undefined);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
/** ECCC's JSON, read loosely: whatever is missing or of another shape is left out. */
type Json = Record<string, any>;

/**
 * ECCC's city page forecast (JSON, as at WEATHER_SOURCE) in the shape the pages use. Its periods
 * are named by weekday ("Thursday", "Thursday night"), from the day it was issued in Vancouver; a
 * chance of rain or snow is in its words ("Cloudy with 40 percent chance of showers"). Anything it
 * can't read is left out; nothing at all comes back as NO_FORECAST.
 */
export function readForecast(json: unknown): Forecast {
  try {
    const page = (json as Json)?.properties as Json | undefined;
    const group = page?.forecastGroup as Json | undefined;
    const issued = Date.parse(String(en(group?.timestamp) ?? ""));
    if (!Number.isFinite(issued)) return NO_FORECAST;
    let from = vancouverDay(issued);
    const periods: WxPeriod[] = [];
    for (const f of list(group?.forecasts) as Json[]) {
      const name = /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)( night)?$/.exec(
        String(en(f?.period?.value) ?? "")
          .trim()
          .toLowerCase(),
      );
      const icon = number(f?.abbreviatedForecast?.icon?.value);
      if (!name || icon === null) continue;
      let ahead = (WEEKDAYS.indexOf(name[1]) - weekday(from) + 7) % 7;
      // issued after midnight, a forecast can still start with the night before
      if (periods.length === 0 && ahead === 6) {
        from = addDays(from, -1);
        ahead = 0;
      }
      const chance = /(\d{1,3}) percent chance/i.exec(String(en(f?.cloudPrecip) ?? ""));
      const temp = list(f?.temperatures?.temperature)[0] as Json | undefined;
      periods.push({ day: addDays(from, ahead), night: !!name[2], icon, chance: chance ? Math.min(100, Number(chance[1])) : null, temp: number(en(temp?.value)) });
    }
    const hours: WxHour[] = [];
    for (const h of list(page?.hourlyForecastGroup?.hourlyForecasts) as Json[]) {
      const at = Date.parse(String(h?.timestamp ?? ""));
      const icon = number(h?.iconCode?.value);
      if (!Number.isFinite(at) || icon === null) continue;
      hours.push({ at, icon, chance: number(en(h?.lop?.value)) ?? 0, temp: number(en(h?.temperature?.value)) });
    }
    return { at: issued, periods, hours };
  } catch {
    return NO_FORECAST;
  }
}

/**
 * What the forecast says about a slot. `chance` only when something falls; `temp` the period's
 * high or low, or the hours' average; `wet`: rain or snow is likely enough to say "better indoors".
 */
export type Weather = { sky: Sky; night: boolean; chance: number | null; temp: number | null; of: "high" | "low" | "hours"; wet: boolean };

const HOUR_MS = 3_600_000;
/** The minutes of a day a slot stands for here: a period's own, or the part of it given; a half day's usual hours; a whole day's daytime. */
function minutesOf(grain: Grain, part: Part, from?: number, to?: number): [number, number] {
  if (from !== undefined && to !== undefined) return [from, to];
  const period = grain === "periods" ? PERIOD_MINUTES[part] : undefined;
  if (period) return [period[0], period[1]];
  if (part === "day") return [6 * 60, 18 * 60];
  const { start, end } = PART_HOURS[part];
  return [start[0] * 60 + start[1], end[0] * 60 + end[1]];
}

/**
 * The weather for a slot, or null where the forecast doesn't reach (more than about six days off) or
 * the slot is over. Hour by hour where the next 24 hours cover what's left of it; otherwise its day
 * or night: 凌晨 goes with the night before, 晚上 with its own night, the rest with the day.
 */
export function weatherAt(forecast: Forecast, at: { day: Day; grain: Grain; part: Part; from?: number; to?: number }, now: number): Weather | null {
  const [from, to] = minutesOf(at.grain, at.part, at.from, at.to);
  const start = instant(at.day, 0, from);
  const end = instant(at.day, 0, to);
  if (end <= now) return null;
  const night = from >= 18 * 60 || to <= 6 * 60;

  // the hours still to come, each from its own hour of the next 24
  const hours: WxHour[] = [];
  const first = Math.max(Math.floor(start / HOUR_MS), Math.ceil(now / HOUR_MS)) * HOUR_MS;
  for (let hour = first; hour < end; hour += HOUR_MS) {
    const found = forecast.hours.find((h) => h.at === hour);
    if (!found) {
      hours.length = 0;
      break;
    }
    hours.push(found);
  }
  if (hours.length) {
    let most: Sky | null = null;
    for (const h of hours) {
      const sky = skyOf(h.icon);
      if (sky && (!most || ORDER.indexOf(sky) > ORDER.indexOf(most))) most = sky;
    }
    if (!most) return null;
    const temps = hours.map((h) => h.temp).filter((t): t is number => t !== null);
    const chance = FALLS.has(most) ? Math.max(...hours.map((h) => h.chance)) : null;
    return { sky: most, night, chance, temp: temps.length ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length) : null, of: "hours", wet: wet(most, chance) };
  }

  const day = to <= 6 * 60 ? addDays(at.day, -1) : at.day;
  const period = forecast.periods.find((p) => p.day === day && p.night === night);
  const sky = period && skyOf(period.icon);
  if (!period || !sky) return null;
  const chance = FALLS.has(sky) ? period.chance : null;
  return { sky, night: period.night, chance, temp: period.temp, of: period.night ? "low" : "high", wet: wet(sky, chance) };
}

const wet = (sky: Sky, chance: number | null) => FALLS.has(sky) && (chance === null || chance >= WET_FROM);

/** How each sky is said: on its own, and (for what falls) after a chance ("40% 可能下雨", "40% chance of rain"). */
const WORDS: Readonly<Record<Sky, { zh: string; en: string; zhChance?: string; enChance?: string }>> = {
  clear: { zh: "晴", en: "Sunny" },
  partly: { zh: "多云", en: "Partly cloudy" },
  cloudy: { zh: "阴", en: "Cloudy" },
  wind: { zh: "大风", en: "Windy" },
  haze: { zh: "霾", en: "Haze" },
  fog: { zh: "有雾", en: "Fog" },
  smoke: { zh: "烟雾", en: "Smoke" },
  drizzle: { zh: "毛毛雨", en: "Drizzle", zhChance: "可能有毛毛雨", enChance: "drizzle" },
  rain: { zh: "有雨", en: "Rain", zhChance: "可能下雨", enChance: "rain" },
  snow: { zh: "有雪", en: "Snow", zhChance: "可能下雪", enChance: "snow" },
  mixed: { zh: "雨夹雪", en: "Rain and snow", zhChance: "可能雨夹雪", enChance: "rain and snow" },
  ice: { zh: "冻雨", en: "Freezing rain", zhChance: "可能有冻雨", enChance: "freezing rain" },
  storm: { zh: "雷雨", en: "Thunderstorms", zhChance: "可能有雷雨", enChance: "thunderstorms" },
};

/** "40% 可能下雨 · 最低 3°", "晴 · 最高 9°"; "40% chance of rain · low 3°", "Clear · 6°". */
export function weatherText(w: Weather, lang: Lang): string {
  const words = WORDS[w.sky];
  const sky =
    lang === "zh"
      ? w.chance !== null && words.zhChance
        ? `${w.chance}% ${words.zhChance}`
        : words.zh
      : w.chance !== null && words.enChance
        ? `${w.chance}% chance of ${words.enChance}`
        : w.sky === "clear" && w.night
          ? "Clear"
          : words.en;
  if (w.temp === null) return sky;
  const temp = w.of === "hours" ? `${w.temp}°` : lang === "zh" ? `${w.of === "high" ? "最高" : "最低"} ${w.temp}°` : `${w.of} ${w.temp}°`;
  return `${sky} · ${temp}`;
}

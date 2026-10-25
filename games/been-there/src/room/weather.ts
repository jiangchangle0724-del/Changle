// The weather right now in each city, for the touchdown and the arrival card. The Worker asks
// Open-Meteo (open-meteo.com, data CC BY 4.0) about all 22 cities at once and keeps the answer for
// 15 minutes; the pages ask the Worker, so players' phones only ever talk to the game's own server.
// Nothing in the game's rules depends on it: if the weather can't be had, it just isn't shown.

export interface CityWeather {
  /** °C, rounded. */
  t: number;
  /** WMO weather code, as Open-Meteo reports it. */
  code: number;
  day: boolean;
}

export interface WeatherReport {
  at: number;
  cities: Record<string, CityWeather>;
}

export type WeatherKind = "clear" | "cloudy" | "overcast" | "fog" | "drizzle" | "rain" | "snow" | "storm";

export const WEATHER_TTL = 15 * 60_000;

/** What the sky looks like for a WMO weather code. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return "clear";
  if (code === 2) return "cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if (code >= 95) return "storm";
  return "cloudy";
}

/** One request for every city: Open-Meteo takes comma-separated lists and answers in the same order. */
export function weatherUrl(coords: Record<string, [number, number]>): string {
  const ids = Object.keys(coords);
  const lat = ids.map((id) => coords[id][0]).join(",");
  const lon = ids.map((id) => coords[id][1]).join(",");
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day`;
}

/** Read Open-Meteo's answer: a list with one entry per place asked (a bare object for one place). */
export function parseWeather(data: unknown, ids: string[], at: number): WeatherReport {
  const list = Array.isArray(data) ? data : [data];
  const cities: Record<string, CityWeather> = {};
  ids.forEach((id, i) => {
    const c = (list[i] as { current?: { temperature_2m?: unknown; weather_code?: unknown; is_day?: unknown } } | null | undefined)?.current;
    if (c && typeof c.temperature_2m === "number" && typeof c.weather_code === "number")
      cities[id] = { t: Math.round(c.temperature_2m), code: c.weather_code, day: c.is_day === 1 };
  });
  return { at, cities };
}

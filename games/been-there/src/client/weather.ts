// The weather right now in the 22 cities, from the game's own server (/api/weather, which asks
// Open-Meteo). Asked for once and kept 15 minutes; if it can't be had, nothing shows.
import { useEffect, useState } from "preact/hooks";
import { WEATHER_TTL, weatherKind, type CityWeather, type WeatherReport } from "../room/weather";
import { BASE } from "./base";
import { t } from "./i18n";

let report: WeatherReport | null = null;
let askedAt = -Infinity;
let enabled = true;
const listeners = new Set<() => void>();

/** The single-device demo has no server to ask. */
export const disableWeather = () => (enabled = false);

function ask() {
  const now = Date.now();
  // Ask again when the answer is stale; after a failure, wait two minutes before trying again.
  if (!enabled || now - askedAt < (report ? WEATHER_TTL : 2 * 60_000)) return;
  askedAt = now;
  fetch(`${BASE}/api/weather`)
    .then((r) => (r.ok ? (r.json() as Promise<WeatherReport>) : null))
    .then((data) => {
      if (!data?.cities || !Object.keys(data.cities).length) return;
      report = data;
      listeners.forEach((f) => f());
    })
    .catch(() => {});
}

/** The weather in a city now, or null (not loaded, not available). Re-renders when it arrives. */
export function useWeather(city: string | null | undefined): CityWeather | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((n) => n + 1);
    listeners.add(f);
    ask();
    return () => {
      listeners.delete(f);
    };
  }, []);
  // Ask again when the answer goes stale, or two minutes after a failed try (ask() keeps to those).
  ask();
  return (city && report?.cities[city]) || null;
}

/** "小雨 12°C" / "Rain 12°C". */
export const weatherLabel = (w: CityWeather) => t("wxTemp", { wx: t(`wx_${weatherKind(w.code)}`), t: w.t });

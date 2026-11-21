// 天气: the forecast for Vancouver, fetched when a gathering asks about any of the next seven days,
// and the line that says what it is at a time (src/engine/weather.ts reads and words it).
import { Cloud, CloudDrizzle, CloudFog, CloudHail, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Haze, Moon, Sun, Wind } from "lucide-preact";
import { useEffect, useState } from "preact/hooks";
import { BASE } from "../../base";
import { daysBetween, NO_FORECAST, vancouverDay, WEATHER_LICENCE, weatherSaid } from "../../engine";
import type { Day, Forecast, Sky, Weather } from "../../engine";
import { t } from "../i18n";
import { useLang } from "./common";

/** The forecast is issued a few times a day and its hours move on every hour: a page open longer than this asks again when it comes back to the front. */
const FRESH_MS = 30 * 60_000;

/** Vancouver's forecast, or none (the days asked about are all more than a week off, or it couldn't be had). */
export function useForecast(days: readonly Day[] | undefined): Forecast {
  const [forecast, setForecast] = useState<Forecast>(NO_FORECAST);
  const today = vancouverDay(Date.now());
  const soon = !!days?.some((day) => daysBetween(today, day) >= 0 && daysBetween(today, day) <= 6);
  useEffect(() => {
    if (!soon) return;
    let asked = 0;
    const ask = () => {
      asked = Date.now();
      fetch(`${BASE}/api/weather`)
        .then((res) => (res.ok ? (res.json() as Promise<Forecast>) : null))
        .then((got) => got && Array.isArray(got.periods) && Array.isArray(got.hours) && setForecast(got))
        .catch(() => undefined);
    };
    ask();
    const front = () => document.visibilityState === "visible" && Date.now() - asked > FRESH_MS && ask();
    document.addEventListener("visibilitychange", front);
    return () => document.removeEventListener("visibilitychange", front);
  }, [soon]);
  return forecast;
}

/** A line icon for each sky, by day and by night (Lucide, as the rest of changle.ca). */
function SkyIcon({ sky, night }: { sky: Sky; night: boolean }) {
  const Icon = {
    clear: night ? Moon : Sun,
    partly: night ? CloudMoon : CloudSun,
    cloudy: Cloud,
    wind: Wind,
    haze: Haze,
    fog: CloudFog,
    smoke: Haze,
    drizzle: CloudDrizzle,
    rain: CloudRain,
    snow: CloudSnow,
    mixed: CloudSnow,
    ice: CloudHail,
    storm: CloudLightning,
  }[sky];
  return <Icon size={16} strokeWidth={2} aria-hidden="true" focusable="false" />;
}

/** "40% 可能下雨 · 最低 3°"; "有雨 · 最低 4°，适合室内" when rain or snow is likely; nothing where the forecast doesn't reach. */
export function WeatherLine({ weather, as: Tag = "small" }: { weather: Weather | null; as?: "small" | "p" }) {
  const lang = useLang();
  if (!weather) return null;
  return (
    <Tag class="wx" data-wet={weather.wet ? "" : undefined}>
      <SkyIcon sky={weather.sky} night={weather.night} />
      <span>{weatherSaid(weather, lang)}</span>
    </Tag>
  );
}

/** Where the weather comes from, as its licence asks. */
export function WeatherCredit() {
  useLang();
  return (
    <p class="wx-credit">
      {t("wxSource")}
      <a class="link-btn" href={WEATHER_LICENCE} target="_blank" rel="noopener noreferrer">
        {t("wxLicence")}
      </a>
    </p>
  );
}

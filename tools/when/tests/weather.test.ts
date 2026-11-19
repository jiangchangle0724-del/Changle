// 天气 (A4, 2026-11-18): Environment and Climate Change Canada's forecast for Vancouver, read into
// the pages' shape, and what it says about a slot. The fixture is a real forecast (Data Source:
// Environment and Climate Change Canada), issued Wednesday 18 November 2026 at 4 p.m. in Vancouver.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NO_FORECAST, readForecast, skyOf, weatherAt, weatherText, type Forecast, type Weather } from "../src/engine/weather";

const ECCC = JSON.parse(readFileSync(new URL("./fixtures/eccc-vancouver.json", import.meta.url), "utf8")) as unknown;
const forecast = readForecast(ECCC);
/** When the fixture was read: Wednesday 18 November, 11:10 p.m. in Vancouver. */
const NOW = Date.parse("2026-11-19T06:10:00Z");
const THU = "2026-11-19";
const at = (day: string, part: Parameters<typeof weatherAt>[1]["part"], grain: Parameters<typeof weatherAt>[1]["grain"] = "periods", from?: number, to?: number) =>
  weatherAt(forecast, { day, grain, part, from, to }, NOW);
const say = (w: Weather | null) => (w ? [weatherText(w, "zh"), weatherText(w, "en"), w.wet] : null);

test("ECCC's forecast, read: each day and night from the day it was issued, a chance in its words, and the next 24 hours", () => {
  assert.equal(forecast.at, Date.parse("2026-11-18T23:00:00Z"));
  assert.equal(forecast.periods.length, 12);
  assert.deepEqual(forecast.periods[0], { day: "2026-11-18", night: true, icon: 33, chance: null, temp: 4 }, "Tonight: Wednesday night");
  assert.deepEqual(forecast.periods[1], { day: THU, night: false, icon: 5, chance: null, temp: 9 });
  assert.deepEqual(forecast.periods[4], { day: "2026-11-20", night: true, icon: 28, chance: 30, temp: 4 }, "Cloudy with 30 percent chance of drizzle");
  assert.deepEqual(forecast.periods.at(-1)!.day, "2026-11-24", "to the next Tuesday");
  assert.equal(forecast.hours.length, 24);
  assert.deepEqual(forecast.hours[0], { at: Date.parse("2026-11-19T07:00:00Z"), icon: 33, chance: 20, temp: 6 });
});

test("read loosely: anything else is no forecast, and a period it can't name is left out", () => {
  assert.deepEqual(readForecast(null), NO_FORECAST);
  assert.deepEqual(readForecast({ properties: { forecastGroup: { timestamp: { en: "soon" } } } }), NO_FORECAST);
  const odd = readForecast({
    properties: {
      forecastGroup: {
        timestamp: { en: "2026-11-18T23:00:00Z" },
        forecasts: [{ period: { value: { en: "Someday" } }, abbreviatedForecast: { icon: { value: 12 } } }, { period: { value: { en: "Thursday" } } }],
      },
    },
  });
  assert.deepEqual(odd, { at: Date.parse("2026-11-18T23:00:00Z"), periods: [], hours: [] });
});

test("issued after midnight, a forecast that starts with the night before still lands on the right days", () => {
  const night = (en: string, icon: number, temp: number) => ({
    period: { value: { en } },
    abbreviatedForecast: { icon: { value: icon } },
    cloudPrecip: { en: "Rain." },
    temperatures: { temperature: [{ value: { en: temp } }] },
  });
  // 1:30 a.m. on Thursday in Vancouver
  const late = readForecast({ properties: { forecastGroup: { timestamp: { en: "2026-11-19T08:30:00Z" }, forecasts: [night("Wednesday night", 12, 5), night("Thursday", 0, 11)] } } });
  assert.deepEqual(
    late.periods.map((p) => [p.day, p.night]),
    [
      ["2026-11-18", true],
      [THU, false],
    ],
  );
});

test("a slot's weather: hour by hour within the next 24 hours, then by the day and the night", () => {
  assert.deepEqual(say(at(THU, "morning")), ["阴 · 5°", "Cloudy · 5°", false], "6 to 11: mainly cloudy, then cloudy periods; the cloudier said");
  assert.deepEqual(say(at(THU, "afternoon")), ["晴 · 8°", "Sunny · 8°", false]);
  assert.deepEqual(say(at(THU, "eve")), ["晴 · 5°", "Clear · 5°", false], "18:00 to 23:59, all six hours in the next 24");
  assert.deepEqual(say(at("2026-11-20", "dawn")), ["晴 · 最低 0°", "Clear · low 0°", false], "凌晨 goes with the night before");
  assert.deepEqual(say(at("2026-11-20", "morning")), ["阴 · 最高 7°", "Cloudy · high 7°", false]);
  assert.deepEqual(say(at("2026-11-20", "eve")), ["30% 可能有毛毛雨 · 最低 4°", "30% chance of drizzle · low 4°", false]);
  assert.deepEqual(say(at("2026-11-21", "eve")), ["有雨 · 最低 4°", "Rain · low 4°", true], "showers with no chance given: likely, so better indoors");
  assert.deepEqual(say(at("2026-11-22", "eve")), ["40% 可能下雨 · 最低 3°", "40% chance of rain · low 3°", false]);
  assert.equal(at("2026-11-24", "eve"), null, "the forecast ends with Tuesday's day");
  assert.equal(at("2026-11-25", "noon"), null);
  assert.equal(at("2026-11-18", "afternoon"), null, "already over");
  assert.deepEqual(say(at("2026-11-18", "eve")), ["阴 · 最低 4°", "Cloudy · low 4°", false], "tonight, with no whole hour left: the night's forecast");
});

test("half days, whole days and times to the minute", () => {
  assert.deepEqual(say(at(THU, "eve", "half")), ["晴 · 6°", "Clear · 6°", false], "the old evening is 18:00 to 22:00");
  assert.deepEqual(say(at("2026-11-21", "day", "day")), ["30% 可能有毛毛雨 · 最高 8°", "30% chance of drizzle · high 8°", false], "a whole day goes by its daytime");
  assert.deepEqual(say(at(THU, "eve", "periods", 19 * 60 + 30, 21 * 60)), ["晴 · 6°", "Clear · 6°", false], "19:30 to 21:00: two hours");
});

test("the hours: the wettest of them, its chance, and how likely is likely enough for indoors", () => {
  const hour = (h: number, icon: number, chance: number, temp: number) => ({ at: Date.parse("2026-11-19T07:00:00Z") + h * 3_600_000, icon, chance, temp });
  const hours: Forecast = { at: 0, periods: [], hours: [hour(18, 0, 0, 7), hour(19, 12, 70, 6), hour(20, 31, 10, 5)] };
  // 18:00 to 21:00 on Thursday is 01:00 to 04:00 UTC on the 20th: the 18th to the 20th hour from 07:00 UTC on the 19th
  const w = weatherAt(hours, { day: THU, grain: "periods", part: "eve", from: 18 * 60, to: 21 * 60 }, NOW);
  assert.deepEqual(w, { sky: "rain", night: true, chance: 70, temp: 6, of: "hours", wet: true });
  const period = (chance: number | null): Forecast => ({ at: 0, hours: [], periods: [{ day: "2026-11-22", night: false, icon: 12, chance, temp: 8 }] });
  const sunday = (f: Forecast) => weatherAt(f, { day: "2026-11-22", grain: "periods", part: "noon" }, NOW)!.wet;
  assert.deepEqual([sunday(period(60)), sunday(period(50)), sunday(period(null))], [true, false, true]);
  const unknown: Forecast = { at: 0, hours: [], periods: [{ day: "2026-11-22", night: false, icon: 29, chance: null, temp: 8 }] };
  assert.equal(weatherAt(unknown, { day: "2026-11-22", grain: "periods", part: "noon" }, NOW), null, "29 is ECCC's 'not available'");
  assert.equal(skyOf(44), "smoke");
});

test("the words for each sky, in both languages", () => {
  const w = (sky: Weather["sky"], chance: number | null, temp: number | null, of: Weather["of"] = "low", night = false): Weather => ({ sky, night, chance, temp, of, wet: false });
  const both = (x: Weather) => [weatherText(x, "zh"), weatherText(x, "en")];
  assert.deepEqual(both(w("rain", 40, -2)), ["40% 可能下雨 · 最低 -2°", "40% chance of rain · low -2°"]);
  assert.deepEqual(both(w("snow", null, null)), ["有雪", "Snow"]);
  assert.deepEqual(both(w("storm", 30, 21, "high")), ["30% 可能有雷雨 · 最高 21°", "30% chance of thunderstorms · high 21°"]);
  assert.deepEqual(both(w("clear", null, 6, "hours", true)), ["晴 · 6°", "Clear · 6°"]);
  assert.deepEqual(both(w("clear", null, 6, "hours")), ["晴 · 6°", "Sunny · 6°"]);
  assert.deepEqual(both(w("smoke", null, 24, "high")), ["烟雾 · 最高 24°", "Smoke · high 24°"]);
  assert.deepEqual(both(w("mixed", 60, 1)), ["60% 可能雨夹雪 · 最低 1°", "60% chance of rain and snow · low 1°"]);
});

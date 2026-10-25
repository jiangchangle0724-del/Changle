// The live weather: reading Open-Meteo's answer and naming what the sky looks like.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COORDS } from "../src/client/art/coords";
import { parseWeather, weatherKind, weatherUrl } from "../src/room/weather";

test("WMO weather codes name what the sky looks like", () => {
  const cases: [number, string][] = [
    [0, "clear"],
    [1, "clear"],
    [2, "cloudy"],
    [3, "overcast"],
    [45, "fog"],
    [53, "drizzle"],
    [63, "rain"],
    [81, "rain"],
    [75, "snow"],
    [86, "snow"],
    [95, "storm"],
    [99, "storm"],
  ];
  for (const [code, kind] of cases) assert.equal(weatherKind(code), kind, `code ${code}`);
});

test("one request asks about all 22 cities, in a fixed order", () => {
  const url = new URL(weatherUrl(COORDS));
  assert.equal(url.host, "api.open-meteo.com");
  assert.equal(url.searchParams.get("latitude")!.split(",").length, 22);
  assert.equal(url.searchParams.get("longitude")!.split(",").length, 22);
  assert.equal(url.searchParams.get("current"), "temperature_2m,weather_code,is_day");
});

test("Open-Meteo's answer is read in the order asked, skipping anything unreadable", () => {
  const ids = ["london", "tokyo", "cairo"];
  const answer = [
    { current: { temperature_2m: 11.6, weather_code: 61, is_day: 0 } },
    { current: { temperature_2m: 18.2, weather_code: 0, is_day: 1 } },
    { error: true, reason: "rate limited" },
  ];
  assert.deepEqual(parseWeather(answer, ids, 123), {
    at: 123,
    cities: { london: { t: 12, code: 61, day: false }, tokyo: { t: 18, code: 0, day: true } },
  });
  // One place comes back as a bare object rather than a list.
  assert.deepEqual(parseWeather({ current: { temperature_2m: -3.4, weather_code: 73, is_day: 1 } }, ["seoul"], 1).cities, {
    seoul: { t: -3, code: 73, day: true },
  });
  // Nonsense gives no weather rather than an error.
  for (const junk of [null, "oops", 42, [null, {}], { current: { temperature_2m: "warm" } }]) assert.deepEqual(parseWeather(junk, ids, 1).cities, {});
});

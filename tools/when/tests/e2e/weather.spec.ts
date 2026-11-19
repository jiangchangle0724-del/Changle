// 天气 (A4, 2026-11-18): the best three, the time that was set and a slot's sheet say the weather
// where the forecast reaches, with where it comes from under the best three. Each page here is
// given its own forecast (under test the server gives none).
import { expect, test, type Page } from "@playwright/test";
import { vancouverDay, type Forecast } from "../../src/engine";
import { at, cell, closePhones, join, make, phone, saved } from "./helpers";

test.afterEach(async ({ browser }) => {
  await closePhones(browser);
});

/** Tomorrow night: showers, with no chance given (so likely); the night after: clear, and that day partly cloudy. */
function forecast(): Forecast {
  const now = Date.now();
  return {
    at: now,
    hours: [],
    periods: [
      { day: vancouverDay(now, 1), night: true, icon: 12, chance: null, temp: 4 },
      { day: vancouverDay(now, 2), night: false, icon: 2, chance: null, temp: 9 },
      { day: vancouverDay(now, 2), night: true, icon: 30, chance: null, temp: 2 },
    ],
  };
}
const giveWeather = (page: Page, f: Forecast) => page.route("**/when/api/weather", (route) => route.fulfill({ json: f }));

test("the best three, the time that was set and a slot's sheet say the weather, with its source", async ({ browser }) => {
  const host = await phone(browser);
  await giveWeather(host, forecast());
  const { url } = await make(host, "看天气");
  await join(host, url, "Steve");
  await cell(host, at(1, "eve")).click();
  await cell(host, at(2, "eve")).click();
  await saved(host);

  const best = host.locator(".best li");
  await expect(best).toHaveCount(2);
  await expect(best.nth(0).locator(".wx")).toHaveText("有雨 · 最低 4°，适合室内");
  await expect(best.nth(0).locator(".wx svg")).toBeVisible();
  await expect(best.nth(1).locator(".wx")).toHaveText("晴 · 最低 2°");
  await expect(host.locator(".wx-credit")).toContainText("天气数据来源：加拿大环境与气候变化部");
  await expect(host.locator(".wx-credit a")).toHaveAttribute("href", "https://eccc-msc.github.io/open-data/licence/readme_en/");

  // a slot nobody has answered, in its sheet
  await host.click(".seg button:nth-child(2)");
  await cell(host, at(2, "afternoon")).click();
  await expect(host.locator(".sheet .wx")).toHaveText("多云 · 最高 9°");
  await host.click(".sheet .icon-btn");
  await expect(host.locator(".sheet")).toHaveCount(0);

  // set tomorrow evening: the banner says it too, in either language
  await best.nth(0).locator(".btn").click();
  await expect(host.locator(".set .wx")).toHaveText("有雨 · 最低 4°，适合室内");
  await host.click(".bar-lang");
  await expect(host.locator(".set .wx")).toHaveText("Rain · low 4°, better indoors");
  await expect(host.locator(".best li").first().locator(".wx")).toHaveText("Rain · low 4°, better indoors");
  await expect(host.locator(".wx-credit")).toContainText("Data Source: Environment and Climate Change Canada");
  await expect(host.locator(".wx-credit a")).toHaveText("Licence");
});

test("nothing about the weather where the forecast doesn't reach, and no asking when every day is weeks off", async ({ browser }) => {
  const host = await phone(browser);
  let asked = 0;
  await host.route("**/when/api/weather", (route) => {
    asked += 1;
    return route.fulfill({ json: forecast() });
  });
  const { url } = await make(host, "三周以后", [vancouverDay(Date.now(), 20), vancouverDay(Date.now(), 21)]);
  await join(host, url, "Steve");
  await cell(host, at(0, "eve")).click();
  await saved(host);
  await expect(host.locator(".best li")).toHaveCount(1);
  await expect(host.locator(".wx")).toHaveCount(0);
  await expect(host.locator(".wx-credit")).toHaveCount(0);
  expect(asked).toBe(0);
});

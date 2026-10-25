// The big screen: the 3D globe in the middle of the board loads, and flies the plane when a token
// reaches another region. Without WebGL the flat map stays, which is the designed fallback. Every
// throw lands as dice on the board, and the live weather (here: rain everywhere) shows on arrival.
import { expect, test } from "@playwright/test";
import { COORDS } from "../../src/client/art/coords";
import { createRoom, joinWithTeam, newPhone, playUntil, watch, type Phone } from "./phones";

const RAIN = { at: Date.now(), cities: Object.fromEntries(Object.keys(COORDS).map((id) => [id, { t: 12, code: 63, day: true }])) };

test("大屏：3D 地球加载，骰子落在桌上，棋子飞去别的地区时飞机沿航线飞", async ({ browser, request, contextOptions }) => {
  test.setTimeout(180_000);
  const code = await createRoom(request, {});
  const ctx = await browser.newContext({ ...contextOptions, viewport: { width: 1600, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  await ctx.route("**/api/weather", (route) => route.fulfill({ json: RAIN }));
  const tv: Phone = { name: "大屏", ctx, page: await ctx.newPage(), errors: [], log: [], taps: 0 };
  watch(tv, tv.page);
  await tv.page.goto(`/tv/${code}`);
  await expect(tv.page.locator(".lobby-tv")).toBeVisible({ timeout: 20_000 });
  const p = await newPhone(browser, "东", contextOptions);
  await joinWithTeam(p, code);
  for (let i = 0; i < 2; i++) await p.page.getByRole("button", { name: "加一个电脑队" }).click();
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(tv.page.locator(".screen .boardwrap")).toBeVisible();
  // Note each throw's dice as they land (they're only up for a few seconds), drawn at a real size.
  await tv.page.evaluate(() => {
    const w = window as unknown as { sawDice: number };
    w.sawDice = 0;
    new MutationObserver(() => {
      const face = document.querySelector(".tv-dice .face");
      if (face && face.getBoundingClientRect().width > 10) w.sawDice += 1;
    }).observe(document.body, { childList: true, subtree: true });
  });
  const webgl = await tv.page.evaluate(() => {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  });
  if (webgl) {
    await expect(tv.page.locator("canvas.globe.on")).toBeVisible({ timeout: 20_000 });
    // A plane takes off and lands. Landings are counted as they happen: a flight can start before the
    // last one has landed, so there may be no quiet moment to look for.
    await tv.page.evaluate(() => {
      const w = window as unknown as { landed: number };
      w.landed = 0;
      let flying = false;
      new MutationObserver(() => {
        const now = !!document.querySelector("canvas.globe[data-flying]");
        if (flying && !now) w.landed += 1;
        flying = now;
      }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["data-flying"] });
    });
    await playUntil([p], async () => (await tv.page.evaluate(() => (window as unknown as { landed: number }).landed)) > 0, 120_000);
  } else {
    await expect(tv.page.locator("canvas.globe.on")).toHaveCount(0);
    await playUntil([p], async () => (await tv.page.locator(".tv-dice").count()) > 0, 60_000);
  }
  expect(await tv.page.evaluate(() => (window as unknown as { sawDice: number }).sawDice)).toBeGreaterThan(0);
  // The weather where the team on turn arrives, on its arrival card and, on a first visit, in the touchdown.
  await playUntil([p], async () => (await tv.page.locator(".arrival-wx").count()) > 0, 60_000);
  await expect(tv.page.locator(".arrival-wx").first()).toContainText("此刻 雨 12°C");
  if (await tv.page.evaluate(() => !matchMedia("(prefers-reduced-motion: reduce)").matches)) {
    await playUntil([p], async () => (await tv.page.locator(".touchdown.wx-rain .td-weather.rain").count()) > 0, 90_000);
    await expect(tv.page.locator(".touchdown .td-meta")).toContainText("雨 12°C");
  }
  expect([...tv.errors, ...p.errors]).toEqual([]);
});

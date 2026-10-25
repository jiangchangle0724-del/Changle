// The big screen: the 3D globe in the middle of the board loads, and flies the plane when a token
// reaches another region. Without WebGL the flat map stays, which is the designed fallback.
import { expect, test } from "@playwright/test";
import { createRoom, joinWithTeam, newPhone, playUntil, watch, type Phone } from "./phones";

test("大屏：3D 地球加载，棋子飞去别的地区时飞机沿航线飞", async ({ browser, request, contextOptions }) => {
  test.setTimeout(180_000);
  const code = await createRoom(request, {});
  const ctx = await browser.newContext({ ...contextOptions, viewport: { width: 1600, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  const tv: Phone = { name: "大屏", ctx, page: await ctx.newPage(), errors: [], log: [], taps: 0 };
  watch(tv, tv.page);
  await tv.page.goto(`/tv/${code}`);
  await expect(tv.page.locator(".lobby-tv")).toBeVisible({ timeout: 20_000 });
  const p = await newPhone(browser, "东", contextOptions);
  await joinWithTeam(p, code);
  for (let i = 0; i < 2; i++) await p.page.getByRole("button", { name: "加一个电脑队" }).click();
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(tv.page.locator(".screen .boardwrap")).toBeVisible();
  const webgl = await tv.page.evaluate(() => {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  });
  if (webgl) {
    await expect(tv.page.locator("canvas.globe.on")).toBeVisible({ timeout: 20_000 });
    await playUntil([p], async () => (await tv.page.locator("canvas.globe[data-flying]").count()) > 0, 120_000);
    // …and lands.
    await expect(tv.page.locator("canvas.globe[data-flying]")).toHaveCount(0, { timeout: 10_000 });
  } else {
    await tv.page.waitForTimeout(3000);
    await expect(tv.page.locator("canvas.globe.on")).toHaveCount(0);
  }
  expect([...tv.errors, ...p.errors]).toEqual([]);
});

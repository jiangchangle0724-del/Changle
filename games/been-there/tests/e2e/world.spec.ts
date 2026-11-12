// 世界大动荡 on every screen (ui/World.tsx; the board's part in art/RoundBoard.tsx WorldMoment): in a room
// where one comes every few seconds (a test setting) in a set order, the 号外 card comes on the phones
// and the big screen with its headline and what it did; the board plays it (a meteor onto its city);
// while it lasts the city wears its tag and the banner says how long; nothing runs off either screen;
// with reduced motion the card still comes but nothing plays on the board.
import { devices, expect, test, type Page } from "@playwright/test";
import { closeAll, createRoom, fits, joinWithTeam, newPhone, playUntil, quizOff, type Phone } from "./phones";

test.afterEach(closeAll);

/** Write down every world effect the board starts (each plays for three seconds and is gone). */
const watchBoard = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __wf: string[] };
    w.__wf = [];
    new MutationObserver((list) => {
      for (const m of list)
        for (const n of m.addedNodes)
          if (n instanceof Element) for (const el of [n, ...n.querySelectorAll(".wf")]) if (el.matches(".roundboard .wf")) w.__wf.push(el.getAttribute("class") ?? "");
    }).observe(document.body, { subtree: true, childList: true });
  });
const played = (p: Phone) => p.page.evaluate(() => (window as unknown as { __wf: string[] }).__wf);

const fitsWindow = (page: Page) =>
  page.evaluate(() => {
    const el = document.scrollingElement!;
    return el.scrollHeight <= innerHeight + 1 && el.scrollWidth <= innerWidth + 1;
  });

test("世界大动荡：号外卡片手机和大屏都有，地图上陨石砸下来，城市挂着陨石坑的牌子，横条写着还有几轮；不出屏幕；减少动态时地图上不动", async ({ browser, request }) => {
  test.setTimeout(180_000);
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  const code = await createRoom(request, { mode: 60, test: { speed: 0.3, worldEvery: 5_000, worldOrder: ["meteor", "crash"] } });
  const a = await newPhone(browser, "甲", { ...iphone, locale: "zh-CN" });
  const b = await newPhone(browser, "乙", { ...iphone, locale: "zh-CN", reducedMotion: "reduce" });
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await quizOff(a);
  const tv = await newPhone(browser, "大屏", { viewport: { width: 1366, height: 768 }, locale: "zh-CN" });
  await tv.page.goto(`/trip/tv/${code}`);
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  for (const p of [a, b, tv]) await expect(p.page.locator(".roundboard")).toBeVisible({ timeout: 20_000 });
  for (const p of [a, b, tv]) await watchBoard(p.page);

  // The first: a meteor. Every screen's card says so, with the city it hit.
  await playUntil([a, b], async () => (await a.page.locator(".world-card").count()) > 0, 120_000);
  const card = a.page.locator(".world-card");
  await expect(card.locator("h2")).toHaveText("陨石坠落");
  await expect(card.locator(".world-line")).toContainText("陨石砸中了");
  await expect(card.locator(".world-strip")).toContainText("号外");
  await expect(tv.page.locator(".world-card.big h2")).toHaveText("陨石坠落", { timeout: 5_000 });
  await expect(b.page.locator(".world-card h2")).toHaveText("陨石坠落", { timeout: 5_000 });
  await fits(a, "号外", ".world-card");
  expect(await fitsWindow(tv.page)).toBe(true);

  // The board: the meteor comes down on its city (not with reduced motion), which wears its tag.
  await expect.poll(() => played(a)).toContainEqual(expect.stringContaining("wf-meteor"));
  await expect.poll(() => played(tv)).toContainEqual(expect.stringContaining("wf-meteor"));
  expect(await played(b)).toEqual([]);
  for (const p of [a, b, tv]) await expect(p.page.locator(".roundboard .world-tag.wt-meteor text")).toHaveText("陨石坑");
  await expect(a.page.locator(".roundboard .crater")).toHaveCount(1);
  // The big screen's side says what it does and for how long.
  await expect(tv.page.locator(".tv-now .world-banner h3")).toHaveText("陨石坠落");
  await expect(tv.page.locator(".tv-now .world-banner .pass-strip")).toContainText(/还有 \d 轮|最后一轮/);

  // A tap puts the phone's card away; it goes by itself on the others (the next one, the crisis, may
  // follow soon: here they come every 5 s).
  await card.getByRole("button", { name: "知道了" }).click();
  await expect(a.page.locator(".world-card h2", { hasText: "陨石坠落" })).toHaveCount(0);
  await expect(tv.page.locator(".world-card h2", { hasText: "陨石坠落" })).toHaveCount(0, { timeout: 10_000 });
  expect([...a.errors, ...b.errors, ...tv.errors]).toEqual([]);
});

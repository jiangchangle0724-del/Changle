// Party forfeits hold the game. With party mode on, the first team throws three doubles and goes to
// Immigration; its forfeit comes up as a notice on both phones and the big screen, the other team
// can't move meanwhile, and play goes on only when the team doing it taps Done (a real tap).
import { devices, expect, test } from "@playwright/test";
import { closeAll, createRoom, joinWithTeam, newPhone, tap, track, watch, type Phone } from "./phones";

test.afterEach(closeAll);

test("派对惩罚：游戏停下来，等做惩罚的队点「做完了」才继续（手机和大屏）", async ({ browser, request, contextOptions }) => {
  test.setTimeout(180_000);
  // three doubles for whoever throws first, then ordinary throws
  const code = await createRoom(request, { test: { speed: 0.3, dice: [1, 1, 2, 2, 3, 3, 2, 5, 4, 1, 6, 3] } });
  const tvCtx = await browser.newContext({ ...contextOptions, viewport: { width: 1600, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, locale: "zh-CN" });
  track(tvCtx);
  const tv: Phone = { name: "大屏", ctx: tvCtx, page: await tvCtx.newPage(), errors: [], log: [], taps: 0 };
  watch(tv, tv.page);
  await tv.page.goto(`/trip/tv/${code}`);
  await expect(tv.page.locator(".lobby-tv")).toBeVisible({ timeout: 20_000 });
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  const phone = { ...iphone, viewport: { width: 390, height: 844 }, locale: "zh-CN" };
  const a = await newPhone(browser, "甲", phone);
  const b = await newPhone(browser, "乙", phone);
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await a.page.getByRole("checkbox", { name: /派对惩罚/ }).check();
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(a.page.locator(".game")).toBeVisible();

  const hold = (p: Phone) => p.page.locator(".forfeit-hold");
  const until = Date.now() + 120_000;
  while (Date.now() < until && !(await hold(a).count())) {
    await tap(a);
    await tap(b);
    await a.page.waitForTimeout(150);
  }
  for (const p of [a, b, tv]) await expect(hold(p), `${p.name} shows the forfeit`).toBeVisible({ timeout: 8000 });
  await expect(tv.page.locator(".forfeit-hold .forfeit-dare")).not.toBeEmpty();
  const doer = (await a.page.locator(".forfeit-acts .haptic-btn").count()) ? a : b;
  const other = doer === a ? b : a;
  await expect(doer.page.locator(".forfeit-acts .haptic-btn")).toHaveText("做完了");
  await expect(other.page.locator(".forfeit-acts .haptic-btn")).toHaveCount(0);
  await expect(other.page.locator(".forfeit-acts")).toContainText("游戏暂停中");
  await expect(tv.page.locator(".forfeit-acts .btn")).toHaveCount(0);
  await doer.page.waitForTimeout(700);
  await doer.page.screenshot({ path: "test-results/forfeit-doer.png" });
  await other.page.screenshot({ path: "test-results/forfeit-other.png" });
  await tv.page.screenshot({ path: "test-results/forfeit-tv.png" });

  // Nothing moves while it's up, however long it takes and whoever tries.
  const feed = () => tv.page.locator(".feed li").allInnerTexts();
  const before = await feed();
  for (let i = 0; i < 12; i++) {
    await tap(other);
    await tap(doer, { skip: [] });
    await other.page.waitForTimeout(400);
  }
  await expect(hold(other)).toBeVisible();
  expect(await feed(), "the game stood still").toEqual(before);

  // The team taps Done: the notice goes everywhere, and play goes on.
  await doer.page.locator(".forfeit-acts .haptic-btn").click();
  for (const p of [a, b, tv]) await expect(hold(p), `${p.name} lets the game go on`).toHaveCount(0, { timeout: 8000 });
  await expect(tv.page.locator(".feed li").filter({ hasText: "做完了惩罚" })).toHaveCount(1);
  const after = Date.now() + 60_000;
  let moved = false;
  while (Date.now() < after && !moved) {
    await tap(a);
    await tap(b);
    await a.page.waitForTimeout(200);
    moved = (await feed()).join("\n") !== before.join("\n");
  }
  expect(moved, "the game went on").toBe(true);
  for (const p of [a, b, tv]) expect(p.errors, `${p.name}: page errors`).toEqual([]);
});

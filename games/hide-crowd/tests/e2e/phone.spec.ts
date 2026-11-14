// One phone: practice against the computer (it opens on the four places to pick from), the screens a
// phone shows (sideways: an upright phone is asked to turn), and an iPhone's ways to full screen (hide
// Safari's toolbar, or the Home Screen).
import { expect } from "@playwright/test";
import { bigTargets, newRoom, noErrors, noSideScroll, phone, shot, test, until } from "./helpers";

test("practice: pick a place, then one phone against three computer rivals hidden in the crowd", async ({ browser }) => {
  const me = await phone(browser, "Steve");
  await me.goto("/hide/practice?flat=1");
  // it opens on the four places, and waits
  await expect(me.getByRole("heading", { name: "选个地方练手" })).toBeVisible();
  await expect(me.locator(".pick-option")).toHaveCount(4);
  await expect(me.locator(".practice-pick .hint")).toContainText("一局 3 分钟，先到 5 分的赢");
  await until(me, (v) => v.phase === "lobby" && v.players.length === 4);
  await noSideScroll(me);
  await bigTargets(me);
  await shot(me, "phone-practice-pick");
  await me.getByRole("button", { name: /温哥华海堤公园/ }).click();
  await expect(me.locator(".play")).toBeVisible();
  await until(me, (v) => v.phase === "playing" && v.players.length === 4 && !!v.game?.me && v.game.arena === "plaza");
  await expect(me.locator(".hud-clock")).toHaveText(/^[23]:\d\d$/);
  await expect(me.locator(".controls .move-punch")).toBeVisible();
  await me.getByRole("button", { name: "出拳" }).dispatchEvent("pointerdown");
  await noSideScroll(me);
  // the seawall's ferry horn: the whole crowd stops, and the phone says so
  const arena = (await me.locator(".hud-what strong").textContent()) ?? "";
  if (arena.includes("海堤")) await expect(me.locator(".moment-banner")).toContainText("渡轮鸣笛", { timeout: 15_000 });
  noErrors(me);
});

test("held upright, a phone is asked to turn sideways, and the round carries on underneath", async ({ browser }) => {
  const kev = await phone(browser, "Kev", "zh", { size: { width: 390, height: 844 } });
  await kev.goto("/hide/practice?arena=plaza&flat=1");
  test.skip(!(await kev.evaluate(() => matchMedia("(pointer: coarse)").matches)), "this browser doesn't call itself a touch screen");
  await expect(kev.locator(".turn-layer")).toBeVisible();
  await expect(kev.locator(".turn-title")).toHaveText("横过来玩");
  await until(kev, (v) => v.phase === "playing" && !!v.game?.me);
  await expect(kev.locator("main.room-play")).toHaveAttribute("inert", "");
  await shot(kev, "phone-upright-turn");
  await kev.setViewportSize({ width: 844, height: 390 });
  await expect(kev.locator(".turn-layer")).toHaveCount(0);
  await expect(kev.locator(".controls .move-punch")).toBeVisible();
  noErrors(kev);
});

test("sideways: nothing scrolls sideways, every button is big enough, a double tap never zooms", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { roundMs: 60_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia", "en");
  await steve.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  await mia.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".chips")).toContainText("Mia");
  await noSideScroll(steve);
  await noSideScroll(mia);
  await bigTargets(steve);
  await bigTargets(mia);
  await shot(mia, "phone-lobby-sideways");
  await steve.getByRole("button", { name: "开始" }).click();
  await until(mia, (v) => v.phase === "playing");
  await expect(mia.locator(".controls")).toBeVisible();
  await steve.waitForTimeout(1_500);
  await noSideScroll(steve);
  await noSideScroll(mia);
  await bigTargets(steve);
  await bigTargets(mia);
  await shot(steve, "phone-round-zh");
  await shot(mia, "phone-round-sideways");
  // a quick second tap on Punch (its move not back yet) still lands on the button, which keeps it from the browser
  const punch = steve.locator(".controls .move-punch");
  await punch.tap();
  await expect(punch).toHaveAttribute("aria-disabled", "true");
  await punch.tap({ force: true });
  expect(await punch.evaluate((button) => (button as HTMLButtonElement).disabled)).toBe(false);
  const touch = await steve.evaluate(() => [".play-arena", ".move-punch"].map((selector) => getComputedStyle(document.querySelector(selector)!).touchAction).join(" "));
  expect(touch).toBe("none none");
  expect(await steve.evaluate(() => visualViewport?.scale ?? 1)).toBe(1);
  // the menu: the language switches in place
  await mia.getByRole("button", { name: "More" }).first().click();
  await mia.getByRole("button", { name: "中文" }).click();
  await expect(mia.locator(".sheet-title")).toHaveText("更多");
  await mia.keyboard.press("Escape");
  await expect(mia.locator(".sheet")).toHaveCount(0);
  noErrors(steve, mia);
});

test("the penalty stamp fits a phone held sideways, Continue in reach", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { duel: true, roundMs: 8_000 } });
  const steve = await phone(browser, "Steve", "zh", { size: { width: 740, height: 360 } });
  const mia = await phone(browser, "Mia", "en");
  await steve.goto(`/hide/r/${code}?flat=1`);
  await mia.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".chips")).toContainText("Mia");
  await steve.getByRole("button", { name: "开始" }).click();
  await until(mia, (v) => v.phase === "playing");
  await steve.getByRole("button", { name: "出拳" }).dispatchEvent("pointerdown");
  for (const [page, button] of [[steve, "继续"], [mia, "Continue"]] as const) {
    await expect(page.locator("dialog.stamp .stamp-seal")).toBeVisible({ timeout: 20_000 });
    // (after the slam)
    await page.waitForTimeout(1_200);
    const size = page.viewportSize()!;
    for (const part of [page.locator("dialog.stamp .stamp-seal"), page.locator("dialog.stamp .stamp-names"), page.getByRole("button", { name: button })]) {
      const box = (await part.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    }
    await noSideScroll(page);
  }
  noErrors(steve, mia);
});

test("an iPhone in Safari is shown, once by itself, how to play full screen: hide the toolbar, or the Home Screen", async ({ browser, request }) => {
  const code = await newRoom(request);
  const steve = await phone(browser, "Steve", "zh", { iphone: true });
  const mia = await phone(browser, "Mia", "en", { android: true });
  await steve.goto(`/hide/r/${code}?flat=1`);
  await mia.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  // by itself, the first time: the quickest way (Safari's page menu), then the four taps to the Home Screen, acted out
  await expect(steve.locator(".sheet-title")).toHaveText("iPhone 上全屏玩");
  await expect(steve.locator(".home-way")).toHaveCount(2);
  await expect(steve.locator(".home-quick")).toContainText("隐藏工具栏");
  await expect(steve.locator(".home-step")).toHaveCount(4);
  await expect(steve.locator(".mini-phone")).toBeVisible();
  await steve.waitForTimeout(2_800);
  await shot(steve, "phone-home-guide");
  await bigTargets(steve);
  await steve.getByRole("button", { name: "知道了" }).click();
  await expect(steve.locator(".sheet")).toHaveCount(0);
  // (the closed sheet takes back its step in the history first)
  await expect.poll(() => steve.evaluate(() => (history.state as { hcSheet?: string } | null)?.hcSheet ?? null)).toBeNull();
  // not by itself again; the lobby's line and the menu bring it back
  await steve.reload();
  await expect(steve.locator(".lobby")).toBeVisible();
  await steve.waitForTimeout(1_500);
  await expect(steve.locator(".sheet")).toHaveCount(0);
  await steve.getByRole("button", { name: "怎么做" }).click();
  await expect(steve.locator(".sheet-title")).toHaveText("iPhone 上全屏玩");
  await steve.keyboard.press("Escape");
  await expect(steve.locator(".sheet")).toHaveCount(0);
  await steve.getByRole("button", { name: "更多" }).first().click();
  await steve.getByRole("button", { name: "iPhone 上全屏玩" }).click();
  await expect(steve.locator(".home-guide")).toBeVisible();
  // a phone that isn't an iPhone has none of it
  await expect(mia.locator(".lobby")).toBeVisible();
  await expect(mia.getByText("Show me")).toHaveCount(0);
  noErrors(steve, mia);
});

test("in a round on an iPhone, while Safari's bars take part of the screen, a line says how to hide them", async ({ browser }) => {
  // an iPhone 15 held sideways in Safari: 393 points of screen, 283 left under the toolbar and the tab bar
  const steve = await phone(browser, "Steve", "zh", { iphone: true, size: { width: 852, height: 283 }, screen: { width: 393, height: 852 } });
  await steve.goto("/hide/practice?arena=plaza&flat=1");
  await until(steve, (v) => v.phase === "playing" && !!v.game?.me);
  const hint = steve.locator(".bars-hint");
  await expect(hint).toContainText("隐藏工具栏");
  await expect(hint.locator(".icon")).toHaveCount(2);
  await bigTargets(steve);
  await noSideScroll(steve);
  await shot(steve, "phone-bars-hint");
  // more ways: the whole guide
  await hint.getByRole("button", { name: "更多办法" }).click();
  await expect(steve.locator(".sheet-title")).toHaveText("iPhone 上全屏玩");
  await steve.keyboard.press("Escape");
  await expect(steve.locator(".sheet")).toHaveCount(0);
  // closed for good: not in the next round either
  await hint.getByRole("button", { name: "知道了" }).click();
  await expect(steve.locator(".bars-hint")).toHaveCount(0);
  await steve.reload();
  await until(steve, (v) => v.phase === "playing" && !!v.game?.me);
  await steve.waitForTimeout(800);
  await expect(steve.locator(".bars-hint")).toHaveCount(0);
  // with the bars hidden (the whole screen's height), there's nothing to say
  const full = await phone(browser, "Mia", "zh", { iphone: true, size: { width: 852, height: 393 }, screen: { width: 393, height: 852 } });
  await full.goto("/hide/practice?arena=plaza&flat=1");
  await until(full, (v) => v.phase === "playing" && !!v.game?.me);
  await full.waitForTimeout(800);
  await expect(full.locator(".bars-hint")).toHaveCount(0);
  noErrors(steve, full);
});

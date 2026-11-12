// One phone: practice against the computer, the screens a phone shows (sideways: an upright phone is
// asked to turn), and an iPhone's Home Screen guide.
import { expect, test } from "@playwright/test";
import { bigTargets, newRoom, noErrors, noSideScroll, phone, shot, until } from "./helpers";

test("practice: one phone against three computer rivals hidden in the crowd", async ({ browser }) => {
  const me = await phone(browser, "Steve");
  await me.goto("/hide/practice?flat=1");
  await expect(me.locator(".play")).toBeVisible();
  await until(me, (v) => v.phase === "playing" && v.players.length === 4 && !!v.game?.me);
  await expect(me.locator(".controls .move-punch")).toBeVisible();
  await me.getByRole("button", { name: "出拳" }).dispatchEvent("pointerdown");
  await noSideScroll(me);
  noErrors(me);
});

test("held upright, a phone is asked to turn sideways, and the round carries on underneath", async ({ browser }) => {
  const kev = await phone(browser, "Kev", "zh", { size: { width: 390, height: 844 } });
  await kev.goto("/hide/practice?flat=1");
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

test("an iPhone in Safari is shown, once by itself, how to put changle.ca on the Home Screen", async ({ browser, request }) => {
  const code = await newRoom(request);
  const steve = await phone(browser, "Steve", "zh", { iphone: true });
  const mia = await phone(browser, "Mia", "en", { android: true });
  await steve.goto(`/hide/r/${code}?flat=1`);
  await mia.goto(`/hide/r/${code}?flat=1`);
  await expect(steve.locator(".lobby")).toBeVisible();
  // by itself, the first time: the four taps, acted out
  await expect(steve.locator(".sheet-title")).toHaveText("加到主屏幕，全屏玩");
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
  await steve.getByRole("button", { name: "怎么加" }).click();
  await expect(steve.locator(".sheet-title")).toHaveText("加到主屏幕，全屏玩");
  await steve.keyboard.press("Escape");
  await expect(steve.locator(".sheet")).toHaveCount(0);
  await steve.getByRole("button", { name: "更多" }).first().click();
  await steve.getByRole("button", { name: "加到主屏幕，全屏玩" }).click();
  await expect(steve.locator(".home-guide")).toBeVisible();
  // a phone that isn't an iPhone has none of it
  await expect(mia.locator(".lobby")).toBeVisible();
  await expect(mia.getByText("Show me")).toHaveCount(0);
  noErrors(steve, mia);
});

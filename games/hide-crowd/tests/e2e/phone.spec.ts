// One phone: practice against the computer, and the screens a phone shows, upright and sideways.
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

test("a phone upright and sideways: nothing scrolls sideways, every button is big enough", async ({ browser, request }) => {
  const code = await newRoom(request, { test: { roundMs: 60_000 } });
  const steve = await phone(browser, "Steve");
  const mia = await phone(browser, "Mia", "en", { size: { width: 844, height: 390 } });
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
  await shot(steve, "phone-round-upright");
  await shot(mia, "phone-round-sideways");
  // the menu: the language switches in place
  await mia.getByRole("button", { name: "More" }).first().click();
  await mia.getByRole("button", { name: "中文" }).click();
  await expect(mia.locator(".sheet-title")).toHaveText("更多");
  await mia.keyboard.press("Escape");
  await expect(mia.locator(".sheet")).toHaveCount(0);
  noErrors(steve, mia);
});

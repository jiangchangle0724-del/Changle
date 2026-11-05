// The one-phone demo (/trip/demo): the whole room runs in the page, and one device plays every team
// of people. Rio's samba there: the ready card waits for Start for as long as it takes (a room of
// phones starts it by itself after a minute; here nobody else is kept waiting), then the countdown,
// the lesson, and the computer teams' scores.
import { devices, expect, test } from "@playwright/test";
import { TIMING } from "../../src/room/protocol";
import { closeAll, newPhone } from "./phones";

test.afterEach(closeAll);

const ROLL = '.decide[data-kind="roll"]:not(.waiting) .btn.primary:not(.off)';
/** The demo's clocks, as a test sets them (`window.__demoTest`). */
const SPEED = 0.3;

test("一台手机：落到里约说跳，准备卡一直等开始键；按了倒数，老师教完，电脑队打分", async ({ browser }) => {
  test.setTimeout(150_000);
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];
  const p = await newPhone(browser, "一台", { ...iphone, locale: "zh-CN" });
  // Our team is made first, so it throws first: 4 + 5 from Departure, Rio.
  await p.ctx.addInitScript(`window.__demoTest = { dice: [4, 5], speed: ${SPEED} };`);
  await p.page.goto("/trip/demo");
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(p.page.locator(".game")).toBeVisible({ timeout: 15_000 });
  await p.page.locator(ROLL).click({ timeout: 15_000 });
  const yes = p.page.locator('.decide[data-kind="dance"]:not(.waiting) .btn.primary:not(.off)');
  await expect(yes).toBeVisible({ timeout: 15_000 });
  await yes.click();

  const card = p.page.locator(".samba.samba-full.ready");
  await expect(card).toBeVisible({ timeout: 5_000 });
  await expect(card.locator(".samba-cue")).toHaveText("准备跳桑巴");
  await expect(card.locator(".haptic-btn")).toHaveText("开始");
  // Well past the minute after which a room of phones starts it by itself: still the card, and no
  // countdown to a start of its own on it.
  await p.page.waitForTimeout(TIMING.danceReady * SPEED + 3_000);
  await expect(p.page.locator(".samba")).toHaveAttribute("data-phase", "ready");
  await expect(card).not.toContainText("自动开始");

  await card.locator(".haptic-btn").click();
  await expect(p.page.locator(".samba"), "the countdown, then the lesson").toHaveAttribute("data-phase", "dance", { timeout: 8_000 });
  // One teacher on the one phone: the judges' small one isn't running under the full screen.
  await expect(p.page.locator(".samba")).toHaveCount(1);
  await expect(p.page.locator(".samba-small")).toHaveCount(0);
  // The lesson plays out, the computer teams score it, and the team is asked whether to buy Rio.
  await expect(p.page.locator('.decide[data-kind="buy"]:not(.waiting)')).toBeVisible({ timeout: (TIMING.dance + TIMING.vote) * SPEED + 15_000 });
  await expect(p.page.locator(".samba")).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

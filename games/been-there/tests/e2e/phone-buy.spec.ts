// On a phone, the buy question has to be answerable with a real tap: the button in sight when the
// window comes up (not under the arrival card, where nobody scrolls to find it), and nothing on top
// of it. (The other tests answer by clicking in the page's script, which reaches a button even when
// a person couldn't.) Played on an iPhone 13, the small iPhone SE, and an iPhone held sideways.
import { devices, expect, test } from "@playwright/test";
import { closeAll, createRoom, joinWithTeam, newPhone, quizOff, tap } from "./phones";

test.afterEach(closeAll);

for (const [label, device] of [
  ["iPhone 13", devices["iPhone 13"]],
  ["iPhone SE", devices["iPhone SE"]],
  ["iPhone 13 横屏", devices["iPhone 13 landscape"]],
] as const) {
  test(`手机上能真的点到「买下」（${label}）`, async ({ browser, request }) => {
    test.setTimeout(240_000);
    const { defaultBrowserType: _ignored, ...opts } = device;
    const code = await createRoom(request, { mode: 60, test: { speed: 0.3 } });
    const a = await newPhone(browser, "买", { ...opts, locale: "zh-CN" });
    const b = await newPhone(browser, "看", { ...opts, locale: "zh-CN" });
    await joinWithTeam(a, code);
    await joinWithTeam(b, code);
    await quizOff(a);
    await a.page.getByRole("button", { name: "开始", exact: true }).click();
    await expect(a.page.locator(".game")).toBeVisible();
    // play along (never answering a buy question for us) until phone A is asked to buy. Phone A
    // never bids in an auction: on GitHub it once spent all its cash there, could afford no city of
    // its own, and went broke before it was asked.
    const buy = a.page.locator('.decide[data-kind="buy"] .btn.primary');
    const until = Date.now() + 200_000;
    let asked = false;
    while (Date.now() < until && !asked) {
      if (await a.page.locator('.decide[data-kind="buy"] .btn.primary:not(.off)').count()) {
        asked = true;
        break;
      }
      // (a city A can't afford: pass on it, and wait for the next one)
      const broke = await a.page.locator('.decide[data-kind="buy"] .btn.primary.off').count();
      await tap(a, broke ? { declineBuys: true, bid: 0 } : { skip: ["buy"], bid: 0 });
      await tap(b, { declineBuys: true });
      await a.page.waitForTimeout(150);
    }
    expect(asked, "phone A was asked whether to buy").toBe(true);
    // the window comes up once the ride has landed
    await expect(a.page.locator('.playwin[data-open="1"]')).toHaveCount(1, { timeout: 15_000 });
    await expect(buy).toBeVisible();
    // (a first landing in a city plays its scene over everything for a few seconds; a tap skips it)
    const scene = a.page.locator(".touchdown");
    // (it may fade or finish under the tap: then there's nothing left to skip)
    await scene
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => scene.click({ timeout: 2000 }))
      .catch(() => {});
    await expect(scene).toHaveCount(0, { timeout: 8000 });
    await a.page.waitForTimeout(500);
    // in sight as it is, without scrolling the window: inside the window's visible part and the screen
    const where = await a.page.evaluate(() => {
      const btn = document.querySelector('.decide[data-kind="buy"] .btn.primary')!.getBoundingClientRect();
      const body = document.querySelector(".playwin-body")!;
      const win = body.getBoundingClientRect();
      return { top: btn.top, bottom: btn.bottom, winTop: win.top, winBottom: win.bottom, scrolled: body.scrollTop, screen: innerHeight };
    });
    await a.page.screenshot({ path: `test-results/buy-${label.replace(/ /g, "")}.png` });
    expect(where.scrolled, "the window shows its top").toBe(0);
    expect(where.top, `the buy button starts inside the window (${JSON.stringify(where)})`).toBeGreaterThanOrEqual(where.winTop);
    expect(where.bottom, `the buy button ends inside the window (${JSON.stringify(where)})`).toBeLessThanOrEqual(where.winBottom);
    expect(where.bottom).toBeLessThanOrEqual(where.screen);
    // a person's tap: Playwright clicks only what is visible and not covered (the landing scene, if
    // it's still up, goes by itself or with a tap)
    await buy.click({ timeout: 8000 });
    await expect(a.page.locator('.decide[data-kind="buy"]')).toHaveCount(0, { timeout: 8000 });
  });
}

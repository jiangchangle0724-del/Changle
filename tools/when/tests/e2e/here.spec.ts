// 谁在看 (A3 item 6, 2026-11-18): the line at the top says who else has the page open right now;
// for a moment, that one of them has just filled in; and the best three slide to their new places
// (with the phone set to reduce motion, they just change places).
import { expect, test, type Page } from "@playwright/test";
import { at, cell, closePhones, join, make, phone, saved } from "./helpers";

test.afterEach(async ({ browser }) => {
  await closePhones(browser);
});

const line = (page: Page) => page.locator(".here");

/** As if the phone's screen went off or another app came to the front (`true`), and back. */
const hide = (page: Page, hidden: boolean) =>
  page.evaluate((hidden) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);

test("who else has the page open: as they come, give a name, fill in, look away, come back and leave", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "谁在看");
  await expect(line(host)).toHaveText("现在只有你在看");
  await expect(line(host)).not.toHaveAttribute("data-on");

  const guest = await phone(browser);
  await guest.goto(url);
  // the host hasn't given a name: the guest is told the host is here
  await expect(line(guest)).toHaveText("发起人也在看");
  await expect(line(guest)).toHaveAttribute("data-on", "");
  await expect(line(host)).toHaveText("还有 1 个人在看");
  await expect(line(host)).toHaveAttribute("data-on", "");

  await guest.fill(".name-form input", "甲");
  await guest.click(".name-form .btn");
  await expect(line(host)).toHaveText("甲 也在看");

  // 甲 taps two slots and stops: a moment later the host's page says so, with a tick, and then
  // goes back to who's here. Her own page says nothing about her.
  await cell(guest, at(0, "eve")).click();
  await cell(guest, at(0, "noon")).click();
  await saved(guest);
  await expect(line(host)).toHaveText("甲 填好了", { timeout: 8000 });
  await expect(line(host).locator("svg")).toBeVisible();
  await expect(line(guest)).toHaveText("发起人也在看");
  await expect(line(host)).toHaveText("甲 也在看", { timeout: 8000 });

  // her screen goes off: she has gone; back on: she's here again, without reloading
  await hide(guest, true);
  await expect(line(host)).toHaveText("现在只有你在看");
  await hide(guest, false);
  await expect(line(host)).toHaveText("甲 也在看");

  // the host gives a name (the page opens again); then the guest closes hers
  await join(host, url, "Steve");
  await expect(line(guest)).toHaveText("Steve 也在看");
  await expect(line(host)).toHaveText("甲 也在看");
  await guest.close();
  await expect(line(host)).toHaveText("现在只有你在看");
});

test("in English; a phone that can't keep a live connection still sees who's here, but isn't seen", async ({ browser }) => {
  const host = await phone(browser);
  const { url } = await make(host, "Who's here");
  await host.click(".bar-lang");
  await expect(line(host)).toHaveText("Just you here right now");

  const guest = await phone(browser);
  await join(guest, url, "Jason");
  await expect(line(host)).toHaveText("Jason is here too");
  await cell(guest, at(1, "eve")).click();
  await saved(guest);
  await expect(line(host)).toHaveText("Jason has filled in", { timeout: 8000 });

  // every WebSocket refused: the page asks every ten seconds instead, and is told who's here
  const blocked = await phone(browser);
  await blocked.routeWebSocket(/.*/, (socket) => socket.close());
  await blocked.goto(url);
  await expect(line(blocked)).toHaveText("发起人、Jason 也在看");
  await expect(line(host)).toHaveText("Jason is here too");
});

test("the best three slide to their new places; with less motion they just change places", async ({ browser }) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    const host = await phone(browser, { reducedMotion });
    // count what the page sets moving in the best three
    await host.addInitScript(() => {
      const w = window as unknown as { moves: string[] };
      w.moves = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, ...args: Parameters<Element["animate"]>) {
        if (this.closest(".best")) w.moves.push((this as HTMLElement).dataset.key ?? "");
        return animate.apply(this, args);
      };
    });
    const { url } = await make(host, reducedMotion === "reduce" ? "少动一点" : "换位");
    await join(host, url, "Steve");
    await cell(host, at(1, "eve")).click();
    await expect(host.locator(".best li")).toHaveCount(1);
    // the day before, just as good, goes first: it rises in, and the other slides down
    await cell(host, at(0, "eve")).click();
    await expect(host.locator(".best li")).toHaveCount(2);
    const [first, second] = await host.locator(".best li").evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.key));
    expect(first! < second!, "the earlier day first").toBe(true);
    if (reducedMotion === "reduce") {
      await host.waitForTimeout(500);
      expect(await host.evaluate(() => (window as unknown as { moves: string[] }).moves)).toEqual([]);
    } else {
      await expect.poll(() => host.evaluate(() => (window as unknown as { moves: string[] }).moves.sort())).toEqual([first, second].sort());
    }
    await saved(host);
  }
});

// The phone as a controller: shaking it rolls the dice, a quick double tap answers once (and its
// second half can't answer the question that comes up next), and a sideways swipe moves between tabs.
// (The shake is played into the page as motion events.)
import { expect, test } from "@playwright/test";
import { createRoom, explain, joinWithTeam, newPhone, tap } from "./phones";

test("手机当手柄：摇一摇掷骰子，连点只算一次，左右滑动换页", async ({ browser, browserName, request, contextOptions }) => {
  test.setTimeout(150_000);
  const code = await createRoom(request, { mode: 60, test: { speed: 0.3 } });
  const p = await newPhone(browser, "摇", contextOptions);
  // The yes a person gives when the phone asks about motion (where this browser knows the question).
  await p.ctx.grantPermissions(["accelerometer", "gyroscope"]).catch(() => {});
  // Every answer the phone sends, by question number.
  const answers: number[] = [];
  p.page.on("websocket", (ws) =>
    ws.on("framesent", (f) => {
      const m = JSON.parse(String(f.payload));
      if (m.t === "act") answers.push(m.d);
    }),
  );
  // Each question of ours as it comes up: would a tap reach its buttons straight away?
  await p.page.addInitScript(() => {
    const w = window as unknown as { fresh: string[] };
    w.fresh = [];
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const panel = n.matches(".decide[data-kind]") ? n : n.querySelector(".decide[data-kind]");
          const b = panel?.querySelector("button");
          if (b) w.fresh.push(getComputedStyle(b).pointerEvents);
        }
    }).observe(document, { childList: true, subtree: true });
  });
  await joinWithTeam(p, code);
  await p.page.getByRole("button", { name: "加一个电脑队" }).click();
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(p.page.locator(".game")).toBeVisible();
  const tab = (name: string) => p.page.locator("nav.tabs").getByRole("button", { name });
  // Our throws so far, counted in the full log.
  const throws = async () => {
    await tab("记录").click();
    const n = await p.page.locator(".p-log .feed li", { hasText: "摇 掷出" }).count();
    await tab("行动").click();
    return n;
  };
  const roll = p.page.locator('.decide[data-kind="roll"]');
  // Play along (buy, end the turn…) until our roll is up again.
  const untilRoll = async () => {
    for (const end = Date.now() + 40_000; Date.now() < end; ) {
      if (await roll.count()) return;
      if (!(await tap(p))) await p.page.waitForTimeout(150);
    }
    await explain(p, "no roll");
    throw new Error("our roll never came up");
  };

  // Shake to roll: turn shaking on where the phone asks first (as an iPhone does, and this browser
  // too), then a shake: four firm jolts. A browser that can't feel motion offers no shaking at all.
  await untilRoll();
  const hint = roll.locator(".shake-hint");
  const enable = roll.getByRole("button", { name: /开启摇一摇/ });
  if (!(await p.page.evaluate(() => "DeviceMotionEvent" in window && "ontouchstart" in window))) {
    await expect(hint).toHaveCount(0);
    await expect(enable).toHaveCount(0);
  } else {
    if (await enable.count()) await enable.click();
    // Chromium (Android's engine) says yes here; another engine's test build may say no, which
    // leaves the button for another try.
    await expect(browserName === "chromium" ? hint : hint.or(enable)).toBeVisible();
    if (await hint.count()) {
      const before = await throws();
      await p.page.waitForTimeout(150);
      // (Each reading is made by hand: WebKit, iPhone's engine, won't let a page build a DeviceMotionEvent.)
      await p.page.evaluate(async () => {
        for (let i = 0; i < 4; i++) {
          const e = new Event("devicemotion");
          Object.defineProperties(e, { acceleration: { value: { x: 22, y: 4, z: 0 } }, accelerationIncludingGravity: { value: { x: 22, y: 13, z: 0 } } });
          window.dispatchEvent(e);
          await new Promise((r) => setTimeout(r, 80));
        }
      });
      await expect.poll(throws, { timeout: 5_000 }).toBeGreaterThan(before);
    }
  }

  // A double tap on 掷骰子 sends one answer, not a second one that would come back "too late".
  await untilRoll();
  const sent = answers.length;
  await roll.locator(".btn.primary").dblclick();
  await p.page.waitForTimeout(800);
  expect(answers.slice(sent)).toHaveLength(1);
  // And every question so far (one more turn's worth too) came up taking no taps for its first
  // moment, so the second half of a double tap can't answer it.
  await untilRoll();
  const fresh = await p.page.evaluate(() => (window as unknown as { fresh: string[] }).fresh);
  expect(fresh.length).toBeGreaterThanOrEqual(3);
  expect(fresh.filter((x) => x !== "none")).toEqual([]);

  // A sideways swipe on the page goes to the next tab, and back. (The finger's touches are made by
  // hand: not every browser lets a page build real ones.)
  const swipe = (from: number, to: number) =>
    p.page.evaluate(
      ([from, to]) => {
        const panes = document.querySelector(".panes")!;
        const touch = (type: string, x: number, down: boolean) => {
          const e = new Event(type, { bubbles: true });
          const at = [{ identifier: 1, target: panes, clientX: x, clientY: 400 }];
          Object.defineProperties(e, { touches: { value: down ? at : [] }, changedTouches: { value: at } });
          panes.dispatchEvent(e);
        };
        touch("touchstart", from, true);
        touch("touchend", to, false);
      },
      [from, to],
    );
  await swipe(320, 120);
  await expect(tab("棋盘")).toHaveAttribute("aria-pressed", "true");
  await swipe(120, 320);
  await expect(tab("行动")).toHaveAttribute("aria-pressed", "true");
  expect(p.errors).toEqual([]);
});

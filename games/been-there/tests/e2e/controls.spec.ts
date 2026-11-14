// The phone as a controller: shaking it rolls the dice, a quick double tap answers once (and its
// second half can't answer the question that comes up next), and the play window over the board
// comes up for our move and goes away with the bar's button or a flick down.
// (The shake is played into the page as motion events.)
import { expect, test } from "@playwright/test";
import { closeAll, createRoom, explain, joinWithTeam, newPhone, quizOff, tap } from "./phones";

test.afterEach(closeAll);

test("手机当手柄：摇一摇掷骰子，连点只算一次，行动窗口收起和打开", async ({ browser, browserName, request, contextOptions }) => {
  test.setTimeout(150_000);
  const code = await createRoom(request, { mode: 60, test: { speed: 0.3 } });
  const p = await newPhone(browser, "摇", contextOptions);
  // The yes a person gives when the phone asks about motion (where this browser knows the question).
  await p.ctx.grantPermissions(["accelerometer", "gyroscope"]).catch(() => {});
  // Every answer the phone sends, by question number; and our throws, as the server reports them
  // (counted from its messages, not by visiting the log: a touchdown scene covers the tabs for a while).
  const answers: number[] = [];
  const rolls = new Set<number>();
  p.page.on("websocket", (ws) => {
    ws.on("framesent", (f) => {
      const m = JSON.parse(String(f.payload));
      if (m.t === "act") answers.push(m.d);
    });
    ws.on("framereceived", (f) => {
      const m = JSON.parse(String(f.payload));
      if (m.t !== "view") return;
      for (const x of m.view.feed) if (x.t === "game" && x.e.t === "roll" && m.view.you.seats.includes(x.e.p)) rolls.add(x.id);
    });
  });
  const throws = () => rolls.size;
  // Each question of ours as it comes up: would a tap reach its buttons straight away?
  await p.page.addInitScript(() => {
    const w = window as unknown as { fresh: string[] };
    w.fresh = [];
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          const panel = n.matches(".decide[data-kind]") ? n : n.querySelector(".decide[data-kind]");
          // (a button, or the label round a hidden switch that taps back on an iPhone)
          const b = panel?.querySelector(".btn");
          if (b) w.fresh.push(getComputedStyle(b).pointerEvents);
        }
    }).observe(document, { childList: true, subtree: true });
  });
  await joinWithTeam(p, code);
  await p.page.getByRole("button", { name: "加一个电脑队" }).click();
  await quizOff(p);
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(p.page.locator(".game")).toBeVisible();
  const tab = (name: string) => p.page.locator("nav.tabs").getByRole("button", { name });
  const roll = p.page.locator('.decide[data-kind="roll"]');
  // Play along (buy, end the turn…) until our roll is up again, never pressing 掷骰子 ourselves.
  const untilRoll = async () => {
    for (const end = Date.now() + 40_000; Date.now() < end; ) {
      if (await roll.count()) return;
      if (!(await tap(p, { skip: ["roll"] }))) await p.page.waitForTimeout(150);
    }
    await explain(p, "no roll");
    throw new Error("our roll never came up");
  };

  // Shake to roll: turn shaking on where the phone asks first (as an iPhone does, and this browser
  // too), then a shake: four firm jolts. A browser that can't feel motion offers no shaking at all.
  await untilRoll();
  const hint = roll.locator(".shake-hint");
  const enable = roll.getByRole("button", { name: /开启摇一摇/ });
  // (where the phone said no: how to let it ask again)
  const help = roll.locator(".shake-no");
  if (!(await p.page.evaluate(() => "DeviceMotionEvent" in window && "ontouchstart" in window))) {
    await expect(hint).toHaveCount(0);
    await expect(enable).toHaveCount(0);
  } else {
    if (await enable.count()) await enable.click();
    // Chromium (Android's engine) says yes here (the yes given above comes back without a tap, so
    // shaking is on from the start); another engine's test build may say no, which shows how to
    // let it ask again.
    await expect(browserName === "chromium" ? hint : hint.or(enable).or(help)).toBeVisible();
    if (await hint.count()) {
      const before = throws();
      const asked = answers.length;
      // Four firm jolts, back to back. (Made by hand: WebKit, iPhone's engine, won't let a page build a
      // DeviceMotionEvent. And no timers in between, which a slow test browser may stretch.)
      const shake = () =>
        p.page.evaluate(() => {
          for (let i = 0; i < 4; i++) {
            const e = new Event("devicemotion");
            Object.defineProperties(e, { acceleration: { value: { x: 22, y: 4, z: 0 } }, accelerationIncludingGravity: { value: { x: 22, y: 13, z: 0 } } });
            window.dispatchEvent(e);
          }
        });
      // The page starts listening for motion just after it draws the hint (an effect, after paint): on
      // a busy test machine a shake that comes at once can come before it, so one that did nothing is
      // shaken again. (One that counted makes any more within 1.5 s count for nothing.)
      await expect
        .poll(
          async () => {
            if (answers.length === asked) await shake();
            return answers.length;
          },
          { message: "the shake sends a roll", timeout: 3_000, intervals: [300] },
        )
        .toBeGreaterThan(asked);
      await expect.poll(throws, { message: "the dice are thrown", timeout: 5_000 }).toBeGreaterThan(before);
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

  // The play window came up by itself for our roll. The bar's Play button puts it away and brings it
  // back, and a flick down on its header puts it away. (The finger's touches are made by hand: not
  // every browser lets a page build real ones.)
  const win = p.page.locator(".playwin");
  await expect(win).toHaveAttribute("data-open", "1");
  await tab("行动").click();
  await expect(win).toHaveAttribute("data-open", "0");
  await expect(tab("行动").locator(".badge")).toBeVisible();
  await tab("行动").click();
  await expect(win).toHaveAttribute("data-open", "1");
  await p.page.evaluate(() => {
    const head = document.querySelector(".playwin-head")!;
    const touch = (type: string, y: number, down: boolean) => {
      const e = new Event(type, { bubbles: true });
      const at = [{ identifier: 1, target: head, clientX: 200, clientY: y }];
      Object.defineProperties(e, { touches: { value: down ? at : [] }, changedTouches: { value: at } });
      head.dispatchEvent(e);
    };
    touch("touchstart", 300, true);
    touch("touchend", 400, false);
  });
  await expect(win).toHaveAttribute("data-open", "0");
  expect(p.errors).toEqual([]);
});

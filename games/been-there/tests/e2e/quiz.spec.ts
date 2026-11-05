// The waiting teams' quiz (抢答) on real screens. A landing on a city brings the teams waiting a question
// about that city (about eight minutes apart in a real game; in these test rooms, every such landing).
// It pops up at the top of the screen, in the same place every time, whole and tappable, on a phone's
// own turn and on the others'; a real tap answers it; 这题不答 sends it away; a phone never shows answers
// it can't give (the bug Steve saw: the team on turn when a question came up got three answers that did
// nothing). The host can turn it off in the lobby. Screenshots of each size go to test-results/quiz-*.png.
import { devices, expect, test, type Page } from "@playwright/test";
import { closeAll, createRoom, explain, fits, joinWithTeam, newPhone, tap, track, watch, type Phone } from "./phones";

test.afterEach(closeAll);

const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];

interface QuizBox {
  id: string;
  state: string;
  mine: string;
  top: number;
  bottom: number;
  left: number;
  right: number;
  w: number;
  h: number;
  /** The pop-up would need scrolling to show all of it. */
  scrolls: boolean;
  /** Buttons inside it that a tap at their middle wouldn't reach. */
  blocked: string[];
  options: number;
  myTurn: boolean;
  /** Seconds left on its countdown. */
  secs: number;
}

/** The pop-up on this phone, once it has settled: where it is, and whether all of it can be seen and tapped. */
async function quizBox(page: Page): Promise<QuizBox | null> {
  return page.evaluate(() => {
    const pop = document.querySelector<HTMLElement>(".quizpop:not(.settling)");
    if (!pop || pop.getAnimations().some((a) => a.playState === "running")) return null;
    const r = pop.getBoundingClientRect();
    const buttons = Array.from(pop.querySelectorAll<HTMLElement>("button"));
    const blocked = buttons
      .filter((b) => {
        const x = b.getBoundingClientRect();
        const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
        return !hit || !(hit === b || b.contains(hit));
      })
      .map((b) => b.textContent ?? "?");
    return {
      id: pop.dataset.id ?? "",
      state: pop.dataset.state ?? "",
      mine: pop.dataset.mine ?? "",
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      w: innerWidth,
      h: innerHeight,
      scrolls: pop.scrollHeight > pop.clientHeight + 1,
      blocked,
      options: pop.querySelectorAll("button.trivia-opt").length,
      myTurn: !!document.querySelector(".banner.me"),
      secs: Number(pop.querySelector(".countdown")?.textContent?.match(/\d+/)?.[0] ?? 0),
    };
  });
}

/**
 * After a real tap on an answer: the pop-up leaves the question (taps that do nothing were the bug),
 * and whether this team's answer is in. (It isn't if another team's right answer closed the question
 * a moment before.)
 */
async function answerTaken(p: Phone, id: string): Promise<boolean> {
  const state = () =>
    p.page.evaluate((id) => {
      const pop = document.querySelector<HTMLElement>(`.quizpop[data-id="${id}"]`);
      return pop ? `${pop.dataset.state}:${pop.dataset.mine}` : "gone";
    }, id);
  await expect.poll(state, { message: `${p.name}: the tap on an answer did something`, timeout: 3000 }).not.toMatch(/^ask:/);
  return /^(locked|reveal):\d/.test(await state());
}

/** All of it on the screen, at the top, nothing in the way. */
function expectWhole(box: QuizBox, label: string) {
  const where = `${label}: ${JSON.stringify(box)}`;
  expect(box.top, `at the top (${where})`).toBeGreaterThanOrEqual(0);
  expect(box.top, `at the top (${where})`).toBeLessThanOrEqual(16);
  expect(box.bottom, `its foot on the screen (${where})`).toBeLessThanOrEqual(box.h);
  expect(box.left, where).toBeGreaterThanOrEqual(0);
  expect(box.right, where).toBeLessThanOrEqual(box.w);
  expect(box.scrolls, `nothing to scroll to (${where})`).toBe(false);
  expect(box.blocked, `every button reachable (${where})`).toEqual([]);
}

/**
 * The answer and its fact on a phone that has answered the question `id`, once it closes: at once if
 * its answer was right, otherwise when every team is done with it or its time is up. Checked whole,
 * then kept as a screenshot. `meanwhile` runs while it waits. False if it never came.
 */
async function revealOn(p: Phone, id: string, meanwhile: () => Promise<void>): Promise<boolean> {
  for (const end = Date.now() + 20_000; Date.now() < end; ) {
    const box = await quizBox(p.page);
    if (box?.state === "reveal" && box.id === id) {
      expectWhole(box, "the answer and its fact");
      await expect(p.page.locator(".quizpop .trivia-fact")).toContainText("你知道吗");
      await p.page.screenshot({ path: "test-results/quiz-375x667-answer.png" });
      return true;
    }
    if (box && box.id !== id) return false;
    await meanwhile();
    await p.page.waitForTimeout(100);
  }
  return false;
}

/**
 * A phone never shows answers it can't give: the only answer buttons are the pop-up's, all of them
 * live; the card in the play window for a phone the question isn't for has none.
 */
async function noDeadAnswers(p: Phone) {
  const dead = await p.page
    .evaluate(() => ({
      disabled: document.querySelectorAll("button.trivia-opt:disabled").length,
      outside: document.querySelectorAll(".trivia:not(.quizpop) button, .playwin button.trivia-opt").length,
    }))
    .catch(() => ({ disabled: 0, outside: 0 }));
  expect(dead, `${p.name}: no answer buttons that do nothing`).toEqual({ disabled: 0, outside: 0 });
}

async function start(a: Phone) {
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(a.page.locator(".game")).toBeVisible();
}

test("抢答弹在屏幕最上面：别人的回合和自己的回合都整个看得见，真的点得到，「这题不答」能关掉（390x844）", async ({ browser, request }) => {
  test.setTimeout(240_000);
  // The teams sit in the order they were made and the first throws are known, so the test waits for
  // what it knows is coming, not for chance (every landing here is on a city with no rule to settle):
  //   甲 throws 5 + 6, to Istanbul. Its question is for 乙, on 甲's turn: 乙 answers with a real tap.
  //   乙 throws 5 + 6, to Istanbul. Its question is for 甲, who leaves it up; 乙 ends its turn at once, and
  //   the question is still up on 甲's own turn: 甲 answers it there.
  //   甲 throws 3 + 4, to Vancouver. Its question is for 乙, who taps 这题不答: it goes, and stays gone.
  // The team that landed keeps its turn open until the other phone has seen the question (it comes once
  // the move and the landing scene have played, 7.5 s after the throw at this room's speed). A question
  // that gets away (a busy phone, a tap that came too late) is let go: the next landing on a city
  // brings another, and the test takes that one.
  // (A real tap waits for the page to draw the button still twice, and GitHub's WebKit, drawing without
  // a graphics card, can take seconds over that: most at the start of a phone's own turn, as the edge
  // of the screen glows and the window comes up. So a tap only on a question with 3 seconds or more to
  // go, waiting no longer than it can still take an answer.)
  const code = await createRoom(request, { test: { speed: 0.75, triviaEvery: 0, inOrder: true, dice: [5, 6, 5, 6, 3, 4, 3, 4] } });
  const opts = { ...iphone, viewport: { width: 390, height: 844 }, locale: "zh-CN" };
  const a = await newPhone(browser, "甲", opts);
  const b = await newPhone(browser, "乙", opts);
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await start(a);
  const done = { others: false, own: false, skipped: false };
  const used = new Set<string>();
  const within = (secs: number) => Math.max(2000, (secs - 1.5) * 1000);
  const until = Date.now() + 200_000;
  const myTurn = async (p: Phone) => (await p.page.locator(".banner.me").count()) > 0;
  /** The pop-up on this phone, settled, while it can still be answered. */
  const asking = async (p: Phone) => {
    const box = await quizBox(p.page);
    return box?.state === "ask" ? box : null;
  };
  /** A real tap on the pop-up's first answer (Playwright taps only what's visible and not covered): whether it counted. */
  const answer = async (p: Phone, id: string) => {
    const now = await asking(p);
    if (!now || now.id !== id || now.secs < 3) return false;
    const tapped = await p.page
      .locator(`.quizpop[data-id="${id}"] button.trivia-opt`)
      .first()
      .click({ timeout: within(now.secs) })
      .then(() => true)
      .catch(() => false);
    return tapped && (await answerTaken(p, id));
  };
  /** The team on turn plays on until its turn is over (the other phone only answers what the table asks of it). */
  const endTurn = async (p: Phone, other: Phone) => {
    for (const end = Date.now() + 20_000; Date.now() < end && (await myTurn(p)); ) {
      await tap(p);
      await tap(other, { skip: ["roll"] });
      await p.page.waitForTimeout(100);
    }
  };
  /** No question on either phone any more, the answer's moment included: a landing while one is up brings none. */
  const cleared = async () => {
    for (const p of [a, b]) await p.page.waitForFunction(() => !document.querySelector(".quizpop, .trivia"), null, { timeout: 20_000 }).catch(() => {});
  };
  while (Date.now() < until && !(done.others && done.own && done.skipped)) {
    const lander = (await myTurn(a)) ? a : (await myTurn(b)) ? b : null;
    if (!lander) {
      await a.page.waitForTimeout(150);
      continue;
    }
    const waiter = lander === a ? b : a;
    // The team on turn throws and settles what its landing asks, but keeps its turn open, until the
    // other phone has the landing's question (or long enough for one to have come: not every space is a city).
    let box: QuizBox | null = null;
    let thrown = 0;
    while (Date.now() < until) {
      for (const p of [a, b]) await noDeadAnswers(p);
      if ((await tap(lander, { skip: ["end"] })) === "roll") thrown = Date.now();
      await tap(waiter, { skip: ["roll"] });
      const now = await asking(waiter);
      if (now && !used.has(now.id)) {
        box = now;
        break;
      }
      if ((thrown && Date.now() - thrown > 16_000) || !(await myTurn(lander))) break;
      await a.page.waitForTimeout(100);
    }
    if (box) {
      used.add(box.id);
      const pop = waiter.page.locator(`.quizpop[data-id="${box.id}"]`);
      expect(box.myTurn, "the question came up on another team's turn").toBe(false);
      expectWhole(box, `${waiter.name} on another team's turn`);
      expect(box.options).toBe(3);
      if (!done.others) {
        await fits(waiter, "the question on another team's turn", ".quizpop");
        await waiter.page.screenshot({ path: "test-results/quiz-others-turn-390x844.png" });
        done.others = await answer(waiter, box.id);
      } else if (!done.own) {
        // The team that landed ends its turn at once: the question is still up as the other's turn begins.
        await endTurn(lander, waiter);
        let mine: QuizBox | null = null;
        for (const end = Date.now() + 8_000; Date.now() < end && !mine; ) {
          const now = await quizBox(waiter.page);
          if (now?.id === box.id && now.state === "ask" && now.myTurn) mine = now;
          else if (!(await pop.count()) || (now && now.state !== "ask")) break;
          else await waiter.page.waitForTimeout(100);
        }
        if (mine) {
          expectWhole(mine, `${waiter.name} on its own turn`);
          expect(mine.options).toBe(3);
          await fits(waiter, "the question on the phone's own turn", ".quizpop");
          await waiter.page.screenshot({ path: "test-results/quiz-own-turn-390x844.png" });
          done.own = await answer(waiter, box.id);
        }
      } else {
        // A real tap on 这题不答: it goes, and doesn't come back.
        const now = await asking(waiter);
        const tapped =
          !!now &&
          now.id === box.id &&
          now.secs >= 3 &&
          (await pop
            .getByRole("button", { name: "这题不答" })
            .click({ timeout: within(now.secs) })
            .then(() => true)
            .catch(() => false));
        if (tapped) {
          await expect(pop).toHaveCount(0, { timeout: 3000 });
          await waiter.page.waitForTimeout(600);
          await expect(pop).toHaveCount(0);
          done.skipped = true;
        }
      }
    }
    await endTurn(lander, waiter);
    if (!(done.others && done.own && done.skipped)) await cleared();
  }
  if (!(done.own && done.others && done.skipped)) for (const p of [a, b]) await explain(p, "quiz");
  expect(done).toEqual({ others: true, own: true, skipped: true });
  for (const p of [a, b]) expect(p.errors, `${p.name}: page errors`).toEqual([]);
});

/** Make every question this phone is shown as long as the bank allows (tests/trivia.test.ts), to see it still fits. */
async function longQuestions(p: Phone) {
  const fill = (n: number, word: string) => `${word} `.repeat(Math.ceil(n / (word.length + 1))).slice(0, n).trim();
  await p.ctx.routeWebSocket(/\/api\/rooms\/[^/]+\/ws/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      try {
        const msg = JSON.parse(String(m));
        const q = msg.t === "view" ? msg.view.game?.trivia : null;
        if (q) {
          q.q = { zh: `${"很长的问题".repeat(9)}吗？`, en: `${fill(139, "Wordy")}?` };
          q.options = q.options.map((_: unknown, i: number) => ({ zh: "选项".repeat(8), en: fill(44, `Option${i + 1}`) }));
          if (q.fact) q.fact = { zh: "冷知识".repeat(26), en: fill(200, "Factual") };
        }
        ws.send(JSON.stringify(msg));
      } catch {
        ws.send(m);
      }
    });
  });
}

test("抢答在小手机、横着拿的手机、英文 iPhone SE（最长的题）和 1366x768 大屏上也整个看得见", async ({ browser, request, contextOptions }) => {
  test.setTimeout(240_000);
  const code = await createRoom(request, { test: { speed: 0.6, triviaEvery: 0 } });
  const tvCtx = await browser.newContext({ ...contextOptions, viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, locale: "zh-CN" });
  track(tvCtx);
  const tv: Phone = { name: "大屏", ctx: tvCtx, page: await tvCtx.newPage(), errors: [], log: [], taps: 0 };
  watch(tv, tv.page);
  await tv.page.goto(`/trip/tv/${code}`);
  await expect(tv.page.locator(".lobby-tv")).toBeVisible({ timeout: 20_000 });
  const { defaultBrowserType: _a, ...se } = devices["iPhone SE"];
  const { defaultBrowserType: _b, ...side } = devices["iPhone 13 landscape"];
  const small = await newPhone(browser, "小屏", { ...iphone, viewport: { width: 375, height: 667 }, locale: "zh-CN" });
  const sideways = await newPhone(browser, "横屏", { ...side, locale: "zh-CN" });
  const english = await newPhone(browser, "SE", { ...se, locale: "en-US" });
  await longQuestions(english);
  for (const p of [small, sideways]) await joinWithTeam(p, code);
  await english.page.goto(`/trip/r/${code}`);
  await english.page.getByRole("button", { name: "New team" }).click();
  await expect(english.page.locator(".teams li.mine")).toBeVisible();
  await start(small);
  const phones = [small, sideways, english];
  const sizes: Record<string, string> = { 小屏: "375x667", 横屏: "sideways-750x342", SE: "320x568-en-longest" };
  const shot = new Set<string>();
  let tvChecked = false;
  let revealShot = false;
  /** A question up for this phone: checked whole and kept as a screenshot, once a phone. */
  const shoot = async (p: Phone, box: QuizBox) => {
    expectWhole(box, `${p.name} ${sizes[p.name]}`);
    await fits(p, `the question at ${sizes[p.name]}`, ".quizpop");
    await p.page.screenshot({ path: `test-results/quiz-${sizes[p.name]}.png` });
    shot.add(p.name);
  };
  /** This phone passes on the question `id`. */
  const pass = (p: Phone, id: string) =>
    p.page
      .locator(`.quizpop[data-id="${id}"]`)
      .getByRole("button", { name: p === english ? "Skip" : "这题不答" })
      .click({ timeout: 2000 })
      .catch(() => {});
  /** The big screen with a question: at the head of its "now" column, all of it on the screen. */
  const checkTv = async () => {
    if (tvChecked) return;
    const q = await tv.page.evaluate(() => {
      const card = document.querySelector<HTMLElement>(".tv-now .trivia");
      if (!card || card.getAnimations().some((a) => a.playState === "running")) return null;
      const r = card.getBoundingClientRect();
      const col = document.querySelector(".tv-now")!.getBoundingClientRect();
      return { first: card.parentElement?.firstElementChild === card, top: r.top, colTop: col.top, bottom: r.bottom, h: innerHeight, w: innerWidth, right: r.right };
    });
    if (!q) return;
    expect(q.first, "the question heads the column").toBe(true);
    expect(Math.abs(q.top - q.colTop)).toBeLessThanOrEqual(2);
    expect(q.bottom).toBeLessThanOrEqual(q.h);
    expect(q.right).toBeLessThanOrEqual(q.w);
    await tv.page.screenshot({ path: "test-results/quiz-tv-1366x768.png" });
    tvChecked = true;
  };
  const until = Date.now() + 200_000;
  while (Date.now() < until && (shot.size < phones.length || !tvChecked || !revealShot)) {
    for (const p of phones) {
      await noDeadAnswers(p);
      const box = await quizBox(p.page);
      if (box?.state === "ask" && !shot.has(p.name)) {
        await shoot(p, box);
        // the others pass (unless the small phone's answer, below, has closed it first)
        if (p !== small) await pass(p, box.id);
      }
      if (box?.state === "ask" && p === small && !revealShot) {
        const answered = await p.page
          .locator(`.quizpop[data-id="${box.id}"] button.trivia-opt`)
          .first()
          .click({ timeout: 2000 })
          .then(() => true)
          .catch(() => false);
        // Its answer comes out once the question closes (at once if it was right, or when the other
        // phones are done with it), for a few seconds: wait for it here, not a round of taps later.
        // Meanwhile the other phones and the big screen are looked at as above, and the phones pass.
        if (answered)
          revealShot = await revealOn(small, box.id, async () => {
            for (const o of [sideways, english]) {
              const b = await quizBox(o.page);
              if (b?.state !== "ask" || b.id !== box.id) continue;
              if (!shot.has(o.name)) await shoot(o, b);
              await pass(o, b.id);
            }
            await checkTv();
          });
      }
      await tap(p);
    }
    await checkTv();
    await small.page.waitForTimeout(100);
  }
  if (shot.size < phones.length) for (const p of phones) await explain(p, "quiz");
  expect([...shot].sort()).toEqual(phones.map((p) => p.name).sort());
  expect(tvChecked, "the big screen showed a question").toBe(true);
  expect(revealShot, "the answer came out on the phone that answered").toBe(true);
  for (const p of [...phones, tv]) expect(p.errors, `${p.name}: page errors`).toEqual([]);
});

test("房主在大厅关掉「城市抢答」：整局都不出题", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const code = await createRoom(request, { test: { speed: 0.4, triviaEvery: 0 } });
  const opts = { ...iphone, viewport: { width: 390, height: 844 }, locale: "zh-CN" };
  const a = await newPhone(browser, "甲", opts);
  const b = await newPhone(browser, "乙", opts);
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  const box = a.page.getByRole("checkbox", { name: /城市抢答/ });
  await expect(box, "on unless the host turns it off").toBeChecked();
  await expect(b.page.getByRole("checkbox", { name: /城市抢答/ }), "only the host has the switch").toHaveCount(0);
  await box.uncheck();
  await expect(box).not.toBeChecked();
  await start(a);
  const turns = async () => (await a.page.locator(".feed li").allInnerTexts()).length;
  // (with the switch on, every landing on a city would bring a question in this test room: several turns' worth)
  const until = Date.now() + 15_000;
  let quizzes = 0;
  while (Date.now() < until) {
    for (const p of [a, b]) {
      quizzes += await p.page.locator(".quizpop, .trivia").count();
      await tap(p);
    }
    await a.page.waitForTimeout(150);
  }
  expect(await turns()).toBeGreaterThan(0);
  expect(quizzes, "no question came up").toBe(0);
});

test("回合计时：一队 60 秒不动，所有人看到 15 秒倒计时，然后电脑替他们走这一步", async ({ browser, request, contextOptions }) => {
  test.setTimeout(120_000);
  // (a quarter of the real times: 15 s of nothing, then a 3.75 s countdown)
  const code = await createRoom(request, { test: { speed: 0.25 } });
  const tvCtx = await browser.newContext({ ...contextOptions, viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1, locale: "zh-CN" });
  track(tvCtx);
  const tv: Phone = { name: "大屏", ctx: tvCtx, page: await tvCtx.newPage(), errors: [], log: [], taps: 0 };
  watch(tv, tv.page);
  await tv.page.goto(`/trip/tv/${code}`);
  const opts = { ...iphone, viewport: { width: 390, height: 844 }, locale: "zh-CN" };
  const a = await newPhone(browser, "甲", opts);
  const b = await newPhone(browser, "乙", opts);
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await a.page.getByRole("checkbox", { name: /城市抢答/ }).uncheck();
  await start(a);
  // Whoever's turn it is does nothing.
  const idler = (await a.page.locator(".banner.me").count()) ? a : b;
  const other = idler === a ? b : a;
  await expect(other.page.locator(".banner.idle-warn"), "the other phone sees the countdown").toBeVisible({ timeout: 25_000 });
  await expect(idler.page.locator(".idle-warn").first(), "and so does the team that hasn't moved").toBeVisible();
  await expect(tv.page.locator(".boardcenter .idle-warn"), "and the big screen").toBeVisible();
  await tv.page.screenshot({ path: "test-results/turnclock-tv.png" });
  await idler.page.screenshot({ path: "test-results/turnclock-idler.png" });
  await other.page.screenshot({ path: "test-results/turnclock-other.png" });
  // The computer throws for them, and the log says so. (It does again 15 s later if they still don't move.)
  await expect(other.page.locator(".feed li").filter({ hasText: "电脑替他们走了这一步" }).first()).toBeVisible({ timeout: 10_000 });
  // The team isn't handed to the computer: its next move is its own to make.
  await expect(idler.page.locator(".banner.warn").filter({ hasText: "托管" })).toHaveCount(0);
  for (const p of [a, b, tv]) expect(p.errors, `${p.name}: page errors`).toEqual([]);
});

test("英文 iPhone SE：没填名字叫 Player 1，「(you)」用英文括号，经过的城市名不被截断", async ({ browser, request }) => {
  test.setTimeout(120_000);
  // the first throw, 4 + 5: past Cairo, Cape Town, Buenos Aires and Mexico City to Rio
  const code = await createRoom(request, { test: { speed: 0.6, dice: [4, 5] } });
  const { defaultBrowserType: _a, ...se } = devices["iPhone SE"];
  const a = await newPhone(browser, "A", { ...se, locale: "en-US" });
  const b = await newPhone(browser, "B", { ...se, locale: "en-US" });
  for (const p of [a, b]) {
    await p.page.goto(`/trip/r/${code}`);
    await expect(p.page.locator(".lobby")).toBeVisible({ timeout: 20_000 });
    await p.page.getByRole("button", { name: "New team" }).click();
    await expect(p.page.locator(".teams li.mine")).toBeVisible();
  }
  await expect(a.page.locator(".teams li.mine .muted")).toHaveText("Player 1 (you)");
  await expect(b.page.locator(".teams li.mine .muted")).toHaveText("Player 2 (you)");
  await expect(a.page.locator(".lobby")).not.toContainText("（");
  await a.page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(a.page.locator(".game")).toBeVisible();
  const thrower = (await a.page.locator(".banner.me").count()) ? a : b;
  await expect(thrower.page.locator('.decide[data-kind="roll"]')).toBeVisible();
  // (a new question takes no taps for a moment: tap until the throw is made)
  await expect.poll(() => tap(thrower)).toBe("roll");
  // The departures board in the sky flips up each city passed: every name whole, at a readable size.
  await thrower.page.waitForFunction(() => Array.from(document.querySelectorAll(".ride-board .row.on")).some((r) => r.textContent?.includes("Mexico City")), null, {
    timeout: 10_000,
  });
  const rows = await thrower.page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".ride-board .row.on .row-name")).map((n) => ({
      text: n.textContent,
      cut: n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1,
      size: parseFloat(getComputedStyle(n).fontSize),
    })),
  );
  await thrower.page.screenshot({ path: "test-results/ride-board-iphone-se-en.png" });
  expect(rows.map((r) => r.text)).toContain("Buenos Aires");
  for (const r of rows) {
    expect(r.cut, `"${r.text}" is cut off`).toBe(false);
    expect(r.size, `"${r.text}" is too small to read`).toBeGreaterThanOrEqual(13);
  }
  for (const p of [a, b]) expect(p.errors, `${p.name}: page errors`).toEqual([]);
});

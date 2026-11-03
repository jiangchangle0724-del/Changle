// The waiting teams' quiz (抢答) on real screens. It pops up at the top of the screen, in the same place
// every time, whole and tappable, on a phone's own turn and on the others'; a real tap answers it;
// 这题不答 sends it away; a phone never shows answers it can't give (the bug Steve saw: the team on turn
// when a question came up got three answers that did nothing). The host can turn it off in the lobby.
// Screenshots of each size go to test-results/quiz-*.png.
import { devices, expect, test, type Page } from "@playwright/test";
import { closeAll, createRoom, explain, joinWithTeam, newPhone, tap, track, watch, type Phone } from "./phones";

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

test("抢答弹在屏幕最上面：自己的回合和别人的回合都整个看得见，真的点得到，「这题不答」能关掉（390x844）", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const code = await createRoom(request, { test: { speed: 0.5 } });
  const opts = { ...iphone, viewport: { width: 390, height: 844 }, locale: "zh-CN" };
  const a = await newPhone(browser, "甲", opts);
  const b = await newPhone(browser, "乙", opts);
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  // (a computer team: its quick turn always hands over to a phone while the question it began with is
  // still up, so that phone gets it on its own turn)
  await a.page.getByRole("button", { name: "加一个电脑队" }).click();
  await start(a);
  // A question comes up at the start of a turn, for the other teams. Seen on another team's turn, it
  // is answered the first time; after that it is left up, to be seen again when the turn passes to
  // this phone and answered there, on its own turn. The next one after both is skipped.
  // (A real tap can take GitHub's WebKit a second or two: it waits for the page to draw the button
  // still. So only on a question with 3 seconds or more to go, at once, and never waiting on one that
  // has closed meanwhile: the next one will do. The pictures are taken of ones left alone.)
  const done = { own: false, others: false, skipped: false };
  const checked = new Set<string>();
  const pictures = new Set<string>();
  const until = Date.now() + 200_000;
  while (Date.now() < until && !(done.own && done.others && done.skipped)) {
    for (const p of [a, b]) {
      await noDeadAnswers(p);
      const box = await quizBox(p.page);
      const kind = box?.myTurn ? "own" : "others";
      if (box && box.state === "ask" && !checked.has(`${p.name}${box.id}${kind}`)) {
        checked.add(`${p.name}${box.id}${kind}`);
        expectWhole(box, `${p.name} on ${kind === "own" ? "its own turn" : "another team's turn"}`);
        expect(box.options).toBe(3);
        const pop = p.page.locator(`.quizpop[data-id="${box.id}"]`);
        if (!done[kind] && box.secs >= 3) {
          // A real tap on an answer (Playwright taps only what's visible and not covered): it counts.
          const tapped = await pop
            .locator("button.trivia-opt")
            .first()
            .click({ timeout: 2000 })
            .then(() => true)
            .catch(() => false);
          if (tapped) done[kind] = await answerTaken(p, box.id);
        } else if (done.own && done.others && !done.skipped && box.secs >= 3) {
          // A real tap on 这题不答: it goes, and doesn't come back.
          const tapped = await pop
            .getByRole("button", { name: "这题不答" })
            .click({ timeout: 2000 })
            .then(() => true)
            .catch(() => false);
          if (tapped) {
            await expect(pop).toHaveCount(0, { timeout: 3000 });
            await p.page.waitForTimeout(600);
            await expect(pop).toHaveCount(0);
            done.skipped = true;
          }
        } else if (!pictures.has(kind)) {
          await p.page.screenshot({ path: `test-results/quiz-${kind}-turn-390x844.png` });
          pictures.add(kind);
        }
      }
      await tap(p);
    }
    await a.page.waitForTimeout(100);
  }
  if (!(done.own && done.others && done.skipped)) for (const p of [a, b]) await explain(p, "quiz");
  expect(done).toEqual({ own: true, others: true, skipped: true });
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
  const code = await createRoom(request, { test: { speed: 0.6 } });
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
  let answered = false;
  const until = Date.now() + 200_000;
  while (Date.now() < until && (shot.size < phones.length || !tvChecked || !revealShot)) {
    for (const p of phones) {
      await noDeadAnswers(p);
      const box = await quizBox(p.page);
      if (box?.state === "ask" && !shot.has(p.name)) {
        expectWhole(box, `${p.name} ${sizes[p.name]}`);
        await p.page.screenshot({ path: `test-results/quiz-${sizes[p.name]}.png` });
        shot.add(p.name);
        // the others skip (unless the small phone's answer, below, has closed it first)
        if (p !== small)
          await p.page
            .getByRole("button", { name: p === english ? "Skip" : "这题不答" })
            .click({ timeout: 2000 })
            .catch(() => {});
      }
      if (box?.state === "ask" && p === small && !answered)
        answered = await p.page
          .locator(`.quizpop[data-id="${box.id}"] button.trivia-opt`)
          .first()
          .click({ timeout: 2000 })
          .then(() => true)
          .catch(() => false);
      if (box?.state === "reveal" && p === small && !revealShot) {
        expectWhole(box, "the answer and its fact");
        await expect(p.page.locator(".quizpop .trivia-fact")).toContainText("你知道吗");
        await p.page.screenshot({ path: "test-results/quiz-375x667-answer.png" });
        revealShot = true;
      }
      await tap(p);
    }
    if (!tvChecked) {
      const q = await tv.page.evaluate(() => {
        const card = document.querySelector<HTMLElement>(".tv-now .trivia");
        if (!card || card.getAnimations().some((a) => a.playState === "running")) return null;
        const r = card.getBoundingClientRect();
        const col = document.querySelector(".tv-now")!.getBoundingClientRect();
        return { first: card.parentElement?.firstElementChild === card, top: r.top, colTop: col.top, bottom: r.bottom, h: innerHeight, w: innerWidth, right: r.right };
      });
      if (q) {
        expect(q.first, "the question heads the column").toBe(true);
        expect(Math.abs(q.top - q.colTop)).toBeLessThanOrEqual(2);
        expect(q.bottom).toBeLessThanOrEqual(q.h);
        expect(q.right).toBeLessThanOrEqual(q.w);
        await tv.page.screenshot({ path: "test-results/quiz-tv-1366x768.png" });
        tvChecked = true;
      }
    }
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
  const code = await createRoom(request, { test: { speed: 0.4 } });
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
  // (a question would come up at the start of every turn: several turns' worth)
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

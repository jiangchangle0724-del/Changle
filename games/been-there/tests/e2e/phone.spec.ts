// The game on a phone (issue #37): the map's size (small fits the whole board, medium and large draw it
// bigger and drag), remembered on the phone; bigger tokens that stay whole when several teams share a
// city; every key screen at 390x844, 375x667 and 320x568 with no sideways scrolling and its buttons at
// least 44 px, inside the screen; and the keyboard never covering a trade's amounts.
import { devices, expect, test, type Page } from "@playwright/test";
import { closeAll, createRoom, explain, joinWithTeam, newPhone, quizOff, tap, type Phone } from "./phones";

test.afterEach(closeAll);

const { defaultBrowserType: _i, ...iphone } = devices["iPhone 13"];

/** The board's box on the phone, the board as drawn in it (bigger on a bigger map), and the page's width. */
async function board(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>(".stage .boardwrap")!;
    const w = wrap.getBoundingClientRect();
    const b = document.querySelector(".stage .roundboard")!.getBoundingClientRect();
    return {
      size: wrap.dataset.map,
      win: { left: w.left, top: w.top, right: w.right, bottom: w.bottom, width: w.width },
      board: { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width },
      zoom: b.width / w.width,
      wider: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

/** Pick a size in the menu. */
async function pickSize(p: Phone, label: string) {
  await p.page.locator(".menu-btn").click();
  await p.page.locator(".setting-row .seg").getByRole("button", { name: label, exact: true }).click();
  await expect(p.page.locator(".setting-row .seg").getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
  await p.page.keyboard.press("Escape");
  await expect(p.page.locator(".sheet-bg:not([hidden])")).toHaveCount(0);
}

async function startWithComputer(p: Phone, code: string) {
  await joinWithTeam(p, code);
  await p.page.getByRole("button", { name: "加一个电脑队" }).click();
  await quizOff(p);
  await p.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(p.page.locator(".game")).toBeVisible();
}

/**
 * Play along (never bidding, never throwing) until this phone's own throw is up. The seats are drawn at
 * random, so the computer's team may go first: its move would carry the map along (the map follows the
 * team on turn) and our play window would open in the middle of the test. On our throw, nothing on the
 * board moves until the turn clock runs out, a minute later.
 */
async function untilOurThrow(p: Phone) {
  const roll = p.page.locator('.decide[data-kind="roll"]:not(.waiting)');
  for (const end = Date.now() + 60_000; Date.now() < end; ) {
    if (await roll.count()) return;
    if (!(await tap(p, { skip: ["roll"], bid: 0, declineBuys: true }))) await p.page.waitForTimeout(150);
  }
  await explain(p, "no throw of ours");
  throw new Error("our throw never came up");
}

test("地图大小：小、中、大，记在这台手机上；大地图用手指拖着看，拖动不会点开城市，点一下才会", async ({ browser, request }) => {
  test.setTimeout(150_000);
  const code = await createRoom(request, {});
  const p = await newPhone(browser, "看", { ...iphone, locale: "zh-CN" });
  await startWithComputer(p, code);
  await untilOurThrow(p);
  // A phone starts at medium: the board half as big again as its box, which holds it (the page never
  // gets wider).
  await expect(p.page.locator(".stage .boardwrap")).toHaveAttribute("data-map", "m");
  await expect.poll(async () => (await board(p.page)).zoom, { timeout: 5_000 }).toBeCloseTo(1.5, 1);
  expect((await board(p.page)).wider).toBeLessThanOrEqual(1);
  const button = p.page.locator(".stage .map-size");
  const bb = (await button.boundingBox())!;
  expect(Math.min(bb.width, bb.height), "the map's button is a 44 px target").toBeGreaterThanOrEqual(44);

  // Small: the whole board, inside its box.
  await pickSize(p, "小");
  await expect(p.page.locator(".stage .boardwrap")).toHaveAttribute("data-map", "s");
  // (once it has eased all the way out, the map has no transform at all)
  await expect.poll(() => p.page.locator(".stage .board-pan").evaluate((el: HTMLElement) => el.style.transform), { timeout: 5_000 }).toBe("");
  const small = await board(p.page);
  expect(small.board.left).toBeGreaterThanOrEqual(small.win.left - 1);
  expect(small.board.right).toBeLessThanOrEqual(small.win.right + 1);
  expect(small.board.top).toBeGreaterThanOrEqual(small.win.top - 1);
  expect(small.board.bottom).toBeLessThanOrEqual(small.win.bottom + 1);

  // Large, remembered after the page loads again.
  await pickSize(p, "大");
  await expect.poll(async () => (await board(p.page)).zoom, { timeout: 5_000 }).toBeCloseTo(2.2, 1);
  await p.page.reload();
  await expect(p.page.locator(".game")).toBeVisible({ timeout: 20_000 });
  await expect(p.page.locator(".stage .boardwrap")).toHaveAttribute("data-map", "l");
  await expect.poll(async () => (await board(p.page)).zoom, { timeout: 5_000 }).toBeCloseTo(2.2, 1);
  // (out of the way: the play window, and the hint that shows the first time)
  if ((await p.page.locator('.playwin[data-open="1"]').count()) > 0) await p.page.locator(".playwin-x").click();
  await expect(p.page.locator('.playwin[data-open="1"]')).toHaveCount(0);
  await p.page.waitForTimeout(800);

  // A tap on a city in sight opens its sheet, as on the whole board.
  const city = await p.page.evaluate(() => {
    const win = document.querySelector(".stage .boardwrap")!.getBoundingClientRect();
    for (const wedge of document.querySelectorAll(".stage g.sp.k-city .wedge")) {
      const r = wedge.getBoundingClientRect();
      for (let i = 1; i < 6; i++)
        for (let j = 1; j < 6; j++) {
          const x = r.left + (r.width * i) / 6;
          const y = r.top + (r.height * j) / 6;
          if (x < win.left + 16 || x > win.right - 16 || y < win.top + 16 || y > win.bottom - 16) continue;
          if (document.elementFromPoint(x, y)?.closest("g.sp") === wedge.closest("g.sp")) return { x, y };
        }
    }
    return null;
  });
  expect(city, "a city in sight on the large map").not.toBeNull();
  await p.page.mouse.click(city!.x, city!.y);
  await expect(p.page.locator(".sheet-bg:not([hidden]) .citycard")).toBeVisible();
  await p.page.keyboard.press("Escape");
  await expect(p.page.locator(".sheet-bg:not([hidden])")).toHaveCount(0);

  // A drag moves the map under the finger, toward wherever there's more of it to see. (From a map at
  // rest: it eases over to the team on turn, and keeps watching its token for a few seconds.)
  await expect(p.page.locator(".stage .board-pan.moving")).toHaveCount(0, { timeout: 10_000 });
  const before = await board(p.page);
  const dx = before.board.right - before.win.right > before.win.left - before.board.left ? -90 : 90;
  const dy = before.board.bottom - before.win.bottom > before.win.top - before.board.top ? -60 : 60;
  const cx = before.win.left + before.win.width / 2;
  const cy = before.win.top + (before.win.bottom - before.win.top) / 2;
  await p.page.mouse.move(cx, cy);
  await p.page.mouse.down();
  await p.page.mouse.move(cx + dx / 2, cy + dy / 2, { steps: 4 });
  await p.page.mouse.move(cx + dx, cy + dy, { steps: 4 });
  await p.page.waitForTimeout(150);
  await p.page.mouse.up();
  const after = await board(p.page);
  const moved = JSON.stringify({ dx, dy, before: before.board, after: after.board });
  expect(Math.abs(after.board.left - before.board.left - dx), `the map moves across with the finger (${moved})`).toBeLessThan(Math.abs(dx) * 0.35);
  expect(Math.abs(after.board.top - before.board.top - dy), `and up or down with it (${moved})`).toBeLessThan(Math.abs(dy) * 0.35);
  expect(after.wider).toBeLessThanOrEqual(1);
  // A drag is not a tap: no city opened.
  await expect(p.page.locator(".sheet-bg:not([hidden])")).toHaveCount(0);


  // The button on the board goes round the sizes: from large back to the whole board, and says so.
  await button.click();
  await expect(p.page.locator(".stage .boardwrap")).toHaveAttribute("data-map", "s");
  await expect(p.page.locator(".stage .map-hint")).toContainText("整张地图");
  await expect.poll(async () => (await board(p.page)).zoom, { timeout: 5_000 }).toBeCloseTo(1, 2);
  await button.click();
  await expect(p.page.locator(".stage .boardwrap")).toHaveAttribute("data-map", "m");
  await expect(p.page.locator(".stage .map-hint")).toContainText("拖动地图");
  expect(p.errors).toEqual([]);
});

test("几队停在同一座城：棋子大了，个个整个看得见、不互相挡住，各带队的字母", async ({ browser, request }) => {
  test.setTimeout(240_000);
  // Every team's first throw is 3 + 5: all three land on Mexico City. Then nobody throws again.
  const code = await createRoom(request, { test: { dice: [3, 5, 3, 5, 3, 5] } });
  const phones: Phone[] = [];
  for (const name of ["甲", "乙", "丙"]) {
    const p = await newPhone(browser, name, { ...iphone, locale: "zh-CN" });
    await joinWithTeam(p, code);
    phones.push(p);
  }
  const [a] = phones;
  await quizOff(a);
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  for (const p of phones) await expect(p.page.locator(".game")).toBeVisible();
  const thrown = new Set<Phone>();
  const together = () =>
    a.page.evaluate(() => {
      const t = Array.from(document.querySelectorAll<SVGGElement>(".stage .roundboard [data-seat]"));
      const x = t.map((e) => Number(e.dataset.x));
      const y = t.map((e) => Number(e.dataset.y));
      return t.length === 3 && Math.max(...x) - Math.min(...x) < 200 && Math.max(...y) - Math.min(...y) < 200 && !document.querySelector(".ride");
    });
  for (const end = Date.now() + 180_000; Date.now() < end; ) {
    if (thrown.size === 3 && (await together())) break;
    let acted = false;
    for (const p of phones) {
      // each team throws once, and answers what its landing asks; nobody throws a second time
      const kind = await tap(p, thrown.has(p) ? { skip: ["roll"] } : {});
      if (kind === "roll") thrown.add(p);
      if (kind) acted = true;
    }
    if (!acted) await a.page.waitForTimeout(150);
  }
  if (!(await together())) for (const p of phones) await explain(p, "not all on Mexico City");
  expect(await together(), "all three tokens on Mexico City").toBe(true);
  // (the walk and the hop of the team on turn settle)
  await a.page.waitForTimeout(1500);

  const tokens = (page: Page) =>
    page.evaluate(() => {
      const win = document.querySelector(".stage .boardwrap")!.getBoundingClientRect();
      return Array.from(document.querySelectorAll(".stage .roundboard .token")).map((t) => {
        const r = t.querySelector(".hop > g")!.getBoundingClientRect();
        return {
          left: r.left,
          top: r.top,
          right: r.right,
          bottom: r.bottom,
          h: r.height,
          inside: r.left >= win.left - 1 && r.right <= win.right + 1 && r.top >= win.top - 1 && r.bottom <= win.bottom + 1,
          letter: !!t.querySelector(".tk-badge"),
        };
      });
    });
  const overlap = (p: { left: number; top: number; right: number; bottom: number }, q: typeof p) => {
    const w = Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left));
    const h = Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top));
    const area = (r: typeof p) => (r.right - r.left) * (r.bottom - r.top);
    return (w * h) / Math.min(area(p), area(q));
  };
  for (const [size, label, tall] of [
    ["m", "中", 26],
    ["s", "小", 17],
  ] as const) {
    if (size !== "m") await pickSize(a, label);
    await expect(a.page.locator(".stage .boardwrap")).toHaveAttribute("data-map", size);
    await a.page.waitForTimeout(1200);
    const list = await tokens(a.page);
    await a.page.screenshot({ path: `test-results/tokens-shared-${size}.png` });
    const pairs = list.flatMap((p, i) => list.slice(i + 1).map((q) => overlap(p, q).toFixed(2)));
    console.log(`tokens at ${size}: heights ${list.map((t) => t.h.toFixed(1)).join(", ")} px; overlaps ${pairs.join(", ")}`);
    expect(list.length).toBe(3);
    for (const t of list) {
      expect(t.inside, `${size}: every token in sight (${JSON.stringify(list)})`).toBe(true);
      expect(t.h, `${size}: every token big enough to make out`).toBeGreaterThanOrEqual(tall);
      expect(t.letter, `${size}: every token sharing the city wears its team's letter`).toBe(true);
    }
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) expect(overlap(list[i], list[j]), `${size}: tokens ${i} and ${j} hardly overlap`).toBeLessThan(0.3);
  }
  for (const p of phones) expect(p.errors).toEqual([]);
});

/**
 * No sideways scrolling, and every button in sight at least 44 px tall and inside the screen across.
 * `main` must also be whole on the screen: the one thing this screen asks for.
 */
async function fits(p: Phone, label: string, main?: string) {
  // (a window or sheet still sliding in is measured once it's there: on its way it's scaled down a little)
  await p.page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const timing = a.effect?.getComputedTiming();
          const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
          return a.playState !== "running" || !Number.isFinite(Number(timing?.endTime)) || !target?.matches?.(".playwin, .sheet-bg, .sheet, .quizpop");
        }),
      null,
      { timeout: 3000 },
    )
    .catch(() => {});
  const r = await p.page.evaluate((main) => {
    const shown = (el: Element) => {
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) === 0) return false;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) return false;
      return !el.closest('[aria-hidden="true"], [hidden], .playwin[data-open="0"], .settling, .ride');
    };
    const small: string[] = [];
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("button, .btn, summary, .seg button, [role=button]")) {
      if (!shown(el) || el.matches("input")) continue;
      const b = el.getBoundingClientRect();
      const name = `${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 24)} (${el.className})`;
      // (its own size, as laid out: not as a moment of an animation draws it)
      const tall = el.offsetHeight || b.height;
      if (tall < 43.5) small.push(`${name} ${el.offsetWidth || Math.round(b.width)}x${tall}`);
      if (b.left < -1 || b.right > innerWidth + 1) out.push(`${name} at ${Math.round(b.left)}..${Math.round(b.right)} of ${innerWidth}`);
    }
    let whole: string | null = null;
    if (main) {
      const m = document.querySelector(main);
      if (m) {
        const b = m.getBoundingClientRect();
        if (b.top < 0 || b.bottom > innerHeight + 1 || b.left < 0 || b.right > innerWidth + 1) whole = `${main} at ${Math.round(b.top)}..${Math.round(b.bottom)} of ${innerHeight}`;
      }
    }
    return { wider: document.documentElement.scrollWidth - document.documentElement.clientWidth, small, out, whole };
  }, main);
  expect(r.wider, `${p.name} ${label}: the page no wider than the phone`).toBeLessThanOrEqual(1);
  expect(r.small, `${p.name} ${label}: buttons at least 44 px tall`).toEqual([]);
  expect(r.out, `${p.name} ${label}: buttons inside the screen`).toEqual([]);
  expect(r.whole, `${p.name} ${label}: what it asks for is whole on the screen`).toBeNull();
}

test("手机逐屏：大厅、自己的回合、别人的回合、抢答、拍卖、交易、设置、结局，在 390x844、375x667、320x568 上都不横向滚动，按钮至少 44px 而且在屏幕里", async ({ browser, request }) => {
  test.setTimeout(300_000);
  const code = await createRoom(request, { mode: 60, test: { speed: 0.35, testRounds: 2 } });
  const { defaultBrowserType: _s, ...se } = devices["iPhone SE"];
  const a = await newPhone(browser, "甲", { ...iphone, viewport: { width: 390, height: 844 }, locale: "zh-CN" });
  const b = await newPhone(browser, "乙", { ...iphone, viewport: { width: 375, height: 667 }, locale: "zh-CN" });
  const c = await newPhone(browser, "C", { ...se, viewport: { width: 320, height: 568 }, locale: "en-US" });
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await c.page.goto(`/trip/r/${code}`);
  await c.page.getByRole("button", { name: "New team" }).click();
  await expect(c.page.locator(".teams li.mine")).toBeVisible();
  const phones = [a, b, c];
  for (const p of phones) await fits(p, "lobby");
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  for (const p of phones) await expect(p.page.locator(".game")).toBeVisible();
  const seen = new Map<Phone, Set<string>>(phones.map((p) => [p, new Set<string>()]));
  const want = ["turn", "others", "quiz", "menu", "trade", "finale"];
  const state = (p: Phone) =>
    p.page.evaluate(() => {
      const q = (s: string) => document.querySelector(s);
      const pop = q(".quizpop:not(.settling)");
      return {
        over: !!q("main.over"),
        quiz: !!pop && pop.getAttribute("data-state") === "ask" && !pop.getAnimations().some((x) => x.playState === "running"),
        auction: !!q('.playwin[data-open="1"] .decide.auction'),
        roll: !!q('.playwin[data-open="1"] .decide[data-kind="roll"]:not(.waiting)') && !q(".settling") && !q(".ride") && !q(".playwin.moving"),
        quiet: !q(".banner.me") && !q('.playwin[data-open="1"]') && !q(".ride") && !q(".touchdown") && !q(".quizpop") && !q(".sheet-bg:not([hidden])") && !q(".roll-moment"),
        touchdown: !!q(".touchdown"),
      };
    });
  for (const end = Date.now() + 240_000; Date.now() < end; ) {
    if (phones.every((p) => seen.get(p)!.has("finale"))) break;
    for (const p of phones) {
      const s = await state(p).catch(() => null);
      if (!s) continue;
      const done = seen.get(p)!;
      if (s.over) {
        if (!done.has("finale")) {
          await p.page.waitForTimeout(4500);
          await fits(p, "finale");
          done.add("finale");
        }
        continue;
      }
      if (s.touchdown) await p.page.locator(".touchdown").click({ timeout: 800 }).catch(() => {});
      if (s.quiz && !done.has("quiz")) {
        await fits(p, "quiz", ".quizpop");
        done.add("quiz");
      }
      // (once this phone's question is checked, it passes on the rest, which cover the top of the screen;
      // not before: a tap on 这题不答 waits out a new question's first moment and would put it away unseen)
      if (done.has("quiz") && (await p.page.locator(".quizpop .quizpop-skip").count()))
        await p.page.locator(".quizpop .quizpop-skip").click({ timeout: 800 }).catch(() => {});
      if (s.auction && !done.has("auction")) {
        await p.page.waitForTimeout(400);
        await fits(p, "auction", '.decide.auction .btn.primary');
        done.add("auction");
      }
      if (s.roll && !done.has("turn")) {
        await p.page.waitForTimeout(400);
        await fits(p, "your turn", '.decide[data-kind="roll"] .btn.primary');
        done.add("turn");
      }
      if (s.quiet && !done.has("others")) {
        await fits(p, "another team's turn", "nav.tabs");
        done.add("others");
      } else if (s.quiet && !done.has("menu")) {
        await p.page.locator(".menu-btn").click();
        await expect(p.page.locator(".sheet-bg:not([hidden]) .settings")).toBeVisible();
        await p.page.waitForTimeout(300);
        await fits(p, "menu", ".sheet-bg:not([hidden]) .sheet .x");
        await p.page.keyboard.press("Escape");
        done.add("menu");
      } else if (s.quiet && !done.has("trade")) {
        await p.page.locator("nav.tabs button").nth(2).click();
        const sheet = p.page.locator(".sheet-bg:not([hidden]) .sheet");
        await expect(sheet.locator(".composer")).toBeVisible();
        await sheet.locator(".composer .choices .btn").first().click();
        await p.page.waitForTimeout(300);
        await fits(p, "trade", ".sheet-bg:not([hidden]) .sheet .x");
        await p.page.keyboard.press("Escape");
        done.add("trade");
      }
      await tap(p, { bid: 0.3 });
    }
    await a.page.waitForTimeout(100);
  }
  for (const p of phones) {
    const missing = want.filter((w) => !seen.get(p)!.has(w));
    if (missing.length) await explain(p, `screens not seen: ${missing.join(", ")}`);
    expect(missing, `${p.name}: every key screen checked`).toEqual([]);
    expect(p.errors, `${p.name}: page errors`).toEqual([]);
  }
});

test("键盘弹出来时，交易金额那一格在键盘上面，交易单不被挡住", async ({ browser, request }) => {
  test.setTimeout(120_000);
  const code = await createRoom(request, {});
  const p = await newPhone(browser, "打字", { ...iphone, viewport: { width: 375, height: 667 }, locale: "zh-CN" });
  // A keyboard that covers the bottom of the screen without making the page shorter, as on an iPhone:
  // the visible part (visualViewport) gets shorter, the page doesn't.
  await p.ctx.addInitScript(() => {
    const vv = new EventTarget();
    let kb = 0;
    Object.defineProperties(vv, {
      height: { get: () => innerHeight - kb },
      width: { get: () => innerWidth },
      offsetTop: { get: () => 0 },
      offsetLeft: { get: () => 0 },
      scale: { get: () => 1 },
    });
    Object.defineProperty(window, "visualViewport", { configurable: true, get: () => vv });
    (window as unknown as { keyboard: (px: number) => void }).keyboard = (px: number) => {
      kb = px;
      vv.dispatchEvent(new Event("resize"));
    };
  });
  await startWithComputer(p, code);
  await p.page.locator("nav.tabs button").nth(2).click();
  const sheet = p.page.locator(".sheet-bg:not([hidden]) .sheet");
  await sheet.locator(".composer .choices .btn").first().click();
  const cash = sheet.locator(".sides input[type=number]").first();
  await cash.click();
  await p.page.evaluate(() => (window as unknown as { keyboard: (px: number) => void }).keyboard(280));
  await expect(p.page.locator("html")).toHaveClass(/kb-open/);
  await p.page.waitForTimeout(300);
  const where = await p.page.evaluate(() => {
    const f = document.activeElement!.getBoundingClientRect();
    const s = document.querySelector(".sheet-bg:not([hidden]) .sheet")!.getBoundingClientRect();
    return { field: [f.top, f.bottom], sheet: [s.top, s.bottom], keyboard: innerHeight - 280 };
  });
  await p.page.screenshot({ path: "test-results/keyboard-trade-375x667.png" });
  expect(where.sheet[1], `the sheet sits on the keyboard (${JSON.stringify(where)})`).toBeLessThanOrEqual(where.keyboard + 1);
  expect(where.sheet[0]).toBeGreaterThanOrEqual(0);
  expect(where.field[1], "the amount is above the keyboard").toBeLessThanOrEqual(where.keyboard);
  expect(where.field[0], "and below the sheet's top").toBeGreaterThanOrEqual(where.sheet[0]);
  await cash.fill("120");
  await expect(cash).toHaveValue("120");
  // The keyboard goes with the field.
  await p.page.evaluate(() => {
    (document.activeElement as HTMLElement).blur();
    (window as unknown as { keyboard: (px: number) => void }).keyboard(0);
  });
  await expect(p.page.locator("html")).not.toHaveClass(/kb-open/);
  expect(p.errors).toEqual([]);
});

// The buildings on the board and its life between moves (art/RoundBoard.tsx), in the one-phone demo:
// a city's houses and its hotel stand up as little models (the hotel's sign carries the city's own
// picture); each one built rises at once in a puff of its own while the ones already there stay
// still, and a hotel rises floor by floor; between moves a token looks round or bobs and a hotel's
// sign swings, one at a time; with reduced motion none of it moves (a new building is simply there).
import { devices, expect, test, type Page } from "@playwright/test";
import { closeAll, newPhone } from "./phones";

test.afterEach(closeAll);

const ROLL = '.decide[data-kind="roll"]:not(.waiting) .btn.primary:not(.off)';
const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 13"];

/**
 * Our team (made first, so it throws first and the computer teams wait for it) owns Cairo and Cape
 * Town, the two cities of a set, with three houses and two; a computer team has a hotel in Mexico
 * City. The demo keeps its room in this browser, so the board is set up there and the page loaded
 * again.
 */
async function setUp(page: Page) {
  await page.addInitScript("window.__demoTest = { dice: [4, 5], speed: 0.3 };");
  await page.goto("/trip/demo");
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(page.locator(ROLL)).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem("bt.demo.room")!);
    const d = st.game.s.deeds;
    for (const [at, owner, houses] of [
      [1, 0, 3],
      [3, 0, 2],
      [8, 1, 5],
    ])
      Object.assign(d[at], { owner, houses, mort: false });
    localStorage.setItem("bt.demo.room", JSON.stringify(st));
  });
  await page.reload();
  await expect(page.locator(ROLL)).toBeVisible({ timeout: 15_000 });
  // (what moves on the board between moves, as it's marked: a token's look or bob, a sign's swing)
  await page.evaluate(() => {
    const w = window as unknown as { __life: string[] };
    w.__life = [];
    new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target as Element;
        if (m.attributeName === "data-idle" && el.getAttribute("data-idle")) w.__life.push(`token:${el.getAttribute("data-idle")}`);
        if (m.attributeName === "data-glint" && el.hasAttribute("data-glint")) w.__life.push(el.classList.contains("hotel") ? "hotel" : "owned");
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["data-idle", "data-glint"] });
  });
}

const life = (page: Page) => page.evaluate(() => (window as unknown as { __life: string[] }).__life);

const CITY = { 1: "开罗", 3: "开普敦" } as const;

/** Build once more on Cairo (1) or Cape Town (3) from the 我的 sheet (opened the first time), and wait for the board. */
async function build(page: Page, at: 1 | 3, next: number) {
  const sheet = page.locator(".p-mine");
  if (!(await sheet.count())) await page.locator("nav.tabs").getByRole("button", { name: "我的" }).click();
  await sheet.locator("li", { hasText: CITY[at] }).getByRole("button", { name: /^盖房/ }).click();
  const bldg = page.locator(`.roundboard .bldg[data-at="${at}"]`);
  if (next >= 5) await expect(bldg).toHaveClass(/\bhotel\b/);
  else await expect(bldg.locator(".b-front")).toHaveCount(next);
  return bldg;
}

/** Each new part's animation and its delay. */
const rising = (bldg: ReturnType<Page["locator"]>) =>
  bldg.locator(".b-new").evaluateAll((els) => els.map((el) => `${getComputedStyle(el).animationName} ${getComputedStyle(el).animationDelay}`));

test("棋盘上的房子：酒店三层亮灯、招牌是这座城的图；每盖一栋马上升起、有自己的一团灰，原有的不动；棋子和招牌平时也会动", async ({ browser }) => {
  test.setTimeout(90_000);
  const p = await newPhone(browser, "一台", { ...iphone, locale: "zh-CN" });
  await setUp(p.page);
  const board = p.page.locator(".roundboard");
  const mexico = board.locator('.bldg[data-at="8"]');
  await expect(mexico).toHaveClass(/\bhotel\b/);
  await expect(mexico.locator(".b-win")).toHaveCount(6);
  await expect(mexico.locator(".b-sign")).toHaveCount(1);
  await expect(board.locator('.bldg[data-at="1"] .b-front')).toHaveCount(3);
  await expect(board.locator('.bldg[data-at="3"] .b-front')).toHaveCount(2);
  // What was there when the board first drew stays still.
  await expect(board.locator(".b-new, .b-dust")).toHaveCount(0);

  // Between moves: a token looks round or bobs, a hotel's sign swings, one thing at a time.
  await expect.poll(async () => (await life(p.page)).some((x) => x.startsWith("token:")), { timeout: 12_000 }).toBe(true);
  await expect.poll(async () => (await life(p.page)).includes("hotel"), { timeout: 12_000 }).toBe(true);
  expect(await board.locator("[data-glint]").count()).toBeLessThanOrEqual(1);

  // A third house on Cape Town, a fourth on Cairo, a fourth on Cape Town: each rises at once, in a
  // puff of its own.
  let capetown = await build(p.page, 3, 3);
  expect(await rising(capetown)).toEqual(["b-rise 0s"]);
  await expect(capetown.locator(".b-dust")).toHaveCount(1);
  await capetown.locator(".b-dust").evaluate((el) => el.setAttribute("data-seen", ""));
  const cairo = await build(p.page, 1, 4);
  expect(await rising(cairo)).toEqual(["b-rise 0s"]);
  capetown = await build(p.page, 3, 4);
  expect(await rising(capetown)).toEqual(["b-rise 0s"]);
  await expect(capetown.locator(".b-dust:not([data-seen])")).toHaveCount(1);
  // The fifth makes a hotel: it rises floor by floor, 0.16 s apart, in a puff; Mexico City's stays still.
  capetown = await build(p.page, 3, 5);
  expect(await rising(capetown)).toEqual(["b-rise 0s", "b-rise 0.16s", "b-rise 0.32s", "b-rise 0.48s"]);
  await expect(capetown.locator(".b-dust")).toHaveCount(1);
  await expect(mexico.locator(".b-new, .b-dust")).toHaveCount(0);
  expect(p.errors).toEqual([]);
});

test("减少动态：新盖的房子直接就在，棋子和招牌平时不动", async ({ browser }) => {
  test.setTimeout(90_000);
  const p = await newPhone(browser, "一台", { ...iphone, locale: "zh-CN", reducedMotion: "reduce" });
  await setUp(p.page);
  const capetown = await build(p.page, 3, 3);
  // (nothing rises and nothing puffs: the new house is drawn as one already standing, the big one that
  // comes up first on a laptop or the big screen isn't there, and neither is the list's)
  expect(await rising(capetown)).toEqual([]);
  await expect(capetown.locator(".b-dust")).toHaveCount(0);
  await expect(p.page.locator(".roundboard .bfx, .lot .bfx, .lot .b-new")).toHaveCount(0);
  await p.page.waitForTimeout(6_000);
  expect(await life(p.page)).toEqual([]);
  expect(p.errors).toEqual([]);
});

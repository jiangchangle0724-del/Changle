// Our throw, on our phone (the beat sheet): the dice are in the air the moment the button is pressed,
// then the camera pushes in behind our token without turning, follows it round the ring by turning
// only, the departures board flips up each city it passes, the stamp comes down on the landing, and
// the camera pulls back as the decision comes up. A tap skips to the stamp, and a second past it.
// With the menu's setting off or reduced motion, the same beats play on the flat board.
import { expect, test, type APIRequestContext, type Browser, type Locator } from "@playwright/test";
import { closeAll, createRoom, explain, joinWithTeam, newPhone, quizOff, tap, type Phone } from "./phones";

test.afterEach(closeAll);

const ROLL = '.decide[data-kind="roll"]:not(.waiting) .btn.primary:not(.off)';

/** A game with one computer team where our team throws first, with these dice. (The seat order is
 * drawn: a room where the computer went first is left for a new one.) */
async function ourFirstThrow(browser: Browser, request: APIRequestContext, contextOptions: Parameters<Browser["newContext"]>[0], dice: number[]) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = await createRoom(request, { test: { dice } });
    const p = await newPhone(browser, "走", contextOptions);
    await joinWithTeam(p, code);
    await p.page.getByRole("button", { name: "加一个电脑队" }).click();
    await quizOff(p);
    await p.page.getByRole("button", { name: "开始", exact: true }).click();
    await expect(p.page.locator(".game")).toBeVisible();
    const roll = p.page.locator(ROLL);
    if (await roll.waitFor({ timeout: 2_500 }).then(() => true, () => false)) return { p, roll };
    await p.ctx.close();
  }
  throw new Error("our team never went first");
}

async function untilOurRoll(p: Phone): Promise<Locator> {
  const roll = p.page.locator(ROLL);
  for (const end = Date.now() + 60_000; Date.now() < end; ) {
    if ((await roll.count()) && !(await p.page.locator(".ride").count())) return roll;
    if (!(await tap(p, { skip: ["roll"] }))) await p.page.waitForTimeout(150);
  }
  await explain(p, "no roll");
  throw new Error("our roll never came up");
}

/** From the press on the dice to the first frame with them in the air; in parts, when the page got
 * the tap (`queued`) and when the dice were in it (`script`, after that). */
type Feedback = { total: number; queued: number; script: number };

/** Every frame: how far the board leans, whether the page got wider; and the press's feedback. */
async function probe(p: Phone) {
  await p.page.evaluate(() => {
    const w = window as unknown as { lean: number; wider: number; feedback: Feedback[]; marks: Record<string, number> };
    w.lean = 0;
    w.wider = 0;
    w.feedback = [];
    w.marks = {};
    const look = () => {
      const view = document.querySelector<HTMLElement>(".stage .board-view");
      const m = view?.style.transform.match(/rotateX\(([\d.]+)deg\)/);
      if (m) w.lean = Math.max(w.lean, Number(m[1]));
      w.wider = Math.max(w.wider, document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (document.querySelector(".stage .ride-land.on") && !w.marks.land) w.marks.land = Date.now();
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
    const moving = () => document.querySelector(".stage .throw-dice, .stage .ride");
    document.addEventListener(
      "click",
      (e) => {
        if (!(e.target as Element).closest?.(".haptic-btn")) return;
        const t0 = e.timeStamp;
        const got = performance.now();
        w.marks.press = Date.now();
        let dom = NaN;
        const mo = new MutationObserver(() => {
          if (!moving()) return;
          dom = performance.now();
          mo.disconnect();
        });
        mo.observe(document.body, { childList: true, subtree: true });
        const first = (now: number) => {
          if (moving()) w.feedback.push({ total: now - t0, queued: got - t0, script: dom - got });
          else requestAnimationFrame(first);
        };
        requestAnimationFrame(first);
      },
      { capture: true },
    );
  });
}

const read = <T>(p: Phone, key: string) => p.page.evaluate((k) => (window as unknown as Record<string, unknown>)[k], key) as Promise<T>;

test("我们掷骰：骰子当场就转，镜头推进、跟走、出发牌逐格翻、盖章、拉回，决定在 5.7 秒内回来", async ({ browser, request, contextOptions, browserName }) => {
  test.setTimeout(150_000);
  // 3 + 5 from Departure: past Cairo, Cape Town and Buenos Aires to Mexico City.
  const { p, roll } = await ourFirstThrow(browser, request, contextOptions, [3, 5]);
  await probe(p);
  const ride = p.page.locator(".stage .ride");
  await roll.click();
  await expect(ride, "the move starts").toBeVisible({ timeout: 4_000 });
  await expect(ride).toHaveClass(/mode-fp/);
  // The play window steps aside while it plays.
  await expect(p.page.locator(".playwin")).toHaveAttribute("data-open", "0");
  await expect(ride.locator(".ride-land")).toHaveClass(/\bon\b/, { timeout: 8_000 });
  await expect(ride.locator(".ride-land b")).toHaveText("墨西哥城");
  // The departures board flipped up the three cities on the way, each as the token got there.
  await expect(ride.locator(".ride-board .row.pass")).toHaveCount(3);
  await expect(ride.locator(".ride-board .row.pass.on")).toHaveCount(3);
  // The question comes back with the stamp: Mexico City asks which pair of faces to ban.
  await expect(p.page.locator(".playwin")).toHaveAttribute("data-open", "1", { timeout: 4_000 });
  await expect(p.page.locator('.decide[data-kind="ban"]')).toBeVisible();
  const marks = await read<Record<string, number>>(p, "marks");
  const decided = Date.now() - marks.press;
  expect(decided, "from the press to the question, at most 4 s more than the 1.7 s before").toBeLessThan(5_700);
  expect(marks.land - marks.press, "the stamp lands on the beat (dice 0.6 s, push 0.3 s, 8 spaces at 0.2 s)").toBeGreaterThan(2_300);
  expect(marks.land - marks.press).toBeLessThan(3_400);
  // Then it's over: the board stands straight again and the token is back on it.
  await expect(ride).toHaveCount(0, { timeout: 6_000 });
  await expect.poll(() => p.page.locator(".stage .board-view").evaluate((el: HTMLElement) => el.style.transform)).toBe("");
  await expect(p.page.locator(".stage .token.ridden")).toHaveCount(0);
  const feedback = await read<Feedback[]>(p, "feedback");
  expect(feedback.length).toBe(1);
  const [f] = feedback;
  console.log(`press to dice (${browserName}): ${Math.round(f.total)} ms; the page got the tap after ${Math.round(f.queued)} ms, the dice were in it ${Math.round(f.script)} ms later`);
  // The 0.1 s is held on Chromium, standing in for a mid-range Android (scripts/ride-perf.mjs slows it
  // down 4× too). GitHub's WebKit run draws without a GPU on two shared cores, nothing like an iPhone,
  // so there it's only held to a second. (A real iPhone's number: the playtest's speed test.)
  expect(f.total, "the dice are in the air within 0.1 s of the press").toBeLessThan(browserName === "chromium" ? 100 : 1_000);
  expect(await read<number>(p, "lean"), "the board leaned back").toBeGreaterThan(40);
  expect(await read<number>(p, "wider"), "the page never got wider").toBeLessThanOrEqual(1);
  expect(p.errors).toEqual([]);

  // The next throw: a tap on the board skips to the stamp, and a second tap past it.
  const again = await untilOurRoll(p);
  await again.click();
  await expect(ride).toBeVisible({ timeout: 4_000 });
  await p.page.waitForTimeout(1_000);
  const landed = await ride.locator(".ride-land.on").count();
  await p.page.locator(".stage .boardwrap").click({ position: { x: 40, y: 40 } });
  if (!landed) await expect(ride.locator(".ride-land"), "skipped to the stamp").toHaveClass(/\bon\b/, { timeout: 400 });
  await p.page.locator(".stage .boardwrap").click({ position: { x: 40, y: 40 } });
  await expect(ride, "skipped past it").toHaveCount(0, { timeout: 1_500 });
  expect(p.errors).toEqual([]);
});

test("关掉第一视角，或手机设了减少动态：同样的节拍在平的棋盘上走，不倾斜、不推镜头", async ({ browser, request, contextOptions }) => {
  test.setTimeout(150_000);
  const { p, roll } = await ourFirstThrow(browser, request, contextOptions, [3, 5]);
  await probe(p);
  await p.page.locator(".menu-btn").click();
  await p.page.getByRole("checkbox", { name: /第一视角走棋/ }).uncheck();
  await p.page.keyboard.press("Escape");
  const ride = p.page.locator(".stage .ride");
  await roll.click();
  await expect(ride).toBeVisible({ timeout: 4_000 });
  await expect(ride).toHaveClass(/mode-flat/);
  await expect(ride.locator(".ride-board .row.pass.on")).toHaveCount(3, { timeout: 8_000 });
  await expect(ride.locator(".ride-land")).toHaveClass(/\bon\b/);
  await expect(ride).toHaveCount(0, { timeout: 6_000 });
  expect(await read<number>(p, "lean"), "the board never leaned").toBe(0);

  // Reduced motion (the phone's setting), with first-person on again: still flat, the dice don't tumble.
  await p.page.locator(".menu-btn").click();
  await p.page.getByRole("checkbox", { name: /第一视角走棋/ }).check();
  await p.page.keyboard.press("Escape");
  await p.page.emulateMedia({ reducedMotion: "reduce" });
  const again = await untilOurRoll(p);
  await again.click();
  await expect(ride).toBeVisible({ timeout: 4_000 });
  await expect(ride).toHaveClass(/mode-flat/);
  if (await ride.locator(".ride-dice").count()) await expect(ride.locator(".ride-dice")).toHaveClass(/still/);
  await expect(ride).toHaveCount(0, { timeout: 8_000 });
  expect(await read<number>(p, "lean")).toBe(0);
  expect(p.errors).toEqual([]);
});

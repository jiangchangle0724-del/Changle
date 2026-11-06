// Everyone sees the same throw at the same moment: the big screen plays it with a small push after the
// token and flips its departures board through the cities passed; another team's phone walks the
// token on its flat board and stamps the landing with the thrower's. All of them from the server's
// moment of the throw. And Rio's samba: nothing starts until the dancing team presses Start on its
// ready card; then every screen counts down from five and plays the lesson, the dancing team's phone
// full screen, the judges' phones small over their buttons (which light up only when it's over), the
// big screen big.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeAll, createRoom, joinWithTeam, newPhone, quizOff, track, watch, type Phone } from "./phones";

test.afterEach(closeAll);

const ROLL = '.decide[data-kind="roll"]:not(.waiting) .btn.primary:not(.off)';
/** The samba tests' rooms run their clocks at half length: the 5 s countdown takes 2.5 s, the 40 s lesson 20. */
const SAMBA_SPEED = 0.5;
/** A samba beat there (600 ms in the real game: ui/Samba.tsx's beatMs). */
const BEAT_MS = 600 * SAMBA_SPEED;

async function bigScreen(browser: Browser, contextOptions: Parameters<Browser["newContext"]>[0], code: string): Promise<Phone> {
  const ctx = await browser.newContext({ ...contextOptions, viewport: { width: 1600, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
  track(ctx);
  const tv: Phone = { name: "大屏", ctx, page: await ctx.newPage(), errors: [], log: [], taps: 0 };
  watch(tv, tv.page);
  await tv.page.goto(`/trip/tv/${code}`);
  await expect(tv.page.locator(".lobby-tv")).toBeVisible({ timeout: 20_000 });
  return tv;
}

/**
 * Note, on the page's own clock (all on this one computer), when something first shows: looked for
 * every frame, and at every change to the page. (A page too busy to draw, as on GitHub's WebKit run
 * with three screens on two shared cores, can stamp the landing and put the move away between two
 * of its frames.)
 */
async function stamp(page: Page, marks: Record<string, string>) {
  await page.evaluate((marks) => {
    const w = window as unknown as { seen: Record<string, number>; statuses: string[]; frames: number[] };
    w.seen = {};
    w.statuses = [];
    // (the frames the page draws until its move is put away, for `landed` below)
    w.frames = [];
    const check = () => {
      for (const [k, sel] of Object.entries(marks)) if (!w.seen[k] && document.querySelector(sel)) w.seen[k] = Date.now();
      const planned = document.querySelector<HTMLElement>(".ride[data-land], .other-stamp[data-land]");
      if (planned && !w.seen.plan) w.seen.plan = Number(planned.dataset.land);
      // (the move put away: the ride over, or the other team's stamp gone)
      if (!planned && w.seen.plan && !w.seen.gone) w.seen.gone = Date.now();
      const st = document.querySelector(".departures-board .bb-row.where .stt")?.textContent;
      if (st && w.statuses[w.statuses.length - 1] !== st) w.statuses.push(st);
    };
    const look = () => {
      check();
      if (!w.seen.gone) w.frames.push(Date.now());
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, characterData: true, attributeFilter: ["class", "data-land"] });
  }, marks);
}

const seen = (p: Phone) => p.page.evaluate(() => (window as unknown as { seen: Record<string, number> }).seen);

/** Wait until a page has noted `k`. */
const noted = (p: Phone, k: string, timeout = 8_000) =>
  expect.poll(async () => (await seen(p))[k] ?? 0, { message: `${p.name}: ${k}`, timeout }).toBeGreaterThan(0);

/**
 * Wait until a phone's stamp has come down (`land`), or its move was over without one while the page
 * drew next to nothing from the landing on: a page too busy to draw sleeps through it (GitHub's WebKit
 * run, three screens on two shared cores), and the game ends a move by its clock for a phone that
 * slept through it, or plays none it got too late (ridePlan.ts). A page that kept drawing after the
 * landing would have shown the stamp.
 */
async function landed(p: Phone, tv: Phone): Promise<"stamped" | "slept"> {
  const verdict = async () => {
    // (for a phone that never got to plan its own: the big screen's landing, the same to 60 ms)
    const ref = await seen(tv);
    return p.page.evaluate(
      (ref) => {
        const w = window as unknown as { seen: Record<string, number>; frames: number[] };
        if (w.seen.land) return "stamped";
        const plan = w.seen.plan ?? ref.plan;
        // over: put away; or, never planned, when the big screen's move was (judged a second later)
        const over = w.seen.gone ?? (!w.seen.plan && ref.gone && Date.now() > ref.gone + 1000 ? ref.gone : 0);
        if (!plan || !over) return "";
        // (from a little after the landing, and more than the one frame of waking up: the stamp's own
        // frame, or its timer on another team's phone, has its turn by the second)
        const drew = w.frames.filter((f) => f >= plan + 100 && f < over);
        if (drew.length < 2) return "slept";
        return `${w.seen.plan ? "put away" : "never played"} with no stamp, though it drew ${drew.length} frames from ${drew[0] - plan} ms after the landing`;
      },
      { plan: ref.plan, gone: ref.gone },
    );
  };
  await expect.poll(verdict, { message: `${p.name}: land`, timeout: 8_000 }).toMatch(/^(stamped|slept)$/);
  return (await verdict()) as "stamped" | "slept";
}

/**
 * Two teams of one phone each, and the big screen. Returns them with the phone that throws first.
 * `speed`: the room's clocks run at this length (1, the real game's, when left out).
 */
async function table(browser: Browser, request: Parameters<typeof createRoom>[0], contextOptions: Parameters<Browser["newContext"]>[0], dice: number[], speed?: number) {
  const code = await createRoom(request, { test: speed ? { dice, speed } : { dice } });
  const tv = await bigScreen(browser, contextOptions, code);
  const a = await newPhone(browser, "甲", contextOptions);
  const b = await newPhone(browser, "乙", contextOptions);
  await joinWithTeam(a, code);
  await joinWithTeam(b, code);
  await quizOff(a);
  await a.page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(tv.page.locator(".screen .boardwrap")).toBeVisible();
  for (const end = Date.now() + 15_000; Date.now() < end; ) {
    if (await a.page.locator(ROLL).count()) return { tv, thrower: a, other: b };
    if (await b.page.locator(ROLL).count()) return { tv, thrower: b, other: a };
    await a.page.waitForTimeout(100);
  }
  throw new Error("nobody's roll came up");
}

test("同一掷，三块屏一起走：大屏推近跟走、出发牌翻城市，另一部手机上的棋子同时落地盖章", async ({ browser, request, contextOptions, browserName }) => {
  test.setTimeout(150_000);
  const { tv, thrower, other } = await table(browser, request, contextOptions, [3, 5]);
  await stamp(tv.page, { ride: ".tv-board .ride.mode-tv", land: ".tv-board .ride-land.on", arrived: ".departures-board .bb-row.where.landed" });
  await stamp(thrower.page, { land: ".stage .ride-land.on" });
  await stamp(other.page, { land: ".stage .other-stamp.on" });
  // Does the big screen's camera move the middle of the board with it (the globe, the centre card)?
  await tv.page.evaluate(() => {
    const w = window as unknown as { pushed: number };
    w.pushed = 0;
    const look = () => {
      const t = document.querySelector<HTMLElement>(".tv-board .board-cam")?.style.transform ?? "";
      const z = Number(t.match(/scale\(([\d.]+)\)/)?.[1] ?? 1);
      w.pushed = Math.max(w.pushed, z);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await thrower.page.locator(ROLL).click();
  await noted(tv, "ride", 4_000);
  await noted(tv, "arrived");
  await expect(tv.page.locator(".departures-board .bb-row.where.landed .nm")).toContainText("墨西哥城", { timeout: 8_000 });
  const how = { thrower: await landed(thrower, tv), other: await landed(other, tv) };
  const statuses = await tv.page.evaluate(() => (window as unknown as { statuses: string[] }).statuses);
  console.log(`departures board: ${statuses.join(" > ")}`);
  // How the screens looked on the way is held on Chromium. GitHub's WebKit run can't draw three
  // screens at once (the big screen's globe takes the two cores): there, where they ended up.
  if (browserName === "chromium") {
    // The big screen's board: leaving, passing the cities (one status for all three), arrived.
    expect(statuses.slice(statuses.lastIndexOf("出发"))).toEqual(["出发", "途经", "到达"]);
    const pushed = await tv.page.evaluate(() => (window as unknown as { pushed: number }).pushed);
    expect(pushed, "the big screen pushes in a little, and the middle of the board goes with it").toBeGreaterThan(1.3);
    expect(pushed).toBeLessThanOrEqual(1.41);
  } else expect(statuses[statuses.length - 1]).toBe("到达");
  // When each screen planned the stamp, on this computer's clock (each from its own estimate of the
  // server's): they agree. And when each one showed it (a frame later, more on a busy page). (A phone
  // that got the throw only once the move was over planned none: it slept through it.)
  const [t, a, b] = [await seen(tv), await seen(thrower), await seen(other)];
  const shown = (x: Record<string, number>, h: string) => (h === "stamped" ? `${x.land - x.plan} ms` : "slept through it");
  console.log(
    `planned landing, from the big screen's: thrower ${a.plan - t.plan} ms, other phone ${b.plan - t.plan} ms; shown after its plan: big screen ${t.land - t.plan} ms, thrower ${shown(a, how.thrower)}, other phone ${shown(b, how.other)}`,
  );
  if (a.plan) expect(Math.abs(a.plan - t.plan), "the thrower's clock and the big screen's").toBeLessThan(60);
  if (b.plan) expect(Math.abs(b.plan - t.plan), "the other phone's clock and the big screen's").toBeLessThan(60);
  // The arrival card on the big screen waits for the landing (put aside while a question is up).
  await expect(tv.page.locator(".tv-side .arrival")).toBeAttached({ timeout: 4_000 });
  expect([...tv.errors, ...thrower.errors, ...other.errors]).toEqual([]);
});

/**
 * Note everything a page's samba lesson shows from now on, as "phase|count|cue" each time it changes
 * (the countdown's numerals are up half a second each here: a look from outside could miss one).
 */
async function watchDance(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { dance: string[] };
    w.dance = [];
    const look = () => {
      const el = document.querySelector<HTMLElement>(".samba");
      const now = el ? `${el.dataset.phase}|${el.querySelector(".samba-count")?.textContent ?? ""}|${el.querySelector(".samba-cue")?.textContent ?? ""}` : "gone";
      if (w.dance[w.dance.length - 1] !== now) w.dance.push(now);
    };
    look();
    new MutationObserver(look).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-phase"] });
  });
}

/** What a page's lesson showed since watchDance, in order: [phase, count, cue]. */
const danceShown = async (p: Phone) => (await p.page.evaluate(() => (window as unknown as { dance: string[] }).dance)).map((s) => s.split("|"));

/** `words` each turn up in `shown`, in that order (other things may come between). */
function inOrder(shown: string[], words: string[]) {
  let from = 0;
  for (const w of words) {
    const at = shown.indexOf(w, from);
    if (at < 0) return false;
    from = at + 1;
  }
  return true;
}

test("里约桑巴：按了开始才倒数，五秒后老师才教；跳舞的手机全屏，评委手机小窗、跳完才能打分，大屏放大版", async ({ browser, request, contextOptions, browserName }) => {
  test.setTimeout(150_000);
  // 4 + 5 from Departure: Rio.
  const { tv, thrower, other } = await table(browser, request, contextOptions, [4, 5], SAMBA_SPEED);
  const all = [thrower, other, tv];
  await thrower.page.locator(ROLL).click();
  const yes = thrower.page.locator('.decide[data-kind="dance"]:not(.waiting) .btn.primary:not(.off)');
  await expect(yes).toBeVisible({ timeout: 10_000 });
  await expect(thrower.page.locator('.decide[data-kind="dance"] .ask')).toContainText("40 秒");
  await yes.click();

  // The ready card on the dancing team's phone, and the others told to wait for it.
  const card = thrower.page.locator(".samba.samba-full.ready");
  await expect(card).toBeVisible({ timeout: 4_000 });
  await expect(card.locator(".samba-cue")).toHaveText("准备跳桑巴");
  await expect(card.locator(".samba-how")).toContainText("倒数 5 秒");
  await expect(card.locator(".samba-how")).toContainText("跳 40 秒");
  await expect(other.page.locator(".samba.samba-small.ready .samba-cue")).toHaveText(/^等 .+ 准备好$/, { timeout: 4_000 });
  await expect(tv.page.locator(".samba.samba-tv.ready .samba-cue")).toHaveText(/^等 .+ 准备好$/, { timeout: 4_000 });
  const scores = other.page.locator('.decide[data-kind="scores"] .choices .btn');
  await expect(scores).toHaveCount(10);
  await expect(scores.first(), "the judges wait for the dance").toBeDisabled();
  // The card fits the phone, under the top bar (the menu stays in reach), and Start is a big target.
  const go = card.locator(".haptic-btn");
  await expect(go).toHaveText("开始");
  const [cardBox, goBox, topBox] = [await card.boundingBox(), await go.boundingBox(), await thrower.page.locator(".game > .top").boundingBox()];
  const wide = thrower.page.viewportSize()!.width;
  expect(goBox!.height, "Start is a big target").toBeGreaterThanOrEqual(50);
  expect(goBox!.x).toBeGreaterThanOrEqual(0);
  expect(goBox!.x + goBox!.width).toBeLessThanOrEqual(wide);
  expect(cardBox!.y, "the card starts under the top bar").toBeGreaterThanOrEqual(topBox!.y + topBox!.height - 1);
  expect(await thrower.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "nothing wider than the phone").toBeLessThanOrEqual(0);

  // Nothing starts until Start is pressed: two seconds on, every screen still waits.
  await thrower.page.waitForTimeout(2000);
  for (const p of all) await expect(p.page.locator(".samba"), `${p.name} waits for Start`).toHaveAttribute("data-phase", "ready");

  for (const p of all) await watchDance(p.page);
  await go.click();

  // Every screen counts down from five, the teacher standing ready, and then the lesson's first figure.
  for (const p of all) await expect(p.page.locator(".samba"), `${p.name}: the lesson`).toHaveAttribute("data-phase", "dance", { timeout: 8_000 });
  await expect(scores.first(), "the judges still wait").toBeDisabled();
  for (const p of all) {
    const shown = await danceShown(p);
    const counted = shown.filter(([phase]) => phase === "count");
    const numerals = counted.map(([, n]) => n);
    console.log(`${p.name} counted down: ${numerals.join(" ")}`);
    expect(counted.length, `${p.name} counted down`).toBeGreaterThan(0);
    for (const [, , cue] of counted) expect(cue).toBe("准备好");
    // (a page too busy to draw, GitHub's WebKit run with three screens on two cores, can miss a numeral:
    // there, they only ever go down, and get to 1)
    if (browserName === "chromium") expect(numerals, `${p.name}'s countdown`).toEqual(["5", "4", "3", "2", "1"]);
    else {
      expect(numerals.every((n, i) => /^[1-5]$/.test(n) && (i === 0 || Number(n) < Number(numerals[i - 1]))), `${p.name}'s countdown only goes down: ${numerals.join(" ")}`).toBe(true);
      expect(numerals[numerals.length - 1]).toBe("1");
    }
    // The countdown comes before the lesson, and the lesson opens slowly.
    const first = shown.findIndex(([phase]) => phase === "dance");
    expect(first).toBeGreaterThan(shown.findIndex(([phase]) => phase === "count"));
    expect(inOrder(shown.map(([, , cue]) => cue), ["准备好", "慢慢来：右、左、右"]), `${p.name}: ${shown.map((s) => s[2]).join(" > ")}`).toBe(true);
  }
  // The dancing team's phone shows it full screen, over everything.
  await expect(thrower.page.locator(".samba.samba-full.dance")).toBeVisible();

  // The eight figures in time, the pose, and only then the judges' buttons.
  await expect(scores.first()).toBeEnabled({ timeout: 30_000 });
  const cues = (await danceShown(tv)).filter(([phase]) => phase === "dance").map(([, , cue]) => cue);
  console.log(`the big screen's lesson: ${cues.filter((c, i) => c !== cues[i - 1]).join(" > ")}`);
  expect(inOrder(cues, ["慢慢来：右、左、右", "换左脚：左、右、左", "右、左、右", "左、右、左", "弹起来", "往右走两步", "往左走两步", "手叉腰，扭一扭", "手举高", "抖抖肩", "连起来跳", "嘿！"]), "the lesson's words, in order").toBe(true);
  await expect(other.page.locator(".samba-small .samba-cue")).toHaveText("跳完了，打分！");
  await expect(thrower.page.locator(".samba.samba-full")).toHaveCount(0, { timeout: 3_000 });
  await scores.nth(7).click();
  expect([...tv.errors, ...thrower.errors, ...other.errors]).toEqual([]);
});

test("减少动态（WCAG 2.3.3）：大屏不推镜头，桑巴老师站着不动，字和脚下的灯照样教", async ({ browser, request, contextOptions }) => {
  test.setTimeout(150_000);
  const { tv, thrower } = await table(browser, request, contextOptions, [4, 5], SAMBA_SPEED);
  await tv.page.emulateMedia({ reducedMotion: "reduce" });
  await tv.page.evaluate(() => {
    const w = window as unknown as { moved: string[] };
    w.moved = [];
    const look = () => {
      const t = document.querySelector<HTMLElement>(".tv-board .board-cam")?.style.transform;
      const v = document.querySelector<HTMLElement>(".tv-board .board-view")?.style.transform;
      if (t || v) w.moved.push(`${t} ${v}`);
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await thrower.page.locator(ROLL).click();
  await expect(tv.page.locator(".tv-board .ride.mode-tv")).toBeVisible({ timeout: 4_000 });
  const yes = thrower.page.locator('.decide[data-kind="dance"]:not(.waiting) .btn.primary:not(.off)');
  await expect(yes).toBeVisible({ timeout: 10_000 });
  expect(await tv.page.evaluate(() => (window as unknown as { moved: string[] }).moved), "the big screen's camera never moved").toEqual([]);
  await yes.click();
  // The big screen waits with the dancing team: the teacher stands still (a dancing one waves).
  await expect(tv.page.locator(".samba.samba-tv.ready .samba-cue")).toHaveText(/^等 .+ 准备好$/, { timeout: 4_000 });
  // From here the teacher's drawing is looked at on every frame, with what the lesson was at then:
  // waiting, counting down, or dancing.
  await tv.page.evaluate(() => {
    const w = window as unknown as { poses: { at: number; late: number; phase: string }[]; watching: boolean };
    w.poses = [];
    w.watching = true;
    let last = "";
    let prev = 0;
    const look = (now: number) => {
      const el = document.querySelector<HTMLElement>(".samba-tv");
      // (where each part of her is: the layers' transforms, and the spots' lights)
      const pose = el?.querySelector(".samba-fig")?.innerHTML ?? "";
      if (last && pose && pose !== last) w.poses.push({ at: now, late: now - prev, phase: el?.dataset.phase ?? "" });
      if (pose) last = pose;
      prev = now;
      if (w.watching) requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
  await tv.page.waitForTimeout(1200);
  const go = thrower.page.locator(".samba.samba-full.ready .haptic-btn");
  await expect(go).toHaveText("开始");
  await go.click();
  await expect(tv.page.locator(".samba-tv")).toHaveAttribute("data-phase", "count", { timeout: 4_000 });
  await expect(tv.page.locator(".samba-tv .samba-count")).toHaveText(/^[1-5]$/);
  await expect(tv.page.locator(".samba-tv .samba-cue")).toHaveText("慢慢来：右、左、右", { timeout: 6_000 });
  // …for five beats of the lesson.
  await tv.page.waitForTimeout(5 * BEAT_MS);
  const poses = await tv.page.evaluate(() => {
    const w = window as unknown as { poses: { at: number; late: number; phase: string }[]; watching: boolean };
    w.watching = false;
    return w.poses;
  });
  // Waiting and counting down, she stands still: the one change is from the wave to hands on hips,
  // when the countdown starts. (A dancing teacher's drawing changes on every frame.)
  const waited = poses.filter((c) => c.phase === "ready" || c.phase === "count");
  console.log(`the teacher's drawing changed ${waited.length} time(s) before the lesson`);
  expect(waited.length, "the teacher stands still while it waits and counts down").toBeLessThanOrEqual(2);
  // In the lesson she stands still between beats: the drawing changes once a beat. Two changes seen on
  // frames that came on time (the frame before within 50 ms: each change is then within 50 ms of its
  // beat) are at least half a beat apart. (A page too busy to draw, GitHub's WebKit run, shows a change
  // whenever it next draws.)
  const changes = poses.filter((c) => c.phase === "dance");
  console.log(`the teacher's drawing changed at ${changes.map((c) => `${Math.round(c.at - changes[0].at)}${c.late > 50 ? "*" : ""}`).join(", ")} ms (* a late frame)`);
  expect(changes.length, "the lesson goes on, beat by beat").toBeGreaterThan(1);
  expect(changes.length, "once a beat, not every frame").toBeLessThanOrEqual(Math.ceil((changes[changes.length - 1].at - changes[0].at) / BEAT_MS) + 2);
  const onTime = changes.filter((c) => c.late <= 50).map((c) => c.at);
  for (let i = 1; i < onTime.length; i++) expect(onTime[i] - onTime[i - 1], "the teacher stands still between beats").toBeGreaterThanOrEqual(BEAT_MS / 2);
  expect([...tv.errors, ...thrower.errors]).toEqual([]);
});

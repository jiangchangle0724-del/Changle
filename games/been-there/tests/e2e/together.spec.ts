// Everyone sees the same throw at the same moment: the big screen plays it with a small push after the
// token and flips its departures board through the cities passed; another team's phone walks the
// token on its flat board and stamps the landing with the thrower's. All of them from the server's
// moment of the throw. And Rio's samba: the dancing team's phone teaches it full screen, the judges'
// phones small over their buttons (which light up only when it's over), the big screen big.
import { expect, test, type Browser, type Page } from "@playwright/test";
import { closeAll, createRoom, joinWithTeam, newPhone, quizOff, track, watch, type Phone } from "./phones";

test.afterEach(closeAll);

const ROLL = '.decide[data-kind="roll"]:not(.waiting) .btn.primary:not(.off)';
/** A samba beat (ui/Samba.tsx's BEAT). */
const BEAT_MS = 600;

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

/** Two teams of one phone each, and the big screen. Returns them with the phone that throws first. */
async function table(browser: Browser, request: Parameters<typeof createRoom>[0], contextOptions: Parameters<Browser["newContext"]>[0], dice: number[]) {
  const code = await createRoom(request, { test: { dice } });
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

test("里约桑巴：跳舞的手机全屏教，评委手机小窗教、跳完才能打分，大屏放大版", async ({ browser, request, contextOptions }) => {
  test.setTimeout(150_000);
  // 4 + 5 from Departure: Rio.
  const { tv, thrower, other } = await table(browser, request, contextOptions, [4, 5]);
  await thrower.page.locator(ROLL).click();
  const yes = thrower.page.locator('.decide[data-kind="dance"]:not(.waiting) .btn.primary:not(.off)');
  await expect(yes).toBeVisible({ timeout: 10_000 });
  await yes.click();
  await expect(thrower.page.locator(".samba.samba-full")).toBeVisible({ timeout: 4_000 });
  await expect(other.page.locator(".samba.samba-small")).toBeVisible({ timeout: 4_000 });
  await expect(tv.page.locator(".samba.samba-tv")).toBeVisible({ timeout: 4_000 });
  const scores = other.page.locator('.decide[data-kind="scores"] .choices .btn');
  await expect(scores).toHaveCount(10);
  await expect(scores.first(), "the judges wait for the dance").toBeDisabled();
  // The cue words go through the figures in time.
  await expect(tv.page.locator(".samba-tv .samba-cue")).toHaveText(/右、左、右|左、右、左/, { timeout: 6_000 });
  await expect(scores.first()).toBeEnabled({ timeout: 12_000 });
  await expect(thrower.page.locator(".samba.samba-full")).toHaveCount(0, { timeout: 3_000 });
  await scores.nth(7).click();
  expect([...tv.errors, ...thrower.errors, ...other.errors]).toEqual([]);
});

test("减少动态（WCAG 2.3.3）：大屏不推镜头，桑巴老师站着不动，字和脚印照样教", async ({ browser, request, contextOptions }) => {
  test.setTimeout(150_000);
  const { tv, thrower } = await table(browser, request, contextOptions, [4, 5]);
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
  await expect(tv.page.locator(".samba-tv .samba-cue")).toHaveText(/右、左、右|左、右、左/, { timeout: 6_000 });
  // The teacher stands still between beats: looked at every frame for five beats, the drawing changes
  // once a beat (a dancing teacher's, every frame). Two changes seen on frames that came on time (the
  // frame before within 50 ms: each change is then within 50 ms of its beat) are at least half a beat
  // apart. (A page too busy to draw, GitHub's WebKit run, shows a change whenever it next draws.)
  const changes = await tv.page.evaluate(
    (beat) =>
      new Promise<{ at: number; late: number }[]>((done) => {
        const seen: { at: number; late: number }[] = [];
        let last = "";
        let prev = 0;
        let t0 = 0;
        const look = (now: number) => {
          t0 ||= now;
          const pose = document.querySelector(".samba-tv svg")?.innerHTML ?? "";
          if (last && pose !== last) seen.push({ at: now, late: now - prev });
          last = pose;
          prev = now;
          if (now - t0 < 5 * beat) requestAnimationFrame(look);
          else done(seen);
        };
        requestAnimationFrame(look);
      }),
    BEAT_MS,
  );
  console.log(`the teacher's drawing changed at ${changes.map((c) => `${Math.round(c.at - changes[0].at)}${c.late > 50 ? "*" : ""}`).join(", ")} ms (* a late frame)`);
  expect(changes.length, "the lesson goes on, beat by beat").toBeGreaterThan(0);
  const onTime = changes.filter((c) => c.late <= 50).map((c) => c.at);
  for (let i = 1; i < onTime.length; i++) expect(onTime[i] - onTime[i - 1], "the teacher stands still between beats").toBeGreaterThanOrEqual(BEAT_MS / 2);
  expect([...tv.errors, ...thrower.errors]).toEqual([]);
});

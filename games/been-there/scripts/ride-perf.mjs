// The beat sheet's speed test for our own throw on a mid-range Android: from the press on the dice to
// the first frame with them in the air (under 0.1 s), and every frame while the move plays (95% of
// them in 16.7 ms: 60 a second). A phone-sized page (Pixel 5) with the CPU slowed down 4× (about a
// mid-range Android; the setting Lighthouse uses for phones).
//   npm run dev                                   (in another terminal; or wrangler dev with ALLOW_TEST_SETTINGS=1)
//   node scripts/ride-perf.mjs [throws] [rate]    (default 6 throws at 4×)
// Two numbers per frame: the time between frames (what the eye sees; headless Chromium draws without a
// GPU, so this is harsher than a phone), and the page's own work in it (scripts, styles, layout and
// painting on the main thread, which the slowdown applies to). The same numbers a player can read off
// their own phone with the menu's speed test.
import { chromium, devices } from "playwright";

const BASE = `${process.env.BASE ?? "http://127.0.0.1:8787"}/trip`;
const THROWS = Number(process.argv[2] ?? 6);
const RATE = Number(process.argv[3] ?? 4);
const ROLL = '.decide[data-kind="roll"]:not(.waiting) .btn.primary:not(.off)';

// In the page: every frame, the time since the last one and the main thread's work in it (from the
// frame's start to the first task after its rendering), while `__on` is set.
const probe = () => {
  localStorage.setItem("bt.speed", "1");
  const w = window;
  w.__on = false;
  w.__gaps = [];
  w.__work = [];
  let last = 0;
  const ch = new MessageChannel();
  let t0 = 0;
  ch.port1.onmessage = () => w.__on && w.__work.push(performance.now() - t0);
  const frame = (ts) => {
    if (w.__on && last) w.__gaps.push(ts - last);
    last = ts;
    t0 = performance.now();
    ch.port2.postMessage(0);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // From the press to the first frame with the dice in the air.
  w.__feedback = [];
  document.addEventListener(
    "click",
    (e) => {
      if (!e.target.closest?.('.decide[data-kind="roll"] .haptic-btn')) return;
      const at = e.timeStamp;
      const first = (now) => (document.querySelector(".stage .throw-dice, .stage .ride") ? w.__feedback.push(now - at) : requestAnimationFrame(first));
      requestAnimationFrame(first);
    },
    { capture: true },
  );
};

const pct = (xs, p) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.floor((a.length * p) / 100))] : NaN;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const { defaultBrowserType: _ignored, ...pixel } = devices["Pixel 5"];
const ctx = await browser.newContext({ ...pixel, locale: "zh-CN" });
await ctx.addInitScript(probe);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const res = await fetch(`${BASE}/api/rooms`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } });
const { code } = await res.json();
await page.goto(`${BASE}/r/${code}`);
await page.waitForSelector(".lobby");
await page.locator(".lobby .field input").fill("测速");
await page.locator(".lobby .field input").blur();
await page.getByRole("button", { name: "新建一队" }).click();
await page.getByRole("button", { name: "加一个电脑队" }).click();
await page.getByRole("button", { name: "开始", exact: true }).click();
await page.waitForSelector(".game");
const cdp = await ctx.newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });

/** Answer whatever else the game asks (buy, end the turn…), as a player would, until our roll is up. */
async function untilOurRoll() {
  for (const end = Date.now() + 90_000; Date.now() < end; ) {
    if ((await page.locator(ROLL).count()) && !(await page.locator(".ride").count())) return;
    const tapped = await page.evaluate(() => {
      if (document.querySelector(".settling")) return false;
      const panel = document.querySelector('.decide:not(.waiting):not([data-kind="roll"])');
      const b = panel?.querySelector(".btn.primary:not([disabled]):not(.off)") ?? panel?.querySelector(".btn:not([disabled]):not(.danger):not(.off)");
      b?.click();
      return !!b;
    });
    if (!tapped) await page.waitForTimeout(150);
  }
  throw new Error("our roll never came up");
}

const rides = [];
for (let i = 0; i < THROWS; i++) {
  await untilOurRoll();
  await page.waitForTimeout(400);
  await page.evaluate(() => ((window.__gaps = []), (window.__work = []), (window.__on = true)));
  await page.locator(ROLL).tap();
  await page.waitForSelector(".stage .ride", { timeout: 5_000 }).catch(() => {});
  await page.waitForSelector(".stage .ride", { state: "detached", timeout: 15_000 });
  const r = await page.evaluate(() => ((window.__on = false), { gaps: window.__gaps, work: window.__work }));
  rides.push(r);
  console.log(`throw ${i + 1}: ${r.gaps.length} frames, between frames p95 ${pct(r.gaps, 95).toFixed(1)} ms, page's work p95 ${pct(r.work, 95).toFixed(1)} ms`);
}
const gaps = rides.flatMap((r) => r.gaps);
const work = rides.flatMap((r) => r.work);
const feedback = await page.evaluate(() => window.__feedback);
const speed = await page.evaluate(() => window.__speed);
console.log(
  JSON.stringify(
    {
      device: "Pixel 5 page, CPU ×" + RATE,
      throws: rides.length,
      frames: gaps.length,
      betweenFrames: { p50: +pct(gaps, 50).toFixed(1), p95: +pct(gaps, 95).toFixed(1), within16_7: +((100 * gaps.filter((g) => g <= 16.7 + 0.5).length) / gaps.length).toFixed(1) },
      pageWork: { p50: +pct(work, 50).toFixed(1), p95: +pct(work, 95).toFixed(1), within16_7: +((100 * work.filter((g) => g <= 16.7).length) / work.length).toFixed(1) },
      pressToDice: { max: Math.round(Math.max(...feedback)), all: feedback.map((x) => Math.round(x)) },
      speedMeterTaps: speed?.taps?.map((x) => Math.round(x)),
      errors,
    },
    null,
    2,
  ),
);
await browser.close();

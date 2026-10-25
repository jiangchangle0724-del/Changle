// Frame-rate check for the brief's "中档安卓接近每秒 60 帧": watch a game of computer teams on a
// phone-sized page with the CPU slowed down (4× ≈ a mid-range Android, the same setting Lighthouse
// uses for phones), and count how smoothly the board animates.
//   npm run dev                      (in another terminal)
//   node scripts/perf.mjs [rate…]    (default: 1 4 6)
// Two numbers per tab: every frame (catches hitches anywhere, including CSS animations), and only the
// frames while something on the board is moving (idle frames would flatter the board's numbers).
// Headless Chromium draws without a GPU, so this is a stand-in for a real phone, not a replacement.
import { chromium, devices } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:8787";
const rates = process.argv.slice(2).map(Number).filter(Boolean);
const SECONDS = Number(process.env.SECONDS ?? 40);

// Runs in the page: log every animation frame, and whether the board changed since the last one.
const probe = () => {
  const w = window;
  w.__frames = [];
  let dirty = false;
  new MutationObserver(() => (dirty = true)).observe(document, { subtree: true, attributes: true, attributeFilter: ["transform", "d", "cx", "cy"] });
  const tick = (t) => {
    if (w.__recording) w.__frames.push([t, dirty]);
    dirty = false;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const pct = (xs, p) => xs[Math.min(xs.length - 1, Math.floor((xs.length * p) / 100))];

async function run(browser, rate) {
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
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "加一个电脑队" }).click();
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await page.waitForSelector(".game");
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });

  const out = {};
  for (const [tab, secs] of [["棋盘", SECONDS], ["行动", Math.round(SECONDS / 2)]]) {
    await page.locator("nav.tabs button", { hasText: tab }).click();
    await page.waitForTimeout(500);
    await page.evaluate(() => ((window.__frames = []), (window.__recording = true)));
    await page.waitForTimeout(secs * 1000);
    const frames = await page.evaluate(() => ((window.__recording = false), window.__frames));
    const stats = (gaps) => {
      gaps.sort((a, b) => a - b);
      const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
      return {
        frames: gaps.length,
        fps: gaps.length ? +(1000 / mean).toFixed(1) : null,
        p50: gaps.length ? +pct(gaps, 50).toFixed(1) : null,
        p90: gaps.length ? +pct(gaps, 90).toFixed(1) : null,
        over33: gaps.length ? +((100 * gaps.filter((g) => g > 33.4).length) / gaps.length).toFixed(1) : null,
        worst: gaps.length ? +gaps[gaps.length - 1].toFixed(1) : null,
      };
    };
    const all = [];
    const moving = [];
    for (let i = 1; i < frames.length; i++) {
      const gap = frames[i][0] - frames[i - 1][0];
      all.push(gap);
      if (frames[i][1] || frames[i - 1][1]) moving.push(gap);
    }
    out[tab] = { all: stats(all), moving: stats(moving) };
  }
  await ctx.close();
  return { rate, ...out, errors };
}

const browser = await chromium.launch();
try {
  for (const rate of rates.length ? rates : [1, 4, 6]) {
    const r = await run(browser, rate);
    for (const tab of ["棋盘", "行动"]) {
      for (const kind of tab === "棋盘" ? ["all", "moving"] : ["all"]) {
        const m = r[tab][kind];
        const label = kind === "all" ? "every frame" : "board moving";
        console.log(`CPU ${rate}× · ${tab} · ${label}: ${m.fps ?? "-"} fps over ${m.frames} frames · 90% under ${m.p90} ms · ${m.over33}% slower than 30 fps · worst ${m.worst} ms`);
      }
    }
    if (r.errors.length) console.log("page errors:", r.errors);
  }
} finally {
  await browser.close();
}

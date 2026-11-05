// A1's timing check on one machine: the speaker page and three phones in Chromium, against the
// Worker running locally (`npm run dev`). It measures what the field test then measures on real
// devices:
//   - each phone's clock error: its estimate of the speaker's clock against the truth (on one
//     machine the truth is known exactly, from the pages' performance.timeOrigin: the speaker's
//     clock is its timeOrigin plus performance.now(), a phone's own is its performance.now())
//   - calibration: the host's taps sent TV_DELAY ms after each click, as if the TV played it that
//     late; audioOffsetMs should come out at TV_DELAY plus the host phone's clock error
//   - the flashes: how far each phone's beat flash lands from the beat the room hears (when the
//     page sets it; the screen shows it on its next frame)
// Also: 我在 lights the name up on the big screen, a phone reloaded mid-dance keeps its seat.
// Usage: npm run dev, then BASE=http://127.0.0.1:8787 node scripts/timing-check.cjs
const { chromium, devices } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const TV_DELAY = Number(process.env.TV_DELAY || 180);
const LIMIT_MS = 30; // A1's acceptance: clocks within 30 ms

(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  const watch = (p, who) => {
    p.on("pageerror", (e) => errors.push(`${who}: ${e}`));
    p.on("console", (m) => m.type() === "error" && errors.push(`${who}: ${m.text()}`));
  };
  const speaker = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "zh-CN" })).newPage();
  watch(speaker, "speaker");
  await speaker.goto(`${BASE}/party/screen`);
  await speaker.getByRole("button", { name: "开始" }).click();
  await speaker.waitForFunction(() => /^#[A-Z0-9]{4}$/.test(location.hash));
  const code = (await speaker.evaluate(() => location.hash)).slice(1);

  const names = ["Ann", "Bob", "Cat"];
  const phones = [];
  for (const [i, name] of names.entries()) {
    const ctx = await browser.newContext({ ...devices["iPhone 13"], locale: i === 1 ? "en-US" : "zh-CN" });
    const p = await ctx.newPage();
    watch(p, name);
    await p.goto(`${BASE}/party/join?code=${code}`);
    await p.fill("#name", name);
    await p.locator("form button[type=submit]").click();
    phones.push(p);
  }
  // every flash, in the phone's own clock
  const recordFlashes = (p) =>
    p.evaluate(() => {
      window.__flashes = [];
      new MutationObserver(() => {
        if (document.getElementById("flash").classList.contains("on")) window.__flashes.push(performance.now());
      }).observe(document.getElementById("flash"), { attributes: true, attributeFilter: ["class"] });
    });
  for (const p of phones) await recordFlashes(p);
  await speaker.waitForTimeout(4000);

  // speaker time = the speaker page's performance.now() + its origin (common.ts's pageClock)
  const speakerOrigin = await speaker.evaluate(() => performance.timeOrigin - window.partyDebug.origin());
  /** speaker time = phone time + truth */
  const truthOf = async (p) => (await p.evaluate(() => performance.timeOrigin)) - speakerOrigin;
  const clocks = [];
  for (const [i, p] of phones.entries()) {
    const est = await p.evaluate(() => window.partyDebug.clock());
    const truth = await truthOf(p);
    clocks.push({ phone: names[i], errorMs: +(est.offsetMs - truth).toFixed(2), rttMs: +est.rttMs.toFixed(1), probes: est.samples, confident: est.confident });
  }
  const players = await speaker.evaluate(() => window.partyDebug.state().players.map((p) => `${p.name}${p.isHost ? "*" : ""}`));

  // calibration: Ann is the host (first in); she taps TV_DELAY ms after each click
  const ann = phones[0];
  await ann.getByRole("button", { name: "校准电视延迟" }).click();
  await speaker.waitForFunction(() => window.partyDebug.cal()?.clicks?.length === 8);
  const clickTimes = await speaker.evaluate(() => window.partyDebug.cal().clicks);
  const annTruth = await truthOf(ann);
  await ann.evaluate(
    ({ clicks, truth, delay }) => {
      for (const c of clicks) {
        setTimeout(() => document.querySelector(".tap-pad").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), c - truth + delay - performance.now());
      }
    },
    { clicks: clickTimes, truth: annTruth, delay: TV_DELAY },
  );
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "lobby" && window.partyDebug.state().audioOffsetMs !== 0, null, { timeout: 30000 });
  const audioOffsetMs = await speaker.evaluate(() => window.partyDebug.state().audioOffsetMs);

  // 我在
  await phones[1].getByRole("button", { name: "I'm here" }).click();
  const lit = await speaker.locator(".player.here", { hasText: "Bob" }).waitFor({ timeout: 3000 }).then(() => true, () => false);

  // the 120 BPM metronome
  for (const p of phones) await p.evaluate(() => (window.__flashes = []));
  await ann.getByRole("button", { name: "开始：120 拍节拍器" }).click();
  await ann.getByRole("button", { name: "开始跳" }).click();
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "dancing");
  await speaker.waitForTimeout(4000 + 4000); // the count-in, then 8 beats
  // a phone reloaded mid-dance keeps its seat
  const cat = phones[2];
  await cat.reload();
  await cat.waitForFunction(() => window.partyDebug.state()?.phase === "dancing", null, { timeout: 10000 });
  await recordFlashes(cat);
  await speaker.waitForTimeout(4000);
  const seats = await speaker.evaluate(() => window.partyDebug.state().players.length);

  const grid = await speaker.evaluate(() => window.partyDebug.grid());
  const heardStart = grid.startAt + audioOffsetMs;
  const flashes = [];
  for (const [i, p] of phones.entries()) {
    const truth = await truthOf(p);
    const times = await p.evaluate(() => window.__flashes);
    const errs = times.map((t) => {
      const s = t + truth;
      const k = Math.round((s - heardStart) / 500);
      return s - (heardStart + k * 500);
    });
    const abs = errs.map(Math.abs).sort((a, b) => a - b);
    const p90 = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.9))] ?? 0;
    flashes.push({ phone: names[i], flashes: errs.length, meanMs: +(errs.reduce((a, b) => a + b, 0) / (errs.length || 1)).toFixed(1), p90AbsMs: +p90.toFixed(1), maxAbsMs: +(abs.at(-1) ?? 0).toFixed(1) });
  }

  // the end
  await ann.getByRole("button", { name: "结束房间" }).click();
  await ann.getByRole("button", { name: "确定结束房间" }).click();
  const ended = await phones[1].getByText("The room has ended").first().waitFor({ timeout: 5000 }).then(() => true, () => false);

  const result = { code, players, clocks, calibration: { tvDelayMs: TV_DELAY, audioOffsetMs, hostClockErrorMs: clocks[0].errorMs }, here: lit, flashes, seatsAfterReload: seats, ended, errors };
  console.log(JSON.stringify(result, null, 2));
  const ok =
    clocks.every((c) => Math.abs(c.errorMs) <= LIMIT_MS) &&
    Math.abs(audioOffsetMs - TV_DELAY - clocks[0].errorMs) <= 20 &&
    // (a flash shows on the next frame: one dropped frame on a busy machine is 17 ms more, so the
    // typical flash is judged, not the worst; a reloaded phone skips the beat it came in on)
    flashes.every((f) => f.flashes >= 5 && Math.abs(f.meanMs) <= LIMIT_MS && f.p90AbsMs <= LIMIT_MS + 17) &&
    lit &&
    seats === 3 &&
    ended &&
    errors.length === 0;
  console.log(ok ? "OK" : "FAILED");
  await browser.close();
  process.exit(ok ? 0 : 1);
})();

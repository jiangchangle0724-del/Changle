// The motion sensor and the TV's little dancers, end to end, on one machine: the speaker page (with
// the 3D coach, drawn in software) and three phones in Chromium, against the Worker running locally
// with the short test dance allowed:
//   npm run build && npx wrangler dev --var ALLOW_TEST_SETTINGS:1
//   BASE=http://127.0.0.1:8787 node scripts/motion-check.cjs [folder for the screenshots]
// Ann dances with a pretend hand (a bump of acceleration on every beat as she hears it, fed to her
// phone's motion sensor code), Bob taps the big button 90 ms late, Cat does nothing. Checked: the
// phones' pulses reach the TV, Ann's moves count as on the beat, Cat is in no results. About 1.5 min.
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:8787";
const OUT = process.argv[2] || ".";
(async () => {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const errs = [];
  const speaker = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "zh-CN" })).newPage();
  speaker.on("pageerror", (e) => errs.push("speaker: " + e));
  speaker.on("console", (m) => m.type() === "error" && errs.push("speaker: " + m.text()));
  await speaker.goto(`${BASE}/party/screen?gl=any`);
  // (the room opens by itself; a tap anywhere turns its sound on, where a browser wants one)
  await speaker.locator(".bar").click();
  await speaker.waitForFunction(() => /^#[A-Z0-9]{4}$/.test(location.hash));
  const code = (await speaker.evaluate(() => location.hash)).slice(1);
  const phones = [];
  for (const [i, name] of ["Ann", "Bob", "Cat"].entries()) {
    const p = await (await browser.newContext({ ...devices["iPhone 13"], locale: i === 1 ? "en-US" : "zh-CN" })).newPage();
    p.on("pageerror", (e) => errs.push(name + ": " + e));
    await p.goto(`${BASE}/party/join?code=${code}`);
    await p.fill("#name", name);
    await p.locator("form button[type=submit]").click();
    phones.push(p);
  }
  const [ann, bob] = phones;
  await speaker.waitForTimeout(4000);
  const origin = await speaker.evaluate(() => performance.timeOrigin - window.partyDebug.origin());
  const truths = [];
  for (const p of phones) truths.push((await p.evaluate(() => performance.timeOrigin)) - origin);
  await ann.evaluate(() => window.partyDebug.act({ type: "START_LEARNING", routineId: "test-short", mode: "dance" }));
  await speaker.waitForFunction(() => window.partyDebug.run().length > 0);
  const run = await speaker.evaluate(() => window.partyDebug.run());
  const off = await speaker.evaluate(() => window.partyDebug.state().audioOffsetMs);
  // Ann's pretend hand: a bump of acceleration on every beat (scored or not) as she hears it
  await ann.evaluate((beats) => {
    window.__hand = setInterval(() => {
      const t = performance.now();
      let a = 0.4 * Math.abs(Math.sin(t * 0.37));
      for (const b of beats) {
        const d = t - b;
        if (Math.abs(d) < 200) a += 9 * Math.exp(-(d * d) / (2 * 45 * 45));
      }
      window.partyDebug.motion(a, t);
    }, 16);
  }, run.map((b) => b.t + off - truths[0]));
  // Bob taps 90 ms late on the scored beats
  await bob.evaluate((ts) => { for (const t of ts) if (t > performance.now()) setTimeout(() => document.querySelector(".dance-pad")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), t - performance.now()); }, run.filter((b) => b.score).map((b) => b.t + off + 90 - truths[1]));
  await speaker.waitForTimeout(5000);
  await speaker.screenshot({ path: `${OUT}/motion-warmup.png` });
  // (the energy rises and falls with each beat: its highest over two seconds)
  const p1 = {};
  for (let k = 0; k < 10; k++) {
    for (const [id, v] of Object.entries(await speaker.evaluate(() => window.partyDebug.pulses()))) p1[id] = { ...v, e: Math.max(v.e, p1[id]?.e ?? 0) };
    await speaker.waitForTimeout(200);
  }
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "dancing", null, { timeout: 120000, polling: 200 });
  await speaker.waitForTimeout(4000);
  await speaker.screenshot({ path: `${OUT}/motion-dance.png` });
  const p2 = await speaker.evaluate(() => window.partyDebug.pulses());
  await ann.getByRole("button", { name: "看结果" }).waitFor({ timeout: 60000 });
  await ann.getByRole("button", { name: "看结果" }).click();
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "results" && window.partyDebug.results());
  const r = await speaker.evaluate(() => window.partyDebug.results());
  await speaker.waitForTimeout(800);
  await speaker.screenshot({ path: `${OUT}/motion-results.png` });
  const ids = await Promise.all(phones.map((p) => p.evaluate(() => window.partyDebug.myId)));
  const players = r.players.map((p) => ({ name: p.name, participation: p.participation, hitRate: +p.hitRate.toFixed(2), off: p.meanAbsOffsetMs }));
  console.log(JSON.stringify({ warmPulses: p1, dancePulses: p2, players, errors: errs }, null, 1));
  const ann1 = players.find((p) => p.name === "Ann");
  const checks = {
    "Ann's pulses reach the TV while warming up": (p1[ids[0]]?.e ?? 0) > 0.3,
    "Bob's taps make pulses too": !!p2[ids[1]],
    "Cat isn't moving": (p2[ids[2]]?.e ?? 0) === 0,
    "Ann dances with the sensor: every beat, on it": ann1?.participation === 100 && ann1.off <= 40,
    "Cat not in the results": !players.some((p) => p.name === "Cat"),
    "no page errors": errs.length === 0,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  console.log(failed.length ? `FAILED: ${failed.join("; ")}` : "OK");
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();

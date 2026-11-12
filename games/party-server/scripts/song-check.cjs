// 一起跳's first dance, end to end on one machine: the speaker page and three phones in Chromium,
// against the Worker running locally with the short test dance allowed:
//   npm run build && npx wrangler dev --var ALLOW_TEST_SETTINGS:1
//   BASE=http://127.0.0.1:8787 node scripts/song-check.cjs
// The host calibrates (taps TV_DELAY ms after each click, as if the TV played them that late), then
// starts the short test dance (two moves, 16 beats; no page lists it) in learn mode and lets it run:
// the warm-up and the teaching, then the dance by itself. Each phone taps its big button the way a
// player would: Ann on every beat she hears (the TV's delay included), Bob 90 ms late, Cat never.
// Checked: the room moves into the dance by itself without the pages planning anything new, the
// floor together on the TV, 看结果, the results (who danced, the awards, on the TV and each phone);
// then 再跳一遍 straight into the dance, 这一段再来 in the middle of it while Bob's connection drops
// for a moment, the results again; then back to the lobby and the end. A run takes about two and a half minutes (the warm-up is a minute).
const { chromium, devices } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const TV_DELAY = Number(process.env.TV_DELAY || 180);
const BOB_LATE = 90;

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
  const [ann, bob, cat] = phones;
  await speaker.waitForTimeout(4000);
  // speaker time = the speaker page's performance.now() + its origin (common.ts's pageClock)
  const speakerOrigin = await speaker.evaluate(() => performance.timeOrigin - window.partyDebug.origin());
  /** speaker time = phone time + truth (on one machine the truth is known exactly) */
  const truthOf = async (p) => (await p.evaluate(() => performance.timeOrigin)) - speakerOrigin;
  const truths = [];
  for (const p of phones) truths.push(await truthOf(p));

  // calibration: Ann (the host) taps TV_DELAY ms after each click
  await ann.getByRole("button", { name: "校准电视延迟" }).click();
  await speaker.waitForFunction(() => window.partyDebug.cal()?.clicks?.length === 8);
  const clickTimes = await speaker.evaluate(() => window.partyDebug.cal().clicks);
  await ann.evaluate(
    ({ clicks, truth, delay }) => {
      for (const c of clicks) setTimeout(() => document.querySelector(".tap-pad").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), c - truth + delay - performance.now());
    },
    { clicks: clickTimes, truth: truths[0], delay: TV_DELAY },
  );
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "lobby" && window.partyDebug.state().audioOffsetMs !== 0, null, { timeout: 30000 });
  const audioOffsetMs = await speaker.evaluate(() => window.partyDebug.state().audioOffsetMs);

  /**
   * A phone taps its big button on every scored beat of the speaker's run (as the room hears it:
   * the TV's delay added), `late` ms after it, from now on. Taps planned for an earlier run are dropped.
   */
  const tapAlong = async (i, late) => {
    const run = await speaker.evaluate(() => window.partyDebug.run());
    const times = run.filter((b) => b.score).map((b) => b.t + audioOffsetMs + late - truths[i]);
    await phones[i].evaluate((ts) => {
      for (const id of window.__taps ?? []) clearTimeout(id);
      window.__taps = ts.filter((t) => t > performance.now() + 20).map((t) => setTimeout(() => document.querySelector(".dance-pad")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), t - performance.now()));
    }, times);
  };
  const phase = () => speaker.evaluate(() => window.partyDebug.state()?.phase);
  /** The speaker's floor, watched until `stop` resolves: the best streak and the most dancers seen. */
  const watchFloor = () => {
    let best = 0;
    let dancers = 0;
    let on = true;
    const loop = (async () => {
      while (on) {
        const f = await speaker.evaluate(() => window.partyDebug.floor()).catch(() => null);
        if (f) {
          best = Math.max(best, f.best);
          dancers = Math.max(dancers, f.dancers);
        }
        await speaker.waitForTimeout(250);
      }
    })();
    return async () => {
      on = false;
      await loop;
      return { best, dancers };
    };
  };

  // ---- 1: learn mode, left to run by itself
  await ann.evaluate(() => window.partyDebug.act({ type: "START_LEARNING", routineId: "test-short", mode: "learn" }));
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "learning" && window.partyDebug.run().length > 0);
  const plansBefore = await speaker.evaluate(() => window.partyDebug.plans());
  const run1 = await speaker.evaluate(() => window.partyDebug.run());
  await tapAlong(0, 0);
  await tapAlong(1, BOB_LATE);
  // the speaker shows the warm-up, the moves being taught; the phones the move and the button
  await speaker.waitForTimeout(4500);
  const warmText = await speaker.locator(".coach .phase").textContent();
  const leadEnd = run1.find((b) => b.stage === "countdown").t;
  const msToLeadEnd = leadEnd - (await speaker.evaluate(() => window.partyDebug.now()));
  console.log(`(the warm-up and teaching: ${Math.round(msToLeadEnd / 1000)} s more)`);
  // (the phones go by the beat as the room hears it: the TV's delay after the speaker plays it; the
  // first beat to follow is judged once its window has closed)
  const firstFollow = run1.find((b) => b.stage === "follow").t + audioOffsetMs;
  await speaker.waitForFunction((t) => window.partyDebug.now() > t + 1200, firstFollow, { timeout: msToLeadEnd + 5000, polling: 100 });
  const followText = await ann.locator(".dance-stage").textContent();
  const annVerdictInFollow = await ann.evaluate(() => window.partyDebug.judged()?.verdict ?? null);
  // the room moves on to the dance by itself
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "dancing", null, { timeout: msToLeadEnd + 10000, polling: 100 });
  const stopFloor1 = watchFloor();
  const plansAfter = await speaker.evaluate(() => window.partyDebug.plans());
  await ann.getByRole("button", { name: "看结果" }).waitFor({ timeout: 30000 });
  const floor1 = await stopFloor1();
  await ann.getByRole("button", { name: "看结果" }).click();
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "results" && window.partyDebug.results());
  const results1 = await speaker.evaluate(() => window.partyDebug.results());
  const tvAwards = await speaker.locator(".award-who").allTextContents();
  const annLine = await ann.locator(".my-score").textContent();
  const bobLine = await bob.locator(".my-score").textContent();
  const catLine = await cat.locator(".my-results .lead").first().textContent();

  // ---- 2: the same dance again, straight in; 这一段再来 in the middle of it
  await ann.getByRole("button", { name: "再跳一遍" }).click();
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "dancing" && window.partyDebug.run().length > 0);
  await tapAlong(0, 0);
  await tapAlong(1, BOB_LATE);
  const run2 = await speaker.evaluate(() => window.partyDebug.run());
  const beat10 = run2.find((b) => b.danceBeat === 10).t + audioOffsetMs;
  await speaker.waitForFunction((t) => window.partyDebug.now() > t + 100, beat10, { timeout: 20000, polling: 50 });
  const plansBeforeRestart = await speaker.evaluate(() => window.partyDebug.plans());
  await ann.getByRole("button", { name: "这一段再来" }).click();
  await speaker.waitForFunction((n) => window.partyDebug.plans() > n, plansBeforeRestart, { timeout: 5000 });
  const run3 = await speaker.evaluate(() => window.partyDebug.run());
  const restartedFrom = run3.find((b) => b.stage === "dance").danceBeat;
  await tapAlong(0, 0);
  await tapAlong(1, BOB_LATE);
  // Bob's Wi-Fi drops for 2.5 s from the first beat after the restart: the bar he finishes meanwhile
  // can't go, and has to get there once he's back
  const firstAgain = run3.find((b) => b.stage === "dance").t + audioOffsetMs;
  await speaker.waitForFunction((t) => window.partyDebug.now() > t + 200, firstAgain, { timeout: 10000, polling: 50 });
  await bob.evaluate(() => window.partyDebug.drop(2500));
  await ann.getByRole("button", { name: "看结果" }).waitFor({ timeout: 30000 });
  await ann.getByRole("button", { name: "看结果" }).click();
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "results" && window.partyDebug.results());
  const results2 = await speaker.evaluate(() => window.partyDebug.results());

  // ---- 3: back to the lobby, the end
  await ann.getByRole("button", { name: "换一支舞" }).click();
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "lobby");
  await ann.getByRole("button", { name: "结束房间" }).click();
  await ann.getByRole("button", { name: "确定结束房间" }).click();
  const ended = await bob.getByText("The room has ended").first().waitFor({ timeout: 5000 }).then(() => true, () => false);

  const who = (r, id) => r.players.find((p) => p.id === id)?.name ?? null;
  const ids = await Promise.all(phones.map((p) => p.evaluate(() => window.partyDebug.myId)));
  const line = (r) => ({
    players: r.players.map((p) => ({ name: p.name, participation: p.participation, hitRate: +p.hitRate.toFixed(3), meanAbsOffsetMs: p.meanAbsOffsetMs, bestStreak: p.bestStreak })),
    awards: { steady: who(r, r.awards.steady), hype: who(r, r.awards.hype), effort: who(r, r.awards.effort) },
    bestStreak: r.bestStreak,
    together: r.together,
  });
  const result = {
    code,
    audioOffsetMs,
    lead: { warmText, followText, annVerdictInFollow, plansBefore, plansAfter },
    floor: floor1,
    results1: line(results1),
    tv: tvAwards,
    phones: { ann: annLine, bob: bobLine, cat: catLine },
    again: { restartedFrom, results: line(results2) },
    ended,
    errors,
  };
  console.log(JSON.stringify(result, null, 2));
  const p1 = (n) => results1.players.find((p) => p.name === n);
  const p2 = (n) => results2.players.find((p) => p.name === n);
  const checks = {
    "calibrated near the TV's delay": Math.abs(audioOffsetMs - TV_DELAY) <= 20,
    "the TV showed the warm-up": warmText === "热身",
    "the phone showed your turn while teaching": followText === "跟一遍",
    "taps judged while following": annVerdictInFollow === "hit",
    "the dance followed the lead with nothing planned again": plansAfter === plansBefore,
    "the floor on the TV": floor1.best >= 12 && floor1.dancers === 2,
    "Ann and Bob in the results, Cat not": results1.players.map((p) => p.name).join() === "Ann,Bob",
    "Ann on every beat": p1("Ann")?.participation === 100 && p1("Ann")?.hitRate === 1 && p1("Ann")?.meanAbsOffsetMs <= 30,
    "Bob late but moving": p1("Bob")?.participation === 100 && p1("Bob")?.meanAbsOffsetMs >= BOB_LATE - 30 && p1("Bob")?.meanAbsOffsetMs <= BOB_LATE + 30,
    "最稳 is Ann": results1.awards.steady === ids[0],
    "the TV names the award winners": tvAwards.length === 3 && tvAwards.includes("Ann") && tvAwards.includes("Bob"),
    "each phone its own line": /100%/.test(annLine ?? "") && /100%/.test(bobLine ?? "") && /You moved/.test(bobLine ?? "") && /没有动手机/.test(catLine ?? ""),
    "这一段再来 went back to beat 8": restartedFrom === 8,
    "again: Ann on every beat, all 16 in a row": p2("Ann")?.participation === 100 && p2("Ann")?.bestStreak === 16,
    "Bob's bar from while his connection was down got there": p2("Bob")?.participation === 100 && p2("Bob")?.bestStreak === 16,
    "the room ended for everyone": ended,
    "no page errors": errors.length === 0,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  console.log(failed.length ? `FAILED: ${failed.join("; ")}` : "OK");
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();

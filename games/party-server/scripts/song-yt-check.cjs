// A song from YouTube, end to end on one machine: the speaker page and two phones in Chromium, against
// the Worker running locally (npm run build && npx wrangler dev --var ALLOW_TEST_SETTINGS:1):
//   BASE=http://127.0.0.1:8787 node scripts/song-yt-check.cjs
// YouTube won't play in a data centre's browser (error 150), so the speaker page gets a pretend
// YouTube player: it starts playing 300 ms after it's asked (a real video is late too), and its
// clock answers four times a second, stale in between, like the real one's. Checked:
//   - the speaker page opens its room by itself and has nothing to press; in a browser that wants a
//     tap before a page makes a sound, it asks for one, and the tap anywhere turns the sound on;
//   - it speaks its host's language: Ann switches hers, the TV follows (Bob's doesn't count);
//   - the host measures the TV's delay from the lobby (Ann taps TV_DELAY ms after each click, as if
//     the TV played them that late);
//   - the host starts a song danced to the library's moves: it waits for the video to be ready and
//     plays it, straight away (nobody taps along first); the speaker measures where the video's
//     beat really is and the room moves the dance's beat there (within 25 ms);
//   - Ann tapping on the video's real beats as the room hears them is on the beat;
//   - 暂停 and 继续: the video holds, the phones say so; on 继续 it picks up a moment and a half
//     before where it stopped, and the room's beat is where the video's is again (within 25 ms);
//   - the video stalls for 4 s: the dance waits for it (the TV and the phones say so), then picks up
//     where the video is (its beat within 25 ms of the video's, 4 s later than it was);
//   - the dance's end: the song fades out and stops, its sound back for the next time;
//   - the TV's video goes away in the lobby;
//   - a song with its own dance (Macarena) starts the same way, its beat 0 where the data has it in
//     the video (within 25 ms), its own moves.
const { chromium, devices } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8787";
/** a song danced to the library's moves, its beat measured in its video like every song's */
const SONG = "song-levitating";
const SONG_BPM = 103;
const FIRST = 5219;
/** a song with its own dance */
const OWN_SONG = "song-macarena";
const OWN_FIRST = 5154;
/** how late the pretend TV plays the speaker's sound (ms) */
const TV_DELAY = 150;

const FAKE_YT = `(() => {
  const LAG = 300;
  class Player {
    constructor(el, o) {
      this.o = o; this.state = -1; this.at = 0; this.t0 = 0; this.muted = false; this.rep = { t: 0, at: 0 };
      const f = document.createElement("div");
      f.className = "fake-yt";
      f.style.cssText = "width:100%;height:100%;background:#2a1f55";
      el.replaceWith(f);
      window.__fakeYt = this;
      setTimeout(() => { this.state = 5; o.events.onReady && o.events.onReady(); }, 200);
      setInterval(() => { this.rep = { t: this.cur(), at: performance.now() }; }, 250);
    }
    cur() { return this.state === 1 ? this.at + (performance.now() - this.t0) / 1000 : this.at; }
    playVideo() {
      if (this.state === 1 || this.state === 3) return;
      this.state = 3;
      clearTimeout(this.tm);
      this.tm = setTimeout(() => {
        this.state = 1;
        this.t0 = performance.now();
        // the truth, for the check: the speaker's time when the video was at 0:00
        window.__fakeZero = window.partyDebug.now() - this.at * 1000;
        this.rep = { t: this.cur(), at: performance.now() };
      }, LAG);
    }
    pauseVideo() { this.at = this.cur(); this.state = 2; clearTimeout(this.tm); this.rep = { t: this.at, at: performance.now() }; window.__pauses = (window.__pauses ?? 0) + 1; }
    seekTo(s) { (window.__seeks ??= []).push(s); this.at = s; if (this.state === 1) { this.t0 = performance.now(); window.__fakeZero = window.partyDebug.now() - s * 1000; } this.rep = { t: s, at: performance.now() }; }
    /** the network holding it up for ms: its clock stops, then it plays on */
    stall(ms) {
      this.at = this.cur(); this.state = 3; clearTimeout(this.tm); this.rep = { t: this.at, at: performance.now() };
      this.tm = setTimeout(() => { this.state = 1; this.t0 = performance.now(); window.__fakeZero = window.partyDebug.now() - this.at * 1000; this.rep = { t: this.cur(), at: performance.now() }; }, ms);
    }
    setVolume(v) { this.vol = v; (window.__vols ??= []).push(v); }
    mute() { this.muted = true; }
    unMute() { this.muted = false; }
    isMuted() { return this.muted; }
    cueVideoById() { this.at = 0; this.state = 5; }
    getPlayerState() { return this.state; }
    // (stale between its reports, like the real one's)
    getCurrentTime() { return this.state === 1 ? this.rep.t : this.at; }
    getDuration() { return 240; }
    destroy() {}
  }
  window.YT = { Player };
})();`;

(async () => {
  // ---- a browser that wants a tap before a page makes a sound: the speaker page asks for one
  const shy = await chromium.launch();
  const shyPage = await (await shy.newContext({ viewport: { width: 1280, height: 720 }, locale: "zh-CN" })).newPage();
  await shyPage.goto(`${BASE}/party/screen`);
  await shyPage.waitForFunction(() => /^#[A-Z0-9]{4}$/.test(location.hash), null, { timeout: 10000 });
  await shyPage.waitForTimeout(500);
  const askedForSound = await shyPage.evaluate(() => window.partyDebug.setup() === "sound" && /点一下屏幕，打开声音/.test(document.body.innerText));
  await shyPage.mouse.click(900, 600);
  await shyPage.waitForFunction(() => window.partyDebug.setup() === "done", null, { timeout: 5000 }).catch(() => {});
  const soundOnByTap = await shyPage.evaluate(() => window.partyDebug.setup() === "done" && !/点一下屏幕/.test(document.body.innerText));
  await shy.close();

  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const errors = [];
  const watch = (p, who) => {
    p.on("pageerror", (e) => errors.push(`${who}: ${e}`));
    p.on("console", (m) => m.type() === "error" && !/youtube|favicon/i.test(m.text()) && errors.push(`${who}: ${m.text()}`));
  };
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "zh-CN" });
  await sctx.addInitScript(FAKE_YT);
  const speaker = await sctx.newPage();
  watch(speaker, "speaker");
  await speaker.goto(`${BASE}/party/screen`);
  // (the room opens by itself; with sound allowed, nothing to set up)
  await speaker.waitForFunction(() => /^#[A-Z0-9]{4}$/.test(location.hash));
  const code = (await speaker.evaluate(() => location.hash)).slice(1);
  await speaker.waitForFunction(() => window.partyDebug.setup() === "done", null, { timeout: 5000 }).catch(() => {});
  const setUp = await speaker.evaluate(() => window.partyDebug.setup());
  const phones = [];
  for (const [i, name] of ["Ann", "Bob"].entries()) {
    const p = await (await browser.newContext({ ...devices["iPhone 13"], locale: i === 1 ? "en-US" : "zh-CN" })).newPage();
    watch(p, name);
    await p.goto(`${BASE}/party/join?code=${code}`);
    await p.fill("#name", name);
    await p.locator("form button[type=submit]").click();
    phones.push(p);
  }
  const [ann] = phones;
  await speaker.waitForTimeout(3500);
  const origin = await speaker.evaluate(() => performance.timeOrigin - window.partyDebug.origin());
  const annTruth = (await ann.evaluate(() => performance.timeOrigin)) - origin;

  // ---- the TV: nothing to press, and its host's language (Bob, in English, isn't the host)
  const noButtons = await speaker.evaluate(() => document.querySelectorAll("#app button").length === 0);
  const zhAtFirst = await speaker.evaluate(() => document.documentElement.lang === "zh-CN" && /一起跳/.test(document.querySelector(".brand")?.textContent ?? ""));
  await ann.locator(".bar .chip", { hasText: "EN" }).click();
  await speaker.waitForFunction(() => document.querySelector(".brand")?.textContent === "Dance Along", null, { timeout: 5000 }).catch(() => {});
  const followsHost = await speaker.evaluate(() => document.querySelector(".brand")?.textContent === "Dance Along");
  await ann.locator(".bar .chip", { hasText: "中文" }).click();
  await speaker.waitForFunction(() => document.querySelector(".brand")?.textContent === "一起跳", null, { timeout: 5000 }).catch(() => {});
  const backToZh = await speaker.evaluate(() => document.querySelector(".brand")?.textContent === "一起跳");

  // ---- the host measures the TV's delay from the lobby: Ann taps TV_DELAY ms after each click
  await ann.evaluate(() => window.partyDebug.act({ type: "START_CALIBRATION" }));
  await speaker.waitForFunction(() => window.partyDebug.cal()?.clicks?.length === 8);
  const clickTimes = await speaker.evaluate(() => window.partyDebug.cal().clicks);
  await ann.evaluate(
    ({ clicks, truth, delay }) => {
      for (const c of clicks) setTimeout(() => document.querySelector(".tap-pad").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), c - truth + delay - performance.now());
    },
    { clicks: clickTimes, truth: annTruth, delay: TV_DELAY },
  );
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "lobby" && window.partyDebug.state().audioOffsetMs !== 0, null, { timeout: 30000 });
  const audioOffsetMs = await speaker.evaluate(() => window.partyDebug.state().audioOffsetMs);

  // ---- the host starts the song (just dance): straight away, the room waits for the video, and plays it
  await ann.evaluate((id) => window.partyDebug.act({ type: "START_LEARNING", routineId: id, mode: "dance" }), SONG);
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "learning");
  const straight = await speaker.evaluate(() => Object.keys(window.partyDebug.routine() ?? {}).every((k) => k !== "tapIn"));
  await speaker.waitForFunction(() => window.partyDebug.tube().status === "ready", null, { timeout: 15000 });
  await ann.waitForFunction(() => window.partyDebug.state()?.phase === "dancing", null, { timeout: 20000 });
  await speaker.waitForFunction(() => window.partyDebug.tube().status === "playing", null, { timeout: 10000 });
  // the room moves the beat to where the video's is (the measuring takes a second and a half)
  await speaker.waitForTimeout(4500);
  const fakeZero = await speaker.evaluate(() => window.__fakeZero);
  const startAt = await speaker.evaluate(() => window.partyDebug.state().routineStartAt);
  const beatMs = 60000 / SONG_BPM;
  const moved = startAt - (fakeZero + FIRST);
  // Ann taps on the video's real beats, as the room hears them, for 16 beats from a moment from now
  const nowS = await speaker.evaluate(() => window.partyDebug.now());
  const k0 = Math.ceil((nowS + 600 - (fakeZero + FIRST)) / beatMs);
  const beats = Array.from({ length: 16 }, (_, i) => fakeZero + FIRST + (k0 + i) * beatMs + audioOffsetMs);
  await ann.evaluate((ts) => { for (const t of ts) setTimeout(() => document.querySelector(".dance-pad")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), t - performance.now()); }, beats.map((t) => t - annTruth));
  // (her last tapped beat, judged once its window has closed)
  await speaker.waitForTimeout(beats[15] - nowS + 450);
  const judged = await ann.evaluate(() => window.partyDebug.judged());
  await speaker.waitForTimeout(800);
  const floor = await speaker.evaluate(() => window.partyDebug.floor());
  await speaker.screenshot({ path: process.env.SHOT || "/tmp/song-yt.png" });
  // 暂停: the video holds where it is; 继续: from a moment and a half before, the beat with the video
  await ann.evaluate(() => window.partyDebug.act({ type: "PAUSE" }));
  await speaker.waitForFunction(() => window.partyDebug.state() && window.partyDebug.tube().status === "ready", null, { timeout: 5000 });
  const heldAt = await speaker.evaluate(() => window.__fakeYt.cur());
  await ann.waitForFunction(() => /暂停了/.test(document.body.innerText));
  const pauseShown = await ann.evaluate(() => [...document.querySelectorAll(".host-panel button")].some((b) => b.textContent === "继续"));
  await speaker.waitForTimeout(2500);
  const stillHeld = await speaker.evaluate(() => window.__fakeYt.cur());
  await speaker.screenshot({ path: (process.env.SHOT || "/tmp/song-yt.png").replace(/\.png$/, "-paused.png") });
  await ann.evaluate(() => window.partyDebug.act({ type: "RESUME" }));
  await speaker.waitForFunction(() => window.partyDebug.tube().status === "playing", null, { timeout: 10000 });
  const pickedUp = await speaker.evaluate(() => (window.__seeks ?? []).at(-1));
  await speaker.waitForTimeout(4500);
  const resumedZero = await speaker.evaluate(() => window.__fakeZero);
  const resumedStart = await speaker.evaluate(() => window.partyDebug.state().routineStartAt);
  const resumedMoved = resumedStart - (resumedZero + FIRST);
  // the video stalls for 4 s: the dance waits (the TV and the phones say so), then picks up with it
  await speaker.evaluate(() => window.__fakeYt.stall(4000));
  await speaker.waitForFunction(() => window.partyDebug.routine()?.heldAt !== undefined, null, { timeout: 6000 }).catch(() => {});
  const held = await speaker.evaluate(() => window.partyDebug.routine()?.heldAt !== undefined);
  const stallShown = await ann.waitForFunction(() => /等电视上的视频/.test(document.body.innerText), null, { timeout: 3000 }).then(() => true, () => false);
  const tvStallShown = await speaker.evaluate(() => /等视频/.test(document.body.innerText) && window.partyDebug.run().length === 0);
  await speaker.waitForFunction(() => window.partyDebug.routine()?.heldAt === undefined, null, { timeout: 10000 }).catch(() => {});
  await speaker.waitForTimeout(3500);
  const stallZero = await speaker.evaluate(() => window.__fakeZero);
  const stallStart = await speaker.evaluate(() => window.partyDebug.state().routineStartAt);
  const stallMoved = stallStart - (stallZero + FIRST);
  const stallLater = stallStart - resumedStart;
  // the dance's end: the song fades out and stops, its sound back for the next time (here the dance
  // is still on, so the video then picks up again: a real end has the room on its results)
  await speaker.evaluate(() => { window.__vols = []; window.__pauses = 0; window.partyDebug.fade(); });
  await speaker.waitForTimeout(3200);
  const fade = await speaker.evaluate(() => ({ low: Math.min(...window.__vols), last: window.__vols.at(-1), steps: window.__vols.length, pauses: window.__pauses }));
  const faded = fade.steps > 5 && fade.low <= 5 && fade.last === 100 && fade.pauses >= 1;
  await ann.evaluate(() => window.partyDebug.act({ type: "BACK_TO_LOBBY" }));
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "lobby");
  await speaker.waitForTimeout(300);
  const tubeAfter = await speaker.evaluate(() => window.partyDebug.tube().status);

  // ---- a song with its own dance: straight to the video, the same way
  await ann.evaluate((id) => window.partyDebug.act({ type: "START_LEARNING", routineId: id, mode: "dance" }), OWN_SONG);
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "learning");
  await ann.waitForFunction(() => window.partyDebug.state()?.phase === "dancing", null, { timeout: 30000 });
  await speaker.waitForFunction(() => window.partyDebug.tube().status === "playing", null, { timeout: 10000 });
  await speaker.waitForTimeout(4500);
  const ownZero = await speaker.evaluate(() => window.__fakeZero);
  const ownStart = await speaker.evaluate(() => window.partyDebug.state().routineStartAt);
  const ownMoved = ownStart - (ownZero + OWN_FIRST);
  const ownMove = await speaker.evaluate(() => window.partyDebug.run().find((b) => b.stage === "dance")?.move);
  await ann.evaluate(() => window.partyDebug.act({ type: "BACK_TO_LOBBY" }));
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "lobby");


  console.log(JSON.stringify({ askedForSound, soundOnByTap, setUp, noButtons, zhAtFirst, followsHost, backToZh, audioOffsetMs, straight, heldAt, stillHeld, pickedUp, resumedMoved: Math.round(resumedMoved), held, stallShown, tvStallShown, stallMoved: Math.round(stallMoved), stallLater: Math.round(stallLater), fade, ownMoved: Math.round(ownMoved), ownMove, moved: Math.round(moved), judged: judged && { verdict: judged.verdict, off: judged.off }, floor: floor && { best: floor.best, dancers: floor.dancers }, tubeAfter, errors }, null, 1));
  const checks = {
    "where a page's sound wants a tap, the TV asks for one, and a tap anywhere turns it on": askedForSound && soundOnByTap,
    "the TV opens its room by itself, and with sound allowed needs nothing set up": setUp === "done",
    "the TV has nothing to press": noButtons,
    "the TV speaks its host's language, and follows it": zhAtFirst && followsHost && backToZh,
    "the host measures the TV's delay from the lobby (within 20 ms)": Math.abs(audioOffsetMs - TV_DELAY) <= 20,
    "a song starts straight away, nobody tapping along first": straight,
    "the room moved the beat to the video's (within 25 ms)": Math.abs(moved) <= 25,
    "Ann on the video's beats is on the beat": judged?.verdict === "hit" && Math.abs(judged.off) <= 40,
    "the floor counts her": (floor?.best ?? 0) >= 8,
    "暂停 holds the video, and the phones say so": Math.abs(stillHeld - heldAt) < 0.01 && pauseShown,
    "继续 picks the video up a moment and a half before where it stopped": typeof pickedUp === "number" && Math.abs(heldAt - 1.5 - pickedUp) <= 0.35,
    "after 继续 the room's beat is where the video's is (within 25 ms)": Math.abs(resumedMoved) <= 25,
    "a stalled video holds the dance, and the TV and the phones say so": held && stallShown && tvStallShown,
    "then the dance picks up where the video is (within 25 ms), 4 s later": Math.abs(stallMoved) <= 25 && Math.abs(stallLater - 4000) <= 600,
    "the dance's end fades the song out and stops it, its sound back for next time": faded,
    "the video goes away in the lobby": tubeAfter === "idle",
    "a song with its own dance starts the same way, on its measured beat (within 25 ms), its own moves": Math.abs(ownMoved) <= 25 && ownMove === "macarena-arms",
    "no page errors": errors.length === 0,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  console.log(failed.length ? `FAILED: ${failed.join("; ")}` : "OK");
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();

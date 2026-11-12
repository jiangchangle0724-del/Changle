// A song from YouTube, end to end on one machine: the speaker page and two phones in Chromium, against
// the Worker running locally (npm run build && npx wrangler dev --var ALLOW_TEST_SETTINGS:1):
//   BASE=http://127.0.0.1:8787 node scripts/song-yt-check.cjs
// YouTube won't play in a data centre's browser (error 150), so the speaker page gets a pretend
// YouTube player: it starts playing 300 ms after it's asked (a real video is late too), and its
// clock answers four times a second, stale in between, like the real one's. Checked:
//   - the songbook API (a tap-along's result kept; too few taps, or taps from a room that didn't
//     measure its TV's delay, turned away);
//   - the host starts a song: the room measures the TV's delay first (Ann taps TV_DELAY ms after
//     each click, as if the TV played them that late), then the song waits for the video to be
//     ready and plays it; the speaker measures where the video's beat really is and the room moves
//     the dance's beat there (within 25 ms);
//   - Ann tapping on the video's real beats as the room hears them is on the beat;
//   - 暂停 and 继续: the video holds, the phones say so; on 继续 it picks up a moment and a half
//     before where it stopped, and the room's beat is where the video's is again (within 25 ms);
//   - the TV's video goes away in the lobby;
//   - 找拍子: a song nobody has danced yet plays first while Ann and Bob tap along on their phones;
//     the speaker finds its first beat from their taps, heard TV_DELAY late (within 25 ms), the
//     songbook keeps it, and the song then starts from its start with its beat where the video's is;
//   - 歌曲对拍 on the speaker page: 16 taps on the beats of another song, heard from the TV, give its
//     first beat.
const { chromium, devices } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:8787";
const SONG = "song-gangnam-style";
const SONG_BPM = 132;
const FIRST = 3000;
const TAP_SONG = "song-gentleman";
const FIND_SONG = "song-dynamite";
const FIND_BPM = 114;
const FIND_FIRST = 6100;
const TAP_BPM = 126;
const TAP_FIRST = 5200;
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
    pauseVideo() { this.at = this.cur(); this.state = 2; clearTimeout(this.tm); this.rep = { t: this.at, at: performance.now() }; }
    seekTo(s) { (window.__seeks ??= []).push(s); this.at = s; if (this.state === 1) { this.t0 = performance.now(); window.__fakeZero = window.partyDebug.now() - s * 1000; } this.rep = { t: s, at: performance.now() }; }
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
  const api = async (path, body) => {
    const res = await fetch(`${BASE}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
    return { ok: res.ok, json: await res.json() };
  };
  const kept = await api(`/party/api/songs/${SONG}`, { firstBeatMs: FIRST, taps: 16, spreadMs: 20, calibrated: true });
  const refused = await api(`/party/api/songs/${SONG}`, { firstBeatMs: FIRST, taps: 3, spreadMs: 20, calibrated: true });
  const uncalibrated = await api(`/party/api/songs/${SONG}`, { firstBeatMs: FIRST + 200, taps: 16, spreadMs: 20 });

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
  await speaker.getByRole("button", { name: "开始" }).click();
  await speaker.waitForFunction(() => /^#[A-Z0-9]{4}$/.test(location.hash));
  const code = (await speaker.evaluate(() => location.hash)).slice(1);
  const phones = [];
  for (const name of ["Ann", "Bob"]) {
    const p = await (await browser.newContext({ ...devices["iPhone 13"], locale: "zh-CN" })).newPage();
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

  // ---- the host starts the song (just dance): the TV's delay first (the room's first dance),
  // Ann tapping TV_DELAY ms after each click; then the room waits for the video, and plays it
  await ann.evaluate((id) => window.partyDebug.act({ type: "START_LEARNING", routineId: id, mode: "dance" }), SONG);
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "calibrating");
  const calFirst = await ann.evaluate(() => /开跳前先量电视延迟/.test(document.body.innerText));
  await speaker.waitForFunction(() => window.partyDebug.cal()?.clicks?.length === 8);
  const clickTimes = await speaker.evaluate(() => window.partyDebug.cal().clicks);
  await ann.evaluate(
    ({ clicks, truth, delay }) => {
      for (const c of clicks) setTimeout(() => document.querySelector(".tap-pad").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), c - truth + delay - performance.now());
    },
    { clicks: clickTimes, truth: annTruth, delay: TV_DELAY },
  );
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "learning", null, { timeout: 30000 });
  const audioOffsetMs = await speaker.evaluate(() => window.partyDebug.state().audioOffsetMs);
  const waited = await speaker.evaluate(() => window.partyDebug.state() && true);
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
  await ann.evaluate(() => window.partyDebug.act({ type: "BACK_TO_LOBBY" }));
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "lobby");
  await speaker.waitForTimeout(300);
  const tubeAfter = await speaker.evaluate(() => window.partyDebug.tube().status);

  // ---- 找拍子: a song nobody has danced yet; Ann and Bob tap along to its video on their phones
  const bob = phones[1];
  const bobTruth = (await bob.evaluate(() => performance.timeOrigin)) - origin;
  await ann.evaluate((id) => window.partyDebug.act({ type: "START_LEARNING", routineId: id, mode: "dance" }), FIND_SONG);
  await ann.waitForFunction(() => /先找拍子/.test(document.body.innerText) && !!document.querySelector(".find .tap-pad"), null, { timeout: 10000 });
  const findShown = await speaker.evaluate(() => /先找拍子/.test(document.body.innerText));
  await speaker.waitForFunction(() => window.partyDebug.tube().status === "playing", null, { timeout: 15000 });
  await speaker.waitForTimeout(500);
  const zeroF = await speaker.evaluate(() => window.__fakeZero);
  const findBeat = 60000 / FIND_BPM;
  // (Ann from the beat's first, Bob joining in a few beats later; each a little off, their own way)
  // (as they hear it: from the TV, TV_DELAY late)
  const annF = Array.from({ length: 12 }, (_, i) => zeroF + FIND_FIRST + i * findBeat + TV_DELAY + 20 * Math.sin(i * 1.9));
  const bobF = Array.from({ length: 11 }, (_, i) => zeroF + FIND_FIRST + (i + 3) * findBeat + TV_DELAY + 15 + 25 * Math.sin(i * 2.7));
  const tapAt = (p, truth, ts) => p.evaluate((list) => { for (const t of list) setTimeout(() => document.querySelector(".find .tap-pad")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), t - performance.now()); }, ts.map((t) => t - truth));
  await tapAt(ann, annTruth, annF);
  await tapAt(bob, bobTruth, bobF);
  await speaker.waitForFunction(() => window.partyDebug.finding()?.sent === true, null, { timeout: 30000 }).catch(() => {});
  const found = await speaker.evaluate(() => window.partyDebug.finding());
  await ann.waitForFunction(() => window.partyDebug.state()?.phase === "dancing", null, { timeout: 30000 });
  await speaker.waitForFunction(() => window.partyDebug.tube().status === "playing", null, { timeout: 10000 });
  await speaker.waitForTimeout(4500);
  const zeroF2 = await speaker.evaluate(() => window.__fakeZero);
  const startF = await speaker.evaluate(() => window.partyDebug.state().routineStartAt);
  const bookF = (await api("/party/api/songs")).json[FIND_SONG];
  const findMoved = startF - (zeroF2 + FIND_FIRST);
  await speaker.screenshot({ path: (process.env.SHOT || "/tmp/song-yt.png").replace(/\.png$/, "-found.png") });
  await ann.evaluate(() => window.partyDebug.act({ type: "BACK_TO_LOBBY" }));
  await speaker.waitForFunction(() => window.partyDebug.state()?.phase === "lobby");

  // ---- 歌曲对拍 on the speaker page
  await speaker.getByRole("button", { name: /歌曲对拍/ }).click();
  await speaker.getByRole("button", { name: /Gentleman/ }).click();
  await speaker.waitForFunction(() => window.partyDebug.tube().status === "ready", null, { timeout: 15000 });
  await speaker.getByRole("button", { name: "放歌" }).click();
  await speaker.waitForFunction(() => window.partyDebug.tube().status === "playing", null, { timeout: 10000 });
  await speaker.waitForTimeout(2200);
  const zero2 = await speaker.evaluate(() => window.__fakeZero);
  const tapBeat = 60000 / TAP_BPM;
  const now2 = await speaker.evaluate(() => window.partyDebug.now());
  const j0 = Math.max(0, Math.ceil((now2 + 500 - (zero2 + TAP_FIRST)) / tapBeat));
  // (the first tap on a beat that is the song's first beat as far as the taps know: TAP_FIRST + j0 beats)
  // (heard from the TV: TV_DELAY late)
  const taps = Array.from({ length: 16 }, (_, i) => zero2 + TAP_FIRST + (j0 + i) * tapBeat + TV_DELAY + 12 * Math.sin(i * 2.1));
  await speaker.evaluate((ts) => { for (const t of ts) setTimeout(() => document.querySelector(".tap-pad")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), t - window.partyDebug.now()); }, taps);
  await speaker.waitForFunction(() => /对好了|没存上|再来/.test(document.querySelector(".tapalong")?.textContent ?? ""), null, { timeout: 16 * tapBeat + 8000 });
  const tapText = await speaker.locator(".tapalong").textContent();
  const book = (await api("/party/api/songs")).json;
  const expectFirst = TAP_FIRST + j0 * tapBeat;

  console.log(JSON.stringify({ tapText, kept, refused, uncalibrated, calFirst, audioOffsetMs, heldAt, stillHeld, pickedUp, resumedMoved: Math.round(resumedMoved), waited, moved: Math.round(moved), judged: judged && { verdict: judged.verdict, off: judged.off }, floor: floor && { best: floor.best, dancers: floor.dancers }, tubeAfter, findShown, found, bookF, findMoved: Math.round(findMoved), tapped: book[TAP_SONG], expectFirst: Math.round(expectFirst), errors }, null, 1));
  const checks = {
    "the songbook keeps a tap-along": kept.ok && kept.json.firstBeatMs === FIRST,
    "and turns away too few taps": !refused.ok,
    "and taps from a room that didn't measure its TV's delay": !uncalibrated.ok,
    "the room's first dance measures the TV's delay first (within 20 ms)": calFirst && Math.abs(audioOffsetMs - TV_DELAY) <= 20,
    "the room moved the beat to the video's (within 25 ms)": Math.abs(moved) <= 25,
    "Ann on the video's beats is on the beat": judged?.verdict === "hit" && Math.abs(judged.off) <= 40,
    "the floor counts her": (floor?.best ?? 0) >= 8,
    "暂停 holds the video, and the phones say so": Math.abs(stillHeld - heldAt) < 0.01 && pauseShown,
    "继续 picks the video up a moment and a half before where it stopped": typeof pickedUp === "number" && Math.abs(heldAt - 1.5 - pickedUp) <= 0.35,
    "after 继续 the room's beat is where the video's is (within 25 ms)": Math.abs(resumedMoved) <= 25,
    "the video goes away in the lobby": tubeAfter === "idle",
    "找拍子 shows on the phones and the TV": findShown,
    "找拍子 finds the first beat from Ann's and Bob's taps (within 25 ms), and the songbook keeps it": !!bookF && Math.abs(bookF.firstBeatMs - FIND_FIRST) <= 25 && bookF.taps >= 16,
    "then the song starts from its start, its beat where the video's is (within 25 ms)": Math.abs(findMoved) <= 25,
    "对拍 finds the song's first beat (within 20 ms)": !!book[TAP_SONG] && Math.abs(book[TAP_SONG].firstBeatMs - expectFirst) <= 20 && /对好了/.test(tapText ?? ""),
    "no page errors": errors.length === 0,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  console.log(failed.length ? `FAILED: ${failed.join("; ")}` : "OK");
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();

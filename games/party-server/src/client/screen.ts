// The speaker page, /party/screen: the room's clock, its sound, its coach. It runs on a Mac, an iPad
// or a phone mirrored to the TV (AirPlay), so the room hears it a little late: the host can measure
// how late from their phone. It opens the room as soon as it loads (a reload goes back into its own:
// the code is in the address), shows the code and the QR code, and reports its clock to the room
// every second, so the phones can set theirs by it. When a dance plays it plays its tune (tunes.ts,
// on synth.ts's instruments; the plain beat for a dance without one) or a song's video (tube.ts:
// YouTube's own player, in sight in the corner; it tells the room where the song's beat really is),
// the 3D coach dancing on it, the words, the floor together and everyone's little dancer; then the
// results.
// Nothing on it is for steering (Steve, 2026-11-12: the phones pick the songs and start them): it
// has no buttons, and speaks its host's phone's language. It asks for a tap only to set itself up,
// because a browser plays a page's sound only after a tap on it: one anywhere on the page, and on
// an iPhone or in Safari one more on the video, the first time (YouTube's player wants its own).
import qrcode from "qrcode-generator";
import { calibrateFromTaps, type CalibrationResult, type RoomState } from "../../../party-base/src/index";
import { COMBO_FULL, SONG_SYNC_MS, type Floor, type Results, type RoutineInfo, type ServerMsg } from "../shared/protocol";
import { PREVIEW_BEATS, anchorsOf, buildShow, danceStart, introOf, nextChange, planRun, runKey, spotAt, type RunBeat, type Show } from "../shared/show";
import { SONGS, type Song } from "../shared/songs";
import { ClockSync, PAGE_ORIGIN, RoomSocket, ScreenAwake, clockText, el, getLang, pageClock, setLang, tr, wsUrl } from "./common";
import { anyGl, canCoach, doingAt, glowOf } from "./coach/index";
import { Crowd, PLAYER_COLORS, type Dancer } from "./coach/crowd";
import { CoachStage } from "./coach/stage";
import { Synth, playBeat } from "./synth";
import { Tube, tapFirst } from "./tube";
import { tuneFor } from "./tunes";
import { awardName, awardWhy, bodyHint, clockOf, danceName, difficultyName, litCount, moveHow, moveName, moveOther, routineName, songArtist, songTitle, stageHint, stageName, stepsList } from "./words";

/** Calibration: 8 clicks, 1.2 s apart (so a tap up to 400 ms late still pairs with the right click). */
const CAL_CLICKS = 8;
const CAL_GAP_MS = 1200;
const CAL_LEAD_MS = 2000;
const CAL_TRIES = 3;
/** A calibration that says the room hears the sound this much EARLY paired taps with the wrong clicks. */
const CAL_MIN_OFFSET_MS = -100;
/** The fireworks when the floor fills its bar, this long. */
const FIREWORKS_MS = 2500;

const synth = new Synth();
const awake = new ScreenAwake();
let sock: RoomSocket | null = null;
let code: string | null = null;
let state: RoomState | null = null;
let routine: RoutineInfo | null = null;
let results: Results | null = null;
let floor: Floor | null = null;
let syncRtt: number | null = null;
let fatal: Extract<ServerMsg, { t: "fatal" }> | null = null;
let rejoining = false;
const heres = new Map<string, number>();
const sync = new ClockSync((id) => sock?.send({ t: "ping", id }), 10);

/** The calibration under way: its clicks, the host's taps, and how it came out. */
let cal: { clicks: number[]; taps: number[]; endAt: number; attempt: number; result: CalibrationResult | null; suspect: boolean } | null = null;
let calTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * What is playing: the show, its beats in speaker time (no TV delay: this page plays them, the room
 * hears them later), when the dance's beat 0 is, the next beat to schedule, and the 8-counts played
 * (for the bass line).
 */
interface Playing {
  key: string;
  show: Show | null;
  run: RunBeat[];
  zero: number | null;
  next: number;
  phrase: number;
}
let playing: Playing = { key: "", show: null, run: [], zero: null, next: 0, phrase: 0 };
/** How many times the beats were planned (the checks: the lead running into the dance plans nothing new). */
let plans = 0;
let fireworksUntil = 0;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Everyone's little dancer along the bottom of the TV (2D: every device draws it), and their pulses. */
const crowd = new Crowd(reducedMotion);
const pulses = new Map<string, { e: number; at: number; hitAt: number; shown: number; shownAt: number }>();
/** How slowly a little dancer calms down between its player's moves (ms): it shouldn't flicker beat by beat. */
const CALM_MS = 700;
/** The last hit's pop, and how many in a row (each a note higher) */
let popAt = 0;
let popStep = 0;
/** The 3D coach: undefined until first needed, null when this device can't draw it (the coach in words). */
let coach3d: CoachStage | null | undefined;

function coachStage(): CoachStage | null {
  if (coach3d === undefined) {
    try {
      coach3d = canCoach() ? new CoachStage(reducedMotion) : null;
    } catch {
      coach3d = null;
    }
  }
  return coach3d;
}

const app = document.getElementById("app")!;

// ---------- songs: YouTube's player lives outside #app, which the page redraws (an iframe moved or
// redrawn would load its video again); shown in the top left corner while a song is on

const tube = new Tube();
const tubeBox = el("div", "tube-box");
const tubeCaption = el("p", "tube-caption");
tubeBox.append(tube.box, tubeCaption);
document.body.append(tubeBox);
tube.onChange = () => renderTube();
/** This room has measured its TV's delay. */
let calibrated = false;
/** What this page has told the room about the song starting (once per start). */
let songReadySent = "";
let songFailedSent = "";
let songAtSent = 0;
/** When this page last told the room the song's video stopped (songStall), performance.now. */
let stallSent = 0;
/** The song's video hasn't played for this long though its moment has come: the dance waits for it. */
const STALL_MS = 1200;
/** The video tapped once while this page sets itself up (an iPhone, Safari): any song's will do. */
const SETUP_VIDEO = SONGS[0]!.videoId;

/**
 * Where this page is in setting itself up: its sound to turn on (a tap anywhere), YouTube's sound
 * (an iPhone or Safari: a tap on the video), done; or nothing to set up yet (no room).
 */
function setupStep(): "sound" | "video" | "done" | "none" {
  if (!sock || fatal) return "none";
  if (!synth.running) return "sound";
  if (!tube.armed && tube.status !== "bad" && tube.status !== "offline") return "video";
  return "done";
}

/** The song the room is on (learning, dancing, or its results), as a show. */
function currentSong(): { show: Show; song: Song } | null {
  if (!state || !routine || (state.phase !== "learning" && state.phase !== "dancing" && state.phase !== "results")) return null;
  const sh = buildShow(routine.routineId, routine.mode);
  return sh && sh.song ? { show: sh, song: sh.song } : null;
}

/**
 * Every 25 ms: the song's video. Ready (held at its start) while the room waits for it, then played
 * so its first beat lands where the room has the dance's; while it plays, where its beat really is
 * goes to the room when that's off.
 */
function songTick() {
  tube.tick();
  const cur = currentSong();
  // (setting up on an iPhone or in Safari: a video to tap once, before any song is picked)
  const setup = !cur && setupStep() === "video" && tapFirst();
  document.body.classList.toggle("has-tube", setup || !!cur);
  if (setup) {
    tube.load(SETUP_VIDEO);
    return;
  }
  if (!cur) {
    if (tube.status !== "idle") tube.unload();
    return;
  }
  tube.load(cur.song.videoId);
  const st = state!;
  const r = routine!;
  // 暂停: the video waits where it is
  if (r.pausedAt !== undefined) {
    tube.pause();
    return;
  }
  // the dance is over: the song fades out with it (it doesn't play on without the coach)
  if (st.phase === "results") {
    tube.fadeOut();
    return;
  }
  // held for the video (it stopped): it keeps trying to play; once it does, where it is goes to the
  // room, and the dance starts again from there
  if (r.heldAt !== undefined) {
    const z = st.phase === "dancing" && tube.playing ? tube.zero(600) : null;
    const local = performance.now();
    if (z !== null && local - songAtSent > 600) {
      sock?.send({ t: "songAt", startAt: z + (r.introMs ?? cur.show.introMs) });
      songAtSent = local;
    }
    return;
  }
  if (st.phase === "learning" && r.leadStartAt === null) {
    // the room waits for the video: held ready, or won't play here
    const key = `${r.routineId}|${r.mode}|${st.updatedAt ?? ""}`;
    // (Safari: not before someone has tapped the video once, or it would start without its sound)
    if (tube.ready && tube.armed && songReadySent !== key) {
      sock?.send({ t: "songReady" });
      songReadySent = key;
    }
    if ((tube.status === "bad" || tube.status === "offline") && songFailedSent !== key) {
      sock?.send({ t: "songFailed", why: tube.status });
      songFailedSent = key;
    }
    return;
  }
  const a = anchorsOf(st.phase, st.routineStartAt, r);
  if (!a) return;
  const start = danceStart(cur.show, a);
  if (start === null) return;
  tube.playAt(start - introOf(cur.show, a));
  // its moment has come and it isn't playing (stalled, an ad, stopped till someone taps it): the
  // dance waits for it, rather than going on without the song
  if (st.phase === "dancing" && pageClock() < start + cur.show.danceMs && tube.stuckMs() > STALL_MS && performance.now() - stallSent > 3000) {
    sock?.send({ t: "songStall" });
    stallSent = performance.now();
  }
  if (st.phase === "dancing" && st.routineStartAt !== null && tube.playing) {
    const z = tube.zero();
    const local = performance.now();
    if (z !== null && local - songAtSent > 1500) {
      const measured = z + introOf(cur.show, a);
      if (Math.abs(measured - st.routineStartAt) >= SONG_SYNC_MS) {
        sock?.send({ t: "songAt", startAt: measured });
        songAtSent = local;
      }
    }
  }
}

/** The line under the video: what it's doing, or what it needs. */
function renderTube() {
  const song = currentSong()?.song;
  const name = song ? `${songTitle(song)} · ${songArtist(song)}` : "";
  const text: Record<Tube["status"], string> = {
    idle: "",
    loading: tr("正在打开 YouTube……", "Opening YouTube…"),
    buffering: tr("正在准备歌（可能先静音放一段广告）", "Getting the song ready (there may be a muted ad first)"),
    ready: tr(`准备好了：${name}`, `Ready: ${name}`),
    starting: name,
    playing: name,
    tap: tr("在这台设备上点一下视频，歌才能出声", "Tap the video on this device so the song can play with sound"),
    offline: tr("连不上 YouTube", "Can't reach YouTube"),
    bad: tr("这个视频不让在别的网站放", "This video can't be played outside YouTube"),
  };
  // (setting up: the video waits for its one tap; a song picked before then asks for it too)
  const waiting = tube.status === "ready" && !tube.armed;
  const loading = tube.status === "loading" || tube.status === "buffering";
  if (!song) tubeCaption.textContent = waiting ? tr("点一下这个视频（只要这一次），歌才能出声", "Tap this video (just this once) so the songs can play with sound") : loading ? tr("正在准备视频……", "Getting the video ready…") : text[tube.status];
  else tubeCaption.textContent = waiting ? tr("第一次放歌：在这台设备上点一下视频，让它能出声", "The first song: tap the video on this device so it can play with sound") : text[tube.status];
  tubeCaption.classList.toggle("is-warn", waiting || tube.status === "tap" || tube.status === "bad" || tube.status === "offline");
}

// ---------- the room

/**
 * As the page loads: back into its own room (its code is in the address), or a new one. Its sound
 * too, where the browser lets it start without a tap (Chrome, come from a tap on /party's link);
 * elsewhere the first tap starts it (wake()).
 */
async function begin() {
  synth.start();
  void awake.on();
  const hash = location.hash.replace("#", "").toUpperCase();
  if (/^[A-HJ-NP-Z2-9]{4}$/.test(hash)) {
    rejoining = true;
    connect(hash);
  } else await openRoom();
  render();
}

/**
 * A tap anywhere on the page (the first ones): its sound on, since a browser starts a page's sound
 * only from a tap; the screen kept on; a phone turned sideways, once.
 */
let turned = false;
function wake() {
  if (!synth.running) synth.resume();
  if (!awake.held) void awake.on();
  if (!turned && sock) {
    turned = true;
    sideways();
  }
}
for (const type of ["pointerup", "touchend", "click", "keydown"]) document.addEventListener(type, wake, { capture: true, passive: true });

/**
 * A phone as the stage (mirrored to the TV, the TV shows its screen as it is): sideways and full
 * screen, where the browser lets a page do that after a tap (Android's Chrome). On an iPhone it
 * can't: the page asks to be turned (.rotate, upright only).
 */
function sideways() {
  if (!matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) > 600) return;
  const turn = () => {
    const o = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
    o?.lock?.("landscape").catch(() => {});
  };
  const root = document.documentElement;
  if (typeof root.requestFullscreen === "function" && !document.fullscreenElement) root.requestFullscreen({ navigationUI: "hide" }).then(turn, () => {});
  else turn();
}

async function openRoom() {
  rejoining = false;
  try {
    const res = await fetch("/party/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ speakerAt: pageClock() }) });
    const { code: c } = (await res.json()) as { code?: string };
    if (!c) throw new Error("no code");
    history.replaceState(null, "", `#${c}`);
    connect(c);
  } catch {
    fatal = { t: "fatal", key: "noRoom" };
    render();
  }
}

function connect(c: string) {
  code = c;
  fatal = null;
  sock = new RoomSocket(() => wsUrl(c, { role: "speaker" }), onMsg, (open) => {
    if (open) for (let i = 0; i < 5; i++) setTimeout(() => sync.ping(), i * 150);
    render();
  });
}

function onMsg(m: ServerMsg) {
  switch (m.t) {
    case "state": {
      const before = state?.phase;
      state = m.state;
      routine = m.routine;
      results = m.results;
      calibrated = m.calibrated === true;
      rejoining = false;
      // (this page has no buttons: it speaks its host's language)
      if (m.lang && m.lang !== getLang()) setLang(m.lang, false);
      if (state.phase !== "dancing") floor = null;
      if (state.phase === "results" && before === "dancing") synth.fanfare();
      if (state.phase === "lobby") pulses.clear();
      // a song starting (again): its video from its start
      if (routine?.routineId.startsWith("song-") && ((state.phase === "learning" && before !== "learning") || (state.phase === "dancing" && before === "results"))) tube.stop();
      plan();
      if (state.phase === "calibrating" && before !== "calibrating") startCalibration(1);
      if (state.phase !== "calibrating") stopCalibration();
      render();
      return;
    }
    case "floor": {
      const { t: _t, ...f } = m;
      if (floor && f.bursts > floor.bursts) {
        fireworksUntil = pageClock() + FIREWORKS_MS;
        coach3d?.burst(pageClock());
        synth.boom();
      } else if (floor && f.streak > floor.streak && Math.floor(f.streak / 8) > Math.floor(floor.streak / 8)) synth.sparkle();
      floor = f;
      renderStatus();
      return;
    }
    case "pong":
      if (sync.pong(m.id, m.serverAt)) {
        const est = sync.estimate();
        syncRtt = est.rttMs;
        // speaker time = room time + offset (the estimate: room ≈ performance.now() + est.offsetMs,
        // and speaker time is PAGE_ORIGIN + performance.now())
        sock?.send({ t: "clock", offsetMs: PAGE_ORIGIN - est.offsetMs, rttMs: est.rttMs });
      }
      return;
    case "tap":
      if (cal && !cal.result) cal.taps.push(m.at);
      renderStatus();
      return;
    case "here":
      heres.set(m.playerId, performance.now() + 1500);
      return;
    case "pulse": {
      const local = performance.now();
      const was = pulses.get(m.playerId);
      const hit = m.v === "hit";
      pulses.set(m.playerId, { e: m.e, at: local, hitAt: hit ? local : (was?.hitAt ?? 0), shown: was?.shown ?? 0, shownAt: was?.shownAt ?? local });
      if (hit && local - popAt > 90) {
        popStep = local - popAt < 700 ? popStep + 1 : 0;
        popAt = local;
        synth.pop(popStep);
      }
      return;
    }
    case "fatal":
      // a reload of a room that's gone: open a new one
      if (rejoining && (m.key === "noRoom" || m.key === "ended")) {
        void openRoom();
        return;
      }
      fatal = m;
      synth.hush();
      render();
      return;
    default:
      return;
  }
}

// ---------- calibration

function startCalibration(attempt: number) {
  stopCalibration();
  const t0 = pageClock() + CAL_LEAD_MS;
  const times = Array.from({ length: CAL_CLICKS }, (_, i) => t0 + i * CAL_GAP_MS);
  for (const t of times) synth.click(t, "cal");
  cal = { clicks: times, taps: [], endAt: times[times.length - 1]! + 1500, attempt, result: null, suspect: false };
  calTimer = setTimeout(finishCalibration, cal.endAt - pageClock());
  render();
}

function finishCalibration() {
  if (!cal || state?.phase !== "calibrating") return;
  const r = calibrateFromTaps(cal.clicks, cal.taps);
  cal.result = r;
  cal.suspect = r.ok && r.offsetMs < CAL_MIN_OFFSET_MS;
  if (r.ok && !cal.suspect) sock?.send({ t: "calibrated", audioOffsetMs: r.offsetMs });
  else if (cal.attempt < CAL_TRIES) {
    const next = cal.attempt + 1;
    calTimer = setTimeout(() => startCalibration(next), 2500);
  }
  render();
}

function stopCalibration() {
  if (calTimer) clearTimeout(calTimer);
  calTimer = null;
  if (cal && !cal.result) synth.hush();
  cal = null;
}

// ---------- the beat

/** The beats to play, planned again only when the run changes (show.ts's runKey). */
function plan() {
  const a = state ? anchorsOf(state.phase, state.routineStartAt, routine) : null;
  const show = a && routine ? buildShow(routine.routineId, routine.mode) : null;
  const key = show && a ? runKey(show, a) : "";
  if (key === playing.key) return;
  synth.hush();
  const run = show && a ? planRun(show, a) : [];
  const start = show && a ? danceStart(show, a) : null;
  // (beats gone by: a page reloaded mid-dance picks up at the next one)
  let next = 0;
  const now = pageClock();
  while (next < run.length && run[next]!.t < now - 5) next++;
  playing = { key, show, run, zero: show && a && start !== null ? start - a.fromBeat * show.beatMs : null, next, phrase: 0 };
  if (run.length) plans++;
}

/** Every 25 ms: the sounds of the next 150 ms go to the audio clock. */
function schedule() {
  const p = playing;
  if (!p.show) return;
  const now = pageClock();
  const until = now + 150;
  while (p.next < p.run.length && p.run[p.next]!.t <= until) {
    const b = p.run[p.next]!;
    const prev = p.next > 0 ? p.run[p.next - 1]! : null;
    if (b.count === 1 && b.stage !== "countdown" && prev) p.phrase++;
    // (a song's own music plays from its intro on: the synth only teaches its moves)
    const song = p.show.kind === "song" && (b.stage === "intro" || b.stage === "countdown" || b.stage === "dance");
    if (b.t >= now - 5 && !song) playBeat(synth, b, prev, p.phrase, p.show.kind === "metronome", tuneFor(p.show.routine?.id));
    p.next++;
  }
}
setInterval(() => {
  schedule();
  songTick();
}, 25);

/** The dance's grid (its beat 0, its tempo), for the timing check. */
function danceGrid() {
  const sh = playing.show;
  if (!sh || playing.zero === null) return null;
  return { bpm: sh.bpm, beatsPerBar: 4, startAt: playing.zero, totalBeats: sh.dance.length };
}

// ---------- the page

/** The clock readout for the timing checks and field tests: /party/screen?timing */
const measure = new URLSearchParams(location.search).has("timing");
const parts: {
  count?: HTMLElement;
  clock?: HTMLElement;
  status?: HTMLElement;
  players?: HTMLElement;
  coach?: HTMLElement;
  stage?: HTMLElement;
  hint?: HTMLElement;
  move?: HTMLElement;
  other?: HTMLElement;
  how?: HTMLElement;
  /** the move step by step (the songs' own moves), the count being danced lit up */
  steps?: HTMLElement;
  body?: HTMLElement;
  next?: HTMLElement;
  progress?: HTMLElement;
  floorBar?: HTMLElement;
  floorText?: HTMLElement;
} = {};
/** What the coach shows, so a frame only touches the page when it changes. */
let shown = "";
/** The move (and language) whose steps the coach's words show. */
let stepsOf = "";
/** The setup step the page shows (frame() redraws it when it moves on). */
let setupShown = "";

const running = () => !!state && (state.phase === "learning" || state.phase === "dancing") && playing.run.length > 0;

function render() {
  app.replaceChildren();
  for (const k of Object.keys(parts) as (keyof typeof parts)[]) parts[k] = undefined;
  shown = "";
  stepsOf = "";
  setupShown = setupStep();
  app.append(topBar());
  if (fatal) {
    const box = el("section", "start");
    box.append(el("h1", "title", fatal.key === "ended" ? tr("房间已结束", "The room has ended") : tr("开不了房间", "Couldn't open a room")));
    const again = el("button", "btn big", tr("开新房间", "Open a new room"));
    again.onclick = () => {
      history.replaceState(null, "", location.pathname);
      fatal = null;
      sock = null;
      void openRoom().then(render);
    };
    box.append(again);
    app.append(box);
    return;
  }
  const run = running();
  document.body.classList.toggle("is-run", run);
  const main = el("main", run ? "screen is-run" : "screen");
  main.append(joinCard(run));
  const stage = el("section", "stage");
  if (run) {
    const c = coach();
    stage.append(c);
    // (a phone as the stage, sideways: the 3D coach's parts laid out around a song's video)
    if (c.classList.contains("has-3d")) main.classList.add("has-3d");
  }
  else {
    // (setting up: the one tap for the sound, and on an iPhone the one on the video)
    if (state?.phase === "lobby" || state?.phase === "results") {
      const ask = setupCard();
      if (ask) stage.append(ask);
    }
    stage.append(el("h2", "phase", phaseTitle()));
    const sub = phaseText();
    if (sub) stage.append(el("p", "lead", sub));
    parts.count = el("div", "count");
    stage.append(parts.count);
    if (state?.phase === "results" && results) stage.append(resultsCard(results));
  }
  if (run) {
    // everyone's little dancer, along the bottom
    const host = el("div", "crowd");
    stage.append(host);
    requestAnimationFrame(() => crowd.attach(host));
  } else {
    parts.players = el("ul", "players");
  }
  parts.status = el("p", "status");
  stage.append(parts.status);
  if (parts.players) stage.append(parts.players);
  main.append(stage);
  app.append(main);
  app.append(rotatePrompt());
  if (measure) {
    parts.clock = el("div", "measure-clock");
    app.append(parts.clock);
  }
  renderStatus();
  renderTube();
}

/** A phone as the stage, held upright: turn it sideways (shown only then, party.css's .rotate). */
function rotatePrompt(): HTMLElement {
  const box = el("div", "rotate");
  box.append(el("div", "rotate-phone"));
  box.append(el("p", "rotate-title", tr("把手机横过来", "Turn the phone sideways")));
  box.append(el("p", "lead", tr("这台手机是舞台：投屏到电视，横着放，电视上就是满屏的老师和大家的小人。画面没跟着转的话，在控制中心关掉竖屏方向锁定。", "This phone is the stage: mirrored to the TV and turned sideways, the coach and everyone's dancers fill the TV. If the screen doesn't turn, switch off the portrait orientation lock in Control Center.")));
  box.append(el("p", "lead", tr("它只当舞台，不参与游玩：大家用自己的手机扫码加入。", "It's only the stage, not a player: everyone joins with their own phone.")));
  if (setupStep() === "sound") box.append(el("p", "lead", tr("横过来以后点一下屏幕，打开声音。", "Then tap the screen to turn the sound on.")));
  return box;
}

/** The name, and nothing to press (the language is the host's phone's). */
function topBar(): HTMLElement {
  const bar = el("header", "bar");
  bar.append(el("span", "brand", tr("一起跳", "Dance Along")));
  return bar;
}

/**
 * Setting up, in the lobby: what this device still needs, the one time. The whole page takes the
 * tap for the sound (the card is a button too, for a keyboard); the video's tap is YouTube's own.
 */
function setupCard(): HTMLElement | null {
  const step = setupStep();
  if (step === "sound") {
    const b = el("button", "btn big setup");
    b.append(el("span", "setup-title", tr("点一下屏幕，打开声音", "Tap the screen to turn the sound on")));
    b.append(el("span", "setup-lead", tr("这台设备只当舞台：点这一下就好，之后选歌、开始都在大家自己的手机上。", "This device is only the stage: one tap now, and from then on songs are picked and started on everyone's own phones.")));
    // (the tap itself is wake()'s, on the whole page)
    return b;
  }
  if (step === "video") {
    const box = el("section", "setup is-video");
    box.append(el("p", "setup-title", tr("再点一下左上角的视频", "Now tap the video in the top left")));
    box.append(el("p", "setup-lead", tr("iPhone、iPad 和 Safari 要在视频上点过一次，歌才能出声。只要这一次。", "iPhones, iPads and Safari play a video's sound only after a tap on it. Just this once.")));
    return box;
  }
  return null;
}

/** The code and the QR code: big while people join, small while a dance plays (latecomers can still join). */
function joinCard(small: boolean): HTMLElement {
  const join = el("section", small ? "join-card small" : "join-card");
  if (!code) return join;
  const url = `${location.origin}/party/r/${code}`;
  join.append(el("div", "code", code));
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  const pic = el("div", "qr");
  pic.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  join.append(pic);
  join.append(el("p", "hint", tr("手机扫码加入，或打开", "Scan to join, or open")));
  join.append(el("p", "url", url.replace(/^https?:\/\//, "")));
  return join;
}

function phaseTitle(): string {
  if (!state) return tr("连接中……", "Connecting…");
  if (routine?.pausedAt !== undefined && (state.phase === "learning" || state.phase === "dancing")) return tr("暂停", "Paused");
  if (routine?.heldAt !== undefined && state.phase === "dancing") return tr("等视频", "Waiting for the video");
  switch (state.phase) {
    case "lobby":
      return state.players.length ? tr("人到齐了，主人在手机上选歌", "When everyone's in, the host picks a song") : tr("等大家扫码加入", "Waiting for people to join");
    case "calibrating":
      return tr("量电视的延迟：跟着声音点", "Measuring the TV's delay: tap with the sound");
    case "learning":
      return tr("准备好，主人点「开始跳」", "Get ready: the host starts the dance");
    case "dancing":
      return tr("跳！", "Dance!");
    case "results":
      return tr("跳完了", "That's the song");
    case "ended":
      return tr("房间已结束", "The room has ended");
  }
}

function phaseText(): string {
  if (!state) return "";
  if (routine?.pausedAt !== undefined && (state.phase === "learning" || state.phase === "dancing")) return tr("主人点「继续」就接着跳，会先倒回去放一小段。", "When the host taps Carry on, it picks up from here, after a short run-up.");
  if (routine?.heldAt !== undefined && state.phase === "dancing") {
    return tube.status === "tap" || tube.status === "ready"
      ? tr("视频停了：在这台设备上点一下视频，舞跟着接上。", "The video stopped: tap it on this device and the dance picks up with it.")
      : tr("视频卡住了，大家先停一下；视频一动，舞就从那里接上。", "The video is stuck: everyone hold on. The dance picks up as soon as it plays again.");
  }
  if (state.phase === "calibrating") {
    if (cal?.result && (!cal.result.ok || cal.suspect)) {
      const why = cal.suspect ? tr("点的和声音对不上", "the taps didn't line up with the sound") : cal.result.reason === "too_few_taps" ? tr("点得太少", "too few taps") : tr("点得太散", "the taps were too spread out");
      return cal.attempt < CAL_TRIES ? tr(`没成功（${why}），马上再来一次。`, `That didn't work (${why}). Again in a moment.`) : tr(`没成功（${why}）。主人可以跳过，回到大厅再校准一次。`, `That didn't work (${why}). The host can skip it and calibrate again from the lobby.`);
    }
    return tr("会响 8 下，主人听到电视里的声音，就在手机的大按钮上点一下。量好了，手机上的拍子和电视里的声音就对得上。", "8 sounds: each time the host hears one from the TV, they tap the big button on their phone. Then the phones' beat matches what the TV plays.");
  }
  if (state.phase === "lobby") {
    const bits = [tr("开始前，每个人身边留出一臂的空间。", "Before you start, give everyone an arm's length of space.")];
    if (setupStep() === "done") bits.push(tr("这台设备不用再碰：选歌、开始、暂停都在主人的手机上。", "Nothing more to do on this device: the host's phone picks, starts and pauses."));
    if (calibrated) bits.push(tr(`已校准：电视比这台设备晚 ${state.audioOffsetMs} 毫秒。`, `Calibrated: the TV is ${state.audioOffsetMs} ms behind this device.`));
    return bits.join(" ");
  }
  return "";
}

/**
 * The coach while a dance plays: the 3D coach dancing each move on the beat (coach/), with the words
 * beside it: the stage, the move in both languages and how to do it, the count, what's next. Without
 * a graphics chip for it, the words alone. Filled in every frame.
 */
function coach(): HTMLElement {
  const stage3d = coachStage();
  const box = el("div", stage3d ? "coach has-3d" : "coach");
  const r = playing.show?.routine;
  const song = playing.show?.song;
  const top = el("div", "coach-top");
  top.append(el("p", "coach-dance", song ? `${songTitle(song)} · ${songArtist(song)}` : r ? `${routineName(r)} · ${difficultyName(r.difficulty)}` : tr("120 拍节拍器", "120 BPM metronome")));
  // (shown on a phone as the stage, where the code and QR beside the coach don't fit)
  if (code) top.append(el("p", "coach-room", `${tr("房间", "Room")} ${code}`));
  parts.progress = el("p", "coach-progress");
  top.append(parts.progress);
  // the words beside the count (or beside the 3D coach): the whole coach fits a TV without scrolling
  const main = el("div", "coach-main");
  const words = el("div", "coach-words");
  parts.stage = el("h2", "phase");
  parts.hint = el("p", "lead");
  parts.move = el("p", "coach-move");
  parts.other = el("p", "coach-other");
  parts.how = el("p", "coach-how");
  parts.steps = el("div", "coach-steps-slot");
  parts.body = el("p", "coach-body");
  parts.count = el("div", "count");
  parts.next = el("p", "coach-next");
  if (stage3d) {
    const host = el("div", "coach-3d");
    words.append(parts.stage, parts.hint, parts.move, parts.other, parts.how, parts.steps, parts.body);
    const side = el("div", "coach-side");
    side.append(words, parts.count, parts.next);
    main.append(host, side);
    // (after the box is on the page: the canvas takes the host's size)
    requestAnimationFrame(() => stage3d.attach(host));
  } else {
    words.append(parts.stage, parts.hint, parts.move, parts.other, parts.how, parts.steps, parts.body);
    main.append(words, parts.count);
  }
  const fl = el("div", "floor");
  parts.floorBar = el("div", "floor-bar");
  parts.floorBar.append(el("i"));
  parts.floorText = el("span", "floor-text");
  fl.append(parts.floorBar, parts.floorText);
  if (stage3d) box.append(top, main, fl);
  else box.append(top, main, parts.next, fl);
  return box;
}

function resultsCard(r: Results): HTMLElement {
  const box = el("div", "results");
  const name = (id: string | null) => (id ? (r.players.find((p) => p.id === id)?.name ?? "") : "");
  const dn = danceName(r.routineId);
  if (dn) box.append(el("p", "coach-dance", `${dn} · ${difficultyName(r.difficulty)}`));
  if (!r.players.length) {
    box.append(el("p", "lead", tr("这一首没有人跟着动手机。下一首拿着手机跳，或者每一拍点一下，就能上榜。", "No phone moved this time. Dance with your phone in hand, or tap it on every beat, to get on the board.")));
    return box;
  }
  const awards = el("ul", "awards");
  for (const k of ["steady", "hype", "effort"] as const) {
    const who = name(r.awards[k]);
    if (!who) continue;
    const li = el("li", "award");
    li.append(el("span", "award-name", awardName(k)), el("span", "award-who", who), el("span", "award-why", awardWhy(k)));
    awards.append(li);
  }
  box.append(awards);
  const bits = [tr(`全场一起动了 ${r.together}%`, `Together: ${r.together}% of the beats`), tr(`最长连击 ${r.bestStreak} 拍`, `Best streak: ${r.bestStreak} beats`)];
  if (r.bursts) bits.push(tr(`放了 ${r.bursts} 次烟花`, `${r.bursts}× fireworks`));
  box.append(el("p", "lead", bits.join(" · ")));
  // easy: no ranking, only the awards; medium and hard: the scores
  if (r.difficulty !== "easy") {
    const board = el("ol", "board");
    for (const p of [...r.players].sort((a, b) => b.participation - a.participation)) {
      const li = el("li", "board-row");
      li.append(el("span", "board-name", p.name), el("span", "board-score", String(p.participation)));
      board.append(li);
    }
    box.append(board);
  }
  return box;
}

function renderStatus() {
  if (parts.status) {
    const bits: string[] = [];
    if (state?.phase === "calibrating" && cal) bits.push(tr(`收到 ${cal.taps.length} / ${CAL_CLICKS} 下`, `${cal.taps.length} / ${CAL_CLICKS} taps`));
    // (in the lobby the setup card asks for it)
    if (!synth.running && state?.phase !== "lobby" && state?.phase !== "results") bits.push(tr("声音没开：点一下页面", "Sound is off: tap the page"));
    if (!awake.held) bits.push(tr("屏幕可能会自己熄灭", "The screen may turn itself off"));
    if (sock && !sock.isOpen) bits.push(tr("连接断了，正在重连", "Connection lost, reconnecting"));
    parts.status.textContent = bits.join(" · ");
  }
  if (parts.players && state) {
    const now = performance.now();
    const levels = state.phase === "dancing" ? (floor?.levels ?? {}) : {};
    parts.players.replaceChildren(
      ...state.players.map((p) => {
        const li = el("li", (heres.get(p.id) ?? 0) > now ? "player here" : "player", p.name);
        if (p.isHost) li.append(el("span", "host", tr("主人", "host")));
        const lv = levels[p.id];
        if (lv !== undefined) {
          const meter = el("span", lv >= 0.75 ? "meter is-hot" : "meter");
          const fill = el("i");
          fill.style.width = `${Math.round(lv * 100)}%`;
          meter.append(fill);
          li.append(meter);
        }
        return li;
      }),
    );
  }
  if (parts.floorBar && parts.floorText) {
    const f = floor;
    const fill = parts.floorBar.firstElementChild as HTMLElement | null;
    const share = f && f.streak ? (f.streak % COMBO_FULL === 0 ? 1 : (f.streak % COMBO_FULL) / COMBO_FULL) : 0;
    if (fill) fill.style.width = `${Math.round(share * 100)}%`;
    parts.floorText.textContent = f && f.dancers ? tr(`全场连击 ${f.streak} · ${f.dancers} 人在跳`, `Floor streak ${f.streak} · ${f.dancers} dancing`) : tr("拿着手机跳，或者每一拍点一下：全场一起涨连击", "Dance with your phone, or tap it on every beat: the whole floor builds the streak");
  }
}

/** The coach's words for this moment (when they change: once a beat). */
function frameCoach(now: number) {
  const p = playing;
  const show = p.show;
  if (!show || !parts.stage) return;
  const spot = spotAt(p.run, now);
  const b = spot ? p.run[spot.i]! : null;
  const nx = spot ? nextChange(p.run, spot.i, spot.frac) : null;
  const preview = nx && nx.beats <= PREVIEW_BEATS ? nx.beat : null;
  const metronome = show.kind === "metronome";
  const into = b?.stage === "dance" && p.zero !== null ? Math.min(show.danceMs, Math.max(0, now - p.zero)) : null;
  const key = `${spot?.i ?? -1}|${preview ? `${preview.stage}${preview.move?.id}` : ""}|${getLang()}|${into === null ? "" : Math.floor(into / 1000)}`;
  if (key === shown) return;
  shown = key;
  document.body.classList.toggle("fireworks", now < fireworksUntil);
  if (!b) {
    // before the first beat, or after the last
    parts.stage.textContent = p.run.length && now < p.run[0]!.t ? tr("马上开始", "Starting in a moment") : tr("跳完了", "That's the song");
    parts.hint!.textContent = "";
    parts.move!.textContent = parts.other!.textContent = parts.how!.textContent = parts.body!.textContent = parts.count!.textContent = parts.next!.textContent = parts.progress!.textContent = "";
    parts.steps?.replaceChildren();
    stepsOf = "";
    return;
  }
  parts.stage.textContent = stageName(b.stage);
  parts.hint!.textContent = stageHint(b.stage, metronome);
  parts.move!.textContent = b.move ? moveName(b.move) : metronome && b.stage !== "countdown" ? tr("跟着拍子", "With the beat") : "";
  parts.other!.textContent = b.move ? moveOther(b.move) : "";
  // a song's own move: step by step, the count being danced lit up (the one line above it is the gist)
  const steps = b.move ? `${b.move.id}|${getLang()}` : "";
  if (steps !== stepsOf && parts.steps) {
    stepsOf = steps;
    const list = b.move ? stepsList(b.move) : null;
    parts.steps.replaceChildren(...(list ? [list] : []));
  }
  litCount(parts.steps, b.count);
  parts.how!.textContent = b.move ? moveHow(b.move) : "";
  parts.body!.textContent = b.move ? bodyHint(b.move) : "";
  parts.count!.textContent = String(b.count);
  parts.next!.textContent = preview ? `${tr("接下来：", "Next: ")}${preview.move ? moveName(preview.move) : stageName(preview.stage)}${preview.stage !== b.stage && preview.move ? ` · ${stageName(preview.stage)}` : ""}` : "";
  parts.progress!.textContent = into === null ? "" : `${clockOf(into)} / ${clockOf(show.danceMs)}`;
}

/** The 3D coach's first frames, timed: too slow on this device, and it gives way to the words. */
const watch3d = { gaps: [] as number[], last: 0 };
const WATCH_FRAMES = 90;
const SLOW_FRAME_MS = 50;

/** The 3D coach this frame: the move on the beat the speaker plays now, or standing by. */
function frame3d(now: number) {
  const c = coach3d;
  if (!c) return;
  if (watch3d.gaps.length < WATCH_FRAMES && !anyGl()) {
    const t = performance.now();
    if (watch3d.last && t - watch3d.last < 1000) watch3d.gaps.push(t - watch3d.last);
    watch3d.last = t;
    if (watch3d.gaps.length === WATCH_FRAMES) {
      const mid = [...watch3d.gaps].sort((a, b) => a - b)[WATCH_FRAMES >> 1]!;
      if (mid > SLOW_FRAME_MS) {
        c.dispose();
        coach3d = null;
        render();
        return;
      }
    }
  }
  const p = playing;
  // dressed for the song (its outfit, how big, its faces); itself for the library's dances
  c.dress(p.show?.song?.id ?? null);
  const spot = spotAt(p.run, now);
  const f = floor;
  const hype = f && f.streak ? (f.streak % COMBO_FULL) / COMBO_FULL : 0;
  if (!spot) {
    c.frame({ doing: { kind: "idle" }, p: 0, beat: 0, now, glow: { hands: 0, feet: 0 }, hype: 0 });
    return;
  }
  const b = p.run[spot.i]!;
  const { doing, p: pos } = doingAt(b, spot.frac);
  c.frame({ doing, p: pos, beat: spot.i + spot.frac, now, glow: glowOf(b.move), hype });
}

/** Everyone's little dancer: the coach's move now, as hard as each of them is moving. */
function frameCrowd(now: number) {
  if (!state) return;
  const spot = spotAt(playing.run, now);
  const b = spot ? playing.run[spot.i]! : null;
  const { doing, p: pos } = b && spot ? doingAt(b, spot.frac) : { doing: { kind: "idle" } as const, p: 0 };
  const local = performance.now();
  const list: Dancer[] = state.players.map((pl, i) => {
    const pu = pulses.get(pl.id);
    // up at once, down slowly
    if (pu) {
      pu.shown = Math.max(pu.e, pu.shown * Math.exp(-Math.max(0, local - pu.shownAt) / CALM_MS));
      pu.shownAt = local;
    }
    return { id: pl.id, name: pl.name, color: PLAYER_COLORS[i % PLAYER_COLORS.length]!, e: pu?.shown ?? 0, at: pu?.at ?? -1e9, hitAt: pu?.hitAt ?? 0 };
  });
  crowd.frame(doing, pos, now / 1000, local, list);
}

/** Every frame: the coach, the big count, the "I'm here" lights, the timing readout, the setup's next step. */
function frame() {
  const now = pageClock();
  // (the sound comes on a moment after its tap; the video's tap is seen by tube.ts)
  if (setupStep() !== setupShown && !running()) render();
  if (running()) {
    frameCoach(now);
    frame3d(now);
    frameCrowd(now);
  }
  else if (parts.count) {
    // (the metronome before its start: nothing to count)
    if (parts.count.textContent) parts.count.textContent = "";
  }
  if (parts.players && state) {
    // (redrawn only when who's lit up changes; the lights are on this page's own clock)
    const local = performance.now();
    const lit = state.players.filter((p) => (heres.get(p.id) ?? 0) > local).map((p) => p.id).join(",");
    if (lit !== (parts.players.dataset.lit ?? "")) {
      parts.players.dataset.lit = lit;
      renderStatus();
    }
  }
  if (parts.clock) {
    parts.clock.textContent = `${clockText(now)}${syncRtt !== null ? `\n${tr("到服务器往返", "round trip to the room")} ${Math.round(syncRtt)} ms` : ""}${state ? `\n${tr("电视延迟", "TV delay")} ${state.audioOffsetMs} ms` : ""}`;
  }
  requestAnimationFrame(frame);
}

// the speaker's clock goes to the room every second
setInterval(() => {
  if (sock?.isOpen) sync.ping();
}, 1000);
// (a page left in the background stops its audio clock on some browsers: wake() starts it again
// with the next tap)

// for scripts/timing-check.cjs and scripts/song-check.cjs: what this page plays and shows
Object.assign(window, {
  partyDebug: {
    cal: () => cal,
    grid: danceGrid,
    run: () => playing.run.map((b) => ({ t: b.t, ms: b.ms, stage: b.stage, move: b.move?.id ?? null, count: b.count, score: b.score, danceBeat: b.danceBeat })),
    floor: () => floor,
    results: () => results,
    plans: () => plans,
    /** speaker time now, and its origin (the checks turn it into another page's clock) */
    now: pageClock,
    origin: () => PAGE_ORIGIN,
    sync: () => sync.estimate(),
    state: () => state,
    pulses: () => Object.fromEntries(pulses),
    tube: () => ({ status: tube.status, zero: tube.zero() }),
    /** the dance's end, for the checks: the song fades out */
    fade: () => tube.fadeOut(),
    routine: () => routine,
    /** what this page still needs to set itself up */
    setup: setupStep,
  },
});

setLang(getLang(), false);
render();
requestAnimationFrame(frame);
void begin();

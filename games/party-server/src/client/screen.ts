// The speaker page, /party/screen: the room's clock, its sound, its coach. It runs on a Mac or an
// iPad mirrored to the TV (AirPlay), so the room hears it a little late: the calibration measures how
// late. It opens the room, shows the code and the QR code, and reports its clock to the room every
// second, so the phones can set theirs by it. When a dance plays it plays its tune (tunes.ts, on
// synth.ts's instruments; the plain beat for a dance without one) or a song's video (tube.ts:
// YouTube's own player, in sight in the corner; it tells the room where the song's beat really
// is), the 3D coach dancing on it, the words, the floor together and everyone's little dancer;
// then the results. A song nobody has danced yet starts with 找拍子: its video plays
// and everyone taps along on their phones until this page has the beat, kept in the songbook for
// every room; then the song starts from its start. In the lobby: 歌曲对拍, tapping along to a song
// on this page alone (to do one again).
import qrcode from "qrcode-generator";
import { calibrateFromTaps, type CalibrationResult, type RoomState } from "../../../party-base/src/index";
import { COMBO_FULL, SONG_SYNC_MS, type Floor, type Results, type RoutineInfo, type ServerMsg } from "../shared/protocol";
import { PREVIEW_BEATS, anchorsOf, buildShow, danceStart, introOf, nextChange, planRun, runKey, spotAt, type RunBeat, type Show } from "../shared/show";
import { SONGS, songById, type Song } from "../shared/songs";
import { TAPS_WANTED, tapAlong, tapIn } from "../shared/tapalong";
import { ClockSync, PAGE_ORIGIN, RoomSocket, ScreenAwake, clockText, el, getLang, pageClock, setLang, tapTime, tr, wsUrl } from "./common";
import { anyGl, canCoach, doingAt, glowOf } from "./coach/index";
import { Crowd, PLAYER_COLORS, type Dancer } from "./coach/crowd";
import { CoachStage } from "./coach/stage";
import { Synth, playBeat } from "./synth";
import { Tube } from "./tube";
import { tuneFor } from "./tunes";
import { awardName, awardWhy, bodyHint, clockOf, danceName, difficultyName, moveHow, moveName, moveOther, routineName, songArtist, songTitle, stageHint, stageName } from "./words";

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
tube.onChange = () => {
  renderTube();
  renderFind();
};
/** This room has measured its TV's delay: a song's beat tapped here is right for every room. */
let calibrated = false;
/** Each song's first beat as tapped along to (the songbook, /party/api/songs). */
let songbook: Record<string, { firstBeatMs: number }> = {};
/** What this page has told the room about the song starting (once per start). */
let songReadySent = "";
let songFailedSent = "";
let songAtSent = 0;
/** 歌曲对拍: the panel open, the song being tapped along to, its taps (speaker time), how it came out. */
let tapPanel = false;
let tapSong: Song | null = null;
let tapTaps: number[] = [];
let tapResult = "";
let tapPosting = false;
/**
 * 找拍子: the song being found (its run's key), everyone's taps so far (speaker time, and whose), the
 * video's start they go by, whether the beat went to the room, and what the TV says about it.
 */
let finding: { key: string; taps: { at: number; who: string }[]; zero: number | null; goAt: number | null; sent: boolean; note: string } | null = null;
/** 找拍子 gives up when the video is this far in with no beat found (ms). */
const FIND_GIVE_UP_MS = 90_000;
/** 找拍子 goes by the latest taps: this many at most (earlier ones may have been people finding the beat). */
const FIND_KEEP = 32;

async function loadSongbook() {
  try {
    const res = await fetch("/party/api/songs", { cache: "no-store" });
    if (res.ok) songbook = (await res.json()) as typeof songbook;
  } catch {
    // (no songbook just now: the songs show as not tapped)
  }
  if (tapPanel) render();
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
  const tapping = tapPanel && tapSong !== null && state?.phase === "lobby";
  const cur = tapping ? null : currentSong();
  document.body.classList.toggle("has-tube", tapping || !!cur);
  if (tapping) return;
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
  if (st.phase === "learning" && r.leadStartAt === null && r.tapIn) {
    findTick(cur.song, `${r.routineId}|${r.mode}|${st.updatedAt ?? ""}`);
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
  if (st.phase === "results") return;
  const a = anchorsOf(st.phase, st.routineStartAt, r);
  if (!a) return;
  const start = danceStart(cur.show, a);
  if (start === null) return;
  tube.playAt(start - introOf(cur.show, a));
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

/**
 * 找拍子, every 25 ms: the video from its start (Safari: once someone has tapped it), everyone's taps
 * against it; with enough of them that agree, the song's first beat goes to the room (songTapped).
 */
function findTick(song: Song, key: string) {
  if (finding?.key !== key) {
    finding = { key, taps: [], zero: null, goAt: null, sent: false, note: "" };
    render();
  }
  const f = finding;
  if (tube.status === "bad" || tube.status === "offline") {
    if (songFailedSent !== key) {
      sock?.send({ t: "songFailed", why: tube.status });
      songFailedSent = key;
    }
    return;
  }
  // (asked once, for one moment: asked again and again for "now", it would never start)
  if (tube.ready) tube.playAt((f.goAt ??= pageClock() + 400));
  if (!tube.playing || f.sent) return;
  const z = tube.zero();
  if (z === null) return;
  // (the video stalled or jumped: taps from before go by another start)
  if (f.zero !== null && Math.abs(z - f.zero) > 60) {
    f.taps = [];
    f.note = tr("歌卡了一下，接着点", "The song stalled: keep tapping");
    renderFind();
  }
  f.zero = z;
  const into = pageClock() - z;
  if (into > FIND_GIVE_UP_MS && songFailedSent !== key) {
    sock?.send({ t: "songFailed", why: "notap" });
    songFailedSent = key;
  }
}

/** A tap for 找拍子 (speaker time): from a phone, or this page's own button. */
function findTap(at: number, who: string) {
  const f = finding;
  if (!f || f.sent || !tube.playing || state?.phase !== "learning" || !routine?.tapIn) return;
  f.taps.push({ at, who });
  if (f.taps.length > FIND_KEEP) f.taps.splice(0, f.taps.length - FIND_KEEP);
  if (who !== "speaker") heres.set(who, performance.now() + 250);
  const song = currentSong()?.song;
  if (song && f.zero !== null && f.taps.length >= TAPS_WANTED) {
    const off = state.audioOffsetMs ?? 0;
    const beatMs = 60000 / song.bpm;
    const r = tapIn(
      f.taps.map((t) => t.at - off - f.zero!).filter((t) => t >= 0),
      beatMs,
    );
    if (r.ok) {
      // (the dance has to be over before the video is: a beat found late moves back whole 8-counts)
      const duration = tube.durationMs();
      let first = r.firstBeatMs;
      while (duration !== null && first + song.beats * beatMs > duration - 1000 && first - 8 * beatMs >= 0) first -= 8 * beatMs;
      sock?.send({ t: "songTapped", firstBeatMs: Math.round(first), taps: r.taps, spreadMs: r.spreadMs, durationMs: duration });
      f.sent = true;
      f.note = tr("找到拍子了！从头开始放", "Found the beat! From the top");
    } else f.note = r.why === "few" ? "" : tr("还没对齐：听鼓点，一拍点一下", "Not together yet: listen for the drums, one tap a beat");
  }
  renderFind();
}

/** The line under the video: what it's doing, or what it needs. */
function renderTube() {
  const song = tapPanel && tapSong ? tapSong : currentSong()?.song;
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
  const waiting = tube.status === "ready" && !tube.armed && !!currentSong();
  tubeCaption.textContent = waiting ? tr("第一次放歌：在这台设备上点一下视频，让它能出声", "The first song: tap the video on this device so it can play with sound") : text[tube.status];
  tubeCaption.classList.toggle("is-warn", waiting || tube.status === "tap" || tube.status === "bad" || tube.status === "offline");
}

// ---------- the room

async function begin() {
  sideways();
  synth.start();
  void awake.on();
  void loadSongbook();
  const hash = location.hash.replace("#", "").toUpperCase();
  if (/^[A-HJ-NP-Z2-9]{4}$/.test(hash)) {
    rejoining = true;
    connect(hash);
  } else await openRoom();
  render();
}

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
      const wasTapIn = !!routine?.tapIn && before === "learning";
      state = m.state;
      routine = m.routine;
      results = m.results;
      calibrated = m.calibrated === true;
      rejoining = false;
      if (state.phase !== "dancing") floor = null;
      if (state.phase === "results" && before === "dancing") synth.fanfare();
      if (state.phase === "lobby") pulses.clear();
      // a song starting (again), or 找拍子 done: its video from its start
      const found = wasTapIn && !routine?.tapIn && state.phase === "learning";
      if (routine?.routineId.startsWith("song-") && ((state.phase === "learning" && before !== "learning") || (state.phase === "dancing" && before === "results") || found)) tube.stop();
      if (!routine?.tapIn || state.phase !== "learning") finding = null;
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
      else if (finding) findTap(m.at, m.playerId);
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

let measure = false;
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
  body?: HTMLElement;
  next?: HTMLElement;
  progress?: HTMLElement;
  floorBar?: HTMLElement;
  floorText?: HTMLElement;
  findCount?: HTMLElement;
  findNote?: HTMLElement;
} = {};
/** What the coach shows, so a frame only touches the page when it changes. */
let shown = "";

const running = () => !!state && (state.phase === "learning" || state.phase === "dancing") && playing.run.length > 0;

function render() {
  app.replaceChildren();
  for (const k of Object.keys(parts) as (keyof typeof parts)[]) parts[k] = undefined;
  shown = "";
  app.append(topBar());
  if (!sock && !fatal) {
    const box = el("section", "start");
    box.append(el("h1", "title", tr("一起跳 · 音箱端", "Dance Along · Speaker")));
    box.append(el("p", "lead", tr("这台设备是舞台：出声、计时、放老师，不参与游玩。投屏到电视（AirPlay 镜像到 Apple TV），手机横过来，音量开大，再点开始。大家用自己的手机扫码加入。", "This device is the stage: it plays the sound, keeps the time and shows the coach, and isn't a player. Mirror it to the TV (AirPlay to Apple TV), turn a phone sideways, turn the volume up, then start. Everyone joins with their own phone.")));
    const go = el("button", "btn big", tr("开始", "Start"));
    go.onclick = () => void begin();
    box.append(go);
    app.append(box);
    return;
  }
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
  else if (state?.phase === "learning" && routine?.tapIn) stage.append(findPanel());
  else if (tapPanel && state?.phase === "lobby") stage.append(tapAlongPanel());
  else {
    stage.append(el("h2", "phase", phaseTitle()));
    const sub = phaseText();
    if (sub) stage.append(el("p", "lead", sub));
    parts.count = el("div", "count");
    stage.append(parts.count);
    if (state?.phase === "results" && results) stage.append(resultsCard(results));
    if (state?.phase === "lobby") {
      const b = el("button", "btn quiet", tr("歌曲对拍：一首歌的拍子不准时，在这里重新点一次", "Tap along to a song: when a song's beat is off, tap it again here"));
      b.onclick = () => {
        tapPanel = true;
        void loadSongbook();
        render();
      };
      stage.append(b);
    }
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
  return box;
}

function topBar(): HTMLElement {
  const bar = el("header", "bar");
  bar.append(el("span", "brand", tr("一起跳", "Dance Along")));
  const tools = el("span", "bar-tools");
  if (sock) {
    const m = el("button", "chip", measure ? tr("收起测量", "Hide timing") : tr("测量", "Timing"));
    m.onclick = () => {
      measure = !measure;
      render();
    };
    tools.append(m);
  }
  const lang = el("button", "chip", getLang() === "zh" ? "EN" : "中文");
  lang.onclick = () => {
    setLang(getLang() === "zh" ? "en" : "zh");
    render();
  };
  tools.append(lang);
  bar.append(tools);
  return bar;
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
  switch (state.phase) {
    case "lobby":
      return state.players.length ? tr("人到齐了，主人在手机上选舞", "When everyone's in, the host picks a dance") : tr("等大家扫码加入", "Waiting for people to join");
    case "calibrating":
      return tr("校准：跟着声音点", "Calibrating: tap with the sound");
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
  if (state.phase === "calibrating") {
    if (cal?.result && (!cal.result.ok || cal.suspect)) {
      const why = cal.suspect ? tr("点的和声音对不上", "the taps didn't line up with the sound") : cal.result.reason === "too_few_taps" ? tr("点得太少", "too few taps") : tr("点得太散", "the taps were too spread out");
      return cal.attempt < CAL_TRIES ? tr(`没成功（${why}），马上再来一次。`, `That didn't work (${why}). Again in a moment.`) : tr(`没成功（${why}）。主人可以跳过，回到大厅再校准一次。`, `That didn't work (${why}). The host can skip it and calibrate again from the lobby.`);
    }
    return tr("开跳前先量电视的延迟（每场一次）：会响 8 下，主人听到电视里的声音，就在手机的大按钮上点一下。量好就开始跳。", "Before the first dance, the TV's delay (once a party): 8 sounds; each time the host hears one from the TV, they tap the big button on their phone. Then the dance starts.");
  }
  if (state.phase === "lobby") {
    const bits = [tr("开始前，每个人身边留出一臂的空间。", "Before you start, give everyone an arm's length of space.")];
    if (calibrated) bits.push(tr(`已校准：电视比这台设备晚 ${state.audioOffsetMs} 毫秒。`, `Calibrated: the TV is ${state.audioOffsetMs} ms behind this device.`));
    else bits.push(tr("第一支舞开始前，先花 10 秒量一下电视的延迟，拍子才准。", "Before the first dance, 10 seconds to measure the TV's delay, so the beat is right."));
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
  parts.body = el("p", "coach-body");
  parts.count = el("div", "count");
  parts.next = el("p", "coach-next");
  if (stage3d) {
    const host = el("div", "coach-3d");
    words.append(parts.stage, parts.hint, parts.move, parts.other, parts.how, parts.body);
    const side = el("div", "coach-side");
    side.append(words, parts.count, parts.next);
    main.append(host, side);
    // (after the box is on the page: the canvas takes the host's size)
    requestAnimationFrame(() => stage3d.attach(host));
  } else {
    words.append(parts.stage, parts.hint, parts.move, parts.other, parts.how, parts.body);
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

/**
 * 找拍子 on the TV: what to do, everyone's taps so far (their names light up on each), and a button
 * for whoever holds this device. The video plays in the corner.
 */
function findPanel(): HTMLElement {
  const box = el("section", "tapalong find");
  const song = currentSong()?.song;
  box.append(el("h2", "phase", tr("第一次跳这首：先找拍子", "A new song: find the beat first")));
  if (song) box.append(el("p", "coach-dance", `${songTitle(song)} · ${songArtist(song)}`));
  box.append(el("p", "lead", tr("听歌，鼓点一进来，大家就在手机的大按钮上跟着点，一拍一下。点齐了就从头开始跳，以后这首不用再找。", "Listen, and once the drums come in, everyone taps the big button on their phone, once a beat. When the taps agree, the song starts from the top, and it never needs finding again.")));
  parts.findCount = el("div", "count find-count");
  box.append(parts.findCount);
  parts.findNote = el("p", "lead find-note");
  box.append(parts.findNote);
  const pad = el("button", "btn tap-pad", tr("这台设备也能点", "Tap here too"));
  pad.addEventListener("pointerdown", (e) => findTap(PAGE_ORIGIN + tapTime(e), "speaker"));
  box.append(pad);
  requestAnimationFrame(renderFind);
  return box;
}

/** 找拍子's count and line, as taps come in. */
function renderFind() {
  if (!finding || !parts.findCount || !parts.findNote) return;
  parts.findCount.textContent = `${Math.min(finding.taps.length, TAPS_WANTED)} / ${TAPS_WANTED}`;
  parts.findNote.textContent = finding.note || (tube.playing ? tr("听到鼓点就点", "Tap when you hear the drums") : tr("歌马上开始", "The song is about to play"));
  renderStatus();
}

/**
 * 歌曲对拍 (the lobby): pick a song, play it, and from its first strong beat tap along 16 times (the
 * big button here, or the space bar). The taps go by the video's clock, with the TV's delay taken
 * out; the song's first beat goes to the songbook, for every room from then on.
 */
function tapAlongPanel(): HTMLElement {
  const box = el("section", "tapalong");
  box.append(el("h2", "phase", tr("歌曲对拍", "Tap along to a song")));
  box.append(el("p", "lead", tr("一首歌跳起来拍子不准时，在这里重新对一次：放歌，等鼓点进来，从第一下重拍开始，跟着拍子点 16 下。（第一次跳的歌不用：大家会在手机上一起找拍子。）", "When a song's dance is off its beat, tap it again here: play it, wait for the beat to come in, and from the first strong beat tap along 16 times. (A new song needs none of this: everyone finds its beat together on their phones.)")));
  if (!calibrated) box.append(el("p", "notice", tr("先校准电视延迟（主人手机上「校准电视延迟」），对拍才准，才会存下来给所有房间用。", "Calibrate the TV delay first (the host's phone: Calibrate the TV delay): only then are the taps right, and kept for every room.")));
  const list = el("ul", "tap-songs");
  for (const song of SONGS) {
    const li = el("li");
    const b = el("button", song === tapSong ? "pick is-on" : "pick");
    b.append(el("span", "pick-name", `${songTitle(song)} · ${songArtist(song)}`), el("span", "pick-meta", song.aligned ? tr("拍子已量好", "Beat measured") : songbook[song.id] ? tr("已对拍", "Tapped") : tr("没对拍", "Not tapped yet")));
    b.onclick = () => {
      tapSong = song;
      tapTaps = [];
      tapResult = "";
      tube.load(song.videoId);
      render();
    };
    li.append(b);
    list.append(li);
  }
  box.append(list);
  if (tapSong) {
    const ctl = el("div", "tap-ctl");
    const play = el("button", "btn", tube.playing ? tr("从头再放", "Play from the start") : tr("放歌", "Play the song"));
    play.onclick = () => {
      tapTaps = [];
      tapResult = "";
      tube.stop();
      tube.playAt(pageClock() + 400);
      render();
    };
    const stop = el("button", "btn quiet", tr("停", "Stop"));
    stop.onclick = () => {
      tube.stop();
      tapTaps = [];
      render();
    };
    ctl.append(play, stop);
    box.append(ctl);
    const pad = el("button", "btn tap-pad", `${tr("跟着拍子点", "Tap on the beat")}\n${tapTaps.length} / ${TAPS_WANTED}`);
    // (the tap's moment on this page's clock, as speaker time)
    pad.addEventListener("pointerdown", (e) => tapAlongTap(PAGE_ORIGIN + tapTime(e)));
    box.append(pad);
    if (tapResult) box.append(el("p", "lead", tapResult));
  }
  const close = el("button", "btn quiet", tr("关掉", "Close"));
  close.onclick = () => {
    tapPanel = false;
    tapSong = null;
    tube.unload();
    render();
  };
  box.append(close);
  return box;
}

/** One tap of 对拍 (speaker time); the 16th works the song's first beat out and keeps it. */
function tapAlongTap(at: number) {
  if (!tapSong || !tube.playing || tapPosting) return;
  tapTaps.push(at);
  if (tapTaps.length < TAPS_WANTED) {
    render();
    return;
  }
  const song = tapSong;
  const zero = tube.zero();
  if (zero === null) {
    tapTaps = [];
    tapResult = tr("歌还没放稳，再点一次 16 下", "The song hadn't settled yet: tap 16 more");
    render();
    return;
  }
  const off = state?.audioOffsetMs ?? 0;
  const r = tapAlong(
    tapTaps.map((t) => t - off - zero),
    60000 / song.bpm,
  );
  tapTaps = [];
  if (!r.ok) {
    tapResult = r.why === "uneven" ? tr("没跟上拍子，一拍点一下，再来一次", "Those weren't on a steady beat: one tap a beat, again") : r.why === "spread" ? tr("点得不太齐，再来一次", "The taps were too spread out: again") : tr("点得太少，再来一次", "Too few taps: again");
    render();
    return;
  }
  // (without the TV's delay measured, the beat comes out late by it: not kept)
  if (!calibrated) {
    tapResult = tr("没存：先校准电视延迟，再对拍。", "Not kept: calibrate the TV delay first, then tap along.");
    render();
    return;
  }
  tapPosting = true;
  tapResult = tr("正在存……", "Saving…");
  render();
  void fetch(`/party/api/songs/${song.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ firstBeatMs: r.firstBeatMs, taps: r.taps, spreadMs: r.spreadMs, durationMs: tube.durationMs(), calibrated }),
  })
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      tapResult = res.ok ? tr(`对好了：第一拍在 ${clockOf(r.firstBeatMs)}，点得很齐（平均差 ${r.spreadMs} 毫秒）。`, `Done: the first beat is at ${clockOf(r.firstBeatMs)}, the taps ${r.spreadMs} ms apart on average.`) : tr(`没存上：${body.error ?? res.status}`, `Not saved: ${body.error ?? res.status}`);
    })
    .catch(() => {
      tapResult = tr("没存上：连不上服务器", "Not saved: no connection");
    })
    .finally(() => {
      tapPosting = false;
      void loadSongbook();
      render();
    });
}

// (the space bar taps along too, and in 找拍子)
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" || e.repeat) return;
  if (finding) {
    e.preventDefault();
    findTap(PAGE_ORIGIN + tapTime(e), "speaker");
    return;
  }
  if (!tapPanel || !tapSong) return;
  e.preventDefault();
  tapAlongTap(PAGE_ORIGIN + tapTime(e));
});

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
    if (!synth.running) bits.push(tr("声音没开：点一下页面", "Sound is off: tap the page"));
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
    return;
  }
  parts.stage.textContent = stageName(b.stage);
  parts.hint!.textContent = stageHint(b.stage, metronome);
  parts.move!.textContent = b.move ? moveName(b.move) : metronome && b.stage !== "countdown" ? tr("跟着拍子", "With the beat") : "";
  parts.other!.textContent = b.move ? moveOther(b.move) : "";
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

/** Every frame: the coach, the big count, the "I'm here" lights, the timing readout. */
function frame() {
  const now = pageClock();
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
// a page left in the background stops its audio clock on some browsers: wake it with the next tap
document.addEventListener("pointerdown", () => {
  if (sock && !synth.running) synth.resume();
});

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
    songbook: () => songbook,
    finding: () => finding && { taps: finding.taps.length, sent: finding.sent, note: finding.note, zero: finding.zero },
  },
});

setLang(getLang());
render();
requestAnimationFrame(frame);

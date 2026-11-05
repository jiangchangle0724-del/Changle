// The speaker page, /party/screen: the room's clock, its sound and, for now, its coach. It runs on a
// Mac or an iPad mirrored to the TV (AirPlay), so the room hears it a little late: the calibration
// measures how late. It opens the room, shows the code and the QR code, and reports its clock to the
// room every second, so the phones can set theirs by it. When a dance plays it plays the beat
// (synth.ts: a groove until the dances have songs) and shows the stage, the move, the 8-count, the
// next move and the floor together; then the results. The real screen is task C3
// (docs/codex-tasks/dance-C3-speaker-screen.md): this page keeps the timing and leaves the look to it.
import qrcode from "qrcode-generator";
import { calibrateFromTaps, type CalibrationResult, type RoomState } from "../../../party-base/src/index";
import { routineById } from "../shared/catalog";
import { COMBO_FULL, type Floor, type Results, type RoutineInfo, type ServerMsg } from "../shared/protocol";
import { PREVIEW_BEATS, anchorsOf, buildShow, danceStart, nextChange, planRun, runKey, spotAt, type RunBeat, type Show } from "../shared/show";
import { ClockSync, PAGE_ORIGIN, RoomSocket, ScreenAwake, clockText, el, getLang, pageClock, setLang, tr, wsUrl } from "./common";
import { Synth, playBeat } from "./synth";
import { awardName, awardWhy, bodyHint, clockOf, difficultyName, moveName, moveOther, routineName, stageHint, stageName } from "./words";

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

const app = document.getElementById("app")!;

// ---------- the room

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
      rejoining = false;
      if (state.phase !== "dancing") floor = null;
      plan();
      if (state.phase === "calibrating" && before !== "calibrating") startCalibration(1);
      if (state.phase !== "calibrating") stopCalibration();
      render();
      return;
    }
    case "floor": {
      const { t: _t, ...f } = m;
      if (floor && f.bursts > floor.bursts) fireworksUntil = pageClock() + FIREWORKS_MS;
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
    if (b.t >= now - 5) playBeat(synth, b, prev, p.phrase, p.show.routine === null);
    p.next++;
  }
}
setInterval(schedule, 25);

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
  body?: HTMLElement;
  next?: HTMLElement;
  progress?: HTMLElement;
  floorBar?: HTMLElement;
  floorText?: HTMLElement;
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
    box.append(el("p", "lead", tr("这台设备出声、计时。接上电视（AirPlay 镜像到 Apple TV），音量开大，再点开始。", "This device makes the sound and keeps the time. Mirror it to the TV (AirPlay to Apple TV), turn the volume up, then start.")));
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
  const main = el("main", run ? "screen is-run" : "screen");
  main.append(joinCard(run));
  const stage = el("section", "stage");
  if (run) stage.append(coach());
  else {
    stage.append(el("h2", "phase", phaseTitle()));
    const sub = phaseText();
    if (sub) stage.append(el("p", "lead", sub));
    parts.count = el("div", "count");
    stage.append(parts.count);
    if (state?.phase === "results" && results) stage.append(resultsCard(results));
  }
  parts.status = el("p", "status");
  stage.append(parts.status);
  parts.players = el("ul", "players");
  stage.append(parts.players);
  main.append(stage);
  app.append(main);
  if (measure) {
    parts.clock = el("div", "measure-clock");
    app.append(parts.clock);
  }
  renderStatus();
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
  if (state.phase === "calibrating") {
    if (cal?.result && (!cal.result.ok || cal.suspect)) {
      const why = cal.suspect ? tr("点的和声音对不上", "the taps didn't line up with the sound") : cal.result.reason === "too_few_taps" ? tr("点得太少", "too few taps") : tr("点得太散", "the taps were too spread out");
      return cal.attempt < CAL_TRIES ? tr(`没成功（${why}），马上再来一次。`, `That didn't work (${why}). Again in a moment.`) : tr(`没成功（${why}）。主人可以跳过，回到大厅再校准一次。`, `That didn't work (${why}). The host can skip it and calibrate again from the lobby.`);
    }
    return tr("会响 8 下。主人听到电视里的声音，就在手机的大按钮上点一下。", "8 sounds. Each time the host hears one from the TV, they tap the big button on their phone.");
  }
  if (state.phase === "lobby") {
    const bits = [tr("开始前，每个人身边留出一臂的空间。", "Before you start, give everyone an arm's length of space.")];
    if (state.audioOffsetMs) bits.push(tr(`已校准：电视比这台设备晚 ${state.audioOffsetMs} 毫秒。`, `Calibrated: the TV is ${state.audioOffsetMs} ms behind this device.`));
    return bits.join(" ");
  }
  return "";
}

/** The coach while a dance plays (for now in words: the 3D coach is task A4). Filled in every frame. */
function coach(): HTMLElement {
  const box = el("div", "coach");
  const r = playing.show?.routine;
  const top = el("div", "coach-top");
  top.append(el("p", "coach-dance", r ? `${routineName(r)} · ${difficultyName(r.difficulty)}` : tr("120 拍节拍器", "120 BPM metronome")));
  parts.progress = el("p", "coach-progress");
  top.append(parts.progress);
  // the words on the left, the count big beside them: the whole coach fits a TV without scrolling
  const main = el("div", "coach-main");
  const words = el("div", "coach-words");
  parts.stage = el("h2", "phase");
  parts.hint = el("p", "lead");
  parts.move = el("p", "coach-move");
  parts.other = el("p", "coach-other");
  parts.body = el("p", "coach-body");
  words.append(parts.stage, parts.hint, parts.move, parts.other, parts.body);
  parts.count = el("div", "count");
  main.append(words, parts.count);
  parts.next = el("p", "coach-next");
  const fl = el("div", "floor");
  parts.floorBar = el("div", "floor-bar");
  parts.floorBar.append(el("i"));
  parts.floorText = el("span", "floor-text");
  fl.append(parts.floorBar, parts.floorText);
  box.append(top, main, parts.next, fl);
  return box;
}

function resultsCard(r: Results): HTMLElement {
  const box = el("div", "results");
  const danced = routineById(r.routineId);
  const name = (id: string | null) => (id ? (r.players.find((p) => p.id === id)?.name ?? "") : "");
  if (danced) box.append(el("p", "coach-dance", `${routineName(danced)} · ${difficultyName(r.difficulty)}`));
  if (!r.players.length) {
    box.append(el("p", "lead", tr("这一首没有人点手机。下一首每一拍点一下，就能上榜。", "Nobody tapped along this time. Tap your phone on every beat next time to get on the board.")));
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
    parts.floorText.textContent = f && f.dancers ? tr(`全场连击 ${f.streak} · ${f.dancers} 人在跳`, `Floor streak ${f.streak} · ${f.dancers} dancing`) : tr("每一拍点一下手机，全场一起涨连击", "Tap your phone on every beat: the whole floor builds the streak");
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
  const metronome = show.routine === null;
  const into = b?.stage === "dance" && p.zero !== null ? Math.min(show.danceMs, Math.max(0, now - p.zero)) : null;
  const key = `${spot?.i ?? -1}|${preview ? `${preview.stage}${preview.move?.id}` : ""}|${getLang()}|${into === null ? "" : Math.floor(into / 1000)}`;
  if (key === shown) return;
  shown = key;
  document.body.classList.toggle("fireworks", now < fireworksUntil);
  if (!b) {
    // before the first beat, or after the last
    parts.stage.textContent = p.run.length && now < p.run[0]!.t ? tr("马上开始", "Starting in a moment") : tr("跳完了", "That's the song");
    parts.hint!.textContent = "";
    parts.move!.textContent = parts.other!.textContent = parts.body!.textContent = parts.count!.textContent = parts.next!.textContent = parts.progress!.textContent = "";
    return;
  }
  parts.stage.textContent = stageName(b.stage);
  parts.hint!.textContent = stageHint(b.stage, metronome);
  parts.move!.textContent = b.move ? moveName(b.move) : metronome && b.stage !== "countdown" ? tr("跟着拍子", "With the beat") : "";
  parts.other!.textContent = b.move ? moveOther(b.move) : "";
  parts.body!.textContent = b.move ? bodyHint(b.move) : "";
  parts.count!.textContent = String(b.count);
  parts.next!.textContent = preview ? `${tr("接下来：", "Next: ")}${preview.move ? moveName(preview.move) : stageName(preview.stage)}${preview.stage !== b.stage && preview.move ? ` · ${stageName(preview.stage)}` : ""}` : "";
  parts.progress!.textContent = into === null ? "" : `${clockOf(into)} / ${clockOf(show.danceMs)}`;
}

/** Every frame: the coach, the big count, the "I'm here" lights, the timing readout. */
function frame() {
  const now = pageClock();
  if (running()) frameCoach(now);
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
  },
});

setLang(getLang());
render();
requestAnimationFrame(frame);

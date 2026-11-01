// The speaker page, /party/screen: the room's clock and its sound. It runs on a Mac or an iPad
// mirrored to the TV (AirPlay), so the room hears it a little late: the calibration measures how
// late. It opens the room, shows the code and the QR code, plays the clicks, and reports its clock
// to the room every second, so the phones can set theirs by it.
import qrcode from "qrcode-generator";
import { calibrateFromTaps, countInPhrase, type BeatMap, type CalibrationResult, type RoomState } from "../../../party-base/src/index";
import { COUNT_IN_BEATS, type RoutineInfo, type ServerMsg } from "../shared/protocol";
import { ClockSync, RoomSocket, ScreenAwake, clockText, el, getLang, setLang, tr, wsUrl } from "./common";

/** Calibration: 8 clicks, 1.2 s apart (so a tap up to 400 ms late still pairs with the right click). */
const CAL_CLICKS = 8;
const CAL_GAP_MS = 1200;
const CAL_LEAD_MS = 2000;
const CAL_TRIES = 3;
/** A calibration that says the room hears the sound this much EARLY paired taps with the wrong clicks. */
const CAL_MIN_OFFSET_MS = -100;

type Sound = "accent" | "beat" | "count" | "cal";

/** The clicks, made with an oscillator (no audio files), at speaker times (this page's performance.now()). */
class Clicks {
  private ctx: AudioContext | null = null;
  private live = new Set<OscillatorNode>();

  /** Must run inside a tap: iOS and Safari only start audio from one. */
  start(): void {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: "interactive" });
    void this.ctx.resume();
    // a silent sound first: what unlocks audio on iOS
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.ctx.destination);
    s.start(0);
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Audio stopped (the page went to the background): start it again, inside a tap. */
  resume(): void {
    if (this.ctx) void this.ctx.resume();
    else this.start();
  }

  /** The audio clock's time at which a sound comes out of this device at speaker time t. */
  private when(t: number): number {
    const ctx = this.ctx!;
    const ts = ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime && ts.contextTime) return ts.contextTime + (t - ts.performanceTime) / 1000;
    // (no output timestamp: schedule ahead by the latency the browser reports)
    return ctx.currentTime + (t - performance.now()) / 1000 - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  play(t: number, sound: Sound): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const at = this.when(t);
    if (at < ctx.currentTime) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = sound === "accent" ? 1760 : sound === "cal" ? 1320 : sound === "count" ? 660 : 1175;
    const peak = sound === "count" ? 0.35 : 0.7;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + 0.09);
    this.live.add(o);
    o.onended = () => this.live.delete(o);
  }

  /** Stop everything scheduled. */
  hush(): void {
    for (const o of this.live) {
      try {
        o.stop();
      } catch {
        // not started yet or already stopped
      }
    }
    this.live.clear();
  }
}

const clicks = new Clicks();
const awake = new ScreenAwake();
let sock: RoomSocket | null = null;
let code: string | null = null;
let state: RoomState | null = null;
let routine: RoutineInfo | null = null;
let syncRtt: number | null = null;
let fatal: Extract<ServerMsg, { t: "fatal" }> | null = null;
let rejoining = false;
const heres = new Map<string, number>();
const sync = new ClockSync((id) => sock?.send({ t: "ping", id }), 10);

/** The calibration under way: its clicks, the host's taps, and how it came out. */
let cal: { clicks: number[]; taps: number[]; endAt: number; attempt: number; result: CalibrationResult | null; suspect: boolean } | null = null;
let calTimer: ReturnType<typeof setTimeout> | null = null;

/** The beat grid the clicks are scheduled on (speaker time, no audio offset: the room hears it later). */
let grid: BeatMap | null = null;
let nextBeat = -COUNT_IN_BEATS;

const app = document.getElementById("app")!;

// ---------- the room

async function begin() {
  clicks.start();
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
    const res = await fetch("/party/api/rooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ speakerAt: performance.now() }) });
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
      rejoining = false;
      if (state.phase === "calibrating" && before !== "calibrating") startCalibration(1);
      if (state.phase !== "calibrating") stopCalibration();
      planBeats();
      render();
      return;
    }
    case "pong":
      if (sync.pong(m.id, m.serverAt)) {
        const est = sync.estimate();
        syncRtt = est.rttMs;
        // speaker time = room time + offset (estimate: room ≈ speaker + est.offsetMs)
        sock?.send({ t: "clock", offsetMs: -est.offsetMs, rttMs: est.rttMs });
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
      clicks.hush();
      render();
      return;
    default:
      return;
  }
}

// ---------- calibration

function startCalibration(attempt: number) {
  stopCalibration();
  const t0 = performance.now() + CAL_LEAD_MS;
  const times = Array.from({ length: CAL_CLICKS }, (_, i) => t0 + i * CAL_GAP_MS);
  for (const t of times) clicks.play(t, "cal");
  cal = { clicks: times, taps: [], endAt: times[times.length - 1]! + 1500, attempt, result: null, suspect: false };
  calTimer = setTimeout(finishCalibration, cal.endAt - performance.now());
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
  if (cal && !cal.result) clicks.hush();
  cal = null;
}

// ---------- the beat

/** The grid to click on: the routine being danced, from its count-in. */
function planBeats() {
  const s = state;
  const startAt = s?.phase === "dancing" ? s.routineStartAt : null;
  if (!s || startAt === null || !routine) {
    if (grid) clicks.hush();
    grid = null;
    return;
  }
  if (grid && grid.startAt === startAt) return;
  if (grid) clicks.hush();
  grid = { bpm: routine.bpm, beatsPerBar: routine.beatsPerBar, startAt, totalBeats: routine.totalBeats };
  nextBeat = -COUNT_IN_BEATS;
}

/** Every 25 ms: the clicks of the next 150 ms go to the audio clock. */
function schedule() {
  const g = grid;
  if (!g) return;
  const ms = 60000 / g.bpm;
  const until = performance.now() + 150;
  while (nextBeat < g.totalBeats && g.startAt + nextBeat * ms <= until) {
    const t = g.startAt + nextBeat * ms;
    if (t >= performance.now() - 5) clicks.play(t, nextBeat < 0 ? "count" : nextBeat % g.beatsPerBar === 0 ? "accent" : "beat");
    nextBeat++;
  }
}
setInterval(schedule, 25);

// ---------- the page

let measure = false;
const parts: { count?: HTMLElement; clock?: HTMLElement; status?: HTMLElement; players?: HTMLElement } = {};

function render() {
  app.replaceChildren();
  parts.count = parts.clock = parts.status = parts.players = undefined;
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
  const main = el("main", "screen");
  const join = el("section", "join-card");
  if (code) {
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
  }
  main.append(join);
  const stage = el("section", "stage");
  stage.append(el("h2", "phase", phaseTitle()));
  const sub = phaseText();
  if (sub) stage.append(el("p", "lead", sub));
  parts.count = el("div", "count");
  stage.append(parts.count);
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

function phaseTitle(): string {
  if (!state) return tr("连接中……", "Connecting…");
  switch (state.phase) {
    case "lobby":
      return state.players.length ? tr("人到齐了，主人在手机上开始", "When everyone's in, the host starts on their phone") : tr("等大家扫码加入", "Waiting for people to join");
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
  if (state.phase === "lobby" && state.audioOffsetMs) return tr(`已校准：电视比这台设备晚 ${state.audioOffsetMs} 毫秒`, `Calibrated: the TV is ${state.audioOffsetMs} ms behind this device`);
  return "";
}

function renderStatus() {
  if (parts.status) {
    const bits: string[] = [];
    if (state?.phase === "calibrating" && cal) bits.push(tr(`收到 ${cal.taps.length} / ${CAL_CLICKS} 下`, `${cal.taps.length} / ${CAL_CLICKS} taps`));
    if (!clicks.running) bits.push(tr("声音没开：点一下页面", "Sound is off: tap the page"));
    if (!awake.held) bits.push(tr("屏幕可能会自己熄灭", "The screen may turn itself off"));
    if (sock && !sock.isOpen) bits.push(tr("连接断了，正在重连", "Connection lost, reconnecting"));
    parts.status.textContent = bits.join(" · ");
  }
  if (parts.players && state) {
    const now = performance.now();
    parts.players.replaceChildren(
      ...state.players.map((p) => {
        const li = el("li", (heres.get(p.id) ?? 0) > now ? "player here" : "player", p.name);
        if (p.isHost) li.append(el("span", "host", tr("主人", "host")));
        return li;
      }),
    );
  }
}

/** Every frame: the big count, the "I'm here" lights, the timing readout. */
function frame() {
  const now = performance.now();
  if (parts.count) {
    const g = grid;
    let text = "";
    if (g && state?.phase === "dancing") {
      const k = Math.floor((now - g.startAt) / (60000 / g.bpm));
      text = k < 0 ? String(-k) : k < g.totalBeats ? String(countInPhrase(g, k)) : "";
    }
    if (parts.count.textContent !== text) parts.count.textContent = text;
  }
  if (parts.players && state) {
    // (redrawn only when who's lit up changes)
    const lit = state.players.filter((p) => (heres.get(p.id) ?? 0) > now).map((p) => p.id).join(",");
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
  if (sock && !clicks.running) clicks.resume();
});

// for scripts/timing-check.cjs: the calibration clicks and the beat grid this page plays
Object.assign(window, { partyDebug: { cal: () => cal, grid: () => grid, sync: () => sync.estimate(), state: () => state } });

setLang(getLang());
render();
requestAnimationFrame(frame);

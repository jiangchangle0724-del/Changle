// A phone's page, /party/join: join with the code, set its clock by the speaker's (8 pings, then a
// few every 15 s), flash on every beat the room hears, and the 我在 button the big screen shows.
// The first one in is the host: they calibrate (a big button to tap along with the TV), pick a dance
// and steer it. While a dance plays, the phone shows the move and the count and has one big button
// to tap on every beat: it stands in for the motion sensor (the plan's 假体感) until task A2. The
// phone judges each tap against the beat the room hears (shared/taps.ts) and sends the room the
// dance's beats a bar at a time. The real phone screen is task C4
// (docs/codex-tasks/dance-C4-phone-screen.md): this page keeps the timing and leaves the look to it.
import type { RoomState } from "../../../party-base/src/index";
import { METRONOME_ID, ROUTINES } from "../shared/catalog";
import { SONGS } from "../shared/songs";
import type { HostAction, Results, RoutineInfo, ServerMsg } from "../shared/protocol";
import { PREVIEW_BEATS, anchorsOf, buildShow, danceStart, nextChange, planRun, runEnd, runKey, spotAt, type Mode, type RunBeat, type Show } from "../shared/show";
import { BeatJudge, type Batch, type Judged, type Verdict } from "../shared/taps";
import { ClockSync, RoomSocket, ScreenAwake, clockText, el, getLang, setLang, tapTime, tr, wsUrl } from "./common";
import { MotionSense } from "./motion";
import { awardName, bodyHint, danceName, difficultyName, moveName, restHint, routineName, showMinutes, songArtist, songTitle, stageName, styleName, verdictText } from "./words";

const app = document.getElementById("app")!;
const flash = document.getElementById("flash")!;

const myId = loadId();
let code = (new URLSearchParams(location.search).get("code") ?? "").toUpperCase();
let name = loadName();
let sock: RoomSocket | null = null;
let state: RoomState | null = null;
let routine: RoutineInfo | null = null;
let results: Results | null = null;
let fatal: Extract<ServerMsg, { t: "fatal" }> | null = null;
let notice = "";
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let taps = 0;
let measure = false;
let endArmed = false;
/** The host's choice in the lobby: which dance, learn it first or just dance. */
let pick = ROUTINES[0]?.id ?? "";
let mode: Mode = "learn";
const awake = new ScreenAwake();
const sync = new ClockSync((id) => sock?.send({ t: "ping", id }), 16);
let est = sync.estimate();
let waitingForSpeaker = false;

/**
 * The speaker's clock now, by this phone's estimate: null until 6 probes are in. The first ones go
 * out while the page is still loading, and a pong handled late makes its probe off by half the
 * delay (a page busy for 400 ms: 200 ms). With 6, the 5 quickest that the estimate keeps leave
 * those out.
 */
const MIN_PROBES = 6;
const clockSet = () => sync.count >= MIN_PROBES;
/** The speaker's clock at a moment of this page's performance.now() (now, by default). */
const speakerNow = (local = performance.now()): number | null => (clockSet() ? local + est.offsetMs : null);
/** Back on the room after a drop: once its state is in, the dance's bars sent so far go again. */
let resend = false;

/** The motion sensor: each peak of the phone's motion is a move, as a tap of the big button is. */
const motion = new MotionSense((local) => {
  tapMove(local);
  padPop();
});
/** When the big button was last tapped (this page's clock): the TV's energy for a player who taps. */
let tappedAt = -1e9;

function loadId(): string {
  try {
    const s = localStorage.getItem("party:id");
    if (s && /^[A-Za-z0-9_-]{8,64}$/.test(s)) return s;
  } catch {
    // no storage: a new id each visit
  }
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  const id = Array.from(a, (b) => (b % 36).toString(36)).join("") + Date.now().toString(36).slice(-4);
  try {
    localStorage.setItem("party:id", id);
  } catch {
    // fine
  }
  return id;
}

function loadName(): string {
  try {
    return localStorage.getItem("party:name") ?? "";
  } catch {
    return "";
  }
}

// ---------- the room

function join() {
  code = code.trim().toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4}$/.test(code)) {
    say(tr("房间码是大屏上的 4 个字", "The room code is the 4 characters on the big screen"));
    return;
  }
  try {
    localStorage.setItem("party:name", name);
  } catch {
    // fine
  }
  void awake.on();
  history.replaceState(null, "", `?code=${code}`);
  try {
    // a reload of this tab goes straight back in
    sessionStorage.setItem("party:room", code);
  } catch {
    // fine: a reload shows the form again
  }
  fatal = null;
  sock = new RoomSocket(() => wsUrl(code, { id: myId, name: name || tr("玩家", "Player") }), onMsg, (open) => {
    if (open) {
      burst(8);
      resend = true;
    }
    render();
  });
  render();
}

/** n pings, 120 ms apart: the shortest round trips set the clock. */
function burst(n: number) {
  for (let i = 0; i < n; i++) setTimeout(() => sync.ping(), i * 120);
}

function onMsg(m: ServerMsg) {
  switch (m.t) {
    case "state": {
      const before = state?.phase;
      const wasFinding = finding();
      state = m.state;
      routine = m.routine;
      results = m.results;
      if (state.phase === "calibrating" && before !== "calibrating") taps = 0;
      if (finding() && !wasFinding) findTaps = 0;
      endArmed = false;
      track();
      // (bars sent while the connection was down never got there; the room keeps the newest of
      // each beat, so sending one twice does no harm. After the state: a bar of a dance the room
      // has moved on from is dropped by track() first.)
      if (resend) {
        resend = false;
        for (const b of tracking.batches) sock?.send({ t: "beats", from: b.from, offs: b.offs });
      }
      render();
      return;
    }
    case "pong":
      if (sync.pong(m.id, m.speakerAt)) {
        est = sync.estimate();
        waitingForSpeaker = false;
      } else if (m.speakerAt === null && !waitingForSpeaker) {
        // the speaker page hasn't set its clock yet: ask again in a moment
        waitingForSpeaker = true;
        setTimeout(() => {
          waitingForSpeaker = false;
          burst(4);
        }, 1500);
      }
      renderSync();
      return;
    case "error":
      say(errorText(m.code, m.message));
      return;
    case "fatal":
      fatal = m;
      render();
      return;
    default:
      return;
  }
}

function act(action: HostAction) {
  sock?.send({ t: "act", action });
}

function errorText(code: string, message: string): string {
  switch (code) {
    case "not_host":
      return tr("只有主人能这样做", "Only the host can do that");
    case "no_speaker":
      return tr("先在大屏（音箱端）点开始", "Start the speaker page first");
    case "bad_phase":
      return tr("现在不能这样做", "Not right now");
    case "room_full":
      return tr("房间满了", "The room is full");
    case "too_early":
      return tr("等这支舞跳完", "Wait until the dance is over");
    case "no_routine":
      return tr("先选一支舞", "Pick a dance first");
    case "song_untapped":
      return tr("这首歌还没对拍：先在电视上点「歌曲对拍」，跟着歌点一次", "This song hasn't been tapped along to yet: on the TV, pick Tap along to a song first");
    case "song_notap":
      return tr("没找到拍子：鼓点进来以后，大家一拍点一下。再选一次这首歌试试", "Couldn't find the beat: once the drums come in, everyone taps once a beat. Pick the song again to retry");
    case "song_tapping":
      return tr("先跟着歌找拍子", "Find the song's beat first");
    case "song_blocked":
      return tr("YouTube 不让这首歌在别的网站放，换一首吧", "YouTube won't play this song outside YouTube: pick another");
    case "song_offline":
      return tr("电视连不上 YouTube", "The TV can't reach YouTube");
    case "not_for_songs":
      return tr("跳歌的时候不能回到上一段", "A song can't go back a part");
    default:
      return message;
  }
}

function say(text: string) {
  notice = text;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice = "";
    render();
  }, 3500);
  render();
}

// ---------- the dance: the beats as the room hears them, and this player's taps against them

interface Tracking {
  key: string;
  show: Show | null;
  /** every beat still to come, in speaker time as the room hears it (the TV's delay added) */
  heard: RunBeat[];
  /** speaker time of the dance's beat 0, as heard */
  zero: number | null;
  judge: BeatJudge | null;
  /** the last beat judged, and the dance beats judged so far (for this player's own meter) */
  last: Judged | null;
  recent: Verdict[];
  /** the dance's bars sent so far (sent again after a drop), and how many beats, for the checks */
  batches: Batch[];
  sent: number;
}
let tracking: Tracking = { key: "", show: null, heard: [], zero: null, judge: null, last: null, recent: [], batches: [], sent: 0 };

/** The beats to follow, planned again when the run changes; the judge starts once the clock is set. */
function track() {
  const s = state;
  const a = s ? anchorsOf(s.phase, s.routineStartAt, routine) : null;
  const show = a && routine ? buildShow(routine.routineId, routine.mode) : null;
  const key = show && a && s ? `${runKey(show, a)}|${s.audioOffsetMs}` : "";
  if (key !== tracking.key) {
    const heard = show && a && s ? planRun(show, a, s.audioOffsetMs) : [];
    const start = show && a ? danceStart(show, a) : null;
    tracking = { key, show, heard, zero: show && a && s && start !== null ? start - a.fromBeat * show.beatMs + s.audioOffsetMs : null, judge: null, last: null, recent: [], batches: [], sent: 0 };
  }
  const now = speakerNow();
  if (!tracking.judge && tracking.heard.length && now !== null && s?.difficulty) tracking.judge = new BeatJudge(tracking.heard, s.difficulty, now);
}

/** The big button bounces: a tap, or a move the sensor felt. */
function padPop() {
  const pad = parts.pad;
  if (!pad) return;
  pad.classList.remove("hit");
  void pad.offsetWidth;
  pad.classList.add("hit");
}

/** A tap on the big button, or a peak of the phone's motion (at `local`, this page's clock): a move. */
function tapMove(local: number) {
  const at = speakerNow(local);
  if (at === null || !tracking.judge) return;
  tracking.judge.move(at);
}

/** Judge the beats whose window has closed; send the dance's whole bars to the room. */
function judgeBeats(now: number) {
  const j = tracking.judge;
  if (!j) return;
  const judged = j.settle(now);
  for (const x of judged) {
    tracking.last = x;
    if (x.beat.danceBeat !== null) {
      tracking.recent.push(x.verdict);
      if (tracking.recent.length > 8) tracking.recent.shift();
    }
  }
  const batches = j.take(j.done);
  for (const b of batches) {
    tracking.batches.push(b);
    sock?.send({ t: "beats", from: b.from, offs: b.offs });
    tracking.sent += b.offs.length;
  }
  if (judged.length) renderBeat();
}

// ---------- the page

const parts: { count?: HTMLElement; sync?: HTMLElement; clock?: HTMLElement; stage?: HTMLElement; move?: HTMLElement; body?: HTMLElement; next?: HTMLElement; pad?: HTMLElement; verdict?: HTMLElement; meter?: HTMLElement; level?: HTMLElement; finish?: HTMLButtonElement } = {};
/** What the run's lines show, so a frame only touches the page when it changes. */
let shown = "";
/** The beat the room hears now: whether it's scored (the big button counts), and its stage. */
let heardBeat: { scored: boolean; stage: RunBeat["stage"] | null } = { scored: false, stage: null };

const running = () => !!state && (state.phase === "learning" || state.phase === "dancing") && tracking.heard.length > 0;

function render() {
  app.replaceChildren();
  for (const k of Object.keys(parts) as (keyof typeof parts)[]) parts[k] = undefined;
  shown = "";
  app.append(topBar());
  if (fatal) {
    const box = el("section", "start");
    const text = fatal.key === "noRoom" ? tr("找不到这个房间，看看房间码对不对", "No room with that code: check it on the big screen") : fatal.key === "full" ? tr("房间满了（最多 15 人）", "The room is full (15 at most)") : fatal.key === "ended" ? tr("房间已结束", "The room has ended") : tr("加入不了", "Couldn't join");
    box.append(el("h1", "title", text));
    const again = el("button", "btn big", tr("换个房间码", "Try another code"));
    again.onclick = () => {
      fatal = null;
      sock = null;
      state = null;
      code = "";
      history.replaceState(null, "", location.pathname);
      render();
    };
    box.append(again);
    app.append(box);
    return;
  }
  if (!sock) {
    app.append(joinForm());
    return;
  }
  const run = running();
  document.body.classList.toggle("is-run", run);
  const main = el("main", "phone");
  main.append(el("p", "room-line", `${tr("房间", "Room")} ${code} · ${name || tr("玩家", "Player")}${isHost() ? ` · ${tr("主人", "host")}` : ""}`));
  parts.sync = el("p", "sync");
  main.append(parts.sync);
  if (run) main.append(dancePanel());
  else {
    main.append(el("h2", "phase", phaseTitle()));
    parts.count = el("div", "count");
    main.append(parts.count);
    if (state?.phase === "calibrating" && isHost()) main.append(tapPad());
    if (finding()) main.append(findPad());
    if (state?.phase === "results" && results) main.append(myResults(results));
    if (state?.phase === "lobby" || state?.phase === "results") {
      const m = motionSwitch();
      if (m) main.append(m);
    }
    const here = el("button", "btn here", tr("我在", "I'm here"));
    here.onclick = () => {
      sock?.send({ t: "here" });
      say(tr("大屏上你的名字亮了", "Your name lit up on the big screen"));
    };
    main.append(here);
  }
  if (isHost()) main.append(hostPanel());
  if (notice) main.append(el("p", "notice", notice));
  if (state && !run) main.append(playerList());
  if (measure) {
    parts.clock = el("div", "measure-clock");
    main.append(parts.clock);
  }
  app.append(main);
  renderSync();
  renderBeat();
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

function joinForm(): HTMLElement {
  const form = el("form", "start");
  form.append(el("h1", "title", tr("一起跳 · 加入", "Dance Along · Join")));
  const codeField = el("label", "field");
  codeField.append(el("span", "", tr("房间码", "Room code")));
  const codeInput = el("input");
  codeInput.id = "code";
  codeInput.value = code;
  codeInput.maxLength = 4;
  codeInput.autocapitalize = "characters";
  codeInput.autocomplete = "off";
  codeInput.oninput = () => (code = codeInput.value);
  codeField.append(codeInput);
  form.append(codeField);
  const nameField = el("label", "field");
  nameField.append(el("span", "", tr("你的名字", "Your name")));
  const nameInput = el("input");
  nameInput.id = "name";
  nameInput.value = name;
  nameInput.maxLength = 16;
  nameInput.setAttribute("autocomplete", "nickname");
  nameInput.oninput = () => (name = nameInput.value);
  nameField.append(nameInput);
  form.append(nameField);
  const go = el("button", "btn big", tr("加入", "Join"));
  go.type = "submit";
  form.append(go);
  if (notice) form.append(el("p", "notice", notice));
  form.onsubmit = (e) => {
    e.preventDefault();
    join();
  };
  return form;
}

function isHost(): boolean {
  return !!state?.players.find((p) => p.id === myId)?.isHost;
}

function phaseTitle(): string {
  if (!state) return tr("连接中……", "Connecting…");
  const host = isHost();
  switch (state.phase) {
    case "lobby":
      if (!state.speakerConnected) return tr("等大屏（音箱端）点开始", "Waiting for the speaker page to start");
      return host ? tr("选一支舞，人齐了就开始", "Pick a dance and start when everyone's in") : tr("等主人选舞", "Waiting for the host to pick a dance");
    case "calibrating":
      return host ? tr("开跳前先量电视延迟：听到电视的声音就点下面的大按钮", "First, the TV's delay: tap the big button each time you hear the TV") : tr("主人在量电视的延迟，量好就开始", "The host is measuring the TV's delay; the dance starts right after");
    case "learning":
      if (routine?.pausedAt !== undefined) return host ? tr("暂停了，点「继续」接着跳", "Paused: tap Carry on to go on") : tr("暂停了，等主人继续", "Paused: the host will carry on");
      if (routine?.tapIn) return tr("先找拍子：听电视里的歌", "Find the beat: listen to the song on the TV");
      return host ? tr("准备好了就点「开始跳」", "Tap Dance when everyone's ready") : tr("准备", "Get ready");
    case "dancing":
      if (routine?.pausedAt !== undefined) return host ? tr("暂停了，点「继续」接着跳", "Paused: tap Carry on to go on") : tr("暂停了，等主人继续", "Paused: the host will carry on");
      return tr("跟着闪光的节奏动起来", "Move with the flashes");
    case "results":
      return tr("跳完了", "That's the song");
    case "ended":
      return tr("房间已结束", "The room has ended");
  }
}

/** Calibration: the host taps each time the TV clicks. */
function tapPad(): HTMLElement {
  const pad = el("button", "btn tap-pad", `${tr("点", "Tap")}\n${taps} / 8`);
  // pointerdown, not click: a click comes after the finger lifts, later than the tap
  pad.addEventListener(
    "pointerdown",
    (e) => {
      const at = speakerNow(tapTime(e));
      if (at === null) return;
      sock?.send({ t: "tap", at });
      taps++;
      pad.textContent = `${tr("点", "Tap")}\n${taps} / 8`;
      pad.classList.remove("hit");
      void pad.offsetWidth;
      pad.classList.add("hit");
    },
    { passive: true },
  );
  return pad;
}

/** 找拍子: a song nobody has danced yet, its video playing on the TV while everyone taps along. */
const finding = () => state?.phase === "learning" && !!routine?.tapIn;
let findTaps = 0;

/** 找拍子 on the phone: everyone taps along to the song on the TV, once a beat. */
function findPad(): HTMLElement {
  const box = el("section", "find");
  box.append(el("p", "lead", tr("鼓点一进来，就跟着点下面的大按钮，一拍一下。大家点齐了就开始跳。", "Once the drums come in, tap the big button below, once a beat. When everyone's taps agree, the dance starts.")));
  const pad = el("button", "btn tap-pad", `${tr("跟着拍子点", "Tap on the beat")}\n${findTaps}`);
  // pointerdown, not click: a click comes after the finger lifts, later than the tap
  pad.addEventListener(
    "pointerdown",
    (e) => {
      const at = speakerNow(tapTime(e));
      if (at === null) return;
      sock?.send({ t: "tap", at });
      findTaps++;
      pad.textContent = `${tr("跟着拍子点", "Tap on the beat")}\n${findTaps}`;
      pad.classList.remove("hit");
      void pad.offsetWidth;
      pad.classList.add("hit");
    },
    { passive: true },
  );
  box.append(pad);
  return box;
}

/** While a dance plays: the move and the count (filled every frame), the big button, this player's meter. */
function dancePanel(): HTMLElement {
  const box = el("section", "dance");
  parts.stage = el("p", "dance-stage");
  parts.move = el("p", "dance-move");
  parts.body = el("p", "dance-body");
  parts.count = el("div", "count");
  parts.next = el("p", "dance-next");
  const pad = el("button", "btn dance-pad");
  pad.setAttribute("aria-label", tr("跟着拍子点", "Tap on the beat"));
  parts.verdict = el("span", "dance-verdict", verdictText(null));
  pad.append(parts.verdict);
  // pointerdown, not click: a click comes after the finger lifts, later than the tap
  pad.addEventListener("pointerdown", (e) => {
    tapMove(tapTime(e));
    tappedAt = performance.now();
    padPop();
  });
  // (a keyboard works too: space or enter, held keys not repeated)
  pad.addEventListener("keydown", (e) => {
    if ((e.key === " " || e.key === "Enter") && !e.repeat) {
      e.preventDefault();
      tapMove(tapTime(e));
    }
  });
  parts.pad = pad;
  parts.meter = el("p", "dance-meter");
  box.append(parts.stage, parts.move, parts.body, parts.count, parts.next, pad, parts.meter);
  const m = motionSwitch();
  if (m) box.append(m);
  return box;
}

/**
 * Hold the phone and dance: the switch for the motion sensor (iPhones ask once, in this tap). The
 * big button keeps working beside it. Nothing on a computer.
 */
function motionSwitch(): HTMLElement | null {
  if (!MotionSense.supported()) return null;
  const box = el("div", "motion");
  if (motion.on) {
    box.append(el("p", "motion-on", tr("体感开着：手机拿在手里，跟着老师跳就行", "Motion is on: hold your phone and dance with the coach")));
    const lv = el("span", "motion-level");
    lv.append(el("i"));
    parts.level = lv;
    box.append(lv);
    return box;
  }
  const b = el("button", "btn motion-btn", tr("开体感：手机拿在手里跟着跳", "Use motion: hold your phone and dance"));
  b.onclick = async () => {
    const ok = await motion.start();
    if (!ok) say(motion.denied ? tr("没拿到体感权限。可以在设置里允许，或者点大按钮跳。", "No motion access. Allow it in Settings, or tap the big button.") : tr("这台手机读不到体感，点大按钮跳也行。", "This phone has no motion sensor: tap the big button instead."));
    render();
  };
  box.append(b);
  if (motion.denied) box.append(el("p", "hint", tr("要用体感：iPhone 设置 → Safari → 运动与方向访问，打开后刷新。", "For motion: iPhone Settings → Safari → Motion & Orientation Access, then reload.")));
  return box;
}

function myResults(r: Results): HTMLElement {
  const box = el("section", "my-results");
  const dn = danceName(r.routineId);
  if (dn) box.append(el("p", "dance-stage", `${dn} · ${difficultyName(r.difficulty)}`));
  const me = r.players.find((p) => p.id === myId);
  if (!me) {
    box.append(el("p", "lead", tr("这一首你没有动手机。下一首拿着手机跳，或者每一拍点一下，就能上榜。", "Your phone didn't move this time. Dance with it in hand, or tap on every beat, to get on the board.")));
  } else {
    box.append(el("p", "my-score", r.difficulty === "easy" ? tr(`你跟上了 ${me.participation}% 的拍子`, `You moved on ${me.participation}% of the beats`) : tr(`得分 ${me.participation}`, `Score ${me.participation}`)));
    const mine = (["steady", "hype", "effort"] as const).filter((k) => r.awards[k] === myId);
    if (mine.length) box.append(el("p", "my-award", `${tr("你拿到：", "You won: ")}${mine.map(awardName).join(" · ")}`));
    box.append(el("p", "lead", tr(`连着踩准最多 ${me.bestStreak} 拍`, `Your best run: ${me.bestStreak} beats on the beat`)));
  }
  return box;
}

function hostPanel(): HTMLElement {
  const box = el("section", "host-panel");
  const button = (label: string, action: HostAction, cls = "btn") => {
    const b = el("button", cls, label);
    b.onclick = () => act(action);
    box.append(b);
    return b;
  };
  const phase = state?.phase;
  switch (phase) {
    case "lobby": {
      box.append(routinePicker());
      const name = danceName(pick);
      if (name) button(`${tr("开始：", "Start: ")}${name}`, { type: "START_LEARNING", routineId: pick, mode }, "btn primary");
      button(tr("校准电视延迟", "Calibrate the TV delay"), { type: "START_CALIBRATION" });
      // (the timing test of docs/field-notes/2026-11-01.md)
      button(tr("开始：120 拍节拍器", "Start: 120 BPM metronome"), { type: "START_LEARNING", routineId: METRONOME_ID }, "btn quiet");
      break;
    }
    case "calibrating":
      button(tr("跳过校准", "Skip calibration"), { type: "SKIP_CALIBRATION" });
      break;
    case "learning":
      if (routine?.pausedAt !== undefined) {
        button(tr("继续", "Carry on"), { type: "RESUME" }, "btn primary");
        button(tr("停下，回大厅", "Stop, back to the lobby"), { type: "BACK_TO_LOBBY" });
        break;
      }
      // (找拍子 first: the dance waits for the beat)
      if (!routine?.tapIn) button(tr("开始跳", "Dance"), { type: "START_DANCING" }, "btn primary");
      if (routine?.leadStartAt !== null && routine?.leadStartAt !== undefined) button(tr("暂停", "Pause"), { type: "PAUSE" });
      button(tr("停下，回大厅", "Stop, back to the lobby"), { type: "BACK_TO_LOBBY" });
      break;
    case "dancing":
      if (routine?.pausedAt !== undefined) {
        button(tr("继续", "Carry on"), { type: "RESUME" }, "btn primary");
        button(tr("停下，回大厅", "Stop, back to the lobby"), { type: "BACK_TO_LOBBY" });
        break;
      }
      button(tr("暂停", "Pause"), { type: "PAUSE" });
      // (a song plays on in its video: no going back a part)
      if (!routine?.routineId.startsWith("song-")) button(tr("这一段再来", "This part again"), { type: "RESTART_SECTION" });
      // 看结果 once the whole dance has been heard (the cool-down can be skipped)
      parts.finish = button(tr("看结果", "See the results"), { type: "FINISH_NOW" }, "btn primary");
      parts.finish.hidden = true;
      button(tr("停下，回大厅", "Stop, back to the lobby"), { type: "BACK_TO_LOBBY" });
      break;
    case "results":
      button(tr("再跳一遍", "Dance it again"), { type: "START_DANCING" }, "btn primary");
      button(tr("换一支舞", "Pick another dance"), { type: "BACK_TO_LOBBY" });
      break;
    default:
      break;
  }
  if (state && state.phase !== "ended") {
    const end = el("button", endArmed ? "btn danger" : "btn quiet", endArmed ? tr("确定结束房间", "Yes, end the room") : tr("结束房间", "End the room"));
    end.onclick = () => {
      if (endArmed) act({ type: "END_ROOM" });
      else {
        endArmed = true;
        render();
        setTimeout(() => {
          endArmed = false;
          render();
        }, 4000);
      }
    };
    box.append(end);
  }
  return box;
}

/** The host's list of dances, easy first, and whether to learn it first. */
/** Which songs have been tapped along to (the songbook): fetched when the host's picker shows. */
let tappedSongs: Record<string, unknown> | null = null;
let tappedAsked = 0;
function askSongbook() {
  if (Date.now() - tappedAsked < 15000) return;
  tappedAsked = Date.now();
  void fetch("/party/api/songs", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j && typeof j === "object") {
        tappedSongs = j as Record<string, unknown>;
        render();
      }
    })
    .catch(() => {});
}

/** The host's list: the songs (YouTube, the real ones), then the library's dances, easy first; and whether to learn it first. */
function routinePicker(): HTMLElement {
  askSongbook();
  const box = el("div", "picker");
  box.append(el("p", "picker-title", tr("热歌（电视上放 YouTube 原版）", "Songs (the real ones, from YouTube on the TV)")));
  const songs = el("div", "picker-list");
  for (const song of SONGS) {
    const b = el("button", song.id === pick ? "pick is-on" : "pick");
    b.setAttribute("aria-pressed", String(song.id === pick));
    b.append(el("span", "pick-name", `${songTitle(song)} · ${songArtist(song)}`));
    const ready = tappedSongs ? song.id in tappedSongs : true;
    b.append(el("span", "pick-meta", `${difficultyName(song.difficulty)} · ${song.bpm} BPM${ready ? "" : ` · ${tr("第一次跳先一起找拍子", "first time: find the beat together")}`}`));
    b.onclick = () => {
      pick = song.id;
      render();
    };
    songs.append(b);
  }
  box.append(songs);
  box.append(el("p", "picker-title", tr("练习舞（鼓点伴奏）", "Practice dances (with a beat)")));
  const list = el("div", "picker-list");
  for (const r of ROUTINES) {
    const b = el("button", r.id === pick ? "pick is-on" : "pick");
    b.setAttribute("aria-pressed", String(r.id === pick));
    b.append(el("span", "pick-name", routineName(r)));
    const show = buildShow(r.id, mode);
    b.append(el("span", "pick-meta", `${difficultyName(r.difficulty)} · ${styleName(r.style)} · ${r.bpm} BPM${show ? ` · ${showMinutes(show)}` : ""}`));
    b.onclick = () => {
      pick = r.id;
      render();
    };
    list.append(b);
  }
  box.append(list);
  const modes = el("div", "picker-modes");
  for (const [m, label] of [
    ["learn", tr("先学再跳", "Learn it first")],
    ["dance", tr("直接跳", "Just dance")],
  ] as const) {
    const b = el("button", m === mode ? "chip is-on" : "chip", label);
    b.setAttribute("aria-pressed", String(m === mode));
    b.onclick = () => {
      mode = m;
      render();
    };
    modes.append(b);
  }
  box.append(modes);
  return box;
}

function playerList(): HTMLElement {
  const ul = el("ul", "players");
  const host = isHost();
  for (const p of state!.players) {
    const li = el("li", p.id === myId ? "player me" : "player", p.name);
    if (p.isHost) li.append(el("span", "host", tr("主人", "host")));
    if (host && p.id !== myId) {
      const kick = el("button", "kick", "×");
      kick.setAttribute("aria-label", tr(`请 ${p.name} 离开`, `Remove ${p.name}`));
      kick.onclick = () => act({ type: "KICK", playerId: p.id });
      li.append(kick);
    }
    ul.append(li);
  }
  return ul;
}

function renderSync() {
  if (!parts.sync) return;
  parts.sync.textContent =
    clockSet()
      ? `${tr("已对时", "Clock set")} · ${tr("往返", "round trip")} ${Math.round(est.rttMs)} ms${est.confident ? "" : ` · ${tr("还不太准", "not settled yet")}`}`
      : waitingForSpeaker
        ? tr("等大屏开始后对时", "Setting the clock once the speaker page starts")
        : tr("对时中……", "Setting the clock…");
}

/** The verdict on the last beat (or, while nothing is scored, what to do) and this player's meter. */
function renderBeat() {
  if (parts.verdict) {
    const v = heardBeat.scored ? (tracking.last?.verdict ?? null) : null;
    parts.verdict.textContent = heardBeat.scored || !heardBeat.stage ? verdictText(v) : restHint(heardBeat.stage);
    parts.pad?.classList.toggle("is-hit", v === "hit");
    parts.pad?.classList.toggle("is-miss", v === "miss");
  }
  if (parts.meter) {
    const r = tracking.recent;
    parts.meter.textContent = r.length ? tr(`最近 ${r.length} 拍踩准 ${r.filter((v) => v === "hit").length} 拍`, `On the beat: ${r.filter((v) => v === "hit").length} of the last ${r.length}`) : "";
  }
}

// ---------- the beat

let lastBeat: number | null = null;

/** Every frame: on each beat the room hears, a flash; the move and the count; the judge. */
function frame() {
  const t = speakerNow();
  if (t !== null && !tracking.judge && tracking.heard.length) track();
  const run = tracking.heard;
  if (t !== null && running()) {
    // (half a frame early, so the flash lands on the beat on average rather than after it)
    const spot = spotAt(run, t + 8);
    const k = spot ? spot.i : -1;
    if (k !== lastBeat) {
      // (a phone that comes in mid-beat waits for the next one rather than flashing off the beat)
      const first = lastBeat === null;
      lastBeat = k;
      const b = spot ? run[spot.i]! : null;
      if (b && !first && spot!.frac < 0.5) {
        flash.className = b.stage === "countdown" ? "flash count" : (b.count - 1) % 4 === 0 ? "flash accent" : "flash beat";
        void flash.offsetWidth;
        flash.classList.add("on");
      }
    }
    judgeBeats(t);
    showBeat(t);
  } else if (lastBeat !== null) {
    lastBeat = null;
    if (parts.count) parts.count.textContent = "";
  }
  if (parts.clock) {
    parts.clock.textContent = t === null ? tr("还没对时", "Clock not set yet") : `${clockText(t)}\n${tr("往返", "round trip")} ${Math.round(est.rttMs)} ms · ${est.samples} ${tr("次", "probes")}${state ? `\n${tr("电视延迟", "TV delay")} ${state.audioOffsetMs} ms` : ""}`;
  }
  requestAnimationFrame(frame);
}

/** The move, the count and what's next, as the room hears them (when they change). */
function showBeat(t: number) {
  if (!parts.count) return;
  const run = tracking.heard;
  const spot = spotAt(run, t);
  const b = spot ? run[spot.i]! : null;
  const nx = spot ? nextChange(run, spot.i, spot.frac) : null;
  const preview = nx && nx.beats <= PREVIEW_BEATS ? nx.beat : null;
  // (the room takes 看结果 a second after the dance's last beat is heard; the button comes half a
  // second after that, so a quick tap never lands before the room's clock gets there)
  const danceHeard = tracking.zero !== null && tracking.show ? t >= tracking.zero + tracking.show.danceMs + 1500 : false;
  const key = `${spot?.i ?? -1}|${preview ? `${preview.stage}${preview.move?.id}` : ""}|${getLang()}|${danceHeard}`;
  if (key === shown) return;
  shown = key;
  if (parts.finish) parts.finish.hidden = !danceHeard;
  // a new stretch of scored beats starts with no verdict from the one before
  const scored = !!b?.score;
  if (scored && !heardBeat.scored) tracking.last = null;
  heardBeat = { scored, stage: b?.stage ?? null };
  if (!b) {
    const before = run.length > 0 && t < run[0]!.t;
    if (parts.stage) parts.stage.textContent = before ? tr("马上开始，看大屏", "Starting in a moment: watch the TV") : t >= runEnd(run) ? tr("跳完了", "That's the song") : "";
    for (const x of [parts.move, parts.body, parts.count, parts.next]) if (x) x.textContent = "";
    parts.pad?.classList.add("is-rest");
    renderBeat();
    return;
  }
  if (parts.stage) parts.stage.textContent = stageName(b.stage);
  if (parts.move) parts.move.textContent = b.move ? moveName(b.move) : "";
  if (parts.body) parts.body.textContent = b.move && (b.stage === "watch" || b.stage === "warmup") ? bodyHint(b.move) : "";
  parts.count.textContent = String(b.count);
  if (parts.next) parts.next.textContent = preview ? `${tr("接下来：", "Next: ")}${preview.move ? moveName(preview.move) : stageName(preview.stage)}` : "";
  // the big button counts on the beats that are scored (your turn, the dance); it rests otherwise
  parts.pad?.classList.toggle("is-rest", !b.score);
  renderBeat();
}

// ---------- the pulse: how this player is moving, for their little dancer on the TV

/** How hard this player is moving now (0 to 1): the sensor's energy, or a tap's that fades. */
function energyNow(): number {
  const local = performance.now();
  const tap = Math.exp(-Math.max(0, local - tappedAt) / 350);
  return Math.max(motion.level(local), tap);
}

let pulse = { at: 0, e: -1, judged: -1 };
/** Eight times a second while a dance plays: the energy, and a beat's verdict once it's judged. */
setInterval(() => {
  if (!running() || !sock?.isOpen) return;
  const e = Math.round(energyNow() * 100) / 100;
  const j = tracking.last;
  const fresh = j && j.i !== pulse.judged ? j : null;
  const now = performance.now();
  if (parts.level) {
    const fill = parts.level.firstElementChild as HTMLElement | null;
    if (fill) fill.style.width = `${Math.round(e * 100)}%`;
  }
  // (nothing new: one now and then, so the TV sees a player who stopped)
  if (!fresh && Math.abs(e - pulse.e) < 0.04 && now - pulse.at < 600) return;
  sock.send({ t: "pulse", e, v: fresh ? fresh.verdict : null });
  pulse = { at: now, e, judged: fresh ? fresh.i : pulse.judged };
}, 125);

// the clock drifts and Wi-Fi changes: a few more pings every 15 s
setInterval(() => {
  if (sock?.isOpen) burst(3);
}, 15000);

// for scripts/timing-check.cjs and scripts/song-check.cjs: what this phone thinks and has done, and
// a host's action (song-check starts the short test dance, which no page lists, with it)
Object.assign(window, {
  partyDebug: {
    clock: () => ({ ...est }),
    state: () => state,
    myId,
    judged: () => tracking.last,
    sent: () => tracking.sent,
    dancing: () => tracking.judge?.dancing ?? false,
    act,
    /** the connection drops for `ms` (song-check: the bars sent meanwhile must still get there) */
    drop: (ms: number) => sock?.pause(ms),
    /** a pretend hand: a reading of the motion sensor (m/s², gravity out) at this page's time */
    motion: (a: number, t: number) => motion.feed(a, t),
    energy: energyNow,
  },
});

setLang(getLang());
render();
requestAnimationFrame(frame);
// this tab was in this room before a reload: back in without the form
try {
  if (code && sessionStorage.getItem("party:room") === code) join();
} catch {
  // no session storage: the form
}

// A phone's page, /party/join: join with the code, set its clock by the speaker's (8 pings, then a
// few every 15 s), flash on every beat the room hears, and the 我在 button the big screen shows.
// The first one in is the host: they calibrate (a big button to tap along with the TV) and start.
import { countInPhrase, type RoomState } from "../../../party-base/src/index";
import { COUNT_IN_BEATS, METRONOME, type HostAction, type RoutineInfo, type ServerMsg } from "../shared/protocol";
import { ClockSync, RoomSocket, ScreenAwake, clockText, el, getLang, setLang, tr, wsUrl } from "./common";

const app = document.getElementById("app")!;
const flash = document.getElementById("flash")!;

const myId = loadId();
let code = (new URLSearchParams(location.search).get("code") ?? "").toUpperCase();
let name = loadName();
let sock: RoomSocket | null = null;
let state: RoomState | null = null;
let routine: RoutineInfo | null = null;
let fatal: Extract<ServerMsg, { t: "fatal" }> | null = null;
let notice = "";
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let taps = 0;
let measure = false;
let endArmed = false;
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
const speakerNow = (): number | null => (clockSet() ? performance.now() + est.offsetMs : null);

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
    if (open) burst(8);
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
      state = m.state;
      routine = m.routine;
      if (state.phase === "calibrating" && before !== "calibrating") taps = 0;
      endArmed = false;
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

// ---------- the page

const parts: { count?: HTMLElement; sync?: HTMLElement; clock?: HTMLElement } = {};

function render() {
  app.replaceChildren();
  parts.count = parts.sync = parts.clock = undefined;
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
  const main = el("main", "phone");
  main.append(el("p", "room-line", `${tr("房间", "Room")} ${code} · ${name || tr("玩家", "Player")}${isHost() ? ` · ${tr("主人", "host")}` : ""}`));
  parts.sync = el("p", "sync");
  main.append(parts.sync);
  main.append(el("h2", "phase", phaseTitle()));
  parts.count = el("div", "count");
  main.append(parts.count);
  if (state?.phase === "calibrating" && isHost()) main.append(tapPad());
  const here = el("button", "btn here", tr("我在", "I'm here"));
  here.onclick = () => {
    sock?.send({ t: "here" });
    say(tr("大屏上你的名字亮了", "Your name lit up on the big screen"));
  };
  main.append(here);
  if (isHost()) main.append(hostPanel());
  if (notice) main.append(el("p", "notice", notice));
  if (state) main.append(playerList());
  if (measure) {
    parts.clock = el("div", "measure-clock");
    main.append(parts.clock);
  }
  app.append(main);
  renderSync();
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
      return host ? tr("人齐了就开始", "Start when everyone's in") : tr("等主人开始", "Waiting for the host");
    case "calibrating":
      return host ? tr("听到电视的声音就点下面的大按钮", "Tap the big button each time you hear the TV") : tr("主人在校准，稍等", "The host is calibrating");
    case "learning":
      return host ? tr("准备好了就点「开始跳」", "Tap Dance when everyone's ready") : tr("准备", "Get ready");
    case "dancing":
      return tr("跟着闪光的节奏动起来", "Move with the flashes");
    case "results":
      return tr("跳完了", "That's the song");
    case "ended":
      return tr("房间已结束", "The room has ended");
  }
}

function tapPad(): HTMLElement {
  const pad = el("button", "btn tap-pad", `${tr("点", "Tap")}\n${taps} / 8`);
  // pointerdown, not click: a click comes after the finger lifts, later than the tap
  pad.addEventListener(
    "pointerdown",
    () => {
      const at = speakerNow();
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

function hostPanel(): HTMLElement {
  const box = el("section", "host-panel");
  const button = (label: string, action: HostAction, cls = "btn") => {
    const b = el("button", cls, label);
    b.onclick = () => act(action);
    box.append(b);
  };
  switch (state?.phase) {
    case "lobby":
      button(tr("校准电视延迟", "Calibrate the TV delay"), { type: "START_CALIBRATION" });
      button(tr("开始：120 拍节拍器", "Start: 120 BPM metronome"), { type: "START_LEARNING", routineId: METRONOME.routineId, difficulty: "easy", bpm: METRONOME.bpm }, "btn primary");
      break;
    case "calibrating":
      button(tr("跳过校准", "Skip calibration"), { type: "SKIP_CALIBRATION" });
      break;
    case "learning":
      button(tr("开始跳", "Dance"), { type: "START_DANCING" }, "btn primary");
      button(tr("回大厅", "Back to the lobby"), { type: "BACK_TO_LOBBY" });
      break;
    case "dancing":
      button(tr("从头再来", "Restart"), { type: "RESTART_SECTION" });
      break;
    case "results":
      button(tr("再跳一遍", "Dance again"), { type: "START_DANCING" }, "btn primary");
      button(tr("回大厅", "Back to the lobby"), { type: "BACK_TO_LOBBY" });
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

// ---------- the beat

let lastBeat: number | null = null;

/** Every frame: on each beat the room hears (the speaker's grid plus the TV's delay), a flash. */
function frame() {
  const now = speakerNow();
  const s = state;
  if (s?.phase === "dancing" && s.routineStartAt !== null && routine && now !== null) {
    const ms = 60000 / routine.bpm;
    const heard = s.routineStartAt + s.audioOffsetMs;
    // (half a frame early, so the flash lands on the beat on average rather than after it)
    const k = Math.floor((now + 8 - heard) / ms);
    if (k !== lastBeat) {
      // (a phone that comes in mid-beat waits for the next one rather than flashing off the beat)
      const first = lastBeat === null;
      lastBeat = k;
      if (first) {
        // nothing
      } else if (k >= -COUNT_IN_BEATS && k < routine.totalBeats) {
        flash.className = k < 0 ? "flash count" : k % routine.beatsPerBar === 0 ? "flash accent" : "flash beat";
        void flash.offsetWidth;
        flash.classList.add("on");
        if (parts.count) parts.count.textContent = k < 0 ? String(-k) : String(countInPhrase({ bpm: routine.bpm, beatsPerBar: routine.beatsPerBar, startAt: heard, totalBeats: routine.totalBeats }, k));
      } else if (parts.count) parts.count.textContent = "";
    }
  } else if (lastBeat !== null) {
    lastBeat = null;
    if (parts.count) parts.count.textContent = "";
  }
  if (parts.clock) {
    parts.clock.textContent = now === null ? tr("还没对时", "Clock not set yet") : `${clockText(now)}\n${tr("往返", "round trip")} ${Math.round(est.rttMs)} ms · ${est.samples} ${tr("次", "probes")}${state ? `\n${tr("电视延迟", "TV delay")} ${state.audioOffsetMs} ms` : ""}`;
  }
  requestAnimationFrame(frame);
}

// the clock drifts and Wi-Fi changes: a few more pings every 15 s
setInterval(() => {
  if (sock?.isOpen) burst(3);
}, 15000);

// for scripts/timing-check.cjs: what this phone thinks the speaker's clock is
Object.assign(window, { partyDebug: { clock: () => ({ ...est }), state: () => state, myId } });

setLang(getLang());
render();
requestAnimationFrame(frame);
// this tab was in this room before a reload: back in without the form
try {
  if (code && sessionStorage.getItem("party:room") === code) join();
} catch {
  // no session storage: the form
}

// /party/moves: the 20 moves, each danced by the 3D coach on a beat, to look at before a party (and
// what the checks photograph). ?move=<id> picks one; ?still=<beat> stops the coach at that point of
// its 8-count (0 = count 1); ?gl=any draws it even in software.
import { MOVES, moveById, type Move } from "../shared/catalog";
import { el, getLang, pageClock, setLang, tr } from "./common";
import { canCoach, glowOf } from "./coach/index";
import { CoachStage } from "./coach/stage";
import { Synth } from "./synth";
import { bodyHint, difficultyName, moveHow, moveName, moveOther } from "./words";

const q = new URLSearchParams(location.search);
let still = q.has("still") ? Number(q.get("still")) : null;
let move: Move = moveById(q.get("move") ?? "") ?? MOVES[0]!;
let slow = q.get("speed") === "slow";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

const synth = new Synth();
let sound = false;
let coach: CoachStage | null = null;
/** the beat grid: when beat 0 was (speaker time) and the tempo */
let zero = pageClock() + 400;
let nextClick = 0;

const app = document.getElementById("app")!;
const parts: { box?: HTMLElement; count?: HTMLElement; name?: HTMLElement; other?: HTMLElement; how?: HTMLElement; body?: HTMLElement } = {};

const bpm = () => Math.round(move.native_bpm * (slow ? 0.7 : 1));
const beatMs = () => 60000 / bpm();

function restart() {
  zero = pageClock() + 300;
  nextClick = 0;
}

function render() {
  app.replaceChildren();
  const bar = el("header", "bar");
  bar.append(el("span", "brand", tr("一起跳 · 动作", "Dance Along · Moves")));
  const tools = el("span", "bar-tools");
  const lang = el("button", "chip", getLang() === "zh" ? "EN" : "中文");
  lang.onclick = () => {
    setLang(getLang() === "zh" ? "en" : "zh");
    render();
  };
  tools.append(lang);
  bar.append(tools);
  app.append(bar);

  const main = el("main", "moves-page");
  const stage = el("section", "moves-stage");
  parts.box = el("div", "coach-3d");
  stage.append(parts.box);
  const side = el("div", "moves-side");
  parts.name = el("h1", "coach-move");
  parts.other = el("p", "coach-other");
  parts.how = el("p", "coach-how");
  parts.body = el("p", "coach-body");
  parts.count = el("div", "count");
  const ctl = el("div", "moves-ctl");
  const speed = el("button", "chip", slow ? tr("正常速度", "Full speed") : tr("放慢", "Slow it down"));
  speed.onclick = () => {
    slow = !slow;
    restart();
    render();
  };
  const snd = el("button", "chip", sound ? tr("关掉拍子声", "Beat off") : tr("打开拍子声", "Beat on"));
  snd.onclick = () => {
    if (!sound) {
      if (!synth.running) synth.start();
      sound = true;
      restart();
    } else sound = false;
    render();
  };
  ctl.append(speed, snd);
  side.append(parts.name, parts.other, parts.how, parts.body, parts.count, ctl);
  stage.append(side);
  main.append(stage);

  const list = el("ul", "moves-list");
  for (const m of MOVES) {
    const li = el("li");
    const b = el("button", m.id === move.id ? "pick is-on" : "pick");
    b.setAttribute("aria-pressed", String(m.id === move.id));
    b.append(el("span", "pick-name", moveName(m)), el("span", "pick-meta", `${difficultyName(m.difficulty)} · ${bodyHint(m)}`));
    b.onclick = () => {
      move = m;
      history.replaceState(null, "", `?move=${m.id}`);
      restart();
      render();
    };
    li.append(b);
    list.append(li);
  }
  main.append(list);
  app.append(main);

  parts.name.textContent = moveName(move);
  parts.other.textContent = moveOther(move);
  parts.how.textContent = moveHow(move);
  parts.body.textContent = `${bodyHint(move)} · ${bpm()} BPM`;
  if (canCoach()) {
    coach ??= new CoachStage(reduced);
    coach.attach(parts.box);
  } else parts.box.append(el("p", "lead", tr("这台设备画不了 3D 老师。", "This device can't draw the 3D coach.")));
}

function frame() {
  const now = pageClock();
  const p = still ?? Math.max(0, (now - zero) / beatMs());
  drawAt(still ?? p % 8, still ?? p, still !== null ? 1000 : now);
  if (sound && still === null) {
    // the next beat's click goes to the audio clock a little ahead
    while (zero + nextClick * beatMs() < now + 150) {
      const t = zero + nextClick * beatMs();
      if (t >= now - 5) synth.click(t, nextClick % 8 === 0 ? "accent" : "beat");
      nextClick++;
    }
  }
  if (still === null) requestAnimationFrame(frame);
  else (window as unknown as { coachReady?: boolean }).coachReady = true;
}

/** The coach at a beat position of its 8-count (`beat` counts up for the effects), and the count. */
function drawAt(pos: number, beat: number, now: number) {
  if (parts.count) parts.count.textContent = String(Math.floor(pos) + 1);
  coach?.frame({ doing: { kind: "move", id: move.id }, p: pos, beat, now, glow: glowOf(move), hype: 0.3 });
}

setLang(getLang());
render();
requestAnimationFrame(frame);

// for the checks' photographs: one move, stopped at a beat position, drawn once
Object.assign(window, {
  coachShow: (id: string, p: number) => {
    const m = moveById(id);
    if (!m) return false;
    if (m.id !== move.id) {
      move = m;
      render();
    }
    still = p;
    coach?.snap();
    frame();
    return true;
  },
  coachJoints: () => coach?.joints() ?? null,
  /** a film's frame: the move at a beat position, at a time (ms), the blends and trails kept */
  coachTick: (id: string, pos: number, beat: number, now: number) => {
    const m = moveById(id);
    if (!m) return false;
    still = -1;
    if (m.id !== move.id) {
      move = m;
      render();
    }
    drawAt(pos, beat, now);
    return true;
  },
});

/**
 * 开发页：键盘 / 鼠标 / 触屏开 Rapier 物理，canvas 画画面。`npm run play`。
 * 带回放录制：`?record=1` 一进来就录，或者点「录制」；停止时下载 replays 用的 JSON（每物理步一帧）。
 */
import { CFG } from '../physics/config';
import { sampleLevel } from '../physics/level';
import type { Replay } from '../physics/replay';
import { createSim, type PadInput, type Sim } from '../physics/world';
import { Renderer } from '../render/canvas';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const canvas = $<HTMLCanvasElement>('stage');
const renderer = new Renderer(canvas);
const level = sampleLevel();
let sim: Sim = await createSim(level, 1);
let nPlayers = 1;

// ---------- 输入 ----------
const keys = new Set<string>();
const mouse = { x: 0, y: 0, active: false, L: false, R: false };
const touch = { ax: 0, ay: 0, L: false, R: false, stickId: null as number | null, sx: 0, sy: 0 };
const isTouch = matchMedia('(hover: none), (pointer: coarse)').matches;
if (isTouch) {
  $('helpDesk').hidden = true;
  $('helpTouch').hidden = false;
}

addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
  }
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') {
    if (e.button === 0) mouse.L = true;
    if (e.button === 2) mouse.R = true;
  }
});
addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse') {
    if (e.button === 0) mouse.L = false;
    if (e.button === 2) mouse.R = false;
  }
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const hold = (el: HTMLElement, key: 'L' | 'R'): void => {
  const on = (e: PointerEvent): void => {
    e.preventDefault();
    touch[key] = true;
    el.classList.add('down');
    el.setPointerCapture?.(e.pointerId);
  };
  const off = (e: PointerEvent): void => {
    e.preventDefault();
    touch[key] = false;
    el.classList.remove('down');
  };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('lostpointercapture', off);
};
hold($('padL'), 'L');
hold($('padR'), 'R');
const stick = $('stick');
const knob = $('knob');
const stickR = 44;
const moveStick = (e: PointerEvent): void => {
  let dx = e.clientX - touch.sx;
  let dy = e.clientY - touch.sy;
  const d = Math.hypot(dx, dy) || 1;
  if (d > stickR) {
    dx = (dx / d) * stickR;
    dy = (dy / d) * stickR;
  }
  touch.ax = dx / stickR;
  touch.ay = dy / stickR;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
};
stick.addEventListener('pointerdown', (e) => {
  touch.stickId = e.pointerId;
  const r = stick.getBoundingClientRect();
  touch.sx = r.left + r.width / 2;
  touch.sy = r.top + r.height / 2;
  stick.setPointerCapture(e.pointerId);
  moveStick(e);
});
stick.addEventListener('pointermove', (e) => {
  if (e.pointerId === touch.stickId) moveStick(e);
});
const endStick = (e: PointerEvent): void => {
  if (e.pointerId === touch.stickId) {
    touch.stickId = null;
    touch.ax = 0;
    touch.ay = 0;
    knob.style.transform = '';
  }
};
stick.addEventListener('pointerup', endStick);
stick.addEventListener('pointercancel', endStick);

function readInputs(): PadInput[] {
  const inputs: PadInput[] = [];
  const p1 = sim.players[0];
  if (!p1) return inputs;
  let ax = 0;
  let ay = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1;
  if (!ax && !ay && touch.stickId !== null) {
    ax = touch.ax;
    ay = touch.ay;
  }
  if (!ax && !ay && mouse.active && !isTouch) {
    const s = renderer.toScreen(p1.body);
    const dx = mouse.x - s.x;
    const dy = mouse.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d > 24) {
      ax = dx / Math.max(d, 90);
      ay = dy / Math.max(d, 90);
    }
  }
  inputs.push({
    ax,
    ay,
    gl: keys.has('KeyQ') || keys.has('ShiftLeft') || mouse.L || touch.L,
    gr: keys.has('KeyE') || keys.has('ShiftRight') || mouse.R || touch.R,
  });
  if (sim.players[1]) {
    let bx = 0;
    let by = 0;
    if (keys.has('KeyJ')) bx -= 1;
    if (keys.has('KeyL')) bx += 1;
    if (keys.has('KeyI')) by -= 1;
    if (keys.has('KeyK')) by += 1;
    inputs.push({ ax: bx, ay: by, gl: keys.has('KeyU'), gr: keys.has('KeyO') });
  }
  return inputs;
}

// ---------- 录制 ----------
let recording: Replay | null = null;
const recBtn = $<HTMLButtonElement>('rec');
function startRecording(): void {
  recording = { level: level.id, dt: CFG.step, players: sim.players.length, frames: [] };
  recBtn.textContent = '■ 停止录制';
  recBtn.classList.add('live');
}
function stopRecording(): void {
  if (!recording) return;
  const blob = new Blob([JSON.stringify(recording)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `replay-${level.id}-${Date.now()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  recording = null;
  recBtn.textContent = '● 录制';
  recBtn.classList.remove('live');
}
recBtn.addEventListener('click', () => (recording ? stopRecording() : startRecording()));
// 发到 claude.ai 的试玩页下载不了文件，录制按钮藏起来
if ('claude' in window || /claude\.ai$/.test(location.hostname)) recBtn.hidden = true;
if (new URLSearchParams(location.search).get('record') === '1') startRecording();

// ---------- 主循环 ----------
let last = performance.now();
let acc = 0;
const DT = CFG.step;
let frameTimes: number[] = [];

addEventListener('resize', () => renderer.resize());
renderer.resize();

function frame(now: number): void {
  const t0 = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;
  const inputs = readInputs();
  inputs.forEach((input, i) => sim.setInput(i, input));
  while (acc >= DT) {
    sim.step(DT);
    renderer.handleEvents(sim, sim.events);
    for (const ev of sim.events) if (ev.type === 'win') showWin();
    if (recording && !sim.won) recording.frames.push(inputs.map((x) => ({ ...x })));
    acc -= DT;
  }
  renderer.updateCamera(sim, dt);
  renderer.draw(sim, dt);
  $('clock').textContent = sim.time.toFixed(1);
  $('deaths').textContent = String(sim.players.reduce((s, p) => s + p.deaths, 0));
  frameTimes.push(performance.now() - t0);
  if (frameTimes.length >= 60) {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    $('ms').textContent = (sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(1);
    frameTimes = [];
  }
  requestAnimationFrame(frame);
}

// ---------- UI ----------
const winEl = $('win');
function showWin(): void {
  winEl.hidden = false;
  $('winTime').textContent = `${sim.time.toFixed(1)} s`;
  const d = sim.players.reduce((s, p) => s + p.deaths, 0);
  $('winLine').textContent = `${sim.players.length} 个人到顶，一共掉下去 ${d} 次。`;
  if (recording) stopRecording();
}
async function restart(): Promise<void> {
  sim.destroy();
  sim = await createSim(level, nPlayers);
  winEl.hidden = true;
  renderer.reset();
}
$('again').addEventListener('click', () => void restart());
$('reset').addEventListener('click', () => void restart());
$('p2btn').addEventListener('click', (e) => {
  nPlayers = nPlayers === 1 ? 2 : 1;
  sim.setPlayers(nPlayers);
  (e.currentTarget as HTMLButtonElement).textContent = nPlayers === 1 ? '+ 第二个人' : '− 第二个人';
});
setTimeout(() => {
  $('help').style.opacity = '0';
}, 14000);
canvas.addEventListener(
  'pointerdown',
  () => {
    $('help').style.opacity = '0';
  },
  { once: true },
);

// 调试口：控制台里 hangOn.sim 看状态，hangOn.CFG 改参数（下一步生效）
(window as unknown as { hangOn: unknown }).hangOn = {
  get sim() {
    return sim;
  },
  CFG,
};

requestAnimationFrame(frame);

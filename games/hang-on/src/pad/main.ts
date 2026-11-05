/**
 * 手柄页（手机横着拿）：左半边按住拖动是浮动摇杆，右半边两个大键按住就是抓。
 * 每帧把输入发给主机；屏幕上只显示自己的颜色、两只手、摔死次数、延迟和连接状态，眼睛要在电视上。
 */
import { PadLink, seatId } from '../net/pad-link';
import { rttLevel } from '../net/latency';
import { CODE_RE, type FatalKey, type PadStatus } from '../net/protocol';
import { cleanLook, EYES, GLASSES, HATS, LOOK_NAMES, randomLook, type Look } from '../look';
import { drawLook } from './look-preview';

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};
const COLORS = ['#F28CA6', '#9BCF83', '#F8C56D', '#8EC5E8'];

// ---------- 加入 ----------
const codeIn = $<HTMLInputElement>('code');
const nameIn = $<HTMLInputElement>('name');
const params = new URLSearchParams(location.search);
codeIn.value = (params.get('code') ?? '').toUpperCase().slice(0, 4);
try {
  nameIn.value = localStorage.getItem('hang-on:name') ?? '';
} catch {
  // 没有存储
}
let link: PadLink | null = null;

$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = codeIn.value.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    $('err').textContent = '房间码是电视上那 4 个字。';
    return;
  }
  const name = nameIn.value.trim() || '糯米团';
  try {
    localStorage.setItem('hang-on:name', name);
  } catch {
    // 记不住就记不住
  }
  $('err').textContent = '';
  join(code, name);
});

function join(code: string, name: string): void {
  link?.close();
  link = new PadLink(code, seatId(), name, {
    onStatus: (s) => status(s),
    onConn: (c) => conn(c),
    onFatal: (key) => fatal(key),
  });
  link.setLook(look);
  $('meName').textContent = name;
  $('join').hidden = true;
  $('pad').hidden = false;
  $('turn').hidden = false;
  void goFullscreen();
  void keepAwake();
}

function fatal(key: FatalKey): void {
  const line: Record<FatalKey, string> = {
    noRoom: '没有这个房间，看看电视上的码。',
    full: '房间满了（最多 4 个手柄）。',
    ended: '这局结束了。',
    badRequest: '出了点问题，再试一次。',
    kicked: '主机把你请出去了。',
    hostTaken: '出了点问题，再试一次。',
  };
  $('err').textContent = line[key];
  $('pad').hidden = true;
  $('turn').hidden = true;
  $('join').hidden = false;
  link?.close();
  link = null;
}

async function goFullscreen(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch {
    // iPhone 的 Safari 没有全屏，网页就这样
  }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void> };
    await so.lock?.('landscape');
  } catch {
    // 锁不了就提示横过来
  }
}

async function keepAwake(): Promise<void> {
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } }).wakeLock;
  try {
    await wl?.request('screen');
  } catch {
    // 不给就算了
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void wl?.request('screen').catch(() => undefined);
  });
}

// ---------- 换装 ----------
let look: Look = cleanLook(null);
try {
  look = cleanLook(JSON.parse(localStorage.getItem('hang-on:look') ?? 'null'));
} catch {
  // 没有存储
}
let myColor = COLORS[0] as string;
const dlg = $<HTMLDialogElement>('lookDlg');
const LISTS = { hat: HATS, glasses: GLASSES, eyes: EYES } as const;
function renderLook(): void {
  $('valHat').textContent = LOOK_NAMES.hat[look.hat].zh;
  $('valGlasses').textContent = LOOK_NAMES.glasses[look.glasses].zh;
  $('valEyes').textContent = LOOK_NAMES.eyes[look.eyes].zh;
  drawLook($<HTMLCanvasElement>('lookPreview'), look, myColor);
  drawLook($<HTMLCanvasElement>('lookMini'), look, myColor);
  const parts = [look.hat !== 'none' ? LOOK_NAMES.hat[look.hat].zh : '', look.glasses !== 'none' ? LOOK_NAMES.glasses[look.glasses].zh : ''].filter(Boolean);
  $('lookSummary').textContent = parts.length ? parts.join(' · ') : '换个样子';
}
function openLook(): void {
  renderLook();
  dlg.showModal();
}
/** 关掉对话框就算定了：存起来，告诉主机。 */
function closeLook(): void {
  try {
    localStorage.setItem('hang-on:look', JSON.stringify(look));
  } catch {
    // 记不住就记不住
  }
  renderLook();
  link?.setLook(look);
}
$('lookBtn').addEventListener('click', openLook);
$('lookBtn2').addEventListener('click', openLook);
$('lookDone').addEventListener('click', () => dlg.close());
dlg.addEventListener('close', closeLook);
$('lookRandom').addEventListener('click', () => {
  look = randomLook();
  renderLook();
});
for (const btn of dlg.querySelectorAll<HTMLButtonElement>('button[data-k]')) {
  btn.addEventListener('click', () => {
    const k = btn.dataset.k as keyof typeof LISTS;
    const list = LISTS[k] as readonly string[];
    const i = (list.indexOf(look[k]) + Number(btn.dataset.d) + list.length) % list.length;
    look = { ...look, [k]: list[i] };
    renderLook();
  });
}
renderLook();

// ---------- 召唤 ----------
/** 召唤要连发几帧，不可靠通道丢一两条也送得到；主机 1 秒内只算一次。 */
let actFrames = 0;
const summonBtn = $<HTMLButtonElement>('summonBtn');
summonBtn.addEventListener('click', () => {
  actFrames = 12;
  buzz(20);
});

// ---------- 状态 ----------
let lastHands: [boolean, boolean] = [false, false];
let lastDeaths = 0;
function status(s: PadStatus): void {
  const color = COLORS[s.color] ?? COLORS[0]!;
  if (color !== myColor) {
    myColor = color;
    renderLook();
  }
  document.documentElement.style.setProperty('--mine', color);
  summonBtn.disabled = !(s.phase === 'playing' && (s.teamDead ?? 0) > 0);
  $('handL').classList.toggle('on', s.hands[0]);
  $('handR').classList.toggle('on', s.hands[1]);
  $('deaths').textContent = String(s.deaths);
  const rtt = $('rtt');
  rtt.textContent = s.rttMs === null ? '—' : `${s.rttMs.toFixed(0)} ms`;
  rtt.className = `ms ${s.rttMs === null ? '' : rttLevel(s.rttMs)}`;
  $('path').textContent = s.direct ? '直连' : '绕路中';
  if ((s.hands[0] && !lastHands[0]) || (s.hands[1] && !lastHands[1])) buzz(30);
  if (s.deaths > lastDeaths) {
    buzz([60, 40, 60]);
    const f = $('flash');
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 120);
  }
  lastHands = [s.hands[0], s.hands[1]];
  lastDeaths = s.deaths;
}

function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // iPhone 不支持，上面闪屏补
  }
}

function conn(c: { socket: boolean; direct: boolean }): void {
  const el = $('conn');
  if (!c.socket) {
    el.textContent = '重连中…';
    el.className = 'conn bad';
  } else {
    el.textContent = '已连接';
    el.className = 'conn';
  }
  if (c.socket) $('path').textContent = c.direct ? '直连' : '绕路中';
}

// ---------- 防误触：连按两下不放大，长按不弹菜单 ----------
// 逻辑都走 pointer 事件；这里只把触摸的默认动作掐掉（Safari 的双击缩放只认 touchend 的 preventDefault）。
const pad = $('pad');
for (const type of ['touchstart', 'touchend', 'touchmove'] as const) {
  pad.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
let lastTap = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = performance.now();
    const typing = e.target instanceof HTMLInputElement;
    if (now - lastTap < 350 && !typing) e.preventDefault();
    lastTap = now;
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
pad.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- 摇杆（左半边）----------
const zone = $('stickzone');
const stick = $('stick');
const knob = $('knob');
const STICK_R = 54;
const aim = { x: 0, y: 0 };
let stickId: number | null = null;
let center = { x: 0, y: 0 };
zone.addEventListener('pointerdown', (e) => {
  if (stickId !== null) return;
  stickId = e.pointerId;
  zone.setPointerCapture(e.pointerId);
  const r = zone.getBoundingClientRect();
  center = { x: e.clientX - r.left, y: e.clientY - r.top };
  stick.style.left = `${center.x}px`;
  stick.style.top = `${center.y}px`;
  stick.hidden = false;
  move(e);
});
zone.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickId) move(e);
});
const endStick = (e: PointerEvent): void => {
  if (e.pointerId !== stickId) return;
  stickId = null;
  aim.x = 0;
  aim.y = 0;
  stick.hidden = true;
  knob.style.transform = '';
};
zone.addEventListener('pointerup', endStick);
zone.addEventListener('pointercancel', endStick);
function move(e: PointerEvent): void {
  const r = zone.getBoundingClientRect();
  let dx = e.clientX - r.left - center.x;
  let dy = e.clientY - r.top - center.y;
  const d = Math.hypot(dx, dy) || 1;
  if (d > STICK_R) {
    dx = (dx / d) * STICK_R;
    dy = (dy / d) * STICK_R;
  }
  aim.x = dx / STICK_R;
  aim.y = dy / STICK_R;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}

// ---------- 抓键（右半边）----------
const grab = { l: false, r: false };
function hold(el: HTMLElement, key: 'l' | 'r'): void {
  const on = (e: PointerEvent): void => {
    e.preventDefault();
    grab[key] = true;
    el.classList.add('down');
    el.setPointerCapture?.(e.pointerId);
  };
  const off = (e: PointerEvent): void => {
    e.preventDefault();
    grab[key] = false;
    el.classList.remove('down');
  };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('lostpointercapture', off);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
hold($('grabL'), 'l');
hold($('grabR'), 'r');

// 键盘也能开（电脑上调试）
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));

// ---------- 每帧发 ----------
function tick(): void {
  if (link) {
    let ax = aim.x;
    let ay = aim.y;
    if (!ax && !ay) {
      if (keys.has('KeyA')) ax -= 1;
      if (keys.has('KeyD')) ax += 1;
      if (keys.has('KeyW')) ay -= 1;
      if (keys.has('KeyS')) ay += 1;
    }
    const act = actFrames > 0 ? 'summon' : undefined;
    if (actFrames > 0) actFrames--;
    link.send({ ax, ay, gl: grab.l || keys.has('KeyQ'), gr: grab.r || keys.has('KeyE'), act });
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// 调试口：联机检查脚本用（装输入、掐线）
(window as unknown as { hangOnPad: unknown }).hangOnPad = {
  get link() {
    return link;
  },
  set(input: { ax?: number; ay?: number; gl?: boolean; gr?: boolean; summon?: boolean }) {
    if (input.ax !== undefined) aim.x = input.ax;
    if (input.ay !== undefined) aim.y = input.ay;
    if (input.gl !== undefined) grab.l = input.gl;
    if (input.gr !== undefined) grab.r = input.gr;
    if (input.summon) actFrames = 12;
  },
  get look() {
    return look;
  },
  join,
};

if (params.get('code') && params.get('auto') === '1') join(codeIn.value, nameIn.value || params.get('name') || '糯米团');

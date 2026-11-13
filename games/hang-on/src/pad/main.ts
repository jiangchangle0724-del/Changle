/**
 * 手柄页（手机横着拿）：左半边按住拖动是浮动摇杆，右半边两个大键按住就是抓。
 * 每帧把输入发给主机；屏幕上只显示自己的颜色、两只手、摔死次数、延迟和连接状态，眼睛要在电视上。
 *
 * 手机局（房主也是一部手机，房间带 hostPlays）：这部手机自己也画画面，摇杆和抓键变小、半透明压在画面上。
 * 画面那部分（src/pad/view.ts，带 Pixi）到了手机局才下载。
 */
import { PadLink, seatId } from '../net/pad-link';
import { rttLevel } from '../net/latency';
import { CODE_RE, type Cast, type FatalKey, type PadStatus, type RoomView } from '../net/protocol';
import type { PhoneView } from './view';
import { cleanLook, DEFAULT_LOOK, LOOK_KEYS, LOOK_NAMES, randomLook, stepLook, type Look, type LookKey } from '../look';
import { applyStatic, langButton, onLang, pickLang, tr } from '../i18n';
import { sfx } from '../audio/sfx';
import { drawLook } from './look-preview';
import { bindControls } from './controls';

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};
const COLORS = ['#F28CA6', '#9BCF83', '#F8C56D', '#8EC5E8', '#B9A2E8', '#F1E7D8'];

applyStatic();
langButton($<HTMLButtonElement>('langBtn'));

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
let lastFatal: FatalKey | null = null;
let badCode = false;

$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = codeIn.value.trim().toUpperCase();
  lastFatal = null;
  badCode = !CODE_RE.test(code);
  renderErr();
  if (badCode) return;
  const name = nameIn.value.trim() || tr('糯米团', 'Dumpling');
  try {
    localStorage.setItem('hang-on:name', name);
  } catch {
    // 记不住就记不住
  }
  join(code, name);
});

function join(code: string, name: string): void {
  link?.close();
  view?.reset();
  lastCast = null;
  watch(false);
  link = new PadLink(code, seatId(), name, {
    onStatus: (s) => status(s),
    onConn: (c) => conn(c),
    onFatal: (key) => fatal(key),
    onRoom: (r) => {
      if (!!r.hostPlays !== document.body.classList.contains('viewing')) watch(!!r.hostPlays);
      view?.room(r);
    },
    onSnap: (s) => view?.snap(s),
    onCast: (c) => {
      lastCast = c;
      view?.cast(c);
    },
  });
  link.setLook(look);
  $('meName').textContent = name;
  $('join').hidden = true;
  $('pad').hidden = false;
  $('turn').hidden = false;
  void goFullscreen();
  void keepAwake();
}

function fatalLine(key: FatalKey): string {
  switch (key) {
    case 'noRoom':
      return tr('没有这个房间，再看看房间码。', 'No such room. Check the code again.');
    case 'full':
      return tr('房间满了（最多 4 个人）。', 'The room is full (4 players max).');
    case 'ended':
      return tr('这局结束了。', 'This game has ended.');
    case 'kicked':
      return tr('主机把你请出去了。', 'The host removed you.');
    default:
      return tr('出了点问题，再试一次。', 'Something went wrong. Try again.');
  }
}

function renderErr(): void {
  $('err').textContent = badCode
    ? tr('房间码是 4 个字，在电视或房主的手机上。', "The room code is 4 characters, on the TV or the host's phone.")
    : lastFatal
      ? fatalLine(lastFatal)
      : '';
}

function fatal(key: FatalKey): void {
  lastFatal = key;
  renderErr();
  $('pad').hidden = true;
  $('turn').hidden = true;
  $('join').hidden = false;
  watch(false);
  link?.close();
  link = null;
}

// ---------- 手机局：自己也看画面 ----------
let view: PhoneView | null = null;
let viewLoad: Promise<void> | null = null;
let lastCast: Cast | null = null;
/** `?render=0`：手机局里也不画（联机检查用）。 */
const renderView = params.get('render') !== '0';

/** 进出手机局：画面铺在后面，手柄缩到角上。画面那部分第一次用到才下载。 */
function watch(on: boolean): void {
  document.body.classList.toggle('viewing', on);
  pad.classList.toggle('touch', on);
  $('view').hidden = !on;
  if (!on) for (const id of ['vWait', 'vHost', 'vCount', 'vResults']) $(id).hidden = true;
  if (!on || viewLoad) return;
  viewLoad = import('./view')
    .then(async ({ PhoneView }) => {
      view = await PhoneView.create($<HTMLCanvasElement>('view'), { render: renderView });
      const room: RoomView | null = link?.room ?? null;
      if (room) view.room(room);
      if (lastCast) view.cast(lastCast);
    })
    .catch((e: unknown) => {
      // 下载失败（断网）：下次进手机局再试；手柄照样能用
      console.warn('[hang-on] 画面没加载上', e);
      viewLoad = null;
    });
}

$('muteBtn').addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  renderMute();
});
function renderMute(): void {
  const b = $('muteBtn');
  b.textContent = sfx.muted ? tr('🔇 静音', '🔇 Muted') : tr('🔊 声音', '🔊 Sound');
  b.setAttribute('aria-pressed', String(sfx.muted));
}
renderMute();

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
let look: Look = DEFAULT_LOOK;
try {
  look = cleanLook(JSON.parse(localStorage.getItem('hang-on:look') ?? 'null'));
} catch {
  // 没有存储
}
let myColor = COLORS[0] as string;
const dlg = $<HTMLDialogElement>('lookDlg');

// 六项选择：标签、上一个、名字、下一个
const picks = $('picks');
for (const k of LOOK_KEYS) {
  const row = document.createElement('div');
  row.className = 'pick';
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  lbl.id = `lbl-${k}`;
  const prev = document.createElement('button');
  prev.type = 'button';
  prev.textContent = '‹';
  prev.dataset.k = k;
  prev.dataset.d = '-1';
  const val = document.createElement('span');
  val.className = 'val';
  val.id = `val-${k}`;
  val.setAttribute('aria-live', 'polite');
  const next = document.createElement('button');
  next.type = 'button';
  next.textContent = '›';
  next.dataset.k = k;
  next.dataset.d = '1';
  row.append(lbl, prev, val, next);
  picks.append(row);
  for (const b of [prev, next]) {
    b.addEventListener('click', () => {
      look = stepLook(look, k, Number(b.dataset.d));
      renderLook();
      if (k === 'voice') void sfx.previewVoice(look.voice);
    });
  }
}

function renderLook(): void {
  for (const k of LOOK_KEYS) {
    const names = LOOK_NAMES[k] as Record<string, { zh: string; en: string }>;
    $(`lbl-${k}`).textContent = pickLang(LOOK_NAMES.label[k]);
    $(`val-${k}`).textContent = pickLang(names[look[k]]);
  }
  for (const b of picks.querySelectorAll<HTMLButtonElement>('button')) {
    const k = b.dataset.k as LookKey;
    const what = pickLang(LOOK_NAMES.label[k]);
    b.setAttribute('aria-label', b.dataset.d === '1' ? tr(`下一个${what}`, `Next ${what.toLowerCase()}`) : tr(`上一个${what}`, `Previous ${what.toLowerCase()}`));
  }
  drawLook($<HTMLCanvasElement>('lookPreview'), look, myColor);
  drawLook($<HTMLCanvasElement>('lookMini'), look, myColor);
  const shown: LookKey[] = ['hat', 'glasses', 'face'];
  const parts = shown.filter((k) => look[k] !== DEFAULT_LOOK[k]).map((k) => pickLang((LOOK_NAMES[k] as Record<string, { zh: string; en: string }>)[look[k]]));
  $('lookSummary').textContent = parts.length ? parts.join(' · ') : tr('换个样子', 'Customize');
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
$('lookReset').addEventListener('click', () => {
  look = DEFAULT_LOOK;
  renderLook();
});
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
let lastConn = { socket: false, direct: false, known: false };
function status(s: PadStatus): void {
  const color = COLORS[s.color] ?? COLORS[0]!;
  if (color !== myColor) {
    myColor = color;
    renderLook();
  }
  document.documentElement.style.setProperty('--mine', color);
  // 没有队友可拉的玩法（比谁先各跑各的、坐不住）不出「召唤」键
  summonBtn.hidden = s.mode === 'last' || (s.mode === 'race' && s.team === undefined);
  summonBtn.disabled = !(s.phase === 'playing' && (s.teamDead ?? 0) > 0);
  // 玩法的小牌子：哪一队、第几个到、出局了
  const tag = $('tag');
  const text = s.out
    ? tr('出局了', "You're out")
    : s.place
      ? tr(`第 ${s.place} 个到`, `#${s.place} at the top`)
      : s.team !== undefined
        ? s.team === 0
          ? tr('甜队', 'Team Sweet')
          : tr('咸队', 'Team Savory')
        : '';
  tag.hidden = !text;
  tag.textContent = text;
  tag.classList.toggle('bad', !!s.out);
  $('handL').classList.toggle('on', s.hands[0]);
  $('handR').classList.toggle('on', s.hands[1]);
  $('deaths').textContent = String(s.deaths);
  const rtt = $('rtt');
  rtt.textContent = s.rttMs === null ? '—' : `${s.rttMs.toFixed(0)} ms`;
  rtt.className = `ms ${s.rttMs === null ? '' : rttLevel(s.rttMs)}`;
  lastConn = { socket: true, direct: s.direct, known: true };
  renderConn();
  if ((s.hands[0] && !lastHands[0]) || (s.hands[1] && !lastHands[1])) buzz(30);
  if (s.deaths > lastDeaths) {
    buzz([60, 40, 60]);
    // 手机局里画面自己会闪、会抖，不用再整屏红一下
    if (!document.body.classList.contains('viewing')) {
      const f = $('flash');
      f.classList.add('on');
      setTimeout(() => f.classList.remove('on'), 120);
    }
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
  lastConn = { ...c, known: true };
  renderConn();
}

function renderConn(): void {
  const el = $('conn');
  const c = lastConn;
  if (!c.known) {
    el.textContent = tr('连接中…', 'Connecting…');
    el.className = 'conn';
    $('path').textContent = tr('连接中', 'Connecting');
    return;
  }
  el.textContent = c.socket ? tr('已连接', 'Connected') : tr('重连中…', 'Reconnecting…');
  el.className = c.socket ? 'conn' : 'conn bad';
  if (c.socket) $('path').textContent = c.direct ? tr('直连', 'Direct') : tr('绕路中', 'Relayed');
}
renderConn();

onLang(() => {
  renderLook();
  renderConn();
  renderErr();
  renderMute();
  view?.relang();
});

// ---------- 防误触：连按两下不放大（输入框、按钮除外）----------
// 手柄区的触摸默认动作在 controls.ts 里掐；这里管整页（Safari 的双击缩放只认 touchend 的 preventDefault）。
// 按钮不掐：换样子的 ‹ › 要能连着点（掐了第二下就没有 click）。
const pad = $('pad');
let lastTap = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = performance.now();
    const t = e.target instanceof Element ? e.target : null;
    const own = !!t?.closest('input, button, select, label');
    if (now - lastTap < 350 && !own) e.preventDefault();
    lastTap = now;
  },
  { passive: false },
);
document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });

// ---------- 摇杆（左半边）和抓键（右半边）----------
const { aim, grab } = bindControls(pad);

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
  /** 手机局里这部手机的画面（还没加载是 null）。 */
  get view() {
    return view;
  },
  join,
};

if (params.get('code') && params.get('auto') === '1') join(codeIn.value, nameIn.value || params.get('name') || '糯米团');

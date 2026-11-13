/**
 * 主机页（接电视的那台电脑）：开房、显示房间码和二维码、选关、大厅里看每个人的样子、收手柄的输入跑物理、
 * Pixi 画画面（A3）、音效、左上角延迟表、每 250 ms 给每个手柄发一个小包、结算页（摔死排行、背叛榜）。
 * 主机是唯一跑物理的地方（铁律 1）。玩家看到的字中英都有（右上角切换）。
 *
 * 手机局（没有电视、没有电脑）：在手机上打开就是手机局（`?phone=1` 强开，`?phone=0` 强关）。
 * 这部手机照样开房、跑物理、画画面，房主自己用屏幕上的摇杆和抓键玩（0 号颜色，最多再进 3 部手机），
 * 每 50 ms（绕路 100 ms）给每部手机发一张画面快照，大家都在自己手机上看（src/net/snap.ts）。
 */
import qrcode from 'qrcode-generator';
import { heardBy, sfx } from '../audio/sfx';
import { applyStatic, langButton, onLang, tr } from '../i18n';
import { LEVELS, levelTitle, teachLabel } from '../levels';
import { cleanLook, DEFAULT_LOOK, randomLook, type Look } from '../look';
import { CFG, PLAYER_COLORS } from '../physics/config';
import type { Level } from '../physics/level';
import { createSim, type PadInput, type Sim, type SimEvent } from '../physics/world';
import { rttLevel } from '../net/latency';
import { HostLink, openRoom, type PadPeer } from '../net/host-link';
import { CAST_MS, MAX_SEATS, SNAP_MS, SNAP_RELAY_MS, STATUS_MS, type Cast, type FatalKey, type Phase, type RoomView } from '../net/protocol';
import { encodeSnap, EventWindow } from '../net/snap';
import { bindControls } from '../pad/controls';
import { drawLook } from '../pad/look-preview';
import { PLATES } from '../render/plates';
import { Stage } from '../render/stage';
import { renderResults, resultsOf, type ResultsDom } from '../results';

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};

applyStatic();
const params = new URLSearchParams(location.search);
/** 手机局：手机上打开（触屏、短边不到 600）就是；`?phone=1` / `?phone=0` 强开强关。 */
const phoneMode =
  params.get('phone') === '1' || (params.get('phone') !== '0' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600);
document.body.classList.toggle('phone', phoneMode);
document.body.dataset.phase = 'lobby';
const canvas = $<HTMLCanvasElement>('stage');
const stage = await Stage.create(canvas, { plates: PLATES, compact: phoneMode });
let levelIndex = Math.max(0, LEVELS.findIndex((l) => l.id === params.get('level')));
let level: Level = LEVELS[levelIndex] as Level;
/** 画面上现在画的是哪一版关卡（按人数摆出来的那个对象）。 */
let stageLevel: Level | null = null;
let sim: Sim = await createSim(level, 0);
syncStageLevel();
let link: HostLink | null = null;
let phase: Phase = 'lobby';
let room: RoomView | null = null;
/** 座位顺序 → 玩家下标；这台设备上自己玩的那个人（键盘的，或手机局的房主）永远排最后。 */
let seatOrder: string[] = [];
let keyboard = false;
let forceRelay = params.get('relay') === '1';
/** `?render=0`：不画画面只跑物理（联机检查用，CI 的机器没有显卡，画画面会把主机页拖慢）。 */
const renderOn = params.get('render') !== '0';
const KB_COLOR = 3;
const kbLook: Look = randomLook();
/** 手机局的房主：0 号颜色；名字和样子用这部手机当手柄时记下的（没有就叫「房主」、随机一个样子）。 */
const HOST_COLOR = 0;
let hostLook: Look = stored('hang-on:look', (v) => cleanLook(JSON.parse(v))) ?? randomLook();
const hostName = (): string => stored('hang-on:name', (v) => v.trim().slice(0, 12)) || tr('房主', 'Host');
/** 手机局：样子名单要不要马上补发（有人进出、换样子、换阶段）。 */
let castDirty = true;
let lastFatal: FatalKey | null = null;

function stored<T>(key: string, read: (v: string) => T): T | null {
  try {
    const v = localStorage.getItem(key);
    return v === null ? null : read(v);
  } catch {
    return null;
  }
}

/** 这台设备上有没有自己玩的人、他的颜色、名字、样子。 */
const localOn = (): boolean => phoneMode || keyboard;
const localColor = (): number => (phoneMode ? HOST_COLOR : KB_COLOR);
const localName = (): string => (phoneMode ? hostName() : tr('键盘', 'Keyboard'));
const localLook = (): Look => (phoneMode ? hostLook : kbLook);
/** 自己那个人是第几个（没有是 -1）。 */
const localIndex = (): number => (localOn() ? seatOrder.length : -1);

sfx.attach(document);
sfx.panOf = (x, y) => Math.max(-1, Math.min(1, (stage.toScreen({ x, y }).x / innerWidth) * 2 - 1)) * 0.6;
langButton($<HTMLButtonElement>('langBtn'));

// ---------- 房间 ----------
async function start(): Promise<void> {
  $('fatal').hidden = true;
  document.body.dataset.phase = phase;
  link?.close();
  const code = await openRoom(location.origin, { hostPlays: phoneMode });
  $('code').textContent = code;
  $('codeBig').textContent = code;
  $('codeSide').textContent = code;
  const joinUrl = `${location.origin}/hang-on/r/${code}`;
  $('joinUrl').textContent = joinUrl.replace(/^https?:\/\//, '');
  $('padUrl').textContent = `${location.host}/hang-on/pad`;
  const qr = qrcode(0, 'M');
  qr.addData(joinUrl);
  qr.make();
  $('qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  link = new HostLink(code, {
    onRoom: (r) => {
      room = r;
      if (r.phase !== phase) onPhase(r.phase);
      syncPlayers();
      renderLobby();
      renderLatency();
    },
    onPeers: () => {
      // 手机局：有人（重新）连上或换了路，马上补一份样子名单，别等下一个 2 秒
      castDirty = true;
      renderLobby();
      renderLatency();
    },
    onLook: () => {
      syncPlayers();
      renderLobby();
    },
    onFatal: (key) => fatal(key),
    onSocket: (open) => {
      socketDown = !open;
      renderNote();
      renderLobby();
    },
  });
  link.forceRelay = forceRelay;
  $('lobby').hidden = false;
  renderLobby();
}

let socketDown = false;
function renderNote(): void {
  // 手机局屏幕小：底下那条只在断线时出来
  $('note').classList.toggle('quiet', phoneMode && !socketDown);
  $('note').innerHTML = socketDown
    ? tr('和房间的连接断了，正在重连……', 'Lost the room connection. Reconnecting…')
    : phoneMode
      ? ''
      : tr(
          '主机页只在一台电脑上开，接电视。<kbd>键盘加入</kbd> 后 <kbd>W A S D</kbd> 指方向、<kbd>Q</kbd> <kbd>E</kbd> 抓、<kbd>R</kbd> 召唤，自己一个人也能试。',
          'Open this page on one computer only, the one on the TV. After <kbd>Keyboard join</kbd>, <kbd>W A S D</kbd> aims, <kbd>Q</kbd> <kbd>E</kbd> grab, <kbd>R</kbd> summons. You can try it alone.',
        );
}

function fatalLine(key: FatalKey): string {
  switch (key) {
    case 'noRoom':
      return tr('房间不存在。', 'That room does not exist.');
    case 'full':
      return tr('房间满了。', 'The room is full.');
    case 'ended':
      return tr('房间已经结束。', 'The room has ended.');
    case 'kicked':
      return tr('被请出去了。', 'Removed from the room.');
    case 'hostTaken':
      return tr('已经有一台主机在这个房间里。', 'Another computer is already hosting this room.');
    default:
      return tr('请求不对。', 'Bad request.');
  }
}

function fatal(key: FatalKey): void {
  lastFatal = key;
  $('fatalLine').textContent = fatalLine(key);
  $('fatal').hidden = false;
  $('lobby').hidden = true;
  $('countdown').hidden = true;
  $('results').hidden = true;
  $('touch').hidden = true;
  document.body.dataset.phase = 'ended';
}
$('reopenBtn').addEventListener('click', () => void start());

// ---------- 阶段 ----------
function onPhase(next: Phase): void {
  const prev = phase;
  phase = next;
  $('lobby').hidden = next !== 'lobby';
  $('countdown').hidden = next !== 'countdown';
  $('results').hidden = next !== 'results';
  $('lobbyBtn').hidden = next === 'lobby';
  // 顶栏压在遮罩上面；大厅卡片里已经有大房间码，用时和摔死只在玩的时候有意思
  $('codeChip').hidden = next === 'lobby';
  $('clockChip').hidden = $('deathChip').hidden = next !== 'countdown' && next !== 'playing';
  // 底下那条说明只在大厅里有用，玩的时候别挡着画面
  $('note').hidden = next !== 'lobby';
  // 手机局：倒数和玩的时候房主的摇杆、抓键压在画面上；页面的样式（横过来的提示）按阶段走
  $('touch').hidden = !phoneMode || (next !== 'countdown' && next !== 'playing');
  document.body.dataset.phase = next;
  castDirty = true;
  if (next === 'lobby') void resetSim();
  // 从结算页直接开下一关（或再来一次）：大厅那步的重置没走，在这里换上新的一局
  // 结算页的「再来一次」「下一关」从头开；从大厅开局时人数和摆关卡时不一样也重摆
  if (next === 'countdown' && (prev === 'results' || sim.layoutFor !== playerCount())) void resetSim();
  if (next === 'countdown') countdown();
  if (next === 'results') showResults();
}

let countTimer: ReturnType<typeof setInterval> | null = null;
function countdown(): void {
  let n = 3;
  $('countNum').textContent = String(n);
  $('countLevel').textContent = levelTitle(level, levelIndex);
  sfx.countdown(n);
  if (countTimer) clearInterval(countTimer);
  countTimer = setInterval(() => {
    n--;
    sfx.countdown(n);
    if (n <= 0) {
      if (countTimer) clearInterval(countTimer);
      countTimer = null;
      link?.act({ type: 'PLAY' });
      return;
    }
    $('countNum').textContent = String(n);
  }, 1000);
}

function name(i: number): string {
  return playerNames()[i] || `P${i + 1}`;
}

const resultsDom: ResultsDom = {
  time: $('winTime'),
  par: $('winPar'),
  deaths: $('deathList'),
  betrayTitle: $('betrayTitle'),
  betrayList: $('betrayList'),
  betrayNone: $('betrayNone'),
};
function showResults(): void {
  renderResults(resultsDom, resultsOf(sim), name, (i) => sim.players[i]?.color ?? '#fff', level.par?.seconds);
  $<HTMLButtonElement>('nextBtn').hidden = levelIndex >= LEVELS.length - 1;
}

$('startBtn').addEventListener('click', () => {
  // 手机局：这一下点击正好用来全屏、横过来、不让屏幕睡着（浏览器只在点击里给）
  if (phoneMode) void phoneScreen();
  link?.act({ type: 'START' });
});
// 结算页：再来一次、下一关都直接倒数开局；要换人、换关走顶栏的「回大厅」
$('againBtn').addEventListener('click', () => link?.act({ type: 'START' }));
$('nextBtn').addEventListener('click', () => {
  pickLevel(levelIndex + 1);
  link?.act({ type: 'START' });
});
$('lobbyBtn').addEventListener('click', () => link?.act({ type: 'LOBBY' }));
$('kbBtn').addEventListener('click', () => {
  keyboard = !keyboard;
  renderButtons();
  syncPlayers();
  renderLobby();
});
$('relayBtn').addEventListener('click', () => {
  forceRelay = !forceRelay;
  if (link) link.forceRelay = forceRelay;
  renderButtons();
});
$('muteBtn').addEventListener('click', () => {
  sfx.muted = !sfx.muted;
  renderButtons();
});
// 触屏设备上可以在两种局之间换（猜错了的时候，比如平板）：换了就重新开房
const modeBtn = $<HTMLButtonElement>('modeBtn');
modeBtn.hidden = !matchMedia('(pointer: coarse)').matches;
modeBtn.addEventListener('click', () => {
  const q = new URLSearchParams(location.search);
  q.set('phone', phoneMode ? '0' : '1');
  location.search = q.toString();
});
function renderButtons(): void {
  modeBtn.textContent = phoneMode ? tr('改成电视局', 'Use a TV instead') : tr('改成手机局', 'Phones only');
  modeBtn.title = phoneMode
    ? tr('这台设备接电视当大屏，大家的手机当手柄', 'This device goes on the TV as the big screen; phones are controllers')
    : tr('没有电视：这部手机开房、自己也玩，大家都在自己手机上看', 'No TV: this phone hosts and plays, and everyone watches on their own phone');
  $('kbBtn').textContent = keyboard ? tr('− 键盘退出', '− Keyboard leave') : tr('+ 键盘加入', '+ Keyboard join');
  $('relayBtn').textContent = forceRelay ? tr('绕路模式：开', 'Relay mode: on') : tr('绕路模式：关', 'Relay mode: off');
  // 手机上顶栏挤：只留图标
  $('muteBtn').textContent = phoneMode ? (sfx.muted ? '🔇' : '🔊') : sfx.muted ? tr('🔇 静音', '🔇 Muted') : tr('🔊 声音', '🔊 Sound');
  $('muteBtn').setAttribute('aria-label', tr('声音', 'Sound'));
  $('muteBtn').setAttribute('aria-pressed', String(sfx.muted));
}

// ---------- 关卡 ----------
function pickLevel(i: number): void {
  levelIndex = Math.max(0, Math.min(LEVELS.length - 1, i));
  level = LEVELS[levelIndex] as Level;
  renderLevel();
  if (phase === 'lobby') void resetSim();
}
function renderLevel(): void {
  $('levelName').textContent = levelTitle(level, levelIndex);
  $('levelTeach').textContent = teachLabel(level);
  $<HTMLButtonElement>('levelPrev').disabled = levelIndex === 0;
  $<HTMLButtonElement>('levelNext').disabled = levelIndex >= LEVELS.length - 1;
}
$('levelPrev').addEventListener('click', () => {
  sfx.tick();
  pickLevel(levelIndex - 1);
});
$('levelNext').addEventListener('click', () => {
  sfx.tick();
  pickLevel(levelIndex + 1);
});
/** 画面跟着物理那一版关卡走（按人数摆的；没有人数范围的关每次都是同一个对象，不重画）。 */
function syncStageLevel(): void {
  if (stageLevel === sim.level) return;
  stageLevel = sim.level;
  stage.setLevel(sim.level);
}

// ---------- 玩家 ----------
function playerCount(): number {
  return seatOrder.length + (localOn() ? 1 : 0);
}
function playerNames(): string[] {
  const names = seatOrder.map((id) => link?.peers.get(id)?.name ?? '');
  if (localOn()) names.push(localName());
  return names;
}
function playerLook(i: number): Look {
  if (i === localIndex()) return localLook();
  const id = seatOrder[i];
  return (id && link?.peers.get(id)?.look) || DEFAULT_LOOK;
}
/** 大厅里座位变了就重排玩家；玩的时候只跟着座位的来去增减，颜色跟座位走。 */
function syncPlayers(): void {
  const seats = room?.seats.map((s) => s.id) ?? [];
  const changed = seats.length !== seatOrder.length || seats.some((id, i) => seatOrder[i] !== id);
  if (changed) seatOrder = seats;
  const n = playerCount();
  // 大厅里人数变了：关卡按新人数重摆（有人数范围的关缝会变宽），玩的时候中途进来的不重摆
  if (phase === 'lobby' && sim.layoutFor !== n && !resetting) {
    void resetSim();
    return;
  }
  if (sim.players.length !== n) sim.setPlayers(n);
  stage.syncPlayers(sim);
  seatOrder.forEach((id, i) => {
    const p = sim.players[i];
    const peer = link?.peers.get(id);
    if (!p || !peer) return;
    p.color = PLAYER_COLORS[peer.color] ?? p.color;
    const look = peer.look ?? DEFAULT_LOOK;
    stage.setPlayerStyle(i, { name: peer.name, color: p.color, look });
    sfx.setVoice(i, look.voice);
  });
  if (localOn()) {
    const i = sim.players.length - 1;
    const p = sim.players[i];
    if (p) {
      p.color = PLAYER_COLORS[localColor()] ?? p.color;
      stage.setPlayerStyle(i, { name: localName(), color: p.color, look: localLook() });
      sfx.setVoice(i, localLook().voice);
    }
  }
  castDirty = true;
}
let resetting = false;
/** 重开这一关：按现在的人数摆关卡、放人。 */
async function resetSim(): Promise<void> {
  resetting = true;
  const old = sim;
  try {
    sim = await createSim(level, playerCount());
  } finally {
    resetting = false;
  }
  old.destroy();
  syncStageLevel();
  stage.reset();
  syncPlayers();
}

// ---------- 横幅 ----------
let bannerTimer: ReturnType<typeof setTimeout> | null = null;
function banner(text: string, kind: 'bad' | 'good' = 'good'): void {
  const el = $('banner');
  el.textContent = text;
  el.className = `banner on ${kind}`;
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => {
    el.className = 'banner';
  }, 2200);
}

// ---------- 大厅和延迟表 ----------
/** 一张座位卡：这个人的糯米团（帽子眼镜都在）、名字、连接状态。 */
function seatCard(nm: string, color: string, look: Look, sub: string, off: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = `seat${off ? ' off' : ''}`;
  const c = document.createElement('canvas');
  c.width = 144;
  c.height = 144;
  c.setAttribute('aria-hidden', 'true');
  drawLook(c, look, color);
  const n = document.createElement('span');
  n.className = 'nm';
  n.textContent = nm;
  const s = document.createElement('span');
  s.className = 'sub';
  s.textContent = sub;
  el.append(c, n, s);
  return el;
}

function renderLobby(): void {
  const box = $('seats');
  box.innerHTML = '';
  const seats = room?.seats ?? [];
  for (const s of seats) {
    const peer = link?.peers.get(s.id);
    const sub = !s.connected ? tr('掉线', 'Offline') : peer?.direct ? tr('直连', 'Direct') : peer?.relayed ? tr('绕路', 'Relayed') : tr('连接中', 'Connecting');
    box.append(seatCard(s.name, PLAYER_COLORS[s.color] ?? '#fff', peer?.look ?? DEFAULT_LOOK, sub, !s.connected));
  }
  if (localOn()) {
    const card = seatCard(localName(), PLAYER_COLORS[localColor()] ?? '#fff', localLook(), phoneMode ? tr('这部手机 · 点一下换样子', 'This phone · tap for a new look') : tr('这台电脑', 'This computer'), false);
    // 手机局：点自己那张卡换个样子（随机），这部手机以后当手柄也用这个
    if (phoneMode) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seat me';
      b.setAttribute('aria-label', tr('换个样子', 'New look'));
      b.append(...card.childNodes);
      b.addEventListener('click', () => {
        hostLook = randomLook();
        try {
          localStorage.setItem('hang-on:look', JSON.stringify(hostLook));
        } catch {
          // 记不住就记不住
        }
        sfx.tick();
        syncPlayers();
        renderLobby();
      });
      box.append(b);
    } else box.append(card);
  }
  for (let i = seats.length + (localOn() ? 1 : 0); i < MAX_SEATS; i++) {
    const el = document.createElement('div');
    el.className = 'seat empty';
    const ph = document.createElement('span');
    ph.className = 'ph';
    ph.textContent = '+';
    ph.setAttribute('aria-hidden', 'true');
    const n = document.createElement('span');
    n.className = 'nm';
    n.textContent = tr('空位', 'Open seat');
    const sub = document.createElement('span');
    sub.className = 'sub';
    sub.textContent = tr('扫码加入', 'Scan to join');
    el.append(ph, n, sub);
    box.append(el);
  }
  const n = playerCount();
  $('lobbyLine').textContent = n ? tr(`${n} 个人，到齐了就开始。`, `${n} ${n === 1 ? 'player' : 'players'}. Start when everyone is in.`) : tr('等人进来……', 'Waiting for players…');
  $<HTMLButtonElement>('startBtn').disabled = n === 0 || !link?.socketOpen;
}

function renderLatency(): void {
  const box = $('lat');
  for (const row of [...box.querySelectorAll('.row')]) row.remove();
  for (const p of link?.peers.values() ?? []) {
    const row = document.createElement('div');
    row.className = 'row';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = PLAYER_COLORS[p.color] ?? '#fff';
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = p.name;
    const ms = document.createElement('span');
    const rtt = p.rtt.median();
    ms.className = `ms ${rtt === null ? '' : rttLevel(rtt)}`;
    ms.textContent = rtt === null ? '—' : `${rtt.toFixed(0)} ms`;
    const tag = document.createElement('span');
    if (!p.connected) {
      tag.className = 'tag off';
      tag.textContent = tr('掉线', 'Offline');
    } else if (p.direct) {
      tag.className = 'tag';
      tag.textContent = tr('直连', 'Direct');
    } else if (p.relayed) {
      tag.className = 'tag relay';
      tag.textContent = tr('绕路中', 'Relayed');
    } else {
      tag.className = 'tag';
      tag.textContent = tr('连接中', 'Connecting');
    }
    row.append(dot, nm, ms, tag);
    box.append(row);
  }
  // 没人连进来时只剩一行标题，大厅里看着像落下的字
  (box.querySelector('.title') as HTMLElement).hidden = !box.querySelector('.row');
}
setInterval(renderLatency, 500);

// ---------- 语言 ----------
function renderAll(): void {
  renderButtons();
  renderNote();
  renderLevel();
  renderLobby();
  renderLatency();
  if (lastFatal) $('fatalLine').textContent = fatalLine(lastFatal);
  if (phase === 'results') showResults();
  if (phase === 'countdown') $('countLevel').textContent = levelTitle(level, levelIndex);
  syncPlayers();
}
onLang(renderAll);
renderButtons();
renderNote();
renderLevel();

// ---------- 键盘（一个人试手感用）----------
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function keyboardInput(): PadInput {
  let ax = 0;
  let ay = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ax -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ax += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) ay -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) ay += 1;
  const input: PadInput = { ax, ay, gl: keys.has('KeyQ') || keys.has('ShiftLeft'), gr: keys.has('KeyE') || keys.has('ShiftRight') };
  if (keys.has('KeyR')) input.act = 'summon';
  return input;
}

// ---------- 手机局：房主的触屏手柄、全屏、不睡 ----------
const touch = bindControls($('touch'));
let summonTap = false;
const touchSummon = $<HTMLButtonElement>('touchSummon');
touchSummon.addEventListener('click', () => {
  summonTap = true;
});
function touchInput(): PadInput {
  const input: PadInput = { ax: touch.aim.x, ay: touch.aim.y, gl: touch.grab.l, gr: touch.grab.r };
  // 键盘也能玩（调试、接了键盘的平板）
  const kb = keyboardInput();
  if (!input.ax && !input.ay) {
    input.ax = kb.ax;
    input.ay = kb.ay;
  }
  input.gl ||= kb.gl;
  input.gr ||= kb.gr;
  if (summonTap || kb.act) input.act = 'summon';
  summonTap = false;
  return input;
}
function localInput(): PadInput {
  return phoneMode ? touchInput() : keyboardInput();
}

async function phoneScreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    const so = screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void> };
    await so.lock?.('landscape');
  } catch {
    // iPhone 的 Safari 不给全屏，锁不了方向就提示横过来
  }
  void keepAwake();
}
let wakeAsked = false;
async function keepAwake(): Promise<void> {
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<unknown> } }).wakeLock;
  try {
    await wl?.request('screen');
  } catch {
    // 不给就算了
  }
  if (wakeAsked) return;
  wakeAsked = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void wl?.request('screen').catch(() => undefined);
  });
}

// ---------- 主循环 ----------
const DT = CFG.step;
let last = performance.now();
let acc = 0;
let statusAt = 0;
addEventListener('resize', () => stage.resize());

function feedInputs(): void {
  seatOrder.forEach((id, i) => {
    const peer = link?.peers.get(id);
    const input = peer?.input;
    if (!peer || !input) return;
    // 手柄掉线或半秒没消息：方向归零但手不松，角色原地挂着不死
    const stale = !peer.connected || performance.now() - peer.lastInputAt > 500;
    sim.setInput(i, stale ? { ax: 0, ay: 0, gl: input.gl, gr: input.gr } : input);
  });
  if (localOn()) sim.setInput(sim.players.length - 1, localInput());
}

function sendStatus(): void {
  const dead = sim.players.filter((p) => p.dead).length;
  if (phoneMode) {
    // 房主的「召唤」键：有队友摔下去还没回来才亮
    const me = sim.players[localIndex()];
    touchSummon.disabled = !(phase === 'playing' && dead - (me?.dead ? 1 : 0) > 0);
  }
  if (!link) return;
  seatOrder.forEach((id, i) => {
    const p = sim.players[i];
    const peer = link!.peers.get(id);
    if (!p || !peer || !peer.connected) return;
    link!.status(id, {
      color: peer.color,
      hands: [!!p.arms[0].grip, !!p.arms[1].grip],
      deaths: p.deaths,
      rttMs: peer.rtt.median(),
      phase,
      direct: peer.direct,
      teamDead: dead - (p.dead ? 1 : 0),
    });
  });
}

function onEvents(): void {
  for (const ev of sim.events) {
    if (ev.type === 'win') {
      // 先让电视上撒一会儿纸屑、大家一起跳，再出结算页
      banner(tr('到顶了！', 'Made it!'));
      const won = sim;
      setTimeout(() => {
        if (sim === won && phase === 'playing') link?.act({ type: 'FINISH' });
      }, 2600);
    }
    if (ev.type === 'betrayal') banner(tr(`${name(ev.by)} 松手了`, `${name(ev.by)} let go!`), 'bad');
    if (ev.type === 'summon') {
      const who = ev.who.map(name);
      banner(tr(`${name(ev.player)} 把 ${who.join('、')} 拉了回来`, `${name(ev.player)} pulled ${who.join(' & ')} back`));
    }
    if (ev.type === 'checkpoint') banner(tr('检查点 ✓', 'Checkpoint ✓'));
  }
}

// ---------- 手机局：给每部手机发画面快照和样子名单 ----------
let snapSeq = 1;
const snapAt = new Map<string, number>();
const recent = new EventWindow();
let castAt = 0;

function castFor(seat: string): Cast {
  const names = playerNames();
  return {
    me: seatOrder.indexOf(seat),
    players: sim.players.map((p, i) => ({ name: names[i] || `P${i + 1}`, color: p.color, look: playerLook(i) })),
    ...(phase === 'results' ? { results: resultsOf(sim) } : {}),
  };
}

function broadcast(now: number): void {
  if (!phoneMode || !link) return;
  const castNow = castDirty || now - castAt >= CAST_MS;
  if (castNow) {
    castDirty = false;
    castAt = now;
  }
  const ev = recent.take();
  let sent = false;
  for (const p of link.peers.values()) {
    if (!p.connected) continue;
    if (castNow) link.cast(p.seat, castFor(p.seat));
    // 直连每 50 ms 一张；绕路走房间，100 ms 一张
    if (now - (snapAt.get(p.seat) ?? 0) < (p.direct ? SNAP_MS : SNAP_RELAY_MS)) continue;
    snapAt.set(p.seat, now);
    link.snap(p.seat, encodeSnap(sim, snapSeq++, ev));
    sent = true;
  }
  if (sent) recent.sent();
}

/** 这台设备放哪些声音：电视局全放；手机局只放房主自己那个人的和大家共有的。 */
function heard(events: readonly SimEvent[]): readonly SimEvent[] {
  if (!phoneMode) return events;
  const me = localIndex();
  return events.filter((e) => heardBy(e, me));
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  feedInputs();
  if (phase === 'playing') {
    acc += dt * stage.timeScale;
    while (acc >= DT) {
      sim.step(DT);
      stage.handleEvents(sim, sim.events);
      sfx.handleEvents(sim, heard(sim.events));
      if (phoneMode) recent.push(sim.events);
      onEvents();
      acc -= DT;
    }
  } else {
    acc = 0;
  }
  broadcast(now);
  if (renderOn) {
    stage.updateCamera(sim, dt);
    stage.draw(sim, dt);
  }
  $('clock').textContent = sim.time.toFixed(1);
  $('deaths').textContent = String(sim.players.reduce((s, p) => s + p.deaths, 0));
  if (now - statusAt >= STATUS_MS) {
    statusAt = now;
    sendStatus();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试口：控制台和联机检查脚本用
(window as unknown as { hangOn: unknown }).hangOn = {
  get sim() {
    return sim;
  },
  get link() {
    return link;
  },
  get phase() {
    return phase;
  },
  get seatOrder() {
    return seatOrder;
  },
  get level() {
    return level;
  },
  peers: (): PadPeer[] => [...(link?.peers.values() ?? [])],
  pickLevel,
  stage,
  sfx,
  CFG,
  LEVELS,
  phoneMode,
  /** 手机局房主的触屏输入（检查脚本直接改它，像在屏幕上按）。 */
  touch,
  /** 手机局：最近的事件（跟着快照发出去的那一段）。 */
  recent,
  get localIndex() {
    return localIndex();
  },
};

void start();

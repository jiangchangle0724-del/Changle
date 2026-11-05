/**
 * 主机页（接电视的那台电脑）：开房、显示房间码和二维码、选关、大厅里看每个人的样子、收手柄的输入跑物理、
 * Pixi 画画面（A3）、音效、左上角延迟表、每 250 ms 给每个手柄发一个小包、结算页（摔死排行、背叛榜）。
 * 主机是唯一跑物理的地方（铁律 1）。玩家看到的字中英都有（右上角切换）。
 */
import qrcode from 'qrcode-generator';
import { sfx } from '../audio/sfx';
import { applyStatic, langButton, onLang, tr } from '../i18n';
import { LEVELS, levelTitle, teachLabel } from '../levels';
import { DEFAULT_LOOK, randomLook, type Look } from '../look';
import { CFG, PLAYER_COLORS } from '../physics/config';
import type { Level } from '../physics/level';
import { createSim, type PadInput, type Sim } from '../physics/world';
import { rttLevel } from '../net/latency';
import { HostLink, openRoom, type PadPeer } from '../net/host-link';
import { MAX_SEATS, STATUS_MS, type FatalKey, type Phase, type RoomView } from '../net/protocol';
import { drawLook } from '../pad/look-preview';
import { Stage } from '../render/stage';

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};

applyStatic();
const canvas = $<HTMLCanvasElement>('stage');
const stage = await Stage.create(canvas);
const params = new URLSearchParams(location.search);
let levelIndex = Math.max(0, LEVELS.findIndex((l) => l.id === params.get('level')));
let level: Level = LEVELS[levelIndex] as Level;
let stageLevel = '';
let sim: Sim = await createSim(level, 0);
syncStageLevel();
let link: HostLink | null = null;
let phase: Phase = 'lobby';
let room: RoomView | null = null;
/** 座位顺序 → 玩家下标；键盘的人永远排最后。 */
let seatOrder: string[] = [];
let keyboard = false;
let forceRelay = params.get('relay') === '1';
/** `?render=0`：不画画面只跑物理（联机检查用，CI 的机器没有显卡，画画面会把主机页拖慢）。 */
const renderOn = params.get('render') !== '0';
const KB_COLOR = 3;
const kbLook: Look = randomLook();
let lastFatal: FatalKey | null = null;

sfx.attach(document);
sfx.panOf = (x, y) => Math.max(-1, Math.min(1, (stage.toScreen({ x, y }).x / innerWidth) * 2 - 1)) * 0.6;
langButton($<HTMLButtonElement>('langBtn'));

// ---------- 房间 ----------
async function start(): Promise<void> {
  $('fatal').hidden = true;
  link?.close();
  const code = await openRoom();
  $('code').textContent = code;
  $('codeBig').textContent = code;
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
  $('note').innerHTML = socketDown
    ? tr('和房间的连接断了，正在重连……', 'Lost the room connection. Reconnecting…')
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
}
$('reopenBtn').addEventListener('click', () => void start());

// ---------- 阶段 ----------
function onPhase(next: Phase): void {
  phase = next;
  $('lobby').hidden = next !== 'lobby';
  $('countdown').hidden = next !== 'countdown';
  $('results').hidden = next !== 'results';
  $('lobbyBtn').hidden = next === 'lobby';
  // 底下那条说明只在大厅里有用，玩的时候别挡着画面
  $('note').hidden = next !== 'lobby';
  if (next === 'lobby') void resetSim();
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

function showResults(): void {
  $('winTime').textContent = `${sim.time.toFixed(1)} s`;
  const par = level.par?.seconds;
  $('winPar').textContent = par ? (sim.time <= par ? tr(`比标准的 ${par} 秒快`, `Faster than par (${par} s)`) : tr(`标准 ${par} 秒`, `Par ${par} s`)) : '';
  // 摔死排行：摔得最多的是今晚的汤圆
  const rank = sim.players.map((p, i) => ({ i, deaths: p.deaths, grabs: p.grabs })).sort((a, b) => b.deaths - a.deaths);
  const list = $('deathList');
  list.innerHTML = '';
  rank.forEach((r, k) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = sim.players[r.i]?.color ?? '#fff';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = name(r.i);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = tr(`摔了 ${r.deaths} 次 · 抓了 ${r.grabs} 下`, `${r.deaths} falls · ${r.grabs} grabs`);
    li.append(dot, who, n);
    if (k === 0 && r.deaths > 0 && sim.players.length > 1) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = tr('今晚的汤圆', "Tonight's dumpling");
      li.append(tag);
    }
    list.append(li);
  });
  // 背叛榜
  const counts = new Map<string, number>();
  for (const b of sim.betrayals) counts.set(`${b.by}>${b.victim}`, (counts.get(`${b.by}>${b.victim}`) ?? 0) + 1);
  const bl = $('betrayList');
  bl.innerHTML = '';
  const rows = [...counts].sort((a, b) => b[1] - a[1]);
  $('betrayTitle').hidden = rows.length === 0;
  for (const [key, n] of rows) {
    const [by, victim] = key.split('>').map(Number) as [number, number];
    const li = document.createElement('li');
    li.textContent = tr(`${name(by)} 松开过 ${name(victim)} ${n} 次`, `${name(by)} let go of ${name(victim)} ${n === 1 ? 'once' : `${n} times`}`);
    bl.append(li);
  }
  $('betrayNone').hidden = rows.length > 0;
  $<HTMLButtonElement>('nextBtn').hidden = levelIndex >= LEVELS.length - 1;
}

$('startBtn').addEventListener('click', () => link?.act({ type: 'START' }));
$('againBtn').addEventListener('click', () => link?.act({ type: 'LOBBY' }));
$('nextBtn').addEventListener('click', () => {
  pickLevel(levelIndex + 1);
  link?.act({ type: 'LOBBY' });
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
function renderButtons(): void {
  $('kbBtn').textContent = keyboard ? tr('− 键盘退出', '− Keyboard leave') : tr('+ 键盘加入', '+ Keyboard join');
  $('relayBtn').textContent = forceRelay ? tr('绕路模式：开', 'Relay mode: on') : tr('绕路模式：关', 'Relay mode: off');
  $('muteBtn').textContent = sfx.muted ? tr('🔇 静音', '🔇 Muted') : tr('🔊 声音', '🔊 Sound');
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
function syncStageLevel(): void {
  if (stageLevel === level.id) return;
  stageLevel = level.id;
  stage.setLevel(level);
}

// ---------- 玩家 ----------
function playerCount(): number {
  return seatOrder.length + (keyboard ? 1 : 0);
}
function playerNames(): string[] {
  const names = seatOrder.map((id) => link?.peers.get(id)?.name ?? '');
  if (keyboard) names.push(tr('键盘', 'Keyboard'));
  return names;
}
/** 大厅里座位变了就重排玩家；玩的时候只跟着座位的来去增减，颜色跟座位走。 */
function syncPlayers(): void {
  const seats = room?.seats.map((s) => s.id) ?? [];
  const changed = seats.length !== seatOrder.length || seats.some((id, i) => seatOrder[i] !== id);
  if (changed) seatOrder = seats;
  const n = playerCount();
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
  if (keyboard) {
    const i = sim.players.length - 1;
    const p = sim.players[i];
    if (p) {
      p.color = PLAYER_COLORS[KB_COLOR] ?? p.color;
      stage.setPlayerStyle(i, { name: tr('键盘', 'Keyboard'), color: p.color, look: kbLook });
      sfx.setVoice(i, kbLook.voice);
    }
  }
}
async function resetSim(): Promise<void> {
  const old = sim;
  sim = await createSim(level, 0);
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
  if (keyboard) box.append(seatCard(tr('键盘', 'Keyboard'), PLAYER_COLORS[KB_COLOR] ?? '#fff', kbLook, tr('这台电脑', 'This computer'), false));
  for (let i = seats.length + (keyboard ? 1 : 0); i < MAX_SEATS; i++) {
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
  if (keyboard) sim.setInput(sim.players.length - 1, keyboardInput());
}

function sendStatus(): void {
  if (!link) return;
  const dead = sim.players.filter((p) => p.dead).length;
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

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  feedInputs();
  if (phase === 'playing') {
    acc += dt * stage.timeScale;
    while (acc >= DT) {
      sim.step(DT);
      stage.handleEvents(sim, sim.events);
      sfx.handleEvents(sim, sim.events);
      onEvents();
      acc -= DT;
    }
  } else {
    acc = 0;
  }
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
};

void start();

/**
 * 主机页（接电视的那台电脑）：开房、显示房间码和二维码、收手柄的输入跑物理、画画面、
 * 左上角延迟表、每 250 ms 给每个手柄发一个小包。主机是唯一跑物理的地方（铁律 1）。
 */
import qrcode from 'qrcode-generator';
import { CFG, PLAYER_COLORS } from '../physics/config';
import { sampleLevel } from '../physics/level';
import { createSim, type PadInput, type Sim } from '../physics/world';
import { rttLevel } from '../net/latency';
import { HostLink, openRoom, type PadPeer } from '../net/host-link';
import { MAX_SEATS, STATUS_MS, type FatalKey, type Phase, type RoomView } from '../net/protocol';
import { Renderer } from '../render/canvas';

const $ = <T extends HTMLElement>(id: string): T => {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
};

const canvas = $<HTMLCanvasElement>('stage');
const renderer = new Renderer(canvas);
const level = sampleLevel();
let sim: Sim = await createSim(level, 0);
let link: HostLink | null = null;
let phase: Phase = 'lobby';
let room: RoomView | null = null;
/** 座位顺序 → 玩家下标；键盘的人永远排最后。 */
let seatOrder: string[] = [];
let keyboard = false;
let forceRelay = new URLSearchParams(location.search).get('relay') === '1';
const KB_COLOR = 3;

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
    onFatal: (key) => fatal(key),
    onSocket: (open) => {
      $('note').textContent = open ? NOTE : '和房间的连接断了，正在重连……';
      renderLobby();
    },
  });
  link.forceRelay = forceRelay;
  $('lobby').hidden = false;
  renderLobby();
}

const NOTE = $('note').textContent ?? '';

function fatal(key: FatalKey): void {
  const line: Record<FatalKey, string> = {
    noRoom: '房间不存在。',
    full: '房间满了。',
    ended: '房间已经结束。',
    badRequest: '请求不对。',
    kicked: '被请出去了。',
    hostTaken: '已经有一台主机在这个房间里。',
  };
  $('fatalLine').textContent = line[key];
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
  if (next === 'lobby') resetSim();
  if (next === 'countdown') countdown();
  if (next === 'results') showResults();
}

let countTimer: ReturnType<typeof setInterval> | null = null;
function countdown(): void {
  let n = 3;
  $('countNum').textContent = String(n);
  if (countTimer) clearInterval(countTimer);
  countTimer = setInterval(() => {
    n--;
    if (n <= 0) {
      if (countTimer) clearInterval(countTimer);
      countTimer = null;
      link?.act({ type: 'PLAY' });
      return;
    }
    $('countNum').textContent = String(n);
  }, 1000);
}

function showResults(): void {
  $('winTime').textContent = `${sim.time.toFixed(1)} s`;
  const names = playerNames();
  const parts = sim.players.map((p, i) => `${names[i] ?? `P${i + 1}`} 摔了 ${p.deaths} 次`);
  $('winLine').textContent = parts.join('，') + '。';
}

$('startBtn').addEventListener('click', () => link?.act({ type: 'START' }));
$('againBtn').addEventListener('click', () => link?.act({ type: 'LOBBY' }));
$('lobbyBtn').addEventListener('click', () => link?.act({ type: 'LOBBY' }));
$('kbBtn').addEventListener('click', () => {
  keyboard = !keyboard;
  $('kbBtn').textContent = keyboard ? '− 键盘退出' : '+ 键盘加入';
  syncPlayers();
  renderLobby();
});
$('relayBtn').addEventListener('click', () => {
  forceRelay = !forceRelay;
  if (link) link.forceRelay = forceRelay;
  $('relayBtn').textContent = `绕路模式：${forceRelay ? '开' : '关'}`;
});
$('relayBtn').textContent = `绕路模式：${forceRelay ? '开' : '关'}`;

// ---------- 玩家 ----------
function playerCount(): number {
  return seatOrder.length + (keyboard ? 1 : 0);
}
function playerNames(): string[] {
  const names = seatOrder.map((id) => link?.peers.get(id)?.name ?? '');
  if (keyboard) names.push('键盘');
  return names;
}
/** 大厅里座位变了就重排玩家；玩的时候只跟着座位的来去增减，颜色跟座位走。 */
function syncPlayers(): void {
  const seats = room?.seats.map((s) => s.id) ?? [];
  const changed = seats.length !== seatOrder.length || seats.some((id, i) => seatOrder[i] !== id);
  if (changed) seatOrder = seats;
  const n = playerCount();
  if (sim.players.length !== n) sim.setPlayers(n);
  seatOrder.forEach((id, i) => {
    const p = sim.players[i];
    const peer = link?.peers.get(id);
    if (p && peer) p.color = PLAYER_COLORS[peer.color] ?? p.color;
  });
  if (keyboard) {
    const p = sim.players[sim.players.length - 1];
    if (p) p.color = PLAYER_COLORS[KB_COLOR] ?? p.color;
  }
}
async function resetSim(): Promise<void> {
  const old = sim;
  sim = await createSim(level, 0);
  old.destroy();
  renderer.reset();
  syncPlayers();
}

// ---------- 大厅和延迟表 ----------
function renderLobby(): void {
  const box = $('seats');
  box.innerHTML = '';
  const seats = room?.seats ?? [];
  for (const s of seats) {
    const peer = link?.peers.get(s.id);
    const el = document.createElement('span');
    el.className = `seat${s.connected ? '' : ' off'}`;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = PLAYER_COLORS[s.color] ?? '#fff';
    el.append(dot, document.createTextNode(s.name + (peer && peer.connected && !peer.direct && peer.relayed ? '（绕路）' : '')));
    box.append(el);
  }
  if (keyboard) {
    const el = document.createElement('span');
    el.className = 'seat';
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = PLAYER_COLORS[KB_COLOR] ?? '#fff';
    el.append(dot, document.createTextNode('键盘'));
    box.append(el);
  }
  for (let i = seats.length; i < MAX_SEATS; i++) {
    const el = document.createElement('span');
    el.className = 'seat empty';
    el.textContent = '空位';
    box.append(el);
  }
  const n = playerCount();
  $('lobbyLine').textContent = n ? `${n} 个人，到齐了就开始。` : '等人进来……';
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
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    const ms = document.createElement('span');
    const rtt = p.rtt.median();
    ms.className = `ms ${rtt === null ? '' : rttLevel(rtt)}`;
    ms.textContent = rtt === null ? '—' : `${rtt.toFixed(0)} ms`;
    const tag = document.createElement('span');
    if (!p.connected) {
      tag.className = 'tag off';
      tag.textContent = '掉线';
    } else if (p.direct) {
      tag.className = 'tag';
      tag.textContent = '直连';
    } else if (p.relayed) {
      tag.className = 'tag relay';
      tag.textContent = '绕路中';
    } else {
      tag.className = 'tag';
      tag.textContent = '连接中';
    }
    row.append(dot, name, ms, tag);
    box.append(row);
  }
}
setInterval(renderLatency, 500);

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
  return { ax, ay, gl: keys.has('KeyQ') || keys.has('ShiftLeft'), gr: keys.has('KeyE') || keys.has('ShiftRight') };
}

// ---------- 主循环 ----------
const DT = CFG.step;
let last = performance.now();
let acc = 0;
let statusAt = 0;
addEventListener('resize', () => renderer.resize());
renderer.resize();

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
    });
  });
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  feedInputs();
  if (phase === 'playing') {
    acc += dt;
    while (acc >= DT) {
      sim.step(DT);
      renderer.handleEvents(sim, sim.events);
      for (const ev of sim.events) if (ev.type === 'win') link?.act({ type: 'FINISH' });
      acc -= DT;
    }
  } else {
    acc = 0;
  }
  renderer.updateCamera(sim, dt);
  renderer.draw(sim, dt);
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
  peers: (): PadPeer[] => [...(link?.peers.values() ?? [])],
  CFG,
};

void start();

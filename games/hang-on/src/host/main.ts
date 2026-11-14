/**
 * 主机页（接电视的那台电脑）：开房、显示房间码和二维码、选关、大厅里看每个人的样子、收手柄的输入跑物理、
 * Pixi 画画面（A3）、音效、左上角延迟表、每 250 ms 给每个手柄发一个小包、结算页（摔死排行、背叛榜）。
 * 主机是唯一跑物理的地方（铁律 1）。玩家看到的字中英都有（右上角切换）。
 *
 * 手机局（没有电视、没有电脑）：在手机上打开就是手机局（`?phone=1` 强开，`?phone=0` 强关）。
 * 这部手机照样开房、跑物理、画画面，房主自己用屏幕上的摇杆和抓键玩（0 号颜色，最多再进 5 部手机），
 * 每 50 ms（绕路 100 ms）给每部手机发一张画面快照，大家都在自己手机上看（src/net/snap.ts）。
 *
 * 玩法（A7）：大厅里开局前选闯关、大团队（有大关才出）、比谁先（各跑各的或甜队对咸队）、坐不住。
 */
import qrcode from 'qrcode-generator';
import { heardBy, sfx } from '../audio/sfx';
import { applyStatic, langButton, onLang, pickLang, tr } from '../i18n';
import { LEVELS, levelsFor, levelTitle, TEAM_LEVELS, teachLabel, teachText, tierOfLevel } from '../levels';
import { modeHintText, modeLabel, modeName, notReadyText, sideName, tierName } from '../mode-text';
import { cleanSide, cleanTier, maxPlayers, minPlayers, SIDE_MODES, sideFor, SIDES, tiered, TIERS, type Side, type Tier } from '../sides';
import { cleanLook, DEFAULT_LOOK, randomLook, type Look } from '../look';
import { cleanItem, ITEM_ICON, ITEM_IDS, itemsIn, type ItemId } from '../items';
import { itemName } from '../item-text';
import { CFG, PLAYER_COLORS } from '../physics/config';
import type { Level } from '../physics/level';
import { createSim, type GameMode, type PadInput, type Rules, type Sim, type SimEvent } from '../physics/world';
import { rttLevel } from '../net/latency';
import { HostLink, openRoom, type PadPeer } from '../net/host-link';
import { CAST_MS, MAX_SEATS, SNAP_MS, SNAP_RELAY_MS, STATUS_MS, type Cast, type FatalKey, type Menu, type PadCmd, type Phase, type RoomView } from '../net/protocol';
import { encodeSnap, EventWindow } from '../net/snap';
import { bindControls } from '../pad/controls';
import { drawLook } from '../pad/look-preview';
import { PLATES } from '../render/plates';
import { Stage } from '../render/stage';
import { renderResults, resultsOf, resultsTitle, teamName, type ResultsDom } from '../results';
import { goalsOf, goalTargets, starLine, type Goal } from '../goals';
import { goalText } from '../goal-text';
import { envelopeTotal, record, starsOf } from './progress';
import type { Results } from '../net/protocol';

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
/**
 * 触屏开的电视局：手机或平板接电视（投屏）当大屏，大家的手机当手柄。没有键盘，底下那条键盘说明、
 * 「键盘加入」「绕路模式」都不出；开局时和手机局一样全屏、横过来、不让屏幕睡着（睡了电视上就没了）。
 */
const touchHost = !phoneMode && matchMedia('(pointer: coarse)').matches;
/** 矮的屏幕（不到 600 高，比如横着的手机）：大厅、结算排紧一点，放不下能滚，开始键总找得到。 */
const fitShort = (): void => {
  document.body.classList.toggle('short', (globalThis.innerHeight ?? 1080) < 600);
};
fitShort();
addEventListener('resize', fitShort);
document.body.dataset.phase = 'lobby';
const canvas = $<HTMLCanvasElement>('stage');
const stage = await Stage.create(canvas, { plates: PLATES, compact: phoneMode });
/** 玩法（A7）：开局前在大厅里选；`?mode=race` 之类直接开到那个玩法（检查脚本用），`?teams=1` 比谁先分两队。 */
const MODES: GameMode[] = ['climb', 'team', 'race', 'last'];
let mode: GameMode = MODES.find((m) => m === params.get('mode') && (m !== 'team' || TEAM_LEVELS.length > 0)) ?? 'climb';
let teamsOn = params.get('teams') === '1';
/**
 * 单人还是多人、什么难度（11-13 Steve：「进去之后可选择单人模式和多人模式，然后选择简 中 难」）：
 * `?side=solo|multi`、`?tier=0|1|2` 直接开到那里，`?level=` 开到那关所在的难度；没人点过单人多人就跟着人数走。
 */
let side: Side = cleanSide(params.get('side')) ?? (mode === 'climb' ? 'solo' : 'multi');
let sideAuto = !params.get('side') && mode === 'climb';
const askedLevel = LEVELS.find((l) => l.id === params.get('level'));
let tier: Tier = cleanTier(Number(params.get('tier') ?? NaN)) ?? (askedLevel ? tierOfLevel(askedLevel) : 0);
/** 现在这个玩法、这档难度的那一串关。 */
const listNow = (): Level[] => levelsFor(mode, tiered(mode) ? tier : undefined);
/** 每种玩法、每档难度记着自己选到第几关，换回来还在那。 */
const levelIndexOf = new Map<string, number>();
const slot = (): string => `${mode}:${tiered(mode) ? tier : '-'}`;
let levelIndex = Math.max(0, listNow().findIndex((l) => l.id === params.get('level')));
let level: Level = listNow()[levelIndex] as Level;
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
const kbLook: Look = randomLook();
/** 手机局的房主：0 号颜色；名字和样子用这部手机当手柄时记下的（没有就叫「房主」、随机一个样子）。 */
const HOST_COLOR = 0;
let hostLook: Look = stored('hang-on:look', (v) => cleanLook(JSON.parse(v))) ?? randomLook();
const hostName = (): string => stored('hang-on:name', (v) => v.trim().slice(0, 12)) || tr('房主', 'Host');
/** 道具（A9）：手机局的房主记在这部手机上（和它当手柄时同一个），键盘玩家只记这一回。 */
let hostItem: ItemId = stored('hang-on:item', cleanItem) ?? 'freeze';
let kbItem: ItemId = 'freeze';
/** 每个人道具没用成（拉面没抓着墙）几次了：小包里带上，手柄看到变了就提示。 */
let itemFails: number[] = [];
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
/** 键盘玩家用座位没占的颜色里最后一个（6 个座位都坐满时和 5 号重色，只是试手感用）。 */
const localColor = (): number => (phoneMode ? HOST_COLOR : ([5, 4, 3, 2, 1, 0].find((c) => !room?.seats.some((s) => s.color === c)) ?? 5));
const localName = (): string => (phoneMode ? hostName() : tr('键盘', 'Keyboard'));
const localLook = (): Look => (phoneMode ? hostLook : kbLook);
const localItem = (): ItemId => (phoneMode ? hostItem : kbItem);
function setLocalItem(id: ItemId): void {
  if (phoneMode) {
    hostItem = id;
    try {
      localStorage.setItem('hang-on:item', id);
    } catch {
      // 记不住就记不住
    }
  } else kbItem = id;
  syncPlayers();
  renderLobby();
}
/** 自己那个人是第几个（没有是 -1）。 */
const localIndex = (): number => (localOn() ? seatOrder.length : -1);

sfx.attach(document);
sfx.panOf = (x, y) => Math.max(-1, Math.min(1, (stage.toScreen({ x, y }).x / innerWidth) * 2 - 1)) * 0.6;
langButton($<HTMLButtonElement>('langBtn'));

// ---------- 玩法 ----------
const modeHint = (m: GameMode): string => pickLang(modeHintText(m, teamsOn));
/** 比谁先分两队：按座位一个甜一个咸。 */
const teamsFor = (n: number): number[] => Array.from({ length: n }, (_, i) => i % 2);
function rules(): Rules {
  return mode === 'race' && teamsOn ? { mode, teams: teamsFor(playerCount()) } : { mode };
}
/** 比谁先分两队时这个人在哪一队（不分队是 undefined）。 */
const teamOf = (i: number): number | undefined => sim.rules.teams?.[i] ?? (sim.rules.mode === 'race' && sim.rules.teams ? i % 2 : undefined);
/** 头顶上的名字：分队时带上队。 */
function tagName(i: number, nm: string): string {
  const t = teamOf(i);
  return t === undefined ? nm : `${nm} · ${t === 0 ? tr('甜', 'Sweet') : tr('咸', 'Savory')}`;
}
function setMode(m: GameMode): void {
  if (m === mode) return;
  levelIndexOf.set(slot(), levelIndex);
  mode = m;
  relist(true);
}
/** 难度（闯关、比谁先）。 */
function setTier(t: Tier): void {
  if (t === tier || !tiered(mode)) return;
  levelIndexOf.set(slot(), levelIndex);
  tier = t;
  relist(true);
}
/** 单人还是多人；`byHand` 是有人点的（之后不再跟着人数走）。单人只有闯关。 */
function setSide(s: Side, byHand = true): void {
  if (byHand) sideAuto = false;
  if (s === side) return;
  levelIndexOf.set(slot(), levelIndex);
  side = s;
  const modeChanged = !SIDE_MODES[side].includes(mode);
  if (modeChanged) mode = 'climb';
  relist(modeChanged);
}
/** 换了玩法、难度或者单人多人：回到这一串上次选到的那关，重画大厅（玩法变了或者关变了才重摆）。 */
function relist(reset: boolean): void {
  const list = listNow();
  levelIndex = Math.max(0, Math.min(levelIndexOf.get(slot()) ?? 0, list.length - 1));
  const was = level;
  level = list[levelIndex] as Level;
  renderModes();
  renderLevel();
  renderLobby();
  menuDirty = true;
  if (phase === 'lobby' && (reset || level !== was)) void resetSim();
}
/** 没人点过单人多人：跟着人数走（一个人单人，两个人以上多人）。人数变了时大厅调它。 */
function followCount(): void {
  if (!sideAuto || phase !== 'lobby') return;
  const want = sideFor(playerCount());
  if (want !== side) setSide(want, false);
}
/** 这一边能选的玩法（大团队要有大关）。 */
const modesNow = (): GameMode[] => SIDE_MODES[side].filter((m) => m !== 'team' || TEAM_LEVELS.length > 0);
/** 结算页有没有「下一关」：这一档还有，或者这一档打完了接着下一档。 */
const hasNext = (): boolean => levelIndex < listNow().length - 1 || (tiered(mode) && tier < 2);
/** 下一关：这一档的下一关；这一档打完了是下一档的第一关。 */
function goNext(): void {
  if (levelIndex < listNow().length - 1) {
    pickLevel(levelIndex + 1);
    return;
  }
  if (!tiered(mode) || tier >= 2) return;
  levelIndexOf.set(slot(), levelIndex);
  tier = (tier + 1) as Tier;
  levelIndexOf.set(slot(), 0);
  relist(true);
}
function setTeams(on: boolean): void {
  if (on === teamsOn) return;
  teamsOn = on;
  renderModes();
  renderLevel();
  renderLobby();
  menuDirty = true;
  if (phase === 'lobby') void resetSim();
}
function radioBtn(box: HTMLElement, label: string, on: boolean, click: () => void, small = false): void {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = small ? 'mode small' : 'mode';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(on));
  b.textContent = label;
  b.addEventListener('click', () => {
    sfx.tick();
    click();
  });
  box.append(b);
}
/**
 * 大厅里先选单人还是多人；多人再选玩法（一起闯关、比谁先、坐不住，大团队有大关才出），比谁先下面再选各跑各的还是分两队；
 * 闯关、比谁先最后选难度。
 */
function renderModes(): void {
  const sides = $('sides');
  sides.innerHTML = '';
  for (const s of SIDES) radioBtn(sides, sideName(s), s === side, () => setSide(s));
  $('modeRow').hidden = side !== 'multi';
  const box = $('modes');
  box.innerHTML = '';
  for (const m of modesNow())
    radioBtn(box, modeLabel(m, side), m === mode, () => {
      sideAuto = false;
      setMode(m);
    });
  const teams = $('teams');
  teams.hidden = mode !== 'race';
  teams.innerHTML = '';
  for (const on of [false, true]) radioBtn(teams, on ? tr('甜队对咸队', 'Sweet vs Savory') : tr('各跑各的', 'Free for all'), on === teamsOn, () => setTeams(on), true);
  $('tierRow').hidden = !tiered(mode);
  const tiers = $('tiers');
  tiers.innerHTML = '';
  for (const t of TIERS) radioBtn(tiers, tierName(t), t === tier, () => setTier(t));
}

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
      // 手机局：有人（重新）连上或换了路，马上补一份样子名单，别等下一个 2 秒；菜单也是
      castDirty = true;
      menuDirty = true;
      renderLobby();
      renderLatency();
    },
    onLook: () => {
      syncPlayers();
      renderLobby();
    },
    onItem: () => {
      syncPlayers();
      renderLobby();
    },
    onCmd: (_peer, c) => runCmd(c),
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
  // 手机局屏幕小、触屏开的电视局没有键盘：底下那条只在断线时出来
  $('note').classList.toggle('quiet', (phoneMode || touchHost) && !socketDown);
  $('note').innerHTML = socketDown
    ? tr('和房间的连接断了，正在重连……', 'Lost the room connection. Reconnecting…')
    : phoneMode || touchHost
      ? ''
      : tr(
          '主机页只在一台电脑上开，接电视。<kbd>键盘加入</kbd> 后 <kbd>W A S D</kbd> 指方向、<kbd>Q</kbd> <kbd>E</kbd> 抓、<kbd>R</kbd> 召唤、<kbd>F</kbd> 用道具，自己一个人也能试。',
          'Open this page on one computer only, the one on the TV. After <kbd>Keyboard join</kbd>, <kbd>W A S D</kbd> aims, <kbd>Q</kbd> <kbd>E</kbd> grab, <kbd>R</kbd> summons, <kbd>F</kbd> uses your item. You can try it alone.',
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
  const playing = next === 'countdown' || next === 'playing';
  $('clockChip').hidden = !playing;
  // 坐不住：数还有几个人挂着，不数摔了几次
  $('deathChip').hidden = !playing || mode === 'last';
  $('aliveChip').hidden = !playing || mode !== 'last';
  // 底下那条说明只在大厅里有用，玩的时候别挡着画面
  $('note').hidden = next !== 'lobby';
  // 手机局：倒数和玩的时候房主的摇杆、抓键压在画面上；页面的样式（横过来的提示）按阶段走
  $('touch').hidden = !phoneMode || (next !== 'countdown' && next !== 'playing');
  document.body.dataset.phase = next;
  castDirty = true;
  menuDirty = true;
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
  // 开局镜头从终点扫回起点（A8）
  stage.intro(2.6);
  lastGoals = null;
  $('countNum').textContent = String(n);
  $('countLevel').textContent = countLabel();
  const gl = goalsLine();
  $('countGoals').hidden = !gl;
  $('countGoals').textContent = gl;
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
/** 倒数时写的：不是闯关就带上玩法，分难度的带上难度。 */
function countLabel(): string {
  const pre = [mode === 'climb' ? '' : modeName(mode), tiered(mode) ? tierName(tier) : ''].filter(Boolean);
  return [...pre, levelTitle(level, levelIndex)].join(' · ');
}

/** 这一局的小目标和红包（A9b）：到顶那一下算好、记下，结算页和发给手机的结算都用它；开新的一局清掉。 */
let lastGoals: { goals: Goal[]; envelopes: NonNullable<Results['envelopes']> } | null = null;
/** 结算的数：玩的那一局的，加上小目标。 */
function fullResults(): Results {
  return { ...resultsOf(sim), ...(lastGoals ? { goals: lastGoals.goals, envelopes: lastGoals.envelopes } : {}) };
}
/** 闯关、大团队：到顶了，算这一局的小目标、记下拿到的星和红包。 */
function scoreGoals(): void {
  if (sim.rules.mode !== 'climb' && sim.rules.mode !== 'team') return;
  const got = sim.envelopes.flatMap((e, k) => (e.got ? [k] : []));
  const goals = goalsOf(sim.level, sim.players.length, { time: sim.time, deaths: sim.players.map((p) => p.deaths), envelopes: got.length });
  const rec = record(sim.level.id, goals, got);
  lastGoals = { goals: rec.goals, envelopes: { got: got.length, of: sim.envelopes.length, fresh: rec.newEnvelopes, total: envelopeTotal() } };
  renderLevel();
}
/** 倒数时写的这一关的小目标（闯关、大团队）。 */
function goalsLine(): string {
  if (mode !== 'climb' && mode !== 'team') return '';
  return goalTargets(sim.level, playerCount())
    .map((g) => `☆ ${goalText(g.key, g.target)}`)
    .join(tr('　', '  ·  '));
}

const resultsDom: ResultsDom = {
  title: $('winTitle'),
  time: $('winTime'),
  par: $('winPar'),
  deaths: $('deathList'),
  betrayTitle: $('betrayTitle'),
  betrayList: $('betrayList'),
  betrayNone: $('betrayNone'),
  goalTitle: $('goalTitle'),
  goalList: $('goalList'),
};
function showResults(): void {
  renderResults(resultsDom, fullResults(), name, (i) => sim.players[i]?.color ?? '#fff', level.par?.seconds);
  const next = $<HTMLButtonElement>('nextBtn');
  next.hidden = !hasNext();
  next.textContent = mode === 'last' ? tr('换个场地', 'Next arena') : tr('下一关', 'Next level');
  $('againBtn').textContent = mode === 'climb' || mode === 'team' ? tr('再来一次', 'Play again') : tr('再来一局', 'Rematch');
  // 电视局：手机上也能选下一步（电视那边可以不碰）
  $('padHint').hidden = phoneMode;
  $('padHint').textContent = tr('手机上按「下一关」「再来一次」「回大厅」都行', 'Anyone can pick Next, Again or Lobby on their phone');
}

$('startBtn').addEventListener('click', () => {
  // 手机局、触屏开的电视局：这一下点击正好用来全屏、横过来、不让屏幕睡着（浏览器只在点击里给）
  if (phoneMode || touchHost) void phoneScreen();
  link?.act({ type: 'START' });
});
// 结算页：再来一次、下一关都直接倒数开局；要换人、换关走顶栏的「回大厅」
$('againBtn').addEventListener('click', () => link?.act({ type: 'START' }));
$('nextBtn').addEventListener('click', () => {
  goNext();
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
// 触屏开的电视局没有键盘：键盘加入、绕路模式（测试用）都不出
$('kbBtn').hidden = $('relayBtn').hidden = touchHost;
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
  $('muteBtn').textContent = phoneMode || touchHost ? (sfx.muted ? '🔇' : '🔊') : sfx.muted ? tr('🔇 静音', '🔇 Muted') : tr('🔊 声音', '🔊 Sound');
  $('muteBtn').setAttribute('aria-label', tr('声音', 'Sound'));
  $('muteBtn').setAttribute('aria-pressed', String(sfx.muted));
}

// ---------- 关卡 ----------
function pickLevel(i: number): void {
  const list = listNow();
  levelIndex = Math.max(0, Math.min(list.length - 1, i));
  level = list[levelIndex] as Level;
  renderLevel();
  menuDirty = true;
  if (phase === 'lobby') void resetSim();
}
function renderLevel(): void {
  const list = listNow();
  $('levelName').textContent = levelTitle(level, levelIndex);
  // 小目标的星（A9b）：这台主机上这一关拿到过几颗
  if (mode === 'climb' || mode === 'team') {
    const keys = goalTargets(level, Math.max(1, playerCount())).map((g) => g.key);
    const stars = document.createElement('span');
    stars.className = 'stars';
    stars.textContent = starLine(starsOf(level.id), keys);
    stars.setAttribute('aria-label', tr(`拿到过 ${starsOf(level.id).length} 颗星，一共 ${keys.length} 颗`, `${starsOf(level.id).length} of ${keys.length} stars`));
    $('levelName').append(stars);
  }
  const allEnv = LEVELS.reduce((s, l) => s + (l.envelopes?.length ?? 0), 0);
  const et = $('envTotal');
  et.hidden = (mode !== 'climb' && mode !== 'team') || !allEnv;
  et.textContent = tr(`🧧 攒了 ${envelopeTotal()} / ${allEnv} 个红包`, `🧧 ${envelopeTotal()} of ${allEnv} red envelopes saved up`);
  // 闯关、大团队写这关教什么；比谁先、坐不住写这个玩法怎么赢（场地自己的说明和它一样）
  $('levelTeach').textContent = mode === 'climb' || mode === 'team' ? teachLabel(level) : modeHint(mode);
  $<HTMLButtonElement>('levelPrev').disabled = levelIndex === 0;
  $<HTMLButtonElement>('levelNext').disabled = levelIndex >= list.length - 1;
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
    sim.setItem(i, peer.item);
    const look = peer.look ?? DEFAULT_LOOK;
    stage.setPlayerStyle(i, { name: tagName(i, peer.name), color: p.color, look });
    sfx.setVoice(i, look.voice);
  });
  if (localOn()) {
    const i = sim.players.length - 1;
    const p = sim.players[i];
    if (p) {
      p.color = PLAYER_COLORS[localColor()] ?? p.color;
      sim.setItem(i, localItem());
      stage.setPlayerStyle(i, { name: tagName(i, localName()), color: p.color, look: localLook() });
      sfx.setVoice(i, localLook().voice);
    }
  }
  castDirty = true;
  menuDirty = true;
}
let resetting = false;
/** 重开这一关：按现在的人数摆关卡、放人。 */
let resetGen = 0;
async function resetSim(): Promise<void> {
  // 连着好几下（换玩法、换分队、有人进来）：只留最后一次的，每个旧的局面只释放一次
  const gen = ++resetGen;
  resetting = true;
  let next: Sim;
  try {
    next = await createSim(level, playerCount(), rules());
  } finally {
    if (gen === resetGen) resetting = false;
  }
  if (gen !== resetGen) {
    next.destroy();
    return;
  }
  const old = sim;
  sim = next;
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
function seatCard(nm: string, color: string, look: Look, sub: string, off: boolean, team?: number, item?: ItemId): HTMLElement {
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
  // 比谁先分两队：卡片上写是哪一队
  if (team !== undefined) {
    const t = document.createElement('span');
    t.className = `team t${team}`;
    t.textContent = teamName(team);
    el.append(t);
  }
  // 道具（A9）：这个玩法有道具才写
  if (item) {
    const it = document.createElement('span');
    it.className = 'item';
    it.textContent = `${ITEM_ICON[item]} ${itemName(item)}`;
    el.append(it);
  }
  return el;
}

function renderLobby(): void {
  followCount();
  const box = $('seats');
  box.innerHTML = '';
  const seats = room?.seats ?? [];
  const team = (i: number): number | undefined => (mode === 'race' && teamsOn ? i % 2 : undefined);
  const items = itemsIn(mode);
  seats.forEach((s, i) => {
    const peer = link?.peers.get(s.id);
    const sub = !s.connected ? tr('掉线', 'Offline') : peer?.direct ? tr('直连', 'Direct') : peer?.relayed ? tr('绕路', 'Relayed') : tr('连接中', 'Connecting');
    box.append(seatCard(s.name, PLAYER_COLORS[s.color] ?? '#fff', peer?.look ?? DEFAULT_LOOK, sub, !s.connected, team(i), items ? (peer?.item ?? 'freeze') : undefined));
  });
  if (localOn()) {
    const card = seatCard(localName(), PLAYER_COLORS[localColor()] ?? '#fff', localLook(), phoneMode ? tr('这部手机 · 点一下换样子', 'This phone · tap for a new look') : tr('这台电脑', 'This computer'), false, team(seats.length), items ? localItem() : undefined);
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
  const notReady = notReadyText(n, side, mode);
  $('lobbyLine').textContent = !n
    ? tr('等人进来……', 'Waiting for players…')
    : notReady
      ? pickLang(notReady)
      : phoneMode
        ? tr(`${n} 个人，到齐了就开始。`, `${n} ${n === 1 ? 'player' : 'players'}. Start when everyone is in.`)
        : tr(`${n} 个人，到齐了谁的手机上按「开始」都行。`, `${n} ${n === 1 ? 'player' : 'players'}. When everyone is in, anyone can press Start on their phone.`);
  $<HTMLButtonElement>('startBtn').disabled = !canStart();
  // 这台设备上自己玩的人换道具：点一下换下一样
  const ib = $<HTMLButtonElement>('itemBtn');
  ib.hidden = !localOn() || !items;
  ib.textContent = tr(`我的道具：${ITEM_ICON[localItem()]} ${itemName(localItem())}`, `My item: ${ITEM_ICON[localItem()]} ${itemName(localItem())}`);
}
$('itemBtn').addEventListener('click', () => {
  sfx.tick();
  setLocalItem(ITEM_IDS[(ITEM_IDS.indexOf(localItem()) + 1) % ITEM_IDS.length] as ItemId);
});

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
  renderModes();
  renderLevel();
  renderLobby();
  renderLatency();
  if (lastFatal) $('fatalLine').textContent = fatalLine(lastFatal);
  if (phase === 'results') showResults();
  if (phase === 'countdown') $('countLevel').textContent = countLabel();
  syncPlayers();
}
onLang(renderAll);
renderButtons();
renderNote();
renderModes();
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
  // 道具：按着 F 就一直发，冷却里物理不算
  if (keys.has('KeyF')) input.act = 'item';
  return input;
}

// ---------- 手机局：房主的触屏手柄、全屏、不睡 ----------
const touch = bindControls($('touch'));
let summonTap = false;
let touchItemFrames = 0;
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
  if (summonTap || kb.act === 'summon') input.act = 'summon';
  summonTap = false;
  // 道具键：按下去连发几帧（和手柄一样）
  if (touch.takeItem() || kb.act === 'item') touchItemFrames = 12;
  if (touchItemFrames > 0) {
    touchItemFrames--;
    input.act = 'item';
  }
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

/** 第 i 个人的队友里摔下去还没回来的有几个：闯关、大团队是全队，比谁先分队是自己队，各跑各的和坐不住没有队友可拉。 */
function teamDead(i: number): number {
  const m = sim.rules.mode;
  if (m === 'last' || (m === 'race' && !sim.rules.teams)) return 0;
  return sim.players.filter((q, j) => j !== i && q.dead && !q.done && (m !== 'race' || teamOf(j) === teamOf(i))).length;
}
function sendStatus(): void {
  if (phoneMode) {
    // 房主的「召唤」键：有队友摔下去还没回来才亮；没有队友可拉的玩法不出
    const me = localIndex();
    touchSummon.hidden = sim.rules.mode === 'last' || (sim.rules.mode === 'race' && !sim.rules.teams);
    touchSummon.disabled = !(phase === 'playing' && teamDead(me) > 0);
    // 房主的道具键：这个玩法有道具才出
    const p = sim.players[me];
    const use = $<HTMLButtonElement>('touchItem');
    use.hidden = !sim.itemsOn || !p;
    if (p && sim.itemsOn) {
      const ready = sim.itemReady(me);
      use.style.setProperty('--ready', String(ready));
      use.disabled = phase !== 'playing' || ready < 1 || !!p.itemOn;
      use.classList.toggle('on', !!p.itemOn);
      $('touchItemIcon').textContent = ITEM_ICON[localItem()];
      $('touchItemName').textContent = itemName(localItem());
      use.setAttribute('aria-label', tr(`用道具：${itemName(localItem())}`, `Use item: ${itemName(localItem())}`));
    }
  }
  if (!link) return;
  seatOrder.forEach((id, i) => {
    const p = sim.players[i];
    const peer = link!.peers.get(id);
    if (!p || !peer || !peer.connected) return;
    const place = sim.finishOrder.indexOf(i) + 1;
    const team = teamOf(i);
    link!.status(id, {
      color: peer.color,
      hands: [!!p.arms[0].grip, !!p.arms[1].grip],
      deaths: p.deaths,
      rttMs: peer.rtt.median(),
      phase,
      direct: peer.direct,
      teamDead: teamDead(i),
      mode: sim.rules.mode,
      ...(team !== undefined ? { team } : {}),
      ...(place ? { place } : {}),
      ...(p.out ? { out: true } : {}),
      ...(sim.itemsOn && p.item ? { item: p.item, itemReady: Math.round(sim.itemReady(i) * 100) / 100, itemOn: !!p.itemOn, itemFails: itemFails[i] ?? 0 } : {}),
    });
  });
}

function onEvents(): void {
  for (const ev of sim.events) {
    if (ev.type === 'win') {
      scoreGoals();
      // 先让电视上撒一会儿纸屑、大家一起跳，再出结算页；比谁先、坐不住的横幅写谁赢了
      banner(resultsTitle(resultsOf(sim), name));
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
    // 比谁先人人都有自己的检查点，横幅太多，不出
    if (ev.type === 'checkpoint' && sim.rules.mode !== 'race') banner(tr('检查点 ✓', 'Checkpoint ✓'));
    if (ev.type === 'finish') banner(tr(`${name(ev.player)} 到了！第 ${ev.place} 个`, `${name(ev.player)} made it! #${ev.place}`));
    if (ev.type === 'out') banner(tr(`${name(ev.player)} 出局`, `${name(ev.player)} is out`), 'bad');
    if (ev.type === 'envelope') {
      const got = sim.envelopes.filter((e) => e.got).length;
      banner(tr(`🧧 ${name(ev.player)} 拿到红包 ${got}/${sim.envelopes.length}`, `🧧 ${name(ev.player)} got an envelope ${got}/${sim.envelopes.length}`));
    }
    if (ev.type === 'item' && !ev.ok) {
      itemFails[ev.player] = (itemFails[ev.player] ?? 0) + 1;
      // 房主自己（手机局、键盘）没用成：屏幕上提示一下；别人的提示在各自手柄上
      if (ev.player === localIndex()) banner(tr('拉面要先抓住墙或台子', 'Grab a wall or ledge first'), 'bad');
    }
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
    ...(phase === 'results' ? { results: fullResults() } : {}),
    mode: sim.rules.mode,
    ...(sim.rules.teams ? { teams: sim.rules.teams } : {}),
  };
}

// ---------- 手柄当遥控：给每个手柄发菜单，照手柄按的做 ----------
let menuDirty = true;
let menuAt = 0;
/** 开局、下一关这种一按就换阶段的，1 秒里只算一次（几个人一起按、一个人连按，别跳过两关）。 */
let cmdLockUntil = 0;

function canStart(): boolean {
  const n = playerCount();
  return n >= minPlayers(side, mode) && n <= maxPlayers(side) && !!link?.socketOpen;
}

function menuFor(): Menu {
  const list = listNow();
  return {
    phase,
    side,
    mode,
    modes: modesNow(),
    teams: teamsOn,
    tier,
    tiered: tiered(mode),
    level: {
      n: levelIndex + 1,
      of: list.length,
      name: level.name ?? { zh: level.id, en: level.id },
      teach: mode === 'climb' || mode === 'team' ? teachText(level) : modeHintText(mode, teamsOn),
      // 小目标的星（A9b）：这台主机上这一关拿到过的（闯关、大团队）
      ...(mode === 'climb' || mode === 'team' ? { stars: starLine(starsOf(level.id), goalTargets(level, Math.max(1, playerCount())).map((g) => g.key)) } : {}),
    },
    players: playerCount(),
    min: minPlayers(side, mode),
    canStart: canStart(),
    hasNext: hasNext(),
    ...(phase === 'results'
      ? { results: fullResults(), names: sim.players.map((p, i) => ({ name: name(i), color: p.color })), ...(level.par ? { par: level.par.seconds } : {}) }
      : {}),
  };
}

function runCmd(c: PadCmd): void {
  const now = performance.now();
  const phaseChange = c.do === 'start' || c.do === 'again' || c.do === 'next' || c.do === 'lobby';
  if (phaseChange && now < cmdLockUntil) return;
  switch (c.do) {
    case 'start':
      if (phase !== 'lobby' || !canStart()) return;
      link?.act({ type: 'START' });
      break;
    case 'again':
      if (phase !== 'results') return;
      link?.act({ type: 'START' });
      break;
    case 'next':
      if (phase !== 'results' || !hasNext()) return;
      goNext();
      link?.act({ type: 'START' });
      break;
    case 'lobby':
      if (phase === 'lobby') return;
      link?.act({ type: 'LOBBY' });
      break;
    case 'level':
      if (phase !== 'lobby' || (c.d !== 1 && c.d !== -1)) return;
      sfx.tick();
      pickLevel(levelIndex + c.d);
      break;
    case 'mode':
      if (phase !== 'lobby' || !modesNow().includes(c.mode)) return;
      sfx.tick();
      sideAuto = false;
      setMode(c.mode);
      break;
    case 'side': {
      const s = cleanSide(c.side);
      if (phase !== 'lobby' || !s) return;
      sfx.tick();
      setSide(s);
      break;
    }
    case 'tier': {
      const t = cleanTier(c.tier);
      if (phase !== 'lobby' || t === null) return;
      sfx.tick();
      setTier(t);
      break;
    }
    case 'teams':
      if (phase !== 'lobby') return;
      sfx.tick();
      setTeams(!!c.on);
      break;
    default:
      return;
  }
  if (phaseChange) cmdLockUntil = now + 1000;
  menuDirty = true;
}

function sendMenus(now: number): void {
  if (!link) return;
  if (!menuDirty && now - menuAt < CAST_MS) return;
  menuDirty = false;
  menuAt = now;
  const m = menuFor();
  for (const p of link.peers.values()) if (p.connected) link.menu(p.seat, m);
}

function broadcast(now: number): void {
  sendMenus(now);
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
  $('alive').textContent = String(sim.players.filter((p) => !p.dead).length);
  // 红包（A9b）：这一局拿到几个了
  const envN = sim.envelopes.length;
  $('envChip').hidden = !envN || (phase !== 'playing' && phase !== 'countdown');
  if (envN) $('envs').textContent = `${sim.envelopes.filter((e) => e.got).length}/${envN}`;
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
  setMode,
  setTeams,
  get mode() {
    return mode;
  },
  stage,
  sfx,
  CFG,
  get LEVELS() {
    return listNow();
  },
  setSide,
  setTier,
  get side() {
    return side;
  },
  get tier() {
    return tier;
  },
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

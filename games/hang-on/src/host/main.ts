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
import { music } from '../audio/music';
import { heardBy, sfx } from '../audio/sfx';
import { moodOf, rawIntensity, Tension } from '../audio/tension';
import { seedOf, themeFor } from '../audio/themes';
import { applyStatic, getLang, langButton, onLang, pickLang, tr } from '../i18n';
import { EMOTE_GAP_MS, EMOTE_SHOW_S, EMOTES, emoteWords, FART_GAP_MS, FART_REACH, FART_WORDS, fartKind, type EmoteId } from '../emotes';
import { emotePicker } from '../emote-picker';
import { AchvRound, type AchvId, type Award } from '../achievements';
import { achvCount, loadAchvs, renderAchvList, saveAchvs, trophyToast, unlockLines } from '../achv-ui';
import { installReports, reportError, watchCanvas, type ReportContext } from '../report';
import { LEVELS, levelsFor, levelTitle, TEAM_LEVELS, teachText, tierOfLevel, withTiredNote } from '../levels';
import { keyBanner, modeHintText, modeLabel, modeName, notReadyText, sideName, tideBanner, tierName } from '../mode-text';
import { cleanSide, cleanTier, maxPlayers, minPlayers, SIDE_MODES, sideFor, SIDES, tiered, TIERS, type Side, type Tier } from '../sides';
import { cleanLook, DEFAULT_LOOK, GACHA, LOOK_NAMES, lockLook, randomLook, type GachaId, type Look } from '../look';
import { coins, GACHA_PRICE, leftToWin, loadGacha, pull, saveGacha } from './gacha';
import { cleanItem, ITEM_ICON, ITEM_IDS, itemsIn, type ItemId } from '../items';
import { itemName } from '../item-text';
import { CFG, PLAYER_COLORS } from '../physics/config';
import type { Level } from '../physics/level';
import { createSim, type GameMode, type PadInput, type Rules, type Sim, type SimEvent } from '../physics/world';
import { rttLevel } from '../net/latency';
import { HostLink, openRoom, type PadPeer } from '../net/host-link';
import { CAST_MS, CODE_RE, HOST_KEY_RE, MAX_SEATS, SNAP_MS, SNAP_RELAY_MS, STATUS_MS, type Cast, type FatalKey, type Menu, type PadCmd, type Phase, type RoomView } from '../net/protocol';
import { encodeSnap, EventWindow } from '../net/snap';
import { bindControls } from '../pad/controls';
import { drawLook } from '../pad/look-preview';
import { PLATES } from '../render/plates';
import { Stage } from '../render/stage';
import { renderGoldScore, renderResults, resultsOf, resultsTitle, teamName, type ResultsDom } from '../results';
import { goalsOf, goalTargets, starLine, type Goal } from '../goals';
import { goalText } from '../goal-text';
import { envelopeTotal, record, starsOf } from './progress';
import type { Results } from '../net/protocol';

// 在哪儿连按两下都不放大（两根手指照样能放大）。iPhone 的 Safari 只在点到"有人听点击"的东西附近时
// 才看 touch-action（页面样式给每个元素都设了），所以让整页自己听着。
document.documentElement.addEventListener('click', () => {});

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
 * 联机桌（A15，CONTRACTS「联机桌」）：桌子已经开好房、把码带来（`?room=CODE`），这页接管它，不自己开；
 * `?table=桌号` 时顶栏多一个「回到桌上」：按两下结束这局（所有手机跟着回去）、回桌子（手机局回 `/t/桌号`，
 * 大屏回 `/tv/桌号`），走之前在 sessionStorage 留 `hangon.over`（大屏是 `hangon.over.tv`）= 房间码，桌子看到就收桌。
 */
const tableRoom = ((c: string) => (CODE_RE.test(c) ? c : null))((params.get('room') ?? '').toUpperCase());
const tableNo = ((t: string) => (/^[A-Za-z0-9]{1,8}$/.test(t) ? t.toUpperCase() : null))(params.get('table') ?? '');
document.body.classList.toggle('table', !!tableNo);
/** 这台设备当这个房间主机的钥匙：按房间码存在 sessionStorage，刷新还是同一把；别的设备在主机在线时进不来。 */
function hostKey(code: string): string {
  const k = `hang-on:host:${code}`;
  try {
    const old = sessionStorage.getItem(k);
    if (old && HOST_KEY_RE.test(old)) return old;
  } catch {
    // 没有 sessionStorage：每次一把新的
  }
  const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => abc[b % abc.length]).join('');
  try {
    sessionStorage.setItem(k, key);
  } catch {
    // 同上
  }
  return key;
}
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
// 闪退自动记录（11-25）：画面做出来之前就开始听（WebGL 起不来也报得上来）；下面的变量还没有的时候只报哪种屏幕
installReports(() => {
  const c: ReportContext = { screen: phoneMode ? 'phone' : 'tv', lang: getLang(), online: false };
  try {
    c.phase = phase === 'ended' ? undefined : phase;
    c.online = !!link?.socketOpen;
    c.level = level.id;
    c.players = sim.players.length;
    c.mode = mode;
    c.names = [...(room?.seats.map((s) => s.name) ?? []), localName()];
  } catch {
    // 还没走到那儿
  }
  return c;
});
const canvas = $<HTMLCanvasElement>('stage');
watchCanvas(canvas);
const stage = await Stage.create(canvas, { plates: PLATES, compact: phoneMode });
/** 玩法（A7）：开局前在大厅里选；`?mode=race` 之类直接开到那个玩法（检查脚本用），`?teams=1` 比谁先分两队。 */
const MODES: GameMode[] = ['climb', 'team', 'race', 'last', 'gold'];
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
const listNow = (): Level[] => levelsFor(mode, tiered(mode) ? tier : undefined, side);
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
/** 红包扭蛋机（11-25）：花了几个红包、扭到了哪些（记在这台设备上）；扭到的（锁样子用）。放在前面，画大厅的时候就要用。 */
let gacha = loadGacha();
let gachaSet: ReadonlySet<string> = new Set(gacha.got);
let hostLook: Look = stored('hang-on:look', (v) => lockLook(cleanLook(JSON.parse(v)), gachaSet)) ?? randomLook(Math.random, gachaSet);
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
// 背景音乐（11-13）：只在开房这台设备上放（电视局是电视，手机局是房主的手机），接在音效上，静音一起管
music.attach(() => sfx.audio());
music.setPhase('lobby');
const tension = new Tension();
/** 抢金元宝（A9d）这一场：第几局、每个人赢了几局（从大厅或结算页开局时清零）。 */
let goldRound = 1;
let roundWins: number[] = [];
/** 打完的那几局加起来用了多久、每个人摔了几次（每局重摆场地，结算页写整场的）。 */
let goldPast = { time: 0, deaths: [] as number[] };
/** 准时那颗星的秒数（A9b），倒数时算好；音乐快到时间了会催。 */
let timeTarget: number | undefined;
/** 这一关放哪首：按场景，困难和坐不住放小调版。 */
function syncMusic(): void {
  music.scene(themeFor(level, (tiered(mode) && tier === 2) || mode === 'last'), seedOf(level.id));
}
sfx.panOf = (x, y) => Math.max(-1, Math.min(1, (stage.toScreen({ x, y }).x / innerWidth) * 2 - 1)) * 0.6;
langButton($<HTMLButtonElement>('langBtn'));

// ---------- 玩法 ----------
/** 比谁先分两队：按座位一个甜一个咸。 */
const teamsFor = (n: number): number[] => Array.from({ length: n }, (_, i) => i % 2);
/**
 * 手酸（A11，Steve 11-18）：分难度的玩法里，中等、困难才有；而且这关得是按手酸录过回放、验收过的
 * （`Level.stamina`），没录过的先不开，免得有的关根本过不去。
 */
function staminaNow(): Rules['stamina'] {
  return tiered(mode) && tier > 0 && level.stamina === true ? (tier === 2 ? 'hard' : 'medium') : undefined;
}
function rules(): Rules {
  const stamina = staminaNow();
  const st = stamina ? { stamina } : {};
  if (mode === 'race' && teamsOn) return { mode, teams: teamsFor(playerCount()), ...st };
  // 卡太久来帮手（A9c）：闯关、大团队里有外卖无人机；护送大元宝（11-26）大厅里打开了才有
  return mode === 'climb' || mode === 'team' ? { mode, helper: true, ...(escortOn ? { escort: true } : {}), ...st } : { mode, ...st };
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
const hasNext = (): boolean => mode === 'rain' || levelIndex < listNow().length - 1 || (tiered(mode) && tier < 2);
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
// ---------------------------------------------------------------- 红包雨（11-26，彩蛋小游戏）

/** 红包雨之前在玩什么（玩法、第几关），下完了回去接着玩。 */
let rainFrom: { mode: GameMode; levelIndex: number } | null = null;

/** 这一关（闯关、大团队）的红包这一局全拿到了：结算页出「彩蛋：红包雨」。 */
function rainReady(): boolean {
  const e = lastGoals?.envelopes;
  return phase === 'results' && (mode === 'climb' || mode === 'team') && !!e && e.of > 0 && e.got >= e.of;
}

/** 进彩蛋：记下在玩什么，换成红包雨（抢元宝的场地，跟着这一关的世界挑），直接倒数开局。 */
function startRain(): void {
  if (!rainReady()) return;
  rainFrom = { mode, levelIndex };
  const world = level.world;
  mode = 'rain';
  const list = listNow();
  levelIndex = Math.max(0, list.findIndex((l) => l.world === world));
  level = list[levelIndex] as Level;
  renderModes();
  renderLevel();
  menuDirty = true;
  castDirty = true;
  banner(tr('🧧 找到彩蛋了：红包雨！', '🧧 You found a secret: envelope rain!'));
  link?.act({ type: 'START' });
}

/** 红包雨完了：换回原来的玩法和那一关（「接着闯关」再往下走一关）。 */
function endRain(): void {
  if (!rainFrom) return;
  mode = rainFrom.mode;
  levelIndex = rainFrom.levelIndex;
  level = listNow()[levelIndex] as Level;
  rainFrom = null;
  renderModes();
  renderLevel();
  menuDirty = true;
  castDirty = true;
}

/** 护送大元宝（11-26）：大厅里开关，开了重摆这一关（起点放一个大元宝）。 */
let escortOn = false;
function setEscort(on: boolean): void {
  if (on === escortOn) return;
  escortOn = on;
  renderEscortBtn();
  menuDirty = true;
  if (phase === 'lobby') void resetSim();
}
/** 大厅里「🪙 护送大元宝」：闯关、大团队才有。 */
function renderEscortBtn(): void {
  const b = $<HTMLButtonElement>('escortBtn');
  b.hidden = mode !== 'climb' && mode !== 'team';
  b.textContent = escortOn ? tr('🪙 护送大元宝：开', '🪙 Gold escort: on') : tr('🪙 护送大元宝：关', '🪙 Gold escort: off');
  b.setAttribute('aria-pressed', String(escortOn));
  b.title = tr('起点放一个大元宝，扛到终点算数（不送也能过关）', 'A big gold ingot waits at the start. Carry it to the top for a bonus (you can finish without it)');
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
  renderEscortBtn();
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
/** 桌子带来的房只接管一次；结束以后「再开一个房间」开新的。 */
let tableTaken = false;
async function start(): Promise<void> {
  $('fatal').hidden = true;
  lastFatal = null;
  document.body.dataset.phase = phase;
  link?.close();
  const fromTable = !!tableRoom && !tableTaken;
  tableTaken = true;
  const code = fromTable && tableRoom ? tableRoom : await openRoom(location.origin, { hostPlays: phoneMode });
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
  link = new HostLink(
    code,
    {
      onRoom: (r) => {
        // 桌子开的房：手机局还是电视局听房间的（桌上没大屏时开的是手机局），对不上就换过来重开这页
        if (fromTable && !!r.hostPlays !== phoneMode) {
          const q = new URLSearchParams(location.search);
          q.set('phone', r.hostPlays ? '1' : '0');
          location.replace(`${location.pathname}?${q.toString()}`);
          return;
        }
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
      onEmote: (peer, e) => {
        const i = seatOrder.indexOf(peer.seat);
        if (i >= 0) emoteFrom(i, e);
      },
      onFart: (peer) => {
        const i = seatOrder.indexOf(peer.seat);
        if (i >= 0) fartFrom(i);
      },
      onAchvHave: (peer, ids) => {
        // 手机上记着的加进来（这一场拿到、还没传到的也留着）
        const have = haveOf(peer.seat);
        for (const id of ids) have.add(id);
      },
      onCmd: (_peer, c) => runCmd(c),
      onFatal: (key) => fatal(key),
      onSocket: (open) => {
        socketDown = !open;
        renderNote();
        renderLobby();
      },
    },
    location.origin,
    hostKey(code),
  );
  link.forceRelay = forceRelay;
  $('lobby').hidden = false;
  renderLobby();
}

let socketDown = false;
function renderNote(): void {
  // 手机局屏幕小、触屏开的电视局没有键盘：底下那条只在断线时出来
  // 房间已经关了（fatal 那张卡在说为什么）就不再说「正在重连」
  const down = socketDown && !lastFatal;
  $('note').classList.toggle('quiet', (phoneMode || touchHost) && !down);
  // 底下那条不出来时大厅也不用给它留地方（开始那一排贴在底下时贴到屏幕底，不是悬在半中间）
  document.body.classList.toggle('quiet-note', (phoneMode || touchHost) && !down);
  $('note').innerHTML = down
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
      return tr('这局已经在另一台设备上开着了（一局只能有一个大屏）。', 'This game is already running on another device (one big screen per game).');
    default:
      return tr('请求不对。', 'Bad request.');
  }
}

function fatal(key: FatalKey): void {
  lastFatal = key;
  renderNote();
  $('fatalLine').textContent = fatalLine(key);
  $('fatal').hidden = false;
  // 联机桌上：不再开新房，回桌子；这局没了（结束、房间不在）就留个记号，过一会儿自己回去
  $('reopenBtn').hidden = !!tableNo;
  $('fatalTableBtn').hidden = !tableNo;
  if (tableNo && (key === 'ended' || key === 'noRoom')) {
    const code = link?.code ?? tableRoom;
    if (code) markOver(code);
    setTimeout(() => location.assign(tableHome()), 2500);
  }
  $('lobby').hidden = true;
  $('countdown').hidden = true;
  $('results').hidden = true;
  $('touch').hidden = true;
  document.body.dataset.phase = 'ended';
  music.setPhase('off');
}
$('reopenBtn').addEventListener('click', () => void start());

// ---------- 联机桌（A15） ----------
/** 回桌子的地方：手机局是这部手机在桌上的那一页，电视局是桌子的大屏页。另一台设备占着（hostTaken）的回 `/t/`。 */
const tableHome = (): string => `/${phoneMode || lastFatal === 'hostTaken' ? 't' : 'tv'}/${tableNo ?? ''}`;
function markOver(code: string): void {
  try {
    sessionStorage.setItem(phoneMode ? 'hangon.over' : 'hangon.over.tv', code);
  } catch {
    // 没有 sessionStorage：桌子那边主人自己收桌
  }
}
/** 结束这局（END：所有手机都收到「这局结束了」、各自回桌子），留下记号，回桌子。 */
function backToTable(end: boolean): void {
  if (!tableNo) return;
  const code = link?.code ?? tableRoom;
  if (end) link?.act({ type: 'END' });
  if (code && lastFatal !== 'hostTaken') markOver(code);
  setTimeout(() => location.assign(tableHome()), end ? 400 : 0);
}
const tableBtn = $<HTMLButtonElement>('tableBtn');
tableBtn.hidden = !tableNo;
let tableArmed: ReturnType<typeof setTimeout> | null = null;
function renderTableBtn(): void {
  tableBtn.textContent = tableArmed ? tr('再按一下：结束这局，回到桌上', 'Tap again: end the game, back to the table') : tr('回到桌上', 'Back to the table');
  tableBtn.classList.toggle('armed', !!tableArmed);
}
tableBtn.addEventListener('click', () => {
  if (!tableArmed) {
    tableArmed = setTimeout(() => {
      tableArmed = null;
      renderTableBtn();
    }, 3000);
    renderTableBtn();
    return;
  }
  backToTable(true);
});
$('fatalTableBtn').addEventListener('click', () => backToTable(false));

// ---------- 阶段 ----------
function onPhase(next: Phase): void {
  const prev = phase;
  phase = next;
  $('lobby').hidden = next !== 'lobby';
  $('countdown').hidden = next !== 'countdown';
  $('results').hidden = next !== 'results';
  $('lobbyBtn').hidden = next === 'lobby';
  if (next !== prev) disarmLobby();
  // 顶栏压在遮罩上面；大厅卡片里已经有大房间码，用时和摔死只在玩的时候有意思
  $('codeChip').hidden = next === 'lobby';
  const playing = next === 'countdown' || next === 'playing';
  $('clockChip').hidden = !playing;
  // 坐不住：数还有几个人挂着，不数摔了几次
  $('deathChip').hidden = !playing || mode === 'last';
  $('aliveChip').hidden = !playing || mode !== 'last';
  $('goldChip').hidden = !playing || (mode !== 'gold' && mode !== 'rain');
  // 红包雨借抢元宝的比分条，前面不要元宝
  $('goldIcon').hidden = mode === 'rain';
  // 底下那条说明只在大厅里有用，玩的时候别挡着画面
  $('note').hidden = next !== 'lobby';
  // 手机局：倒数和玩的时候房主的摇杆、抓键压在画面上；页面的样式（横过来的提示）按阶段走
  $('touch').hidden = !phoneMode || (next !== 'countdown' && next !== 'playing');
  document.body.dataset.phase = next;
  castDirty = true;
  menuDirty = true;
  // 红包雨（11-26）完了回大厅：先换回闯关
  if (next === 'lobby' && mode === 'rain') endRain();
  if (next === 'lobby') void resetSim();
  // 从结算页直接开下一关（或再来一次）：大厅那步的重置没走，在这里换上新的一局
  // 结算页的「再来一次」「下一关」从头开；从大厅开局时人数和摆关卡时不一样也重摆
  if (next === 'countdown' && (prev === 'results' || sim.layoutFor !== playerCount())) void resetSim();
  if (next === 'countdown') countdown();
  if (next === 'results') showResults();
  // 背景音乐：大厅、结算轻轻放，倒数从头起，玩的时候跟着紧张走
  if (next === 'countdown' && mode === 'gold') {
    goldRound = 1;
    roundWins = Array.from({ length: Math.max(1, playerCount()) }, () => 0);
    goldPast = { time: 0, deaths: [] };
  }
  if (next === 'countdown') {
    syncMusic();
    tension.reset(0.3);
    timeTarget = goalTargets(level, Math.max(1, playerCount())).find((g) => g.key === 'time')?.target;
  }
  if (next === 'lobby' || next === 'countdown' || next === 'playing' || next === 'results') music.setPhase(next);
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
/** 结算的数：玩的那一局的，加上小目标；抢金元宝加上这一场每个人赢了几局。 */
function fullResults(): Results {
  return {
    ...resultsOf(sim),
    ...(lastGoals ? { goals: lastGoals.goals, envelopes: lastGoals.envelopes } : {}),
    ...(sim.rules.mode === 'gold' ? goldTotals() : {}),
    ...(sim.escort ? { escort: sim.escort.done } : {}),
  };
}

/** 抢金元宝每个人赢了几局（半路进来的人从 0 算）。 */
const goldWins = (): number[] => sim.players.map((_, i) => roundWins[i] ?? 0);

/** 抢金元宝的结算：每个人赢了几局，整场用了多久、每个人一共摔了几次。 */
function goldTotals(): Pick<Results, 'rounds' | 'time' | 'deaths'> {
  return {
    rounds: goldWins(),
    time: Math.round((goldPast.time + sim.time) * 100) / 100,
    deaths: sim.players.map((p, i) => p.deaths + (goldPast.deaths[i] ?? 0)),
  };
}

/**
 * 端托盘（后厨，A10）：大家都到终点了、托盘还没端到，过几秒提醒一次（不然大家站在终点不知道为什么不过关）。
 */
let trayHintAt = 0;
function trayHint(now: number): void {
  const tray = sim.tray;
  if (!tray || tray.home || sim.won || phase !== 'playing' || now - trayHintAt < 5000) return;
  const g = sim.level.goal;
  const allIn = sim.players.length > 0 && sim.players.every((p) => !p.dead && p.body.x > g.x && p.body.x < g.x + g.w && p.body.y > g.y && p.body.y < g.y + g.h);
  if (!allIn) return;
  trayHintAt = now;
  banner(tr('点心还没端到，回去把托盘端过来', "The dim sum isn't here yet. Go back for the tray"), 'bad');
}

/** 抢金元宝的比分：「阿一 2 · 阿二 1」。 */
function goldScore(): string {
  return goldWins()
    .map((n, i) => `${name(i)} ${n}`)
    .join(' · ');
}

/**
 * 抢金元宝（A9d）：有人赢了一局。先赢 CFG.goldRounds 局的赢这一场（庆祝一下再出结算页）；
 * 还没有就过两秒换下一张场地（几张轮着来，从大厅选的那张开始），接着下一局（房间还在玩，不用再倒数）。
 */
function goldWin(w: number | undefined): void {
  if (w === undefined) return;
  award(roundNow().onWin([w], roundEnd()));
  roundWins[w] = (roundWins[w] ?? 0) + 1;
  castDirty = true;
  const done = (roundWins[w] ?? 0) >= CFG.goldRounds;
  const won = sim;
  if (done) {
    music.win();
    banner(tr(`${name(w)} 赢了这一场！`, `${name(w)} wins the match!`));
    setTimeout(() => {
      if (sim === won && phase === 'playing') link?.act({ type: 'FINISH' });
    }, 2600);
    return;
  }
  // 这一局用的时间和摔的次数先记下，下一局重摆场地就没了
  goldPast.time += sim.time;
  sim.players.forEach((p, i) => (goldPast.deaths[i] = (goldPast.deaths[i] ?? 0) + p.deaths));
  music.flourish();
  banner(tr(`${name(w)} 拿下第 ${goldRound} 局　${goldScore()}`, `${name(w)} takes round ${goldRound}   ${goldScore()}`));
  setTimeout(() => {
    if (sim !== won || phase !== 'playing') return;
    goldRound++;
    const list = listNow();
    if (list.length > 1) {
      levelIndex = (levelIndex + 1) % list.length;
      level = list[levelIndex] as Level;
      renderLevel();
      menuDirty = true;
      // 换了世界就换曲子（下一小节换过去）
      syncMusic();
    }
    void resetSim().then(() => banner(tr(`第 ${goldRound} 局`, `Round ${goldRound}`)));
  }, 2000);
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
  next.textContent = mode === 'rain' ? tr('接着闯关', 'Back to climbing') : mode === 'last' || mode === 'gold' ? tr('换个场地', 'Next arena') : tr('下一关', 'Next level');
  $('againBtn').textContent = mode === 'climb' || mode === 'team' ? tr('再来一次', 'Play again') : tr('再来一局', 'Rematch');
  // 红包雨（11-26）：彩蛋只下一次，不能再来；这一关红包全拿到了才出「彩蛋：红包雨」
  $('againBtn').hidden = mode === 'rain';
  $('rainBtn').hidden = !rainReady();
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
  // 红包雨下完了：换回闯关，接着下一关
  if (mode === 'rain') endRain();
  goNext();
  link?.act({ type: 'START' });
});
$('rainBtn').addEventListener('click', startRain);
// 表情（11-25）：这台设备上玩的人（手机局的房主、电视局里键盘加入的）顶栏的 😀
emotePicker($<HTMLButtonElement>('emoteBtn'), (e) => {
  const i = localIndex();
  if (i >= 0) emoteFrom(i, e);
});
// 放屁键（11-25）：顶栏的 💨，键盘按 P（屁）
$('fartBtn').addEventListener('click', () => {
  const i = localIndex();
  if (i >= 0) fartFrom(i);
});

// 回大厅：手机局倒数和玩的时候按两下才算（第一下变红，3 秒内再按一下），跟手柄上一样。
// 房主手机上它挨着 EN，手一滑大家这一局就没了；电视那边（鼠标、键盘）和结算的时候按一下就回。
const lobbyBtn = $<HTMLButtonElement>('lobbyBtn');
let lobbyArmed: ReturnType<typeof setTimeout> | null = null;
function disarmLobby(): void {
  if (lobbyArmed) clearTimeout(lobbyArmed);
  lobbyArmed = null;
  lobbyBtn.classList.remove('armed');
  lobbyBtn.textContent = tr('回大厅', 'Lobby');
}
lobbyBtn.addEventListener('click', () => {
  if (phoneMode && (phase === 'countdown' || phase === 'playing') && !lobbyArmed) {
    lobbyArmed = setTimeout(disarmLobby, 3000);
    lobbyBtn.classList.add('armed');
    lobbyBtn.textContent = tr('再按一下回大厅', 'Tap again for lobby');
    return;
  }
  disarmLobby();
  link?.act({ type: 'LOBBY' });
});
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
// 联机桌上手机局还是电视局是桌子定的（桌上有没有大屏），不在这里换
modeBtn.hidden = !matchMedia('(pointer: coarse)').matches || !!tableNo;
// 触屏开的电视局没有键盘：键盘加入、绕路模式（测试用）都不出。
// 绕路模式是测试用的开关，客人看不懂「绕路模式：关」：只在地址里带 `?relay=1`（开）/ `?relay=0`（关）或 `?debug=1` 时出来
$('kbBtn').hidden = touchHost;
$('relayBtn').hidden = touchHost || !(params.has('relay') || params.get('debug') === '1');
modeBtn.addEventListener('click', () => {
  const q = new URLSearchParams(location.search);
  q.set('phone', phoneMode ? '0' : '1');
  location.search = q.toString();
});
function renderButtons(): void {
  if (tableNo) renderTableBtn();
  // 表情、放屁键（11-25）：这台设备上有人在玩（手机局的房主、电视局里键盘加入的）才有 😀 和 💨
  $('emoteBtn').hidden = !localOn();
  $('fartBtn').hidden = !localOn();
  renderAchvBtn();
  renderGachaBtn();
  modeBtn.textContent = phoneMode ? tr('改成电视局', 'Use a TV instead') : tr('改成手机局', 'Phones only');
  modeBtn.title = phoneMode
    ? tr('这台设备接电视当大屏，大家的手机当手柄', 'This device goes on the TV as the big screen; phones are controllers')
    : tr('没有电视：这部手机开房、自己也玩，大家都在自己手机上看', 'No TV: this phone hosts and plays, and everyone watches on their own phone');
  $('kbBtn').textContent = keyboard ? tr('− 键盘退出', '− Keyboard leave') : tr('+ 键盘加入', '+ Keyboard join');
  $('relayBtn').textContent = forceRelay ? tr('绕路模式：开', 'Relay mode: on') : tr('绕路模式：关', 'Relay mode: off');
  // 手机上顶栏挤：只留图标
  const locked = !sfx.ready && !sfx.muted;
  $('muteBtn').textContent =
    phoneMode || touchHost ? (sfx.muted ? '🔇' : '🔊') : sfx.muted ? tr('🔇 静音', '🔇 Muted') : locked ? tr('🔈 点一下这页才有声音', '🔈 Click the page for sound') : tr('🔊 声音', '🔊 Sound');
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
  if (phase === 'lobby') syncMusic();
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
  // 红包扭蛋机的键跟着攒的红包变（11-25）
  renderGachaBtn();
  // 闯关、大团队写这关教什么；比谁先、坐不住写这个玩法怎么赢（场地自己的说明和它一样）
  $('levelTeach').textContent = pickLang(withTiredNote(mode === 'climb' || mode === 'team' ? teachText(level) : modeHintText(mode, teamsOn), !!staminaNow()));
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
  return lockLook((id && link?.peers.get(id)?.look) || DEFAULT_LOOK, gachaSet);
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
    // 扭蛋机里的没在这台设备上扭到的，画默认的（11-25）
    const look = lockLook(peer.look ?? DEFAULT_LOOK, gachaSet);
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

// ---------------------------------------------------------------- 表情（11-25）

/** 大厅里座位卡头上挂的那句（表情或者放屁）：座位卡每次重画都带上，到点自己没了。 */
const lobbySays = new Map<number, { zh: string; en: string; until: number }>();
const emoteAt = new Map<number, number>();
const fartAt = new Map<number, number>();

/** 大厅里第 i 个人的座位卡上挂一句，挂 seconds 秒。 */
function sayInLobby(i: number, words: { zh: string; en: string }, seconds: number): void {
  lobbySays.set(i, { zh: words.zh, en: words.en, until: performance.now() + seconds * 1000 });
  renderLobby();
  setTimeout(renderLobby, seconds * 1000 + 50);
}

/** 一件不是物理的事（表情、放屁）：画面、声音，手机局跟着快照发到每部手机。 */
function showNow(ev: SimEvent): void {
  stage.handleEvents(sim, [ev]);
  sfx.handleEvents(sim, heard([ev]));
  if (phoneMode) recent.push([ev]);
}

/**
 * 第 i 个人说了一句：那个人头顶冒气泡、响一声，手机局跟着快照发到每部手机；在大厅里挂在座位卡上。
 * 同一个人太密的（手柄已经挡过一次，网络一抖两句可能挨得近）挡掉。
 */
function emoteFrom(i: number, e: EmoteId): void {
  const now = performance.now();
  if (now - (emoteAt.get(i) ?? -Infinity) < EMOTE_GAP_MS - 300) return;
  emoteAt.set(i, now);
  const p = sim.players[i];
  showNow({ type: 'emote', player: i, emote: e, x: p?.body.x ?? 0, y: p?.body.y ?? 0 });
  if (phase === 'lobby') sayInLobby(i, emoteWords(e), EMOTE_SHOW_S);
  award(roundNow().onEmote(i));
}

/**
 * 放屁键（11-25）：第 i 个人噗一下。挑一种声音（大家听到同一种），和表情一样直接交给画面、声音和快照；
 * 大厅里座位卡上挂「💨 噗」。同一个人太密的挡掉。
 */
function fartFrom(i: number): void {
  const now = performance.now();
  if (now - (fartAt.get(i) ?? -Infinity) < FART_GAP_MS - 300) return;
  fartAt.set(i, now);
  const p = sim.players[i];
  showNow({ type: 'fart', player: i, kind: fartKind(), x: p?.body.x ?? 0, y: p?.body.y ?? 0 });
  if (phase === 'lobby') sayInLobby(i, FART_WORDS, 1.4);
  // 成就「熏到人了」：旁边（FART_REACH 以内）有活着的别人
  const stank = !!p && sim.players.some((q, j) => j !== i && !q.dead && Math.hypot(q.body.x - p.body.x, q.body.y - p.body.y) <= FART_REACH);
  award(roundNow().onFart(i, stank));
}

// ---------------------------------------------------------------- 成就（11-25）

/** 各人有哪些：手柄按座位（连上时自己说、这一场拿到的加进去），这台设备上玩的人是 local（记在这台设备上）。 */
const achvHave = new Map<string, Set<AchvId>>();
let achvSim: Sim | null = null;
let achvRound: AchvRound | null = null;

/** 这一局的成就账（换了局面就重新记）。 */
function roundNow(): AchvRound {
  if (!achvRound || achvSim !== sim) {
    achvSim = sim;
    achvRound = new AchvRound({ mode: sim.rules.mode, tier: tierOfLevel(sim.level), long: !!sim.level.long });
  }
  return achvRound;
}

/** 到顶、赢了那一下的账。 */
function roundEnd(): Parameters<AchvRound['onWin']>[1] {
  return {
    players: sim.players.length,
    deaths: sim.players.reduce((n, p) => n + p.deaths, 0),
    envelopes: { got: sim.envelopes.filter((e) => e.got).length, of: sim.envelopes.length },
    goals: lastGoals?.goals ?? null,
    escort: !!sim.escort?.done,
  };
}

/** 第 i 个人是谁：手柄的座位，或者这台设备上玩的人（local）。 */
function achvKey(i: number): string | null {
  if (i === localIndex()) return 'local';
  return seatOrder[i] ?? null;
}

function haveOf(key: string): Set<AchvId> {
  let have = achvHave.get(key);
  if (!have) {
    have = new Set(key === 'local' ? loadAchvs() : []);
    achvHave.set(key, have);
  }
  return have;
}

/**
 * 发成就：以前拿过的不报。新的：记下（手柄的告诉那部手机记，这台设备上的记在这台设备上），
 * 大屏上冒一条、响一声，手机局跟着快照发到每部手机。
 */
function award(list: readonly Award[]): void {
  const fresh: { name: string; id: AchvId }[] = [];
  for (const a of list) {
    const key = achvKey(a.player);
    if (!key) continue;
    const have = haveOf(key);
    if (have.has(a.id)) continue;
    have.add(a.id);
    if (key === 'local') {
      saveAchvs(have);
      renderAchvBtn();
    } else link?.achv(key, a.id);
    const p = sim.players[a.player];
    showNow({ type: 'achv', player: a.player, id: a.id, x: p?.body.x ?? 0, y: p?.body.y ?? 0 });
    fresh.push({ name: name(a.player), id: a.id });
  }
  // 几个人一起拿到的写在一条里
  for (const line of unlockLines(fresh)) trophyToast($('trophies'), line);
}

/** 大厅里这台设备上玩的人的「🏆 3/19」。 */
function renderAchvBtn(): void {
  const b = $<HTMLButtonElement>('achvBtn');
  b.hidden = !localOn();
  b.textContent = `🏆 ${achvCount(haveOf('local'))}`;
}
$('achvBtn').addEventListener('click', () => {
  renderAchvList($('achvList'), haveOf('local'));
  $<HTMLDialogElement>('achvDlg').showModal();
});
$('achvDone').addEventListener('click', () => $<HTMLDialogElement>('achvDlg').close());

// ---------------------------------------------------------------- 红包扭蛋机（11-25）

let gachaBusy = false;
const gachaDlg = $<HTMLDialogElement>('gachaDlg');
const reduceMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 这一样叫什么（那一项的名字）。 */
function gachaName(id: GachaId): string {
  const g = GACHA.find((x) => x.id === id);
  if (!g) return id;
  const names = LOOK_NAMES[g.key] as Record<string, { zh: string; en: string }>;
  const n = names[id];
  return n ? tr(n.zh, n.en) : id;
}

/** 预览一样：默认的糯米团戴上它（嗓子画不出来，写个「喵」）。 */
function gachaPreview(c: HTMLCanvasElement, id: GachaId): void {
  const g = GACHA.find((x) => x.id === id);
  drawLook(c, g ? ({ ...DEFAULT_LOOK, [g.key]: id } as Look) : DEFAULT_LOOK, PLAYER_COLORS[localColor()] ?? '#F28CA6');
}

/** 大厅里的「🎰 扭蛋机 · 🧧 12」。 */
function renderGachaBtn(): void {
  const have = coins(gacha, envelopeTotal());
  const b = $('gachaBtn');
  // 手机局的大厅挤：只写 🎰 和红包数，名字放在读屏的标签里
  b.textContent = phoneMode ? `🎰 🧧 ${have}` : tr(`🎰 扭蛋机 · 🧧 ${have}`, `🎰 Prize machine · 🧧 ${have}`);
  b.setAttribute('aria-label', tr(`红包扭蛋机：能扭的红包 ${have} 个`, `Prize machine: ${have} red envelopes to spend`));
}

/** 对话框里的那一行、扭的键、12 样的格子（打开的时候、扭完的时候画）；扭的时候照扭之前的画（不先露出来）。 */
function renderGacha(save = gacha): void {
  const have = coins(save, envelopeTotal());
  const left = leftToWin(save);
  renderGachaBtn();
  $('gachaLine').textContent = left
    ? tr(`攒的红包能扭：🧧 ${have}　扭一个要 🧧 ${GACHA_PRICE}　还有 ${left} 样没扭到`, `Red envelopes to spend: 🧧 ${have}   One spin: 🧧 ${GACHA_PRICE}   ${left} prizes left`)
    : tr('12 样都扭到了！换装的时候都能选。', 'All 12 prizes won! Pick them under Customize.');
  const go = $<HTMLButtonElement>('gachaPull');
  go.textContent = left ? tr(`扭一个（🧧 ${GACHA_PRICE}）`, `Spin (🧧 ${GACHA_PRICE})`) : tr('扭完了', 'All won');
  go.disabled = gachaBusy || !left || have < GACHA_PRICE;
  const list = $('gachaPrizes');
  list.replaceChildren(
    ...GACHA.map((g) => {
      const li = document.createElement('li');
      const got = save.got.includes(g.id);
      li.className = `gp${got ? ' got' : ''}`;
      if (got) {
        const c = document.createElement('canvas');
        c.width = 120;
        c.height = 120;
        c.setAttribute('aria-hidden', 'true');
        gachaPreview(c, g.id);
        const nm = document.createElement('small');
        nm.textContent = g.key === 'voice' ? `🐱 ${gachaName(g.id)}` : gachaName(g.id);
        li.append(c, nm);
      } else {
        const q = document.createElement('span');
        q.className = 'q';
        q.textContent = '？';
        q.setAttribute('aria-label', tr('还没扭到', 'Not won yet'));
        li.append(q);
      }
      return li;
    }),
  );
}

function openGacha(): void {
  renderGacha();
  $('gachaPrize').hidden = true;
  if (!gachaDlg.open) gachaDlg.showModal();
}

/**
 * 扭一个：红包不够、扭完了就说一声；不然扭把手转两圈、球晃一晃、掉出一个蛋、蛋打开是新东西
 * （减少动效时直接打开）。扭到的记下来，菜单发给手柄（换装时就能选了），大家的样子重新锁一遍。
 */
function gachaPull(): void {
  if (gachaBusy) return;
  const r = pull(gacha, envelopeTotal());
  if (!r.ok) {
    banner(r.why === 'done' ? tr('12 样都扭到了', 'All 12 prizes already won') : tr(`红包不够：还差 🧧 ${r.need} 个，去闯关拿`, `Not enough red envelopes: ${r.need} more. Go climb for them`), 'bad');
    return;
  }
  const before = gacha;
  gacha = r.save;
  gachaSet = new Set(gacha.got);
  saveGacha(gacha);
  gachaBusy = true;
  renderGacha(before);
  $('gachaPrize').hidden = true;
  const m = $('machine');
  const reveal = (): void => {
    m.classList.remove('spin', 'drop');
    gachaPreview($<HTMLCanvasElement>('prizeLook'), r.id);
    $('prizeName').textContent = tr(`${gachaName(r.id)}！`, `${gachaName(r.id)}!`);
    $('gachaPrize').hidden = false;
    music.flourish();
    gachaBusy = false;
    renderGacha();
    syncPlayers();
    renderLobby();
    menuDirty = true;
  };
  if (reduceMotion()) {
    reveal();
    return;
  }
  m.classList.add('spin');
  for (let k = 0; k < 6; k++) setTimeout(() => sfx.tick(), k * 150);
  setTimeout(() => m.classList.add('drop'), 900);
  setTimeout(reveal, 1500);
}

$('gachaBtn').addEventListener('click', openGacha);
$('escortBtn').addEventListener('click', () => {
  sfx.tick();
  setEscort(!escortOn);
});
$('gachaPull').addEventListener('click', gachaPull);
$('gachaDone').addEventListener('click', () => gachaDlg.close());
renderGachaBtn();

/** 座位卡头上挂那个人刚说的一句（还没到点的话）。 */
function withSay<T extends HTMLElement>(card: T, i: number): T {
  const say = lobbySays.get(i);
  if (!say || say.until <= performance.now()) return card;
  const el = document.createElement('span');
  el.className = 'say';
  el.textContent = tr(say.zh, say.en);
  card.append(el);
  return card;
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
    box.append(withSay(seatCard(s.name, PLAYER_COLORS[s.color] ?? '#fff', lockLook(peer?.look ?? DEFAULT_LOOK, gachaSet), sub, !s.connected, team(i), items ? (peer?.item ?? 'freeze') : undefined), i));
  });
  if (localOn()) {
    const card = withSay(seatCard(localName(), PLAYER_COLORS[localColor()] ?? '#fff', localLook(), phoneMode ? tr('这部手机 · 点一下换样子', 'This phone · tap for a new look') : tr('这台电脑', 'This computer'), false, team(seats.length), items ? localItem() : undefined), seats.length);
    // 手机局：点自己那张卡换个样子（随机），这部手机以后当手柄也用这个
    if (phoneMode) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seat me';
      b.setAttribute('aria-label', tr('换个样子', 'New look'));
      b.append(...card.childNodes);
      b.addEventListener('click', () => {
        hostLook = randomLook(Math.random, gachaSet);
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
  // 表情（11-25）：键盘加入的人按 1 到 8 说一句（和 😀 那一排的顺序一样）；在输入框里打字不算
  const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
  const say = /^Digit([1-8])$/.exec(e.code);
  if (say && !e.repeat && !typing && localOn()) {
    const em = EMOTES[Number(say[1]) - 1];
    if (em) emoteFrom(localIndex(), em.id);
  }
  if (e.code === 'KeyP' && !e.repeat && !typing && localOn()) fartFrom(localIndex());
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
  if (m === 'last' || m === 'gold' || (m === 'race' && !sim.rules.teams)) return 0;
  return sim.players.filter((q, j) => j !== i && q.dead && !q.done && (m !== 'race' || teamOf(j) === teamOf(i))).length;
}
function sendStatus(): void {
  if (phoneMode) {
    // 房主的「召唤」键：有队友摔下去还没回来才亮；没有队友可拉的玩法不出
    const me = localIndex();
    touchSummon.hidden = sim.rules.mode === 'last' || sim.rules.mode === 'gold' || (sim.rules.mode === 'race' && !sim.rules.teams);
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
    // 成就（11-25）：松手、召唤、接住、红包、道具、被撞晕、掉进汤里
    award(roundNow().onEvent(ev));
    if (ev.type === 'win' && sim.rules.mode === 'gold') {
      goldWin(ev.who?.[0]);
      continue;
    }
    if (ev.type === 'win' && sim.rain) {
      // 红包雨（11-26）：接到的都放进扭蛋机
      gacha = { ...gacha, bonus: (gacha.bonus ?? 0) + sim.rain.caught.reduce((s, n) => s + n, 0) };
      saveGacha(gacha);
      renderGachaBtn();
    }
    if (ev.type === 'win') {
      music.win();
      scoreGoals();
      // 成就：到顶（大家）、比谁先和坐不住赢的人
      award(roundNow().onWin(ev.who, roundEnd()));
      // 先让电视上撒一会儿纸屑、大家一起跳，再出结算页；比谁先、坐不住的横幅写谁赢了
      banner(resultsTitle(resultsOf(sim), name));
      const won = sim;
      setTimeout(() => {
        if (sim === won && phase === 'playing') link?.act({ type: 'FINISH' });
      }, 2600);
    }
    if (ev.type === 'death' || ev.type === 'out') music.duck();
    if (ev.type === 'drone' && ev.phase === 'arrive') banner(tr('🛸 外卖到了！抓住袋子底下的横杆，带你去下一个检查点', '🛸 Delivery! Grab the bar under the bag for a lift to the next checkpoint'));
    // 端托盘（后厨，A10）
    if (ev.type === 'tray' && ev.phase === 'spill') banner(tr('点心翻了！托盘回去重端', 'The dim sum spilled! The tray goes back'), 'bad');
    if (ev.type === 'tray' && ev.phase === 'home') banner(tr('🥟 点心端到了', '🥟 The dim sum made it'));
    // 护送大元宝（11-26）
    if (ev.type === 'escort' && ev.phase === 'home') {
      banner(tr('🪙 大元宝送到顶了！', '🪙 The big gold ingot made it!'));
      music.flourish();
    }
    if (ev.type === 'escort' && ev.phase === 'back') banner(tr('大元宝掉了，回到检查点', 'The ingot fell. It is back at the checkpoint'), 'bad');
    // 涨潮（A12）
    if (ev.type === 'tide') {
      const tb = tideBanner(ev.phase, sim.level.world);
      banner(tb.text, tb.kind);
    }
    // 老宅找钥匙（A10）
    if (ev.type === 'key') {
      const kb = keyBanner(ev.phase);
      if (kb) banner(kb.text, kb.kind);
      if (ev.phase === 'unlock') music.flourish();
    }
    if (ev.type === 'checkpoint' && sim.rules.mode !== 'race') music.flourish();
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
    ...(sim.rules.mode === 'gold' ? { gold: { round: goldRound, wins: goldWins() } } : {}),
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
      teach: withTiredNote(mode === 'climb' || mode === 'team' ? teachText(level) : modeHintText(mode, teamsOn), !!staminaNow()),
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
    gacha: { coins: coins(gacha, envelopeTotal()), price: GACHA_PRICE, got: gacha.got, left: leftToWin(gacha) },
    ...(mode === 'climb' || mode === 'team' ? { escort: escortOn } : {}),
    ...(rainReady() ? { rain: true } : {}),
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
      if (phase !== 'results' || mode === 'rain') return;
      link?.act({ type: 'START' });
      break;
    case 'next':
      if (phase !== 'results' || !hasNext()) return;
      if (mode === 'rain') endRain();
      goNext();
      link?.act({ type: 'START' });
      break;
    case 'rain':
      startRain();
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
    case 'gacha':
      // 红包扭蛋机（11-25）：手柄上按了扭一个，在电视上扭给大家看
      if (phase !== 'lobby') return;
      openGacha();
      gachaPull();
      break;
    case 'teams':
      if (phase !== 'lobby') return;
      sfx.tick();
      setTeams(!!c.on);
      break;
    case 'escort':
      if (phase !== 'lobby') return;
      sfx.tick();
      setEscort(!!c.on);
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

let soundWasReady = false;
/**
 * 一帧出了错也接着画下一帧：不接的话画面就停在那儿（手机局里看着像闪退）。错误只往控制台记前几次。
 */
let frameErrors = 0;
function frame(now: number): void {
  try {
    frameBody(now);
  } catch (e) {
    if (frameErrors++ < 3) console.error('[hang-on] frame', e);
    // 闪退自动记录（11-25）：一种错报一次
    reportError(e);
  }
  requestAnimationFrame(frame);
}

function frameBody(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  feedInputs();
  if (phase === 'playing') {
    acc += dt * stage.timeScale;
    while (acc >= DT) {
      sim.step(DT);
      stage.handleEvents(sim, sim.events);
      sfx.handleEvents(sim, heard(sim.events));
      tension.events(sim.events);
      if (phoneMode) recent.push(sim.events);
      onEvents();
      acc -= DT;
    }
    // 背景音乐跟着局面紧张起来（有人一只手挂在深坑上、贴着要命的东西、在往下掉、快到了）
    music.intensity = tension.update(rawIntensity(moodOf(sim, { timeTarget })), dt);
  } else {
    acc = 0;
  }
  // 电视那边还没点过页面：声音键说点一下才有声音（浏览器的规矩）
  if (sfx.ready !== soundWasReady) {
    soundWasReady = sfx.ready;
    renderButtons();
  }
  broadcast(now);
  if (renderOn) {
    stage.updateCamera(sim, dt);
    stage.draw(sim, dt);
  }
  $('clock').textContent = sim.time.toFixed(1);
  trayHint(now);
  $('deaths').textContent = String(sim.players.reduce((s, p) => s + p.deaths, 0));
  $('alive').textContent = String(sim.players.filter((p) => !p.dead).length);
  // 抢金元宝（A9d）：第几局、比分
  if (mode === 'gold' && phase === 'playing') {
    renderGoldScore($('goldScore'), goldRound, goldWins(), name, (i) => sim.players[i]?.color ?? '#fff');
  }
  // 红包雨（11-26）：还剩几秒、每个人接到几个
  if (mode === 'rain' && phase === 'playing' && sim.rain) {
    renderGoldScore($('goldScore'), 0, sim.rain.caught.slice(0, sim.players.length), name, (i) => sim.players[i]?.color ?? '#fff', tr(`🧧 还剩 ${Math.ceil(sim.rain.left)} 秒`, `🧧 ${Math.ceil(sim.rain.left)} s left`));
  }
  // 红包（A9b）：这一局拿到几个了
  const envN = sim.envelopes.length;
  $('envChip').hidden = !envN || (phase !== 'playing' && phase !== 'countdown');
  if (envN) $('envs').textContent = `${sim.envelopes.filter((e) => e.got).length}/${envN}`;
  if (now - statusAt >= STATUS_MS) {
    statusAt = now;
    sendStatus();
  }
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
  music,
  tension,
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

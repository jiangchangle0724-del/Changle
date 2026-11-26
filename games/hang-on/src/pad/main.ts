/**
 * 手柄页（手机横着拿）：左半边按住拖动是浮动摇杆，右半边两个大键按住就是抓，抓键上面是道具键（A9，闯关和大团队里有）。
 * 每帧把输入发给主机；屏幕上只显示自己的颜色、两只手、摔死次数、延迟和连接状态，眼睛要在电视上。
 *
 * 手机局（房主也是一部手机，房间带 hostPlays）：这部手机自己也画画面，摇杆和抓键变小、半透明压在画面上。
 * 画面那部分（src/pad/view.ts，带 Pixi）到了手机局才下载。
 */
import { PadLink, seatId } from '../net/pad-link';
import { emotePicker } from '../emote-picker';
import { FART_GAP_MS } from '../emotes';
import { rttLevel } from '../net/latency';
import { CODE_RE, type Cast, type FatalKey, type Menu, type PadCmd, type PadStatus, type RoomView } from '../net/protocol';
import { modeLabel, notReadyText, sideName, tierName } from '../mode-text';
import { SIDES, TIERS } from '../sides';
import { renderResults, type ResultsDom } from '../results';
import type { PhoneView } from './view';
import { cleanLook, DEFAULT_LOOK, isLocked, LOOK_KEYS, LOOK_NAMES, randomLook, stepLook, type Look, type LookKey } from '../look';
import { cleanItem, ITEM_ICON, ITEM_IDS, type ItemId } from '../items';
import { itemHint, itemName } from '../item-text';
import { applyStatic, getLang, langButton, onLang, pickLang, tr } from '../i18n';
import { installReports, watchCanvas, type ReportContext } from '../report';
import { achvCount, gotText, loadAchvs, renderAchvList, saveAchvs, trophyToast } from '../achv-ui';
import type { AchvId } from '../achievements';
import { sfx } from '../audio/sfx';
import { drawLook } from './look-preview';
import { bindControls } from './controls';

// 在哪儿连按两下都不放大（两根手指照样能放大）。iPhone 的 Safari 只在点到"有人听点击"的东西附近时
// 才看 touch-action（页面样式给每个元素都设了），所以让整页自己听着。
document.documentElement.addEventListener('click', () => {});

// 闪退自动记录（11-25）：一打开就开始听；下面的变量还没有的时候只报哪种屏幕
installReports(() => {
  const c: ReportContext = { screen: document.body.classList.contains('viewing') ? 'padview' : 'pad', lang: getLang(), online: false };
  try {
    c.online = lastConn.socket;
    if (lastMenu) {
      c.phase = lastMenu.phase === 'ended' ? undefined : lastMenu.phase;
      c.mode = lastMenu.mode;
      c.players = lastMenu.players;
    }
    if (view) c.level = view.levelId;
    c.names = [(document.getElementById('name') as HTMLInputElement | null)?.value ?? '', ...(lastCast?.players.map((p) => p.name) ?? [])];
  } catch {
    // 还没走到那儿
  }
  return c;
});

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
/**
 * 联机桌（A15，CONTRACTS「联机桌」）：`?table=桌号` 时可以回桌子（这局照玩，桌上能「回到这局」）；
 * 这局结束了（主机按了结束、房间没了）先在 sessionStorage 留 `hangon.over` = 房间码，再自己回桌子，桌子看到就收桌。
 */
const tableNo = ((t: string) => (/^[A-Za-z0-9]{1,8}$/.test(t) ? t.toUpperCase() : null))(params.get('table') ?? '');
function backToTable(over?: string): void {
  if (!tableNo) return;
  if (over) {
    try {
      sessionStorage.setItem('hangon.over', over);
    } catch {
      // 没有 sessionStorage：桌子那边主人自己收桌
    }
  }
  location.assign(`/t/${tableNo}`);
}
codeIn.value = (params.get('code') ?? '').toUpperCase().slice(0, 4);
// 观众（11-26）：「只看，当观众」带上打好的房间码
const watchLink = (): void => {
  const c = codeIn.value.trim().toUpperCase();
  $<HTMLAnchorElement>('watchLink').href = CODE_RE.test(c) ? `../watch/?code=${c}` : '../watch/';
};
codeIn.addEventListener('input', watchLink);
watchLink();
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

// 页面被系统重新打开（iPhone 内存紧、在微信里切出去再回来）：二十分钟内刚在这个房间里，就自己重新进，
// 座位 id 存着，还是原来那个人（11-18 Steve 说手机局偶尔闪退）
const REJOIN_KEY = 'hang-on:joined';
const REJOIN_MS = 20 * 60 * 1000;
function rememberJoin(code: string): void {
  try {
    sessionStorage.setItem(REJOIN_KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    // 记不住就算了
  }
}
function forgetJoin(): void {
  try {
    sessionStorage.removeItem(REJOIN_KEY);
  } catch {
    // 没有存储
  }
}
function recentJoin(): string | null {
  try {
    const j = JSON.parse(sessionStorage.getItem(REJOIN_KEY) ?? 'null') as { code?: unknown; at?: unknown } | null;
    if (j && typeof j.code === 'string' && CODE_RE.test(j.code) && typeof j.at === 'number' && Date.now() - j.at < REJOIN_MS) return j.code;
  } catch {
    // 坏了就当没有
  }
  return null;
}

function join(code: string, name: string): void {
  rememberJoin(code);
  link?.close();
  view?.reset();
  lastCast = null;
  watch(false);
  link = new PadLink(code, seatId(), name, {
    onStatus: (s) => status(s),
    onConn: (c) => conn(c),
    onFatal: (key) => fatal(key),
    onRoom: (r) => {
      rememberJoin(code);
      if (!!r.hostPlays !== document.body.classList.contains('viewing')) watch(!!r.hostPlays);
      view?.room(r);
    },
    onSnap: (s) => view?.snap(s),
    onCast: (c) => {
      lastCast = c;
      view?.cast(c);
    },
    onAchv: (id) => gotAchv(id),
    onMenu: (m) => {
      lastMenu = m;
      renderMenu();
      if (dlg.open) renderLook();
    },
  });
  // 成就（11-25）：告诉主机这部手机上有哪些，主机只报新的
  link.setAchvs([...myAchvs]);
  link.setLook(look);
  link.setItem(item);
  $('meName').textContent = name;
  $('join').hidden = true;
  $('pad').hidden = false;
  $('turn').hidden = false;
  void goFullscreen();
  void keepAwake();
  renderFs();
  fsFirstTip();
}

function fatalLine(key: FatalKey): string {
  switch (key) {
    case 'noRoom':
      return tr('没有这个房间，再看看房间码。', 'No such room. Check the code again.');
    case 'full':
      return tr('房间满了（最多 6 个人）。可以点下面「只看，当观众」。', 'The room is full (6 players max). Tap "Just watch" below.');
    case 'ended':
      return tableNo ? tr('这局结束了，回到桌上…', 'This game has ended. Back to the table…') : tr('这局结束了。', 'This game has ended.');
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
  const code = link?.code ?? codeIn.value;
  if (CODE_RE.test(code)) $<HTMLAnchorElement>('watchLink').href = `../watch/?code=${code}`;
  if (tableNo && (key === 'ended' || key === 'noRoom')) setTimeout(() => backToTable(code), 2500);
  forgetJoin();
  lastFatal = key;
  lastMenu = null;
  renderMenu();
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
      if (renderView) watchCanvas($<HTMLCanvasElement>('view'));
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
/** 主机发来的菜单（手柄当遥控；红包扭蛋机扭到了哪些也在里面，换装要用，所以放在前面）。 */
let lastMenu: Menu | null = null;
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
      look = stepLook(look, k, Number(b.dataset.d), unlocked());
      renderLook();
      if (k === 'voice') void sfx.previewVoice(look.voice);
    });
  }
}

/** 红包扭蛋机（11-25）里，这台主机上扭到了哪些（菜单带来的；还没连上就是一样都没有）。 */
function unlocked(): ReadonlySet<string> {
  return new Set(lastMenu?.gacha?.got ?? []);
}

function renderLook(): void {
  const open = unlocked();
  for (const k of LOOK_KEYS) {
    const names = LOOK_NAMES[k] as Record<string, { zh: string; en: string }>;
    $(`lbl-${k}`).textContent = pickLang(LOOK_NAMES.label[k]);
    // 戴着别处扭到的：这台主机上还没扭到，电视上画默认的
    const locked = !!lastMenu && isLocked(k, look[k], open);
    $(`val-${k}`).textContent = pickLang(names[look[k]]) + (locked ? tr('（这台还没扭到）', ' (not won here)') : '');
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
  look = randomLook(Math.random, unlocked());
  renderLook();
});
$('lookReset').addEventListener('click', () => {
  look = DEFAULT_LOOK;
  renderLook();
});
renderLook();

// ---------- 道具（A9）----------
let item: ItemId = 'freeze';
try {
  item = cleanItem(localStorage.getItem('hang-on:item'));
} catch {
  // 没有存储
}
const itemDlg = $<HTMLDialogElement>('itemDlg');
const itemList = $('itemList');
for (const id of ITEM_IDS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'iopt';
  b.setAttribute('role', 'radio');
  b.dataset.item = id;
  for (const cls of ['ic', 'nm', 'hint']) {
    const sp = document.createElement('span');
    sp.className = cls;
    b.append(sp);
  }
  b.addEventListener('click', () => {
    item = id;
    sfx.tick();
    renderItem();
  });
  itemList.append(b);
}
function renderItem(): void {
  for (const b of itemList.querySelectorAll<HTMLButtonElement>('.iopt')) {
    const id = b.dataset.item as ItemId;
    b.setAttribute('aria-checked', String(id === item));
    (b.querySelector('.ic') as HTMLElement).textContent = ITEM_ICON[id];
    (b.querySelector('.nm') as HTMLElement).textContent = itemName(id);
    (b.querySelector('.hint') as HTMLElement).textContent = itemHint(id);
  }
  $('itemIcon').textContent = ITEM_ICON[item];
  $('itemSummary').textContent = tr(`道具：${itemName(item)}`, `Item: ${itemName(item)}`);
  $('itemUseIcon').textContent = ITEM_ICON[item];
  $('itemUseName').textContent = itemName(item);
  $('itemUse').setAttribute('aria-label', tr(`用道具：${itemName(item)}`, `Use item: ${itemName(item)}`));
}
function openItems(): void {
  renderItem();
  itemDlg.showModal();
}
/** 关掉对话框就算定了：存起来，告诉主机。 */
itemDlg.addEventListener('close', () => {
  try {
    localStorage.setItem('hang-on:item', item);
  } catch {
    // 记不住就记不住
  }
  renderItem();
  link?.setItem(item);
});
$('itemBtn').addEventListener('click', openItems);
$('itemBtn2').addEventListener('click', openItems);
// 表情（11-25）：顶栏的 😀 打开一排，点一句发给主机，大屏上自己头顶冒出来
emotePicker($<HTMLButtonElement>('emoteBtn'), (e) => link?.emote(e));
// 放屁键（11-25）：两下至少隔 1.5 秒，太快那一下键抖一抖不发
const fartBtn = $<HTMLButtonElement>('fartBtn');
let fartAt = -Infinity;
fartBtn.addEventListener('click', () => {
  const now = performance.now();
  if (now - fartAt < FART_GAP_MS) {
    fartBtn.classList.remove('nope');
    void fartBtn.offsetWidth;
    fartBtn.classList.add('nope');
    return;
  }
  fartAt = now;
  link?.fart();
  buzz(25);
});
$('itemDone').addEventListener('click', () => itemDlg.close());

// ---------- 成就（11-25） ----------
const myAchvs = new Set<AchvId>(loadAchvs());
const achvDlg = $<HTMLDialogElement>('achvDlg');
function renderAchvBtns(): void {
  const n = achvCount(myAchvs);
  $('achvSummary').textContent = tr(`成就 ${n}`, `Achievements ${n}`);
  $('achvBtn2').textContent = `🏆 ${n}`;
}
function openAchvs(): void {
  renderAchvList($('achvList'), myAchvs);
  achvDlg.showModal();
}
/** 主机说新拿到一个：记下来，抖一下；电视局在自己手机上冒一条（手机局的画面上大家都看得到那一条）。 */
function gotAchv(id: AchvId): void {
  if (myAchvs.has(id)) return;
  myAchvs.add(id);
  saveAchvs(myAchvs);
  renderAchvBtns();
  buzz([40, 30, 40]);
  if (!document.body.classList.contains('viewing')) trophyToast($('trophies'), gotText(id));
}
$('achvBtn').addEventListener('click', openAchvs);
$('achvBtn2').addEventListener('click', openAchvs);
// 红包扭蛋机（11-25）：在电视上扭给大家看
$('gachaBtn2').addEventListener('click', () => send({ do: 'gacha' }));
// 护送大元宝（11-26）：开 / 关
$('escortBtn2').addEventListener('click', () => send({ do: 'escort', on: !lastMenu?.escort }));
$('achvDone').addEventListener('click', () => achvDlg.close());
renderAchvBtns();
renderItem();
/** 道具键也连发几帧（和召唤一样）；冷却里主机不算。 */
let itemFrames = 0;
let lastFails = 0;
let tipTimer: ReturnType<typeof setTimeout> | null = null;
function itemTip(text: string): void {
  const el = $('itemTip');
  el.textContent = text;
  el.classList.add('on');
  if (tipTimer) clearTimeout(tipTimer);
  tipTimer = setTimeout(() => el.classList.remove('on'), 1800);
}
addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && !e.repeat && link) itemFrames = 12;
});

// ---------- 手柄当遥控（电视局里电视那边不用碰）----------
function send(c: PadCmd): void {
  link?.command(c);
  buzz(15);
}
const menuDom: ResultsDom = {
  title: $('mTitle'),
  time: $('mTime'),
  par: $('mPar'),
  deaths: $('mDeaths'),
  betrayTitle: $('mBetrayTitle'),
  betrayList: $('mBetrayList'),
  betrayNone: $('mBetrayNone'),
  goalTitle: $('mGoalTitle'),
  goalList: $('mGoalList'),
};
function radio(box: HTMLElement, label: string, on: boolean, click: () => void): void {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-checked', String(on));
  b.textContent = label;
  b.addEventListener('click', click);
  box.append(b);
}
/** 菜单：电视局里大厅、结算时盖在摇杆和抓键那块上；手机局里结算页下面的三个键；玩的时候顶上的「回大厅」。 */
function renderMenu(): void {
  const m = lastMenu;
  const viewing = document.body.classList.contains('viewing');
  const lobby = m?.phase === 'lobby';
  const results = m?.phase === 'results';
  const show = !!m && !viewing && (lobby || results);
  $('menu').hidden = !show;
  pad.classList.toggle('menuing', show);
  $('mLobby').hidden = !lobby;
  $('mResults').hidden = !results;
  $('backBtn').hidden = !m || (m.phase !== 'countdown' && m.phase !== 'playing');
  if (!m) return;
  // 护送大元宝（11-26）：闯关、大团队才有这个开关，按下去是开着
  const eb = $<HTMLButtonElement>('escortBtn2');
  eb.hidden = m.escort === undefined;
  eb.textContent = m.escort ? tr('🪙 护送 ✓', '🪙 Escort ✓') : tr('🪙 护送', '🪙 Escort');
  eb.setAttribute('aria-pressed', String(!!m.escort));
  eb.title = tr('护送大元宝：起点放一个大元宝，扛到终点算数', 'Gold escort: carry the big ingot from the start to the top');
  // 红包扭蛋机（11-25）：「🎰 🧧 12」，红包不够就灰着，扭完了就不出
  const g = m.gacha;
  const gb = $<HTMLButtonElement>('gachaBtn2');
  gb.hidden = !g || g.left === 0;
  if (g) {
    gb.textContent = `🎰 🧧 ${g.coins}`;
    gb.disabled = g.coins < g.price;
    gb.setAttribute('aria-label', tr(`红包扭蛋机：攒了 ${g.coins} 个红包，扭一个要 ${g.price} 个`, `Prize machine: ${g.coins} red envelopes, one spin costs ${g.price}`));
  }
  if (lobby) {
    // 先选单人还是多人（11-13），多人再选玩法，闯关、比谁先最后选难度
    const sides = $('mSides');
    sides.innerHTML = '';
    for (const s of SIDES) radio(sides, sideName(s), s === m.side, () => send({ do: 'side', side: s }));
    $('mModeRow').hidden = m.side !== 'multi';
    const modes = $('mModes');
    modes.innerHTML = '';
    for (const mo of m.modes) radio(modes, modeLabel(mo, m.side), mo === m.mode, () => send({ do: 'mode', mode: mo }));
    const teams = $('mTeams');
    teams.hidden = m.mode !== 'race';
    teams.innerHTML = '';
    radio(teams, tr('各跑各的', 'Free for all'), !m.teams, () => send({ do: 'teams', on: false }));
    radio(teams, tr('甜队对咸队', 'Sweet vs Savory'), m.teams, () => send({ do: 'teams', on: true }));
    $('mTierRow').hidden = !m.tiered;
    const tiers = $('mTiers');
    tiers.innerHTML = '';
    for (const t of TIERS) radio(tiers, tierName(t), t === m.tier, () => send({ do: 'tier', tier: t }));
    $('mLevel').textContent = `${m.level.n}. ${pickLang(m.level.name)}${m.level.stars ? ` ${m.level.stars}` : ''}`;
    $('mTeach').textContent = pickLang(m.level.teach);
    $<HTMLButtonElement>('mPrev').disabled = m.level.n <= 1;
    $<HTMLButtonElement>('mNext').disabled = m.level.n >= m.level.of;
    const notReady = notReadyText(m.players, m.side, m.mode);
    $('mLine').textContent = notReady
      ? pickLang(notReady)
      : tr(`${m.players} 个人，谁按开始都行。`, `${m.players} ${m.players === 1 ? 'player' : 'players'}. Anyone can press Start.`);
    $<HTMLButtonElement>('mStart').disabled = !m.canStart;
  }
  const names = m.names ?? [];
  if (results && m.results) renderResults(menuDom, m.results, (i) => names[i]?.name || `P${i + 1}`, (i) => names[i]?.color ?? '#fff', m.par);
  // 下一关（坐不住是换个场地）、再来一次（比谁先、坐不住是再来一局）、回大厅：电视局的菜单和手机局的结算页都有
  const nextText = m.mode === 'rain' ? tr('接着闯关', 'Back to climbing') : m.mode === 'last' || m.mode === 'gold' ? tr('换个场地', 'Next arena') : tr('下一关', 'Next level');
  const againText = m.mode === 'climb' || m.mode === 'team' ? tr('再来一次', 'Play again') : tr('再来一局', 'Rematch');
  for (const id of ['mNextLevel', 'vNextLevel']) {
    $(id).hidden = !m.hasNext;
    $(id).textContent = nextText;
  }
  for (const id of ['mAgain', 'vAgain']) {
    $(id).textContent = againText;
    // 红包雨（11-26）只下一次
    $(id).hidden = m.mode === 'rain';
  }
  // 红包雨（11-26）：这一关红包全拿到了，结算页多一个「彩蛋：红包雨」
  for (const id of ['mRain', 'vRain']) $(id).hidden = !m.rain;
  // 精彩回放（11-26，电视局）：这一局录下了一段，点了在电视上慢放
  const rp = $('mReplay');
  rp.hidden = !m.replay;
  if (m.replay) rp.textContent = tr(`▶ 精彩回放：${m.replay.zh}`, `▶ Replay: ${m.replay.en}`);
}
$('mPrev').addEventListener('click', () => send({ do: 'level', d: -1 }));
$('mNext').addEventListener('click', () => send({ do: 'level', d: 1 }));
$('mStart').addEventListener('click', () => send({ do: 'start' }));
for (const pre of ['m', 'v']) {
  $(`${pre}NextLevel`).addEventListener('click', () => send({ do: 'next' }));
  $(`${pre}Again`).addEventListener('click', () => send({ do: 'again' }));
  $(`${pre}ToLobby`).addEventListener('click', () => send({ do: 'lobby' }));
  $(`${pre}Rain`).addEventListener('click', () => send({ do: 'rain' }));
}
$('mReplay').addEventListener('click', () => send({ do: 'replay' }));
// 联机桌（A15）：回桌子。加入那页按一下就走；玩的时候顶栏那个按两下（第一下变红，3 秒内再按一下），这局照玩
$('tableBtn').hidden = $('tableBtn2').hidden = !tableNo;
$('tableBtn').addEventListener('click', () => backToTable());
const tableBtn2 = $<HTMLButtonElement>('tableBtn2');
let tableArmed: ReturnType<typeof setTimeout> | null = null;
tableBtn2.addEventListener('click', () => {
  if (tableArmed) return backToTable();
  tableBtn2.classList.add('armed');
  tableBtn2.textContent = tr('再按一下回桌上', 'Tap again for the table');
  tableArmed = setTimeout(() => {
    tableArmed = null;
    tableBtn2.classList.remove('armed');
    tableBtn2.textContent = tr('回桌上', 'Table');
  }, 3000);
});
// 玩的时候回大厅：按两下才算（第一下变红，3 秒内再按一下）
const backBtn = $<HTMLButtonElement>('backBtn');
let backArmedUntil = 0;
let backTimer: ReturnType<typeof setTimeout> | null = null;
function disarmBack(): void {
  backArmedUntil = 0;
  backBtn.classList.remove('armed');
  backBtn.textContent = tr('回大厅', 'Lobby');
}
backBtn.addEventListener('click', () => {
  if (performance.now() < backArmedUntil) {
    disarmBack();
    send({ do: 'lobby' });
    return;
  }
  backArmedUntil = performance.now() + 3000;
  backBtn.classList.add('armed');
  backBtn.textContent = tr('再按一下回大厅', 'Tap again for lobby');
  if (backTimer) clearTimeout(backTimer);
  backTimer = setTimeout(disarmBack, 3000);
});

// ---------- 全屏：安卓、平板点了就全屏；iPhone 的 Safari 不让网页全屏，点了说怎么弄 ----------
type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null };
const fsDoc = document as FsDoc;
const fsAble = !!(document.fullscreenEnabled || fsDoc.webkitFullscreenEnabled);
const standalone =
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const touchy = matchMedia('(pointer: coarse)').matches;
function renderFs(): void {
  const full = !!(document.fullscreenElement || fsDoc.webkitFullscreenElement);
  $('fsBtn').hidden = !touchy || standalone || full || $('pad').hidden;
}
$('fsBtn').addEventListener('click', () => {
  if (fsAble) void goFullscreen();
  else $<HTMLDialogElement>('fsDlg').showModal();
});
$('fsDone').addEventListener('click', () => $<HTMLDialogElement>('fsDlg').close());
document.addEventListener('fullscreenchange', renderFs);
document.addEventListener('webkitfullscreenchange', renderFs);
/** iPhone 上第一次进来提示一次：想全屏点上面的「全屏」。 */
function fsFirstTip(): void {
  if (fsAble || standalone || !touchy) return;
  try {
    if (localStorage.getItem('hang-on:fs-tip')) return;
    localStorage.setItem('hang-on:fs-tip', '1');
  } catch {
    // 记不住就每次都提示
  }
  itemTip(tr('想全屏？点上面的「全屏」看怎么弄', 'Want full screen? Tap Full screen at the top'));
}

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
  summonBtn.hidden = s.mode === 'last' || s.mode === 'gold' || (s.mode === 'race' && s.team === undefined);
  summonBtn.disabled = !(s.phase === 'playing' && (s.teamDead ?? 0) > 0);
  // 道具键：这个玩法有道具才出；冷却着、正在起作用的时候按不了
  const use = $<HTMLButtonElement>('itemUse');
  use.hidden = s.item === undefined;
  if (s.item !== undefined) {
    const ready = Math.max(0, Math.min(1, s.itemReady ?? 1));
    use.style.setProperty('--ready', String(ready));
    use.disabled = s.phase !== 'playing' || ready < 1 || !!s.itemOn;
    use.classList.toggle('on', !!s.itemOn);
  }
  if ((s.itemFails ?? 0) > lastFails && s.item === 'noodle') {
    itemTip(tr('拉面要先抓住墙或台子', 'Grab a wall or ledge first, then drop the noodle'));
    buzz(15);
  }
  lastFails = s.itemFails ?? 0;
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
  el.className = c.socket ? 'conn ok' : 'conn bad';
  if (c.socket) $('path').textContent = c.direct ? tr('直连', 'Direct') : tr('绕路中', 'Relayed');
  // 窄手机上直连时不写「直连」，顶栏省出 💨 的地方（绕路时照写）
  $('path').classList.toggle('direct', c.socket && c.direct);
}
renderConn();

onLang(() => {
  renderLook();
  renderItem();
  renderAchvBtns();
  renderMenu();
  disarmBack();
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
const controls = bindControls(pad);
const { aim, grab } = controls;

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
    if (controls.takeItem()) {
      itemFrames = 12;
      buzz(20);
    }
    // 道具和召唤同时按：先发道具，召唤跟在后面
    const act = itemFrames > 0 ? 'item' : actFrames > 0 ? 'summon' : undefined;
    if (itemFrames > 0) itemFrames--;
    else if (actFrames > 0) actFrames--;
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
  set(input: { ax?: number; ay?: number; gl?: boolean; gr?: boolean; summon?: boolean; item?: boolean }) {
    if (input.ax !== undefined) aim.x = input.ax;
    if (input.ay !== undefined) aim.y = input.ay;
    if (input.gl !== undefined) grab.l = input.gl;
    if (input.gr !== undefined) grab.r = input.gr;
    if (input.summon) actFrames = 12;
    if (input.item) itemFrames = 12;
  },
  /** 换道具（检查脚本用，和在对话框里点一样）。 */
  setItem(id: ItemId) {
    item = cleanItem(id);
    renderItem();
    link?.setItem(item);
  },
  get item() {
    return item;
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
else {
  // 系统把页面重新打开了：刚在这个房间里就直接回去（见 recentJoin），不用再点「进房间」
  const again = recentJoin();
  const asked = codeIn.value.trim().toUpperCase();
  if (again && (!asked || asked === again)) {
    codeIn.value = again;
    join(again, nameIn.value.trim() || tr('糯米团', 'Dumpling'));
  }
}

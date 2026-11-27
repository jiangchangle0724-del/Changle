/**
 * 闪退自动记录（11-25，14 样的第 3 样）：页面出了事自己报给房间服务器，真手机上的毛病不用人说就看得到。
 * 照到此一游的那一套（games/been-there 的 reports.ts）做的，多了两种：画面没了（WebGL 丢了，屏幕黑掉）、
 * 上次在人眼前没好好关就重开了（手机把页面杀了，iPhone 内存不够时常见）。
 *
 * 不记任何个人的东西：不记名字、房间码、地址、手机的编号；浏览器只记牌子和大版本。
 * 一种毛病一条（多少次、从什么时候起、在哪种屏幕、哪个阶段、哪一关、几个人、哪种浏览器、哪一版），
 * GET /hang-on/api/reports 汇总（`npm run reports` 打出来）。
 */
import type { GameMode } from '../physics/world';

export type ReportKind = 'error' | 'rejection' | 'freeze' | 'offline' | 'webgl' | 'killed';
const KINDS: readonly ReportKind[] = ['error', 'rejection', 'freeze', 'offline', 'webgl', 'killed'];
/** tv：电视局的大屏；phone：手机局房主的手机；pad：电视局的手柄；padview：手机局里别人的手机（手柄加画面）。 */
export type ReportScreen = 'tv' | 'phone' | 'pad' | 'padview';
const SCREENS: readonly ReportScreen[] = ['tv', 'phone', 'pad', 'padview'];
export type ReportPhase = 'lobby' | 'countdown' | 'playing' | 'results';
const PHASES: readonly ReportPhase[] = ['lobby', 'countdown', 'playing', 'results'];
const MODES: readonly GameMode[] = ['climb', 'team', 'race', 'last', 'gold'];

/** 页面发来的（POST /hang-on/api/report，JSON 文字）。 */
export interface ReportIn {
  kind: ReportKind;
  /** 错误的话；卡住、断线、画面没了、被杀了说的是什么。 */
  msg: string;
  /** 栈里游戏自己的那几行（文件:行:列），新的在前。 */
  stack?: string;
  /** 卡了、断了多久（毫秒）。 */
  ms?: number;
  screen: ReportScreen;
  phase?: ReportPhase;
  /** 哪一关（table-01 这种）。 */
  level?: string;
  /** 几个人。 */
  players?: number;
  mode?: GameMode;
  /** 页面是从哪个提交做出来的（7 位），或者 dev。 */
  build?: string;
  lang?: 'zh' | 'en';
}

/** 一种毛病，服务器记的样子。 */
export interface ReportEntry {
  kind: ReportKind;
  msg: string;
  /** 最近那次栈的第一行（「host-abc.js:1:2345」）。 */
  where: string;
  stack: string;
  count: number;
  first: number;
  last: number;
  /** 卡得、断得最久的一次（毫秒）。 */
  longest?: number;
  screens: Record<string, number>;
  browsers: Record<string, number>;
  builds: Record<string, number>;
  phases: Record<string, number>;
  levels: Record<string, number>;
  players: Record<string, number>;
}

export interface ReportSummary {
  now: number;
  /** 一共记了几次。 */
  total: number;
  /** 最近 30 个有报的日子，每天几次。 */
  days: { day: string; n: number }[];
  /** 最近的 60 种毛病，新的在前（栈截到 4 行）。 */
  problems: ReportEntry[];
}

/** 记的东西放哪（Durable Object 的存储；测试里是个 Map）。 */
export interface ReportStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(opts: { prefix: string }): Promise<Map<string, T>>;
}

/** 最多记这么多种毛病，最久没再出的先去掉。 */
export const MAX_ENTRIES = 200;
/** 每样统计记前 12 个名字，再多的算「other」。 */
const MAX_NAMES = 12;
const DAYS_KEPT = 60;
const MSG_MAX = 300;
const STACK_MAX = 1200;

/**
 * 报里不能有的：地址的问号后面（房间的 WebSocket 地址带着手柄的编号、名字和主机的钥匙）、地址的域名、
 * 路径里的房间码、300 个字以后的、控制字符。
 */
export function scrub(text: string, max: number): string {
  return text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/(https?|wss?):\/\/[^\s/)]+/g, '')
    .replace(/\?[\w%.-]+=[^\s):]*/g, '')
    .replace(/\/(r|rooms)\/[A-Za-z0-9]{4}\b/g, '/$1/____')
    .trim()
    .slice(0, max);
}

/** 收拾一份报：只要上面那几样，每样收拾过、截短；不是报就是 null。 */
export function readReport(body: unknown): ReportIn | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const kind = KINDS.find((k) => k === b.kind);
  const screen = SCREENS.find((s) => s === b.screen);
  if (!kind || !screen || typeof b.msg !== 'string') return null;
  const msg = scrub(b.msg, MSG_MAX);
  if (!msg) return null;
  const out: ReportIn = { kind, msg, screen };
  if (typeof b.stack === 'string') {
    const stack = scrub(b.stack, STACK_MAX);
    if (stack) out.stack = stack;
  }
  if (typeof b.ms === 'number' && Number.isFinite(b.ms) && b.ms > 0) out.ms = Math.min(3_600_000, Math.round(b.ms));
  const phase = PHASES.find((p) => p === b.phase);
  if (phase) out.phase = phase;
  if (typeof b.level === 'string' && /^[a-z]{2,12}-\d{2}$/.test(b.level)) out.level = b.level;
  if (typeof b.players === 'number' && Number.isInteger(b.players) && b.players >= 1 && b.players <= 12) out.players = b.players;
  const mode = MODES.find((m) => m === b.mode);
  if (mode) out.mode = mode;
  if (typeof b.build === 'string' && /^[\w.-]{1,40}$/.test(b.build)) out.build = b.build;
  if (b.lang === 'zh' || b.lang === 'en') out.lang = b.lang;
  return out;
}

const num = (re: RegExp, s: string): string | undefined => re.exec(s)?.[1];

/** 浏览器的牌子和大版本（「iOS 18 Safari 18」「Android 14 Chrome 130」「iOS 17 WeChat 8」）。 */
export function browserOf(ua: string): string {
  const ios = /iPhone|iPad|iPod/.test(ua);
  const os = ios
    ? `iOS ${num(/OS (\d+)[_.]/, ua) ?? '?'}`
    : /Android/.test(ua)
      ? `Android ${num(/Android (\d+)/, ua) ?? '?'}`
      : /CrOS/.test(ua)
        ? 'ChromeOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : '?';
  const apps: [string, RegExp][] = [
    ['WeChat', /MicroMessenger\/(\d+)/],
    ['Edge', /Edg(?:A|iOS)?\/(\d+)/],
    ['Samsung', /SamsungBrowser\/(\d+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/],
  ];
  for (const [name, re] of apps) {
    const v = num(re, ua);
    if (v) return `${os} ${name} ${v}`;
  }
  return `${os} ?`;
}

/** 栈的第一行，不带文件夹（「host-abc.js:1:2345」）。 */
export const topFrame = (stack: string | undefined): string =>
  (stack?.split('\n')[0] ?? '')
    .replace(/^.*\//, '')
    .replace(/\)$/, '')
    .slice(0, 120);

/**
 * 一份报算哪种毛病：同一个文件出的同一句话是一种（每一版的列号会变，不算；话里的数字也不算）。
 * 卡住按屏幕和阶段各算一种，断线按屏幕，画面没了、被杀了按屏幕和阶段。
 */
export function signature(r: ReportIn): string {
  if (r.kind === 'freeze' || r.kind === 'webgl' || r.kind === 'killed') return `${r.kind}|${r.screen}|${r.phase ?? '-'}`;
  if (r.kind === 'offline') return `offline|${r.screen}`;
  const file = topFrame(r.stack)
    .replace(/:\d+(:\d+)?$/, '')
    .replace(/-[\w-]{8}\.js$/, '.js');
  return `${r.kind}|${r.msg.replace(/\d+/g, '#').slice(0, 160)}|${file}`;
}

/** 一种毛病的短编号（FNV-1a，32 位）。 */
export function keyOf(sig: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < sig.length; i++) {
    h ^= sig.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `sig:${h.toString(16).padStart(8, '0')}`;
}

function tally(names: Record<string, number>, name: string): void {
  const k = name in names || Object.keys(names).length < MAX_NAMES ? name : 'other';
  names[k] = (names[k] ?? 0) + 1;
}

/** 记一份。 */
export async function keepReport(store: ReportStore, r: ReportIn, browser: string, now: number): Promise<void> {
  const key = keyOf(signature(r));
  const old = await store.get<ReportEntry>(key);
  const e: ReportEntry = old ?? {
    kind: r.kind,
    msg: r.msg,
    where: '',
    stack: '',
    count: 0,
    first: now,
    last: now,
    screens: {},
    browsers: {},
    builds: {},
    phases: {},
    levels: {},
    players: {},
  };
  e.count += 1;
  e.last = now;
  e.msg = r.msg;
  if (r.stack) {
    e.stack = r.stack;
    e.where = topFrame(r.stack);
  }
  if (r.ms) e.longest = Math.max(e.longest ?? 0, r.ms);
  tally(e.screens, r.screen);
  tally(e.browsers, browser);
  tally(e.builds, r.build ?? '?');
  tally(e.phases, r.phase ?? '-');
  tally((e.levels ??= {}), r.level ?? '-');
  tally((e.players ??= {}), r.players ? String(r.players) : '-');
  await store.put(key, e);
  const day = `day:${new Date(now).toISOString().slice(0, 10)}`;
  await store.put(day, ((await store.get<number>(day)) ?? 0) + 1);
  if (!old) await prune(store);
}

async function prune(store: ReportStore): Promise<void> {
  const entries = [...(await store.list<ReportEntry>({ prefix: 'sig:' })).entries()];
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => a[1].last - b[1].last);
    for (const [key] of entries.slice(0, entries.length - MAX_ENTRIES)) await store.delete(key);
  }
  const days = [...(await store.list<number>({ prefix: 'day:' })).keys()].sort();
  for (const key of days.slice(0, Math.max(0, days.length - DAYS_KEPT))) await store.delete(key);
}

/** GET /hang-on/api/reports 答的。 */
export async function reportSummary(store: ReportStore, now: number): Promise<ReportSummary> {
  const entries = [...(await store.list<ReportEntry>({ prefix: 'sig:' })).values()].sort((a, b) => b.last - a.last);
  const days = [...(await store.list<number>({ prefix: 'day:' })).entries()]
    .map(([key, n]) => ({ day: key.slice(4), n }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-30);
  return {
    now,
    total: entries.reduce((sum, e) => sum + e.count, 0),
    days,
    problems: entries.slice(0, 60).map((e) => ({ ...e, stack: e.stack.split('\n').slice(0, 4).join('\n') })),
  };
}

/**
 * 同一个地址 10 分钟最多收 30 份（只记在这一份 Worker 的内存里，不存），卡在圈里的页面、乱发的人塞不满。
 */
export function makeLimiter(max = 30, windowMs = 10 * 60_000): (who: string, now: number) => boolean {
  const seen = new Map<string, { n: number; until: number }>();
  return (who, now) => {
    if (seen.size > 5000) seen.clear();
    const s = seen.get(who);
    if (!s || now > s.until) {
      seen.set(who, { n: 1, until: now + windowMs });
      return true;
    }
    s.n += 1;
    return s.n <= max;
  };
}

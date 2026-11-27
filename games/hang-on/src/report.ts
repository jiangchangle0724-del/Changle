/**
 * 闪退自动记录（11-25）：这个页面出了事，自己告诉房间服务器（POST /hang-on/api/report）。
 * 报的是：游戏自己代码里的错、没人接的 promise、页面卡住好几秒、在人眼前连不上房间好久、
 * 画面没了（WebGL 丢了，屏幕黑掉）、上次在人眼前没好好关就重开了（手机把页面杀了）。
 * 主机页一帧里出的错（接住了，接着画下一帧）用 reportError() 报。
 *
 * 不报个人的东西（src/server/reports.ts 说服务器记什么）：话、栈里游戏自己的那几行、哪种屏幕、哪个阶段、
 * 哪一关、几个人、哪一版。一个页面最多 8 份，一种毛病一份。只在游戏自己的页面上报（不是本地文件、不是测试）。
 */
import type { GameMode } from './physics/world';
import type { ReportIn, ReportKind, ReportPhase, ReportScreen } from './server/reports';

declare const __BUILD__: string;

/** 页面这会儿在干什么：报的时候读。 */
export interface ReportContext {
  screen: ReportScreen;
  phase?: ReportPhase;
  lang?: 'zh' | 'en';
  /** 跟房间连着没有。 */
  online: boolean;
  level?: string;
  players?: number;
  mode?: GameMode;
  /** 这一局里大家的名字：不发，报之前从话和栈里抹掉（万一哪句错误里带着名字）。 */
  names?: string[];
}

const BASE = '/hang-on';
const MAX_REPORTS = 8;
/** 每秒一下的心跳晚到这么多（毫秒），页面又一直在人眼前：卡住了。 */
export const FREEZE_MS = 6_000;
/** 比这还久是电脑合上盖子睡了，不算卡。 */
const ASLEEP_MS = 60_000;
/** 在人眼前、手机有网，连不上房间这么久（毫秒）：断线。 */
export const OFFLINE_MS = 30_000;
/** 这一页还活着的记号（sessionStorage，一个标签页一份）：好好关的时候擦掉，被杀了就留着。 */
export const ALIVE_KEY = 'hang-on:alive';
/** 记号比这还旧就不算了（隔天才回来的）。 */
const ALIVE_MAX_MS = 24 * 3600_000;

let installed = false;
let context: () => ReportContext = () => ({ screen: 'tv', online: true });
let sent = 0;
const sentOnce = new Set<string>();

/** 这一页的文件在哪：别人的脚本（插件、浏览器自己的）出的错不算。 */
const ours = (file: string): boolean => !!file && file.startsWith(`${location.origin}${BASE}/`);

/** 栈里游戏自己的文件那几行，不带域名和问号后面，新的在前。 */
export function ownStack(stack: string | undefined): string {
  if (!stack) return '';
  return (
    stack
      .split('\n')
      // （一帧：Chrome 是「at f (…)」，Safari、Firefox 是「f@…」；错误的那句话本身不要）
      .filter((line) => /^\s*at\s|@/.test(line) && line.includes(`${BASE}/`))
      .map((line) =>
        line
          .trim()
          .replace(/(https?):\/\/[^/\s)]+/g, '')
          .replace(/\?[^\s):]*/g, ''),
      )
      .slice(0, 6)
      .join('\n')
  );
}

/** 这一页报不报：游戏自己的页面，走网络打开的。 */
export function reportable(): boolean {
  return typeof location !== 'undefined' && /^https?:$/.test(location.protocol) && location.pathname.startsWith(`${BASE}/`) && typeof navigator !== 'undefined';
}

function now(): ReportContext {
  try {
    return context();
  } catch {
    return { screen: 'tv', online: true };
  }
}

/** 发一份。ctx 不给就用页面这会儿的。 */
function send(kind: ReportKind, msg: string, stack: string, ms?: number, ctx: ReportContext = now()): void {
  if (sent >= MAX_REPORTS) return;
  const once = `${kind}|${msg.slice(0, 120)}|${stack.split('\n')[0] ?? ''}`;
  if (sentOnce.has(once)) return;
  sentOnce.add(once);
  sent += 1;
  // 名字抹掉（两个字以上的；一个字的抹了话就乱了）
  const hide = (text: string): string => (ctx.names ?? []).filter((n) => n.trim().length >= 2).reduce((t, n) => t.split(n).join('…'), text);
  const body: ReportIn = {
    kind,
    msg: hide(msg).slice(0, 300) || kind,
    stack: hide(stack).slice(0, 1200) || undefined,
    ms,
    screen: ctx.screen,
    phase: ctx.phase,
    level: ctx.level,
    players: ctx.players,
    mode: ctx.mode,
    build: typeof __BUILD__ === 'string' ? __BUILD__ : 'dev',
    lang: ctx.lang,
  };
  const text = JSON.stringify(body);
  const url = `${BASE}/api/report`;
  try {
    // 当文字发（text/plain，简单请求，页面正在关也发得出去）
    if (navigator.sendBeacon?.(url, text)) return;
  } catch {
    // 下面用 fetch
  }
  fetch(url, { method: 'POST', body: text, keepalive: true, headers: { 'content-type': 'text/plain' } }).catch(() => {});
}

/** 一帧里接住的错（主机页接着画下一帧，不然画面就停了）：也报，一种一份。 */
export function reportError(err: unknown): void {
  if (!installed) return;
  const e = err instanceof Error ? err : null;
  send('error', e ? `${e.name}: ${e.message}` : String(err), ownStack(e?.stack));
}

/** 盯着画面的 canvas：WebGL 丢了（内存不够时手机会收走，屏幕黑掉）就报。 */
export function watchCanvas(canvas: HTMLCanvasElement): void {
  if (!installed) return;
  canvas.addEventListener('webglcontextlost', () => send('webgl', 'WebGL context lost', ''));
}

/** 开始听。ctx 说页面这会儿在干什么。 */
export function installReports(ctx: () => ReportContext): void {
  context = ctx;
  if (installed || !reportable()) return;
  installed = true;

  window.addEventListener('error', (e) => {
    if (!ours(e.filename)) return;
    // （浏览器说排版晚了一帧：没事）
    if (/ResizeObserver loop/.test(e.message)) return;
    const err = e.error as { stack?: string } | undefined;
    send('error', e.message || String(e.error), ownStack(err?.stack) || `${e.filename.replace(/^.*\//, '')}:${e.lineno}:${e.colno}`);
  });

  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    const err = r instanceof Error ? r : null;
    const stack = ownStack(err?.stack);
    // 别人代码里的错（栈里没有游戏自己的一行）由他们自己报
    if (err && !stack && !(typeof DOMException !== 'undefined' && r instanceof DOMException)) return;
    const msg = err ? `${err.name}: ${err.message}` : typeof r === 'string' ? r : 'unhandled rejection';
    send('rejection', msg, stack);
  });

  // 上次在人眼前没好好关：标签页里还留着记号，那一页是被杀的（手机内存不够，或者浏览器崩了）
  try {
    const raw = sessionStorage.getItem(ALIVE_KEY);
    if (raw) {
      const mark = JSON.parse(raw) as { t?: number; seen?: boolean; ctx?: ReportContext };
      const age = Date.now() - (mark.t ?? 0);
      if (mark.seen && mark.ctx && age >= 0 && age < ALIVE_MAX_MS) send('killed', 'page died in front of the player and was opened again', '', undefined, mark.ctx);
    }
  } catch {
    // 存不了、读不出：不报
  }
  const mark = (seen: boolean): void => {
    try {
      // 名字不留（被杀了的那份报里只有一句固定的话，用不着抹）
      const { names: _names, ...ctx } = now();
      sessionStorage.setItem(ALIVE_KEY, JSON.stringify({ t: Date.now(), seen, ctx }));
    } catch {
      // 存不了就不记
    }
  };
  // 好好关（关标签页、刷新、换页面、进后退缓存）：擦掉记号
  window.addEventListener('pagehide', () => {
    try {
      sessionStorage.removeItem(ALIVE_KEY);
    } catch {
      // 没关系
    }
  });

  // 心跳：每秒一下。在人眼前、一直有焦点，晚了 6 秒以上就是卡住了。藏起来的（锁屏、换应用）不算，醒过来也不算；
  // 有东西盖在上面也不算（iPhone 的控制中心会停住页面的计时器）。
  let last = performance.now();
  let offline = 0;
  let away = false;
  let beats = 0;
  const reset = (): void => {
    last = performance.now();
  };
  const seen = (): boolean => document.visibilityState === 'visible';
  document.addEventListener('visibilitychange', () => {
    reset();
    mark(seen());
  });
  window.addEventListener('pageshow', () => {
    reset();
    mark(seen());
  });
  document.addEventListener('resume', reset);
  window.addEventListener('blur', () => {
    away = true;
  });
  window.addEventListener('focus', () => {
    away = false;
    reset();
  });
  mark(seen());
  setInterval(() => {
    const t = performance.now();
    const gap = t - last;
    last = t;
    if (++beats % 2 === 0) mark(seen());
    if (!seen() || away) return;
    if (gap > FREEZE_MS && gap < ASLEEP_MS) send('freeze', `frozen ${Math.round(gap / 1000)} s`, '', Math.round(gap));
    const c = now();
    if (!c.online && navigator.onLine !== false) offline += Math.min(gap, 2_000);
    else if (c.online) {
      // 好久连不上，又连上了：说断了多久
      if (offline >= OFFLINE_MS) send('offline', `offline ${Math.round(offline / 1000)} s`, '', Math.round(offline));
      offline = 0;
    }
  }, 1_000);
}

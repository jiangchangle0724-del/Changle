/**
 * 每日一关和排行榜（11-26，14 样的第 13 样）：每天（温哥华的日期）大家玩同一关，闯关到顶的成绩交给房间服务器，
 * 当天这一关的单人榜、多人榜各排前 10（一台主机算一队，一天留它最好的那次）。
 * 主机页和房间服务器都用这个文件：只有日子、挑第几关、收拾成绩，不碰 DOM、不读关卡（关卡怎么挑在 `src/levels.ts` 的 `dailyLevel`）。
 * 契约见 CONTRACTS.md「每日一关契约」。
 */
export type BoardSide = 'solo' | 'multi';

/** 主机交给服务器的一份成绩（POST /hang-on/api/daily）。 */
export interface DailyRun {
  /** 温哥华的日期（2026-11-26）：交的是哪天的每日一关。 */
  day: string;
  /** 哪一关（table-03）。 */
  level: string;
  /** 几个人（1 到 6）：1 个人进单人榜，2 个以上进多人榜。 */
  players: number;
  /** 到顶用了几秒（模拟的秒，「慢一点」不影响）。 */
  seconds: number;
  /** 大家一共摔了几次。 */
  falls: number;
  /** 名字（座位顺序），一个人最多 NAME_MAX 个字。 */
  names: string[];
  /** 有人开着长辈小孩模式（榜上名字后面一棵小苗）。 */
  assist?: boolean;
  /** 这台主机的随机号（`hang-on:board-id`）：同一台一天一榜只留最好的一次；不给别人看。 */
  who: string;
}

/** 榜上的一条（GET 给出去的样子，不带 who）。me：是问的这台主机的。 */
export interface BoardEntry {
  names: string[];
  players: number;
  seconds: number;
  falls: number;
  assist?: boolean;
  /** 什么时候交的（毫秒）。 */
  at: number;
  me?: boolean;
}

/** 一天一关的两个榜（各前 SHOW 名）；count：各有几队；mine：问的这台主机排第几（没上榜是 null）。 */
export interface Board {
  day: string;
  level: string;
  solo: BoardEntry[];
  multi: BoardEntry[];
  count: { solo: number; multi: number };
  mine: { solo: number | null; multi: number | null };
}

/** 交了成绩以后服务器回的：进的哪一榜、这台主机排第几（掉出前 KEEP 名是 null）、一共几队、这次是不是这台主机今天最好的。 */
export interface DailyAnswer {
  side: BoardSide;
  rank: number | null;
  of: number;
  best: boolean;
}

/** 名字最多几个字（和手柄上起名字一样长）。 */
export const NAME_MAX = 12;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const LEVEL_RE = /^[a-z]+-\d{2}$/;
export const WHO_RE = /^[A-Za-z0-9]{8,32}$/;

export const sideOf = (players: number): BoardSide => (players > 1 ? 'multi' : 'solo');

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Vancouver', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 温哥华的日期「2026-11-26」：每日一关按这个换，排行榜按这个分天。 */
export function vancouverDay(at: number): string {
  const p = Object.fromEntries(dayFmt.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** 一个日子是第几天（从 1970-01-01 数）。 */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * 这一天挑一串里的第几关（n 关）：每天往后跳一个和 n 互质的步子，连着 n 天每关轮到一次，难易混着来。
 */
export function dailyIndex(day: string, n: number): number {
  if (n <= 1) return 0;
  let step = 7;
  while (gcd(step, n) !== 1) step++;
  return (((dayNumber(day) * step) % n) + n) % n;
}

/** 收拾一个名字：去掉控制字符、换行、看不见的字，前后空白，最多 NAME_MAX 个字（按字数，不切坏 emoji）。 */
export function cleanName(x: unknown): string {
  const s = typeof x === 'string' ? x : '';
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g, '').trim();
  return [...t].slice(0, NAME_MAX).join('').trim();
}

/** 收拾主机交来的成绩：日子只收温哥华的今天、昨天（半夜前后交的）；不对的整个不要。 */
export function cleanRun(body: unknown, now: number): DailyRun | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const day = typeof b.day === 'string' && DAY_RE.test(b.day) ? b.day : null;
  if (!day || (day !== vancouverDay(now) && day !== vancouverDay(now - 86_400_000))) return null;
  const level = typeof b.level === 'string' && LEVEL_RE.test(b.level) ? b.level : null;
  const who = typeof b.who === 'string' && WHO_RE.test(b.who) ? b.who : null;
  const players = b.players;
  const seconds = b.seconds;
  const falls = b.falls;
  if (!level || !who) return null;
  if (typeof players !== 'number' || !Number.isInteger(players) || players < 1 || players > 6) return null;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 5 || seconds > 3600) return null;
  if (typeof falls !== 'number' || !Number.isInteger(falls) || falls < 0 || falls > 999) return null;
  const given = Array.isArray(b.names) ? b.names.slice(0, players) : [];
  const names = Array.from({ length: players }, (_, i) => cleanName(given[i]) || `P${i + 1}`);
  return { day, level, players, seconds: Math.round(seconds * 100) / 100, falls, names, ...(b.assist === true ? { assist: true } : {}), who };
}

/** 排榜：用时短的在前，一样的摔得少的在前，再一样的先交的在前。 */
export function better(a: Pick<BoardEntry, 'seconds' | 'falls' | 'at'>, b: Pick<BoardEntry, 'seconds' | 'falls' | 'at'>): number {
  return a.seconds - b.seconds || a.falls - b.falls || a.at - b.at;
}

/** 榜上的用时：「1:23.4」，不到一分钟「45.2 秒 / 45.2 s」由调用的地方加。 */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return m ? `${m}:${s.toFixed(1).padStart(4, '0')}` : s.toFixed(1);
}

/**
 * 每日一关的排行榜（11-26，14 样的第 13 样）：一天一关两个榜（单人、多人），放在房间服务器的一个盒子里（Durable Object `HangOnBoard`）。
 * 一台主机（`who`）一天一榜只留最好的那次；一榜最多留 KEEP 队，给出去前 SHOW 名；只留最近 KEEP_DAYS 天。
 * 名字是玩家自己起的，只收拾（控制字符、长短），不审；不记地址、手机编号。契约见 CONTRACTS.md「每日一关契约」。
 */
import { better, dayNumber, sideOf, type Board, type BoardEntry, type BoardSide, type DailyAnswer, type DailyRun } from '../daily';

/** 记的东西放哪（Durable Object 的存储；测试里是个 Map）。 */
export interface BoardStore {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list<T>(opts: { prefix: string }): Promise<Map<string, T>>;
}

/** 存着的一条：比给出去的多一个 who（哪台主机）。 */
interface Kept extends BoardEntry {
  who: string;
}

/** 一榜最多留几队。 */
export const KEEP = 50;
/** 给出去前几名。 */
export const SHOW = 10;
/** 留最近几天。 */
export const KEEP_DAYS = 14;

const keyOf = (day: string, level: string, side: BoardSide): string => `b:${day}:${level}:${side}`;

/** 交一份成绩（已经 `cleanRun` 收拾过）：这台主机今天这一榜没有更好的就记下，排好，截到 KEEP 队。 */
export async function keepRun(store: BoardStore, run: DailyRun, now: number): Promise<DailyAnswer> {
  const side = sideOf(run.players);
  const key = keyOf(run.day, run.level, side);
  const list = (await store.get<Kept[]>(key)) ?? [];
  const entry: Kept = { names: run.names, players: run.players, seconds: run.seconds, falls: run.falls, ...(run.assist ? { assist: true } : {}), at: now, who: run.who };
  const old = list.findIndex((e) => e.who === run.who);
  const best = old < 0 || better(entry, list[old] as Kept) < 0;
  if (best) {
    if (old >= 0) list.splice(old, 1);
    list.push(entry);
    list.sort(better);
    if (list.length > KEEP) list.length = KEEP;
    await store.put(key, list);
  }
  await sweep(store, run.day);
  const at = list.findIndex((e) => e.who === run.who);
  return { side, rank: at >= 0 ? at + 1 : null, of: list.length, best };
}

/** 一天一关的两个榜：前 SHOW 名去掉 who；问的这台主机的那条标上 me，另外告诉它排第几。 */
export async function boardOf(store: BoardStore, day: string, level: string, who?: string): Promise<Board> {
  const solo = (await store.get<Kept[]>(keyOf(day, level, 'solo'))) ?? [];
  const multi = (await store.get<Kept[]>(keyOf(day, level, 'multi'))) ?? [];
  const show = (list: Kept[]): BoardEntry[] => list.slice(0, SHOW).map(({ who: w, ...e }) => (who && w === who ? { ...e, me: true } : e));
  const rank = (list: Kept[]): number | null => {
    const i = who ? list.findIndex((e) => e.who === who) : -1;
    return i >= 0 ? i + 1 : null;
  };
  return { day, level, solo: show(solo), multi: show(multi), count: { solo: solo.length, multi: multi.length }, mine: { solo: rank(solo), multi: rank(multi) } };
}

/** 一天扫一次：KEEP_DAYS 天以前的榜删掉。 */
async function sweep(store: BoardStore, day: string): Promise<void> {
  if ((await store.get<string>('sweep')) === day) return;
  await store.put('sweep', day);
  const cutoff = dayNumber(day) - KEEP_DAYS;
  const all = await store.list<unknown>({ prefix: 'b:' });
  for (const k of all.keys()) {
    const d = k.split(':')[1] ?? '';
    if (dayNumber(d) < cutoff) await store.delete(k);
  }
}

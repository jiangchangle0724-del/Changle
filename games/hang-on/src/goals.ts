/**
 * 每关小目标（A9b）：闯关和大团队每关三个，各算一颗星。
 * - 准时：在 par 的 1.5 倍以内到顶（par 是高手的用时，取整到 10 秒）。
 * - 少摔：全队摔的次数不超过 par 给的每人几次 × 人数。
 * - 红包：关里藏的红包都拿到（这一局里拿齐）。没有红包的关没有这一颗。
 * 主机算、记（这台主机上每关拿到过哪几颗星、拿过哪几个红包，`src/host/progress.ts`），结算页、倒数、大厅显示。
 * 手柄页的结算页、房间协议也用：什么都不引（房间服务器那边没有 DOM），只用关卡的类型；给人看的话在 `goal-text.ts`。
 */
import type { Level } from './physics/level';

export type GoalKey = 'time' | 'falls' | 'envelopes';
export const GOAL_KEYS: GoalKey[] = ['time', 'falls', 'envelopes'];

export interface Goal {
  key: GoalKey;
  target: number;
  ok: boolean;
  /** 这一局才第一次拿到这颗星。 */
  fresh?: boolean;
}

/** 这一关、这么多人时的三个小目标（坐不住的场地没有）。 */
export function goalTargets(level: Level, players: number): { key: GoalKey; target: number }[] {
  if (level.arena) return [];
  const par = level.par;
  const out: { key: GoalKey; target: number }[] = [
    { key: 'time', target: Math.ceil(((par?.seconds ?? 120) * 1.5) / 10) * 10 },
    { key: 'falls', target: Math.max(1, players) * Math.max(1, par?.deathsPerPlayer ?? 2) },
  ];
  const n = level.envelopes?.length ?? 0;
  if (n) out.push({ key: 'envelopes', target: n });
  return out;
}

/** 这一局达到了哪几个。 */
export function goalsOf(level: Level, players: number, r: { time: number; deaths: readonly number[]; envelopes: number }): Goal[] {
  const falls = r.deaths.reduce((s, d) => s + d, 0);
  return goalTargets(level, players).map(({ key, target }) => ({
    key,
    target,
    ok: key === 'time' ? r.time <= target : key === 'falls' ? falls <= target : r.envelopes >= target,
  }));
}

/** 大厅里关名后面的星：拿到过的实心，没拿到的空心。 */
export function starLine(have: readonly GoalKey[], keys: readonly GoalKey[]): string {
  return keys.map((k) => (have.includes(k) ? '★' : '☆')).join('');
}

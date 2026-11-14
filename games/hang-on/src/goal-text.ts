/**
 * 小目标（A9b）给人看的话，中英两套。主机页、手柄页用；协议和物理只用 `goals.ts`。
 */
import type { GoalKey } from './goals';
import { tr } from './i18n';

/** 150 → 「2 分 30 秒」/「2:30」。 */
function clock(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return tr(m ? `${m} 分${r ? ` ${r} 秒` : '钟'}` : `${r} 秒`, `${m}:${String(r).padStart(2, '0')}`);
}

export function goalText(key: GoalKey, target: number): string {
  if (key === 'time') return tr(`${clock(target)}内到顶`, `Reach the top within ${clock(target)}`);
  if (key === 'falls') return tr(`全队摔不超过 ${target} 次`, `${target} falls or fewer for the team`);
  return tr(`${target} 个红包都拿到`, `Grab all ${target} red envelopes`);
}

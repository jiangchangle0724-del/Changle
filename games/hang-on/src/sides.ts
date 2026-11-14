/**
 * 单人、多人和三档难度（11-13 Steve：「游戏进去之后可选择单人模式和多人模式，然后选择简 中 难，
 * 多人模式的场景需要有团队配合才能通关」）。
 * 大厅先选几个人玩：单人只有闯关；多人有一起闯关、比谁先、坐不住、大团队。闯关和比谁先再选难度。
 * 没人点过时跟着人数走（一个人是单人，两个人以上是多人），有人点了就照点的。
 * 这个文件手柄页、房间协议都用：什么都不 import（只有类型）；给人看的话在 `mode-text.ts`，哪关在哪档在 `levels.ts`。
 */
import type { GameMode } from './physics/world';

export type Side = 'solo' | 'multi';
export const SIDES: Side[] = ['solo', 'multi'];

/** 难度：0 简单、1 中等、2 困难。 */
export type Tier = 0 | 1 | 2;
export const TIERS: Tier[] = [0, 1, 2];

/** 单人只有闯关；多人能选的玩法（大团队要有大关才出，主机那边再筛；抢元宝是 A9d）。 */
export const SIDE_MODES: Record<Side, GameMode[]> = { solo: ['climb'], multi: ['climb', 'race', 'last', 'gold', 'team'] };

/** 这个玩法分不分难度：闯关、比谁先分；坐不住是场地，大团队是大关，不分。 */
export const tiered = (m: GameMode): boolean => m === 'climb' || m === 'race';

/** 没人点过时，这么多人是单人还是多人。 */
export const sideFor = (players: number): Side => (players >= 2 ? 'multi' : 'solo');

/** 这一边、这个玩法最少几个人（单人就一个人，多人一起闯关至少两个）。 */
export function minPlayers(side: Side, mode: GameMode): number {
  if (side === 'solo') return 1;
  return mode === 'team' ? 4 : 2;
}

/** 这一边最多几个人（单人一个，多人 6 个）。 */
export const maxPlayers = (side: Side): number => (side === 'solo' ? 1 : 6);

export const cleanSide = (v: unknown): Side | null => (v === 'solo' || v === 'multi' ? v : null);
export const cleanTier = (v: unknown): Tier | null => (v === 0 || v === 1 || v === 2 ? v : null);

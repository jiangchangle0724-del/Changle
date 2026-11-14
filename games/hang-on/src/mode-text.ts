/**
 * 玩法的名字和一句话怎么赢（A7），中英两套。主机页和手柄页（手柄当遥控）都用：只引 i18n，不引物理。
 */
import { pickLang } from './i18n';
import type { GameMode } from './physics/world';
import { maxPlayers, minPlayers, type Side, type Tier } from './sides';

type Text = { zh: string; en: string };

const NAMES: Record<GameMode, Text> = {
  climb: { zh: '闯关', en: 'Climb' },
  team: { zh: '大团队', en: 'Big team' },
  race: { zh: '比谁先', en: 'Race' },
  last: { zh: '坐不住', en: 'Last one hanging' },
};

export const modeName = (m: GameMode): string => pickLang(NAMES[m]);

/** 这个玩法怎么赢；比谁先分不分队说法不一样。 */
export function modeHintText(m: GameMode, teams: boolean): Text {
  if (m === 'team') return { zh: '4 到 6 个人的大关，大家一起到顶', en: 'Big levels for 4 to 6 players. Everyone reaches the top together' };
  if (m === 'race')
    return teams
      ? { zh: '甜队对咸队，哪一队的人先都到顶就赢', en: 'Team Sweet vs Team Savory. The first team with everyone at the top wins' }
      : { zh: '各跑各的，先到顶的赢，拽别人也算', en: 'Every dumpling for themselves. First to the top wins, and grabbing others is fair game' };
  if (m === 'last') return { zh: '摔了不复活，平台会塌，最后还挂着的赢', en: 'No respawns and the platforms crumble. The last one hanging wins' };
  return { zh: '大家一起到顶，摔了回检查点', en: 'Everyone reaches the top together. Fall and you come back at the last checkpoint' };
}

export const modeHint = (m: GameMode, teams: boolean): string => pickLang(modeHintText(m, teams));

const SIDE_NAMES: Record<Side, Text> = { solo: { zh: '单人', en: 'Solo' }, multi: { zh: '多人', en: 'Multiplayer' } };
const TIER_NAMES: Record<Tier, Text> = { 0: { zh: '简单', en: 'Easy' }, 1: { zh: '中等', en: 'Medium' }, 2: { zh: '困难', en: 'Hard' } };

/** 单人、多人（11-13）。 */
export const sideName = (s: Side): string => pickLang(SIDE_NAMES[s]);
/** 简单、中等、困难（11-13）。 */
export const tierName = (t: Tier): string => pickLang(TIER_NAMES[t]);

/** 大厅玩法键上的字：多人里的闯关叫「一起闯关」。 */
export const modeLabel = (m: GameMode, side: Side): string => (m === 'climb' && side === 'multi' ? pickLang({ zh: '一起闯关', en: 'Climb together' }) : modeName(m));

/** 人数不对、开不了时大厅里写的话（主机页和手柄当遥控都用）；能开是 null。 */
export function notReadyText(n: number, side: Side, mode: GameMode): Text | null {
  const who = (k: number): string => `${k} ${k === 1 ? 'player' : 'players'}`;
  if (n > maxPlayers(side)) return { zh: `${n} 个人。单人只能一个人玩，人多就选多人。`, en: `${who(n)}. Solo is for one player. Pick Multiplayer.` };
  const min = minPlayers(side, mode);
  if (n >= min) return null;
  const label = side === 'multi' && mode === 'climb' ? { zh: '多人', en: 'Multiplayer' } : NAMES[mode];
  return { zh: `${n} 个人。${label.zh}至少要 ${min} 个人。`, en: `${who(n)}. ${label.en} needs at least ${min}.` };
}

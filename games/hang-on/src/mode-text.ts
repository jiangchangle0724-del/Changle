/**
 * 玩法的名字和一句话怎么赢（A7），中英两套。主机页和手柄页（手柄当遥控）都用：只引 i18n，不引物理。
 */
import { pickLang } from './i18n';
import type { GameMode } from './physics/world';

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

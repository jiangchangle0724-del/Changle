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
  gold: { zh: '抢元宝', en: 'Grab the gold' },
  rain: { zh: '红包雨', en: 'Envelope rain' },
};

export const modeName = (m: GameMode): string => pickLang(NAMES[m]);

/** 这个玩法怎么赢；比谁先分不分队说法不一样。 */
export function modeHintText(m: GameMode, teams: boolean): Text {
  if (m === 'team') return { zh: '4 到 6 个人的大关，大家一起到顶', en: 'Big levels for 4 to 6 players. Everyone reaches the top together' };
  if (m === 'race')
    return teams
      ? { zh: '甜队对咸队，哪一队的人先都到顶就赢', en: 'Team Sweet vs Team Savory. The first team with everyone at the top wins' }
      : { zh: '各跑各的，先到顶的赢，拽别人也算', en: 'Every dumpling for themselves. First to the top wins, and grabbing others is fair game' };
  if (m === 'gold') return { zh: '抢中间那个金元宝，只有你一个人抓着时攒时间，攒够 5 秒赢一局，先赢 5 局的赢', en: 'Grab the gold ingot. It only counts while you alone hold it: 5 seconds wins a round, and the first to 5 rounds wins' };
  if (m === 'last') return { zh: '摔了不复活，平台会塌，最后还挂着的赢', en: 'No respawns and the platforms crumble. The last one hanging wins' };
  if (m === 'rain') return { zh: '彩蛋：天上掉红包，40 秒，身子或手碰到就算接到，接得多的赢；接到的都放进扭蛋机', en: 'Secret round: red envelopes fall for 40 seconds. Touch one with your body or a hand to catch it. Most catches wins, and every catch goes into the prize machine' };
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

/** 老宅找钥匙（A10）的横幅：找到钥匙、门开了、钥匙掉了、门锁着（电视上和每部手机上一样）。 */
/** 涨潮（A12）的横幅：开始涨、水退下去；按世界说是汤、海水、冰水、池水还是能量潮。 */
const TIDE_STUFF: Record<string, { zh: string; en: string; icon: string }> = {
  table: { zh: '汤', en: 'soup', icon: '🍲' },
  kitchen: { zh: '汤', en: 'soup', icon: '🍲' },
  van: { zh: '海水', en: 'sea', icon: '🌊' },
  snow: { zh: '冰水', en: 'icy water', icon: '🧊' },
  house: { zh: '池水', en: 'pond water', icon: '🪷' },
  space: { zh: '能量潮', en: 'energy tide', icon: '🌀' },
};
export function tideBanner(phase: 'rise' | 'back', world?: string): { text: string; kind: 'good' | 'bad' } {
  const s = TIDE_STUFF[world ?? 'table'] ?? (TIDE_STUFF.table as { zh: string; en: string; icon: string });
  if (phase === 'rise') return { text: pickLang({ zh: `${s.icon} ${s.zh}涨上来了！快往上爬`, en: `${s.icon} The ${s.en} is rising! Climb!` }), kind: 'bad' };
  return { text: pickLang({ zh: `${s.zh}退下去一点了`, en: `The ${s.en} sank back a little` }), kind: 'good' };
}

export function keyBanner(phase: 'found' | 'unlock' | 'back' | 'locked'): { text: string; kind: 'good' | 'bad' } | null {
  switch (phase) {
    case 'found':
      return { text: pickLang({ zh: '🗝️ 找到钥匙了！拿到锁着的门上', en: '🗝️ Found a key! Bring it to the locked door' }), kind: 'good' };
    case 'unlock':
      return { text: pickLang({ zh: '🔓 门开了', en: '🔓 The door is open' }), kind: 'good' };
    case 'back':
      return { text: pickLang({ zh: '钥匙掉了，回到原来的地方', en: 'The key fell and went back' }), kind: 'bad' };
    case 'locked':
      return { text: pickLang({ zh: '🔒 门锁着，先找钥匙', en: '🔒 Locked. Find the key first' }), kind: 'bad' };
  }
}

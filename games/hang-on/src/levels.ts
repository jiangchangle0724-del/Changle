/**
 * 关卡表：levels/*.json 里所有关，按 id 末尾的号排（table-01 … van-12 是 C1 的 12 关，13 号往后是难关）；
 * 最后附上彩蛋关「桌上杂技」。A1 的手感原型关不进大厅，开发页 `?level=proto-01` 还能开。
 * 每种玩法有自己的一串（`levelsFor`）：闯关和比谁先按难度分三串（简单 1 到 6 关和彩蛋关，中等 7 到 12 关，困难 13 号往后），
 * 大团队用 levels/team/ 里的大关（C9），坐不住用场地（src/physics/arenas.ts）。
 */
import { pickLang } from './i18n';
import { arenaLevels, goldArenas } from './physics/arenas';
import { gatesLevel, kitchenLevel, machinesLevel, sampleLevel, showcaseLevel, snowLevel, type Level } from './physics/level';
import type { GameMode } from './physics/world';
import type { Side, Tier } from './sides';

const files = import.meta.glob('../levels/*.json', { eager: true, import: 'default' }) as Record<string, Level>;
const teamFiles = import.meta.glob('../levels/team/*.json', { eager: true, import: 'default' }) as Record<string, Level>;
const multiFiles = import.meta.glob('../levels/multi/*.json', { eager: true, import: 'default' }) as Record<string, Level>;

/** id 末尾的号（table-01 → 1，van-19 → 19），没有号的排最后。 */
const order = (l: Level): number => Number(/(\d+)$/.exec(l.id)?.[1] ?? Infinity);
const sorted = (list: Record<string, Level>): Level[] => Object.values(list).sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));

export const LEVELS: Level[] = [...sorted(files), showcaseLevel()];
/** 大团队（4 到 6 个人）的大关：C9 做好放进 levels/team/ 就有，没有的时候大厅里不出这个玩法。 */
export const TEAM_LEVELS: Level[] = sorted(teamFiles);
/** 坐不住的场地。 */
export const ARENAS: Level[] = arenaLevels();
/** 抢金元宝（A9d）的场地。 */
export const GOLD_ARENAS: Level[] = goldArenas();
/**
 * 多人非配合不可的关（11-13，Codex 的 C14 做，放进 levels/multi/）：多人的一起闯关按难度从这里选，
 * 这一档还没有的时候用和单人一样的那一串。
 */
export const MULTI_LEVELS: Level[] = sorted(multiFiles);

/**
 * 闯关、比谁先的难度（11-13）：1 到 6 关简单（彩蛋关「桌上杂技」bonus-01 也是 1 号，排在简单最后），7 到 12 关中等，13 号往后（难关）困难。
 * 单人、多人现在是同一串；多人非配合不可的新关做好以后，多人有自己的几串。
 */
export function tierOfLevel(l: Level): Tier {
  if (l.tier !== undefined) return l.tier;
  const n = order(l);
  return n <= 6 ? 0 : n <= 12 ? 1 : 2;
}

/** 每种玩法从哪一串里选关；闯关、比谁先按难度分（不给难度是全部）。多人的一起闯关这一档有多人的关就用多人的。 */
export function levelsFor(mode: GameMode, tier?: Tier, side: Side = 'solo'): Level[] {
  if (mode === 'team') return TEAM_LEVELS;
  if (mode === 'last') return ARENAS;
  if (mode === 'gold') return GOLD_ARENAS;
  if (tier === undefined) return LEVELS;
  if (mode === 'climb' && side === 'multi') {
    const multi = MULTI_LEVELS.filter((l) => tierOfLevel(l) === tier);
    if (multi.length) return multi;
  }
  return LEVELS.filter((l) => tierOfLevel(l) === tier);
}

export function levelById(id: string | null | undefined): Level | undefined {
  if (id === 'proto-01') return sampleLevel();
  if (id === 'proto-02') return machinesLevel('table');
  if (id === 'proto-03') return machinesLevel('van');
  if (id === 'proto-04') return gatesLevel();
  if (id === 'proto-05') return kitchenLevel();
  if (id === 'proto-06') return snowLevel();
  return LEVELS.find((l) => l.id === id) ?? MULTI_LEVELS.find((l) => l.id === id) ?? TEAM_LEVELS.find((l) => l.id === id) ?? ARENAS.find((l) => l.id === id) ?? GOLD_ARENAS.find((l) => l.id === id);
}

/** 关卡教的那件事，给人看的话。 */
const TEACHES: Record<string, { zh: string; en: string }> = {
  crawl: { zh: '抓地爬', en: 'Crawl' },
  gap: { zh: '过缝', en: 'The gap' },
  swing: { zh: '荡', en: 'Swing' },
  climb: { zh: '攀', en: 'Climb' },
  rope: { zh: '荡绳子', en: 'Rope' },
  chain: { zh: '连成一串', en: 'Chain up' },
  door: { zh: '夹门', en: 'Doors' },
  balance: { zh: '平衡', en: 'Balance' },
  throw: { zh: '丢队友', en: 'Throw a friend' },
  ice: { zh: '滑', en: 'Slippery' },
  combine: { zh: '全套', en: 'Everything' },
  all: { zh: '全套', en: 'Everything' },
  // 多人的关（C14）：踩着队友上去、一个人按着踏板一个人过门
  boost: { zh: '踩着队友上去', en: 'Boost a friend' },
  hold: { zh: '一个按着，一个过去', en: 'Hold it for a friend' },
  // 大团队的大关（C9）
  longchain: { zh: '三个人以上连成一串', en: 'A chain of three or more' },
  counterweight: { zh: '几个人一起压', en: 'Weigh it down together' },
  relay: { zh: '一个个递上去', en: 'Pass each other up' },
  // 后厨（A10，C10 做关）
  steam: { zh: '蒸笼喷汽，站上去等它把你托起来', en: 'Ride the steam from the steamers' },
  tray: { zh: '把点心端到终点，抓托盘中间才端得平', en: 'Carry the dim sum to the top. Hold the tray in the middle to keep it level' },
  // 雪山（A10，C11 做关）
  lift: { zh: '坐缆椅、缆车，到站前下车', en: 'Ride the chairlift and get off before the station' },
  slip: { zh: '冰溜子抓不久，快快倒手', en: 'Ice slips out of your hands. Swap hands fast' },
};

/** 难关（13 号往后）难在哪：大厅里显示「难关：…」。 */
const HARD: Record<string, { zh: string; en: string }> = {
  spike: { zh: '尖刺', en: 'Spikes' },
  hot: { zh: '烫手', en: 'Hot stuff' },
  zap: { zh: '带电', en: 'Live wires' },
  mover: { zh: '会动的台子', en: 'Moving platforms' },
  spinner: { zh: '转杆', en: 'Spinning bars' },
  gauntlet: { zh: '连环机关', en: 'Gauntlet' },
};

/** 「这关教：…」「难关：…」，中英两套（手柄当遥控时发给手机，手机按自己的语言显示）。 */
export function teachText(l: Level): { zh: string; en: string } {
  if (l.arena) return { zh: '平台一块块塌，一个地方抓久了手会滑', en: 'Platforms crumble one by one, and hands slip if you hang on too long' };
  if (!l.teaches) return { zh: '', en: '' };
  const h = HARD[l.teaches];
  if (h) return { zh: `难关：${h.zh}`, en: `Hard level: ${h.en}` };
  const t = TEACHES[l.teaches];
  return { zh: `这关教：${t?.zh ?? l.teaches}`, en: `This level teaches: ${t?.en ?? l.teaches}` };
}

export function teachLabel(l: Level): string {
  return pickLang(teachText(l));
}

/** 关卡给人看的名字（当前语言）。 */
export function levelTitle(l: Level, i: number): string {
  return `${i + 1}. ${pickLang(l.name, l.id)}`;
}

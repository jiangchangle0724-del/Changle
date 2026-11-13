/**
 * 关卡表：levels/*.json 里所有关，按 id 末尾的号排（table-01 … van-12 是 C1 的 12 关，13 号往后是难关）；
 * 最后附上彩蛋关「桌上杂技」。A1 的手感原型关不进大厅，开发页 `?level=proto-01` 还能开。
 */
import { pickLang, tr } from './i18n';
import { machinesLevel, sampleLevel, showcaseLevel, type Level } from './physics/level';

const files = import.meta.glob('../levels/*.json', { eager: true, import: 'default' }) as Record<string, Level>;

/** id 末尾的号（table-01 → 1，van-19 → 19），没有号的排最后。 */
const order = (l: Level): number => Number(/(\d+)$/.exec(l.id)?.[1] ?? Infinity);

export const LEVELS: Level[] = [
  ...Object.entries(files)
    .map(([, l]) => l)
    .sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id)),
  showcaseLevel(),
];

export function levelById(id: string | null | undefined): Level | undefined {
  if (id === 'proto-01') return sampleLevel();
  if (id === 'proto-02') return machinesLevel('table');
  if (id === 'proto-03') return machinesLevel('van');
  return LEVELS.find((l) => l.id === id);
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

export function teachLabel(l: Level): string {
  if (!l.teaches) return '';
  const h = HARD[l.teaches];
  if (h) return tr(`难关：${h.zh}`, `Hard level: ${h.en}`);
  const t = TEACHES[l.teaches];
  return tr(`这关教：${t?.zh ?? l.teaches}`, `This level teaches: ${t?.en ?? l.teaches}`);
}

/** 关卡给人看的名字（当前语言）。 */
export function levelTitle(l: Level, i: number): string {
  return `${i + 1}. ${pickLang(l.name, l.id)}`;
}

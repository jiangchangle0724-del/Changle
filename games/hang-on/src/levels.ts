/**
 * 关卡表：levels/*.json 里所有关（C1 做的 12 关），按文件名排；最后附上彩蛋关「桌上杂技」。
 * 关卡文件还没合并进来时，表里就只有彩蛋关。A1 的手感原型关不进大厅，开发页 `?level=proto-01` 还能开。
 */
import { pickLang, tr } from './i18n';
import { sampleLevel, showcaseLevel, type Level } from './physics/level';

const files = import.meta.glob('../levels/*.json', { eager: true, import: 'default' }) as Record<string, Level>;

export const LEVELS: Level[] = [
  ...Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, l]) => l),
  showcaseLevel(),
];

export function levelById(id: string | null | undefined): Level | undefined {
  if (id === 'proto-01') return sampleLevel();
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

export function teachLabel(l: Level): string {
  if (!l.teaches) return '';
  const t = TEACHES[l.teaches];
  return tr(`这关教：${t?.zh ?? l.teaches}`, `This level teaches: ${t?.en ?? l.teaches}`);
}

/** 关卡给人看的名字（当前语言）。 */
export function levelTitle(l: Level, i: number): string {
  return `${i + 1}. ${pickLang(l.name, l.id)}`;
}

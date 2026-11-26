/**
 * 节日关（11-26，14 样的第 12 样）：春节、中秋、圣诞、万圣节那几天，画面上挂这个节日的装饰（`render/festive.ts`），
 * 闯关、比谁先的简单那一串最前面多一关这个节日的关（levels/fest/，Codex 照 ho-C19 做；还没做好的节日只有装饰）。
 * 哪天算节日按这台设备的本地日期算（温哥华）；网址带 `?fest=cny`（midautumn、xmas、halloween）不管哪天都当成这个节日，
 * `?fest=none` 不要节日，试关、截图用。这里只放日历和名字，不碰 DOM。契约见 CONTRACTS.md「节日关契约」。
 */
export type FestId = 'cny' | 'midautumn' | 'xmas' | 'halloween';

export const FEST_IDS: readonly FestId[] = ['cny', 'midautumn', 'xmas', 'halloween'];

/** 节日的标记和名字（大厅里「🎄 圣诞限定」）。 */
export const FESTS: Record<FestId, { emoji: string; zh: string; en: string }> = {
  cny: { emoji: '🏮', zh: '春节', en: 'Lunar New Year' },
  midautumn: { emoji: '🥮', zh: '中秋', en: 'Mid-Autumn' },
  xmas: { emoji: '🎄', zh: '圣诞', en: 'Christmas' },
  halloween: { emoji: '🎃', zh: '万圣节', en: 'Halloween' },
};

/**
 * 正月初一（2027 到 2031，2027、2028 和「什么时候有空」的节假日表对过，那张表对过香港天文台的农历）。
 * 前 7 天（小年前后）到后 14 天（元宵）都算春节。
 */
const CNY = ['2027-02-06', '2028-01-26', '2029-02-13', '2030-02-03', '2031-01-23'];
/** 八月十五（2027 到 2031，同上）。前 7 天到后 3 天都算中秋。 */
const MID_AUTUMN = ['2027-09-15', '2028-10-03', '2029-09-22', '2030-09-12', '2031-10-01'];

/** 一个日子是第几天（只看年月日，跟时区、夏令时无关）。 */
const dayOf = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d) / 86_400_000;
const parse = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return dayOf(y, m, d);
};

/** 这一天（这台设备的本地日期）是哪个节日；不是节日是 null。 */
export function festOn(date: Date): FestId | null {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const today = dayOf(date.getFullYear(), m, d);
  if (CNY.some((s) => today >= parse(s) - 7 && today <= parse(s) + 14)) return 'cny';
  if (MID_AUTUMN.some((s) => today >= parse(s) - 7 && today <= parse(s) + 3)) return 'midautumn';
  // 圣诞：12 月 1 日到元旦
  if (m === 12 || (m === 1 && d === 1)) return 'xmas';
  // 万圣节：10 月 20 日到 31 日
  if (m === 10 && d >= 20) return 'halloween';
  return null;
}

/** 收拾网址里的 `?fest=`：认识的节日留下，`none` 是不要节日，别的当没写。 */
export function cleanFest(x: string | null | undefined): FestId | 'none' | null {
  if (x === 'none') return 'none';
  return x && (FEST_IDS as readonly string[]).includes(x) ? (x as FestId) : null;
}

/** 现在是哪个节日：网址写了听网址的，没写看日期。 */
export function festNow(date: Date, param: string | null | undefined): FestId | null {
  const p = cleanFest(param);
  if (p === 'none') return null;
  return p ?? festOn(date);
}

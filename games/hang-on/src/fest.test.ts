/**
 * 节日关（11-26）：哪天算哪个节日、网址的 `?fest=`、节日关排在简单那一串最前面、关名的号不往后挪。
 */
import { describe, expect, test } from 'vitest';
import { cleanFest, festNow, festOn } from './fest';
import { FEST_LEVELS, festLevel, LEVELS, levelById, levelsFor, levelTitle, MULTI_LEVELS } from './levels';
import type { Level } from './physics/level';

/** 本地时间的某一天中午。 */
const on = (s: string): Date => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
};

describe('节日日历', () => {
  test('圣诞 12 月 1 日到元旦，万圣节 10 月 20 日到 31 日', () => {
    expect(festOn(on('2026-11-30'))).toBeNull();
    expect(festOn(on('2026-12-01'))).toBe('xmas');
    expect(festOn(on('2026-12-25'))).toBe('xmas');
    expect(festOn(on('2027-01-01'))).toBe('xmas');
    expect(festOn(on('2027-01-02'))).toBeNull();
    expect(festOn(on('2027-10-19'))).toBeNull();
    expect(festOn(on('2027-10-20'))).toBe('halloween');
    expect(festOn(on('2027-10-31'))).toBe('halloween');
    expect(festOn(on('2027-11-01'))).toBeNull();
  });

  test('春节：初一前 7 天到元宵；中秋：前 7 天到后 3 天（农历的日子年年不一样）', () => {
    // 2027 年正月初一是 2 月 6 日
    expect(festOn(on('2027-01-29'))).toBeNull();
    expect(festOn(on('2027-01-30'))).toBe('cny');
    expect(festOn(on('2027-02-06'))).toBe('cny');
    expect(festOn(on('2027-02-20'))).toBe('cny');
    expect(festOn(on('2027-02-21'))).toBeNull();
    // 2028 年正月初一是 1 月 26 日
    expect(festOn(on('2028-01-18'))).toBeNull();
    expect(festOn(on('2028-01-19'))).toBe('cny');
    // 2027 年八月十五是 9 月 15 日，2028 年是 10 月 3 日（跟万圣节不挨着）
    expect(festOn(on('2027-09-07'))).toBeNull();
    expect(festOn(on('2027-09-08'))).toBe('midautumn');
    expect(festOn(on('2027-09-18'))).toBe('midautumn');
    expect(festOn(on('2027-09-19'))).toBeNull();
    expect(festOn(on('2028-10-06'))).toBe('midautumn');
    expect(festOn(on('2028-10-07'))).toBeNull();
  });

  test('网址的 ?fest= 说了算：认识的节日、none 不要节日，别的当没写', () => {
    expect(cleanFest('xmas')).toBe('xmas');
    expect(cleanFest('none')).toBe('none');
    expect(cleanFest('easter')).toBeNull();
    expect(cleanFest(null)).toBeNull();
    expect(festNow(on('2026-07-01'), 'cny')).toBe('cny');
    expect(festNow(on('2026-12-10'), 'none')).toBeNull();
    expect(festNow(on('2026-12-10'), 'easter')).toBe('xmas');
    expect(festNow(on('2026-07-01'), null)).toBeNull();
  });
});

describe('节日关排在哪', () => {
  const xmas: Level = { ...(LEVELS[0] as Level), id: 'fest-xmas', fest: 'xmas', tier: 0, name: { zh: '圣诞树', en: 'The Tree' } };
  const fests = [xmas];

  test('圣诞那几天：闯关、比谁先的简单那一串最前面是圣诞关（单人多人都是）；别的难度、别的玩法、别的节日不变', () => {
    expect(levelsFor('climb', 0, 'solo', 'xmas', fests)[0]).toBe(xmas);
    expect(levelsFor('climb', 0, 'solo', 'xmas', fests).slice(1)).toEqual(levelsFor('climb', 0, 'solo'));
    expect(levelsFor('climb', 0, 'multi', 'xmas', fests)[0]).toBe(xmas);
    expect(levelsFor('race', 0, 'multi', 'xmas', fests)[0]).toBe(xmas);
    for (const t of [1, 2] as const) expect(levelsFor('climb', t, 'solo', 'xmas', fests)).toEqual(levelsFor('climb', t, 'solo'));
    expect(levelsFor('team', 0, 'multi', 'xmas', fests)).not.toContain(xmas);
    expect(levelsFor('last', 0, 'multi', 'xmas', fests)).not.toContain(xmas);
    expect(levelsFor('climb', 0, 'solo', 'cny', fests)).not.toContain(xmas);
    expect(levelsFor('climb', 0, 'solo', null, fests)).not.toContain(xmas);
    expect(festLevel('xmas', fests)).toBe(xmas);
    expect(festLevel(null, fests)).toBeUndefined();
  });

  test('节日关不编号，写节日的标记；它后面的关还是从 1 号数', () => {
    const list = levelsFor('climb', 0, 'solo', 'xmas', fests);
    expect(levelTitle(xmas, 0, list)).toBe('🎄 圣诞树');
    expect(levelTitle(list[1] as Level, 1, list)).toBe(levelTitle(list[1] as Level, 0));
    expect(levelTitle(list[1] as Level, 1, list).startsWith('1. ')).toBe(true);
  });

  test('levels/fest/ 里的关：每个节日最多一关，id 是 fest-<节日>，写着简单；按 id 找得到；不进平常那几串', () => {
    const seen = new Set<string>();
    for (const l of FEST_LEVELS) {
      expect(l.id).toBe(`fest-${l.fest}`);
      expect(l.tier).toBe(0);
      expect(seen.has(l.fest as string)).toBe(false);
      seen.add(l.fest as string);
      expect(levelById(l.id)).toBe(l);
      expect(LEVELS).not.toContain(l);
      expect(MULTI_LEVELS).not.toContain(l);
    }
  });
});

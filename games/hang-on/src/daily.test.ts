/**
 * 每日一关（11-26）：温哥华的日期、每天挑哪关（同一天大家同一关，连着几天不重样）、名字怎么收拾、用时怎么写。
 */
import { describe, expect, test } from 'vitest';
import { cleanName, clock, dailyIndex, dayNumber, sideOf, vancouverDay } from './daily';
import { DAILY_LEVELS, dailyLevel, tierOfLevel } from './levels';

describe('每日一关', () => {
  test('按温哥华的日期换（时区表说了算：卑诗省 2026 年起不再拨回冬令时，UTC 晚 7 小时）', () => {
    // UTC 早上 6 点温哥华还是前一天晚上（不管晚 7 小时还是 8 小时），9 点已经是当天
    expect(vancouverDay(Date.UTC(2026, 10, 26, 6, 0))).toBe('2026-11-25');
    expect(vancouverDay(Date.UTC(2026, 10, 26, 9, 0))).toBe('2026-11-26');
    expect(vancouverDay(Date.UTC(2026, 6, 1, 6, 0))).toBe('2026-06-30');
    expect(vancouverDay(Date.UTC(2026, 6, 1, 9, 0))).toBe('2026-07-01');
    expect(dayNumber('1970-01-02')).toBe(1);
  });

  test('连着 n 天每关轮到一次，不管 n 是多少', () => {
    for (const n of [1, 2, 7, 14, 28, 29, 30, 49]) {
      const seen = new Set<number>();
      for (let k = 0; k < n; k++) seen.add(dailyIndex(new Date(Date.UTC(2026, 10, 26 + k)).toISOString().slice(0, 10), n));
      expect(seen.size).toBe(n);
    }
  });

  test('从简单、中等的闯关里挑（没有彩蛋关），同一天同一关，明天换一关', () => {
    expect(DAILY_LEVELS.length).toBeGreaterThan(10);
    for (const l of DAILY_LEVELS) expect(tierOfLevel(l)).toBeLessThanOrEqual(1);
    expect(DAILY_LEVELS.some((l) => l.id === 'bonus-01')).toBe(false);
    expect(dailyLevel('2026-11-26')).toBe(dailyLevel('2026-11-26'));
    expect(dailyLevel('2026-11-27')).not.toBe(dailyLevel('2026-11-26'));
  });

  test('名字：去掉换行和看不见的字，最多 12 个字，emoji 不切坏', () => {
    expect(cleanName(' 阿\u0000一​ \n')).toBe('阿一');
    expect(cleanName('😀'.repeat(20))).toBe('😀'.repeat(12));
    expect(cleanName(42)).toBe('');
  });

  test('用时：不到一分钟「45.2」，一分钟以上「1:05.0」；1 个人单人榜，2 个以上多人榜', () => {
    expect(clock(45.24)).toBe('45.2');
    expect(clock(65)).toBe('1:05.0');
    expect(clock(600.04)).toBe('10:00.0');
    expect(sideOf(1)).toBe('solo');
    expect(sideOf(2)).toBe('multi');
  });
});

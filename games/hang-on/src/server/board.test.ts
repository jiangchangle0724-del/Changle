/**
 * 每日一关的排行榜（11-26）：交的成绩怎么收拾、怎么排、一台主机一天一榜留最好的、榜不会越来越大、给出去的没有 who。
 */
import { describe, expect, test } from 'vitest';
import { cleanRun, type DailyRun } from '../daily';
import { boardOf, KEEP, KEEP_DAYS, keepRun, SHOW, type BoardStore } from './board';

/** Durable Object 的存储，放在内存里。 */
function memory(): BoardStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async <T>(key: string) => map.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => void map.set(key, structuredClone(value)),
    delete: async (key: string) => map.delete(key),
    list: async <T>({ prefix }: { prefix: string }) => new Map([...map].filter(([k]) => k.startsWith(prefix))) as Map<string, T>,
  };
}

const NOW = Date.UTC(2026, 10, 26, 20); // 温哥华 11-26 中午
const run = (who: string, seconds: number, more: Partial<DailyRun> = {}): DailyRun => ({ day: '2026-11-26', level: 'table-03', players: 1, seconds, falls: 0, names: [who], who: `${who}${'x'.repeat(8)}`, ...more });

describe('每日一关的排行榜', () => {
  test('快的排前面，一样快摔得少的在前；单人、多人分两个榜', async () => {
    const s = memory();
    expect(await keepRun(s, run('a', 90), NOW)).toEqual({ side: 'solo', rank: 1, of: 1, best: true });
    expect(await keepRun(s, run('b', 80), NOW + 1)).toEqual({ side: 'solo', rank: 1, of: 2, best: true });
    expect((await keepRun(s, run('c', 80, { falls: 3 }), NOW + 2)).rank).toBe(2);
    expect(await keepRun(s, run('d', 120, { players: 3, names: ['阿一', '阿二', '阿三'] }), NOW + 3)).toEqual({ side: 'multi', rank: 1, of: 1, best: true });
    const b = await boardOf(s, '2026-11-26', 'table-03');
    expect(b.solo.map((e) => e.names[0])).toEqual(['b', 'c', 'a']);
    expect(b.multi[0]?.names).toEqual(['阿一', '阿二', '阿三']);
    expect(b.count).toEqual({ solo: 3, multi: 1 });
  });

  test('一台主机一天一榜只留最好的一次：慢了不换（回它原来的名次），快了换掉', async () => {
    const s = memory();
    await keepRun(s, run('a', 90), NOW);
    await keepRun(s, run('b', 100), NOW);
    expect(await keepRun(s, run('b', 120), NOW + 1)).toEqual({ side: 'solo', rank: 2, of: 2, best: false });
    expect(await keepRun(s, run('b', 70), NOW + 2)).toEqual({ side: 'solo', rank: 1, of: 2, best: true });
    expect((await boardOf(s, '2026-11-26', 'table-03')).solo.map((e) => e.seconds)).toEqual([70, 90]);
  });

  test(`一榜最多留 ${KEEP} 队，慢的挤出去回 rank null；给出去前 ${SHOW} 名，不带 who，问的那台标上 me、告诉它排第几`, async () => {
    const s = memory();
    for (let i = 0; i < KEEP; i++) await keepRun(s, run(`p${String(i).padStart(2, '0')}`, 60 + i), NOW + i);
    expect(await keepRun(s, run('slow', 999), NOW + 99)).toEqual({ side: 'solo', rank: null, of: KEEP, best: true });
    const b = await boardOf(s, '2026-11-26', 'table-03', `p30${'x'.repeat(8)}`);
    expect(b.solo).toHaveLength(SHOW);
    expect(b.solo.some((e) => 'who' in e)).toBe(false);
    expect(b.solo.some((e) => e.me)).toBe(false);
    expect(b.mine).toEqual({ solo: 31, multi: null });
    const top = await boardOf(s, '2026-11-26', 'table-03', `p00${'x'.repeat(8)}`);
    expect(top.solo[0]?.me).toBe(true);
    expect(top.solo.filter((e) => e.me)).toHaveLength(1);
  });

  test(`只留最近 ${KEEP_DAYS} 天：新的一天第一份成绩扫掉更早的榜`, async () => {
    const s = memory();
    s.map.set('b:2026-11-01:van-07:solo', []);
    s.map.set('b:2026-11-20:van-07:solo', []);
    s.map.set('sweep', '2026-11-25');
    await keepRun(s, run('a', 90), NOW);
    expect(s.map.has('b:2026-11-01:van-07:solo')).toBe(false);
    expect(s.map.has('b:2026-11-20:van-07:solo')).toBe(true);
    expect(s.map.get('sweep')).toBe('2026-11-26');
  });

  test('交来的成绩先收拾：只收温哥华的今天和昨天，人数、用时、摔的次数在范围里，名字截到 12 个字，没名字补 P2', () => {
    const ok = { day: '2026-11-26', level: 'table-03', players: 2, seconds: 83.456, falls: 2, names: ['  阿一\n', ''], who: 'abcdEFGH1234' };
    expect(cleanRun(ok, NOW)).toEqual({ day: '2026-11-26', level: 'table-03', players: 2, seconds: 83.46, falls: 2, names: ['阿一', 'P2'], who: 'abcdEFGH1234' });
    expect(cleanRun({ ...ok, day: '2026-11-25' }, NOW)?.day).toBe('2026-11-25');
    expect(cleanRun({ ...ok, day: '2026-11-24' }, NOW), '前天的').toBeNull();
    expect(cleanRun({ ...ok, day: '2026-11-27' }, NOW), '明天的').toBeNull();
    expect(cleanRun({ ...ok, players: 7 }, NOW)).toBeNull();
    expect(cleanRun({ ...ok, players: 1.5 }, NOW)).toBeNull();
    expect(cleanRun({ ...ok, seconds: 2 }, NOW), '快得不像话').toBeNull();
    expect(cleanRun({ ...ok, seconds: 'fast' }, NOW)).toBeNull();
    expect(cleanRun({ ...ok, falls: -1 }, NOW)).toBeNull();
    expect(cleanRun({ ...ok, level: '../x' }, NOW)).toBeNull();
    expect(cleanRun({ ...ok, who: 'short' }, NOW)).toBeNull();
    expect(cleanRun({ ...ok, names: ['一二三四五六七八九十十一十二十三'], players: 1 }, NOW)?.names).toEqual(['一二三四五六七八九十十一']);
    expect(cleanRun({ ...ok, assist: true }, NOW)?.assist).toBe(true);
    expect(cleanRun({ ...ok, assist: 'yes' }, NOW)).not.toHaveProperty('assist');
    expect(cleanRun(null, NOW)).toBeNull();
  });
});

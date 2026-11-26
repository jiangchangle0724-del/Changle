/**
 * 闪退自动记录（11-25）：页面能发什么、服务器记下什么（没有个人的东西）、同一种毛病怎么加起来、盒子不会越来越大。
 * 照到此一游的测试（games/been-there/tests/reports.test.ts）改的。
 */
import { describe, expect, test } from 'vitest';
import { ownStack } from '../report';
import { browserOf, keepReport, keyOf, makeLimiter, MAX_ENTRIES, readReport, reportSummary, scrub, signature, type ReportEntry, type ReportStore } from './reports';

/** Durable Object 的存储，放在内存里。 */
function memory(): ReportStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    map,
    get: async <T>(key: string) => map.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => void map.set(key, structuredClone(value)),
    delete: async (key: string) => map.delete(key),
    list: async <T>({ prefix }: { prefix: string }) =>
      new Map([...map].filter(([k]) => k.startsWith(prefix)).sort(([a], [b]) => (a < b ? -1 : 1))) as Map<string, T>,
  };
}

describe('闪退记录', () => {
  test('报里只有该有的：认得的几样，截短，没有地址、房间码、名字、钥匙', () => {
    expect(readReport(null)).toBeNull();
    expect(readReport({ kind: 'boom', msg: 'x', screen: 'pad' }), '不认得的种类').toBeNull();
    expect(readReport({ kind: 'error', msg: 'x', screen: 'fridge' }), '不认得的屏幕').toBeNull();
    expect(readReport({ kind: 'error', msg: '   ', screen: 'pad' }), '没有话').toBeNull();
    const r = readReport({
      kind: 'error',
      msg: 'failed wss://changle.ca/hang-on/api/rooms/K7QD/ws?role=pad&id=abc&name=Mia&key=secret ' + 'x'.repeat(400),
      stack: 'at f (https://changle.ca/hang-on/assets/host-B6x9_kq2.js?v=1:1:2345)\nat g (https://changle.ca/hang-on/r/K7QD:3:4)',
      ms: -5,
      screen: 'pad',
      phase: 'playing',
      level: 'table-01',
      players: 3,
      mode: 'climb',
      build: 'abc1234',
      lang: 'en',
      name: 'Mia',
      code: 'K7QD',
    });
    expect(r).not.toBeNull();
    expect(Object.keys(r!).sort()).toEqual(['build', 'kind', 'lang', 'level', 'mode', 'msg', 'phase', 'players', 'screen', 'stack']);
    expect(r!.msg.length).toBeLessThanOrEqual(300);
    for (const gone of ['secret', 'id=', 'Mia', 'changle.ca', 'K7QD']) expect(r!.msg, `话里还有 ${gone}`).not.toContain(gone);
    expect(r!.msg.startsWith('failed /hang-on/api/rooms/____/ws x')).toBe(true);
    expect(r!.stack).toBe('at f (/hang-on/assets/host-B6x9_kq2.js:1:2345)\nat g (/hang-on/r/____:3:4)');
    expect(readReport({ kind: 'freeze', msg: 'frozen 7 s', ms: 7200.4, screen: 'tv', build: '../../etc' })?.build, '不像版本号的不要').toBeUndefined();
    expect(readReport({ kind: 'freeze', msg: 'frozen 7 s', ms: 7200.4, screen: 'tv' })?.ms).toBe(7200);
    expect(readReport({ kind: 'webgl', msg: 'lost', screen: 'phone', level: '../x', players: 40, mode: 'fly' }), '关、人数、玩法不对的不要').toEqual({ kind: 'webgl', msg: 'lost', screen: 'phone' });
    expect(scrub('a\u0000b\u001fc\nd', 10)).toBe('abc\nd');
  });

  test('浏览器只记牌子和大版本', () => {
    const cases: [string, string][] = [
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'iOS 18 Safari 18'],
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x1800323c) NetType/WIFI Language/zh_CN', 'iOS 17 WeChat 8'],
      ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36', 'Android 14 Chrome 130'],
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0', 'Windows Edge 130'],
      ['curl/8.0', '? ?'],
    ];
    for (const [ua, want] of cases) expect(browserOf(ua), ua).toBe(want);
  });

  test('一种毛病一条：同一个文件的同一句话，不管这一版的列号、文件名后面的哈希、话里的数字', () => {
    const a = readReport({ kind: 'error', msg: 'x is undefined at 12', stack: 'f@/hang-on/assets/host-B6x9_kq2.js:1:2345', screen: 'phone' })!;
    const b = readReport({ kind: 'error', msg: 'x is undefined at 13', stack: 'f@/hang-on/assets/host-Zz81-aQ0.js:1:9999', screen: 'tv' })!;
    const c = readReport({ kind: 'error', msg: 'x is undefined at 12', stack: 'f@/hang-on/assets/pad-B6x9_kq2.js:1:2345', screen: 'tv' })!;
    expect(signature(a)).toBe(signature(b));
    expect(signature(a)).not.toBe(signature(c));
    expect(signature(readReport({ kind: 'freeze', msg: 'frozen 7 s', screen: 'pad', phase: 'playing' })!)).toBe('freeze|pad|playing');
    expect(signature(readReport({ kind: 'killed', msg: 'died', screen: 'phone', phase: 'playing' })!)).toBe('killed|phone|playing');
    expect(signature(readReport({ kind: 'webgl', msg: 'lost', screen: 'padview' })!)).toBe('webgl|padview|-');
    expect(signature(readReport({ kind: 'offline', msg: 'offline 40 s', screen: 'tv' })!)).toBe('offline|tv');
    expect(keyOf(signature(a))).toMatch(/^sig:[0-9a-f]{8}$/);
  });

  test('加起来：多少次、从什么时候、在哪种屏幕、哪一关、几个人、哪种浏览器、哪一版；卡得最久的一次', async () => {
    const box = memory();
    const at = Date.UTC(2026, 10, 25, 12);
    const killed = (players: number, level: string) => readReport({ kind: 'killed', msg: 'died', screen: 'phone', phase: 'playing', level, players, build: 'abc1234' })!;
    await keepReport(box, killed(4, 'van-19'), 'iOS 18 Safari 18', at);
    await keepReport(box, killed(6, 'team-02'), 'iOS 17 Safari 17', at + 60_000);
    await keepReport(box, readReport({ kind: 'freeze', msg: 'frozen 9 s', ms: 9000, screen: 'tv', phase: 'playing' })!, 'Windows Chrome 130', at + 90_000);
    await keepReport(box, readReport({ kind: 'error', msg: 'boom', stack: 'f@/hang-on/assets/host-B6x9_kq2.js:1:2', screen: 'tv', phase: 'lobby' })!, 'Mac Safari 18', at + 120_000);
    const s = await reportSummary(box, at + 180_000);
    expect(s.total).toBe(4);
    expect(s.days).toEqual([{ day: '2026-11-25', n: 4 }]);
    expect(s.problems.map((p) => p.kind), '新的在前').toEqual(['error', 'freeze', 'killed']);
    const k = s.problems[2] as ReportEntry;
    expect(k.count).toBe(2);
    expect(k.first).toBe(at);
    expect(k.last).toBe(at + 60_000);
    expect(k.levels).toEqual({ 'van-19': 1, 'team-02': 1 });
    expect(k.players).toEqual({ '4': 1, '6': 1 });
    expect(k.browsers).toEqual({ 'iOS 18 Safari 18': 1, 'iOS 17 Safari 17': 1 });
    expect(k.builds).toEqual({ abc1234: 2 });
    expect(s.problems[1]!.longest).toBe(9000);
    expect(s.problems[0]!.where).toBe('host-B6x9_kq2.js:1:2');
  });

  test('盒子不会越来越大：最多 200 种（最久没出的先去），每样统计记 12 个名字，记 60 天', async () => {
    const box = memory();
    const at = Date.UTC(2026, 0, 1);
    for (let i = 0; i < MAX_ENTRIES + 15; i++)
      await keepReport(box, readReport({ kind: 'error', msg: `problem ${'abcdefghijklmnopqrstuvwxyz'[i % 26]}${Math.floor(i / 26)}x`, stack: `f@/hang-on/assets/f${i}.js:1:1`, screen: 'pad' })!, `B${i % 20}`, at + i * 86_400_000);
    const s = await reportSummary(box, at);
    expect([...box.map.keys()].filter((k) => k.startsWith('sig:'))).toHaveLength(MAX_ENTRIES);
    expect(s.problems.some((p) => p.where === 'f0.js:1:1'), '最久没出的去掉了').toBe(false);
    expect(s.problems).toHaveLength(60);
    expect([...box.map.keys()].filter((k) => k.startsWith('day:')).length).toBeLessThanOrEqual(60);
    const one = memory();
    for (let i = 0; i < 20; i++) await keepReport(one, readReport({ kind: 'freeze', msg: 'frozen', screen: 'pad' })!, `Browser ${i}`, at);
    const browsers = (await reportSummary(one, at)).problems[0]!.browsers;
    expect(Object.keys(browsers)).toHaveLength(13);
    expect(browsers.other).toBe(8);
  });

  test('同一个地址 10 分钟最多 30 份', () => {
    const ok = makeLimiter();
    const t0 = 1_000_000;
    expect(Array.from({ length: 35 }, (_, i) => ok('1.2.3.4', t0 + i)).filter(Boolean)).toHaveLength(30);
    expect(ok('5.6.7.8', t0), '别的地址不受影响').toBe(true);
    expect(ok('1.2.3.4', t0 + 10 * 60_000 + 1), '十分钟以后又行了').toBe(true);
  });

  test('页面只发栈里游戏自己的那几行，不带域名和问号后面', () => {
    const chrome = 'Error: boom at /hang-on/r/K7QD\n    at f (https://changle.ca/hang-on/assets/host-B6x9_kq2.js:1:2345)\n    at chrome-extension://abc/x.js:1:1\n    at g (https://changle.ca/hang-on/assets/host-B6x9_kq2.js?v=2:1:99)';
    expect(ownStack(chrome)).toBe('at f (/hang-on/assets/host-B6x9_kq2.js:1:2345)\nat g (/hang-on/assets/host-B6x9_kq2.js:1:99)');
    const safari = 'f@https://changle.ca/hang-on/assets/pad-x.js:1:2\nglobal code@\nh@https://changle.ca/hang-on/assets/pad-x.js:3:4';
    expect(ownStack(safari)).toBe('f@/hang-on/assets/pad-x.js:1:2\nh@/hang-on/assets/pad-x.js:3:4');
    expect(ownStack(undefined)).toBe('');
  });
});

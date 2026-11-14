/**
 * 小目标（A9b）：三个目标怎么定、怎么算；进度怎么记（星拿到过就一直在，红包同一个不重复算）。
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { goalsOf, goalTargets, starLine } from './goals';
import type { Level } from './physics/level';
import { envelopeTotal, record, resetProgressForTest, starsOf } from './host/progress';

const level = (extra: Partial<Level> = {}): Level => ({
  id: 'goal-test',
  w: 2000,
  h: 720,
  spawn: { x: 100, y: 500 },
  goal: { x: 1800, y: 300, w: 120, h: 160 },
  rects: [],
  deathY: 900,
  par: { seconds: 100, deathsPerPlayer: 2 },
  envelopes: [
    { x: 400, y: 300 },
    { x: 900, y: 300 },
    { x: 1400, y: 300 },
  ],
  ...extra,
});

describe('小目标', () => {
  test('准时是 par 的 1.5 倍（取整到 10 秒），少摔是每人几次乘人数，有红包才有第三个', () => {
    expect(goalTargets(level(), 4)).toEqual([
      { key: 'time', target: 150 },
      { key: 'falls', target: 8 },
      { key: 'envelopes', target: 3 },
    ]);
    expect(goalTargets(level({ par: { seconds: 70, deathsPerPlayer: 5 }, envelopes: undefined }), 2)).toEqual([
      { key: 'time', target: 110 },
      { key: 'falls', target: 10 },
    ]);
    expect(goalTargets(level({ arena: true }), 4)).toEqual([]);
  });

  test('达到没有', () => {
    const g = goalsOf(level(), 4, { time: 149.9, deaths: [3, 2, 2, 2], envelopes: 3 });
    expect(g.map((x) => [x.key, x.ok])).toEqual([
      ['time', true],
      ['falls', false],
      ['envelopes', true],
    ]);
    expect(starLine(['time', 'envelopes'], ['time', 'falls', 'envelopes'])).toBe('★☆★');
  });
});

describe('这台主机上的进度', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    resetProgressForTest();
  });

  test('星拿到过就一直在，第一次拿到标「新」；红包同一个不重复算', () => {
    const first = record('goal-test', goalsOf(level(), 2, { time: 90, deaths: [0, 0], envelopes: 1 }), [2]);
    expect(first.goals.map((g) => [g.key, g.ok, !!g.fresh])).toEqual([
      ['time', true, true],
      ['falls', true, true],
      ['envelopes', false, false],
    ]);
    expect(first.newEnvelopes).toBe(1);
    // 第二局慢了、摔多了，但三个红包都拿到了
    const second = record('goal-test', goalsOf(level(), 2, { time: 200, deaths: [5, 5], envelopes: 3 }), [0, 1, 2]);
    expect(second.goals.map((g) => [g.key, g.ok, !!g.fresh])).toEqual([
      ['time', false, false],
      ['falls', false, false],
      ['envelopes', true, true],
    ]);
    expect(second.newEnvelopes).toBe(2);
    expect(starsOf('goal-test').sort()).toEqual(['envelopes', 'falls', 'time']);
    expect(envelopeTotal()).toBe(3);
  });
});

import { describe, expect, test } from 'vitest';
import { RttMeter, rttLevel } from './latency';

describe('往返统计', () => {
  test('中位数不被一次抖动带跑', () => {
    const m = new RttMeter(8);
    expect(m.median()).toBeNull();
    for (const v of [20, 22, 19, 21, 400, 20, 23, 21]) m.add(v);
    expect(m.median()).toBe(21);
    expect(m.last()).toBe(21);
    m.add(25);
    expect(m.count).toBe(8); // 最老的 20 被挤掉
    expect(m.median()).toBe(21.5);
  });

  test('坏数不收', () => {
    const m = new RttMeter();
    m.add(-1);
    m.add(Number.NaN);
    expect(m.count).toBe(0);
  });

  test('颜色阈值', () => {
    expect(rttLevel(0)).toBe('good');
    expect(rttLevel(59.9)).toBe('good');
    expect(rttLevel(60)).toBe('warn');
    expect(rttLevel(119)).toBe('warn');
    expect(rttLevel(120)).toBe('bad');
  });
});

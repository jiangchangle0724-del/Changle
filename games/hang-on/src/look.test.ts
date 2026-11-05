/**
 * 换装：网上来的样子要收拾干净，每个选项中英都有名字，袖子不能和手套撞色。
 */
import { describe, expect, test } from 'vitest';
import { ARM_COLORS, ARMS, cleanLook, DEFAULT_LOOK, GLOVES, LOOK_KEYS, LOOK_LISTS, LOOK_NAMES, randomLook, stepLook } from './look';

describe('换装', () => {
  test('不认识的值回默认，缺的项补默认', () => {
    expect(cleanLook(null)).toEqual(DEFAULT_LOOK);
    expect(cleanLook('hat')).toEqual(DEFAULT_LOOK);
    expect(cleanLook({ hat: 'crown', glasses: '<script>', eyes: 7, voice: 'duck' })).toEqual({ ...DEFAULT_LOOK, hat: 'crown', voice: 'duck' });
  });

  test('上一个 / 下一个会绕回来', () => {
    let look = DEFAULT_LOOK;
    for (let i = 0; i < LOOK_LISTS.hat.length; i++) look = stepLook(look, 'hat', 1);
    expect(look.hat).toBe(DEFAULT_LOOK.hat);
    expect(stepLook(DEFAULT_LOOK, 'voice', -1).voice).toBe(LOOK_LISTS.voice[LOOK_LISTS.voice.length - 1]);
  });

  test('随机出来的都合法', () => {
    let seed = 1;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 200; i++) {
      const look = randomLook(random);
      expect(cleanLook(look)).toEqual(look);
    }
  });

  test('每个选项中文英文都有名字', () => {
    for (const k of LOOK_KEYS) {
      expect(LOOK_NAMES.label[k].zh).toBeTruthy();
      expect(LOOK_NAMES.label[k].en).toBeTruthy();
      const names = LOOK_NAMES[k] as Record<string, { zh: string; en: string }>;
      for (const v of LOOK_LISTS[k]) {
        expect(names[v]?.zh, `${k}.${v}`).toBeTruthy();
        expect(names[v]?.en, `${k}.${v}`).toBeTruthy();
      }
    }
  });

  test('袖子每种都有颜色，而且不是手套的蓝和橙', () => {
    for (const a of ARMS) {
      expect(ARM_COLORS[a]).toMatch(/^#[0-9a-f]{6}$/i);
      for (const g of GLOVES) expect(ARM_COLORS[a].toLowerCase()).not.toBe(g.toLowerCase());
    }
  });
});

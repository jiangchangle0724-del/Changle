/**
 * 表情（A14）：处境怎么看出来、几种表情谁先。
 */
import { describe, expect, test } from 'vitest';
import { CFG } from '../physics/config';
import type { WindDef } from '../physics/level';
import { moodOf, pickExpression, SCARED_GAP } from './mood';

const wind: WindDef = { x: 100, y: 100, w: 400, h: 300, dir: 'left', on: 2, off: 1, phase: 0 };

describe('处境', () => {
  test('风：身体在正刮着的那块风里才算，往风那边歪；风停着、在外面都不算', () => {
    const level = { winds: [wind] };
    // 先停 1 秒再刮 2 秒：1.5 秒时正刮着，0.5 秒时停着
    expect(moodOf(level, 1.5, null, { x: 300, y: 200 }, false)).toEqual({ windy: true, lean: -1 });
    expect(moodOf(level, 0.5, null, { x: 300, y: 200 }, false)).toEqual({});
    expect(moodOf(level, 1.5, null, { x: 700, y: 200 }, false)).toEqual({});
    // 刚刮起来那 0.2 秒慢慢歪
    const start = moodOf(level, 1.1, null, { x: 300, y: 200 }, false);
    expect(start.windy).toBe(true);
    expect(Math.abs(start.lean ?? 0)).toBeGreaterThan(0.3);
    expect(Math.abs(start.lean ?? 0)).toBeLessThan(0.7);
    // 往上刮的风不歪
    expect(moodOf({ winds: [{ ...wind, dir: 'up' }] }, 1.5, null, { x: 300, y: 200 }, false).lean).toBe(0);
  });

  test('吓：水面在脚下 SCARED_GAP 像素以内才吓；离得远、没有水、死了都不算', () => {
    const feet = 500 + CFG.bodyR;
    expect(moodOf({}, 0, feet + SCARED_GAP - 10, { x: 0, y: 500 }, false).scared).toBe(true);
    expect(moodOf({}, 0, feet + SCARED_GAP + 10, { x: 0, y: 500 }, false).scared).toBeUndefined();
    expect(moodOf({}, 0, null, { x: 0, y: 500 }, false).scared).toBeUndefined();
    expect(moodOf({}, 0, feet + 50, { x: 0, y: 500 }, true)).toEqual({});
  });
});

describe('表情谁先', () => {
  const calm = { dizzy: 0, cheer: 0, stamina: 1, mood: {} };
  test('没事就照物理给的', () => {
    for (const f of ['idle', 'grab', 'fly'] as const) expect(pickExpression(f, false, calm)).toBe(f);
  });
  test('摔了、赢了、死了照物理的，别的都压不过', () => {
    const all = { dizzy: 1, cheer: 1, stamina: 0, mood: { scared: true, windy: true } };
    expect(pickExpression('scream', false, all)).toBe('scream');
    expect(pickExpression('win', false, all)).toBe('win');
    expect(pickExpression('idle', true, all)).toBe('idle');
  });
  test('晕 > 吓 > 累 > 风里 > 乐', () => {
    const tired = CFG.staminaWarn / 2;
    expect(pickExpression('grab', false, { dizzy: 1, cheer: 1, stamina: tired, mood: { scared: true, windy: true } })).toBe('dizzy');
    expect(pickExpression('grab', false, { dizzy: 0, cheer: 1, stamina: tired, mood: { scared: true, windy: true } })).toBe('scared');
    expect(pickExpression('grab', false, { dizzy: 0, cheer: 1, stamina: tired, mood: { windy: true } })).toBe('tired');
    expect(pickExpression('grab', false, { dizzy: 0, cheer: 1, stamina: 1, mood: { windy: true } })).toBe('windy');
    expect(pickExpression('grab', false, { dizzy: 0, cheer: 1, stamina: 1, mood: {} })).toBe('cheer');
  });
  test('闻到屁（11-25）：在风里之后、乐之前；皱完了就回去', () => {
    expect(pickExpression('grab', false, { dizzy: 0, cheer: 1, stamina: 1, mood: { windy: true }, stink: 1 })).toBe('windy');
    expect(pickExpression('grab', false, { dizzy: 0, cheer: 1, stamina: 1, mood: {}, stink: 1 })).toBe('stinky');
    expect(pickExpression('grab', false, { dizzy: 0, cheer: 1, stamina: 1, mood: {}, stink: 0 })).toBe('cheer');
    expect(pickExpression('scream', false, { dizzy: 0, cheer: 0, stamina: 1, mood: {}, stink: 1 })).toBe('scream');
  });
});

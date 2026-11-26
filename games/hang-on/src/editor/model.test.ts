/**
 * 关卡编辑器（11-26）：放、点到、挪、拉角、删、撤销重做，改完总是一个能玩的关。
 */
import { describe, expect, test } from 'vitest';
import { LIMITS } from '../custom';
import { History, hit, move, place, remove, resize, restyle, room, spawnHasFloor, starter } from './model';

const opts = { material: 'ice' as const, hazard: 'zap' as const };

describe('关卡编辑器', () => {
  test('新的关能玩：出生点底下有台子，有终点、检查点', () => {
    const l = starter();
    expect(spawnHasFloor(l)).toBe(true);
    expect(l.rects.length).toBe(2);
    expect(l.checkpoints).toHaveLength(1);
  });

  test('拖着画台子：对齐 20 像素、用选的材料；点一下放把手、箱子、大石头、绳子、检查点', () => {
    let l = starter();
    const r = place(l, 'rect', { x: 1003, y: 301 }, { x: 1288, y: 342 }, opts);
    expect(r.ref).toEqual({ list: 'rects', i: 2 });
    expect(r.level.rects[2]).toEqual({ x: 1000, y: 300, w: 280, h: 40, kind: 'ground', material: 'ice' });
    l = r.level;
    for (const tool of ['peg', 'crate', 'boulder', 'rope', 'checkpoint'] as const) {
      const p = place(l, tool, { x: 600, y: 300 }, { x: 600, y: 300 }, opts);
      expect(p.ref, tool).not.toBeNull();
      l = p.level;
    }
    expect(l.rects[3]).toMatchObject({ kind: 'peg', w: 40, h: 16 });
    expect(l.crates).toHaveLength(1);
    expect(l.boulders?.[0]).toMatchObject({ x: 600, y: 300, r: 56 });
    expect(l.ropes?.[0]).toMatchObject({ anchor: { x: 600, y: 300 }, segments: 8 });
    expect(l.checkpoints).toHaveLength(2);
  });

  test('出生点、终点只有一个：放就是挪；删不掉', () => {
    let l = starter();
    l = place(l, 'spawn', { x: 300, y: 500 }, { x: 300, y: 500 }, opts).level;
    expect(l.spawn).toEqual({ x: 300, y: 500 });
    l = place(l, 'goal', { x: 1500, y: 100 }, { x: 1500, y: 100 }, opts).level;
    expect(l.goal).toEqual({ x: 1440, y: 20, w: 120, h: 160 });
    expect(remove(l, { list: 'spawn' })).toBe(l);
    expect(remove(l, { list: 'goal' })).toBe(l);
  });

  test('点到的是上面那样；挪、拉角、换材料、删', () => {
    let l = place(starter(), 'crate', { x: 400, y: 560 }, { x: 400, y: 560 }, opts).level;
    expect(hit(l, { x: 400, y: 560 })).toEqual({ list: 'crates', i: 0 });
    expect(hit(l, { x: 700, y: 650 })).toEqual({ list: 'rects', i: 0 });
    expect(hit(l, { x: 1050, y: 300 })).toBeNull();
    l = move(l, { list: 'crates', i: 0 }, 41, -19);
    expect(l.crates?.[0]).toMatchObject({ x: 400, y: 500 });
    l = resize(l, { list: 'rects', i: 0 }, 2, { x: 1100, y: 700 });
    expect(l.rects[0]).toMatchObject({ x: 0, y: 620, w: 1100, h: 80 });
    l = restyle(l, { list: 'rects', i: 0 }, { material: 'brick' });
    expect(l.rects[0]?.material).toBe('brick');
    l = remove(l, { list: 'crates', i: 0 });
    expect(l.crates).toBeUndefined();
  });

  test('绳子拉底下那头改长短（3 到 16 节），大石头拉边改大小（36 到 90）', () => {
    let l = place(starter(), 'rope', { x: 1000, y: 100 }, { x: 1000, y: 100 }, opts).level;
    l = resize(l, { list: 'ropes', i: 0 }, 2, { x: 1000, y: 100 + 22 * 12 });
    expect(l.ropes?.[0]?.segments).toBe(12);
    l = resize(l, { list: 'ropes', i: 0 }, 2, { x: 1000, y: 5000 });
    expect(l.ropes?.[0]?.segments).toBe(16);
    l = place(l, 'boulder', { x: 500, y: 300 }, { x: 500, y: 300 }, opts).level;
    l = resize(l, { list: 'boulders', i: 0 }, 2, { x: 500 + 200, y: 300 });
    expect(l.boulders?.[0]?.r).toBe(90);
  });

  test(`每样有上限：大石头最多 ${LIMITS.boulders} 块，满了放不下`, () => {
    let l = starter();
    for (let k = 0; k < LIMITS.boulders; k++) l = place(l, 'boulder', { x: 300 + k * 200, y: 300 }, { x: 300 + k * 200, y: 300 }, opts).level;
    expect(room(l, 'boulder')).toBe(false);
    expect(place(l, 'boulder', { x: 1500, y: 300 }, { x: 1500, y: 300 }, opts).ref).toBeNull();
  });

  test('撤销、重做', () => {
    const h = new History(starter());
    const a = h.level;
    h.push(place(a, 'crate', { x: 400, y: 500 }, { x: 400, y: 500 }, opts).level);
    expect(h.level.crates).toHaveLength(1);
    expect(h.undo()).toBe(true);
    expect(h.level).toEqual(a);
    expect(h.redo()).toBe(true);
    expect(h.level.crates).toHaveLength(1);
    expect(h.redo()).toBe(false);
    h.push(h.level);
    expect(h.canUndo).toBe(true);
  });
});

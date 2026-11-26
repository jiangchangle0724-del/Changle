/**
 * 关卡编辑器（11-26）：自制关的码（压缩、解开、同一串码同一个 id）、别人给的关怎么收拾（只留编辑器放得出来的、数夹在范围里）。
 */
import { describe, expect, test } from 'vitest';
import { cleanCustom, CODE_MAX, customId, decodeLevel, encodeLevel, isCustom, LIMITS } from './custom';
import { createSim } from './physics/world';

const base = {
  name: '我的第一关',
  world: 'snow',
  w: 2000,
  h: 800,
  spawn: { x: 100, y: 600 },
  goal: { x: 1800, y: 400, w: 120, h: 160 },
  checkpoints: [{ x: 900, y: 600 }],
  rects: [
    { x: 0, y: 650, w: 800, h: 40, material: 'snow', kind: 'ground' },
    { x: 1000, y: 650, w: 1000, h: 40, material: 'ice' },
  ],
  ropes: [{ anchor: { x: 880, y: 200 }, segments: 8, segLen: 22 }],
  hazards: [{ x: 820, y: 760, w: 160, h: 30, kind: 'zap' }],
  boulders: [{ x: 400, y: 590, r: 50 }],
};

describe('自制关', () => {
  test('码解开就是原来的关（收拾过），同一串码同一个 id；不对的码是 null', async () => {
    const level = cleanCustom(base, 'x') as NonNullable<ReturnType<typeof cleanCustom>>;
    const code = await encodeLevel(level);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(code.length).toBeLessThan(1000);
    const back = await decodeLevel(code);
    expect(back).toEqual({ ...level, id: customId(code) });
    expect(isCustom(back as { id: string })).toBe(true);
    expect(customId(code)).toBe(customId(code));
    expect(await decodeLevel('not a code!')).toBeNull();
    expect(await decodeLevel('AAAA')).toBeNull();
    expect(await decodeLevel('A'.repeat(CODE_MAX + 1))).toBeNull();
  });

  test('别人给的关：没有出生点或终点不要；大小、位置、种类夹在范围里；不认识的东西去掉；没有红包、没有星', () => {
    expect(cleanCustom({ ...base, spawn: undefined })).toBeNull();
    expect(cleanCustom({ ...base, goal: 'x' })).toBeNull();
    expect(cleanCustom(null)).toBeNull();
    const l = cleanCustom({
      ...base,
      w: 99999,
      h: 10,
      world: 'moon',
      name: { zh: '  x\u0000y  ' },
      rects: [{ x: -500, y: 5000, w: 20000, h: 40, material: 'lava', kind: 'trap' }],
      hazards: [{ x: 10, y: 10, w: 40, h: 40, kind: 'laser' }],
      envelopes: [{ x: 100, y: 100 }],
      par: { seconds: 1, deathsPerPlayer: 0 },
      movers: [{ x: 1, y: 1, w: 10, h: 10, path: [], speed: 1 }],
      tide: { speed: 40 },
    }) as NonNullable<ReturnType<typeof cleanCustom>>;
    expect(l.w).toBe(4000);
    expect(l.h).toBe(720);
    expect(l.world).toBe('table');
    expect(l.name).toEqual({ zh: 'xy', en: 'xy' });
    expect(l.rects[0]).toEqual({ x: 0, y: 680, w: 4000, h: 40, kind: 'ground', material: 'wood' });
    expect(l.hazards?.[0]?.kind).toBe('spike');
    for (const k of ['envelopes', 'par', 'movers', 'tide', 'stamina', 'long', 'fest']) expect(l).not.toHaveProperty(k);
    expect(l.deathY).toBe(l.h + 70);
  });

  test(`每样最多几个：台子 ${LIMITS.rects}、尖刺 ${LIMITS.hazards}、大石头 ${LIMITS.boulders}……`, () => {
    const many = (n: number, f: (i: number) => object) => Array.from({ length: n }, (_, i) => f(i));
    const l = cleanCustom({
      ...base,
      rects: many(100, (i) => ({ x: i * 10, y: 700, w: 20, h: 20 })),
      hazards: many(50, (i) => ({ x: i * 10, y: 100, w: 20, h: 20 })),
      boulders: many(9, (i) => ({ x: 100 + i * 100, y: 300 })),
      checkpoints: many(30, (i) => ({ x: 50 + i * 40, y: 300 })),
    }) as NonNullable<ReturnType<typeof cleanCustom>>;
    expect(l.rects).toHaveLength(LIMITS.rects);
    expect(l.hazards).toHaveLength(LIMITS.hazards);
    expect(l.boulders).toHaveLength(LIMITS.boulders);
    expect(l.checkpoints).toHaveLength(LIMITS.checkpoints);
  });

  test('收拾好的关物理能跑：放人、走几步不出错', async () => {
    const level = cleanCustom(base, customId('abc')) as NonNullable<ReturnType<typeof cleanCustom>>;
    const sim = await createSim(level, 2);
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    expect(sim.players).toHaveLength(2);
    sim.destroy();
  });
});

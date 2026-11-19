/**
 * 新机关（A12）第二批：摆锤（按时间摆、撞上被弹飞报 bonk、能抓着跟着荡、烫的碰到就死）、
 * 阵风（停一会儿、起风丝、刮的时候把矩形里的人往风那边推，外面的不推）。
 */
import { describe, expect, test } from 'vitest';
import type { Level, PendulumDef, WindDef } from './level';
import { pendulumAt, windState } from './motion';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
function run(sim: Sim, seconds: number, input: PadInput = idle): SimEvent[] {
  const all: SimEvent[] = [];
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    sim.players.forEach((_, i) => sim.setInput(i, input));
    sim.step(dt);
    all.push(...sim.events);
  }
  return all;
}

/** 轴心 (1000, 200)，绳长 400，摆幅 0.9，来回 2 秒；phase 0.5 时开局锤在右边最高处，0.5 秒后摆到最低点 (1000, 600)。 */
const PEND: PendulumDef = { pivot: { x: 1000, y: 200 }, len: 400, amp: 0.9, period: 2, phase: 0.5, r: 34 };
function swingLevel(p: PendulumDef = PEND, winds?: WindDef[]): Level {
  return {
    id: 'swing-test',
    w: 2400,
    h: 1300,
    spawn: { x: 200, y: 960 },
    goal: { x: 2200, y: 100, w: 100, h: 100 },
    checkpoints: [],
    rects: [
      { x: 0, y: 1000, w: 2400, h: 60, kind: 'ground' },
      // 锤最低点底下一块台子：站在上面的人正好挡在锤的路上
      { x: 940, y: 655, w: 120, h: 30, kind: 'step' },
    ],
    pendulums: [p],
    ...(winds ? { winds } : {}),
    deathY: 1250,
  };
}

describe('摆锤', () => {
  test('pendulumAt：最低点在轴心正下方 len，摆幅那一刻偏 amp', () => {
    const still = { ...PEND, phase: 0 };
    expect(pendulumAt(still, 0)).toMatchObject({ x: 1000, y: 600, angle: 0 });
    const side = pendulumAt(still, 0.5);
    expect(side.angle).toBeCloseTo(0.9, 5);
    expect(side.x).toBeCloseTo(1000 + 400 * Math.sin(0.9), 3);
  });

  test('站在锤的路上：锤摆过来把人撞飞（报 bonk，人往左飞出去）', async () => {
    const sim = await createSim(swingLevel(), 1);
    sim.teleport(0, 1000, 628);
    const evs = run(sim, 1.2);
    expect(evs.some((e) => e.type === 'bonk' && e.player === 0)).toBe(true);
    expect(sim.players[0]!.body.x).toBeLessThan(940);
    sim.destroy();
  });

  test('抓着锤跟着荡：开局抓住最高处的锤，半个来回以后人到了左边', async () => {
    const sim = await createSim(swingLevel({ ...PEND, phase: 0 }), 1);
    // 开局锤在最低点 (1000, 600)，手抓在锤底下，人吊着
    sim.teleport(0, 1000, 700, { hands: [{ x: 1000, y: 634 }, null] });
    run(sim, 0.1, { ...idle, gl: true });
    expect(sim.players[0]!.arms[0].grip?.kind).toBe('terrain');
    run(sim, 0.9, { ...idle, gl: true });
    // 第 1 秒锤回到最低点往左走，第 1.5 秒在左边最高处
    run(sim, 0.5, { ...idle, gl: true });
    expect(sim.players[0]!.arms[0].grip).not.toBeNull();
    expect(sim.players[0]!.body.x).toBeLessThan(820);
    sim.destroy();
  });

  test('烫的锤（deadly）碰到就死，cause 是 hot', async () => {
    const sim = await createSim(swingLevel({ ...PEND, deadly: true }), 1);
    sim.teleport(0, 1000, 628);
    const evs = run(sim, 1.2);
    const death = evs.find((e) => e.type === 'death' && e.player === 0);
    expect(death && death.type === 'death' ? death.cause : null).toBe('hot');
    sim.destroy();
  });
});

describe('阵风', () => {
  const WIND: WindDef = { x: 1400, y: 0, w: 1000, h: 1000, dir: 'left', on: 1, off: 1.5 };

  test('windState：先停 off 秒（最后几秒起风丝），再刮 on 秒', () => {
    expect(windState(WIND, 0.2)).toMatchObject({ on: false, warn: false });
    expect(windState(WIND, 1.2).warn).toBe(true);
    const gust = windState(WIND, 2);
    expect(gust.on).toBe(true);
    expect(gust.k).toBe(1);
  });

  test('刮的时候矩形里悬空的人被往风那边推；外面的人不推；报 warn 和 on', async () => {
    const sim = await createSim(swingLevel(PEND, [WIND]), 2);
    // 1 号在风里（右边空中），2 号在风外（左边空中）；1.5 秒时开始刮
    const evs = run(sim, 1.45);
    sim.teleport(0, 1900, 300);
    sim.teleport(1, 400, 300);
    const x0 = sim.players[0]!.body.x;
    const y0 = sim.players[1]!.body.x;
    evs.push(...run(sim, 0.5));
    expect(evs.some((e) => e.type === 'wind' && e.phase === 'warn')).toBe(true);
    expect(evs.some((e) => e.type === 'wind' && e.phase === 'on')).toBe(true);
    expect(x0 - sim.players[0]!.body.x).toBeGreaterThan(60);
    // 风外的人刚放到空中胳膊会晃一点，身子挪不了多少
    expect(Math.abs(sim.players[1]!.body.x - y0)).toBeLessThan(25);
    sim.destroy();
  });
});

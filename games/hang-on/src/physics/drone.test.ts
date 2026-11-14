/**
 * 卡太久来帮手（A9c，外卖无人机）：只在打开了帮手的闯关、大团队里来；卡久了飞到落在最后的人头上，
 * 抓住提手就带到下一个检查点，没人抓等一会儿就走；回放（没打开帮手）永远不来。
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { CFG } from './config';
import type { Level } from './level';
import { createSim, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
function run(sim: Sim, seconds: number, fn?: () => void): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    fn?.();
    sim.step(dt);
    all.push(...sim.events);
    if (sim.won) break;
  }
  return all;
}

/** 左边一块地；中间一个坑；右边一块高台，检查点在高台上，一个人上不去（墙抓不住）。 */
function level(): Level {
  return {
    id: 'drone-test',
    w: 2000,
    h: 1000,
    spawn: { x: 100, y: 500 },
    goal: { x: 1800, y: 100, w: 150, h: 150 },
    checkpoints: [{ x: 1500, y: 276 }],
    rects: [
      { x: 0, y: 540, w: 700, h: 200, kind: 'ground' },
      { x: 1200, y: 300, w: 800, h: 440, kind: 'wall', grab: false },
    ],
    deathY: 1100,
  };
}

const saved = { helpLate: CFG.helpLate, helpAfter: CFG.helpAfter, droneWait: CFG.droneWait };
beforeEach(() => {
  CFG.helpLate = 3;
  CFG.helpAfter = 2;
  CFG.droneWait = 4;
});
afterEach(() => Object.assign(CFG, saved));

describe('外卖无人机', () => {
  test('没打开帮手（回放、验收）：卡多久都不来', async () => {
    const sim = await createSim(level(), 1);
    run(sim, 5);
    expect(sim.drone).toBeNull();
    sim.destroy();
  });

  test('比谁先、坐不住里不来', async () => {
    for (const mode of ['race', 'last'] as const) {
      const sim = await createSim(level(), 2, { mode, helper: true });
      run(sim, 5);
      expect(sim.drone).toBeNull();
      sim.destroy();
    }
  });

  test('卡久了飞来，悬在人头上；没人抓，等一会儿就飞走，过一阵卡久了再来', async () => {
    const sim = await createSim(level(), 1, { mode: 'climb', helper: true });
    const evs = run(sim, CFG.helpLate + 0.2);
    expect(evs.some((e) => e.type === 'drone' && e.phase === 'arrive')).toBe(true);
    run(sim, 3);
    const d = sim.drone!;
    expect(d.phase).toBe('wait');
    const p = sim.players[0]!;
    expect(Math.abs(d.x - p.body.x)).toBeLessThan(40);
    expect(p.body.y - d.y).toBeGreaterThan(CFG.droneHang - 40);
    const later = run(sim, CFG.droneWait + 4);
    expect(later.some((e) => e.type === 'drone' && e.phase === 'leave')).toBe(true);
    expect(sim.drone).toBeNull();
    // 走了以后重新数
    run(sim, CFG.helpLate + 0.2);
    expect(sim.drone).not.toBeNull();
    sim.destroy();
  });

  test('摔了好几次：不到 helpLate 也来（helpAfter 秒 + helpDeaths 次）', async () => {
    const sim = await createSim(level(), 1, { mode: 'climb', helper: true });
    for (let k = 0; k < CFG.helpDeaths; k++) {
      sim.teleport(0, 900, 600);
      run(sim, 1.2);
    }
    run(sim, 0.5);
    expect(sim.drone).not.toBeNull();
    sim.destroy();
  });

  test('抓住提手：带到下一个检查点上头，检查点亮了，放下人飞走', async () => {
    const sim = await createSim(level(), 1, { mode: 'climb', helper: true });
    run(sim, CFG.helpLate + 3.5);
    const d = sim.drone!;
    expect(d.phase).toBe('wait');
    // 两只手放到提手上抓住
    sim.teleport(0, d.x, d.y + 90, { hands: [{ x: d.x - 12, y: d.y }, { x: d.x + 12, y: d.y }] });
    const evs = run(sim, 14, () => sim.setInput(0, { ax: 0, ay: 0, gl: true, gr: true }));
    expect(evs.some((e) => e.type === 'drone' && e.phase === 'carry')).toBe(true);
    expect(evs.some((e) => e.type === 'checkpoint' && e.index === 0)).toBe(true);
    expect(sim.players[0]!.dead).toBe(false);
    // 松手站在高台上，无人机飞走
    const after = run(sim, 4);
    expect([...evs, ...after].some((e) => e.type === 'drone' && e.phase === 'leave')).toBe(true);
    const p = sim.players[0]!;
    expect(p.body.x).toBeGreaterThan(1200);
    expect(p.body.y).toBeLessThan(300);
    sim.destroy();
  });
});

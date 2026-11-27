/**
 * 观众投票（11-26）的物理：变轻、变重改重力，几秒以后回来（报 crowdfx off）；刮风全场往一边吹，
 * 站着的被推着走，挂着的不脱手；力气满把手酸加满。新的一样顶掉还在起作用的。
 */
import { describe, expect, test } from 'vitest';
import { FX } from '../crowd';
import { CFG } from './config';
import type { Level, Pt } from './level';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
const both: PadInput = { ...idle, gl: true, gr: true };

/** 一块大地板，上面 400 像素悬着一根横杆。 */
function level(): Level {
  return {
    id: 'crowd-test',
    w: 3000,
    h: 1400,
    spawn: { x: 1500, y: 600 },
    goal: { x: 2850, y: 100, w: 100, h: 100 },
    checkpoints: [],
    rects: [
      { x: 0, y: 700, w: 3000, h: 60, kind: 'ground' },
      { x: 1350, y: 290, w: 300, h: 20, kind: 'peg' },
    ],
    deathY: 1400,
  };
}
const BAR_Y = 300;

function run(sim: Sim, seconds: number, input: PadInput = idle): SimEvent[] {
  const all: SimEvent[] = [];
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    for (let i = 0; i < sim.players.length; i++) sim.setInput(i, input);
    sim.step(dt);
    all.push(...sim.events);
  }
  return all;
}
const gravity = (sim: Sim): number => (sim as unknown as { world: { gravity: Pt } }).world.gravity.y;

describe('观众投票的物理', () => {
  test('变轻：重力变小，几秒以后回来，报一次 crowdfx off', async () => {
    const sim = await createSim(level(), 1);
    run(sim, 1);
    sim.startCrowd('float');
    expect(gravity(sim)).toBeCloseTo(CFG.gravity * CFG.crowdFloatG);
    const evs = run(sim, FX.float.secs + 0.2);
    expect(gravity(sim)).toBe(CFG.gravity);
    expect(sim.crowd).toBeNull();
    expect(evs.filter((e) => e.type === 'crowdfx')).toEqual([{ type: 'crowdfx', fx: 'float', on: false, dir: 1 }]);
    sim.destroy();
  });

  test('变重：掉得比平常快', async () => {
    const fall = async (heavy: boolean): Promise<number> => {
      const sim = await createSim(level(), 1);
      sim.teleport(0, 500, 100);
      if (heavy) sim.startCrowd('heavy');
      run(sim, 0.3);
      const y = sim.players[0]!.body.y;
      sim.destroy();
      return y;
    };
    expect(await fall(true)).toBeGreaterThan((await fall(false)) + 15);
  });

  test('刮风：掉着的往风那边飘（往左刮往左飘），几秒以后停；站在东西上的算站稳了', async () => {
    for (const dir of [1, -1]) {
      const fall = async (wind: boolean): Promise<number> => {
        const sim = await createSim(level(), 1);
        sim.teleport(0, 1000, 60);
        if (wind) sim.startCrowd('wind', dir);
        run(sim, 0.6);
        const x = sim.players[0]!.body.x;
        sim.destroy();
        return x;
      };
      expect(((await fall(true)) - (await fall(false))) * dir).toBeGreaterThan(50);
      const sim = await createSim(level(), 1);
      run(sim, 1);
      const x0 = sim.players[0]!.body.x;
      sim.startCrowd('wind', dir);
      const evs = run(sim, FX.wind.secs + 0.1);
      expect(Math.abs(sim.players[0]!.body.x - x0)).toBeLessThan(30);
      expect(sim.crowd).toBeNull();
      expect(evs).toContainEqual({ type: 'crowdfx', fx: 'wind', on: false, dir });
      sim.destroy();
    }
  });

  test('刮风：两只手挂着的不脱手，只是荡', async () => {
    const sim = await createSim(level(), 1);
    const hands: [Pt, Pt] = [{ x: 1475, y: BAR_Y }, { x: 1525, y: BAR_Y }];
    sim.teleport(0, 1500, BAR_Y + 75, { hands });
    run(sim, 0.5, both);
    sim.startCrowd('wind', 1);
    let maxDx = 0;
    for (let k = 0; k < Math.round(FX.wind.secs / dt); k++) {
      sim.setInput(0, both);
      sim.step(dt);
      maxDx = Math.max(maxDx, sim.players[0]!.body.x - 1500);
    }
    const p = sim.players[0]!;
    expect(p.dead).toBe(false);
    expect(p.arms.every((a) => a.grip !== null)).toBe(true);
    expect(maxDx).toBeGreaterThan(10);
    sim.destroy();
  });

  test('力气满：手酸加满，不留下什么在起作用', async () => {
    const sim = await createSim(level(), 2, { mode: 'climb', stamina: 'hard' });
    sim.players[0]!.stamina = 0.2;
    sim.players[1]!.stamina = 0.5;
    sim.startCrowd('strong');
    expect(sim.players.map((p) => p.stamina)).toEqual([1, 1]);
    expect(sim.crowd).toBeNull();
    sim.destroy();
  });

  test('新的一样顶掉还在起作用的：变轻接着刮风，重力先回来', async () => {
    const sim = await createSim(level(), 1);
    sim.startCrowd('float');
    run(sim, 1);
    sim.startCrowd('wind', -1);
    expect(gravity(sim)).toBe(CFG.gravity);
    expect(sim.crowd).toMatchObject({ fx: 'wind', dir: -1 });
    sim.destroy();
  });
});

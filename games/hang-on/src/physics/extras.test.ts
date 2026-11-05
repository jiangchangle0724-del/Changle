/**
 * 20 条之外的检查：检查点复活、跷跷板和箱子、回放、确定性。
 */
import { describe, expect, test } from 'vitest';
import { CFG } from './config';
import { sampleLevel, type Level } from './level';
import { runReplay, type Replay } from './replay';
import { createSim, type PadInput, type Sim } from './world';

const dt = 1 / 60;
const input = (ax: number, ay: number, gl: boolean, gr: boolean): PadInput => ({ ax, ay, gl, gr });
function run(sim: Sim, seconds: number, fn?: (t: number) => void): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    fn?.(i * dt);
    sim.step(dt);
  }
}

describe('检查点', () => {
  test('走到检查点就激活，摔死后在检查点复活而不是起点', async () => {
    const sim = await createSim(sampleLevel(), 2);
    const cp = sim.level.checkpoints![0]!;
    sim.teleport(0, cp.x, cp.y);
    run(sim, 0.5);
    expect(sim.checkpoint).toBe(0);
    sim.teleport(0, 800, 900); // 掉进缝里
    run(sim, 2.5);
    expect(sim.players[0]!.deaths).toBe(1);
    expect(Math.abs(sim.players[0]!.body.x - cp.x)).toBeLessThan(5);
    // 没死的 P2 还在起点
    expect(Math.abs(sim.players[1]!.body.x - (sim.level.spawn.x + 44))).toBeLessThan(5);
    sim.destroy();
  });
});

function propLevel(): Level {
  return {
    id: 'props-test',
    w: 1200,
    h: 800,
    spawn: { x: 100, y: 500 },
    goal: { x: 1000, y: 300, w: 150, h: 150 },
    rects: [{ x: 0, y: 540, w: 1200, h: 200, kind: 'ground', material: 'wood' }],
    seesaws: [{ pivot: { x: 600, y: 440 }, w: 240, h: 14 }],
    crates: [{ x: 300, y: 480, w: 60, h: 60 }],
    deathY: 1000,
  };
}

describe('关卡物件', () => {
  test('抓住箱子往后拽，箱子跟着走', async () => {
    const sim = await createSim(propLevel(), 1);
    const crate = sim.props.find((p) => p.kind === 'crate')!;
    const x0 = crate.x;
    sim.teleport(0, 240, 516, { hands: [null, { x: 300, y: 510 }] });
    run(sim, 0.3, () => sim.setInput(0, input(0, 0, false, true)));
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('prop');
    run(sim, 1.5, () => sim.setInput(0, input(-1, 0.3, false, true)));
    expect(crate.x).toBeLessThan(x0 - 20);
    expect(Number.isFinite(crate.x)).toBe(true);
    sim.destroy();
  });

  test('站上跷跷板一头，板子往那头翘', async () => {
    const sim = await createSim(propLevel(), 1);
    const seesaw = sim.props.find((p) => p.kind === 'seesaw')!;
    sim.teleport(0, 680, 400);
    run(sim, 1.5);
    expect(seesaw.angle).toBeGreaterThan(0.15); // y 向下，右端下沉是正角
    expect(sim.players[0]!.dead).toBe(false);
    sim.destroy();
  });
});

describe('回放', () => {
  test('录下的输入能无头重跑，结果一致', async () => {
    const frames: PadInput[][] = [];
    for (let i = 0; i < 360; i++) {
      const t = i * dt;
      const phase = t % 1.2;
      frames.push([phase < 0.4 ? input(1, 0.6, false, false) : phase < 0.9 ? input(1, 0.2, true, true) : input(1, 0.3, false, false)]);
    }
    const replay: Replay = { level: 'proto-01', dt, players: 1, frames };
    const a = await runReplay(sampleLevel(), replay);
    const b = await runReplay(sampleLevel(), replay);
    expect(a.won).toBe(false);
    expect(a.seconds).toBeCloseTo(6, 3);
    expect(a.final[0]!.x).toBeGreaterThan(sampleLevel().spawn.x + 40);
    expect(a.final).toEqual(b.final);
    expect(a.deaths).toEqual(b.deaths);
    await expect(runReplay(sampleLevel(), { ...replay, level: 'other' })).rejects.toThrow();
  });
});

describe('步长', () => {
  test('1/60 和 1/120 喂进去走的物理步数一样多', async () => {
    const a = await createSim(sampleLevel(), 1);
    const b = await createSim(sampleLevel(), 1);
    for (let i = 0; i < 60; i++) a.step(1 / 60);
    for (let i = 0; i < 120; i++) b.step(1 / 120);
    expect(a.time).toBeCloseTo(1, 6);
    expect(b.time).toBeCloseTo(1, 6);
    expect(a.players[0]!.body.y).toBeCloseTo(b.players[0]!.body.y, 6);
    expect(CFG.step).toBeCloseTo(1 / 120, 9);
    a.destroy();
    b.destroy();
  });
});

/**
 * 推大石头（11-26）：又圆又重的石头，放在地上不动、不穿地；一个人抓着拽得慢，两个人快得多（半径翻倍重一倍）；能压踏板开门；
 * 掉出关卡过一会儿回到原地（报 boulder back）；手机局的快照带着它（物件的第 7 种）。
 */
import { describe, expect, test } from 'vitest';
import { encodeSnap, RemoteSim } from '../net/snap';
import { CFG } from './config';
import type { Level, Pt } from './level';
import { createSim, type PadInput, type Prop, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };

/** 一大块地板；地板右边断开（石头推下去会掉出关卡）；右边一块踏板开一扇门。 */
function level(extra: Partial<Level> = {}): Level {
  return {
    id: 'boulder-test',
    w: 3000,
    h: 1400,
    spawn: { x: 300, y: 600 },
    goal: { x: 2850, y: 100, w: 100, h: 100 },
    checkpoints: [],
    rects: [
      { x: 0, y: 700, w: 2400, h: 60, kind: 'ground' },
      { x: 1800, y: 688, w: 120, h: 12, kind: 'plate' },
    ],
    plates: [{ x: 1800, y: 688, w: 120, h: 12, opens: 'g1' }],
    gates: [{ id: 'g1', x: 2100, y: 400, w: 40, h: 300, move: { x: 0, y: -260 } }],
    boulders: [{ x: 1000, y: 700 - CFG.boulderR }],
    deathY: 1400,
    ...extra,
  };
}
const boulder = (sim: Sim): Prop => sim.props.find((p) => p.kind === 'boulder') as Prop;

function run(sim: Sim, seconds: number, inputs: PadInput[] = []): SimEvent[] {
  const all: SimEvent[] = [];
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    for (let i = 0; i < sim.players.length; i++) sim.setInput(i, inputs[i] ?? idle);
    sim.step(dt);
    all.push(...sim.events);
  }
  return all;
}

/** n 个人站在石头右边，两只手抓着石头，往右拽 seconds 秒：石头挪了多少。 */
async function pull(n: number, seconds: number): Promise<number> {
  const sim = await createSim(level(), n);
  const b = boulder(sim);
  const r = b.w / 2;
  run(sim, 0.5);
  for (let i = 0; i < n; i++) {
    const x = b.x + r + 40 + i * 52;
    const hands: [Pt, Pt] = [
      { x: b.x + r * 0.7, y: b.y - r * 0.55 - i * 6 },
      { x: b.x + r * 0.85, y: b.y - r * 0.2 - i * 6 },
    ];
    sim.teleport(i, x, 700 - CFG.bodyR, { hands });
  }
  const grip: PadInput = { ax: 1, ay: 0, gl: true, gr: true };
  run(sim, 0.1, Array.from({ length: n }, () => ({ ...grip, ax: 0 })));
  const x0 = b.x;
  run(sim, seconds, Array.from({ length: n }, () => grip));
  const moved = b.x - x0;
  sim.destroy();
  return moved;
}

describe('推大石头', () => {
  test('放在地上不动、不穿地；是第 7 种物件，宽高是直径', async () => {
    const sim = await createSim(level(), 1);
    run(sim, 2);
    const b = boulder(sim);
    expect(b.w).toBe(CFG.boulderR * 2);
    expect(Math.abs(b.x - 1000)).toBeLessThan(3);
    expect(Math.abs(b.y - (700 - CFG.boulderR))).toBeLessThan(3);
    sim.destroy();
  });

  test('一个人抓着拽挪得慢，两个人快得多', async () => {
    const one = await pull(1, 3);
    const two = await pull(2, 3);
    expect(one).toBeGreaterThan(40);
    expect(two).toBeGreaterThan(one * 1.4);
  });

  test('石头滚到踏板上压着，门就开', async () => {
    const sim = await createSim(level({ boulders: [{ x: 1860, y: 688 - CFG.boulderR - 2 }] }), 1);
    const evs = run(sim, 2);
    expect(evs).toContainEqual(expect.objectContaining({ type: 'plate', index: 0, on: true }));
    expect(evs.some((e) => e.type === 'gate' && e.open)).toBe(true);
    sim.destroy();
  });

  test('掉出关卡过一会儿回到原地，报 boulder back', async () => {
    const sim = await createSim(level({ boulders: [{ x: 2600, y: 300 }] }), 1);
    const evs = run(sim, 3.5);
    const back = evs.find((e) => e.type === 'boulder');
    expect(back).toEqual({ type: 'boulder', index: 0, phase: 'back', x: 2600, y: 300 });
    sim.destroy();
  });

  test('大的更重：半径翻倍重一倍', async () => {
    const sim = await createSim(level({ boulders: [{ x: 800, y: 600, r: 40 }, { x: 1200, y: 580, r: 80 }] }), 1);
    const [a, b] = sim.props.filter((p) => p.kind === 'boulder') as [Prop, Prop];
    expect(b.rb.mass() / a.rb.mass()).toBeCloseTo(2, 1);
    sim.destroy();
  });

  test('手机局：快照带着石头（种类、大小、位置、转了多少）', async () => {
    const lv = level();
    const sim = await createSim(lv, 1);
    run(sim, 0.5);
    const view = new RemoteSim(() => lv, lv);
    view.apply(encodeSnap(sim, 1), 1000);
    view.advance(1000);
    const p = view.props.find((o) => o.kind === 'boulder');
    expect(p).toBeDefined();
    expect(p!.w).toBe(CFG.boulderR * 2);
    expect(Math.abs(p!.x - boulder(sim).x)).toBeLessThan(2);
    sim.destroy();
  });
});

/**
 * 太空站的机关（A10）：失重区（里面不受重力、物件也飘，摇杆轻轻喷气、喷到 floatMax 不再加，飘出去重力回来），
 * 拉杆（有人抓着才算拉下去；门写 all 就要几根拉杆一起拉着才开，松手过 hold 秒关上），手机局快照带拉杆。
 */
import { describe, expect, test } from 'vitest';
import { encodeSnap, RemoteSim } from '../net/snap';
import { CFG } from './config';
import { leverRect, spaceLevel, type Level } from './level';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

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
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
const level = (): Level => spaceLevel();
/** 失重舱中间一块空地方（离扶手、激光都远）。 */
const AIR = { x: 1120, y: 300 };

describe('失重区', () => {
  test('飘在失重区里不往下掉；进去的时候报一声', async () => {
    const sim = await createSim(level(), 1);
    sim.teleport(0, AIR.x, AIR.y);
    const evs = run(sim, 2, () => sim.setInput(0, idle));
    const p = sim.players[0]!;
    expect(p.floating).toBe(true);
    expect(Math.abs(p.body.y - AIR.y)).toBeLessThan(30);
    expect(evs.some((e) => e.type === 'float' && e.on && e.player === 0)).toBe(true);
    sim.destroy();
  });

  test('没抓东西时摇杆喷气：往那边慢慢挪，快不过 floatMax', async () => {
    const sim = await createSim(level(), 1);
    // 失重舱下半截往左飘（激光在右上，扶手在 560 那一排上面）
    const from = { x: 1200, y: 700 };
    sim.teleport(0, from.x, from.y);
    const left: PadInput = { ...idle, ax: -1 };
    let fastest = 0;
    run(sim, 2, () => {
      sim.setInput(0, left);
      fastest = Math.max(fastest, -sim.players[0]!.body.vx);
    });
    const p = sim.players[0]!;
    expect(p.dead).toBe(false);
    expect(from.x - p.body.x).toBeGreaterThan(120);
    expect(fastest).toBeLessThan(CFG.floatMax + 25);
    expect(Math.abs(p.body.y - from.y)).toBeLessThan(40);
    sim.destroy();
  });

  test('飘出失重区（底下没有地板）重力回来，掉下去', async () => {
    const lv = level();
    const zone = lv.zerog![0]!;
    const sim = await createSim(lv, 1);
    sim.teleport(0, AIR.x, zone.y + zone.h - 60);
    const down: PadInput = { ...idle, ay: 1 };
    const evs = run(sim, 2.5, () => sim.setInput(0, down));
    expect(evs.some((e) => e.type === 'float' && !e.on)).toBe(true);
    // 掉到摔死线下面死了
    expect(evs.some((e) => e.type === 'death' && e.player === 0)).toBe(true);
    sim.destroy();
  });

  test('物件在失重区里也飘着', async () => {
    const lv = level();
    lv.crates = [{ x: AIR.x - 20, y: AIR.y - 20, w: 40, h: 40, material: 'metal' }];
    const sim = await createSim(lv, 1);
    run(sim, 2, () => sim.setInput(0, idle));
    const crate = sim.props[0]!;
    expect(crate.floating).toBe(true);
    expect(Math.abs(crate.y - AIR.y)).toBeLessThan(10);
    sim.destroy();
  });

  test('没有失重区的关：重力照旧，不报', async () => {
    const lv = level();
    delete lv.zerog;
    const sim = await createSim(lv, 1);
    sim.teleport(0, AIR.x, AIR.y);
    const evs = run(sim, 0.6, () => sim.setInput(0, idle));
    expect(sim.players[0]!.body.y - AIR.y).toBeGreaterThan(150);
    expect(evs.some((e) => e.type === 'float')).toBe(false);
    sim.destroy();
  });
});

describe('拉杆', () => {
  /** 把第 i 个人摆在第 k 根拉杆底下，一只手抓着把手。 */
  function holdLever(sim: Sim, lv: Level, i: number, k: number): void {
    const r = leverRect(lv.levers![k]!);
    const hand = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    sim.teleport(i, hand.x - 30, hand.y + 40, { hands: [hand, null] });
  }
  const hold: PadInput = { ...idle, gl: true };

  test('一个人抓着一根：那根拉下去了，门（all）不开', async () => {
    const lv = level();
    const sim = await createSim(lv, 2);
    holdLever(sim, lv, 0, 0);
    const evs = run(sim, 1.5, () => {
      sim.setInput(0, hold);
      sim.setInput(1, idle);
    });
    expect(sim.levers[0]!.on).toBe(true);
    expect(sim.levers[1]!.on).toBe(false);
    expect(evs.filter((e) => e.type === 'lever' && e.on)).toHaveLength(1);
    expect(sim.gates[0]!.open).toBe(0);
    sim.destroy();
  });

  test('两个人一起拉着两根：舱门开；都松手过 hold 秒关上', async () => {
    const lv = level();
    const sim = await createSim(lv, 2);
    holdLever(sim, lv, 0, 0);
    holdLever(sim, lv, 1, 1);
    run(sim, 2.5, () => {
      sim.setInput(0, hold);
      sim.setInput(1, hold);
    });
    expect(sim.levers.every((l) => l.on)).toBe(true);
    expect(sim.gates[0]!.open).toBe(1);
    // 松手：门还开着 hold 秒，再慢慢关上
    const evs = run(sim, lv.gates![0]!.hold! - 0.5, () => {
      sim.setInput(0, idle);
      sim.setInput(1, idle);
    });
    expect(evs.filter((e) => e.type === 'lever' && !e.on)).toHaveLength(2);
    expect(sim.gates[0]!.open).toBe(1);
    run(sim, 3, () => {
      sim.setInput(0, idle);
      sim.setInput(1, idle);
    });
    expect(sim.gates[0]!.open).toBe(0);
    sim.destroy();
  });

  test('手机局：快照带着拉着的拉杆，别的手机拼得出来', async () => {
    const lv = level();
    const sim = await createSim(lv, 2);
    const view = new RemoteSim(() => lv, lv);
    holdLever(sim, lv, 0, 1);
    run(sim, 0.5, () => {
      sim.setInput(0, hold);
      sim.setInput(1, idle);
    });
    const snap = encodeSnap(sim, 1);
    expect(snap.lr).toBe(0b10);
    view.apply(snap, 1000);
    expect(view.levers.map((l) => l.on)).toEqual([false, true]);
    expect(view.levers[1]).toMatchObject(leverRect(lv.levers![1]!));
    sim.destroy();
  });
});

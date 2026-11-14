/**
 * 踩板门（11-13，多人非配合不可的机关）：踏板有人压着就按下，连着的门挪开；没人按了过一会儿关上，有人挡着不夹人。
 */
import { describe, expect, test } from 'vitest';
import { CFG } from './config';
import { forPlayers, type Level } from './level';
import { encodeSnap, RemoteSim } from '../net/snap';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
function run(sim: Sim, seconds: number, fn?: () => void): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    fn?.();
    sim.step(dt);
    all.push(...sim.events);
  }
  return all;
}
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };

/** 一长条地，左边一块踏板，中间一扇门（墙，往上开 260），右边一块踏板也开这扇门。 */
function level(extra: Partial<Level> = {}): Level {
  return {
    id: 'gates-test',
    w: 1400,
    h: 900,
    spawn: { x: 100, y: 500 },
    goal: { x: 1250, y: 380, w: 120, h: 150 },
    rects: [{ x: 0, y: 540, w: 1400, h: 200, kind: 'ground', material: 'wood' }],
    plates: [
      { x: 200, y: 528, w: 80, h: 12, opens: 'g1' },
      { x: 1000, y: 528, w: 80, h: 12, opens: 'g1' },
    ],
    gates: [{ id: 'g1', x: 700, y: 240, w: 40, h: 300, move: { x: 0, y: -260 } }],
    deathY: 1000,
    ...extra,
  };
}
const onPlate = (sim: Sim, i: number, k: number): void => {
  const pl = sim.plates[k]!;
  sim.teleport(i, pl.x + pl.w / 2, pl.y - CFG.bodyR - 1);
};

describe('踩板门', () => {
  test('没人踩：门关着，往右推也过不去', async () => {
    const sim = await createSim(level(), 1);
    sim.teleport(0, 640, 540 - CFG.bodyR - 1);
    run(sim, 2.5, () => sim.setInput(0, { ax: 1, ay: 0.3, gl: true, gr: true }));
    expect(sim.gates[0]!.open).toBe(0);
    expect(sim.players[0]!.body.x).toBeLessThan(700);
    sim.destroy();
  });

  test('有人站上踏板：按下去，门往上挪开；下来以后过一会儿才关，关回原位', async () => {
    const sim = await createSim(level(), 1);
    onPlate(sim, 0, 0);
    const evs = run(sim, 0.3);
    expect(sim.plates[0]!.on).toBe(true);
    expect(evs.some((e) => e.type === 'plate' && e.index === 0 && e.on)).toBe(true);
    expect(evs.some((e) => e.type === 'gate' && e.open)).toBe(true);
    run(sim, 1.2);
    const g = sim.gates[0]!;
    expect(g.open).toBe(1);
    expect(g.y).toBeCloseTo(240 - 260);
    // 走开：踏板弹起来，门还开着 hold 秒，再慢慢关上
    sim.teleport(0, 400, 540 - CFG.bodyR - 1);
    const later = run(sim, CFG.gateHold * 0.5);
    expect(later.some((e) => e.type === 'plate' && !e.on)).toBe(true);
    expect(g.open).toBe(1);
    run(sim, CFG.gateHold + 1.3);
    expect(g.open).toBe(0);
    expect(g.y).toBe(240);
    sim.destroy();
  });

  test('一个人按着踏板，另一个人过得去', async () => {
    const sim = await createSim(level(), 2);
    onPlate(sim, 0, 0);
    sim.teleport(1, 640, 540 - CFG.bodyR - 1);
    run(sim, 1.5, () => sim.setInput(0, idle));
    const b = sim.players[1]!;
    // 门开了：b 往右挪过门的位置
    sim.teleport(1, 760, 540 - CFG.bodyR - 1);
    run(sim, 0.5, () => sim.setInput(0, idle));
    expect(b.body.x).toBeGreaterThan(740);
    expect(sim.plates[0]!.on).toBe(true);
    sim.destroy();
  });

  test('关的时候门底下有人：停住等，不夹人；人走了接着关', async () => {
    const sim = await createSim(level(), 2);
    onPlate(sim, 0, 0);
    run(sim, 1.5);
    // b 站到门底下，a 下踏板
    sim.teleport(1, 720, 540 - CFG.bodyR - 1);
    sim.teleport(0, 400, 540 - CFG.bodyR - 1);
    run(sim, CFG.gateHold + 2);
    const g = sim.gates[0]!;
    // 门的下沿停在 b 的头顶上面（门底 = 540 − 260 × 开到几成，b 的头顶在 491）
    expect(540 - 260 * g.open).toBeLessThan(492);
    expect(g.open).toBeGreaterThan(0.15);
    expect(sim.players[1]!.dead).toBe(false);
    expect(sim.players[1]!.body.y).toBeGreaterThan(500);
    sim.teleport(1, 900, 540 - CFG.bodyR - 1);
    run(sim, 1.5);
    expect(g.open).toBe(0);
    sim.destroy();
  });

  test('箱子压着也算按着', async () => {
    const sim = await createSim(level({ crates: [{ x: 210, y: 470, w: 56, h: 56 }] }), 1);
    sim.teleport(0, 100, 540 - CFG.bodyR - 1);
    run(sim, 0.6);
    expect(sim.plates[0]!.on).toBe(true);
    expect(sim.gates[0]!.open).toBeGreaterThan(0);
    sim.destroy();
  });

  test('`all` 的门：连着的踏板都按着才开', async () => {
    const sim = await createSim(level({ gates: [{ id: 'g1', x: 700, y: 240, w: 40, h: 300, move: { x: 0, y: -260 }, all: true }] }), 2);
    onPlate(sim, 0, 0);
    run(sim, 0.8);
    expect(sim.gates[0]!.open).toBe(0);
    onPlate(sim, 1, 1);
    run(sim, 0.8);
    expect(sim.gates[0]!.open).toBeGreaterThan(0.5);
    sim.destroy();
  });

  test('按人数摆：踏板和门也能写 players', () => {
    const lv = level({
      plates: [{ x: 200, y: 528, w: 80, h: 12, opens: 'g1', players: [3, 6] }],
      gates: [{ id: 'g1', x: 700, y: 240, w: 40, h: 300, move: { x: 0, y: -260 }, players: [3, 6] }],
    });
    expect(forPlayers(lv, 2).plates).toEqual([]);
    expect(forPlayers(lv, 2).gates).toEqual([]);
    expect(forPlayers(lv, 4).gates?.length).toBe(1);
  });

  test('手机局：快照带着踏板按没按、门开到几成，别的手机上的门在同一个地方', async () => {
    const lv = level();
    const sim = await createSim(lv, 1);
    const view = new RemoteSim(() => lv, lv);
    onPlate(sim, 0, 0);
    run(sim, 0.7);
    const snap = encodeSnap(sim, 1);
    expect(snap.pl).toBe(1);
    expect(snap.gt?.[0]).toBeGreaterThan(0);
    view.apply(snap, 1000);
    view.advance(1200);
    expect(view.plates.map((q) => q.on)).toEqual([true, false]);
    expect(view.gates[0]!.open).toBeCloseTo(sim.gates[0]!.open, 2);
    expect(view.gates[0]!.y).toBeCloseTo(sim.gates[0]!.y, 0);
    sim.destroy();
  });
});

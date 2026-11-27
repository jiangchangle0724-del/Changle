/**
 * 卷屏（11-26）：「屏幕」开局停在起点那头，delay 秒后每秒挪 speed，挪到关卡那头停；落在后面那条边外头的人被甩掉
 * （cause 'scroll'）；复活在屏幕里最靠前的检查点（到没到过都一样），屏幕里一个都没有就等一等；跑到前头的人没事。
 */
import { describe, expect, test } from 'vitest';
import { CFG } from './config';
import type { Level } from './level';
import { scrollFrame } from './motion';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };

/** 6000 宽的长地板，每 1000 像素一个检查点；屏幕 1600 宽，开局 2 秒后每秒往右 100。 */
function level(extra: Partial<Level> = {}): Level {
  return {
    id: 'scroll-test',
    w: 6000,
    h: 900,
    spawn: { x: 300, y: 600 },
    goal: { x: 5800, y: 500, w: 150, h: 150 },
    checkpoints: [1000, 2000, 3000, 4000, 5000].map((x) => ({ x, y: 600 })),
    rects: [{ x: 0, y: 700, w: 6000, h: 60, kind: 'ground' }],
    scroll: { dir: 'right', speed: 100, delay: 2, view: { w: 1600, h: 900 } },
    deathY: 1400,
    ...extra,
  };
}

function run(sim: Sim, seconds: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    for (let i = 0; i < sim.players.length; i++) sim.setInput(i, idle);
    sim.step(dt);
    all.push(...sim.events);
  }
  return all;
}

describe('卷屏', () => {
  test('屏幕：开局停在起点，delay 秒后每秒挪 speed，到关卡那头停；往上卷从最下面往上', () => {
    const lv = level();
    expect(scrollFrame(lv, 0)).toEqual({ x: 0, y: 0, w: 1600, h: 900 });
    expect(scrollFrame(lv, 2)!.x).toBe(0);
    expect(scrollFrame(lv, 12)!.x).toBeCloseTo(1000);
    expect(scrollFrame(lv, 999)!.x).toBe(6000 - 1600);
    const up: Level = { ...lv, w: 1600, h: 5000, scroll: { dir: 'up', speed: 50 } };
    expect(scrollFrame(up, 0)).toEqual({ x: 0, y: 5000 - CFG.scrollH, w: 1600, h: CFG.scrollH });
    expect(scrollFrame(up, CFG.scrollDelay + 10)!.y).toBeCloseTo(5000 - CFG.scrollH - 500);
    expect(scrollFrame({ ...lv, scroll: undefined }, 5)).toBeNull();
  });

  test('站着不动的人被屏幕甩掉（cause scroll），复活在屏幕里最靠前的检查点', async () => {
    const sim = await createSim(level(), 2);
    // 屏幕走到 x = 300 + grace 左右时，出生点那儿的人就落在后面了
    const evs = run(sim, 2 + (300 + CFG.scrollGrace + 30) / 100);
    const deaths = evs.filter((e) => e.type === 'death');
    expect(deaths.length).toBeGreaterThanOrEqual(1);
    expect(deaths[0]).toMatchObject({ type: 'death', cause: 'scroll' });
    run(sim, CFG.respawnDelay + 0.2);
    const f = sim.scrollView!;
    // 屏幕里（离两头至少 scrollMargin）最靠前的检查点是 1000（屏幕这会儿在 x ≈ 370 … 1970）
    expect(f.x).toBeGreaterThan(300);
    expect(Math.abs(sim.players[0]!.body.x - 1000)).toBeLessThan(80);
    expect(sim.players[0]!.dead).toBe(false);
    sim.destroy();
  });

  test('跑在前头的人没事', async () => {
    const sim = await createSim(level(), 1);
    sim.teleport(0, 3500, 600);
    const evs = run(sim, 6);
    expect(evs.some((e) => e.type === 'death')).toBe(false);
    sim.destroy();
  });

  test('屏幕里没有能复活的检查点就等着，等屏幕挪到下一个检查点再复活', async () => {
    // 检查点隔得太远（2600 一个）：屏幕在 1200 … 2800 之间时里头一个都没有（离两头都得 200 以上）
    const sim = await createSim(level({ checkpoints: [{ x: 2600, y: 600 }, { x: 5200, y: 600 }] }), 1);
    run(sim, 2 + 1300 / 100);
    // 屏幕这会儿在 x ≈ 1300 … 2900：2600 离右边不到 300，在里头；先把人扔到后面摔死
    sim.teleport(0, 1000, 600);
    run(sim, 0.2);
    expect(sim.players[0]!.dead).toBe(true);
    run(sim, CFG.respawnDelay + 0.2);
    expect(sim.players[0]!.dead).toBe(false);
    expect(Math.abs(sim.players[0]!.body.x - 2600)).toBeLessThan(80);
    sim.destroy();
    const early = await createSim(level({ checkpoints: [{ x: 2600, y: 600 }, { x: 5200, y: 600 }] }), 1);
    run(early, 2 + 700 / 100);
    // 屏幕在 x ≈ 700 … 2300：出生点 300 在后面、2600 还在前头外面，人死了就等着
    early.teleport(0, 400, 600);
    run(early, CFG.respawnDelay + 1);
    expect(early.players[0]!.dead).toBe(true);
    run(early, 4);
    expect(early.players[0]!.dead).toBe(false);
    expect(Math.abs(early.players[0]!.body.x - 2600)).toBeLessThan(80);
    early.destroy();
  });

  test('落在屏幕后面的大石头（托盘、钥匙也一样）过一会儿回到屏幕里最靠前的检查点上，不会再也拿不回来', async () => {
    const sim = await createSim(level({ boulders: [{ x: 200, y: 700 - CFG.boulderR }] }), 1);
    sim.teleport(0, 3200, 600);
    // 每次回来都落在那一刻的屏幕里（离后面那条边至少 scrollMargin）
    const backs: number[] = [];
    for (let k = 0; k < Math.round((2 + 10 + CFG.boulderBack + 0.5) / dt); k++) {
      sim.setInput(0, idle);
      sim.step(dt);
      for (const e of sim.events) {
        if (e.type !== 'boulder') continue;
        const f = sim.scrollView!;
        expect(e.x).toBeGreaterThanOrEqual(f.x + CFG.scrollMargin);
        expect(e.x).toBeLessThan(f.x + f.w);
        backs.push(e.x);
      }
    }
    expect(backs.length).toBeGreaterThan(0);
    sim.destroy();
  });

  test('没有卷屏的关一点不变', async () => {
    const sim = await createSim(level({ scroll: undefined }), 1);
    const evs = run(sim, 12);
    expect(evs.some((e) => e.type === 'death')).toBe(false);
    expect(sim.scrollView).toBeNull();
    sim.destroy();
  });
});

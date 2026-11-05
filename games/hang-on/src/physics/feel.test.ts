/**
 * 20 条手感检查，从 proto/sim.test.mjs 移植到 Rapier 版。
 * 规矩（CONTRACTS.md）：允许调阈值，不允许删检查。每条的原型数值写在注释里，方便对照。
 */
import { describe, expect, test } from 'vitest';
import { ARM_LEN, CFG, TETHER_LEN } from './config';
import { sampleLevel } from './level';
import { createSim, type Sim } from './world';

const dt = 1 / 60;
const log = (m: string): void => console.log('ok  ', m);

function run(sim: Sim, seconds: number, fn?: (t: number) => void): void {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    fn?.(i * dt);
    sim.step(dt);
  }
}
function finite(sim: Sim): boolean {
  for (const p of sim.players) {
    if (!Number.isFinite(p.body.x) || !Number.isFinite(p.body.y)) return false;
    for (const arm of p.arms) for (const q of arm.pts) if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return false;
  }
  return true;
}
const input = (ax: number, ay: number, gl: boolean, gr: boolean) => ({ ax, ay, gl, gr });

describe('手感检查（Rapier 版）', () => {
  // 1. 静止站在台子上，不抖不沉（原型误差 0.0 px）
  test('1. rests on the start ledge', async () => {
    const sim = await createSim(sampleLevel(), 1);
    run(sim, 2);
    const b = sim.players[0]!.body;
    expect(finite(sim)).toBe(true);
    expect(Math.abs(b.y - (640 - CFG.bodyR))).toBeLessThan(2);
    log(`rests on ledge at y=${b.y.toFixed(1)}`);
    expect(sim.players[0]!.ground).toBe(true);
    log('ground flag set');
    sim.destroy();
  });

  // 2. 胳膊朝指向伸，长度不超过胳膊（原型伸出 65 px）
  test('2. reaches toward the aim without gripping; arm stays within reach', async () => {
    const sim = await createSim(sampleLevel(), 1);
    const p = sim.players[0]!;
    run(sim, 1.5, () => sim.setInput(0, input(1, -0.3, false, false)));
    const h = p.arms[1].hand;
    const sx = p.body.x + CFG.shoulderDX;
    const sy = p.body.y + CFG.shoulderDY;
    const d = Math.hypot(h.x - sx, h.y - sy);
    expect(d).toBeGreaterThan(60);
    expect(d).toBeLessThanOrEqual(ARM_LEN + 1);
    log(`right hand reaches ${d.toFixed(0)} px toward aim`);
    expect(h.x).toBeGreaterThan(p.body.x + 50);
    log('hand is on the aimed side');
    sim.destroy();
  });

  // 3. 抓地往前拽，没有跳跃时的移动方式（原型 6 秒前进 139 px）
  test('3. grabs the ground and pulls forward (inchworm): x advances', async () => {
    const sim = await createSim(sampleLevel(), 1);
    const p = sim.players[0]!;
    const x0 = p.body.x;
    run(sim, 6, (t) => {
      const phase = t % 1.2;
      if (phase < 0.4) sim.setInput(0, input(1, 0.6, false, false)); // 伸向前下
      else if (phase < 0.9) sim.setInput(0, input(1, 0.2, true, true)); // 抓住，把身体拽过去
      else sim.setInput(0, input(1, 0.3, false, false)); // 松开
    });
    expect(finite(sim)).toBe(true);
    expect(p.body.x).toBeGreaterThan(x0 + 40);
    log(`crawled forward ${(p.body.x - x0).toFixed(0)} px`);
    sim.destroy();
  });

  // 4. 抓住台阶侧面，往上推就翻上去（原型翻上 79 px，手不松）
  test("4. grabs the step's face from the ledge; aiming up mantles over it", async () => {
    const sim = await createSim(sampleLevel(), 1);
    const p = sim.players[0]!;
    sim.teleport(0, 556, 576); // 第二块台上，台阶（x 600..650，顶 500）左边
    run(sim, 0.5, () => sim.setInput(0, input(1, -0.15, false, false))); // 伸向台阶侧面，还不抓
    run(sim, 0.5, () => sim.setInput(0, input(1, -0.15, false, true))); // 抓
    const grip = p.arms[1].grip;
    expect(grip?.kind).toBe('terrain');
    expect(grip?.rect?.kind).toBe('step');
    log(`grabbed the step at (${grip!.x.toFixed(0)}, ${grip!.y.toFixed(0)})`);
    const yBefore = p.body.y;
    run(sim, 2.0, () => sim.setInput(0, input(0.3, -1, false, true))); // 往上推：翻
    expect(finite(sim)).toBe(true);
    expect(p.body.y).toBeLessThan(yBefore - 40);
    log(`climbed ${(yBefore - p.body.y).toFixed(0)} px by aiming up`);
    expect(p.arms[1].grip).not.toBeNull();
    log('kept the grip while climbing');
    sim.destroy();
  });

  // 5. 抓住绳子，按节奏左右发力（原型荡幅 107 px）
  test('5. rope: grab the handle, pump in rhythm, and the rope swings wide', async () => {
    const sim = await createSim(sampleLevel(), 1);
    const p = sim.players[0]!;
    const handle = sim.ropes[0]!.handle;
    sim.teleport(0, handle.x - 30, handle.y + 40);
    const hx0 = handle.x;
    run(sim, 0.6, () => sim.setInput(0, input(0.45, -0.89, false, true))); // 右手直指绳尾
    expect(p.arms[1].grip?.kind).toBe('rope');
    log('right hand latched onto the rope handle');
    let maxSwing = 0;
    run(sim, 8, (t) => {
      sim.setInput(0, input(Math.sin((2 * Math.PI * t) / 3.0) > 0 ? 1 : -1, 0.2, false, true));
      maxSwing = Math.max(maxSwing, Math.abs(handle.x - hx0));
    });
    expect(maxSwing).toBeGreaterThan(60);
    log(`rope swung up to ${maxSwing.toFixed(0)} px when pumped in rhythm`);
    expect(finite(sim)).toBe(true);
    sim.destroy();
  });

  // 6a. 在地上抓住队友
  test('6a. grabbing another player on the ground', async () => {
    const sim = await createSim(sampleLevel(), 2);
    const [a, b] = sim.players as [Sim['players'][0], Sim['players'][0]]; // 出生点相距 44 px
    // 原型推满摇杆也能碰上；刚体版手是准的，推 0.4 正好把手心放到队友身上（摇杆推一半伸一半）
    run(sim, 0.4, () => {
      sim.setInput(0, input(0, 0, false, false));
      sim.setInput(1, input(-0.4, -0.05, false, false)); // 先把手抬到队友身上
    });
    run(sim, 0.6, () => {
      sim.setInput(0, input(0, 0, false, false));
      sim.setInput(1, input(-0.4, -0.05, true, false));
    });
    expect(b.arms[0].grip?.kind).toBe('player');
    expect(b.arms[0].grip?.player).toBe(a.id);
    log('P2 grabbed P1 on the ground');
    sim.destroy();
  });

  // 6b. 一个人抓绳子、另一个抓他，当两个人的链吊 3 秒（原型：两人都在，胳膊没被拉长）
  test('6b. a hanging chain holds: P1 on the rope handle, P2 on P1, 3 s', async () => {
    const sim = await createSim(sampleLevel(), 2);
    const [a, b] = sim.players as [Sim['players'][0], Sim['players'][0]];
    const handle = sim.ropes[0]!.handle;
    const hy0 = handle.y;
    sim.teleport(0, handle.x - 20, handle.y + 80, { hands: [null, { x: handle.x, y: handle.y }] });
    sim.teleport(1, handle.x - 20, handle.y + 180, { hands: [{ x: a.body.x, y: a.body.y + CFG.bodyR }, null] });
    run(sim, 3.0, () => {
      sim.setInput(0, input(0, 0, false, true));
      sim.setInput(1, input(0, 0, true, false));
    });
    expect(finite(sim)).toBe(true);
    expect(a.dead).toBe(false);
    expect(b.dead).toBe(false);
    log(`both still hanging after 3 s (P1 y ${a.body.y.toFixed(0)}, P2 y ${b.body.y.toFixed(0)})`);
    expect(a.arms[1].grip?.kind).toBe('rope');
    expect(b.arms[0].grip?.player).toBe(a.id);
    log('grips intact');
    // 原型把手心钉在粒子中心，这里钉在表面最近点，所以量到抓点而不是对方中心
    const g1 = a.arms[1].grip!;
    const d1 = Math.hypot(a.body.x - g1.x, a.body.y - g1.y);
    expect(d1).toBeLessThanOrEqual(TETHER_LEN + 6);
    log(`P1 stays within one arm of the handle (${d1.toFixed(0)} px)`);
    const g2 = b.arms[0].grip!;
    const d2 = Math.hypot(b.body.x - g2.x, b.body.y - g2.y);
    expect(d2).toBeLessThanOrEqual(TETHER_LEN + 6);
    log(`P2 stays within one arm of P1 (${d2.toFixed(0)} px to the grab point)`);
    log(handle.y > hy0 + 2 ? `rope sags ${(handle.y - hy0).toFixed(0)} px under two bodies` : 'rope barely sags');
    sim.destroy();
  });

  // 7. 掉出世界复活在起点，计一次死
  test('7. falling off the world respawns at the spawn point and counts a death', async () => {
    const sim = await createSim(sampleLevel(), 1);
    const p = sim.players[0]!;
    sim.teleport(0, 800, 900);
    run(sim, 2.5);
    expect(p.deaths).toBe(1);
    expect(p.dead).toBe(false);
    expect(Math.abs(p.body.x - sim.level.spawn.x)).toBeLessThan(5);
    log('died once and respawned at start');
    sim.destroy();
  });

  // 8. 所有人进终点才算过关
  test('8. win: all players in the goal zone', async () => {
    const sim = await createSim(sampleLevel(), 2);
    const g = sim.level.goal;
    sim.players.forEach((_, i) => sim.teleport(i, g.x + g.w / 2 + i * 30, g.y + g.h - 30));
    run(sim, 1);
    expect(sim.won).toBe(true);
    log('level completes when everyone is in the goal');
    sim.destroy();
  });

  // 9. 4 个人乱按 20 秒：没有数值爆炸，没有一帧穿进地形
  test('9. stress: 4 players mashing random inputs for 20 s stay finite and never tunnel', async () => {
    const sim = await createSim(sampleLevel(), 4);
    let seed = 7;
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let tunnelled = 0;
    run(sim, 20, () => {
      sim.players.forEach((_, i) => sim.setInput(i, input(rnd() * 2 - 1, rnd() * 2 - 1, rnd() < 0.5, rnd() < 0.5)));
      for (const p of sim.players) {
        for (const r of sim.level.rects) {
          const b = p.body;
          if (b.x > r.x + 4 && b.x < r.x + r.w - 4 && b.y > r.y + 4 && b.y < r.y + r.h - 4) tunnelled++;
        }
      }
    });
    expect(finite(sim)).toBe(true);
    log('20 s of 4-player mashing stays finite');
    expect(tunnelled).toBe(0);
    log('no body ever ended a frame inside terrain');
    sim.destroy();
  });
});

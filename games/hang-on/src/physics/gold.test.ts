/**
 * 抢金元宝（A9d）：场地中间一个金元宝，只有一个人抓着时攒时间，攒够 CFG.goldHold 秒赢一局；几个人同时抓着谁都不算；
 * 元宝掉出去回到中间；摔了回自己那边；没有召唤。
 */
import { describe, expect, test } from 'vitest';
import { GOLD_ARENAS } from '../levels';
import { CFG } from './config';
import type { Level } from './level';
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
const hold: PadInput = { ax: 0, ay: 0, gl: true, gr: true };
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
const arena = (): Level => GOLD_ARENAS[0] as Level;

/** 第 i 个人两只手放到元宝两边抓住。 */
function grabIngot(sim: Sim, i: number, side = 0): void {
  const ingot = sim.props[sim.gold!.prop]!;
  const dx = side * 10;
  sim.teleport(i, ingot.x + dx, ingot.y - 50, { hands: [{ x: ingot.x - 14 + dx, y: ingot.y - 6 }, { x: ingot.x + 14 + dx, y: ingot.y - 6 }] });
}

describe('抢金元宝', () => {
  test('两块场地：元宝放在中间的台子上，每个站位脚下都有台子', async () => {
    expect(GOLD_ARENAS.length).toBe(2);
    for (const lv of GOLD_ARENAS) {
      const sim = await createSim(lv, 6, { mode: 'gold' });
      run(sim, 1.5);
      const ingot = sim.props[sim.gold!.prop]!;
      expect(ingot.kind).toBe('ingot');
      expect(Math.abs(ingot.x - lv.ingot!.x)).toBeLessThan(6);
      expect(Math.abs(ingot.y - lv.ingot!.y)).toBeLessThan(8);
      for (const p of sim.players) {
        expect(p.dead, `${lv.id} P${p.id}`).toBe(false);
        expect(p.ground, `${lv.id} P${p.id}`).toBe(true);
      }
      sim.destroy();
    }
  });

  test('一个人抓着：攒时间，每攒一秒报一次；攒够就赢这一局', async () => {
    const sim = await createSim(arena(), 2, { mode: 'gold' });
    run(sim, 0.5);
    sim.setInput(0, hold);
    grabIngot(sim, 0);
    const evs = run(sim, CFG.goldHold + 1, () => sim.setInput(0, hold));
    expect(evs.filter((e) => e.type === 'gold' && e.player === 0).length).toBeGreaterThanOrEqual(CFG.goldHold);
    expect(sim.won).toBe(true);
    expect(sim.winners).toEqual([0]);
    expect(evs.some((e) => e.type === 'win' && e.who?.[0] === 0)).toBe(true);
    sim.destroy();
  });

  test('两个人一起抓着：谁都不算', async () => {
    const sim = await createSim(arena(), 2, { mode: 'gold' });
    run(sim, 0.5);
    sim.setInput(0, hold);
    sim.setInput(1, hold);
    grabIngot(sim, 0, -1);
    grabIngot(sim, 1, 1);
    run(sim, 2, () => {
      sim.setInput(0, hold);
      sim.setInput(1, hold);
    });
    const g = sim.gold!;
    expect(sim.players.every((p) => p.arms.some((a) => a.grip?.kind === 'prop'))).toBe(true);
    expect(g.holder).toBe(-1);
    expect(Math.max(...g.holdT)).toBeLessThan(0.5);
    expect(sim.won).toBe(false);
    sim.destroy();
  });

  test('元宝掉出去：一秒后回到中间', async () => {
    const lv = arena();
    const sim = await createSim(lv, 2, { mode: 'gold' });
    run(sim, 0.3);
    const ingot = sim.props[sim.gold!.prop]!;
    ingot.rb.setTranslation({ x: 60, y: lv.deathY + 50 }, true);
    const evs = run(sim, CFG.ingotBack + 0.5);
    expect(evs.some((e) => e.type === 'gold' && e.player === -1)).toBe(true);
    run(sim, 0.8);
    expect(Math.abs(ingot.x - lv.ingot!.x)).toBeLessThan(10);
    sim.destroy();
  });

  test('摔了回自己那边；没有召唤', async () => {
    const lv = arena();
    const sim = await createSim(lv, 2, { mode: 'gold' });
    run(sim, 0.3);
    sim.teleport(1, 640, lv.deathY + 40);
    run(sim, CFG.respawnDelay + 0.3, () => sim.setInput(0, { ...idle, act: 'summon' }));
    const p = sim.players[1]!;
    expect(p.dead).toBe(false);
    const sp = lv.spawns![1]!;
    expect(Math.abs(p.body.x - sp.x)).toBeLessThan(60);
    sim.destroy();
  });
});

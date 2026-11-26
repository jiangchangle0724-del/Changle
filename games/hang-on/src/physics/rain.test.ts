/**
 * 红包雨（11-26，彩蛋小游戏）：抢元宝的场地上天上掉红包；身体或手碰到就接到；时间到了接得多的赢
 * （一样多都赢，一个都没接到没人赢）；手机局快照带着；结算按接到几个排。
 */
import { describe, expect, test } from 'vitest';
import { AchvRound } from '../achievements';
import { coins } from '../host/gacha';
import { GOLD_ARENAS, levelsFor } from '../levels';
import { encodeSnap, RemoteSim } from '../net/snap';
import { resultsOf, resultsTitle } from '../results';
import { CFG } from './config';
import type { Level } from './level';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
function run(sim: Sim, seconds: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    for (let p = 0; p < sim.players.length; p++) sim.setInput(p, idle);
    sim.step(dt);
    all.push(...sim.events);
    if (sim.won) break;
  }
  return all;
}
const arena = (): Level => GOLD_ARENAS[0] as Level;

describe('红包雨', () => {
  test('用抢元宝的场地，不放元宝；一个人也能玩', async () => {
    expect(levelsFor('rain')).toBe(GOLD_ARENAS);
    const sim = await createSim(arena(), 1, { mode: 'rain' });
    expect(sim.rain).not.toBeNull();
    expect(sim.gold).toBeNull();
    expect(sim.props.some((p) => p.kind === 'ingot')).toBe(false);
    expect(sim.rain!.left).toBe(CFG.rainTime);
    sim.destroy();
  });

  test('隔一会儿掉一个，往下飘；掉出场地的不要了', async () => {
    const sim = await createSim(arena(), 1, { mode: 'rain' });
    run(sim, 3);
    expect(sim.rain!.drops.length).toBeGreaterThan(3);
    for (const d of sim.rain!.drops) expect(d.x).toBeGreaterThan(40);
    run(sim, 12);
    for (const d of sim.rain!.drops) expect(d.y).toBeLessThan(arena().h + 41);
    sim.destroy();
  });

  test('身体碰到就接到：报 raincatch，记在那个人头上，那个红包没了', async () => {
    const sim = await createSim(arena(), 2, { mode: 'rain' });
    run(sim, 1);
    const p = sim.players[1]!;
    sim.rain!.drops.push({ id: 999, x: p.body.x, y: p.body.y - 10, vy: 0, ph: 0 });
    const evs = run(sim, dt);
    expect(evs).toContainEqual(expect.objectContaining({ type: 'raincatch', player: 1 }));
    expect(sim.rain!.caught[1]).toBe(1);
    expect(sim.rain!.drops.some((d) => d.id === 999)).toBe(false);
    sim.destroy();
  });

  test('时间到了接得多的赢；一样多都赢；一个都没接到没人赢', async () => {
    const a = await createSim(arena(), 3, { mode: 'rain' });
    a.rain!.caught = [2, 5, 1];
    a.rain!.left = 0.05;
    a.rain!.drops = [];
    a.rain!.nextT = 99;
    const evs = run(a, 0.2);
    expect(evs).toContainEqual({ type: 'win', who: [1] });
    expect(a.won).toBe(true);
    const r = resultsOf(a);
    expect(r.mode).toBe('rain');
    expect(r.caught).toEqual([2, 5, 1]);
    expect(resultsTitle(r, (i) => `P${i + 1}`)).toContain('P2');
    a.destroy();
    const tie = await createSim(arena(), 2, { mode: 'rain' });
    tie.rain!.caught = [3, 3];
    tie.rain!.left = 0.01;
    tie.rain!.nextT = 99;
    expect(run(tie, 0.1)).toContainEqual({ type: 'win', who: [0, 1] });
    tie.destroy();
    const none = await createSim(arena(), 2, { mode: 'rain' });
    none.rain!.left = 0.01;
    none.rain!.nextT = 99;
    expect(run(none, 0.1)).toContainEqual({ type: 'win', who: [] });
    none.destroy();
  });

  test('手机局：快照带着还剩几秒、每个人接到几个、天上的红包', async () => {
    const sim = await createSim(arena(), 2, { mode: 'rain' });
    run(sim, 2);
    sim.rain!.caught = [4, 1];
    const view = new RemoteSim(() => arena(), arena());
    view.apply(encodeSnap(sim, 1), 1000);
    expect(view.rain?.caught).toEqual([4, 1]);
    expect(view.rain?.drops).toHaveLength(sim.rain!.drops.length);
    expect(Math.abs((view.rain?.left ?? 0) - sim.rain!.left)).toBeLessThan(0.1);
    sim.destroy();
  });

  test('赢的人拿「红包王」；接到的放进扭蛋机能花', () => {
    expect(new AchvRound({ mode: 'rain', tier: 0, long: false }).onWin([1], { players: 2, deaths: 0, envelopes: { got: 0, of: 0 }, goals: null })).toEqual([{ player: 1, id: 'rainking' }]);
    expect(coins({ spent: 6, got: [], bonus: 10 }, 3)).toBe(7);
    expect(coins({ spent: 0, got: [] }, 3), '以前存的没有 bonus 也行').toBe(3);
  });
});

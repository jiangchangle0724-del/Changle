/**
 * A7：6 个人，和开局前选的玩法（比谁先、坐不住），定时塌的东西，坐不住时手抓久了会滑。
 */
import { describe, expect, test } from 'vitest';
import { ARENAS, LEVELS, levelsFor } from '../levels';
import { resultsOf } from '../results';
import { CFG } from './config';
import type { Level } from './level';
import { createSim, type PadInput, type Rules, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
function run(sim: Sim, seconds: number, fn?: (t: number) => void): SimEvent[] {
  const out: SimEvent[] = [];
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    fn?.(i * dt);
    sim.step(dt);
    out.push(...sim.events);
  }
  return out;
}

/** 一大块平地，左边起点，右边终点，中间一个检查点。 */
function flat(extra: Partial<Level> = {}): Level {
  return {
    id: 'modes-test',
    world: 'table',
    w: 1600,
    h: 900,
    spawn: { x: 100, y: 500 },
    goal: { x: 1400, y: 380, w: 150, h: 150 },
    checkpoints: [{ x: 700, y: 516 }],
    rects: [{ x: 0, y: 540, w: 1600, h: 200, kind: 'ground', material: 'wood' }],
    deathY: 1000,
    ...extra,
  };
}
const goalIn = (sim: Sim, i: number): void => sim.teleport(i, 1470, 516);
const drop = (sim: Sim, i: number): void => sim.teleport(i, sim.players[i]!.body.x, 1100);
const race = (teams?: number[]): Rules => (teams ? { mode: 'race', teams } : { mode: 'race' });
const LAST: Rules = { mode: 'last' };

describe('6 个人', () => {
  test('每一关、每个场地 6 个人都站得住，站一会儿没人掉下去', async () => {
    for (const level of [...LEVELS, ...ARENAS]) {
      const sim = await createSim(level, 6);
      expect(sim.players).toHaveLength(6);
      run(sim, 1.5);
      expect(sim.players.map((p) => p.deaths), level.id).toEqual([0, 0, 0, 0, 0, 0]);
      sim.destroy();
    }
  });

  test('每个检查点复活 6 个人都有落脚（第 5、6 个站到台子外面就往旁边挪）', async () => {
    for (const level of LEVELS) {
      const cps = level.checkpoints ?? [];
      for (let j = 0; j < cps.length; j++) {
        const sim = await createSim(level, 6);
        sim.checkpoint = j;
        for (let i = 0; i < 6; i++) drop(sim, i);
        run(sim, CFG.respawnDelay + 0.2);
        expect(sim.players.every((p) => !p.dead), `${level.id} checkpoint ${j}`).toBe(true);
        const deaths = sim.players.map((p) => p.deaths);
        run(sim, 1.5);
        expect(sim.players.map((p) => p.deaths), `${level.id} checkpoint ${j}: fell again after respawning`).toEqual(deaths);
        sim.destroy();
      }
    }
  });
});

describe('比谁先', () => {
  test('各跑各的：到终点的停在那；只剩一个人没到就完，第一个到的赢', async () => {
    const sim = await createSim(flat(), 3, race());
    goalIn(sim, 1);
    const a = run(sim, 0.1);
    expect(a.find((e) => e.type === 'finish')).toEqual({ type: 'finish', player: 1, place: 1 });
    expect(sim.players[1]!.done).toBe(true);
    expect(sim.won).toBe(false);
    // 到了的人钉在终点里：不动，也不会死
    const at = { ...sim.players[1]!.body };
    run(sim, 1, () => sim.setInput(1, { ax: -1, ay: 0, gl: false, gr: false }));
    expect(Math.abs(sim.players[1]!.body.x - at.x)).toBeLessThan(1);
    goalIn(sim, 0);
    const b = run(sim, 0.1);
    expect(b.find((e) => e.type === 'finish')).toMatchObject({ player: 0, place: 2 });
    expect(sim.won).toBe(true);
    expect(sim.winners).toEqual([1]);
    expect(b.find((e) => e.type === 'win')).toEqual({ type: 'win', who: [1] });
    expect(sim.players[2]!.face).not.toBe('win');
    const r = resultsOf(sim);
    expect(r.mode).toBe('race');
    expect(r.order?.map(([i]) => i)).toEqual([1, 0, 2]);
    expect(r.order?.[2]?.[1]).toBeNull();
    sim.destroy();
  });

  test('第一个到了以后最多再等 raceGrace 秒', async () => {
    const sim = await createSim(flat(), 3, race());
    goalIn(sim, 2);
    run(sim, CFG.raceGrace - 1);
    expect(sim.won).toBe(false);
    run(sim, 1.5);
    expect(sim.won).toBe(true);
    expect(sim.winners).toEqual([2]);
    sim.destroy();
  });

  test('分两队：一队的人都到了，那一队赢；召唤只拉自己队的', async () => {
    const sim = await createSim(flat(), 4, race([0, 1, 0, 1]));
    drop(sim, 1);
    run(sim, 0.1);
    // 0 号是甜队，拉不回咸队的 1 号；3 号是咸队，拉得回来
    sim.setInput(0, { ...idle, act: 'summon' });
    let evs = run(sim, 0.1);
    expect(evs.some((e) => e.type === 'summon')).toBe(false);
    sim.setInput(3, { ...idle, act: 'summon' });
    evs = run(sim, 0.1);
    expect(evs.find((e) => e.type === 'summon')).toMatchObject({ player: 3, who: [1] });
    goalIn(sim, 0);
    run(sim, 0.1);
    expect(sim.won).toBe(false);
    goalIn(sim, 2);
    run(sim, 0.1);
    expect(sim.won).toBe(true);
    expect(sim.winners).toEqual([0, 2]);
    expect(resultsOf(sim).teams).toEqual([0, 1, 0, 1]);
    sim.destroy();
  });

  test('各有各的检查点：谁过了谁回那里', async () => {
    const sim = await createSim(flat(), 2, race());
    sim.teleport(0, 700, 516);
    const evs = run(sim, 0.1);
    expect(evs.find((e) => e.type === 'checkpoint')).toEqual({ type: 'checkpoint', index: 0, player: 0 });
    drop(sim, 0);
    drop(sim, 1);
    run(sim, CFG.respawnDelay + 0.2);
    expect(Math.abs(sim.players[0]!.body.x - 700)).toBeLessThan(80);
    expect(sim.players[1]!.body.x).toBeLessThan(300);
    sim.destroy();
  });
});

describe('坐不住', () => {
  test('摔了就出局，不复活；只剩一个人挂着他就赢', async () => {
    const sim = await createSim(flat(), 3, LAST);
    drop(sim, 0);
    const a = run(sim, 0.1);
    expect(a.find((e) => e.type === 'out')).toEqual({ type: 'out', player: 0 });
    run(sim, 3);
    expect(sim.players[0]!.dead).toBe(true);
    expect(sim.players[0]!.deaths).toBe(1);
    // 召唤也拉不回来
    sim.setInput(1, { ...idle, act: 'summon' });
    expect(run(sim, 0.1).some((e) => e.type === 'summon')).toBe(false);
    drop(sim, 2);
    run(sim, 0.1);
    expect(sim.won).toBe(true);
    expect(sim.winners).toEqual([1]);
    const r = resultsOf(sim);
    expect(r.order?.map(([i]) => i)).toEqual([1, 2, 0]);
    sim.destroy();
  });

  test('最后两个一起掉下去是平局', async () => {
    const sim = await createSim(flat(), 2, LAST);
    drop(sim, 0);
    drop(sim, 1);
    run(sim, 0.1);
    expect(sim.won).toBe(true);
    expect(sim.winners).toEqual([0, 1]);
    sim.destroy();
  });

  test('一个地方抓久了手会滑，滑了一会儿抓不了；闯关不会', async () => {
    const peg = { x: 400, y: 300, w: 200, h: 24, kind: 'peg', material: 'wood' };
    const hold: PadInput = { ax: 0, ay: 0, gl: true, gr: true };
    for (const rules of [LAST, { mode: 'climb' } as Rules]) {
      const sim = await createSim(flat({ rects: [...flat().rects, peg] }), 1, rules);
      sim.teleport(0, 470, 360, { hands: [{ x: 450, y: 326 }, { x: 490, y: 326 }] });
      run(sim, 0.2, () => sim.setInput(0, hold));
      expect(sim.players[0]!.arms.every((a) => a.grip)).toBe(true);
      const evs = run(sim, CFG.lastGripMax + 0.2, () => sim.setInput(0, hold));
      const slips = evs.filter((e) => e.type === 'slip');
      if (rules.mode === 'last') {
        expect(slips).toHaveLength(2);
        expect(sim.players[0]!.arms.every((a) => !a.grip)).toBe(true);
      } else {
        expect(slips).toHaveLength(0);
        expect(sim.players[0]!.arms.every((a) => a.grip)).toBe(true);
      }
      sim.destroy();
    }
  });

  test('场地：每种玩法有自己的一串，场地最后什么都不剩，大家都会掉', async () => {
    expect(levelsFor('last')).toBe(ARENAS);
    expect(levelsFor('race')).toBe(LEVELS);
    for (const arena of ARENAS) {
      const sim = await createSim(arena, 2, LAST);
      // 两个人一直按着抓、一动不动：平台塌完、抓久了手滑，迟早都掉下去
      run(sim, 100, () => sim.players.forEach((_, i) => sim.setInput(i, { ax: 0, ay: 0, gl: true, gr: true })));
      expect(sim.won, arena.id).toBe(true);
      sim.destroy();
    }
  });
});

describe('定时塌的东西（until）', () => {
  test('平台到点塌，站在上面的人掉下去；提前抖、塌了有事件', async () => {
    const shelf = { x: 400, y: 300, w: 200, h: 24, kind: 'step', material: 'wood', until: 1 };
    const sim = await createSim(flat({ rects: [...flat().rects, shelf] }), 1);
    sim.teleport(0, 480, 300 - CFG.bodyR - 1);
    run(sim, 0.5);
    expect(sim.players[0]!.body.y).toBeLessThan(300);
    const evs = run(sim, 1);
    expect(evs.find((e) => e.type === 'crumble')).toMatchObject({ x: 400, y: 300, w: 200, h: 24 });
    expect(sim.players[0]!.body.y).toBeGreaterThan(400);
    sim.destroy();
  });

  test('饼干、会动的台子、转杆也会塌：塌了的饼干不再回来', async () => {
    const sim = await createSim(
      flat({
        fading: [{ x: 300, y: 200, w: 80, h: 20, on: 1, off: 1, until: 1.5 }],
        movers: [{ x: 600, y: 200, w: 100, h: 20, path: [{ x: 800, y: 200 }], speed: 50, until: 1 }],
        spinners: [{ pivot: { x: 1100, y: 250 }, arms: 2, len: 80, spin: 1, until: 1 }],
      }),
      1,
    );
    const evs = run(sim, 4);
    expect(evs.filter((e) => e.type === 'crumble')).toHaveLength(3);
    expect(sim.fadings[0]!.on).toBe(false);
    expect(sim.fadings[0]!.left).toBe(99);
    sim.destroy();
  });
});

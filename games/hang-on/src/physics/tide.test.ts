/**
 * 新机关（A12）第一批：涨潮（开局 delay 秒后按 speed 涨、淹了算 tide 死、有人回来水退下去停一会儿）、
 * 会塌的台子（有人站上去或抓住才开始倒数、到点塌、过 regrow 秒长回来），手机局快照带水面和台子。
 */
import { describe, expect, test } from 'vitest';
import { encodeSnap, RemoteSim } from '../net/snap';
import { CFG } from './config';
import type { Level } from './level';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
function run(sim: Sim, seconds: number, input: PadInput = idle): SimEvent[] {
  const all: SimEvent[] = [];
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    sim.players.forEach((_, i) => sim.setInput(i, input));
    sim.step(dt);
    all.push(...sim.events);
  }
  return all;
}

/** 出生台在 y = 600，底下一块低台在 y = 900（站上去等水淹），死线 1200。 */
function tideLevel(): Level {
  return {
    id: 'tide-test',
    w: 2000,
    h: 1300,
    spawn: { x: 300, y: 560 },
    goal: { x: 1800, y: 100, w: 100, h: 100 },
    checkpoints: [],
    rects: [
      { x: 100, y: 600, w: 400, h: 40, kind: 'ground' },
      { x: 900, y: 900, w: 400, h: 40, kind: 'ground' },
    ],
    deathY: 1200,
    tide: { speed: 60, delay: 1, from: 1150, top: 300 },
  };
}

describe('涨潮', () => {
  test('没写涨潮的关：没有水面，不报', async () => {
    const lv = tideLevel();
    delete lv.tide;
    const sim = await createSim(lv, 1);
    const evs = run(sim, 2);
    expect(sim.tideY).toBeNull();
    expect(evs.some((e) => e.type === 'tide')).toBe(false);
    sim.destroy();
  });

  test('开局 delay 秒后开始涨，报 rise，按 speed 往上走', async () => {
    const sim = await createSim(tideLevel(), 1);
    let evs = run(sim, 0.9);
    expect(sim.tideY).toBe(1150);
    evs = run(sim, 2.1);
    expect(evs.some((e) => e.type === 'tide' && e.phase === 'rise')).toBe(true);
    // 涨了大约 2 秒
    expect(sim.tideY!).toBeLessThan(1150 - 60 * 1.8);
    expect(sim.tideY!).toBeGreaterThan(1150 - 60 * 2.2);
    sim.destroy();
  });

  test('站在低台上不动：水淹过来算 tide 死；回出生台时水退到那下面 tideGap，先停一会儿', async () => {
    const sim = await createSim(tideLevel(), 1);
    sim.teleport(0, 1100, 860);
    const evs = run(sim, 8);
    const death = evs.find((e) => e.type === 'death' && e.player === 0);
    expect(death && death.type === 'death' ? death.cause : null).toBe('tide');
    const back = evs.find((e) => e.type === 'tide' && e.phase === 'back');
    expect(back).toBeDefined();
    // 回来以后：出生台在 560，水面不高过 560 + tideGap
    const respawn = evs.findIndex((e) => e.type === 'respawn');
    expect(respawn).toBeGreaterThan(-1);
    expect(sim.players[0]!.dead).toBe(false);
    expect(sim.tideY!).toBeGreaterThanOrEqual(560 + CFG.tideGap - 60 * (8 - CFG.tidePause));
    sim.destroy();
  });

  test('手机局：快照带水面', async () => {
    const lv = tideLevel();
    const sim = await createSim(lv, 1);
    run(sim, 2);
    const snap = encodeSnap(sim, 1);
    expect(snap.td).toBeCloseTo(sim.tideY!, 0);
    const view = new RemoteSim(() => lv, lv);
    view.apply(snap, 1000);
    expect(view.tideY).toBeCloseTo(sim.tideY!, 0);
    sim.destroy();
  });
});

/** 出生在一块会塌的台子上（1 秒塌、2 秒长回来），底下是大地板。 */
function crumbleLevel(): Level {
  return {
    id: 'crumble-test',
    w: 2000,
    h: 1300,
    spawn: { x: 550, y: 560 },
    goal: { x: 1800, y: 100, w: 100, h: 100 },
    checkpoints: [],
    rects: [
      { x: 0, y: 1000, w: 2000, h: 60, kind: 'ground' },
      { x: 400, y: 600, w: 300, h: 30, kind: 'step', crumble: 1, regrow: 2 },
    ],
    deathY: 1250,
  };
}

describe('会塌的台子', () => {
  test('有人站上去报 creak，过 crumble 秒塌（报 crumble），人掉到地板上；过 regrow 秒长回来', async () => {
    const sim = await createSim(crumbleLevel(), 1);
    let evs = run(sim, 0.5);
    expect(evs.some((e) => e.type === 'creak')).toBe(true);
    expect(sim.crumbleState[0]!.until).toBeLessThan(2);
    evs = run(sim, 1.5);
    expect(evs.some((e) => e.type === 'crumble')).toBe(true);
    expect(sim.crumbleState[0]!.gone).toBe(true);
    evs = run(sim, 1);
    expect(sim.players[0]!.body.y).toBeGreaterThan(900);
    evs = run(sim, 2);
    expect(evs.some((e) => e.type === 'regrow')).toBe(true);
    expect(sim.crumbleState[0]).toEqual({ until: Infinity, gone: false });
    sim.destroy();
  });

  test('没人碰就不塌', async () => {
    const sim = await createSim(crumbleLevel(), 1);
    sim.teleport(0, 1500, 960);
    const evs = run(sim, 4);
    expect(evs.some((e) => e.type === 'creak' || e.type === 'crumble')).toBe(false);
    sim.destroy();
  });

  test('手机局：快照带台子的样子', async () => {
    const lv = crumbleLevel();
    const sim = await createSim(lv, 1);
    run(sim, 0.5);
    const snap = encodeSnap(sim, 1);
    expect(snap.cb?.[0]).toBeGreaterThan(0);
    const view = new RemoteSim(() => lv, lv);
    view.apply(snap, 1000);
    expect(view.crumbleState[0]!.gone).toBe(false);
    expect(view.crumbleState[0]!.until).toBeCloseTo(sim.crumbleState[0]!.until, 1);
    sim.destroy();
  });
});

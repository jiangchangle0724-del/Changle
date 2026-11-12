/**
 * A3 加的玩法：饼干平台、弹簧蜡烛、背叛判定、召唤、落地事件。
 */
import { describe, expect, test } from 'vitest';
import { CFG } from './config';
import type { Level } from './level';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const input = (ax: number, ay: number, gl: boolean, gr: boolean, act?: PadInput['act']): PadInput => ({ ax, ay, gl, gr, act });
function run(sim: Sim, seconds: number, fn?: (t: number) => void): SimEvent[] {
  const all: SimEvent[] = [];
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    fn?.(i * dt);
    sim.step(dt);
    all.push(...sim.events);
  }
  return all;
}

function level(extra: Partial<Level>): Level {
  return {
    id: 'gameplay-test',
    w: 1400,
    h: 800,
    spawn: { x: 100, y: 500 },
    goal: { x: 1200, y: 300, w: 150, h: 150 },
    rects: [{ x: 0, y: 540, w: 300, h: 200, kind: 'ground', material: 'wood' }],
    deathY: 1000,
    ...extra,
  };
}

describe('饼干平台', () => {
  test('在的时候能站，到点就没了，人掉下去；再到点又回来', async () => {
    const sim = await createSim(level({ fading: [{ x: 500, y: 540, w: 200, h: 30, on: 1, off: 1 }] }), 1);
    const f = sim.fadings[0]!;
    expect(f.on).toBe(true);
    sim.teleport(0, 600, 540 - CFG.bodyR);
    run(sim, 0.6);
    expect(sim.players[0]!.body.y).toBeLessThan(540);
    const events = run(sim, 0.9);
    expect(events.some((e) => e.type === 'fade' && !e.on)).toBe(true);
    expect(f.on).toBe(false);
    expect(sim.players[0]!.body.y).toBeGreaterThan(600); // 掉下去了
    run(sim, 0.6);
    expect(f.on).toBe(true);
    sim.destroy();
  });

  test('抓着它的手在它消失那一刻松开', async () => {
    const sim = await createSim(level({ fading: [{ x: 500, y: 300, w: 200, h: 30, on: 1, off: 1 }] }), 1);
    sim.teleport(0, 540, 300 + 60, { hands: [null, { x: 560, y: 300 }] });
    run(sim, 0.3, () => sim.setInput(0, input(0, 0, false, true)));
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('terrain');
    run(sim, 0.9, () => sim.setInput(0, input(0, 0, false, true)));
    expect(sim.players[0]!.arms[1].grip).toBeNull();
    sim.destroy();
  });

  test('phase 把几块饼干错开', async () => {
    const sim = await createSim(level({ fading: [{ x: 500, y: 540, w: 100, h: 30, on: 1, off: 1 }, { x: 700, y: 540, w: 100, h: 30, on: 1, off: 1, phase: 1 }] }), 1);
    expect(sim.fadings[0]!.on).toBe(true);
    expect(sim.fadings[1]!.on).toBe(false);
    run(sim, 1.05);
    expect(sim.fadings[0]!.on).toBe(false);
    expect(sim.fadings[1]!.on).toBe(true);
    sim.destroy();
  });
});

describe('弹簧蜡烛', () => {
  test('落在蜡烛顶上就弹起来，弹得比落下来的地方高', async () => {
    const sim = await createSim(level({ springs: [{ x: 500, y: 540, w: 120, h: 40, power: 1 }] }), 1);
    const p = sim.players[0]!;
    sim.teleport(0, 560, 440);
    let top = Infinity;
    const events = run(sim, 1.6, () => {
      top = Math.min(top, p.body.y);
    });
    expect(events.filter((e) => e.type === 'bounce').length).toBeGreaterThanOrEqual(1);
    expect(top).toBeLessThan(440 - 100);
    expect(sim.springs[0]!.hit).toBeLessThan(2);
    sim.destroy();
  });

  test('蜡烛也能抓', async () => {
    const sim = await createSim(level({ springs: [{ x: 500, y: 300, w: 60, h: 120, power: 1 }] }), 1);
    sim.teleport(0, 440, 360, { hands: [null, { x: 500, y: 350 }] });
    run(sim, 0.3, () => sim.setInput(0, input(0, 0, false, true)));
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('terrain');
    sim.destroy();
  });
});

describe('背叛', () => {
  test('抓着悬空的队友松手，队友摔死，记松手的人一笔', async () => {
    const sim = await createSim(level({ rects: [{ x: 0, y: 540, w: 300, h: 200, kind: 'ground' }] }), 2);
    // P1 站在台边，右手正按在 P2 身上；P2 悬在缝外
    sim.teleport(0, 280, 540 - CFG.bodyR, { hands: [null, { x: 350, y: 560 }] });
    sim.teleport(1, 372, 566);
    run(sim, 0.4, () => {
      sim.setInput(0, input(0, 0, false, true));
      sim.setInput(1, input(0, 0, false, false));
    });
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('player');
    expect(sim.players[1]!.dead).toBe(false);
    const events = run(sim, 3, () => {
      sim.setInput(0, input(0, 0, false, false));
      sim.setInput(1, input(0, 0, false, false));
    });
    expect(sim.players[1]!.deaths).toBe(1);
    expect(sim.betrayals).toEqual([{ by: 0, victim: 1, t: expect.any(Number) }]);
    expect(sim.players[0]!.betrayals).toBe(1);
    expect(events.some((e) => e.type === 'betrayal' && e.by === 0 && e.victim === 1)).toBe(true);
    sim.destroy();
  });

  test('松手后队友自己抓到了东西再摔，不算背叛', async () => {
    const sim = await createSim(level({ rects: [{ x: 0, y: 540, w: 300, h: 200, kind: 'ground' }] }), 2);
    sim.teleport(0, 280, 540 - CFG.bodyR);
    sim.teleport(1, 360, 600);
    run(sim, 0.4, () => {
      sim.setInput(0, input(1, 0.6, false, true));
      sim.setInput(1, input(0, 0, false, false));
    });
    // P1 松手的同一刻 P2 抓住台子侧面，然后自己再松手掉下去
    run(sim, 0.6, () => {
      sim.setInput(0, input(0, 0, false, false));
      sim.setInput(1, input(-1, 0, true, false));
    });
    expect(sim.players[1]!.arms[0].grip?.kind).toBe('terrain');
    run(sim, 3, () => {
      sim.setInput(0, input(0, 0, false, false));
      sim.setInput(1, input(0, 0, false, false));
    });
    expect(sim.players[1]!.deaths).toBe(1);
    expect(sim.betrayals).toHaveLength(0);
    sim.destroy();
  });
});

describe('召唤和落地', () => {
  test('队友摔死后按召唤，队友立刻从你身上掉出来', async () => {
    const sim = await createSim(level({}), 2);
    sim.teleport(0, 150, 540 - CFG.bodyR);
    sim.teleport(1, 600, 950);
    run(sim, 0.3);
    expect(sim.players[1]!.dead).toBe(true);
    const events = run(sim, 0.1, () => sim.setInput(0, input(0, 0, false, false, 'summon')));
    expect(sim.players[1]!.dead).toBe(false);
    expect(Math.abs(sim.players[1]!.body.x - sim.players[0]!.body.x)).toBeLessThan(40);
    expect(events.some((e) => e.type === 'summon' && e.player === 0 && e.who.includes(1))).toBe(true);
    expect(events.some((e) => e.type === 'respawn' && e.summoned)).toBe(true);
    sim.destroy();
  });

  test('连发的召唤一秒内只算一次', async () => {
    const sim = await createSim(level({}), 2);
    sim.teleport(0, 150, 540 - CFG.bodyR);
    const events = run(sim, 0.5, () => sim.setInput(0, input(0, 0, false, false, 'summon')));
    expect(events.filter((e) => e.type === 'summon')).toHaveLength(0); // 没人死，什么都不发生
    sim.teleport(1, 600, 950);
    run(sim, 0.3);
    const more = run(sim, 0.5, () => sim.setInput(0, input(0, 0, false, false, 'summon')));
    expect(more.filter((e) => e.type === 'summon')).toHaveLength(1);
    sim.destroy();
  });

  test('从高处落地有 land 事件，轻轻放下没有', async () => {
    const sim = await createSim(level({}), 1);
    sim.teleport(0, 150, 300);
    const hard = run(sim, 1);
    expect(hard.some((e) => e.type === 'land' && e.speed > CFG.landSpeed)).toBe(true);
    sim.teleport(0, 150, 540 - CFG.bodyR - 4);
    const soft = run(sim, 1);
    expect(soft.some((e) => e.type === 'land')).toBe(false);
    sim.destroy();
  });
});

describe('过关', () => {
  test('win 只报一次；赢了以后再走，事件是空的', async () => {
    const lv = level({});
    const sim = await createSim(lv, 2);
    const g = lv.goal;
    sim.teleport(0, g.x + g.w / 2 - 20, g.y + g.h / 2);
    sim.teleport(1, g.x + g.w / 2 + 20, g.y + g.h / 2);
    const events = run(sim, 0.5);
    expect(sim.won).toBe(true);
    expect(events.filter((e) => e.type === 'win')).toHaveLength(1);
    sim.step(dt);
    expect(sim.events).toEqual([]);
    sim.destroy();
  });
});

describe('复活不叠人', () => {
  const cpLevel = (extra: Partial<Level> = {}): Level =>
    level({ checkpoints: [{ x: 500, y: 516 }], rects: [{ x: 300, y: 540, w: 600, h: 200, kind: 'ground', material: 'wood' }], ...extra });
  const dieAndWait = (sim: Sim, who: number[]): SimEvent[] => {
    for (const i of who) sim.teleport(i, 1200, sim.level.deathY + 10);
    return run(sim, CFG.respawnDelay + 0.2);
  };
  const minGap = (sim: Sim): number => {
    let m = Infinity;
    for (const a of sim.players) for (const b of sim.players) if (a.id < b.id) m = Math.min(m, Math.hypot(a.body.x - b.body.x, a.body.y - b.body.y));
    return m;
  };

  test('没人挡着就照常在检查点右边错开 30 px', async () => {
    const sim = await createSim(cpLevel(), 2);
    sim.teleport(0, 500, 516);
    run(sim, 0.1);
    expect(sim.checkpoint).toBe(0);
    sim.teleport(0, 800, 516);
    const events = dieAndWait(sim, [1]);
    const at = events.filter((e) => e.type === 'respawn');
    expect(at).toHaveLength(1);
    expect(sim.players[1]!.body.x).toBeCloseTo(530, 0);
    sim.destroy();
  });

  test('两个人同时复活、第三个人站在检查点上，三个身体都不叠', async () => {
    const sim = await createSim(cpLevel(), 3);
    sim.teleport(0, 500, 516);
    run(sim, 0.1);
    dieAndWait(sim, [1, 2]);
    expect(sim.players.every((p) => !p.dead)).toBe(true);
    expect(minGap(sim)).toBeGreaterThanOrEqual(CFG.bodyR * 2);
    sim.destroy();
  });

  test('平台上实在挤不下，宁可挨着队友，也不挪到饼干、蜡烛上', async () => {
    // 检查点那块只有 110 宽（左边是墙），右边紧挨着饼干和蜡烛：离队友够远的位置只在饼干上
    const sim = await createSim(
      cpLevel({
        rects: [
          { x: 470, y: 540, w: 110, h: 200, kind: 'ground', material: 'wood' },
          { x: 400, y: 300, w: 70, h: 440, kind: 'wall', material: 'wood' },
        ],
        fading: [{ x: 580, y: 540, w: 120, h: 30, on: 99, off: 1 }],
        springs: [{ x: 700, y: 500, w: 40, h: 240 }],
      }),
      2,
    );
    sim.teleport(0, 520, 516);
    run(sim, 0.1);
    expect(sim.checkpoint).toBe(0);
    dieAndWait(sim, [1]);
    const b = sim.players[1]!.body;
    expect(sim.players[1]!.dead).toBe(false);
    expect(b.x - CFG.bodyR).toBeGreaterThanOrEqual(470 - 1);
    expect(b.x + CFG.bodyR).toBeLessThanOrEqual(580 + 1);
    sim.destroy();
  });
});

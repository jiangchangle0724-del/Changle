import { afterEach, describe, expect, it } from 'vitest';
import { CFG, TETHER_LEN } from './config';
import type { Level } from './level';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const worlds: Sim[] = [];
afterEach(() => { for (const sim of worlds.splice(0)) sim.destroy(); });
const input = (ax = 0, ay = 0, gl = false, gr = false): PadInput => ({ ax, ay, gl, gr });
async function setup(extra: Partial<Level> = {}, players = 2): Promise<Sim> {
  const sim = await createSim({
    id: 'boundaries', w: 1600, h: 1600, spawn: { x: 150, y: 500 },
    goal: { x: 1400, y: 100, w: 100, h: 100 }, rects: [], deathY: 2000, ...extra,
  }, players);
  worlds.push(sim);
  return sim;
}
function run(sim: Sim, seconds: number, before?: (t: number) => void): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / CFG.step); i++) {
    before?.(i * CFG.step);
    sim.step(CFG.step);
    events.push(...sim.events);
  }
  return events;
}
function intact(sim: Sim): void {
  for (const p of sim.players) {
    expect(p.dead).toBe(false);
    expect(p.deaths).toBe(0);
    for (const q of [p.body, ...p.arms.flatMap(a => a.pts)]) {
      expect(Number.isFinite(q.x) && Number.isFinite(q.y)).toBe(true);
    }
    for (const arm of p.arms) if (arm.grip) {
      expect(Math.hypot(p.body.x - arm.grip.x, p.body.y - arm.grip.y)).toBeLessThanOrEqual(TETHER_LEN + 6);
    }
  }
}

describe('C4 多人抓取边界', () => {
  it('抓上绳子的同一步被队友抓住并拉动，两个关节都保留', async () => {
    const sim = await setup({ ropes: [{ anchor: { x: 600, y: 80 }, segments: 8, segLen: 38 }] });
    const h = sim.ropes[0]!.handle;
    sim.teleport(0, h.x - 20, h.y + 80, { hands: [null, { ...h }] });
    sim.teleport(1, h.x - 20, h.y + 180, { hands: [{ x: h.x - 20, y: h.y + 104 }, null] });
    sim.setInput(0, input(0, 0, false, true));
    sim.setInput(1, input(1, 0, true, false));
    run(sim, 2 * CFG.step);
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('rope');
    expect(sim.players[1]!.arms[0].grip?.player).toBe(0);
    const start = sim.players[0]!.body.x;
    run(sim, 1);
    expect(Math.abs(sim.players[0]!.body.x - start)).toBeGreaterThan(10);
    intact(sim);
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('rope');
    expect(sim.players[1]!.arms[0].grip?.player).toBe(0);
  });

  it('两人互抓形成闭环，三秒后不爆炸、不松手', async () => {
    const sim = await setup();
    sim.world.gravity.y = 0;
    sim.teleport(0, 500, 500, { hands: [null, { x: 556, y: 500 }] });
    sim.teleport(1, 580, 500, { hands: [{ x: 524, y: 500 }, null] });
    sim.setInput(0, input(0, 0, false, true));
    sim.setInput(1, input(0, 0, true, false));
    run(sim, 3);
    expect(sim.players[0]!.arms[1].grip?.player).toBe(1);
    expect(sim.players[1]!.arms[0].grip?.player).toBe(0);
    intact(sim);
  });

  it('四人成链挂绳三秒，每一环都在一臂范围内', async () => {
    const sim = await setup({ ropes: [{ anchor: { x: 600, y: 80 }, segments: 8, segLen: 38 }] }, 4);
    const h = sim.ropes[0]!.handle;
    for (let i = 0; i < 4; i++) {
      sim.teleport(i, h.x - 20, h.y + 80 + i * 100, {
        hands: i === 0 ? [null, { ...h }] : [{ x: h.x - 20, y: h.y + 80 + (i - 1) * 100 + CFG.bodyR }, null],
      });
      sim.setInput(i, input(0, 0, i > 0, i === 0));
    }
    run(sim, 3);
    intact(sim);
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('rope');
    for (let i = 1; i < 4; i++) expect(sim.players[i]!.arms[0].grip?.player).toBe(i - 1);
  });

  it('两人同时荡一条绳，绳有荡幅且两只手都不脱开', async () => {
    const sim = await setup({ ropes: [{ anchor: { x: 600, y: 80 }, segments: 8, segLen: 38 }] });
    const h = sim.ropes[0]!.handle;
    sim.teleport(0, h.x - 30, h.y + 70, { hands: [null, { ...h }] });
    sim.teleport(1, h.x + 30, h.y + 70, { hands: [{ ...h }, null] });
    let swing = 0;
    run(sim, 6, t => {
      const ax = Math.sin(2 * Math.PI * t / 3) > 0 ? 1 : -1;
      sim.setInput(0, input(ax, 0.2, false, true));
      sim.setInput(1, input(ax, 0.2, true, false));
      swing = Math.max(swing, Math.abs(h.x - 600));
    });
    expect(swing).toBeGreaterThan(60);
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('rope');
    expect(sim.players[1]!.arms[0].grip?.kind).toBe('rope');
    intact(sim);
  });

  it('贴墙按住一只手、另一只手连按十次，身体不穿墙', async () => {
    const sim = await setup({ rects: [
      { x: 600, y: 0, w: 100, h: 1200, kind: 'wall' },
      { x: 0, y: 900, w: 600, h: 100, kind: 'ground' },
    ] }, 1);
    sim.teleport(0, 560, 600, { hands: [{ x: 600, y: 580 }, { x: 600, y: 600 }] });
    sim.setInput(0, input(1, 0, true, true));
    run(sim, 0.05);
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('terrain');
    for (let tap = 0; tap < 10; tap++) {
      for (const gl of [false, true]) run(sim, 0.1, () => {
        sim.setInput(0, input(1, 0, gl, true));
        expect(sim.players[0]!.body.x + CFG.bodyR).toBeLessThanOrEqual(600 + 1);
      });
    }
    intact(sim);
    expect(sim.players[0]!.arms[1].grip).not.toBeNull();
  });
});

describe('C4 生死边界', () => {
  it('deathY 上方 1 px 不死', async () => {
    const sim = await setup({}, 1);
    sim.teleport(0, 500, sim.level.deathY - 1);
    sim.step(CFG.step);
    expect(sim.players[0]!.body.y).toBeLessThan(sim.level.deathY);
    expect(sim.players[0]!.dead).toBe(false);
    expect(sim.events.some(e => e.type === 'death')).toBe(false);
  });

  it('deathY 下方 1 px 当步死亡一次', async () => {
    const sim = await setup({}, 1);
    sim.teleport(0, 500, sim.level.deathY + 1);
    sim.step(CFG.step);
    expect(sim.players[0]!.dead).toBe(true);
    expect(sim.players[0]!.deaths).toBe(1);
    expect(sim.events.filter(e => e.type === 'death')).toHaveLength(1);
  });

  // C4 found respawns 30 px from a teammate standing on the checkpoint; respawnPoint now slides to clear footing.
  it('检查点复活不和站在旁边的队友身体重叠', async () => {
    const sim = await setup({ checkpoints: [{ x: 500, y: 500 }],
      rects: [{ x: 300, y: 524, w: 600, h: 100, kind: 'ground' }] });
    sim.teleport(0, 500, 500);
    run(sim, 0.1);
    expect(sim.checkpoint).toBe(0);
    sim.teleport(1, 1000, sim.level.deathY + 1);
    const events = run(sim, CFG.respawnDelay + 0.1);
    expect(events.some(e => e.type === 'respawn' && e.player === 1)).toBe(true);
    const [a, b] = sim.players;
    const spacing = Math.hypot(a!.body.x - b!.body.x, a!.body.y - b!.body.y);
    console.log(`checkpoint respawn spacing: ${spacing.toFixed(1)} px; required: ${2 * CFG.bodyR} px`);
    expect(spacing).toBeGreaterThanOrEqual(2 * CFG.bodyR);
  });
});

describe('C4 A3 规则边界', () => {
  it('饼干消失那一个物理步松手，按住抓键也不重新抓上', async () => {
    const sim = await setup({ fading: [{ x: 500, y: 300, w: 200, h: 30, on: 1, off: 1 }] }, 1);
    sim.teleport(0, 540, 360, { hands: [null, { x: 560, y: 300 }] });
    sim.setInput(0, input(0, 0, false, true));
    run(sim, 0.2);
    expect(sim.players[0]!.arms[1].grip?.kind).toBe('terrain');
    for (let i = 0; i < 240 && sim.fadings[0]!.on; i++) {
      expect(sim.players[0]!.arms[1].grip).not.toBeNull();
      sim.step(CFG.step);
    }
    expect(sim.fadings[0]!.on).toBe(false);
    expect(sim.events).toContainEqual(expect.objectContaining({ type: 'fade', on: false }));
    expect(sim.events).toContainEqual(expect.objectContaining({ type: 'release', player: 0 }));
    expect(sim.players[0]!.arms[1].grip).toBeNull();
    expect(run(sim, 0.2).some(e => e.type === 'grab')).toBe(false);
  });

  async function bounce(power: number): Promise<number> {
    const sim = await setup({ springs: [{ x: 500, y: 540, w: 120, h: 40, power }] }, 1);
    sim.teleport(0, 560, 440);
    let launchY: number | undefined;
    let top = Infinity;
    for (let i = 0; i < 360; i++) {
      sim.step(CFG.step);
      if (launchY === undefined && sim.events.some(e => e.type === 'bounce')) launchY = sim.players[0]!.body.y;
      if (launchY !== undefined) {
        top = Math.min(top, sim.players[0]!.body.y);
        if (sim.players[0]!.body.vy > 0) break;
      }
    }
    expect(launchY).toBeDefined();
    return launchY! - top;
  }
  it('power 1 蜡烛从起弹点升高 250 px ±20%', async () => {
    const height = await bounce(1);
    console.log(`power 1 height: ${height.toFixed(1)} px`);
    expect(height).toBeGreaterThanOrEqual(200);
    expect(height).toBeLessThanOrEqual(300);
  });
  it('power 2 蜡烛比 power 1 弹得更高', async () => {
    const low = await bounce(1);
    const high = await bounce(2);
    console.log(`power 1 / 2: ${low.toFixed(1)} / ${high.toFixed(1)} px`);
    expect(high).toBeGreaterThan(low);
  });
  it('蜡烛侧面可抓，侧面接触不触发弹跳', async () => {
    const sim = await setup({ springs: [{ x: 500, y: 300, w: 60, h: 120 }] }, 1);
    sim.teleport(0, 440, 360, { hands: [null, { x: 500, y: 350 }] });
    sim.setInput(0, input(0, 0, false, true));
    const events = run(sim, 0.5);
    expect(sim.players[0]!.arms[1].grip?.rect).toMatchObject({ x: 500, y: 300 });
    expect(events.some(e => e.type === 'bounce')).toBe(false);
  });

  async function released(): Promise<Sim> {
    const sim = await setup({ deathY: 100000 });
    sim.world.gravity.y = 0; // 只隔离时限，避免落地/抓物清掉 heldBy。
    sim.teleport(0, 500, 500, { hands: [null, { x: 556, y: 500 }] });
    sim.teleport(1, 580, 500);
    sim.setInput(0, input(0, 0, false, true));
    run(sim, 0.1);
    expect(sim.players[0]!.arms[1].grip?.player).toBe(1);
    sim.setInput(0, input());
    sim.step(CFG.step);
    expect(sim.players[1]!.heldBy?.by).toBe(0);
    return sim;
  }
  function killWithoutTeleport(sim: Sim): void {
    // teleport 会清 heldBy；平移整个人越过 deathY 才是在测摔死。
    const p = sim.players[1]!;
    const dy = sim.level.deathY + 100 - p.body.y;
    for (const rb of [p.rb, ...p.arms.flatMap(a => a.segs)]) {
      const q = rb.translation();
      rb.setTranslation({ x: q.x, y: q.y + dy }, true);
    }
    sim.step(CFG.step);
    expect(p.dead).toBe(true);
  }
  it('松手后 2.5 秒以内摔死算背叛', async () => {
    const sim = await released();
    run(sim, CFG.betrayalWindow - 2 * CFG.step);
    expect(sim.players[1]!.heldBy).not.toBeNull();
    killWithoutTeleport(sim);
    expect(sim.betrayals).toHaveLength(1);
    expect(sim.events).toContainEqual({ type: 'betrayal', by: 0, victim: 1 });
  });
  it('松手后超过 2.5 秒摔死不算背叛', async () => {
    const sim = await released();
    run(sim, CFG.betrayalWindow + CFG.step);
    expect(sim.players[1]!.heldBy).not.toBeNull();
    killWithoutTeleport(sim);
    expect(sim.betrayals).toHaveLength(0);
    expect(sim.players[0]!.betrayals).toBe(0);
  });
  it('召唤把掉队的死者立即放在叫的人头顶，活人不搬走', async () => {
    const sim = await setup({}, 3);
    sim.teleport(0, 600, 500);
    sim.teleport(1, 900, sim.level.deathY + 1);
    sim.teleport(2, 1200, 500);
    sim.step(CFG.step);
    expect(sim.players[1]!.dead).toBe(true);
    sim.setInput(0, { ...input(), act: 'summon' });
    sim.step(CFG.step);
    const [caller, late, alive] = sim.players;
    expect(late!.dead).toBe(false);
    expect(late!.deaths).toBe(1);
    expect(late!.body.x).toBeCloseTo(caller!.body.x, 3);
    expect(late!.body.y).toBeCloseTo(caller!.body.y - 2 * CFG.bodyR, 3);
    expect(alive!.body.x).toBeCloseTo(1200, 1);
    expect(sim.events).toContainEqual({ type: 'summon', player: 0, who: [1] });
  });
});

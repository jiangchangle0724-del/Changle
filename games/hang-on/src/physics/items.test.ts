/**
 * 道具（A9）：速冻、拉面、荷叶。只在闯关和大团队里能用；没人用道具时物理和以前一模一样（回放由 `npm run levels` 查）。
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

/** 左边一块地，中间一堵 600 到 800、顶在 300 的墙，底下是深渊。 */
function level(): Level {
  return {
    id: 'items-test',
    w: 1400,
    h: 900,
    spawn: { x: 100, y: 500 },
    goal: { x: 1200, y: 100, w: 150, h: 150 },
    rects: [
      { x: 0, y: 540, w: 300, h: 200, kind: 'ground', material: 'wood' },
      { x: 600, y: 300, w: 200, h: 440, kind: 'wall', material: 'wood' },
    ],
    deathY: 1000,
  };
}

/** 按一下道具键（手柄连发几帧，这里发一帧就够）。 */
function use(sim: Sim, i: number, base: PadInput = input(0, 0, false, false)): void {
  sim.setInput(i, { ...base, act: 'item' });
}

describe('速冻', () => {
  test('半空里冻住：4 秒不动不掉，化开以后照常掉；冷却里再按不算', async () => {
    const sim = await createSim(level(), 1);
    const p = sim.players[0]!;
    sim.setItem(0, 'freeze');
    sim.teleport(0, 450, 200);
    run(sim, 0.1);
    use(sim, 0);
    const events = run(sim, 0.2);
    expect(events.some((e) => e.type === 'item' && e.item === 'freeze' && e.ok)).toBe(true);
    expect(p.itemOn).toBe('freeze');
    const y0 = p.body.y;
    const x0 = p.body.x;
    run(sim, CFG.freezeTime - 0.5, () => sim.setInput(0, input(1, -1, true, true)));
    expect(Math.abs(p.body.y - y0)).toBeLessThan(1);
    expect(Math.abs(p.body.x - x0)).toBeLessThan(1);
    // 冷却里再按：不算
    use(sim, 0);
    const more = run(sim, 0.8);
    expect(more.filter((e) => e.type === 'item').length).toBe(0);
    expect(more.some((e) => e.type === 'itemEnd' && e.item === 'freeze')).toBe(true);
    expect(p.itemOn).toBeNull();
    run(sim, 0.5);
    expect(p.body.y).toBeGreaterThan(y0 + 60);
    sim.destroy();
  });

  test('冷却过了能再用', async () => {
    const sim = await createSim(level(), 1);
    const p = sim.players[0]!;
    sim.setItem(0, 'freeze');
    sim.teleport(0, 150, 540 - CFG.bodyR);
    use(sim, 0);
    run(sim, 0.2);
    expect(p.itemOn).toBe('freeze');
    run(sim, CFG.freezeCd - 0.2 + 0.1);
    expect(p.itemCd).toBe(0);
    use(sim, 0);
    run(sim, 0.1);
    expect(p.itemOn).toBe('freeze');
    sim.destroy();
  });

  test('队友能站在冻住的人身上，化开以后一起掉', async () => {
    const sim = await createSim(level(), 2);
    const [a, b] = sim.players as [Sim['players'][0], Sim['players'][0]];
    sim.setItem(0, 'freeze');
    sim.teleport(0, 450, 300);
    use(sim, 0);
    run(sim, 0.05);
    expect(a.itemOn).toBe('freeze');
    sim.teleport(1, 452, 300 - CFG.bodyR * 2 - 30);
    run(sim, 2);
    // b 落在 a 头上停住，没掉下去
    expect(b.body.y).toBeLessThan(a.body.y - CFG.bodyR * 1.5);
    expect(b.body.y).toBeGreaterThan(a.body.y - CFG.bodyR * 2 - 6);
    expect(b.ground).toBe(true);
    run(sim, CFG.freezeTime);
    expect(a.itemOn).toBeNull();
    expect(a.body.y).toBeGreaterThan(400);
    expect(b.body.y).toBeGreaterThan(400);
    sim.destroy();
  });

  test('队友能抓着冻住的人挂着；拽得动自己（冻住的人算实在的地方）', async () => {
    const sim = await createSim(level(), 2);
    const b = sim.players[1]!;
    sim.setItem(0, 'freeze');
    sim.teleport(0, 450, 250);
    use(sim, 0);
    run(sim, 0.05);
    // b 在 a 右下方，右手放在 a 身上
    sim.teleport(1, 470, 340, { hands: [null, { x: 460, y: 262 }] });
    run(sim, 0.2, () => sim.setInput(1, input(0, 0, false, true)));
    expect(b.arms[1].grip?.kind).toBe('player');
    run(sim, 2, () => sim.setInput(1, input(0, -1, false, true)));
    // 挂得住，而且往上推能把自己拽上去一点
    expect(b.dead).toBe(false);
    expect(b.body.y).toBeLessThan(330);
    sim.destroy();
  });

  test('比谁先、坐不住里没有道具', async () => {
    for (const mode of ['race', 'last'] as const) {
      const sim = await createSim(level(), 2, { mode });
      sim.setItem(0, 'freeze');
      sim.teleport(0, 450, 200);
      use(sim, 0);
      const events = run(sim, 0.3);
      expect(events.some((e) => e.type === 'item')).toBe(false);
      expect(sim.players[0]!.itemOn).toBeNull();
      sim.destroy();
    }
  });

  test('冻住时摔不死的地方照样会死：碰到要命的东西就死，复活时已经化开', async () => {
    const lv = level();
    lv.hazards = [{ x: 420, y: 180, w: 60, h: 60, kind: 'spike' }];
    const sim = await createSim(lv, 1);
    const p = sim.players[0]!;
    sim.setItem(0, 'freeze');
    sim.teleport(0, 450, 120);
    use(sim, 0);
    run(sim, 0.05);
    expect(p.itemOn).toBe('freeze');
    // 冻住时被挪到尖刺上（比如动台把人推过去）：照样死
    sim.teleport(0, 450, 210);
    expect(p.itemOn).toBeNull();
    run(sim, 0.1);
    expect(p.dead).toBe(true);
    sim.destroy();
  });
});

describe('拉面', () => {
  test('没抓着墙或台子用不了：报一次没用成，不进冷却', async () => {
    const sim = await createSim(level(), 1);
    const p = sim.players[0]!;
    sim.setItem(0, 'noodle');
    sim.teleport(0, 150, 540 - CFG.bodyR);
    run(sim, 0.2);
    for (let i = 0; i < 6; i++) use(sim, 0);
    const events = run(sim, 0.3, () => use(sim, 0));
    const tries = events.filter((e) => e.type === 'item');
    expect(tries.length).toBe(1);
    expect(tries[0]).toMatchObject({ ok: false, item: 'noodle' });
    expect(p.itemCd).toBe(0);
    expect(sim.noodles.length).toBe(0);
    sim.destroy();
  });

  test('抓着墙顶的边用：一根面条顺着墙垂下去，队友能抓着挂住；10 秒后断，抓着的人松开', async () => {
    const sim = await createSim(level(), 2);
    const [a, b] = sim.players as [Sim['players'][0], Sim['players'][0]];
    sim.setItem(0, 'noodle');
    // a 挂在墙左上角，右手抓着墙顶
    sim.teleport(0, 588, 330, { hands: [null, { x: 604, y: 300 }] });
    run(sim, 0.3, () => sim.setInput(0, input(0, 0, false, true)));
    expect(a.arms[1].grip?.kind).toBe('terrain');
    const events = run(sim, 0.2, () => sim.setInput(0, input(0, 0, false, true, 'item')));
    expect(events.some((e) => e.type === 'item' && e.item === 'noodle' && e.ok)).toBe(true);
    expect(sim.noodles.length).toBe(1);
    const n = sim.noodles[0]!;
    expect(n.owner).toBe(0);
    // 垂在墙的左边外面
    expect(n.anchor.x).toBeLessThan(600);
    run(sim, 1, () => sim.setInput(0, input(0, 0, false, true)));
    expect(n.handle.y).toBeGreaterThan(n.anchor.y + CFG.noodleSegs * CFG.noodleSegLen * 0.85);
    expect(n.handle.x).toBeLessThan(600);
    // b 在面条底下，左手放在面条尾巴上
    const h = { ...n.handle };
    sim.teleport(1, h.x - 30, h.y + 40, { hands: [{ x: h.x, y: h.y }, null] });
    run(sim, 0.2, () => {
      sim.setInput(0, input(0, 0, false, true));
      sim.setInput(1, input(0, 0, true, false));
    });
    expect(b.arms[0].grip?.kind).toBe('rope');
    expect(b.arms[0].grip?.noodle).toBe(0);
    run(sim, 3, () => {
      sim.setInput(0, input(0, 0, false, true));
      sim.setInput(1, input(0, 0, true, false));
    });
    expect(b.dead).toBe(false);
    expect(b.body.y).toBeLessThan(h.y + 120);
    // 到点断了
    const later = run(sim, CFG.noodleTime, () => {
      sim.setInput(0, input(0, 0, false, true));
      sim.setInput(1, input(0, 0, true, false));
    });
    expect(later.some((e) => e.type === 'itemEnd' && e.item === 'noodle')).toBe(true);
    expect(sim.noodles.length).toBe(0);
    expect(b.arms[0].grip?.noodle).toBeUndefined();
    sim.destroy();
  });
});

describe('荷叶', () => {
  test('撑开以后往下掉得慢，摇杆推着横着飘；5 秒后收起照常掉', async () => {
    const sim = await createSim(level(), 1);
    const p = sim.players[0]!;
    sim.setItem(0, 'leaf');
    sim.teleport(0, 380, 0);
    run(sim, 0.3);
    use(sim, 0);
    run(sim, 0.4);
    expect(p.itemOn).toBe('leaf');
    let fastest = 0;
    const x0 = p.body.x;
    run(sim, 2, () => {
      sim.setInput(0, input(-1, 0, false, false));
      fastest = Math.max(fastest, p.body.vy);
    });
    expect(fastest).toBeLessThan(CFG.leafFall + 30);
    expect(p.body.x).toBeLessThan(x0 - 200);
    const events = run(sim, CFG.leafTime);
    expect(events.some((e) => e.type === 'itemEnd' && e.item === 'leaf')).toBe(true);
    expect(p.itemOn).toBeNull();
    sim.destroy();
  });
});

/**
 * 原版那套难的机关（A6）：碰到就死的东西、会动的平台、会转的杆子、按人数摆关卡、按号排关卡。
 */
import { describe, expect, test } from 'vitest';
import { LEVELS } from '../levels';
import { CFG } from './config';
import { forPlayers, type Level, type MoverDef, type SpinnerDef } from './level';
import { circleHitsBar, circleHitsRect, moverAt, spinnerAngle, spinnerArm } from './motion';
import { createSim, type PadInput, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const input = (ax: number, ay: number, gl: boolean, gr: boolean): PadInput => ({ ax, ay, gl, gr });
/** 跑 seconds 秒，收这段时间的事件。 */
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
const close = (a: number, b: number, tol: number): void => {
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol);
};

/** 一大块平地，起点在左边，别的东西各测各的加进来。 */
function flat(extra: Partial<Level> = {}): Level {
  return {
    id: 'hazard-test',
    world: 'table',
    w: 1600,
    h: 900,
    spawn: { x: 100, y: 500 },
    goal: { x: 1400, y: 100, w: 150, h: 150 },
    rects: [{ x: 0, y: 540, w: 1600, h: 200, kind: 'ground', material: 'wood' }],
    deathY: 1000,
    ...extra,
  };
}

describe('会动的东西的算法（motion.ts）', () => {
  const m: MoverDef = { x: 100, y: 200, w: 120, h: 20, path: [{ x: 300, y: 200 }], speed: 100, wait: 0.5 };

  test('来回走：两头停 wait 秒，中间缓入缓出，一圈 2 × (走 2 秒 + 停 0.5 秒)', () => {
    expect(moverAt(m, 0)).toEqual({ x: 100, y: 200 });
    close(moverAt(m, 1).x, 200, 0.01); // 走到一半正好一半
    expect(moverAt(m, 0.25).x).toBeLessThan(100 + 25); // 起步慢
    expect(moverAt(m, 2.2)).toEqual({ x: 300, y: 200 }); // 停在那头
    close(moverAt(m, 3.5).x, 200, 0.01); // 往回走到一半
    expect(moverAt(m, 4.7)).toEqual({ x: 100, y: 200 }); // 回到起点停着
    close(moverAt(m, 5 + 1).x, 200, 0.01); // 下一圈
    // phase 把钟往后拨
    close(moverAt({ ...m, phase: 1 }, 0).x, 200, 0.01);
  });

  test('绕圈：最后一点直接回起点', () => {
    const loop: MoverDef = { x: 0, y: 0, w: 10, h: 10, path: [{ x: 100, y: 0 }, { x: 100, y: 100 }], speed: 100, loop: true };
    // 0 → (100,0) 1 秒，→ (100,100) 1 秒，→ (0,0) √2 秒
    expect(moverAt(loop, 1)).toEqual({ x: 100, y: 0 });
    expect(moverAt(loop, 2)).toEqual({ x: 100, y: 100 });
    const back = moverAt(loop, 2 + Math.SQRT2 / 2);
    close(back.x, 50, 0.01);
    close(back.y, 50, 0.01);
    close(moverAt(loop, 2 + Math.SQRT2).x, 0, 0.01);
  });

  test('转的杆子：角度按时间走，杆子从轴心伸出去', () => {
    const sp: SpinnerDef = { pivot: { x: 500, y: 300 }, arms: 2, len: 200, spin: Math.PI, phase: 0.5 };
    close(spinnerAngle(sp, 1), 0.5 + Math.PI, 1e-9);
    const a0 = spinnerArm(sp, 0, 0);
    expect(a0).toMatchObject({ x: 600, y: 300, angle: 0, len: 200, h: 16 });
    const a1 = spinnerArm(sp, 1, 0);
    close(a1.x, 400, 1e-9);
    close(a1.y, 300, 1e-9);
  });

  test('圆碰矩形、圆碰斜杆', () => {
    const r = { x: 0, y: 0, w: 100, h: 20 };
    expect(circleHitsRect({ x: 50, y: 30 }, 12, r)).toBe(true);
    expect(circleHitsRect({ x: 50, y: 33 }, 12, r)).toBe(false);
    expect(circleHitsRect({ x: 108, y: 28 }, 12, r)).toBe(true); // 角上
    expect(circleHitsRect({ x: 110, y: 30 }, 12, r)).toBe(false);
    const bar = { x: 0, y: 0, angle: Math.PI / 4, len: 200, h: 10 };
    expect(circleHitsBar({ x: 60, y: 60 }, 5, bar)).toBe(true); // 在杆子上
    expect(circleHitsBar({ x: 60, y: -60 }, 5, bar)).toBe(false); // 垂直方向离得远
  });
});

describe('碰到就死的东西', () => {
  test('身体碰到尖刺就死，事件带 cause，复活回起点', async () => {
    const sim = await createSim(flat({ hazards: [{ x: 600, y: 520, w: 120, h: 20, kind: 'spike' }] }), 1);
    sim.teleport(0, 660, 470);
    const evs = run(sim, 0.4);
    const death = evs.find((e) => e.type === 'death');
    expect(death).toMatchObject({ type: 'death', player: 0, cause: 'spike' });
    expect(sim.players[0]!.deaths).toBe(1);
    run(sim, CFG.respawnDelay + 0.2);
    expect(sim.players[0]!.dead).toBe(false);
    close(sim.players[0]!.body.x, sim.level.spawn.x, 5);
    sim.destroy();
  });

  test('手或胳膊碰到电也算；掉下去死的不带 cause（和以前一样）', async () => {
    // 电在身体右上方，身体碰不到（离身体顶上 20 多像素），手伸过去够得着
    const sim = await createSim(flat({ hazards: [{ x: 215, y: 400, w: 60, h: 70, kind: 'zap' }] }), 1);
    sim.teleport(0, 160, 516);
    expect(run(sim, 0.2).some((e) => e.type === 'death')).toBe(false);
    // 右手往右上伸进电里
    const evs = run(sim, 1, () => sim.setInput(0, input(1, -0.9, false, false)));
    expect(evs.find((e) => e.type === 'death')).toMatchObject({ cause: 'zap' });
    sim.destroy();
    const fall = await createSim(flat({ rects: [{ x: 0, y: 540, w: 300, h: 200, kind: 'ground' }] }), 1);
    fall.teleport(0, 500, 800);
    const fallEvs = run(fall, 0.5);
    const d = fallEvs.find((e) => e.type === 'death');
    expect(d).toBeDefined();
    expect(d && 'cause' in d).toBe(false);
    fall.destroy();
  });

  test('尖刺抓不住、也不挡路（不建碰撞体）', async () => {
    const sim = await createSim(flat({ hazards: [{ x: 200, y: 300, w: 200, h: 20, kind: 'spike', dir: 'down' }] }), 1);
    const before = sim.world.colliders.len();
    const plain = await createSim(flat(), 1);
    expect(before).toBe(plain.world.colliders.len());
    plain.destroy();
    sim.destroy();
  });

  test('复活点躲开要命的东西：起点被占，往旁边找的时候不找到电边上', async () => {
    const zap = { x: 185, y: 480, w: 60, h: 60, kind: 'zap' as const };
    const sim = await createSim(flat({ hazards: [zap] }), 2);
    // 第二个人站在起点；第一个人掉下去，复活时起点被占，右边挨着电，只能往左
    sim.teleport(1, sim.level.spawn.x, sim.level.spawn.y);
    sim.teleport(0, 900, 990);
    const evs = run(sim, CFG.respawnDelay + 0.6);
    expect(evs.filter((e) => e.type === 'death')).toHaveLength(1);
    const p = sim.players[0]!;
    expect(p.dead).toBe(false);
    expect(p.body.x).toBeLessThan(sim.level.spawn.x);
    expect(circleHitsRect(p.body, CFG.bodyR, zap)).toBe(false);
    sim.destroy();
  });
});

describe('会动的平台', () => {
  const mover: MoverDef = { x: 400, y: 440, w: 200, h: 24, material: 'wood', path: [{ x: 700, y: 440 }], speed: 100 };

  test('站在上面被带着走', async () => {
    const sim = await createSim(flat({ movers: [mover] }), 1);
    sim.teleport(0, 450, 440 - CFG.bodyR - 1);
    run(sim, 0.5); // 落稳
    const x0 = sim.players[0]!.body.x;
    const m0 = moverAt(mover, sim.time).x;
    run(sim, 1.5);
    const moved = moverAt(mover, sim.time).x - m0;
    expect(moved).toBeGreaterThan(80);
    close(sim.players[0]!.body.x - x0, moved, 25);
    sim.destroy();
  });

  test('抓着它挂在下面，也跟着走', async () => {
    const sim = await createSim(flat({ rects: [{ x: 0, y: 540, w: 300, h: 200, kind: 'ground' }], movers: [{ ...mover, y: 300, path: [{ x: 700, y: 300 }] }] }), 1);
    sim.teleport(0, 470, 360, { hands: [{ x: 450, y: 326 }, { x: 490, y: 326 }] });
    run(sim, 0.2, () => sim.setInput(0, input(0, 0, true, true)));
    expect(sim.players[0]!.arms.every((a) => a.grip?.kind === 'terrain')).toBe(true);
    const x0 = sim.players[0]!.body.x;
    run(sim, 1.5, () => sim.setInput(0, input(0, 0, true, true)));
    expect(sim.players[0]!.body.x - x0).toBeGreaterThan(80);
    expect(sim.players[0]!.dead).toBe(false);
    sim.destroy();
  });

  test('会动的尖刺撞上来就死，也抓不住', async () => {
    const spike: MoverDef = { x: 300, y: 500, w: 40, h: 40, path: [{ x: 700, y: 500 }], speed: 300, deadly: true, hazard: 'zap' };
    const sim = await createSim(flat({ movers: [spike] }), 1);
    sim.teleport(0, 600, 516);
    const evs = run(sim, 2, () => sim.setInput(0, input(-1, 0, true, true)));
    expect(evs.find((e) => e.type === 'death')).toMatchObject({ cause: 'zap' });
    expect(evs.some((e) => e.type === 'grab' && Math.abs(e.x - moverAt(spike, 0).x) < 1)).toBe(false);
    sim.destroy();
  });
});

describe('会转的杆子', () => {
  test('抓住杆子头，跟着转半圈', async () => {
    const sp: SpinnerDef = { pivot: { x: 700, y: 250 }, arms: 1, len: 160, h: 18, spin: 0.8, material: 'wood' };
    const sim = await createSim(flat({ rects: [{ x: 0, y: 540, w: 300, h: 200, kind: 'ground' }], spinners: [sp] }), 1);
    // 杆子一开始朝右：手放在杆子头下沿
    const end = { x: 700 + 150, y: 250 + 9 };
    sim.teleport(0, end.x - 20, end.y + 50, { hands: [{ x: end.x - 12, y: end.y }, { x: end.x + 4, y: end.y }] });
    run(sim, 0.2, () => sim.setInput(0, input(0, 0, true, true)));
    expect(sim.players[0]!.arms.some((a) => a.grip)).toBe(true);
    run(sim, Math.PI / 0.8 - 0.2, () => sim.setInput(0, input(0, 0, true, true)));
    // 转了半圈：人跑到轴心左边去了
    expect(sim.players[0]!.body.x).toBeLessThan(sp.pivot.x - 60);
    expect(sim.players[0]!.dead).toBe(false);
    sim.destroy();
  });

  test('带电的杆子扫过来就死', async () => {
    const sp: SpinnerDef = { pivot: { x: 300, y: 380 }, arms: 2, len: 160, h: 14, spin: 2, deadly: true };
    const sim = await createSim(flat({ spinners: [sp] }), 1);
    sim.teleport(0, 300 + 120, 516);
    const evs = run(sim, 2);
    expect(evs.find((e) => e.type === 'death')).toMatchObject({ cause: 'zap' });
    sim.destroy();
  });
});

describe('按人数摆关卡（原版人多了关卡跟着变）', () => {
  const scaled = flat({
    rects: [
      { x: 0, y: 540, w: 600, h: 200, kind: 'ground' },
      { x: 600, y: 540, w: 100, h: 200, kind: 'ground', players: [1, 2] }, // 人少有一块垫脚
      { x: 760, y: 540, w: 800, h: 200, kind: 'ground' },
    ],
    hazards: [{ x: 600, y: 520, w: 160, h: 20, kind: 'hot', players: [3, 6] }], // 人多了缝里是一锅红油
  });

  test('人少的那块只在 1、2 个人时有；红油只在 3 个人以上有', async () => {
    const two = await createSim(scaled, 2);
    expect(two.level.rects).toHaveLength(3);
    expect(two.level.hazards).toHaveLength(0);
    expect(two.layoutFor).toBe(2);
    two.destroy();
    const four = await createSim(scaled, 4);
    expect(four.level.rects).toHaveLength(2);
    expect(four.level.hazards).toHaveLength(1);
    expect(four.layoutFor).toBe(4);
    // 半路多进来一个人不重摆
    four.setPlayers(5);
    expect(four.level.rects).toHaveLength(2);
    expect(four.layoutFor).toBe(4);
    four.destroy();
  });

  test('没写人数范围的关原样拿来（同一个对象，画面不用重画）', () => {
    const plain = flat();
    expect(forPlayers(plain, 3)).toBe(plain);
    expect(forPlayers(scaled, 3)).not.toBe(scaled);
  });
});

test('关卡按 id 末尾的号排，彩蛋关在最后', () => {
  const ids = LEVELS.map((l) => l.id);
  const nums = ids.slice(0, -1).map((id) => Number(/(\d+)$/.exec(id)?.[1]));
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  expect(ids.slice(0, 12)).toEqual([
    'table-01',
    'table-02',
    'table-03',
    'table-04',
    'table-05',
    'table-06',
    'van-07',
    'van-08',
    'van-09',
    'van-10',
    'van-11',
    'van-12',
  ]);
  expect(ids[ids.length - 1]).toBe('bonus-01');
});

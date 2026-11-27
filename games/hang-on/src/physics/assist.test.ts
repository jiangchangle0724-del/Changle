/**
 * 长辈小孩模式（11-26）：掉的时候手碰到能抓的自己抓住（不用按键），按一下那只手的键、站稳了就松开；
 * 抓的范围大一点；不会手酸；身子轻一点。没开的人照旧。
 */
import { describe, expect, test } from 'vitest';
import { CFG } from './config';
import type { Level } from './level';
import { createSim, type PadInput, type Sim } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };

/** 地板，上面悬着一根横杆（离地 400 像素，挂着脚够不着地）；右边一个矮台阶（顶在地板上面 50 像素）。 */
function level(): Level {
  return {
    id: 'assist-test',
    w: 3000,
    h: 1400,
    spawn: { x: 400, y: 600 },
    goal: { x: 2850, y: 100, w: 100, h: 100 },
    checkpoints: [],
    rects: [
      { x: 0, y: 700, w: 3000, h: 60, kind: 'ground' },
      { x: 850, y: 290, w: 300, h: 20, kind: 'peg' },
      { x: 1800, y: 650, w: 300, h: 50, kind: 'ledge' },
    ],
    deathY: 1400,
  };
}

function run(sim: Sim, seconds: number, input: PadInput = idle): void {
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    for (let i = 0; i < sim.players.length; i++) sim.setInput(i, input);
    sim.step(dt);
  }
}
const grips = (sim: Sim, i = 0): number => sim.players[i]!.arms.filter((a) => a.grip).length;

/** 贴着横杆右头往下掉：身子擦边过去，左手从横杆头上扫过。 */
async function dropOnBar(assist: boolean): Promise<Sim> {
  const sim = await createSim(level(), 1);
  sim.setAssist(0, assist);
  sim.teleport(0, 1190, 120);
  return sim;
}

describe('长辈小孩模式', () => {
  test('掉的时候手碰到横杆自己抓住，挂在那儿；没开的人一直掉到地上', async () => {
    const easy = await dropOnBar(true);
    run(easy, 1.5);
    expect(grips(easy)).toBeGreaterThan(0);
    expect(easy.players[0]!.body.y).toBeLessThan(500);
    expect(easy.players[0]!.arms.some((a) => a.auto)).toBe(true);
    easy.destroy();
    const plain = await dropOnBar(false);
    run(plain, 1.5);
    expect(grips(plain)).toBe(0);
    expect(plain.players[0]!.body.y).toBeGreaterThan(600);
    plain.destroy();
  });

  test('自己抓住的手：按一下那只手的键（按下去再松开）就松开', async () => {
    const sim = await dropOnBar(true);
    run(sim, 1.5);
    const k = sim.players[0]!.arms.findIndex((a) => a.grip);
    expect(k).toBeGreaterThanOrEqual(0);
    const press: PadInput = k === 0 ? { ...idle, gl: true } : { ...idle, gr: true };
    run(sim, 0.2, press);
    expect(sim.players[0]!.arms[k]!.grip).not.toBeNull(); // 按着：还抓着，交回给按键了
    expect(sim.players[0]!.arms[k]!.auto).toBe(false);
    run(sim, dt);
    expect(sim.players[0]!.arms[k]!.grip).toBeNull(); // 一松开键就松手
    sim.destroy();
  });

  test('站在东西上不自己抓：手不会粘在地上', async () => {
    const sim = await createSim(level(), 1);
    sim.setAssist(0, true);
    run(sim, 3, { ...idle, ax: 1, ay: 1 });
    expect(grips(sim)).toBe(0);
    expect(sim.players[0]!.ground).toBe(true);
    sim.destroy();
  });

  test('自己抓住的手，站稳了自己松开', async () => {
    const sim = await createSim(level(), 1);
    sim.setAssist(0, true);
    // 掉到台阶边上：手抓住台阶，身子落到地上站稳
    sim.teleport(0, 1775, 560, { hands: [{ x: 1745, y: 585 }, { x: 1800, y: 640 }] });
    let caught = false;
    for (let k = 0; k < 150; k++) {
      sim.setInput(0, idle);
      sim.step(dt);
      if (sim.players[0]!.arms.some((a) => a.auto && a.grip)) caught = true;
    }
    expect(caught).toBe(true);
    expect(sim.players[0]!.ground).toBe(true);
    expect(grips(sim)).toBe(0);
    sim.destroy();
  });

  test('抓的范围大一点：差一点点够不着的横杆也抓得住', async () => {
    const reachBar = async (assist: boolean): Promise<boolean> => {
      const sim = await createSim(level(), 1);
      sim.setAssist(0, assist);
      // 手离横杆底边 GRAB_R 再远 6 像素
      sim.teleport(0, 1000, 420, { hands: [{ x: 990, y: 310 + CFG.handR + CFG.grabPad + 6 }, { x: 1040, y: 380 }] });
      sim.setInput(0, { ...idle, gl: true });
      sim.step(dt);
      const got = sim.players[0]!.arms[0]!.grip !== null;
      sim.destroy();
      return got;
    };
    expect(await reachBar(true)).toBe(true);
    expect(await reachBar(false)).toBe(false);
  });

  test('不会手酸：困难的关挂 15 秒也不松', async () => {
    const sim = await createSim(level(), 1, { mode: 'climb', stamina: 'hard' });
    sim.setAssist(0, true);
    sim.teleport(0, 1000, 375, { hands: [{ x: 975, y: 300 }, { x: 1025, y: 300 }] });
    run(sim, 15, { ...idle, gl: true, gr: true });
    expect(grips(sim)).toBe(2);
    expect(sim.players[0]!.stamina).toBe(1);
    sim.destroy();
  });

  test('身子轻一点：掉得比平常慢；关上就照旧', async () => {
    const fall = async (assist: boolean, off = false): Promise<number> => {
      const sim = await createSim(level(), 1);
      sim.setAssist(0, assist);
      if (off) sim.setAssist(0, false);
      sim.teleport(0, 500, 100);
      run(sim, 0.4);
      const y = sim.players[0]!.body.y;
      sim.destroy();
      return y;
    };
    const plain = await fall(false);
    expect(await fall(true)).toBeLessThan(plain - 10);
    expect(await fall(true, true)).toBeCloseTo(plain, 0);
  });
});

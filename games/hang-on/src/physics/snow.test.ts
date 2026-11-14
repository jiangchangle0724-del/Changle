/**
 * 雪山的机关（A10）：缆车（椅子从起点站走到终点站，收进站里再从起点出来；站在座板上、抓着横杆都跟着走，
 * 到站时站着的掉下来、抓着的松开），冰溜子（抓着 `slip` 秒就滑，别的台子不滑；手机局快照带着它）。
 */
import { describe, expect, test } from 'vitest';
import { encodeSnap, RemoteSim } from '../net/snap';
import { CFG } from './config';
import { snowLevel, type LiftDef, type Level } from './level';
import { liftChairs } from './motion';
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
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
const level = (): Level => snowLevel();
const chair = (): LiftDef => level().lifts![0]!;

describe('缆车', () => {
  test('椅子从起点站走到终点站，到头收进站里，再从起点出来', () => {
    const l = chair();
    const len = Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y);
    const drop = l.drop ?? CFG.liftDrop;
    const n = Math.floor(len / l.gap) + 1;
    expect(liftChairs(l, 0).length).toBe(n);
    // 第 0 把椅子：开局在起点站，走 len / speed 秒到终点站
    const first = liftChairs(l, 0)[0]!;
    expect(first).toMatchObject({ x: l.from.x, y: l.from.y + drop, on: true });
    const end = liftChairs(l, len / l.speed - 0.01)[0]!;
    expect(Math.abs(end.x - l.to.x)).toBeLessThan(2);
    expect(Math.abs(end.y - (l.to.y + drop))).toBeLessThan(2);
    expect(end.on).toBe(true);
    expect(liftChairs(l, len / l.speed + 0.2)[0]!.on).toBe(false);
    // 一圈以后又从起点出来
    const back = liftChairs(l, (n * l.gap) / l.speed + 0.01)[0]!;
    expect(back.on).toBe(true);
    expect(Math.abs(back.x - l.from.x)).toBeLessThan(3);
  });

  test('站在座板上跟着走，到站时座板没了人掉下来', async () => {
    const l = chair();
    const sim = await createSim(level(), 1);
    const at = liftChairs(l, 0)[0]!;
    sim.teleport(0, at.x, at.y - 6 - CFG.bodyR - 1);
    run(sim, 3, () => sim.setInput(0, idle));
    const now = liftChairs(l, sim.time)[0]!;
    const p = sim.players[0]!;
    // 3 秒走了 330 px：人还在座板上（横着、竖着都跟着）
    expect(Math.abs(p.body.x - now.x)).toBeLessThan(30);
    expect(Math.abs(p.body.y - (now.y - 6 - CFG.bodyR))).toBeLessThan(12);
    expect(p.ground).toBe(true);
    sim.destroy();
  });

  test('抓着横杆跟着走；椅子收进站里时手松开', async () => {
    const l = chair();
    const sim = await createSim(level(), 1);
    const len = Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y);
    // 等第 0 把椅子快到终点站时抓上它的横杆
    const tArrive = len / l.speed;
    run(sim, tArrive - 1.5);
    const c = liftChairs(l, sim.time)[0]!;
    const hold: PadInput = { ...idle, gl: true, gr: true };
    sim.setInput(0, hold);
    sim.teleport(0, c.x, c.y - 30, { hands: [{ x: c.x - 18, y: c.y - 46 }, { x: c.x + 18, y: c.y - 46 }] });
    let evs = run(sim, 0.5, () => sim.setInput(0, hold));
    expect(sim.players[0]!.arms.every((a) => a.grip?.kind === 'terrain')).toBe(true);
    const x0 = sim.players[0]!.body.x;
    evs = run(sim, 1.5, () => sim.setInput(0, hold));
    // 抓着走了一段，到终点站时两只手都松开了（松手的地方就在终点站；还按着抓键的话手会再抓住平台）
    const rel = evs.filter((e) => e.type === 'release');
    expect(rel.length).toBeGreaterThanOrEqual(2);
    for (const e of rel.slice(0, 2)) if (e.type === 'release') expect(Math.abs(e.x - l.to.x)).toBeLessThan(40);
    expect(sim.players[0]!.body.x - x0).toBeGreaterThan(60);
    sim.destroy();
  });

  test('缆车厢：地板能站，顶能抓', async () => {
    const cab = level().lifts![1]!;
    const sim = await createSim(level(), 1);
    const at = liftChairs(cab, 0).find((c) => c.on)!;
    sim.teleport(0, at.x, at.y - 6 - CFG.bodyR - 1);
    run(sim, 1, () => sim.setInput(0, idle));
    expect(sim.players[0]!.ground).toBe(true);
    sim.destroy();
  });
});

describe('冰溜子', () => {
  test('抓着冰墙 slip 秒就滑，手一会儿抓不了；别的台子抓多久都行', async () => {
    const lv = level();
    const ice = lv.rects.find((r) => r.slip)!;
    const sim = await createSim(lv, 1);
    const hold: PadInput = { ...idle, gl: true, gr: false };
    // 挂在冰墙左边的面上，左手抓着
    sim.setInput(0, hold);
    sim.teleport(0, ice.x - 40, ice.y + 90, { hands: [{ x: ice.x - 4, y: ice.y + 60 }, { x: ice.x - 70, y: ice.y + 120 }] });
    const evs = run(sim, ice.slip! + 0.4, () => sim.setInput(0, hold));
    const slip = evs.find((e) => e.type === 'slip');
    expect(slip).toBeTruthy();
    expect(sim.players[0]!.arms[0].grip).toBeNull();
    // 木台子：抓 4 秒也不滑
    const sim2 = await createSim(lv, 1);
    const deck = lv.rects[1]!;
    sim2.setInput(0, hold);
    sim2.teleport(0, deck.x - 30, deck.y + 60, { hands: [{ x: deck.x - 4, y: deck.y + 20 }, { x: deck.x - 70, y: deck.y + 120 }] });
    const evs2 = run(sim2, 4, () => sim2.setInput(0, hold));
    expect(sim2.players[0]!.arms[0].grip?.kind).toBe('terrain');
    expect(evs2.some((e) => e.type === 'slip')).toBe(false);
    sim.destroy();
    sim2.destroy();
  });

  test('手机局：快照带着抓着冰溜子的手，别的手机上手也要抖', async () => {
    const lv = level();
    const ice = lv.rects.find((r) => r.slip)!;
    const sim = await createSim(lv, 1);
    const view = new RemoteSim(() => lv, lv);
    const hold: PadInput = { ...idle, gl: true, gr: false };
    sim.setInput(0, hold);
    sim.teleport(0, ice.x - 40, ice.y + 90, { hands: [{ x: ice.x - 4, y: ice.y + 60 }, { x: ice.x - 70, y: ice.y + 120 }] });
    run(sim, 0.5, () => sim.setInput(0, hold));
    expect(sim.players[0]!.arms[0].grip?.max).toBe(ice.slip);
    const snap = encodeSnap(sim, 1);
    expect(snap.ic).toEqual([0, 0, ice.slip]);
    view.apply(snap, 1000);
    expect(view.players[0]!.arms[0].grip?.max).toBe(ice.slip);
    sim.destroy();
  });
});

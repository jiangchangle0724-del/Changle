/**
 * 手酸（A11，只在中等和困难）：挂着会累，一只手比两只手累得快，身上挂着人更累，站着回力气，
 * 用完两只手都滑脱（报 tired 和每只手的 slip）；没开手酸抓多久都行。手机局快照带力气。
 */
import { describe, expect, test } from 'vitest';
import { encodeSnap, RemoteSim } from '../net/snap';
import { CFG } from './config';
import type { Level, Pt } from './level';
import { createSim, type PadInput, type Rules, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
const both: PadInput = { ...idle, gl: true, gr: true };
const left: PadInput = { ...idle, gl: true };
const MEDIUM: Rules = { mode: 'climb', stamina: 'medium' };
const HARD: Rules = { mode: 'climb', stamina: 'hard' };

/** 一根横杆悬在地板上面 400 像素：挂着脚够不着地，一松手掉到地板上站着。 */
function barLevel(): Level {
  return {
    id: 'stamina-test',
    w: 2000,
    h: 1400,
    spawn: { x: 1000, y: 600 },
    goal: { x: 1850, y: 100, w: 100, h: 100 },
    checkpoints: [],
    rects: [
      { x: 0, y: 700, w: 2000, h: 60, kind: 'ground' },
      { x: 850, y: 290, w: 300, h: 20, kind: 'peg' },
    ],
    deathY: 1400,
  };
}
const BAR_Y = 300;

function hang(sim: Sim, i: number, x: number, hands: 1 | 2): void {
  const h: [Pt | null, Pt | null] = hands === 2 ? [{ x: x - 25, y: BAR_Y }, { x: x + 25, y: BAR_Y }] : [{ x, y: BAR_Y }, null];
  sim.teleport(i, x, BAR_Y + 75, { hands: h });
}

/** 跑到有人累到松手（或者到时间），返回第几秒累的和这段时间的事件。 */
function runUntilTired(sim: Sim, seconds: number, inputs: PadInput[], who = 0): { at: number | null; evs: SimEvent[] } {
  const evs: SimEvent[] = [];
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    inputs.forEach((input, i) => sim.setInput(i, input));
    sim.step(dt);
    evs.push(...sim.events);
    if (sim.events.some((e) => e.type === 'tired' && e.player === who)) return { at: sim.time, evs };
  }
  return { at: null, evs };
}

describe('手酸', () => {
  test('没开手酸：一只手挂 30 秒也不松，力气一直是满的', async () => {
    const sim = await createSim(barLevel(), 1);
    hang(sim, 0, 1000, 1);
    const { at } = runUntilTired(sim, 30, [left]);
    expect(at).toBeNull();
    const p = sim.players[0]!;
    expect(p.arms[0].grip).not.toBeNull();
    expect(p.stamina).toBe(1);
    sim.destroy();
  });

  test('中等：一只手挂着 staminaOneMedium 秒左右力气用完，两只手都滑脱，报 tired 和 slip', async () => {
    const sim = await createSim(barLevel(), 1, MEDIUM);
    hang(sim, 0, 1000, 1);
    const { at, evs } = runUntilTired(sim, CFG.staminaOneMedium + 3, [left]);
    expect(at).not.toBeNull();
    expect(at!).toBeGreaterThan(CFG.staminaOneMedium * 0.9);
    expect(at!).toBeLessThan(CFG.staminaOneMedium * 1.1 + 0.3);
    expect(evs.some((e) => e.type === 'slip' && e.player === 0)).toBe(true);
    const p = sim.players[0]!;
    expect(p.arms.every((a) => !a.grip)).toBe(true);
    // 刚滑脱抓不了：按着键一会儿也不会马上又挂回去
    expect(p.arms[0].slipCd).toBeGreaterThan(0);
    sim.destroy();
  });

  test('两只手比一只手挂得久，困难比中等累得快', async () => {
    const two = await createSim(barLevel(), 1, MEDIUM);
    hang(two, 0, 1000, 2);
    const t2 = runUntilTired(two, CFG.staminaTwoMedium + 3, [both]).at;
    two.destroy();
    expect(t2).not.toBeNull();
    expect(t2!).toBeGreaterThan(CFG.staminaTwoMedium * 0.9);
    const hard = await createSim(barLevel(), 1, HARD);
    hang(hard, 0, 1000, 1);
    const th = runUntilTired(hard, CFG.staminaOneHard + 3, [left]).at;
    hard.destroy();
    expect(th).not.toBeNull();
    expect(th!).toBeLessThan(CFG.staminaOneMedium * 0.9);
    expect(th!).toBeGreaterThan(CFG.staminaOneHard * 0.9);
  });

  test('身上挂着一个人：底下那个人累得快 1 + staminaLoad 倍', async () => {
    const sim = await createSim(barLevel(), 2, MEDIUM);
    hang(sim, 0, 1000, 2);
    // 第二个人两只手抓着第一个人的身子，吊在他下面
    sim.step(dt);
    const b = sim.players[0]!.body;
    sim.teleport(1, b.x, b.y + 70, { hands: [{ x: b.x - 18, y: b.y + 18 }, { x: b.x + 18, y: b.y + 18 }] });
    const { at } = runUntilTired(sim, CFG.staminaTwoMedium + 3, [both, both], 0);
    expect(sim.players[1]!.arms.some((a) => a.grip?.kind === 'player') || at !== null).toBe(true);
    expect(at).not.toBeNull();
    const want = CFG.staminaTwoMedium / (1 + CFG.staminaLoad);
    expect(at!).toBeLessThan(want * 1.15 + 0.3);
    sim.destroy();
  });

  test('松手掉到地上站着，力气慢慢回满', async () => {
    const sim = await createSim(barLevel(), 1, MEDIUM);
    hang(sim, 0, 1000, 1);
    runUntilTired(sim, CFG.staminaOneMedium / 2, [left]);
    const p = sim.players[0]!;
    const half = p.stamina;
    expect(half).toBeLessThan(0.6);
    expect(half).toBeGreaterThan(0.35);
    // 松手，掉下去站好，再站够回满的时间
    runUntilTired(sim, 1.5 + CFG.staminaRestMedium, [idle]);
    expect(p.ground).toBe(true);
    expect(p.stamina).toBe(1);
    sim.destroy();
  });

  test('手机局：快照带着力气，别的手机拼得出来', async () => {
    const lv = barLevel();
    const sim = await createSim(lv, 1, MEDIUM);
    hang(sim, 0, 1000, 1);
    runUntilTired(sim, 3, [left]);
    const snap = encodeSnap(sim, 1);
    const st = sim.players[0]!.stamina;
    expect(snap.p[0]![30]).toBeCloseTo(st, 2);
    const view = new RemoteSim(() => lv, lv);
    view.apply(snap, 1000);
    expect(view.players[0]!.stamina).toBeCloseTo(st, 2);
    sim.destroy();
  });
});

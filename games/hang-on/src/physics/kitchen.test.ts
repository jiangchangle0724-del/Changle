/**
 * 后厨的机关（A10）：蒸笼喷汽（喷的时候把汽柱里的人和东西往上托，停的时候不托；喷之前先报快喷了），
 * 端托盘（放着不翻；歪太久、掉下去、碰到热锅就翻，翻了回存档的地方；托盘过了检查点就存档；
 * 抓中间端得平、抓一头就歪；托盘不在终点不算过关；比谁先没有托盘）。
 */
import { describe, expect, test } from 'vitest';
import { encodeSnap, RemoteSim } from '../net/snap';
import { CFG } from './config';
import { kitchenLevel, type Level } from './level';
import { ventState } from './motion';
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
const level = (): Level => kitchenLevel();
const vent0 = level().vents![0]!;
/** 站在第一摞蒸笼顶上的位置。 */
const onVent = { x: vent0.x + vent0.w / 2, y: vent0.y - CFG.bodyR - 1 };

/** 把托盘摆到 (x, y)，转 angle 弧度，不动。 */
function placeTray(sim: Sim, x: number, y: number, angle = 0): void {
  const prop = sim.props[sim.tray!.prop]!;
  prop.rb.setTranslation({ x, y }, true);
  prop.rb.setLinvel({ x: 0, y: 0 }, true);
  prop.rb.setAngvel(0, true);
  prop.rb.setRotation(angle, true);
}

describe('蒸笼喷汽', () => {
  test('喷的时候站在蒸笼上的人被托上去 200 px 以上，停的时候不托', async () => {
    const sim = await createSim(level(), 1);
    // 第一摞 phase 0：0 到 1.4 秒喷着
    sim.teleport(0, onVent.x, onVent.y);
    let top = Infinity;
    run(sim, 1.2, () => {
      sim.setInput(0, idle);
      top = Math.min(top, sim.players[0]!.body.y);
    });
    expect(onVent.y - top).toBeGreaterThan(200);
    // 停着的时候（1.4 到 3.6 秒）：站上去不动
    const sim2 = await createSim(level(), 1);
    run(sim2, 1.6);
    expect(ventState(vent0, sim2.time).on).toBe(false);
    sim2.teleport(0, onVent.x, onVent.y);
    let top2 = Infinity;
    run(sim2, 1.2, () => {
      sim2.setInput(0, idle);
      top2 = Math.min(top2, sim2.players[0]!.body.y);
    });
    expect(onVent.y - top2).toBeLessThan(20);
    sim.destroy();
    sim2.destroy();
  });

  test('喷之前先报快喷了，再报喷了；汽柱外面的人不托', async () => {
    const sim = await createSim(level(), 1);
    sim.teleport(0, 200, 520);
    const evs = run(sim, 4.2, () => sim.setInput(0, idle));
    const v = evs.filter((e) => e.type === 'vent' && e.index === 0);
    expect(v.map((e) => (e.type === 'vent' ? e.phase : ''))).toEqual(['warn', 'on']);
    // 离蒸笼远的人一直站在台子上
    expect(Math.abs(sim.players[0]!.body.y - 536)).toBeLessThan(6);
    sim.destroy();
  });

  test('汽也托东西：托盘放进汽柱里会被托起来', async () => {
    const sim = await createSim(level(), 1);
    sim.teleport(0, 100, 520);
    placeTray(sim, onVent.x, vent0.y - 10);
    let top = Infinity;
    run(sim, 1, () => {
      top = Math.min(top, sim.props[sim.tray!.prop]!.y);
    });
    expect(vent0.y - 10 - top).toBeGreaterThan(80);
    sim.destroy();
  });
});

describe('端托盘', () => {
  test('闯关里有托盘，放在台子上不翻；比谁先里没有', async () => {
    const sim = await createSim(level(), 2);
    expect(sim.tray).not.toBeNull();
    const evs = run(sim, 3, () => {
      sim.setInput(0, idle);
      sim.setInput(1, idle);
    });
    expect(evs.some((e) => e.type === 'tray')).toBe(false);
    const prop = sim.props[sim.tray!.prop]!;
    expect(prop.kind).toBe('tray');
    expect(Math.abs(prop.x - 340)).toBeLessThan(4);
    sim.destroy();
    const race = await createSim(level(), 2, { mode: 'race' });
    expect(race.tray).toBeNull();
    expect(race.props.some((o) => o.kind === 'tray')).toBe(false);
    race.destroy();
  });

  test('歪太久点心就翻，过一会儿托盘摆平回到开局那里', async () => {
    const sim = await createSim(level(), 1);
    sim.teleport(0, 100, 520);
    run(sim, CFG.trayGrace + 0.2);
    // 歪着卡住（每一步都摆回歪的样子）
    const evs = run(sim, 0.6, () => placeTray(sim, 400, 400, 1.2));
    const spill = evs.find((e) => e.type === 'tray' && e.phase === 'spill');
    expect(spill).toBeTruthy();
    expect(sim.tray!.spilled).toBe(true);
    const back = run(sim, CFG.trayBack + 0.3).find((e) => e.type === 'tray' && e.phase === 'back');
    expect(back).toMatchObject({ x: 340, y: 554 });
    expect(sim.tray!.spilled).toBe(false);
    run(sim, 0.5);
    const prop = sim.props[sim.tray!.prop]!;
    expect(Math.abs(prop.angle)).toBeLessThan(0.05);
    expect(Math.abs(prop.x - 340)).toBeLessThan(4);
    sim.destroy();
  });

  test('掉下去、碰到热锅也翻；托盘过了检查点，翻了回那个检查点', async () => {
    const lv = level();
    const sim = await createSim(lv, 1);
    run(sim, 0.2);
    placeTray(sim, 800, lv.deathY + 30);
    let evs = run(sim, 0.3);
    expect(evs.some((e) => e.type === 'tray' && e.phase === 'spill')).toBe(true);
    run(sim, CFG.trayBack + 0.3);
    // 热锅
    const wok = lv.hazards![0]!;
    evs = run(sim, 0.3, () => placeTray(sim, wok.x + wok.w / 2, wok.y + 6));
    expect(evs.some((e) => e.type === 'tray' && e.phase === 'spill')).toBe(true);
    run(sim, CFG.trayBack + 0.3);
    // 有人到了第一个检查点，托盘也在旁边：存档
    const cp = lv.checkpoints![0]!;
    sim.teleport(0, cp.x, cp.y);
    placeTray(sim, cp.x - 90, cp.y + 28);
    run(sim, 0.4);
    expect(sim.checkpoint).toBe(0);
    expect(sim.tray!.cp).toBe(0);
    evs = run(sim, 0.3, () => placeTray(sim, 900, lv.deathY + 30));
    const back = run(sim, CFG.trayBack + 0.3).find((e) => e.type === 'tray' && e.phase === 'back');
    expect(back).toMatchObject(lv.tray![1]!);
    sim.destroy();
  });

  test('抓托盘中间端得平，抓一头就歪、点心翻', async () => {
    const lv = level();
    for (const [dx, spills] of [
      [0, false],
      [40, true],
    ] as const) {
      const sim = await createSim(lv, 1);
      run(sim, 0.3);
      // 右手抓着砧板底下挂着，左手抓托盘：托盘先摆在人旁边的空中，等手抓上了再放开
      const tx = 860;
      const ty = 330;
      placeTray(sim, tx, ty);
      const hold: PadInput = { ...idle, gl: true, gr: true };
      sim.setInput(0, hold);
      sim.teleport(0, 900, 290, { hands: [{ x: tx + dx, y: ty - CFG.trayH / 2 - 4 }, { x: 920, y: 229 }] });
      const evs = run(sim, 1.5, () => {
        sim.setInput(0, hold);
        if (sim.time < 0.8) placeTray(sim, tx, ty);
      });
      const p = sim.players[0]!;
      expect(p.arms[1].grip?.kind, `dx ${dx}: right hand on the board`).toBe('terrain');
      expect(evs.some((e) => e.type === 'tray' && e.phase === 'spill'), `dx ${dx}`).toBe(spills);
      if (!spills) expect(p.arms[0].grip?.kind, `dx ${dx}: left hand on the tray`).toBe('prop');
      sim.destroy();
    }
  });

  test('端着托盘悬在空中往上推，不能把自己推上天', async () => {
    const sim = await createSim(level(), 1);
    run(sim, 0.3);
    placeTray(sim, 400, 380);
    sim.teleport(0, 400, 330, { hands: [{ x: 400, y: 374 }, { x: 440, y: 300 }] });
    let top = Infinity;
    run(sim, 2, () => {
      sim.setInput(0, { ax: 0, ay: -1, gl: true, gr: false });
      top = Math.min(top, sim.players[0]!.body.y);
    });
    // 只有空中拽人那一秒的余量（CFG.airPullTime），上不去多少，最后掉回台子上（托盘落到台面上以后能撑着它往上推，那是实在的）
    expect(330 - top).toBeLessThan(120);
    expect(sim.players[0]!.body.y).toBeGreaterThan(330);
    sim.destroy();
  });

  test('人都到了终点还不算，托盘也端进终点才过关', async () => {
    const lv = level();
    const sim = await createSim(lv, 2);
    run(sim, 0.3);
    const g = lv.goal;
    const inGoal = (): void => {
      sim.teleport(0, g.x + 40, g.y + g.h - 30);
      sim.teleport(1, g.x + 100, g.y + g.h - 30);
    };
    inGoal();
    run(sim, 1, () => {
      sim.setInput(0, idle);
      sim.setInput(1, idle);
    });
    expect(sim.won).toBe(false);
    placeTray(sim, g.x + 160, g.y + g.h - 8);
    const evs = run(sim, 1, () => {
      sim.setInput(0, idle);
      sim.setInput(1, idle);
    });
    expect(evs.some((e) => e.type === 'tray' && e.phase === 'home')).toBe(true);
    expect(sim.won).toBe(true);
    sim.destroy();
  });

  test('手机局：快照带着托盘（是哪个物件、翻没翻），别的手机上画得出来', async () => {
    const lv = level();
    const sim = await createSim(lv, 1);
    const view = new RemoteSim(() => lv, lv);
    run(sim, CFG.trayGrace + 0.2);
    let snap = encodeSnap(sim, 1);
    expect(snap.ty).toEqual([sim.tray!.prop, 0]);
    view.apply(snap, 1000);
    expect(view.tray).toEqual({ prop: sim.tray!.prop, spilled: false });
    expect(view.props[sim.tray!.prop]?.kind).toBe('tray');
    run(sim, 0.6, () => placeTray(sim, 400, 400, 1.2));
    snap = encodeSnap(sim, 2);
    expect(snap.ty?.[1]).toBe(1);
    view.apply(snap, 1050);
    expect(view.tray?.spilled).toBe(true);
    sim.destroy();
  });
});

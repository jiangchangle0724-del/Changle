/**
 * 老宅的机关（A10）：钥匙（抓住报「找到了」；碰到它的门，门就一直开着，钥匙插进锁里没了；掉下去回到开局或者存档的检查点；
 * 有人碰着锁着的门隔几秒提醒一次），墙上灭着的灯（人、灯笼碰一下就点着），手机局快照带着钥匙和灯。
 */
import { describe, expect, test } from 'vitest';
import { encodeSnap, RemoteSim } from '../net/snap';
import { CFG } from './config';
import { houseLevel, snowLevel, type Level } from './level';
import { createSim, type PadInput, type Prop, type Sim, type SimEvent } from './world';

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
const level = (): Level => houseLevel();
/** 把一个物件搬到 (x, y)，不动（测试里摆位置用）。 */
function place(prop: Prop, x: number, y: number): void {
  prop.rb.setTranslation({ x, y }, true);
  prop.rb.setLinvel({ x: 0, y: 0 }, true);
  prop.rb.setAngvel(0, true);
}
const keyProp = (sim: Sim): Prop => sim.props[sim.keys[0]!.prop]!;

describe('钥匙和锁着的门', () => {
  test('关里的钥匙、灯笼是物件，门开局锁着', async () => {
    const sim = await createSim(level(), 1);
    expect(sim.keys).toHaveLength(1);
    expect(keyProp(sim).kind).toBe('key');
    expect(sim.props[sim.lanterns[0]!.prop]!.kind).toBe('lantern');
    expect(sim.keys[0]!.gate).toBe(0);
    run(sim, 2, () => sim.setInput(0, idle));
    expect(sim.gates[0]!.open).toBe(0);
    expect(sim.gates[0]!.unlocked).toBe(false);
    sim.destroy();
  });

  test('钥匙碰到它的门：门开了、一直开着，钥匙插进锁里没了', async () => {
    const sim = await createSim(level(), 1);
    const door = sim.gates[0]!;
    place(keyProp(sim), door.x - 14, door.y + door.h - 40);
    const evs = run(sim, 0.3, () => sim.setInput(0, idle));
    const unlock = evs.find((e) => e.type === 'key' && e.phase === 'unlock');
    expect(unlock).toBeTruthy();
    expect(sim.keys[0]!.used).toBe(true);
    expect(door.unlocked).toBe(true);
    expect(keyProp(sim).rb.isEnabled()).toBe(false);
    // 开到底，过多久都不关
    run(sim, 3, () => sim.setInput(0, idle));
    expect(door.open).toBe(1);
    run(sim, 5, () => sim.setInput(0, idle));
    expect(door.open).toBe(1);
    expect(door.y).toBeCloseTo(door.def.y + door.def.move.y, 0);
    sim.destroy();
  });

  test('头一回抓住钥匙报「找到了」，只报一次', async () => {
    const sim = await createSim(level(), 1);
    const k = keyProp(sim);
    const hold: PadInput = { ...idle, gl: true };
    sim.setInput(0, hold);
    sim.teleport(0, k.x - 40, k.y - 30, { hands: [{ x: k.x, y: k.y }, null] });
    let evs = run(sim, 0.5, () => sim.setInput(0, hold));
    expect(sim.players[0]!.arms[0].grip?.kind).toBe('prop');
    expect(evs.filter((e) => e.type === 'key' && e.phase === 'found')).toHaveLength(1);
    expect(sim.keys[0]!.found).toBe(true);
    // 松开再抓，不再报
    run(sim, 0.3, () => sim.setInput(0, idle));
    evs = run(sim, 0.5, () => sim.setInput(0, hold));
    expect(evs.some((e) => e.type === 'key' && e.phase === 'found')).toBe(false);
    sim.destroy();
  });

  test('钥匙掉下去：过一会儿回到开局的地方；过了检查点的回到检查点', async () => {
    const lv = level();
    const sim = await createSim(lv, 1);
    const home = lv.keys![0]!;
    // 掉进地板的窟窿
    place(keyProp(sim), 1300, lv.deathY + 40);
    let evs = run(sim, CFG.keyBack + 0.3, () => sim.setInput(0, idle));
    expect(evs.filter((e) => e.type === 'key' && e.phase === 'back')).toHaveLength(1);
    expect(Math.abs(keyProp(sim).x - home.x)).toBeLessThan(20);
    expect(keyProp(sim).y).toBeLessThan(home.y + 20);
    // 大家过了检查点、钥匙也被带到检查点跟前：以后掉了回检查点
    const cp = lv.checkpoints![0]!;
    sim.teleport(0, cp.x, cp.y);
    run(sim, 0.2, () => sim.setInput(0, idle));
    expect(sim.checkpoint).toBe(0);
    place(keyProp(sim), cp.x + 80, cp.y);
    run(sim, 0.2, () => sim.setInput(0, idle));
    expect(sim.keys[0]!.cp).toBe(0);
    place(keyProp(sim), 1300, lv.deathY + 40);
    evs = run(sim, CFG.keyBack + 0.6, () => sim.setInput(0, idle));
    expect(evs.some((e) => e.type === 'key' && e.phase === 'back')).toBe(true);
    expect(Math.abs(keyProp(sim).x - (cp.x + 45))).toBeLessThan(30);
    sim.destroy();
  });

  test('碰到要命的东西的钥匙也回来', async () => {
    const lv = level();
    const sim = await createSim(lv, 1);
    const fire = lv.hazards!.find((h) => h.kind === 'hot')!;
    place(keyProp(sim), fire.x + fire.w / 2, fire.y + 4);
    const evs = run(sim, CFG.keyBack + 0.3, () => sim.setInput(0, idle));
    expect(evs.some((e) => e.type === 'key' && e.phase === 'back')).toBe(true);
    sim.destroy();
  });

  test('有人贴着锁着的门：提醒「门锁着」，隔几秒一次；开了就不提醒', async () => {
    const sim = await createSim(level(), 1);
    const door = sim.gates[0]!;
    sim.teleport(0, door.x - CFG.bodyR - 2, door.y + door.h - CFG.bodyR - 2);
    const evs = run(sim, CFG.lockedHint + 0.6, () => sim.setInput(0, idle));
    expect(evs.filter((e) => e.type === 'key' && e.phase === 'locked')).toHaveLength(2);
    place(keyProp(sim), door.x - 14, door.y + door.h - 120);
    const after = run(sim, CFG.lockedHint + 0.6, () => sim.setInput(0, idle));
    expect(after.some((e) => e.type === 'key' && e.phase === 'locked')).toBe(false);
    sim.destroy();
  });
});

describe('墙上的灯', () => {
  test('灭着的灯：人碰一下就点着，一直亮；本来亮着的不报', async () => {
    const lv = level();
    const sim = await createSim(lv, 1);
    expect(sim.lamps.map((l) => l.on)).toEqual([false, false, true]);
    const lamp = sim.lamps[0]!;
    sim.teleport(0, lamp.x, lamp.y + 20);
    const evs = run(sim, 0.2, () => sim.setInput(0, idle));
    expect(evs.filter((e) => e.type === 'lamp')).toEqual([{ type: 'lamp', index: 0, x: lamp.x, y: lamp.y }]);
    expect(lamp.on).toBe(true);
    // 人走了还亮着
    sim.teleport(0, lv.spawn.x, lv.spawn.y);
    run(sim, 1, () => sim.setInput(0, idle));
    expect(lamp.on).toBe(true);
    sim.destroy();
  });

  test('灯笼碰到灭着的灯也点着', async () => {
    const sim = await createSim(level(), 1);
    const lamp = sim.lamps[1]!;
    place(sim.props[sim.lanterns[0]!.prop]!, lamp.x, lamp.y + 10);
    const evs = run(sim, 0.1, () => sim.setInput(0, idle));
    expect(evs.some((e) => e.type === 'lamp' && e.index === 1)).toBe(true);
    expect(lamp.on).toBe(true);
    sim.destroy();
  });
});

describe('手机局', () => {
  test('快照带着钥匙（找到没有、用掉没有）和亮着的灯，别的手机拼得出来', async () => {
    const lv = level();
    const sim = await createSim(lv, 1);
    const view = new RemoteSim(() => lv, lv);
    const door = sim.gates[0]!;
    place(keyProp(sim), door.x - 14, door.y + door.h - 40);
    const lamp = sim.lamps[0]!;
    sim.teleport(0, lamp.x, lamp.y + 20);
    run(sim, 0.3, () => sim.setInput(0, idle));
    const snap = encodeSnap(sim, 1);
    expect(snap.ky).toEqual([sim.keys[0]!.prop, 2]);
    expect(snap.lm).toBe(0b101);
    expect(snap.o.map((o) => o[5])).toEqual([4, 5]);
    view.apply(snap, 1000);
    expect(view.keys).toEqual([{ prop: sim.keys[0]!.prop, found: false, used: true }]);
    expect(view.lamps.map((l) => l.on)).toEqual([true, false, true]);
    expect(view.props.map((p) => p.kind)).toEqual(['key', 'lantern']);
    sim.destroy();
  });

  test('没有钥匙和灯的关：快照里不带', async () => {
    const lv = snowLevel();
    const sim = await createSim(lv, 1);
    run(sim, 0.2, () => sim.setInput(0, idle));
    const snap = encodeSnap(sim, 1);
    expect(snap.ky).toBeUndefined();
    expect(snap.lm).toBeUndefined();
    expect(sim.keys).toHaveLength(0);
    sim.destroy();
  });
});

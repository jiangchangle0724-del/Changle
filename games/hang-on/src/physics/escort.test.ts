/**
 * 护送大元宝（11-26）：大厅里打开才有（回放、验收没有，回放不变）；开局悬在起点上面落下来；
 * 送进终点报一声、算送到；扛着掉了回到它到过的检查点，没人碰过的悄悄回起点；手机局快照里画得出来。
 */
import { describe, expect, test } from 'vitest';
import { LEVELS } from '../levels';
import { encodeSnap, RemoteSim } from '../net/snap';
import { CFG } from './config';
import type { Level } from './level';
import { createSim, type PadInput, type Prop, type Sim, type SimEvent } from './world';

const dt = 1 / 60;
function run(sim: Sim, seconds: number): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    for (let p = 0; p < sim.players.length; p++) sim.setInput(p, idle);
    sim.step(dt);
    all.push(...sim.events);
    if (sim.won) break;
  }
  return all;
}
const idle: PadInput = { ax: 0, ay: 0, gl: false, gr: false };
function place(prop: Prop, x: number, y: number): void {
  prop.rb.setTranslation({ x, y }, true);
  prop.rb.setLinvel({ x: 0, y: 0 }, true);
  prop.rb.setAngvel(0, true);
}
const level = (): Level => LEVELS.find((l) => l.id === 'table-02') as Level;
const ingot = (sim: Sim): Prop => sim.props[sim.escort!.prop]!;

describe('护送大元宝', () => {
  test('大厅里打开才有：不开（回放、验收）多不出物件；比谁先、坐不住不放', async () => {
    const off = await createSim(level(), 2);
    expect(off.escort).toBeNull();
    const n = off.props.length;
    off.destroy();
    const on = await createSim(level(), 2, { mode: 'climb', escort: true });
    expect(on.escort).not.toBeNull();
    expect(on.props).toHaveLength(n + 1);
    expect(ingot(on).kind).toBe('ingot');
    expect(ingot(on).w).toBe(CFG.escortW);
    on.destroy();
    const race = await createSim(level(), 2, { mode: 'race', escort: true });
    expect(race.escort).toBeNull();
    race.destroy();
  });

  test('开局落在起点，站得住，不报掉了', async () => {
    const sim = await createSim(level(), 2, { mode: 'climb', escort: true });
    const evs = run(sim, 3);
    expect(evs.filter((e) => e.type === 'escort')).toEqual([]);
    const lv = level();
    expect(Math.abs(ingot(sim).x - lv.spawn.x)).toBeLessThan(160);
    expect(ingot(sim).y).toBeLessThan(lv.deathY);
    sim.destroy();
  });

  test('送进终点：报一声，算送到了，只报一次', async () => {
    const lv = level();
    const sim = await createSim(lv, 2, { mode: 'climb', escort: true });
    place(ingot(sim), lv.goal.x + lv.goal.w / 2, lv.goal.y + lv.goal.h / 2);
    const evs = run(sim, 0.5);
    expect(evs.filter((e) => e.type === 'escort' && e.phase === 'home')).toHaveLength(1);
    expect(sim.escort!.done).toBe(true);
    expect(run(sim, 0.5).filter((e) => e.type === 'escort')).toEqual([]);
    sim.destroy();
  });

  test('掉出去了：没人碰过的悄悄回起点；扛过的报「回到检查点」', async () => {
    const lv = level();
    const sim = await createSim(lv, 1, { mode: 'climb', escort: true });
    place(ingot(sim), lv.spawn.x + 300, lv.deathY + 60);
    let evs = run(sim, CFG.keyBack + 0.4);
    expect(evs.filter((e) => e.type === 'escort')).toEqual([]);
    expect(Math.abs(ingot(sim).x - sim.escort!.home.x)).toBeLessThan(40);
    sim.escort!.touched = true;
    place(ingot(sim), lv.spawn.x + 300, lv.deathY + 60);
    evs = run(sim, CFG.keyBack + 0.4);
    expect(evs.filter((e) => e.type === 'escort' && e.phase === 'back')).toHaveLength(1);
    sim.destroy();
  });

  test('手机局：快照里有这个大元宝，画得出来', async () => {
    const lv = level();
    const sim = await createSim(lv, 2, { mode: 'climb', escort: true });
    run(sim, 0.5);
    const view = new RemoteSim(() => lv, lv);
    view.apply(encodeSnap(sim, 1), 1000);
    view.advance(1000);
    const p = view.props.find((o) => o.kind === 'ingot');
    expect(p).toBeDefined();
    expect(p!.w).toBe(CFG.escortW);
    expect(Math.abs(p!.x - ingot(sim).x)).toBeLessThan(2);
    sim.destroy();
  });
});

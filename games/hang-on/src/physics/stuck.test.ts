/**
 * 手卡住（11-23）：Steve 在大屏上看到手嵌在台子里出不来。动台、转杆、门这些会动的硬东西能把手压进去，
 * 手心一过薄台子的一半，台子把它往外推的方向和胳膊使劲的方向顶着，就一直卡在里头。
 * 修法：没抓东西的手，手心嵌进硬东西 handStuckDepth px 以上、连着 handStuckT 秒，这条胳膊摆回肩膀旁边一个空地方
 * （world.ts unstickHands）。
 */
import { describe, expect, test } from 'vitest';
import { CFG } from './config';
import type { Level } from './level';
import { createSim, type Sim } from './world';

const dt = 1 / 60;
const base: Level = {
  id: 'stuck-test',
  world: 'table',
  w: 1600,
  h: 900,
  spawn: { x: 100, y: 500 },
  goal: { x: 1400, y: 100, w: 150, h: 150 },
  rects: [{ x: 0, y: 540, w: 1600, h: 200, kind: 'ground', material: 'wood' }],
  deathY: 1000,
};
/** 手心嵌进硬东西多深（和 world.ts 用同一个查询）。 */
const depth = (sim: Sim, pt: { x: number; y: number }): number => (sim as unknown as { embedDepth(p: { x: number; y: number }): number }).embedDepth(pt);

describe('手卡在硬东西里', () => {
  test('站在薄台子上，手嵌进脚下的台子、还往下按着：一秒后胳膊摆出来', async () => {
    // Steve 11-23 的照片：人站在台子上，胳膊搭过台子边，手嵌在台子里靠下的地方出不来
    const plat = { x: 100, y: 440, w: 600, h: 22, material: 'wood' };
    const sim = await createSim({ ...base, spawn: { x: 300, y: 400 }, rects: [{ x: 0, y: 800, w: 1600, h: 100, kind: 'ground', material: 'wood' }, plat] }, 1);
    sim.teleport(0, 300, 410);
    for (let i = 0; i < 40; i++) sim.step(dt);
    const p = sim.players[0]!;
    // 把右手塞进台子里：手心在台子上沿下面 13 px（台子 22 px 厚，过了一半）
    const seg = p.arms[1].segs[CFG.armSegs - 1]!;
    seg.setRotation(Math.PI / 2, true);
    seg.setTranslation({ x: p.body.x + 45, y: plat.y + 13 - CFG.segLen / 2 }, true);
    let longest = 0;
    let run = 0;
    for (let i = 0; i < 300; i++) {
      sim.setInput(0, { ax: 0.3, ay: 1, gl: false, gr: false });
      sim.step(dt);
      run = depth(sim, p.arms[1].hand) >= CFG.handStuckDepth ? run + 1 : 0;
      longest = Math.max(longest, run);
    }
    // 没修的时候整整 5 秒都嵌在里头
    expect(longest * dt, '真的卡住过（这个测试还在测东西）').toBeGreaterThan(CFG.handStuckT - 0.05);
    expect(longest * dt, '卡了 handStuckT 秒就摆出来了').toBeLessThanOrEqual(CFG.handStuckT + 0.05);
    expect(depth(sim, p.arms[1].hand)).toBeLessThan(CFG.handStuckDepth);
    expect(p.arms[1].hand.y, '手在台子上面').toBeLessThan(plat.y);
    sim.destroy();
  });

  test('平时站着、抓台子底、挂着、松手，手都不算卡住', async () => {
    const block = { x: 160, y: 380, w: 300, h: 40, material: 'wood' };
    const sim = await createSim({ ...base, rects: [...base.rects, block] }, 1);
    sim.teleport(0, block.x + block.w / 2, 500);
    let gripped = false;
    let stuck = 0;
    for (let i = 0; i < 360; i++) {
      // 两秒往上够着抓台子底，再挂两秒，然后松手站着
      const reach = i < 240;
      sim.setInput(0, { ax: 0, ay: reach ? -1 : 1, gl: reach, gr: reach });
      sim.step(dt);
      const p = sim.players[0]!;
      if (p.arms.some((a) => a.grip)) gripped = true;
      stuck = Math.max(stuck, ...p.arms.map((a) => a.stuckT));
    }
    expect(gripped, '手够得着台子底、抓上了').toBe(true);
    expect(stuck).toBe(0);
    sim.destroy();
  });
});

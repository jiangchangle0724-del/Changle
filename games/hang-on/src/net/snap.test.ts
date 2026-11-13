/**
 * 手机局的快照：主机压、手机拼，拼出来的局面和主机的一样（差在四舍五入以内），匀得过去，旧的不要。
 */
import { describe, expect, test } from 'vitest';
import { levelById, LEVELS } from '../levels';
import type { Level } from '../physics/level';
import { createSim, type Sim, type SimEvent } from '../physics/world';
import { encodeSnap, EventWindow, RemoteSim, SNAP_PLAYER_LEN } from './snap';

const find = (id: string): Level | undefined => levelById(id) ?? undefined;
const pick = (pred: (l: Level) => boolean): Level => LEVELS.find(pred) as Level;

async function played(level: Level, n: number, seconds: number): Promise<Sim> {
  const sim = await createSim(level, n);
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    sim.players.forEach((_, k) => sim.setInput(k, { ax: k % 2 ? 1 : -0.5, ay: -0.6, gl: (i >> 4) % 2 === 0, gr: (i >> 4) % 2 === 1 }));
    sim.step(1 / 60);
  }
  return sim;
}

function close(a: number, b: number, tol = 0.11): void {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
}

describe('手机局快照', () => {
  test('拼出来的人、胳膊、绳子、物件、饼干、蜡烛和主机的一样', async () => {
    // 挑一关有绳子、跷跷板、饼干、蜡烛的：总复习
    const level = pick((l) => !!l.ropes?.length && !!l.seesaws?.length && !!l.fading?.length && !!l.springs?.length);
    const sim = await played(level, 3, 2);
    const snap = encodeSnap(sim, 1, { k: 0, list: sim.events });
    expect(snap.p).toHaveLength(3);
    expect(snap.p[0]).toHaveLength(SNAP_PLAYER_LEN);
    const view = new RemoteSim(find, LEVELS[0] as Level);
    view.apply(snap, 1000);
    view.advance(2000);
    expect(view.level.id).toBe(level.id);
    sim.players.forEach((p, i) => {
      const q = view.players[i]!;
      close(q.body.x, p.body.x);
      close(q.body.y, p.body.y);
      expect(q.dead).toBe(p.dead);
      expect(q.face).toBe(p.face);
      p.arms.forEach((arm, a) => {
        arm.pts.forEach((pt, k) => {
          close(q.arms[a]!.pts[k]!.x, pt.x);
          close(q.arms[a]!.pts[k]!.y, pt.y);
        });
        expect(!!q.arms[a]!.grip).toBe(!!arm.grip);
        close(q.arms[a]!.hand.x, arm.hand.x);
      });
    });
    expect(view.ropes).toHaveLength(sim.ropes.length);
    view.ropes.forEach((r, i) => {
      expect(r.pts).toHaveLength(sim.ropes[i]!.pts.length);
      close(r.handle.x, sim.ropes[i]!.handle.x);
      close(r.anchor.y, sim.ropes[i]!.anchor.y);
    });
    view.props.forEach((o, i) => {
      close(o.x, sim.props[i]!.x);
      close(o.angle, sim.props[i]!.angle, 0.002);
      expect(o.kind).toBe(sim.props[i]!.kind);
    });
    expect(view.fadings.map((f) => [f.x, f.y, f.w, f.h, f.on])).toEqual(sim.fadings.map((f) => [f.x, f.y, f.w, f.h, f.on]));
    expect(view.springs.map((s) => [s.x, s.w])).toEqual(sim.springs.map((s) => [s.x, s.w]));
    sim.destroy();
  });

  test('一张快照有多大：四个人加机关，压成文字不到 2.5 KB', async () => {
    const level = pick((l) => !!l.ropes?.length && !!l.seesaws?.length);
    const sim = await played(level, 4, 1);
    expect(JSON.stringify({ k: 'snap', s: encodeSnap(sim, 1) }).length).toBeLessThan(2500);
    sim.destroy();
  });

  test('两张之间匀过去：一半时间在中间，旧序号的不要', async () => {
    const level = LEVELS[0] as Level;
    const sim = await createSim(level, 1);
    const view = new RemoteSim(find, level);
    const a = encodeSnap(sim, 1);
    sim.teleport(0, sim.players[0]!.body.x + 100, sim.players[0]!.body.y);
    const b = encodeSnap(sim, 2);
    view.apply(a, 1000);
    const x0 = view.players[0]!.body.x;
    view.apply(b, 1050);
    view.advance(1075);
    close(view.players[0]!.body.x, x0 + 50, 1);
    view.advance(1100);
    close(view.players[0]!.body.x, x0 + 100, 0.2);
    // 晚到的旧快照不要
    expect(view.apply(a, 1110)).toEqual([]);
    view.advance(1200);
    close(view.players[0]!.body.x, x0 + 100, 0.2);
    // 一下子挪很远（复活到检查点）：直接过去，不从半路滑
    sim.teleport(0, sim.players[0]!.body.x + 600, sim.players[0]!.body.y - 300);
    view.apply(encodeSnap(sim, 3), 1250);
    view.advance(1251);
    close(view.players[0]!.body.x, sim.players[0]!.body.x, 0.2);
    close(view.players[0]!.arms[0]!.hand.x, sim.players[0]!.arms[0]!.hand.x, 0.2);
    sim.destroy();
  });

  test('事件跟着快照走；换关、有人进来就直接跳过去', async () => {
    const one = LEVELS[0] as Level;
    const two = LEVELS[1] as Level;
    const view = new RemoteSim(find, one);
    const s1 = await createSim(one, 1);
    const ev = view.apply(encodeSnap(s1, 1, { k: 0, list: [{ type: 'checkpoint', index: 0 }] }), 1000);
    expect(ev).toEqual([{ type: 'checkpoint', index: 0 }]);
    const s2 = await createSim(two, 2);
    view.apply(encodeSnap(s2, 2), 1050);
    expect(view.level.id).toBe(two.id);
    expect(view.players).toHaveLength(2);
    close(view.players[1]!.body.x, s2.players[1]!.body.x);
    s1.destroy();
    s2.destroy();
  });

  test('画面比快照慢（慢手机一帧要好久）：几张快照挤在两帧之间也照样跟上', async () => {
    const level = LEVELS[0] as Level;
    const sim = await createSim(level, 1);
    const view = new RemoteSim(find, level);
    const x0 = sim.players[0]!.body.x;
    view.apply(encodeSnap(sim, 1), 1000);
    for (let i = 1; i <= 5; i++) {
      sim.teleport(0, x0 + i * 40, sim.players[0]!.body.y);
      sim.setInput(0, { ax: 1, ay: 0.2, gl: false, gr: false });
      view.apply(encodeSnap(sim, 1 + i), 1000 + i * 50);
    }
    // 中间一帧都没画；下一帧来的时候已经过了最后一张一个间隔
    view.advance(1300);
    close(view.players[0]!.body.x, x0 + 200, 0.2);
    close(view.players[0]!.aim.x, 0.98, 0.01);
    sim.destroy();
  });

  test('关卡照主机摆的人数摆（半路进人时快照带 np），时钟跟着人一起匀', async () => {
    const lv0 = LEVELS[0] as Level;
    const base: Level = { ...lv0, id: 'np-test', rects: [...lv0.rects, { x: 0, y: 0, w: 10, h: 10, players: [1, 2] }] };
    const sim = await createSim(base, 4);
    sim.setPlayers(5); // 开局 4 个人摆的关，第 5 个人半路进来
    const a = encodeSnap(sim, 1);
    expect(a.np).toBe(4);
    const view = new RemoteSim((id) => (id === base.id ? base : undefined), lv0);
    view.apply(a, 1000);
    expect(view.layoutFor).toBe(4);
    expect(view.level.rects).toHaveLength(base.rects.length - 1);
    // 人数没变：关卡还是同一个对象（画面不重画）
    const laid = view.level;
    sim.step(0.05);
    view.apply(encodeSnap(sim, 2), 1050);
    expect(view.level).toBe(laid);
    // 时钟和人一起匀：两张快照中间是一半
    view.advance(1075);
    close(view.time, 0.025, 0.002);
    // 人数和摆关卡的人数一样就不带 np
    const same = await createSim(base, 3);
    expect(encodeSnap(same, 1).np).toBeUndefined();
    same.destroy();
    sim.destroy();
  });

  test('同一件事跟着几轮快照走，丢了一张也收得到，只放一次；房主卡住时不丢', async () => {
    const level = LEVELS[0] as Level;
    const sim = await createSim(level, 1);
    const win = new EventWindow();
    const view = new RemoteSim(find, level);
    const grab: SimEvent = { type: 'grab', player: 0, kind: 'terrain', x: 10.123, y: 20.987 };
    win.push([grab]);
    const lost = encodeSnap(sim, 1, win.take());
    win.sent();
    expect(lost.e).toEqual([{ ...grab, x: 10.1, y: 21 }]);
    // 第 1 张丢了；第 2 张还带着那一下，再加一件新的
    win.push([{ type: 'checkpoint', index: 0 }]);
    expect(view.apply(encodeSnap(sim, 2, win.take()), 1050).map((e) => e.type)).toEqual(['grab', 'checkpoint']);
    win.sent();
    // 第 3 张还带着这两件，已经放过了
    expect(view.apply(encodeSnap(sim, 3, win.take()), 1100)).toEqual([]);
    win.sent();
    // 房主卡了很久（没发快照）：事情还在，不按时间丢
    win.push([{ type: 'win' }]);
    expect(win.take().list.map((e) => e.type)).toEqual(['grab', 'checkpoint', 'win']);
    // 发够 6 轮，先来的拿掉，编号接着往下数
    for (let i = 0; i < 3; i++) win.sent();
    const late = encodeSnap(sim, 4, win.take());
    expect(late.e?.map((e) => e.type)).toEqual(['checkpoint', 'win']);
    expect(late.ek).toBe(1);
    expect(view.apply(late, 1500)).toEqual([{ type: 'win' }]);
    win.sent();
    expect(win.take()).toEqual({ k: 2, list: [{ type: 'win' }] });
    // 一下子来很多也只带最近的 40 件
    win.push(Array.from({ length: 60 }, (_, i): SimEvent => ({ type: 'checkpoint', index: i })));
    expect(win.take().list).toHaveLength(40);
    sim.destroy();
  });

  test('蜡烛的弹跳、饼干的倒计时在两张快照之间照本地时间走', async () => {
    const level = pick((l) => !!l.fading?.length && !!l.springs?.length);
    const sim = await createSim(level, 1);
    const snap = encodeSnap(sim, 1);
    snap.s[0] = 0.1;
    const view = new RemoteSim(find, level);
    view.apply(snap, 1000);
    const left = view.fadings[0]!.left;
    view.advance(1100);
    close(view.springs[0]!.hit, 0.2, 0.02);
    close(view.fadings[0]!.left, left - 0.1, 0.02);
    sim.destroy();
  });
});

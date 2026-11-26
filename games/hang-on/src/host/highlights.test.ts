/** 精彩回放（11-26）：录事前 3 秒到事后 1.5 秒；一局留最要紧的一段；一样要紧的留后来的；太短的不要。 */
import { describe, expect, test } from 'vitest';
import type { Snap } from '../net/protocol';
import { CLIP_AFTER, CLIP_BEFORE, Highlights, momentOf, SNAP_EVERY } from './highlights';

const snap = (n: number): Snap => ({ n, lv: 'x', t: 0, p: [] }) as unknown as Snap;
const name = (i: number): string => `P${i + 1}`;

/** 从 from 秒录到 to 秒，到 at 秒时出一件事。 */
function record(h: Highlights, from: number, to: number, marks: { at: number; m: ReturnType<typeof momentOf> }[] = []): void {
  let n = 0;
  for (let t = from; t <= to + 1e-9; t += SNAP_EVERY) {
    h.push(t, snap(n++));
    for (const x of marks) if (Math.abs(x.at - t) < SNAP_EVERY / 2 && x.m) h.mark(x.m);
  }
}

describe('精彩回放', () => {
  test('哪些事值得回放：松手 > 召唤 > 被撞、送到元宝 > 碰机关死 > 掉下去 > 到顶', () => {
    const p = (ev: Parameters<typeof momentOf>[0]): number => momentOf(ev, 1, name)?.priority ?? 0;
    expect(p({ type: 'betrayal', by: 1, victim: 0 })).toBeGreaterThan(p({ type: 'summon', player: 0, who: [1] }));
    expect(p({ type: 'summon', player: 0, who: [1] })).toBeGreaterThan(p({ type: 'bonk', player: 0, x: 0, y: 0 }));
    expect(p({ type: 'death', player: 0, x: 0, y: 0, cause: 'hot' })).toBeGreaterThan(p({ type: 'death', player: 0, x: 0, y: 0 }));
    expect(p({ type: 'death', player: 0, x: 0, y: 0 })).toBeGreaterThan(p({ type: 'win' }));
    expect(momentOf({ type: 'summon', player: 0, who: [] }, 1, name)).toBeNull();
    expect(momentOf({ type: 'grab', player: 0, kind: 'terrain', x: 0, y: 0 }, 1, name)).toBeNull();
    expect(momentOf({ type: 'betrayal', by: 1, victim: 0 }, 1, name)?.zh).toBe('P2 松手了');
  });

  test('录事前 3 秒到事后 1.5 秒', () => {
    const h = new Highlights();
    record(h, 0, 20, [{ at: 10, m: momentOf({ type: 'death', player: 0, x: 0, y: 0 }, 10, name) }]);
    const c = h.best!;
    expect(c).not.toBeNull();
    const first = c.snaps[0]!.t;
    const last = c.snaps[c.snaps.length - 1]!.t;
    expect(first).toBeGreaterThanOrEqual(10 - CLIP_BEFORE - 1e-6);
    expect(first).toBeLessThan(10 - CLIP_BEFORE + 0.11);
    expect(last).toBeGreaterThanOrEqual(10 + CLIP_AFTER - 1e-6);
    expect(last).toBeLessThan(10 + CLIP_AFTER + 0.11);
  });

  test('一局留最要紧的一段；一样要紧的留后来的；不那么要紧的不换', () => {
    const h = new Highlights();
    const fall = (at: number) => ({ at, m: momentOf({ type: 'death', player: 0, x: 0, y: 0 }, at, name) });
    const betray = (at: number) => ({ at, m: momentOf({ type: 'betrayal', by: 1, victim: 0 }, at, name) });
    record(h, 0, 60, [fall(10), betray(25), fall(40), fall(50)]);
    expect(h.best!.moment.zh).toBe('P2 松手了');
    const h2 = new Highlights();
    record(h2, 0, 60, [fall(10), fall(30)]);
    expect(h2.best!.moment.at).toBe(30);
  });

  test('录着的时候来了更要紧的：换成它，多录一会儿；局完了还在录的也收下；太短的不要', () => {
    const h = new Highlights();
    record(h, 0, 12, [
      { at: 10, m: momentOf({ type: 'death', player: 0, x: 0, y: 0 }, 10, name) },
      { at: 11, m: momentOf({ type: 'betrayal', by: 1, victim: 0 }, 11, name) },
    ]);
    // 12 秒停了，事后 1.5 秒还没录够
    expect(h.best).toBeNull();
    h.close();
    expect(h.best!.moment.zh).toBe('P2 松手了');
    const short = new Highlights();
    record(short, 0, 0.2, [{ at: 0.1, m: momentOf({ type: 'win' }, 0.1, name) }]);
    short.close();
    expect(short.best).toBeNull();
    h.reset();
    expect(h.best).toBeNull();
  });
});

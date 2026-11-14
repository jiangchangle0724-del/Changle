import { describe, expect, test } from 'vitest';
import { FrameWatch } from './framewatch';

/** 按固定帧率跑 seconds 秒，回每次说「慢」的时刻（秒）。 */
function run(w: FrameWatch, fps: number, seconds: number, start = 0): number[] {
  const hits: number[] = [];
  const step = 1000 / fps;
  for (let t = start; t <= start + seconds * 1000; t += step) if (w.tick(t)) hits.push(+(t / 1000).toFixed(2));
  return hits;
}

describe('掉帧看门', () => {
  test('60 帧、40 帧一直不慢', () => {
    expect(run(new FrameWatch(), 60, 30)).toEqual([]);
    expect(run(new FrameWatch(), 40, 30)).toEqual([]);
  });

  test('25 帧：换关后 5 秒左右说慢，之后每 3 秒一次', () => {
    const hits = run(new FrameWatch(), 25, 12);
    expect(hits[0]).toBeGreaterThanOrEqual(4.9);
    expect(hits[0]).toBeLessThanOrEqual(5.1);
    expect(hits.length).toBe(3);
  });

  test('切到别的页 10 秒再回来，那一下不算一直卡', () => {
    const w = new FrameWatch();
    expect(run(w, 60, 3)).toEqual([]);
    expect(run(w, 60, 10, 13_000)).toEqual([]);
  });

  test('换关以后头 2 秒的慢帧不算', () => {
    const w = new FrameWatch();
    run(w, 60, 3);
    w.reset();
    // 换关：2 秒很卡（建画面），之后 60 帧
    expect(run(w, 10, 2, 3_000)).toEqual([]);
    expect(run(w, 60, 10, 5_000)).toEqual([]);
  });
});

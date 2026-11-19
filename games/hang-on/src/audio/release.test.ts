/** 声音放完把节点断开（Safari 不断开就不收走，见 release.ts）。 */
import { describe, expect, test } from 'vitest';
import { releaseWhenDone } from './release';

class FakeNode extends EventTarget {
  disconnected = 0;
  disconnect(): void {
    this.disconnected++;
  }
}

describe('releaseWhenDone', () => {
  test('源节点放完（ended）以后，这一串节点都断开一次；没放完不动', () => {
    const src = new FakeNode();
    const gain = new FakeNode();
    const pan = new FakeNode();
    releaseWhenDone(src as unknown as AudioScheduledSourceNode, [src, gain, null, pan] as unknown as AudioNode[]);
    expect([src.disconnected, gain.disconnected, pan.disconnected]).toEqual([0, 0, 0]);
    src.dispatchEvent(new Event('ended'));
    expect([src.disconnected, gain.disconnected, pan.disconnected]).toEqual([1, 1, 1]);
    // 只断一次
    src.dispatchEvent(new Event('ended'));
    expect(gain.disconnected).toBe(1);
  });

  test('有一个断开时出错，别的照样断开', () => {
    const src = new FakeNode();
    const bad = new FakeNode();
    bad.disconnect = () => {
      throw new Error('already');
    };
    const gain = new FakeNode();
    releaseWhenDone(src as unknown as AudioScheduledSourceNode, [bad, gain] as unknown as AudioNode[]);
    src.dispatchEvent(new Event('ended'));
    expect(gain.disconnected).toBe(1);
  });
});

/**
 * 一个声音放完，把它用到的那一串节点都断开。
 *
 * Safari（iPhone 上的浏览器和微信里打开的网页都是它）里，接在总线上的节点放完了也不会自己被收走，
 * 一直挂在声音图上：背景音乐一分钟要新建上千个节点，手机局玩久了内存和耗电一直往上走（11-18 Steve 说
 * iPhone 手机局偶尔闪退，这是查出来最像的一个原因）。放完就断开，节点才能被收走。
 */
export function releaseWhenDone(src: AudioScheduledSourceNode, nodes: readonly (AudioNode | null | undefined)[]): void {
  src.addEventListener(
    'ended',
    () => {
      for (const n of nodes) {
        if (!n) continue;
        try {
          n.disconnect();
        } catch {
          // 已经断开了
        }
      }
    },
    { once: true },
  );
}

/**
 * 掉帧看门（A8）：画面一直掉帧，就让舞台少画一点（先关近景光斑和斜光，再不画台子的侧面）。
 * 换关后先等 2 秒（建画面、编着色器那几帧不算），之后每 3 秒看一次：慢过 1/36 秒的帧加起来超过 2 秒，
 * 这一次就算「慢」。用自己的钟，一帧最多算 0.25 秒（切到别的页再回来，那一下不算成一直卡）。
 */
export class FrameWatch {
  private watchT = 0;
  private slowT = 0;
  private last = 0;

  /** 换关时：重新等 2 秒再看。 */
  reset(): void {
    this.watchT = 0;
    this.slowT = 0;
  }

  /** 每画一帧调一次，now 是毫秒（performance.now()）。看完一段而且慢，回 true。 */
  tick(now: number): boolean {
    const dt = this.last ? Math.min(0.25, Math.max(0, now - this.last) / 1000) : 0;
    this.last = now;
    this.watchT += dt;
    if (this.watchT < 2) return false;
    if (dt > 1 / 36) this.slowT += dt;
    if (this.watchT < 5) return false;
    const slow = this.slowT > 2;
    this.watchT = 2;
    this.slowT = 0;
    return slow;
  }
}

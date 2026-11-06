// The moves in a phone's motion: the peaks of its acceleration (gravity taken out). Each peak is a
// move, judged against the beat exactly like a tap of the big button (taps.ts). Pure, so the tests
// can feed it readings; the phone page's motion.ts feeds it the sensor.

/** A peak counts as a move from this much acceleration (m/s², gravity out), or 40% of the recent biggest. */
export const MIN_PEAK = 2.2;
const SHARE_OF_MAX = 0.4;
/** Two moves at least this far apart (a beat at 140 BPM is 430 ms; a quick double still counts). */
export const MIN_GAP_MS = 190;
/** The energy for the TV: this much acceleration is "all out". */
const FULL = 11;
/** How fast the energy falls off once the player stops (ms). */
const FADE_MS = 350;

export class PeakFinder {
  private sm = 0;
  private prev = 0;
  private prev2 = 0;
  private prevT = 0;
  private lastPeak = -Infinity;
  private recentMax = 0;
  private energy = 0;
  private energyAt = 0;

  /** One reading (m/s², gravity out) at time t (ms). Returns the time of a move it completes, or null. */
  feed(a: number, t: number): number | null {
    if (!Number.isFinite(a) || !Number.isFinite(t)) return null;
    this.sm = this.sm ? 0.55 * a + 0.45 * this.sm : a;
    const cur = this.sm;
    this.recentMax = Math.max(cur, this.recentMax * 0.994);
    const th = Math.max(MIN_PEAK, SHARE_OF_MAX * this.recentMax);
    let peak: number | null = null;
    // the reading before this one was a peak: higher than both neighbours, and big enough
    if (this.prevT && this.prev >= th && this.prev > this.prev2 && this.prev >= cur && this.prevT - this.lastPeak >= MIN_GAP_MS) {
      this.lastPeak = this.prevT;
      peak = this.prevT;
    }
    this.prev2 = this.prev;
    this.prev = cur;
    this.prevT = t;
    this.energy = Math.max(Math.min(1, cur / FULL), this.level(t));
    this.energyAt = t;
    return peak;
  }

  /** How hard the player is moving at time t, 0 to 1 (it falls off quickly when they stop). */
  level(t: number): number {
    const age = Math.max(0, t - this.energyAt);
    return this.energy * Math.exp(-age / FADE_MS);
  }
}

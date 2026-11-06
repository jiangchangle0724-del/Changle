// The phone's motion sensor (task A2): the phone held in the dancing hand. Its readings go to the
// peak finder (shared/peaks.ts); each peak is a move and goes to the beat judge exactly as a tap on
// the big button does. How hard the player is moving (0 to 1) goes to the TV a few times a second,
// for their little dancer there. iPhones ask the player first (one tap); Android just lets the page
// read it.
import { PeakFinder } from "../shared/peaks";

type Ask = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

export class MotionSense {
  on = false;
  denied = false;
  private readonly peaks = new PeakFinder();
  private g = { x: 0, y: 0, z: 0, set: false };
  private readonly listener = (e: DeviceMotionEvent) => this.sample(e);

  /** `onPeak(local)`: a move at this page's clock (performance.now()). */
  constructor(private readonly onPeak: (local: number) => void) {}

  /** Whether this is a phone or tablet with a sensor to ask for (a desktop has the type, but no readings). */
  static supported(): boolean {
    return typeof DeviceMotionEvent !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
  }

  /** Must run inside a tap (iPhones ask then). True when the sensor is on. */
  async start(): Promise<boolean> {
    if (this.on) return true;
    const D = (typeof DeviceMotionEvent === "undefined" ? null : DeviceMotionEvent) as Ask | null;
    if (!D) return false;
    if (typeof D.requestPermission === "function") {
      try {
        if ((await D.requestPermission()) !== "granted") {
          this.denied = true;
          return false;
        }
      } catch {
        this.denied = true;
        return false;
      }
    }
    this.denied = false;
    window.addEventListener("devicemotion", this.listener);
    this.on = true;
    return true;
  }

  stop() {
    window.removeEventListener("devicemotion", this.listener);
    this.on = false;
  }

  /** How hard the player is moving now, 0 to 1. */
  level(local = performance.now()): number {
    return this.peaks.level(local);
  }

  /** (the checks' pretend hand) a reading without gravity, m/s², at this page's time `t` */
  feed(a: number, t: number) {
    const peak = this.peaks.feed(a, t);
    if (peak !== null) this.onPeak(peak);
  }

  private sample(e: DeviceMotionEvent) {
    // the reading's own time when the browser gives a sensible one, else now
    const nowLocal = performance.now();
    const t = e.timeStamp > 0 && nowLocal - e.timeStamp >= 0 && nowLocal - e.timeStamp < 1000 ? e.timeStamp : nowLocal;
    const lin = e.acceleration;
    let a: number;
    if (lin && lin.x !== null && lin.y !== null && lin.z !== null) a = Math.hypot(lin.x, lin.y, lin.z);
    else {
      // (no reading without gravity on this phone: take gravity out with a slow average)
      const r = e.accelerationIncludingGravity;
      if (!r || r.x === null || r.y === null || r.z === null) return;
      const g = this.g;
      if (!g.set) {
        g.x = r.x;
        g.y = r.y;
        g.z = r.z;
        g.set = true;
      }
      g.x += 0.08 * (r.x - g.x);
      g.y += 0.08 * (r.y - g.y);
      g.z += 0.08 * (r.z - g.z);
      a = Math.hypot(r.x - g.x, r.y - g.y, r.z - g.z);
    }
    this.feed(a, t);
  }
}

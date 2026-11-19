// The camera's shake (2026-11-18, the big upgrade's game feel): every blow adds "trauma" and it drains
// away on its own, on the real clock (so it settles through a hit-stop instead of freezing off-centre).
// The shake is the trauma's square, so a light blow barely nudges the camera and a heavy one punches,
// and two blows close together add up. Its movement is a few waves at unrelated rates: smooth, never a
// buzz. With reduced motion there is none.

/** how much each thing that happens shakes the camera (0 to 1; the shake is its square) */
export const TRAUMA = { tag: 0.78, foul: 0.52, swing: 0.3, hide: 0, blast: 0, bike: 0.58, over: 0.5, drill: 0.42, bang: 0.66 } as const;
/** how fast the shake drains (a second), how far it reaches (scene units) and how far it rolls (radians) */
export const TRAUMA_DRAIN = 2.1;
export const SHAKE_REACH = 0.42;
export const SHAKE_ROLL = 0.014;

export interface Jolt {
  /** across and up (scene units), and the camera's roll (radians) */
  x: number;
  y: number;
  roll: number;
}

export class Shake {
  private trauma = 0;
  private clock = 0;

  /** something happened: add to the shake (it never goes past the most there is) */
  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** how much is left (0 to 1) */
  get left(): number {
    return this.trauma;
  }

  /** One frame (`deltaMs` on the real clock): the shake drains, and this is where it puts the camera. */
  step(deltaMs: number, reduced: boolean): Jolt {
    this.trauma = reduced ? 0 : Math.max(0, this.trauma - (TRAUMA_DRAIN * Math.max(0, deltaMs)) / 1000);
    this.clock += Math.max(0, deltaMs) / 1000;
    const power = this.trauma * this.trauma;
    if (power === 0) return { x: 0, y: 0, roll: 0 };
    const t = this.clock;
    return {
      x: power * SHAKE_REACH * (0.62 * Math.sin(t * 41 + 0.4) + 0.38 * Math.sin(t * 73 + 2.1)),
      y: power * SHAKE_REACH * (0.6 * Math.sin(t * 37 + 1.7) + 0.4 * Math.sin(t * 89)),
      roll: power * SHAKE_ROLL * Math.sin(t * 29 + 0.9)
    };
  }
}

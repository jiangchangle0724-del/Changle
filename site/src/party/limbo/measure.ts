/**
 * How a lean is judged against a bar, in the small (parts.tsx does the measuring, coach.ts the
 * talking). Two things every tilt game learns the hard way, here in one place:
 *
 * - Hysteresis. A body at a deep lean shakes, and the sensor reads the shake. A bar reached is a
 *   bar reached: once at it, you're still at it until you come back up HYST_DEG past it, so a
 *   wobble on the line doesn't flip "there" and "not there" twenty times a second (and the coach
 *   doesn't say so each time).
 * - The hold fills and drains. A hold used to start again from nothing the instant the lean dipped
 *   under the bar; now it drains, DRAIN times as fast as it fills, so a dip costs a moment, not the
 *   whole hold, while standing up still empties it in no time. Hold steady (稳住) keeps its own rule:
 *   there a wobble starting the hold again is the game.
 */

/** Once at the bar, this far back up still counts. */
export const HYST_DEG = 2;
/** Away from the bar, the hold drains this many times as fast as it fills. */
export const DRAIN = 2;

const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

/** At the bar? Reached at `target`; once there, left only under `target - HYST_DEG`. */
export const atBar = (was: boolean, lean: number, target: number) => (was ? lean >= target - HYST_DEG : lean >= target);

/** Tilted enough to the side asked for (right is positive, 0 asks for nothing)? Reached at `want`; once there, left only HYST_DEG back toward straight. */
export function atSide(was: boolean, side: number, want: number) {
  if (want === 0) return true;
  const give = was ? HYST_DEG : 0;
  return want > 0 ? side >= want - give : side <= want + give;
}

/** The hold's progress (0 to 1) after `dt` ms: filling at the bar, draining DRAIN times as fast away from it. */
export const holdAfter = (h: number, at: boolean, dt: number, holdMs: number) => clamp01(h + ((at ? dt : -DRAIN * dt) / Math.max(1, holdMs)));

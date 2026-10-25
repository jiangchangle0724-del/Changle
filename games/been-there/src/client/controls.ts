// The phone as a controller: shake it to roll the dice, and feel a buzz on your turn, on your throw
// and when money changes hands. Shaking needs a phone that lets the page feel motion (an iPhone asks
// once, from a tap); buzzing needs one that lets it vibrate (Android does, iPhones don't). Both can be
// turned off in the menu, and neither replaces a button.
import { prefs } from "./prefs";

export const canBuzz = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/** Buzz patterns, in milliseconds (on, off, on…): short enough to feel, never to annoy. */
export const BUZZ = {
  turn: [30, 70, 30],
  dice: [12, 40, 12, 40, 20],
  paid: [15, 50, 15],
  pay: 70,
  tap: 8,
};

export function buzz(pattern: number | number[]) {
  if (!canBuzz || !prefs.haptics) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // some browsers throw when the page hasn't been touched yet
  }
}

type Motion = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

export const canShake = typeof window !== "undefined" && "DeviceMotionEvent" in window && "ontouchstart" in window;
const asks = () => canShake && typeof (DeviceMotionEvent as Motion).requestPermission === "function";
// Anything that doesn't ask can listen straight away; an iPhone needs a yes first. Some browsers
// have the asking function but send motion anyway (Android): the first reading settles it.
let granted = canShake && !asks();
if (canShake && !granted) {
  const probe = (e: DeviceMotionEvent) => {
    if (e.accelerationIncludingGravity?.x == null && e.acceleration?.x == null) return;
    granted = true;
    window.removeEventListener("devicemotion", probe);
  };
  window.addEventListener("devicemotion", probe);
}

/** Whether shaking works now, or needs a tap on "turn on" first (iPhone). */
export const shakeState = (): "on" | "ask" | "off" => (!canShake || !prefs.shake ? "off" : granted ? "on" : "ask");

/** Ask the phone for motion. On an iPhone this must run from a tap. */
export async function allowShake(): Promise<boolean> {
  if (!canShake) return false;
  if (!granted) {
    try {
      granted = (await (DeviceMotionEvent as Motion).requestPermission!()) === "granted";
    } catch {
      granted = false;
    }
  }
  return granted;
}

// When the last shake counted: one long shake rolls once, even when doubles bring the roll straight back.
let last = -Infinity;

/**
 * Call `then` when the phone is shaken: three firm jolts within 0.6 s (walking, or putting the phone
 * down, doesn't count), at most once every 1.5 s. Returns a function that stops listening.
 */
export function onShake(then: () => void): () => void {
  if (shakeState() !== "on") return () => {};
  let hits: number[] = [];
  const listen = (e: DeviceMotionEvent) => {
    const a = e.acceleration;
    const g = e.accelerationIncludingGravity;
    // Without gravity where the phone gives it; otherwise how far the reading strays from gravity.
    const jolt =
      a && a.x !== null ? Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0) : g && g.x !== null ? Math.abs(Math.hypot(g.x ?? 0, g.y ?? 0, g.z ?? 0) - 9.81) : 0;
    if (jolt < 14) return;
    const now = performance.now();
    hits = hits.filter((t) => now - t < 600);
    hits.push(now);
    if (hits.length >= 3 && now - last > 1500) {
      last = now;
      hits = [];
      then();
    }
  };
  window.addEventListener("devicemotion", listen);
  return () => window.removeEventListener("devicemotion", listen);
}

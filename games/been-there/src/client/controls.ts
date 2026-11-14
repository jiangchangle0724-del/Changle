// The phone as a controller: shake it to roll the dice, and feel a buzz on your turn, on your tap,
// when your token lands, when money changes hands and at the big moments (a city bought, a card,
// Immigration, an auction, a trade offer). Short ones: what happens often is felt lightly, and a web
// page can only switch the motor on and off, so a long buzz just drones. Shaking needs a phone that lets the page feel motion
// (an iPhone asks once, from a tap); buzzing needs one that lets a page vibrate: Android does, and
// iPhones don't (Safari has no vibration for web pages, and closed the last way round it in iOS
// 26.5). Both can be turned off in the menu, and neither replaces a button or what's on screen.
import { prefs } from "./prefs";

export const canBuzz = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

/** Buzz patterns, in milliseconds (on, off, on…): short enough to feel, never to annoy. */
export const BUZZ = {
  /** Your turn: two light taps. */
  turn: [15, 120, 15],
  /** The token lands (the stamp comes down). */
  land: 30,
  paid: 15,
  pay: 15,
  buy: [18, 40, 40],
  card: [10, 40, 10],
  /** Sent to Immigration: the gate, twice. */
  jail: [40, 60, 40],
  auction: [24, 50, 24, 50, 24],
  offer: [14, 70, 14],
  alarm: [160, 90, 160],
  /** A tap on a button (the dice, an answer). */
  tap: 15,
  /** Doubles: the dice knock together. */
  doubles: [12, 50, 12, 50, 30],
  /** A full set: a drum roll and the hit. */
  set: [10, 40, 10, 40, 10, 60, 60],
  /** A deal done: two hands clapping together. */
  deal: [20, 110, 30],
};

export function buzz(pattern: number | number[]) {
  if (!canBuzz || !prefs.haptics) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // some browsers throw when the page hasn't been touched yet
  }
}

// (Chromium answers "prompt" too, while it hasn't asked.)
type Answer = "granted" | "denied" | "prompt";
type Motion = typeof DeviceMotionEvent & { requestPermission?: () => Promise<Answer> };

export const canShake = typeof window !== "undefined" && "DeviceMotionEvent" in window && "ontouchstart" in window;
const asks = () => canShake && typeof (DeviceMotionEvent as Motion).requestPermission === "function";

/**
 * What the phone has said about motion. An iPhone sends none until it's asked and the player says
 * yes, and it asks only when the page asks straight from a tap. Safari then keeps the answer until
 * it's closed: a yes comes back to any page of ours without a tap, and after a no it doesn't ask
 * again until Safari has been closed and opened again. Anything that doesn't ask can listen at once.
 */
let said: "yes" | "no" | "nothing" = canShake && !asks() ? "yes" : "nothing";
const watchers = new Set<() => void>();
function hear(a: Answer) {
  const now = a === "granted" ? "yes" : a === "denied" ? "no" : said;
  if (now === said) return;
  said = now;
  for (const f of watchers) f();
}
if (canShake && said !== "yes") {
  // Some browsers have the asking function but send motion anyway (Android): the first reading settles it.
  const probe = (e: DeviceMotionEvent) => {
    if (e.accelerationIncludingGravity?.x == null && e.acceleration?.x == null) return;
    window.removeEventListener("devicemotion", probe);
    hear("granted");
  };
  window.addEventListener("devicemotion", probe);
  // The answer the phone already has, without a tap (no question comes up without one: Safari then
  // refuses the call, and the player's tap on "turn on" asks).
  (DeviceMotionEvent as Motion).requestPermission!().then(hear, () => {});
}

/** Call `then` when the phone's answer changes. Returns a function that stops. */
export function watchShake(then: () => void): () => void {
  watchers.add(then);
  return () => void watchers.delete(then);
}

/**
 * Shaking: works now (on), needs the player's yes first (ask: the phone asks from a tap on "turn on"),
 * the phone said no (no: only closing the browser and opening it again lets it ask again), or off.
 */
export type ShakeState = "on" | "ask" | "no" | "off";
export const shakeState = (): ShakeState => (!canShake || !prefs.shake ? "off" : said === "yes" ? "on" : said === "no" ? "no" : "ask");

/**
 * Ask the phone for motion. Call it straight from a tap, with nothing awaited before it: that is the
 * only time an iPhone puts its question up. Resolves with the state after the answer (still "ask"
 * when no question came up).
 */
export function allowShake(): Promise<ShakeState> {
  if (!canShake || said === "yes" || !asks()) return Promise.resolve(shakeState());
  return (DeviceMotionEvent as Motion).requestPermission!()
    .then(hear, () => {})
    .then(shakeState);
}

// When the last shake counted: one long shake rolls once, even when doubles bring the roll straight back.
let last = -Infinity;
// While a first-person move plays, a shake doesn't throw again (the next throw waits for the ride).
let held = false;
export const holdShake = (on: boolean) => {
  held = on;
};

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
    if (hits.length >= 3 && now - last > 1500 && !held) {
      last = now;
      hits = [];
      then();
    }
  };
  window.addEventListener("devicemotion", listen);
  return () => window.removeEventListener("devicemotion", listen);
}

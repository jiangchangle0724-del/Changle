import { useEffect, useRef, useState } from "react";

/**
 * The phone's motion sensors, for games that use your body: Freeze Dance (did you move?),
 * Limbo (how far back are you leaning?) and the forehead game (nod for yes, tilt back to pass).
 *
 * iOS asks permission once, and only from a tap; Android just works on https. A desktop
 * reports support but never sends a reading, so "works" means we actually heard from it.
 */

type PermFn = () => Promise<"granted" | "denied">;
type WithPerm = { requestPermission?: PermFn };

export type SensorStatus = "off" | "asking" | "on" | "denied" | "none";

let status: SensorStatus = "off";
const listeners = new Set<(s: SensorStatus) => void>();
function set(s: SensorStatus) {
  status = s;
  for (const fn of listeners) fn(s);
}

export function sensorStatus() {
  return status;
}

/** Ask for motion and orientation (call from a tap). Resolves true once a real reading arrives. */
export async function enableSensors(): Promise<boolean> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    set("none");
    return false;
  }
  set("asking");
  try {
    const m = (window as unknown as { DeviceMotionEvent?: WithPerm }).DeviceMotionEvent;
    const o = (window as unknown as { DeviceOrientationEvent?: WithPerm }).DeviceOrientationEvent;
    if (typeof o?.requestPermission === "function") {
      const r = await o.requestPermission();
      if (r !== "granted") {
        set("denied");
        return false;
      }
    }
    if (typeof m?.requestPermission === "function") {
      const r = await m.requestPermission();
      if (r !== "granted") {
        set("denied");
        return false;
      }
    }
  } catch {
    set("denied");
    return false;
  }
  // wait for one real reading: desktops have the API but no sensor
  const heard = await new Promise<boolean>((res) => {
    const on = (e: DeviceOrientationEvent) => {
      if (e.beta === null && e.gamma === null) return;
      window.removeEventListener("deviceorientation", on);
      window.clearTimeout(id);
      res(true);
    };
    const id = window.setTimeout(() => {
      window.removeEventListener("deviceorientation", on);
      res(false);
    }, 1500);
    window.addEventListener("deviceorientation", on);
  });
  set(heard ? "on" : "none");
  return heard;
}

export function useSensorStatus() {
  const [s, setS] = useState(status);
  useEffect(() => {
    listeners.add(setS);
    setS(status);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

/**
 * Live tilt while `on`: beta is front-back (90 = upright, 0 = flat facing up, ±180 = facing down).
 * With `smooth`, the readings go through `smoother()` first (every one of them, not only the twenty
 * a second that reach the screen): a body holding a lean shakes, and a game that measures the lean
 * shouldn't shake with it.
 */
export function useTilt(on: boolean, smooth = false) {
  const [tilt, setTilt] = useState<{ beta: number; gamma: number } | null>(null);
  useEffect(() => {
    if (!on) return;
    let last = 0;
    const sm = smooth ? smoother() : null;
    const fn = (e: DeviceOrientationEvent) => {
      if (e.beta === null) return;
      const now = performance.now();
      const r = sm ? sm(e.beta, e.gamma ?? 0, now / 1000) : { beta: e.beta, gamma: e.gamma ?? 0 };
      if (now - last < 50) return;
      last = now;
      setTilt(r);
    };
    window.addEventListener("deviceorientation", fn);
    return () => {
      window.removeEventListener("deviceorientation", fn);
      // the next turn starts from a fresh reading, not where this one left off
      setTilt(null);
    };
  }, [on, smooth]);
  return on ? tilt : null;
}

/** How far back someone is leaning, holding the phone upright against their chest. */
export function leanOf(beta: number) {
  return Math.max(0, Math.min(90, 90 - beta));
}

const RAD = Math.PI / 180;

/** Which way is up, in the phone's own axes (x to its right edge, y to its top, z out of the screen): a unit vector. */
export function upOf(beta: number, gamma: number): [number, number, number] {
  const cb = Math.cos(beta * RAD);
  return [-cb * Math.sin(gamma * RAD), Math.sin(beta * RAD), cb * Math.cos(gamma * RAD)];
}

/**
 * How far back someone is leaning and how far they tilt to one side (right is positive), holding
 * the phone upright against their chest, from where "up" points in it. Gamma alone can't say: near
 * upright it jumps (a phone standing straight up reports a sideways tilt as gamma ±90). With no
 * sideways tilt, the lean is leanOf's.
 */
export function leanAndSide(beta: number, gamma: number) {
  const [x, y, z] = upOf(beta, gamma);
  const lean = Math.asin(Math.max(-1, Math.min(1, z))) / RAD;
  return { lean: Math.max(0, Math.min(90, lean)), side: Math.atan2(-x, y) / RAD };
}

/** The angle between two directions (unit vectors, or a sum of them for their average), in degrees. */
export function degreesApart(a: [number, number, number], b: [number, number, number]) {
  const n = Math.hypot(...a) * Math.hypot(...b);
  if (!n) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / n))) / RAD;
}

/**
 * `upOf` backwards: the beta and gamma that put "up" there. Beta keeps its half (a phone tipped
 * forward past upright reads over 90, as the sensor says it), gamma stays within ±90 as the sensor
 * keeps it; at exactly upright gamma is anyone's, and comes back 0.
 */
export function eulerOf([x, y, z]: [number, number, number]) {
  const sg = z < 0 ? -1 : 1;
  return { beta: Math.atan2(y, sg * Math.hypot(x, z)) / RAD, gamma: Math.atan2(-x * sg, Math.abs(z)) / RAD };
}

/**
 * Readings smoothed the 1€ way (Casiez, Roussel and Vogel, CHI 2012, gery.casiez.net/1euro: a
 * low-pass filter whose cutoff opens with speed, so a phone held still stops jittering and a quick
 * lean still comes through at once). It smooths the direction of "up", not beta and gamma
 * themselves: near upright gamma jumps about, the direction doesn't. `minCutoff` (Hz) is how much
 * smoothing there is at rest; `beta` is how far each degree a second of turning opens it up (the
 * defaults, from tests/limbo-measure.test.ts: a ±2° shake comes through a fifth as big, a lean of
 * 30° reads within a degree 170 ms later at 60 readings a second, and a lean at 25° a second reads
 * 2° behind). Call it with every reading and the time in seconds; it gives back the smoothed beta
 * and gamma.
 */
export function smoother(minCutoff = 1, beta = 0.007, dCutoff = 1) {
  let up: [number, number, number] | null = null;
  let speed = 0;
  let last = 0;
  const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  return (b: number, g: number, t: number) => {
    const u = upOf(b, g);
    if (!up || t <= last) {
      up = u;
      last = t;
      return { beta: b, gamma: g };
    }
    // (a long gap, the tab away say, is not a slow turn)
    const dt = Math.min(0.25, t - last);
    last = t;
    // how fast it's turning (degrees a second, itself steadied a little) opens the cutoff
    speed += (degreesApart(up, u) / dt - speed) * alpha(dCutoff, dt);
    const a = alpha(minCutoff + beta * speed, dt);
    const v: [number, number, number] = [up[0] + (u[0] - up[0]) * a, up[1] + (u[1] - up[1]) * a, up[2] + (u[2] - up[2]) * a];
    const n = Math.hypot(v[0], v[1], v[2]) || 1;
    up = [v[0] / n, v[1] / n, v[2] / n];
    return eulerOf(up);
  };
}

/**
 * Calls `onMove` when the phone moves more than a held-still phone does: a shaky hand stays
 * quiet, a dance step does not. Two strong samples in a row count, so one bump doesn't.
 */
export function useMotionWatch(on: boolean, onMove: (strength: number) => void, sensitivity = 1) {
  const cb = useRef(onMove);
  cb.current = onMove;
  useEffect(() => {
    if (!on) return;
    let strong = 0;
    let prev: { x: number; y: number; z: number } | null = null;
    const accT = 1.7 / sensitivity;
    const rotT = 75 / sensitivity;
    const fn = (e: DeviceMotionEvent) => {
      let acc = 0;
      const a = e.acceleration;
      if (a && a.x !== null && a.y !== null && a.z !== null) acc = Math.hypot(a.x, a.y, a.z);
      else {
        const g = e.accelerationIncludingGravity;
        if (g && g.x !== null && g.y !== null && g.z !== null) {
          if (prev) acc = Math.hypot(g.x - prev.x, g.y - prev.y, g.z - prev.z) * 1.4;
          prev = { x: g.x, y: g.y, z: g.z };
        }
      }
      const r = e.rotationRate;
      const rot = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0;
      const hard = acc > accT || rot > rotT;
      strong = hard ? strong + 1 : 0;
      if (strong >= 2) {
        strong = 0;
        cb.current(Math.max(acc / accT, rot / rotT));
      }
    };
    window.addEventListener("devicemotion", fn);
    return () => window.removeEventListener("devicemotion", fn);
  }, [on, sensitivity]);
}

/** Map a server timestamp to this phone's performance clock (for starting audio on the beat). */
export function perfAt(serverAt: number, serverNow: number) {
  return performance.now() + (serverAt - serverNow);
}

/** Keep the screen on while `on` (a phone held to a forehead shouldn't dim). */
export function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    type Lock = { release: () => Promise<void>; addEventListener?: (t: "release", fn: () => void) => void };
    let lock: Lock | null = null;
    let gone = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Lock> } };
    const take = (): Promise<void> | undefined =>
      nav.wakeLock
        ?.request("screen")
        .then((l) => {
          if (gone) return void l.release();
          lock = l;
          // (let go by the browser while the page is still up, a battery saver say: asked for again)
          l.addEventListener?.("release", () => {
            if (!gone && document.visibilityState === "visible") window.setTimeout(() => !gone && void take(), 1000);
          });
        })
        .catch(() => {});
    void take();
    const vis = () => document.visibilityState === "visible" && void take();
    document.addEventListener("visibilitychange", vis);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", vis);
      void lock?.release().catch(() => {});
    };
  }, [on]);
}

/** How still the phone is right now: 1 is perfectly still, 0 is a dance move. Smoothed. */
export function useStillness(on: boolean, sensitivity = 1) {
  const [level, setLevel] = useState(1);
  useEffect(() => {
    if (!on) {
      setLevel(1);
      return;
    }
    let smooth = 1;
    let last = 0;
    const accT = 1.7 / sensitivity;
    const rotT = 75 / sensitivity;
    const fn = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      const acc = a && a.x !== null && a.y !== null && a.z !== null ? Math.hypot(a.x, a.y, a.z) : 0;
      const r = e.rotationRate;
      const rot = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0;
      const raw = Math.max(0, 1 - Math.max(acc / accT, rot / rotT));
      smooth = smooth * 0.8 + raw * 0.2;
      const t = performance.now();
      if (t - last > 90) {
        last = t;
        setLevel(smooth);
      }
    };
    window.addEventListener("devicemotion", fn);
    return () => window.removeEventListener("devicemotion", fn);
  }, [on, sensitivity]);
  return level;
}

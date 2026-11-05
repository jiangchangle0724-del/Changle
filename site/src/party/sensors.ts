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

/** Live tilt while `on`: beta is front-back (90 = upright, 0 = flat facing up, ±180 = facing down). */
export function useTilt(on: boolean) {
  const [tilt, setTilt] = useState<{ beta: number; gamma: number } | null>(null);
  useEffect(() => {
    if (!on) return;
    let last = 0;
    const fn = (e: DeviceOrientationEvent) => {
      if (e.beta === null) return;
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      setTilt({ beta: e.beta, gamma: e.gamma ?? 0 });
    };
    window.addEventListener("deviceorientation", fn);
    return () => {
      window.removeEventListener("deviceorientation", fn);
      // the next turn starts from a fresh reading, not where this one left off
      setTilt(null);
    };
  }, [on]);
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
    let lock: { release: () => Promise<void> } | null = null;
    let gone = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const take = () =>
      nav.wakeLock
        ?.request("screen")
        .then((l) => {
          if (gone) void l.release();
          else lock = l;
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

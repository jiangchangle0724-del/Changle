// Moves written as key poses in time (rig.ts's terms), blended between with easing and sampled
// into keyframes: solved in the browser, for the body in front of it.
import * as THREE from "three";
import { ANKLE, type KeepMem, type PoseSpec, type Rig } from "./rig";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ease: Record<string, (u: number) => number> = {
  linear: (u) => u,
  inout: (u) => u * u * (3 - 2 * u),
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  snap: (u) => 1 - Math.pow(1 - u, 4),
  slow: (u) => u * u * u * (u * (u * 6 - 15) + 10),
};

/** a move: key poses at times (seconds), each eased in from the one before; `add` lays a little life on top */
export type Clip = {
  name: string;
  dur: number;
  fps?: number;
  /** false: plays once (an intro) */
  loop?: boolean;
  closeEase?: string;
  keys: { t: number; pose: PoseSpec; ease?: string }[];
  add?: (t: number, pose: PoseSpec, dur: number) => PoseSpec;
};

const isTarget = (o: any) => o && typeof o === "object" && !Array.isArray(o) && ("p" in o || "d" in o);
const isVec = (a: any) => Array.isArray(a) && a.length === 3 && a.every((x: any) => typeof x === "number");

/** deep merge: b over a */
export function over(a: any, b: any): any {
  if (b === undefined) return a;
  if (a === undefined || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b) || isTarget(b)) return b;
  const out: any = { ...a };
  for (const k of Object.keys(b)) out[k] = over(a[k], b[k]);
  return out;
}

/** a target's world point (or direction) in a solved pose */
function worldOf(rig: Rig, pose: PoseSpec, t: any, isDir: boolean, foot: boolean) {
  rig.solve(pose);
  const arr = t.p ?? t.d;
  if (!t.frame || t.frame === "char") {
    if (isDir) return new THREE.Vector3(arr[0], arr[1], arr[2]);
    const w = rig.charPoint(arr);
    if (foot) w.y = (arr[1] - ANKLE) * rig.k + rig.ankle;
    return w;
  }
  const f = rig.frameOf(t.frame);
  const v = new THREE.Vector3(arr[0], arr[1], arr[2]);
  // a point as the solver places it: at this body's size
  if (!isDir) v.multiplyScalar(rig.k);
  v.applyQuaternion(f.q);
  return isDir ? v : v.add(f.p);
}

const roots: { a: PoseSpec; b: PoseSpec } = { a: {}, b: {} };

/** a pose between a and b, u from 0 to 1 */
export function mix(rig: Rig, a: any, b: any, u: number, path: string[] = []): any {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * u;
  if (typeof a === "string" || typeof b === "string") {
    if (a === b) return a;
    // finger shapes by name: blend their numbers
    return mix(rig, rig.handShape(a), rig.handShape(b), u, path);
  }
  if (isVec(a) && isVec(b)) return a.map((x: number, i: number) => x + (b[i] - x) * u);
  if (isTarget(a) && isTarget(b)) {
    const isDir = "d" in a;
    const key = isDir ? "d" : "p";
    if ((a.frame ?? "char") === (b.frame ?? "char")) {
      const v = a[key].map((x: number, i: number) => x + (b[key][i] - x) * u);
      return { frame: a.frame, [key]: v };
    }
    // in different frames: through the world, and back to a point as written (char terms)
    const foot = path[path.length - 1] === "foot";
    const w = worldOf(rig, roots.a, a, isDir, foot).lerp(worldOf(rig, roots.b, b, isDir, foot), u);
    if (!isDir) {
      if (foot) {
        w.x /= rig.k;
        w.z /= rig.k;
        w.y = (w.y - rig.ankle) / rig.k + ANKLE;
      } else w.divideScalar(rig.k);
    }
    return { frame: "char", [key]: w.toArray() };
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => mix(rig, x, b[i], u, path));
  if (typeof a === "object" && typeof b === "object") {
    const out: any = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = mix(rig, a[k], b[k], u, [...path, k]);
    return out;
  }
  return u < 0.5 ? a : b;
}

export type Baked = { name: string; times: Float32Array; rot: Map<string, Float32Array>; hips: Float32Array; inside: { before: number; after: number } };

/** a clip sampled into keyframes: each bone's rotation, and where the hips are */
export function bake(rig: Rig, move: Clip, base: PoseSpec): Baked {
  const steps = baking(rig, move, base);
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** the same, a frame at a time (to spread the work over the page's frames) */
export function* baking(rig: Rig, move: Clip, base: PoseSpec): Generator<void, Baked> {
  const fps = move.fps ?? 30;
  const keys = move.keys.map((k) => ({ ...k, pose: over(base, k.pose) }));
  if (move.loop !== false && keys[keys.length - 1].t < move.dur) keys.push({ t: move.dur, pose: keys[0].pose, ease: move.closeEase ?? "inout" });
  const n = Math.round(move.dur * fps) + 1;
  const times = new Float32Array(n);
  const rot = new Map<string, Float32Array>();
  const hips = new Float32Array(n * 3);
  const prev = new Map<string, THREE.Quaternion>();
  const inside = { before: 0, after: 0 };
  // what the arms chose the frame before (so one kept out of the body doesn't jump about)
  const mem: KeepMem = {};
  for (let i = 0; i < n; i++) {
    const t = Math.min(move.dur, i / fps);
    times[i] = t;
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1].t <= t) k++;
    const A = keys[k];
    const B = keys[Math.min(k + 1, keys.length - 1)];
    const span = Math.max(1e-6, B.t - A.t);
    const u = Math.min(1, Math.max(0, (t - A.t) / span));
    const e = (ease[B.ease ?? "inout"] ?? ease.inout)(u);
    roots.a = A.pose;
    roots.b = B.pose;
    let pose = mix(rig, A.pose, B.pose, e);
    if (move.add) pose = move.add(t, pose, move.dur);
    const { local, hips: hp } = rig.solve(pose, mem);
    inside.before = Math.max(inside.before, rig.inside.before);
    inside.after = Math.max(inside.after, rig.inside.after);
    for (const [name, q] of local) {
      let arr = rot.get(name);
      if (!arr) rot.set(name, (arr = new Float32Array(n * 4)));
      // keep each track on one side of the sphere, so it blends the short way
      const p = prev.get(name);
      if (p && p.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      prev.set(name, q.clone());
      arr.set([q.x, q.y, q.z, q.w], i * 4);
    }
    hips.set([hp.x, hp.y, hp.z], i * 3);
    if (i < n - 1) yield;
  }
  return { name: move.name, times, rot, hips, inside };
}

/** as a three.js clip, for the figure's bones (by name) */
export function toClip(b: Baked): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, arr] of b.rot) tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, b.times, arr));
  tracks.push(new THREE.VectorKeyframeTrack("Hips.position", b.times, b.hips));
  return new THREE.AnimationClip(b.name, b.times[b.times.length - 1], tracks);
}

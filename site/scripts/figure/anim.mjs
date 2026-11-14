// Moves written as key poses in time (rig.mjs's terms), blended between with easing and sampled
// into keyframes for a glTF animation.
import * as THREE from "three";

export const ease = {
  linear: (u) => u,
  inout: (u) => u * u * (3 - 2 * u),
  in: (u) => u * u,
  out: (u) => 1 - (1 - u) * (1 - u),
  snap: (u) => 1 - Math.pow(1 - u, 4),
  slow: (u) => u * u * u * (u * (u * 6 - 15) + 10),
};

const isTarget = (o) => o && typeof o === "object" && !Array.isArray(o) && ("p" in o || "d" in o);
const isVec = (a) => Array.isArray(a) && a.length === 3 && a.every((x) => typeof x === "number");

/** deep merge: b over a */
export function over(a, b) {
  if (b === undefined) return a;
  if (a === undefined || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b) || isTarget(b)) return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = over(a[k], b[k]);
  return out;
}

/** the world point (or direction) of a target in a solved pose */
function worldOf(rig, pose, t, isDir) {
  rig.solve(pose);
  const name = { hips: "Hips", chest: "Spine2", head: "Head", spine: "Spine1" }[t.frame] ?? t.frame;
  const v = new THREE.Vector3(...(t.p ?? t.d));
  if (!t.frame || t.frame === "char") return v;
  v.applyQuaternion(rig.D.get(name));
  return isDir ? v : v.add(rig.P.get(name));
}

/** a pose between a and b, u from 0 to 1 */
export function mix(rig, a, b, u, path = []) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  if (typeof a === "number" && typeof b === "number") return a + (b - a) * u;
  if (typeof a === "string" || typeof b === "string") {
    if (a === b) return a;
    // finger shapes by name: blend their numbers
    return mix(rig, rig.handShape(a), rig.handShape(b), u, path);
  }
  if (isVec(a) && isVec(b)) return a.map((x, i) => x + (b[i] - x) * u);
  if (isTarget(a) && isTarget(b)) {
    const isDir = "d" in a;
    const key = isDir ? "d" : "p";
    if ((a.frame ?? "char") === (b.frame ?? "char")) {
      const v = a[key].map((x, i) => x + (b[key][i] - x) * u);
      return { frame: a.frame, [key]: v };
    }
    const wa = worldOf(rig, mix.root.a, a, isDir);
    const wb = worldOf(rig, mix.root.b, b, isDir);
    return { frame: "char", [key]: wa.lerp(wb, u).toArray() };
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.map((x, i) => mix(rig, x, b[i], u, path));
  if (typeof a === "object" && typeof b === "object") {
    const out = {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = mix(rig, a[k], b[k], u, [...path, k]);
    return out;
  }
  return u < 0.5 ? a : b;
}

/**
 * move: { name, dur, fps?, loop?, keys: [{ t, pose, ease? }], add?(t, pose) → pose }
 * Returns { name, times: Float32Array, rot: Map(bone → Float32Array xyzw…), hips: Float32Array xyz… }
 */
export function bake(rig, move, base) {
  const fps = move.fps ?? 30;
  const keys = move.keys.map((k) => ({ ...k, pose: over(base, k.pose) }));
  if (move.loop !== false && keys[keys.length - 1].t < move.dur) keys.push({ t: move.dur, pose: keys[0].pose, ease: move.closeEase ?? "inout" });
  const n = Math.round(move.dur * fps) + 1;
  const times = new Float32Array(n);
  const rot = new Map();
  const hips = new Float32Array(n * 3);
  const prev = new Map();
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
    mix.root = { a: A.pose, b: B.pose };
    let pose = mix(rig, A.pose, B.pose, e);
    if (move.add) pose = move.add(t, pose, move.dur);
    const { local, hips: hp } = rig.solve(pose);
    for (const [name, q] of local) {
      if (!rot.has(name)) rot.set(name, new Float32Array(n * 4));
      // keep each track on one side of the sphere, so it blends the short way
      const p = prev.get(name);
      if (p && p.dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      prev.set(name, q.clone());
      rot.get(name).set([q.x, q.y, q.z, q.w], i * 4);
    }
    hips.set([hp.x, hp.y, hp.z], i * 3);
  }
  return { name: move.name, times, rot, hips };
}

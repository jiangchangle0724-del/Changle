import * as THREE from "three";
import { Rig, fitBody, figureFrames } from "./pose/rig";

/** a bone at rest: its name, its parent's, where it sits and how it's turned in its parent */
export type RestNode = { name: string; parent: string | null; t: number[]; r: number[] };

/** the skeleton at rest, parents first, as the figure's file has it */
export function restNodes(root: THREE.Object3D): RestNode[] {
  const out: RestNode[] = [];
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    const p = o.parent as THREE.Bone | null;
    out.push({ name: o.name, parent: p?.isBone ? p.name : null, t: o.position.toArray(), r: o.quaternion.toArray() });
  });
  return out;
}

/** each bone's place at rest (world, with the figure standing at the origin) */
export function restHeads(nodes: RestNode[]): Map<string, THREE.Vector3> {
  const at = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion }>();
  for (const n of nodes) {
    const par = n.parent ? at.get(n.parent) : null;
    const q = new THREE.Quaternion(n.r[0], n.r[1], n.r[2], n.r[3]);
    const t = new THREE.Vector3(n.t[0], n.t[1], n.t[2]);
    at.set(n.name, par ? { p: par.p.clone().add(t.applyQuaternion(par.q)), q: par.q.clone().multiply(q) } : { p: t, q });
  }
  return new Map([...at].map(([k, v]) => [k, v.p]));
}

/**
 * Points on the skin and clothes at rest (world, metres) and each one's main bone: what the
 * colliders are fitted to. The files pack positions small and keep the way back in the bind
 * matrices, so a point's place is the first bone's rest place times its inverse bind matrix.
 */
export function bodyPoints(meshes: THREE.SkinnedMesh[], heads: Map<string, THREE.Vector3>, every = 2) {
  const pts: number[] = [];
  const bone: number[] = [];
  const names: string[] = [];
  const v = new THREE.Vector3();
  for (const m of meshes) {
    const sk = m.skeleton;
    const h0 = heads.get(sk.bones[0].name);
    if (!h0) continue;
    const M = new THREE.Matrix4().makeTranslation(h0.x, h0.y, h0.z).multiply(sk.boneInverses[0]);
    const pos = m.geometry.attributes.position;
    const si = m.geometry.attributes.skinIndex;
    const sw = m.geometry.attributes.skinWeight;
    const base = names.length;
    sk.bones.forEach((b) => names.push(b.name));
    for (let i = 0; i < pos.count; i += every) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      pts.push(v.x, v.y, v.z);
      let best = 0;
      for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
      bone.push(base + si.getComponent(i, best));
    }
  }
  return { pts: Float32Array.from(pts), bone: Int32Array.from(bone), names };
}

/** the pose solver for a body: its skeleton at rest, its frames, and its shape to keep the limbs out of */
export function rigFor(nodes: RestNode[], meshes: THREE.SkinnedMesh[]) {
  const heads = restHeads(nodes);
  const { pts, bone, names } = bodyPoints(meshes, heads);
  return new Rig(nodes, { frames: figureFrames(pts, heads), body: fitBody(pts, bone, names, heads) });
}

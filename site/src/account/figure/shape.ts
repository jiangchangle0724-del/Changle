import * as THREE from "three";

// The sliders, mixed on the CPU: the face's and the body's targets (S_…) taken off the GPU and mixed
// into the positions when the look changes; the expressions (X_…) stay on the GPU, to move every frame.

/** a target as the few numbers it changes: component indexes (vertex·3 + axis) and how much */
export type Delta = { idx: Uint32Array; val: Float32Array };
/** a mesh the sliders reshape: its packed shape unpacked once, the sliders' targets taken off the GPU */
export type Shaped = { mesh: THREE.SkinnedMesh; base: Float32Array; baseN: Float32Array; shapes: Map<string, Delta>; weld: ArrayLike<number> | null; acc: Float32Array; shaped: boolean };

function sparse(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Delta {
  const idx: number[] = [];
  const val: number[] = [];
  for (let i = 0; i < a.count; i++) {
    const v = [a.getX(i), a.getY(i), a.getZ(i)];
    for (let c = 0; c < 3; c++)
      if (v[c] !== 0) {
        idx.push(i * 3 + c);
        val.push(v[c]);
      }
  }
  return { idx: Uint32Array.from(idx), val: Float32Array.from(val) };
}

/**
 * Splits a mesh's morph targets: the sliders' (S_…) come off the GPU, to mix into its positions
 * when the look changes; the expressions (X_…) stay there, to move every frame.
 */
export function prepMesh(mesh: THREE.SkinnedMesh): Shaped | null {
  const g = mesh.geometry;
  const dict = mesh.morphTargetDictionary ?? {};
  const names = Object.keys(dict).sort((a, b) => dict[a] - dict[b]);
  // (read one by one: a two-byte attribute is padded to four in the file, so its array has gaps)
  const weldAttr = g.getAttribute("_weld");
  let weld: Uint32Array | null = null;
  if (weldAttr) {
    weld = new Uint32Array(weldAttr.count);
    for (let i = 0; i < weldAttr.count; i++) weld[i] = weldAttr.getX(i);
    g.deleteAttribute("_weld");
  }
  if (!names.length) return null;
  const mp = g.morphAttributes.position ?? [];
  const mn = g.morphAttributes.normal ?? [];
  const shapes = new Map<string, Delta>();
  const keepP: typeof mp = [];
  const keepN: typeof mn = [];
  const keep: string[] = [];
  names.forEach((name, i) => {
    if (!mp[i]) return;
    if (name.startsWith("S_")) shapes.set(name, sparse(mp[i]));
    else {
      keep.push(name);
      keepP.push(mp[i]);
      if (mn[i]) keepN.push(mn[i]);
    }
  });
  g.morphAttributes = {};
  if (keep.length) {
    g.morphAttributes.position = keepP;
    if (keepN.length === keepP.length) g.morphAttributes.normal = keepN;
    mesh.morphTargetDictionary = Object.fromEntries(keep.map((k, i) => [k, i]));
    mesh.morphTargetInfluences = keep.map(() => 0);
  } else {
    mesh.morphTargetDictionary = undefined;
    mesh.morphTargetInfluences = undefined;
  }
  if (!shapes.size) return null;
  // the file packs positions and normals small: unpacked once, to move them
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const n = pos.count;
  const base = new Float32Array(n * 3);
  const baseN = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    base.set([pos.getX(i), pos.getY(i), pos.getZ(i)], i * 3);
    baseN.set([nor.getX(i), nor.getY(i), nor.getZ(i)], i * 3);
  }
  g.setAttribute("position", new THREE.BufferAttribute(base.slice(), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(baseN.slice(), 3));
  // which of the file's vertices are one point (split only for the texture), for smooth normals
  let nWeld = n;
  if (weld) {
    nWeld = 0;
    for (let i = 0; i < weld.length; i++) nWeld = Math.max(nWeld, weld[i] + 1);
  }
  return { mesh, base, baseN, shapes, weld, acc: new Float32Array(nWeld * 3), shaped: false };
}

/** positions = the file's + the sliders' targets; then smooth normals again */
export function applyShapes(s: Shaped, w: Map<string, number>) {
  const g = s.mesh.geometry;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  const p = pos.array as Float32Array;
  let any = false;
  for (const [name, k] of w) if (k && s.shapes.has(name)) any = true;
  if (!any && !s.shaped) return;
  p.set(s.base);
  for (const [name, k] of w) {
    const d = s.shapes.get(name);
    if (!d || !k) continue;
    for (let j = 0; j < d.idx.length; j++) p[d.idx[j]] += k * d.val[j];
  }
  pos.needsUpdate = true;
  const nArr = nor.array as Float32Array;
  nor.needsUpdate = true;
  s.shaped = any;
  if (!any) {
    nArr.set(s.baseN);
    return;
  }
  const acc = s.acc;
  acc.fill(0);
  const ix = g.index?.array;
  if (!ix) return;
  const W = s.weld;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3;
    const b = ix[t + 1] * 3;
    const c = ix[t + 2] * 3;
    const ux = p[b] - p[a];
    const uy = p[b + 1] - p[a + 1];
    const uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a];
    const vy = p[c + 1] - p[a + 1];
    const vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (let q = 0; q < 3; q++) {
      const v = ix[t + q];
      const k = (W ? W[v] : v) * 3;
      acc[k] += nx;
      acc[k + 1] += ny;
      acc[k + 2] += nz;
    }
  }
  for (let i = 0; i < pos.count; i++) {
    const k = (W ? W[i] : i) * 3;
    const l = Math.hypot(acc[k], acc[k + 1], acc[k + 2]) || 1;
    nArr[i * 3] = acc[k] / l;
    nArr[i * 3 + 1] = acc[k + 1] / l;
    nArr[i * 3 + 2] = acc[k + 2] / l;
  }
}


// Hats made here, on her head bone (they turn with her head): sized to sit over the hairstyle the
// outfit gives her, so no hair comes through.
import { proxyMetres } from "./dancer.mjs";

/** a ring of n points round centre c, across axes a and b, radius r */
const ring = (c, a, b, r, n) =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [0, 1, 2].map((k) => c[k] + (a[k] * Math.cos(t) + b[k] * Math.sin(t)) * r);
  });
const add = (a, b, k = 1) => a.map((x, i) => x + b[i] * k);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((x) => x / l);
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** a mesh of rings (each `n` points, closed round) joined in order, on the head bone; v runs along the rings */
function tube(prep, name, rings, material) {
  const n = rings[0].length;
  const pos = [];
  const uv = [];
  rings.forEach((r, j) => {
    for (let i = 0; i <= n; i++) {
      pos.push(...r[i % n]);
      uv.push(i / n, j / (rings.length - 1));
    }
  });
  const index = [];
  for (let j = 0; j + 1 < rings.length; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  return mesh(prep, name, pos, uv, index, material);
}

function mesh(prep, name, pos, uv, index, material) {
  const m = pos.length / 3;
  // normals from the faces
  const nor = new Float32Array(m * 3);
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, c] = [index[t], index[t + 1], index[t + 2]];
    const pa = pos.slice(a * 3, a * 3 + 3), pb = pos.slice(b * 3, b * 3 + 3), pc = pos.slice(c * 3, c * 3 + 3);
    const nn = cross(sub(pb, pa), sub(pc, pa));
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) nor[v * 3 + k] += nn[k];
  }
  for (let i = 0; i < m; i++) {
    const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) nor[i * 3 + k] /= l;
  }
  const head = prep.jointOf.get("Head");
  const joints = new Uint8Array(m * 4);
  const weights = new Float32Array(m * 4);
  for (let i = 0; i < m; i++) {
    joints[i * 4] = head;
    weights[i * 4] = 1;
  }
  return { name, pos: Float32Array.from(pos), nor, uv: Float32Array.from(uv), joints, weights, weld: new Uint16Array(m), index: Uint16Array.from(index), targets: [], material };
}

/** a Santa hat: a fur brim tilted back over her hair, the red cone flopping to one side, a fur bobble */
function santa(prep, hair) {
  const E = ["LeftEye", "RightEye"].map((n) => prep.bones.get(n).head).reduce((a, b) => a.map((x, i) => (x + b[i]) / 2));
  const H = prep.bones.get("Head").head;
  // the brim's plane: over the forehead in front, lower at the back (tilted back 18°)
  const tilt = (18 * Math.PI) / 180;
  const up = [0, Math.cos(tilt), -Math.sin(tilt)];
  const c0 = [0, E[1] + 0.012, H[2] + 0.0];
  const a = [1, 0, 0];
  const b = norm(cross(up, a));
  // how wide her head and hair are there: the brim sits just outside them
  const pts = [];
  for (let i = 0; i < hair.length; i += 3) pts.push([hair[i], hair[i + 1], hair[i + 2]]);
  for (const v of prep.groupIdx("body")) if (prep.mainBone[v] === "Head") pts.push([prep.PM[v * 3], prep.PM[v * 3 + 1], prep.PM[v * 3 + 2]]);
  // (her head and the hair on it: long hair hanging away behind doesn't count)
  let rb = 0.085;
  for (const p of pts) {
    const d = sub(p, c0);
    const h = dot(d, up);
    if (Math.abs(h) > 0.02) continue;
    const r = Math.hypot(dot(d, a), dot(d, b));
    if (r < 0.115) rb = Math.max(rb, r);
  }
  rb = Math.min(0.11, rb + 0.006);
  // the cone's axis: up, then flopping over to her right and back
  const H1 = 0.24;
  const axis = (t) => add(add(c0, up, H1 * t), add([-1, 0, 0], [0, -0.5, -0.4]), 0.16 * t * t * t);
  // its radius along it, widened where her hair would come through
  let grow = 0;
  for (const p of pts) {
    const d = sub(p, c0);
    const h = dot(d, up);
    if (h <= 0) continue;
    const t = h / H1;
    if (t >= 1) continue;
    const r = rb * Math.pow(1 - t, 1.1) + 0.008;
    const off = Math.hypot(dot(d, a), dot(d, b));
    if (off > 0.115) continue;
    grow = Math.max(grow, Math.min(0.02, off + 0.006 - r));
  }
  const K = 24;
  const rings = [];
  for (let j = 0; j <= 16; j++) {
    const t = j / 16;
    const p = axis(t);
    const tan = norm(sub(axis(Math.min(1, t + 0.01)), axis(Math.max(0, t - 0.01))));
    const ax = norm(cross(tan, b));
    const bx = norm(cross(ax, tan));
    const r = (rb + grow) * Math.pow(1 - t, 1.1) * (1 - 0.05 * t) + 0.008;
    rings.push(ring(p, ax, bx, r, K));
  }
  const red = { name: "HatRed", rough: 0.8, kind: "velvet", sheen: 0.9, color: [0.45, 0.012, 0.02, 1], double: true };
  const white = { name: "HatFur", rough: 0.95, kind: "cloth", sheen: 0.6, color: [0.88, 0.85, 0.8, 1], double: true };
  const cone = tube(prep, "Hat", rings, red);
  // the brim: a fat ring round the cone's foot
  const brimRings = [];
  const R0 = rb + grow + 0.012;
  for (let j = 0; j <= 12; j++) {
    const th = (j / 12) * Math.PI * 2;
    brimRings.push(
      Array.from({ length: K }, (_, i) => {
        const ph = (i / K) * Math.PI * 2;
        const dirA = add(a.map((x) => x * Math.cos(ph)), b.map((x) => x * Math.sin(ph)));
        const centre = add(c0, dirA, R0);
        return add(add(centre, dirA, 0.022 * Math.cos(th)), up, 0.024 * Math.sin(th));
      }),
    );
  }
  const brim = tube(prep, "HatBrim", brimRings.map((r) => r).reverse(), white);
  // the bobble
  const tip = axis(1);
  const bob = [];
  for (let j = 0; j <= 10; j++) {
    const th = (j / 10) * Math.PI;
    bob.push(ring(add(tip, [0, 1, 0], 0.034 * Math.cos(th)), [1, 0, 0], [0, 0, 1], 0.034 * Math.sin(th) + 1e-4, 16));
  }
  const bobble = tube(prep, "HatBobble", bob.reverse(), white);
  return [cone, brim, bobble];
}

/** a hat's parts: over the given hairstyle (fitted to her) */
export async function hatPart(prep, id, hairStyle) {
  const w = prep.wear.get(`Hair_${hairStyle}`);
  const hair = w ? proxyMetres(prep, w.P) : new Float64Array(0);
  if (id === "santa") return santa(prep, hair);
  throw new Error(`no hat ${id}`);
}

// Clothes made from her own skin (dancer.mjs): a garment is a region of the body, given as a signed
// distance (metres, negative inside) over the body at rest, and a cloth (a colour, a pattern, how
// shiny). Its texture is drawn over the skin's UVs, each texel from where it lies on her (so a
// pattern runs on across the texture's seams), its outline anti-aliased from the distance. Its mesh
// is the skin's faces it touches, lifted a few millimetres along the skin's normals, with the skin's
// own weights: it moves exactly as she does, and can't be come through. The skin under an opaque
// garment is left out of the drawing (the page drops it: `hide`).
import { meshData } from "./dancer.mjs";
import { png, rasterUV, toSrgb } from "./mh.mjs";

/**
 * Where each texel of a size×size texture lies on a mesh at rest: position, normal, main bone (an
 * index into `names`, -1 if none), its face, and a texel's size there (metres). P, N: the mesh's
 * points and normals (metres); faces with UVs into vt.
 */
export function meshTexels(P, N, faces, vt, size, boneOfVertex = null, names = []) {
  const r = rasterUV(faces, vt, size, size);
  const n = size * size;
  const TP = new Float32Array(n * 3);
  const TN = new Float32Array(n * 3);
  const B = new Int16Array(n).fill(-1);
  const fsize = new Float32Array(faces.length);
  faces.forEach((f, fi) => {
    let a3 = 0;
    let a2 = 0;
    for (let q = 1; q + 1 < f.v.length; q++) {
      const [a, b, c] = [f.v[0], f.v[q], f.v[q + 1]];
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
      a3 += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      const [ta, tb, tc] = [f.t[0], f.t[q], f.t[q + 1]];
      const px = (vt[tb * 2] - vt[ta * 2]) * size, py = (vt[tb * 2 + 1] - vt[ta * 2 + 1]) * size;
      const qx = (vt[tc * 2] - vt[ta * 2]) * size, qy = (vt[tc * 2 + 1] - vt[ta * 2 + 1]) * size;
      a2 += Math.abs(px * qy - py * qx) / 2;
    }
    fsize[fi] = a2 > 0 ? Math.sqrt(a3 / a2) : 0.002;
  });
  for (let i = 0; i < n; i++) {
    if (r.face[i] < 0) continue;
    let nx = 0, ny = 0, nz = 0, best = -1, bv = 0;
    for (let k = 0; k < 3; k++) {
      const v = r.corner[i * 3 + k];
      const w = r.bary[i * 3 + k];
      TP[i * 3] += w * P[v * 3];
      TP[i * 3 + 1] += w * P[v * 3 + 1];
      TP[i * 3 + 2] += w * P[v * 3 + 2];
      nx += w * N[v * 3];
      ny += w * N[v * 3 + 1];
      nz += w * N[v * 3 + 2];
      if (w > best) {
        best = w;
        bv = v;
      }
    }
    const l = Math.hypot(nx, ny, nz) || 1;
    TN.set([nx / l, ny / l, nz / l], i * 3);
    if (boneOfVertex) B[i] = boneOfVertex[bv];
  }
  return { size, face: r.face, P: TP, N: TN, B, fsize, names };
}

/** where each texel of a size×size texture lies on her body */
export function texels(prep, size) {
  const boneIx = new Map(prep.order.map((b, i) => [b.name, i]));
  const vb = Int16Array.from(prep.mainBone.map((name) => (name ? boneIx.get(name) : -1)));
  return meshTexels(prep.PM, prep.NM, prep.bodyFaces, prep.base.vt, size, vb, prep.order.map((b) => b.name));
}

// ---------------------------------------------------------------- places on her

/** the body vertex nearest a point (metres), among `among` (default: the whole body) */
export function nearest(prep, p, among = null) {
  const list = among ?? prep.groupIdx("body");
  let best = Infinity;
  let bi = 0;
  for (const v of list) {
    const dx = prep.PM[v * 3] - p[0], dy = prep.PM[v * 3 + 1] - p[1], dz = prep.PM[v * 3 + 2] - p[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) {
      best = d;
      bi = v;
    }
  }
  return bi;
}

/**
 * A point on her skin: where a line from p along `dir` (e.g. [0, 0, -1]: in from the front) first
 * meets her (as near as her vertices let it come), or without `dir` the nearest; among the given
 * vertices only (default: the whole body).
 */
export function onSkin(prep, p, dir = null, among = null) {
  const list = among ?? prep.groupIdx("body");
  if (!dir) {
    const v = nearest(prep, p, list);
    return [prep.PM[v * 3], prep.PM[v * 3 + 1], prep.PM[v * 3 + 2]];
  }
  const l = Math.hypot(...dir);
  const d = dir.map((x) => x / l);
  let bestT = Infinity;
  for (const v of list) {
    const q = [prep.PM[v * 3] - p[0], prep.PM[v * 3 + 1] - p[1], prep.PM[v * 3 + 2] - p[2]];
    const t = q[0] * d[0] + q[1] * d[1] + q[2] * d[2];
    if (t <= 0) continue;
    const off = Math.hypot(q[0] - t * d[0], q[1] - t * d[1], q[2] - t * d[2]);
    if (off > 0.012) continue;
    if (t < bestT) bestT = t;
  }
  if (!Number.isFinite(bestT)) return onSkin(prep, p, null, list);
  return [p[0] + bestT * d[0], p[1] + bestT * d[1], p[2] + bestT * d[2]];
}

/** the nearest point to p on the triangle a, b, c (Ericson's) */
function nearestOnTri(p, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]];
  }
  const cp = sub(p, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
  }
  const den = 1 / (va + vb + vc);
  const v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

/** her skin's triangles in a grid (3 cm cells), for finding the nearest point on it fast; among some vertices' faces only */
function skinGrid(prep, among) {
  const key = among ?? "all";
  prep._grids ??= new Map();
  if (prep._grids.has(key)) return prep._grids.get(key);
  const set = among ? new Set(among) : null;
  const tris = [];
  for (const f of prep.bodyFaces) {
    if (set && !f.v.every((v) => set.has(v))) continue;
    for (let q = 1; q + 1 < f.v.length; q++) tris.push([f.v[0], f.v[q], f.v[q + 1]]);
  }
  const cell = 0.03;
  const grid = new Map();
  const P = (v) => [prep.PM[v * 3], prep.PM[v * 3 + 1], prep.PM[v * 3 + 2]];
  tris.forEach((t, i) => {
    const ps = t.map(P);
    const lo = [0, 1, 2].map((c) => Math.floor(Math.min(...ps.map((p) => p[c])) / cell));
    const hi = [0, 1, 2].map((c) => Math.floor(Math.max(...ps.map((p) => p[c])) / cell));
    for (let x = lo[0]; x <= hi[0]; x++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let z = lo[2]; z <= hi[2]; z++) {
          const k = `${x},${y},${z}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(i);
        }
  });
  const g = { tris, grid, cell, P };
  prep._grids.set(key, g);
  return g;
}

/** the nearest point on her skin to p and the skin's normal there (its triangle's) */
export function closestWithNormal(prep, p, among = null) {
  const { tris, grid, cell, P } = skinGrid(prep, among);
  const c = p.map((x) => Math.floor(x / cell));
  let best = null;
  let bn = null;
  let bd = Infinity;
  for (let r = 1; r <= 4 && !best; r++) {
    const seen = new Set();
    for (let x = c[0] - r; x <= c[0] + r; x++)
      for (let y = c[1] - r; y <= c[1] + r; y++)
        for (let z = c[2] - r; z <= c[2] + r; z++)
          for (const i of grid.get(`${x},${y},${z}`) ?? []) {
            if (seen.has(i)) continue;
            seen.add(i);
            const [a, b, cc] = tris[i].map(P);
            const q = nearestOnTri(p, a, b, cc);
            const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
            if (d < bd) {
              bd = d;
              best = q;
              const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
              const v = [cc[0] - a[0], cc[1] - a[1], cc[2] - a[2]];
              const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
              const l = Math.hypot(...n) || 1;
              bn = n.map((x2) => x2 / l);
            }
          }
  }
  return best ? { p: best, n: bn } : null;
}

/** the nearest point on her skin to p (among those vertices' faces) */
export function closestOnSkin(prep, p, among = null) {
  const { tris, grid, cell, P } = skinGrid(prep, among);
  const c = p.map((x) => Math.floor(x / cell));
  let best = null;
  let bd = Infinity;
  for (let r = 1; r <= 4 && !best; r++) {
    const seen = new Set();
    for (let x = c[0] - r; x <= c[0] + r; x++)
      for (let y = c[1] - r; y <= c[1] + r; y++)
        for (let z = c[2] - r; z <= c[2] + r; z++)
          for (const i of grid.get(`${x},${y},${z}`) ?? []) {
            if (seen.has(i)) continue;
            seen.add(i);
            const q = nearestOnTri(p, ...tris[i].map(P));
            const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
            if (d < bd) {
              bd = d;
              best = q;
            }
          }
  }
  return best ?? onSkin(prep, p, null, among);
}

/** a smooth curve through points (Catmull-Rom), `per` samples between each two, lying on the skin (among those vertices' faces) */
export function curve(prep, pts, per = 12, among = null) {
  let out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i + 2 < P.length; i++)
    for (let s = 0; s < per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push(
        [0, 1, 2].map(
          (c) => 0.5 * (2 * P[i][c] + (-P[i - 1][c] + P[i + 1][c]) * t + (2 * P[i - 1][c] - 5 * P[i][c] + 4 * P[i + 1][c] - P[i + 2][c]) * t2 + (-P[i - 1][c] + 3 * P[i][c] - 3 * P[i + 1][c] + P[i + 2][c]) * t3),
        ),
      );
    }
  out.push(pts[pts.length - 1]);
  if (among === false) return out;
  // onto the skin, evened out, and onto it again (the ends stay)
  for (let it = 0; it < 3; it++) {
    out = out.map((p) => closestOnSkin(prep, p, among));
    for (let k = 0; k < 2; k++) for (let i = 1; i + 1 < out.length; i++) out[i] = out[i].map((x, c) => (out[i - 1][c] + 2 * x + out[i + 1][c]) / 4);
  }
  return out.map((p) => closestOnSkin(prep, p, among));
}

/** her landmarks at rest (metres) */
export function landmarks(prep) {
  const bone = (n) => prep.bones.get(n).head;
  const body = prep.groupIdx("body");
  const PM = prep.PM;
  const bust = {};
  for (const [s, side] of [[1, "L"], [-1, "R"]]) {
    let best = null;
    for (const v of body) {
      const x = PM[v * 3], y = PM[v * 3 + 1], z = PM[v * 3 + 2];
      if (s * x < 0.03 || s * x > 0.16 || y < bone("Spine1")[1] || y > bone("Neck")[1]) continue;
      if (!best || z > best[2]) best = [x, y, z];
    }
    bust[side] = best;
  }
  let crotch = null;
  for (const v of body) {
    const x = PM[v * 3], y = PM[v * 3 + 1];
    if (Math.abs(x) > 0.004 || y < 0.4 || y > bone("Hips")[1]) continue;
    if (!crotch || y < crotch[1]) crotch = [PM[v * 3], y, PM[v * 3 + 2]];
  }
  /** the body's middle (x = 0), front or back, at height y: its z there */
  const mid = (y, front = true) => {
    let best = null;
    for (const v of body) {
      if (Math.abs(PM[v * 3]) > 0.01 || Math.abs(PM[v * 3 + 1] - y) > 0.012) continue;
      const z = PM[v * 3 + 2];
      if (best === null || (front ? z > best : z < best)) best = z;
    }
    return best;
  };
  const byBones = (names) => {
    const set = new Set(names);
    return body.filter((v) => set.has(prep.mainBone[v]));
  };
  const trunk = byBones(["Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "Head"]);
  /** a point on her trunk (not her arms), seen from a side: "front", "back", "left", "right", "top" */
  const at = (p, from) => {
    const dirs = { front: [0, 0, -1], back: [0, 0, 1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, -1, 0] };
    const start = { front: [p[0], p[1], 0.6], back: [p[0], p[1], -0.6], left: [0.6, p[1], p[2]], right: [-0.6, p[1], p[2]], top: [p[0], 2.2, p[2]] }[from];
    return onSkin(prep, start, dirs[from], trunk);
  };
  return { bone, bust, crotch, mid, trunk, byBones, at };
}

// ---------------------------------------------------------------- regions: signed distances (metres, negative inside)

const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

/** distance from p to a polyline (across the skin: what's along the normal n is left out, if given) */
export function toPolyline(p, pts, n = null) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
    const L2 = abx * abx + aby * aby + abz * abz;
    const t = L2 > 0 ? Math.min(1, Math.max(0, (apx * abx + apy * aby + apz * abz) / L2)) : 0;
    let dx = apx - t * abx, dy = apy - t * aby, dz = apz - t * abz;
    if (n) {
      const k = dx * n[0] + dy * n[1] + dz * n[2];
      // (only a few millimetres of it: a line on the far side of a thin part shouldn't count)
      const kk = Math.max(-0.006, Math.min(0.006, k));
      dx -= kk * n[0];
      dy -= kk * n[1];
      dz -= kk * n[2];
    }
    const d = len(dx, dy, dz);
    if (d < best) best = d;
  }
  return best;
}

export const R = {
  and: (...fs) => (q) => {
    let m = -Infinity;
    for (const f of fs) {
      const d = f(q);
      if (d > m) m = d;
    }
    return m;
  },
  or: (...fs) => (q) => {
    let m = Infinity;
    for (const f of fs) {
      const d = f(q);
      if (d < m) m = d;
    }
    return m;
  },
  /** a smooth union (k: how far the joins round, metres) */
  smooth: (k, ...fs) => (q) => {
    let m = fs[0](q);
    for (let i = 1; i < fs.length; i++) {
      const d = fs[i](q);
      const h = Math.max(k - Math.abs(m - d), 0) / k;
      m = Math.min(m, d) - h * h * k * 0.25;
    }
    return m;
  },
  not: (f) => (q) => -f(q),
  /** above / below a height (a function of the point, or a number) */
  above: (y) => (typeof y === "number" ? (q) => y - q.p[1] : (q) => y(q) - q.p[1]),
  below: (y) => (typeof y === "number" ? (q) => q.p[1] - y : (q) => q.p[1] - y(q)),
  /** the side of a plane its normal points away from (through p0) */
  plane: (p0, n) => {
    const l = len(...n);
    const u = n.map((x) => x / l);
    return (q) => (q.p[0] - p0[0]) * u[0] + (q.p[1] - p0[1]) * u[1] + (q.p[2] - p0[2]) * u[2];
  },
  /** the plane through three points, inside on the side away from `out` (a point) */
  plane3: (a, b, c, out) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const s = (out[0] - a[0]) * n[0] + (out[1] - a[1]) * n[1] + (out[2] - a[2]) * n[2];
    if (s < 0) n = n.map((x) => -x);
    return R.plane(a, n);
  },
  /** within w/2 of a polyline */
  band: (pts, w) => (q) => toPolyline(q.p, pts, q.n) - w / 2,
  /** only on these bones (a hard edge: keep it where another edge cuts first) */
  on: (names) => {
    const set = new Set(names);
    return (q) => (set.has(q.bone) ? -1 : 1);
  },
  /** not on these bones */
  off: (names) => {
    const set = new Set(names);
    return (q) => (set.has(q.bone) ? 1 : -1);
  },
  /** front (z above the given, a function of the point or a number) */
  front: (z) => (typeof z === "number" ? (q) => z - q.p[2] : (q) => z(q) - q.p[2]),
  back: (z) => (typeof z === "number" ? (q) => q.p[2] - z : (q) => q.p[2] - z(q)),
  /** inside a polygon drawn in the x-y plane (seen from the front), corners counter-clockwise or not */
  polyXY: (pts) => (q) => {
    const x = q.p[0];
    const y = q.p[1];
    let d = Infinity;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [ax, ay] = pts[j];
      const [bx, by] = pts[i];
      if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
      const abx = bx - ax, aby = by - ay;
      const t = Math.min(1, Math.max(0, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby || 1)));
      d = Math.min(d, Math.hypot(x - ax - t * abx, y - ay - t * aby));
    }
    return inside ? -d : d;
  },
  /** grown (k > 0) or shrunk */
  grow: (k, f) => (q) => f(q) - k,
  /** a band along the edge of another region (its outline), w wide */
  edge: (w, f) => (q) => Math.abs(f(q)) - w / 2,
};

/**
 * A polygon in the x-y plane from corners joined by curves: each edge bowed out by `bow` (metres,
 * + away from the polygon's middle, - into it).
 */
export function bowed(corners, bows, per = 10) {
  const cx = corners.reduce((s, p) => s + p[0], 0) / corners.length;
  const cy = corners.reduce((s, p) => s + p[1], 0) / corners.length;
  const out = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    if (nx * (mx - cx) + ny * (my - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const k = bows[i] ?? 0;
    const c = [mx + nx * k * 2, my + ny * k * 2];
    for (let s = 0; s < per; s++) {
      const t = s / per;
      out.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]]);
    }
  });
  return out;
}

/** a smooth curve through points in the x-y plane (Catmull-Rom), closed */
export function loopXY(pts, per = 8) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  return out;
}

// ---------------------------------------------------------------- making one

/**
 * A garment from a region and a cloth. def: { name, region(q) → metres, cloth(q, out), offset
 * (metres off the skin), blend (sheer: alpha blended, the skin under kept), rough, metal, orm (the
 * cloth sets roughness and metalness texel by texel) }. q: { p, n, bone }; the cloth writes out.rgb
 * (linear), out.a (sheer cloth's opacity), out.rough, out.metal.
 */
export async function makeGarment(prep, tx, def, outSize = 1024) {
  const nf = prep.bodyFaces.length;
  const { tex, maxA, minA } = await paint(tx, nf, def, outSize);
  // its faces: every one it touches; the skin left out under it: faces it covers wholly, a ring in
  const faces = [];
  const used = new Uint8Array(nf);
  prep.bodyFaces.forEach((f, fi) => {
    if (maxA[fi] > 0.004) {
      faces.push(f);
      used[fi] = 1;
    }
  });
  const covered = new Set();
  if (!def.blend) prep.bodyFaces.forEach((f, fi) => maxA[fi] > 0 && minA[fi] >= 0.999 && covered.add(fi));
  // the vertices all of whose faces are covered
  const allCovered = new Map();
  prep.bodyFaces.forEach((f, fi) => {
    for (const v of f.v) allCovered.set(v, (allCovered.get(v) ?? true) && covered.has(fi));
  });
  const hide = [...allCovered].filter(([, all]) => all).map(([v]) => v);

  // lifted off the skin along its normals
  const off = def.offset ?? 0.003;
  const Pg = new Float64Array(prep.PM.length);
  for (let i = 0; i < Pg.length; i++) Pg[i] = prep.PM[i] + prep.NM[i] * off;
  if (def.drape) drape(prep, Pg, faces, off, def.drape);
  if (def.hull) hull(prep, Pg, faces, off, def.hull);
  const data = meshData(prep, def.name, Pg, faces, prep.base.vt, (v) => prep.top4(prep.vw[v]));
  const material = { name: def.name, tex: def.tex ?? def.name.toLowerCase(), rough: def.rough ?? 0.7, metal: def.metal ?? 0, alpha: def.blend ? "BLEND" : "MASK", cutoff: 0.5, kind: def.kind ?? "cloth" };
  if (def.sheen) material.sheen = def.sheen;
  if (tex.orm) Object.assign(material, { rough: 1, metal: 1 });
  return { part: { ...data, material, tex }, hide, faces: faces.length };
}

/**
 * A garment's texture over a mesh's texels (tx, nf faces): its colour, its outline (alpha) from the
 * region (none: all of it), roughness and metalness if the cloth sets them; and for each face how
 * much of it is covered, at most and at least.
 */
export async function paint(tx, nf, def, outSize = 1024) {
  const { size, face, P, N, B, fsize, names } = tx;
  const n = size * size;
  const rgba = new Uint8Array(n * 4);
  const orm = def.orm ? new Uint8Array(n * 4) : null;
  const maxA = new Float32Array(nf);
  const minA = new Float32Array(nf).fill(1);
  const q = { p: [0, 0, 0], n: [0, 0, 0], bone: "" };
  const out = { rgb: [0, 0, 0], a: 1, rough: def.rough ?? 0.7, metal: def.metal ?? 0 };
  const filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const f = face[i];
    if (f < 0) continue;
    q.p[0] = P[i * 3];
    q.p[1] = P[i * 3 + 1];
    q.p[2] = P[i * 3 + 2];
    q.n[0] = N[i * 3];
    q.n[1] = N[i * 3 + 1];
    q.n[2] = N[i * 3 + 2];
    q.bone = B[i] >= 0 ? names[B[i]] : "";
    const d = def.region ? def.region(q) : -1;
    // anti-aliased over a texel and a half
    const a = Math.min(1, Math.max(0, 0.5 - d / (fsize[f] * 1.5)));
    if (a > maxA[f]) maxA[f] = a;
    if (a < minA[f]) minA[f] = a;
    if (a <= 0) continue;
    out.a = 1;
    out.rough = def.rough ?? 0.7;
    out.metal = def.metal ?? 0;
    def.cloth(q, out);
    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.round(toSrgb(out.rgb[c]) * 255);
    rgba[i * 4 + 3] = Math.round(a * out.a * 255);
    filled[i] = 1;
    if (orm) {
      orm[i * 4] = 255;
      orm[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, out.rough)) * 255);
      orm[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, out.metal)) * 255);
      orm[i * 4 + 3] = 255;
    }
  }
  // the colour runs on past the outline (where alpha stays 0), and into the gaps between the
  // texture's pieces (alpha too), so filtering never brings in black or a seam of holes
  spread(rgba, filled, face, size, 8);
  if (orm) spread(orm, filled, face, size, 8);
  const tex = { png: await png(...halve(rgba, size, outSize)) };
  if (orm) tex.orm = await png(...halve(orm, size, outSize));
  return { tex, maxA, minA };
}

/**
 * Cloth pulled taut over her: its points evened with their neighbours `rounds` times, never closer
 * to the skin than `off` (pushed back out along the skin's normal), so it bridges hollows (between
 * the breasts) and smooths small bumps away instead of following every one. Its outline stays put.
 */
function drape(prep, Pg, faces, off, rounds) {
  const nb = new Map();
  const edgeCount = new Map();
  for (const f of faces)
    for (let k = 0; k < f.v.length; k++) {
      const a = f.v[k];
      const b = f.v[(k + 1) % f.v.length];
      if (!nb.has(a)) nb.set(a, new Set());
      if (!nb.has(b)) nb.set(b, new Set());
      nb.get(a).add(b);
      nb.get(b).add(a);
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  const rim = new Set();
  for (const [key, c] of edgeCount) if (c === 1) key.split(",").forEach((v) => rim.add(+v));
  const vs = [...nb.keys()].filter((v) => !rim.has(v));
  const { PM, NM } = prep;
  for (let it = 0; it < rounds; it++) {
    const next = new Map();
    for (const v of vs) {
      const ns = nb.get(v);
      const m = [0, 0, 0];
      for (const u of ns) for (let c = 0; c < 3; c++) m[c] += Pg[u * 3 + c] / ns.size;
      next.set(v, [0, 1, 2].map((c) => Pg[v * 3 + c] * 0.4 + m[c] * 0.6));
    }
    for (const [v, p] of next) {
      // only along the skin's normal (sliding across it would drag the texture's outline about),
      // and never under the cloth's thickness off the skin
      let d = (p[0] - PM[v * 3]) * NM[v * 3] + (p[1] - PM[v * 3 + 1]) * NM[v * 3 + 1] + (p[2] - PM[v * 3 + 2]) * NM[v * 3 + 2];
      if (d < off) d = off;
      for (let c = 0; c < 3; c++) Pg[v * 3 + c] = PM[v * 3 + c] + NM[v * 3 + c] * d;
    }
  }
}

/**
 * A shoe's shell made smooth (no toes showing through): its points evened out every way, Taubin's
 * way (a step in, a step back out, so it doesn't shrink), `rounds` times; its outline stays put. The
 * skin under it is left out of the drawing, so the toes can't be seen where they'd come through.
 */
function hull(prep, Pg, faces, off, rounds) {
  const nb = new Map();
  const edgeCount = new Map();
  for (const f of faces)
    for (let k = 0; k < f.v.length; k++) {
      const a = f.v[k];
      const b = f.v[(k + 1) % f.v.length];
      if (!nb.has(a)) nb.set(a, new Set());
      if (!nb.has(b)) nb.set(b, new Set());
      nb.get(a).add(b);
      nb.get(b).add(a);
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
    }
  // the rim (the garment's edge, not the skin's own: the toenails' rims are open) and a ring in
  // from it stay where they are, so the shoe meets the skin as it should
  if (!prep._edges) {
    prep._edges = new Map();
    for (const f of prep.bodyFaces)
      for (let k = 0; k < f.v.length; k++) {
        const a = f.v[k];
        const b = f.v[(k + 1) % f.v.length];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        prep._edges.set(key, (prep._edges.get(key) ?? 0) + 1);
      }
  }
  const rim = new Set();
  for (const [key, c] of edgeCount) if (c === 1 && prep._edges.get(key) > 1) key.split(",").forEach((v) => rim.add(+v));
  const ring = new Set(rim);
  for (const v of rim) for (const u of nb.get(v)) ring.add(u);
  const vs = [...nb.keys()].filter((v) => !ring.has(v));
  const step = (k) => {
    const next = vs.map((v) => {
      const ns = nb.get(v);
      const m = [0, 0, 0];
      for (const u of ns) for (let c = 0; c < 3; c++) m[c] += Pg[u * 3 + c] / ns.size;
      return [0, 1, 2].map((c) => Pg[v * 3 + c] + (m[c] - Pg[v * 3 + c]) * k);
    });
    vs.forEach((v, j) => {
      for (let c = 0; c < 3; c++) Pg[v * 3 + c] = next[j][c];
    });
  };
  for (let it = 0; it < rounds; it++) {
    step(0.6);
    step(-0.64);
  }
  // nothing under the floor (the soles flat on it)
  for (const v of vs) if (Pg[v * 3 + 1] < -off) Pg[v * 3 + 1] = -off;
}

/**
 * Colours spread past their edge, `rings` texels: into texels on her that the garment doesn't
 * cover, the colour only (they stay see-through); into the gaps no face covers, alpha too.
 */
function spread(data, filled, face, size, rings) {
  let have = filled.slice();
  for (let it = 0; it < rings; it++) {
    const next = have.slice();
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (have[i]) continue;
        let k = 0;
        const s = [0, 0, 0, 0];
        for (const j of [i - 1, i + 1, i - size, i + size]) {
          if (j < 0 || j >= size * size || !have[j]) continue;
          for (let c = 0; c < 4; c++) s[c] += data[j * 4 + c];
          k++;
        }
        if (!k) continue;
        for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.round(s[c] / k);
        if (face[i] < 0) data[i * 4 + 3] = Math.round(s[3] / k);
        next[i] = 1;
      }
    have = next;
  }
}

/** a texture made smaller by halves (each texel the mean of four: colours aren't darkened at the edges) */
export function halve(data, size, to) {
  let d = data;
  let s = size;
  while (s > to) {
    const h = s >> 1;
    const o = new Uint8Array(h * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < h; x++)
        for (let c = 0; c < 4; c++) {
          const i = (2 * y * s + 2 * x) * 4 + c;
          o[(y * h + x) * 4 + c] = (d[i] + d[i + 4] + d[i + s * 4] + d[i + s * 4 + 4] + 2) >> 2;
        }
    d = o;
    s = h;
  }
  return [d, s, s];
}

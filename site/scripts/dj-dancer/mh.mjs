// Reading MakeHuman's files, and the small geometry and texture helpers the dancer's build uses
// with them. The readers are the accounts' figure build's (site/scripts/figure/human.mjs), copied
// so the two builds can change apart. Our own code: MPFB2's code is GPL and none of it is used, only
// its data (CC0) and MakeHuman's system assets (CC0).
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";

// ------------------------------------------------------------------ MakeHuman's files

export function readObj(file) {
  const v = [];
  const vt = [];
  const faces = [];
  let g = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const p = line.trim().split(/\s+/);
      v.push(+p[1], +p[2], +p[3]);
    } else if (line.startsWith("vt ")) {
      const p = line.trim().split(/\s+/);
      vt.push(+p[1], +p[2]);
    } else if (line.startsWith("g ")) g = line.slice(2).trim();
    else if (line.startsWith("f ")) {
      const p = line.trim().split(/\s+/).slice(1).map((s) => s.split("/"));
      faces.push({ v: p.map((a) => +a[0] - 1), t: p.map((a) => (a[1] ? +a[1] - 1 : -1)), g });
    }
  }
  return { v: Float64Array.from(v), vt: Float64Array.from(vt), faces };
}

export function readTarget(file) {
  const idx = [];
  const d = [];
  for (const line of gunzipSync(readFileSync(file)).toString("utf8").split("\n")) {
    const s = line.trim();
    if (!s || s[0] === "#") continue;
    const p = s.split(/\s+/);
    idx.push(+p[0]);
    d.push(+p[1], +p[2], +p[3]);
  }
  return { idx: Uint32Array.from(idx), d: Float64Array.from(d) };
}

/** a .mhclo: how each of the proxy's vertices hangs on the base mesh, and the base vertices it hides */
export function readProxy(file) {
  const dir = dirname(file);
  const p = { file, refs: [], del: new Set(), scale: {}, material: null, obj: null };
  let mode = null;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const s = raw.trim();
    if (!s || s[0] === "#") continue;
    const t = s.split(/\s+/);
    if (!/^-?\d/.test(t[0])) {
      if (t[0] === "verts") mode = "verts";
      else if (t[0] === "delete_verts") mode = "del";
      if (t[0] === "obj_file") p.obj = join(dir, t[1]);
      else if (t[0] === "material") p.material = join(dir, t[1]);
      else if (/^[xyz]_scale$/.test(t[0])) p.scale[t[0][0]] = [+t[1], +t[2], +t[3]];
      continue;
    }
    if (mode === "verts") {
      if (t.length >= 9) p.refs.push({ i: [+t[0], +t[1], +t[2]], w: [+t[3], +t[4], +t[5]], o: [+t[6], +t[7], +t[8]] });
      else p.refs.push({ i: [+t[0]], w: [1], o: [0, 0, 0] });
    } else if (mode === "del") {
      for (let k = 0; k < t.length; k++) {
        if (t[k + 1] === "-") {
          for (let i = +t[k]; i <= +t[k + 2]; i++) p.del.add(i);
          k += 2;
        } else p.del.add(+t[k]);
      }
    }
  }
  p.mesh = readObj(p.obj);
  if (p.mesh.v.length / 3 !== p.refs.length) throw new Error(`${file}: ${p.refs.length} fittings for ${p.mesh.v.length / 3} vertices`);
  return p;
}

export function readMaterial(file) {
  const m = { dir: dirname(file) };
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const s = raw.trim();
    if (!s || s[0] === "#" || s.startsWith("//")) continue;
    const [k, ...rest] = s.split(/\s+/);
    m[k] = rest.join(" ");
  }
  return m;
}

// ------------------------------------------------------------------ shaping

export function addTarget(V, t, w) {
  for (let k = 0; k < t.idx.length; k++) {
    const i = t.idx[k] * 3;
    V[i] += w * t.d[k * 3];
    V[i + 1] += w * t.d[k * 3 + 1];
    V[i + 2] += w * t.d[k * 3 + 2];
  }
}

/** a target as a dense delta over the base mesh (Float64Array, n·3) */
export function dense(n, parts) {
  const D = new Float64Array(n * 3);
  for (const [t, w] of parts) addTarget(D, t, w);
  return D;
}

/** where a proxy's vertices go on the base mesh V */
export function fit(p, V) {
  const sc = (axis, c) => {
    const s = p.scale[axis];
    return s ? Math.abs(V[s[0] * 3 + c] - V[s[1] * 3 + c]) / s[2] : 1;
  };
  const s = [sc("x", 0), sc("y", 1), sc("z", 2)];
  const out = new Float64Array(p.refs.length * 3);
  p.refs.forEach((r, i) => {
    for (let c = 0; c < 3; c++) {
      let x = r.o[c] * s[c];
      for (let k = 0; k < r.i.length; k++) x += r.w[k] * V[r.i[k] * 3 + c];
      out[i * 3 + c] = x;
    }
  });
  return out;
}

/** smooth normals per vertex (area-weighted), over the given faces */
export function normalsOf(V, faces) {
  const N = new Float64Array(V.length);
  const add = (a, b, c) => {
    const ax = V[b * 3] - V[a * 3], ay = V[b * 3 + 1] - V[a * 3 + 1], az = V[b * 3 + 2] - V[a * 3 + 2];
    const bx = V[c * 3] - V[a * 3], by = V[c * 3 + 1] - V[a * 3 + 1], bz = V[c * 3 + 2] - V[a * 3 + 2];
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    for (const i of [a, b, c]) {
      N[i * 3] += nx;
      N[i * 3 + 1] += ny;
      N[i * 3 + 2] += nz;
    }
  };
  for (const f of faces) for (let k = 1; k + 1 < f.v.length; k++) add(f.v[0], f.v[k], f.v[k + 1]);
  for (let i = 0; i < N.length; i += 3) {
    const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
    N[i] /= l;
    N[i + 1] /= l;
    N[i + 2] /= l;
  }
  return N;
}

// ------------------------------------------------------------------ colour

export const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.4) - 0.055);
/** "#rrggbb" as linear RGB */
export const hexLin = (hex) => [1, 3, 5].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16) / 255));
export const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// ------------------------------------------------------------------ textures drawn over a mesh's UVs

/**
 * Every texel of a w×h texture that the faces cover: which face (-1: none), its three corners (the
 * faces' own vertex numbers, a quad split in two) and how much of each (barycentric). Texel (x, y)
 * counts from the top left; UVs from the bottom left, as MakeHuman's are.
 */
export function rasterUV(faces, vt, w, h) {
  const face = new Int32Array(w * h).fill(-1);
  const corner = new Int32Array(w * h * 3);
  const bary = new Float32Array(w * h * 3);
  faces.forEach((f, fi) => {
    for (let q = 1; q + 1 < f.t.length; q++) {
      const ks = [0, q, q + 1];
      const P = ks.map((k) => [vt[f.t[k] * 2] * w, (1 - vt[f.t[k] * 2 + 1]) * h]);
      const [[ax, ay], [bx, by], [cx, cy]] = P;
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-12) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
          const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
          const l3 = 1 - l1 - l2;
          if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
          const i = y * w + x;
          face[i] = fi;
          corner.set([f.v[ks[0]], f.v[ks[1]], f.v[ks[2]]], i * 3);
          bary.set([l1, l2, l3], i * 3);
        }
    }
  });
  return { w, h, face, corner, bary };
}

/**
 * Spreads what's drawn into the texels no face covers (a few rings), so a texture's edges don't
 * bleed the empty colour in when it's filtered. data: RGBA bytes; filled: which texels are drawn.
 */
export function bleed(data, filled, w, h, rings = 8) {
  let have = Uint8Array.from(filled);
  for (let it = 0; it < rings; it++) {
    const next = have.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (have[i]) continue;
        let n = 0;
        const sum = [0, 0, 0, 0];
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!have[j]) continue;
          for (let c = 0; c < 4; c++) sum[c] += data[j * 4 + c];
          n++;
        }
        if (!n) continue;
        for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(sum[c] / n);
        next[i] = 1;
      }
    have = next;
  }
}

/** RGBA bytes as a PNG (sharp), optionally made smaller */
export async function png(data, w, h, size = null) {
  let img = sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width: w, height: h, channels: 4 } });
  if (size && size !== w) img = img.resize(size, size, { kernel: "lanczos3" });
  return new Uint8Array(await img.png().toBuffer());
}

/** an image file as RGBA bytes */
export async function readRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** the islands of faces joined by shared UVs: an island number for each face */
export function uvIslands(faces, vt) {
  const up = new Int32Array(vt.length / 2).map((_, i) => i);
  const find = (i) => {
    while (up[i] !== i) i = up[i] = up[up[i]];
    return i;
  };
  for (const f of faces) for (let k = 1; k < f.t.length; k++) up[find(f.t[k])] = find(f.t[0]);
  return faces.map((f) => find(f.t[0]));
}

// ------------------------------------------------------------------ noise, for the cloth's patterns

/** a hash of integers to [0, 1) */
export function hash3(x, y, z, s = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** smooth value noise in 3D, about [0, 1] */
export function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let out = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    const k = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
    out += k * hash3(xi + dx, yi + dy, zi + dz, s);
  }
  return out;
}

/** a few octaves of noise3, about [0, 1] */
export function fbm(x, y, z, oct = 4, s = 0) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * noise3(x * f, y * f, z * f, s + o * 17);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** the nearest of points scattered one to a cell (3D): its distance, the second's, and the cell's hash */
export function cells(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let d1 = Infinity, d2 = Infinity, id = 0, cx = 0, cy = 0, cz = 0;
  for (let i = -1; i <= 1; i++)
    for (let j = -1; j <= 1; j++)
      for (let k = -1; k <= 1; k++) {
        const X = xi + i, Y = yi + j, Z = zi + k;
        const px = X + hash3(X, Y, Z, s), py = Y + hash3(X, Y, Z, s + 1), pz = Z + hash3(X, Y, Z, s + 2);
        const d = Math.hypot(px - x, py - y, pz - z);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          id = hash3(X, Y, Z, s + 3);
          cx = px;
          cy = py;
          cz = pz;
        } else if (d < d2) d2 = d;
      }
  return { d1, d2, id, c: [cx, cy, cz] };
}

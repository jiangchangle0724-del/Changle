// Her parts for the files: the body with its skin, and MakeHuman's own pieces fitted to her (eyes,
// brows, lashes, hairstyles, shoes, clothes), each with its texture made ready.
import sharp from "sharp";
import { join } from "node:path";
import { EYE_TEXTURE, SKIN, bodyMorphs, clothWeights, meshData, proxyMetres, proxyMorphs } from "./dancer.mjs";
import { meshTexels, paint, texels } from "./garments.mjs";
import { hexLin, lum, normalsOf, readMaterial, toLin, toSrgb, uvIslands } from "./mh.mjs";

/** the mean colour (linear) of the texels that show (alpha over half) */
function meanOf(data) {
  const m = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    for (let c = 0; c < 3; c++) m[c] += toLin(data[i + c] / 255);
    n++;
  }
  return m.map((x) => +(x / (n || 1)).toFixed(4));
}

async function rgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), w: info.width, h: info.height };
}

async function toPng({ data, w, h }, size = null) {
  let img = sharp(Buffer.from(data), { raw: { width: w, height: h, channels: 4 } });
  if (size && size < w) img = img.resize(size, size, { kernel: "lanczos3" });
  return new Uint8Array(await img.png().toBuffer());
}

/** made grey, its average at 0.5 (linear), for the page to colour (hair, brows) */
function greyed(t) {
  const mean = meanOf(t.data);
  const k = 0.5 / Math.max(lum(...mean), 1e-3);
  for (let i = 0; i < t.data.length; i += 4) {
    const l = lum(toLin(t.data[i] / 255), toLin(t.data[i + 1] / 255), toLin(t.data[i + 2] / 255));
    t.data[i] = t.data[i + 1] = t.data[i + 2] = Math.round(toSrgb(Math.min(1, l * k)) * 255);
  }
  return t;
}

/** each texel to the piece its faces draw it for (-1: none), a few texels wider */
function pieceMap(w, h, pieces) {
  const mask = new Int8Array(w * h).fill(-1);
  pieces.forEach(({ faces, vt }, k) => {
    for (const f of faces)
      for (let q = 1; q + 1 < f.t.length; q++) {
        const P = [f.t[0], f.t[q], f.t[q + 1]].map((t) => [vt[t * 2] * w, (1 - vt[t * 2 + 1]) * h]);
        const [[ax, ay], [bx, by], [cx, cy]] = P;
        const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(d) < 1e-9) continue;
        for (let y = Math.max(0, Math.floor(Math.min(ay, by, cy))); y <= Math.min(h - 1, Math.ceil(Math.max(ay, by, cy))); y++)
          for (let x = Math.max(0, Math.floor(Math.min(ax, bx, cx))); x <= Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx))); x++) {
            const l1 = ((by - cy) * (x + 0.5 - cx) + (cx - bx) * (y + 0.5 - cy)) / d;
            const l2 = ((cy - ay) * (x + 0.5 - cx) + (ax - cx) * (y + 0.5 - cy)) / d;
            if (l1 >= -0.02 && l2 >= -0.02 && 1 - l1 - l2 >= -0.02) mask[y * w + x] = k;
          }
      }
  });
  for (let it = 0; it < 4; it++) {
    const prev = mask.slice();
    for (let i = 0; i < w * h; i++) {
      if (prev[i] >= 0) continue;
      for (const j of [i - 1, i + 1, i - w, i + w]) if (j >= 0 && j < w * h && prev[j] >= 0) {
        mask[i] = prev[j];
        break;
      }
    }
  }
  return mask;
}

/**
 * Cloth recoloured piece by piece: each piece's texels made grey (their average at 0.5) and that
 * grey times the piece's new colour, so its folds and seams stay. A piece coloured null keeps its own.
 */
function recolour(t, pieces) {
  const mask = pieceMap(t.w, t.h, pieces);
  const sum = pieces.map(() => [0, 0]);
  for (let i = 0; i < t.w * t.h; i++) {
    const k = mask[i];
    if (k < 0) continue;
    sum[k][0] += lum(toLin(t.data[i * 4] / 255), toLin(t.data[i * 4 + 1] / 255), toLin(t.data[i * 4 + 2] / 255));
    sum[k][1]++;
  }
  const col = pieces.map((p) => (p.color ? hexLin(p.color) : null));
  for (let i = 0; i < t.w * t.h; i++) {
    const k = mask[i];
    if (k < 0 || !col[k]) continue;
    const l = lum(toLin(t.data[i * 4] / 255), toLin(t.data[i * 4 + 1] / 255), toLin(t.data[i * 4 + 2] / 255));
    // a little of the grey's contrast only (a light cloth from a dark one would bring its noise up)
    const g = 0.5 + (l / Math.max(sum[k][0] / sum[k][1], 1e-3) - 1) * (pieces[k].contrast ?? 0.5) * 0.5;
    for (let c = 0; c < 3; c++) t.data[i * 4 + c] = Math.round(toSrgb(Math.min(1, col[k][c] * g * 2)) * 255);
  }
  return t;
}

/** a disc of a texture covered with the colour round it (soft edged): cx, cy, r in texels */
function cover(t, cx, cy, r) {
  const ring = [0, 0, 0];
  let n = 0;
  for (let y = Math.floor(cy - r * 1.6); y <= cy + r * 1.6; y++)
    for (let x = Math.floor(cx - r * 1.6); x <= cx + r * 1.6; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < r * 1.15 || d > r * 1.6) continue;
      const i = (y * t.w + x) * 4;
      for (let c = 0; c < 3; c++) ring[c] += toLin(t.data[i + c] / 255);
      n++;
    }
  const m = ring.map((x) => x / n);
  for (let y = Math.floor(cy - r * 1.2); y <= cy + r * 1.2; y++)
    for (let x = Math.floor(cx - r * 1.2); x <= cx + r * 1.2; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const a = Math.min(1, Math.max(0, (r * 1.15 - d) / (r * 0.35)));
      if (!a) continue;
      const i = (y * t.w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = toLin(t.data[i + c] / 255);
        t.data[i + c] = Math.round(toSrgb(v + (m[c] - v) * a) * 255);
      }
    }
}

// ---------------------------------------------------------------- the body

/** her body: every face (an outfit's file says which to leave out), the skin texture, the expressions */
export async function bodyPart(prep) {
  const data = meshData(prep, "Body", prep.PM, prep.bodyFaces, prep.base.vt, (v) => prep.top4(prep.vw[v]), bodyMorphs(prep));
  const t = await rgba(join(prep.assets, SKIN));
  // the areolas painted out (with the nipples smoothed away, dancer.mjs: nothing to see if a garment ever slips)
  for (const tip of prep.tips) {
    const f = prep.bodyFaces.find((x) => x.v.includes(tip));
    const k = f.v.indexOf(tip);
    const u = prep.base.vt[f.t[k] * 2];
    const v = prep.base.vt[f.t[k] * 2 + 1];
    // texels per metre there: from the face's size on her and in the texture
    const a = f.v[0], b = f.v[2];
    const d3 = Math.hypot(prep.PM[a * 3] - prep.PM[b * 3], prep.PM[a * 3 + 1] - prep.PM[b * 3 + 1], prep.PM[a * 3 + 2] - prep.PM[b * 3 + 2]);
    const d2 = Math.hypot(prep.base.vt[f.t[0] * 2] - prep.base.vt[f.t[2] * 2], prep.base.vt[f.t[0] * 2 + 1] - prep.base.vt[f.t[2] * 2 + 1]) * t.w;
    cover(t, u * t.w, (1 - v) * t.h, 0.022 * (d2 / d3));
  }
  makeUp(prep, t);
  const tex = { png: await toPng(t), mean: meanOf(t.data) };
  return { ...data, material: { name: "Skin", tex: "skin", rough: 0.55, tint: "skin", kind: "skin" }, tex };
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Her make-up, painted into the skin from where each texel lies on her face (metres, at rest): a
 * rose lipstick over the lips' own red, a warm shadow over the eyelids, a little blush; and the
 * scalp under her hair darkened, so the hair's cut edge never shows pale skin between strands.
 */
function makeUp(prep, t) {
  const tx = texels(prep, t.w);
  const eye = ["LeftEye", "RightEye"].map((n) => prep.bones.get(n).head);
  const H = prep.bones.get("Head").head;
  const E = [0, (eye[0][1] + eye[1][1]) / 2, (eye[0][2] + eye[1][2]) / 2];
  // the lips: a little under the nose's tip (her face's most forward point)
  let tip = null;
  for (const v of prep.groupIdx("body")) {
    if (prep.mainBone[v] !== "Head" || Math.abs(prep.PM[v * 3]) > 0.01) continue;
    if (!tip || prep.PM[v * 3 + 2] > tip[2]) tip = [prep.PM[v * 3], prep.PM[v * 3 + 1], prep.PM[v * 3 + 2]];
  }
  const M = [0, tip[1] - 0.04, tip[2] - 0.02];
  const lip = hexLin("#a32b3a");
  const shadow = hexLin("#6e4038");
  const blush = hexLin("#e07884");
  const scalp = hexLin("#1d140f");
  const head = new Set(["Head", "Neck", "LeftEye", "RightEye"]);
  for (let i = 0; i < t.w * t.h; i++) {
    if (tx.face[i] < 0) continue;
    if (!head.has(tx.names[tx.B[i]])) continue;
    const x = tx.P[i * 3], y = tx.P[i * 3 + 1], z = tx.P[i * 3 + 2];
    const c = [0, 1, 2].map((k) => toLin(t.data[i * 4 + k] / 255));
    const blend = (col, a) => {
      if (a <= 0) return;
      const l = lum(...c);
      const lc = lum(...col);
      // the colour, at the skin's own light and shade
      for (let k = 0; k < 3; k++) c[k] = c[k] + (col[k] * (l / Math.max(lc, 1e-3)) * 0.85 - c[k]) * a;
    };
    const nz = tx.N[i * 3 + 2];
    // lips: near the mouth, facing out (not the mouth's inside), where the skin is already redder than round it
    const lx = (x - M[0]) / 0.027, ly = (y - M[1]) / (y > M[1] ? 0.015 : 0.011);
    const inLips = 1 - smooth(0.8, 1.05, Math.hypot(lx, ly));
    if (inLips > 0 && nz > 0.2) {
      const red = c[0] / Math.max(1e-3, c[1]);
      blend(lip, inLips * smooth(1.76, 1.98, red) * (1 - smooth(3, 4, red)) * 0.7);
    }
    // eyelids: above each eye, below the brow, strongest near the lashes
    for (const e of eye) {
      const dx = (x - e[0]) / 0.021, dy = y - e[1];
      if (z < e[2] - 0.022) continue;
      const a = (1 - smooth(0.7, 1.1, Math.abs(dx))) * smooth(0.002, 0.007, dy) * (1 - smooth(0.012, 0.022, dy));
      blend(shadow, a * 0.42);
      // blush on the cheekbone, below and out from the eye (not the nose)
      const bx = (x - Math.sign(e[0]) * 0.056) / 0.022, by = (y - (e[1] - 0.03)) / 0.018;
      if (Math.abs(x) > 0.03 && nz > 0.1) blend(blush, (1 - smooth(0.2, 1.1, Math.hypot(bx, by))) * 0.16);
    }
    // the scalp: above the hairline (lower at the temples and behind the ears), the ears left
    if (Math.abs(x) < 0.071) {
      const temple = 0.65 * Math.min(0.07, Math.max(0, E[2] - 0.02 - z));
      const nape = 1.2 * Math.min(0.08, Math.max(0, H[2] + 0.01 - z));
      const line = E[1] + 0.06 - temple - nape;
      const a = smooth(-0.004, 0.006, y - line) * 0.9;
      for (let k = 0; k < 3; k++) c[k] += (scalp[k] * (0.7 + 0.6 * (lum(...c) / 0.25)) - c[k]) * a;
    }
    for (let k = 0; k < 3; k++) t.data[i * 4 + k] = Math.round(toSrgb(c[k]) * 255);
  }
}

// ---------------------------------------------------------------- MakeHuman's pieces

/**
 * A MakeHuman proxy fitted to her, as a part: key is its name in prep.wear. o: { name, weights:
 * "eyes" | "cloth" | null, texture (a file, else the proxy's own), grey, desaturate, pieces
 * ([{ test(x, y) → bool on the piece's UV middle, color }]), material (overrides), morphs }
 */
export async function proxyPart(prep, key, o = {}) {
  const w = prep.wear.get(key);
  const p = w.proxy;
  const Pm = proxyMetres(prep, w.P);
  const { faces, vt } = p.mesh;
  let weightsOf;
  if (o.weights === "eyes") {
    const L = prep.jointOf.get("LeftEye");
    const Rj = prep.jointOf.get("RightEye");
    weightsOf = (i) => prep.top4([[Pm[i * 3] > 0 ? L : Rj, 1]]);
  } else if (o.weights === "cloth") {
    const cw = clothWeights(prep, Pm, faces);
    weightsOf = (i) => prep.top4(cw[i]);
  } else
    weightsOf = (i) => {
      const r = p.refs[i];
      return prep.top4(r.i.flatMap((v, k) => prep.vw[v].map(([j, x]) => [j, x * r.w[k]])).filter(([, x]) => x > 0));
    };
  const morphs = o.morphs === false ? [] : proxyMorphs(prep, p, Pm);
  // only some of its pieces (a skirt without its blouse): by where each island of its UVs lies
  if (o.only) {
    const isl = uvIslands(faces, vt);
    const mid = new Map();
    faces.forEach((f, i) => {
      const m = mid.get(isl[i]) ?? [0, 0, 0];
      for (const tt of f.t) {
        m[0] += vt[tt * 2];
        m[1] += 1 - vt[tt * 2 + 1];
        m[2]++;
      }
      mid.set(isl[i], m);
    });
    const keep = faces.map((_, i) => {
      const [x, y, n] = mid.get(isl[i]);
      return o.only(x / n, y / n);
    });
    o.keepFaces = (i) => keep[i];
  }
  // painted afresh from where it lies on her, like her garments (a pattern, an outline)
  if (o.paint) {
    const keepF = o.keepFaces ? faces.filter((_, i) => o.keepFaces(i)) : faces;
    const tx = meshTexels(Pm, normalsOf(Pm, keepF), keepF, vt, o.paintSize ?? 2048);
    const { tex } = await paint(tx, keepF.length, o.paint, 1024);
    const data = meshData(prep, o.name ?? key, Pm, keepF, vt, weightsOf, morphs, { welds: new Uint16Array(Pm.length / 3) });
    const material = { name: o.name ?? key, tex: o.tex ?? (o.name ?? key).toLowerCase(), rough: o.paint.rough ?? 0.7, metal: o.paint.metal ?? 0, alpha: o.paint.region ? "MASK" : undefined, kind: o.paint.kind ?? "cloth", ...(o.material ?? {}) };
    if (o.paint.sheen) material.sheen = o.paint.sheen;
    if (tex.orm) Object.assign(material, { rough: 1, metal: 1 });
    return { ...data, material, tex, extras: o.extras, hide: [...p.del] };
  }
  const mat = p.material ? readMaterial(p.material) : {};
  const file = o.texture ? join(prep.assets, o.texture) : mat.diffuseTexture ? join(mat.dir, mat.diffuseTexture) : null;
  let tex = null;
  if (file) {
    const t = await rgba(file);
    if (o.desaturate)
      for (let i = 0; i < t.data.length; i += 4) {
        const l = 0.299 * t.data[i] + 0.587 * t.data[i + 1] + 0.114 * t.data[i + 2];
        for (let c = 0; c < 3; c++) t.data[i + c] = Math.round(t.data[i + c] + (l - t.data[i + c]) * o.desaturate);
      }
    if (o.clean) o.clean(t);
    if (o.pieces) {
      const isl = uvIslands(faces, vt);
      const mid = new Map();
      faces.forEach((f, i) => {
        const m = mid.get(isl[i]) ?? [0, 0, 0];
        for (const tt of f.t) {
          m[0] += vt[tt * 2];
          m[1] += 1 - vt[tt * 2 + 1];
          m[2]++;
        }
        mid.set(isl[i], m);
      });
      const pieceOf = faces.map((_, i) => {
        const [x, y, n] = mid.get(isl[i]);
        return o.pieces.findIndex((pc) => pc.test(x / n, y / n));
      });
      recolour(
        t,
        o.pieces.map((pc, k) => ({ faces: faces.filter((_, i) => pieceOf[i] === k), vt, color: pc.color, contrast: pc.contrast })),
      );
      // faces no piece claims: left out (a suit's part we don't want, a skirt's top under a bodice)
      o.keepFaces = (i) => pieceOf[i] >= 0;
    }
    if (o.grey) greyed(t);
    tex = { png: await toPng(t, o.size), mean: meanOf(t.data) };
  }
  const keep = o.keepFaces ? faces.filter((_, i) => o.keepFaces(i)) : faces;
  const data = meshData(prep, o.name ?? key, Pm, keep, vt, weightsOf, morphs, { welds: new Uint16Array(Pm.length / 3) });
  const material = { name: o.name ?? key, tex: o.tex ?? (o.name ?? key).toLowerCase(), rough: 0.8, ...(o.material ?? {}) };
  return { ...data, material, tex, extras: o.extras, hide: [...p.del] };
}

/** eyes, brows and lashes */
export async function facePart(prep) {
  const eyes = await proxyPart(prep, "Eyes", { name: "Eyes", weights: "eyes", texture: EYE_TEXTURE, desaturate: 0.4, morphs: false, size: 256, material: { alpha: "MASK", rough: 0.15, kind: "eyes" } });
  const brows = await proxyPart(prep, "Eyebrows", { name: "Eyebrows", grey: true, size: 256, material: { alpha: "BLEND", double: true, tint: "brow", rough: 0.8 } });
  const lashes = await proxyPart(prep, "Eyelashes", { name: "Eyelashes", size: 256, material: { alpha: "BLEND", double: true, rough: 0.8 } });
  return [eyes, brows, lashes];
}

/** a hairstyle: cut out of its texture (the page smooths the edges), grey for the page to colour */
export async function hairPart(prep, h) {
  return proxyPart(prep, `Hair_${h}`, { name: `Hair_${h}`, tex: `hair_${h}`, grey: true, size: 512, material: { alpha: "MASK", double: true, tint: "hair", rough: 0.6, kind: "hair" }, extras: { hair: h } });
}

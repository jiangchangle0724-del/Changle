// MakeHuman's realistic human (CC0) as a glTF figure we can sculpt: the base mesh shaped into an
// adult man or woman, dressed (clothes, shoes, eyes, eyebrows, eyelashes, several hairstyles fitted
// on the way MakeHuman fits them), skinned to a Mixamo-named skeleton, with morph targets for the
// face sliders (S_…) and the expressions (X_…). build.mjs adds the moves and writes the files.
//
// Reads two folders (README.md says where they come from):
//   mpfb:   MPFB2's src/mpfb/data (base.obj, targets, the Mixamo rig and its weights)
//   assets: MakeHuman's system assets (skins, clothes, hair, eyes, eyebrows, eyelashes)
// Our own code: MPFB2's code is GPL, its data and the assets are CC0, and only the data is used.
import { Document } from "@gltf-transform/core";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join } from "node:path";

/** the eye height (metres) the moves were written for, and the figure is scaled to */
export const REF_EYE = 1.7257;

/** what each figure wears and how it is shaped */
// The race mix only shapes the default face (East Asian leaning, for this site's players; nothing
// in the page is labelled by race), and `face` nudges it a little; the sliders start from there.
export const SEXES = {
  male: {
    gender: 1,
    race: { asian: 0.6, caucasian: 0.3, african: 0.1 },
    face: [["head/head-square", 0.2], ["chin/chin-width-incr", 0.1]],
    skin: "skins/young_asian_male/young_lightskinned_male_diffuse3.png",
    clothes: "clothes/male_casualsuit06/male_casualsuit06.mhclo",
    shoes: "clothes/shoes06/shoes06.mhclo",
    eyebrows: "eyebrows/eyebrow001/eyebrow001.mhclo",
    eyelashes: "eyelashes/eyelashes01/eyelashes01.mhclo",
  },
  female: {
    gender: 0,
    race: { asian: 0.6, caucasian: 0.3, african: 0.1 },
    face: [["eyes/*-eye-scale-incr", 0.15], ["nose/nose-scale-horiz-decr", 0.2], ["mouth/mouth-upperlip-volume-incr", 0.15], ["chin/chin-width-decr", 0.15], ["head/head-invertedtriangular", 0.15]],
    skin: "skins/young_asian_female/young_lightskinned_female_diffuse3.png",
    clothes: "clothes/female_casualsuit01/female_casualsuit01.mhclo",
    shoes: "clothes/shoes05/shoes05.mhclo",
    eyebrows: "eyebrows/eyebrow006/eyebrow006.mhclo",
    eyelashes: "eyelashes/eyelashes02/eyelashes02.mhclo",
  },
};

export const EYES = "eyes/high-poly/high-poly.mhclo";
export const EYE_TEXTURE = "eyes/materials/brown_eye.png";
export const HAIRS = ["short02", "short04", "short01", "short03", "bob01", "bob02", "long01", "ponytail01", "braid01", "afro01"];

/**
 * The face sliders: each is one target from -1 to 1 ([decr, incr]) or 0 to 1 ([null, target]);
 * "l-"/"r-" in a name means both sides together.
 */
export const SHAPES = {
  faceWidth: ["head/head-scale-horiz-decr", "head/head-scale-horiz-incr"],
  faceLength: ["head/head-scale-vert-decr", "head/head-scale-vert-incr"],
  round: [null, "head/head-round"],
  square: [null, "head/head-square"],
  vface: [null, "head/head-invertedtriangular"],
  chinWidth: ["chin/chin-width-decr", "chin/chin-width-incr"],
  chinOut: ["chin/chin-prominent-decr", "chin/chin-prominent-incr"],
  chinLength: ["chin/chin-height-decr", "chin/chin-height-incr"],
  cheekbones: ["cheek/*-cheek-bones-decr", "cheek/*-cheek-bones-incr"],
  cheeks: ["cheek/*-cheek-volume-decr", "cheek/*-cheek-volume-incr"],
  ears: ["ears/*-ear-scale-decr", "ears/*-ear-scale-incr"],
  eyeSize: ["eyes/*-eye-scale-decr", "eyes/*-eye-scale-incr"],
  eyeApart: ["eyes/*-eye-trans-in", "eyes/*-eye-trans-out"],
  eyeHeight: ["eyes/*-eye-trans-down", "eyes/*-eye-trans-up"],
  eyeTilt: ["eyes/*-eye-eyefold-angle-down", "eyes/*-eye-eyefold-angle-up"],
  eyeFold: ["eyes/*-eye-eyefold-down", "eyes/*-eye-eyefold-up"],
  eyeOpen: ["eyes/*-eye-height2-decr", "eyes/*-eye-height2-incr"],
  browHeight: ["eyebrows/eyebrows-trans-down", "eyebrows/eyebrows-trans-up"],
  browAngle: ["eyebrows/eyebrows-angle-down", "eyebrows/eyebrows-angle-up"],
  noseWidth: ["nose/nose-scale-horiz-decr", "nose/nose-scale-horiz-incr"],
  noseLength: ["nose/nose-scale-vert-decr", "nose/nose-scale-vert-incr"],
  noseHeight: ["nose/nose-scale-depth-decr", "nose/nose-scale-depth-incr"],
  noseHump: ["nose/nose-hump-decr", "nose/nose-hump-incr"],
  nostrils: ["nose/nose-nostrils-width-decr", "nose/nose-nostrils-width-incr"],
  noseTip: ["nose/nose-point-width-decr", "nose/nose-point-width-incr"],
  mouthWidth: ["mouth/mouth-scale-horiz-decr", "mouth/mouth-scale-horiz-incr"],
  upperLip: ["mouth/mouth-upperlip-volume-decr", "mouth/mouth-upperlip-volume-incr"],
  lowerLip: ["mouth/mouth-lowerlip-volume-decr", "mouth/mouth-lowerlip-volume-incr"],
  mouthHeight: ["mouth/mouth-trans-down", "mouth/mouth-trans-up"],
  corners: ["mouth/mouth-angles-down", "mouth/mouth-angles-up"],
};

/** The expressions, from MakeHuman's expression units (blended by race like the face). */
export const EXPRESSIONS = {
  blinkL: ["eye-left-closure"],
  blinkR: ["eye-right-closure"],
  squint: ["eye-left-slit", "eye-right-slit"],
  smile: ["mouth-corner-puller"],
  sadMouth: ["mouth-depression"],
  kiss: ["mouth-pursing"],
  browsUp: ["eyebrows-left-up", "eyebrows-right-up"],
  browsSad: ["eyebrows-left-inner-up", "eyebrows-right-inner-up"],
  browsDown: ["eyebrows-left-down", "eyebrows-right-down"],
};

// ------------------------------------------------------------------ reading MakeHuman's files

function readObj(file) {
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

function readTarget(file) {
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

/** a .mhclo: how each of the proxy's vertices hangs on the base mesh */
function readProxy(file) {
  const dir = dirname(file);
  const p = { file, refs: [], del: new Set(), scale: {}, material: null, obj: null };
  let mode = null;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const s = raw.trim();
    if (!s || s[0] === "#") continue;
    const t = s.split(/\s+/);
    if (!/^-?\d/.test(t[0])) {
      // other keywords can come between "verts" and the fittings, so only these two switch
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

function readMaterial(file) {
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

function addTarget(V, t, w) {
  for (let k = 0; k < t.idx.length; k++) {
    const i = t.idx[k] * 3;
    V[i] += w * t.d[k * 3];
    V[i + 1] += w * t.d[k * 3 + 1];
    V[i + 2] += w * t.d[k * 3 + 2];
  }
}

/** a target as a dense delta over the base mesh (Float64Array, n·3) */
function dense(n, parts) {
  const D = new Float64Array(n * 3);
  for (const [t, w] of parts) addTarget(D, t, w);
  return D;
}

/** where a proxy's vertices go on the base mesh V */
function fit(p, V) {
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
function normalsOf(V, faces) {
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

// ------------------------------------------------------------------ textures

/**
 * Fixes to the textures: MakeHuman's logo on the shirts goes (filled with the plain cloth, or
 * covered with cloth from the back of the same shirt); the brown eyes a calmer brown.
 */
const CLEAN = {
  "clothes/male_casualsuit06/male_casualsuit06_diffuse.png": { fill: { color: [207, 207, 207], tol: 20, grow: 4, boxes: [[395, 230, 615, 340], [900, 240, 1285, 420], [1488, 292, 1545, 372]] } },
  "clothes/female_casualsuit01/female_casualsuit01_diffuse.png": { copy: { from: [581, 467], to: [1608, 467], r: 192, soft: 12 } },
};

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/**
 * A texture, ready for the file: { png, mean } where mean is the average colour (linear RGB) of
 * its visible pixels, for the page to tint by (skin, hair, eyebrows). grey: made grey, its
 * average at 0.5 linear, so any colour can be laid over it.
 */
async function prepTexture(file, rel, { grey = false, desaturate = 0 } = {}) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = (x, y) => (y * w + x) * 4;
  const fix = CLEAN[rel];
  if (fix?.fill) {
    const { color, tol, grow, boxes } = fix.fill;
    for (const [x0, y0, x1, y1] of boxes) {
      const mark = new Uint8Array((x1 - x0) * (y1 - y0));
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          const i = px(x, y);
          const dev = Math.max(...[0, 1, 2].map((c) => Math.abs(data[i + c] - color[c])));
          if (dev > tol) mark[(y - y0) * (x1 - x0) + (x - x0)] = 1;
        }
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
          let hit = false;
          for (let dy = -grow; dy <= grow && !hit; dy++)
            for (let dx = -grow; dx <= grow && !hit; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= x0 && xx < x1 && yy >= y0 && yy < y1 && mark[(yy - y0) * (x1 - x0) + (xx - x0)]) hit = true;
            }
          if (hit) for (let c = 0; c < 3; c++) data[px(x, y) + c] = color[c];
        }
    }
  }
  if (fix?.copy) {
    const { from, to, r, soft } = fix.copy;
    for (let y = to[1] - r; y <= to[1] + r; y++)
      for (let x = to[0] - r; x <= to[0] + r; x++) {
        const a = Math.min(1, Math.max(0, (r - Math.hypot(x - to[0], y - to[1])) / soft));
        if (!a) continue;
        const s = px(x - to[0] + from[0], y - to[1] + from[1]);
        const d = px(x, y);
        for (let c = 0; c < 3; c++) data[d + c] = Math.round(data[s + c] * a + data[d + c] * (1 - a));
      }
  }
  if (desaturate) {
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] + (l - data[i + c]) * desaturate);
    }
  }
  // the average of what shows
  const mean = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    for (let c = 0; c < 3; c++) mean[c] += toLin(data[i + c] / 255);
    count++;
  }
  for (let c = 0; c < 3; c++) mean[c] /= count || 1;
  if (grey) {
    const lum = 0.2126 * mean[0] + 0.7152 * mean[1] + 0.0722 * mean[2];
    const k = 0.5 / Math.max(lum, 1e-3);
    for (let i = 0; i < data.length; i += 4) {
      const l = 0.2126 * toLin(data[i] / 255) + 0.7152 * toLin(data[i + 1] / 255) + 0.0722 * toLin(data[i + 2] / 255);
      const v = Math.round(toSrgb(Math.min(1, l * k)) * 255);
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    mean[0] = mean[1] = mean[2] = 0.5;
  }
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  return { png: new Uint8Array(png), mean: mean.map((x) => +x.toFixed(4)) };
}

// ------------------------------------------------------------------ the figure

/**
 * Shapes one figure and fits what it wears. Slow (the targets and fittings); then
 * docOf(prep, names) makes a glTF document with the skeleton and the named parts.
 */
export async function prepareHuman({ mpfb, assets, sex }) {
  const cfg = SEXES[sex];
  const T = (rel) => join(mpfb, "targets", `${rel}.target.gz`);
  const base = readObj(join(mpfb, "3dobjs/base.obj"));
  const n = base.v.length / 3;
  const groups = JSON.parse(readFileSync(join(mpfb, "mesh_metadata/basemesh_vertex_groups.json"), "utf8"));
  const groupIdx = (name) => groups[name].flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k));

  // 1. the body: a young adult, average muscle and weight, the races mixed
  const g = cfg.gender >= 0.5 ? "male" : "female";
  const V = Float64Array.from(base.v);
  addTarget(V, readTarget(T(`macrodetails/universal-${g}-young-averagemuscle-averageweight`)), 1);
  for (const [race, w] of Object.entries(cfg.race)) addTarget(V, readTarget(T(`macrodetails/${race}-${g}-young`)), w);
  const breast = T(`breast/female-young-averagemuscle-averageweight-averagecup-averagefirmness`);
  if (g === "female" && existsSync(breast)) addTarget(V, readTarget(breast), 1);
  const both = (rel) => (rel.includes("*") ? ["l", "r"].map((s) => rel.replace("*", s)) : [rel]);
  for (const [rel, w] of cfg.face ?? []) for (const r of both(rel)) addTarget(V, readTarget(T(r)), w);

  // 2. what it wears
  const proxyOf = (rel) => readProxy(join(assets, rel));
  const wear = [
    { name: "Eyes", proxy: proxyOf(EYES), tex: EYE_TEXTURE },
    { name: "Eyebrows", proxy: proxyOf(cfg.eyebrows), grey: true },
    { name: "Eyelashes", proxy: proxyOf(cfg.eyelashes) },
    { name: "Clothes", proxy: proxyOf(cfg.clothes) },
    { name: "Shoes", proxy: proxyOf(cfg.shoes) },
    ...HAIRS.map((h) => ({ name: `Hair_${h}`, proxy: proxyOf(`hair/${h}/${h}.mhclo`), hair: h, grey: true })),
  ];
  const hidden = new Set();
  for (const p of wear) if (p.name === "Clothes" || p.name === "Shoes") p.proxy.del.forEach((i) => hidden.add(i));

  // 3. the targets as dense deltas: face sliders and expressions
  const sideParts = (rel) => (rel.includes("*") ? ["l", "r"].map((s) => rel.replace("*", s)) : [rel]);
  const targets = [];
  for (const [id, [decr, incr]] of Object.entries(SHAPES)) {
    if (decr) targets.push({ name: `S_${id}_decr`, D: dense(n, sideParts(decr).map((r) => [readTarget(T(r)), 1])) });
    targets.push({ name: `S_${id}_incr`, D: dense(n, sideParts(incr).map((r) => [readTarget(T(r)), 1])) });
  }
  for (const [id, units] of Object.entries(EXPRESSIONS)) {
    const list = [];
    for (const u of units) for (const [race, w] of Object.entries(cfg.race)) list.push([readTarget(T(`expression/units/${race}/${u}`)), w]);
    targets.push({ name: `X_${id}`, D: dense(n, list), normals: true });
  }

  // 4. sizes: metres, the ground under the shoes at 0, the eyes at REF_EYE
  const shoesAt = fit(wear.find((p) => p.name === "Shoes").proxy, V);
  let ground = Infinity;
  for (let i = 1; i < shoesAt.length; i += 3) ground = Math.min(ground, shoesAt[i]);
  const meanOf = (idx, W = V) => {
    const p = [0, 0, 0];
    for (const i of idx) for (let c = 0; c < 3; c++) p[c] += W[i * 3 + c] / idx.length;
    return p;
  };
  const eyeY = meanOf([...groupIdx("helper-l-eye"), ...groupIdx("helper-r-eye")])[1];
  const scale = REF_EYE / (eyeY - ground);
  const toM = (p) => [p[0] * scale, (p[1] - ground) * scale, p[2] * scale];

  // 5. the skeleton: MPFB's Mixamo rig, the joints where the shaped body puts them; and a bone for each eye
  const rigJson = JSON.parse(readFileSync(join(mpfb, "rigs/standard/rig.mixamo.json"), "utf8")).bones;
  const strip = (s) => s.replace(/^mixamorig:/, "");
  const bones = new Map();
  for (const [full, b] of Object.entries(rigJson)) {
    const spec = b.head;
    const idx = spec.strategy === "CUBE" ? groupIdx(spec.cube_name) : spec.vertex_indices;
    bones.set(strip(full), { name: strip(full), parent: b.parent ? strip(b.parent) : null, head: toM(meanOf(idx)) });
  }
  bones.set("LeftEye", { name: "LeftEye", parent: "Head", head: toM(meanOf(groupIdx("helper-l-eye"))) });
  bones.set("RightEye", { name: "RightEye", parent: "Head", head: toM(meanOf(groupIdx("helper-r-eye"))) });
  const order = [];
  const visit = (b) => {
    if (order.includes(b)) return;
    if (b.parent) visit(bones.get(b.parent));
    order.push(b);
  };
  [...bones.values()].sort((a, b) => (a.name < b.name ? -1 : 1)).forEach(visit);
  const jointOf = new Map(order.map((b, i) => [b.name, i]));

  // 6. skin weights for every base vertex (helpers too: the clothes hang on them)
  const W = JSON.parse(readFileSync(join(mpfb, "rigs/standard/weights.mixamo.json"), "utf8")).weights;
  const vw = Array.from({ length: n }, () => []);
  for (const bone of Object.keys(W).sort()) {
    const j = jointOf.get(strip(bone));
    for (const [i, w] of W[bone]) if (w > 0) vw[i].push([j, w]);
  }
  const top4 = (list) => {
    const m = new Map();
    for (const [j, w] of list) m.set(j, (m.get(j) ?? 0) + w);
    const best = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const sum = best.reduce((s, x) => s + x[1], 0) || 1;
    while (best.length < 4) best.push([0, 0]);
    return best.map(([j, w]) => [j, w / sum]);
  };

  /**
   * One mesh's arrays: positions P (its own vertices, MakeHuman units), faces (UV indices into
   * vt), each vertex's weights, the targets as deltas over P.
   */
  const meshData = (name, P, faces, vt, weightsOf, morphs) => {
    const N = normalsOf(P, faces);
    // glTF wants one index per (vertex, uv) pair
    const key = new Map();
    const src = [];
    const uvs = [];
    const tri = [];
    const at = (vi, ti) => {
      const k = vi * 100000 + (ti + 1);
      let i = key.get(k);
      if (i === undefined) {
        i = src.length;
        key.set(k, i);
        src.push(vi);
        uvs.push(ti >= 0 ? vt[ti * 2] : 0, ti >= 0 ? 1 - vt[ti * 2 + 1] : 0);
      }
      return i;
    };
    for (const f of faces) {
      const ix = f.v.map((v, k) => at(v, f.t[k]));
      for (let k = 1; k + 1 < ix.length; k++) tri.push(ix[0], ix[k], ix[k + 1]);
    }
    const m = src.length;
    const pos = new Float32Array(m * 3);
    const nor = new Float32Array(m * 3);
    const joints = new Uint8Array(m * 4);
    const weights = new Float32Array(m * 4);
    const weld = new Uint16Array(m);
    src.forEach((vi, i) => {
      pos.set(toM([P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]]), i * 3);
      nor.set([N[vi * 3], N[vi * 3 + 1], N[vi * 3 + 2]], i * 3);
      const w = weightsOf(vi);
      joints.set(w.map((x) => x[0]), i * 4);
      weights.set(w.map((x) => x[1]), i * 4);
      weld[i] = vi;
    });
    const targetsOut = [];
    for (const t of morphs) {
      const d = new Float32Array(m * 3);
      let any = false;
      src.forEach((vi, i) => {
        for (let c = 0; c < 3; c++) {
          const x = t.D[vi * 3 + c] * scale;
          // under a tenth of a millimetre is nothing (and packs better as zero)
          if (Math.abs(x) > 2e-4) any = true;
          d[i * 3 + c] = Math.abs(x) < 1e-4 ? 0 : x;
        }
      });
      if (!any) continue;
      let dn = null;
      if (t.normals) {
        const N2 = normalsOf(Float64Array.from(P, (x, i) => x + t.D[i]), faces);
        dn = new Float32Array(m * 3);
        src.forEach((vi, i) => {
          for (let c = 0; c < 3; c++) dn[i * 3 + c] = N2[vi * 3 + c] - N[vi * 3 + c];
        });
      }
      targetsOut.push({ name: t.name, d, dn });
    }
    return { name, pos, nor, uv: Float32Array.from(uvs), joints, weights, weld, index: m > 65535 ? Uint32Array.from(tri) : Uint16Array.from(tri), targets: targetsOut };
  };

  const parts = [];
  // the body: what the clothes and shoes cover is left out
  {
    const faces = base.faces.filter((f) => f.g === "body" && !f.v.some((v) => hidden.has(v)));
    const used = [...new Set(faces.flatMap((f) => f.v))].sort((a, b) => a - b);
    const re = new Map(used.map((v, i) => [v, i]));
    const P = new Float64Array(used.length * 3);
    used.forEach((v, i) => P.set(V.subarray(v * 3, v * 3 + 3), i * 3));
    const fs = faces.map((f) => ({ v: f.v.map((v) => re.get(v)), t: f.t }));
    const morphs = targets.map((t) => {
      const D = new Float64Array(used.length * 3);
      used.forEach((v, i) => D.set(t.D.subarray(v * 3, v * 3 + 3), i * 3));
      return { ...t, D };
    });
    const tex = await prepTexture(join(assets, cfg.skin), cfg.skin);
    parts.push({ ...meshData("Body", P, fs, base.vt, (i) => top4(vw[used[i]]), morphs), material: { name: "Skin", tex: "skin", rough: 0.62, tint: "skin" }, tex });
  }
  // the proxies, fitted; each vertex's weights from the base vertices it hangs on
  for (const part of wear) {
    const p = part.proxy;
    const P = fit(p, V);
    const weightsOf = (i) => {
      // the eyes turn with their own bones
      if (part.name === "Eyes") return top4([[jointOf.get(P[i * 3] > 0 ? "LeftEye" : "RightEye"), 1]]);
      const r = p.refs[i];
      return top4(r.i.flatMap((v, k) => vw[v].map(([j, w]) => [j, w * r.w[k]])).filter(([, w]) => w > 0));
    };
    const morphs = targets.map((t) => {
      const P2 = fit(p, Float64Array.from(V, (x, i) => x + t.D[i]));
      return { ...t, D: Float64Array.from(P2, (x, i) => x - P[i]) };
    });
    const mhmat = p.material ? readMaterial(p.material) : {};
    const texRel = part.tex ?? (mhmat.diffuseTexture ? join(dirname(p.material), mhmat.diffuseTexture).slice(assets.length + 1) : null);
    const tex = texRel ? await prepTexture(join(assets, texRel), texRel, { grey: part.grey, desaturate: part.name === "Eyes" ? 0.45 : 0 }) : null;
    const material = { name: part.name, tex: part.name.toLowerCase(), rough: part.hair ? 0.7 : 0.8 };
    // hair: cut out (the page smooths the edges); eyebrows and eyelashes: blended over the skin
    if (part.hair) Object.assign(material, { alpha: "MASK", double: true, tint: "hair" });
    if (part.name === "Eyebrows") Object.assign(material, { alpha: "BLEND", double: true, tint: "brow" });
    if (part.name === "Eyelashes") Object.assign(material, { alpha: "BLEND", double: true });
    // the eyes: the clear part of their texture is the cornea over the iris
    if (part.name === "Eyes") Object.assign(material, { alpha: "MASK", rough: 0.15 });
    parts.push({ ...meshData(part.name, P, p.mesh.faces, p.mesh.vt, weightsOf, morphs), material, tex, hair: part.hair });
  }

  let height = 0;
  for (const p of parts) if (p.name === "Body" || p.name === `Hair_${HAIRS[0]}`) for (let i = 1; i < p.pos.length; i += 3) height = Math.max(height, p.pos[i]);

  // where this body's chest, head and hips frames sit, so the moves' points (written on the first
  // stand-in) land at the same places: the chest's front 0.155 m ahead of the chest frame, the eyes
  // 0.0872 m above and 0.083 m ahead of the head's, the hip joints' midpoint a little above the hips'
  const at = (name) => bones.get(name).head;
  const sp = at("Spine2");
  let front = -Infinity;
  for (const p of parts.filter((q) => q.name === "Body" || q.name === "Clothes"))
    for (let i = 0; i < p.pos.length; i += 3) if (Math.abs(p.pos[i]) < 0.04 && Math.abs(p.pos[i + 1] - sp[1]) < 0.03) front = Math.max(front, p.pos[i + 2]);
  const eyes = [0, 1, 2].map((c) => (at("LeftEye")[c] + at("RightEye")[c]) / 2);
  const legs = [0, 1, 2].map((c) => (at("LeftUpLeg")[c] + at("RightUpLeg")[c]) / 2);
  const r4 = (v) => v.map((x) => +x.toFixed(4));
  const frames = {
    chest: r4([0, 0, front - sp[2] - 0.155]),
    head: r4([0, eyes[1] - at("Head")[1] - 0.0872, eyes[2] - at("Head")[2] - 0.083]),
    hips: r4([legs[0] - at("Hips")[0], legs[1] - 0.0053 - at("Hips")[1], legs[2] + 0.0031 - at("Hips")[2]]),
  };
  return { sex, order, parts, frames, info: { sex, scale, height: +height.toFixed(3), ankle: +at("LeftFoot")[1].toFixed(4), frames } };
}

/** a glTF document with the skeleton and the named parts of a prepared figure */
export function docOf(prep, names) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("Scene").setExtras({ frames: prep.frames });
  doc.getRoot().setDefaultScene(scene);
  const nodes = new Map();
  const headOf = new Map(prep.order.map((b) => [b.name, b.head]));
  for (const b of prep.order) {
    const p = b.parent ? headOf.get(b.parent) : [0, 0, 0];
    const node = doc.createNode(b.name).setTranslation([b.head[0] - p[0], b.head[1] - p[1], b.head[2] - p[2]]);
    nodes.set(b.name, node);
    if (b.parent) nodes.get(b.parent).addChild(node);
    else scene.addChild(node);
  }
  const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
  const ibm = new Float32Array(prep.order.length * 16);
  prep.order.forEach((b, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.head[0], -b.head[1], -b.head[2], 1], i * 16));
  const skin = doc.createSkin("Skin").setSkeleton(nodes.get("Hips")).setInverseBindMatrices(acc("MAT4", ibm));
  for (const b of prep.order) skin.addJoint(nodes.get(b.name));

  for (const part of prep.parts.filter((p) => names.includes(p.name))) {
    const m = part.material;
    const mat = doc.createMaterial(m.name).setRoughnessFactor(m.rough).setMetallicFactor(0);
    if (part.tex) mat.setBaseColorTexture(doc.createTexture(m.tex).setImage(part.tex.png).setMimeType("image/png").setURI(`${m.tex}.png`));
    if (m.alpha === "MASK") mat.setAlphaMode("MASK").setAlphaCutoff(0.5);
    if (m.alpha === "BLEND") mat.setAlphaMode("BLEND");
    if (m.double) mat.setDoubleSided(true);
    // what the page tints, and the texture's own average colour to tint from
    if (m.tint) mat.setExtras({ tint: m.tint, mean: part.tex.mean });
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", acc("VEC3", part.pos))
      .setAttribute("NORMAL", acc("VEC3", part.nor))
      .setAttribute("TEXCOORD_0", acc("VEC2", part.uv))
      .setAttribute("JOINTS_0", acc("VEC4", part.joints))
      .setAttribute("WEIGHTS_0", acc("VEC4", part.weights))
      .setAttribute("_WELD", acc("SCALAR", part.weld))
      .setIndices(acc("SCALAR", part.index))
      .setMaterial(mat);
    for (const t of part.targets) {
      const target = doc.createPrimitiveTarget(t.name).setAttribute("POSITION", acc("VEC3", t.d));
      if (t.dn) target.setAttribute("NORMAL", acc("VEC3", t.dn));
      prim.addTarget(target);
    }
    const mesh = doc.createMesh(part.name).addPrimitive(prim);
    if (part.targets.length) mesh.setWeights(part.targets.map(() => 0)).setExtras({ targetNames: part.targets.map((t) => t.name) });
    const node = doc.createNode(part.name).setMesh(mesh).setSkin(skin);
    if (part.hair) node.setExtras({ hair: part.hair });
    scene.addChild(node);
  }
  return doc;
}

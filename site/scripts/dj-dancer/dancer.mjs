// 跟着跳's dancer: MakeHuman's realistic woman (CC0) as glTF, the way the accounts' figure is made
// (site/scripts/figure/), but one body dressed many ways. The body (with her eyes, brows, lashes and
// the expressions the page plays: blinking, smiling) is one file; each outfit another, its pieces on
// the same skeleton; each hairstyle another. The moves aren't in the files: the page solves them for
// this body (site/src/party/dj/dancer/).
//
// Most of what she wears is made from her own skin: the faces under a garment, lifted a few
// millimetres off it, skinned exactly as the skin is (so it can't come through, whatever she does),
// its outline cut by its texture's alpha. The rest is MakeHuman's own clothes, shoes and hair.
import { Document } from "@gltf-transform/core";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { addTarget, dense, fit, normalsOf, readObj, readProxy, readTarget } from "./mh.mjs";

/** how she's shaped: MakeHuman's targets and how much of each (MakeHuman's own words) */
export const SHAPE = {
  // a young adult woman, a little slimmer than average, East Asian
  macro: [
    ["macrodetails/universal-female-young-averagemuscle-averageweight", 0.7],
    ["macrodetails/universal-female-young-averagemuscle-minweight", 0.2],
    ["macrodetails/universal-female-young-maxmuscle-averageweight", 0.1],
    ["macrodetails/asian-female-young", 0.85],
    ["macrodetails/caucasian-female-young", 0.15],
    // MakeHuman's "ideal proportions", and a little taller (a smaller head for her height)
    ["macrodetails/proportions/female-young-averagemuscle-averageweight-idealproportions", 0.9],
    ["macrodetails/height/female-young-averagemuscle-averageweight-maxheight", 0.3],
  ],
  body: [
    ["breast/female-young-averagemuscle-averageweight-averagecup-maxfirmness", 0.5],
    ["breast/female-young-averagemuscle-averageweight-maxcup-averagefirmness", 0.25],
    ["torso/measure-waist-circ-decr", 0.35],
    ["buttocks/buttocks-volume-incr", 0.25],
    ["legs/upperlegs-height-incr", 0.15],
    ["neck/measure-neck-height-incr", 0.15],
  ],
  // the face: bigger eyes, a finer nose, fuller lips, a smaller V-shaped chin
  face: [
    ["eyes/*-eye-scale-incr", 0.25],
    ["nose/nose-scale-horiz-decr", 0.3],
    ["nose/nose-point-width-decr", 0.2],
    ["mouth/mouth-upperlip-volume-incr", 0.2],
    ["mouth/mouth-lowerlip-volume-incr", 0.15],
    ["chin/chin-width-decr", 0.25],
    ["head/head-invertedtriangular", 0.3],
    ["cheek/*-cheek-volume-decr", 0.15],
  ],
  race: { asian: 0.85, caucasian: 0.15 },
};

/** her height, soles to the crown, barefoot (metres) */
export const HEIGHT = 1.67;

export const SKIN = "skins/young_asian_female/young_lightskinned_female_diffuse3.png";
export const EYES = "eyes/high-poly/high-poly.mhclo";
export const EYE_TEXTURE = "eyes/materials/brown_eye.png";
export const EYEBROWS = "eyebrows/eyebrow010/eyebrow010.mhclo";
export const EYELASHES = "eyelashes/eyelashes02/eyelashes02.mhclo";
export const HAIRS = ["long01", "ponytail01"];

/** the expressions the page plays (MakeHuman's expression units, blended by race like the face) */
export const EXPRESSIONS = {
  blinkL: ["eye-left-closure"],
  blinkR: ["eye-right-closure"],
  smile: ["mouth-corner-puller"],
};

const both = (rel) => (rel.includes("*") ? ["l", "r"].map((s) => rel.replace("*", s)) : [rel]);

/**
 * Shapes her and fits everything she can wear: slow (the targets and fittings), then the
 * documents are made from what this returns.
 */
export function prepareDancer({ mpfb, assets, clothes = [] }) {
  const T = (rel) => join(mpfb, "targets", `${rel}.target.gz`);
  const base = readObj(join(mpfb, "3dobjs/base.obj"));
  const n = base.v.length / 3;
  const groups = JSON.parse(readFileSync(join(mpfb, "mesh_metadata/basemesh_vertex_groups.json"), "utf8"));
  const groupIdx = (name) => groups[name].flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k));

  // 1. the body
  const V = Float64Array.from(base.v);
  for (const [rel, w] of [...SHAPE.macro, ...SHAPE.body]) {
    const f = T(rel);
    if (!existsSync(f)) throw new Error(`no target ${rel}`);
    addTarget(V, readTarget(f), w);
  }
  for (const [rel, w] of SHAPE.face) for (const r of both(rel)) addTarget(V, readTarget(T(r)), w);

  // 1b. modest at every turn: the nipples smoothed into the breasts' curve, the crotch's crease filled
  // (whatever she wears covers them; this is so nothing shows if a garment ever doesn't)
  const tips = modest(V, base.faces.filter((f) => f.g === "body"), groupIdx("body"));

  // 2. the expressions, as dense deltas
  const targets = [];
  for (const [id, units] of Object.entries(EXPRESSIONS)) {
    const list = [];
    for (const u of units) for (const [race, w] of Object.entries(SHAPE.race)) list.push([readTarget(T(`expression/units/${race}/${u}`)), w]);
    targets.push({ name: `X_${id}`, D: dense(n, list), normals: true });
  }

  // 3. metres: soles at 0, HEIGHT to the crown
  const body = groupIdx("body");
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of body) {
    lo = Math.min(lo, V[v * 3 + 1]);
    hi = Math.max(hi, V[v * 3 + 1]);
  }
  const scale = HEIGHT / (hi - lo);
  const ground = lo;
  const toM = (p) => [p[0] * scale, (p[1] - ground) * scale, p[2] * scale];
  const meanOf = (idx, W = V) => {
    const p = [0, 0, 0];
    for (const i of idx) for (let c = 0; c < 3; c++) p[c] += W[i * 3 + c] / idx.length;
    return p;
  };

  // 4. the skeleton: MPFB's Mixamo rig where the shaped body puts its joints, and a bone for each eye
  const rigJson = JSON.parse(readFileSync(join(mpfb, "rigs/standard/rig.mixamo.json"), "utf8")).bones;
  const strip = (s) => s.replace(/^mixamorig:/, "");
  const bones = new Map();
  for (const [full, b] of Object.entries(rigJson)) {
    const spec = b.head;
    const idx = spec.strategy === "CUBE" ? groupIdx(spec.cube_name) : spec.vertex_indices;
    bones.set(strip(full), { name: strip(full), parent: b.parent ? strip(b.parent) : null, head: toM(meanOf(idx)), idx });
  }
  for (const [side, s] of [["Left", "l"], ["Right", "r"]]) {
    const idx = groupIdx(`helper-${s}-eye`);
    bones.set(`${side}Eye`, { name: `${side}Eye`, parent: "Head", head: toM(meanOf(idx)), idx });
  }
  const order = [];
  const visit = (b) => {
    if (order.includes(b)) return;
    if (b.parent) visit(bones.get(b.parent));
    order.push(b);
  };
  [...bones.values()].sort((a, b) => (a.name < b.name ? -1 : 1)).forEach(visit);
  const jointOf = new Map(order.map((b, i) => [b.name, i]));

  // 5. skin weights for every base vertex (helpers too: the clothes hang on them)
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
  /** each base vertex's main bone (its name) */
  const mainBone = vw.map((list) => (list.length ? order[list.reduce((a, b) => (b[1] > a[1] ? b : a))[0]].name : null));

  // 6. what she can wear, fitted: eyes, brows, lashes, the hairstyles, the clothes the outfits use
  const proxy = (rel) => readProxy(join(assets, rel));
  const wear = new Map();
  wear.set("Eyes", { proxy: proxy(EYES) });
  wear.set("Eyebrows", { proxy: proxy(EYEBROWS) });
  wear.set("Eyelashes", { proxy: proxy(EYELASHES) });
  for (const h of HAIRS) wear.set(`Hair_${h}`, { proxy: proxy(`hair/${h}/${h}.mhclo`), hair: h });
  for (const rel of clothes) if (!wear.has(rel)) wear.set(rel, { proxy: proxy(rel) });
  for (const w of wear.values()) w.P = fit(w.proxy, V);

  // the body's faces, its points in metres and its normals at rest
  const bodyFaces = base.faces.filter((f) => f.g === "body");
  const PM = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) PM.set(toM([V[i * 3], V[i * 3 + 1], V[i * 3 + 2]]), i * 3);
  const NM = normalsOf(PM, bodyFaces);

  return { base, n, V, PM, NM, groups, groupIdx, bodyFaces, targets, scale, ground, toM, bones, order, jointOf, vw, top4, mainBone, wear, assets, mpfb, tips };
}

/** the sphere nearest some points (least squares): its centre and radius */
function sphereFit(pts) {
  // |p|² = 2 p·c + d, d = r² - |c|²
  const A = Array.from({ length: 4 }, () => [0, 0, 0, 0]);
  const b = [0, 0, 0, 0];
  for (const p of pts) {
    const row = [2 * p[0], 2 * p[1], 2 * p[2], 1];
    const y = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
    for (let i = 0; i < 4; i++) {
      b[i] += row[i] * y;
      for (let j = 0; j < 4; j++) A[i][j] += row[i] * row[j];
    }
  }
  // Gaussian elimination
  for (let i = 0; i < 4; i++) {
    let m = i;
    for (let k = i + 1; k < 4; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k;
    [A[i], A[m]] = [A[m], A[i]];
    [b[i], b[m]] = [b[m], b[i]];
    for (let k = i + 1; k < 4; k++) {
      const f = A[k][i] / A[i][i];
      for (let j = i; j < 4; j++) A[k][j] -= f * A[i][j];
      b[k] -= f * b[i];
    }
  }
  const x = [0, 0, 0, 0];
  for (let i = 3; i >= 0; i--) {
    let t = b[i];
    for (let j = i + 1; j < 4; j++) t -= A[i][j] * x[j];
    x[i] = t / A[i][i];
  }
  const c = [x[0], x[1], x[2]];
  return { c, r: Math.sqrt(x[3] + c[0] * c[0] + c[1] * c[1] + c[2] * c[2]) };
}

/**
 * The body made modest, in MakeHuman's units (V changed in place): each nipple (the breast's most
 * forward point) and the skin round it laid onto the sphere that fits the breast just around it;
 * the crotch's crease evened out with its neighbours (its edge kept).
 */
function modest(V, faces, body) {
  const tips = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of body) {
    lo = Math.min(lo, V[v * 3 + 1]);
    hi = Math.max(hi, V[v * 3 + 1]);
  }
  // a metre in these units, near enough (her height is about HEIGHT)
  const m = (hi - lo) / HEIGHT;
  const P = (v) => [V[v * 3], V[v * 3 + 1], V[v * 3 + 2]];
  for (const s of [1, -1]) {
    let tip = -1;
    for (const v of body) {
      const x = s * V[v * 3];
      const y = (V[v * 3 + 1] - lo) / m;
      if (x < 0.03 * m || x > 0.16 * m || y < 1.1 || y > 1.35) continue;
      if (tip < 0 || V[v * 3 + 2] > V[tip * 3 + 2]) tip = v;
    }
    tips.push(tip);
    const t = P(tip);
    const d = (v) => Math.hypot(V[v * 3] - t[0], V[v * 3 + 1] - t[1], V[v * 3 + 2] - t[2]) / m;
    const ring = body.filter((v) => d(v) > 0.024 && d(v) < 0.05).map(P);
    const { c, r } = sphereFit(ring);
    for (const v of body) {
      const dv = d(v);
      if (dv > 0.03) continue;
      // fully onto the sphere inside 2.2 cm, blending back to the skin by 3
      const k = dv < 0.022 ? 1 : 1 - (dv - 0.022) / 0.008;
      const p = P(v);
      const u = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      const l = Math.hypot(...u) || 1;
      for (let i = 0; i < 3; i++) V[v * 3 + i] = p[i] + (c[i] + (u[i] / l) * r - p[i]) * k;
    }
  }
  // the crotch: the lowest point of the middle, and the front of the body just above it
  let cr = -1;
  for (const v of body) {
    if (Math.abs(V[v * 3]) > 0.004 * m) continue;
    const y = (V[v * 3 + 1] - lo) / m;
    if (y < 0.4 || y > 1.0) continue;
    if (cr < 0 || V[v * 3 + 1] < V[cr * 3 + 1]) cr = v;
  }
  const c0 = P(cr);
  const region = new Set(
    body.filter((v) => {
      const x = Math.abs(V[v * 3]) / m;
      const dy = (V[v * 3 + 1] - c0[1]) / m;
      return x < 0.04 && dy > -0.02 && dy < 0.075;
    }),
  );
  const nb = new Map();
  for (const f of faces)
    for (let k = 0; k < f.v.length; k++) {
      const a = f.v[k];
      const b = f.v[(k + 1) % f.v.length];
      if (region.has(a)) (nb.get(a) ?? nb.set(a, new Set()).get(a)).add(b);
      if (region.has(b)) (nb.get(b) ?? nb.set(b, new Set()).get(b)).add(a);
    }
  // the region's own edge stays: only points all of whose neighbours are in it move
  const inner = [...region].filter((v) => [...(nb.get(v) ?? [])].every((u) => region.has(u)));
  for (let it = 0; it < 30; it++) {
    const next = inner.map((v) => {
      const ns = nb.get(v);
      const mean = [0, 0, 0];
      for (const u of ns) for (let i = 0; i < 3; i++) mean[i] += V[u * 3 + i] / ns.size;
      return mean;
    });
    inner.forEach((v, j) => {
      for (let i = 0; i < 3; i++) V[v * 3 + i] = V[v * 3 + i] * 0.5 + next[j][i] * 0.5;
    });
  }
  return tips;
}

/**
 * One mesh's arrays for the file: positions P (its own vertices, metres), faces (UV indices into
 * vt), each vertex's weights, the targets as deltas over the base mesh's vertices (`src` maps).
 * glTF wants one vertex per (vertex, uv) pair; `weld` keeps which vertex each came from.
 */
export function meshData(prep, name, P, faces, vt, weightsOf, morphs = [], { welds = null } = {}) {
  const N = normalsOf(P, faces);
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
    pos.set([P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]], i * 3);
    nor.set([N[vi * 3], N[vi * 3 + 1], N[vi * 3 + 2]], i * 3);
    const w = weightsOf(vi);
    joints.set(w.map((x) => x[0]), i * 4);
    weights.set(w.map((x) => x[1]), i * 4);
    weld[i] = welds ? welds[vi] : vi;
  });
  const targetsOut = [];
  for (const t of morphs) {
    const d = new Float32Array(m * 3);
    let any = false;
    src.forEach((vi, i) => {
      for (let c = 0; c < 3; c++) {
        const x = t.D[vi * 3 + c];
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
}

/** a proxy's targets as deltas over its own vertices, in metres (it fitted to the body each moves) */
export function proxyMorphs(prep, p, P0m) {
  return prep.targets.map((t) => {
    const P2 = fit(p, Float64Array.from(prep.V, (x, i) => x + t.D[i]));
    const D = new Float64Array(P2.length);
    for (let i = 0; i < P2.length; i++) D[i] = P2[i] * prep.scale - (i % 3 === 1 ? prep.ground * prep.scale : 0) - P0m[i];
    return { ...t, D };
  });
}

/** the body's targets in metres */
export const bodyMorphs = (prep) => prep.targets.map((t) => ({ ...t, D: t.D.map((x) => x * prep.scale) }));

/** a proxy's fitted points in metres */
export function proxyMetres(prep, P) {
  const out = new Float64Array(P.length);
  for (let i = 0; i < P.length; i += 3) out.set(prep.toM([P[i], P[i + 1], P[i + 2]]), i);
  return out;
}

/**
 * A cloth's weights: each point takes the weights of the nearest skin vertex, then each point's
 * weights are evened with its neighbours' a few times (the accounts' figure does the same: MakeHuman's
 * way, from the few helper vertices each point hangs on, tears the sleeves when an arm comes forward).
 */
export function clothWeights(prep, Pm, faces, rounds = 8) {
  const body = prep.groupIdx("body");
  const m = Pm.length / 3;
  const near = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    let best = Infinity;
    let bi = 0;
    const x = Pm[i * 3], y = Pm[i * 3 + 1], z = Pm[i * 3 + 2];
    for (const v of body) {
      const dx = prep.PM[v * 3] - x, dy = prep.PM[v * 3 + 1] - y, dz = prep.PM[v * 3 + 2] - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) {
        best = d;
        bi = v;
      }
    }
    near[i] = bi;
  }
  let w = Array.from({ length: m }, (_, i) => new Map(prep.vw[near[i]].map(([j, x]) => [j, x])));
  const nb = Array.from({ length: m }, () => new Set());
  for (const f of faces) for (let k = 0; k < f.v.length; k++) for (let q = 0; q < f.v.length; q++) if (k !== q) nb[f.v[k]].add(f.v[q]);
  for (let it = 0; it < rounds; it++) {
    w = w.map((own, i) => {
      const out = new Map();
      for (const [j, x] of own) out.set(j, x * 0.5);
      const k = nb[i].size;
      if (!k) return own;
      for (const o of nb[i]) for (const [j, x] of w[o]) out.set(j, (out.get(j) ?? 0) + (x * 0.5) / k);
      return out;
    });
  }
  return w.map((x) => [...x.entries()].sort((a, b) => a[0] - b[0]));
}

/** a glTF document with the skeleton and these parts ({ ...meshData, material, tex }) */
export function docOf(prep, parts, extras = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("Scene").setExtras(extras);
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

  const textures = new Map();
  const tex = (key, t) => {
    if (!t) return null;
    if (!textures.has(key)) textures.set(key, doc.createTexture(key).setImage(t).setMimeType("image/png").setURI(`${key}.png`));
    return textures.get(key);
  };
  for (const part of parts) {
    const m = part.material;
    const mat = doc.createMaterial(m.name).setRoughnessFactor(m.rough ?? 0.8).setMetallicFactor(m.metal ?? 0);
    if (m.color) mat.setBaseColorFactor(m.color);
    const base = tex(m.tex ?? m.name.toLowerCase(), part.tex?.png);
    if (base) mat.setBaseColorTexture(base);
    const orm = tex(`${m.tex ?? m.name.toLowerCase()}_orm`, part.tex?.orm);
    if (orm) mat.setMetallicRoughnessTexture(orm);
    const nrm = tex(`${m.tex ?? m.name.toLowerCase()}_nrm`, part.tex?.nrm);
    if (nrm) mat.setNormalTexture(nrm);
    if (m.alpha === "MASK") mat.setAlphaMode("MASK").setAlphaCutoff(m.cutoff ?? 0.5);
    if (m.alpha === "BLEND") mat.setAlphaMode("BLEND");
    if (m.double) mat.setDoubleSided(true);
    const ex = {};
    if (m.tint) Object.assign(ex, { tint: m.tint, mean: part.tex?.mean ?? [0.5, 0.5, 0.5] });
    if (m.kind) ex.kind = m.kind;
    if (m.sheen) ex.sheen = m.sheen;
    if (m.clearcoat) ex.clearcoat = m.clearcoat;
    if (Object.keys(ex).length) mat.setExtras(ex);
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
    for (const t of part.targets ?? []) {
      const target = doc.createPrimitiveTarget(t.name).setAttribute("POSITION", acc("VEC3", t.d));
      if (t.dn) target.setAttribute("NORMAL", acc("VEC3", t.dn));
      prim.addTarget(target);
    }
    const mesh = doc.createMesh(part.name).addPrimitive(prim);
    if (part.targets?.length) mesh.setWeights(part.targets.map(() => 0)).setExtras({ targetNames: part.targets.map((t) => t.name) });
    const node = doc.createNode(part.name).setMesh(mesh).setSkin(skin);
    if (part.extras) node.setExtras(part.extras);
    scene.addChild(node);
  }
  return doc;
}


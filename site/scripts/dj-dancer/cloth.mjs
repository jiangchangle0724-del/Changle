// The cloths her garments are made of: each a function of where a texel lies on her (metres, at
// rest) writing its colour (linear RGB), and for some its roughness and metalness, so a pattern runs
// on over the texture's seams. Made here, nothing downloaded.
import { cells, fbm, hexLin, noise3 } from "./mh.mjs";

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** a plain cloth, a little uneven (knit or woven: `grain`, metres) */
export function solid(hex, { grain = 0.004, vary = 0.06 } = {}) {
  const c = hexLin(hex);
  return (q, out) => {
    const k = 1 + vary * (fbm(q.p[0] / grain, q.p[1] / grain, q.p[2] / grain, 2, 7) - 0.5) * 2;
    out.rgb = [c[0] * k, c[1] * k, c[2] * k];
  };
}

/** a smooth satin or silk: plain, with a faint long sheen running through it */
export function satin(hex, { vary = 0.12 } = {}) {
  const c = hexLin(hex);
  return (q, out) => {
    const k = 1 + vary * (noise3(q.p[0] * 9, q.p[1] * 3, q.p[2] * 9, 3) - 0.5) * 2;
    out.rgb = [c[0] * k, c[1] * k, c[2] * k];
  };
}

/** velvet: deep, a little mottled */
export function velvet(hex) {
  const c = hexLin(hex);
  return (q, out) => {
    const k = 0.85 + 0.3 * fbm(q.p[0] * 60, q.p[1] * 60, q.p[2] * 60, 3, 11);
    out.rgb = [c[0] * k, c[1] * k, c[2] * k];
  };
}

/** sequins, `size` metres across, each catching the light its own way (sets roughness and metalness) */
export function sequins(hex, { size = 0.006, gap = "#1a1418" } = {}) {
  const c = hexLin(hex);
  const g = hexLin(gap);
  return (q, out) => {
    const s = cells(q.p[0] / size, q.p[1] / size, q.p[2] / size, 5);
    const edge = s.d2 - s.d1;
    const on = sstep(0.05, 0.16, edge);
    const glint = 0.8 + 0.4 * s.id;
    out.rgb = mixc(g, [c[0] * glint, c[1] * glint, c[2] * glint], on);
    out.rough = 0.16 + 0.3 * (1 - on) + 0.2 * s.id;
    out.metal = 0.85 * on;
  };
}

/** stripes along her height (or around: `across`), `width` metres each, two colours */
export function stripes(a, b, { width = 0.012, across = false } = {}) {
  const ca = hexLin(a);
  const cb = hexLin(b);
  return (q, out) => {
    const t = across ? q.p[0] : q.p[1];
    const s = Math.sin((Math.PI * t) / width);
    out.rgb = mixc(ca, cb, sstep(-0.08, 0.08, s));
  };
}

/** dots on a ground */
export function dots(ground, dot, { every = 0.03, r = 0.007 } = {}) {
  const cg = hexLin(ground);
  const cd = hexLin(dot);
  return (q, out) => {
    const x = q.p[0] / every, y = q.p[1] / every, z = q.p[2] / every;
    // a lattice offset each row, so the dots don't line up in columns
    const yi = Math.floor(y);
    const xo = yi % 2 ? 0.5 : 0;
    const dx = x + xo - Math.round(x + xo), dy = y - yi - 0.5, dz = z - Math.round(z);
    const d = Math.hypot(dx, dy, dz) * every;
    out.rgb = mixc(cd, cg, sstep(r * 0.85, r * 1.1, d));
  };
}

/** a leopard print: dark broken rings round warmer middles */
export function leopard({ ground = "#c8954f", ring = "#2a1a10", inner = "#9a5f2c", size = 0.028 } = {}) {
  const cg = hexLin(ground), cr = hexLin(ring), ci = hexLin(inner);
  return (q, out) => {
    const w = 0.35 * (fbm(q.p[0] * 40, q.p[1] * 40, q.p[2] * 40, 2, 3) - 0.5);
    const s = cells(q.p[0] / size + w, q.p[1] / size + w, q.p[2] / size, 9);
    const r = s.d1;
    // a broken ring: gaps where the noise says
    const broken = fbm(q.p[0] * 70, q.p[1] * 70, q.p[2] * 70, 2, 13) > 0.62;
    let c = cg;
    if (r < 0.28) c = mixc(cg, ci, 0.8);
    if (r > 0.25 && r < 0.4 && !broken) c = cr;
    out.rgb = mixc(c, cg, 0.08 * fbm(q.p[0] * 300, q.p[1] * 300, q.p[2] * 300, 2, 1));
  };
}

/**
 * A flower print (for a qipao, a summer bikini): five-petalled flowers, each with a little leaf,
 * scattered over a ground.
 */
export function flowers({ ground, petal, center = "#f2d36b", leaf = null, size = 0.05, gold = null } = {}) {
  const cg = hexLin(ground), cp = hexLin(petal), cc = hexLin(center), cl = leaf ? hexLin(leaf) : null;
  const cgold = gold ? hexLin(gold) : null;
  return (q, out) => {
    const s = cells(q.p[0] / size, q.p[1] / size, q.p[2] / size, 21);
    // the flower's face: on the plane across her surface, roughly (x, y, or z off the normal)
    const d = [q.p[0] / size - s.c[0], q.p[1] / size - s.c[1], q.p[2] / size - s.c[2]];
    const n = q.n;
    // two axes across the surface
    let ax = Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [1, 0, 0];
    const al = Math.hypot(...ax) || 1;
    ax = ax.map((v) => v / al);
    const ay = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
    const u = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2];
    const v = d[0] * ay[0] + d[1] * ay[1] + d[2] * ay[2];
    const r = Math.hypot(u, v);
    const th = Math.atan2(v, u) + s.id * 6.283;
    // not every cell has a flower, and none fills its cell
    if (s.id < 0.3) {
      out.rgb = cg;
      return;
    }
    const scaleF = 0.3 + 0.18 * s.id;
    const petalR = scaleF * (0.5 + 0.5 * Math.abs(Math.cos(2.5 * th)));
    let c = cg;
    if (cl) {
      // a leaf off to one side
      const lu = u - 0.42 * scaleF, lv = v + 0.2 * scaleF;
      const leafIn = (lu * lu) / 0.06 + (lv * lv) / 0.012 < scaleF * scaleF;
      if (leafIn) c = cl;
    }
    if (r < petalR) c = mixc(cp, [cp[0] * 0.75, cp[1] * 0.75, cp[2] * 0.75], r / petalR);
    if (cgold && Math.abs(r - petalR) < 0.035 && r < petalR + 0.035) c = cgold;
    if (r < 0.14 * scaleF) c = cc;
    out.rgb = c;
  };
}

/** denim: a twill of blue threads, worn lighter where cloth stretches */
export function denim(hex = "#3a5a8c") {
  const c = hexLin(hex);
  return (q, out) => {
    const tw = Math.sin((q.p[1] + q.p[0] * 0.6 + q.p[2] * 0.6) * 2200) * 0.5 + 0.5;
    const k = 0.85 + 0.2 * tw + 0.25 * (fbm(q.p[0] * 12, q.p[1] * 12, q.p[2] * 12, 3, 4) - 0.5);
    out.rgb = [c[0] * k, c[1] * k, c[2] * k];
  };
}

/** a fluffy white trim (Santa's): bright, softly uneven */
export function fur(hex = "#f4f1ec") {
  const c = hexLin(hex);
  return (q, out) => {
    const k = 0.78 + 0.3 * fbm(q.p[0] * 260, q.p[1] * 260, q.p[2] * 260, 3, 31);
    out.rgb = [c[0] * k, c[1] * k, c[2] * k];
  };
}

/** a metal (gold chain, buckles): a little uneven */
export function metal(hex = "#d4af37") {
  const c = hexLin(hex);
  return (q, out) => {
    const k = 0.85 + 0.3 * noise3(q.p[0] * 400, q.p[1] * 400, q.p[2] * 400, 41);
    out.rgb = [c[0] * k, c[1] * k, c[2] * k];
    out.rough = 0.25;
    out.metal = 1;
  };
}

/** a sheer cloth (tights): its colour, and how much of the skin it hides */
export function sheer(hex, opacity = 0.55) {
  const c = hexLin(hex);
  return (q, out) => {
    out.rgb = c;
    out.a = opacity;
  };
}

/** one cloth here, another there: pick(q) says which (0, 1, …) */
export function by(pick, ...cloths) {
  return (q, out) => cloths[pick(q)](q, out);
}

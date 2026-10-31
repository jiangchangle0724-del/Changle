// The head, in its own coordinates: the middle of the skull at 0,0, a skull 56 across each way
// (R), the chin some 55 below. Eyes sit low and big (a chibi face is mostly eyes), the nose is a
// stroke, the mouth small. Everything takes the skin's own shadow and line colors.
import type { AvatarCfg } from "./cfg";
import { circle, ellipse, g, ink, mix, n, p, path, qpts, seeded, shade, smooth, sym, taper, tint, type Pt, type Seg } from "./draw";

export const R = 56;

/** The face's outline numbers: temple, cheek (y and half-width), jaw, chin. */
const FACE_GEOM = {
  oval: { cy: 16, cw: 54, jy: 37, jw: 41, chy: 57, chr: 9 },
  round: { cy: 16, cw: 55.5, jy: 37, jw: 47, chy: 55, chr: 17 },
  heart: { cy: 15, cw: 55, jy: 35, jw: 35, chy: 59, chr: 4 },
  square: { cy: 16, cw: 55, jy: 41, jw: 48, chy: 56, chr: 7 },
  long: { cy: 17, cw: 52.5, jy: 44, jw: 40, chy: 63, chr: 9 },
} as const;

export type FaceGeom = (typeof FACE_GEOM)[keyof typeof FACE_GEOM];
export const faceGeom = (c: AvatarCfg): FaceGeom => FACE_GEOM[c.face];

/** The whole head's outline (skull and face): what the skin fills. */
export function headPath(f: FaceGeom, dx = 0, dy = 0): string {
  const k = 0.552 * R;
  const segs: Seg[] = [
    [
      [-k, -R],
      [-R, -k],
      [-R, 0],
    ],
    [
      [-R, f.cy * 0.5],
      [-f.cw, f.cy - 6],
      [-f.cw, f.cy],
    ],
    [
      [-f.cw, f.cy + 11],
      [-f.jw - 6, f.jy - 9],
      [-f.jw, f.jy],
    ],
    [
      [-f.jw + 6, f.jy + 10],
      [-f.chr * 1.7, f.chy],
      [0, f.chy],
    ],
  ];
  return sym([0, -R], segs, dx, dy);
}

/** Just the lower face, from cheek to cheek under the eyes (where a beard grows). */
function jawBand(f: FaceGeom, inset: number): string {
  const L: Pt[] = [
    [-f.cw + 1, f.cy + 2],
    [-f.cw + 2, f.cy + 14],
    [-f.jw, f.jy],
    [-f.chr * 1.4, f.chy - 2],
    [0, f.chy],
  ];
  const outer = [
    ...L,
    ...L.slice(0, -1)
      .reverse()
      .map(([x, y]) => [-x, y] as Pt),
  ];
  const innerL: Pt[] = [
    [-f.cw + 1 + inset, f.cy + 4],
    [-f.jw + inset * 0.7, f.jy - inset * 0.6],
    [0, f.chy - inset],
  ];
  const inner = [
    ...innerL,
    ...innerL
      .slice(0, -1)
      .reverse()
      .map(([x, y]) => [-x, y] as Pt),
  ];
  return smooth([...outer, ...inner.reverse()], true, 0.14);
}

export type Skin = { base: string; shade: string; line: string; blush: string };

export function skinColors(base: string, sh: string, line: string, light: number): Skin {
  // (a light skin flushes pink; a deep one warmer and less of it shows)
  const blush = light > 0.55 ? "#ff8f9e" : light > 0.35 ? "#f07a6e" : "#d4604f";
  return { base, shade: sh, line, blush };
}

/** The ears, behind the face's edge. */
export function ears(s: Skin): string {
  let out = "";
  for (const side of [-1, 1]) {
    const x = side * (R - 4);
    const d = `M${p(x, 4)}C${p(x + side * 9, 0)} ${p(x + side * 13, 10)} ${p(x + side * 10, 20)}C${p(x + side * 8, 27)} ${p(x + side * 3, 29)} ${p(x - side * 1, 26)}Z`;
    out += path(d, { fill: s.base, stroke: s.line, "stroke-width": 2, "stroke-linejoin": "round" });
    out += path(`M${p(x + side * 4, 9)}C${p(x + side * 8, 10)} ${p(x + side * 8, 17)} ${p(x + side * 5, 21)}`, {
      fill: "none",
      stroke: s.shade,
      "stroke-width": 2.2,
      "stroke-linecap": "round",
    });
  }
  return out;
}

/** The face: skin, the shade under the jaw, cheeks. */
export function face(c: AvatarCfg, s: Skin, f: FaceGeom, id: string): string {
  let out = path(headPath(f), { fill: s.base, stroke: s.line, "stroke-width": 2.3, "stroke-linejoin": "round" });
  if (c.blush || c.mouth === "shy") {
    const big = c.mouth === "shy" ? 1.25 : 1;
    for (const side of [-1, 1]) out += ellipse(side * 33, 41, 10.5 * big, 5.6 * big, { fill: `url(#${id}-blush)` });
    if (c.mouth === "shy")
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const x = side * (28 + i * 4.5);
          out += path(`M${p(x - 1.6, 43)}L${p(x + 1.6, 38.5)}`, { stroke: mix(s.blush, s.line, 0.35), "stroke-width": 1.2, "stroke-linecap": "round", opacity: 0.8 });
        }
  }
  if (c.freckles) {
    const r = seeded(17);
    for (const side of [-1, 1])
      for (let i = 0; i < 7; i++) {
        const x = side * (22 + r() * 16);
        const y = 35 + r() * 8;
        out += circle(x, y, 0.85 + r() * 0.4, { fill: mix(s.shade, s.line, 0.45), opacity: 0.75 });
      }
  }
  if (c.mole) out += circle(14, 50, 1.2, { fill: mix(s.line, "#000000", 0.3) });
  return out;
}

const EYE = {
  round: { w: 15, h: 38, tilt: 0, lower: 1, lid: 0, crease: true },
  almond: { w: 15.5, h: 34, tilt: 3, lower: 0.9, lid: 0, crease: true },
  droopy: { w: 15.5, h: 34, tilt: -5, lower: 0.92, lid: 0, crease: true },
  sharp: { w: 16, h: 30, tilt: 7, lower: 0.78, lid: 0, crease: false },
  narrow: { w: 16.5, h: 25, tilt: 2.5, lower: 0.7, lid: 0.08, crease: false },
  sleepy: { w: 15.5, h: 34, tilt: 0, lower: 0.9, lid: 0.36, crease: true },
} as const;

export const EYE_Y = 22;
export const EYE_X = 24.5;

/** The eyes' outer box (for glasses and brows): half-width and top. */
export function eyeBox(c: AvatarCfg) {
  const e = EYE[c.eyes];
  return { w: e.w, top: EYE_Y - e.h / 2 + e.lid * e.h, h: e.h };
}

/**
 * One eye, anime-sized: an opening most of which is iris, a heavy lash line along the top with a
 * flick at the outer corner, light in the bottom of the iris and two highlights from one light.
 * `side` -1 is the eye on the left of the picture; its outer corner is to the left.
 */
function eye(c: AvatarCfg, side: -1 | 1, id: string, iris: string, lineCol: string): string {
  const e = EYE[c.eyes];
  const cx = side * EYE_X;
  const cy = EYE_Y;
  const X = (u: number) => cx + side * u;
  const top = cy - e.h / 2 + e.lid * e.h;
  const low = cy + (e.h / 2) * e.lower;
  const outerY = cy - e.tilt - e.h * 0.05;
  const inner: Pt = [X(-e.w * 0.95), cy + e.h * 0.1];
  const outer: Pt = [X(e.w), outerY];
  const upper: Pt[] = [inner, [X(-e.w * 0.62), top + e.h * 0.1], [X(-e.w * 0.05), top], [X(e.w * 0.6), top + (outerY - top) * 0.32], outer];
  if (c.mouth === "wink" && side === -1) {
    // a wink: the lid shut in a happy arc
    const line = qpts([inner[0], cy + 4], [cx, cy - e.h * 0.32], [outer[0], cy + 3], 8);
    return path(taper(line, 1.8, 3.6), { fill: lineCol });
  }
  const lower: Pt[] = [outer, [X(e.w * 0.62), low - e.h * 0.12], [X(0), low], [X(-e.w * 0.6), low - e.h * 0.16]];
  const opening = smooth([...upper, ...lower.slice(1)], true, 0.17);
  const clip = `${id}-eye${side < 0 ? "l" : "r"}`;
  const irisCx = X(-e.w * 0.06);
  const irisCy = cy + e.h * 0.09 + e.lid * e.h * 0.25;
  const rx = Math.max(e.w * 0.8, 12);
  const ry = Math.max(e.h * 0.52, 15);
  let out = `<clipPath id="${clip}"><path d="${opening}"/></clipPath>`;
  out += path(opening, { fill: "#fdfcff" });
  let inside = ellipse(irisCx, irisCy, rx, ry, { fill: `url(#${id}-iris)` });
  inside += ellipse(irisCx, irisCy, rx, ry, { fill: "none", stroke: shade(iris, 0.55), "stroke-width": 1.1 });
  inside += ellipse(irisCx, irisCy - ry * 0.04, rx * 0.4, ry * 0.46, { fill: shade(iris, 0.7) });
  // light pooling in the bottom of the iris
  inside += path(
    `M${p(irisCx - rx * 0.78, irisCy + ry * 0.2)}Q${p(irisCx, irisCy + ry * 1.12)} ${p(irisCx + rx * 0.78, irisCy + ry * 0.2)}Q${p(irisCx, irisCy + ry * 0.62)} ${p(irisCx - rx * 0.78, irisCy + ry * 0.2)}Z`,
    { fill: mix(iris, "#ffc98a", 0.5), opacity: 0.7 },
  );
  // the lid's shadow across the top of the eye
  inside += path(
    `${smooth(
      upper.map(([x, y]) => [x, y + 6.5] as Pt),
      false,
      0.17,
    )}L${p(outer[0], outer[1] - 30)}L${p(inner[0], inner[1] - 30)}Z`,
    { fill: shade(iris, 0.8), opacity: 0.38 },
  );
  // (the highlights sit on the same side in both eyes: one light)
  inside += ellipse(irisCx - rx * 0.36, irisCy - ry * 0.3, 4.4, 5.6, { fill: "#ffffff" });
  inside += ellipse(irisCx + rx * 0.38, irisCy + ry * 0.32, 2.1, 2.4, { fill: "#ffffff", opacity: 0.92 });
  inside += circle(irisCx - rx * 0.05, irisCy - ry * 0.52, 1.1, { fill: "#ffffff", opacity: 0.8 });
  out += `<g clip-path="url(#${clip})">${inside}</g>`;
  // the crease above a rounder eye
  if (e.crease && !e.lid)
    out += path(
      smooth(
        upper.slice(1, 4).map(([x, y]) => [x + side * 1.5, y - 4.5] as Pt),
        false,
        0.2,
      ),
      { fill: "none", stroke: lineCol, "stroke-width": 1.1, opacity: 0.4, "stroke-linecap": "round" },
    );
  // the lash line along the top, with a flick past the outer corner
  const lash = [...qpts(upper[0], upper[1], upper[2], 4), ...qpts(upper[2], upper[3], upper[4], 4).slice(1), [X(e.w * 1.24), outerY - 4.2] as Pt];
  out += path(taper(lash, 1.5, 4.2), { fill: lineCol });
  if (c.lashes)
    for (const [u, len, lift] of [
      [0.72, 5.2, 0.9],
      [1.04, 5.8, 0.5],
    ] as const) {
      const bx = X(e.w * u);
      const by = top + (outerY - top) * (u > 1 ? 1 : 0.62) - 1;
      out += path(`M${p(bx, by)}Q${p(X(e.w * u + len * 0.5), by - len * lift)} ${p(X(e.w * u + len), by - len * lift * 0.6 - 1.5)}`, {
        fill: "none",
        stroke: lineCol,
        "stroke-width": 1.7,
        "stroke-linecap": "round",
      });
    }
  // the lower lid: a touch at the outer corner
  out += path(`M${p(...lower[0])}Q${p(lower[1][0], lower[1][1] + 1)} ${p(X(e.w * 0.18), low + 0.5)}`, {
    fill: "none",
    stroke: lineCol,
    "stroke-width": 1.3,
    "stroke-linecap": "round",
    opacity: 0.6,
  });
  return out;
}

const BROW = {
  soft: [
    [-9, 1],
    [1, -1.8],
    [12, 0.6],
  ],
  straight: [
    [-9, 0.3],
    [1, -0.7],
    [12.5, -0.2],
  ],
  arched: [
    [-9, 1.8],
    [4, -3.4],
    [12.5, 1],
  ],
  bold: [
    [-9.5, 2.4],
    [2, -0.9],
    [13.5, -3],
  ],
} as const;

export function brows(c: AvatarCfg, color: string): string {
  const b = BROW[c.brows];
  const [w0, w1] = [
    [2.1, 1.0],
    [3.1, 1.4],
    [4.3, 1.9],
  ][c.browWeight];
  const box = eyeBox(c);
  const y0 = Math.min(box.top - 9, 2);
  // (shy: the brows lift a little)
  const raise = c.mouth === "shy" ? -1.5 : 0;
  let out = "";
  for (const side of [-1, 1] as const) {
    // u runs outward from the eye's middle: the brow's inner end (toward the nose) comes first
    const cx = side * EYE_X;
    const [a, m, z] = b.map(([u, dy]) => [cx + side * u, y0 + dy + raise] as Pt);
    out += path(taper(qpts(a, m, z, 8), w0 + (c.brows === "bold" ? 0.6 : 0), w1), { fill: color });
  }
  return out;
}

export function nose(s: Skin): string {
  return path(`M${p(1.2, 34)}Q${p(2.8, 37.2)} ${p(0, 38.6)}`, { fill: "none", stroke: s.line, "stroke-width": 1.5, "stroke-linecap": "round", opacity: 0.55 });
}

export function mouth(c: AvatarCfg, s: Skin): string {
  const lineCol = mix(s.line, "#5a1f2c", 0.35);
  const y = 46;
  const st = { fill: "none", stroke: lineCol, "stroke-width": 1.8, "stroke-linecap": "round", "stroke-linejoin": "round" };
  switch (c.mouth) {
    case "grin": {
      const d = `M${p(-8, y - 1.5)}Q${p(0, y - 0.2)} ${p(8, y - 1.5)}Q${p(7, y + 9)} ${p(0, y + 9.4)}Q${p(-7, y + 9)} ${p(-8, y - 1.5)}Z`;
      return (
        path(d, { fill: "#8a3043", stroke: lineCol, "stroke-width": 1.6, "stroke-linejoin": "round" }) +
        path(`M${p(-4.6, y + 6.6)}Q${p(0, y + 3.2)} ${p(4.6, y + 6.6)}Q${p(2.4, y + 9.1)} ${p(0, y + 9.2)}Q${p(-2.4, y + 9.1)} ${p(-4.6, y + 6.6)}Z`, { fill: "#f07f8d" }) +
        path(`M${p(-6.6, y - 0.8)}Q${p(0, y + 0.3)} ${p(6.6, y - 0.8)}L${p(6, y + 1.6)}Q${p(0, y + 2.6)} ${p(-6, y + 1.6)}Z`, { fill: "#ffffff" })
      );
    }
    case "cat":
      return path(`M${p(-7, y)}Q${p(-3.5, y + 4.4)} ${p(0, y + 0.6)}Q${p(3.5, y + 4.4)} ${p(7, y)}`, st);
    case "calm":
      return path(`M${p(-4, y + 1.2)}Q${p(0, y + 2.2)} ${p(4, y + 1.2)}`, st);
    case "wink":
      return path(`M${p(-6.5, y - 0.6)}Q${p(0, y + 6.2)} ${p(6.5, y - 0.6)}Q${p(0, y + 2.4)} ${p(-6.5, y - 0.6)}Z`, {
        fill: "#8a3043",
        stroke: lineCol,
        "stroke-width": 1.5,
        "stroke-linejoin": "round",
      });
    case "shy":
      return path(`M${p(-3.2, y + 1.6)}Q${p(-1.6, y + 0.2)} ${p(0, y + 1.6)}Q${p(1.6, y + 3)} ${p(3.2, y + 1.6)}`, { ...st, "stroke-width": 1.6 });
    default:
      return path(`M${p(-6, y - 0.4)}Q${p(0, y + 4.6)} ${p(6, y - 0.4)}`, st);
  }
}

export function eyes(c: AvatarCfg, id: string, iris: string, lineCol: string): string {
  return eye(c, -1, id, iris, lineCol) + eye(c, 1, id, iris, lineCol);
}

/** The gradients the head needs. */
export function headDefs(id: string, iris: string, s: Skin): string {
  return (
    `<linearGradient id="${id}-iris" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(iris, 0.55)}"/><stop offset=".48" stop-color="${iris}"/><stop offset="1" stop-color="${tint(iris, 0.38)}"/></linearGradient>` +
    `<radialGradient id="${id}-blush"><stop offset="0" stop-color="${s.blush}" stop-opacity=".55"/><stop offset="1" stop-color="${s.blush}" stop-opacity="0"/></radialGradient>`
  );
}

/** Facial hair, in the hair's color. */
export function beard(c: AvatarCfg, f: FaceGeom, hair: { base: string; shade: string; line: string }): string {
  // (between the nose, at 38, and the mouth, at 46)
  const lip = (thick: number) => {
    const d = `M${p(0, 40.4)}C${p(-4, 39.2)} ${p(-9, 40.3)} ${p(-12.5, 45.3)}C${p(-9, 43.8)} ${p(-5, 43 + thick)} ${p(0, 43.4 + thick)}C${p(5, 43 + thick)} ${p(9, 43.8)} ${p(12.5, 45.3)}C${p(9, 40.3)} ${p(4, 39.2)} ${p(0, 40.4)}Z`;
    return path(d, { fill: hair.base, stroke: hair.line, "stroke-width": 1.4, "stroke-linejoin": "round" });
  };
  switch (c.beard) {
    case "stubble": {
      const r = seeded(29);
      let dots = "";
      for (let i = 0; i < 70; i++) {
        const t = r();
        const x = (r() * 2 - 1) * (f.jw + 6) * (1 - t * 0.5);
        const y = f.cy + 14 + t * (f.chy - f.cy - 15);
        if (Math.abs(x) < 9 && y < 51 && y > 41) continue;
        dots += circle(x, y, 0.55, { fill: hair.line });
      }
      return (
        path(jawBand(f, 10), { fill: hair.shade, opacity: 0.16 }) +
        g(dots, { opacity: 0.45 }) +
        path(`M${p(-9, 42)}Q${p(0, 39)} ${p(9, 42)}Q${p(0, 41.4)} ${p(-9, 42)}Z`, { fill: hair.shade, opacity: 0.25 })
      );
    }
    case "mustache":
      return lip(0.4);
    case "goatee": {
      const chin = `M${p(-6.5, 52)}Q${p(0, 50)} ${p(6.5, 52)}C${p(7, 56)} ${p(4, f.chy + 4)} ${p(0, f.chy + 5)}C${p(-4, f.chy + 4)} ${p(-7, 56)} ${p(-6.5, 52)}Z`;
      return lip(-0.6) + path(chin, { fill: hair.base, stroke: hair.line, "stroke-width": 1.4, "stroke-linejoin": "round" });
    }
    case "full": {
      const o = 7;
      const d =
        `M${p(-R + 2, 8)}C${p(-R + 1, 24)} ${p(-f.jw - o, f.jy - 2)} ${p(-f.jw + 2, f.jy + 8)}C${p(-f.jw + 8, f.chy + 6)} ${p(-10, f.chy + 10)} ${p(0, f.chy + 10)}` +
        `C${p(10, f.chy + 10)} ${p(f.jw - 8, f.chy + 6)} ${p(f.jw - 2, f.jy + 8)}C${p(f.jw + o, f.jy - 2)} ${p(R - 1, 24)} ${p(R - 2, 8)}` +
        `C${p(R - 8, 18)} ${p(f.cw - 10, 32)} ${p(f.cw - 14, 38)}C${p(14, 50)} ${p(9, 52)} ${p(0, 52)}C${p(-9, 52)} ${p(-14, 50)} ${p(-f.cw + 14, 38)}C${p(-f.cw + 10, 32)} ${p(-R + 8, 18)} ${p(-R + 2, 8)}Z`;
      return (
        path(d, { fill: hair.base, stroke: hair.line, "stroke-width": 1.6, "stroke-linejoin": "round" }) +
        lip(0.2) +
        path(`M${p(-5, 51)}Q${p(0, 49.5)} ${p(5, 51)}`, { fill: "none", stroke: hair.line, "stroke-width": 1.2, opacity: 0.6 })
      );
    }
    default:
      return "";
  }
}

export { n, ink };

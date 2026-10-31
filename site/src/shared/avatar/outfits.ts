// What the avatar wears, from the neck down: ten everyday looks and ten from around the world, each
// cut from the body's own measurements (so it fits short, tall, slim and round alike) and colored
// from one chosen color. Garments that cross at the front (汉服, 和服, 韩服) close left over right,
// the way they are worn: seen from the front, the outer edge runs from the wearer's left at the neck
// down to their right.
import { armAt, CX, GROUND, hands, legs, pantsPath, shoes, skirtPath, sleevePath, torsoPath, type Body, type Shoe } from "./body";
import type { AvatarCfg } from "./cfg";
import { circle, ellipse, ink, light, mix, p, path, shade, tint, type Pt } from "./draw";

type Skin = { base: string; shade: string; line: string };

const FL = (fill: string, w = 2) => ({ fill, stroke: ink(fill), "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "round" });
const LINE = (color: string, w = 1.6, o = 1) => ({ fill: "none", stroke: color, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: o });

const DARK = "#34314a";
const WHITE = "#f5f2ec";
const GOLD = "#e6bf55";

/** Both arms in a sleeve to `t` (1 = the wrist), over the hands. Short sleeves show the arm. */
function arms(b: Body, s: Skin, color: string, t: number, ease = 1, flare = 0, cuff?: string): string {
  let out = hands(b, s.base, s.line);
  if (t < 0.98) for (const side of [0, 1] as const) out += path(sleevePath(b, side, 0, 1), { fill: s.base, stroke: s.line, "stroke-width": 2, "stroke-linejoin": "round" });
  if (t < 0.98) out += hands(b, s.base, s.line);
  for (const side of [0, 1] as const) out += path(sleevePath(b, side, ease, t, { flare }), FL(color));
  if (cuff)
    for (const side of [0, 1] as const) {
      const a = armAt(b, side, t - 0.06);
      const w = b.arm / 2 + ease + flare * t + 0.5;
      out += path(`M${p(a.x + a.nx * w, a.y + a.ny * w)}L${p(a.x - a.nx * w, a.y - a.ny * w)}`, LINE(cuff, 4.2));
    }
  return out;
}

/** A sleeve's lengthwise stripe (tracksuits). */
function armStripe(b: Body, color: string, ease: number): string {
  let out = "";
  for (const side of [0, 1] as const) {
    const a = armAt(b, side, 0.05);
    const z = armAt(b, side, 0.9);
    const off = (b.arm / 2 + ease - 2.5) * (side ? 1 : -1);
    out += path(`M${p(a.x + off, a.y + 2)}L${p(z.x + off, z.y)}`, LINE(color, 2.2));
  }
  return out;
}

/** A round neckline's band. */
const crew = (b: Body, color: string, w = 10) => path(`M${p(CX - w, b.shoulder - 1.5)}Q${p(CX, b.shoulder + 7)} ${p(CX + w, b.shoulder - 1.5)}`, LINE(color, 3.2));

/** A mandarin collar (旗袍, 唐装, 奥黛, 库尔塔): a band standing round the neck. */
const mandarin = (b: Body, color: string) =>
  path(
    `M${p(CX - 10.5, b.shoulder - 9)}Q${p(CX, b.shoulder - 6)} ${p(CX + 10.5, b.shoulder - 9)}L${p(CX + 11, b.shoulder - 1)}Q${p(CX, b.shoulder + 3)} ${p(CX - 11, b.shoulder - 1)}Z`,
    FL(color, 1.6),
  );

/** Frog buttons (盘扣): a little knot with two loops. */
const frog = (x: number, y: number, color: string) =>
  path(`M${p(x - 5, y)}Q${p(x - 2.5, y - 2.6)} ${p(x, y)}Q${p(x + 2.5, y + 2.6)} ${p(x + 5, y)}`, LINE(color, 1.6)) + circle(x, y, 1.3, { fill: color });

/** The cross collar, left over right: under-panel's edge (short stroke), then the outer edge. */
function crossCollar(b: Body, band: string, under: string, to: number, inner = WHITE): string {
  const top = b.shoulder - 2;
  const outer: Pt[] = [
    [CX + 11, top],
    [CX + 4, top + 12],
    [CX - b.wa * 0.55, to],
  ];
  const innerEdge = `M${p(CX - 11, top)}L${p(CX - 1, top + 16)}`;
  return (
    path(`M${p(CX - 9, top)}L${p(CX + 9, top)}L${p(CX, top + 14)}Z`, { fill: inner, stroke: ink(inner), "stroke-width": 1.2 }) +
    path(innerEdge, LINE(under, 4.6)) +
    path(`M${p(...outer[0])}Q${p(...outer[1])} ${p(...outer[2])}`, LINE(band, 5.2)) +
    path(`M${p(outer[0][0] + 2, outer[0][1] - 1)}Q${p(outer[1][0] + 2, outer[1][1])} ${p(outer[2][0] + 2, outer[2][1])}`, LINE(ink(band), 0.9, 0.6))
  );
}

/** A small repeating print over a shape (clipped to it). */
function print(id: string, shape: string, motif: (x: number, y: number) => string, box: [number, number, number, number], step: number): string {
  let inner = "";
  const [x0, y0, x1, y1] = box;
  let row = 0;
  for (let y = y0; y < y1; y += step, row++) for (let x = x0 + (row % 2 ? step / 2 : 0); x < x1; x += step) inner += motif(x, y);
  return `<clipPath id="${id}"><path d="${shape}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`;
}

const blossom = (color: string, r: number) => (x: number, y: number) => {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    s += circle(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.72, { fill: color });
  }
  return s + circle(x, y, r * 0.55, { fill: GOLD });
};

/** The cloth's own shadow down one side of a garment (the light comes from the upper left). */
const sideShade = (_b: Body, color: string, from: number, to: number, w: number) =>
  path(`M${p(CX + w - 7, from)}Q${p(CX + w + 1, (from + to) / 2)} ${p(CX + w - 4, to)}L${p(CX + w + 2, to)}L${p(CX + w + 3, from)}Z`, { fill: shade(color, 0.22), opacity: 0.9 });

type Ctx = { b: Body; s: Skin; c: string; id: string; cfg: AvatarCfg };

const OUT: Record<AvatarCfg["outfit"], (x: Ctx) => string> = {
  hoodie: ({ b, s, c }) => {
    const pants = "#3b3850";
    let out = shoes(b, "sneaker", c, s.base, s.line);
    out += path(pantsPath(b, 2, b.ankle - 2), FL(pants));
    for (const x of b.legX) out += path(`M${p(x - b.leg / 2 - 2, b.ankle - 6)}L${p(x + b.leg / 2 + 2, b.ankle - 6)}`, LINE(shade(pants, 0.3), 4));
    // the hood lies round the shoulders behind the neck
    out += path(
      `M${p(CX - 22, b.shoulder - 2)}Q${p(CX - 26, b.shoulder - 16)} ${p(CX, b.shoulder - 15)}Q${p(CX + 26, b.shoulder - 16)} ${p(CX + 22, b.shoulder - 2)}Z`,
      FL(shade(c, 0.12)),
    );
    const hem = b.hip + 6;
    out += path(torsoPath(b, 3, hem), FL(c));
    out += sideShade(b, c, b.shoulder + 14, hem - 4, b.sh + 3);
    out += path(`M${p(CX - b.hi - 3, hem - 3.5)}L${p(CX + b.hi + 3, hem - 3.5)}`, LINE(shade(c, 0.2), 5));
    // pocket and drawstrings
    out += path(`M${p(CX - b.wa * 0.62, b.waist + 6)}L${p(CX + b.wa * 0.62, b.waist + 6)}L${p(CX + b.wa * 0.8, hem - 8)}L${p(CX - b.wa * 0.8, hem - 8)}Z`, {
      fill: shade(c, 0.08),
      stroke: ink(c),
      "stroke-width": 1.5,
      "stroke-linejoin": "round",
    });
    out += path(`M${p(CX - 18, b.shoulder - 6)}Q${p(CX, b.shoulder + 10)} ${p(CX + 18, b.shoulder - 6)}`, LINE(shade(c, 0.3), 3.6));
    for (const dx of [-5, 5])
      out += path(`M${p(CX + dx, b.shoulder + 3)}L${p(CX + dx * 1.2, b.shoulder + 20)}`, LINE(WHITE, 1.6)) + circle(CX + dx * 1.2, b.shoulder + 21.5, 1.6, { fill: WHITE });
    out += arms(b, s, c, 1, 2, 0, shade(c, 0.2));
    return out;
  },
  tee: ({ b, s, c }) => {
    const pants = "#7d7a5a";
    let out = shoes(b, "sneaker", "#3b3850", s.base, s.line);
    out += path(pantsPath(b, 3, b.ankle - 1, 1), FL(pants));
    for (const x of b.legX) out += path(`M${p(x - 6, b.knee - 12)}h12v12h-12Z`, { fill: shade(pants, 0.12), stroke: ink(pants), "stroke-width": 1.4 });
    const hem = b.hip + 8;
    out += path(torsoPath(b, 6, hem), FL(c));
    out += sideShade(b, c, b.shoulder + 16, hem - 3, b.sh + 6);
    out += crew(b, shade(c, 0.18));
    // a small star on the chest
    const sx = CX - b.sh * 0.35;
    const sy = b.shoulder + 22;
    let star = "";
    for (let i = 0; i < 10; i++) {
      const a = (-90 + i * 36) * (Math.PI / 180);
      const r = i % 2 ? 2.6 : 6;
      star += `${i ? "L" : "M"}${p(sx + Math.cos(a) * r, sy + Math.sin(a) * r)}`;
    }
    out += path(star + "Z", { fill: light(c) > 0.6 ? "#ff7a63" : WHITE });
    out += arms(b, s, c, 0.46, 4, 3);
    return out;
  },
  bomber: ({ b, s, c }) => {
    let out = shoes(b, "sneaker", c, s.base, s.line);
    out += path(pantsPath(b, 1.5, b.ankle - 2), FL("#2c2a38"));
    const hem = b.hip + 2;
    out += path(torsoPath(b, 1, b.hip - 2), FL(WHITE));
    // the jacket, open over a white tee
    const jacket = torsoPath(b, 3.5, hem);
    out += path(jacket, FL(c));
    out += path(`M${p(CX - 6, b.shoulder)}L${p(CX + 6, b.shoulder)}L${p(CX + 4, hem)}L${p(CX - 4, hem)}Z`, FL(WHITE, 1.4));
    out += path(`M${p(CX - 5, b.shoulder + 2)}L${p(CX - 4, hem - 2)}M${p(CX + 5, b.shoulder + 2)}L${p(CX + 4, hem - 2)}`, LINE(ink(c), 1.6));
    out += sideShade(b, c, b.shoulder + 14, hem - 4, b.sh + 3.5);
    out += path(`M${p(CX - b.hi - 3.5, hem - 3.5)}L${p(CX - 5, hem - 3.5)}M${p(CX + 5, hem - 3.5)}L${p(CX + b.hi + 3.5, hem - 3.5)}`, LINE(DARK, 5.5));
    out += path(`M${p(CX - 15, b.shoulder - 4)}Q${p(CX, b.shoulder + 5)} ${p(CX + 15, b.shoulder - 4)}`, LINE(DARK, 4.4));
    out += arms(b, s, c, 1, 2.5, 0, DARK);
    const a = armAt(b, 0, 0.25);
    out += path(`M${p(a.x - 4, a.y - 3)}h8v6h-8Z`, { fill: shade(c, 0.15), stroke: ink(c), "stroke-width": 1.2 });
    return out;
  },
  denim: ({ b, s, c }) => {
    let out = shoes(b, "boot", "#4a3328", s.base, s.line);
    out += path(pantsPath(b, 1.5, b.ankle - 2), FL("#2a2733"));
    const hem = b.hip + 1;
    out += path(torsoPath(b, 1, b.hip - 3), FL(WHITE));
    out += path(torsoPath(b, 3, hem), FL(c));
    out += path(`M${p(CX - 7, b.shoulder)}L${p(CX + 7, b.shoulder)}L${p(CX + 2.5, hem)}L${p(CX - 2.5, hem)}Z`, FL(WHITE, 1.4));
    out += sideShade(b, c, b.shoulder + 14, hem - 4, b.sh + 3);
    // pointed collar, chest pockets, stitching
    out += path(
      `M${p(CX - 6, b.shoulder - 3)}L${p(CX - 16, b.shoulder - 1)}L${p(CX - 9, b.shoulder + 9)}ZM${p(CX + 6, b.shoulder - 3)}L${p(CX + 16, b.shoulder - 1)}L${p(CX + 9, b.shoulder + 9)}Z`,
      FL(shade(c, 0.1), 1.5),
    );
    for (const d of [-1, 1]) {
      const x = CX + d * b.sh * 0.48;
      out += path(`M${p(x - 6, b.shoulder + 15)}h12v4l-6,3l-6,-3Z`, { fill: shade(c, 0.1), stroke: ink(c), "stroke-width": 1.3, "stroke-linejoin": "round" });
      out += circle(x, b.shoulder + 20, 1.1, { fill: GOLD });
    }
    out += path(`M${p(CX - b.hi - 2, hem - 6)}L${p(CX - 5, hem - 6)}M${p(CX + 5, hem - 6)}L${p(CX + b.hi + 2, hem - 6)}`, {
      ...LINE(tint(c, 0.5), 1.1),
      "stroke-dasharray": "2 2",
    });
    out += arms(b, s, c, 1, 2.5, 0, shade(c, 0.12));
    return out;
  },
  suit: ({ b, s, c }) => {
    let out = shoes(b, "dress", "#1f1c26", s.base, s.line);
    out += path(pantsPath(b, 2, b.ankle - 1), FL(c));
    for (const x of b.legX) out += path(`M${p(x, b.hip + 10)}L${p(x, b.ankle - 3)}`, LINE(shade(c, 0.25), 1.2));
    const hem = b.hip + 8;
    out += path(torsoPath(b, 3, hem), FL(c));
    // shirt and tie in the V
    out += path(`M${p(CX - 11, b.shoulder - 1)}L${p(CX + 11, b.shoulder - 1)}L${p(CX, b.waist + 2)}Z`, FL(WHITE, 1.3));
    const tie = light(c) > 0.55 ? "#2d3b66" : "#c23a4e";
    out += path(
      `M${p(CX - 3, b.shoulder + 1)}L${p(CX + 3, b.shoulder + 1)}L${p(CX + 2, b.shoulder + 5)}L${p(CX + 4, b.waist - 6)}L${p(CX, b.waist)}L${p(CX - 4, b.waist - 6)}L${p(CX - 2, b.shoulder + 5)}Z`,
      FL(tie, 1.2),
    );
    // lapels
    out += path(
      `M${p(CX - 11, b.shoulder - 1)}L${p(CX - 15, b.shoulder + 14)}L${p(CX - 9, b.shoulder + 16)}L${p(CX, b.waist + 2)}L${p(CX - 3, b.waist + 3)}Z`,
      FL(shade(c, 0.12), 1.5),
    );
    out += path(
      `M${p(CX + 11, b.shoulder - 1)}L${p(CX + 15, b.shoulder + 14)}L${p(CX + 9, b.shoulder + 16)}L${p(CX, b.waist + 2)}L${p(CX + 3, b.waist + 3)}Z`,
      FL(shade(c, 0.12), 1.5),
    );
    out += path(`M${p(CX, b.waist + 2)}L${p(CX, hem - 1)}`, LINE(ink(c), 1.4));
    for (const y of [b.waist + 8, b.waist + 18]) out += circle(CX - 3.5, y, 1.6, { fill: shade(c, 0.45) });
    out += path(`M${p(CX + b.sh * 0.42 - 5, b.shoulder + 18)}h9`, LINE(WHITE, 2.4));
    out += sideShade(b, c, b.shoulder + 16, hem - 4, b.sh + 3);
    out += arms(b, s, c, 1, 2, 0);
    for (const side of [0, 1] as const) {
      const a = armAt(b, side, 0.96);
      out += path(`M${p(a.x + a.nx * 5, a.y + a.ny * 5)}L${p(a.x - a.nx * 5, a.y - a.ny * 5)}`, LINE(WHITE, 2.6));
    }
    return out;
  },
  sweater: ({ b, s, c }) => {
    const skirt = light(c) > 0.6 ? "#3b3850" : shade(mix(c, "#2a2733", 0.55), 0.1);
    let out = legs(b, s.base, s.line);
    // white knee socks and loafers
    for (const x of b.legX)
      out += path(
        `M${p(x - b.leg / 2 - 0.5, b.knee + 6)}L${p(x + b.leg / 2 + 0.5, b.knee + 6)}L${p(x + b.leg / 2 - 0.6, b.ankle)}L${p(x - b.leg / 2 + 0.6, b.ankle)}Z`,
        FL(WHITE, 1.6),
      );
    out += shoes(b, "loafer", "#3a2a24", s.base, s.line);
    const top = b.waist + 4;
    out += path(skirtPath(b, top, b.knee - 2, 9), FL(skirt));
    for (let i = -3; i <= 3; i++) out += path(`M${p(CX + i * (b.hi / 4), top + 3)}L${p(CX + i * ((b.hi + 9) / 4) * 1.02, b.knee - 3)}`, LINE(shade(skirt, 0.3), 1.2, 0.8));
    out += path(torsoPath(b, 3, top + 4), FL(c));
    out += path(`M${p(CX - b.wa - 3, top + 1)}L${p(CX + b.wa + 3, top + 1)}`, LINE(shade(c, 0.15), 4));
    for (const dx of [-8, 0, 8]) out += path(`M${p(CX + dx, b.shoulder + 8)}Q${p(CX + dx + 2, b.shoulder + 26)} ${p(CX + dx, top - 2)}`, LINE(shade(c, 0.18), 1.6));
    out += crew(b, shade(c, 0.2), 10);
    out += sideShade(b, c, b.shoulder + 14, top, b.sh + 3);
    out += arms(b, s, c, 1, 2.5, 0, shade(c, 0.2));
    return out;
  },
  dress: ({ b, s, c }) => {
    let out = legs(b, s.base, s.line);
    out += shoes(b, "flat", "#2a2733", s.base, s.line);
    const waist = b.waist + 2;
    out += path(skirtPath(b, waist, b.knee + 6, 14), FL(c));
    out += path(
      `M${p(CX - 6, waist + 8)}Q${p(CX - 8, b.knee - 8)} ${p(CX - 12, b.knee + 4)}M${p(CX + 8, waist + 8)}Q${p(CX + 12, b.knee - 6)} ${p(CX + 18, b.knee + 3)}`,
      LINE(shade(c, 0.22), 1.4),
    );
    out += path(torsoPath(b, 1.5, waist + 2), FL(c));
    out += path(`M${p(CX - b.wa - 2, waist + 1)}L${p(CX + b.wa + 2, waist + 1)}`, LINE(shade(c, 0.28), 2.6));
    // a round white collar
    out += path(
      `M${p(CX - 12, b.shoulder - 2)}Q${p(CX - 14, b.shoulder + 9)} ${p(CX - 2, b.shoulder + 8)}L${p(CX, b.shoulder + 3)}L${p(CX + 2, b.shoulder + 8)}Q${p(CX + 14, b.shoulder + 9)} ${p(CX + 12, b.shoulder - 2)}Z`,
      FL(WHITE, 1.4),
    );
    out += arms(b, s, c, 0.28, 3.5, 4);
    return out;
  },
  track: ({ b, s, c }) => {
    let out = shoes(b, "sneaker", c, s.base, s.line);
    out += path(pantsPath(b, 2.5, b.ankle - 2), FL(c));
    for (const [i, x] of b.legX.entries()) {
      const o = (i ? 1 : -1) * (b.leg / 2 + 0.5);
      out += path(`M${p(x + o, b.hip)}L${p(x + o, b.ankle - 4)}`, LINE(WHITE, 2.2));
    }
    const hem = b.hip + 2;
    out += path(torsoPath(b, 3, hem), FL(c));
    out += path(`M${p(CX - 8, b.shoulder - 8)}L${p(CX + 8, b.shoulder - 8)}L${p(CX + 9, b.shoulder)}L${p(CX - 9, b.shoulder)}Z`, FL(c, 1.5));
    out += path(`M${p(CX, b.shoulder - 8)}L${p(CX, hem)}`, LINE(ink(c), 1.6));
    out += path(`M${p(CX - b.hi - 3, hem - 3)}L${p(CX + b.hi + 3, hem - 3)}`, LINE(shade(c, 0.22), 4.4));
    out += sideShade(b, c, b.shoulder + 14, hem - 4, b.sh + 3);
    out += arms(b, s, c, 1, 2, 0, shade(c, 0.2));
    out += armStripe(b, WHITE, 2);
    return out;
  },
  puffer: ({ b, s, c }) => {
    let out = shoes(b, "boot", "#3a2a24", s.base, s.line);
    out += path(pantsPath(b, 1.5, b.ankle - 4), FL("#2a2733"));
    const hem = b.hip + 6;
    out += path(torsoPath(b, 7, hem, { neck: 12 }), FL(c));
    for (let y = b.shoulder + 14; y < hem - 4; y += 13) out += path(`M${p(CX - b.sh - 5, y)}Q${p(CX, y + 4)} ${p(CX + b.sh + 5, y)}`, LINE(shade(c, 0.22), 1.6));
    out += path(
      `M${p(CX - 13, b.shoulder - 11)}L${p(CX + 13, b.shoulder - 11)}L${p(CX + 15, b.shoulder + 2)}Q${p(CX, b.shoulder + 6)} ${p(CX - 15, b.shoulder + 2)}Z`,
      FL(shade(c, 0.06), 1.8),
    );
    out += path(`M${p(CX, b.shoulder + 3)}L${p(CX, hem)}`, LINE(ink(c), 1.6));
    out += sideShade(b, c, b.shoulder + 14, hem - 4, b.sh + 7);
    out += arms(b, s, c, 1, 5, 0, shade(c, 0.18));
    for (const side of [0, 1] as const)
      for (const t of [0.3, 0.6]) {
        const a = armAt(b, side, t);
        const w = b.arm / 2 + 5;
        out += path(`M${p(a.x + a.nx * w, a.y + a.ny * w)}Q${p(a.x, a.y + 2.5)} ${p(a.x - a.nx * w, a.y - a.ny * w)}`, LINE(shade(c, 0.22), 1.4));
      }
    return out;
  },
  overalls: ({ b, s, c }) => {
    let out = shoes(b, "sneaker", "#d6404d", s.base, s.line);
    // a striped tee underneath
    out += path(torsoPath(b, 1.5, b.hip - 4), FL(WHITE));
    for (let y = b.shoulder + 6; y < b.waist; y += 7) out += path(`M${p(CX - b.sh - 2, y)}L${p(CX + b.sh + 2, y)}`, LINE("#d6404d", 2.2));
    out += crew(b, "#d6404d", 9.5);
    out += path(pantsPath(b, 2.5, b.ankle - 2), FL(c));
    const bibTop = b.shoulder + 22;
    out += path(`M${p(CX - 15, bibTop)}L${p(CX + 15, bibTop)}L${p(CX + b.wa, b.hip - 8)}L${p(CX - b.wa, b.hip - 8)}Z`, FL(c));
    out += path(`M${p(CX - 8, bibTop + 7)}h16v11h-16Z`, { fill: shade(c, 0.1), stroke: ink(c), "stroke-width": 1.3 });
    for (const d of [-1, 1]) {
      out += path(`M${p(CX + d * 13, bibTop + 1)}L${p(CX + d * (b.sh - 6), b.shoulder - 1)}`, LINE(c, 5));
      out += circle(CX + d * 12, bibTop + 3, 1.8, { fill: GOLD, stroke: ink(GOLD), "stroke-width": 0.8 });
    }
    out += arms(b, s, WHITE, 1, 1.5, 0, "#d6404d");
    return out;
  },

  qipao: ({ b, s, c, id }) => {
    let out = legs(b, s.base, s.line);
    out += shoes(b, "flat", "#2a2733", s.base, s.line);
    const hem = b.knee + (b.ankle - b.knee) * 0.55;
    const shape = torsoPath(b, 1.2, hem, { flare: -2 });
    out += path(shape, FL(c));
    out += print(`${id}-qp`, shape, blossom(tint(c, 0.32), 1.9), [CX - 50, b.shoulder, CX + 50, hem], 14);
    out += path(shape, { fill: "none", stroke: GOLD, "stroke-width": 1.3, opacity: 0.85 });
    // the side opening, from the collar to the wearer's right (the picture's left)
    out += path(`M${p(CX - 1, b.shoulder + 1)}Q${p(CX - 10, b.shoulder + 12)} ${p(CX - b.sh + 6, b.shoulder + 16)}`, LINE(GOLD, 1.8));
    out += frog(CX - 6, b.shoulder + 8, GOLD) + frog(CX - b.sh + 10, b.shoulder + 15, GOLD);
    for (const d of [-1, 1]) out += path(`M${p(CX + d * (b.hi - 1), hem)}L${p(CX + d * (b.hi - 2), hem - 16)}`, LINE(ink(c), 1.5));
    out += mandarin(b, c);
    out += arms(b, s, c, 0.16, 2, 1);
    return out;
  },
  tang: ({ b, s, c, id }) => {
    let out = shoes(b, "cloth", "#2a2733", s.base, s.line);
    out += path(pantsPath(b, 2.5, b.ankle - 1), FL("#2a2733"));
    const hem = b.hip + 10;
    const shape = torsoPath(b, 3.5, hem);
    out += path(shape, FL(c));
    out += print(`${id}-tg`, shape, (x, y) => circle(x, y, 4.2, { fill: "none", stroke: shade(c, 0.16), "stroke-width": 1.3 }), [CX - 50, b.shoulder, CX + 50, hem], 16);
    out += path(`M${p(CX, b.shoulder)}L${p(CX, hem)}`, LINE(ink(c), 1.6));
    for (let i = 0; i < 4; i++) out += frog(CX, b.shoulder + 8 + i * ((hem - b.shoulder - 18) / 3.5), GOLD);
    out += sideShade(b, c, b.shoulder + 14, hem - 4, b.sh + 3.5);
    out += mandarin(b, c);
    out += arms(b, s, c, 1, 3, 1.5, tint(c, 0.55));
    return out;
  },
  hanfu: ({ b, s, c }) => {
    const top = tint(c, 0.72);
    const sash = shade(c, 0.35);
    let out = shoes(b, "cloth", "#2a2733", s.base, s.line);
    const waist = b.waist + 2;
    out += path(skirtPath(b, waist - 4, GROUND - 3, 18), FL(c));
    for (let i = -3; i <= 3; i++) out += path(`M${p(CX + i * 6, waist + 4)}Q${p(CX + i * 8, GROUND - 40)} ${p(CX + i * 9.5, GROUND - 5)}`, LINE(shade(c, 0.2), 1.2, 0.85));
    out += path(torsoPath(b, 3, waist + 2), FL(top));
    out += crossCollar(b, sash, shade(top, 0.25), waist - 2);
    out += path(`M${p(CX - b.wa - 3, waist - 2)}L${p(CX + b.wa + 3, waist - 2)}`, LINE(sash, 7));
    out += path(`M${p(CX + 6, waist)}Q${p(CX + 9, waist + 22)} ${p(CX + 5, waist + 44)}M${p(CX + 10, waist)}Q${p(CX + 14, waist + 20)} ${p(CX + 13, waist + 40)}`, LINE(sash, 2.6));
    // wide sleeves hanging from the shoulder past the hand
    out += hands(b, s.base, s.line);
    for (const side of [0, 1] as const) {
      const [sx, sy] = b.shoulderPt[side];
      const [hx, hy] = b.hand[side];
      const o = side ? 1 : -1;
      const d = `M${p(sx - o * 3, sy - 6)}Q${p(sx + o * 12, sy - 2)} ${p(hx + o * 14, hy - 6)}Q${p(hx + o * 14, hy + 14)} ${p(hx, hy + 10)}Q${p(hx - o * 10, hy + 6)} ${p(hx - o * 8, hy - 6)}L${p(sx - o * 8, sy + 8)}Z`;
      out += path(d, FL(top));
      out += path(`M${p(hx + o * 13, hy + 2)}Q${p(hx + o * 6, hy + 12)} ${p(hx - o * 8, hy - 2)}`, LINE(sash, 3));
    }
    return out;
  },
  hanbok: ({ b, s, c }) => {
    const jacket = tint(c, 0.62);
    const ribbon = mix(c, "#b0263c", 0.55);
    let out = shoes(b, "flat", "#f5f2ec", s.base, s.line);
    const chest = b.shoulder + b.torso * 0.34;
    const hemW = b.hi + 30;
    out += path(
      `M${p(CX - b.sh + 4, chest - 2)}L${p(CX + b.sh - 4, chest - 2)}C${p(CX + b.sh + 6, chest + 40)} ${p(CX + hemW, GROUND - 40)} ${p(CX + hemW, GROUND - 4)}Q${p(CX, GROUND + 3)} ${p(CX - hemW, GROUND - 4)}C${p(CX - hemW, GROUND - 40)} ${p(CX - b.sh - 6, chest + 40)} ${p(CX - b.sh + 4, chest - 2)}Z`,
      FL(c),
    );
    for (const d of [-14, 0, 14]) out += path(`M${p(CX + d * 0.6, chest + 8)}Q${p(CX + d * 1.2, GROUND - 60)} ${p(CX + d * 1.8, GROUND - 6)}`, LINE(shade(c, 0.18), 1.3));
    out += path(torsoPath(b, 2.5, chest + 2), FL(jacket));
    out += crossCollar(b, shade(jacket, 0.35), shade(jacket, 0.2), chest - 2);
    // the goreum: a bow on the wearer's right, its long ends hanging down
    const bx = CX - 4;
    const by = chest - 4;
    out += path(`M${p(bx, by)}C${p(bx - 12, by - 8)} ${p(bx - 14, by + 4)} ${p(bx, by)}Z`, FL(ribbon, 1.3));
    out += path(`M${p(bx, by)}Q${p(bx - 4, by + 30)} ${p(bx - 2, by + 52)}L${p(bx + 4, by + 50)}Q${p(bx + 2, by + 26)} ${p(bx, by)}Z`, FL(ribbon, 1.3));
    out += hands(b, s.base, s.line);
    for (const side of [0, 1] as const) {
      const [sx, sy] = b.shoulderPt[side];
      const [hx, hy] = b.hand[side];
      const o = side ? 1 : -1;
      out += path(
        `M${p(sx - o * 3, sy - 6)}Q${p(sx + o * 10, sy)} ${p(hx + o * 9, hy - 10)}Q${p(hx + o * 8, hy + 1)} ${p(hx, hy - 3)}Q${p(hx - o * 8, hy - 5)} ${p(hx - o * 8, hy - 12)}L${p(sx - o * 7, sy + 8)}Z`,
        FL(jacket),
      );
      out += path(`M${p(hx + o * 9, hy - 9)}Q${p(hx + o * 2, hy - 1)} ${p(hx - o * 8, hy - 9)}`, LINE(ribbon, 3.4));
    }
    return out;
  },
  kimono: ({ b, s, c, id }) => {
    const obi = light(c) > 0.55 ? "#2d3b66" : "#e8b43c";
    let out = shoes(b, "zori", "#c9a46a", s.base, s.line);
    const shape = torsoPath(b, 3, GROUND - 6, { flare: 2 });
    out += path(shape, FL(c));
    out += print(`${id}-km`, shape, blossom(tint(c, 0.4), 2.1), [CX - 60, b.shoulder, CX + 60, GROUND], 18);
    // below the obi, the outer panel's edge runs down the picture's left of the middle
    out += path(`M${p(CX - 6, b.waist + 10)}Q${p(CX - 10, GROUND - 60)} ${p(CX - 12, GROUND - 7)}`, LINE(ink(c), 1.8));
    out += crossCollar(b, shade(c, 0.12), shade(c, 0.25), b.waist - 6);
    out += path(`M${p(CX - b.wa - 3.5, b.waist - 3)}L${p(CX + b.wa + 3.5, b.waist - 3)}L${p(CX + b.wa + 3.5, b.waist + 11)}L${p(CX - b.wa - 3.5, b.waist + 11)}Z`, FL(obi, 1.6));
    out += path(`M${p(CX - b.wa - 3, b.waist + 4)}L${p(CX + b.wa + 3, b.waist + 4)}`, LINE("#d6404d", 1.6));
    // rectangular sleeves hanging from the arm
    out += hands(b, s.base, s.line);
    for (const side of [0, 1] as const) {
      const [sx, sy] = b.shoulderPt[side];
      const [hx, hy] = b.hand[side];
      const o = side ? 1 : -1;
      out += path(
        `M${p(sx - o * 3, sy - 6)}Q${p(sx + o * 12, sy - 3)} ${p(hx + o * 13, hy - 18)}L${p(hx + o * 13, hy + 10)}Q${p(hx + o * 13, hy + 16)} ${p(hx + o * 6, hy + 16)}L${p(hx - o * 4, hy + 14)}L${p(hx - o * 6, hy - 6)}L${p(sx - o * 8, sy + 8)}Z`,
        FL(c),
      );
    }
    return out;
  },
  aodai: ({ b, s, c }) => {
    let out = shoes(b, "flat", "#e6bf55", s.base, s.line);
    // wide white trousers, then the long front panel over them
    out += path(pantsPath(b, 5, GROUND - 6, 5), FL(WHITE));
    const panelEnd = b.knee + (b.ankle - b.knee) * 0.7;
    out += path(torsoPath(b, 1.2, b.waist + 4), FL(c));
    out += path(`M${p(CX - b.wa - 1, b.waist + 2)}L${p(CX + b.wa + 1, b.waist + 2)}L${p(CX + b.wa + 4, panelEnd)}Q${p(CX, panelEnd + 4)} ${p(CX - b.wa - 4, panelEnd)}Z`, FL(c));
    out += path(`M${p(CX - 1, b.shoulder + 1)}Q${p(CX - 10, b.shoulder + 12)} ${p(CX - b.sh + 6, b.shoulder + 16)}`, LINE(ink(c), 1.6));
    out += mandarin(b, c);
    out += sideShade(b, c, b.shoulder + 12, b.waist, b.sh + 1);
    out += arms(b, s, c, 1, 1, 0);
    return out;
  },
  sari: ({ b, s, c }) => {
    const border = GOLD;
    const blouse = shade(c, 0.3);
    let out = shoes(b, "sandal", "#c9a46a", s.base, s.line);
    out += path(skirtPath(b, b.waist - 2, GROUND - 4, 8), FL(c));
    out += path(`M${p(CX - b.hi - 9, GROUND - 9)}Q${p(CX, GROUND - 4)} ${p(CX + b.hi + 9, GROUND - 9)}`, LINE(border, 4));
    for (const d of [-3, 0, 3]) out += path(`M${p(CX + d * 2, b.waist + 8)}L${p(CX + d * 3, GROUND - 10)}`, LINE(shade(c, 0.22), 1.2));
    out += path(torsoPath(b, 1.5, b.waist + 1), FL(blouse));
    // the pallu: from the waist on the picture's left, across the chest, over the wearer's left shoulder
    const pallu = `M${p(CX - b.wa - 4, b.waist + 10)}L${p(CX - b.wa + 8, b.waist + 12)}L${p(CX + b.sh + 3, b.shoulder + 4)}L${p(CX + b.sh - 9, b.shoulder - 4)}Z`;
    out += path(pallu, FL(c));
    out += path(`M${p(CX - b.wa + 8, b.waist + 12)}L${p(CX + b.sh + 3, b.shoulder + 4)}`, LINE(border, 3));
    out += arms(b, s, blouse, 0.3, 2, 0);
    for (const [x, y] of b.hand) out += ellipse(x, y - 6, b.arm * 0.6, 2.2, { fill: "none", stroke: GOLD, "stroke-width": 1.6 });
    return out;
  },
  kurta: ({ b, s, c }) => {
    let out = shoes(b, "jutti", "#b8892e", s.base, s.line);
    out += path(pantsPath(b, 2.5, b.ankle - 1), FL(WHITE));
    const hem = b.knee + 6;
    out += path(torsoPath(b, 3, hem, { flare: 4 }), FL(c));
    for (const d of [-1, 1]) out += path(`M${p(CX + d * (b.hi + 5), hem)}L${p(CX + d * (b.hi + 4), hem - 14)}`, LINE(ink(c), 1.4));
    out += path(`M${p(CX - 3, b.shoulder)}h6v${b.torso * 0.42}h-6Z`, FL(shade(c, 0.12), 1.2));
    for (let i = 0; i < 4; i++) out += circle(CX, b.shoulder + 5 + i * 6, 1.1, { fill: GOLD });
    out += mandarin(b, c);
    out += path(`M${p(CX - 10.5, b.shoulder - 8)}Q${p(CX, b.shoulder - 5)} ${p(CX + 10.5, b.shoulder - 8)}`, LINE(GOLD, 1.2));
    out += sideShade(b, c, b.shoulder + 14, hem - 4, b.sh + 3);
    out += arms(b, s, c, 1, 2, 0);
    return out;
  },
  ankara: ({ b, s, c, id }) => {
    const motif = light(c) > 0.55 ? "#2d3b66" : "#f2c14e";
    let out = shoes(b, "sandal", "#6a4a30", s.base, s.line);
    out += path(pantsPath(b, 2.5, b.ankle - 2), FL("#2a2733"));
    const hem = b.hip + 10;
    const shape = torsoPath(b, 4, hem);
    out += path(shape, FL(c));
    out += print(
      `${id}-ak`,
      shape,
      (x, y) =>
        circle(x, y, 5.2, { fill: "none", stroke: motif, "stroke-width": 2 }) +
        circle(x, y, 1.8, { fill: motif }) +
        path(`M${p(x + 8, y - 8)}q4,4 0,8q-4,-4 0,-8`, { fill: tint(c, 0.5) }),
      [CX - 55, b.shoulder - 10, CX + 55, hem + 6],
      16,
    );
    out += path(shape, { fill: "none", stroke: ink(c), "stroke-width": 2 });
    out += path(`M${p(CX - 8, b.shoulder - 1)}L${p(CX, b.shoulder + 9)}L${p(CX + 8, b.shoulder - 1)}`, LINE(ink(c), 1.8));
    out += arms(b, s, c, 0.42, 4, 2);
    return out;
  },
  kilt: ({ b, s, c, id }) => {
    let out = legs(b, s.base, s.line);
    // knee socks with garter flashes, and brogues
    for (const x of b.legX) {
      out += path(
        `M${p(x - b.leg / 2 - 0.6, b.knee + 10)}L${p(x + b.leg / 2 + 0.6, b.knee + 10)}L${p(x + b.leg / 2 - 0.4, b.ankle)}L${p(x - b.leg / 2 + 0.4, b.ankle)}Z`,
        FL("#efe7d6", 1.5),
      );
      out += path(`M${p(x - 3, b.knee + 13)}l2,7l2,-7Z`, { fill: c });
    }
    out += shoes(b, "dress", "#2a1f1a", s.base, s.line);
    const top = b.hip - 12;
    const shape = skirtPath(b, top, b.knee + 2, 7, 3);
    out += path(shape, FL(c));
    out += print(
      `${id}-kt`,
      shape,
      (x, y) =>
        path(`M${p(x - 9, y)}h18M${p(x, y - 9)}v18`, { stroke: shade(c, 0.45), "stroke-width": 3.4, opacity: 0.55 }) +
        path(`M${p(x - 9, y + 4)}h18M${p(x + 4, y - 9)}v18`, { stroke: "#f5f2ec", "stroke-width": 0.9, opacity: 0.7 }),
      [CX - 60, top, CX + 60, b.knee + 10],
      18,
    );
    out += path(shape, { fill: "none", stroke: ink(c), "stroke-width": 2 });
    out += path(torsoPath(b, 2, top + 3), FL(WHITE));
    out += path(`M${p(CX - b.hi - 3, top + 1)}L${p(CX + b.hi + 3, top + 1)}`, LINE("#3a2a24", 5));
    out += path(`M${p(CX - 3, top - 1.5)}h6v5h-6Z`, { fill: GOLD });
    // the sporran
    out += path(`M${p(CX - 8, top + 6)}h16v14q-8,6 -16,0Z`, FL("#4a3328", 1.4));
    for (const dx of [-3, 3]) out += path(`M${p(CX + dx, top + 10)}v9`, LINE("#e6bf55", 1.6));
    out += crew(b, ink(WHITE), 8);
    out += arms(b, s, WHITE, 1, 1.5, 0, shade(WHITE, 0.15));
    return out;
  },
};

/** Everything below the neck. */
export function outfit(cfg: AvatarCfg, b: Body, s: Skin, color: string, id: string): string {
  return OUT[cfg.outfit]({ b, s, c: color, id, cfg });
}

export type { Shoe };

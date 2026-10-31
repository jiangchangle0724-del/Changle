// The body under the clothes: how tall (the head stays the same size; the body below it is longer
// or shorter) and how built, and the shapes every garment is cut from. In the picture's coordinates:
// 240 wide, the feet on the ground at y = 330, the middle at x = 120.
import type { AvatarCfg } from "./cfg";
import { ellipse, ink, mix, p, path, shade, smooth, tint, type Pt } from "./draw";

export const CX = 120;
export const GROUND = 330;

const LENGTHS = {
  short: { torso: 62, legs: 56, foot: 10 },
  mid: { torso: 70, legs: 76, foot: 11 },
  tall: { torso: 78, legs: 100, foot: 12 },
} as const;

const WIDTHS = {
  slim: { sh: 30, wa: 23, hi: 26, arm: 11, leg: 13.5, belly: 0 },
  mid: { sh: 34, wa: 27.5, hi: 30, arm: 12.5, leg: 15.5, belly: 0 },
  round: { sh: 38, wa: 38, hi: 37, arm: 15, leg: 19, belly: 7 },
} as const;

export type Body = {
  /** shoulders' line, waist, hips (where the legs start), ankles */
  shoulder: number;
  waist: number;
  hip: number;
  knee: number;
  ankle: number;
  /** half-widths */
  sh: number;
  wa: number;
  hi: number;
  belly: number;
  arm: number;
  leg: number;
  /** each leg's middle, left of the picture first */
  legX: [number, number];
  /** where the head's middle is */
  headY: number;
  /** shoulder joint and hand, left then right */
  shoulderPt: [Pt, Pt];
  hand: [Pt, Pt];
  foot: number;
  torso: number;
};

export function body(c: AvatarCfg): Body {
  const L = LENGTHS[c.height];
  const W = WIDTHS[c.build];
  const ankle = GROUND - L.foot;
  const hip = ankle - L.legs;
  const shoulder = hip - L.torso;
  const waist = shoulder + L.torso * 0.58;
  const gap = 4;
  const legOff = gap / 2 + W.leg / 2;
  const sx = W.sh - W.arm * 0.5;
  const armLen = L.torso * 0.9;
  const handX = W.sh + W.arm * 0.2 + (c.build === "round" ? 3 : 0);
  return {
    shoulder,
    waist,
    hip,
    knee: hip + L.legs * 0.52,
    ankle,
    sh: W.sh,
    wa: W.wa,
    hi: W.hi,
    belly: W.belly,
    arm: W.arm,
    leg: W.leg,
    legX: [CX - legOff, CX + legOff],
    headY: shoulder - 8 - 50,
    shoulderPt: [
      [CX - sx, shoulder + W.arm * 0.45],
      [CX + sx, shoulder + W.arm * 0.45],
    ],
    hand: [
      [CX - handX, shoulder + armLen],
      [CX + handX, shoulder + armLen],
    ],
    foot: L.foot,
    torso: L.torso,
  };
}

/** A torso-shaped piece of cloth from the neckline down to `hem`, `ease` wider than the body. */
export function torsoPath(b: Body, ease: number, hem: number, opts: { flare?: number; neck?: number; top?: number } = {}): string {
  const flare = opts.flare ?? 0;
  const nk = opts.neck ?? 10;
  const top = b.shoulder + (opts.top ?? -1.5);
  const sh = b.sh + ease;
  const wa = b.wa + ease + b.belly * 0.4;
  const hi = b.hi + ease + flare;
  const below = hem > b.hip ? Math.min(1, (hem - b.hip) / 40) : 0;
  const L: Pt[] = [
    [CX - nk, top],
    [CX - sh + 7, top + 2.5],
    [CX - sh, top + 10],
    [CX - Math.max(wa, sh - 3) - b.belly * 0.6, b.waist - 6],
    [CX - Math.max(wa, hi - 2) - b.belly * 0.3, (b.waist + Math.min(hem, b.hip)) / 2 + 4],
    [CX - hi - below * flare, hem],
  ];
  const R: Pt[] = L.map(([x, y]) => [2 * CX - x, y] as Pt).reverse();
  return smooth([...L, ...R], true, 0.14).replace(/Z$/, "") + "Z";
}

/** A sleeve (or a bare arm): from the shoulder joint to `t` of the way to the hand, `ease` wider. */
export function sleevePath(b: Body, side: 0 | 1, ease: number, t: number, opts: { flare?: number; cuff?: boolean } = {}): string {
  const [sx, sy] = b.shoulderPt[side];
  const [hx, hy] = b.hand[side];
  const ex = sx + (hx - sx) * t;
  const ey = sy + (hy - sy) * t;
  const w0 = b.arm / 2 + ease + 1.5;
  const w1 = b.arm / 2 + ease + (opts.flare ?? 0) * t;
  const dx = ex - sx;
  const dy = ey - sy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const top: Pt = [sx - (side ? -1 : 1) * 2, sy - b.arm * 0.55];
  const a: Pt = [sx + nx * w0, sy + ny * w0];
  const bb: Pt = [ex + nx * w1, ey + ny * w1];
  const c: Pt = [ex - nx * w1, ey - ny * w1];
  const d: Pt = [sx - nx * w0, sy - ny * w0];
  return `M${p(...top)}Q${p(a[0] + (side ? 1 : -1) * 3, a[1] - 4)} ${p(...a)}L${p(...bb)}Q${p((bb[0] + c[0]) / 2 + (dx / len) * 2.5, (bb[1] + c[1]) / 2 + (dy / len) * 2.5)} ${p(...c)}L${p(...d)}Q${p(d[0], top[1] + 2)} ${p(...top)}Z`;
}

/** Where along an arm a point is (for cuffs and stripes). */
export function armAt(b: Body, side: 0 | 1, t: number): { x: number; y: number; nx: number; ny: number } {
  const [sx, sy] = b.shoulderPt[side];
  const [hx, hy] = b.hand[side];
  const dx = hx - sx;
  const dy = hy - sy;
  const len = Math.hypot(dx, dy) || 1;
  return { x: sx + dx * t, y: sy + dy * t, nx: -dy / len, ny: dx / len };
}

/** Trousers from the waistband down to `end` (the ankle, or above the knee for shorts). */
export function pantsPath(b: Body, ease: number, end: number, flare = 0): string {
  const top = b.hip - 10;
  const [lx, rx] = b.legX;
  const half = b.leg / 2 + ease;
  const crotch = b.hip + 6;
  const L =
    `M${p(CX - b.hi - ease, top)}L${p(CX + b.hi + ease, top)}` +
    `C${p(CX + b.hi + ease + 1, b.hip)} ${p(rx + half + 1, b.hip + 6)} ${p(rx + half + flare * 0.3, (b.hip + end) / 2)}L${p(rx + half + flare, end)}L${p(rx - half - flare * 0.4, end)}L${p(CX + 1.5, crotch)}L${p(CX - 1.5, crotch)}L${p(lx + half + flare * 0.4, end)}L${p(lx - half - flare, end)}L${p(lx - half - flare * 0.3, (b.hip + end) / 2)}C${p(lx - half - 1, b.hip + 6)} ${p(CX - b.hi - ease - 1, b.hip)} ${p(CX - b.hi - ease, top)}Z`;
  return L;
}

/** A skirt from `top` to `end`, flaring out by `flare` at the hem. */
export function skirtPath(b: Body, top: number, end: number, flare: number, ease = 2): string {
  const w0 = Math.max(b.wa, top > b.waist + 8 ? b.hi : b.wa) + ease + b.belly * 0.4;
  const w1 = b.hi + ease + flare;
  const mid = (top + end) / 2;
  return `M${p(CX - w0, top)}L${p(CX + w0, top)}C${p(CX + w0 + 3, mid - 6)} ${p(CX + w1 - 2, mid)} ${p(CX + w1, end)}Q${p(CX, end + 5)} ${p(CX - w1, end)}C${p(CX - w1 + 2, mid)} ${p(CX - w0 - 3, mid - 6)} ${p(CX - w0, top)}Z`;
}

/** Bare legs (skin), each a rounded column from the hips to the ankle. */
export function legs(b: Body, skin: string, skinLine: string): string {
  let out = "";
  for (const x of b.legX) {
    const h = b.leg / 2;
    out += path(`M${p(x - h, b.hip - 4)}L${p(x + h, b.hip - 4)}L${p(x + h - 1.2, b.ankle)}Q${p(x, b.ankle + 3)} ${p(x - h + 1.2, b.ankle)}Z`, {
      fill: skin,
      stroke: skinLine,
      "stroke-width": 2,
      "stroke-linejoin": "round",
    });
  }
  return out;
}

/** Hands at the ends of the arms. */
export function hands(b: Body, skin: string, skinLine: string): string {
  return b.hand.map(([x, y]) => ellipse(x, y + 1, b.arm * 0.56, b.arm * 0.62, { fill: skin, stroke: skinLine, "stroke-width": 2 })).join("");
}

export type Shoe = "sneaker" | "boot" | "flat" | "sandal" | "dress" | "cloth" | "zori" | "jutti" | "loafer";

export function shoes(b: Body, kind: Shoe, color: string, skin: string, skinLine: string): string {
  let out = "";
  for (const [i, x] of b.legX.entries()) {
    const out1 = i === 0 ? -1 : 1;
    const w = b.leg * 0.66;
    const cx = x + out1 * 1.5;
    const y = b.ankle;
    const sole = GROUND;
    switch (kind) {
      case "sneaker": {
        const body = `M${p(cx - w, y - 3)}Q${p(cx, y - 8)} ${p(cx + w, y - 3)}Q${p(cx + w + 2.5, sole - 3)} ${p(cx + w, sole)}L${p(cx - w, sole)}Q${p(cx - w - 2.5, sole - 3)} ${p(cx - w, y - 3)}Z`;
        out += path(body, { fill: "#f6f4f0", stroke: ink("#d9d6de"), "stroke-width": 1.8, "stroke-linejoin": "round" });
        out += path(`M${p(cx - w - 0.5, sole - 3.6)}L${p(cx + w + 0.5, sole - 3.6)}`, { stroke: color, "stroke-width": 2.2, "stroke-linecap": "round" });
        break;
      }
      case "boot": {
        const top = y - 14;
        out += path(
          `M${p(cx - w + 0.5, top)}L${p(cx + w - 0.5, top)}L${p(cx + w + 1, sole - 2)}Q${p(cx + w + 1, sole)} ${p(cx + w - 1, sole)}L${p(cx - w + 1, sole)}Q${p(cx - w - 1, sole)} ${p(cx - w - 1, sole - 2)}Z`,
          { fill: color, stroke: ink(color), "stroke-width": 1.8, "stroke-linejoin": "round" },
        );
        out += path(`M${p(cx - w, sole - 3)}L${p(cx + w, sole - 3)}`, { stroke: shade(color, 0.4), "stroke-width": 2 });
        break;
      }
      case "sandal":
      case "zori":
      case "jutti": {
        const sock = kind === "zori" ? "#fbfaf6" : skin;
        out += path(
          `M${p(cx - w + 1, y - 4)}L${p(cx + w - 1, y - 4)}Q${p(cx + w + 1, sole - 3)} ${p(cx + w - 1, sole - 1)}L${p(cx - w + 1, sole - 1)}Q${p(cx - w - 1, sole - 3)} ${p(cx - w + 1, y - 4)}Z`,
          { fill: sock, stroke: kind === "zori" ? ink("#e4e1da") : skinLine, "stroke-width": 1.6 },
        );
        if (kind === "jutti")
          out += path(`M${p(cx - w - 0.5, sole - 6)}Q${p(cx, sole - 10)} ${p(cx + w + 0.5, sole - 6)}L${p(cx + w, sole)}L${p(cx - w, sole)}Z`, {
            fill: color,
            stroke: ink(color),
            "stroke-width": 1.5,
          });
        else {
          out += path(`M${p(cx - w - 1, sole - 1)}L${p(cx + w + 1, sole - 1)}L${p(cx + w + 1, sole + 1.5)}L${p(cx - w - 1, sole + 1.5)}Z`, {
            fill: kind === "zori" ? "#c9a46a" : color,
            stroke: ink(color),
            "stroke-width": 1.2,
          });
          out += path(`M${p(cx, y - 2)}L${p(cx - w + 2, sole - 2)}M${p(cx, y - 2)}L${p(cx + w - 2, sole - 2)}`, {
            stroke: kind === "zori" ? "#a8323c" : color,
            "stroke-width": 1.8,
            "stroke-linecap": "round",
          });
        }
        break;
      }
      default: {
        // flats, loafers, dress shoes, cloth shoes: a low rounded shoe
        const shoe = kind === "cloth" ? "#2a2733" : color;
        out += path(
          `M${p(cx - w, y - 2)}Q${p(cx, y - 6)} ${p(cx + w, y - 2)}Q${p(cx + w + 2.5, sole - 2)} ${p(cx + w, sole)}L${p(cx - w, sole)}Q${p(cx - w - 2.5, sole - 2)} ${p(cx - w, y - 2)}Z`,
          { fill: shoe, stroke: ink(shoe), "stroke-width": 1.8, "stroke-linejoin": "round" },
        );
        if (kind === "dress" || kind === "loafer")
          out += path(`M${p(cx - w * 0.5, y - 2)}Q${p(cx, y - 4)} ${p(cx + w * 0.5, y - 2)}`, {
            stroke: tint(shoe, 0.45),
            "stroke-width": 1.4,
            fill: "none",
            "stroke-linecap": "round",
          });
        if (kind === "flat") out += path(`M${p(cx - w + 1, y - 3.5)}L${p(cx + w - 1, y - 3.5)}`, { stroke: mix(shoe, "#000000", 0.2), "stroke-width": 1.6 });
      }
    }
  }
  return out;
}

/** The neck (with the chin's shadow on it). */
export function neck(b: Body, skin: string, shadeCol: string, skinLine: string): string {
  const top = b.headY + 34;
  const w = 10.5;
  return (
    path(`M${p(CX - w, top)}L${p(CX + w, top)}L${p(CX + w + 1, b.shoulder + 6)}L${p(CX - w - 1, b.shoulder + 6)}Z`, { fill: skin, stroke: skinLine, "stroke-width": 2 }) +
    path(`M${p(CX - w + 1, top)}L${p(CX + w - 1, top)}L${p(CX + w - 0.5, b.headY + 62)}Q${p(CX, b.headY + 68)} ${p(CX - w + 0.5, b.headY + 62)}Z`, { fill: shadeCol })
  );
}

/** The soft shadow the figure stands in. */
export function ground(b: Body): string {
  return ellipse(CX, GROUND + 1, b.hi + 22, 6, { fill: "#05030f", opacity: 0.35 });
}

export { tint, shade, mix, ink };

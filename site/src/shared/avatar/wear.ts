// Hats, glasses and earrings, in the head's coordinates (the skull's middle at 0,0, radius R).
// A hat sits on the hair: on a big head of hair it sits higher and wider. The hijab and the turban
// cover the hair altogether (render.ts leaves it out), and the hijab the ears and neck too.
import type { AvatarCfg } from "./cfg";
import { circle, ellipse, ink, light, mix, p, path, shade, tint, type Pt } from "./draw";
import { EYE_X, EYE_Y, R, type FaceGeom } from "./head";

const FL = (fill: string, w = 2) => ({ fill, stroke: ink(fill), "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "round" });
const LN = (color: string, w = 1.6, o = 1) => ({ fill: "none", stroke: color, "stroke-width": w, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: o });

/** How far the hair stands out from the skull, for a hat to sit on. */
export function hatRoom(c: AvatarCfg): number {
  return { buzz: 2, short: 6, curly: 10, afro: 12, wolf: 7, bob: 8, long: 7, wavy: 8, pony: 4, twin: 5, bun: 4, braids: 5, bald: 0 }[c.hair];
}

/** The part of a hijab behind the face: round the head, down over the shoulders. */
export function hijabBack(color: string): string {
  const W = R + 7;
  const d = `M${p(0, -W - 2)}C${p(-W * 0.62, -W - 2)} ${p(-W - 2, -W * 0.6)} ${p(-W - 2, 0)}C${p(-W - 3, 34)} ${p(-W - 6, 62)} ${p(-W - 14, 92)}Q${p(0, 112)} ${p(W + 14, 92)}C${p(W + 6, 62)} ${p(W + 3, 34)} ${p(W + 2, 0)}C${p(W + 2, -W * 0.6)} ${p(W * 0.62, -W - 2)} ${p(0, -W - 2)}Z`;
  return path(d, FL(color, 2.2)) + path(`M${p(-W + 6, 40)}Q${p(-W + 2, 70)} ${p(-W - 6, 90)}M${p(W - 6, 40)}Q${p(W - 2, 70)} ${p(W + 6, 90)}`, LN(shade(color, 0.25), 2));
}

/** The hijab's edge framing the face (over the forehead, down the cheeks, under the chin). */
export function hijabFront(color: string, f: FaceGeom): string {
  // the band: a head-sized shape with the face's opening cut out of it
  const open = `M${p(0, -30)}C${p(-30, -31)} ${p(-f.cw + 6, -18)} ${p(-f.cw + 5, f.cy)}C${p(-f.cw + 6, f.jy)} ${p(-f.jw + 2, f.chy - 2)} ${p(0, f.chy + 2)}C${p(f.jw - 2, f.chy - 2)} ${p(f.cw - 6, f.jy)} ${p(f.cw - 5, f.cy)}C${p(f.cw - 6, -18)} ${p(30, -31)} ${p(0, -30)}Z`;
  return path(`${headPathBig()}${open}`, { ...FL(color, 2), "fill-rule": "evenodd" }) + path(open, LN(shade(color, 0.3), 1.6));
}

function headPathBig(): string {
  const W = R + 7;
  return `M${p(0, -W - 2)}C${p(-W * 0.62, -W - 2)} ${p(-W - 2, -W * 0.6)} ${p(-W - 2, 0)}C${p(-W - 2, 40)} ${p(-30, 70)} ${p(0, 72)}C${p(30, 70)} ${p(W + 2, 40)} ${p(W + 2, 0)}C${p(W + 2, -W * 0.6)} ${p(W * 0.62, -W - 2)} ${p(0, -W - 2)}Z`;
}

export function hat(c: AvatarCfg, color: string): string {
  const W = R + hatRoom(c) + 1;
  switch (c.hat) {
    case "cap": {
      const dome = `M${p(-W, -10)}C${p(-W, -W * 0.9)} ${p(-W * 0.55, -W - 4)} ${p(0, -W - 4)}C${p(W * 0.55, -W - 4)} ${p(W, -W * 0.9)} ${p(W, -10)}Q${p(0, -18)} ${p(-W, -10)}Z`;
      const brim = `M${p(-W + 4, -12)}Q${p(0, -22)} ${p(W - 4, -12)}Q${p(W - 2, 2)} ${p(0, 4)}Q${p(-W + 2, 2)} ${p(-W + 4, -12)}Z`;
      return (
        path(dome, FL(color, 2.2)) +
        path(`M${p(0, -W - 4)}Q${p(-6, -W * 0.5)} ${p(-4, -15)}M${p(-W * 0.55, -W * 0.82)}Q${p(-W * 0.45, -W * 0.4)} ${p(-W * 0.52, -12)}`, LN(shade(color, 0.25), 1.6)) +
        path(brim, FL(shade(color, 0.12), 2.2)) +
        circle(0, -W - 4, 3, FL(shade(color, 0.2), 1.4))
      );
    }
    case "beanie": {
      const dome = `M${p(-W - 1, -6)}C${p(-W - 2, -W)} ${p(-W * 0.5, -W - 10)} ${p(0, -W - 10)}C${p(W * 0.5, -W - 10)} ${p(W + 2, -W)} ${p(W + 1, -6)}Z`;
      let out = circle(0, -W - 14, 9, FL(tint(color, 0.35), 1.8)) + path(dome, FL(color, 2.2));
      for (let i = -3; i <= 3; i++) out += path(`M${p(i * 11, -W - 6 + Math.abs(i) * 3)}Q${p(i * 13, -W * 0.5)} ${p(i * 14, -20)}`, LN(shade(color, 0.2), 1.4));
      out += path(`M${p(-W - 2, -24)}Q${p(0, -32)} ${p(W + 2, -24)}L${p(W + 2, -4)}Q${p(0, -10)} ${p(-W - 2, -4)}Z`, FL(shade(color, 0.1), 2));
      for (let i = -5; i <= 5; i++) out += path(`M${p(i * 9.5, -27 + Math.abs(i) * 0.4)}L${p(i * 10, -8 + Math.abs(i) * 0.3)}`, LN(shade(color, 0.28), 1.2));
      return out;
    }
    case "bucket": {
      const dome = `M${p(-W + 6, -14)}C${p(-W + 4, -W)} ${p(-W * 0.4, -W - 6)} ${p(0, -W - 6)}C${p(W * 0.4, -W - 6)} ${p(W - 4, -W)} ${p(W - 6, -14)}Z`;
      const brim = `M${p(-W + 4, -18)}Q${p(0, -24)} ${p(W - 4, -18)}L${p(W + 16, 0)}Q${p(W + 16, 6)} ${p(W + 8, 6)}Q${p(0, 0)} ${p(-W - 8, 6)}Q${p(-W - 16, 6)} ${p(-W - 16, 0)}Z`;
      return (
        path(brim, FL(shade(color, 0.08), 2.2)) +
        path(dome, FL(color, 2.2)) +
        path(`M${p(-W + 5, -18)}Q${p(0, -24)} ${p(W - 5, -18)}`, LN(shade(color, 0.3), 3)) +
        path(`M${p(-W - 10, 1)}Q${p(0, -6)} ${p(W + 10, 1)}`, { ...LN(tint(color, 0.4), 1.1), "stroke-dasharray": "2 2" })
      );
    }
    case "beret": {
      const cx = 12;
      return (
        path(
          `M${p(cx - W - 4, -W * 0.55)}C${p(cx - W - 6, -W - 12)} ${p(cx + W + 10, -W - 14)} ${p(cx + W + 6, -W * 0.48)}Q${p(cx, -W * 0.3)} ${p(cx - W - 4, -W * 0.55)}Z`,
          FL(color, 2.2),
        ) +
        path(`M${p(cx - W - 2, -W * 0.52)}Q${p(cx, -W * 0.26)} ${p(cx + W + 4, -W * 0.46)}`, LN(shade(color, 0.3), 3)) +
        path(`M${p(cx + 4, -W - 10)}l2,-6`, LN(ink(color), 2.4))
      );
    }
    case "straw": {
      const brimY = -18;
      let out = ellipse(0, brimY, W + 34, 15, FL(color, 2.2));
      for (const r of [W + 16, W + 26]) out += ellipse(0, brimY + 1, r, 10, LN(shade(color, 0.18), 1.1));
      out += path(`M${p(-38, brimY)}C${p(-40, -W - 22)} ${p(40, -W - 22)} ${p(38, brimY)}Q${p(0, brimY + 6)} ${p(-38, brimY)}Z`, FL(color, 2.2));
      out += path(`M${p(-38.5, brimY - 4)}Q${p(0, brimY + 1)} ${p(38.5, brimY - 4)}`, LN("#c23a4e", 5));
      return out;
    }
    case "cowboy": {
      const brim = `M${p(-W - 26, -26)}Q${p(-W - 14, -10)} ${p(-W + 2, -14)}Q${p(0, -8)} ${p(W - 2, -14)}Q${p(W + 14, -10)} ${p(W + 26, -26)}Q${p(W + 18, -4)} ${p(W, 0)}Q${p(0, 6)} ${p(-W, 0)}Q${p(-W - 18, -4)} ${p(-W - 26, -26)}Z`;
      const crown = `M${p(-34, -14)}C${p(-38, -W - 18)} ${p(-12, -W - 22)} ${p(0, -W - 12)}C${p(12, -W - 22)} ${p(38, -W - 18)} ${p(34, -14)}Q${p(0, -8)} ${p(-34, -14)}Z`;
      return path(crown, FL(color, 2.2)) + path(`M${p(-34, -20)}Q${p(0, -14)} ${p(34, -20)}`, LN(shade(color, 0.4), 4)) + path(brim, FL(shade(color, 0.08), 2.2));
    }
    case "ears": {
      let out = path(`M${p(-W + 4, -8)}C${p(-W + 2, -W - 2)} ${p(W - 2, -W - 2)} ${p(W - 4, -8)}`, LN(color, 4.4));
      for (const side of [-1, 1]) {
        const x = side * (W * 0.55);
        const ear: Pt[] = [
          [x - side * 14, -W + 6],
          [x + side * 10, -W - 30],
          [x + side * 16, -W + 2],
        ];
        out += path(`M${p(...ear[0])}L${p(...ear[1])}L${p(...ear[2])}Z`, FL(color, 2));
        out += path(`M${p(x - side * 6, -W + 2)}L${p(x + side * 9, -W - 20)}L${p(x + side * 11, -W + 1)}Z`, { fill: "#ff9cb4" });
      }
      return out;
    }
    case "flowers": {
      let out = "";
      const cols = ["#ff8fb3", "#fff6e8", "#ffd35c", color];
      for (let i = 0; i < 9; i++) {
        const a = ((200 + i * 17.5) * Math.PI) / 180;
        const x = Math.cos(a) * (W - 2);
        const y = Math.sin(a) * (W - 6) - 6;
        if (i % 2) out += ellipse(x + 3, y + 3, 5, 2.4, { fill: "#4fae6a", transform: `rotate(${(a * 180) / Math.PI + 90} ${x + 3} ${y + 3})` });
        for (let k = 0; k < 5; k++) {
          const b = (k * 72 * Math.PI) / 180;
          out += circle(x + Math.cos(b) * 3.6, y + Math.sin(b) * 3.6, 3.2, { fill: cols[i % cols.length], stroke: ink(cols[i % cols.length]), "stroke-width": 0.8 });
        }
        out += circle(x, y, 2, { fill: "#f2b23a" });
      }
      return out;
    }
    case "turban": {
      const W2 = R + 8;
      const d = `M${p(-W2, 6)}C${p(-W2 - 4, -W2 * 0.7)} ${p(-24, -W2 - 18)} ${p(0, -W2 - 22)}C${p(24, -W2 - 18)} ${p(W2 + 4, -W2 * 0.7)} ${p(W2, 6)}Q${p(W2 - 10, -4)} ${p(24, -10)}L${p(0, -2)}L${p(-24, -10)}Q${p(-W2 + 10, -4)} ${p(-W2, 6)}Z`;
      let out = path(d, FL(color, 2.2));
      for (const k of [0, 1, 2]) {
        const y = -12 - k * 13;
        out += path(`M${p(-W2 + 6 + k * 4, y + 12)}Q${p(-18, y - 2)} ${p(0, y - 14 + k * 2)}`, LN(shade(color, 0.28), 1.8));
        out += path(`M${p(W2 - 6 - k * 4, y + 12)}Q${p(18, y - 2)} ${p(0, y - 14 + k * 2)}`, LN(shade(color, 0.18), 1.8));
      }
      return out;
    }
    default:
      return "";
  }
}

/** A rounded rectangle's outline. */
const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${p(x + r, y)}L${p(x + w - r, y)}Q${p(x + w, y)} ${p(x + w, y + r)}L${p(x + w, y + h - r)}Q${p(x + w, y + h)} ${p(x + w - r, y + h)}L${p(x + r, y + h)}Q${p(x, y + h)} ${p(x, y + h - r)}L${p(x, y + r)}Q${p(x, y)} ${p(x + r, y)}Z`;

const FRAME: Record<string, string> = { round: "#b8913c", square: "#3b3850", bold: "#1c1a24", cateye: "#7a2a40", sun: "#1c1a24" };

export function glasses(c: AvatarCfg): string {
  if (c.glasses === "none") return "";
  const col = FRAME[c.glasses];
  const w = c.glasses === "bold" ? 3.2 : 2;
  let out = "";
  const lens = (cx: number, side: number) => {
    switch (c.glasses) {
      case "round":
        return `M${p(cx - 15, EYE_Y)}a15,15 0 1,0 30,0a15,15 0 1,0 -30,0Z`;
      case "cateye": {
        const o = side * 16;
        return `M${p(cx - o, EYE_Y - 12)}Q${p(cx, EYE_Y - 13)} ${p(cx + o * 0.9, EYE_Y - 9)}Q${p(cx + o * 0.85, EYE_Y + 12)} ${p(cx, EYE_Y + 12)}Q${p(cx - o * 1.0, EYE_Y + 11)} ${p(cx - o * 1.05, EYE_Y - 3)}Q${p(cx - o * 1.25, EYE_Y - 13)} ${p(cx - o, EYE_Y - 12)}Z`;
      }
      default:
        return rrect(cx - 16, EYE_Y - 12, 32, 24, c.glasses === "sun" ? 9 : 5);
    }
  };
  for (const side of [-1, 1]) {
    const cx = side * EYE_X;
    const d = lens(cx, side);
    out += path(d, {
      fill: c.glasses === "sun" ? "#26223a" : "#ffffff",
      "fill-opacity": c.glasses === "sun" ? 0.92 : 0.12,
      stroke: col,
      "stroke-width": w,
      "stroke-linejoin": "round",
    });
    out += path(`M${p(cx - 7, EYE_Y - 6)}L${p(cx - 1, EYE_Y - 10)}`, LN("#ffffff", 1.6, c.glasses === "sun" ? 0.7 : 0.45));
    out += path(`M${p(side * (EYE_X + 15.5), EYE_Y - 4)}L${p(side * (R - 2), EYE_Y - 7)}`, LN(col, w * 0.8));
  }
  out += path(`M${p(-EYE_X + 15, EYE_Y - 3)}Q${p(0, EYE_Y - 8)} ${p(EYE_X - 15, EYE_Y - 3)}`, LN(col, w));
  return out;
}

export function earrings(c: AvatarCfg): string {
  if (c.earrings === "none") return "";
  const gold = "#e6bf55";
  let out = "";
  for (const side of [-1, 1]) {
    const x = side * (R + 2.5);
    const y = 27;
    if (c.earrings === "stud") out += circle(x, y, 2.4, { fill: gold, stroke: ink(gold), "stroke-width": 0.9 });
    else if (c.earrings === "hoop") out += circle(x, y + 5, 5, { fill: "none", stroke: gold, "stroke-width": 1.8 });
    else
      out += path(`M${p(x, y)}v5`, LN(gold, 1.2)) + path(`M${p(x, y + 5)}q4,5 0,9q-4,-4 0,-9Z`, { fill: "#8fd3ff", stroke: mix("#8fd3ff", "#1b1024", 0.5), "stroke-width": 0.9 });
  }
  return out;
}

export { light };

// Hair: what's behind the head (its length and shape), and what's in front (the crown and what
// falls over the forehead). In the head's coordinates (skull radius R, chin about 56 down). Anime
// hair reads as a few big locks: each lock a tapered shape, a darker line or two inside, and the
// band of shine across the crown.
import type { AvatarCfg } from "./cfg";
import { circle, ellipse, mix, p, path, qpts, seeded, smooth, taper, type Pt } from "./draw";
import { R, type FaceGeom } from "./head";

export type HairCol = { base: string; shade: string; shine: string; line: string };

const VOL: Record<AvatarCfg["hair"], number> = {
  buzz: 1.5,
  short: 6,
  curly: 12,
  afro: 9,
  wolf: 7,
  bob: 8,
  long: 7,
  wavy: 9,
  pony: 4,
  twin: 5,
  bun: 4,
  braids: 5,
  bald: 0,
};

const CURLY = (c: AvatarCfg) => c.hair === "curly" || c.hair === "afro";
const TIED = (c: AvatarCfg) => c.hair === "pony" || c.hair === "twin" || c.hair === "bun" || c.hair === "braids";

const fillOf = (h: HairCol, w = 2) => ({ fill: h.base, stroke: h.line, "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "round" });

/** A wavy or bumpy version of an outline: each stretch between points bulges out by `amp`. */
function bumpy(pts: Pt[], amp: number, closed = true): string {
  let d = `M${p(...pts[0])}`;
  const N = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < N; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    // (outward is to the left of the direction of travel for a clockwise outline)
    d += `Q${p(mx + (dy / len) * amp, my - (dx / len) * amp)} ${p(...b)}`;
  }
  return closed ? d + "Z" : d;
}

/** Points round an arc (angles in degrees, 0 = right, 90 = down). */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, steps: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Behind

/** Hair that falls behind the shoulders (drawn before the body), and the mass behind the head. */
export function hairBehind(c: AvatarCfg, h: HairCol, hatOn: boolean): { body: string; head: string } {
  const v = VOL[c.hair];
  const W = R + v;
  let body = "";
  let head = "";
  switch (c.hair) {
    case "long":
    case "wavy": {
      const wavy = c.hair === "wavy";
      const L: Pt[] = [
        [0, -W],
        [-W * 0.72, -W * 0.72],
        [-W, -6],
        [-W - 3, 34],
        [-W - 4, 76],
        [-W + 2, 112],
        [-W + 12, 126],
        [-W + 22, 118],
        [-30, 96],
      ];
      const pts = [
        ...L,
        ...L.slice(1)
          .reverse()
          .map(([x, y]) => [-x, y] as Pt),
      ];
      body += wavy ? path(bumpy(pts, 5), fillOf(h)) : path(smooth(pts, true, 0.16), fillOf(h));
      body += path(`M${p(-W + 6, 20)}Q${p(-W + 2, 70)} ${p(-W + 10, 112)}M${p(W - 6, 20)}Q${p(W - 2, 70)} ${p(W - 10, 112)}`, {
        fill: "none",
        stroke: h.shade,
        "stroke-width": 2.4,
        "stroke-linecap": "round",
      });
      break;
    }
    case "bob": {
      const L: Pt[] = [
        [0, -W],
        [-W * 0.74, -W * 0.7],
        [-W, -4],
        [-W - 1, 30],
        [-W + 6, 52],
        [-W + 18, 55],
        [-24, 40],
      ];
      head += path(
        smooth(
          [
            ...L,
            ...L.slice(1)
              .reverse()
              .map(([x, y]) => [-x, y] as Pt),
          ],
          true,
          0.16,
        ),
        fillOf(h),
      );
      break;
    }
    case "wolf": {
      const L: Pt[] = [
        [0, -W],
        [-W * 0.74, -W * 0.7],
        [-W, -4],
        [-W - 1, 26],
        [-W + 4, 56],
        [-W + 10, 46],
        [-W + 14, 72],
        [-W + 22, 50],
        [-28, 44],
      ];
      const pts = [
        ...L,
        ...L.slice(1)
          .reverse()
          .map(([x, y]) => [-x, y] as Pt),
      ];
      body += path(`M${pts.map(([x, y]) => p(x, y)).join("L")}Z`, { ...fillOf(h), "stroke-linejoin": "round" });
      break;
    }
    case "short":
    case "curly":
    case "afro": {
      if (c.hair === "afro") {
        // (behind the neck and shoulders, so it frames the face instead of wrapping under the chin)
        const big = hatOn ? 14 : 30;
        const pts = arc(0, -14, R + big, R + big - 8, 0, 360, 22).slice(0, -1);
        body += path(bumpy(pts, 6), fillOf(h));
        body += curls(0, -14, R + big - 12, 20, h, 41);
      } else if (c.hair === "curly") {
        const pts = [...arc(0, -4, W + 2, W, 150, 390, 14)];
        pts.push([W - 2, 28], [-W + 2, 28]);
        head += path(bumpy(pts, 5.5), fillOf(h));
      } else {
        const L: Pt[] = [
          [0, -W],
          [-W * 0.74, -W * 0.7],
          [-W, -4],
          [-W + 1, 20],
          [-W + 8, 30],
          [-30, 26],
        ];
        head += path(
          smooth(
            [
              ...L,
              ...L.slice(1)
                .reverse()
                .map(([x, y]) => [-x, y] as Pt),
            ],
            true,
            0.16,
          ),
          fillOf(h),
        );
      }
      break;
    }
    case "pony": {
      if (hatOn && false) break;
      // the tail swings out behind the right of the head
      const tail: Pt[] = [
        [18, -58],
        [44, -66],
        [64, -44],
        [70, 0],
        [62, 46],
        [50, 84],
        [42, 60],
        [44, 18],
        [36, -26],
      ];
      body += path(smooth(tail, true, 0.18), fillOf(h));
      body += path(`M${p(52, -40)}Q${p(62, 10)} ${p(50, 70)}`, { fill: "none", stroke: h.shade, "stroke-width": 2.2, "stroke-linecap": "round" });
      head += sleek(W, h);
      break;
    }
    case "twin": {
      for (const side of [-1, 1]) {
        const tail: Pt[] = [
          [side * (W - 6), -30],
          [side * (W + 16), -26],
          [side * (W + 26), 10],
          [side * (W + 24), 60],
          [side * (W + 12), 104],
          [side * (W + 4), 70],
          [side * (W + 2), 20],
        ];
        body += path(smooth(tail, true, 0.18), fillOf(h));
        body += path(`M${p(side * (W + 14), -10)}Q${p(side * (W + 20), 40)} ${p(side * (W + 12), 90)}`, {
          fill: "none",
          stroke: h.shade,
          "stroke-width": 2.2,
          "stroke-linecap": "round",
        });
      }
      head += sleek(W, h);
      break;
    }
    case "bun":
    case "braids":
    case "buzz":
      head += sleek(W, h);
      break;
    default:
      break;
  }
  return { body, head };
}

/** Hair drawn close round the back of the skull (tied up, or very short). */
function sleek(W: number, h: HairCol): string {
  const L: Pt[] = [
    [0, -W],
    [-W * 0.74, -W * 0.7],
    [-W, -4],
    [-W + 2, 16],
    [-36, 18],
  ];
  return path(
    smooth(
      [
        ...L,
        ...L.slice(1)
          .reverse()
          .map(([x, y]) => [-x, y] as Pt),
      ],
      true,
      0.16,
    ),
    fillOf(h),
  );
}

/** Little c-shaped curls scattered over an area (curly hair's texture). */
function curls(cx: number, cy: number, r: number, count: number, h: HairCol, seed: number): string {
  const rnd = seeded(seed);
  let out = "";
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d * 0.95;
    const s = 3 + rnd() * 2.5;
    const t = rnd() * 6.28;
    out += path(`M${p(x + Math.cos(t) * s, y + Math.sin(t) * s)}A${p(s, s)} 0 1 1 ${p(x + Math.cos(t + 2.6) * s, y + Math.sin(t + 2.6) * s)}`, {
      fill: "none",
      stroke: h.shade,
      "stroke-width": 1.6,
      "stroke-linecap": "round",
      opacity: 0.85,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// In front

/**
 * The crown and the fringe, as one shape: the outer edge round the skull (a little out from it, by
 * the hair's volume), the inner edge the hairline or the fringe across the forehead. Then the side
 * locks, the lines inside the locks and the band of shine.
 */
export function hairFront(c: AvatarCfg, h: HairCol, f: FaceGeom, hat: AvatarCfg["hat"], _id: string): { front: string; shadow: string } {
  if (c.hair === "bald") return { front: ellipse(-17, -36, 12, 7, { fill: "#ffffff", opacity: 0.28, transform: "rotate(-24 -17 -36)" }), shadow: "" };
  const v = VOL[c.hair];
  const curly = CURLY(c);
  const W = R + (curly ? Math.min(v, 9) : v);
  // (a short cut's crown stays close; the sides come down to the ear's top, or past it)
  const sideY = c.hair === "buzz" ? 4 : c.hair === "short" || c.hair === "curly" || TIED(c) || c.hair === "afro" ? 12 : c.hair === "wolf" ? 26 : 30;
  const edge = fringeEdge(c, f);
  // outer: from the left sideburn up over the crown to the right sideburn
  const outer: Pt[] = [[-R + 1, sideY], [-W, -2], ...arc(0, -3, W, W - 1, 180, 360, 10).slice(1, -1), [W, -2], [R - 1, sideY]];
  const inner: Pt[] = [[R - 7, sideY - 4], ...edge.right, ...edge.mid, ...edge.left, [-R + 7, sideY - 4]];
  const crown = curly ? bumpyCrown(outer, inner) : smoothCrown(outer, inner, c.fringe);
  let front = "";
  if (c.hair === "bun" && hat === "none") front += bun(h);
  // side locks in front of the ears and shoulders, their tops under the crown
  front += locks(c, h, f);
  // airy bangs: thin strands falling from a high edge, the forehead showing between them
  if (c.fringe === "wisps" && c.hair !== "buzz" && c.hair !== "afro") {
    for (const [x, len, bend] of [
      [-29, 15, -2],
      [-17, 19, -1.5],
      [-5, 17, -1],
      [7, 19, 1],
      [19, 16, 1.5],
      [30, 13, 2],
    ] as const) {
      const top = -17 - Math.abs(x) * 0.08;
      const line = qpts([x, top], [x + bend * 0.6, top + (len + 4) * 0.5], [x + bend * 2, top + len + 4], 6);
      front += path(taper(line, 10, 0.8), fillOf(h, 1.2));
      front += path(`M${p(x, top + 1)}Q${p(x + bend * 0.5, top + len * 0.4)} ${p(x + bend * 1.2, top + len * 0.75)}`, {
        fill: "none",
        stroke: h.shade,
        "stroke-width": 1.4,
        "stroke-linecap": "round",
      });
    }
  }
  front += path(crown, fillOf(h, 2.2));
  // the underside of the locks, darker, just above their tips
  const run = [...edge.right, ...edge.mid, ...edge.left];
  if (c.hair !== "buzz" && c.fringe !== "wisps" && run.length > 3) {
    const up = run.map(([x, y]) => [x * 0.97, y - 7.5] as Pt).reverse();
    front += `<path d="M${run.map(([x, y]) => p(x, y)).join("L")}L${up.map(([x, y]) => p(x, y)).join("L")}Z" fill="${h.shade}" opacity=".75"/>`;
  }
  // the lines that make it hair
  front += strands(c, h, edge, W);
  // curls all over a curly crown
  if (curly) front += `<clipPath id="${_id}-curl"><path d="${crown}"/></clipPath><g clip-path="url(#${_id}-curl)">${curls(0, -24, W - 6, 18, h, 23)}</g>`;
  // shine across the crown (a short crop or buzz gets less)
  if (c.hair !== "buzz") front += `<clipPath id="${_id}-crown"><path d="${crown}"/></clipPath><g clip-path="url(#${_id}-crown)">${shine(W, h, c.fringe === "back" ? 2 : 0)}</g>`;
  else front += buzzTexture(W, h);
  // the shadow the fringe casts on the forehead: the fringe's edge, a little lower
  const shadowPts = [...edge.right, ...edge.mid, ...edge.left].map(([x, y]) => [x, y + 4.5] as Pt);
  const shadow = `M${p(R + 4, -70)}L${p(R + 4, shadowPts[0][1])}L${shadowPts.map(([x, y]) => p(x, y)).join("L")}L${p(-R - 4, shadowPts[shadowPts.length - 1][1])}L${p(-R - 4, -70)}Z`;
  return { front, shadow };
}

function smoothCrown(outer: Pt[], inner: Pt[], fringe: AvatarCfg["fringe"]): string {
  // the outer edge is smooth; the fringe edge keeps its points sharp where locks end in a tip
  const o = smooth(outer, false, 0.18);
  const sharp = fringe === "spiky" || fringe === "full" || fringe === "swept" || fringe === "wisps";
  const i = sharp ? inner.map(([x, y]) => `L${p(x, y)}`).join("") : smooth([outer[outer.length - 1], ...inner, outer[0]], false, 0.16).replace(/^M[^C]*/, "");
  return `${o}${i}Z`;
}

function bumpyCrown(outer: Pt[], inner: Pt[]): string {
  const o = bumpy(outer, 4.5, false);
  return `${o}${bumpy([outer[outer.length - 1], ...inner, outer[0]], 3.2, false).replace(/^M[^Q]*/, "")}Z`;
}

/** The fringe's edge across the forehead, right temple to left, in three runs. */
function fringeEdge(c: AvatarCfg, f: FaceGeom): { right: Pt[]; mid: Pt[]; left: Pt[] } {
  const fr = c.hair === "buzz" || c.hair === "afro" ? (c.fringe === "back" || c.fringe === "side" || c.fringe === "middle" ? c.fringe : "back") : c.fringe;
  const T = R - 9;
  const cheek = Math.min(f.cw - 6, 47);
  switch (fr) {
    case "full":
      return {
        right: [
          [T + 2, 10],
          [cheek, 16],
          [42, 6],
        ],
        mid: [
          [36, -1],
          [30, 3],
          [24, -2],
          [16, 2.6],
          [8, -2.2],
          [0, 2.8],
          [-8, -2.2],
          [-16, 2.6],
          [-24, -2],
          [-30, 3],
          [-36, -1],
        ],
        left: [
          [-42, 6],
          [-cheek, 16],
          [-T - 2, 10],
        ],
      };
    case "swept":
      return {
        right: [
          [T, -2],
          [42, -12],
          [30, -18],
        ],
        mid: [
          [16, -21],
          [8, -12],
          [2, -17],
          [-8, -6],
          [-12, -11],
          [-22, 0],
          [-26, -4],
          [-36, 8],
        ],
        left: [
          [-40, 4],
          [-cheek, 18],
          [-T - 2, 12],
        ],
      };
    case "wisps":
      return {
        right: [
          [T + 2, 8],
          [cheek - 1, 18],
          [43, 4],
          [38, -9],
        ],
        mid: [
          [30, -12],
          [18, -14],
          [6, -15],
          [-6, -15],
          [-18, -14],
          [-30, -12],
        ],
        left: [
          [-38, -9],
          [-43, 4],
          [-cheek + 1, 18],
          [-T - 2, 8],
        ],
      };
    case "middle":
      return {
        right: [
          [T + 2, 12],
          [cheek, 20],
          [44, 8],
          [38, -8],
        ],
        mid: [
          [24, -24],
          [6, -34],
          [0, -38],
          [-6, -34],
          [-24, -24],
        ],
        left: [
          [-38, -8],
          [-44, 8],
          [-cheek, 20],
          [-T - 2, 12],
        ],
      };
    case "side":
      return {
        right: [
          [T + 1, 4],
          [46, -4],
          [40, -12],
        ],
        mid: [
          [26, -16],
          [10, -22],
          [-6, -30],
          [-16, -38],
        ],
        left: [
          [-26, -32],
          [-38, -20],
          [-T, -6],
        ],
      };
    case "spiky":
      return {
        right: [
          [T + 1, 2],
          [44, -6],
          [40, 3],
        ],
        mid: [
          [33, -8],
          [26, 2],
          [19, -10],
          [12, 0],
          [5, -11],
          [-2, -1],
          [-9, -11],
          [-16, 0],
          [-23, -10],
          [-30, 2],
          [-36, -8],
        ],
        left: [
          [-41, 3],
          [-45, -6],
          [-T - 1, 2],
        ],
      };
    default:
      // slicked back: a clean hairline high on the forehead
      return {
        right: [
          [T, -10],
          [40, -24],
        ],
        mid: [
          [24, -35],
          [8, -39],
          [0, -37],
          [-8, -39],
          [-24, -35],
        ],
        left: [
          [-40, -24],
          [-T, -10],
        ],
      };
  }
}

/** Darker lines inside the locks, running from the crown toward their tips. */
function strands(c: AvatarCfg, h: HairCol, edge: { right: Pt[]; mid: Pt[]; left: Pt[] }, W: number): string {
  if (c.hair === "buzz") return "";
  const tips = [...edge.right, ...edge.mid, ...edge.left].filter((_, i, a) => i > 0 && i < a.length - 1);
  let out = "";
  const st = { fill: "none", stroke: h.shade, "stroke-width": 2, "stroke-linecap": "round", opacity: 0.9 };
  // a few of the tips get a line up toward the crown
  for (let i = 1; i < tips.length - 1; i += 2) {
    const [x, y] = tips[i];
    if (y < -30) continue;
    const top: Pt = [x * 0.55, -W + 14];
    out += path(`M${p(x * 0.92, y - 5)}Q${p(x * 0.9, (y + top[1]) / 2)} ${p(...top)}`, st);
  }
  return out;
}

/**
 * The band of shine across the crown (anime's "angel ring"): a band about a third of the way down
 * from the top, its lower edge broken into the points of the strands. Clipped to the crown.
 */
function shine(W: number, h: HairCol, lift: number): string {
  const cy = -2 + lift;
  const top = arc(0, cy, W * 0.84, W * 0.72, 200, 340, 14);
  const low: Pt[] = [];
  for (let i = 0; i <= 28; i++) {
    const a = 340 - (i * 140) / 28;
    const k = i % 2 ? 0.565 : 0.625;
    const rx = W * (i % 2 ? 0.8 : 0.82);
    low.push([Math.cos((a * Math.PI) / 180) * rx, cy + Math.sin((a * Math.PI) / 180) * W * k]);
  }
  return path(`M${[...top, ...low].map(([x, y]) => p(x, y)).join("L")}Z`, { fill: h.shine, opacity: 0.7, "stroke-linejoin": "round" });
}

function buzzTexture(W: number, h: HairCol): string {
  const r = seeded(11);
  let out = "";
  for (let i = 0; i < 46; i++) {
    const a = Math.PI + r() * Math.PI;
    const d = (W - 4) * Math.sqrt(0.35 + r() * 0.65);
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d - 2;
    out += circle(x, y, 0.7, { fill: h.shade, opacity: 0.7 });
  }
  return out;
}

function bun(h: HairCol): string {
  return (
    circle(0, -R - 12, 19, fillOf(h, 2.2)) +
    path(`M${p(-11, -R - 14)}Q${p(-2, -R - 28)} ${p(10, -R - 16)}M${p(-8, -R - 4)}Q${p(4, -R - 6)} ${p(12, -R - 10)}`, {
      fill: "none",
      stroke: h.shade,
      "stroke-width": 2,
      "stroke-linecap": "round",
    }) +
    path(`M${p(-14, -R + 1)}Q${p(0, -R + 5)} ${p(14, -R + 1)}`, { fill: "none", stroke: mix(h.line, h.base, 0.3), "stroke-width": 3.4, "stroke-linecap": "round" })
  );
}

/** Locks in front: a bob's sides, long hair down over the shoulders, braids, the twin tails' ties. */
function locks(c: AvatarCfg, h: HairCol, f: FaceGeom): string {
  let out = "";
  const lock = (side: number, top: number, bottom: number, width: number, wave: number) => {
    const x0 = side * (f.cw - 2);
    const line: Pt[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      line.push([x0 + side * (2 + Math.sin(t * Math.PI * 2.2) * wave + t * 6 - t * t * 5), top + (bottom - top) * t]);
    }
    const body = taper(line, width, 0.8);
    const streak = line.slice(1, 7).map(([x, y]) => [x - side * width * 0.12, y] as Pt);
    return (
      path(body, fillOf(h, 1.8)) +
      path(`M${p(...line[2])}Q${p(line[5][0] + side * 2, line[5][1])} ${p(line[8][0] + side * 1, line[8][1])}`, {
        fill: "none",
        stroke: h.shade,
        "stroke-width": 1.6,
        "stroke-linecap": "round",
      }) +
      path(taper(streak, 2.6, 0.4), { fill: h.shine, opacity: 0.55 })
    );
  };
  switch (c.hair) {
    case "long":
      for (const side of [-1, 1]) out += lock(side, -2, 100, 21, 0.8);
      break;
    case "wavy":
      for (const side of [-1, 1]) out += lock(side, -2, 100, 23, 3.4);
      break;
    case "bob":
      for (const side of [-1, 1]) {
        const x = side * (f.cw + 1);
        out += path(
          `M${p(side * (R - 6), -6)}C${p(side * (R + 6), 10)} ${p(x + side * 7, 38)} ${p(x + side * 1, 52)}C${p(x - side * 6, 50)} ${p(x - side * 10, 44)} ${p(side * (f.cw - 8), 30)}C${p(side * (f.cw - 8), 16)} ${p(side * (R - 10), 4)} ${p(side * (R - 6), -6)}Z`,
          fillOf(h, 1.8),
        );
      }
      break;
    case "wolf":
      for (const side of [-1, 1]) {
        const x = side * f.cw;
        out += path(
          `M${p(side * (R - 6), -4)}C${p(side * (R + 4), 10)} ${p(x + side * 6, 34)} ${p(x + side * 2, 50)}L${p(x - side * 3, 40)}L${p(x - side * 6, 46)}C${p(side * (f.cw - 9), 30)} ${p(side * (R - 10), 6)} ${p(side * (R - 6), -4)}Z`,
          fillOf(h, 1.8),
        );
      }
      break;
    case "braids":
      for (const side of [-1, 1]) out += braid(side, f, h);
      break;
    case "twin":
      for (const side of [-1, 1]) out += circle(side * (R - 2), -26, 4.6, { fill: "#ff6b8a", stroke: "#a3364f", "stroke-width": 1.4 });
      break;
    default:
      break;
  }
  return out;
}

function braid(side: number, f: FaceGeom, h: HairCol): string {
  let out = "";
  const x0 = side * (f.cw - 1);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = 24 + i * 12;
    const x = x0 + side * (4 + t * 6);
    const w = 9 - t * 2.5;
    out += ellipse(x + (i % 2 ? side * 1.6 : -side * 1.6), y, w, 8, { ...fillOf(h, 1.6), transform: `rotate(${(i % 2 ? 1 : -1) * 18} ${x} ${y})` });
  }
  const yEnd = 24 + n * 12;
  const xe = x0 + side * 10;
  out += path(`M${p(xe - 4, yEnd - 4)}L${p(xe - 6, yEnd + 10)}Q${p(xe, yEnd + 6)} ${p(xe + 6, yEnd + 10)}L${p(xe + 4, yEnd - 4)}Z`, fillOf(h, 1.6));
  out += ellipse(xe, yEnd - 5, 5, 2.6, { fill: "#ff6b8a", stroke: "#a3364f", "stroke-width": 1.2 });
  return out;
}

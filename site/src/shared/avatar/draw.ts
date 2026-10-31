// Small drawing helpers for the avatar: numbers short enough for a compact SVG, colors mixed for
// cel shading (shadows lean toward a deep violet, the room's night, rather than toward grey), and
// symmetric outlines built from their left half.

export type Pt = [number, number];
/** One cubic segment of a left half: two control points and the end. */
export type Seg = [Pt, Pt, Pt];

/** A number for a path: one decimal, no trailing zero. */
export const n = (x: number) => {
  const r = Math.round(x * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
export const p = (x: number, y: number) => `${n(x)},${n(y)}`;

const hex = (c: string): [number, number, number] => {
  const h = c.replace("#", "");
  const v =
    h.length === 3
      ? h
          .split("")
          .map((x) => x + x)
          .join("")
      : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};
const toHex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((x) =>
      Math.max(0, Math.min(255, Math.round(x)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/** `a` mixed with `b`, `t` of the way. */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
/** The night every shadow leans toward. */
const DEEP = "#24163a";
export const shade = (c: string, t = 0.22) => mix(c, DEEP, t);
export const tint = (c: string, t = 0.3) => mix(c, "#ffffff", t);
/** An outline for a filled shape: much darker, same family. */
export const ink = (c: string) => mix(c, "#1b1024", 0.62);
/** Relative lightness 0..1 (for picking a light or dark detail on a color). */
export function light(c: string): number {
  const [r, g, b] = hex(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

const mirror = ([x, y]: Pt): Pt => [-x, y];

/**
 * A closed outline symmetric about x = 0, from its left half: it starts on the axis at `start`,
 * runs down the left through `segs` and ends on the axis; the right half is the same, mirrored.
 */
export function sym(start: Pt, segs: Seg[], dx = 0, dy = 0): string {
  const t = ([x, y]: Pt) => p(x + dx, y + dy);
  let d = `M${t(start)}`;
  for (const [c1, c2, e] of segs) d += `C${t(c1)} ${t(c2)} ${t(e)}`;
  const pts: Pt[] = [start];
  for (const s of segs) pts.push(s[2]);
  for (let i = segs.length - 1; i >= 0; i--) {
    const [c1, c2] = segs[i];
    d += `C${t(mirror(c2))} ${t(mirror(c1))} ${t(mirror(pts[i]))}`;
  }
  return d + "Z";
}

/** Points of a left half mirrored to the right (for a polyline-ish outline). */
export const flipX = (pts: Pt[]): Pt[] => pts.map(mirror);

export const attr = (o: Record<string, string | number | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => ` ${k}="${typeof v === "number" ? n(v) : v}"`)
    .join("");

export const path = (d: string, a: Record<string, string | number | undefined> = {}) => `<path d="${d}"${attr(a)}/>`;
export const ellipse = (cx: number, cy: number, rx: number, ry: number, a: Record<string, string | number | undefined> = {}) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}"${attr(a)}/>`;
export const circle = (cx: number, cy: number, r: number, a: Record<string, string | number | undefined> = {}) => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}"${attr(a)}/>`;
export const g = (inner: string, a: Record<string, string | number | undefined> = {}) => (inner ? `<g${attr(a)}>${inner}</g>` : "");

/** A filled shape with its own outline color. */
export const fillLine = (fill: string, w = 2.2) => ({ fill, stroke: ink(fill), "stroke-width": w, "stroke-linejoin": "round", "stroke-linecap": "round" });

/** A smooth closed curve through points (Catmull-Rom to Bézier). */
export function smooth(pts: Pt[], closed = true, k = 1 / 6): string {
  const N = pts.length;
  const at = (i: number) => pts[closed ? (i + N) % N : Math.max(0, Math.min(N - 1, i))];
  let d = `M${p(...pts[0])}`;
  const last = closed ? N : N - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
    d += `C${p(...c1)} ${p(...c2)} ${p(...p2)}`;
  }
  return closed ? d + "Z" : d;
}

/** A stroke that tapers: a filled band along a centerline, `w0` wide at the start, `w1` at the end. */
export function taper(line: Pt[], w0: number, w1: number): string {
  const L = line.length;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < L; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(L - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (L - 1))) / 2;
    const nx = (-dy / len) * w;
    const ny = (dx / len) * w;
    left.push([line[i][0] + nx, line[i][1] + ny]);
    right.push([line[i][0] - nx, line[i][1] - ny]);
  }
  return smooth([...left, ...right.reverse()], true);
}

/** Points along a quadratic curve. */
export function qpts(a: Pt, c: Pt, b: Pt, steps = 6): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** A tiny deterministic random source from a seed (for texture that mustn't change between draws). */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

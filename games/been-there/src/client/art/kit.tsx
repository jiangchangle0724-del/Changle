// Small drawing helpers for the city posters: flat shapes in the style of 1930s travel posters.
// Everything is plain SVG so it stays sharp on any screen and costs almost nothing to download.
import type { JSX } from "preact";

type Extra = JSX.SVGAttributes<SVGElement>;

export const rect = (x: number, y: number, w: number, h: number, fill: string, extra?: Extra) => (
  <rect x={x} y={y} width={w} height={h} fill={fill} {...(extra as object)} />
);

export const path = (d: string, fill: string, extra?: Extra) => <path d={d} fill={fill} {...(extra as object)} />;

export const circle = (cx: number, cy: number, r: number, fill: string, extra?: Extra) => (
  <circle cx={cx} cy={cy} r={r} fill={fill} {...(extra as object)} />
);

export const poly = (pts: number[], fill: string, extra?: Extra) => (
  <polygon points={pts.join(" ")} fill={fill} {...(extra as object)} />
);

/** A grid of windows. */
export function windows(x: number, y: number, cols: number, rows: number, w: number, h: number, gx: number, gy: number, fill: string) {
  let d = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) d += `M${x + c * (w + gx)} ${y + r * (h + gy)}h${w}v${h}h${-w}z`;
  return <path d={d} fill={fill} />;
}

/** A row of round-topped arches (openings), bottoms on y. */
export function arches(x: number, y: number, n: number, w: number, h: number, gap: number, fill: string) {
  let d = "";
  const r = w / 2;
  for (let i = 0; i < n; i++) {
    const x0 = x + i * (w + gap);
    d += `M${x0} ${y}V${y - h + r}A${r} ${r} 0 0 1 ${x0 + w} ${y - h + r}V${y}z`;
  }
  return <path d={d} fill={fill} />;
}

/** A row of pointed (Gothic) arches. */
export function pointed(x: number, y: number, n: number, w: number, h: number, gap: number, fill: string) {
  let d = "";
  for (let i = 0; i < n; i++) {
    const x0 = x + i * (w + gap);
    const top = y - h;
    d += `M${x0} ${y}V${top + w * 0.6}Q${x0} ${top} ${x0 + w / 2} ${top}Q${x0 + w} ${top} ${x0 + w} ${top + w * 0.6}V${y}z`;
  }
  return <path d={d} fill={fill} />;
}

/** A wavy line from x0 to x1 at height y (stroke it). */
export function waveLine(x0: number, x1: number, y: number, amp: number, len: number) {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += len) d += `q${len / 4} ${-amp} ${len / 2} 0t${len / 2} 0`;
  return d;
}

/** Stroked wave lines across a band of water. */
export function ripples(x0: number, x1: number, ys: number[], amp: number, len: number, stroke: string, width = 1.6) {
  return (
    <path
      d={ys.map((y, i) => waveLine(x0 - (i % 2) * (len / 2), x1, y, amp, len)).join("")}
      fill="none"
      stroke={stroke}
      stroke-width={width}
      stroke-linecap="round"
    />
  );
}

/** Parallel diagonal lines (rain, light beams). */
export function hatch(x0: number, y0: number, x1: number, y1: number, step: number, slope: number, stroke: string, width = 1.2) {
  let d = "";
  for (let x = x0 - (y1 - y0) * slope; x < x1; x += step) d += `M${x} ${y0}l${(y1 - y0) * slope} ${y1 - y0}`;
  return (
    <g>
      <clipPath id={`h${x0}${y0}${x1}${y1}`}>
        <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
      </clipPath>
      <path d={d} stroke={stroke} stroke-width={width} clip-path={`url(#h${x0}${y0}${x1}${y1})`} />
    </g>
  );
}

/** A standing person seen from afar: head and a rounded body. */
export function person(x: number, y: number, s: number, body: string, head = body) {
  return (
    <g>
      <circle cx={x} cy={y - 7.6 * s} r={1.9 * s} fill={head} />
      <path d={`M${x - 2.2 * s} ${y}V${y - 4 * s}a${2.2 * s} ${2.2 * s} 0 0 1 ${4.4 * s} 0V${y}z`} fill={body} />
    </g>
  );
}

/** Horizontal sunset stripes cut through a disc (the Art Deco sun). */
export function decoSun(cx: number, cy: number, r: number, fill: string, cut: string, stripes: number[]) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={fill} />
      {stripes.map((y, i) => (
        <rect key={i} x={cx - r} y={cy + y} width={r * 2} height={2 + i * 0.9} fill={cut} />
      ))}
    </g>
  );
}

/** A simple conifer. */
export const pine = (x: number, y: number, h: number, fill: string) => poly([x, y - h, x + h * 0.32, y, x - h * 0.32, y], fill);

/** A palm tree bending a little. */
export function palm(x: number, y: number, h: number, trunk: string, leaf: string, lean = 6) {
  const tx = x + lean;
  const ty = y - h;
  const leaves = [
    [-14, -2],
    [-11, 6],
    [12, 5],
    [15, -3],
    [2, -9],
  ]
    .map(([dx, dy]) => `M${tx} ${ty}q${dx * 0.5} ${dy - 6} ${dx} ${dy}q${-dx * 0.4} ${-dy * 0.2 - 2} ${-dx} ${-dy}z`)
    .join("");
  return (
    <g>
      <path d={`M${x - 1.4} ${y}Q${x + lean * 0.2} ${y - h * 0.5} ${tx - 1} ${ty}h2Q${x + lean * 0.25 + 1.6} ${y - h * 0.5} ${x + 1.4} ${y}z`} fill={trunk} />
      <path d={leaves} fill={leaf} />
    </g>
  );
}

/** A fuller standing figure: head, optional cap, a tapered body, two legs. */
export function figure(x: number, y: number, s: number, o: { body: string; skin?: string; legs?: string; cap?: string; lean?: number }) {
  const skin = o.skin ?? "#c98f62";
  const legs = o.legs ?? "#1d2340";
  const lean = o.lean ?? 0;
  return (
    <g transform={lean ? `rotate(${lean} ${x} ${y})` : undefined}>
      <path d={`M${x - 3 * s} ${y}l${0.8 * s} ${-9 * s}h${1.6 * s}l${-0.4 * s} ${9 * s}zM${x + 3 * s} ${y}l${-0.8 * s} ${-9 * s}h${-1.6 * s}l${0.4 * s} ${9 * s}z`} fill={legs} />
      <path d={`M${x - 4.4 * s} ${y - 8 * s}l${1.2 * s} ${-9 * s}q${3.2 * s} ${-2 * s} ${6.4 * s} 0l${1.2 * s} ${9 * s}z`} fill={o.body} />
      <circle cx={x} cy={y - 20 * s} r={2.6 * s} fill={skin} />
      {o.cap && <path d={`M${x - 2.7 * s} ${y - 21 * s}h${5.4 * s}v${-2.2 * s}q${-2.7 * s} ${-1.4 * s} ${-5.4 * s} 0z`} fill={o.cap} />}
    </g>
  );
}

/** A small car seen from the side, with a number plate. */
export function car(x: number, y: number, w: number, color: string, plate?: string) {
  const h = w * 0.42;
  return (
    <g>
      <path d={`M${x} ${y - h * 0.35}q0 ${-h * 0.3} ${w * 0.12} ${-h * 0.32}l${w * 0.14} ${-h * 0.33}q${w * 0.04} ${-h * 0.06} ${w * 0.12} ${-h * 0.06}h${w * 0.3}q${w * 0.07} 0 ${w * 0.12} ${h * 0.06}l${w * 0.12} ${h * 0.33}q${w * 0.08} ${h * 0.02} ${w * 0.08} ${h * 0.32}v${h * 0.35}h${-w}z`} fill={color} />
      <path d={`M${x + w * 0.29} ${y - h * 0.68}l${w * 0.08} ${-h * 0.22}h${w * 0.2}v${h * 0.22}zM${x + w * 0.6} ${y - h * 0.68}v${-h * 0.22}h${w * 0.12}l${w * 0.09} ${h * 0.22}z`} fill="#cfe3ea" />
      <circle cx={x + w * 0.22} cy={y} r={h * 0.2} fill="#1d2340" />
      <circle cx={x + w * 0.78} cy={y} r={h * 0.2} fill="#1d2340" />
      {plate && (
        <g>
          <rect x={x + w * 0.4} y={y - h * 0.3} width={w * 0.22} height={h * 0.2} fill="#f4ead5" stroke="#1d2340" stroke-width="0.8" />
          <text x={x + w * 0.51} y={y - h * 0.14} font-size={h * 0.18} font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill="#1d2340">
            {plate}
          </text>
        </g>
      )}
    </g>
  );
}

/** A mosque skyline unit: a main dome with half domes and two minarets. */
export function mosque(x: number, y: number, s: number, fill: string) {
  const d =
    `M${x - 30 * s} ${y}v${-14 * s}h${8 * s}a${7 * s} ${6 * s} 0 0 1 ${12 * s} 0h${2 * s}v${-6 * s}a${8 * s} ${10 * s} 0 0 1 ${16 * s} 0v${6 * s}h${2 * s}a${7 * s} ${6 * s} 0 0 1 ${12 * s} 0h${8 * s}v${14 * s}z` +
    `M${x - 1 * s} ${y - 30 * s}h${2 * s}v${-4 * s}h${-2 * s}z` +
    `M${x - 37 * s} ${y}v${-34 * s}l${2 * s} ${-6 * s}l${2 * s} ${6 * s}v${34 * s}z` +
    `M${x + 33 * s} ${y}v${-34 * s}l${2 * s} ${-6 * s}l${2 * s} ${6 * s}v${34 * s}z`;
  return <path d={d} fill={fill} />;
}

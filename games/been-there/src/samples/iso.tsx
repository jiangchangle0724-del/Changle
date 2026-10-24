// Style sample B, "souvenir diorama": every city a little isometric model, like a fridge magnet or the
// base of a snow globe. Only used on the step-5 style sheet.
import type { JSX } from "preact";

type P3 = [number, number, number];
const C30 = 0.8660254;
const iso = ([x, y, z]: P3): [number, number] => [(x - y) * C30, (x + y) * 0.5 - z];
const pts = (list: P3[]) =>
  list
    .map(iso)
    .map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`)
    .join(" ");

/** An axis-aligned box: top, front-left (y + d) and front-right (x + w) faces. */
function box(x: number, y: number, z: number, w: number, d: number, h: number, [top, left, right]: string[]) {
  return (
    <g>
      <polygon points={pts([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]])} fill={right} />
      <polygon points={pts([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={left} />
      <polygon points={pts([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]])} fill={top} />
    </g>
  );
}

function pyramid(x: number, y: number, z: number, w: number, d: number, h: number, left: string, right: string) {
  const apex: P3 = [x + w / 2, y + d / 2, z + h];
  return (
    <g>
      <polygon points={pts([[x + w, y, z], [x + w, y + d, z], apex])} fill={right} />
      <polygon points={pts([[x, y + d, z], [x + w, y + d, z], apex])} fill={left} />
    </g>
  );
}

/** Arched openings on the front-left face (the plane y = y0). */
function archesLeft(x0: number, y0: number, z0: number, n: number, w: number, h: number, gap: number, fill: string) {
  const out: JSX.Element[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (w + gap);
    const [ax, ay] = iso([x, y0, z0]);
    const [bx, by] = iso([x + w, y0, z0]);
    const [cx, cy] = iso([x + w, y0, z0 + h - w / 2]);
    const [dx, dy] = iso([x, y0, z0 + h - w / 2]);
    const [tx, ty] = iso([x + w / 2, y0, z0 + h + 1]);
    out.push(<path key={i} d={`M${ax} ${ay}L${bx} ${by}L${cx} ${cy}Q${tx} ${ty - 2} ${dx} ${dy}Z`} fill={fill} />);
  }
  return out;
}

export function IsoVenice() {
  const water = ["rgba(104,204,214,.86)", "rgba(80,184,196,.9)", "rgba(66,168,182,.9)"];
  return (
    <svg viewBox="-128 -150 256 236" class="iso-svg" aria-hidden="true">
      <ellipse cx="0" cy="74" rx="118" ry="16" fill="rgba(60,40,80,.12)" />
      {box(0, 0, 0, 120, 120, 12, ["#f6e6d2", "#ebcfb2", "#dcbb98"])}
      {/* campanile, back corner */}
      {box(8, 8, 12, 22, 22, 74, ["#f19d84", "#e8846b", "#d36d56"])}
      {box(6, 6, 86, 26, 26, 18, ["#fff1e4", "#f6dcc6", "#ebcab0"])}
      {archesLeft(10, 32, 88, 3, 5, 13, 2.6, "#a9584c")}
      {box(5, 5, 104, 28, 28, 4, ["#fff6ec", "#f2dcc6", "#e6c9ad"])}
      {pyramid(6, 6, 108, 26, 26, 30, "#6ccfab", "#4fb893")}
      {/* the palace */}
      {box(40, 6, 12, 74, 30, 46, ["#ffe4de", "#f8bdb3", "#eaa79c"])}
      {archesLeft(44, 36, 12, 8, 6, 15, 2.6, "#b06a63")}
      {archesLeft(44, 36, 34, 8, 6, 14, 2.6, "#c98179")}
      {Array.from({ length: 12 }, (_, i) => box(41 + i * 6.2, 6, 58, 3, 3, 4, ["#fff4ef", "#f6d6cf", "#eac2ba"]))}
      {/* the flood */}
      {box(0, 0, 12, 120, 120, 6, water)}
      {/* raised walkway and people */}
      {[44, 66, 88, 108].map((x) => box(x, 70, 12, 2, 2, 9, ["#b78a5a", "#a87b4d", "#946b40"]))}
      {box(40, 68, 21, 74, 8, 2.4, ["#e7c08e", "#d8ac77", "#c59a66"])}
      {[
        [58, 72, "#5a6bd8"],
        [76, 72, "#ff7a6b"],
        [96, 72, "#2fb08a"],
      ].map(([x, y, c], i) => (
        <g key={i}>
          {box(x as number, y as number, 23.4, 4, 4, 9, [c as string, c as string, c as string])}
          <circle cx={iso([(x as number) + 2, (y as number) + 2, 36])[0]} cy={iso([(x as number) + 2, (y as number) + 2, 36])[1]} r="3.4" fill="#ffd9b8" />
        </g>
      ))}
      {/* gondola */}
      <path d="M-10 66Q8 80 44 70Q60 64 66 54Q56 62 40 64Q12 68-10 66Z" fill="#2c2a4a" />
      <path d="M62 52l6-6M64 54l7-4" stroke="#fff" stroke-width="2" stroke-linecap="round" />
      {/* tide pole */}
      <path d="M-104 30V-6" stroke="#fff" stroke-width="4" />
      <path d="M-104 30V22M-104 14V6" stroke="#ff7a6b" stroke-width="4" />
      <rect x="-122" y="-16" width="36" height="13" rx="6.5" fill="#fff" />
      <text x="-104" y="-6.5" font-size="9" font-family="'Baloo 2',system-ui" font-weight="800" text-anchor="middle" fill="#2c2a4a">
        110cm
      </text>
      {/* speech bubble */}
      <g transform="translate(-74 -120)">
        <rect x="0" y="0" width="58" height="28" rx="14" fill="#fff" />
        <path d="M30 26l10 12l-2-12z" fill="#fff" />
        <text x="29" y="19.5" font-size="15" font-family="'Baloo 2',system-ui" font-weight="800" text-anchor="middle" fill="#2c2a4a">
          Ciao!
        </text>
      </g>
    </svg>
  );
}

/** A corner of the board: a row of tile blocks; owned ones carry a tiny house. */
export function IsoBoard() {
  const row: { color: string; owned?: string; label: string }[] = [
    { color: "#cc79a7", label: "IST" },
    { color: "#cc79a7", label: "BOM", owned: "#ff7a6b" },
    { color: "#cc79a7", label: "DXB" },
    { color: "#c9c2d6", label: "✈" },
    { color: "#e69f00", label: "LAS", owned: "#5a6bd8" },
  ];
  const col: { color: string; owned?: string; label: string }[] = [
    { color: "#e69f00", label: "YVR" },
    { color: "#e69f00", label: "NYC", owned: "#5a6bd8" },
    { color: "#c9c2d6", label: "☕" },
  ];
  const tile = (x: number, y: number, t: { color: string; owned?: string; label: string }, key: string) => (
    <g key={key}>
      {box(x, y, 0, 26, 26, 8, ["#fff6ec", t.color, t.color])}
      {t.owned ? (
        <>
          {box(x + 8, y + 8, 8, 10, 10, 9, [t.owned, t.owned, t.owned])}
          {pyramid(x + 7, y + 7, 17, 12, 12, 7, "#fff", "#eee")}
        </>
      ) : (
        <text x={iso([x + 13, y + 13, 8])[0]} y={iso([x + 13, y + 13, 8])[1] + 3.5} font-size="9" font-family="'Baloo 2',system-ui" font-weight="800" text-anchor="middle" fill="#2c2a4a">
          {t.label}
        </text>
      )}
    </g>
  );
  return (
    <svg viewBox="-150 -50 300 170" class="iso-svg" aria-hidden="true">
      {col
        .map((t, i) => tile(0, -30 * (i + 1), t, `c${i}`))
        .reverse()}
      {row.map((t, i) => tile(30 * i, 0, t, `r${i}`))}
      <g>
        {box(66, 4, 8, 16, 12, 20, ["#ffcf7a", "#ffb547", "#f19d1c"])}
        <circle cx={iso([71, 16, 22])[0]} cy={iso([71, 16, 22])[1]} r="1.8" fill="#2c2a4a" />
        <circle cx={iso([77, 16, 22])[0]} cy={iso([77, 16, 22])[1]} r="1.8" fill="#2c2a4a" />
      </g>
    </svg>
  );
}

/** The suitcase character as a chunky vinyl toy. */
export function IsoSuitcase() {
  return (
    <svg viewBox="-60 -80 120 120" class="iso-svg" aria-hidden="true">
      <ellipse cx="0" cy="28" rx="36" ry="9" fill="rgba(60,40,80,.14)" />
      {box(-22, -8, 0, 44, 18, 44, ["#ffcf7a", "#ffb547", "#f19d1c"])}
      {box(-8, -2, 44, 16, 4, 8, ["#8a5a2e", "#7a4a20", "#6a3a14"])}
      <circle cx={iso([-10, 10, 28])[0]} cy={iso([-10, 10, 28])[1]} r="4" fill="#2c2a4a" />
      <circle cx={iso([6, 10, 28])[0]} cy={iso([6, 10, 28])[1]} r="4" fill="#2c2a4a" />
      <circle cx={iso([-9, 10, 29])[0]} cy={iso([-9, 10, 29])[1]} r="1.4" fill="#fff" />
      <circle cx={iso([7, 10, 29])[0]} cy={iso([7, 10, 29])[1]} r="1.4" fill="#fff" />
      <path d={`M${iso([-6, 10, 20])[0]} ${iso([-6, 10, 20])[1]}q4 5 9 0`} stroke="#2c2a4a" stroke-width="2.4" fill="none" stroke-linecap="round" />
      {box(-14, 4, -10, 6, 6, 10, ["#2c2a4a", "#2c2a4a", "#2c2a4a"])}
      {box(10, 4, -10, 6, 6, 10, ["#2c2a4a", "#2c2a4a", "#2c2a4a"])}
      <circle cx={iso([18, 0, 36])[0]} cy={iso([18, 0, 36])[1]} r="6" fill="#7fd6ff" />
    </svg>
  );
}

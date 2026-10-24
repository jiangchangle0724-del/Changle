// City posters, part 1: Cairo, Buenos Aires, Mexico City, Rio de Janeiro, Istanbul, Mumbai.
import { arches, car, circle, decoSun, figure, mosque, palm, path, poly, rect, ripples, windows } from "./kit";

const INK = "#1d2340";
const CREAM = "#f4ead5";

export function cairo() {
  const pyramid = (x: number, base: number, w: number, h: number, lit: string, shade: string, steps: number) => (
    <g>
      {poly([x - w / 2, base, x, base - h, x + w * 0.08, base], lit)}
      {poly([x, base - h, x + w / 2, base, x + w * 0.08, base], shade)}
      <path
        d={Array.from({ length: steps }, (_, i) => {
          const y = base - (h * (i + 1)) / (steps + 1);
          const half = (w / 2) * (1 - (i + 1) / (steps + 1));
          return `M${x - half} ${y}H${x + half * 1.0}`;
        }).join("")}
        stroke="rgba(90,56,24,.35)"
        stroke-width="1.2"
      />
    </g>
  );
  return (
    <g>
      {rect(0, 0, 300, 90, "#ef9f45")}
      {rect(0, 90, 300, 80, "#f4b862")}
      {rect(0, 170, 300, 70, "#f8d08c")}
      {decoSun(160, 190, 74, "#fbe6bd", "#f8d08c", [8, 20, 31, 41, 50])}
      {pyramid(112, 246, 190, 132, "#e7b56b", "#b8874a", 9)}
      {pyramid(222, 246, 130, 92, "#e3ae63", "#b07f43", 6)}
      {pyramid(280, 246, 70, 46, "#dda65c", "#a87a40", 3)}
      {/* the desert */}
      {path("M0 246H300V375H0z", "#e9c27c")}
      {path("M0 270q60-20 120-4t110 0t70-6V375H0z", "#e1b46b")}
      {path("M0 318q80-26 160-8t140 4V375H0z", "#d6a45d")}
      {/* the Nile with a felucca */}
      {path("M0 300q90 14 180 6t120 10v18q-50-10-120-2T0 318z", "#3f8fa6")}
      {ripples(10, 290, [309, 318], 1.4, 16, "#7cc0d0", 1.2)}
      {path("M60 306h44q-4 8-22 8q-16 0-22-8z", "#5b3a24")}
      {path("M82 304V258l20 44z", CREAM)}
      {path("M80 304L70 270L82 262z", "#efe2c8")}
      {palm(18, 300, 52, "#5b3a24", "#3b6a4a", 4)}
      {palm(36, 302, 40, "#5b3a24", "#47785a", -3)}
      {/* camels crossing the dunes */}
      {[
        [150, 274],
        [182, 276],
      ].map(([x, y], i) => (
        <g key={i} fill="#5b3a24">
          <path d={`M${x} ${y}h4v-10q2-6 8-6q4-8 10-2q4-4 8 2h4q6 0 8 6l-2 4h-3v6h3v4h-4v-8h-14v8h-4z`} />
          <path d={`M${x + 1} ${y - 10}l-6-8l-2 2l5 9z`} />
          <circle cx={x + 18} cy={y - 21} r="2.4" />
        </g>
      ))}
      {/* houses stacked like a pyramid: they stand forever here */}
      {[
        [212, 352, "#f4ead5"],
        [236, 352, "#e8c3a1"],
        [260, 352, "#dfe5d3"],
        [224, 332, "#efd5b5"],
        [248, 332, "#f4ead5"],
        [236, 312, "#e8c3a1"],
      ].map(([x, y, c], i) => (
        <g key={i}>
          {rect(x as number, y as number, 22, 18, c as string, { stroke: INK, "stroke-width": 1.4 })}
          {poly([(x as number) - 2, y as number, (x as number) + 11, (y as number) - 9, (x as number) + 24, y as number], "#c8432b", { stroke: INK, "stroke-width": 1.4 })}
          {rect((x as number) + 8, (y as number) + 7, 6, 11, INK)}
        </g>
      ))}
    </g>
  );
}

export function buenosaires() {
  const houses = [
    [0, 150, 52, "#e8c547"],
    [52, 168, 46, "#3f8fa6"],
    [98, 140, 40, "#c8432b"],
    [138, 160, 50, "#2f7d6d"],
    [188, 146, 44, "#e98b6d"],
    [232, 162, 68, "#5a6bd8"],
  ];
  return (
    <g>
      {rect(0, 0, 300, 100, "#3d3a6b")}
      {rect(0, 100, 300, 60, "#5a4f86")}
      {rect(0, 160, 300, 80, "#e98b6d")}
      {circle(236, 70, 22, "#f6e7c4")}
      {/* La Boca's tin houses */}
      {houses.map(([x, top, w, c], i) => (
        <g key={i}>
          {rect(x as number, top as number, w as number, 290 - (top as number), c as string)}
          {windows((x as number) + 7, (top as number) + 14, 2, 3, 10, 14, (w as number) - 34, 12, "#1d2340")}
          {rect((x as number) + 2, (top as number) + 34, (w as number) - 4, 3, CREAM)}
          <path d={Array.from({ length: Math.floor((w as number) / 6) }, (_, k) => `M${(x as number) + 3 + k * 6} ${top}v${290 - (top as number)}`).join("")} stroke="rgba(0,0,0,.12)" stroke-width="1" />
        </g>
      ))}
      {/* cobbles */}
      {rect(0, 290, 300, 85, "#6b5a5e")}
      <path d={Array.from({ length: 5 }, (_, r) => Array.from({ length: 16 }, (_, c) => `M${c * 20 + (r % 2) * 10} ${296 + r * 16}h16v12h-16z`).join("")).join("")} fill="#7b6a6c" />
      {/* street lamp */}
      {rect(36, 196, 5, 98, INK)}
      {path("M28 196h21l-4-14h-13z", INK)}
      {circle(38.5, 190, 22, "rgba(246,208,138,.35)")}
      {circle(38.5, 190, 6, "#f6d08a")}
      {/* the tango: a step that changes places */}
      <g transform="translate(160 292)">
        <path d="M-30 0l6-36l-4-26q8-12 20-6l4 30l-2 38h-6l-2-30l-6 30z" fill={INK} />
        <circle cx="-12" cy="-74" r="8" fill="#e2b08a" />
        <path d="M-20 -78q8-8 16 0z" fill={INK} />
        <path d="M-4 -58q14-6 22-2" stroke={INK} stroke-width="5" stroke-linecap="round" fill="none" />
        <path d="M12 -64q10-4 16 4l10 30q-4 6-12 4l-4 26h-4l-2-22q-8 10-26 14l-2-4q14-8 20-20z" fill="#c8432b" />
        <circle cx="22" cy="-72" r="7.5" fill="#e2b08a" />
        <circle cx="27" cy="-76" r="5" fill={INK} />
        <path d="M-22 0l-14 2M8 -2l18 -6" stroke={INK} stroke-width="3" stroke-linecap="round" />
      </g>
      {/* fileteado swirls in the corners */}
      <path d="M8 14q20-4 26 12q4 14-10 14q-10 0-8-10q2-6 8-4M292 14q-20-4-26 12q-4 14 10 14q10 0 8-10q-2-6-8-4" fill="none" stroke="#f0c75e" stroke-width="2.6" stroke-linecap="round" />
      <path d="M44 12q18 6 34 0M256 12q-18 6-34 0" fill="none" stroke="#f0c75e" stroke-width="2" stroke-linecap="round" />
    </g>
  );
}

export function mexicocity() {
  const flags = ["#e88aa8", "#e8c547", "#3f8fa6", "#2f9e6e", "#c8432b", "#f08a4b", "#8a6fc9"];
  return (
    <g>
      {rect(0, 0, 300, 120, "#5fb7c6")}
      {rect(0, 120, 300, 70, "#86cad4")}
      {rect(0, 190, 300, 40, "#b6dfe1")}
      {/* Popocatépetl and Iztaccíhuatl */}
      {poly([0, 230, 70, 168, 120, 210, 150, 196, 200, 230], "#9aa9b8")}
      {path("M58 178L70 168L84 180L76 184L70 178L64 184z", "#f6f3ec")}
      {poly([150, 230, 240, 160, 300, 220, 300, 230], "#8b9cad")}
      {path("M226 172L240 160L256 174L248 178L240 170L232 178z", "#f6f3ec")}
      {/* the Angel of Independence */}
      {rect(178, 120, 12, 120, "#efe3c8")}
      {[132, 160, 190, 214].map((y) => rect(175, y, 18, 4, "#d9c9a8"))}
      {rect(170, 236, 28, 10, "#d9c9a8")}
      {path("M184 98q-8 4-14 0q6 6 12 4l-2 16h8l-2-16q6 2 12-4q-6 4-14 0z", "#e3a72f")}
      {circle(184, 96, 3, "#e3a72f")}
      {/* traffic */}
      {rect(0, 244, 300, 131, "#5b5f6a")}
      <path d="M0 300h40M60 300h40M120 300h40M180 300h40M240 300h40" stroke="#e8e2d4" stroke-width="3" />
      {car(6, 284, 70, "#e88aa8", "37")}
      {car(84, 284, 70, "#2f7d6d", "12")}
      {car(162, 286, 70, "#e8c547", "5")}
      {car(14, 352, 74, "#c8432b", "6")}
      {car(110, 352, 74, "#3f8fa6", "48")}
      {/* today: no plates ending in 5 or 6 */}
      {circle(244, 330, 34, "#fff", { stroke: "#c8432b", "stroke-width": 7 })}
      <text x="244" y="341" font-size="30" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={INK}>
        5·6
      </text>
      {path("M220 306L268 354", "none", { stroke: "#c8432b", "stroke-width": 7 })}
      {rect(241, 364, 6, 11, "#5b5f6a")}
      {/* papel picado */}
      <path d="M0 10Q150 30 300 10" stroke={INK} stroke-width="1.2" fill="none" />
      {flags.concat(flags).slice(0, 12).map((c, i) => {
        const x = 4 + i * 25;
        const y = 12 + Math.sin((i / 11) * Math.PI) * 9;
        return (
          <g key={i}>
            {path(`M${x} ${y}h20v20l-4-3l-3 3l-3-3l-3 3l-3-3l-4 3z`, c)}
            {circle(x + 10, y + 9, 3, "#86cad4")}
          </g>
        );
      })}
    </g>
  );
}

export function rio() {
  return (
    <g>
      {rect(0, 0, 300, 90, "#f2795c")}
      {rect(0, 90, 300, 80, "#f5a25d")}
      {rect(0, 170, 300, 70, "#f8c66f")}
      {/* Sugarloaf and its little sister */}
      {path("M120 240Q124 110 186 104Q240 108 246 240z", "#3f6b4f")}
      {path("M186 104Q240 108 246 240h-34Q214 140 186 104z", "#345a42")}
      {path("M40 240Q50 180 92 176Q120 182 128 240z", "#4a7a5a")}
      <path d="M92 178L186 106" stroke={INK} stroke-width="1.2" />
      {rect(136, 136, 12, 9, "#c8432b", { rx: 2 })}
      {/* bay */}
      {rect(0, 236, 300, 54, "#2d8fb0")}
      {ripples(0, 300, [248, 262, 276], 2, 20, "#79c4dc", 1.4)}
      {/* Copacabana's wave pavement */}
      {rect(0, 290, 300, 85, CREAM)}
      <path d={Array.from({ length: 4 }, (_, i) => `M0 ${304 + i * 20}q25-14 50 0t50 0t50 0t50 0t50 0t50 0v8q-25 14-50 0t-50 0t-50 0t-50 0t-50 0t-50 0z`).join("")} fill={INK} />
      {/* a samba dancer's feather fan */}
      <g transform="translate(62 300)">
        {Array.from({ length: 9 }, (_, i) => {
          const a = -80 + i * 20;
          return <path key={i} d="M0 0q-8-40 0-78q8 38 0 78z" fill={["#e8c547", "#c8432b", "#2f9e6e"][i % 3]} transform={`rotate(${a})`} />;
        })}
        {circle(0, -2, 10, "#e3a72f")}
        <path d="M-12 0q12 30 24 0" fill="#c8432b" />
      </g>
      {/* the judges' cards: the lowest is dropped */}
      {[
        ["10", 196, -8],
        ["9", 232, 2],
        ["7", 268, 10],
      ].map(([n, x, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} 300)`}>
          {rect((x as number) - 1.5, 300, 3, 40, "#5b3a24")}
          {rect((x as number) - 15, 266, 30, 34, CREAM, { stroke: INK, "stroke-width": 2, rx: 2 })}
          <text x={x} y="291" font-size="20" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={i === 2 ? "#9a9488" : INK}>
            {n}
          </text>
          {i === 2 && path(`M${(x as number) - 14} 268L${(x as number) + 14} 298`, "none", { stroke: "#c8432b", "stroke-width": 3 })}
        </g>
      ))}
      {/* confetti */}
      {[
        [30, 30, "#e8c547"],
        [80, 60, "#2f9e6e"],
        [250, 40, "#e8c547"],
        [210, 70, "#5a6bd8"],
        [140, 30, "#2f9e6e"],
        [276, 120, "#5a6bd8"],
        [20, 140, "#5a6bd8"],
      ].map(([x, y, c], i) => rect(x as number, y as number, 6, 3, c as string, { transform: `rotate(${i * 37} ${x} ${y})` }))}
    </g>
  );
}

export function istanbul() {
  return (
    <g>
      {rect(0, 0, 300, 100, "#e39a76")}
      {rect(0, 100, 300, 70, "#eeb88b")}
      {rect(0, 170, 300, 60, "#f5d7ae")}
      {circle(150, 150, 30, "#fbe9cf")}
      {/* Europe: domes and minarets, Galata Tower */}
      {mosque(70, 226, 1.3, "#5a4a6e")}
      {rect(0, 226, 132, 10, "#5a4a6e")}
      {rect(118, 176, 12, 50, "#6b5a7d")}
      {path("M116 176l8-18l8 18z", "#4a3c5c")}
      {/* Asia: a lower shore and the Maiden's Tower */}
      {path("M188 236V218q20-8 40-4q30-6 72 0v22z", "#6b5a7d")}
      {rect(240, 206, 10, 14, "#7d6b8f")}
      {path("M238 206l7-10l7 10z", "#5a4a6e")}
      {/* the Bosphorus */}
      {rect(0, 236, 300, 139, "#3a6f92")}
      {ripples(0, 300, [250, 266, 284, 304], 1.8, 18, "#7fb2cf", 1.3)}
      {/* a ferry crossing between the continents */}
      {path("M114 268h76l-8 14h-60z", CREAM)}
      {rect(126, 256, 50, 12, CREAM)}
      {windows(130, 259, 6, 1, 5, 5, 3, 0, "#3a6f92")}
      {rect(146, 246, 8, 10, "#e3a72f")}
      {rect(114, 272, 76, 3, "#c8432b")}
      {/* signpost */}
      {rect(146, 296, 8, 79, "#5b3a24")}
      {path("M62 306h82v24H62l-12-12z", CREAM, { stroke: INK, "stroke-width": 2 })}
      {path("M156 306h82l12 12l-12 12h-82z", CREAM, { stroke: INK, "stroke-width": 2 })}
      <text x="100" y="324" font-size="15" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={INK}>
        AVRUPA
      </text>
      <text x="198" y="324" font-size="15" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={INK}>
        ASYA
      </text>
      {/* gulls */}
      <path d="M60 60q6-6 12 0q6-6 12 0M196 44q5-5 10 0q5-5 10 0M226 80q4-4 8 0q4-4 8 0" fill="none" stroke={INK} stroke-width="2" stroke-linecap="round" />
    </g>
  );
}

export function mumbai() {
  const tiffin = (x: number, y: number, s: number, lid: string) => (
    <g>
      {rect(x - 6 * s, y - 20 * s, 12 * s, 20 * s, "#d9dde0", { rx: 2 * s })}
      <path d={`M${x - 6 * s} ${y - 13.5 * s}h${12 * s}M${x - 6 * s} ${y - 7 * s}h${12 * s}`} stroke="#9aa3aa" stroke-width={1.2 * s} />
      {rect(x - 6.5 * s, y - 22 * s, 13 * s, 3 * s, lid, { rx: 1.5 * s })}
      <path d={`M${x - 4 * s} ${y - 22 * s}q${4 * s} ${-6 * s} ${8 * s} 0`} fill="none" stroke="#9aa3aa" stroke-width={1.4 * s} />
    </g>
  );
  return (
    <g>
      {rect(0, 0, 300, 90, "#f2c46a")}
      {rect(0, 90, 300, 70, "#f6d58c")}
      {rect(0, 160, 300, 50, "#f8e3b4")}
      {/* the old terminus: a Gothic dome and turrets */}
      {rect(70, 120, 160, 90, "#c9a46a")}
      {path("M120 120V96q30-44 60 0v24z", "#b88f55")}
      {path("M144 64h12l-6-18z", "#b88f55")}
      {rect(146, 64, 8, 12, "#b88f55")}
      {[70, 214].map((x) => path(`M${x} 120v-30l8-14l8 14v30z`, "#b88f55"))}
      {pointedWindows()}
      {/* the local train */}
      {rect(0, 210, 300, 40, "#e9dcc0")}
      {rect(0, 228, 300, 6, "#8f2e3e")}
      {windows(8, 216, 14, 1, 12, 9, 9.2, 0, "#3a3f4f")}
      {rect(0, 250, 300, 6, "#5b5f6a")}
      {/* street */}
      {rect(0, 256, 300, 119, "#d8b483")}
      {/* dabbawalas in white caps, one carrying a crate of lunches on his head */}
      {rect(36, 248, 70, 14, "#9b6a3a")}
      {[44, 58, 72, 86, 98].map((x, i) => tiffin(x, 248, 0.6, ["#c8432b", "#2f7d6d", "#e3a72f", "#3f6fb0", "#c8432b"][i]))}
      {figure(70, 352, 3.6, { body: "#f4f1e8", cap: "#f4f1e8", legs: "#e9e4d6" })}
      <path d="M58 286l-10-22M82 286l10-22" stroke="#c98f62" stroke-width="5" stroke-linecap="round" />
      {/* bicycle loaded with tiffins */}
      <g>
        {circle(180, 344, 18, "none", { stroke: INK, "stroke-width": 3 })}
        {circle(250, 344, 18, "none", { stroke: INK, "stroke-width": 3 })}
        <path d="M180 344l24-28h30l16 28M204 316l12 28l18-28M234 316l-4-12h-8" fill="none" stroke={INK} stroke-width="3" stroke-linejoin="round" />
        {[188, 202, 216, 230, 244].map((x, i) => tiffin(x, 312, 0.75, ["#2f7d6d", "#c8432b", "#3f6fb0", "#e3a72f", "#2f7d6d"][i]))}
        {[195, 209, 223, 237].map((x, i) => tiffin(x, 296, 0.75, ["#e3a72f", "#3f6fb0", "#c8432b", "#2f7d6d"][i]))}
      </g>
      {figure(150, 358, 3.4, { body: "#f4f1e8", cap: "#f4f1e8", legs: "#e9e4d6" })}
    </g>
  );
}

function pointedWindows() {
  return (
    <g fill="#5b3a24">
      {[86, 106, 186, 206].map((x) => (
        <path key={x} d={`M${x} 196v-26q4-8 8 0v26z`} />
      ))}
      {arches(126, 206, 4, 10, 22, 2.5, "#5b3a24")}
    </g>
  );
}

// City posters in the style of 1930s travel posters. Each one is built around the city's rule in the
// game, so the picture reminds players what happens there (Venice floods, Tokyo's trains are packed).
// Drawn as plain shapes: no photos, no fonts beyond a few numerals, so every poster is our own work.
// Landmarks are old public buildings or nature; modern buildings whose designs are still protected
// (and trademarks such as Singapore's Merlion) are left out.
import type { JSX } from "preact";
import { arches, circle, decoSun, hatch, palm, path, person, pointed, poly, rect, ripples, windows } from "./kit";
import { buenosaires, cairo, istanbul, mexicocity, mumbai, rio } from "./posters-1";
import { beijing, dubai, lasvegas, newyork, shanghai, vancouver } from "./posters-2";
import { bangkok, london, paris, seoul, singapore, sydney } from "./posters-3";

export const POSTER_W = 300;
export const POSTER_H = 375;

const INK = "#1d2340";
const CREAM = "#f4ead5";

function venice() {
  return (
    <g>
      {rect(0, 0, 300, 70, "#eda76c")}
      {rect(0, 70, 300, 70, "#f1bb84")}
      {rect(0, 140, 300, 100, "#f5cd9b")}
      {decoSun(206, 168, 60, "#fbe8c6", "#f5cd9b", [14, 26, 37, 47])}
      {/* MOSE flood gates rising out of the lagoon on the horizon */}
      {rect(0, 232, 300, 16, "#6aa3ab")}
      {Array.from({ length: 16 }, (_, i) => poly([i * 19 + 2, 236, i * 19 + 12, 222, i * 19 + 17, 222, i * 19 + 9, 236], i % 2 ? "#e3a72f" : "#d39722"))}
      {/* Doge's Palace */}
      {rect(104, 150, 196, 56, "#e8b6a3")}
      <path
        d={Array.from({ length: 7 }, (_, r) => Array.from({ length: 20 }, (_, c) => `M${108 + c * 10 + (r % 2) * 5} ${153 + r * 7.5}l4 3.5l-4 3.5l-4-3.5z`).join("")).join("")}
        fill="#f2cdbd"
      />
      {Array.from({ length: 24 }, (_, i) => rect(104 + i * 8.2, 145, 4.4, 6, "#f4e3cc"))}
      {pointed(122, 192, 5, 14, 30, 22, "#7a3b33")}
      {rect(104, 206, 196, 28, CREAM)}
      {pointed(108, 232, 15, 8, 20, 4.9, "#6c3a33")}
      {rect(104, 232, 196, 30, "#efe1c7")}
      {arches(110, 262, 7, 18, 26, 9.5, "#5a2f2a")}
      {/* Campanile of St Mark's */}
      {rect(36, 112, 42, 150, "#b8432f")}
      {[44, 52, 60, 68].map((x) => rect(x, 116, 3, 146, "#9a3524"))}
      {rect(32, 86, 50, 26, CREAM)}
      {arches(38, 110, 3, 9, 20, 6.5, "#5a2f2a")}
      {rect(30, 82, 54, 5, "#e9dcc2")}
      {rect(34, 66, 46, 16, "#c24b35")}
      {circle(57, 74, 4.5, "#e7c27a")}
      {poly([34, 66, 57, 22, 80, 66], "#2f7d6d")}
      {poly([57, 22, 80, 66, 66, 66], "#276b5d")}
      {path("M55 22l2-8l2 8z M53 18h8v2h-8z", "#e3a72f")}
      {/* acqua alta: the square is under water */}
      {rect(0, 246, 300, 129, "#2f7f8c")}
      {[118, 145, 172, 200, 227, 254, 281].map((x) => rect(x - 1, 262, 16, 34, "#286f7b"))}
      {ripples(0, 300, [256, 272, 290, 312, 336, 360], 2.4, 22, "#78b6bc")}
      {/* raised walkway (passerelle) with people crossing */}
      {rect(140, 257, 160, 5, "#d9b98a")}
      {[146, 176, 206, 236, 266, 294].map((x) => rect(x, 262, 3, 10, "#a88456"))}
      {person(178, 257, 1.3, INK)}
      {person(196, 257, 1.2, "#7a3b33")}
      {person(250, 257, 1.3, INK)}
      {/* gondola */}
      <path d="M8 318Q18 334 60 336H184Q214 334 226 312Q216 322 186 324H62Q30 324 8 318z" fill={INK} />
      <path d="M220 302h5l3 10l-4 1zm4 3h8M224 309h8M223 313h8" stroke="#ece4d0" stroke-width="2.2" fill="#ece4d0" />
      {rect(44, 286, 9, 30, CREAM)}
      {[289, 295, 301, 307].map((y) => rect(44, y, 9, 3, INK))}
      {circle(48.5, 281, 5, "#f0cfb2")}
      {rect(40, 274, 17, 3, "#e8c46e")}
      {rect(43, 270, 11, 5, "#e8c46e")}
      {rect(43, 272.6, 11, 1.4, "#c8432b")}
      <path d="M52 296L104 352" stroke="#6b4a2b" stroke-width="2.6" stroke-linecap="round" />
      {/* tide gauge */}
      {rect(262, 268, 8, 107, CREAM)}
      {[276, 296, 316, 336, 356].map((y) => rect(262, y, 8, 10, "#c8432b"))}
      {rect(250, 294, 32, 14, CREAM, { rx: 2 })}
      <text x="266" y="304.5" font-size="10" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={INK}>
        110
      </text>
    </g>
  );
}

function tokyo() {
  const faces = (x: number, y: number, cols: number, rows: number, seed: number) => {
    const out: JSX.Element[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cx = x + c * 10.5 + (r % 2) * 5;
        const cy = y + r * 11;
        const k = (seed + r * 7 + c * 3) % 5;
        out.push(circle(cx, cy, 6.2, k === 0 ? "#f3d9bf" : k === 1 ? "#e9c39f" : "#f0cfb2"));
        out.push(path(`M${cx - 6.2} ${cy}a6.2 6.2 0 0 1 12.4 0q-6.2-2.6-12.4 0z`, k === 3 ? "#5b3a24" : "#26293b"));
      }
    return out;
  };
  return (
    <g>
      {rect(0, 0, 300, 80, "#f6e2c8")}
      {rect(0, 80, 300, 60, "#f4d0b2")}
      {rect(0, 140, 300, 30, "#efb898")}
      {circle(72, 108, 34, "#d9533c")}
      {poly([150, 170, 226, 92, 300, 160, 300, 170], "#8ea4ba")}
      {path("M209 109L226 92L244 108L238 113L232 106L226 114L219 107L214 113z", "#f8f3ea")}
      {[
        [0, 150, 26, 20],
        [24, 156, 18, 14],
        [40, 146, 22, 24],
        [60, 158, 30, 12],
        [94, 152, 20, 18],
        [112, 160, 26, 10],
      ].map(([x, y, w, h]) => rect(x, y, w, h, "#dcc4b4"))}
      {/* the train at the platform */}
      {rect(-4, 166, 308, 8, "#c6cbcf", { rx: 4 })}
      {rect(-4, 172, 308, 114, "#e4e7ea")}
      {rect(-4, 254, 308, 7, "#d55e00")}
      {rect(-4, 270, 308, 16, "#c9ced2")}
      {rect(6, 184, 74, 52, INK, { rx: 4 })}
      {rect(154, 184, 74, 52, INK, { rx: 4 })}
      <clipPath id="tw1">
        <rect x="6" y="184" width="74" height="52" rx="4" />
      </clipPath>
      <clipPath id="tw2">
        <rect x="154" y="184" width="74" height="52" rx="4" />
      </clipPath>
      <g clip-path="url(#tw1)">{faces(10, 192, 7, 5, 1)}</g>
      <g clip-path="url(#tw2)">{faces(158, 192, 7, 5, 4)}</g>
      {/* door: one face pressed against the glass */}
      {rect(92, 180, 48, 106, "#d3d7db")}
      {rect(98, 188, 36, 62, "#2c3350", { rx: 3 })}
      <clipPath id="td">
        <rect x="98" y="188" width="36" height="62" rx="3" />
      </clipPath>
      <g clip-path="url(#td)">{faces(102, 196, 3, 6, 2)}</g>
      {circle(116, 226, 10, "#f3d9bf")}
      {path("M108 223q3-2 6 0M118 223q3-2 6 0", "none", { stroke: INK, "stroke-width": 1.6, "stroke-linecap": "round" })}
      {rect(112, 230, 8, 4, "#d9533c", { rx: 2 })}
      {rect(240, 180, 48, 106, "#d3d7db")}
      {rect(246, 188, 36, 62, "#2c3350", { rx: 3 })}
      {/* platform */}
      {rect(0, 286, 300, 89, "#d6cdc1")}
      {rect(0, 286, 300, 3, CREAM)}
      {rect(0, 294, 300, 12, "#e8c547")}
      <path d={Array.from({ length: 50 }, (_, i) => `M${3 + i * 6} 300h2`).join("")} stroke="#c9a92f" stroke-width="2" />
      {/* station staff in white gloves, pushing the last passenger in */}
      {path("M150 372V318q0-16 16-16h6q16 0 16 16V372z", "#1f2a52")}
      {circle(169, 290, 11, "#f0cfb2")}
      {path("M156 284h26v-6q-13-6-26 0z", "#1f2a52")}
      {rect(156, 283, 26, 3, "#e3a72f")}
      {path("M154 322l-20-10l3-6l22 9z", "#1f2a52")}
      {circle(133, 309, 5.5, "#ffffff")}
      {path("M186 320l-30-6l1-6l32 4z", "#1f2a52")}
      {circle(154, 308, 5.5, "#ffffff")}
      {path("M112 372V300q0-12 12-12h10q-2 40 4 84z", "#6e7480")}
      {/* platform clock at 8:15 */}
      {rect(259, 0, 3, 32, "#5b5f6a")}
      {circle(260.5, 48, 17, CREAM, { stroke: INK, "stroke-width": 3 })}
      <path d="M260.5 48V37M260.5 48h9" stroke={INK} stroke-width="2.4" stroke-linecap="round" />
    </g>
  );
}

function capetown() {
  return (
    <g>
      {rect(0, 0, 300, 110, "#f2b448")}
      {rect(0, 110, 300, 70, "#f5c25f")}
      {rect(0, 180, 300, 50, "#f8d07c")}
      {circle(56, 58, 30, "#fbe6b2")}
      {/* Devil's Peak, Table Mountain, Lion's Head */}
      {poly([0, 230, 0, 190, 28, 160, 64, 196, 70, 230], "#6a5a45")}
      {poly([30, 230, 58, 150, 226, 148, 262, 230], "#7c6a50")}
      {poly([58, 150, 90, 150, 104, 230, 40, 230], "#6a5a45")}
      {poly([150, 152, 176, 152, 200, 230, 166, 230], "#8b785b")}
      {poly([236, 230, 268, 168, 280, 172, 300, 210, 300, 230], "#6a5a45")}
      {/* the "tablecloth" cloud pouring over the top */}
      {path("M52 152q8-14 30-12q10-12 30-6q14-10 32-2q16-8 34 0q20-6 34 6q14 2 18 14q-8 8-20 2q-6 18-16 6q-10 14-22 2q-10 12-22 0q-12 10-22-2q-10 10-20-2q-12 4-18-8q-10 2-18 2z", "#fbf3e3")}
      {/* the city along the shore */}
      {[
        [8, 222, 16, 10, CREAM],
        [26, 218, 12, 14, "#e8c3a1"],
        [40, 224, 18, 8, "#dfe5d3"],
        [60, 216, 10, 16, CREAM],
        [72, 222, 22, 10, "#efd5b5"],
        [96, 218, 14, 14, "#dfe5d3"],
        [112, 224, 20, 8, CREAM],
        [134, 214, 10, 18, "#e8c3a1"],
        [146, 222, 26, 10, CREAM],
        [174, 218, 14, 14, "#dfe5d3"],
        [190, 224, 20, 8, "#efd5b5"],
        [212, 220, 12, 12, CREAM],
      ].map(([x, y, w, h, c]) => rect(x as number, y as number, w as number, h as number, c as string))}
      {rect(0, 232, 300, 30, "#2f6f8f")}
      {ripples(0, 300, [240, 252], 1.8, 18, "#6aa6c2", 1.4)}
      {/* dry ground */}
      {rect(0, 262, 300, 113, "#d9994a")}
      <path
        d="M0 300l30 6l20-10l26 14l30-8M120 322l26-12l30 10l22-8l40 12M30 350l26-10l34 8l30-14M180 360l24-10l30 6l30-12l36 10M60 284l-10 14M210 290l12 18M100 340l8 18"
        fill="none"
        stroke="#b97b34"
        stroke-width="2"
        stroke-linecap="round"
      />
      {/* the last tap, and the last drop */}
      {rect(212, 196, 88, 14, "#a9833a")}
      {rect(212, 196, 88, 4, "#c99f4e")}
      {path("M204 192h20v26q0 10-10 10h0q-10 0-10-10z", "#c99a3e")}
      {rect(204, 192, 6, 30, "#e0bb69")}
      {rect(210, 178, 8, 16, "#a9833a")}
      {rect(196, 174, 32, 6, "#c99a3e", { rx: 3 })}
      {path("M214 238q-7 10-7 15a7 7 0 0 0 14 0q0-5-7-15z", "#8fd0e6")}
      {path("M211 250a3 3 0 0 0 3 3", "none", { stroke: "#e4f5fa", "stroke-width": 1.6, "stroke-linecap": "round" })}
      {/* 50 litres a day */}
      {path("M176 296h76q6 0 6 6v58q0 6-6 6h-76q-6 0-6-6v-58q0-6 6-6z", "#c8432b")}
      {rect(190, 284, 26, 14, "#a8341f", { rx: 3 })}
      {rect(230, 288, 12, 10, "#a8341f")}
      <text x="214" y="342" font-size="26" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={CREAM}>
        50 L
      </text>
    </g>
  );
}

function hongkong() {
  const towers = [
    [18, 132, 20],
    [36, 112, 16],
    [50, 140, 22],
    [70, 100, 14],
    [82, 124, 20],
    [100, 90, 18],
    [116, 118, 16],
    [130, 104, 22],
    [150, 128, 14],
    [162, 96, 20],
    [180, 116, 16],
    [194, 136, 22],
    [214, 108, 18],
    [230, 130, 16],
    [244, 120, 20],
  ];
  return (
    <g>
      {rect(0, 0, 300, 80, "#4b5764")}
      {rect(0, 80, 300, 70, "#5b6876")}
      {rect(0, 150, 300, 80, "#6f7f8f")}
      {path("M-10 40q30-20 60-6q20-16 50-2q24-12 50 4q30-14 60 2q30-10 50 6q20 0 40 10v20h-320z", "#3e4853")}
      {path("M-10 96q40-14 80 0q30-10 60 2q30-8 60 4q30-10 60 0q30-6 60 6v14h-320z", "#4e5a67")}
      {/* the Peak behind the towers */}
      {path("M0 170Q60 120 120 140T230 128T300 150V230H0z", "#33443f")}
      {towers.map(([x, top, w], i) => (
        <g key={i}>
          {rect(x, top, w, 232 - top, i % 3 === 0 ? "#2b3846" : i % 3 === 1 ? "#34445a" : "#3f5068")}
          {windows(x + 3, top + 6, Math.max(2, Math.floor((w - 4) / 5)), Math.floor((226 - top) / 9), 2.4, 4, 2.6, 5, i % 4 === 1 ? "#f2c14e" : "#9fb3c6")}
        </g>
      ))}
      {/* harbour in a gale */}
      {rect(0, 230, 300, 145, "#2e4a5c")}
      {ripples(0, 300, [244, 262, 284, 310, 338, 364], 4, 26, "#c9d6df", 2)}
      {/* a junk with red battened sails */}
      <g transform="rotate(-8 120 300)">
        <path d="M60 300h112q-6 22-30 24H86q-20-4-26-24z" fill="#5b3a24" />
        {rect(112, 196, 3.5, 106, "#3b2616")}
        {rect(150, 226, 3, 76, "#3b2616")}
        <path d="M70 290Q74 230 92 200L112 196V290z" fill="#c8432b" />
        <path d="M116 292V206Q138 214 146 244L148 292z" fill="#c8432b" />
        <path d="M154 292V230Q170 240 176 268L176 292z" fill="#c8432b" />
        <path d="M74 270h38M78 250h34M84 230h28M90 212h22M116 270h32M116 250h30M116 230h22M154 272h22M154 254h18" stroke="#8f2e1f" stroke-width="2" />
      </g>
      {/* typhoon signal No. 8 */}
      {rect(256, 150, 5, 225, "#14181f")}
      {rect(240, 160, 37, 4, "#14181f")}
      {poly([258.5, 172, 274, 198, 243, 198], "#14181f")}
      {rect(244, 206, 29, 30, CREAM, { rx: 2 })}
      <text x="258.5" y="230" font-size="24" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill="#14181f">
        8
      </text>
      {palm(286, 375, 70, "#3b2e22", "#2c4a3a", -20)}
      {hatch(0, 0, 300, 375, 9, 0.35, "rgba(214,226,236,0.32)", 1)}
    </g>
  );
}

const POSTERS: Record<string, () => JSX.Element> = {
  cairo,
  capetown,
  buenosaires,
  mexicocity,
  rio,
  istanbul,
  mumbai,
  dubai,
  lasvegas,
  vancouver,
  newyork,
  tokyo,
  beijing,
  shanghai,
  bangkok,
  sydney,
  singapore,
  venice,
  paris,
  london,
  seoul,
  hongkong,
};

export const hasPoster = (id: string) => id in POSTERS;

/** The poster for one city, as an SVG that fills its box. */
export function CityPoster({ id, class: cls }: { id: string; class?: string }) {
  const draw = POSTERS[id];
  return (
    <svg class={cls} viewBox={`0 0 ${POSTER_W} ${POSTER_H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true">
      {draw ? draw() : rect(0, 0, POSTER_W, POSTER_H, "#e9dcc4")}
    </svg>
  );
}

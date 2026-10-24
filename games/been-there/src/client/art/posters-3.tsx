// City posters, part 3: Bangkok, Sydney, Singapore, Paris, London, Seoul.
import { car, circle, decoSun, figure, palm, path, poly, rect, ripples, windows } from "./kit";

const INK = "#1d2340";
const CREAM = "#f4ead5";

export function bangkok() {
  const tiers = [
    [150, 196, 46],
    [150, 168, 36],
    [150, 144, 28],
    [150, 124, 21],
    [150, 108, 15],
    [150, 96, 10],
  ];
  return (
    <g>
      {rect(0, 0, 300, 110, "#43a9d6")}
      {rect(0, 110, 300, 70, "#74c3e2")}
      {rect(0, 180, 300, 50, "#a9dcec")}
      {circle(244, 54, 26, "#fff2c4")}
      {/* Wat Arun's prang, tier on tier */}
      {path("M146 96l4-36l4 36z", "#efe6d2")}
      {tiers.map(([x, y, w], i) => (
        <g key={i}>
          {path(`M${x - w} ${y + 26}q0-22 ${w} -26q${w} 4 ${w} 26z`, i % 2 ? "#efe6d2" : "#e2d6bc")}
          <path d={Array.from({ length: Math.max(2, Math.floor(w / 6)) }, (_, k) => `M${x - w + 6 + k * ((2 * w - 12) / Math.max(1, Math.floor(w / 6) - 1))} ${y + 18}h.01`).join("")} stroke={["#c8432b", "#2f7d6d", "#3f6fb0"][i % 3]} stroke-width="3" stroke-linecap="round" />
        </g>
      ))}
      {[96, 204].map((x) => (
        <g key={x}>
          {path(`M${x - 18} 222q0-30 18-36q18 6 18 36z`, "#e2d6bc")}
          {path(`M${x - 2} 186l2-22l2 22z`, "#efe6d2")}
        </g>
      ))}
      {rect(0, 222, 300, 14, "#c9b994")}
      {/* the street fight with water */}
      {rect(0, 236, 300, 139, "#e9d6a8")}
      {/* everyone points at one soaked friend */}
      {figure(150, 352, 3.4, { body: "#3f6fb0", skin: "#d9a07a", legs: "#2c3340" })}
      <path d="M128 268q22-30 44 0M120 262q30-44 60 0" fill="none" stroke="#7fd0ea" stroke-width="5" stroke-linecap="round" />
      {[
        [138, 252],
        [160, 246],
        [150, 236],
        [170, 262],
        [128, 262],
      ].map(([x, y], i) => path(`M${x} ${y}q-3 5-3 7a3 3 0 0 0 6 0q0-2-3-7z`, "#7fd0ea", { key: i }))}
      {[
        [40, 320, 26, "#e3a72f"],
        [262, 320, -26, "#c8432b"],
        [86, 356, 14, "#2f9e6e"],
        [216, 356, -14, "#8a6fc9"],
      ].map(([x, y, r, c], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          {rect((x as number) - 6, (y as number) - 10, 12, 40, c as string, { rx: 6 })}
          {path(`M${(x as number) - 4} ${(y as number) - 10}h8v-8h12v6h-12`, "#e2b08a")}
        </g>
      ))}
      {/* a tuk-tuk */}
      <g transform="translate(14 262)">
        {path("M0 34h64l6-18h-14l-6-16h-40z", "#2f9e6e")}
        {path("M8 0h52q4 0 4 4v4h-60v-4q0-4 4-4z", "#c8432b")}
        {rect(12, 10, 20, 14, "#cfe9f2")}
        {circle(14, 36, 7, INK)}
        {circle(58, 36, 7, INK)}
      </g>
    </g>
  );
}

export function sydney() {
  return (
    <g>
      {rect(0, 0, 300, 100, "#3f8fc6")}
      {rect(0, 100, 300, 70, "#6aa9d4")}
      {rect(0, 170, 300, 50, "#9cc8e3")}
      {/* the sun with arrows going round the other way */}
      {circle(220, 70, 28, "#ffd96a")}
      <path d="M262 70a42 42 0 1 1-12-30" fill="none" stroke={CREAM} stroke-width="5" stroke-linecap="round" />
      {path("M254 28l-2 16l-14-6z", CREAM)}
      {/* the Harbour Bridge arch */}
      <path d="M0 196Q90 120 180 196" fill="none" stroke="#5b6b78" stroke-width="7" />
      <path d="M0 196Q90 140 180 196" fill="none" stroke="#5b6b78" stroke-width="3" />
      <path d={Array.from({ length: 11 }, (_, i) => `M${10 + i * 16} 196V${196 - 50 * Math.sin(((10 + i * 16) / 180) * Math.PI) * 0.86}`).join("")} stroke="#5b6b78" stroke-width="2" />
      {rect(0, 192, 190, 6, "#4a5866")}
      {/* the Opera House sails */}
      {rect(160, 204, 130, 16, "#e9d9c0")}
      {[
        [176, 204, 44, 46],
        [210, 204, 50, 60],
        [248, 204, 40, 44],
        [200, 204, 26, 28],
      ].map(([x, y, w, h], i) => (
        <g key={i}>
          {path(`M${x} ${y}q${w * 0.15} ${-h} ${w} ${-h}q${-w * 0.25} ${h * 0.45} ${-w * 0.35} ${h}z`, "#fbf7ee")}
          {path(`M${x + w * 0.65} ${y}q${w * 0.1} ${-h * 0.55} ${w * 0.35} ${-h}q${-w * 0.25} ${h * 0.45} ${-w * 0.35} ${h}z`, "#ddd5c4")}
        </g>
      ))}
      {/* harbour */}
      {rect(0, 220, 300, 46, "#2f78a8")}
      {ripples(0, 300, [232, 246, 258], 1.6, 20, "#7cb8db", 1.3)}
      {/* Christmas on the beach */}
      {rect(0, 266, 300, 109, "#f2d79a")}
      {path("M0 266q60 10 120 0t180 6v10H0z", "#e9c983")}
      {path("M64 360h40M84 360V318", "none", { stroke: "#5b3a24", "stroke-width": 4 })}
      {poly([84, 270, 112, 316, 56, 316], "#2f7d4f")}
      {poly([84, 254, 104, 290, 64, 290], "#38905c")}
      {[
        [74, 300, "#c8432b"],
        [96, 306, "#3f6fb0"],
        [86, 282, "#e3a72f"],
      ].map(([x, y, c], i) => circle(x as number, y as number, 3.5, c as string, { key: i }))}
      {path("M84 248l3 6h6l-5 4l2 6l-6-4l-6 4l2-6l-5-4h6z", "#ffd96a")}
      {/* beach umbrella and a surfboard */}
      {path("M190 360V300", "none", { stroke: INK, "stroke-width": 3 })}
      {path("M150 304q40-40 80 0q-10-6-20 0q-10-6-20 0q-10-6-20 0q-10-6-20 0z", "#c8432b")}
      {path("M170 304q20-40 40 0q-10-6-20 0q-10-6-20 0z", CREAM)}
      <g transform="rotate(14 252 330)">{path("M244 284q8-12 16 0v80q-8 12-16 0z", "#e3a72f", { stroke: INK, "stroke-width": 2 })}</g>
    </g>
  );
}

export function singapore() {
  const shop = (x: number, w: number, c: string) => (
    <g>
      {rect(x, 140, w, 110, c)}
      {rect(x - 2, 136, w + 4, 8, "#c8432b")}
      {[0, 1, 2].map((k) => rect(x + 6 + k * ((w - 12) / 3), 152, (w - 12) / 3 - 4, 26, "#2f7d6d", { rx: 6 }))}
      {path(`M${x + 6} 200h${w - 12}v30h-${w - 12}z`, "#f4ead5")}
      {path(`M${x + 6} 200a${(w - 12) / 2} 10 0 0 1 ${w - 12} 0`, "#e3a72f")}
      {rect(x, 232, w, 18, "#a57a5a")}
    </g>
  );
  return (
    <g>
      {rect(0, 0, 300, 90, "#5fb8ac")}
      {rect(0, 90, 300, 60, "#8fd0c4")}
      {path("M0 70q30-20 60 0t60 0t60 0t60 0t60 0v80H0z", "#76c4b8")}
      {palm(282, 160, 90, "#5b3a24", "#2f7d4f", -14)}
      {palm(18, 158, 86, "#5b3a24", "#38905c", 10)}
      {/* Peranakan shophouses */}
      {shop(10, 70, "#f2a9b4")}
      {shop(82, 70, "#9fd3e6")}
      {shop(154, 70, "#f6d27a")}
      {shop(226, 70, "#b9e0b4")}
      {/* the road and a car wearing its permit */}
      {rect(0, 250, 300, 125, "#5b5f6a")}
      <path d="M0 312h300" stroke="#e8e2d4" stroke-width="3" stroke-dasharray="20 14" />
      {car(30, 300, 140, "#3f6fb0")}
      <g transform="rotate(-10 106 238)">
        {rect(70, 222, 74, 32, CREAM, { stroke: INK, "stroke-width": 2.5, rx: 3 })}
        <text x="107" y="244" font-size="17" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill="#c8432b">
          COE
        </text>
        {path("M88 254l-6 18l10-6l4 10l4-22z", "#c8432b")}
      </g>
      {/* sealed bids */}
      {[
        [214, 330, -8, "$$$"],
        [262, 340, 10, "$$"],
      ].map(([x, y, r, t], i) => (
        <g key={i} transform={`rotate(${r} ${x} ${y})`}>
          {rect((x as number) - 3, y as number, 6, 40, "#5b3a24")}
          {circle(x as number, (y as number) - 6, 22, CREAM, { stroke: INK, "stroke-width": 2.5 })}
          <text x={x} y={(y as number) + 1} font-size="15" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={INK}>
            {t}
          </text>
        </g>
      ))}
    </g>
  );
}

export function paris() {
  return (
    <g>
      {rect(0, 0, 300, 100, "#efbdb4")}
      {rect(0, 100, 300, 70, "#f3cfc5")}
      {rect(0, 170, 300, 40, "#f7e0d6")}
      {decoSun(70, 120, 34, "#fbefe6", "#f3cfc5", [6, 14, 21])}
      {/* the tower, by day */}
      <g>
        {path("M190 210L206 120h12l16 90h-12l-10-60l-10 60z", "#5b4a46")}
        {path("M204 120l6-60h4l6 60z", "#5b4a46")}
        {rect(209, 40, 6, 22, "#5b4a46")}
        {rect(196, 150, 32, 6, "#5b4a46")}
        {rect(202, 118, 20, 5, "#5b4a46")}
        {path("M196 210q16-30 32 0z", "#efbdb4")}
      </g>
      <path d="M200 156l24 50M224 156l-24 50M206 124l12 26M218 124l-12 26" stroke="#5b4a46" stroke-width="1.2" />
      {/* Haussmann facades with iron balconies */}
      {[0, 100, 200].map((x, i) => (
        <g key={i}>
          {rect(x, 180, 100, 195, i === 1 ? "#ede1cc" : "#e6d8bf")}
          {path(`M${x} 180l12-22h76l12 22z`, "#7f8fa0")}
          {windows(x + 18, 164, 3, 1, 10, 10, 18, 0, "#5f6f80")}
          {windows(x + 14, 196, 3, 2, 16, 24, 12, 18, "#4a5664")}
          {[220, 262].map((y) => (
            <g key={y}>
              {rect(x + 8, y, 84, 3, INK)}
              <path d={Array.from({ length: 14 }, (_, k) => `M${x + 10 + k * 6} ${y}v-8`).join("")} stroke={INK} stroke-width="1.2" />
            </g>
          ))}
        </g>
      ))}
      {/* shop front: the sales are on */}
      {rect(0, 296, 300, 79, "#2b3a4a")}
      {rect(10, 304, 190, 60, "#f6e7d0")}
      {rect(20, 312, 170, 26, "#c8432b")}
      <text x="105" y="331" font-size="18" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={CREAM}>
        SOLDES -50%
      </text>
      {/* shopping bags */}
      {[
        [210, "#c8432b"],
        [238, "#e3a72f"],
        [262, "#2f7d6d"],
      ].map(([x, c], i) => (
        <g key={i}>
          {path(`M${x} ${334 + i * 4}h26l3 38h-32z`, c as string, { stroke: INK, "stroke-width": 2 })}
          <path d={`M${(x as number) + 6} ${334 + i * 4}v-6q7-10 14 0v6`} fill="none" stroke={INK} stroke-width="2" />
        </g>
      ))}
    </g>
  );
}

export function london() {
  return (
    <g>
      {rect(0, 0, 300, 110, "#a9b6c2")}
      {rect(0, 110, 300, 70, "#bfcad3")}
      {rect(0, 180, 300, 50, "#d3dbe1")}
      {circle(86, 82, 24, "#eef0ea")}
      {path("M10 60q30-16 60-4q20-10 44 2q14 0 18 8h-122z", "#cfd8df")}
      {/* the clock tower and Westminster */}
      {rect(196, 86, 34, 150, "#b59a6a")}
      {rect(192, 120, 42, 38, "#c9ad78")}
      {circle(213, 139, 13, CREAM, { stroke: INK, "stroke-width": 2 })}
      <path d="M213 139V130M213 139h7" stroke={INK} stroke-width="2" stroke-linecap="round" />
      {path("M194 86l19-40l19 40z", "#4f5a52")}
      {path("M211 46l2-14l2 14z", "#4f5a52")}
      {rect(84, 170, 112, 66, "#b59a6a")}
      <path d={Array.from({ length: 8 }, (_, i) => `M${92 + i * 14} 236v-58`).join("")} stroke="#a08757" stroke-width="3" />
      {/* the Thames and a merchant ship: what the first policies covered */}
      {rect(0, 236, 300, 64, "#56707e")}
      {ripples(0, 300, [248, 262, 278, 292], 1.6, 20, "#8aa4b2", 1.3)}
      {path("M20 270h88l-10 14h-70z", "#5b3a24")}
      {[44, 66, 88].map((x, i) => (
        <g key={x}>
          {rect(x - 1.5, 216 - i * 4, 3, 54 + i * 4, "#3b2616")}
          {path(`M${x - 12} ${226 - i * 4}h24l-3 18h-18z`, CREAM)}
          {path(`M${x - 10} ${248 - i * 4}h20l-2 16h-16z`, CREAM)}
        </g>
      ))}
      {/* the coffee house where it began */}
      {rect(0, 300, 300, 75, "#3b2a24")}
      {rect(206, 300, 6, 40, INK)}
      {rect(160, 314, 96, 6, INK)}
      {path("M176 320v8M240 320v8", "none", { stroke: INK, "stroke-width": 2 })}
      {rect(166, 328, 84, 34, CREAM, { stroke: INK, "stroke-width": 2.5, rx: 2 })}
      <text x="208" y="342" font-size="10" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={INK}>
        COFFEE HOUSE
      </text>
      <text x="208" y="356" font-size="12" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill="#c8432b">
        1688
      </text>
      {/* a cup and a sealed policy */}
      {path("M28 330h40v16a20 20 0 0 1-40 0z", CREAM, { stroke: INK, "stroke-width": 2 })}
      <path d="M68 334h6a6 6 0 0 1 0 12h-6M40 312q-4 6 0 12M54 312q-4 6 0 12" fill="none" stroke={CREAM} stroke-width="2.4" stroke-linecap="round" />
      {path("M92 334h50q6 0 6 6v18q0 6-6 6H92z", "#efe2c4", { stroke: INK, "stroke-width": 2 })}
      {circle(132, 360, 8, "#c8432b")}
      <path d="M100 344h28M100 352h20" stroke="#9a8a72" stroke-width="2" />
    </g>
  );
}

export function seoul() {
  return (
    <g>
      {rect(0, 0, 300, 120, "#bcd9e6")}
      {rect(0, 120, 300, 70, "#d4e7ee")}
      {path("M0 190L60 120L100 150L150 96L200 150L240 126L300 170V200H0z", "#8aa49a")}
      {path("M140 108L150 96L162 110L154 114L150 106L146 114z", "#eef3f0")}
      {/* a plane holding in a circle, waiting for the exam to end */}
      <ellipse cx="200" cy="54" rx="70" ry="22" fill="none" stroke={CREAM} stroke-width="2.6" stroke-dasharray="6 7" />
      <g transform="translate(132 50) rotate(-80)">{path("M0 -10L2.4 -3L10 2V5L2.4 3L1.8 9L4.4 11V12.6L0 11.6L-4.4 12.6V11L-1.8 9L-2.4 3L-10 5V2L-2.4 -3Z", INK)}</g>
      {/* Gyeongbokgung: a palace hall in dancheong colours */}
      {rect(46, 206, 208, 20, "#e8e1d4")}
      {rect(66, 160, 168, 48, "#c8432b")}
      {[78, 106, 134, 162, 190, 218].map((x) => rect(x, 166, 8, 42, "#9a2f20"))}
      {rect(60, 152, 180, 10, "#2f7d6d")}
      <path d={Array.from({ length: 30 }, (_, i) => `M${62 + i * 6} 157h3`).join("")} stroke="#e3a72f" stroke-width="3" />
      {path("M40 152q110-22 220 0l-18-24h-184z", "#3a3f4a")}
      {rect(84, 116, 132, 14, "#c8432b")}
      {rect(80, 110, 140, 8, "#2f7d6d")}
      {path("M66 112q84-18 168 0l-14-20h-140z", "#3a3f4a")}
      {/* the exam room: silence for ten seconds */}
      {rect(0, 226, 300, 149, "#e9dcc4")}
      {rect(30, 300, 150, 10, "#8a5a3a")}
      {path("M40 310v50M170 310v50", "none", { stroke: "#6a4022", "stroke-width": 6 })}
      {rect(64, 284, 70, 16, "#f6f1e6", { stroke: INK, "stroke-width": 1.6 })}
      <path d="M72 290h40M72 295h28" stroke="#9a9488" stroke-width="1.6" />
      {figure(214, 362, 3.6, { body: "#3f6fb0", skin: "#e8c39f", legs: "#2c3340" })}
      {path("M202 284a12 12 0 0 1 24 0", "none", { stroke: INK, "stroke-width": 4 })}
      {rect(198, 282, 7, 12, INK, { rx: 2 })}
      {rect(223, 282, 7, 12, INK, { rx: 2 })}
      {/* a speaker crossed out */}
      {circle(250, 252, 26, CREAM, { stroke: "#c8432b", "stroke-width": 4 })}
      {path("M236 246h8l10-8v28l-10-8h-8z", INK)}
      {path("M232 236L268 270", "none", { stroke: "#c8432b", "stroke-width": 4 })}
    </g>
  );
}

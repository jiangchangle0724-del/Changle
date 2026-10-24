// City posters, part 2: Dubai, Las Vegas, Vancouver, New York, Beijing, Shanghai.
import { circle, decoSun, path, pine, poly, rect, ripples, windows } from "./kit";

const INK = "#1d2340";
const CREAM = "#f4ead5";

export function dubai() {
  const towers = [
    [40, 150, 18, "#2f4b74"],
    [62, 128, 16, "#3a5a86"],
    [84, 166, 20, "#2b4469"],
    [190, 140, 18, "#33507c"],
    [212, 120, 14, "#3d5d8a"],
    [230, 158, 22, "#2b4469"],
    [256, 136, 16, "#36547f"],
  ];
  return (
    <g>
      {rect(0, 0, 300, 80, "#1f3b6a")}
      {rect(0, 80, 300, 70, "#36588a")}
      {rect(0, 150, 300, 50, "#d98c62")}
      {rect(0, 200, 300, 30, "#efb37a")}
      {/* a city of towers, one tall needle with a viewing deck */}
      {towers.map(([x, top, w, c], i) => (
        <g key={i}>
          {rect(x as number, top as number, w as number, 230 - (top as number), c as string)}
          {windows((x as number) + 3, (top as number) + 6, 2, Math.floor((220 - (top as number)) / 10), 3, 5, (w as number) - 12, 5, "#f2c98a")}
        </g>
      ))}
      {path("M140 230V60h20v170z", "#2a426a")}
      {path("M146 60l4-46l4 46z", "#2a426a")}
      {rect(132, 66, 36, 10, "#3d5d8a", { rx: 5 })}
      {windows(145, 84, 2, 14, 3, 5, 4, 5, "#f2c98a")}
      {/* the creek, a dhow, and wind towers of the old town */}
      {rect(0, 230, 300, 24, "#2f6f86")}
      {ripples(0, 300, [240], 1.4, 18, "#79b6c8", 1.2)}
      {path("M196 244h48q-6 8-22 8t-26-8z", "#7a4a2a")}
      {path("M220 244V214l16 26z", CREAM)}
      {rect(0, 254, 300, 121, "#e6c08a")}
      {[[12, 230, 26], [44, 238, 20]].map(([x, top, w], i) => (
        <g key={i}>
          {rect(x, top, w, 30, "#d8b07a")}
          {rect(x + w * 0.25, top - 16, w * 0.5, 18, "#d8b07a")}
          {windows(x + w * 0.3, top - 13, 3, 1, 1.6, 12, 1.6, 0, "#7a5a3a")}
        </g>
      ))}
      {/* the coin telescope on the deck: peek at what's coming */}
      {rect(0, 312, 300, 8, "#5b3a24")}
      {rect(0, 300, 300, 4, "#5b3a24")}
      {[20, 70, 120, 170, 220, 270].map((x) => rect(x, 300, 4, 20, "#5b3a24"))}
      {rect(96, 290, 10, 85, INK)}
      {path("M80 375h42l-6-12h-30z", INK)}
      <g transform="rotate(-18 101 270)">
        {rect(70, 256, 62, 30, "#c99a3e", { rx: 12 })}
        {rect(62, 258, 14, 26, "#a9833a", { rx: 5 })}
        {rect(126, 258, 14, 26, "#a9833a", { rx: 5 })}
        {rect(92, 284, 18, 10, INK)}
      </g>
      {/* what it sees: three cards */}
      {circle(220, 300, 58, CREAM, { stroke: INK, "stroke-width": 5 })}
      {[-14, 0, 14].map((r, i) => (
        <g key={i} transform={`rotate(${r} 220 330)`}>
          {rect(204, 268, 32, 46, i === 1 ? "#c8432b" : "#2f6f86", { rx: 4, stroke: INK, "stroke-width": 2 })}
          {circle(220, 291, 7, CREAM)}
        </g>
      ))}
    </g>
  );
}

export function lasvegas() {
  const bulbs = (d: [number, number][], c: string) => d.map(([x, y], i) => circle(x, y, 2.2, c, { key: i }));
  return (
    <g>
      {rect(0, 0, 300, 375, "#1b1e3b")}
      {[
        [20, 30],
        [60, 70],
        [110, 24],
        [170, 50],
        [230, 22],
        [280, 64],
        [140, 90],
        [36, 120],
      ].map(([x, y], i) => circle(x, y, 1.3, "#f4ead5", { key: i }))}
      {path("M0 230L40 196L76 214L120 176L170 210L216 184L260 206L300 190V250H0z", "#2c2f55")}
      {/* a Googie starburst and an arrow sign full of bulbs */}
      <g transform="translate(80 110)">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M0 0L6 -54L-6 -54z" fill={i % 2 ? "#ffd23f" : "#ff5fa2"} transform={`rotate(${i * 30})`} />
        ))}
        {circle(0, 0, 22, "#4fd1e8")}
        <text x="0" y="12" font-size="32" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill="#1b1e3b">
          7
        </text>
      </g>
      {path("M180 60h96v54h-96z", "#ff5fa2")}
      {path("M188 68h80v38h-80z", "#1b1e3b")}
      {path("M196 116h64l-32 50z", "#ffd23f")}
      {bulbs(
        Array.from({ length: 16 }, (_, i) => [184 + i * 6, 64] as [number, number]),
        "#fff6c2",
      )}
      {bulbs(
        Array.from({ length: 16 }, (_, i) => [184 + i * 6, 110] as [number, number]),
        "#fff6c2",
      )}
      <path d="M204 87h48" stroke="#4fd1e8" stroke-width="6" stroke-linecap="round" />
      {rect(224, 166, 8, 70, "#3a3f6a")}
      {/* the bet: two dice making seven */}
      {rect(0, 250, 300, 125, "#1f6b4f")}
      <path d="M0 262h300" stroke="#e3a72f" stroke-width="3" />
      <g transform="rotate(-14 110 320)">
        {rect(80, 286, 62, 62, CREAM, { rx: 10, stroke: INK, "stroke-width": 3 })}
        {[
          [94, 300],
          [111, 317],
          [128, 334],
        ].map(([x, y], i) => circle(x, y, 6, INK, { key: i }))}
      </g>
      <g transform="rotate(12 200 316)">
        {rect(170, 284, 62, 62, CREAM, { rx: 10, stroke: INK, "stroke-width": 3 })}
        {[
          [185, 299],
          [217, 299],
          [185, 331],
          [217, 331],
        ].map(([x, y], i) => circle(x, y, 6, "#c8432b", { key: i }))}
      </g>
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <ellipse cx="262" cy={352 - i * 9} rx="22" ry="7" fill={i % 2 ? "#c8432b" : CREAM} stroke={INK} stroke-width="2" />
        </g>
      ))}
    </g>
  );
}

export function vancouver() {
  return (
    <g>
      {rect(0, 0, 300, 100, "#9fbccb")}
      {rect(0, 100, 300, 80, "#b9d0db")}
      {path("M20 40q20-14 44-4q14-10 30 0q10 0 14 8h-88z", "#e4edf1")}
      {path("M190 60q16-10 34-2q12-8 26 2q8 0 10 6h-70z", "#e4edf1")}
      {/* North Shore mountains */}
      {path("M0 180L50 120L80 146L130 96L180 150L220 118L270 150L300 132V200H0z", "#5b7a8a")}
      {path("M118 108L130 96L144 112L136 116L130 108L124 116z", "#eef3f5")}
      {path("M210 128L220 118L232 130L226 134L220 126L214 134z", "#eef3f5")}
      {/* glass towers */}
      {[
        [96, 128, 22, "#6f93a8"],
        [122, 112, 18, "#82a6ba"],
        [144, 136, 24, "#6a8da2"],
        [172, 120, 18, "#8fb0c2"],
        [194, 144, 22, "#6f93a8"],
      ].map(([x, top, w, c], i) => (
        <g key={i}>
          {rect(x as number, top as number, w as number, 220 - (top as number), c as string)}
          {windows((x as number) + 3, (top as number) + 6, Math.floor(((w as number) - 4) / 5), Math.floor((210 - (top as number)) / 8), 3, 4, 2, 4, "#c6dbe5")}
        </g>
      ))}
      {/* the harbour and a floatplane */}
      {rect(0, 210, 300, 60, "#3f6f86")}
      {ripples(0, 300, [222, 238, 254], 1.6, 20, "#7fa9bd", 1.3)}
      <g transform="translate(206 200) rotate(-8)">
        {path("M0 0h56l8-6h6l-4 10h-66z", CREAM)}
        {rect(18, -10, 30, 4, "#c8432b")}
        {path("M8 6l4 10M44 6l4 10", "none", { stroke: INK, "stroke-width": 1.6 })}
        {rect(4, 16, 50, 3, INK, { rx: 1.5 })}
      </g>
      {/* the seawall and evergreens */}
      {rect(0, 270, 300, 105, "#6f9a5a")}
      {[12, 30, 266, 286].map((x, i) => pine(x, 300 + (i % 2) * 6, 70, "#2f5a46"))}
      {/* the empty house with its tax notice */}
      {rect(84, 266, 110, 78, "#d9c3a0")}
      {poly([74, 270, 139, 220, 204, 270], "#8a5a3a")}
      {rect(100, 284, 24, 26, "#2c3340")}
      {rect(154, 284, 24, 26, "#2c3340")}
      <path d="M100 284l24 26M124 284l-24 26M154 284l24 26M178 284l-24 26" stroke="#9a8a72" stroke-width="2" />
      {rect(128, 312, 22, 32, "#5b3a24")}
      {rect(206, 300, 4, 50, "#5b3a24")}
      {rect(194, 270, 76, 40, CREAM, { stroke: INK, "stroke-width": 2 })}
      <text x="232" y="286" font-size="11" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill={INK}>
        EMPTY HOME
      </text>
      <text x="232" y="302" font-size="14" font-family="ui-monospace,Menlo,monospace" font-weight="700" text-anchor="middle" fill="#c8432b">
        TAX 3%
      </text>
    </g>
  );
}

export function newyork() {
  return (
    <g>
      {rect(0, 0, 300, 90, "#f0ac74")}
      {rect(0, 90, 300, 70, "#f4c690")}
      {rect(0, 160, 300, 40, "#f7dcb0")}
      {/* Manhattan, and Liberty in the harbour */}
      {[
        [18, 120, 16],
        [36, 100, 14],
        [52, 132, 18],
        [74, 90, 12],
        [88, 116, 20],
        [112, 70, 16],
        [130, 104, 14],
        [146, 124, 20],
        [170, 96, 16],
        [190, 130, 18],
      ].map(([x, top, w], i) => rect(x, top, w, 200 - top, i % 2 ? "#a0827a" : "#8f736d"))}
      {path("M112 70l8-26l8 26z", "#8f736d")}
      {path("M118 44h4v-16h-4z", "#8f736d")}
      {path("M70 90l11-22l11 22z", "#a0827a")}
      {path("M262 200v-30h-6v-10h4v-22l-6-8l10 2l2-12l4 12l8-4l-4 10h4v22h4v10h-6v30z", "#4f8f86")}
      {/* brownstones with stoops, fire escapes and water towers */}
      {[0, 76, 152, 228].map((x, i) => (
        <g key={i}>
          {rect(x, 196, 74, 140, i % 2 ? "#9a5b45" : "#8a4f3c")}
          {windows(x + 10, 208, 3, 4, 12, 16, 8, 12, "#f4d8a8")}
          {path(`M${x + 6} 230h60M${x + 6} 258h60M${x + 6} 286h60M${x + 12} 230l20 28M${x + 40} 258l20 28`, "none", { stroke: INK, "stroke-width": 2 })}
          {rect(x + 26, 300, 22, 36, "#3b2418")}
          {path(`M${x + 20} 336h34l6 16h-46z`, "#7a4434")}
        </g>
      ))}
      {[[40, 180], [190, 174]].map(([x, y], i) => (
        <g key={i}>
          {rect(x, y, 22, 18, "#8a6a4a", { rx: 2 })}
          {poly([x - 2, y, x + 11, y - 9, x + 24, y], "#6a4a2a")}
          {path(`M${x + 3} ${y + 18}v8M${x + 19} ${y + 18}v8`, "none", { stroke: INK, "stroke-width": 2 })}
        </g>
      ))}
      {/* the vote: hands up for a rent freeze */}
      {rect(0, 344, 300, 31, "#5b4a46")}
      {[
        [30, "#2f7d6d", -6],
        [70, "#e3a72f", 4],
        [112, "#5a6bd8", -2],
        [152, "#c8432b", 6],
        [196, "#2f7d6d", -4],
        [238, "#8a6fc9", 2],
        [276, "#e3a72f", -6],
      ].map(([x, c, r], i) => (
        <g key={i} transform={`rotate(${r} ${x} 375)`}>
          {rect((x as number) - 7, 316, 14, 59, c as string, { rx: 6 })}
          {path(`M${(x as number) - 8} 318v-16q0-4 3-4t3 4v-6q0-4 3-4t3 4v4q0-4 3-4t3 4v18z`, "#e2b08a")}
        </g>
      ))}
    </g>
  );
}

export function beijing() {
  const gate = (cx: number, base: number, s: number, wall: string, roof: string) => (
    <g>
      {rect(cx - 70 * s, base - 30 * s, 140 * s, 30 * s, "#ece6da")}
      {rect(cx - 60 * s, base - 64 * s, 120 * s, 34 * s, wall)}
      {[-40, -20, 0, 20, 40].map((dx) => rect(cx + dx * s - 5 * s, base - 58 * s, 10 * s, 26 * s, "#7a2a20"))}
      {path(`M${cx - 76 * s} ${base - 64 * s}q${76 * s} ${-14 * s} ${152 * s} 0l${-14 * s} ${-14 * s}h${-124 * s}z`, roof)}
      {rect(cx - 52 * s, base - 92 * s, 104 * s, 14 * s, wall)}
      {path(`M${cx - 66 * s} ${base - 92 * s}q${66 * s} ${-12 * s} ${132 * s} 0l${-14 * s} ${-14 * s}h${-104 * s}z`, roof)}
      {arch(cx, base, 12 * s, 22 * s)}
    </g>
  );
  const arch = (cx: number, base: number, w: number, h: number) => path(`M${cx - w} ${base}v${-h + w}a${w} ${w} 0 0 1 ${2 * w} 0v${h - w}z`, "#3b1a14");
  return (
    <g>
      {rect(0, 0, 300, 120, "#bcd8e4")}
      {rect(0, 120, 300, 80, "#d6e7ec")}
      {decoSun(150, 96, 40, "#f8efdc", "#bcd8e4", [10, 20, 28])}
      {/* the axis runs straight through every gate */}
      {rect(0, 168, 300, 68, "#c7b6a0")}
      {gate(150, 178, 0.46, "#a8433a", "#d39a2e")}
      {gate(150, 262, 1, "#b8432f", "#e3a72f")}
      {rect(0, 262, 300, 113, "#e8e1d4")}
      {/* white marble bridges and balustrades */}
      {[70, 150, 230].map((x) => (
        <g key={x}>
          {path(`M${x - 30} 316q30-26 60 0v8h-60z`, "#f6f2ea", { stroke: "#b9b1a2", "stroke-width": 1.5 })}
          {path(`M${x - 10} 324a10 10 0 0 1 20 0z`, "#7a9aa8")}
        </g>
      ))}
      {rect(0, 324, 300, 14, "#7a9aa8")}
      <path d={Array.from({ length: 21 }, (_, i) => `M${i * 15} 338v-8`).join("")} stroke="#b9b1a2" stroke-width="3" />
      {/* the axis itself, and the jump to the other side */}
      <path d="M150 20V375" stroke="#e3a72f" stroke-width="3" stroke-dasharray="8 6" />
      <path d="M118 360q32-40 64 0" fill="none" stroke="#c8432b" stroke-width="4" stroke-linecap="round" />
      {path("M182 360l-12-4l10-8z", "#c8432b")}
      {/* lions guarding both sides */}
      {[34, 266].map((x) => (
        <g key={x}>
          {rect(x - 12, 346, 24, 14, "#d9d1c2")}
          {path(`M${x - 9} 346v-14q0-10 9-10t9 10v14z`, "#c9c0ae")}
          {circle(x, 324, 7, "#c9c0ae")}
        </g>
      ))}
    </g>
  );
}

export function shanghai() {
  const bin = (x: number, color: string, icon: string) => (
    <g>
      {path(`M${x} 290h44l-4 70h-36z`, color, { stroke: INK, "stroke-width": 2 })}
      {rect(x - 4, 280, 52, 12, color, { stroke: INK, "stroke-width": 2, rx: 3 })}
      {rect(x + 14, 274, 16, 6, INK, { rx: 2 })}
      <path d={icon} transform={`translate(${x + 10} 306)`} fill="none" stroke={CREAM} stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
    </g>
  );
  return (
    <g>
      {rect(0, 0, 300, 110, "#9cc0d4")}
      {rect(0, 110, 300, 70, "#b9d3df")}
      {rect(0, 180, 300, 40, "#d3e3e9")}
      {/* the Bund: 1920s banks and the Custom House clock */}
      {[
        [6, 160, 34, "#c7b79a"],
        [42, 150, 30, "#d4c4a6"],
        [74, 128, 30, "#cdbd9f"],
        [106, 156, 38, "#d9cbaf"],
        [146, 146, 28, "#c7b79a"],
        [176, 160, 40, "#d4c4a6"],
        [218, 150, 30, "#cdbd9f"],
        [250, 164, 44, "#d9cbaf"],
      ].map(([x, top, w, c], i) => (
        <g key={i}>
          {rect(x as number, top as number, w as number, 222 - (top as number), c as string)}
          {windows((x as number) + 4, (top as number) + 8, Math.floor(((w as number) - 4) / 7), Math.floor((214 - (top as number)) / 10), 3, 5, 4, 5, "#8a7a62")}
        </g>
      ))}
      {rect(80, 100, 18, 28, "#cdbd9f")}
      {circle(89, 112, 6, CREAM, { stroke: "#8a7a62", "stroke-width": 1.5 })}
      {path("M82 100l7-12l7 12z", "#b9a988")}
      {path("M112 156q13-18 26 0z", "#9fae9a")}
      {/* the Huangpu */}
      {rect(0, 222, 300, 44, "#5b8aa0")}
      {ripples(0, 300, [232, 246, 258], 1.4, 18, "#8fb5c6", 1.2)}
      {path("M170 240h70l-6 10h-58z", CREAM)}
      {rect(184, 232, 40, 8, "#c8432b")}
      {/* the four bins, and something to sort */}
      {rect(0, 266, 300, 109, "#d9d1c4")}
      {bin(22, "#2a6fb0", "M4 10l6-8l6 8M14 4l4 10h-8M2 14h8l-4 6")}
      {bin(88, "#c8432b", "M4 2h16v20H4zM8 0h8M8 10h8")}
      {bin(154, "#7a4a2a", "M2 12h18M6 6l4 6l-4 6M20 12q-6-8-12 0")}
      {bin(220, "#2b2b2b", "M4 4l16 16M20 4L4 20")}
      <g transform="rotate(-24 150 210)">
        {path("M130 200q-8-6-4-12q6-4 10 2h28q4-6 10-2q4 6-4 12q8 6 4 12q-6 4-10-2h-28q-4 6-10 2q-4-6 4-12z", CREAM, { stroke: INK, "stroke-width": 2 })}
      </g>
      <text x="196" y="196" font-size="34" font-family="ui-monospace,Menlo,monospace" font-weight="700" fill="#c8432b">
        ?
      </text>
    </g>
  );
}

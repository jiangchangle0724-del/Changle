// Passport stamps: one per city, the outline matching its region's shape (triangle for Africa, circle for
// Latin America…), so the stamps are told apart without relying on colour. Every stamp ends in 到此一游.
import { CITIES } from "../../engine";
import { CityGlyph } from "./icons";

/** Stamp ink per region: the region colour, darkened so it reads on passport paper. */
export const INK_OF: Record<number, string> = {
  1: "#7a4a1f",
  2: "#1f6fa8",
  3: "#9b3f7a",
  4: "#a65f00",
  5: "#b8401a",
  6: "#7d6a00",
  7: "#00704f",
  8: "#00578a",
};

export const CODE: Record<string, string> = {
  cairo: "CAI",
  capetown: "CPT",
  buenosaires: "BUE",
  mexicocity: "MEX",
  rio: "RIO",
  istanbul: "IST",
  mumbai: "BOM",
  dubai: "DXB",
  lasvegas: "LAS",
  vancouver: "YVR",
  newyork: "NYC",
  tokyo: "TYO",
  beijing: "BJS",
  shanghai: "SHA",
  bangkok: "BKK",
  sydney: "SYD",
  singapore: "SIN",
  venice: "VCE",
  paris: "PAR",
  london: "LON",
  seoul: "SEL",
  hongkong: "HKG",
};

const DISPLAY = `"Big Shoulders Display","ZCOOL QingKe HuangYou","PingFang SC","Noto Sans CJK SC",system-ui,sans-serif`;
const MONO = `"Space Mono",ui-monospace,Menlo,monospace`;

const ring = (r: number, n: number, wobble: (i: number) => number) =>
  "M" +
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rr = r + wobble(i);
    return `${(Math.sin(a) * rr).toFixed(1)} ${(-Math.cos(a) * rr).toFixed(1)}`;
  }).join("L") +
  "Z";

const hex = (r: number) => ring(r, 6, () => 0);

/** Outer and inner outline of a stamp for each region. */
function outline(group: number): [string, string] {
  switch (group) {
    case 1:
      return ["M0 -56L54 40H-54Z", "M0 -42L42 33H-42Z"];
    case 2:
      return [ring(55, 72, () => 0), ring(45, 72, () => 0)];
    case 3:
      return ["M0 -57L57 0L0 57L-57 0Z", "M0 -46L46 0L0 46L-46 0Z"];
    case 4:
      return ["M-50 -50H50V50H-50Z", "M-43 -43H43V43H-43Z"];
    case 5:
      return [ring(52, 32, (i) => (i % 2 ? -5 : 4)), ring(42, 72, () => 0)];
    case 6:
      return [hex(57), hex(47)];
    case 7:
      return ["M-46 -42H46L56 -32V32L46 42H-46L-56 32V-32Z", "M-46 -34H46V34H-46Z"];
    default:
      return [ring(53, 96, (i) => Math.sin((i / 96) * Math.PI * 2 * 12) * 3), ring(43, 72, () => 0)];
  }
}

/** Squeeze a line into maxW if the font would make it wider (estimate per character). */
function fit(text: string, size: number, maxW: number, cjk: boolean) {
  const est = text.length * size * (cjk ? 0.86 : 0.48);
  return est > maxW ? { textLength: maxW, lengthAdjust: "spacingAndGlyphs" } : {};
}

/** A passport stamp, drawn centred on (0, 0) in a 120 × 120 box. */
export function StampArt({ id, lang = "zh", ink: inkOver }: { id: string; lang?: "zh" | "en"; /** Another ink (a stamp on the dark board). */ ink?: string }) {
  const city = CITIES.find((c) => c.id === id)!;
  const ink = inkOver ?? INK_OF[city.group];
  const [outer, inner] = outline(city.group);
  const zh = lang === "zh";
  const big = zh ? city.name.zh : city.name.en.toUpperCase();
  const small = zh ? city.name.en.toUpperCase() : city.name.zh;
  const text = (y: number, size: number, value: string, maxW: number, cjk: boolean, font = DISPLAY, extra: object = {}) => (
    <text y={y} font-family={font} font-size={size} font-weight="800" text-anchor="middle" fill={ink} stroke="none" {...fit(value, size, maxW, cjk)} {...extra}>
      {value}
    </text>
  );
  const footer = `${CODE[id]} · 到此一游`;
  let body;
  switch (city.group) {
    case 1: // triangle: narrow at the top
      body = (
        <>
          {text(-24, 8, CODE[id], 20, false, MONO)}
          <CityGlyph id={id} x={-8} y={-21} size={16} color={ink} width={2} />
          {text(12, zh ? 15 : 13, big, 54, zh)}
          {text(25, 6.5, "到此一游", 40, true, MONO)}
        </>
      );
      break;
    case 3: // diamond: narrow at top and bottom
      body = (
        <>
          {text(-21, 9, small, 44, !zh, DISPLAY, { "letter-spacing": 1 })}
          <CityGlyph id={id} x={-8} y={-16} size={16} color={ink} width={2} />
          {text(16, zh ? 16 : 13, big, 60, zh)}
          {text(27, 6.5, "到此一游", 34, true, MONO)}
        </>
      );
      break;
    case 2:
    case 5:
    case 8: // round: the second name runs along the top of the ring
      body = (
        <>
          <path id={`arc-${id}`} d="M-34 4A34 34 0 0 1 34 4" stroke="none" />
          <text font-family={DISPLAY} font-size="11" font-weight="800" letter-spacing="1.5" fill={ink} stroke="none">
            <textPath href={`#arc-${id}`} startOffset="50%" text-anchor="middle" {...fit(small, 11, 92, !zh)}>
              {small}
            </textPath>
          </text>
          <CityGlyph id={id} x={-9} y={-12} size={18} color={ink} width={2} />
          {text(21, zh ? 18 : 15, big, 62, zh)}
          {text(33, 7, footer, 52, false, MONO, { "letter-spacing": 0.6 })}
        </>
      );
      break;
    default:
      body = (
        <>
          {text(-20, 10, small, 76, !zh, DISPLAY, { "letter-spacing": 1.2 })}
          <CityGlyph id={id} x={-9} y={-15} size={18} color={ink} width={2} />
          {text(18, zh ? 18 : 15, big, 76, zh)}
          {text(30, 7, footer, 70, false, MONO, { "letter-spacing": 0.6 })}
        </>
      );
  }
  return (
    <g fill="none" stroke={ink} stroke-linejoin="round">
      <path d={outer} stroke-width="3.2" />
      <path d={inner} stroke-width="1.4" />
      {body}
    </g>
  );
}

/** A stamp as it sits on a page: slightly turned, with worn ink. */
export function Stamp({ id, size = 96, turn = 0, lang = "zh", fresh }: { id: string; size?: number; turn?: number; lang?: "zh" | "en"; fresh?: boolean }) {
  return (
    <span class="stamp-turn" style={{ transform: `rotate(${turn.toFixed(1)}deg)` }}>
      <svg class={`stamp${fresh ? " fresh" : ""}`} width={size} height={size} viewBox="-60 -60 120 120" aria-hidden="true">
        <StampArt id={id} lang={lang} />
      </svg>
    </span>
  );
}

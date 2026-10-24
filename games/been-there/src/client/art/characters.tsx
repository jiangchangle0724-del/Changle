// The six token characters: travel things come to life, drawn like 1930s rubber-hose cartoons
// (ink outlines, pie-cut eyes, white gloves). Each team plays one; they react to what happens to them.
import type { JSX } from "preact";

export type Mood = "idle" | "happy" | "shock" | "sad" | "curious" | "smug";

export interface CharacterInfo {
  key: string;
  name: { zh: string; en: string };
  /** Main colour: the team colour. */
  color: string;
}

/** Index = team colour index (TEAM_COLORS in ui/common.tsx). */
export const CHARACTERS: CharacterInfo[] = [
  { key: "click", name: { zh: "咔嚓", en: "Click" }, color: "#4a6683" },
  { key: "snooze", name: { zh: "呼呼", en: "Snooze" }, color: "#8a4fc4" },
  { key: "flaggy", name: { zh: "小旗", en: "Flaggy" }, color: "#c23a5e" },
  { key: "packy", name: { zh: "背背", en: "Packy" }, color: "#178a7a" },
  { key: "trunky", name: { zh: "箱箱", en: "Trunky" }, color: "#b8670a" },
  { key: "globey", name: { zh: "球球", en: "Globey" }, color: "#3b6fd6" },
];

const INK = "#1d2340";
const LINE = { stroke: INK, "stroke-width": 3, "stroke-linejoin": "round" as const, "stroke-linecap": "round" as const };

/** Pie-cut eyes and a mouth, centred on (x, y). */
function Face({ x, y, s = 1, mood }: { x: number; y: number; s?: number; mood: Mood }) {
  const e = 7 * s;
  const eye = (cx: number, flip = 1): JSX.Element => {
    switch (mood) {
      case "happy":
        return <path d={`M${cx - 4 * s} ${y + 1 * s}q${4 * s} ${-7 * s} ${8 * s} 0`} fill="none" {...LINE} stroke-width={3 * s} />;
      case "shock":
        return (
          <g>
            <ellipse cx={cx} cy={y - 1 * s} rx={4.6 * s} ry={5.8 * s} fill="#fff" {...LINE} stroke-width={2.4 * s} />
            <circle cx={cx} cy={y} r={1.6 * s} fill={INK} />
          </g>
        );
      case "sad":
        return (
          <g>
            <ellipse cx={cx} cy={y + 1 * s} rx={3 * s} ry={3.6 * s} fill={INK} />
            <path d={`M${cx - 5 * s} ${y - 4 * s + flip * 1.5 * s}L${cx + 5 * s} ${y - 4 * s - flip * 1.5 * s}`} {...LINE} stroke-width={2.2 * s} />
          </g>
        );
      case "smug":
        return (
          <g>
            <path d={`M${cx - 3.4 * s} ${y}a${3.4 * s} ${3.6 * s} 0 0 0 ${6.8 * s} 0z`} fill={INK} />
            <path d={`M${cx - 4.6 * s} ${y}h${9.2 * s}`} {...LINE} stroke-width={2.4 * s} />
          </g>
        );
      default: {
        // pie-cut eye: a dark oval with a slice taken out
        const big = mood === "curious" && flip > 0 ? 1.25 : 1;
        const rx = 3.2 * s * big;
        const ry = 4.6 * s * big;
        return (
          <g>
            <ellipse cx={cx} cy={y} rx={rx} ry={ry} fill={INK} />
            <path d={`M${cx} ${y - 1 * s}L${cx + rx * 0.9} ${y - ry * 0.55}A${rx} ${ry} 0 0 0 ${cx + rx * 0.2} ${y - ry * 0.98}z`} fill="#fff" />
          </g>
        );
      }
    }
  };
  const mouth = (): JSX.Element => {
    const my = y + 9 * s;
    switch (mood) {
      case "happy":
        return (
          <g>
            <path d={`M${x - 7 * s} ${my - 2 * s}q${7 * s} ${11 * s} ${14 * s} 0z`} fill="#7a1f2b" {...LINE} stroke-width={2.4 * s} />
            <path d={`M${x - 3.4 * s} ${my + 3 * s}q${3.4 * s} ${-3 * s} ${6.8 * s} 0q${-3.4 * s} ${2.6 * s} ${-6.8 * s} 0z`} fill="#e4707a" />
          </g>
        );
      case "shock":
        return <ellipse cx={x} cy={my + 1 * s} rx={3.6 * s} ry={4.6 * s} fill="#7a1f2b" {...LINE} stroke-width={2.4 * s} />;
      case "sad":
        return <path d={`M${x - 5 * s} ${my + 3 * s}q${5 * s} ${-6 * s} ${10 * s} 0`} fill="none" {...LINE} stroke-width={2.6 * s} />;
      case "curious":
        return <circle cx={x + 2 * s} cy={my + 1 * s} r={2.2 * s} fill="#7a1f2b" {...LINE} stroke-width={2 * s} />;
      case "smug":
        return <path d={`M${x - 5 * s} ${my}q${6 * s} ${4 * s} ${10 * s} ${-3 * s}`} fill="none" {...LINE} stroke-width={2.6 * s} />;
      default:
        return <path d={`M${x - 5 * s} ${my - 1 * s}q${5 * s} ${6 * s} ${10 * s} 0`} fill="none" {...LINE} stroke-width={2.6 * s} />;
    }
  };
  return (
    <g>
      {eye(x - e, -1)}
      {eye(x + e, 1)}
      {mouth()}
      {mood === "happy" && (
        <g fill="#f08a8a" opacity="0.7">
          <ellipse cx={x - 12 * s} cy={y + 6 * s} rx={3.4 * s} ry={2.2 * s} />
          <ellipse cx={x + 12 * s} cy={y + 6 * s} rx={3.4 * s} ry={2.2 * s} />
        </g>
      )}
      {mood === "shock" && <path d={`M${x + 16 * s} ${y - 10 * s}q${-4 * s} ${6 * s} 0 ${8 * s}q${4 * s} ${-2 * s} 0 ${-8 * s}z`} fill="#8fd0e6" {...LINE} stroke-width={1.6 * s} />}
      {mood === "sad" && <path d={`M${x + 9 * s} ${y + 5 * s}q${-2.4 * s} ${4 * s} 0 ${6 * s}q${2.4 * s} ${-2 * s} 0 ${-6 * s}z`} fill="#8fd0e6" />}
    </g>
  );
}

/** Rubber-hose arms with white gloves, from two shoulders. */
function Arms({ l, r, mood }: { l: [number, number]; r: [number, number]; mood: Mood }) {
  const pose: Record<Mood, [number, number, number, number]> = {
    // left hand offset, right hand offset (from the shoulders)
    idle: [-12, 16, 12, 16],
    happy: [-16, -20, 16, -20],
    shock: [-14, -14, 14, -14],
    sad: [-6, 20, 6, 20],
    curious: [-14, 14, -2, -4],
    smug: [-4, 12, 4, 12],
  };
  const [lx, ly, rx, ry] = pose[mood];
  const arm = ([sx, sy]: [number, number], dx: number, dy: number, side: number) => {
    const hx = sx + dx;
    const hy = sy + dy;
    return (
      <g>
        <path d={`M${sx} ${sy}Q${sx + dx * 0.2 + side * 8} ${sy + dy * 0.6} ${hx} ${hy}`} fill="none" {...LINE} stroke-width={3.4} />
        <circle cx={hx} cy={hy} r={5.4} fill="#fff" {...LINE} stroke-width={2.4} />
        <path d={`M${hx - 2} ${hy - 1.5}h4M${hx - 2} ${hy + 1}h4`} stroke={INK} stroke-width={1} />
      </g>
    );
  };
  return (
    <g>
      {arm(l, lx, ly, -1)}
      {arm(r, rx, ry, 1)}
    </g>
  );
}

/** Legs and big shoes, feet on the ground line. */
function Legs({ x, top, gap = 10 }: { x: number; top: number; gap?: number }) {
  const ground = 110;
  return (
    <g>
      <path d={`M${x - gap / 2} ${top}V${ground - 5}M${x + gap / 2} ${top}V${ground - 5}`} fill="none" {...LINE} stroke-width={3.4} />
      <path d={`M${x - gap / 2 + 2} ${ground}h-12a5 5 0 0 1 5-7h7zM${x + gap / 2 - 2} ${ground}h12a5 5 0 0 0-5-7h-7z`} fill={INK} />
    </g>
  );
}

function body(kind: number, color: string, mood: Mood): JSX.Element {
  switch (kind) {
    case 0: // Click: a box camera, the lens as its nose
      return (
        <g>
          <Legs x={60} top={88} />
          <Arms l={[30, 66]} r={[90, 66]} mood={mood} />
          <rect x="44" y="34" width="16" height="9" rx="2" fill="#cfd4da" {...LINE} />
          <rect x="68" y="36" width="10" height="7" rx="2" fill="#e9c46a" {...LINE} />
          <rect x="28" y="42" width="64" height="48" rx="7" fill={color} {...LINE} />
          <rect x="28" y="42" width="64" height="11" rx="5" fill="#cfd4da" {...LINE} />
          <circle cx="60" cy="76" r="10" fill="#2a2e3a" {...LINE} />
          <circle cx="60" cy="76" r="5.4" fill="#7fa6c9" />
          <circle cx="58" cy="74" r="1.6" fill="#fff" />
          <Face x={60} y={60} s={0.78} mood={mood} />
        </g>
      );
    case 1: // Snooze: a neck pillow, always half asleep
      return (
        <g>
          <Legs x={60} top={92} gap={14} />
          <Arms l={[26, 70]} r={[94, 70]} mood={mood} />
          <path d="M24 46q0-16 18-16q8 0 9 12q1 22 9 22t9-22q1-12 9-12q18 0 18 16q0 46-36 46T24 46z" fill={color} {...LINE} />
          <path d="M34 50q2 32 26 34q24-2 26-34" fill="none" stroke="#e4d4f4" stroke-width="2" stroke-dasharray="3 4" />
          <Face x={60} y={74} s={0.72} mood={mood === "idle" ? "smug" : mood} />
          {mood === "idle" && (
            <text x="92" y="30" font-size="12" font-weight="800" font-family="ui-monospace,monospace" fill={INK}>
              z
            </text>
          )}
        </g>
      );
    case 2: // Flaggy: a tour guide's flag on a pogo pole
      return (
        <g>
          <path d="M44 34V104" {...LINE} stroke-width={4} />
          <path d="M38 104h12a4 4 0 0 1-4 6h-4a4 4 0 0 1-4-6z" fill={INK} />
          <Arms l={[44, 70]} r={[46, 60]} mood={mood} />
          <path d="M46 30q22-8 40 0q8 4 18 0v40q-10 4-18 0q-18-8-40 0z" fill={color} {...LINE} />
          <circle cx="44" cy="28" r="5" fill="#e3a72f" {...LINE} stroke-width={2.4} />
          <Face x={74} y={46} s={0.74} mood={mood} />
        </g>
      );
    case 3: // Packy: a backpack with a rolled mat for hair
      return (
        <g>
          <Legs x={60} top={92} gap={14} />
          <Arms l={[30, 64]} r={[90, 64]} mood={mood} />
          <rect x="34" y="22" width="52" height="14" rx="7" fill="#e3a72f" {...LINE} />
          <path d="M30 50q0-18 30-18t30 18v38q0 6-6 6H36q-6 0-6-6z" fill={color} {...LINE} />
          <rect x="40" y="70" width="40" height="20" rx="5" fill="#126c60" {...LINE} stroke-width={2.4} />
          <path d="M48 70v-4M72 70v-4" {...LINE} stroke-width={2.4} />
          <Face x={60} y={52} s={0.74} mood={mood} />
        </g>
      );
    case 4: // Trunky: an old suitcase covered in stickers
      return (
        <g>
          <Legs x={60} top={92} gap={16} />
          <Arms l={[26, 66]} r={[94, 66]} mood={mood} />
          <path d="M48 36v-8q0-4 4-4h16q4 0 4 4v8" fill="none" {...LINE} stroke-width={4} />
          <rect x="24" y="36" width="72" height="56" rx="8" fill={color} {...LINE} />
          <path d="M40 36v56M80 36v56" stroke="#6d3c06" stroke-width="5" />
          <circle cx="88" cy="48" r="6" fill="#56b4e9" stroke={INK} stroke-width="1.6" />
          <rect x="27" y="76" width="11" height="9" rx="1.5" fill="#e8d33f" stroke={INK} stroke-width="1.6" transform="rotate(-12 32 80)" />
          <Face x={60} y={60} s={0.78} mood={mood} />
        </g>
      );
    default: // Globey: a snow globe with a tiny city inside
      return (
        <g>
          <Legs x={60} top={96} gap={16} />
          <Arms l={[30, 86]} r={[90, 86]} mood={mood} />
          <circle cx="60" cy="54" r="32" fill="#d8eef7" {...LINE} />
          <path d="M44 74h32v-8h-6v-14h-6v-8h-6v8h-4v10h-10z" fill="#9fc3d6" />
          {[
            [44, 36],
            [70, 32],
            [80, 50],
            [52, 46],
            [62, 40],
            [40, 58],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.6" fill="#fff" />
          ))}
          <path d="M44 32a24 24 0 0 1 14-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" />
          <path d="M28 84h64l-6 14H34z" fill={color} {...LINE} />
          <Face x={60} y={58} s={0.8} mood={mood} />
        </g>
      );
  }
}

/** A character as an SVG group in a 120 × 120 box (feet at y = 110), to place inside another drawing. */
export function CharacterArt({ kind, mood = "idle" }: { kind: number; mood?: Mood }) {
  const k = ((kind % CHARACTERS.length) + CHARACTERS.length) % CHARACTERS.length;
  return body(k, CHARACTERS[k].color, mood);
}

/** One token character. */
export function Character({ kind, mood = "idle", size = 64, class: cls }: { kind: number; mood?: Mood; size?: number; class?: string }) {
  const info = CHARACTERS[((kind % CHARACTERS.length) + CHARACTERS.length) % CHARACTERS.length];
  return (
    <svg class={cls ?? "character"} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={info.name.zh}>
      <CharacterArt kind={kind} mood={mood} />
    </svg>
  );
}

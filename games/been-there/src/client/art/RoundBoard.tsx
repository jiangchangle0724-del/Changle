// The round board: 40 spaces on a turntable around the route map, a nod to changle.ca's Lazy Susan.
// When the turn passes, the table turns so the player whose go it is sits at the bottom. Labels,
// markers and tokens stay upright while it turns.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { BOARD, CITY_AT, GROUPS } from "../../engine";
import { CharacterArt, type Mood } from "./characters";
import { SpaceGlyph } from "./icons";
import { RouteMap, type Flight } from "./RouteMap";
import { shapePath } from "./shapes";
import { CODE } from "./stamps";

export interface SpaceMark {
  /** Owner's team colour and letter. */
  owner?: { color: string; letter: string } | null;
  houses?: number;
  mortgaged?: boolean;
}

export interface TokenMark {
  seat: number;
  at: number;
  /** Character index (= team colour index). */
  kind: number;
  mood?: Mood;
}

const RO = 490;
const RB = 460;
const RI = 342;
const RL = 428;
const RM = 389;
const RH = 358;
const RT = 294;
const RMAP = 320;
const STEP = 360 / BOARD.length;

/** Angle of a space, degrees clockwise from 12 o'clock; Departure sits at the bottom. */
const angleOf = (at: number) => 180 + at * STEP;
const xy = (deg: number, r: number): [number, number] => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)];

function wedge(at: number, ro = RO) {
  const a0 = angleOf(at) - STEP / 2;
  const a1 = angleOf(at) + STEP / 2;
  const [x0, y0] = xy(a0, ro);
  const [x1, y1] = xy(a1, ro);
  const [x2, y2] = xy(a1, RI);
  const [x3, y3] = xy(a0, RI);
  return `M${x0} ${y0}A${ro} ${ro} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${RI} ${RI} 0 0 0 ${x3} ${y3}Z`;
}

function band(at: number) {
  const a0 = angleOf(at) - STEP / 2;
  const a1 = angleOf(at) + STEP / 2;
  const [x0, y0] = xy(a0, RO);
  const [x1, y1] = xy(a1, RO);
  const [x2, y2] = xy(a1, RB);
  const [x3, y3] = xy(a0, RB);
  return `M${x0} ${y0}A${RO} ${RO} 0 0 1 ${x1} ${y1}L${x2} ${y2}A${RB} ${RB} 0 0 0 ${x3} ${y3}Z`;
}

const CORNER: Record<string, string> = { go: "go", immigration: "immigration", lounge: "lounge", expired: "expired" };

function glyphName(at: number): string {
  const sp = BOARD[at];
  if (sp.k === "tax" || sp.k === "service") return sp.id;
  return sp.k;
}

/** Houses sit in a row along the inner edge of the space (a hotel is one wide block). */
function Houses({ at, n }: { at: number; n: number }) {
  const deg = angleOf(at);
  if (n >= 5) {
    const [x, y] = xy(deg, RH);
    return <rect x={x - 15} y={y - 8} width="30" height="16" rx="3" fill="var(--hotel)" stroke="var(--board-paper)" stroke-width="2" transform={`rotate(${deg} ${x} ${y})`} />;
  }
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = xy(deg + (i - (n - 1) / 2) * 2.1, RH);
        return <rect key={i} x={x - 5.5} y={y - 5.5} width="11" height="11" rx="2" fill="var(--house)" stroke="var(--board-paper)" stroke-width="1.6" transform={`rotate(${deg} ${x} ${y})`} />;
      })}
    </g>
  );
}

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** Something that stays upright while the table turns. */
function Up({ x, y, rot, children, extra }: { x: number; y: number; rot: number; children: ComponentChildren; extra?: Record<string, string | number> }) {
  return (
    <g data-up="" data-x={x.toFixed(1)} data-y={y.toFixed(1)} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${-rot})`} {...extra}>
      {children}
    </g>
  );
}

export function RoundBoard({
  marks,
  tokens,
  focus = 0,
  active,
  flight,
  onPick,
  reduced,
  center,
  class: cls,
}: {
  marks: (SpaceMark | null)[];
  tokens: TokenMark[];
  /** Space to turn to the bottom. */
  focus?: number;
  /** Space of the token whose turn it is. */
  active?: number;
  flight?: Flight | null;
  onPick?: (at: number) => void;
  reduced?: boolean;
  /** Drawn over the middle of the map, not turning. */
  center?: ComponentChildren;
  class?: string;
}) {
  const ref = useRef<SVGGElement>(null);
  const rot = useRef(-focus * STEP);

  const apply = (r: number) => {
    rot.current = r;
    const g = ref.current;
    if (!g) return;
    g.setAttribute("transform", `rotate(${r.toFixed(2)})`);
    g.querySelectorAll<SVGGElement>("[data-up]").forEach((el) => {
      el.setAttribute("transform", `translate(${el.dataset.x} ${el.dataset.y}) rotate(${(-r).toFixed(2)})`);
    });
  };

  useLayoutEffect(() => {
    const target = -focus * STEP;
    const start = rot.current;
    const delta = ((((target - start) % 360) + 540) % 360) - 180;
    if (reduced || Math.abs(delta) < 0.01) {
      apply(start + delta);
      return;
    }
    const t0 = performance.now();
    const dur = 650 + Math.abs(delta) * 3;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      apply(start + delta * ease(p));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focus, reduced]);

  // Tokens walk around the ring to their new space, with a little hop on each one.
  const shown = useRef(new Map<number, number>());
  const posKey = tokens.map((t) => `${t.seat}:${t.at}`).join(",");
  useLayoutEffect(() => {
    const g = ref.current;
    const moves: { seat: number; from: number; delta: number; el: SVGGElement; fan: number; ring: number }[] = [];
    for (const tk of tokens) {
      const from = shown.current.get(tk.seat);
      shown.current.set(tk.seat, tk.at);
      if (from === undefined || from === tk.at || reduced || !g) continue;
      let delta = (tk.at - from + BOARD.length) % BOARD.length;
      if (delta > BOARD.length / 2) delta -= BOARD.length;
      const el = g.querySelector<SVGGElement>(`[data-seat="${tk.seat}"]`);
      if (!el) continue;
      moves.push({ seat: tk.seat, from, delta, el, fan: Number(el.dataset.fan ?? 0), ring: Number(el.dataset.ring ?? RT) });
    }
    if (!moves.length) return;
    const t0 = performance.now();
    const dur = Math.min(1800, 220 + Math.max(...moves.map((m) => Math.abs(m.delta))) * 120);
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      for (const m of moves) {
        const at = m.from + m.delta * p;
        const hop = Math.abs(Math.sin(Math.PI * (at - Math.floor(at)))) * 16 * (p < 1 ? 1 : 0);
        const [x, y] = xy(angleOf(at) + m.fan, m.ring);
        m.el.dataset.x = x.toFixed(1);
        m.el.dataset.y = y.toFixed(1);
        m.el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-rot.current).toFixed(2)}) translate(0 ${(-hop).toFixed(1)})`);
      }
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [posKey, reduced]);

  const r = rot.current;
  const bySpace = new Map<number, TokenMark[]>();
  for (const t of tokens) bySpace.set(t.at, [...(bySpace.get(t.at) ?? []), t]);

  return (
    <svg class={cls ?? "roundboard"} viewBox="-500 -500 1000 1000" role="img" aria-label="board">
      <circle r={RO + 8} fill="var(--board-rim)" />
      <g ref={ref} transform={`rotate(${r})`}>
        <RouteMap r={RMAP} flight={flight} reduced={reduced} />
        {BOARD.map((sp, at) => {
          const city = CITY_AT[at];
          const group = city ? GROUPS.find((g) => g.id === city.group)! : null;
          const mark = marks[at];
          const deg = angleOf(at);
          const corner = CORNER[sp.k];
          const [lx, ly] = xy(deg, RL);
          const [mx, my] = xy(deg, RM);
          const [bx, by] = xy(deg, (RO + RB) / 2);
          return (
            <g key={at} class={`sp k-${sp.k}${at === active ? " active" : ""}${mark?.mortgaged ? " mort" : ""}`} onClick={onPick ? () => onPick(at) : undefined}>
              <path d={wedge(at, corner ? RO + 6 : RO)} class={corner ? "wedge corner-w" : "wedge"} />
              {group && <path d={band(at)} fill={group.color} />}
              {group && (
                <Up x={bx} y={by} rot={r}>
                  <path d={shapePath(group.shape, 10)} fill="var(--board-paper)" stroke="rgba(0,0,0,.35)" stroke-width="1.5" />
                </Up>
              )}
              {city ? (
                <Up x={lx} y={ly} rot={r}>
                  <text class="code" y="11" text-anchor="middle">
                    {CODE[city.id]}
                  </text>
                </Up>
              ) : corner ? (
                <Up x={lx} y={ly} rot={r}>
                  <SpaceGlyph name={CORNER[sp.k]} x={-22} y={-22} size={44} color="var(--corner-ink)" width={3} />
                </Up>
              ) : (
                <Up x={lx} y={ly} rot={r}>
                  <SpaceGlyph name={glyphName(at)} x={-17} y={-17} size={34} color="var(--board-ink-2)" width={2.6} />
                </Up>
              )}
              {mark?.houses ? <Houses at={at} n={mark.houses} /> : null}
              {mark?.owner && (
                <Up x={mx} y={my} rot={r}>
                  <circle r="17" fill={mark.owner.color} stroke="var(--board-paper)" stroke-width="3" />
                  <text class="owner" y="6.5" text-anchor="middle">
                    {mark.owner.letter}
                  </text>
                </Up>
              )}
            </g>
          );
        })}
        {[...bySpace.entries()].map(([at, list]) =>
          list.map((tk, i) => {
            const n = list.length;
            const fan = (i - (n - 1) / 2) * 5.2 * (n > 3 ? 0.8 : 1);
            const ring = RT - (n > 3 && i % 2 ? 46 : 0);
            const [x, y] = xy(angleOf(at) + fan, ring);
            return (
              <Up key={tk.seat} x={x} y={y} rot={r} extra={{ "data-seat": tk.seat, "data-fan": fan.toFixed(2), "data-ring": ring }}>
                <g class={`token${at === active && tk.mood !== "sad" ? " now" : ""}`}>
                  <ellipse cx="0" cy="26" rx="22" ry="7" fill="rgba(0,0,0,.18)" />
                  <g transform="translate(-34 -40) scale(0.57)">
                    <CharacterArt kind={tk.kind} mood={tk.mood} />
                  </g>
                </g>
              </Up>
            );
          }),
        )}
      </g>
      {center}
    </svg>
  );
}

// The round board: 40 spaces on a turntable around the route map, a nod to changle.ca's Lazy Susan.
// The table turns a space to the place it's asked for (`focus` to `focusAt`): on the big screen the
// team on turn comes to the bottom, on a phone its own token to 9 o'clock, where its first-person
// camera pushes in. It never turns faster than 60 degrees a second; a bigger turn is a quick fade
// instead. Labels, markers and tokens stay upright while it turns. A move (ui/Ride.tsx) drives the
// table through `rig`: it turns it, moves a camera over it and leans it back.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import { BOARD, CITY_AT, GROUPS } from "../../engine";
import { CharacterArt, type Mood } from "./characters";
import { SpaceGlyph } from "./icons";
import { RouteMap, type Flight } from "./RouteMap";
import { useSatMap } from "./SatMap";
import { shapePath } from "./shapes";
import { CODE_PATH, NEWS_PATH, OWNER_PATH } from "./boardType";

export interface SpaceMark {
  /** Owner's team colour and letter. */
  owner?: { color: string; letter: string } | null;
  houses?: number;
  mortgaged?: boolean;
  /** Travel news changing this city for now: a short tag (×2, ½, +$20, −25%). */
  news?: string;
}

export interface TokenMark {
  seat: number;
  at: number;
  /** Character index (= team colour index). */
  kind: number;
  mood?: Mood;
  /** The team's colour and letter, worn beside the token when it shares its space. */
  badge?: { color: string; letter: string };
}

/** What a first-person move needs to drive the table (ui/Ride.tsx). */
export interface Rig {
  svg: SVGSVGElement;
  /** Turn the table to this angle (degrees), labels and tokens staying upright: all of them, or
   * only those within `span` degrees of the screen angle `at` (what a close camera can see). */
  turn(deg: number, near?: { at: number; span: number }): void;
  /** Stand up only the labels and tokens near `at` for a table seen at `deg`, leaving the table's
   * own angle as it is (a move turns the drawing as a whole, on the compositor: ui/Ride.tsx). */
  upright(deg: number, near: { at: number; span: number }): void;
  /** The table's angle now (as drawn), and where it rests for this turn. */
  rotation(): number;
  focusRotation(): number;
}

const RO = 490;
const RB = 460;
const RI = 342;
const RL = 428;
const RM = 389;
const RH = 358;
const RT = 294;
/** Travel news tags sit on the inner edge of the ring. */
const RN = 330;
const RMAP = 320;
const STEP = 360 / BOARD.length;

/** A city's space, printed in a wash of its region's colour over the board's navy (`k` of it, mixed as
 * light mixes, which keeps the colour warm rather than muddy): the city cards' colours round the ring.
 * The airport codes on them stay at 4.4:1 or more against it. */
export function tint(color: string, k = 0.2, base = "#1c2238"): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const srgb = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const a = rgb(color);
  const b = rgb(base);
  return `#${a.map((x, i) => Math.round(255 * srgb(lin(b[i]) + (lin(x) - lin(b[i])) * k)).toString(16).padStart(2, "0")).join("")}`;
}
const TINT: Record<number, string> = Object.fromEntries(GROUPS.map((g) => [g.id, tint(g.color)]));

/** Angle of a space, degrees clockwise from 12 o'clock; Departure sits at the bottom. */
export const angleOf = (at: number) => 180 + at * STEP;
export const xy = (deg: number, r: number): [number, number] => [r * Math.sin((deg * Math.PI) / 180), -r * Math.cos((deg * Math.PI) / 180)];
/** Where the tokens stand: just inside the ring of spaces. */
export const TOKEN_R = RT;

/** How big a token is drawn (board units per unit of its drawing): on a phone or a laptop, and on the
 * big screen, whose board is twice as wide. The drawing is 120 across and stands on (60, 70). */
export const TOKEN_SCALE = { phone: 0.8, tv: 0.62 };
const ART_X = 60;
const ART_Y = 70;
/** How wide the characters are drawn, of their 120. */
const ART_W = 92;

export interface Slot {
  /** Degrees round the ring from the space's middle. */
  fan: number;
  /** How far from the board's middle. */
  ring: number;
  /** How much smaller than a token on its own. */
  k: number;
}

/**
 * Where each of `n` tokens on one space stands: in pairs side by side, each pair further in toward the
 * middle of the board, and smaller the more there are, so every character stays whole and none hides
 * another (up to six: every team on one city).
 */
export function slots(n: number, scale: number): Slot[] {
  const k = n <= 1 ? 1 : n === 2 ? 0.92 : n <= 4 ? 0.85 : 0.76;
  const w = ART_W * scale * k;
  return Array.from({ length: n }, (_, i) => {
    const row = Math.floor(i / 2);
    const alone = n - row * 2 === 1;
    const along = alone ? 0 : ((i % 2) - 0.5) * 1.04 * w;
    const ring = RT - row * 0.84 * w;
    return { fan: (along / ring) * (180 / Math.PI), ring, k };
  });
}

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

/** Houses sit in a row along the inner edge of the space (a hotel is one wide block). Houses beyond
 * the first `old` were just built and pop up. */
function Houses({ at, n, old }: { at: number; n: number; old: number }) {
  const deg = angleOf(at);
  if (n >= 5) {
    const [x, y] = xy(deg, RH);
    return (
      <g class={old >= 5 ? undefined : "pop"}>
        <rect x={x - 15} y={y - 8} width="30" height="16" rx="3" fill="var(--hotel)" stroke="var(--board-paper)" stroke-width="2" transform={`rotate(${deg} ${x} ${y})`} />
      </g>
    );
  }
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const [x, y] = xy(deg + (i - (n - 1) / 2) * 2.1, RH);
        return (
          <g key={i} class={i < old ? undefined : "pop"}>
            <rect x={x - 5.5} y={y - 5.5} width="11" height="11" rx="2" fill="var(--house)" stroke="var(--board-paper)" stroke-width="1.6" transform={`rotate(${deg} ${x} ${y})`} />
          </g>
        );
      })}
    </g>
  );
}

/** The table turns 60 degrees a second at most (easing in and out); past this a fade is kinder. */
const TURN_MAX = 60;
const TURN_ACCEL = 300;
const FADE_PAST = 60;
const FADE_MS = 500;

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
  rig,
  riding,
  focusAt = 180,
  walks,
  turn,
  tokenScale = TOKEN_SCALE.phone,
  sat,
}: {
  marks: (SpaceMark | null)[];
  tokens: TokenMark[];
  /** Space to turn to the bottom. */
  focus?: number;
  /** Space of the token whose turn it is. */
  active?: number;
  /** The seat whose turn it is: its token hops (not the others sharing its space). */
  turn?: number;
  /** How big the tokens are (TOKEN_SCALE). */
  tokenScale?: number;
  flight?: Flight | null;
  onPick?: (at: number) => void;
  reduced?: boolean;
  /** Drawn over the middle of the map, not turning. */
  center?: ComponentChildren;
  class?: string;
  /** Filled in for a first-person move to drive the table. */
  rig?: { current: Rig | null };
  /** The seat on a first-person move: its token is drawn by the ride, and the table is the ride's. */
  riding?: number | null;
  /** Where on screen (degrees clockwise from 12 o'clock) the focus space is turned to: the bottom (180)
   * on the big screen, 9 o'clock (270) on a phone. */
  focusAt?: number;
  /** When other teams' tokens start walking and how long a space takes (performance.now() ms), so
   * they move in step with the thrower's ride. */
  walks?: Record<number, { start: number; per: number }>;
  /** The real world in the middle (art/SatMap.ts), under the board: on a phone or a laptop, and on the big
   * screen when its globe can't be shown. */
  sat?: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const satRef = useRef<HTMLCanvasElement>(null);
  const ridingRef = useRef(false);
  ridingRef.current = riding !== undefined && riding !== null;
  // (painted once its pictures are in, never while a move plays: the board draws the map until then)
  const satOn = useSatMap(satRef, !!sat, () => ridingRef.current);
  const cam = useRef<SVGGElement>(null);
  const ref = useRef<SVGGElement>(null);
  const rot = useRef(focusAt - angleOf(focus));
  // Everything that stays upright, found once per drawing rather than on every frame of a turn, with
  // where it sits round the ring (degrees from 12 o'clock, before the table turns).
  // (a token walking round moves its own: its place is read again when it has)
  const ups = useRef<{ el: SVGGElement; x?: string; y?: string; at: string; angle: number; shown: number }[]>([]);
  useLayoutEffect(() => {
    ups.current = ref.current ? Array.from(ref.current.querySelectorAll<SVGGElement>("[data-up]")).map((el) => ({ el, at: "", angle: 0, shown: NaN })) : [];
  });

  const apply = (r: number, near?: { at: number; span: number }) => {
    rot.current = r;
    const g = ref.current;
    if (!g) return;
    g.setAttribute("transform", `rotate(${r.toFixed(2)})`);
    // (the world under the board turns with the table)
    if (satRef.current) satRef.current.style.transform = `rotate(${r.toFixed(2)}deg)`;
    upright(r, near);
  };
  const upright = (r: number, near?: { at: number; span: number }) => {
    const back = `rotate(${(-r).toFixed(2)})`;
    for (const u of ups.current) {
      const { x, y, lift } = u.el.dataset;
      if (x !== u.x || y !== u.y) {
        u.x = x;
        u.y = y;
        u.at = `translate(${x} ${y}) `;
        u.angle = (Math.atan2(Number(x), -Number(y)) * 180) / Math.PI;
        u.shown = NaN;
      }
      // (a fraction of a degree isn't worth the browser's work; turned in step, it never adds up)
      if (Math.abs(u.shown - r) < 0.35 || !u.el.isConnected) continue;
      if (near && Math.abs(((((u.angle + r - near.at) % 360) + 540) % 360) - 180) > near.span) continue;
      u.shown = r;
      u.el.setAttribute("transform", `${u.at}${back}${lift ? ` translate(0 ${lift})` : ""}`);
    }
  };

  const focusRef = useRef({ focus, focusAt });
  focusRef.current = { focus, focusAt };
  useLayoutEffect(() => {
    if (!rig) return;
    rig.current = svgRef.current && {
      svg: svgRef.current,
      turn: apply,
      upright,
      rotation: () => rot.current,
      focusRotation: () => {
        // The nearest way round to where the table rests.
        const target = focusRef.current.focusAt - angleOf(focusRef.current.focus);
        return rot.current + (((((target - rot.current) % 360) + 540) % 360) - 180);
      },
    };
  });

  useLayoutEffect(() => {
    // A move turns the table itself, and gives it back where it rests.
    if (riding !== undefined && riding !== null) return;
    const target = focusAt - angleOf(focus);
    const start = rot.current;
    const delta = ((((target - start) % 360) + 540) % 360) - 180;
    const svg = svgRef.current;
    if (reduced || Math.abs(delta) < 0.01) {
      apply(start + delta);
      return;
    }
    let raf = 0;
    if (Math.abs(delta) > FADE_PAST) {
      // A long way round: the board dips out and comes back turned, rather than spinning.
      const t0 = performance.now();
      let turned = false;
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / FADE_MS);
        if (p >= 0.5 && !turned) {
          turned = true;
          apply(start + delta);
        }
        const o = p < 1 ? Math.abs(2 * p - 1).toFixed(3) : "";
        if (svg) svg.style.opacity = o;
        if (satRef.current) satRef.current.style.opacity = o;
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      return () => {
        cancelAnimationFrame(raf);
        if (svg) svg.style.opacity = "";
        if (satRef.current) satRef.current.style.opacity = "";
        if (!turned) apply(start + delta);
      };
    }
    let at = start;
    let vel = 0;
    let last = performance.now();
    const goal = start + delta;
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const err = goal - at;
      const want = Math.sign(err) * Math.min(TURN_MAX, Math.sqrt(2 * TURN_ACCEL * Math.abs(err)));
      vel += Math.max(-TURN_ACCEL * dt, Math.min(TURN_ACCEL * dt, want - vel));
      at += vel * dt;
      const done = Math.abs(goal - at) < 0.05 && Math.abs(vel) < 3;
      apply(done ? goal : at);
      if (!done) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [focus, focusAt, reduced, riding]);

  // Tokens walk around the ring to their new space, with a little hop on each one: in step with the
  // thrower's ride when we know its beat (`walks`), at once otherwise.
  const shown = useRef(new Map<number, number>());
  const walksRef = useRef(walks);
  walksRef.current = walks;
  const posKey = tokens.map((t) => `${t.seat}:${t.at}`).join(",");
  useLayoutEffect(() => {
    const g = ref.current;
    const moves: { seat: number; from: number; delta: number; el: SVGGElement; fan: number; ring: number; start: number; per: number }[] = [];
    for (const tk of tokens) {
      const from = shown.current.get(tk.seat);
      shown.current.set(tk.seat, tk.at);
      if (from === undefined || from === tk.at || reduced || !g || tk.seat === riding) continue;
      let delta = (tk.at - from + BOARD.length) % BOARD.length;
      if (delta > BOARD.length / 2) delta -= BOARD.length;
      const el = g.querySelector<SVGGElement>(`[data-seat="${tk.seat}"]`);
      if (!el) continue;
      const w = walksRef.current?.[tk.seat];
      const now = performance.now();
      // (a beat we know of: the walk starts when the thrower's does, a space at its pace; otherwise now)
      const start = w && w.start > now - 4000 ? w.start : now;
      const per = w ? w.per : Math.min(1800, 220 + Math.abs(delta) * 120) / Math.max(1, Math.abs(delta));
      moves.push({ seat: tk.seat, from, delta, el, fan: Number(el.dataset.fan ?? 0), ring: Number(el.dataset.ring ?? RT), start, per });
    }
    if (!moves.length) return;
    let raf = 0;
    const step = (now: number) => {
      let going = false;
      for (const m of moves) {
        const p = Math.max(0, Math.min(1, (now - m.start) / Math.max(1, m.per * Math.abs(m.delta))));
        if (p < 1) going = true;
        const at = m.from + m.delta * p;
        const hop = Math.abs(Math.sin(Math.PI * (at - Math.floor(at)))) * 16 * (p < 1 && p > 0 ? 1 : 0);
        const [x, y] = xy(angleOf(at) + m.fan, m.ring);
        m.el.dataset.x = x.toFixed(1);
        m.el.dataset.y = y.toFixed(1);
        m.el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-rot.current).toFixed(2)}) translate(0 ${(-hop).toFixed(1)})`);
      }
      if (going) raf = requestAnimationFrame(step);
    };
    // (straight away, before the board is painted: a token waiting for the thrower's beat stays put)
    step(performance.now());
    return () => cancelAnimationFrame(raf);
  }, [posKey, reduced]);

  // Owner marks and houses already there when the board first draws stay still; new ones pop up.
  const born = useRef<{ owned: Set<number>; houses: Map<number, number> } | null>(null);
  born.current ??= {
    owned: new Set(marks.flatMap((m, at) => (m?.owner ? [at] : []))),
    houses: new Map(marks.flatMap((m, at) => (m?.houses ? [[at, m.houses] as [number, number]] : []))),
  };
  const { owned, houses } = born.current;
  marks.forEach((m, at) => {
    if (!m?.owner) owned.delete(at);
    if ((m?.houses ?? 0) < (houses.get(at) ?? 0)) houses.set(at, m?.houses ?? 0);
  });

  const r = rot.current;
  const bySpace = new Map<number, TokenMark[]>();
  for (const t of tokens) bySpace.set(t.at, [...(bySpace.get(t.at) ?? []), t]);

  return (
    <>
    {/* (the satellite map, under the board: it shows through the middle once it's painted) */}
    {sat && <canvas ref={satRef} class={`satmap${satOn ? " on" : ""}`} width={1} height={1} style={{ transform: `rotate(${r.toFixed(2)}deg)` }} aria-hidden="true" />}
    <svg ref={svgRef} class={`${cls ?? "roundboard"}${riding !== undefined && riding !== null ? " riding" : ""}${satOn ? " sat-on" : ""}`} viewBox="-500 -500 1000 1000" role="img" aria-label="board">
      <g ref={cam}>
      <circle class="rim" r={RO + 8} fill="var(--board-rim)" />
      {/* (round the big screen's globe, which stands where the flat map is: styles.css .globe-on) */}
      <path class="rim-ring" d={`M${-RO - 8} 0a${RO + 8} ${RO + 8} 0 1 0 ${2 * (RO + 8)} 0a${RO + 8} ${RO + 8} 0 1 0 ${-2 * (RO + 8)} 0M${-RMAP + 2} 0a${RMAP - 2} ${RMAP - 2} 0 1 0 ${2 * (RMAP - 2)} 0a${RMAP - 2} ${RMAP - 2} 0 1 0 ${-2 * (RMAP - 2)} 0Z`} fill="var(--board-rim)" fill-rule="evenodd" />
      <g ref={ref} transform={`rotate(${r})`}>
        <RouteMap r={RMAP} flight={flight} reduced={reduced} turned={() => rot.current} />
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
              <path d={wedge(at, corner ? RO + 6 : RO)} class={corner ? "wedge corner-w" : "wedge"} style={group ? { fill: TINT[group.id] } : undefined} />
              {group && <path d={band(at)} fill={group.color} />}
              {group && (
                <Up x={bx} y={by} rot={r}>
                  <path d={shapePath(group.shape, 10)} fill="var(--board-paper)" stroke="rgba(0,0,0,.35)" stroke-width="1.5" />
                </Up>
              )}
              {city ? (
                <Up x={lx} y={ly} rot={r}>
                  <path class="code" d={CODE_PATH[city.id]} aria-hidden="true" />
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
              {mark?.houses ? <Houses at={at} n={mark.houses} old={houses.get(at) ?? 0} /> : null}
              {mark?.news && (
                <Up x={xy(deg, RN)[0]} y={xy(deg, RN)[1]} rot={r}>
                  <g class="pop board-news">
                    <rect x={-24} y={-13} width="48" height="26" rx="13" />
                    {NEWS_PATH[mark.news] ? (
                      <path class="tag" d={NEWS_PATH[mark.news]} />
                    ) : (
                      <text y="6" text-anchor="middle">
                        {mark.news}
                      </text>
                    )}
                  </g>
                </Up>
              )}
              {mark?.owner && (
                <Up x={mx} y={my} rot={r}>
                  {/* A city just bought: the owner's mark comes down like a stamp, and the ink spreads. */}
                  {!owned.has(at) && <circle class="stamp-ring" r="17" stroke={mark.owner.color} />}
                  <g class={owned.has(at) ? undefined : "stamp-in"}>
                    <circle r="17" fill={mark.owner.color} stroke="var(--board-paper)" stroke-width="3" />
                    <path class="owner" d={OWNER_PATH[mark.owner.letter]} />
                  </g>
                </Up>
              )}
            </g>
          );
        })}
        {/* (one list, keyed by seat: a token that moves to another space keeps its drawing, which walks) */}
        {[...bySpace.entries()].flatMap(([at, list]) => {
          const place = slots(list.length, tokenScale);
          return (
            list
              .map((tk, i) => ({ tk, slot: place[i] }))
              // (the rows further in first: the pair on the ring stands in front of them)
              .sort((a, b) => a.slot.ring - b.slot.ring)
              .map(({ tk, slot }) => {
                const s = tokenScale * slot.k;
                const [x, y] = xy(angleOf(at) + slot.fan, slot.ring);
                const now = (turn === undefined ? at === active : tk.seat === turn) && tk.mood !== "sad";
                return (
                  <Up key={tk.seat} x={x} y={y} rot={r} extra={{ "data-seat": tk.seat, "data-fan": slot.fan.toFixed(2), "data-ring": slot.ring.toFixed(1) }}>
                    <g class={`token${now ? " now" : ""}${tk.seat === riding ? " ridden" : ""}`} data-k={slot.k}>
                      <ellipse cx="0" cy={(45 * s).toFixed(1)} rx={(38 * s).toFixed(1)} ry={(12 * s).toFixed(1)} fill="rgba(0,0,0,.18)" />
                      <g class="hop">
                        <g transform={`translate(${(-ART_X * s).toFixed(1)} ${(-ART_Y * s).toFixed(1)}) scale(${s.toFixed(3)})`}>
                          {/* A new mood plays its reaction once (a new animation name restarts it): a jump for
                              good news, a shake for a bill… */}
                          <g class={`react r-${tk.mood ?? "idle"}`}>
                            <CharacterArt kind={tk.kind} mood={tk.mood} />
                          </g>
                        </g>
                        {/* Sharing a space: the team's letter at its shoulder, as on the cities it owns. */}
                        {list.length > 1 && tk.badge && (
                          <g class="tk-badge" transform={`translate(${(40 * s).toFixed(1)} ${(-46 * s).toFixed(1)})`}>
                            <circle r="15" fill={tk.badge.color} stroke="var(--board-paper)" stroke-width="2.5" />
                            <path class="owner" d={OWNER_PATH[tk.badge.letter]} transform="scale(0.88)" />
                          </g>
                        )}
                      </g>
                    </g>
                  </Up>
                );
              })
          );
        })}
      </g>
      </g>
      {center}
    </svg>
    </>
  );
}

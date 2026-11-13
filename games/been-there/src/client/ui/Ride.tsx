// Plays a move on the board (ridePlan.ts works out what to play and when). Three ways:
//  - "fp", the throwing team's phone: the camera pushes in behind the token (without turning),
//    follows it round the ring by turning only (60 degrees a second at most) and pulls back out
//    (without turning). One camera move at a time, never a shake.
//  - "flat", the same beats on the board as it rests (leaning back as on a table, and no further):
//    reduced motion, the menu's setting off, a throw that stays put, or a tap that skipped the ride.
//  - "tv", the big screen: a small push in (1.4×) and a pan after the token, flat.
// The token is drawn here, standing over the board; so are the dice, the departures board that
// flips up the cities passed (a real split-flap module turns a flap every 0.1 s: two flaps a space;
// a phone's own, in the corner of the sky: the big screen has its own, ui/Departures.tsx),
// the stamp that comes down beside the token on landing and the city's name. The whole move is one
// loop on the animation clock, from the server's moment of the throw.
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { BOARD, CITY_AT, GROUPS, JOURNEY_CARDS, POSTCARDS } from "../../engine";
import { CharacterArt, type Mood } from "../art/characters";
import { Dice } from "../art/dice";
import { TOKEN_R, TOKEN_SCALE, angleOf, xy, type Rig } from "../art/RoundBoard";
import { CODE, StampArt } from "../art/stamps";
import { BUZZ, buzz, holdShake } from "../controls";
import { getLang, money, spaceName, t, tx } from "../i18n";
import { sfx } from "../sound";
import { serverNow } from "../store";
import { reducedMotion } from "../motion";
import { keepIn, mapCam, type MapHand } from "./mapView";
import { BEAT, type RidePlan } from "./ridePlan";

const N = BOARD.length;

/** The first-person camera: zoom, where the token stands in view (viewBox units: a little off the
 * middle, three quarters down), the lean (degrees), the lens (board widths) and how much bigger the
 * leaning board is drawn than its box, so its near edge reaches the bottom. The token stands at
 * 9 o'clock, so the way ahead runs up the screen. */
export const CAM = { z: 1.9, ax: 40, ay: 250, tilt: 52, lens: 1.6, grow: 1.25 };
/** The big screen only pushes in this far, flat, and pans this much of the way to the token. */
const TV = { z: 1.4, pan: 0.55 };
/** The camera turns 60 degrees a second at most, and eases in and out of it. */
export const TURN = { max: 60, accel: 300 };
/** Where the stamp comes down: beside the token, on the plain band inside the ring. */
const INK_R = TOKEN_R - 104;
/** What the close camera can read: the spaces either side of the token at 9 o'clock. */
const NEAR = { at: 270, span: 32 };

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const back = (p: number) => 1 + 2.6 * Math.pow(p - 1, 3) + 1.6 * Math.pow(p - 1, 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const near = (from: number, to: number) => from + (((((to - from) % 360) + 540) % 360) - 180);
const wrap = (at: number) => ((Math.round(at) % N) + N) % N;

/** The table's angle that brings ring position `pos` (in spaces) to 9 o'clock, where the camera pushes in. */
export const anchorRot = (pos: number) => 270 - angleOf(pos);

export interface Cam {
  z: number;
  tx: number;
  ty: number;
  rot: number;
  /** The lean back (degrees). */
  tilt: number;
  /** How much bigger the leaning board is drawn than its box (about the camera's point). */
  g: number;
  /** How far into the first-person ride: the far side fading into the sky, the sky itself (0 to 1). */
  fade: number;
  /** A phone's bigger map over the board as it shows (ui/mapView.ts, the board leaning back): zoomed
   * `mz` round the box's middle, then moved over (mx, my) (board units). None: 1, 0, 0. */
  mz?: number;
  mx?: number;
  my?: number;
}

/**
 * The whole board at rest, leaning back `lean` degrees as a board on a table does (the big screen, a
 * laptop showing all of it: ui/Board.tsx boardLean), drawn as big as fits its box and in the middle of
 * it: how much bigger (g) and how far down (ty, board units), worked out once for each lean. The board
 * reaches 0.52 of its box from the middle, its edge and its shadow on the table under it included.
 */
const FIT_R = 0.52;
const fits = new Map<number, { g: number; ty: number }>();
export function leanFit(lean: number): { g: number; ty: number } {
  const known = fits.get(lean);
  if (known) return known;
  const th = (lean * Math.PI) / 180;
  const oy = (CAM.ay + 500) / 1000;
  // Where the board's edge shows (box widths), drawn g bigger and moved ty down (box widths).
  const extent = (g: number, ty: number) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * 2 * Math.PI;
      const dx = FIT_R * Math.sin(a) * g;
      const dy = (0.5 - FIT_R * Math.cos(a) + ty - oy) * g;
      const w = CAM.lens / (CAM.lens - dy * Math.sin(th));
      x0 = Math.min(x0, 0.5 + dx * w);
      x1 = Math.max(x1, 0.5 + dx * w);
      y0 = Math.min(y0, oy + dy * Math.cos(th) * w);
      y1 = Math.max(y1, oy + dy * Math.cos(th) * w);
    }
    return { x0, x1, y0, y1 };
  };
  // (for a size, the shift that puts it in the middle; then the biggest size that fits)
  const centred = (g: number) => {
    let ty = 0;
    for (let i = 0; i < 24; i++) {
      const e = extent(g, ty);
      ty -= ((e.y0 + e.y1) / 2 - 0.5) / Math.max(0.2, g * Math.cos(th));
    }
    return ty;
  };
  let lo = 0.5;
  let hi = 1.6;
  for (let i = 0; i < 30; i++) {
    const g = (lo + hi) / 2;
    const e = extent(g, centred(g));
    if (e.x0 >= 0 && e.x1 <= 1 && e.y0 >= 0 && e.y1 <= 1) lo = g;
    else hi = g;
  }
  const out = { g: lo, ty: centred(lo) * 1000 };
  fits.set(lean, out);
  return out;
}

/** The board at rest: flat, or leaning back `lean` degrees, all of it in its box. */
export const rest = (rot: number, lean = 0): Cam => {
  if (lean < 0.05) return { z: 1, tx: 0, ty: 0, rot, tilt: 0, g: 1, fade: 0 };
  const f = leanFit(lean);
  return { z: 1, tx: 0, ty: f.ty, rot, tilt: lean, g: f.g, fade: 0 };
};
const ridePose = (rot: number): Cam => ({ z: CAM.z, tx: CAM.ax + CAM.z * TOKEN_R, ty: CAM.ay, rot, tilt: CAM.tilt, g: CAM.grow, fade: 1 });
const mix = (a: Cam, b: Cam, p: number): Cam => ({
  z: lerp(a.z, b.z, p),
  tx: lerp(a.tx, b.tx, p),
  ty: lerp(a.ty, b.ty, p),
  rot: lerp(a.rot, b.rot, p),
  tilt: lerp(a.tilt, b.tilt, p),
  g: lerp(a.g, b.g, p),
  fade: lerp(a.fade, b.fade, p),
  mz: lerp(a.mz ?? 1, b.mz ?? 1, p),
  mx: lerp(a.mx ?? 0, b.mx ?? 0, p),
  my: lerp(a.my ?? 0, b.my ?? 0, p),
});
/** At rest, the board as a phone's map shows it (ui/mapView.ts): zoomed `z` round (cx, cy), the board as
 * it shows in its box, leaning back `lean` degrees (flat, the camera's own zoom and pan; leaning, the
 * map's, over the board as it leans). 1 is the whole board. */
const home = (rot: number, z: number, cx: number, cy: number, lean = 0): Cam => {
  if (z <= 1.0005) return rest(rot, lean);
  const m = mapCam(z, cx, cy);
  return lean < 0.05 ? { ...m, rot, tilt: 0, g: 1, fade: 0 } : { ...rest(rot, lean), mz: z, mx: m.tx, my: m.ty };
};
/** Where the token on ring position `pos` (in spaces) shows in the board's box at rest (board units from
 * its middle), the board turned to `rot` and leaning back `lean`: where the map looks to see it. */
const onScreen = (pos: number, rot: number, lean = 0): [number, number] => {
  const [x, y] = xy(angleOf(pos), TOKEN_R);
  if (lean >= 0.05) {
    const p = project(x, y, rest(rot, lean), 1000);
    return [p.x - 500, p.y - 500];
  }
  const a = (rot * Math.PI) / 180;
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
};
/** The big screen's push in, after the token: on the board as it rests (leaning back, `lean`). */
function tvPose(pos: number, rot: number, lean = 0): Cam {
  const [bx, by] = xy(angleOf(pos), TOKEN_R);
  const a = (rot * Math.PI) / 180;
  const rx = bx * Math.cos(a) - by * Math.sin(a);
  const ry = bx * Math.sin(a) + by * Math.cos(a);
  const base = rest(rot, lean);
  return { ...base, z: TV.z, tx: -rx * TV.z * TV.pan, ty: base.ty - ry * TV.z * TV.pan };
}

/** Where a point of the board (board units, before the table turns) shows on screen, in px from the
 * board's top left corner, and how much bigger or smaller it looks there. */
export function project(bx: number, by: number, c: Cam, size: number) {
  const a = (c.rot * Math.PI) / 180;
  const rx = bx * Math.cos(a) - by * Math.sin(a);
  const ry = bx * Math.sin(a) + by * Math.cos(a);
  const k = size / 1000;
  const px = (c.z * rx + c.tx + 500) * k;
  const py = (c.z * ry + c.ty + 500) * k;
  let out = { x: px, y: py, s: c.z * k };
  if (c.tilt >= 0.05) {
    // The lean: about a line across the board through the camera's point (the transform origin).
    const ox = size / 2;
    const oy = (CAM.ay + 500) * k;
    const th = (c.tilt * Math.PI) / 180;
    const dx = (px - ox) * c.g;
    const dy = (py - oy) * c.g;
    const z = dy * Math.sin(th);
    const lens = CAM.lens * size;
    const w = lens / (lens - z);
    out = { x: ox + dx * w, y: oy + dy * Math.cos(th) * w, s: w * c.g * c.z * k };
  }
  // A phone's bigger map, over the board as it shows (round the box's middle).
  const mz = c.mz ?? 1;
  if (mz === 1 && !c.mx && !c.my) return out;
  const h = size / 2;
  return { x: h + (c.mx ?? 0) * k + mz * (out.x - h), y: h + (c.my ?? 0) * k + mz * (out.y - h), s: out.s * mz };
}

/**
 * Where what stands over the middle of the board goes as the camera moves (the big screen's globe
 * and its centre card, `.board-cam`): over the middle of the board as it shows, as big as the board
 * is drawn there, upright. On a leaning board the globe is a ball in the hole of the ring, which shows
 * shorter than it is wide: it's drawn as tall as the hole shows, so it never covers the far side.
 */
export function camLayerTransform(c: Cam, size: number, ball: boolean): string {
  const k = size / 1000;
  if (c.tilt < 0.05) return c.z === 1 && !c.tx && !c.ty ? "" : `translate(${(c.tx * k).toFixed(1)}px, ${(c.ty * k).toFixed(1)}px) scale(${c.z.toFixed(4)})`;
  const mid = project(0, 0, c, size);
  const s = (mid.s / k) * (ball ? Math.cos((c.tilt * Math.PI) / 180) : 1);
  return `translate(${(mid.x - size / 2).toFixed(1)}px, ${(mid.y - size / 2).toFixed(1)}px) scale(${s.toFixed(4)})`;
}

/** Put the big screen's middle layers (`.board-cam`) where the board's middle is, for camera `c`. */
export function placeCamLayers(layers: HTMLElement[], c: Cam, size: number) {
  for (const layer of layers) {
    const tf = camLayerTransform(c, size, layer.classList.contains("board-under"));
    if (layer.style.transform !== tf) layer.style.transform = tf;
  }
}

/**
 * Put the camera over the board: the whole drawing moves as one, by a single CSS transform (zoom, pan,
 * the turn past the table's own angle `drawn`, and the lean back), so the browser only moves what it
 * has already painted, frame after frame. Written only when it changes. `size`: the board's width.
 */
export function viewBoard(svg: HTMLElement | SVGElement, c: Cam, drawn: number, size: number) {
  const k = size / 1000;
  const turn = c.rot - drawn;
  const mz = c.mz ?? 1;
  const mapped = Math.abs(mz - 1) > 0.0001 || !!c.mx || !!c.my;
  const still = !mapped && c.tilt < 0.05 && c.z === 1 && !c.tx && !c.ty && Math.abs(turn) < 0.01;
  const p = c.fade;
  // (about a line across the board at the camera's point; the zoom and the turn about its middle; a
  // phone's bigger map over all of it, as the board shows, round the box's middle)
  const ay = CAM.ay * k;
  const tf = still
    ? ""
    : `${mapped ? `translate(${((c.mx ?? 0) * k).toFixed(1)}px, ${(((c.my ?? 0) + (mz - 1) * CAM.ay) * k).toFixed(1)}px) scale(${mz.toFixed(4)}) ` : ""}` +
      `${c.tilt >= 0.05 ? `perspective(${Math.round(CAM.lens * size)}px) rotateX(${c.tilt.toFixed(2)}deg) scale(${c.g.toFixed(4)}) ` : ""}` +
      `translate(${(c.tx * k).toFixed(1)}px, ${(c.ty * k - ay).toFixed(1)}px) scale(${c.z.toFixed(4)}) rotate(${turn.toFixed(2)}deg) translate(0px, ${ay.toFixed(1)}px)`;
  if (svg.style.transform !== tf) {
    svg.style.transformOrigin = `50% ${(CAM.ay + 500) / 10}%`;
    svg.style.transform = tf;
  }
  // The far side of the board leaning back on a ride fades into the sky instead of ending at an edge
  // (at rest the whole board shows, the far side too).
  const mask = p < 0.005 ? "" : `linear-gradient(to bottom, transparent ${(4 * p).toFixed(1)}%, #000 ${(34 * p).toFixed(1)}%)`;
  if (svg.dataset.mask !== mask) {
    svg.dataset.mask = mask;
    if (mask) {
      svg.style.setProperty("mask-image", mask);
      svg.style.setProperty("-webkit-mask-image", mask);
    } else {
      svg.style.removeProperty("mask-image");
      svg.style.removeProperty("-webkit-mask-image");
    }
  }
}

/** Stamp ink on the navy board: each region's colour, lightened so it reads on the dark. */
const BOARD_INK: Record<number, string> = { 1: "#d9a877", 2: "#8fd0f5", 3: "#e8a8cf", 4: "#f5c060", 5: "#f59e66", 6: "#f0e27f", 7: "#4fd3a6", 8: "#6ab8ee" };

/** The stamp for where the token lands: a city's passport stamp, or a plain one with the space's name. */
export function LandStamp({ at }: { at: number }) {
  const city = CITY_AT[at];
  const lang = getLang();
  if (city) return <StampArt id={city.id} lang={lang} ink={BOARD_INK[city.group]} />;
  const sp = BOARD[at];
  const ink = sp.k === "expired" ? "#ff6b82" : "var(--board-ink)";
  return (
    <g fill="none" stroke={ink} stroke-linejoin="round">
      <rect x="-56" y="-30" width="112" height="60" rx="6" stroke-width="3.2" />
      <rect x="-49" y="-23" width="98" height="46" rx="3" stroke-width="1.4" />
      <text y="6" text-anchor="middle" fill={ink} stroke="none" font-size="19" font-weight="800" class="stamp-word" textLength={spaceName(at).length > 4 ? 88 : undefined} lengthAdjust="spacingAndGlyphs">
        {spaceName(at)}
      </text>
    </g>
  );
}

type Row = { at: number; kind: "pass" | "salary" | "card" | "stay"; space: number; amount?: number; card?: string };

/** The departures board's rows, and when each flips up (ms after the start). */
export function rowsOf(plan: RidePlan): Row[] {
  const rows: Row[] = [];
  const T = plan.t;
  plan.legs.forEach((leg, j) => {
    const { at, per, cut } = T.legs[j];
    // A card that sends the token on comes up on its space, while the token waits there.
    if (j > 0 && leg.by === "card") rows.push({ at: at - BEAT.pause * plan.pace + 40, kind: "card", space: leg.from, card: leg.card });
    if (!leg.steps) {
      rows.push({ at, kind: "stay", space: leg.from });
      return;
    }
    if (cut) {
      if (leg.salary) rows.push({ at: at + cut / 2, kind: "salary", space: 0, amount: leg.salary });
      return;
    }
    const last = j === plan.legs.length - 1;
    for (let i = 1; i <= leg.steps; i++) {
      const space = wrap(leg.from + leg.dir * i);
      const time = at + i * per;
      if (space === 0 && leg.salary && leg.dir === 1 && !(last && i === leg.steps)) rows.push({ at: time, kind: "salary", space, amount: leg.salary });
      else if (CITY_AT[space] && !(i === leg.steps && last)) rows.push({ at: time, kind: "pass", space });
    }
    if (last && leg.salary && leg.to === 0) rows.push({ at: at + leg.steps * per, kind: "salary", space: 0, amount: leg.salary });
  });
  return rows;
}

const cardTitle = (id?: string) => {
  const c = id ? [...JOURNEY_CARDS, ...POSTCARDS].find((x) => x.id === id) : undefined;
  return c ? tx(c.title) : t("journey");
};

/** A row's three letters on the split-flap tiles. */
const codeOf = (r: Row) => (r.kind === "pass" ? CODE[CITY_AT[r.space]!.id] : r.kind === "salary" ? "GO" : r.kind === "card" ? "JNY" : "---");

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const FLAP: Keyframe[] = [{ transform: "rotateX(-80deg)" }, { transform: "none" }];
/** Flip a row's tiles up: two flaps of 0.1 s through other letters, then its own. */
function flipRow(row: HTMLElement, still: boolean) {
  const tiles = Array.from(row.querySelectorAll<HTMLElement>(".tile"));
  const own = tiles.map((x) => x.dataset.ch ?? "");
  if (still) {
    tiles.forEach((x, i) => (x.textContent = own[i]));
    return;
  }
  [0, 100].forEach((d, k) =>
    window.setTimeout(() => {
      tiles.forEach((x, i) => {
        const c = own[i];
        x.textContent = k ? c : LETTERS[(LETTERS.indexOf(c) + 7 + i) % 26] ?? c;
        x.animate?.(FLAP, { duration: 100, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      });
    }, d),
  );
}

export function Ride({
  plan,
  rig,
  kind,
  mood,
  mode,
  urgent,
  onReady,
  onDone,
  scale = TOKEN_SCALE.phone,
  map,
}: {
  plan: RidePlan;
  rig: { current: Rig | null };
  /** The token's character (its team colour). */
  kind: number;
  /** How big the token is drawn, as on the board (TOKEN_SCALE). */
  scale?: number;
  /** A phone's map at the size picked (ui/mapView.ts): the camera takes the view over from it and gives
   * it back over where the token landed. (The big screen's board always fits.) */
  map?: MapHand | null;
  /** How the token feels once it has landed (a bill, a new city…). */
  mood: Mood;
  mode: "fp" | "flat" | "tv";
  /** Something on a clock came up for this phone: cut the ride short. */
  urgent?: boolean;
  /** The decision window can come back (the ride's own clock: a skip brings it sooner). */
  onReady?: (key: number) => void;
  onDone: (key: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const urgentRef = useRef(!!urgent);
  urgentRef.current = !!urgent;
  const cb = useRef({ onReady, onDone });
  cb.current = { onReady, onDone };
  const rows = useMemo(() => rowsOf(plan), [plan.key]);
  const last = plan.legs[plan.legs.length - 1];
  // (where the stamp comes down: Immigration's gate drops after it, wherever the token was sent from)
  const landAt = last.to;
  const land = CITY_AT[landAt];
  const group = land ? GROUPS.find((g) => g.id === land.group) : null;
  const still = reducedMotion();
  const phone = mode !== "tv";

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const $ = <T extends Element>(sel: string) => el.querySelector<T>(sel);
    // The token and everything over the board move by CSS transform alone: nothing is redrawn.
    const token = $<HTMLElement>(".ride-token")!;
    const ground = $<HTMLElement>(".ride-ground")!;
    const stamp = $<HTMLElement>(".ride-stamp");
    const ink = $<HTMLElement>(".ride-ink");
    const landEl = $<HTMLElement>(".ride-land")!;
    const gate = $<HTMLElement>(".ride-jail");
    const fade = $<HTMLElement>(".ride-fade")!;
    const diceBox = $<HTMLElement>(".ride-dice");
    const sum = $<HTMLElement>(".ride-dice .dice-sum");
    const board = $<HTMLElement>(".ride-board");
    const rowEls = Array.from(el.querySelectorAll<HTMLElement>(".ride-board .row"));
    const sky = el.parentElement?.querySelector<HTMLElement>(".ride-sky") ?? null;
    const wrapEl = el.parentElement;
    // (the camera moves the board's frame, not the drawing itself: a browser lays SVG text out again
    // whenever the drawing's own transform changes)
    const view = wrapEl?.querySelector<HTMLElement>(".board-view") ?? null;
    // (on the big screen the globe and the middle of the board move with the camera too)
    const camLayers = mode === "tv" ? Array.from(wrapEl?.querySelectorAll<HTMLElement>(".board-cam") ?? []) : [];
    // (how far the board leans back at rest, the whole of it showing: ui/Board.tsx boardLean)
    const lean = rig.current?.lean ?? 0;
    const T = plan.t;
    const startPerf = performance.now() + (plan.start - serverNow());
    // (when this screen will stamp the landing, on its own clock: every screen's should agree)
    el.dataset.land = String(Math.round(Date.now() + (plan.start + T.land - serverNow())));
    const reduced = reducedMotion();
    // Sizes are read once (and again if the screen turns), never inside a frame: a read after the
    // frame's writes would make the browser lay the page out again on the spot.
    const box = { w: el.clientWidth, h: el.clientHeight, board: rig.current?.svg.clientWidth || 1 };
    const sized = new ResizeObserver(() => {
      box.w = el.clientWidth;
      box.h = el.clientHeight;
      box.board = rig.current?.svg.clientWidth || 1;
    });
    sized.observe(el);
    // The map's view on a phone (ui/mapView.ts): the camera starts where the map is, at its zoom, and
    // comes back to the size picked over where the token landed, so neither end jumps.
    const hand = map ?? null;
    const begin = hand ? hand.release() : null;
    const Z = hand ? Math.max(1, hand.zoom) : 1;
    const z0 = begin ? begin.z : 1;
    const c0: [number, number] = begin ? [begin.cx, begin.cy] : [0, 0];
    // (a flat move's camera on a bigger map: its middle and zoom, easing along with the token)
    const flat = [c0[0], c0[1], z0];
    let snapFlat = false;
    let handed = false;
    const endAt = plan.jail ? 10 : landAt;
    // (shown at once, as the map was: the first frame is a moment away)
    if (begin && rig.current) viewBoard(view ?? rig.current.svg, home(rig.current.rotation(), z0, c0[0], c0[1], lean), rig.current.rotation(), box.board);
    let shift = 0;
    let skipTo: number | null = null;
    let flatCut = mode !== "fp";
    let yaw: number | null = null;
    let vel = 0;
    let lastNow = 0;
    // The table's own angle as drawn; on a move the camera turns the drawing past it, as a whole.
    let drawn = NaN;
    let lastUp = NaN;
    let raf = 0;
    let over = false;
    let readied = false;
    const fired = new Set<string>();
    const once = (k: string, fn: () => void) => {
      if (fired.has(k)) return;
      fired.add(k);
      fn();
    };
    if (phone) holdShake(true);
    // How late this screen came in (a phone that got the throw a moment after it happened): the dice
    // that were already tumbling are where they'd be by now.
    diceBox?.style.setProperty("--late", `${Math.max(0, -(startPerf - performance.now()))}ms`);

    /** Turn toward `target` no faster than 60°/s, easing in and out, without overshooting. */
    const turnToward = (target: number, dt: number) => {
      if (yaw === null) return;
      const err = target - yaw;
      const want = Math.sign(err) * Math.min(TURN.max, Math.sqrt(2 * TURN.accel * Math.abs(err)));
      vel += clamp(want - vel, -TURN.accel * dt, TURN.accel * dt);
      yaw += vel * dt;
      if (Math.abs(target - yaw) < 0.05 && Math.abs(vel) < 3) {
        yaw = target;
        vel = 0;
      }
    };

    // A tap on the board skips: straight to the stamp (the camera cuts to the flat board), and a
    // second tap past it.
    const skip = () => {
      if (!phone || over) return;
      const t = performance.now() - startPerf + shift;
      if (t < T.land) {
        skipTo = T.land;
        flatCut = true;
        snapFlat = true;
      } else if (t < T.ready) skipTo = T.ready;
    };
    wrapEl?.addEventListener("pointerdown", skip);

    /** Give the table back as it rests: everything upright, and any turn still owed (a few degrees
     * the camera hadn't caught up, or Immigration across the board) left to the board, which turns no
     * faster than the ride did, or fades if it's far. Only a sliver is put right at once. */
    const giveBack = (r: Rig) => {
      const at = yaw ?? r.rotation();
      const goal = r.focusRotation();
      // (the drawing takes the angle the camera left it at, everything upright, and stands still)
      r.turn(Math.abs(goal - at) < 1.5 ? goal : at);
      viewBoard(view ?? r.svg, rest(r.rotation(), lean), r.rotation(), box.board);
      placeCamLayers(camLayers, rest(r.rotation(), lean), box.board);
      // (the map takes the view back at its size over where the token is, as the camera left it)
      if (hand && !handed) {
        handed = true;
        const [ex, ey] = onScreen(endAt, r.rotation(), lean);
        hand.adopt(Z, keepIn(ex, Z), keepIn(ey, Z));
      }
    };

    const finish = (r: Rig | null) => {
      if (over) return;
      over = true;
      if (r) giveBack(r);
      if (phone) holdShake(false);
      cb.current.onDone(plan.key);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const r = rig.current;
      if (!r) return;
      const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
      lastNow = now;
      // (a frame's timestamp can come a few ms before the moment the ride starts)
      let t = Math.max(0, now - startPerf + shift);
      if (skipTo !== null) {
        if (t < skipTo) {
          shift += skipTo - t;
          t = skipTo;
        }
        skipTo = null;
      }
      if (urgentRef.current && t < T.ready && !fired.has("urgent")) {
        fired.add("urgent");
        shift += T.ready - t;
        t = T.ready;
        flatCut = true;
        snapFlat = true;
      }
      if (yaw === null) yaw = r.rotation();
      if (Number.isNaN(drawn)) drawn = r.rotation();
      const cam = flatCut && mode === "fp" ? "flat" : mode;

      // The dice: tumbling from the throw (CSS), settled at T.dice, the number jumping out. On the
      // way in they go to the corner, out of the camera's way.
      if (plan.rolled && diceBox) {
        if (t >= T.dice) once("sum", () => sfx.result());
        if (t > 340 && t < 340 + 200) once("c1", () => sfx.clack());
        if (t > 540 && t < 540 + 200) once("c2", () => sfx.clack());
        const pop = t < T.dice ? 0 : clamp((t - T.dice) / 220, 0, 1);
        if (sum) {
          sum.style.opacity = pop ? "1" : "0";
          sum.style.transform = `scale(${(reduced ? 1 : lerp(0.55, 1, back(pop))).toFixed(3)})`;
        }
        const W = box.w;
        const H = box.h;
        const corner = cam === "fp" || (cam === "tv" && plan.legs[0].steps) ? ease(clamp((t - T.dice) / Math.max(1, T.walk - T.dice), 0, 1)) : 0;
        const x = lerp(W / 2, W - 52, corner);
        const y = lerp(H / 2, H - 58, corner);
        diceBox.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${lerp(1, 0.6, corner).toFixed(3)})`;
        diceBox.style.opacity = t < T.land ? "1" : String(Math.max(0, 1 - (t - T.land) / 200));
      }

      // Where the token is: `pos` eased space by space, `lin` even (for the camera to follow).
      let pos = plan.legs[0].from;
      let lin = pos;
      let hop = 0;
      let squash = 0;
      let quiet = 0;
      for (let j = 0; j < plan.legs.length; j++) {
        const leg = plan.legs[j];
        const L = T.legs[j];
        if (t < L.at) break;
        if (!leg.steps) {
          pos = lin = leg.from;
          hop = reduced ? 0 : Math.sin(Math.PI * clamp((t - L.at) / L.per, 0, 1));
          continue;
        }
        if (L.cut) {
          // A far card move: a quick fade, and the token is there.
          const p = (t - L.at) / L.cut;
          pos = lin = p < 0.5 ? leg.from : leg.to;
          fade.style.opacity = p < 1 ? (1 - Math.abs(2 * p - 1)).toFixed(3) : "0";
          if (p >= 0.5)
            once(`cut${j}`, () => {
              if (yaw !== null && cam === "fp") {
                yaw = near(yaw, anchorRot(leg.to));
                vel = 0;
              }
            });
          continue;
        }
        const k = Math.min(leg.steps, (t - L.at) / L.per);
        const i = Math.floor(k);
        for (let s = 1; s <= i; s++) once(`s${j}-${s}`, () => quiet++ || sfx.flap());
        if (k >= leg.steps) {
          pos = lin = leg.from + leg.dir * leg.steps;
          continue;
        }
        lin = leg.from + leg.dir * k;
        pos = reduced ? leg.from + leg.dir * i : leg.from + leg.dir * (i + ease(k - i));
        hop = reduced ? 0 : Math.sin(Math.PI * (k - i));
        break;
      }
      // Behind Immigration's gate the token goes where it's sent.
      if (plan.jail && t >= T.ready) pos = lin = 10;

      // The departures board: each row flips up as the token gets there.
      for (let n = 0; n < rows.length; n++) {
        if (t < rows[n].at) break;
        const row = rowEls[n];
        if (row && !row.classList.contains("on")) {
          row.classList.add("on");
          board?.classList.add("shown");
          flipRow(row, reduced);
          const shown = rowEls.filter((x) => x.classList.contains("on") && !x.classList.contains("old"));
          if (shown.length > 4) shown[0].classList.add("old");
          const kind = rows[n].kind;
          if (kind === "salary") sfx.coin();
          if (kind === "card") {
            sfx.card();
            if (phone) buzz(BUZZ.card);
          }
        }
      }

      // Landing: the stamp comes down (80 ms), holds (120 ms), lifts and leaves its ink (placed below).
      if (t >= T.land) {
        once("land", () => {
          el.classList.add("landed");
          landEl.classList.add("on");
          board?.classList.add("gone");
          sfx.stamp();
          if (phone) buzz(BUZZ.land);
        });
        squash = reduced ? 0 : Math.max(0, 1 - (t - T.land) / 120);
      }
      if (plan.jail && t >= T.land + 350)
        once("gate", () => {
          gate?.classList.add("on");
          sfx.jail();
          if (phone) buzz(BUZZ.jail);
        });
      if (t >= T.ready + 150) landEl.classList.add("off");

      // The camera.
      let c: Cam;
      if (cam === "fp") {
        if (t < T.dice) {
          turnToward(near(yaw, anchorRot(plan.legs[0].from)), dt);
          c = home(yaw, z0, c0[0], c0[1], lean);
        } else if (t < T.walk) {
          once("push", () => {
            yaw = near(yaw!, anchorRot(plan.legs[0].from));
            vel = 0;
            sfx.whoosh(1);
          });
          c = mix(home(yaw, z0, c0[0], c0[1], lean), ridePose(yaw), ease((t - T.dice) / Math.max(1, T.walk - T.dice)));
        } else if (t < T.ready) {
          turnToward(near(yaw, anchorRot(lin)), dt);
          c = ridePose(yaw);
        } else {
          // (pulling out never turns: the table stays where the token landed; it's drawn at that angle
          // now, everything on it upright, while the camera is still close)
          vel = 0;
          once("settle", () => {
            r.turn(yaw!);
            drawn = yaw!;
          });
          const [ex, ey] = onScreen(pos, yaw, lean);
          c = mix(ridePose(yaw), home(yaw, Z, ex, ey, lean), ease(clamp((t - T.ready) / (T.end - T.ready), 0, 1)));
        }
      } else if (cam === "tv" && plan.legs[0].steps && !reduced) {
        if (t < T.dice) c = rest(yaw, lean);
        else if (t < T.walk) c = mix(rest(yaw, lean), tvPose(plan.legs[0].from, yaw, lean), ease((t - T.dice) / Math.max(1, T.walk - T.dice)));
        else if (t < T.ready) c = tvPose(lin, yaw, lean);
        else c = mix(tvPose(lin, yaw, lean), rest(yaw, lean), ease(clamp((t - T.ready) / (T.end - T.ready), 0, 1)));
      } else if (Z > 1.0005 || z0 > 1.0005) {
        // Flat, on a phone's bigger map: the view goes along with the token as it walks (with reduced
        // motion it holds still, and is over where the token landed once it's there).
        const landed = t >= T.land;
        const [gx, gy] = reduced ? (landed ? onScreen(pos, yaw, lean) : c0) : t >= T.walk || landed ? onScreen(lin, yaw, lean) : c0;
        const gz = reduced && !landed ? z0 : Z;
        const k = reduced || snapFlat ? 1 : 1 - Math.exp(-dt / 0.2);
        snapFlat = false;
        flat[0] += (gx - flat[0]) * k;
        flat[1] += (gy - flat[1]) * k;
        flat[2] += (gz - flat[2]) * k;
        c = home(yaw, flat[2], flat[0], flat[1], lean);
      } else c = rest(yaw, lean);
      const size = box.board;
      viewBoard(view ?? r.svg, c, drawn, size);
      if (camLayers.length) placeCamLayers(camLayers, c, size);
      // Close behind the token the camera sees a few spaces either side: the names there stand up as
      // the table turns under them (the rest turn with the table until the camera pulls out).
      if (c.fade > 0.02 && c.rot !== lastUp && Math.abs(c.rot - drawn) > 0.01) {
        lastUp = c.rot;
        r.upright(c.rot, NEAR);
      }
      if (sky) {
        const o = c.fade.toFixed(3);
        if (sky.style.opacity !== o) sky.style.opacity = o;
      }

      // The token, standing upright where its space is on screen.
      const [bx, by] = xy(angleOf(pos), TOKEN_R);
      const pt = project(bx, by, c, size);
      const sc = pt.s * scale;
      const at = `translate(${(pt.x - 60).toFixed(1)}px, ${(pt.y - 70).toFixed(1)}px) scale(${sc.toFixed(4)})`;
      // (up off the board on a hop; squashed onto its feet, 40 below its middle, on the landing)
      token.style.transform =
        squash > 0
          ? `${at} translate(0, 40px) scale(${(1 + 0.12 * squash).toFixed(3)}, ${(1 - 0.14 * squash).toFixed(3)}) translate(0, -40px)`
          : `${at} translate(0, ${(-30 * hop).toFixed(1)}px)`;
      ground.style.transform = `${at} translate(0, 42px) scale(${(1 - 0.35 * hop).toFixed(3)}) translate(0, -42px)`;
      // The stamp and its ink, beside the token on the inner band: placed once, as the token lands (the
      // camera holds still until the window comes back), and played by the browser's own animation.
      // (Each has words drawn in an SVG: moved by script frame after frame, the browser would lay them
      // out again every time.)
      if ((ink || stamp) && t >= T.land)
        once("stamped", () => {
          const [ix, iy] = xy(angleOf(landAt), INK_R);
          const ip = project(ix, iy, c, size);
          const is = ip.s * 0.62;
          const at = `translate(${(ip.x - 60).toFixed(1)}px, ${(ip.y - 60).toFixed(1)}px)`;
          if (ink) {
            ink.style.transform = `${at} scale(${is.toFixed(4)})`;
            ink.classList.add("on");
          }
          if (stamp && !reduced && t < T.land + 350)
            stamp.animate?.(
              [
                { transform: `${at} translate(0px, -46px) scale(${(is * 1.35).toFixed(4)})`, opacity: 1, easing: "cubic-bezier(0.22, 0.61, 0.36, 1)" },
                { transform: `${at} scale(${is.toFixed(4)})`, opacity: 1, offset: 80 / 350 },
                { transform: `${at} scale(${is.toFixed(4)})`, opacity: 1, offset: 200 / 350 },
                { transform: `${at} translate(0px, -50px) scale(${(is * 1.2).toFixed(4)})`, opacity: 0 },
              ],
              { duration: 350, delay: Math.min(0, T.land - t), fill: "forwards" },
            );
        });

      if (t >= T.ready && !readied) {
        readied = true;
        el.classList.add("leaving");
        cb.current.onReady?.(plan.key);
      }
      if (t >= T.end) {
        cancelAnimationFrame(raf);
        finish(r);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      sized.disconnect();
      wrapEl?.removeEventListener("pointerdown", skip);
      if (phone) holdShake(false);
      const r = rig.current;
      // Cut off (a new throw, the page leaving): the table back as it rests, and the map its view.
      if (!over && r) giveBack(r);
      if (hand && !handed) {
        handed = true;
        hand.adopt(Z, keepIn(c0[0], Z), keepIn(c0[1], Z));
      }
    };
  }, [plan.key]);

  const lang = getLang();
  return (
    <div class={`ride mode-${mode}${plan.jail ? " jailed" : ""}`} ref={root} aria-hidden="true">
      {phone && (
        <ol class="ride-board">
          <li class="ride-board-head">{t("rideVia")}</li>
          {rows.map((r, i) => (
            <li key={i} class={`row ${r.kind}`}>
              {r.kind === "pass" || r.kind === "salary" ? (
                <span class="tiles">
                  {codeOf(r)
                    .split("")
                    .map((ch, k) => (
                      <span key={k} class="tile" data-ch={ch}>
                        {ch}
                      </span>
                    ))}
                </span>
              ) : null}
              <span class="row-name">
                {r.kind === "pass"
                  ? tx(CITY_AT[r.space]!.name)
                  : r.kind === "salary"
                    ? t("ridePassGo", { amount: money(r.amount ?? 0) })
                    : r.kind === "card"
                      ? `${t("journey")}${lang === "zh" ? "：" : ": "}${cardTitle(r.card)}`
                      : t("rideStay")}
              </span>
            </li>
          ))}
        </ol>
      )}
      <div class="ride-ink">
        <svg viewBox="-60 -60 120 120" width="120" height="120" overflow="visible">
          <LandStamp at={landAt} />
        </svg>
      </div>
      <div class="ride-ground">
        <svg viewBox="0 0 120 120" width="120" height="120" overflow="visible">
          <ellipse class="ride-shadow" cx="60" cy="112" rx="34" ry="9" />
        </svg>
      </div>
      <div class="ride-token">
        <svg viewBox="0 0 120 120" width="120" height="120" overflow="visible">
          <g class="ride-body">
            <g class="before">
              <CharacterArt kind={kind} mood="happy" />
            </g>
            <g class="after">
              <CharacterArt kind={kind} mood={mood} />
            </g>
          </g>
        </svg>
      </div>
      <div class="ride-stamp">
        <svg viewBox="-60 -60 120 120" width="120" height="120" overflow="visible">
          <LandStamp at={landAt} />
        </svg>
      </div>
      {plan.rolled && (
        <div class={`ride-dice${still ? " still" : ""}`}>
          <p class="dice-sum num">
            {plan.thrown}
            {plan.doubles && <small>{t("doubles")}</small>}
          </p>
          <Dice dice={plan.dice} seed={plan.key} size={mode === "tv" ? 64 : 40} />
        </div>
      )}
      <div class="ride-land" style={group ? { "--group": group.color } : undefined}>
        <b>{land ? tx(land.name) : spaceName(landAt)}</b>
        {land && <small>{lang === "zh" ? land.name.en : land.name.zh}</small>}
      </div>
      {plan.jail && (
        <div class="ride-jail">
          <svg viewBox="0 0 120 120" class="bars">
            {[14, 38, 62, 86, 110].map((x) => (
              <rect key={x} x={x - 4} y="0" width="8" height="120" rx="4" />
            ))}
            <rect x="0" y="16" width="120" height="8" rx="4" />
          </svg>
          <b>{t("sentToImmigration")}</b>
        </div>
      )}
      <div class="ride-fade" />
      {phone && <p class="ride-skip">{t("rideSkip")}</p>}
    </div>
  );
}

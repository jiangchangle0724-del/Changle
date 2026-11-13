// The round board: 40 spaces on a turntable around the route map, a nod to changle.ca's Lazy Susan.
// The table turns a space to the place it's asked for (`focus` to `focusAt`): on the big screen the
// team on turn comes to the bottom, on a phone its own token to 9 o'clock, where its first-person
// camera pushes in. It never turns faster than 60 degrees a second; a bigger turn is a quick fade
// instead. Labels, markers and tokens stay upright while it turns. A move (ui/Ride.tsx) drives the
// table through `rig`: it turns it, moves a camera over it and leans it back.
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { BOARD, CITY_AT, GROUPS, type WorldId } from "../../engine";
import { CharacterArt, type Mood } from "./characters";
import { CityGlyph, SpaceGlyph } from "./icons";
import { RouteMap, type Flight } from "./RouteMap";
import { useSatMap } from "./SatMap";
import { shapePath } from "./shapes";
import { CODE_PATH, NEWS_PATH, OWNER_PATH, ZH_PATH } from "./boardType";

export interface SpaceMark {
  /** Owner's team colour and letter. */
  owner?: { color: string; letter: string } | null;
  houses?: number;
  mortgaged?: boolean;
  /** Travel news changing this city for now: a short tag (×2, ½, +$20, −25%). */
  news?: string;
}

/** A moment on the board for a second or two (ui/Board.tsx): a city sold at auction, a team gone broke. */
export interface BoardFx {
  id: number;
  kind: "sold" | "broke";
  /** The space it stamps. */
  at: number;
  /** The stamp's word, and its ink (the team's colour). */
  label: string;
  color: string;
}

/** A world event as it comes (ui/Board.tsx): its effect plays over the map, or on the city it strikes. */
export interface WorldFx {
  id: number;
  kind: WorldId;
  at?: number;
}

/** A world event in force that struck a city (a meteor's crater, a city locked down): its tag on the space. */
export interface WorldMark {
  id: WorldId;
  at: number;
  tag: string;
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
  /** How far the board leans back at rest (degrees: 0, flat; ui/Board.tsx boardLean). */
  lean: number;
}

const RO = 490;
const RB = 460;
const RI = 342;
const RL = 428;
const RM = 389;
const RH = 358;
const RT = 294;
/** Where the buildings stand on a city's space: just inside its owner's mark; and how big they're drawn. */
const RBLD = 350;
const BLD_K = 1.5;
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

/** How big a token is drawn (board units per unit of its drawing): on a phone or a laptop (a little
 * bigger than on the flat board: the lean draws the ring a little smaller, its far side most), and on
 * the big screen, whose board is twice as wide. The drawing is 120 across and stands on (60, 70). */
export const TOKEN_SCALE = { phone: 0.88, tv: 0.62 };
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

/**
 * The buildings on a city, standing up like the tokens (upright while the table turns), drawn as little
 * models with a front, a side in shade and a roof: one to four green houses side by side, or a hotel
 * of three floors with lit windows and a sign on its roof carrying the city's own picture (the
 * pyramid, the gondola, the die…). A new one comes up out of the ground (art.css b-rise): the board
 * opens under it, it shoots up out of the hole (cut off at the ground, `rb-above`), overshoots and
 * lands on its foot with a squash, and the ground it broke flies up round it in dust and clods. A
 * hotel's ground floor comes up so, and each floor above drops onto the one under it. A building sold
 * sinks back into the ground (`gone`).
 * (`from`: how many stood there before the latest one was built, so the ones from there on are new
 * and rise, one after another; n itself when nothing is new. Each animated part is a group of its
 * own inside the one placing it: a CSS animation's transform would replace a transform attribute.)
 */
function Buildings({ at, n, from, rot, stand, gone }: { at: number; n: number; from: number; rot: number; stand: number; gone?: Gone }) {
  const [x, y] = xy(angleOf(at), RBLD);
  // (centred on their spot rather than standing on it: upright, they reach as far out of the ring as in)
  return (
    <Up x={x} y={y} rot={rot} stand={stand}>
      {gone && <Sold key={gone.key} at={at} was={gone.was} n={gone.n} />}
      {n > 0 && <Built at={at} n={n} from={from} />}
    </Up>
  );
}

/** What was sold off a city a moment ago (it sinks), and what stood there before. */
export interface Gone {
  was: number;
  n: number;
  key: number;
}

const houseGap = (n: number) => Math.min(12.4, 40 / n);
const houseX = (i: number, n: number) => ((i - (n - 1) / 2) * houseGap(n)).toFixed(1);

function House() {
  return (
    <>
      <path class="b-side" d="M5 0V-9l3.5-2.6V-2.6z" />
      <rect class="b-front" x="-5" y="-9" width="10" height="9" />
      <path class="b-roof-side" d="M0-15l3.5-2.6 8.6 6.4-3.5 2.6z" />
      <path class="b-roof" d="M-6.6-8.6L0-15l6.6 6.4z" />
      <rect class="b-door" x="-1.6" y="-5" width="3.2" height="5" rx="0.6" />
    </>
  );
}

function Floor() {
  return (
    <>
      <path class="b-side" d="M7.5 0V-8.5l4-3V-3z" />
      <rect class="b-front" x="-7.5" y="-8.5" width="15" height="8.5" />
      <rect class="b-win" x="-5" y="-6.6" width="3.4" height="4.2" rx="0.5" />
      <rect class="b-win" x="1.6" y="-6.6" width="3.4" height="4.2" rx="0.5" />
    </>
  );
}

function Roof({ city }: { city?: string }) {
  return (
    <>
      <path class="b-top" d="M-7.5 0H7.5l4-3h-15z" />
      <g class="b-sign">
        <rect x="-8" y="-15" width="16" height="13.4" rx="2.6" />
        {city && <CityGlyph id={city} x={-5.6} y={-14.2} size={11.2} color="var(--print-ink)" width={1.5} />}
      </g>
    </>
  );
}

/** A new part's place in the rise: up out of the ground (the ground floor, a house), or down onto
 * the floor under it (a hotel's upper floors and roof). */
const rising = (i: number, drop = false) => ({ "--i": i, ...(drop ? { "--from": "-34px", "--over": "-1px", "--o0": 0 } : {}) });

function Built({ at, n, from, tag = true }: { at: number; n: number; from: number; /** marked with its city (the board's) */ tag?: boolean }) {
  const city = CITY_AT[at]?.id;
  if (n >= 5) {
    const fresh = from < 5;
    return (
      <g class="bldg hotel" data-at={tag ? at : undefined} transform={`scale(${BLD_K}) translate(0 20)`}>
        <ellipse class="b-ground" rx="13.5" ry="3.4" cy="0.6" />
        <g clip-path={fresh ? "url(#rb-above)" : undefined}>
          {[0, 1, 2].map((f) => (
            <g key={f} transform={`translate(0 ${-f * 8.5})`}>
              <g class={fresh ? "b-new" : undefined} style={fresh ? rising(f, f > 0) : undefined}>
                <Floor />
              </g>
            </g>
          ))}
          <g transform="translate(0 -25.5)">
            <g class={fresh ? "b-new" : undefined} style={fresh ? rising(3, true) : undefined}>
              <Roof city={city} />
            </g>
          </g>
        </g>
        {fresh && <Dust key={from} xs={[0]} w={18} />}
      </g>
    );
  }
  // (four in a row stand close, as town houses do, to stay on their space)
  const fresh = Array.from({ length: n - Math.min(from, n) }, (_, k) => Number(houseX(from + k, n)));
  return (
    <g class="bldg" data-at={tag ? at : undefined} transform={`scale(${BLD_K}) translate(0 8)`}>
      <ellipse class="b-ground" rx={((n * houseGap(n)) / 2 + 4).toFixed(1)} ry="3" cy="0.6" />
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${houseX(i, n)} 0)`} clip-path={i >= from ? "url(#rb-above)" : undefined}>
          <g class={i >= from ? "b-new" : undefined} style={i >= from ? rising(i - from) : undefined}>
            <House />
          </g>
        </g>
      ))}
      {/* (a burst for each building, so a new key each time) */}
      {fresh.length > 0 && <Dust key={from} xs={fresh} w={12} />}
    </g>
  );
}

/**
 * A city's buildings on a patch of its own ground, for a list (ui/Assets.tsx: where a phone builds, the
 * board under the sheet): the same little models as the board's, drawn bigger, coming up out of the
 * ground as they're built (`from`) and sinking back as they're sold (`gone`), as on the board.
 */
export function Lot({ at, n, from, gone, color }: { at: number; n: number; from: number; gone?: Gone; color?: string }) {
  // (each drawing's foot on the ground line: a house row's is 12 under its middle, a hotel's 30)
  const foot = (hotel: boolean) => `translate(0 ${hotel ? -30 : -12})`;
  return (
    <svg class="lot" data-at={at} viewBox="-46 -64 92 72" overflow="visible" aria-hidden="true">
      <ellipse class="lot-ground" rx="40" ry="6.5" cy="1.5" style={color ? { fill: color } : undefined} />
      {gone && (
        <g transform={foot(gone.was >= 5)}>
          <Sold key={gone.key} at={at} was={gone.was} n={gone.n} />
        </g>
      )}
      {n > 0 && (
        <g transform={foot(n >= 5)}>
          <Built at={at} n={n} from={from} tag={false} />
          {from < n && !gone && <Moment key={`${from}:${n}`} at={at} n={n} from={from} big={2} />}
        </g>
      )}
    </svg>
  );
}

/** How much bigger a new building comes up than it will stand (`BuildFx`). */
const BIG = 3.2;

/**
 * A building just put up, as the moment of it (drawn over everything else on the board): it comes up
 * out of the ground BIG times its size, where it's going to stand, lands with a jolt that shakes it,
 * in a burst of dust and clods as big; it stands a moment, then settles down to its own size on its
 * spot, over the real one (`Built`, which has come up small under it meanwhile), and fades into it.
 * A hotel's floors land one on another first. Its sound keeps time with it (sound.ts sfx.build).
 */
function BuildFx({ at, n, from, rot, stand }: { at: number; n: number; from: number; rot: number; stand: number }) {
  const [x, y] = xy(angleOf(at), RBLD);
  return (
    <Up x={x} y={y} rot={rot} stand={stand}>
      <Moment at={at} n={n} from={from} big={BIG} />
    </Up>
  );
}

/** The new parts of a city's buildings coming up `big` times their size and settling to it (BuildFx on
 * the board; a city's Lot in a list, smaller). */
function Moment({ at, n, from, big }: { at: number; n: number; from: number; big: number }) {
  const hotel = n >= 5;
  const parts = hotel ? [0] : Array.from({ length: n - from }, (_, k) => from + k);
  return (
    <g class={`bldg bfx${hotel ? " hotel" : ""}`} transform={`scale(${BLD_K}) translate(0 ${hotel ? 20 : 8})`} style={{ "--big": big }} aria-hidden="true">
      <g class="bfx-shake">
        {parts.map((i, k) => (
          <g key={i} transform={`translate(${hotel ? 0 : houseX(i, n)} 0)`}>
            <g transform={`scale(${big})`}>
              <Pit xs={[0]} w={hotel ? 16 : 11} i0={k} />
            </g>
            <g class="bfx-zoom" style={{ "--i": k }}>
              <g clip-path="url(#rb-above)">
                {hotel ? (
                  <>
                    {[0, 1, 2].map((f) => (
                      <g key={f} transform={`translate(0 ${-f * 8.5})`}>
                        <g class="b-up" style={rising(f, f > 0)}>
                          <Floor />
                        </g>
                      </g>
                    ))}
                    <g transform="translate(0 -25.5)">
                      <g class="b-up" style={rising(3, true)}>
                        <Roof city={CITY_AT[at]?.id} />
                      </g>
                    </g>
                  </>
                ) : (
                  <g class="b-up" style={rising(k)}>
                    <House />
                  </g>
                )}
              </g>
            </g>
            <g transform={`scale(${big})`}>
              <Dust xs={[0]} w={hotel ? 18 : 12} i0={k} />
            </g>
          </g>
        ))}
      </g>
    </g>
  );
}

/** What was just sold sinking back into the ground, where it stood (a hotel's whole, or the houses at
 * the end of the row). Not a `.bldg[data-at]`: what stands on the city is only what's left. */
function Sold({ at, was, n }: { at: number; was: number; n: number }) {
  if (was >= 5)
    return (
      <g class="bldg gone" transform={`scale(${BLD_K}) translate(0 20)`} aria-hidden="true">
        <g clip-path="url(#rb-above)">
          <g class="b-sink tall">
            {[0, 1, 2].map((f) => (
              <g key={f} transform={`translate(0 ${-f * 8.5})`}>
                <Floor />
              </g>
            ))}
            <g transform="translate(0 -25.5)">
              <Roof city={CITY_AT[at]?.id} />
            </g>
          </g>
        </g>
        <Dust xs={[0]} w={18} sink />
      </g>
    );
  const xs = Array.from({ length: was - n }, (_, k) => Number(houseX(n + k, was)));
  return (
    <g class="bldg gone" transform={`scale(${BLD_K}) translate(0 8)`} aria-hidden="true">
      {xs.map((x, k) => (
        <g key={k} transform={`translate(${x} 0)`} clip-path="url(#rb-above)">
          <g class="b-sink">
            <House />
          </g>
        </g>
      ))}
      <Dust xs={xs} w={12} sink />
    </g>
  );
}

/** The ground opening under a new building's foot (`xs`: where each one comes up), before it's out. */
function Pit({ xs, w, i0 = 0 }: { xs: number[]; w: number; i0?: number }) {
  return (
    <g class="b-pit" aria-hidden="true">
      {xs.map((x, k) => (
        <ellipse key={k} cx={x} cy="0.4" rx={w / 2} ry={w / 5} style={{ "--i": i0 + k }} />
      ))}
    </g>
  );
}

/** Six clods of the ground each building broke, flying up and falling back (where they land: dx, and
 * how high they go: up, board units), its dust blowing out either side, and a ring where it landed. */
const CLODS: [number, number][] = [
  [-13, 15],
  [-8, 21],
  [-3, 12],
  [4, 19],
  [9, 13],
  [14, 17],
];

/** The burst at a new building's foot (or a sold one's, smaller: `sink`). */
function Dust({ xs, w, sink, i0 = 0 }: { xs: number[]; w: number; sink?: boolean; i0?: number }) {
  return (
    <g class={`b-dust${sink ? " sink" : ""}`} aria-hidden="true">
      {xs.map((x, k) => (
        <g key={k} transform={`translate(${x} 0)`} style={{ "--i": i0 + k }}>
          <ellipse class="ring" rx={w * 0.55} ry={w * 0.2} cy="0.4" />
          <ellipse class="l" cx={(-w / 2).toFixed(1)} cy="-1" rx="5" ry="2.6" />
          <ellipse class="l far" cx={(-w / 2 - 2).toFixed(1)} cy="-3" rx="3.6" ry="2" />
          <ellipse class="r" cx={(w / 2).toFixed(1)} cy="-1" rx="5" ry="2.6" />
          <ellipse class="r far" cx={(w / 2 + 2).toFixed(1)} cy="-3" rx="3.6" ry="2" />
          {!sink &&
            CLODS.map(([dx, up], c) => (
              <g key={c} class="clod-x" style={{ "--dx": `${dx}px`, "--c": c }}>
                <g class="clod-y" style={{ "--up": `${-up}px`, "--c": c }}>
                  <rect class="clod" x="-1.3" y="-1.3" width="2.6" height="2.6" rx="0.6" />
                </g>
              </g>
            ))}
        </g>
      ))}
    </g>
  );
}

/** Eight sparks flying out of a city's owner mark when it's bought, in the team's colour and gold. */
function Burst({ color }: { color: string }) {
  return (
    <g class="burst" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} style={{ transform: `rotate(${i * 45 + 22.5}deg)` }}>
          <rect class="spark" x="-2" y="-4" width="4" height="8" rx="1.2" style={{ "--c": i % 2 ? color : "var(--coin)" }} />
        </g>
      ))}
    </g>
  );
}

/** Where the travel boom's fireworks go off over the map, and when (s). */
const BOOMS: [number, number, number][] = [
  [-150, -110, 0],
  [150, -70, 0.35],
  [-30, 150, 0.7],
  [170, 160, 1.05],
  [-190, 120, 1.35],
];

/**
 * What a world event does on the board as it comes (engine/world.ts), for about three seconds: the
 * crisis's chart falls across a darkened map; the boom's fireworks; the AI's circuits spread from the
 * middle; the supersonic airliner crosses with its contrail and a sonic boom; a meteor streaks in from
 * outside the ring and hits its city; a city locked down sends out slow blue rings. Numbers stay upright.
 */
function WorldMoment({ kind, at, rot }: { kind: WorldId; at?: number; rot: number }) {
  if (kind === "crash")
    return (
      <g class="wf wf-crash" aria-hidden="true">
        <circle class="wf-veil" r={RMAP} />
        <polyline class="wf-line" pathLength="1" points="-262,-126 -204,-86 -152,-132 -96,-40 -44,-70 16,26 70,-4 128,104 182,78 236,170" />
        <path class="wf-line wf-head" pathLength="1" d="M206 172l32 4-6-32" />
        <Up x={0} y={0} rot={rot}>
          <text class="wf-big" y="34">−15%</text>
        </Up>
      </g>
    );
  if (kind === "boom")
    return (
      <g class="wf wf-boom" aria-hidden="true">
        {BOOMS.map(([x, y, d], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <g class="wf-burst" style={{ "--d": `${d}s` }}>
              {Array.from({ length: 12 }, (_, k) => (
                <line key={k} x1="0" y1="-22" x2="0" y2="-88" transform={`rotate(${k * 30})`} />
              ))}
            </g>
          </g>
        ))}
        <Up x={0} y={0} rot={rot}>
          <text class="wf-big" y="34">×1.5</text>
        </Up>
      </g>
    );
  if (kind === "ai")
    return (
      <g class="wf wf-ai" aria-hidden="true">
        {Array.from({ length: 8 }, (_, k) => (
          <g key={k} transform={`rotate(${k * 45 + 12})`}>
            <path class="wf-trace" pathLength="1" d="M0-44V-112H46V-190H20V-262" style={{ "--d": `${(k % 4) * 0.12}s` }} />
            <circle class="wf-node" cx="20" cy="-262" r="8" style={{ "--d": `${0.95 + (k % 4) * 0.12}s` }} />
          </g>
        ))}
        <circle class="wf-core" r="44" />
        <Up x={0} y={0} rot={rot}>
          <text class="wf-big" y="34">+$50</text>
        </Up>
      </g>
    );
  if (kind === "invention")
    return (
      <g class="wf wf-jet" aria-hidden="true" transform="rotate(-19)">
        <line class="wf-contrail" pathLength="1" x1="-470" y1="0" x2="470" y2="0" />
        <circle class="wf-sonic" r="60" />
        <g class="wf-plane">
          <path d="M34 0L-6-6-22-30h-10l6 26-18 2-8-10h-8l4 18-4 18h8l8-10 18 2-6 26h10l16-24z" />
        </g>
      </g>
    );
  if (at === undefined) return null;
  const deg = angleOf(at);
  const [tx, ty] = xy(deg, RM - 6);
  if (kind === "terror")
    return (
      <g class="wf wf-terror" aria-hidden="true" transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)})`}>
        {[0, 0.55, 1.1].map((d) => (
          <circle key={d} class="wf-ring" r="38" style={{ "--d": `${d}s` }} />
        ))}
      </g>
    );
  // The meteor: in over the ring's rim, a few spaces back, down onto the city (in sight all the way).
  const [sx, sy] = xy(deg - 34, 486);
  const len = Math.hypot(sx - tx, sy - ty);
  const ang = (Math.atan2(sy - ty, sx - tx) * 180) / Math.PI;
  return (
    <g class="wf wf-meteor" aria-hidden="true" transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)})`}>
      <g transform={`rotate(${ang.toFixed(1)})`}>
        <g class="wf-fly" style={{ "--l": `${len.toFixed(0)}px` }}>
          <line class="wf-tail" x1="14" y1="0" x2="260" y2="0" />
          <line class="wf-tail wf-tail-in" x1="14" y1="0" x2="150" y2="0" />
          <circle class="wf-rock" r="22" />
        </g>
      </g>
      <circle class="wf-flash" r="96" />
      <circle class="wf-shock" r="52" />
      {Array.from({ length: 7 }, (_, k) => (
        <g key={k} transform={`rotate(${k * 51 + 20})`}>
          <circle class="wf-debris" cy="-12" r="5" />
        </g>
      ))}
    </g>
  );
}

/** A ring between two radii round the middle (filled even-odd). */
const ring = (ro: number, ri: number) =>
  `M${-ro} 0a${ro} ${ro} 0 1 0 ${2 * ro} 0a${ro} ${ro} 0 1 0 ${-2 * ro} 0ZM${-ri} 0a${ri} ${ri} 0 1 0 ${2 * ri} 0a${ri} ${ri} 0 1 0 ${-2 * ri} 0Z`;

/** How far the board's edge shows under its face (board units): flat, and leaning back. */
const EDGE = { flat: 7, lean: 15 };
/** The ring's outer band, where the colours are: the lacquer's gloss lies on it. */
const GLOSS_D = `M${-RO} 0a${RO} ${RO} 0 1 0 ${2 * RO} 0a${RO} ${RO} 0 1 0 ${-2 * RO} 0ZM${-RB + 6} 0a${RB - 6} ${RB - 6} 0 1 1 ${2 * (RB - 6)} 0a${RB - 6} ${RB - 6} 0 1 1 ${-2 * (RB - 6)} 0Z`;

/** The board's light and shade: its shadow on the table, its edge, the lamp and the gloss. */
function BoardDefs() {
  return (
    <defs aria-hidden="true">
      <radialGradient id="rb-shadow" gradientUnits="userSpaceOnUse" cx="0" cy="0" r={RO + 24}>
        <stop offset="0.82" style={{ stopColor: "var(--night-shade)", stopOpacity: 0.7 }} />
        <stop offset="0.93" style={{ stopColor: "var(--night-shade)", stopOpacity: 0.32 }} />
        <stop offset="1" style={{ stopColor: "var(--night-shade)", stopOpacity: 0 }} />
      </radialGradient>
      <linearGradient id="rb-edge" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0.45" style={{ stopColor: "var(--board-edge-hi)", stopOpacity: 1 }} />
        <stop offset="1" style={{ stopColor: "var(--board-edge)", stopOpacity: 1 }} />
      </linearGradient>
      <radialGradient id="rb-lamp" cx="0.3" cy="0.22" r="0.85">
        <stop offset="0" style={{ stopColor: "var(--lamp)", stopOpacity: 0.16 }} />
        <stop offset="0.45" style={{ stopColor: "var(--lamp)", stopOpacity: 0.05 }} />
        <stop offset="1" style={{ stopColor: "var(--lamp)", stopOpacity: 0 }} />
      </radialGradient>
      <radialGradient id="rb-gloss" gradientUnits="userSpaceOnUse" cx="0" cy="0" r={RO}>
        <stop offset={((RB - 6) / RO).toFixed(3)} style={{ stopColor: "var(--board-ink)", stopOpacity: 0 }} />
        <stop offset={((RB + 8) / RO).toFixed(3)} style={{ stopColor: "var(--board-ink)", stopOpacity: 0.13 }} />
        <stop offset={((RO - 7) / RO).toFixed(3)} style={{ stopColor: "var(--board-ink)", stopOpacity: 0.04 }} />
        <stop offset="1" style={{ stopColor: "var(--night-shade)", stopOpacity: 0.22 }} />
      </radialGradient>
      {/* (a building coming up out of the ground, or going back into it: only what's above its foot shows,
          in the drawing's own units, its foot at 0) */}
      <clipPath id="rb-above">
        <rect x="-30" y="-70" width="60" height="70.8" />
      </clipPath>
    </defs>
  );
}

/** A token walking round: how high it hops (board units) and how long it stays squashed as it lands (ms). */
const HOP = { h: 22, land: 160 };

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A token steps onto space `at` of the board `svg`: the space lights up under it for a moment; where
 * the move ends (`last`) it lights gold, sinks and comes back up, and a ring spreads out from under the
 * token. By a ride's walk (ui/Ride.tsx), every space, and a hop's landing here; never with reduced
 * motion. The light and the ring are drawn for the moment in the board's `.presses` layer and taken
 * away after.
 */
export function pressSpace(svg: SVGSVGElement | null | undefined, at: number, last = false) {
  const sp = svg?.querySelector<SVGGElement>(`.sp[data-at="${at}"]`);
  const layer = svg?.querySelector<SVGGElement>(".presses");
  if (!sp || !layer || typeof sp.animate !== "function" || !BOARD[at]) return;
  // (the space itself sinks only where the move ends: moving it draws its city, its marks and its
  // buildings again every frame, the light alone is cheap)
  if (last)
    sp.animate([{ transform: "none" }, { transform: "scale(0.9)", offset: 0.3 }, { transform: "none" }], {
      duration: 460,
      easing: "cubic-bezier(0.25, 0.8, 0.35, 1)",
    });
  const lit = document.createElementNS(SVG_NS, "path");
  lit.setAttribute("d", wedge(at, CORNER[BOARD[at].k] ? RO + 6 : RO));
  lit.setAttribute("class", last ? "step-lit last" : "step-lit");
  layer.appendChild(lit);
  lit.animate([{ opacity: 0 }, { opacity: last ? 0.62 : 0.42, offset: 0.2 }, { opacity: 0 }], { duration: last ? 700 : 420, easing: "ease-out" }).onfinish = () => lit.remove();
  if (!last) return;
  const [x, y] = xy(angleOf(at), RT);
  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", x.toFixed(1));
  ring.setAttribute("cy", y.toFixed(1));
  ring.setAttribute("r", "26");
  ring.setAttribute("class", "step-ring");
  layer.appendChild(ring);
  ring.animate([{ transform: "scale(0.6)", opacity: 0.75 }, { transform: "scale(3.4)", opacity: 0 }], { duration: 720, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" }).onfinish = () =>
    ring.remove();
}

/** A team that has just made a full set: its spaces light up one after another in its colour. */
export interface LitSet {
  key: string;
  color: string;
  /** Its spaces, in the order they light up. */
  spaces: number[];
}

/** The table turns 60 degrees a second at most (easing in and out); past this a fade is kinder. */
const TURN_MAX = 60;
const TURN_ACCEL = 300;
const FADE_PAST = 60;
const FADE_MS = 500;

/** How much taller what stands on a board leaning back `lean` degrees is drawn, so it shows its own
 * height: the lean shortens everything on the board by its cosine. */
export const standOf = (lean: number) => (lean > 0.05 ? 1 / Math.cos((lean * Math.PI) / 180) : 1);
const standTf = (k: number) => (k > 1.0005 ? ` scale(1 ${k.toFixed(4)})` : "");

/** Something that stays upright while the table turns; `stand` (its height, `standOf`): something that
 * stands up off the board (a token, a building, a sign) rather than printed on it. */
function Up({ x, y, rot, children, extra, stand }: { x: number; y: number; rot: number; children: ComponentChildren; extra?: Record<string, string | number>; stand?: number }) {
  return (
    <g
      data-up=""
      data-x={x.toFixed(1)}
      data-y={y.toFixed(1)}
      data-stand={stand ? "" : undefined}
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${-rot})${stand ? standTf(stand) : ""}`}
      {...extra}
    >
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
  fx,
  worldFx,
  worldMark,
  lean = 0,
  lang = "en",
  lit,
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
  /** Stamps for a moment on a space (`BoardFx`). */
  fx?: BoardFx[];
  /** A world event as it comes (`WorldFx`; not with reduced motion), and the city one in force has struck (`WorldMark`). */
  worldFx?: WorldFx | null;
  worldMark?: WorldMark | null;
  /** How far the board leans back at rest (degrees; ui/Board.tsx boardLean): what stands on it is drawn
   * taller by as much as the lean shortens it (`standOf`), so it stands up off the board. */
  lean?: number;
  /** The players' language: a city's space carries its Chinese name, or its airport code. */
  lang?: "zh" | "en";
  /** Full sets just made (`LitSet`; not with reduced motion). */
  lit?: LitSet[];
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
  const standRef = useRef(1);
  standRef.current = standOf(lean);
  const upright = (r: number, near?: { at: number; span: number }) => {
    const back = `rotate(${(-r).toFixed(2)})`;
    const up = standTf(standRef.current);
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
      u.el.setAttribute("transform", `${u.at}${back}${lift ? ` translate(0 ${lift})` : ""}${u.el.dataset.stand !== undefined ? up : ""}`);
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
      lean,
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
    const moves: { seat: number; from: number; delta: number; el: SVGGElement; fan: number; ring: number; start: number; per: number; pressed: number }[] = [];
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
      moves.push({ seat: tk.seat, from, delta, el, fan: Number(el.dataset.fan ?? 0), ring: Number(el.dataset.ring ?? RT), start, per, pressed: 0 });
    }
    if (!moves.length) return;
    // A hop to each space: up and stretched a little in the air, its shadow staying on the board and
    // shrinking under it, and squashed onto its feet as it lands (on each space, and after the last).
    const parts = moves.map((m) => ({ token: m.el.querySelector<SVGGElement>(".token"), shadow: m.el.querySelector<SVGEllipseElement>(".token > ellipse") }));
    let raf = 0;
    const step = (now: number) => {
      let going = false;
      const k = standRef.current;
      const up = standTf(k);
      moves.forEach((m, i) => {
        const dur = Math.max(1, m.per * Math.abs(m.delta));
        const e = now - m.start;
        const p = Math.max(0, Math.min(1, e / dur));
        if (e < dur + HOP.land) going = true;
        const at = m.from + m.delta * p;
        const done = Math.abs(m.delta) * p;
        const u = done - Math.floor(done);
        const air = p > 0 && p < 1 ? Math.sin(Math.PI * u) : 0;
        const hop = air * HOP.h;
        // (since it last landed: on a space on the way, a quick push off it; on the last one, settling)
        const since = p >= 1 ? e - dur : done >= 1 ? u * m.per : Infinity;
        const land = p >= 1 ? HOP.land : Math.min(HOP.land, 0.15 * m.per);
        const squash = since < land ? (1 - since / land) * (p >= 1 ? 1 : 0.6) : 0;
        const [x, y] = xy(angleOf(at) + m.fan, m.ring);
        m.el.dataset.x = x.toFixed(1);
        m.el.dataset.y = y.toFixed(1);
        m.el.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(-rot.current).toFixed(2)}) translate(0 ${(-hop).toFixed(1)})${up}`);
        const { token, shadow } = parts[i];
        const feet = Number(shadow?.getAttribute("cy") ?? 0);
        if (token) {
          const sx = 1 + 0.12 * squash - 0.05 * air;
          const sy = 1 - 0.14 * squash + 0.07 * air;
          if (Math.abs(sx - 1) + Math.abs(sy - 1) < 0.002) token.removeAttribute("transform");
          else token.setAttribute("transform", `translate(0 ${feet.toFixed(1)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)}) translate(0 ${(-feet).toFixed(1)})`);
        }
        if (shadow) {
          if (hop < 0.05) shadow.removeAttribute("transform");
          else shadow.setAttribute("transform", `translate(0 ${(hop / k + feet).toFixed(1)}) scale(${(1 - 0.35 * air).toFixed(3)}) translate(0 ${(-feet).toFixed(1)})`);
        }
        // (its own hop on the spot waits while it walks)
        if (e < dur + HOP.land) m.el.dataset.walking = "";
        else delete m.el.dataset.walking;
        // The space it lands on gives under it (not if it landed a while ago, this screen joining late).
        // Only the last: another team's hops come often on a phone, and each press draws the board
        // again; a move's own walk presses every space (ui/Ride.tsx).
        const steps = Math.abs(m.delta);
        if (p >= 1 && !m.pressed) {
          m.pressed = steps;
          if (now - (m.start + steps * m.per) < 300) pressSpace(svgRef.current, (((m.from + m.delta) % BOARD.length) + BOARD.length) % BOARD.length, true);
        }
      });
      if (going) raf = requestAnimationFrame(step);
    };
    // (straight away, before the board is painted: a token waiting for the thrower's beat stays put)
    step(performance.now());
    return () => {
      cancelAnimationFrame(raf);
      // (cut short: nothing left squashed or in the air)
      moves.forEach((m, i) => {
        delete m.el.dataset.walking;
        parts[i].token?.removeAttribute("transform");
        parts[i].shadow?.removeAttribute("transform");
      });
    };
  }, [posKey, reduced]);

  // Life on the board between moves: now and then one token looks round or bobs, and a hotel's sign
  // (or a city's owner mark) catches the light. One at a time, for a second, so a phone draws only
  // that small part of the board again; never during a move, with the page hidden, or reduced motion.
  useEffect(() => {
    if (reduced) return;
    let beat = 0;
    const pick = <T,>(xs: T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];
    const id = setInterval(() => {
      const g = ref.current;
      if (!g || ridingRef.current || document.hidden) return;
      beat += 1;
      if (beat % 2) {
        const hop = pick(Array.from(g.querySelectorAll<SVGGElement>(".token:not(.now):not(.ridden) > .hop")));
        if (!hop || hop.dataset.idle) return;
        hop.dataset.idle = Math.random() < 0.5 ? "bob" : "look";
        setTimeout(() => delete hop.dataset.idle, 1_400);
      } else {
        const hotels = Array.from(g.querySelectorAll<SVGGElement>(".bldg.hotel"));
        const lit = pick(hotels.length ? hotels : Array.from(g.querySelectorAll<SVGGElement>(".owned")));
        if (!lit || lit.dataset.glint !== undefined) return;
        lit.dataset.glint = "";
        setTimeout(() => delete lit.dataset.glint, 1_500);
      }
    }, 2_400);
    return () => clearInterval(id);
  }, [reduced]);

  // Owner marks and buildings already there when the board first draws stay still; new ones come in.
  // For each city, how many buildings stand on it and how many stood before the latest was built
  // (`Buildings`' `from`): selling one makes nothing new (it sinks: `gone`), building again does; a
  // hotel sold back to houses puts them all up anew. A city mortgaged since then turns its owner's
  // chip face down (`flipped`).
  const born = useRef<{
    owned: Set<number>;
    built: Map<number, { n: number; from: number }>;
    gone: Map<number, Gone>;
    stillMort: Set<number>;
    k: number;
  } | null>(null);
  born.current ??= {
    owned: new Set(marks.flatMap((m, at) => (m?.owner ? [at] : []))),
    built: new Map(marks.flatMap((m, at) => (m?.houses ? [[at, { n: m.houses, from: m.houses }] as const] : []))),
    gone: new Map(),
    stillMort: new Set(marks.flatMap((m, at) => (m?.mortgaged ? [at] : []))),
    k: 0,
  };
  const { owned, built, gone, stillMort } = born.current;
  marks.forEach((m, at) => {
    if (!m?.owner) owned.delete(at);
    if (!m?.mortgaged) stillMort.delete(at);
    const n = m?.houses ?? 0;
    const was = built.get(at) ?? { n: 0, from: 0 };
    if (n === was.n) return;
    built.set(at, { n, from: n > was.n ? was.n : was.n >= 5 && n > 0 ? 0 : n });
    if (n < was.n) gone.set(at, { was: was.n, n, key: ++born.current!.k });
    else gone.delete(at);
  });

  const r = rot.current;
  const stand = standOf(lean);
  const bySpace = new Map<number, TokenMark[]>();
  for (const t of tokens) bySpace.set(t.at, [...(bySpace.get(t.at) ?? []), t]);

  return (
    <>
    {/* (the satellite map, under the board: it shows through the middle once it's painted) */}
    {sat && <canvas ref={satRef} class={`satmap${satOn ? " on" : ""}`} width={1} height={1} style={{ transform: `rotate(${r.toFixed(2)}deg)` }} aria-hidden="true" />}
    <svg
      ref={svgRef}
      class={`${cls ?? "roundboard"}${riding !== undefined && riding !== null ? " riding" : ""}${satOn ? " sat-on" : ""}`}
      viewBox="-500 -500 1000 1000"
      overflow="visible"
      role="img"
      aria-label="board"
    >
      <BoardDefs />
      <g ref={cam}>
      {/* The board is a thing on a table: its shadow on the table, and its edge under its face (seen
          as it leans back, a little more when it does). */}
      <path class="board-shadow" d={ring(RO + 24, RO - 40)} transform={`translate(0 ${lean ? 26 : 14})`} fill="url(#rb-shadow)" fill-rule="evenodd" aria-hidden="true" />
      <path class="board-edge" d={ring(RO + 8, RMAP - 2)} transform={`translate(0 ${lean ? EDGE.lean : EDGE.flat})`} fill="url(#rb-edge)" fill-rule="evenodd" aria-hidden="true" />
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
            <g key={at} data-at={at} class={`sp k-${sp.k}${at === active ? " active" : ""}${mark?.mortgaged ? " mort" : ""}`} onClick={onPick ? () => onPick(at) : undefined}>
              <path d={wedge(at, corner ? RO + 6 : RO)} class={corner ? "wedge corner-w" : "wedge"} style={group ? { fill: TINT[group.id] } : undefined} />
              {group && <path d={band(at)} fill={group.color} />}
              {group && (
                <Up x={bx} y={by} rot={r}>
                  <path d={shapePath(group.shape, 10)} fill="var(--board-paper)" stroke="rgba(0,0,0,.35)" stroke-width="1.5" />
                </Up>
              )}
              {city ? (
                <Up x={lx} y={ly} rot={r}>
                  {lang === "zh" ? (
                    <path class="code zh" d={ZH_PATH[city.id]} aria-hidden="true" />
                  ) : (
                    <path class="code" d={CODE_PATH[city.id]} aria-hidden="true" />
                  )}
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
              {mark?.houses || gone.has(at) ? (
                <Buildings
                  at={at}
                  n={mark?.houses ?? 0}
                  from={reduced ? (mark?.houses ?? 0) : (built.get(at)?.from ?? 0)}
                  rot={r}
                  stand={stand}
                  gone={reduced ? undefined : gone.get(at)}
                />
              ) : null}
              {worldMark?.at === at && (
                <>
                  {worldMark.id === "meteor" && (
                    <Up x={xy(deg, RBLD)[0]} y={xy(deg, RBLD)[1]} rot={r}>
                      <g class="crater" aria-hidden="true">
                        <ellipse rx="22" ry="10" />
                        <ellipse class="crater-in" rx="13" ry="5.5" cy="1.5" />
                      </g>
                    </Up>
                  )}
                  <Up x={xy(deg, RN)[0]} y={xy(deg, RN)[1]} rot={r} stand={stand}>
                    <g class={`world-tag wt-${worldMark.id}`}>
                      <rect x={-34} y={-14} width="68" height="28" rx="6" />
                      <text y="7">{worldMark.tag}</text>
                    </g>
                  </Up>
                </>
              )}
              {mark?.news && worldMark?.at !== at && (
                <Up x={xy(deg, RN)[0]} y={xy(deg, RN)[1]} rot={r} stand={stand}>
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
                  {/* (a chip on the board: its shadow under it) */}
                  <ellipse class={owned.has(at) ? "om-shadow" : "om-shadow fresh"} rx="18" ry="17" cy="3.5" />
                  {!owned.has(at) && <circle class="stamp-ring" r="17" stroke={mark.owner.color} />}
                  {!owned.has(at) && <Burst color={mark.owner.color} />}
                  <g class={owned.has(at) ? "owned" : "owned stamp-in"}>
                    {/* (mortgaged since the board drew: the chip turns face down, as a deed card does) */}
                    <g class={mark.mortgaged && !stillMort.has(at) ? "om flip" : "om"} style={{ "--team": mark.owner.color }}>
                      <circle r="17" fill={mark.owner.color} stroke="var(--board-paper)" stroke-width="3" />
                      <path class="owner" d={OWNER_PATH[mark.owner.letter]} />
                    </g>
                  </g>
                </Up>
              )}
            </g>
          );
        })}
        {/* (the lacquer on the colour bands round the edge, catching the light) */}
        <path class="board-gloss" d={GLOSS_D} fill="url(#rb-gloss)" aria-hidden="true" />
        {/* (a space a token steps on lights for a moment: pressSpace draws in here) */}
        <g class="presses" aria-hidden="true" />
        {/* (a full set just made: its spaces light up one after another, then together) */}
        {!reduced &&
          lit?.map((l) => (
            <g key={l.key} class="set-lit" style={{ "--c": l.color }} aria-hidden="true">
              {l.spaces.map((at, i) => (
                <path key={at} d={wedge(at)} style={{ "--i": i }} />
              ))}
            </g>
          ))}
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
                  <Up key={tk.seat} x={x} y={y} rot={r} stand={stand} extra={{ "data-seat": tk.seat, "data-fan": slot.fan.toFixed(2), "data-ring": slot.ring.toFixed(1) }}>
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
        {/* (a building just put up comes up out of the ground big, over everything, then settles to its size) */}
        {!reduced &&
          [...built].flatMap(([at, b]) =>
            b.from < b.n && !gone.has(at) ? [<BuildFx key={`${at}:${b.from}:${b.n}`} at={at} n={b.n} from={b.from} rot={r} stand={stand} />] : [],
          )}
        {/* (a city sold at auction, a team gone broke: a stamp on the space for a moment, upright) */}
        {fx?.map((f) => {
          const [x, y] = xy(angleOf(f.at), RM);
          return (
            <Up key={f.id} x={x} y={y} rot={r}>
              <g class={`fx-stamp fx-${f.kind}`} style={{ "--c": f.color }} aria-hidden="true">
                <rect x="-38" y="-17" width="76" height="34" rx="7" />
                <text y="8.5">{f.label}</text>
              </g>
            </Up>
          );
        })}
        {/* (a world event as it comes: over the map, or on its city) */}
        {worldFx && !reduced && <WorldMoment key={worldFx.id} kind={worldFx.kind} at={worldFx.at} rot={r} />}
      </g>
      {/* (the lamp over the table: its light falls from the top left, where the board doesn't turn) */}
      <circle class="board-lamp" r={RO + 8} fill="url(#rb-lamp)" aria-hidden="true" />
      </g>
      {center}
    </svg>
    </>
  );
}

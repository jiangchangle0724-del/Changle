// Plays a first-person move on the board (ridePlan.ts works out what to play). The camera leans in
// behind the token, follows it round the ring space by space, lands with it and pulls back up. The
// token is drawn here, standing upright over the leaning board, and so are the cities it passes (a
// trail up in the sky) and the one it lands on. A soft tick and, where the phone can, a buzz mark
// each step; the landing thuds. The whole ride is one loop on the animation clock: the board's
// camera and the token come from the same moment, so they never drift apart.
import { useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { BOARD, CITY_AT, GROUPS } from "../../engine";
import { CharacterArt, type Mood } from "../art/characters";
import { TOKEN_R, angleOf, xy, type Rig } from "../art/RoundBoard";
import { CODE } from "../art/stamps";
import { BUZZ, buzz, holdShake } from "../controls";
import { getLang, money, spaceName, t, tx } from "../i18n";
import { sfx } from "../sound";
import { serverNow } from "../store";
import { RIDE, type RidePlan } from "./ridePlan";

const N = BOARD.length;

/**
 * The ride's camera: how close it comes (zoom), where the token stands in view (viewBox units: a
 * little off the middle, three quarters down), how far the board leans back (degrees), the lens
 * (perspective, in board widths) and how much bigger the leaning board is drawn than its box, so
 * its near edge reaches the bottom. Going clockwise the token stands on the left of the table, so
 * the way ahead runs up the screen with the spaces along its left; going back, the other way round.
 */
const CAM = { z: 1.9, ax: 40, ay: 250, tilt: 52, lens: 1.6, grow: 1.25 };

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const near = (from: number, to: number) => from + (((((to - from) % 360) + 540) % 360) - 180);
const wrap = (at: number) => ((Math.round(at) % N) + N) % N;

/** The table's angle that brings ring position `pos` (in spaces, fractional) to the camera. */
const anchorRot = (pos: number, side: 1 | -1) => (side === 1 ? 270 : 90) - angleOf(pos);

interface Cam {
  z: number;
  tx: number;
  ty: number;
  rot: number;
  tilt: number;
}

/** The camera on the ride, for the side the token stands on. */
const rideCam = (side: 1 | -1, rot: number): Cam => ({
  z: CAM.z,
  tx: side * (CAM.ax + CAM.z * TOKEN_R),
  ty: CAM.ay,
  rot,
  tilt: CAM.tilt,
});

/**
 * Where a point of the board (board units, before the table turns) shows on screen, in px from the
 * board's top left corner, and how much bigger or smaller it looks there.
 */
function project(bx: number, by: number, c: Cam, size: number) {
  const a = (c.rot * Math.PI) / 180;
  const rx = bx * Math.cos(a) - by * Math.sin(a);
  const ry = bx * Math.sin(a) + by * Math.cos(a);
  const k = size / 1000;
  const px = (c.z * rx + c.tx + 500) * k;
  const py = (c.z * ry + c.ty + 500) * k;
  // The lean: about a line across the board through the camera's point (the transform origin).
  const ox = size / 2;
  const oy = (CAM.ay + 500) * k;
  const th = (c.tilt * Math.PI) / 180;
  const g = lerp(1, CAM.grow, c.tilt / CAM.tilt);
  const dx = (px - ox) * g;
  const dy = (py - oy) * g;
  const z = dy * Math.sin(th);
  const lens = CAM.lens * size;
  const w = lens / (lens - z);
  return { x: ox + dx * w, y: oy + dy * Math.cos(th) * w, s: w * g * c.z * k };
}

type Mark = { at: number; space: number; kind: "pass" | "stop" | "land" | "salary"; amount?: number };

/** What comes up along the way, and when (ms after the ride starts). */
function marksOf(plan: RidePlan): Mark[] {
  const out: Mark[] = [];
  plan.legs.forEach((leg, j) => {
    const { at, step } = plan.t.legs[j];
    for (let i = 1; i <= leg.steps; i++) {
      const space = wrap(leg.from + leg.dir * i);
      const time = at + i * step;
      const last = i === leg.steps;
      if (space === 0 && leg.salary && leg.dir === 1) out.push({ at: time, space, kind: "salary", amount: leg.salary });
      if (last) out.push({ at: time, space, kind: j === plan.legs.length - 1 ? "land" : "stop" });
      else if (CITY_AT[space]) out.push({ at: time, space, kind: "pass" });
    }
  });
  return out;
}

/** A city's three-letter code and name, or a space's name. */
function SpaceLabel({ at }: { at: number }) {
  const city = CITY_AT[at];
  return city ? (
    <>
      <b class="code">{CODE[city.id]}</b> {tx(city.name)}
    </>
  ) : (
    <>{spaceName(at)}</>
  );
}

export function Ride({
  plan,
  rig,
  kind,
  mood,
  urgent,
  onDone,
}: {
  plan: RidePlan;
  rig: { current: Rig | null };
  /** The token's character (its team colour). */
  kind: number;
  /** How the token feels once it has landed (a bill, a new city…). */
  mood: Mood;
  /** Something on a clock came up for this phone: cut the ride short. */
  urgent: boolean;
  onDone: (key: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const urgentRef = useRef(urgent);
  urgentRef.current = urgent;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const marks = useMemo(() => marksOf(plan), [plan.key]);
  const side = plan.legs[0].dir;
  const last = plan.legs[plan.legs.length - 1];
  const land = CITY_AT[last.to];
  const group = land ? GROUPS.find((g) => g.id === land.group) : null;

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // The token and its shadow move by CSS transform alone, so a hop costs no redrawing.
    const token = el.querySelector<HTMLElement>(".ride-token")!;
    const ground = el.querySelector<HTMLElement>(".ride-ground")!;
    const sky = el.parentElement?.querySelector<HTMLElement>(".ride-sky") ?? null;
    const chips = Array.from(el.querySelectorAll<HTMLElement>("[data-at]"));
    const T = plan.t;
    const startPerf = performance.now() + (plan.start - serverNow());
    let rot0: number | null = null;
    // The camera pulls back at `outAt` (sooner if cut short), from wherever it is then.
    let outAt = T.out;
    let outFor = RIDE.out;
    let outFrom: Cam | null = null;
    let cur: Cam = { z: 1, tx: 0, ty: 0, rot: 0, tilt: 0 };
    let stepsDone = 0;
    let landed = false;
    let raf = 0;
    let over = false;
    const fired = new Set<number>();
    holdShake(true);

    const svgStyle = (svg: SVGSVGElement, c: Cam) => {
      if (c.tilt < 0.05) {
        svg.style.transform = "";
        svg.style.removeProperty("mask-image");
        svg.style.removeProperty("-webkit-mask-image");
        return;
      }
      const size = svg.clientWidth || 1;
      const p = c.tilt / CAM.tilt;
      svg.style.transformOrigin = `50% ${(CAM.ay + 500) / 10}%`;
      svg.style.transform = `perspective(${Math.round(CAM.lens * size)}px) rotateX(${c.tilt.toFixed(2)}deg) scale(${lerp(1, CAM.grow, p).toFixed(4)})`;
      // The far side of the leaning board fades into the sky instead of ending at an edge.
      const mask = `linear-gradient(to bottom, transparent ${(4 * p).toFixed(1)}%, #000 ${(34 * p).toFixed(1)}%)`;
      svg.style.setProperty("mask-image", mask);
      svg.style.setProperty("-webkit-mask-image", mask);
    };

    const finish = (r: Rig | null) => {
      if (over) return;
      over = true;
      if (r) {
        r.camera(1, 0, 0);
        r.turn(r.focusRotation());
        svgStyle(r.svg, { z: 1, tx: 0, ty: 0, rot: 0, tilt: 0 });
      }
      holdShake(false);
      doneRef.current(plan.key);
    };

    const frame = (now: number) => {
      const r = rig.current;
      if (!r) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const t = now - startPerf;
      if (rot0 === null) rot0 = r.rotation();
      if (urgentRef.current && t < outAt) {
        outAt = Math.max(0, t);
        outFor = 320;
      }
      // Where the token is on the ring, and how high it is off the board (0 to 1).
      let pos = plan.legs[0].from;
      let hop = 0;
      let squash = 0;
      if (t >= T.in) {
        pos = plan.legs[0].from;
        for (let j = 0; j < plan.legs.length; j++) {
          const leg = plan.legs[j];
          const { at, step } = T.legs[j];
          if (t < at) break;
          const k = (t - at) / step;
          if (k >= leg.steps) {
            pos = leg.to;
            continue;
          }
          const i = Math.floor(k);
          const f = k - i;
          pos = leg.from + leg.dir * (i + ease(f));
          hop = Math.sin(Math.PI * f);
          break;
        }
        // Each space reached: a tick (and a buzz where the phone can).
        const reached = Math.min(totalSteps(plan), stepsAt(plan, t));
        while (stepsDone < reached) {
          stepsDone++;
          if (stepsDone < totalSteps(plan)) {
            sfx.step();
            buzz(BUZZ.step);
          }
        }
        if (t >= T.land && !landed) {
          landed = true;
          el.classList.add("landed");
          sfx.land();
          buzz(BUZZ.land);
        }
        if (landed) squash = Math.max(0, 1 - (t - T.land) / 260);
        // A card drawn where it lands: its flip once the token is down (Immigration has its own).
        if (plan.card && !plan.jail && t >= T.land + 320 && !fired.has(-3)) {
          fired.add(-3);
          sfx.card();
          buzz(BUZZ.card);
        }
      }
      // The camera.
      if (t < 0) cur = { z: 1, tx: 0, ty: 0, rot: rot0, tilt: 0 };
      else if (t < T.in && t < outAt) {
        const p = ease(t / T.in);
        const to = rideCam(side, near(rot0, anchorRot(plan.legs[0].from, side)));
        cur = { z: lerp(1, to.z, p), tx: lerp(0, to.tx, p), ty: lerp(0, to.ty, p), rot: lerp(rot0, to.rot, p), tilt: lerp(0, to.tilt, p) };
        if (!fired.has(-1)) {
          fired.add(-1);
          sfx.whoosh(1);
        }
      } else if (t < outAt) {
        cur = rideCam(side, near(cur.rot, anchorRot(pos, side)));
        // The landing knocks the camera a little.
        if (landed && t - T.land < 260) cur.ty += 7 * Math.sin((t - T.land) / 26) * (1 - (t - T.land) / 260);
      }
      else {
        outFrom ??= { ...cur };
        if (!fired.has(-2)) {
          fired.add(-2);
          el.classList.add("leaving");
          if (t < T.end) sfx.whoosh(-1);
        }
        const p = ease(Math.min(1, (t - outAt) / outFor));
        const rest = near(outFrom.rot, r.focusRotation());
        cur = { z: lerp(outFrom.z, 1, p), tx: lerp(outFrom.tx, 0, p), ty: lerp(outFrom.ty, 0, p), rot: lerp(outFrom.rot, rest, p), tilt: lerp(outFrom.tilt, 0, p) };
      }
      r.camera(cur.z, cur.tx, cur.ty);
      // (while the camera is down by the token it sees a quarter of the ring: only that needs
      // turning upright each frame)
      const close = t >= T.in && t < outAt;
      r.turn(cur.rot, close ? { at: side === 1 ? 270 : 90, span: 80 } : undefined);
      svgStyle(r.svg, cur);
      if (sky) sky.style.opacity = (cur.tilt / CAM.tilt).toFixed(3);
      // The token, standing upright where its space is on screen.
      const size = r.svg.clientWidth || 1;
      const [bx, by] = xy(angleOf(pos), TOKEN_R);
      const pt = project(bx, by, cur, size);
      const sc = pt.s * 0.57;
      const at = `translate(${(pt.x - 60).toFixed(1)}px, ${(pt.y - 70).toFixed(1)}px) scale(${sc.toFixed(4)})`;
      // (up off the board on a hop; squashed onto its feet, 40 below its middle, on the landing)
      token.style.transform =
        squash > 0
          ? `${at} translate(0, 40px) scale(${(1 + 0.12 * squash).toFixed(3)}, ${(1 - 0.14 * squash).toFixed(3)}) translate(0, -40px)`
          : `${at} translate(0, ${(-30 * hop).toFixed(1)}px)`;
      ground.style.transform = `${at} translate(0, 42px) scale(${(1 - 0.35 * hop).toFixed(3)}) translate(0, -42px)`;
      // What comes up along the way.
      for (const c of chips) {
        const at = Number(c.dataset.at);
        if (t >= at && !c.classList.contains("on")) {
          c.classList.add("on");
          if (c.dataset.kind === "salary") {
            sfx.coin();
            buzz(BUZZ.paid);
          }
          if (c.dataset.kind === "jail") {
            sfx.jail();
            buzz(BUZZ.jail);
          }
          if (c.dataset.kind === "stop") {
            // (a stop on the way is a card space: the card that sends the token on)
            sfx.card();
            buzz(BUZZ.card);
          }
        }
      }
      if (t >= outAt + outFor) return finish(r);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      holdShake(false);
      const r = rig.current;
      if (!over && r) {
        // Cut off (a new throw, the page leaving): put the table back as it rests.
        r.camera(1, 0, 0);
        r.turn(r.focusRotation());
        svgStyle(r.svg, { z: 1, tx: 0, ty: 0, rot: 0, tilt: 0 });
      }
    };
  }, [plan.key]);

  const lang = getLang();
  const pass = marks.filter((m) => m.kind === "pass" || m.kind === "stop");
  const salary = marks.find((m) => m.kind === "salary");
  return (
    <div class={`ride side-${side === 1 ? "l" : "r"}${plan.jail ? " jailed" : ""}`} ref={root} aria-hidden="true">
      <ol class="ride-trail">
        {pass.map((m) => (
          <li key={`${m.space}-${m.at}`} class={`ride-chip${m.kind === "stop" ? " stop" : ""}`} data-at={m.at} data-kind={m.kind}>
            <SpaceLabel at={m.space} />
          </li>
        ))}
      </ol>
      <div class="ride-ground">
        <svg viewBox="0 0 120 120" width="120" height="120" overflow="visible">
          <ellipse class="ride-ripple" cx="60" cy="112" rx="34" ry="9" />
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
      {salary && (
        <p class="ride-salary num" data-at={salary.at} data-kind="salary">
          +{money(salary.amount ?? 0)}
        </p>
      )}
      <div class="ride-land" data-at={plan.t.land} data-kind="land" style={group ? { "--group": group.color } : undefined}>
        <b>{land ? tx(land.name) : spaceName(last.to)}</b>
        {land && <small>{lang === "zh" ? land.name.en : land.name.zh}</small>}
      </div>
      {plan.jail && (
        <div class="ride-jail" data-at={plan.t.land + 350} data-kind="jail">
          <svg viewBox="0 0 120 120" class="bars">
            {[14, 38, 62, 86, 110].map((x) => (
              <rect key={x} x={x - 4} y="0" width="8" height="120" rx="4" />
            ))}
            <rect x="0" y="16" width="120" height="8" rx="4" />
          </svg>
          <b>{t("sentToImmigration")}</b>
        </div>
      )}
    </div>
  );
}

const totalSteps = (plan: RidePlan) => plan.legs.reduce((a, l) => a + l.steps, 0);

/** How many spaces the token has reached by `t`. */
function stepsAt(plan: RidePlan, t: number) {
  let n = 0;
  plan.legs.forEach((leg, j) => {
    const { at, step } = plan.t.legs[j];
    if (t >= at) n += Math.min(leg.steps, Math.floor((t - at) / step));
  });
  return n;
}

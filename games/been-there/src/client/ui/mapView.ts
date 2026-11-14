// The board on a phone or a laptop at the size the player picked (prefs.mapSize: the menu, or the
// button on the board). Small fits all of it in its box; medium and large draw it bigger, and the box
// shows part of it, which a finger (or the mouse) drags round. It is one CSS transform on .board-pan, a
// frame round the board's own (.board-view, which a move's camera moves), written straight to the page
// on the animation clock, as the ride does: nothing is drawn again for it.
//
// The view follows the token of the team on turn, in step as it walks (so it never shows where a token
// will land before it gets there), until the player drags the map to look round: then it stays where
// they left it until the turn passes or the size changes. With the play window up over the bottom of
// the board, the token stands in the middle of the part the window leaves (`cover`). This phone's own move (ui/Ride.tsx) takes the
// view over where the map is (release), its camera starting from there and coming back to the map's
// size over where the token landed (adopt): one camera, no jump at either end. Every change of view
// eases toward where it's going; with reduced motion it is simply there.
import type { RefObject } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { angleOf, xy, type Rig } from "../art/RoundBoard";
import type { MapSize } from "../prefs";

/** How much bigger than its box each size draws the board. */
export const ZOOM: Record<MapSize, number> = { s: 1, m: 1.5, l: 2.2 };

/** How quickly the view eases toward its size and toward the token (s: about two thirds of the way). */
const EASE_ZOOM = 0.13;
const EASE_FOLLOW = 0.2;
/** A finger has to move this far (px) to drag the map rather than tap a city. */
const SLOP = 8;
/** A flick glides on, slowing by this much a second. */
const FRICTION = 5;
/** How long the view keeps an eye on a token after it moves: the walk waits for the thrower's beat
 * (ridePlan.ts) and takes up to 1.8 s. */
const WATCH_MS = 6000;
/** How long the view stays on a city this phone builds on (it comes up out of the ground: 0.8 s, a
 * hotel 1.3 s) before it goes back to the team on turn. */
const LOOK_MS = 2600;
/** Where on a city the view looks: between its buildings and its name (board units from the middle). */
const LOOK_R = 385;

/** The middle of the view, kept where the box stays on the board at zoom `z` (board units). */
export const keepIn = (c: number, z: number) => {
  const lim = Math.max(0, 500 - 500 / z);
  return Math.max(-lim, Math.min(lim, c));
};

/** The move's camera (ui/Ride.tsx, its zoom and pan in board units) that shows the board as the map
 * does at zoom `z` round (cx, cy). */
export const mapCam = (z: number, cx: number, cy: number) => ({ z, tx: -z * keepIn(cx, z), ty: -z * keepIn(cy, z) });

export interface MapViewOptions {
  /** The size picked: 1 fits the whole board. */
  zoom: number;
  /** The seat whose token the view follows (the team on turn), or none. */
  follow: number | null;
  /** Changes when the turn passes: the view follows again, even after a drag. */
  turnKey: string;
  /** Changes when the followed token moves on: the view keeps up with it as it walks. */
  moveKey: string;
  reduced: boolean;
  /** A city to look at for a moment (one this phone just built on; a big rent paid there, pushing in
   * on it: `push`, the zoom to look at it with at least), keyed so each looks again; from `from`
   * (performance.now() ms: the rent's token down on the city), or now. */
  look?: { at: number; key: string; from?: number; push?: number } | null;
  /** Where a point of the board (board units, before the table turns) shows in the box, the table
   * turned to `rot`: board units from the box's middle (the board leaning back as it rests: the map
   * is the board as it shows). None: the table only turns. */
  place?: (x: number, y: number, rot: number) => [number, number];
  /** How much of the box (px, from its bottom) the play window covers on a phone, while it's up: what
   * the view follows stands in the middle of the part it leaves, not of the whole box. */
  cover?: number;
}

/** How this phone's own move takes the view over, and gives it back (ui/Ride.tsx). */
export interface MapHand {
  /** The size picked. */
  zoom: number;
  /** The view as the map shows it now; from now on the move's camera draws it. */
  release(): { z: number; cx: number; cy: number };
  /** The move is over: the map shows the board at zoom `z` round (cx, cy), as the camera left it. */
  adopt(z: number, cx: number, cy: number): void;
}

export interface MapView extends Omit<MapHand, "zoom"> {
  /** Follow the team on turn again (after a drag). */
  recentre(): void;
}

/** What the map remembers between frames. Board units: the board is -500..500 across, as turned on screen. */
interface View {
  cx: number;
  cy: number;
  /** The zoom as drawn now (it eases toward the size picked). */
  z: number;
  /** The player dragged the map: it stays put until the turn passes. */
  held: boolean;
  /** A move's camera has the view (release, adopt). */
  ridden: boolean;
  /** The box's size (px): read when it changes, never in a frame. */
  w: number;
  h: number;
  /** A flick's glide, board units a second. */
  vx: number;
  vy: number;
  /** Keep watching the followed token until then (performance.now()). */
  until: number;
  /** The city looked at (`look`) from `lookFrom` until `lookUntil`, or none, and the zoom it's looked at with at least. */
  lookAt: number | null;
  lookFrom: number;
  lookUntil: number;
  lookPush: number;
  raf: number;
  last: number;
  shown: string;
}

export function useMapView(wrap: RefObject<HTMLDivElement>, pan: RefObject<HTMLDivElement>, rig: RefObject<Rig | null>, o: MapViewOptions): MapView {
  const opts = useRef(o);
  opts.current = o;
  const view = useRef<View>({ cx: 0, cy: 0, z: Math.max(1, o.zoom), held: false, ridden: false, w: 0, h: 0, vx: 0, vy: 0, until: 0, lookAt: null, lookFrom: 0, lookUntil: 0, lookPush: 1, raf: 0, last: 0, shown: "" });
  const kick = useRef<(watch?: number) => void>(() => {});
  const write = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const box = wrap.current;
    const layer = pan.current;
    if (!box || !layer) return;
    const v = view.current;
    v.w = box.clientWidth;
    v.h = box.clientHeight;
    /** Looking at a city now (`look`). */
    const looking = (now = performance.now()) => v.lookAt !== null && now >= v.lookFrom && now < v.lookUntil;
    /** The zoom the view eases to: the size picked, or more while it pushes in on a city. */
    const goal = () => Math.max(1, opts.current.zoom, looking() ? v.lookPush : 1);
    write.current = () => {
      const { z, w, h } = v;
      let tf = "";
      if (!v.ridden && z > 1.0005 && w > 0) {
        const px = ((keepIn(v.cx, z) + 500) / 1000) * z * w - w / 2;
        const py = ((keepIn(v.cy, z) + 500) / 1000) * z * h - h / 2;
        tf = `translate(${(-px).toFixed(1)}px, ${(-py).toFixed(1)}px) scale(${z.toFixed(4)})`;
      }
      if (tf !== v.shown) {
        v.shown = tf;
        layer.style.transform = tf;
      }
    };
    /** Where a point of the board shows in the box (board units from its middle), as the table is turned. */
    const shown = (x: number, y: number, r: Rig): [number, number] => {
      const rot = r.rotation();
      const place = opts.current.place;
      if (place) return place(x, y, rot);
      const a = (rot * Math.PI) / 180;
      return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    };
    /** Where the followed token stands now (or the city looked at), as it shows in the box, or null. */
    const target = (): [number, number] | null => {
      const seat = opts.current.follow;
      const r = rig.current;
      if (r && v.lookAt !== null && looking()) {
        const [x, y] = xy(angleOf(v.lookAt), LOOK_R);
        return shown(x, y, r);
      }
      if (seat === null || !r) return null;
      const el = r.svg.querySelector<SVGGElement>(`[data-seat="${seat}"]`);
      const x = Number(el?.dataset.x);
      const y = Number(el?.dataset.y);
      if (!el || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return shown(x, y, r);
    };

    const drag = { id: -1, x0: 0, y0: 0, x: 0, y: 0, t: 0, on: false, vx: 0, vy: 0 };
    let swallowUntil = 0;

    const frame = (now: number) => {
      v.raf = 0;
      if (v.ridden) return;
      const o = opts.current;
      const dt = v.last ? Math.min(0.05, (now - v.last) / 1000) : 1 / 60;
      v.last = now;
      const zt = goal();
      const still = o.reduced;
      if (still) v.z = zt;
      else {
        v.z += (zt - v.z) * (1 - Math.exp(-dt / EASE_ZOOM));
        if (Math.abs(zt - v.z) < 0.002) v.z = zt;
      }
      let busy = v.z !== zt || drag.on;
      if (!drag.on && (v.vx || v.vy)) {
        // a flick glides on
        v.cx = keepIn(v.cx + v.vx * dt, zt);
        v.cy = keepIn(v.cy + v.vy * dt, zt);
        const f = Math.exp(-FRICTION * dt);
        v.vx *= f;
        v.vy *= f;
        if (Math.hypot(v.vx, v.vy) < 15) v.vx = v.vy = 0;
        busy = true;
      } else if (!drag.on && !v.held && zt > 1) {
        const t = target();
        if (t) {
          // (the play window up over the bottom of the box: in the middle of what it leaves)
          const lift = o.cover && v.h ? (Math.min(o.cover, v.h * 0.8) / 2) * (1000 / (zt * v.h)) : 0;
          const tx = keepIn(t[0], zt);
          const ty = keepIn(t[1] + lift, zt);
          const k = still ? 1 : 1 - Math.exp(-dt / EASE_FOLLOW);
          v.cx += (tx - v.cx) * k;
          v.cy += (ty - v.cy) * k;
          if (Math.abs(tx - v.cx) < 0.4 && Math.abs(ty - v.cy) < 0.4) {
            v.cx = tx;
            v.cy = ty;
          } else busy = true;
        }
        if (now < v.until) busy = true;
      }
      // (a city to push in on, even at the size that shows the whole board: wait for it, and see it through)
      if (v.lookAt !== null && now < v.lookUntil) busy = true;
      write.current();
      // (a layer of its own only while it moves: standing still, it's drawn sharp at its size)
      layer.classList.toggle("moving", busy && !still && Math.max(v.z, zt) > 1.0005);
      if (busy) v.raf = requestAnimationFrame(frame);
      else v.last = 0;
    };
    kick.current = (watch = 0) => {
      if (watch) v.until = Math.max(v.until, performance.now() + watch);
      if (!v.raf && !v.ridden) {
        v.last = 0;
        v.raf = requestAnimationFrame(frame);
      }
    };

    const sized = new ResizeObserver(() => {
      v.w = box.clientWidth;
      v.h = box.clientHeight;
      write.current();
    });
    sized.observe(box);

    const down = (e: PointerEvent) => {
      if (v.ridden || goal() <= 1 || drag.id !== -1 || (e.pointerType === "mouse" && e.button !== 0)) return;
      if ((e.target as Element | null)?.closest?.("button, a, input, select, .sheet-bg")) return;
      drag.id = e.pointerId;
      drag.x0 = drag.x = e.clientX;
      drag.y0 = drag.y = e.clientY;
      drag.t = e.timeStamp;
      drag.on = false;
      drag.vx = drag.vy = 0;
      v.vx = v.vy = 0;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== drag.id || v.ridden) return;
      if (!drag.on) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < SLOP) return;
        drag.on = true;
        v.held = true;
        try {
          box.setPointerCapture(e.pointerId);
        } catch {
          // (a pointer that's already gone)
        }
        box.classList.add("dragging");
        // from where the map is drawn now (a follow or a glide may have been under way)
        v.cx = keepIn(v.cx, goal());
        v.cy = keepIn(v.cy, goal());
        kick.current();
      }
      const unit = 1000 / (v.z * Math.max(1, v.w));
      const dx = (e.clientX - drag.x) * unit;
      const dy = (e.clientY - drag.y) * unit;
      v.cx = keepIn(v.cx - dx, goal());
      v.cy = keepIn(v.cy - dy, goal());
      const dt = Math.max(8, e.timeStamp - drag.t) / 1000;
      drag.vx = 0.6 * (-dx / dt) + 0.4 * drag.vx;
      drag.vy = 0.6 * (-dy / dt) + 0.4 * drag.vy;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.t = e.timeStamp;
      // (under the finger at once, not a frame later)
      write.current();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== drag.id) return;
      drag.id = -1;
      if (!drag.on) return;
      drag.on = false;
      box.classList.remove("dragging");
      // the click a drag can leave behind isn't a tap on a city
      swallowUntil = performance.now() + 400;
      // a flick (still moving as it let go) glides on
      if (!opts.current.reduced && e.type === "pointerup" && e.timeStamp - drag.t < 90) {
        const speed = Math.hypot(drag.vx, drag.vy);
        const most = 2400;
        const k = speed > most ? most / speed : 1;
        v.vx = drag.vx * k;
        v.vy = drag.vy * k;
      }
      kick.current();
    };
    const click = (e: MouseEvent) => {
      if (performance.now() > swallowUntil) return;
      swallowUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    };
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    box.addEventListener("click", click, true);
    kick.current(WATCH_MS);
    return () => {
      sized.disconnect();
      cancelAnimationFrame(v.raf);
      v.raf = 0;
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", up);
      box.removeEventListener("click", click, true);
    };
  }, []);

  // The turn passes, or a size is picked: follow the team on turn again, whatever the player looked at.
  useEffect(() => {
    view.current.held = false;
    kick.current(WATCH_MS);
  }, [o.turnKey, o.zoom]);
  // The token moves on: ease along with it. (The play window comes up or goes: make room.)
  useEffect(() => {
    kick.current(WATCH_MS);
  }, [o.moveKey, o.follow, o.reduced, o.cover]);
  // A city built on: look at it for a moment (even after a drag), then back to the team on turn.
  useEffect(() => {
    const v = view.current;
    if (!o.look) return;
    const now = performance.now();
    v.lookAt = o.look.at;
    v.lookFrom = Math.max(now, o.look.from ?? now);
    v.lookUntil = v.lookFrom + LOOK_MS;
    v.lookPush = o.look.push ?? 1;
    v.held = false;
    v.vx = v.vy = 0;
    kick.current(v.lookUntil - now + 1500);
  }, [o.look?.key]);

  return {
    recentre: () => {
      const v = view.current;
      v.held = false;
      v.vx = v.vy = 0;
      kick.current(WATCH_MS);
    },
    release: () => {
      const v = view.current;
      const z = v.z;
      const out = { z, cx: keepIn(v.cx, z), cy: keepIn(v.cy, z) };
      cancelAnimationFrame(v.raf);
      v.raf = 0;
      v.vx = v.vy = 0;
      v.ridden = true;
      pan.current?.classList.remove("moving");
      write.current();
      return out;
    },
    adopt: (z, cx, cy) => {
      const v = view.current;
      v.ridden = false;
      v.held = false;
      v.z = z;
      v.cx = cx;
      v.cy = cy;
      write.current();
      kick.current(WATCH_MS);
    },
  };
}

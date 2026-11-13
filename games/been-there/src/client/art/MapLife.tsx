// Life on the map in the middle of the board, between moves: now and then a little airliner flies
// between two of the cities the teams have been to, the long way over the globe (the great circle, as a
// team's token flies it: RouteMap), trailing its contrail; and the cities with buildings on the ring
// glow on the map, their windows lit, a hotel's brighter. It lies between the satellite map
// (art/SatMap.ts, under the board) and the board itself, so the city dots and the tokens stand over it,
// and turns with the table (RoundBoard turns it, as it turns the satellite map).
//
// Cheap on a phone: a plane is a small box of its own that the browser moves by itself (a transform and
// an opacity), so nothing of the board is drawn again for it, and the glows stand still. One plane at a
// time, none while a move plays or the page is hidden, and none with reduced motion.
import type { Ref } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { CITIES } from "../../engine";
import { COORDS, polar } from "./geo";
import { flightPoints } from "./RouteMap";

/** The map's radius on the board (board units, of its 1000): the layer is its square (art.css .map-life). */
const R = 320;
/** How big a plane is drawn, of the layer's width (%). */
const PLANE = 6;
/** A flight's time (ms), and the wait before the next (ms, at random between the two). */
const FLY = 7600;
const GAP: [number, number] = [5000, 11000];

/** Where a point of the map (board units from the middle) is in the layer, of its width (%). */
const pct = ([x, y]: [number, number]): [number, number] => [((x + R) / (2 * R)) * 100, ((y + R) / (2 * R)) * 100];

/** A box of PLANE% placed with its middle at (px, py)% of the layer (a translate is of the box's own size). */
const at = (px: number, py: number) => `translate(${((px / PLANE) * 100 - 50).toFixed(1)}%, ${((py / PLANE) * 100 - 50).toFixed(1)}%)`;

/** An airliner seen from above, pointing up, in a 24-unit square. */
const PLANE_D = "M12 1.5c.9 0 1.5 1.1 1.5 2.6v5.2l8.5 5v2.1l-8.5-2.6v4.6l2.4 1.9v1.6L12 21l-3.9.9v-1.6l2.4-1.9v-4.6L2 16.4v-2.1l8.5-5V4.1c0-1.5.6-2.6 1.5-2.6z";

export interface Glow {
  city: string;
  hotel: boolean;
}

export function MapLife({
  visited,
  glows,
  reduced,
  busy,
  layer,
  rot,
}: {
  /** The cities any team has been to (their ids): the planes fly between them. */
  visited: string[];
  /** The cities with buildings on the ring. */
  glows: Glow[];
  reduced?: boolean;
  /** A move is playing (or the board's turning): no new flight now. */
  busy: () => boolean;
  /** The layer itself, for the table to turn it, and the table's angle as drawn. */
  layer: Ref<HTMLDivElement>;
  rot: number;
}) {
  const planes = useRef<HTMLDivElement>(null);
  const cities = useRef(visited);
  cities.current = visited;
  useEffect(() => {
    if (reduced) return;
    let timer = 0;
    let last = "";
    const next = (wait: number) => {
      timer = window.setTimeout(fly, wait);
    };
    const fly = () => {
      const box = planes.current;
      const list = cities.current.filter((id) => COORDS[id]);
      if (!box || typeof box.animate !== "function") return;
      if (list.length < 2 || document.hidden || busy()) return next(2500);
      // (two cities in different regions, not the last flight's again)
      const region = (id: string) => CITIES.find((c) => c.id === id)?.group;
      const pairs: [string, string][] = [];
      for (const a of list) for (const b of list) if (a !== b && region(a) !== region(b) && `${a}>${b}` !== last) pairs.push([a, b]);
      if (!pairs.length) return next(GAP[1]);
      const [from, to] = pairs[Math.floor(Math.random() * pairs.length)];
      last = `${from}>${to}`;
      const pts = flightPoints(from, to, R, 18).map(pct);
      const frames = pts.map(([x, y], i) => {
        const [nx, ny] = pts[Math.min(pts.length - 1, i + 1)];
        const [px, py] = pts[Math.max(0, i - 1)];
        const heading = (Math.atan2(ny - py, nx - px) * 180) / Math.PI + 90;
        const k = i / (pts.length - 1);
        return { transform: `${at(x, y)} rotate(${heading.toFixed(1)}deg)`, opacity: k < 0.06 || k > 0.94 ? 0 : 1, offset: k };
      });
      const plane = document.createElement("div");
      plane.className = "life-plane";
      plane.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${PLANE_D}"/></svg>`;
      box.appendChild(plane);
      const run = plane.animate(frames, { duration: FLY, easing: "linear", fill: "both" });
      run.onfinish = () => plane.remove();
      run.oncancel = () => plane.remove();
      next(FLY + GAP[0] + Math.random() * (GAP[1] - GAP[0]));
    };
    next(2500 + Math.random() * 3000);
    return () => {
      clearTimeout(timer);
      planes.current?.replaceChildren();
    };
  }, [reduced]);
  return (
    <div class="map-life" ref={layer} style={{ transform: `rotate(${rot.toFixed(2)}deg)` }} aria-hidden="true">
      {glows.map((g) => {
        const c = COORDS[g.city];
        if (!c) return null;
        const [x, y] = pct(polar(c[0], c[1], R));
        return <i key={g.city} class={`life-glow${g.hotel ? " hotel" : ""}`} style={{ transform: at(x, y) }} />;
      })}
      <div class="life-planes" ref={planes} />
    </div>
  );
}

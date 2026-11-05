// The map in the middle of the round board: the world seen from above the North Pole, like the
// airline route maps of the 1940s. Since issue #44 the world itself is real: NASA's satellite pictures
// (art/SatMap.ts paints them under the board), lit where the sun is up right now and showing the lights
// where it has set. Until they're in (or where they can't load) the drawn map stands in: the sea,
// the land and the night side, which moves on every minute. Over either one, each city sits at its real
// latitude and longitude in its region's colour, glowing after dark; and when a team crosses to another
// region its token flies there along the great circle, the shortest way over the globe.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { CITIES } from "../../engine";
import { CharacterArt } from "./characters";
import { COORDS, isNight, mapRoute, nightPath, polar } from "./geo";
import { sunNow } from "./satellite";
import { LAND, WORLD_R } from "./world";

export interface Flight {
  from: string;
  to: string;
  /** Changes for every new flight so the animation restarts. */
  key: string | number;
  /** The team flying it: its character (the team's colour) flies the route. */
  kind?: number;
  /** When it takes off (performance.now() ms): the moment its token is down on the ring. Now if none. */
  at?: number;
}

export const GROUP_DOT: Record<number, string> = {
  1: "#9c6b3c",
  2: "#56b4e9",
  3: "#cc79a7",
  4: "#e69f00",
  5: "#d55e00",
  6: "#e8d33f",
  7: "#009e73",
  8: "#0072b2",
};

/** How long a flight takes on the map, and how big the token flying it is (of its drawing). */
export const FLY_MS = 2600;
const FLY_SCALE = 0.42;
/** How high the token climbs over the middle of the route (of the map's radius). */
const FLY_LIFT = 0.1;

/** The route's points on the map of radius r: the great circle between the two cities (geo.ts `mapRoute`). */
export function flightPoints(from: string, to: string, r: number, steps = 64): [number, number][] {
  return mapRoute(from, to, steps).map(([lat, lon]) => polar(lat, lon, r));
}

/** How long the route is as drawn, and each stretch of it. */
export function routeLength(pts: [number, number][]): { total: number; seg: number[] } {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  return { total: seg.reduce((a, b) => a + b, 0), seg };
}

/** Where along the route a flight is, `p` of the way along it as drawn (0..1): the head of its trail. */
export function alongRoute(pts: [number, number][], p: number, len = routeLength(pts)): [number, number] {
  let left = Math.max(0, Math.min(1, p)) * len.total;
  for (let i = 0; i < len.seg.length; i++) {
    if (left <= len.seg[i] || i === len.seg.length - 1) {
      const k = len.seg[i] ? Math.min(1, left / len.seg[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    left -= len.seg[i];
  }
  return pts[pts.length - 1];
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** The route map as an SVG group of radius r, centred on (0, 0). */
export function RouteMap({
  r,
  flight,
  labels,
  reduced,
  turned,
}: {
  r: number;
  flight?: Flight | null;
  labels?: boolean;
  reduced?: boolean;
  /** The table's angle as drawn now (degrees): the flying token stays upright on it. */
  turned?: () => number;
}) {
  const k = r / WORLD_R;
  const now = useMinute();
  // A flight from before this board was drawn isn't flown again: its route is just there.
  const first = useRef(flight?.key);
  return (
    <g class="routemap">
      <defs>
        <radialGradient id="city-glow">
          <stop offset="0" stop-color="#ffd27a" stop-opacity="0.95" />
          <stop offset="0.45" stop-color="#ffb347" stop-opacity="0.45" />
          <stop offset="1" stop-color="#ffb347" stop-opacity="0" />
        </radialGradient>
      </defs>
      {/* (the drawn map: until the satellite pictures are in, and wherever they can't be) */}
      <g class="base">
        <circle r={r} fill="var(--map-sea)" />
        {[60, 30, 0, -30].map((lat) => (
          <circle key={lat} r={polar(lat, 0, r)[1]} fill="none" stroke="var(--map-line)" stroke-width={lat === 0 ? 1.6 : 1} stroke-dasharray={lat === 0 ? "none" : "4 5"} />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const [x, y] = polar(-58, i * 30, r);
          return <line key={i} x1="0" y1="0" x2={x} y2={y} stroke="var(--map-line)" stroke-width="0.8" />;
        })}
        <path d={LAND} transform={`scale(${k})`} fill="var(--map-land)" />
        <path d={nightPath(now, r)} fill="var(--night-shade)" fill-rule="evenodd" opacity="0.3" class="night" />
      </g>
      {/* (over the satellite map: the equator and the tropics, faint, as printed on an air-age chart) */}
      <g class="grid" fill="none">
        {[23.44, 0, -23.44].map((lat) => (
          <circle key={lat} r={polar(lat, 0, r)[1]} stroke-width={lat === 0 ? 1.4 : 1} stroke-dasharray={lat === 0 ? "none" : "3 6"} />
        ))}
      </g>
      <circle r={r} fill="none" stroke="var(--board-ink)" stroke-width="2.5" />
      {CITIES.map((c) => {
        const [lat, lon] = COORDS[c.id];
        const [x, y] = polar(lat, lon, r);
        return (
          <g key={c.id} class="city" data-city={c.id} data-night={isNight(lat, lon, now) ? "1" : "0"}>
            {isNight(lat, lon, now) && <circle cx={x} cy={y} r={r * 0.06} fill="url(#city-glow)" class="lamp" />}
            <circle cx={x} cy={y} r={r * 0.034} class="dot-edge" />
            <circle cx={x} cy={y} r={r * 0.024} fill={GROUP_DOT[c.group]} stroke="var(--board-ink)" stroke-width={r * 0.008} />
            {labels && (
              <text x={x} y={y - r * 0.035} font-size={r * 0.04} text-anchor="middle" class="map-label">
                {c.name.en}
              </text>
            )}
          </g>
        );
      })}
      {flight && COORDS[flight.from] && COORDS[flight.to] && (
        <FlightPath key={flight.key} flight={flight} r={r} fly={!reduced && flight.key !== first.current && flight.kind !== undefined} turned={turned} />
      )}
    </g>
  );
}

/**
 * A flight on the map: the route, dashed and faint, and the trail drawn along it behind the team's
 * token, which climbs out of one city and comes down on the other (its shadow keeps to the ground), then
 * steps off the map. It waits for its moment (`at`): nothing tells the landing before the stamp. Played
 * on the animation clock, a frame at a time; still (reduced motion, or an old flight), the route is drawn
 * and nobody flies.
 */
function FlightPath({ flight, r, fly, turned }: { flight: Flight; r: number; fly: boolean; turned?: () => number }) {
  const pts = useMemo(() => flightPoints(flight.from, flight.to, r), [flight.from, flight.to, r]);
  const d = useMemo(() => "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L"), [pts]);
  const root = useRef<SVGGElement>(null);
  const trail = useRef<SVGPathElement>(null);
  const token = useRef<SVGGElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  useLayoutEffect(() => {
    const g = root.current;
    const tr = trail.current;
    if (!fly || !g || !tr) return;
    // (the token is where the trail's head is: both by the route's length as drawn)
    const route = routeLength(pts);
    const len = route.total || 1;
    tr.style.strokeDasharray = `${len.toFixed(1)} ${len.toFixed(1)}`;
    tr.style.strokeDashoffset = len.toFixed(1);
    const start = flight.at ?? performance.now();
    let raf = 0;
    let wait = 0;
    const lift = r * FLY_LIFT;
    const frame = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / FLY_MS));
      const e = ease(p);
      const [x, y] = alongRoute(pts, e, route);
      const up = Math.sin(Math.PI * e) * lift;
      const rot = -(turned?.() ?? 0);
      tr.style.strokeDashoffset = (len * (1 - e)).toFixed(1);
      token.current?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(2)}) translate(0 ${(-up).toFixed(1)})`);
      shadow.current?.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(1 - (0.45 * up) / lift).toFixed(3)})`);
      if (p < 1) raf = requestAnimationFrame(frame);
      else g.classList.add("landed");
    };
    // (until its moment the flight isn't there at all)
    const go = () => {
      g.classList.add("flying");
      raf = requestAnimationFrame(frame);
    };
    const ahead = start - performance.now();
    if (ahead > 16) wait = window.setTimeout(go, ahead);
    else go();
    return () => {
      clearTimeout(wait);
      cancelAnimationFrame(raf);
    };
  }, [flight.key]);
  const s = FLY_SCALE;
  return (
    <g ref={root} class={`flight${fly ? " fly" : " still"}`} data-from={flight.from} data-to={flight.to}>
      <path class="route" d={d} stroke-width={r * 0.008} stroke-dasharray={`${(r * 0.026).toFixed(1)} ${(r * 0.02).toFixed(1)}`} />
      <path class="trail" ref={trail} d={d} stroke-width={r * 0.013} />
      {fly && (
        <>
          <ellipse ref={shadow} class="fly-shadow" rx={36 * s} ry={11 * s} />
          <g ref={token} class="fly-token">
            <g class="fly-art" transform={`translate(${-60 * s} ${-104 * s}) scale(${s})`}>
              <CharacterArt kind={flight.kind ?? 0} mood="happy" />
            </g>
          </g>
        </>
      )}
    </g>
  );
}

/** The time now, a minute at a time: enough for the night to creep across the map. */
function useMinute() {
  const [now, setNow] = useState(() => sunNow());
  useEffect(() => {
    const id = setInterval(() => setNow(sunNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

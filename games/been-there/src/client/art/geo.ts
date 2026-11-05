// Where the 22 cities are, and how to draw the globe seen from above the North Pole (the map in the
// middle of the round board, src/client/art/world.ts uses the same projection).
import { subsolar } from "../globe/sun";
import { COORDS } from "./coords";
import { WORLD_LAT_MIN } from "./world";

export { COORDS };

const RAD = Math.PI / 180;

/** Project to the polar map: radius r at the southern edge, longitude 0 pointing down. */
export function polar(lat: number, lon: number, r: number): [number, number] {
  const d = ((90 - Math.max(lat, WORLD_LAT_MIN)) / (90 - WORLD_LAT_MIN)) * r;
  return [d * Math.sin(lon * RAD), d * Math.cos(lon * RAD)];
}

/** Points along the shortest path over the globe between two places, as [lat, lon]; or, `long`, the
 * other way round the same great circle. */
export function greatCircle(a: [number, number], b: [number, number], steps = 48, long = false): [number, number][] {
  const toV = ([lat, lon]: [number, number]) => [
    Math.cos(lat * RAD) * Math.cos(lon * RAD),
    Math.cos(lat * RAD) * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ];
  const va = toV(a);
  const vb = toV(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  // (the long way: the same circle at the angle that's left; the same formula traces it)
  const omega = long ? 2 * Math.PI - Math.acos(dot) : Math.acos(dot);
  if (omega < 1e-6 || Math.abs(Math.sin(omega)) < 1e-9) return [a, b];
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const k1 = Math.sin((1 - f) * omega) / Math.sin(omega);
    const k2 = Math.sin(f * omega) / Math.sin(omega);
    const x = k1 * va[0] + k2 * vb[0];
    const y = k1 * va[1] + k2 * vb[1];
    const z = k1 * va[2] + k2 * vb[2];
    out.push([Math.atan2(z, Math.hypot(x, y)) / RAD, Math.atan2(y, x) / RAD]);
  }
  return out;
}

/**
 * A flight's route on the board's map, as [lat, lon]: the great circle between the two cities, the short
 * way, unless that dips off the map's southern edge (Sydney to Buenos Aires passes Antarctica); then the
 * other way round the same circle, which stays on the map (it climbs north instead, never below the
 * lower of the two cities).
 */
export function mapRoute(from: string, to: string, steps = 64): [number, number][] {
  const short = greatCircle(COORDS[from], COORDS[to], steps);
  if (short.every(([lat]) => lat >= WORLD_LAT_MIN + 2)) return short;
  return greatCircle(COORDS[from], COORDS[to], steps, true);
}

/** SVG path for a flight between two cities on the polar map of radius r. */
export function flightPath(from: string, to: string, r: number): string {
  const pts = mapRoute(from, to).map(([lat, lon]) => polar(lat, lon, r));
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
}

/** Whether it's night at a place at `at` (ms): the sun is below the horizon there. */
export function isNight(lat: number, lon: number, at: number): boolean {
  const sun = subsolar(at);
  const p = lat * RAD;
  const d = sun.lat * RAD;
  return Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos((lon - sun.lon) * RAD) < 0;
}

/**
 * The night side on the polar map of radius r at `at` (ms), as an SVG path (fill-rule evenodd). For
 * each longitude, the latitude where the sun sits on the horizon; in the northern winter the night is
 * the cap around the pole inside that line, in summer everything outside it.
 */
export function nightPath(at: number, r: number): string {
  const sun = subsolar(at);
  // (at the equinox the line runs through the poles: nudge it off)
  const d = (Math.abs(sun.lat) < 0.1 ? 0.1 : Math.abs(sun.lat)) * Math.sign(sun.lat || 1) * RAD;
  const pts: string[] = [];
  for (let lon = -180; lon < 180; lon += 3) {
    const lat = Math.atan(-Math.cos((lon - sun.lon) * RAD) / Math.tan(d)) / RAD;
    const [x, y] = polar(lat, lon, r);
    pts.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  const line = `M${pts.join("L")}Z`;
  return d < 0 ? line : `${line}M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z`;
}

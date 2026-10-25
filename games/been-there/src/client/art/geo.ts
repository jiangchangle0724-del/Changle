// Where the 22 cities are, and how to draw the globe seen from above the North Pole (the map in the
// middle of the round board, src/client/art/world.ts uses the same projection).
import { COORDS } from "./coords";
import { WORLD_LAT_MIN } from "./world";

export { COORDS };

const RAD = Math.PI / 180;

/** Project to the polar map: radius r at the southern edge, longitude 0 pointing down. */
export function polar(lat: number, lon: number, r: number): [number, number] {
  const d = ((90 - Math.max(lat, WORLD_LAT_MIN)) / (90 - WORLD_LAT_MIN)) * r;
  return [d * Math.sin(lon * RAD), d * Math.cos(lon * RAD)];
}

/** Points along the shortest path over the globe between two places, as [lat, lon]. */
export function greatCircle(a: [number, number], b: [number, number], steps = 48): [number, number][] {
  const toV = ([lat, lon]: [number, number]) => [
    Math.cos(lat * RAD) * Math.cos(lon * RAD),
    Math.cos(lat * RAD) * Math.sin(lon * RAD),
    Math.sin(lat * RAD),
  ];
  const va = toV(a);
  const vb = toV(b);
  const dot = Math.min(1, Math.max(-1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-6) return [a, b];
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

/** SVG path for a flight between two cities on the polar map of radius r. */
export function flightPath(from: string, to: string, r: number): string {
  const pts = greatCircle(COORDS[from], COORDS[to]).map(([lat, lon]) => polar(lat, lon, r));
  return "M" + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L");
}

// The map in the middle of the round board: the world seen from above the North Pole, like the
// airline route maps of the 1940s. City dots in their region colours; a little plane flies the
// great-circle route when a token crosses to another region.
import { CITIES } from "../../engine";
import { COORDS, flightPath, polar } from "./geo";
import { LAND, WORLD_R } from "./world";

export interface Flight {
  from: string;
  to: string;
  /** Changes for every new flight so the animation restarts. */
  key: string | number;
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

/** The route map as an SVG group of radius r, centred on (0, 0). */
export function RouteMap({ r, flight, labels, reduced }: { r: number; flight?: Flight | null; labels?: boolean; reduced?: boolean }) {
  const k = r / WORLD_R;
  const path = flight ? flightPath(flight.from, flight.to, r) : "";
  return (
    <g class="routemap">
      <circle r={r} fill="var(--map-sea)" />
      {[60, 30, 0, -30].map((lat) => (
        <circle key={lat} r={polar(lat, 0, r)[1]} fill="none" stroke="var(--map-line)" stroke-width={lat === 0 ? 1.6 : 1} stroke-dasharray={lat === 0 ? "none" : "4 5"} />
      ))}
      {Array.from({ length: 12 }, (_, i) => {
        const [x, y] = polar(-58, i * 30, r);
        return <line key={i} x1="0" y1="0" x2={x} y2={y} stroke="var(--map-line)" stroke-width="0.8" />;
      })}
      <path d={LAND} transform={`scale(${k})`} fill="var(--map-land)" />
      <circle r={r} fill="none" stroke="var(--board-ink)" stroke-width="2.5" />
      {CITIES.map((c) => {
        const [x, y] = polar(COORDS[c.id][0], COORDS[c.id][1], r);
        return (
          <g key={c.id}>
            <circle cx={x} cy={y} r={r * 0.022} fill={GROUP_DOT[c.group]} stroke="var(--map-sea)" stroke-width={r * 0.008} />
            {labels && (
              <text x={x} y={y - r * 0.035} font-size={r * 0.04} text-anchor="middle" class="map-label">
                {c.name.en}
              </text>
            )}
          </g>
        );
      })}
      {flight && (
        <g key={flight.key} class="flight">
          <path d={path} fill="none" stroke="var(--flight)" stroke-width={r * 0.012} stroke-dasharray={`${r * 0.03} ${r * 0.022}`} stroke-linecap="round" />
          <g transform={reduced ? `translate(${polar(COORDS[flight.to][0], COORDS[flight.to][1], r).join(" ")})` : undefined}>
            <path d="M0 -9L2.2 -2.6L9 1.6V4L2.2 1.8L1.6 7.2L4 9V10.6L0 9.6L-4 10.6V9L-1.6 7.2L-2.2 1.8L-9 4V1.6L-2.2 -2.6Z" transform={`scale(${r * 0.0042}) rotate(90)`} fill="var(--board-ink)" />
            {!reduced && <animateMotion dur="2.4s" fill="freeze" rotate="auto" {...({ path } as object)} />}
          </g>
        </g>
      )}
    </g>
  );
}

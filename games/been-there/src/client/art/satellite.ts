// The real world in the middle of the board (issue #44): NASA's Blue Marble by day and Black Marble
// (the lights at night) after dark, made ready by scripts/satellite.mjs and served beside the game at
// /trip/map. Which side of the world is in daylight is the real one, from where the sun is right now
// (globe/sun.ts), with a soft dusk between: the lights come on as the sun goes down. A phone or a laptop
// draws it flat (art/RoundBoard.tsx); the big screen wraps the same pictures round its globe.
import { BASE } from "../base";
import { subsolar } from "../globe/sun";
import { WORLD_LAT_MIN } from "./world";

const RAD = Math.PI / 180;

/** The time the map's sun is at: now, or a moment a test fixes (`window.__sunAt`, ms). */
export function sunNow(): number {
  const at = (globalThis as { __sunAt?: unknown }).__sunAt;
  return typeof at === "number" && Number.isFinite(at) ? at : Date.now();
}

/** Where the sun is overhead, as a unit vector (x toward lon 0, y toward lon 90° E, z north). */
export function sunVector(at: number): [number, number, number] {
  const s = subsolar(at);
  const p = s.lat * RAD;
  const l = s.lon * RAD;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
}

/** The sun's height (the sine of it) at which night has fallen, and at which it's full day: dusk runs
 * from 6.9° below the horizon to 4.6° above, about the half hour either side of sunset. */
export const DUSK: [number, number] = [-0.12, 0.08];

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How much daylight a place has at `at` (ms): 0 is night, 1 day, and in between dusk or dawn. */
export function daylight(lat: number, lon: number, at: number): number {
  const [sx, sy, sz] = sunVector(at);
  const p = lat * RAD;
  const l = lon * RAD;
  return smooth(DUSK[0], DUSK[1], Math.cos(p) * Math.cos(l) * sx + Math.cos(p) * Math.sin(l) * sy + Math.sin(p) * sz);
}

/** Each cell of an n x n grid over the board's map (art/geo.ts `polar`, turned back): where it points, as
 * a unit vector. Worked out once for each size. */
const cells = new Map<number, Float32Array>();
function cellVectors(n: number): Float32Array {
  let v = cells.get(n);
  if (v) return v;
  v = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n) * 2 - 1;
      const y = ((j + 0.5) / n) * 2 - 1;
      // (outside the round map, the edge's: the corners are cut off anyway)
      const d = Math.min(1, Math.hypot(x, y));
      const lat = (90 - d * (90 - WORLD_LAT_MIN)) * RAD;
      const lon = Math.atan2(x, y);
      const k = (j * n + i) * 3;
      v[k] = Math.cos(lat) * Math.cos(lon);
      v[k + 1] = Math.cos(lat) * Math.sin(lon);
      v[k + 2] = Math.sin(lat);
    }
  cells.set(n, v);
  return v;
}

/**
 * The daylight over the board's map at `at`, as the alpha of an n x n picture (RGBA, white): drawn
 * stretched over the map it makes the soft line between day and night.
 */
export function dayMask(at: number, n: number): Uint8ClampedArray<ArrayBuffer> {
  const v = cellVectors(n);
  const [sx, sy, sz] = sunVector(at);
  const out = new Uint8ClampedArray(n * n * 4);
  for (let c = 0, k = 0; c < n * n; c++, k += 3) {
    const o = c * 4;
    out[o] = out[o + 1] = out[o + 2] = 255;
    out[o + 3] = Math.round(255 * smooth(DUSK[0], DUSK[1], v[k] * sx + v[k + 1] * sy + v[k + 2] * sz));
  }
  return out;
}

/** The pictures (scripts/satellite.mjs writes them; tests/satellite.test.ts holds them to their size). */
export const MAP_FILES = {
  disc: { 1024: ["day-1024.webp", "night-1024.webp"], 512: ["day-512.webp", "night-512.webp"] },
  globe: { 4096: ["globe-day-4096.webp", "globe-night-4096.webp"], 2048: ["globe-day-2048.webp", "globe-night-2048.webp"] },
} as const;

export const mapUrl = (file: string) => `${BASE}/map/${file}`;

type Nav = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** A phone that is short of memory, or saving data: it gets the smaller pictures, drawn less often. */
export function lightDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Nav;
  return !!nav.connection?.saveData || (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2);
}

/** Load a picture and have it decoded off the page's own thread before it's drawn. */
export function loadPicture(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    let done = false;
    const ok = () => {
      if (done) return;
      done = true;
      resolve(img);
    };
    img.onload = () => {
      if (typeof img.decode === "function") img.decode().then(ok, ok);
      else ok();
    };
    img.onerror = () => {
      if (!done) reject(new Error(`${url} did not load`));
      done = true;
    };
    img.src = url;
  });
}

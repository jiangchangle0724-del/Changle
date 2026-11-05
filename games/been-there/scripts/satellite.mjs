// The satellite map's images (issue #44): NASA's Blue Marble for the day and Black Marble for the
// night, both public domain, made ready ahead of time and kept in the repo beside the photos
// (src/client/media/map). Nothing is fetched from NASA when the game runs, and no key is needed.
//   npm run satellite       (needs ImageMagick with WebP: `magick`, or `convert` in version 6)
// It downloads the two source images from NASA (about 3 MB, kept in node_modules/.cache), then writes:
//   day-1024.webp, night-1024.webp   the board's map for phones and laptops: the globe seen from above
//                                    the North Pole (azimuthal equidistant, lon 0 pointing down, the
//                                    southern edge at 58° S), as art/geo.ts `polar` draws it
//   day-512.webp, night-512.webp     the same, smaller: for a weak phone or one saving data
//   globe-day-4096.webp, globe-night-4096.webp, globe-day-2048.webp, globe-night-2048.webp
//                                    the whole world (equirectangular, lon -180 at the left) for the
//                                    big screen's globe; 2048 where a graphics card can't take 4096
// Only needed to change the imagery: the files it writes are committed.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";

const OUT = new URL("../src/client/media/map/", import.meta.url);
const CACHE = new URL("../node_modules/.cache/satellite/", import.meta.url);

/** The sources: NASA's own files (assets.science.nasa.gov serves NASA Earth Observatory's images). */
export const SOURCES = {
  // Blue Marble: Next Generation, July 2004, with topography and bathymetry (Reto Stöckli, NASA Earth
  // Observatory). July: the greenest month for the north, which fills most of the map.
  day: {
    url: "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/july/world.topo.bathy.200407.3x5400x2700.jpg",
    w: 5400,
    h: 2700,
  },
  // Black Marble 2016, colour, 0.1 degree (Joshua Stevens, NASA Earth Observatory, from Suomi NPP VIIRS
  // data by Miguel Román, NASA Goddard).
  night: {
    url: "https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg",
    w: 3600,
    h: 1800,
  },
};

/** The board's map: its southern edge, as art/world.ts (WORLD_LAT_MIN). */
const LAT_MIN = -58;

const magick = (() => {
  for (const cmd of ["magick", "convert"]) {
    const r = spawnSync(cmd, ["-version"], { encoding: "utf8" });
    if (r.status === 0 && /ImageMagick/.test(r.stdout)) return cmd;
  }
  throw new Error("ImageMagick not found: install it (with WebP) and run again");
})();
const run = (args, input) => execFileSync(magick, args, { input, maxBuffer: 256 * 1024 * 1024 });

async function source(name) {
  const { url } = SOURCES[name];
  mkdirSync(CACHE, { recursive: true });
  const file = new URL(url.split("/").pop(), CACHE);
  if (!existsSync(file)) {
    console.log(`downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return file.pathname;
}

/** The image's pixels, 8-bit RGB, after ImageMagick's touch-ups (`tone`). */
function pixels(path, { w, h }, tone = []) {
  const raw = run([path, ...tone, "-resize", `${w}x${h}!`, "-depth", "8", "RGB:-"]);
  if (raw.length !== w * h * 3) throw new Error(`${path}: expected ${w}x${h}`);
  return raw;
}

/**
 * The board's map, `size` across: each pixel's latitude and longitude from art/geo.ts `polar` turned
 * back, sampled from the world image with 3x3 points a pixel (so the far south, squeezed into the
 * edge, comes out smooth rather than grainy).
 */
function polarDisc(src, w, h, size) {
  const out = Buffer.alloc(size * size * 3);
  const SS = 3;
  const sample = (u, v, acc) => {
    const x = u * w - 0.5;
    const y = Math.min(h - 1, Math.max(0, v * h - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const xa = ((x0 % w) + w) % w;
    const xb = (xa + 1) % w;
    const ya = y0;
    const yb = Math.min(h - 1, y0 + 1);
    for (let c = 0; c < 3; c++) {
      const p = (r, q) => src[(r * w + q) * 3 + c];
      acc[c] += (p(ya, xa) * (1 - fx) + p(ya, xb) * fx) * (1 - fy) + (p(yb, xa) * (1 - fx) + p(yb, xb) * fx) * fy;
    }
  };
  const acc = [0, 0, 0];
  for (let j = 0; j < size; j++)
    for (let i = 0; i < size; i++) {
      acc[0] = acc[1] = acc[2] = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          // (-1..1 across the map, y down; lon 0 points down, east anticlockwise: x = d sin(lon), y = d cos(lon))
          const x = ((i + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((j + (sy + 0.5) / SS) / size) * 2 - 1;
          const d = Math.min(1, Math.hypot(x, y));
          const lat = 90 - d * (90 - LAT_MIN);
          const lon = (Math.atan2(x, y) * 180) / Math.PI;
          sample((lon + 180) / 360, (90 - lat) / 180, acc);
        }
      const o = (j * size + i) * 3;
      for (let c = 0; c < 3; c++) out[o + c] = Math.max(0, Math.min(255, Math.round(acc[c] / (SS * SS))));
    }
  return out;
}

function webp(rgb, w, h, file, quality) {
  run(["-size", `${w}x${h}`, "-depth", "8", "RGB:-", "-quality", String(quality), "-define", "webp:method=6", `webp:${new URL(file, OUT).pathname}`], rgb);
  const bytes = statSync(new URL(file, OUT)).size;
  console.log(`${file}: ${w}x${h}, ${(bytes / 1024).toFixed(0)} KB`);
  return bytes;
}

// The night as NASA made it is very dark: the land a little lifted so coasts show, and the lights a
// little warmer and brighter, as the eye sees them from a plane.
const NIGHT_TONE = ["-gamma", "1.12", "-modulate", "100,118,100"];
// The day a touch richer (the board's colours come from it).
const DAY_TONE = ["-modulate", "100,108,100"];

mkdirSync(OUT, { recursive: true });
const day = await source("day");
const night = await source("night");
let total = 0;
for (const [name, path, src, tone] of [
  ["day", day, SOURCES.day, DAY_TONE],
  ["night", night, SOURCES.night, NIGHT_TONE],
]) {
  const rgb = pixels(path, src, tone);
  for (const size of [1024, 512]) total += webp(polarDisc(rgb, src.w, src.h, size), size, size, `${name}-${size}.webp`, size === 1024 ? 84 : 82);
  for (const width of [4096, 2048]) total += webp(pixels(path, { w: width, h: width / 2 }, tone), width, width / 2, `globe-${name}-${width}.webp`, name === "day" ? 78 : 80);
}
console.log(`all: ${(total / 1024).toFixed(0)} KB`);

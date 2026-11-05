// The real world in the middle of the board (issue #44): NASA's pictures stay small enough for a phone,
// the day and the night fall where the sun says at a fixed moment, a flight's route is the great circle
// between its cities and stays on the map, and the credits name NASA with links.
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import { COORDS, greatCircle, mapRoute, polar } from "../src/client/art/geo";
import { alongRoute, flightPoints, routeLength } from "../src/client/art/RouteMap";
import { DUSK, MAP_FILES, dayMask, daylight, sunNow } from "../src/client/art/satellite";
import { WORLD_LAT_MIN } from "../src/client/art/world";
import { NASA_TERMS, SATELLITE } from "../src/client/ui/Credits";
import { getLang, other, t } from "../src/client/i18n";

const DIR = "src/client/media/map/";

/** A WebP's width and height, from its header (lossy, lossless or extended). */
function webpSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  assert.equal(b.toString("ascii", 0, 4), "RIFF", `${file} is a RIFF file`);
  assert.equal(b.toString("ascii", 8, 12), "WEBP", `${file} is a WebP`);
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
  }
  assert.equal(kind, "VP8 ", `${file}: a WebP chunk`);
  return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
}

test("the satellite pictures: WebP, the sizes each screen needs, about 2 MB in all at most", () => {
  const sizes: Record<string, number> = {};
  for (const [kind, set] of Object.entries(MAP_FILES))
    for (const [px, files] of Object.entries(set))
      for (const f of files) {
        const { w, h } = webpSize(DIR + f);
        // (the board's map is round in a square; the globe's world is twice as wide as it is tall)
        assert.deepEqual({ w, h }, kind === "disc" ? { w: +px, h: +px } : { w: +px, h: +px / 2 }, f);
        sizes[f] = statSync(DIR + f).size;
      }
  const kb = (fs: readonly string[]) => fs.reduce((n, f) => n + sizes[f], 0) / 1024;
  const all = Object.values(sizes).reduce((a, b) => a + b, 0) / 1024;
  // What each kind of screen downloads: a phone's pair, a light phone's, the big screen's.
  assert.ok(kb(MAP_FILES.disc[1024]) <= 160, `a phone's pictures: ${kb(MAP_FILES.disc[1024]).toFixed(0)} KB`);
  assert.ok(kb(MAP_FILES.disc[512]) <= 50, `a light phone's: ${kb(MAP_FILES.disc[512]).toFixed(0)} KB`);
  assert.ok(kb(MAP_FILES.globe[4096]) <= 900, `the big screen's: ${kb(MAP_FILES.globe[4096]).toFixed(0)} KB`);
  assert.ok(kb(MAP_FILES.globe[2048]) <= 300, `a small graphics card's: ${kb(MAP_FILES.globe[2048]).toFixed(0)} KB`);
  assert.ok(all <= 2048, `all of them: ${all.toFixed(0)} KB`);
});

// 3 November 2026, 12:00 UTC: noon in London, 9 pm in Tokyo, 11 pm in Sydney, 7 am in New York (the sun
// just up), 4 am in Vancouver.
const NOON_UTC = Date.UTC(2026, 10, 3, 12);
// 20:00 UTC: 8 pm in London, 5 am in Tokyo, 3 pm in New York, noon in Vancouver.
const EVENING_UTC = Date.UTC(2026, 10, 3, 20);

test("day and night fall where the sun says, at a fixed moment", () => {
  const day = (id: string, at: number) => daylight(COORDS[id][0], COORDS[id][1], at);
  for (const id of ["london", "paris", "cairo", "capetown", "dubai"]) assert.equal(day(id, NOON_UTC), 1, `${id} by day at 12:00 UTC`);
  for (const id of ["tokyo", "seoul", "sydney", "vancouver", "lasvegas"]) assert.equal(day(id, NOON_UTC), 0, `${id} by night at 12:00 UTC`);
  assert.ok(day("newyork", NOON_UTC) > 0.5, "New York at 7 am: the sun is just up");
  for (const id of ["vancouver", "newyork", "mexicocity", "rio"]) assert.equal(day(id, EVENING_UTC), 1, `${id} by day at 20:00 UTC`);
  for (const id of ["london", "tokyo", "beijing", "mumbai", "dubai"]) assert.equal(day(id, EVENING_UTC), 0, `${id} by night at 20:00 UTC`);
});

test("the map's daylight picture agrees with the sun at each city, and dusk is soft, not a hard line", () => {
  const N = 160;
  for (const at of [NOON_UTC, EVENING_UTC]) {
    const mask = dayMask(at, N);
    for (const id of Object.keys(COORDS)) {
      // (the city's cell on the map: polar() with the map's radius as 1, turned into the picture's cells)
      const [x, y] = polar(COORDS[id][0], COORDS[id][1], 1);
      const i = Math.min(N - 1, Math.floor(((x + 1) / 2) * N));
      const j = Math.min(N - 1, Math.floor(((y + 1) / 2) * N));
      const alpha = mask[(j * N + i) * 4 + 3] / 255;
      assert.ok(Math.abs(alpha - daylight(COORDS[id][0], COORDS[id][1], at)) < 0.2, `${id} at ${new Date(at).toISOString()}: ${alpha.toFixed(2)}`);
    }
    let dusk = 0;
    for (let k = 3; k < mask.length; k += 4) if (mask[k] > 20 && mask[k] < 235) dusk++;
    // Some of the map is in dusk (soft), and only a band of it.
    assert.ok(dusk > N * 2 && dusk < N * N * 0.25, `cells in dusk: ${dusk}`);
  }
  // Dusk: the sun from about 7 degrees under the horizon to 5 over.
  assert.ok(Math.asin(DUSK[0]) * (180 / Math.PI) < -6 && Math.asin(DUSK[1]) * (180 / Math.PI) > 4);
});

test("a test can fix the map's sun (window.__sunAt); otherwise it's now", () => {
  const g = globalThis as { __sunAt?: number };
  assert.ok(Math.abs(sunNow() - Date.now()) < 1000);
  g.__sunAt = NOON_UTC;
  assert.equal(sunNow(), NOON_UTC);
  delete g.__sunAt;
});

const unit = ([lat, lon]: [number, number]) => {
  const r = Math.PI / 180;
  return [Math.cos(lat * r) * Math.cos(lon * r), Math.cos(lat * r) * Math.sin(lon * r), Math.sin(lat * r)];
};
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const angle = (a: number[], b: number[]) => Math.acos(Math.max(-1, Math.min(1, dot(a, b))));

test("every flight's route is a great circle between its cities, the short way unless that leaves the map", () => {
  const ids = Object.keys(COORDS);
  let long = 0;
  for (const from of ids)
    for (const to of ids) {
      if (from === to) continue;
      const route = mapRoute(from, to);
      const a = unit(COORDS[from]);
      const b = unit(COORDS[to]);
      const n = cross(a, b);
      const len = Math.hypot(...n);
      // It starts and ends on the cities…
      assert.ok(angle(unit(route[0]), a) < 1e-6 && angle(unit(route[route.length - 1]), b) < 1e-6, `${from}-${to}: ends`);
      // …every point is on the circle through them, evenly spaced along it…
      const steps = route.slice(1).map((p, i) => angle(unit(route[i]), unit(p)));
      for (const p of route) assert.ok(Math.abs(dot(unit(p), n)) / len < 1e-6, `${from}-${to}: off the great circle`);
      assert.ok(Math.max(...steps) - Math.min(...steps) < 1e-6, `${from}-${to}: evenly spaced`);
      // …and it stays on the map (south to 58 degrees).
      assert.ok(Math.min(...route.map(([lat]) => lat)) >= WORLD_LAT_MIN, `${from}-${to}: on the map`);
      const total = steps.reduce((s, x) => s + x, 0);
      const short = angle(a, b);
      if (Math.abs(total - short) > 1e-6) {
        // The long way round, only where the short way dips below the map's edge.
        assert.ok(Math.abs(total - (2 * Math.PI - short)) < 1e-6, `${from}-${to}: the other way round`);
        assert.ok(Math.min(...greatCircle(COORDS[from], COORDS[to], 64).map(([lat]) => lat)) < WORLD_LAT_MIN + 2, `${from}-${to}: only when it must`);
        long++;
      }
    }
  // (Sydney to Buenos Aires and its like: a few, both ways)
  assert.ok(long > 0 && long < 20, `routes the long way: ${long}`);
});

test("the token flies the route from one city to the other on the board's map", () => {
  const pts = flightPoints("vancouver", "london", 320);
  const near = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  assert.ok(near(alongRoute(pts, 0), polar(...COORDS.vancouver, 320)));
  assert.ok(near(alongRoute(pts, 1), polar(...COORDS.london, 320)));
  // (the token is at the head of its trail: half way through, half the route's length as drawn)
  const len = routeLength(pts);
  const mid = alongRoute(pts, 0.5);
  let before = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const on = Math.abs(Math.hypot(mid[0] - a[0], mid[1] - a[1]) + Math.hypot(b[0] - mid[0], b[1] - mid[1]) - len.seg[i]) < 1e-6;
    if (on) {
      before += Math.hypot(mid[0] - a[0], mid[1] - a[1]);
      break;
    }
    before += len.seg[i];
  }
  assert.ok(Math.abs(before - len.total / 2) < 1e-6, `${before} of ${len.total}`);
});

test("the credits name NASA's pictures, with their pages and NASA's terms, in both languages", () => {
  assert.equal(SATELLITE.length, 2);
  for (const m of SATELLITE) {
    assert.match(m.url, /^https:\/\/science\.nasa\.gov\/earth\/earth-observatory\//);
    assert.ok(m.name.zh && m.name.en && m.who.includes("NASA"));
  }
  assert.match(NASA_TERMS, /^https:\/\/www\.nasa\.gov\//);
  // (the game starts in Chinese: `t` reads it, `other` the English)
  assert.equal(getLang(), "zh");
  for (const [lang, read] of [
    ["zh", t],
    ["en", other],
  ] as const) {
    for (const k of ["creditsSatellite", "creditsSatelliteText", "creditsNasaTerms"] as const) {
      const text = read(k);
      assert.ok(text && text !== k, `${k} in ${lang}`);
      // (no em dashes or curly quotes in what a player reads)
      assert.doesNotMatch(text, /[—“”‘’]/, `${k} in ${lang}`);
    }
    assert.match(read("creditsSatelliteText"), /NASA/);
  }
  for (const m of SATELLITE) assert.doesNotMatch(m.name.zh + m.name.en + m.who, /[—“”‘’]/);
  // The licences beside the game say it too.
  assert.match(readFileSync("scripts/build.mjs", "utf8"), /Satellite map[\s\S]*NASA Earth Observatory/);
});

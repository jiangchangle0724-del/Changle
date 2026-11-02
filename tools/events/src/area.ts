// Coordinates first, then Canadian postal code, then city. Can't tell: Vancouver, flagged "待确认".
// Boundaries © OpenStreetMap contributors, ODbL 1.0; attribution is kept in boundaries.json.
import boundaries from "./data/boundaries.json";
import type { Area, Place } from "./types";

const POSTAL_PREFIXES: [Area, string][] = [
  ["vancouver", "V5K V5L V5M V5N V5P V5R V5S V5T V5V V5W V5X V5Y V5Z V6A V6B V6C V6E V6G V6H V6J V6K V6L V6M V6N V6P V6R V6S V6T V6Z V7X V7Y"],
  ["richmond", "V6V V6W V6X V6Y V7A V7B V7C V7E"],
  ["burnaby", "V5A V5B V5C V5E V5G V5H V5J V3N"],
  ["surrey", "V3R V3S V3T V3V V3W V3X V3Z V4A V4N V4P V4B V4C V4E V4G V4K V4L V4M"],
  ["north-shore", "V7G V7H V7J V7K V7L V7M V7N V7P V7R V7S V7T V7V V7W"],
  ["tri-cities", "V3B V3C V3E V3H V3J V3K V3L V3M"],
  ["langley", "V1M V2Y V2Z V3A V4W V2W V2X V4R V3Y V2S V2T V3G V4X V2V V4S V2P V2R V4Z"],
];
const BY_POSTAL = new Map(POSTAL_PREFIXES.flatMap(([area, prefixes]) => prefixes.split(" ").map((p) => [p, area] as const)));
const CANADIAN_POSTAL = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/;

// Cache each polygon's box once, so most rings never need a point-in-polygon test.
const POLYGONS = boundaries.features.flatMap(({ properties, geometry }) => geometry.coordinates.map((rings) => {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    south = Math.min(south, y);
    north = Math.max(north, y);
  }
  return { area: properties.area as Area, rings, west, east, south, north };
}));

/** Even-odd across all rings: holes subtract, independent of winding. Edges belong to the area. */
function inPolygon(x: number, y: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (x >= Math.min(xi, xj) && x <= Math.max(xi, xj) && y >= Math.min(yi, yj) && y <= Math.max(yi, yj)
        && Math.abs((x - xi) * (yj - yi) - (y - yi) * (xj - xi)) < 1e-12) return true;
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

const BY_CITY: [RegExp, Area][] = [
  [/^(north vancouver|west vancouver|n(orth)?\.? ?van|lions bay|bowen island)$/i, "north-shore"],
  [/^(vancouver|ubc|university endowment lands)$/i, "vancouver"],
  [/^richmond$/i, "richmond"],
  [/^burnaby$/i, "burnaby"],
  [/^(surrey|white rock|delta|ladner|tsawwassen)$/i, "surrey"],
  [/^(coquitlam|port coquitlam|port moody|new westminster|anmore|belcarra)$/i, "tri-cities"],
  [/^(langley|langley city|langley township|fort langley|maple ridge|pitt meadows|abbotsford|mission|chilliwack)$/i, "langley"],
];

export function resolveArea(place: Place | null): { area: Area | null; check: boolean; outside: boolean } {
  if (!place) return { area: null, check: false, outside: false };
  const { lat, lon } = place;
  if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
    for (const p of POLYGONS) {
      if (lon >= p.west && lon <= p.east && lat >= p.south && lat <= p.north && inPolygon(lon, lat, p.rings)) {
        return { area: p.area, check: false, outside: false };
      }
    }
    if (lat < 49 || lat > 49.45 || lon < -123.3 || lon > -122.2) return { area: null, check: false, outside: true };
  }
  const postal = place.postalCode?.trim().toUpperCase();
  if (postal && CANADIAN_POSTAL.test(postal)) {
    const area = BY_POSTAL.get(postal.slice(0, 3));
    if (area) return { area, check: false, outside: false };
  }
  const city = place.city?.trim();
  if (city) for (const [re, area] of BY_CITY) if (re.test(city)) return { area, check: false, outside: false };
  if (/^\d{5}(?:-\d{4})?$/.test(postal ?? "") || /\b(?:WA|Washington)\b|\b\d{5}(?:-\d{4})?\s*$/i.test(place.address ?? "")
    || /\b(?:WA|Washington)\b/i.test(city ?? "")) return { area: null, check: false, outside: true };
  return { area: "vancouver", check: true, outside: false };
}

/** Compatibility for the store and existing parsers. */
export function areaOf(place: Place | null): { area: Area | null; check: boolean } {
  const { area, check } = resolveArea(place);
  return { area, check };
}

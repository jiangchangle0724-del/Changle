import { afterEach, describe, expect, it, vi } from "vitest";
import { areaOf, resolveArea } from "../src/area";
import boundaries from "../src/data/boundaries.json";
import fixture from "./fixtures/areas/places.json";
import type { Area, Place } from "../src/types";

// The fixture's null-area row represents an online event, whose Place input is null.
const places = fixture.places.map(({ area, ...place }) => area === null ? null : place);
const local = fixture.places.filter((p) => p.area !== null && p.area !== "outside");
const known = (area: Area) => ({ area, check: false, outside: false });
const unknown = { area: "vancouver", check: true, outside: false };
const outside = { area: null, check: false, outside: true };

afterEach(() => vi.restoreAllMocks());

describe("the 50 saved places (no network)", () => {
  it("resolves every labelled place, including UBC, online and Vancouver, Washington", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw new Error("area resolution must stay offline"); });
    expect(places).toHaveLength(50);
    for (const [i, place] of places.entries()) {
      const area = fixture.places[i].area;
      expect(resolveArea(place), fixture.places[i].name).toEqual(area === "outside" ? outside : { area, check: false, outside: false });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("resolves all 48 local places without coordinates", () => {
    expect(local).toHaveLength(48);
    for (const { area, lat: _lat, lon: _lon, ...place } of local) {
      expect(resolveArea(place), place.name).toEqual(known(area as Area));
    }
  });

  it("resolves all 48 by postal code alone, even with a conflicting city", () => {
    for (const { area, postalCode } of local) {
      expect(resolveArea({ name: null, postalCode, city: "Unknown" })).toEqual(known(area as Area));
    }
    expect(resolveArea({ name: null, postalCode: " v5h4m1 ", city: "Richmond" })).toEqual(known("burnaby"));
  });

  it("resolves all 48 by city when coordinates and postal codes are removed", () => {
    for (const { area, lat: _lat, lon: _lon, postalCode: _postal, ...place } of local) {
      expect(resolveArea(place), place.name).toEqual(known(area as Area));
    }
  });

  it("keeps areaOf as resolveArea without the outside field", () => {
    for (const place of [...places, { name: "Unknown" }]) {
      const { area, check } = resolveArea(place);
      expect(areaOf(place)).toEqual({ area, check });
    }
  });
});

describe("coordinates and fallback order", () => {
  it("uses actual polygons ahead of conflicting postal codes and cities", () => {
    // One saved point per municipality area; no postal/city fallback can pass this test.
    for (const area of ["vancouver", "richmond", "burnaby", "surrey", "north-shore", "tri-cities", "langley"] as const) {
      const point = local.find((p) => p.area === area)!;
      expect(resolveArea({ name: null, lat: point.lat, lon: point.lon, postalCode: "98662", city: "Unknown" })).toEqual(known(area));
    }
    // A Langley polygon takes priority even outside the fallback box's eastern edge.
    expect(resolveArea({ name: null, lat: 49.03, lon: -122.15 })).toEqual(known("langley"));
  });

  it("rejects coordinates outside the box before postal/city fallback", () => {
    for (const [lat, lon] of [[48.99, -123.1], [49.46, -123.1], [49.2, -123.4], [49.2, -122.0]]) {
      expect(resolveArea({ name: null, lat, lon, postalCode: "V5H 4M1", city: "Burnaby" })).toEqual(outside);
    }
  });

  it("falls through for gaps inside the box and includes its limits", () => {
    // Open water, not a municipality polygon.
    expect(resolveArea({ name: null, lat: 49.3, lon: -123.2, postalCode: "V5H 4M1" })).toEqual(known("burnaby"));
    for (const [lat, lon] of [[49, -123.1], [49.45, -123.1], [49.44, -123.3], [49.4, -122.2]]) {
      expect(resolveArea({ name: null, lat, lon, postalCode: "V5H 4M1" })).toEqual(known("burnaby"));
    }
  });

  it("ignores incomplete or non-finite coordinates", () => {
    for (const coords of [{ lat: 49.2 }, { lon: -123 }, { lat: null, lon: -123 }, { lat: NaN, lon: -123 }, { lat: 49.2, lon: Infinity }]) {
      expect(resolveArea({ name: null, ...coords, city: " Richmond " })).toEqual(known("richmond"));
    }
  });

  it("falls through unknown or invalid Canadian postal codes", () => {
    for (const postalCode of ["M5V 3A8", "V5H", "V5H BAD", "V5H 4D1", "", "98662"]) {
      // The card puts a known city before the US-code check.
      expect(resolveArea({ name: null, postalCode, city: "Richmond" })).toEqual(known("richmond"));
    }
    expect(resolveArea({ name: null, postalCode: "M5V 3A8" })).toEqual(unknown);
    expect(resolveArea({ name: null, postalCode: "V5H" })).toEqual(unknown);
  });

  it("keeps the existing city aliases, case-insensitively", () => {
    for (const [city, area] of [
      [" n. van ", "north-shore"], ["BOWEN ISLAND", "north-shore"], ["UBC", "vancouver"],
      ["University Endowment Lands", "vancouver"], ["Ladner", "surrey"], ["Tsawwassen", "surrey"],
      ["Anmore", "tri-cities"], ["Belcarra", "tri-cities"], ["Mission", "langley"], ["Chilliwack", "langley"],
    ] as const) expect(resolveArea({ name: null, city })).toEqual(known(area));
  });

  it("recognises Washington or a US ZIP when no earlier rule decides", () => {
    for (const place of [
      { postalCode: "98662" }, { postalCode: " 98662-1234 " },
      { address: "Vancouver, WA" }, { address: "Vancouver, Washington" },
      { address: "Portland, OR 97201" }, { city: "Vancouver, WA" },
    ]) expect(resolveArea({ name: null, ...place })).toEqual(outside);
    expect(resolveArea({ name: null, address: "12345 Main St" })).toEqual(unknown);
  });

  it("distinguishes no place from a place with only a name", () => {
    expect(resolveArea(null)).toEqual({ area: null, check: false, outside: false });
    expect(resolveArea({ name: "Some venue" })).toEqual(unknown);
    expect(resolveArea({ name: null })).toEqual(unknown);
  });
});

it("uses even-odd rings for holes, either winding, and disjoint multipolygons", async () => {
  // Hand-made geometry only for this test; never modify saved fixtures/boundaries.
  const shell = [[-123.2, 49.1], [-123, 49.1], [-123, 49.3], [-123.2, 49.3], [-123.2, 49.1]];
  const hole = [[-123.15, 49.15], [-123.05, 49.15], [-123.05, 49.25], [-123.15, 49.25], [-123.15, 49.15]];
  const island = [[-122.9, 49.1], [-122.8, 49.1], [-122.8, 49.2], [-122.9, 49.2], [-122.9, 49.1]];
  try {
    for (const inner of [hole, [...hole].reverse()]) {
      vi.resetModules();
      vi.doMock("../src/data/boundaries.json", () => ({ default: {
        attribution: boundaries.attribution,
        features: [{ properties: { area: "richmond" }, geometry: { type: "MultiPolygon", coordinates: [[shell, inner], [island]] } }],
      } }));
      const { resolveArea: resolve } = await import("../src/area");
      const point = (lat: number, lon: number): Place => ({ name: null, lat, lon });
      expect(resolve(point(49.12, -123.1))).toEqual(known("richmond"));
      expect(resolve(point(49.2, -123.1))).toEqual(unknown); // hole
      expect(resolve(point(49.15, -122.85))).toEqual(known("richmond")); // other polygon
      expect(resolve(point(49.15, -122.95))).toEqual(unknown); // gap between polygons
      expect(resolve(point(49.1, -123.2))).toEqual(known("richmond")); // vertex
      expect(resolve(point(49.2, -123.2))).toEqual(known("richmond")); // vertical edge
      expect(resolve(point(49.1, -123.1))).toEqual(known("richmond")); // horizontal edge
      expect(resolve(point(49.2, -123.15))).toEqual(known("richmond")); // hole edge
    }
  } finally {
    vi.doUnmock("../src/data/boundaries.json");
    vi.resetModules();
  }
});

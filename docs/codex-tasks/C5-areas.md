# C5: which area a place is in

**Files:** `tools/events/src/area.ts` and a new `tools/events/tests/area.test.ts`.
**Output:** `resolveArea(place: Place | null): { area: Area | null; check: boolean; outside: boolean }`.
Keep `areaOf(place)` working (`src/store.ts` calls it): make it `resolveArea` minus `outside`, or
have the store call `resolveArea` (that's the only line you may change in `src/store.ts`).
**Command:** `npx vitest run tests/area.test.ts`

## Inputs

- `tools/events/src/data/boundaries.json`: the municipalities of the 7 areas as polygons (from
  OpenStreetMap, ODbL: keep its `attribution`), simplified to about 60 m. Each feature has
  `properties.area`. UBC's campus counts as Vancouver.
- `tools/events/tests/fixtures/areas/places.json`: 50 real places geocoded on 2026-10-31: 48 in
  Greater Vancouver with name, address, city, postal code, coordinates and their area; one with no
  place (online, `area: null`); one in Vancouver, **Washington** (`area: "outside"`).

## In this order

1. No place: `{ area: null, check: false, outside: false }`.
2. Coordinates: the polygon it's in (even-odd rule over each ring). In none: outside the box
   49.0 to 49.45 N, 123.3 to 122.2 W is `outside`; inside it, fall through to 3.
3. A Canadian postal code: its first three characters in this table (anything else falls through):
   - vancouver: V5K V5L V5M V5N V5P V5R V5S V5T V5V V5W V5X V5Y V5Z V6A V6B V6C V6E V6G V6H V6J
     V6K V6L V6M V6N V6P V6R V6S V6T V6Z V7X V7Y
   - richmond: V6V V6W V6X V6Y V7A V7B V7C V7E
   - burnaby: V5A V5B V5C V5E V5G V5H V5J V3N
   - surrey (with White Rock and Delta): V3R V3S V3T V3V V3W V3X V3Z V4A V4N V4P V4B V4C V4E V4G
     V4K V4L V4M
   - north-shore: V7G V7H V7J V7K V7L V7M V7N V7P V7R V7S V7T V7V V7W
   - tri-cities: V3B V3C V3E V3H V3J V3K V3L V3M
   - langley (and the Fraser Valley): V1M V2Y V2Z V3A V4W V2W V2X V4R V3Y V2S V2T V3G V4X V2V
     V4S V2P V2R V4Z
4. The city name (the table now in `src/area.ts`).
5. A US state or ZIP code (`WA`, five digits): `outside`.
6. Nothing told: `{ area: "vancouver", check: true, outside: false }` (shown in Vancouver, flagged).

## Done when

- All 50 places resolve to their `area` (`outside` as `outside: true` with `area: null`).
- With their coordinates removed, the 48 Greater Vancouver ones still resolve right (postal code).
- With coordinates and postal code removed, the city decides; a place with only a name: Vancouver,
  `check: true`.
- Resolving all 50 takes under 2 ms.

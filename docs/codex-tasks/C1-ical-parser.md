# C1: the iCal parser (recurrences, overrides, time zones)

**Files:** `tools/events/src/parsers/ical.ts` and a new test, `tools/events/tests/parsers/ical.test.ts`.
**Output:** `parseIcal(text, { source, fromMs, toMs }): NormalizedEvent[]` (keep the signature, and
the exported `plainText` and `placeFromText`, which other parsers use).
**Command:** `npx vitest run tests/parsers/ical.test.ts`

A first version is there (Luma's feed runs through it every morning). It uses ical.js; keep it
(it expands RRULE, EXDATE and RECURRENCE-ID itself: don't add the `rrule` package).

## Inputs (in `tools/events/tests/fixtures/`)

- `ical/edge-cases.ics`: hand-made, one case per event (see its SUMMARY lines), with
  `ical/edge-cases.expected.json`: what must come out, for two windows.
- `ical/ubc-2026-10-31.ics`: UBC's real feed (30 events, 3 all-day, TZID with a VTIMEZONE).
- `luma/vancouver-2026-10-31.ics`: Luma's real Vancouver feed (15 events, UTC times, GEO).

## What it must do

1. **Recurring events**: every date inside the window (at most 60 per event), id `UID@YYYY-MM-DD`
   (the date of the original occurrence). EXDATE removes a date.
2. **Overrides** (a VEVENT with RECURRENCE-ID): replaces the occurrence it names, keeps that
   occurrence's id, with the override's own times, title, place and status. Today the parser
   returns both the original and the override: that's the bug to fix first.
3. **All-day** (`VALUE=DATE`): `start` is the date, `allDay: true`; `end` is the **last day**
   (DTEND is exclusive in iCal, so DTEND minus one day), or null for a one-day event. Today `end` is
   null for multi-day events.
4. **Times**: UTC (`Z`) as is. A TZID the runtime knows (`Intl`): its rules, never the file's
   VTIMEZONE (calendars carry stale ones: edge-cases.ics has the old November change on purpose).
   A TZID the runtime doesn't know: the file's VTIMEZONE. No zone (floating): Vancouver wall-clock.
   Output through `vanIso` / `fromVan` from `src/time.ts`.
5. `DURATION` instead of `DTEND` gives the end. `STATUS:CANCELLED` gives `status: "cancelled"`.
6. `LOCATION` through `placeFromText` (a URL is not a place); `GEO` into `place.lat` / `place.lon`;
   `URL` (or a URL as the location) into `url`. Escaped `\,` `\;` `\n` and folded lines unescaped.
7. `description` through `plainText` (at most 600 characters).

## Done when

- Every entry in `edge-cases.expected.json` matches, for both windows (`windowOf("2026-10-31")`
  and `windowOf("2025-10-25")` from `src/time.ts`): the listed fields equal, nothing extra for a
  recurring event, single events all returned.
- UBC: 30 events; the 3 all-day ones have a date-only `start`; every November 2026 time ends in
  `-07:00`. Luma: still 15 events, and `tests/parsers.test.ts` still passes.
- The UBC file parses in under 5 ms warm (say what you measured).

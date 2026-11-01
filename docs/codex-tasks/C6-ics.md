# C6: the calendar feed (.ics)

**Files:** `tools/events/src/ics.ts` and a new `tools/events/tests/ics.test.ts`.
**Output:** `toIcs(events: PublicEvent[], opts: { name: string; now: Date }): string` (today it
returns null, and `/go/api/events.ics` answers 501 until it doesn't; the route is already wired, with
the same filters as `/go/api/events`, so people can subscribe to a category).
**Command:** `npx vitest run tests/ics.test.ts`

People add What's On to Apple or Google Calendar and it updates by itself. This is also how
Steve checks gate A: ten events in both calendars, every time right.

## Input: `tools/events/tests/fixtures/ics/sample-events.json`

Ten published events: six real, four hand-made for an all-day event over three days, a date with
no time yet, one past midnight whose title has `,` `;` and `"`, and one from before B.C. kept
daylight time (2 November 2025, `-08:00`).

## The file (RFC 5545)

- Lines end in CRLF and are folded at 75 octets of UTF-8 (never inside a character), the next line
  starting with one space. TEXT values escape `\` `;` `,` and newlines (`\n`).
- `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//changle.ca//What's On//ZH`, `CALSCALE:GREGORIAN`,
  `METHOD:PUBLISH`, `X-WR-CALNAME:` the name, `X-WR-TIMEZONE:America/Vancouver`,
  `REFRESH-INTERVAL;VALUE=DURATION:PT6H`, `X-PUBLISHED-TTL:PT6H`.
- Each event: `UID:` id `@changle.ca`; `DTSTAMP:` its `updatedAt` in UTC; `SUMMARY:` the title;
  `URL:`; `LOCATION:` venue and address; `CATEGORIES:` the category if any;
  `DESCRIPTION:` the Chinese summary, the English summary, the link, "来源 Source:" and the source
  name (lines that exist, joined by newlines).
- **Times in UTC** (`DTSTART:20261102T153000Z`), from the event's instant: no VTIMEZONE at all. A
  calendar then can't be wrong about Vancouver's rules (B.C. changed them in 2026). No end: two hours.
- **All-day**: `DTSTART;VALUE=DATE:` the date; `DTEND;VALUE=DATE:` the day after its last day. Time
  not known yet: all-day, and "时间待定 · Time to be announced" as the description's first line.

## Done when

- ical.js reads the output back, and for all ten events the start and end (instants, or dates for
  all-day) equal the input's; the 2025 event starts at 18:00 UTC.
- No line is longer than 75 octets; the hand-made title comes back exactly as it went in.
- `GET /go/api/events.ics?cat=family` (through the worker, after a run on the saved feeds as in
  `tests/run.test.ts`) answers `text/calendar` with only family events.
- Then Steve's check for gate A: subscribe in Apple and Google Calendar, ten events, all right.

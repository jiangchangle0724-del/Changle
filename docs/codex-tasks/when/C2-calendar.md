# when-C2: add to calendar (.ics and a Google Calendar link)

**Files:** `tools/when/src/engine/ics.ts` (new) and `tools/when/tests/ics.test.ts` (new).
**Command:** `npx tsx --test tests/ics.test.ts`

Once the host sets the time, everyone gets a button that puts the gathering into their phone's
calendar. An iPhone opens the .ics file; Android and anyone on Google Calendar use the link. 玩什么
has a calendar feed already (`tools/events/src/ics.ts`, card `docs/codex-tasks/C6-ics.md`): read it
for the format rules, but write this one on its own (different folder, one event, no feed).

## Output

```ts
import type { Day, Part } from "./types";

/** What was set. */
export type CalendarEntry = {
  /** the gathering's 8-character code, as in its address */
  code: string;
  /** its name, as the host typed it: any characters, up to 40 */
  title: string;
  day: Day; // "2026-11-21", a Vancouver calendar day
  part: Part; // "am" | "pm" | "eve" | "day"
  /** when it was set, in milliseconds */
  setAt: number;
};

/** The whole .ics file. */
export function toIcs(entry: CalendarEntry): string;
/** A link that opens Google Calendar with the event filled in. */
export function googleCalendarUrl(entry: CalendarEntry): string;
```

The hours of each part are in `src/engine/slots.ts` (`PART_HOURS`): morning 9:00 to 12:00, afternoon
13:00 to 17:00, evening 18:00 to 22:00, Vancouver time; `"day"` is the whole day. Turn them into
instants with `src/engine/time.ts`. Don't write the hours or the offset out again.

## The file (RFC 5545)

- Lines end in CRLF and are folded at 75 octets of UTF-8 (never inside a character), the next line
  starting with one space. TEXT values escape `\` `;` `,` and newlines (`\n`).
- `BEGIN:VCALENDAR`, `VERSION:2.0`, `PRODID:-//changle.ca//When Works//ZH`, `CALSCALE:GREGORIAN`,
  `METHOD:PUBLISH`, then one `VEVENT`.
- `UID:` the code `@when.changle.ca`; `DTSTAMP:` `setAt` in UTC; `SUMMARY:` the title;
  `URL:https://changle.ca/when/` the code; `DESCRIPTION:` two lines, `约时间定的 · Set with When Works`
  and the same address.
- **A part of a day: times in UTC** (`DTSTART:20261122T010000Z` for the evening of 21 November),
  no VTIMEZONE at all. A calendar then can't be wrong about Vancouver's rules (B.C. changed them
  in 2026).
- **The whole day**: `DTSTART;VALUE=DATE:20261121` and `DTEND;VALUE=DATE:20261122` (the day after).

## The link

`https://calendar.google.com/calendar/render?action=TEMPLATE` with `text` (the title), `dates`
(`20261122T010000Z/20261122T050000Z`, or `20261121/20261122` for the whole day) and `details` (the
same two lines as the description), each value URL-encoded.

## Done when

- The test has one entry per part (`am`, `pm`, `eve`, `day`) on 2026-11-21 and one on 2027-01-09
  (winter, still UTC-7), and checks each start and end exactly: the evening of 2026-11-21 starts at
  `20261122T010000Z` and ends at `20261122T050000Z`.
- A title with `,` `;` `"` a backslash and Chinese characters, 40 characters long, comes back
  exactly as it went in after unfolding and unescaping; no line is longer than 75 octets.
- The Google link for the same five entries has the right `dates` and decodes to the same title.
- `npm run typecheck` and `npm test` pass.
- Then Steve's check on his own phone: the file opens in Apple Calendar and the link in Google
  Calendar, on the right day at the right hours.

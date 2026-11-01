# C3: Ticketmaster (categories, statuses, prices)

**Files:** `tools/events/src/parsers/ticketmaster.ts` and a new `tools/events/tests/parsers/ticketmaster.test.ts`.
**Output:** `parseTicketmaster(page: TmPage, source: string): { events: NormalizedEvent[]; more: boolean }`
(keep the signature and `tmCategory`).
**Command:** `npx vitest run tests/parsers/ticketmaster.test.ts`

A first version is there; it isn't running yet (the key isn't set). Make it right before it does.

## Inputs: `tools/events/tests/fixtures/ticketmaster/`

- `vancouver-handmade-p0.json`: **hand-made** in the Discovery API's shape (there's no key yet to
  save a real Vancouver page): seven events, one per case below. Claude adds a real page as a second
  fixture once the key is set.
- `docs-example.json`: the real example response from Ticketmaster's documentation (one event).

## Rules

| Ticketmaster | `status` |
| --- | --- |
| onsale | scheduled |
| offsale | soldout |
| cancelled, canceled | cancelled |
| postponed | postponed |
| rescheduled | rescheduled |

The categories are defined in `CONTRACTS.md` (a music festival is a concert: `shows`).

| Segment | Genre | `category` |
| --- | --- | --- |
| Music | any (Festival too) | shows |
| Sports | any | outdoors |
| Arts & Theatre | Children's Theatre, Family, Circus & Specialty Acts | family |
| Arts & Theatre | Fine Art, Film | arts |
| Arts & Theatre | anything else (Comedy, Theatre, Musical, Dance, Opera, Magic & Illusion, ...) | shows |
| Film | any | arts |
| Miscellaneous | Family | family |
| Miscellaneous | Fairs & Festivals | festivals |
| Miscellaneous | Food & Drink | food |
| anything else, or "Undefined" | | null (left to the AI) |

- **Time**: `dates.start.dateTime` (UTC) through `vanIso`. When `dateTBA`, `dateTBD`, `timeTBA` or
  `noSpecificTime`, or there's no `dateTime`: `start` is `localDate`, `allDay: true`, `timeTBD: true`.
- **Price**: CAD ranges only; `priceMin` the lowest `min`, `priceMax` the highest `max`. A range
  of 0 to 0 means "not given" on Ticketmaster: unknown (null), never free. Another currency only:
  null.
- **Place**: the first venue: name, `address.line1`, `city.name`, `postalCode`, `location`
  latitude and longitude as numbers.
- **Image**: the widest `16_9`; none, null. **Tags**: `tickets` only. `lang: "en"`.
- **`more`**: `page.number + 1 < page.totalPages`.

## Done when

The seven hand-made events come out as follows (and the rest of each by the contract):

| id | status | category | start | price |
| --- | --- | --- | --- | --- |
| Z7r9jZ1A7aaa1 (Canucks) | scheduled | outdoors | 2026-11-07T19:00:00-07:00 | 89 to 420 |
| Z7r9jZ1A7aaa2 (SYML) | soldout | shows | 2026-11-05T19:00:00-07:00 | 45.5 |
| Z7r9jZ1A7aaa3 (Matt Rogers) | rescheduled | shows | 2026-11-09T20:00:00-07:00 | null |
| Z7r9jZ1A7aaa4 (Paw Patrol) | cancelled | family | 2026-11-08T11:00:00-07:00 | 32 to 120 |
| Z7r9jZ1A7aaa5 (music festival) | postponed | shows | 2026-11-12, all-day, time TBD | null |
| Z7r9jZ1A7aaa6 (symphony, USD) | scheduled | shows | 2026-11-13T19:30:00-07:00 | null, no image |
| Z7r9jZ1A7aaa7 (Giants, 0 to 0) | scheduled | outdoors | 2026-11-10T19:00:00-07:00 | null, `isFree` null |

`more` is true. The docs example: one event, `soldout`, `outdoors`, start `"2016-03-06"`,
all-day with `timeTBD`. `tests/parsers.test.ts` still passes.

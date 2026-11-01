# C12: Burnaby Public Library's own feed

Burnaby's library isn't on BiblioCommons (`bpl` there is Boston's). It lists its programs at
`https://bpl.bc.ca/events.json`. This card reads that feed; Claude Code adds the source to
`src/sources.ts` once it's merged.

**Files:** a new `tools/events/src/parsers/bpl.ts`, a new `tools/events/tests/parsers/bpl.test.ts`,
and in `tools/events/src/parsers/bibliocommons.ts` only the word `export` in front of
`function categoryOf` (the libraries share one category rule).
**Output:** `parseBpl(feed: BplFeed, source: string): NormalizedEvent[]`, with `BplFeed` the type of
the feed as far as you read it.
**Command:** `npx vitest run tests/parsers/bpl.test.ts`

## Input: `tools/events/tests/fixtures/bpl/events-2026-11-01.json`

The real feed, fetched on 2026-11-01 (220 KB): `data` holds 253 programs, `meta` the site's lists
(ignore it). 140 are `"group": "past"`; the other 113 run from 3 November to 31 December. No
program has an end time. Two are cancelled (both on 19 December at McGill), two are online, and
five are in Cantonese or Mandarin.

## How to read a program

- **When.** `startDate.date` (`"2026-11-03 00:00:00.000000"`) gives the day. `startTime.date`
  (`"2026-05-12 11:00:00.000000"`) gives the time of day; its date is the series' first and
  doesn't count. The start is that day at that time, **Vancouver wall-clock** through
  `src/time.ts`. Both carry `"timezone": "America/Los_Angeles"`: ignore it. B.C. kept UTC-7 and Los
  Angeles went to UTC-8 on 1 November, so reading the label puts every program from November on an
  hour late. `startDisplayTime` (`"11:00am"`) is the same time in words: your test checks every
  program against it. `end`: null. `allDay`, `timeTBD`: false.
- **Skip** `"group": "past"`.
- **Status.** `eventStatus`: `""` scheduled, `"cancelled"`, `"rescheduled"`.
- **Where.** `location[0].slug`, one of these four branches, or `online` (`online: true`,
  `place: null`):

  | slug | name | address | city | postal code |
  | --- | --- | --- | --- | --- |
  | `bob-prittie-metrotown` | Bob Prittie Metrotown | 6100 Willingdon Avenue | Burnaby | V5H 4N5 |
  | `tommy-douglas` | Tommy Douglas | 7311 Kingsway | Burnaby | V5E 1G8 |
  | `mcgill` | McGill | 4595 Albert Street | Burnaby | V5C 2G6 |
  | `cameron` | Temporary Cameron | 110 - 9855 Austin Avenue | Burnaby | V3J 1N4 |

  No coordinates (`lat`, `lon` null). Another slug: `place` with that `title` as its name and the
  rest null.
- **What.** `type[].title` and `audience[].title` (in that order) are `sourceCategories`; the
  category is `categoryOf(types, audiences)` from `bibliocommons.ts`.
- **Language and tags,** as `parseBiblioCommons` does it: from `language[].title`, Cantonese or
  Mandarin is Chinese; with no English listed, `lang` is `"zh"`; no `language`, `"en"`. Tags:
  `free` always, `kids` for a Children audience, `chinese` for a Chinese one, `indoor` unless
  online.
- **The rest.** `sourceEventId`: the last part of `url` (`"smartphone-tips-and-tricks-november-3"`).
  `url` as given. `title` trimmed. `description` and `imageUrl` null. `organizer`: the branch's
  name (null online), as the BiblioCommons parser does. Price: `priceMin` 0, `priceMax` 0,
  `isFree` true.

## Done when

- 113 programs come out; none is past.
- Every start ends in `-07:00`, and its time matches `startDisplayTime` for all 113.
- "Smartphone Tips and Tricks", 3 November: start `2026-11-03T11:00:00-07:00`, end null, at Bob
  Prittie Metrotown, 6100 Willingdon Avenue, Burnaby, V5H 4N5; category null; tags
  `["free", "indoor"]`; `lang` `"en"`.
- "Family Storytime", 3 November (Temporary Cameron): category `family`, tags include `kids`.
- "廣東話故事時間 | Cantonese Storytime for Toddlers": `lang` `"zh"`, tags include `chinese` and
  `kids`.
- The two on 19 December at McGill ("Newcomer Drop-In", "English Reading Circle") are `cancelled`.
- The two online programs have `online: true` and `place: null`.
- Parsing the whole file takes under 3 ms warm (say what you measured).
- `tests/parsers.test.ts` still passes.

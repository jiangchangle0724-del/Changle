# C2: events from a page's JSON-LD (schema.org/Event)

**Files:** a new `tools/events/src/parsers/jsonld.ts` and `tools/events/tests/parsers/jsonld.test.ts`.
**Output:** `parseJsonLd(html: string, opts: { source: string; pageUrl: string }): Promise<NormalizedEvent[]>`
**Command:** `npx vitest run tests/parsers/jsonld.test.ts`

Venue sites, Eventbrite and Meetup put their events in the page as JSON-LD for Google. Reading
that is sturdier than reading the page: it survives redesigns.

## Inputs: `tools/events/tests/fixtures/jsonld/`

Ten real pages from 2026-10-31, trimmed to their title, canonical and og links and their JSON-LD
scripts: the Commodore Ballroom's home page (25 MusicEvents, times **without an offset**),
Eventbrite's Vancouver listing (32 events, **dates only**), four Eventbrite event pages, three
Meetup event pages (one **online**: a VirtualLocation), and a UBC event page (an **@graph**, a
"series" from July to December with times 00:00 to 23:59:59). `expected.json` says how many events
each page has and what its first one says.

## What it must do

1. Find the scripts with the built-in `HTMLRewriter` (it streams a `Response`, hence the Promise):
   `script[type="application/ld+json"]`, text collected across chunks. A script that isn't valid
   JSON is skipped, not fatal.
2. Walk what's inside: an object, an array, `@graph`, an `ItemList`'s `itemListElement[].item`,
   `subEvent`. An event is anything whose `@type` (a string or an array) is `Event`, ends in `Event`
   (MusicEvent, SocialEvent, FoodEvent, EducationEvent, TheaterEvent, ...) or is `Festival`.
3. Map to `NormalizedEvent` by the contract:
   - `startDate` / `endDate`: with an offset, as that instant (`vanIso`); without one, Vancouver
     wall-clock (`fromVan`); a date only, `allDay: true` and `timeTBD: true`. 00:00 to 23:59(:59)
     over whole days is all-day, with `end` the last day.
   - `eventStatus` (`https://schema.org/EventCancelled`, `EventPostponed`, `EventRescheduled`,
     `EventScheduled`, also without the URL) to `status`; an offer with
     `availability` SoldOut makes it `soldout`.
   - `location`: a `Place` with a `PostalAddress` (streetAddress, addressLocality, postalCode,
     geo) to `place`; a `VirtualLocation` (or `eventAttendanceMode` Online) to `online: true`, no place.
     Mixed attendance, or a Place listed next to a VirtualLocation: `online: true` and the place.
     A text location is a place only if it has a digit or a comma; text naming online, virtual,
     zoom or webinar means `online: true`.
   - `offers` (an object or an array): `price`, or `lowPrice` / `highPrice`, numbers or strings, in
     CAD only (another `priceCurrency`: unknown); a price of 0 makes `isFree: true`.
   - `url`: the event's own, or `pageUrl`. `sourceEventId`: the url without its query string,
     then `@` and the Vancouver date (`…@2026-12-18`), even for an event with one date, so the id
     stays the same when other dates drop off the page. When one url has several start times on one
     day, that day's ids carry the time (`…@2026-12-18T14:00:00`; an all-day one keeps the date).
     When the url is the page's own, a short hash of the title (whitespace collapsed) goes into the
     id too, and the several-times rule counts only the events with that title. The query string
     comes off only before a `#` fragment.
   - `image`: a string, an array or an ImageObject (`url`): the first. `organizer.name`.
   - `name` and `description` with HTML entities decoded; `description` through `plainText`.
   - `category` and `tags`: leave empty (the AI's job) except `online` and `free` facts above.

## Done when

- Each page gives the number of events in `expected.json` (every entry, exact repeats too: they
  share an id, so the store keeps one row), and its first event's fields match
  (after mapping: e.g. Commodore's first starts `"2026-10-31T19:00:00-07:00"`; the listing's first
  is all-day with `timeTBD`; the Meetup online one has `online: true` and no place).
- The UBC series comes out all-day, `start: "2026-07-19"`, `end: "2026-12-08"`.
- The Commodore page parses in under 5 ms warm.

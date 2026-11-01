# 玩什么 · What's On: the contracts

Read this and your task card; not the whole plan. The plan is `docs/whats-on-v2.md` (Steve's
brief); where this file and the brief differ, this file says how the brief is being done.

## What it does

Every morning at 06:00 Vancouver time a scheduled run reads Greater Vancouver's events for the next
14 days from each source, stores them in D1, and publishes one JSON to KV. The page and the API
read only that JSON. Nothing is ever fetched while someone waits.

## The free plan, and what it means for the code

The Worker runs on Cloudflare's free plan (Steve's decision, Oct 31). Per invocation that is
10 ms of CPU (waiting on the network doesn't count), 50 D1 queries and 50 outside fetches; per day,
1,000 KV writes and 100,000 requests. So:

- **A run is many small steps.** The scheduled handler (`src/worker.ts`) calls `runDay`
  (`src/run.ts`), which calls each step through `ctx.exports.Steps`, a request of its own with its
  own 10 ms. One step = one part (a page) of one source: fetch, keep the raw answer, parse, store.
  Then one publish step. At most 31 calls a run (Cloudflare allows 32 invocations per request).
- **A step stays well under 10 ms of CPU.** Measure a parser on its biggest saved page: at most
  about 5 ms warm. Page sizes are chosen for that (the library: 25 events a page).
- **One statement per table per step.** Rows go to D1 as one JSON parameter through `json_each`
  (`src/store.ts`), whatever the count.

## Types (`src/types.ts`)

- `NormalizedEvent`: one event as a parser hands it over. Facts from the source only; nothing
  guessed (unknown is `null`). A recurring event is one per date, within the run's window.
- `Venue`, `Source`, `FetchLog`, and what's published: `PublicEvent`, `Published`.
- The lists: `CATEGORIES` (8), `AREAS` (7), `TAGS` (9). Never add values outside them.

Fields follow schema.org/Event: `start`/`end` = startDate/endDate, `status` = eventStatus,
`place` = location, `priceMin`/`priceMax`/`isFree` = offers, `organizer`.

## Rules every parser keeps

1. **Times** are Vancouver wall-clock with that day's offset: `"2026-11-01T19:30:00-07:00"`
   (`vanIso` in `src/time.ts`). All-day: the date only, `"2026-11-01"`, `allDay: true`. Date known,
   time not: the date, `allDay: true`, `timeTBD: true`. Local times without an offset (a library's
   `"2026-11-01T10:15"`) go through `fromVan`. Never a fixed offset: B.C. has kept daylight time
   all year since 8 March 2026 (UTC-7), but the time-zone database decides, so older dates
   (with the November change) still read right.
2. **Ids**: `sourceEventId` is the source's own id (Ticketmaster id, iCal UID, the library's id);
   for a recurrence, `UID@YYYY-MM-DD`. The stored id is `source:sourceEventId`, the same every day.
3. **The title** stays as the source has it. **The description** is plain text, at most 600
   characters (`plainText`), for the AI only; it is never shown.
4. **Status**: `scheduled | cancelled | postponed | rescheduled | soldout`. Cancelled events are
   stored (so they come off the page) and never published.
5. **Price** in CAD. `isFree: true` only when the source says the price is 0 (a library program).
6. **Category** only by a rule from the source's own labels (Ticketmaster segment and genre, a
   library's types and audiences); otherwise `null`, for the AI. **Tags** only what the source
   makes certain (free, kids, chinese, newcomers, indoor, tickets). "featured" is Steve's alone.
7. **Place**: name, address, city, postal code, coordinates, as given. The area is worked out from
   the place (`src/area.ts`, by city now; task C5: postal codes and boundaries), never guessed by AI.
   Can't tell: Vancouver, flagged `areaCheck`.
8. **Parsers are pure**: `(raw text, part, window) => { events, more }`. No fetching, no storage,
   no clock (the window is passed in). Every parser has saved real responses in
   `tests/fixtures/<kind>/` and tests that read them. Tests never use the network.

## Storage

D1 (`migrations/0001_init.sql`; the Worker applies new migration files itself, `src/schema.ts`):
`events`, `venues`, `sources`, `fetch_log`, `review_queue`. Never edit a migration that has gone
out; add the next number and list it in `src/schema.ts`.

KV: `events:live` (the published `Published`), `raw:<runId>:<source>:<part>` (the raw answer of
every step, kept 30 days: rerun a parser without fetching again).

What decides what's published (`src/publish.ts`): in the window, not cancelled, live, not a merged
duplicate, and seen at its source today, or its source failed today (then yesterday's stand). If a
run has under half of yesterday's events, yesterday's stay up and the log says so.

## The API

- `GET /go/api/events?from=YYYY-MM-DD&to=YYYY-MM-DD&cat=a,b&area=x,y&tag=free,kids`
- `GET /go/api/status`: the last run step by step (the fetch log) and what's published.

## Adding a source

An entry in `src/sources.ts` (id, name, kind, tier, url, how to ask for a part, how to read it,
how many parts at most), a parser in `src/parsers/`, a saved real response in `tests/fixtures/`,
tests. Be a good guest: the `USER_AGENT` in `src/run.ts`, official feeds and APIs first, robots.txt
respected, at most one request a second to a site, never Facebook, Instagram, WeChat or Xiaohongshu.

## Commands (in `tools/events`, Node 22)

- `npm ci`, `npm run typecheck`, `npm test` (Vitest inside the Workers runtime)
- `npm run dev`: the Worker locally; then `curl "http://127.0.0.1:8787/__scheduled?cron=0+13,14+*+*+*"`
  runs a morning run at once, and `/go/api/status` shows its fetch log.
- `npm run types` after changing `wrangler.jsonc`.

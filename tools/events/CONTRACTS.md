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
  Then one publish step. At most 31 calls a trigger (Cloudflare allows 32 invocations per request):
  30 steps and publish.
- **A morning has three triggers**, at 06:00, 06:20 and 06:40 (one cron). Each goes on where the
  last stopped (table `runs`: the next source and part), so a run has room for 90 steps. It
  publishes once every source is done; the 06:40 trigger publishes whatever it has, and sources not
  reached that day keep yesterday's events. Today (1 November) a run is 22 steps.
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

## The 8 categories and the 7 areas

One definition for everyone: the parsers' rules, the AI (task A3) and the golden set. Each event is
in exactly one category.

| `category` | 中文 | English | What belongs |
| --- | --- | --- | --- |
| `social` | 社交聚会 | Social & Meetups | language exchanges, conversation circles, board-game nights, industry and tech meetups, singles events |
| `shows` | 演出音乐 | Concerts & Shows | concerts (music festivals too), plays, musicals, comedy, dance, opera |
| `food` | 吃喝市集 | Food & Markets | night markets, food festivals, farmers' markets, tastings |
| `outdoors` | 户外运动 | Outdoors & Sports | hikes, skiing, runs, games to watch, sports to play |
| `arts` | 文化展览 | Arts & Culture | museums, exhibitions, talks, author events, book clubs, films and film festivals |
| `festivals` | 节日庆典 | Festivals & Holidays | fireworks, light shows and lantern festivals, Lunar New Year, Diwali, Christmas markets |
| `family` | 亲子家庭 | Family & Kids | made for children or families: storytimes, kids' workshops, children's shows, farm visits |
| `nightlife` | 夜生活派对 | Nightlife & Parties | bar events, club nights, parties, theme nights |

When two fit: made for children decides `family` first; then what people mainly do there (a band's
concert is `shows`, a DJ night at a club `nightlife`; a Christmas market is `festivals`, not `food`).
Practical help (tax clinics, job search, tech help) fits none: an open question for task A3.

The area is the venue's municipality: `vancouver` the City and UBC's campus (温哥华市); `richmond`
(列治文); `burnaby` (本拿比); `surrey` with White Rock and Delta (素里及白石); `north-shore` North
Vancouver city and district, West Vancouver (北岸); `tri-cities` Coquitlam, Port Coquitlam, Port
Moody, New Westminster (三联市及新西敏); `langley` Langley city and township, Maple Ridge, Pitt
Meadows, the Fraser Valley (兰里及菲沙河谷).

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
8. **Parsers are pure**: `(raw text, part, window) => { events, more }`, or a Promise of it (the
   JSON-LD one uses HTMLRewriter, which streams). No fetching, no storage, no clock (the window is
   passed in). Every parser has saved real responses in `tests/fixtures/<kind>/` and tests that
   read them. Tests never use the network.

## Storage

D1 (`migrations/`; the Worker applies new migration files itself, `src/schema.ts`): `events`,
`venues`, `sources`, `fetch_log`, `review_queue`, and `runs` (how far each morning's run has got).
Never edit a migration that has gone out; add the next number and list it in `src/schema.ts`.
Each `fetch_log` row says how its step got its answer: `via` is `fetch` or `handoff` (below), and
`note` why, in a few words.

KV: `events:live` (the published `Published`), `raw:<runId>:<source>:<part>` (the raw answer of
every step, kept 30 days: rerun a parser without fetching again), `handoff:<date>:<source>:<part>`
(a library's page handed over for that day's run, kept 2 days).

## The libraries' hand-over

Vancouver's and Richmond's libraries (BiblioCommons) answer the Worker 403 since 2 November, and
200 to the same request from anywhere else; such a source has `handoff: true` (`src/sources.ts`).
At 05:50 Vancouver time a GitHub job (`.github/workflows/events-libraries.yml`, `scripts/libraries.ts`)
reads their pages with the run's own requests (`requestOf`, `nextPart`: the same URLs, headers and
paging; it asks again after a 5xx) and posts each page to `POST /go/api/handoff`. A step of such a
source reads today's page from KV and parses it like a fetched one; only for a page nothing came for
does it fetch, and its `note` says so. One page a request, as one page is one step: the free plan's
10 ms. The code for both ends is `src/handoff.ts`.

The job signs in with GitHub Actions' own OIDC token (`src/oidc.ts`), so no secret is set anywhere.
It asks the runner for a token with the audience `changle-events-handoff` (the workflow has
`permissions: id-token: write`), one for each library, just before handing its pages over. The Worker
takes a token only when all of these hold:

- the header's `alg` is `RS256` (anything else, `none` and `HS256` included, is refused first), and
  the signature checks out with the key its `kid` names in GitHub's JWKS
  (`https://token.actions.githubusercontent.com/.well-known/jwks`, kept an hour in memory and in KV;
  an unknown `kid` makes the Worker fetch it again, at most once a minute; KV is only written after a
  token has passed);
- `iss` is `https://token.actions.githubusercontent.com` and `aud` is `changle-events-handoff`;
- `exp` is in the future, `iat` and `nbf` (when there) are not, a minute either way for clocks;
- `repository_id` is `1431750616` and `repository_owner_id` is `332761129` (numbers that survive
  renames; a fork has its own);
- `ref` is `refs/heads/main`, and `workflow_ref` ends with
  `/.github/workflows/events-libraries.yml@refs/heads/main`;
- `event_name` is `schedule` or `workflow_dispatch`.

A key (`EVENTS_HANDOFF_KEY`) still works when the Worker has one, for runs outside GitHub: the
script sends it instead of a token when it's set.

What decides what's published (`src/publish.ts`): in the window, not cancelled, live, not a merged
duplicate, and seen at its source today, or its source wasn't read to the end today (then what it
listed before stands). A source is read to the end once its last page is read and every page
before it was (`sources.last_ok_run`, set by the step of its last page, `src/run.ts`): when page 3
of 12 fails, the events of pages 3 to 12 stay up from yesterday, not just pages 1 and 2. If a run
has under half of yesterday's events, yesterday's stay up and the log says so.

## The API

- `GET /go/api/events?from=YYYY-MM-DD&to=YYYY-MM-DD&cat=a,b&area=x,y&tag=free,kids`
- `GET /go/api/events.ics` with the same filters: a calendar to subscribe to (`src/ics.ts`, task C6).
- `GET /go/api/status`: the last run step by step (the fetch log) and what's published.
- `GET /go/preview`: what's published, day by day, with the same filters as links (`?lang=en` for
  English). Not linked from anywhere, `noindex`: for checking the run until the page (C7) exists.
- `POST /go/api/handoff?source=vpl&date=YYYY-MM-DD&part=N`, `Authorization: Bearer <GitHub's OIDC token>`
  (or `<EVENTS_HANDOFF_KEY>`, when the Worker has one), the page as the body: the GitHub job only.
  The job uses the Worker's own address (`https://changle-events.jiangchangle0724.workers.dev`):
  changle.ca's bot protection challenges GitHub's machines. On that address every other path is 404.
  401 without a token that passes every check above, or the key, saying which check failed
  (`GitHub token: wrong ref`, `wrong key`, ...; never anything of the credential); 503 while GitHub's
  keys can't be fetched; 400 for another source, a date that isn't today in Vancouver, a part out of
  range or a body that isn't an events page; 413 over 2 MB; otherwise kept (200), replacing that
  day's page.

## The golden set (黄金集)

The answer key gate A is scored against: 40 real events labelled by hand by Claude from the
sources the pipeline reads or will (`G01` to `G40`), in `golden/golden.csv`. The plan had 20 more
from Steve (Chinese community events); on 1 November he decided the 40 are enough. Rows added later
go on from `G41`. Every value comes from the event's own page, read by a person, never from the
pipeline. The events are dated within three weeks of labelling; once most have passed, a new set is
labelled the same way.

| Column | What |
| --- | --- |
| `id` | `G01` to `G40` (later rows go on from `G41`) |
| `by` | `claude` or `steve` |
| `kind` | how the pipeline reads its source: `ticketmaster`, `ical`, `bibliocommons`, `jsonld`, or `submitted` (an organiser's calendar or the form) |
| `source` | the site, short: `ticketmaster`, `luma`, `vpl`, `eventbrite`… |
| `url` | the event's own page at that source |
| `title` | as the page has it |
| `start`, `end` | Vancouver time, `YYYY-MM-DD HH:MM`; the date only when all-day or no time is given (`notes` says which); `end` blank when none is given |
| `status` | `scheduled`, `cancelled`, `postponed`, `rescheduled` or `soldout` |
| `venue`, `address` | as the page gives them; `address` is `number street, city` |
| `area`, `category` | one of the 7 and one of the 8 above |
| `price` | CAD before fees: `0` free, `25`, `25-60`; blank when not given |
| `same_as` | the row it's the same event as, in another source (the second of a pair names the first) |
| `notes` | for people: "no time given", "same show, other night: G12" |

The set holds pairs of the same event in two sources (they must end up as one event) and look-alike
pairs that are different events (the same show on two nights, one program at two branches; they
must not be merged).

Scoring (task C9; every night after the run, task A6): a row matches the stored event with the same
`url` (host in lowercase, no query string or trailing slash, `lu.ma` the same as `luma.com`). For
each matched row: the date is right when `start` is equal to the minute (a date-only row: the same
date, all-day or time TBD); the venue is right when the street number and street name match
(ignoring Street/St and the like), or, with no golden address, the venue's name; then the area and
the category. Merges: a false merge is a row merged with one it isn't `same_as`, over all matched
rows; a missed merge is a row not merged with its `same_as` partner, over the rows that have one.
Gate A: date ≥ 95%, venue ≥ 95%, category ≥ 90%, area ≥ 95%, false merges < 1%, missed merges < 5%.
Rows not found are listed; rows whose source isn't read yet are counted apart (coverage, not
accuracy).

## Work in progress

The task cards for the parts Codex builds are in `docs/codex-tasks/` (C1 to C6), each with its
saved inputs in `tests/fixtures/`.

## Adding a source

An entry in `src/sources.ts` (id, name, kind, tier, url, how to ask for a part, how to read it,
how many parts at most), a parser in `src/parsers/`, a saved real response in `tests/fixtures/`,
tests. Be a good guest: the `USER_AGENT` in `src/sources.ts`, official feeds and APIs first, robots.txt
respected, at most one request a second to a site, never Facebook, Instagram, WeChat or Xiaohongshu.

## Commands (in `tools/events`, Node 22)

- `npm ci`, `npm run typecheck`, `npm test` (Vitest inside the Workers runtime)
- `npm run dev`: the Worker locally; then `curl "http://127.0.0.1:8787/__scheduled?cron=0+13,14+*+*+*"`
  runs a morning run at once, and `/go/api/status` shows its fetch log.
- `npm run types` after changing `wrangler.jsonc`.
- `npm run libraries -- --dry-run`: read the libraries' pages as the GitHub job does, and print the
  counts; nothing is sent. (Behind a proxy, Node's fetch needs `NODE_USE_ENV_PROXY=1`.)

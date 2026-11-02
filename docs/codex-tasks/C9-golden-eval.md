# C9: score the pipeline against the golden set

The golden set (`tools/events/golden/golden.csv`, its contract in `tools/events/CONTRACTS.md`, "The
golden set") is gate A's answer key. This card scores what the pipeline stored against it: the
same function runs from the command line now and every night in the Worker later (task A6).

**Files:** a new `tools/events/src/eval.ts` (pure: no `fetch`, no `fs`, no D1), a new
`tools/events/scripts/eval.ts` (the command), a new `tools/events/tests/eval.test.ts`, and in
`tools/events/package.json` the script `"eval": "tsx scripts/eval.ts"` with `tsx` `4.23.15` as a
dev dependency (and its `package-lock.json`).
**Output:** `parseGolden(csv: string): GoldenRow[]`, `score(golden: GoldenRow[], stored: StoredEvent[], read: string[]): EvalReport`,
`formatReport(r: EvalReport): string`, and `readSources(sourceIds: string[]): string[]`.
**Command:** `npx vitest run tests/eval.test.ts`

## Inputs

- `tools/events/golden/golden.csv`: 40 rows (`G01` to `G40`), the whole set (Steve, 1 November;
  rows added later go on from `G41`). RFC 4180: a field in double quotes may hold commas and
  doubled quotes `""`; no line breaks inside a field. Columns as in the contract; `same_as` to
  `sameAs` in `GoldenRow`.
- `tools/events/tests/fixtures/eval/stored-handmade.json`: **hand-made** (see its `_note`): the
  shape `wrangler d1 execute --json` prints for the query below, `{ results: StoredEvent[] }`: 23
  stored events for the rows of six sources, with deliberate mistakes, and three that aren't in
  the set.

```ts
interface StoredEvent {
  id: string; source: string; url: string; title: string;
  start_at: string;          // "2026-11-10T17:30:00-07:00", or "2026-11-12" when all-day
  all_day: number | boolean; time_tbd: number | boolean;
  venue_name: string | null; venue_address: string | null; // "number street", no city
  venue_area: string | null; category: string | null;
  duplicate_of: string | null; // merged into that event
}
```

## The rules (the contract's "Scoring", made exact)

1. **Which rows count.** `read`: the golden `source` names the pipeline reads. A row whose source
   isn't in `read` isn't scored: it's counted in `unread` by source. `readSources(ids)` turns the
   pipeline's source ids (`SOURCES` in `src/sources.ts`) into golden names: `luma-vancouver` is
   `luma`, every other id is its own name.
2. **Matching a row.** Compare URLs normalised: host lowercase, `lu.ma` the same as `luma.com`, no
   query string or fragment, no trailing slash, the path as it is. Several stored events with
   that URL (a venue whose listing page is its only page, like the Commodore): the one starting on
   the row's date; still several, the first. None: the row is `notFound`.
3. **Date** right: a row with a time (`2026-11-10 17:30`) when the stored start is the same
   date and minute and not all-day; a date-only row when the stored start is that date and the
   event is all-day or its time is TBD.
4. **Venue** right: with a golden `address`, when the street keys are equal; without one, when
   the venue names are equal (lowercase, letters and digits only, single spaces). The **street
   key** of an address: the part before the first comma, lowercase; a unit written `#108` or
   `#201` dropped; a unit before a dash dropped (`100-7700 Minoru Gate` is 7700); then the number
   and the street's words, with `e w n s` read as `east west north south` and these dropped:
   `street st avenue ave road rd boulevard blvd drive dr place pl way lane ln court ct crescent
   cres gate highway hwy mall`. So `336 E 1st Ave #108, Vancouver` and `336 East 1st Avenue` are
   both `336` `east 1st`. No number: not equal.
5. **Area** and **category** right: equal strings (`venue_area`, `category`).
6. **Merges.** Two stored events are merged when following `duplicate_of` from each (stop at a
   missing id or a loop) ends at the same event. Among the matched rows: a **false merge** is a
   row merged with another matched row that isn't its `same_as` partner (`same_as` works both
   ways), counted over all matched rows; a **missed merge** is a row not merged with its `same_as`
   partner, counted over the matched rows whose partner is matched too.
7. **Percentages** to one decimal place. A metric with nothing to count is `null` (n/a).
8. **Gate A** passes when every metric is measured and date ≥ 95%, venue ≥ 95%, category ≥ 90%,
   area ≥ 95%, false merges < 1%, missed merges < 5%.

```ts
interface Metric { right: number; of: number; pct: number | null } // for merges, right = rows with the fault
interface EvalReport {
  read: number; matched: number; notFound: string[]; unread: Record<string, number>;
  date: Metric; venue: Metric; category: Metric; area: Metric; falseMerges: Metric; missedMerges: Metric;
  wrong: { date: string[]; venue: string[]; category: string[]; area: string[]; falseMerges: string[]; missedMerges: string[] };
  gateA: boolean;
}
```

## The command

`npm run eval -- <dump.json>` reads `golden/golden.csv` and a dump of the stored events, scores
it with `read = readSources(SOURCES.map((s) => s.id))`, and prints `formatReport`: a line per
metric (`date 19/20 95.0%  >= 95% ok`), the rows not found, the rows wrong under each metric, the
unread sources, and `Gate A: passes` or `Gate A: not yet`. The dump is made with:

```
npx wrangler d1 execute changle-events --remote --json --command "SELECT e.id, e.source, e.url, e.title, e.start_at, e.all_day, e.time_tbd, e.category, e.duplicate_of, v.name AS venue_name, v.address AS venue_address, v.area AS venue_area FROM events e LEFT JOIN venues v ON v.id = e.venue_id" > dump.json
```

It accepts that output (an array whose first item holds `results`), `{ results: [...] }`, or a
plain array. `scripts/eval.ts` reads files with `node:fs`; `src/eval.ts` stays pure.

## Done when

With the fixture and `read = ["ticketmaster", "luma", "vpl", "rpl", "rogersforum", "commodore"]`:

- 21 rows read, 20 matched; `notFound` is `["G04"]`; `unread` is `{ ubc: 3, eventbrite: 15,
  evergreen: 1 }`.
- date 19/20 95.0% (wrong: G03); venue 19/20 95.0% (G15); category 19/20 95.0% (G17); area
  19/20 95.0% (G20).
- false merges 2/20 10.0% (G13, G14); missed merges 2/6 33.3% (G23, G24). `gateA` false.
- G12 matches though its stored URL is `https://lu.ma/fvjswhwy?tk=Qx7`; G22 though it has no
  trailing slash; G10 picks the Commodore event on 12 November, not the one on the 14th; G11 and
  G16 have the right venue.

And with `read = readSources(SOURCES.map((s) => s.id))` (luma, vpl, rpl, ubc, ticketmaster since
UBC joined on 1 November): 21 rows read, 17 matched (`notFound` G04, G05, G07, G08: the fixture
has no UBC events); date, venue, category and area 16/17 94.1%; false merges 2/17 11.8%; missed
merges `null` (no pair has both rows read); `gateA` false.

Plus small tests of your own for each rule: a date-only row (all-day, TBD, a timed event that
day), a venue with no golden address, a `duplicate_of` loop. `npm run eval -- <a dump made from the
fixture>` prints the numbers above. `npm test` and `npm run typecheck` pass.

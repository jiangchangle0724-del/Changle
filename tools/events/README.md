# 玩什么 · What's On

Greater Vancouver's events for the next 14 days, gathered every morning at 06:00 for
changle.ca/go: what's on, where, when, how much, with a line in Chinese saying what it is. Its own
Cloudflare Worker, like 随便 (`tools/suibian`). The plan is `docs/whats-on-v2.md`; how the code
works is [CONTRACTS.md](CONTRACTS.md).

Where it is: the foundation (gate A's tasks A1, A2, A5). Each morning's run reads Luma's
Vancouver calendar, the Vancouver and Richmond public libraries' events, Burnaby's library's own feed, UBC's calendar (only what
anyone can walk into: open to all or the community, in person on the Vancouver campus), and
Ticketmaster once its key is set; stores them in D1 and publishes the next 14 days to KV (473 events on 1 November);
`/go/api/events` and `/go/api/status` answer, and `/go/preview` shows what's published day by day
(in Chinese, or English with `?lang=en`; not linked from anywhere and not indexed) to check the run by eye. Still to come: Chinese summaries (A3), duplicates across sources (A4), more sources, the
calendar feed and the page itself (`/go` says "coming soon" until gate A is passed).

The library pieces C4, C5, C9 and C12 are in (Codex, reviewed 1 November). What their reviews
left for A4, the dedupe step:

- `fingerprint()` gives every title that normalises to nothing ("Tickets", "2026", "温哥华") the
  same fingerprint at a date and venue, and a null venue does the same for every same-title event
  that day: never merge on those.
- A Chinese phrase is one word to `similarity()`, so "中文读书会（第三期）" and "中文读书会" score
  0.769, below the review queue's 0.85, where the English twin scores 1. Look at CJK titles by
  characters before relying on it.
- `similarity()` costs 13 to 16 µs a pair, most of it normalising: normalise each title once.
- `resolveArea()` can say `outside` (Vancouver, WA); `areaOf()` drops that, so such a venue is
  stored with no area and still published. Leave those out of what's published.
- Postal codes cross city lines: V3J is Coquitlam's but Lougheed Town Centre, in Burnaby, has it.
  Coordinates win (Burnaby's branches have them); for other sources, a venue whose postal area and
  city disagree is worth a "待确认".

## Run it

```
npm ci
npm run typecheck && npm test
npm run dev        # then, in another terminal:
curl "http://127.0.0.1:8787/__scheduled?cron=0,20,40+13,14+*+*+*"   # a morning trigger, now
curl http://127.0.0.1:8787/go/api/status                             # how far it got, its fetch log
curl "http://127.0.0.1:8787/go/api/events?tag=free&cat=family"
open http://127.0.0.1:8787/go/preview                               # the same, as a page
```

A trigger takes up to 30 steps; call it again and it goes on. A day's run is done once: to run the
same day again, delete `.wrangler/state`.

## Live

Connected to Cloudflare on 1 November 2026: merging into `main` deploys it. The Worker
`changle-events` (Workers Builds): root directory `/tools/events`, no build command, deploy command
`npx wrangler deploy`, build watch paths `tools/events/*`, API token "suibian build token". Builds
for preview branches are off: `wrangler preview` (beta) would need a `previews` block in
`wrangler.jsonc`, so every PR touching this folder got a failed check.

- The first deploy made the D1 database `changle-events` and the KV namespace
  `changle-events-cache` by itself (they're in `wrangler.jsonc` without ids); the Worker sets up
  its tables on its first run.
- Until the first morning run, `/go/api/events` answers 503 "not ready" and `/go/api/status` has
  no run.
- Ticketmaster (Steve, once): on the Worker, Settings > Variables and Secrets > add a Secret named
  `TICKETMASTER_KEY` (from developer.ticketmaster.com). Without it that source is skipped.

It runs on the free plan: nothing here costs money.

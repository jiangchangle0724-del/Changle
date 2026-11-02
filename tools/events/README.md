# 玩什么 · What's On

Greater Vancouver's events for the next 14 days, gathered every morning at 06:00 for
changle.ca/go: what's on, where, when, how much, with a line in Chinese saying what it is. Its own
Cloudflare Worker, like 随便 (`tools/suibian`). The plan is `docs/whats-on-v2.md`; how the code
works is [CONTRACTS.md](CONTRACTS.md).

Where it is: the foundation (gate A's tasks A1, A2, A5). Each morning's run reads Luma's
Vancouver calendar and the Vancouver and Richmond public libraries' events, and Ticketmaster once
its key is set; stores them in D1 and publishes the next 14 days to KV (473 events on 1 November);
`/go/api/events` and `/go/api/status` answer. Still to come: Chinese summaries (A3), duplicates across sources (A4), more sources, the
calendar feed and the page itself (`/go` says "coming soon" until gate A is passed).

## Run it

```
npm ci
npm run typecheck && npm test
npm run dev        # then, in another terminal:
curl "http://127.0.0.1:8787/__scheduled?cron=0,20,40+13,14+*+*+*"   # a morning trigger, now
curl http://127.0.0.1:8787/go/api/status                             # how far it got, its fetch log
curl "http://127.0.0.1:8787/go/api/events?tag=free&cat=family"
```

A trigger takes up to 30 steps; call it again and it goes on. A day's run is done once: to run the
same day again, delete `.wrangler/state`.

## Live

Connected to Cloudflare on 1 November 2026: merging into `main` deploys it. The Worker
`changle-events` (Workers Builds): root directory `/tools/events`, no build command, deploy command
`npx wrangler deploy`, build watch paths `tools/events/*`, API token "suibian build token".

- The first deploy made the D1 database `changle-events` and the KV namespace
  `changle-events-cache` by itself (they're in `wrangler.jsonc` without ids); the Worker sets up
  its tables on its first run.
- Until the first morning run, `/go/api/events` answers 503 "not ready" and `/go/api/status` has
  no run.
- Ticketmaster (Steve, once): on the Worker, Settings > Variables and Secrets > add a Secret named
  `TICKETMASTER_KEY` (from developer.ticketmaster.com). Without it that source is skipped.

It runs on the free plan: nothing here costs money.

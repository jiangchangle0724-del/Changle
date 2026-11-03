# 玩什么 · What's On

Greater Vancouver's events for the next 14 days, gathered every morning at 06:00 for
changle.ca/go: what's on, where, when, how much, with a line in Chinese saying what it is. Its own
Cloudflare Worker, like 随便 (`tools/suibian`). The plan is `docs/whats-on-v2.md`; how the code
works is [CONTRACTS.md](CONTRACTS.md).

Where it is: the foundation (gate A's tasks A1, A2, A5). Each morning's run reads Luma's
Vancouver calendar, the Vancouver and Richmond public libraries' events (handed over by a GitHub job, see Live), Burnaby's library's own feed, UBC's calendar (only what
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
- The Vancouver and Richmond libraries come by a hand-over (`src/handoff.ts`): their site,
  BiblioCommons, answers the Worker 403 since 2 November, and 200 to the same request from anywhere
  else. At 05:50 the GitHub job `.github/workflows/events-libraries.yml` runs `npm run libraries`,
  which reads their pages exactly as the run would and posts each to `POST /go/api/handoff` with the
  key `EVENTS_HANDOFF_KEY`; the 06:00 run reads those pages, and fetches a page itself only when none
  came. `/go/api/status` shows each step's `via` (`handoff` or `fetch`) and a `note`. To see what the
  job would send, without sending it: `npm run libraries -- --dry-run`. The key is set once, below.

It runs on the free plan: nothing here costs money.

### 两个图书馆的「接力」（Steve 设一次）

温哥华和列治文图书馆的活动放在 BiblioCommons 上。11 月 2 日起，它拒绝 Cloudflare 发出的请求（403），同样的请求从别处发是通的。所以现在每天早上 5:50，GitHub 先替网站把这两个图书馆的活动抓好，交给网站；6:00 那一轮直接用交来的。哪天没交来，网站照旧自己去抓，并在日志里写明原因。

交接要一把钥匙：GitHub 里一把，Cloudflare 里一把，两把必须一模一样。

1. **做一把钥匙。** 在电脑上打开 PowerShell，粘贴下面这一行，回车：
   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') })
   ```
   出来的那一行 64 个字母和数字就是钥匙。也可以让密码管理器生成：至少 40 位，只要字母和数字。钥匙不要发给任何人，也不要贴进聊天。
2. **放进 GitHub。** 打开仓库 → Settings → Secrets and variables → Actions → New repository secret。Name 填 `EVENTS_HANDOFF_KEY`，Secret 粘贴钥匙，点 Add secret。
3. **放进 Cloudflare。** Workers & Pages → `changle-events` → Settings → Variables and Secrets → Add。Type 选 Secret，Variable name 填 `EVENTS_HANDOFF_KEY`，Value 粘贴同一把钥匙，点 Deploy。
4. **手动跑一次，检查。** 这一步要等这个改动合并、Cloudflare 部署完（合并后几分钟）才能做。GitHub 仓库 → Actions → 左边点 `events-libraries` → 右边 Run workflow → 再点绿色的 Run workflow。等两三分钟：
   - 绿色对勾：成了。点进去能看到两个图书馆各交了几页、多少活动。
   - 红叉：点进去看红字那一行。`wrong key`：两把钥匙不一样，重新粘贴。`EVENTS_HANDOFF_KEY is not set on the Worker`：Cloudflare 那把还没加。`HTTP 403 from gateway.bibliocommons.com`：GitHub 也被图书馆挡了，告诉 Claude。

手动跑那一次只是检查钥匙；第二天早上 6 点那一轮才真正用上。之后打开 changle.ca/go/api/status：`vpl` 和 `rpl` 那几行写着 `"via": "handoff"` 就对了；写着 `"via": "fetch"` 的话，看同一行的 `note` 和 `error`。

不花钱：GitHub 每天跑两分钟左右，在私有仓库每月的免费额度里；Cloudflare 每天多二十来次请求和写入，在免费版额度里。

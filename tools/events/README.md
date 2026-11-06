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
  which reads their pages exactly as the run would and posts each to `POST /go/api/handoff` on the
  Worker's own address, `changle-events.jiangchangle0724.workers.dev` (changle.ca's bot protection
  answers GitHub's machines with a challenge page; that address serves nothing else), signed
  in with GitHub's own sign-in token (OIDC, `src/oidc.ts`): the Worker checks it against GitHub's
  public keys and takes only this repository's `events-libraries` job on `main`. No secret to set on
  either side (below). The 06:00 run reads those pages, and fetches a page itself only when none came.
  `/go/api/status` shows each step's `via` (`handoff` or `fetch`) and a `note`. To see what the job
  would send, without sending it: `npm run libraries -- --dry-run`. A key (`EVENTS_HANDOFF_KEY`, on
  the Worker and where the script runs) is only for handing pages over from outside GitHub.

It runs on the free plan: nothing here costs money.

### 两个图书馆的「接力」（什么都不用设）

温哥华和列治文图书馆的活动放在 BiblioCommons 上。11 月 2 日起，它拒绝 Cloudflare 发出的请求（403），同样的请求从别处发是通的。所以现在每天早上 5:50，GitHub 先替网站把这两个图书馆的活动抓好，交给网站；6:00 那一轮直接用交来的。哪天没交来，网站照旧自己去抓，并在日志里写明原因。

**不用钥匙，什么都不用设。** 网站靠 GitHub 自己的登录凭证认出交东西来的是我们的任务：每次任务开跑，GitHub 都给它开一张签了名的凭证（OIDC token），写明是哪个仓库、哪个分支、哪个任务、怎么开始跑的，很快就过期。网站用 GitHub 公开的钥匙核对签名，再一项一项核对：

- 是这个仓库，按 GitHub 给仓库和账号的数字编号认，仓库改名也不受影响；
- 是 `main` 分支上的 `events-libraries` 这个任务；
- 是每天定时跑的，或者在 Actions 里手动点开的；
- 这张凭证是专门开给这次交接的，而且还没过期。

别人 fork 的仓库、PR、别的分支、别的任务、过期的旧凭证，一律不收。GitHub 和 Cloudflare 两边都没有要保管、要粘贴的东西。

**合并之后可以检查一次**（不查也行，第二天早上 5:50 会自己跑）：GitHub 仓库 → Actions → 左边点 `events-libraries` → 右边 Run workflow → 再点绿色的 Run workflow。要等合并后 Cloudflare 部署完（几分钟）再点。等两三分钟：
- 绿色对勾：成了。点进去能看到两个图书馆各交了几页、多少活动。
- 红叉：点进去看红字那一行，告诉 Claude。`HTTP 403 from gateway.bibliocommons.com`：GitHub 也被图书馆挡了。`GitHub token: ...`：网站没认这张凭证，后面写着哪一项不对。

第二天早上打开 changle.ca/go/api/status：`vpl` 和 `rpl` 那几行写着 `"via": "handoff"` 就对了；写着 `"via": "fetch"` 的话，看同一行的 `note` 和 `error`。

钥匙 `EVENTS_HANDOFF_KEY` 现在可有可无，只在 GitHub 以外跑 `npm run libraries` 时用（比如在电脑上交给本地的 `npm run dev`：同一把钥匙放进 `.dev.vars`，跑脚本时也设上）。GitHub 和 Cloudflare 上都不用加。

不花钱：仓库是公开的，GitHub 跑这个任务不收钱；Cloudflare 每天多二十来次请求和写入，再加一次去 GitHub 取公开钥匙，都在免费版额度里。

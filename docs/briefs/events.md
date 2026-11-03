# 工具 · 玩什么（events）

对话名「工具 · 玩什么」。网址 changle.ca/go（正式页还没开），预览 changle.ca/go/preview。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

大温哥华未来两周的活动，每天早上 6 点（温哥华时间）自动抓一轮，存进数据库，发布成一份清单；接口 `/go/api/events`、`/go/api/status`，预览页按天列出。

## 文件

- 全部代码（自己的服务器，Worker `changle-events`，D1、KV、每天的定时任务）：`tools/events/`
- 两个图书馆的接力：GitHub 每天 5:50 的任务 `.github/workflows/events-libraries.yml`，脚本 `tools/events/scripts/libraries.ts`，两头的代码 `tools/events/src/handoff.ts`
- Codex 的任务卡：`docs/codex-tasks/C*.md`（目录在 `docs/codex-tasks/README.md`）
- 钥匙（只写名字）：Cloudflare 里 `TICKETMASTER_KEY`（还没加）、`EVENTS_HANDOFF_KEY`（还没加）；GitHub 仓库的 Actions secret 里 `EVENTS_HANDOFF_KEY`（还没加，和 Cloudflare 那把同一个值）

## 先读

- `tools/events/README.md`
- `tools/events/CONTRACTS.md`
- `docs/whats-on-v2.md`（方案）

## 测试

- 在 `tools/events` 里：`npm run typecheck`、`npm test`、`npm run eval`；CI `.github/workflows/events.yml`
- 看 GitHub 那一步会交什么（不发送）：`npm run libraries -- --dry-run`

## 定过的事

- 先用 Cloudflare 免费版，不升 Workers Paid（10 月 31 日）。
- 黄金集就是 Claude 标的 40 条，够验收门 A 用（11 月 1 日）。
- 正式页 `/go` 等验收门 A 过了再开；预览页不公开、不进搜索。
- UBC 只收所有人都能进的活动。
- 本拿比图书馆用它自己的 feed，四个分馆带坐标（#105）。
- 温哥华和列治文图书馆：每天 5:50 由 GitHub 先抓好，用一把钥匙交给网站；6:00 那一轮用交来的，没交来就照旧自己抓并记下原因（11 月 2 日 Steve 同意）。

## 现在

- 11 月 2 日第一轮：06:01 发布 51 个活动（本拿比图书馆 32、UBC 10、Luma 9）。温哥华和列治文图书馆被拒（403）：图书馆平台 BiblioCommons 挡了 Cloudflare 发出的请求，同样的请求从别处发是通的。Ticketmaster 没钥匙，跳过。

## 还剩什么

- 两个图书馆的接力已写好，等 Steve：
  1. 看过后合并（合并就部署）；
  2. 做一把钥匙，在 GitHub（Settings → Secrets and variables → Actions）和 Cloudflare（`changle-events` → Settings → Variables and Secrets，类型 Secret）各加一把，名字都叫 `EVENTS_HANDOFF_KEY`，值一模一样（步骤在 `tools/events/README.md`「两个图书馆的接力」）；
  3. 部署完在 Actions 里手动跑一次 `events-libraries`，看是不是绿的。
- 第二天早上看 changle.ca/go/api/status：`vpl`、`rpl` 写着 `"via": "handoff"` 就成了。
- 还没确定的两件事：
  - GitHub 的机器会不会也被挡。应该不会：挡人的是图书馆自己的 AWS 负载均衡，同一个地址、同样的请求，Workers 发的答 403，Node 发的答 200（GitHub 那一步用的就是 Node）。第一次手动跑就知道；万一被挡，任务会红，报 `HTTP 403 from gateway.bibliocommons.com`。
  - GitHub 的定时任务有时会晚开。晚过 6:00，那天就用不上交来的页（这两个图书馆照旧自己抓，被挡就留着前一天的活动）。真遇到了，就把时间提前，或者让 6:20、6:40 那两轮再试一次。
- Ticketmaster 钥匙（Steve 自己加，步骤在 README 的 Live 一节）。
- A3 中文简介；A4 去重（README 里有 C4、C5 审查留下的注意事项）；更多来源（C2 JSON-LD 等）；C6 日历；C7 页面；验收门 A。
- 首页入口：11-02 问过 Steve，是放一个标「预览」的入口，还是等图书馆和 Ticketmaster 接好再放，等他回复。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-02 What's On: the Vancouver and Richmond libraries come back, handed over by GitHub each morning
- 2026-11-01 What's On README: what the C4 and C5 reviews left for A4
- 2026-11-01 What's On: Burnaby Public Library joins the morning run
- 2026-11-01 fix(events): handle incomplete Burnaby programs and normalize IDs
- 2026-11-01 fix(events): address area resolution review feedback
- 2026-11-01 Golden set: the 40 rows are the whole set
- 2026-11-01 What's On: a preview page at /go/preview to check the run by eye

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 两个图书馆的接力：GitHub 每天 5:50 用和网站一模一样的请求抓好两个图书馆的每一页，一页一次交给 `POST /go/api/handoff`（钥匙 `EVENTS_HANDOFF_KEY`，存 KV 两天）；6:00 那一轮先用交来的，没有才自己抓；日志和 /go/api/status 每一步多了 `via`（handoff 或 fetch）和 `note`（迁移 0003）。在这台机器上查过：挡人的是 BiblioCommons 自己的 AWS 负载均衡（`awselb/2.0`）；同一个地址、同样的请求，用 Workers 的运行环境发是 403，用 Node 发是 200，所以挡的是 Workers 发出的请求本身，不是云服务器的地址。用 Node 抓：温哥华 12 页、列治文 7 页。本地跑一轮，19 页都走接力，发布 484 个活动（今天线上只有 51 个）。图书馆偶尔答 500，所以每页失败会隔 5 秒、10 秒再试两次；403 不重试。

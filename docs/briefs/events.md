# 工具 · 玩什么（events）

对话名「工具 · 玩什么」。网址 changle.ca/go（正式页还没开），预览 changle.ca/go/preview。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

大温哥华未来两周的活动，每天早上 6 点（温哥华时间）自动抓一轮，存进数据库，发布成一份清单；接口 `/go/api/events`、`/go/api/status`，预览页按天列出。

## 文件

- 全部代码（自己的服务器，Worker `changle-events`，D1、KV、每天的定时任务）：`tools/events/`
- Codex 的任务卡：`docs/codex-tasks/C*.md`（目录在 `docs/codex-tasks/README.md`）
- Cloudflare 里的钥匙（只写名字）：`TICKETMASTER_KEY`（还没加）

## 先读

- `tools/events/README.md`
- `tools/events/CONTRACTS.md`
- `docs/whats-on-v2.md`（方案）

## 测试

- 在 `tools/events` 里：`npm run typecheck`、`npm test`、`npm run eval`；CI `.github/workflows/events.yml`

## 定过的事

- 先用 Cloudflare 免费版，不升 Workers Paid（10 月 31 日）。
- 黄金集就是 Claude 标的 40 条，够验收门 A 用（11 月 1 日）。
- 正式页 `/go` 等验收门 A 过了再开；预览页不公开、不进搜索。
- UBC 只收所有人都能进的活动。
- 本拿比图书馆用它自己的 feed，四个分馆带坐标（#105）。

## 现在

- 11 月 2 日第一轮：06:01 发布 51 个活动（本拿比图书馆 32、UBC 10、Luma 9）。温哥华和列治文图书馆被拒（403）：图书馆平台 BiblioCommons 挡了 Cloudflare 发出的请求，同样的请求从别处发是通的。Ticketmaster 没钥匙，跳过。

## 还剩什么

- 修两个图书馆：提议每天早上先在 GitHub 抓好再交给网站，要 Steve 在 GitHub 和 Cloudflare 各加一把同样的钥匙，等他回复。
- Ticketmaster 钥匙（Steve 自己加，步骤在 README 的 Live 一节）。
- A3 中文简介；A4 去重（README 里有 C4、C5 审查留下的注意事项）；更多来源（C2 JSON-LD 等）；C6 日历；C7 页面；验收门 A。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 What's On README: what the C4 and C5 reviews left for A4
- 2026-11-01 What's On: Burnaby Public Library joins the morning run
- 2026-11-01 fix(events): handle incomplete Burnaby programs and normalize IDs
- 2026-11-01 fix(events): address area resolution review feedback
- 2026-11-01 Golden set: the 40 rows are the whole set
- 2026-11-01 What's On: a preview page at /go/preview to check the run by eye

## 记录

- 2026-11-02 建档案。

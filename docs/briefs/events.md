# 工具 · 玩什么（events）

对话名「工具 · 玩什么」。网址 changle.ca/go（正式页还没开），预览 changle.ca/go/preview。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

大温哥华未来两周的活动，每天早上 6 点（温哥华时间）自动抓一轮，存进数据库，发布成一份清单；接口 `/go/api/events`、`/go/api/status`，预览页按天列出。

## 文件

- 全部代码（自己的服务器，Worker `changle-events`，D1、KV、每天的定时任务）：`tools/events/`
- 两个图书馆的接力：GitHub 每天 5:50 的任务 `.github/workflows/events-libraries.yml`，脚本 `tools/events/scripts/libraries.ts`，两头的代码 `tools/events/src/handoff.ts`，核对 GitHub 登录凭证的代码 `tools/events/src/oidc.ts`，晚到的页来了就读 `tools/events/src/arrival.ts`
- Codex 的任务卡：`docs/codex-tasks/C*.md`（目录在 `docs/codex-tasks/README.md`）
- 钥匙（只写名字）：Cloudflare 里 `TICKETMASTER_KEY`（11 月 5 日 Steve 自己加的）。图书馆接力不用钥匙：GitHub 用自己的登录凭证（OIDC），GitHub 和 Cloudflare 都不用加 secret；`EVENTS_HANDOFF_KEY` 只在 GitHub 以外跑脚本时可选

## 先读

- `tools/events/README.md`
- `tools/events/CONTRACTS.md`
- `docs/whats-on-v2.md`（方案）

## 测试

- 在 `tools/events` 里：`npm run typecheck`、`npm test`、`npm run eval`；CI `.github/workflows/events.yml`
- 看 GitHub 那一步会交什么（不发送）：`npm run libraries -- --dry-run`

## 定过的事

- 首页先不放玩什么的入口，等图书馆和 Ticketmaster 都接好再放（Steve 11-02 定的）；在那之前只有 changle.ca/go/preview。
- 先用 Cloudflare 免费版，不升 Workers Paid（10 月 31 日）。
- 黄金集就是 Claude 标的 40 条，够验收门 A 用（11 月 1 日）。
- 正式页 `/go` 等验收门 A 过了再开；预览页不公开、不进搜索。
- UBC 只收所有人都能进的活动。
- 本拿比图书馆用它自己的 feed，四个分馆带坐标（#105）。
- 温哥华和列治文图书馆：每天 5:50 由 GitHub 先抓好，交给网站；6:00 那一轮用交来的，没交来就照旧自己抓并记下原因（11 月 2 日 Steve 同意；#130）。
- 接力不用钥匙，用 GitHub 自己的登录凭证（OIDC）证明是我们的任务，谁都不用设（11 月 5 日；#211）。原因：钥匙要 Steve 自己做、自己粘贴到两边，助手不能替他处理钥匙，一直没加上。钥匙那条路留着，只给 GitHub 以外跑脚本用。
- 接力交到 Worker 自己的地址 `changle-events.jiangchangle0724.workers.dev`，不走 changle.ca（11 月 5 日 Steve 同意合并 #246）。
- 交来晚的页来了就读，一个图书馆最后一页到了就重新发布清单；一个来源抓到一半失败，保留它之前列着的活动（11 月 11 日 Steve 说开工；#299、#300）。

## 现在

- 11 月 11 日这一轮：06:01 发布 142 个活动。这一轮各来源读到的（两周内）：Ticketmaster 82、本拿比图书馆 33、UBC 26（几页之间有重复）、Luma 14。Ticketmaster 的钥匙 11 月 5 日晚加上，从 11 月 6 日那一轮起在抓。
- 温哥华和列治文图书馆还没上过清单。接力本身通了：11-05 晚手动跑一次是绿的（温哥华 12 页、列治文 6 页都交了），11-06 到 11-11 每天定时也都是绿的。但 GitHub 每天都拖到 10:52 到 15:44 才跑，早上那一轮早就过去了：它自己去问图书馆，被拒（403），交来的页没人读。#300 合并后，晚到的页来了就读。
- 等合并：#299（抓到一半失败）、#300（晚到的页来了就读，含 #299）。
- 11 月 11 日把 C1、C2、C3、C6 四张卡在 Steve 电脑上的 Codex 里各开一个对话发了出去（文件夹 changle-c1/c2/c3/c6，分支 codex/c1-ical、codex/c2-jsonld、codex/c3-ticketmaster、codex/c6-ics），等它们开 PR 再审。

## 还剩什么

- #299、#300 合并以后：等那天 GitHub 的任务跑完（这几天是中午前后），看 changle.ca/go/api/status：`vpl`、`rpl` 那几行 `note` 结尾是 `read when it came`，最后一行 `publish` 的 `note` 是 `again, with ... pages as they came`，发布的数目多了两三百个，就成了。GitHub 任务的日志里每个图书馆后面也有一行，说是「留给早上那一轮」还是「来了就读」、发布了多少。
- 审 Codex 的四个 PR：C1 iCal、C2 JSON-LD、C3 Ticketmaster、C6 日历。C2 只是解析器，接哪些网站要另外加来源。
- 黄金集 40 条大多已经过期，验收门 A 之前要按现在的来源重新标一批。
- A3 中文简介；A4 去重（README 里有 C4、C5 审查留下的注意事项）；C7 页面；来源出错时通知；验收门 A。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-11 What's On: read the libraries' pages when they come, and publish again after a library's last page
- 2026-11-11 What's On: a source that fails part-way keeps what it listed on the pages it couldn't read
- 2026-11-05 events: the libraries' job hands over at the Worker's own address
- 2026-11-05 What's On: the libraries' job signs in with GitHub's own token, no key to set
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
- 2026-11-02 两个图书馆的接力（#130）：GitHub 每天 5:50 用和网站一模一样的请求抓好两个图书馆的每一页，一页一次交给 `POST /go/api/handoff`（钥匙 `EVENTS_HANDOFF_KEY`，存 KV 两天）；6:00 那一轮先用交来的，没有才自己抓；日志和 /go/api/status 每一步多了 `via`（handoff 或 fetch）和 `note`（迁移 0003）。在这台机器上查过：挡人的是 BiblioCommons 自己的 AWS 负载均衡（`awselb/2.0`）；同一个地址、同样的请求，用 Workers 的运行环境发是 403，用 Node 发是 200，所以挡的是 Workers 发出的请求本身，不是云服务器的地址。用 Node 抓：温哥华 12 页、列治文 7 页。本地跑一轮，19 页都走接力，发布 484 个活动（今天线上只有 51 个）。图书馆偶尔答 500，所以每页失败会隔 5 秒、10 秒再试两次；403 不重试。
- 2026-11-02 记下 Steve 11-02 的回答。
- 2026-11-05 接力改用 GitHub 自己的登录凭证（OIDC，#211），不再要钥匙。任务加了 `id-token: write`，不再传 secret；脚本每个图书馆交之前向 GitHub 要一张写明给 `changle-events-handoff` 的凭证（设了 `EVENTS_HANDOFF_KEY` 就还用钥匙）。网站只用 Web Crypto：只收 RS256（none、HS256 等一律拒），按 `kid` 用 GitHub 公开的钥匙核对签名（内存和 KV 各存一小时，不认识的 `kid` 最多一分钟再去取一次，凭证通过了才写 KV），再核对 iss、aud、exp/iat/nbf（容一分钟误差）、仓库编号 1431750616 和账号编号 332761129、`refs/heads/main`、`workflow_ref` 是 events-libraries.yml@main、事件是 schedule 或 workflow_dispatch。fork、PR、别的分支、别的任务、给别人的凭证、过期的旧凭证都拒（401，说明哪一项不对，不提凭证本身）；取不到 GitHub 的钥匙时 503。Worker 有钥匙时钥匙照样能用。新测试 19 个（本地生成 RSA 钥匙、假的 GitHub 钥匙列表，不联网），也逐项把检查拿掉试过，每一项都有测试会红。
- 2026-11-05 合并 #211 后手动跑了一次：GitHub 抓图书馆没被挡（温哥华 12 页、300 个活动），但交给 changle.ca/go/api/handoff 时被 changle.ca 的机器人防护拦下，回的是「Just a moment...」挑战页（403），根本没到 Worker。改成交到 Worker 自己的地址 `changle-events.jiangchangle0724.workers.dev`（wrangler.jsonc 打开 `workers_dev`），那个地址上只答 `POST /go/api/handoff`，别的路径一律 404；大家用的还是 changle.ca/go。
- 2026-11-05 合并 #246 后在 Steve 电脑上手动跑了一次 `events-libraries`：绿的，温哥华 12 页、列治文 6 页都交上了，用的是 GitHub 自己的登录。同一天晚上 Steve 在 Cloudflare 的 `changle-events` 上加了 `TICKETMASTER_KEY`。11-05 有另一个对话也在改玩什么（做了 #211、#246）；建议以后玩什么只在这个对话里做，免得两边撞车。
- 2026-11-11 查了这一周：GitHub 的定时任务天天是绿的，但每天 10:52 到 15:44 才跑（排程是 5:50），早上那一轮早就过去了，交来的页从没被读过，所以两个图书馆一直没上清单。两处改动：
  - #299：一个来源抓到一半失败（比如温哥华 12 页里第 3 页出错），以前当天只发布读到的前两页，后面几页的活动全从清单上掉了。现在只有读完最后一页、而且前面每一页今天都读成功了，才算这个来源今天读完（`sources.last_ok_run`）；没读完就保留它之前列着的活动。测试在旧代码上会红（0 个，应为 40 个）。
  - #300：交来的页，早上那一轮已经走过这个图书馆的，来了就读（就是那一轮会走的那一步，经同一个回环绑定，各自一个请求、各自 10 毫秒）；这个图书馆最后一页读完就重新发布清单。那一轮还没走完时只读不发布，它自己会发布；7 点以后不管怎样都发布。那一轮还没开始或还没走到这个图书馆的，照旧留给它读。回给 GitHub 的答复里有 `read`，任务日志每个图书馆一行说明。`/go/api/status` 里来了就读的那几步，`note` 结尾是 `read when it came`，后来那次发布的 `note` 是 `again, with ... pages as they came`。测试 219 个都过。
- 2026-11-11 在 Steve 电脑上的 Codex 里把 C1、C2、C3、C6 四张卡各开一个对话发出去，每个用自己的文件夹和分支，不碰 #299、#300 改的文件。

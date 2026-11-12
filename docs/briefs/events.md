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

- 11 月 11 日：早上 06:01 那一轮发布 142 个活动（这一轮各来源读到的，两周内：Ticketmaster 82、本拿比图书馆 33、UBC 26（几页之间有重复）、Luma 14）。晚上 #299、#300 合并上线后手动跑了一次接力：温哥华 13 页、两周内 322 个，列治文 7 页、160 个，都是来了就读，清单重新发布两次，到 **618** 个。两个图书馆第一次上了清单。
- Ticketmaster 的钥匙 11 月 5 日晚加上，从 11 月 6 日那一轮起在抓。
- GitHub 的定时任务天天拖到 10:52 到 15:44 才跑（排程是 5:50），现在不要紧了：交来就读，读完就发布。
- Codex 的四个 PR（#305 C1 iCal、#303 C2 JSON-LD、#302 C3 Ticketmaster、#301 C6 日历）：#301 审了两轮、#302 审了三轮，都可以合并。#305、#303 第三轮各还有一处要改，11 月 12 日 04:35 发回各自的 Codex 对话，Codex 在同一个分支上改。
- 可以合并、还没合的：#353（oidc 测试偶尔失败的修正）、#302、#301、这份档案的 #334。按 Steve 定的规矩 CI 绿了就该自己合，但这个会话里合并被权限检查挡住（11 月 12 日试了两次），要 Steve 在对话里说一句「合并」，或者他自己在 GitHub 上合。

## 还剩什么

- #305、#303 等 Codex 第四轮改完再审，CI 绿了就合（几轮审出来的问题见「记录」11-11、11-12）。C2 只是解析器，接哪些网站要另外加来源（接之前先看下面 JSON-LD 那条）。
- 日历订阅（C6）验收门 A 之前先试：Google 日历和 iCloud 是从它们自己的服务器来取 `.ics` 的，changle.ca 的机器人防护已经挡过 GitHub 的机器，可能也会挡它们，订阅就成了空的。真被挡，`.ics` 也像接力那样走 Worker 自己的地址，或者 Steve 关掉防护。
- `worker.ts` 给按分类过滤的日历起名用的是英文代号（`玩什么 · What's On · family`），要换成中英文名；`/go/api/events.ics` 那个 501 分支在 C6 合并后就用不到了，删掉。
- #301 合并以后给 Codex 一句小改：`ics.ts` 的 `day()` 只认 `YYYY-MM-DD`，全天活动的结束带时分时，这个活动会从日历里跳过；改成 `day(value.slice(0, 10))`。现在碰不到，因为下一条先挡住了。
- `store.ts` 的 `endMs()` 碰到「开始只有日期、结束带时分」会给 NaN，`end_utc` 不能为空，整页入库失败。#302 合并后 Ticketmaster 不再给这种形状，但入库这头也要兜住：结束读不出就当没有结束。这是本对话自己的活。
- iCal 的耗时和预算（#305 第三轮实测，workerd）：每个系列每周约 0.2 毫秒、每日约 0.55 毫秒、每月第几个星期几 0.4 到 0.7 毫秒、每月带 BYSETPOS 约 3 毫秒，单个活动约 0.025 毫秒。20 个「每月第二个周二」已经 10 毫秒，30 个每日系列 17 毫秒。加新的 iCal 来源前，先在 workerd 里量它存下来的文件，超过约 5 毫秒就分页，或者给 ical.js 的 `nthWeekDay` 打一个不复制日期的补丁（审查时试过，20 个月度系列从 21 降到 4 毫秒，输出一样）。预算的代价（都是静默的）：要走 200 步以上才到窗口的 COUNT 系列、一天超过约 13 次的规则会少掉窗口后面的日期，一个文件里大约第 23 个每日系列之后的拿不到日期。永远命中不了的规则（周一开始的 DAILY;INTERVAL=7;BYDAY=TU 这类）会让 ical.js 卡死，那个来源当天失败。
- 接 JSON-LD 来源之前，先数它脚本里没转义的 `<`：HTMLRewriter 每碰到一个 `<` 就调一次文字处理，约 7.6 微秒一次，一页大约 1300 个就用完 10 毫秒。网站把 HTML 放在 JSON-LD 里的，要换一种读脚本文字的办法，那是改卡片的事。
- Ticketmaster 一页要 200 个（`sources.ts`）：现在两周内 80 来个没事；超过 150 个左右，一步的解析时间会接近 10 毫秒。到时改成一页 100 个、多翻几页。
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
- 2026-11-11 晚上 Steve 同意后合并了 #299、#300，21:05 部署完，在 Steve 电脑上手动跑了一次 `events-libraries`：两个图书馆的页都是来了就读，清单 142 → 460 → 618。任务日志每个图书馆后面那一行写得清楚（read as they came … the list published again: 618 events）。
- 2026-11-11 Codex 的四个 PR 由四个子任务分别审（各自一份工作副本，PR 原样跑一遍、和最新 main 合起来再跑一遍，卡上的「Done when」逐条自己核对）。都过了卡，但都要改了再合：
  - #305 C1 iCal：重复活动展开没有上限（每天一次、从 2020 年开始的系列一次解析约 110 毫秒）；没有 DTSTART 的 override 让整份日历解析失败；主活动不在文件里的 override 被丢（旧版会留）；没有 SUMMARY 的 override 让那天整个消失；窗口开始时已在进行的重复活动被丢。`tests/run.test.ts` 里 UBC 5 变 6、102 变 103 是对的：UBC Farm 夏季系列有了真的结束日期，跨进了窗口。卡上「6 个全天活动」写错了，是 3 个，已改卡。
  - #303 C2 JSON-LD：不同场次拿到同一个 id（同一网址的两场，存库时互相覆盖）；开始、结束一个只有日期一个有时间时活动被丢；先解码整段描述再截断，白费 CPU；一档 0 元就算免费；任何一个 offer 售罄就算售罄；线上线下都有的丢了场地；文字形式的地址被丢；场地名没解实体；状态的简写读成 scheduled。Codex 问同一天两场怎么办，答：只在同一天有不同开场时间时才在 id 后面加时分秒。
  - #302 C3 Ticketmaster：开始没具体时间、结束有时间的跨天活动被悄悄丢掉；一个怪活动（时间读不出、数组里有 null、没有名字）会毁掉整页；含手续费的价格混进来，0 元当成了价格；分类没用 primary 那个；不是活动页的 200 答复被当成空页（会清掉当天的 Ticketmaster）。它也顺手修好了线上两个错：0 到 0 的价格算成免费、儿童剧分到 shows。
  - #301 C6 日历：500 个活动生成要 9 到 15 毫秒，一次请求只有 10 毫秒；URL 原样写进去，带回车换行能凭空多出一个活动；延期、改期、售罄在日历里看不出来（改成：延期写 STATUS:TENTATIVE、标题前加「已延期 Postponed · 」，改期和售罄在描述第一行写明）；结束早于开始、时间读不出时整份日历会出错；控制字符没去掉。
- 2026-11-11 晚上 Codex 改完，第二轮审查（还是那四个子任务，PR 原样跑、和 main 合起来跑）：
  - #301 C6：五条都修好，可以合并。状态没变的活动和旧版生成的逐字节一样；500 个活动 3.6 毫秒。留一句小改（见「还剩什么」），不挡合并。
  - #305 C1：大部分修好，随机 7100 条重复规则和旧的展开比只差 2 条。还剩：每月的系列没有真的快进（2012 年起的「每月第二个周二」30 毫秒，带 BYSETPOS 的 196 毫秒）；迭代预算整份日历共用，一个很长的 COUNT 系列排在前面，后面的正常系列一个日期都不出，预算用满要 7.2 毫秒；每小时、每分钟的规则重新起步后时间错（BYHOUR=10 显示成 00:00）；DTSTART 不该单独算一次；改期那天换了地点却配着原来的坐标；RDATE 写成时间段时整个系列消失。
  - #303 C2：十条都修好，新出几处：把完全相同的重复项去掉了，列表页只剩 29 个（卡上是 32，是我上一轮没说清）；纯线上的活动带着旧场地；没有网址的两个活动同一时间撞 id；「Online」「TBA」这类文字被当成场地。另外定了 id 规则：一律「网址@温哥华日期」，同一天有几个场次才加时分秒，用的是页面网址的再加标题的短哈希。原来只剩一个日期时 id 会变成光网址，id 一变，那行就当新活动重来，分类、简介、合并都没了。C2 卡已按这个改。
  - #302 C3：六条都修好；新出一处：一页里每个活动都同样坏掉时，现在静默给 0 个，当天 Ticketmaster 会从清单上消失。改成读不了的过半就报错，保留昨天的。
  - 23:25 在 Steve 电脑上把 C1、C2、C3 的第二轮意见发回各自的 Codex 对话。#302 的 CI 那次红是 oidc 的一个测试偶尔失败（检查时间的循环跨了一秒），和它无关，#353 修好。
- 2026-11-12 Steve 改了规矩：CI 绿了自己合并，合完告诉他上线了什么；花钱、删数据、改 Cloudflare 或 GitHub 的设置和钥匙、仓库公开或私有才先问。00:23 和 04:36 试着合并 #353、#301，都被这个会话的权限检查挡下，没合成。
- 2026-11-12 凌晨 Codex 改完，第三轮审查：
  - #302 C3：三条都修好，可以合并。过半读不了就报错：全坏的一页让这一步失败、昨天的活动留着；真的空窗口、大多是待定日期的页照常；恰好一半不报错，过半才报。场馆字段不是字符串不再让入库失败。多页的日子第二页坏了，靠 main 上 #299 的规则整源保留昨天的。CPU 没变。
  - #305 C1：前六条都修好，随机 7152 条规则和旧的展开一条不差，UBC、Luma 输出不变，单个月度系列 0.4 到 3 毫秒。新出一处：排序时读 COUNT 不在每个系列自己的 try 里，UNTIL 写坏一条就整份日历丢掉。顺手让它改 `plainText` 的两处平方级回溯（一长串不换行空格或全角空格、一长串没有 `>` 的 `<`，最慢 28 毫秒；图书馆、UBC、Luma 都用它），并把 PR 说明更新成留给后续的风险。
  - #303 C2：A 到 F 都对，列表页回到 32 个，id 都带日期。新出一处：没有网址的活动，同一天别的没有网址的活动一出现，它就多出时分秒，id 跟着变。改成按「网址加标题哈希」数场次；顺手两处：片段里的 `?` 别当查询串去掉，标题哈希前先收空白。Codex 那页 24 毫秒不是这次改出来的，是描述里一长串不换行空格碰上 `plainText` 的回溯（上面 #305 那条一起修）。
  - 04:35 在 Steve 电脑上把 C1、C2 的第三轮意见发回 Codex。

# 工具 · 玩什么（events）

对话名「工具 · 玩什么」。网址 changle.ca/go（11 月 14 日上线，入口在工具页），预览 changle.ca/go/preview。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

大温哥华未来两周的活动，每天早上 6 点（温哥华时间）自动抓一轮，存进数据库，发布成一份清单；接口 `/go/api/events`、`/go/api/status`，预览页按天列出。

## 文件

- 全部代码（自己的服务器，Worker `changle-events`，D1、KV、每天的定时任务）：`tools/events/`
- 中文名和介绍（A3）：`tools/events/src/ai.ts`，每小时 5 分的定时任务（`wrangler.jsonc` 第二个 cron），Workers AI（绑定 `AI`）
- 每天的检查：GitHub 每天 02:23 的任务 `.github/workflows/events-health.yml`，脚本 `tools/events/scripts/health.ts`，判断和开关 issue 的代码 `tools/events/src/health.ts`
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
- 看每天的检查会说什么（不开 issue）：`npm run health -- --dry-run`

## 定过的事

- 首页先不放玩什么的入口，等图书馆和 Ticketmaster 都接好再放（Steve 11-02 定的）。11 月 14 日两样都接好了，Steve 说「可以上线 tools 里面」：玩什么的卡片放进工具页（约时间之后、随便之前），页面在 changle.ca/go。
- 先用 Cloudflare 免费版，不升 Workers Paid（10 月 31 日）。
- 黄金集就是 Claude 标的 40 条，够验收门 A 用（11 月 1 日）。
- 正式页 `/go` 原定等验收门 A 过了再开；11 月 14 日 Steve 定先上线，黄金集和验收门 A 照样做。页面先 `noindex`，等 Steve 说要宣传了再让搜索引擎收录。预览页不公开、不进搜索。
- 页面是 Worker 直接出的 HTML（`src/page.ts`），不是方案里写的 Vite / React：一天一天看，按分类、地区、价格（免费、$20 以内）筛，每个筛选都是链接，不用脚本也能用，手机上打开快（今天的数据渲染约 1 毫秒）。颜色、字号、间距抄的是 `site/src/styles/tokens.css`，测试逐项核对两边一样。前一天就开始的（展览、系列活动）收在当天列表下面，点开才看；夜场到 5 点前结束的不算第二天的。
- UBC 只收所有人都能进的活动。SFU 照同一条（11 月 18 日起）：SFU 自己标了 Public 的、在实地（不是线上或线上线下都有的）、在大温的；论文答辩、说明会、截止日期、学生服务不收，艺术系学生的毕业展和放映除外。
- 本拿比图书馆用它自己的 feed，四个分馆带坐标（#105）。
- 温哥华和列治文图书馆：每天 5:50 由 GitHub 先抓好，交给网站；6:00 那一轮用交来的，没交来就照旧自己抓并记下原因（11 月 2 日 Steve 同意；#130）。
- 接力不用钥匙，用 GitHub 自己的登录凭证（OIDC）证明是我们的任务，谁都不用设（11 月 5 日；#211）。原因：钥匙要 Steve 自己做、自己粘贴到两边，助手不能替他处理钥匙，一直没加上。钥匙那条路留着，只给 GitHub 以外跑脚本用。
- 接力交到 Worker 自己的地址 `changle-events.jiangchangle0724.workers.dev`，不走 changle.ca（11 月 5 日 Steve 同意合并 #246）。
- 交来晚的页来了就读，一个图书馆最后一页到了就重新发布清单；一个来源抓到一半失败，保留它之前列着的活动（11 月 11 日 Steve 说开工；#299、#300）。
- 中文页面（11 月 19 日 Steve 要的）：活动名显示中文译名，原名小字在下面，再一句中文说明是什么活动；有图的配来源网站的图（3:1，懒加载，不带 referrer），没图就不放。中文由 Workers AI 写（`@cf/qwen/qwen3-30b-a3b-fp8`，免费额度内，不用钥匙），每小时补一次；只给没分类的活动分类，不动来源给的分类。名字规则：艺人、乐队、巡演、场馆等保留英文，本地球队用通行中文名（试过不加这条，Canucks 被写成「维多利亚喷气机队」）。Ticketmaster 的活动（演唱会、球赛）不让 AI 起名，一律显示来源的原名，只用它那句介绍；AI 写了「知名」「新生代」这类夸词，或者提到来源里没有的国家、民族，这条不收，下个小时重写，三次不行就只显示英文（v3，11 月 19 日：只靠提示词，正式跑时还是会把乐队 Pooh 写成小熊维尼、给 DJ 编国籍）。同一来源里文字一样的活动（每周的场次、连演几晚）只问一次、全用同一个答案；不同文字的同名活动（不同分馆的 Babytime），中文名统一用最常见的译名（11 月 19 日，「twins」和 `settle`）。
- 来源出错时的通知：GitHub 每天检查一次前一天那一轮，有问题就在仓库里开一个 issue 并 @ Steve，GitHub 发邮件给他；同样的问题不再说，问题变了才评论，好了自己关。不用钥匙，用任务自己的 GitHub 凭证（只能写 issue）。仓库是公开的，issue 也公开，所以错误里的 key、token 一律抹掉（11 月 18 日 Steve 说「继续」，按这个方案做）。
- 加来源（11 月 25 日 Steve 要，他用 Google 一搜就有一堆清单上没有的）：只接有公开接口或日历订阅的。Showpass 先接（公开 API，robots 允许 /api/，内容标记 search=yes）。Eventbrite 2019 年底关了公开搜索：Steve 选了 A（11 月 25 日 21:52）：用他自己的免费钥匙（`EVENTBRITE_TOKEN`，他自己加到 Cloudflare），只读「关注」的主办方（organization），不读它的网页（条款不允许程序读；自动抓它的列表页也被权限挡了）。关注谁：`src/follows.ts` 的几场起点活动，以后加上投稿里 Steve 同意的 Eventbrite 活动的主办方。同时 Steve 要「投稿」。不接：小红书、人在温哥华（VanPeople，挡程序）、Vansky（都是帖子和分类广告，不是日历；替代办法是以后做「投稿」）；Daily Hive、Do604、Georgia Straight、Kids Out and About（它们自己编的清单，不整份搬）；Destination Vancouver（robots 禁 /api/ 和 /plugins/）。

## 现在

- 11 月 11 日：早上 06:01 那一轮发布 142 个活动（这一轮各来源读到的，两周内：Ticketmaster 82、本拿比图书馆 33、UBC 26（几页之间有重复）、Luma 14）。晚上 #299、#300 合并上线后手动跑了一次接力：温哥华 13 页、两周内 322 个，列治文 7 页、160 个，都是来了就读，清单重新发布两次，到 **618** 个。两个图书馆第一次上了清单。
- Ticketmaster 的钥匙 11 月 5 日晚加上，从 11 月 6 日那一轮起在抓。
- GitHub 的定时任务天天拖到 10:52 到 15:44 才跑（排程是 5:50），现在不要紧了：交来就读，读完就发布。
- 11 月 12 日 04:45 合并上线（Steve 04:41 说「完了直接合并就好不用问」）：#353 测试修正；#302 C3 Ticketmaster 的新读法，06:00 那一轮起用；#301 C6 日历订阅，changle.ca/go/api/events.ics 能打开，618 个活动，ical.js 读回全对、只用 CRLF、每行不超过 75 字节，哪里都还没放链接；#334 档案。
- 11 月 12 日 05:25 合并上线 #305（C1 iCal：重复活动、改期、时区）和 #303（C2 JSON-LD 解析器，还没有来源用它），都审了四轮，部署成功。发给 Codex 的四张卡 C1、C2、C3、C6 全部上线；06:00 那一轮起 UBC、Luma 用新的 iCal 读法，图书馆的描述也走新的 `plainText`。
- 11 月 12 日 06:01 那一轮，新解析器第一次一起跑，没有出错：发布 628 个（前一天 618）。Ticketmaster 一页 84 个，两周内全收（新加 5、更新 66，价格和分类按新规矩重写了）；UBC 7 页 37 个，本拿比图书馆 37，Luma 17。温哥华、列治文图书馆照例 403，等 GitHub 交来再读，这期间保留前一天的。Ticketmaster 的活动里没有「From $0」，1 个标了售罄。日历订阅 628 个，ical.js 读回全对。
- 11 月 14 日：玩什么上线，工具页有它的卡片，changle.ca/go 是正式页面（之前只是「正在准备中」）。当天早上那一轮发布 638 个，图书馆中午交来后重新发布 664 个。
- 11 月 18 日：早上那一轮正常，图书馆 13:56 交来后发布 644 个。
- 11 月 19 日：中文名、介绍和图片上线。11:05 UTC 那轮之后，清单上 644 个里 601 个有中文，没中文的 43 个里 41 个是 18 日已经结束的（不写），2 个 Ticketmaster 的答案没过检查、每小时再试；556 个有图。手机截图发给了 Steve。
- 11 月 19 日：SFU 第一次在早上那一轮读（4 页、200，35 个在两周里），清单 648 个（18 日 644），其中 SFU 28 个，都有中文和图，展览在「进行中」里。温哥华、列治文图书馆照常等 GitHub 交来。

## 还剩什么

- C2 只是解析器，接哪些网站要另外加来源（接之前先看下面 JSON-LD 那条）。
- 日历订阅验收门 A 之前先试：Google 日历和 iCloud 是从它们自己的服务器来取 `.ics` 的，changle.ca 的机器人防护已经挡过 GitHub 的机器，可能也会挡它们，订阅就成了空的；另外 robots.txt 不让抓 `/go`（预览页不进搜索），取日历的服务器要是守 robots.txt 也会被挡。真被挡，`.ics` 也像接力那样走 Worker 自己的地址，或者 Steve 关掉防护、robots.txt 放开 `/go/api/events.ics`。11 月 12 日从 Anthropic 的云上用 curl 取是 200，没被挡。
- iCal 的耗时和预算（#305 第三轮实测，workerd）：每个系列每周约 0.2 毫秒、每日约 0.55 毫秒、每月第几个星期几 0.4 到 0.7 毫秒、每月带 BYSETPOS 约 3 毫秒，单个活动约 0.025 毫秒。20 个「每月第二个周二」已经 10 毫秒，30 个每日系列 17 毫秒。加新的 iCal 来源前，先在 workerd 里量它存下来的文件，超过约 5 毫秒就分页，或者给 ical.js 的 `nthWeekDay` 打一个不复制日期的补丁（审查时试过，20 个月度系列从 21 降到 4 毫秒，输出一样）。预算的代价（都是静默的）：要走 200 步以上才到窗口的 COUNT 系列、一天超过约 13 次的规则会少掉窗口后面的日期，一个文件里大约第 23 个每日系列之后的拿不到日期。永远命中不了的规则（周一开始的 DAILY;INTERVAL=7;BYDAY=TU 这类）会让 ical.js 卡死，那个来源当天失败。
- 接 JSON-LD 来源之前，先数它脚本里没转义的 `<`：HTMLRewriter 每碰到一个 `<` 就调一次文字处理，约 7.6 微秒一次，一页大约 1300 个就用完 10 毫秒。网站把 HTML 放在 JSON-LD 里的，要换一种读脚本文字的办法，那是改卡片的事。
- Ticketmaster 一页要 200 个（`sources.ts`）：现在两周内 80 来个没事；超过 150 个左右，一步的解析时间会接近 10 毫秒。到时改成一页 100 个、多翻几页。
- 黄金集 40 条大多已经过期，验收门 A 之前要按现在的来源重新标一批。
- 页面以后可以加：「这个周末」一键、搜索；先看大家怎么用。（活动图片 11 月 19 日已经放上，懒加载。）
- 页面的耗时会跟着活动数涨：现在 664 个，读 JSON 0.8 毫秒、出页面约 1 毫秒；活动多到四倍约 6 毫秒，八倍光读 JSON 就超过一次请求的 10 毫秒。来源再多之前，改成每个 Worker 把读好的清单留在内存里，或者每天单独发布一份。
- 页面上的日历订阅（苹果、Google）还没人真订过：Google 和 iCloud 从它们自己的服务器来取，可能被机器人防护挡。上线后请 Steve 用手机点一次 Google 日历的链接，日历里有活动就是通了；空的就先把那个链接拿掉，要放行得改 Cloudflare 的设置，先问 Steve。
- A3 中文名和介绍已上线；还没做：英文页的一句话介绍（summary_en 一直是空的）、日历订阅里的中文名、预览页显示中文名。AI 写错的名字现在只能等来源改文字或改提示词，没有手动改的地方（summary_by 'steve' 留着给以后）。
- A4 去重（README 里有 C4、C5 审查留下的注意事项）；验收门 A。
- 投稿（Steve 11 月 25 日要的，还没做）：`/go/submit` 让人贴链接、文字或海报截图；AI 读出名字、时间、地点、价格（文字用 Workers AI；海报要能读中文的看图模型，先在 Cloudflare 的 AI Playground 试，读不好再考虑 Gemini，要 Steve 加钥匙）；`/go/admin` 只有站长能进：照跟一单（`tools/tuan/src/server/who.ts`）的办法，页面带上 changle.ca 的登录，Worker 经 `ROOMS` 绑定问房间服务器是谁、`master` 才放行；Steve 改、同意或不要；同意的进 events（来源「投稿」），马上重新发布；是 Eventbrite 链接的，用钥匙直接读那场活动，同意时顺便关注它的主办方（`followEvent`）。通知 Steve：房间服务器的 `Mail` 入口（要在 `site/worker/notice.ts` 的 `NOTICES_A_DAY` 加 events，是网站那边的代码），或者每天的检查顺带开 issue。
- 加新来源（11 月 25 日查过）：Meetup 先不接（小组的 iCal 里没有地点，分不出在哪、是不是线上，要一场一场读网页）；场馆和社区的日历（The Events Calendar 的公开接口 `/wp-json/tribe/events/v1/events`：Roundhouse 两周 11 个、The Dance Centre 19 个、Richmond Oval 3 个；ISSofBC 也是）；高贵林市（CivicPlus，有 RSS 和 iCal）；北岸旅游局（WordPress，`/events/feed/`）；列治文旅游局（WordPress，页上有 JSON-LD）。Eventbrite 等 Steve 选 A 还是 B。「投稿」：网友或 Steve 贴链接、海报截图，AI 读出时间地点，Steve 点同意才上清单（小红书、微信群的活动只能这样来）。
- （11 月 18 日查过的）SFU 已接上（见记录）。还能接的：新西敏图书馆（nwpl.ca 的活动日历页有 JSON-LD，C2 能读）；高贵林图书馆用 Communico（coquitlam.libnet.info）；素里图书馆、北温市图书馆是 Drupal 的活动页，没找到 feed；BiblioCommons 上 surrey、fvrl、coqlibrary、nvcl、portmoody 都有站点但活动是 0。这几个大多是讲故事、英语角、新移民服务，和温哥华、列治文图书馆一类，好处是补上三联市、素里、北岸。SUCCESS 中侨（successbc.ca）有 The Events Calendar 的 iCal（`/events/?ical=1`）和 JSON（`/wp-json/tribe/events/v1/events`），但两周只有 7 个、4 个是线上的，而且都是医护求职说明会，先不接；中华文化园（vancouverchinesegarden.com）有 Cloudflare 的人机验证，读不了；中华文化中心（cccvan.com）是 Wix，没有 feed；华裔博物馆 `/events/` 是 404；陈氏演艺中心、市立剧院、科学馆、温哥华美术馆没找到 feed；vancouver.ca 挡（403）。和 Ticketmaster 重的场馆（比如 Commodore）等 A4 去重做了再接。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-25 What's On: Eventbrite, the organizations followed, with Steve's own token
- 2026-11-25 What's On: Showpass, every date and every season (the Christmas Market, VanDusen's lights)
- 2026-11-19 What's On: Ticketmaster's long names no longer turn down the sentence that goes with them
- 2026-11-19 What's On: every date of an event gets the same Chinese, asked once; a name written two ways goes the commonest way
- 2026-11-19 What's On: a picture cut to 3:1 keeps more of its top, where the faces are
- 2026-11-19 What's On: each AI step gets its own events, and a new prompt tries again what the old gave up on
- 2026-11-19 What's On: an answer turned down takes the old Chinese with it
- 2026-11-19 What's On: Ticketmaster keeps its own names, and the AI's praise or guessed origins aren't kept (v3)
- 2026-11-19 What's On: the AI writes only what it's told (prompt v2), and writes every event again
- 2026-11-19 site check: 玩什么 no longer drags sideways on a phone; names and contrast in 抓紧了 and 到此一游（全站检查的对话改的）
- 2026-11-19 What's On: the Chinese page shows each event's name in Chinese, a sentence on what it is, and the source's picture
- 2026-11-18 What's On: SFU's calendar joins the morning run, what anyone can walk into
- 2026-11-18 What's On: a daily health check opens an issue when a source wasn't read
- 2026-11-14 What's On: link to /go/ with the slash, so the page opens from the Tools tab and its filters
- 2026-11-14 What's On page: the fixes from its review
- 2026-11-14 What's On goes live: the page at changle.ca/go and its card on the Tools tab
- 2026-11-12 feat(events): C2 JSON-LD 活动解析器
- 2026-11-12 fix(events): C1 iCal recurrences, overrides and time zones
- 2026-11-12 What's On: filtered calendars named in Chinese and English; an all-day start or end given as a time counts by its date
- 2026-11-12 feat(events): add RFC 5545 calendar subscription feed (C6)
- 2026-11-12 fix(events): correct Ticketmaster categories, statuses and prices (C3)
- 2026-11-12 What's On: the token test checks its time cases at one clock reading (it failed at random)
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
- 2026-11-12 04:45 合并 #353、#302、#301、#334，Cloudflare 部署成功；取了一次线上的日历订阅：618 个活动，ical.js 读回全对。同一天把日历合并后的几处小尾巴自己改掉：按筛选订阅的日历用中英文起名（`玩什么 · What's On · 亲子家庭 Family & Kids`，原来是英文代号 `family`）；删掉用不到的 501 分支；全天活动的开始或结束是温哥华时间（带时分）时按它的日期算，日历里不再跳过它，入库时也不再算出 NaN 被窗口悄悄丢掉；结束读不出就当没有结束。新测试在旧代码上都会红。
- 2026-11-12 Codex 第四轮改完，这一轮我自己审（改动很小）：
  - #305 C1：四条都对。写坏的 UNTIL 只丢它自己那个系列，健康的活动照常出；`plainText` 碰上 4800 个不换行空格、全角空格、没闭合的 `<`，从 14 到 29 毫秒降到 0.02 到 0.04 毫秒；UBC、Luma 和边角夹具的输出和上一轮一样，只是 UBC 描述里的不换行空格变成普通空格。只有 GEO 的改期配母系列的地点和自己的坐标。卡片测试 57 个、全部 270 个；和最新 main 合起来 485 个都过。
  - #303 C2：三条都对。用真解析器试过：同一天加一个不相干的活动，Jazz 的 id 不变；同一天两场 Storytime 带时分秒；片段里的 `?id=1`、`?id=2` 给两个 id，`utm` 去掉但 `#t` 留着；标题多个空格、tab 还是同一个 id；胡桃夹子只剩最后一天 id 不变；同一网址全天和 19:00 两个 id 不撞。卡片测试 113 个、全部 326 个；和最新 main 合起来 541 个都过。
  - 05:25 合并 #305、#303，Cloudflare 部署成功。
- 2026-11-14 Steve 问进展、说「可以上线 tools 里面」。这两天的早上那一轮都正常（14 日早上 638 个，图书馆中午交来后 664 个）。做了正式页面 `/go`（`src/page.ts`，测试 12 个）和工具页的卡片（`site/src/tools/WhatsOn.tsx`）；标签和日期的写法从预览页挪到 `src/labels.ts`，两页共用。
- 2026-11-14 合并 #547 后在线上点了一遍：`changle.ca/go` 是新页面，但 `changle.ca/go?lang=zh` 打开的是网站首页。Cloudflare 的路由 `changle.ca/go` 只认不带查询串的地址，带 `?` 的落到网站上；`changle.ca/go/?lang=zh`（带斜杠）对上 `changle.ca/go/*`。工具页的卡片和页面里的每个筛选链接都带了 `?lang=`，所以全都打不开页面。改成所有链接都用 `/go/?…`（卡片、筛选、语言切换，脚本跳转时也改到 `/go/`），测试检查每个链接都带斜杠。没改 Cloudflare 的路由设置。
- 2026-11-18 每天的检查（来源出错时通知）：GitHub 每天 02:23（温哥华）跑 `events-health`，到 Worker 自己的地址读 `/go/api/status`（那个地址现在也答这个，别的照样 404），判断前一天：清单里的每个来源那天或之后读完了没有、那一轮发布了没有、发布数有没有不到之前几轮中位数的一半；状态页三次都打不开也算问题。有问题就开 issue（标题「玩什么：11月18日的检查没过」），正文 @ Steve、一条一条写哪个来源、上次读完是哪天、最后的错误，末尾一行隐藏标记记着是哪几样问题；第二天还是这几样就不说话，变了才评论，好了评论一句并关掉。`/go/api/status` 多了 `sources`（只列代码里还有的来源）和 `history`（最近 8 轮各发布多少）。新测试 16 个；全部 629 个都过。
- 2026-11-18 合并 #603 后在 GitHub 上手动跑了一次 `events-health`：从 GitHub 的机器读 Worker 自己地址上的状态没被挡，6 个来源都读完、发布 644 个，没开 issue（「nothing to do」）。
- 2026-11-18 接 SFU（events.sfu.ca，LiveWhale 的 JSON v2，`src/parsers/livewhale.ts`）：两周约 180 个，每页 50 个、4 页，一页读起来约 1 毫秒（第一次 5 毫秒）。按 SFU 自己的「Public」受众筛，加上 UBC 那条规矩（见定过的事），第一页 50 个留 8 个（展览、讲座、电影、毕业展、Western Front 的声音演出），最后一页 28 个留 6 个。LiveWhale 把系列活动的每一场单独给一个号，id 用条目号加日期；但多天的全天活动（展览、捐食物）每天重复同一个号，这种合成一个活动，从第一天到最后一天（`repeats_start`、`repeats_end`），页面上就收进「进行中」，不会每天占一行。地方没写城市的按校区算（本拿比、温哥华、素里）。价钱：Free 是免费，写了金额的取最低最高，「from $10」只有最低，捐款、随意付是不知道。顺手改了 `placeFromText`：「Vancouver BC V6B 1L6」写在一段里时城市读对，街道不再当城市（UBC、Luma、JSON-LD 共用，测试都过）。`sfu` 那一步排在 UBC 后面、Ticketmaster 前面。噪音：「Holiday Food Drive」（捐食物，11 月 17 日到 12 月 9 日）也标了 Public，先留着（收在进行中里），等 A3 的 AI 再判断。
- 2026-11-19 中文名、介绍和图片（Steve 11 月 18 日夜里看了页面，说选中文活动名还是英文、要中文说明是什么活动、要配图）。Workers AI 选 `@cf/qwen/qwen3-30b-a3b-fp8`：中文好，最便宜的一档（输入 0.051、输出 0.335 美元每百万 token）；GLM、Kimi、DeepSeek v4 要付费计划。先在 Cloudflare 的 AI Playground（不用登录）用 15 个真实活动试了两版提示词：第一版把 Canucks 编成「维多利亚喷气机队」，加了「名字保留英文、本地球队用通行中文名」后对了；介绍 20 到 40 字，像样。Playground 的显示把每个字重复了一遍，是它界面的问题（Worker 不走流式）。做法：迁移 0004 加 title_zh、text_hash、ai_hash、ai_tries；`store.ts` 每次存都算 text_hash（标题、说明、场地），文字变了 ai_tries 归零、重写一次；每小时 5 分 `catchUp` 三个一组调 `Steps.translate`（每步一次 AI 请求、15 个活动），最多 10 轮（Cloudflare 一个请求最多 32 次调用）或 12 分钟，写了就重新发布（早上那一轮在跑时不发布，留给它）。答案逐个对象解析，截断只丢最后一个；没中文、太长的不收，一个活动三次不行就先放英文。测试里 `remoteBindings: false`（AI 绑定在本地要登录）。图片：图书馆用 BiblioCommons 的 full 横幅（760×230 左右），Ticketmaster 改成至少 600 宽里最小的 16:9（原来是 2048 宽的大图），UBC 从 iCal 的 ATTACH 读，SFU 要了 thumbnail 字段。页面图片 3:1、最宽 22rem，放在每行最上面。
- 2026-11-19 第一轮 AI（08:05 UTC，#648 上线后第一个整点）：30 步、问了 450 个、写好 433 个，没有报错，然后重新发布（「Chinese for 433 events」），一分钟内做完。看了一遍，图书馆的都好；Ticketmaster 只有名字没有说明的，AI 会编：「Pooh」写成小熊维尼巡演（其实是乐队），夜店 Playhouse 的 DJ 写成「儿童剧场表演，适合家庭」，还有「中国新生代歌手」「世界知名阿拉伯 DJ」这种来历。改了提示词 v2：把来源的分类标签（Ticketmaster 的 Music、Rock）一起给它，没说明的只按名字和标签说类型，不介绍艺人来历，不用「知名」「世界级」；名字看起来像普通词也保留（举了 Pooh 的例子）；作品名可以用《》。在 Playground 用这 10 个难的试过，全对了，只是介绍变短（「职业冰球比赛」），所以句子最短改成 4 个字。ai_hash 记上提示词版本（`AI_VERSION`），v2 上线后下一个整点把所有活动重写一遍（今天总共用免费额度的一半左右）。
- 2026-11-19 v2 在 09:05 UTC 重写了 447 个（问了 450 个，3 个没过），可在生产里 Qwen 还是会犯：「阿曼达·马歇尔：肮脏三十巡演」（音译加直译），「叶耳」「中国新生代歌手」（Ele Yan），「知名阿拉伯 DJ」（Saliah），还把 Tucson Roadrunners 译成「图森野兔队」。Playground 里同样的活动没错，正式跑时一批 15 个混在一起就不稳。所以 v3 不再靠提示词：Ticketmaster 的活动名一律保留来源的原名（艺人、巡演、球队），只用 AI 的那句介绍；AI 写的东西里有「知名」「新生代」这类夸词，或者提到来源里没有的国家、民族（中国、阿拉伯、韩国……），这条不收，下个小时重写，三次不行就只显示英文。v3 上线后再把所有活动重写一遍。
- 2026-11-19 v3 在 10:05 UTC 重写了 446 个：Ticketmaster 45 个里 44 个保留原名，只剩 Saliah 还挂着 v2 的「知名阿拉伯 DJ」，因为 v3 的新答案被拦下后，旧的中文没清掉。改成：答案不能用时，旧的（版本旧或文字变了的）中文一起清掉，页面先显示原文，等好的答案。
- 2026-11-19 11:05 UTC 那轮写完了剩下的 154 个（601 个有中文，其余是已经结束的）。Saliah 的旧中文还在：查出来是三个并排的步骤按「第 0、15、30 个起」取活动，一个步骤写完了，下一个的「第 15 个」就往后挪，两个步骤会拿到同一批，被拒的活动一轮里被算了好几次失败，直接到了三次上限，再也不问。改成每轮先取 45 个的编号，分给三个步骤各 15 个；失败次数只算在同一个文字和版本上（ai_hash 前面加 `!` 记着），版本一换就重新来。
- 2026-11-19 全站检查的对话（凌晨 1 点）顺手修了 `/go`：日期、分类那两排里给读屏用的隐藏文字跑出了横向滚动的行，手机上整页能往旁边拖 480px；两排加了 `position: relative`。
- 2026-11-19 手机上看图：3:1 裁图按正中裁，演出照片常把人的头切掉。#677 改成偏上（`object-position: 50% 30%`），11:18 UTC 部署后重新截图，人脸都在。
- 2026-11-19 12:05 UTC（#676 上线后第一轮）：一步、问了 3 个，Saliah 重写成「Saliah in Vancouver」（原名）加「电子音乐现场演出，阿拉伯DJ Saliah带来高能量表演」，「知名」没了；「阿拉伯」过了检查，说明来源的标签或说明里有 Arab。另外 2 个 Ticketmaster 的（2Dead Boyz、Natalie MacMaster 的圣诞演出）答案还是没过，13:05、14:05 再试，三次不行就只显示英文。
- 2026-11-19 早上查 SFU 时看到：同一个每周活动每天的中文名不一样，因为每一场单独问 AI（648 个活动只有 309 种文字）。Baby Stay and Play 两周里 9 种译名，Family Stay and Play 有「家庭留宿与玩耍」，Peeling Oranges 三晚两个名字。改成：同一来源、同一文字（text_hash）只问最早那一场，答案和失败次数给所有场次；每小时先 `settle`：场次之间说法不一的取最多的那个，新进来的场次直接照抄；再把同一个英文名的不同译名统一成最常见的（翻译优先于原样保留英文，一样多按字排）。按 13:05 的清单算，第二步会改 144 个名字。Ticketmaster、Steve 写的、来源给的分类不动。
- 2026-11-19 14:05 UTC（#679 上线后第一轮）：没问 AI 就改了 164 个（场次照抄、名字统一），清单 648 个里 647 个有中文，同一个英文名只剩一个中文名（Babytime 72 场都是「婴儿时间」）。介绍还有 122 组不一样，全是温哥华、列治文图书馆的：它们的行要等今天 GitHub 交来才有 text_hash，之后那一轮会统一。同一轮发现 2Dead Boyz 一直不过的原因：AI 照规矩把 50 多个字的英文原名整个留下，超过 40 字的名字上限，连那句介绍一起被拒；Ticketmaster 的名字反正用来源的，改成不算它的长度（#680）。这一场已经试满三次，明天就结束，不为它重写全部。
- 2026-11-25 Steve 发来 Google「what to do this weekend vancouver」的截图：VanDusen 灯节、圣诞市集、Hycroft、原住民手工市集都不在清单上，要多接来源（Eventbrite、Daily Hive、人在温哥华、Vansky、小红书等）。查的结果见「定过的事」。Showpass 公开 API：`/api/public/events/`（每一场一条，带票价、说明；圣诞市集和灯节是每半小时一个时段，两周 613 条里 330 多条是时段）和 `/api/public/discovery/`（在卖的产品一条，市集是整季一条，系列是第一场到最后一场一条）。所以分两个来源：`showpass` 读前者、只要一天以内的、不要时段和溜冰场的场次；`showpass-season` 读后者、只要一天以上的、不要系列。UBC 的学生社团大量用 Showpass（会员卡、瑜伽课），按主办方名字和 UBC、SFU 校园的邮编去掉；VanDusen 和 Bloedel 的「某月门票」按名字去掉。Ticketmaster 的圈子（素里和兰里之间 60 公里）。两周大约多 250 个活动。`show_on_calendar` 不能当「不公开」用：Sockeyes 的球赛和舞会也是关的。
- 2026-11-25 Eventbrite（A）：现在的接口是 `GET /v3/organizations/{id}/events/`（旧的 organizers 那条已经不在文档里了），活动对象里有 `organization_id`。所以按「关注的主办方」读：一场活动问一次它属于谁（`/v3/events/{id}/`），记在 D1 的 `eventbrite_follows`；早上那一轮第 0 步先学最多 10 个新的，然后一步读一个主办方。没钥匙时跳过；每天的检查不把「等钥匙」算成问题。起点活动只有两场 Rickshaw 的（从搜索结果里找到的活动编号），等投稿做好了再加。Eventbrite 的回答是照文档手写的测试数据，钥匙加上后的第一个早上要看状态页核对。

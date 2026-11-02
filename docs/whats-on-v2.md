# 题目 v2：「玩什么 · What's On」任务书

Oct 31, 2026 · Steve Jiang

> Exported from Steve's doc (tab 题目 v2 · 任务书), the brief both AIs work from.
>
> **Decided since (Oct 31, Steve):** the first version runs on Cloudflare's **free plan**, no Workers
> Paid. So, where this brief says otherwise: no Workflows (one cron fans the day's run out into
> small steps, each its own request within the free plan's 10 ms CPU); no R2 (the raw fetches are
> kept in KV for 30 days); Ticketmaster is connected once Steve has its key. Everything else stands.
> `tools/events/CONTRACTS.md` says how.
>
> **A correction:** B.C. has kept daylight time all year since 8 March 2026 (UTC-7, now called
> Pacific time), so the clocks did **not** go back on 1 November 2026, as change 5 below and the
> C1 card assume. Times still come from the time-zone database, never a fixed offset, so older
> dates read right; the cross-the-change tests use 2 November 2025, the last real change.

第一版只做一件事并做到可证明的对：每天把大温未来 14 天的活动准确放进一张表，字段对、不重复、不显示已取消的，让人在手机上 60 秒内找到周末能去的。对不对由数字和外部证据说了算，不由你我说了算。与第一个 tab 的方案不一致之处，以本页为准。

## 目标与不做的事

目标只有一个：changle.ca/go 上，大温未来 14 天的活动每天 06:00 准时更新，字段对、不重复、已取消的不显示，手机上 60 秒内能回答「这周六下午列治文 20 加元以内有什么」。

保留：8 个分类、7 个地区、中英界面、.ics 日历订阅（它同时是验证工具）、提交入口（先日历源，后表单）、后台审核。名字和路径沿用第一版默认：「玩什么 · What's On」，changle.ca/go。

第一版不做：分享图、收藏、「我要去」、约伴、个性化推荐、英文摘要、每天多次抓取。全部推到验收门 C 之后。理由：每多一个功能就多一处可能错的地方，而第一版要证明的只有一件事，数据是对的。

## 与第一版方案的 9 个改动

这些是做活动聚合的老手会做、而第一版没写的事。每条都是「少错一类」，不是「多做一样」。

1. 分类和地区先用规则，AI 兜底。Ticketmaster 自带分类（segment、genre），用一张映射表直接对到 8 类；地区由场地地址算出来，不让 AI 猜。AI 只负责没有分类的来源和中文摘要。
2. 建场地表。每个场地只地理编码一次（名称、地址、经纬度、地区），活动挂在场地上。去重和地区判断都靠场地 id，不靠标题文字。
3. 保留原始抓取结果。每个来源每天的原始 JSON、iCal、HTML 存进 R2，留 30 天。解析规则改了可以重跑，不用重新抓；出错了能回溯「那天源头给的是什么」。
4. 不只抓新的，还复查旧的。未来 14 天内已入库的活动每天重新核对，时间改了、取消了、售罄了都跟着变。Ticketmaster 的 status（cancelled、rescheduled、offsale）直接映射。整轮失败就继续显示昨天的数据并告警，页面永远不空。
5. 周期性活动展开。每周语言交换这类 RRULE 规则展开成具体日期；多日活动、全天活动、「时间待定」分开处理；时区固定 America/Vancouver。明天 11 月 1 日就是冬令时切换，正好拿来测。
6. 两层去重。先程序：规范化标题 + 日期 + 场地 id 算指纹，相同即合并；再相似度：同一天同场地、标题相似度过阈值的进「疑似重复」队列，AI 判断后入库。合并后保留每个来源的链接。
7. 升级到 Workers Paid。免费版每次定时任务只有 10 毫秒 CPU，抓几个来源就超；付费版每小时以上间隔的定时任务给 15 分钟。多 7 加元一个月，省掉一堆绕路。用 Workflows 把每个来源做成一步，失败自动重试，一个来源坏了不拖垮整轮。
8. 先要日历源，再要表单。社群组织者多半已经有 Google 日历或活动页，给我们一个公开 iCal 链接就自动同步；表单留给没有日历的人，并且支持传海报，AI 读图预填字段，组织者只需确认。
9. 建黄金集。开工第一天手工标 60 条真实活动当标准答案，每晚自动打分，分数不过门功能不上线。

## 原始素材：从源头拿

第一版方案的来源表是整理过的二手清单。老手先看源头，因为聚合站都是从源头抄的，源头最早更新、字段最全。

| 素材 | 为什么是源头 | 怎么拿 |
| --- | --- | --- |
| 场馆官网：Chan Centre、Vancouver Civic Theatres（Orpheum、QE 剧院）、Commodore、Science World、温哥华美术馆、列治文奥林匹克椭圆馆、各社区中心 | 聚合站从这里抄，这里最先更新、最准 | 先找 iCal 或页面里的 JSON-LD，再用 sitemap.xml 发现新活动页 |
| 原始订阅文件本身：Luma 的 .ics、Ticketmaster 的原始 JSON | 原始数据里有网页上看不到的字段：分类、经纬度、价格区间、status | 先存进 R2 读一遍字段，再写解析器 |
| [schema.org/Event](https://schema.org/Event) 规范 | 全行业的活动数据模型，Google 就按它收录 | 字段表对齐它：startDate、endDate、eventStatus、offers、location、organizer |
| 各活动站的 sitemap.xml | 列出每一个活动页网址，不用翻列表页 | 每天和昨天对比，新网址就是新活动 |
| 市政府开放数据、特别活动许可、道路封闭通告（温哥华、本拿比、列治文、素里） | 节日和大型活动申请许可时就出现，比宣传早几周 | 开放数据门户下载，许可页定期抓 |
| 行政边界：加拿大统计局 Census Subdivision 边界、温哥华市 Local Area 边界 | 地区判断的依据 | 下载 GeoJSON，点在多边形里就是那个区 |
| 大学活动日历：UBC、SFU、BCIT | 留学生是核心用户 | 多数支持 iCal 导出，逐个确认 |
| 华人机构官网和公开日历：中侨、大温中华文化中心、华裔博物馆、唐人街商改会、各社团 | 微信里的活动在官网也会发 | 要 iCal 链接，没有就抓官网活动页 |
| 组织者的海报图片 | 华人圈活动的真正载体是海报 | 表单支持上传，AI 读图提取字段 |
| 10 个真实用户的回答：「你上次去的活动是怎么知道的」 | 产品决定的依据，不是我们的猜测 | 开工前在微信群问完，答案记进这份文档 |

## 方法与工具

指定到工具，Claude Code 和 Codex 不自选。

| 环节 | 用什么 | 为什么 |
| --- | --- | --- |
| 抓取与解析 | Workers 内置 HTMLRewriter 读页面；JSON-LD 直接 JSON.parse（处理 @graph 数组）；iCal 用 ical.js，RRULE 用 rrule 展开；请求带 ETag / If-Modified-Since | 零依赖省 CPU；没改的页面不重抓 |
| 编排 | Cloudflare Workflows，每个来源一步，自动重试；每天 06:00 温哥华时间一个 Cron 触发 | 一个来源坏了不拖垮整轮，每步有日志 |
| 存储 | D1：events、venues、sources、fetch_log、review_queue；KV：当天发布的 JSON；R2：原始抓取结果留 30 天 | 网页只读 KV，秒开；原始数据可重跑 |
| 地理 | 邮编前缀先粗判，再 Nominatim 或 Google Geocoding 取经纬度（每个场地一次），点在多边形里判区 | 确定性、可复查，一次算好永久用 |
| 去重 | 规范化标题（小写、去标点、去 tickets / Vancouver / 年份）+ 日期 + 场地 id 算指纹；token set 相似度阈值 0.85 进疑似队列 | 规则可测、可解释、可调 |
| AI | 温度 0；输出必须过 zod 的 JSON schema 校验，分类地区必须在枚举内，否则退回；按指纹缓存结果；每批 50 条；先 Workers AI，中文摘要不够好再换 Gemini Flash | 可验证、可控成本 |
| 测试 | @cloudflare/vitest-pool-workers 跑单元测试，夹具就是存下来的原始 feed；Playwright 跑页面；每晚跑黄金集评分 | 改了不怕坏，测试不联网 |
| 监控 | fetch_log 记每个来源的条数、耗时、错误；Resend 每天 06:30 发一封摘要邮件：抓了多少、哪个来源失败、低于 7 天中位数一半标红 | 你每天 1 分钟知道健康 |
| 页面 | 现有 Vite / React 栈；stale-while-revalidate；首屏骨架；移动端 LCP 2 秒以内 | 和现有工具一致，不引新框架 |

## 正确性证明：除了你我之外的证据

「我觉得挺准」不算证据。下面每一条都是第三方的、能重复的、带数字的。

| 证据 | 怎么做 | 过门标准 |
| --- | --- | --- |
| 黄金集自动评分 | 60 条手标真实活动，覆盖 8 类、7 区、5 种来源；每晚跑一遍流水线对答案 | 日期和场地字段 ≥ 95%，分类 ≥ 90%，地区 ≥ 95%，误合并 < 1%，漏合并 < 5% |
| 多源一致 | 同一活动在两个独立来源都有且时间场地一致，标高置信；冲突的进复查队列 | 冲突率 < 3% |
| 日历往返 | 10 条活动订阅进 Apple 日历和 Google 日历，跨 11 月 1 日冬令时切换看时间 | 10 条全部正确 |
| 主办方确认 | 给 20 个主办方发邮件附他们的活动链接：信息对吗 | ≥ 10 家回复确认或更正；更正 24 小时内改 |
| Google 对照 | 搜「events in Vancouver this weekend」取 30 条，查我们有没有 | 第一版覆盖 ≥ 70%，第三期 ≥ 85% |
| 真人测试 | 5 个社群朋友，任务：找这周六下午列治文 20 加元以内的活动 | 4 人 60 秒内完成 |
| 交叉代码审查 | Codex 审 Claude Code 的 PR，Claude Code 审 Codex 的 PR，谁写的谁不审 | 每个 PR 有另一方的审查记录才能合并 |
| 每周抽检 | 你随机看 20 条摘要，标「愿意转发 / 不愿意」 | ≥ 80% 愿意转发 |
| 用户纠错 | 每张卡片一个「信息有误」按钮，进后台 | 每周清零，纠错数逐周下降 |

## 分工：Claude Code 与 Codex

分工原则一句话：要判断、要串联、碰配置和密钥的归 Claude Code；边界清楚、有夹具、能跑测试、代码长但机械的归 Codex。后者正是最吃 token 的部分。

| 编号 | 任务 | 谁 | 输入 | 输出 | 验收 |
| --- | --- | --- | --- | --- | --- |
| A1 | 数据模型、D1 迁移、CONTRACTS.md 和 src/types.ts | Claude Code | 本任务书 | 五张表、四个类型 | 迁移能跑，类型能编译 |
| A2 | Workflows 编排、Cron、来源接线、R2 留档、KV 发布 | Claude Code | A1 | 每天一轮跑通 | fetch_log 有记录，KV 有当天 JSON |
| A3 | AI 提示词、schema 校验、指纹缓存、模型切换 | Claude Code | A1、C4 | summarize() 函数 | 黄金集分类 ≥ 90% |
| A4 | 去重策略、疑似重复队列、合并规则 | Claude Code | C4、C5 | 入库前的 dedupe 步 | 误合并 < 1% |
| A5 | wrangler 配置、secrets、部署、Workers Paid | Claude Code | 无 | 合并 main 自动发布 | 定时任务连续 7 天成功 |
| A6 | 审 Codex 的 PR、集成测试、黄金集评分接进每晚任务 | Claude Code | 各 PR | 合并记录 | 每个 PR 有审查记录 |
| C1 | iCal 解析器加 RRULE 展开 | Codex | tests/fixtures/ical/*.ics | NormalizedEvent[] | 单测过，含跨冬令时用例 |
| C2 | JSON-LD Event 提取器，含 @graph | Codex | 10 个保存的 HTML | NormalizedEvent[] | 单测过 |
| C3 | Ticketmaster 映射器、分类映射表、status 映射 | Codex | 保存的原始 JSON | NormalizedEvent[] | 单测过 |
| C4 | 标题规范化、相似度、指纹函数 | Codex | 30 对刁钻用例 | normalize()、similarity()、fingerprint() | 30 对全对 |
| C5 | 地区判定：邮编前缀加 GeoJSON 点在多边形 | Codex | 边界 GeoJSON、50 个地址 | resolveArea() | 50 个全对 |
| C6 | .ics 生成器，VTIMEZONE 正确 | Codex | 10 条样例活动 | /api/events.ics | 日历往返 10/10 |
| C7 | 页面组件：活动卡、分类条、日期切换、地区标签筛选、中英文案、骨架屏 | Codex | 第一版方案的功能节、现有工具的样式 | /go 页面 | Playwright 过，LCP < 2 秒 |
| C8 | 后台审核队列表格 | Codex | review_queue 表 | 后台页面 | 通过 / 退回 / 改摘要三个动作可用 |
| C9 | 黄金集工具：CSV 读取、评分脚本、报告 | Codex | golden.csv | npm run eval | 输出五项指标 |
| C10 | 每日摘要邮件模板 | Codex | fetch_log | Resend 邮件 | 你收到并看得懂 |
| C11 | 补单测、README、维护 CLAUDE.md | Codex | 全仓库 | 文档和测试 | 新会话不用重新摸索 |

协作规则：

1. 先契约后实现。Claude Code 先写 types 和 CONTRACTS.md；每张 Codex 任务卡写明输入夹具路径、输出类型、测试文件名、验收标准。
2. 一个任务一个分支一个 PR，只碰自己的模块。Codex 不碰 wrangler 配置、secrets、数据库迁移。
3. Codex 开 PR 前必须本地跑过测试并把输出贴进 PR；Claude Code 审查只看 diff，不读整个仓库。
4. 夹具进仓库，测试不联网。
5. 谁写的谁不审。
6. 顺序：A1 → C4、C5 并行 → A2、C1、C2、C3 并行 → A3、A4 → C6、C7、C9 → A6 → 验收门 A。

## 省 token 的规则

开发时（Claude Code 和 Codex 的 token）：

- Claude Code 每次会话只读 CONTRACTS.md 和当前那一张任务卡，不读整份方案。仓库根目录的 CLAUDE.md 写死约定：目录结构、命名、测试命令、部署方式，新会话不重新摸索。
- 长而机械的代码全给 Codex：解析器、UI 标记、测试、文档。这类最吃 token、最不需要判断。
- 文件保持小：一个解析器一个文件，Claude Code 审查只看 diff。
- 出错先看 fetch_log 和测试输出，不让任何 AI 重读原始 feed 找问题。
- 一个功能只开一个会话做完，不在聊天里来回粘贴代码。

运行时（AI 摘要的 token）：

- Ticketmaster 这类自带分类的来源不过 AI 分类，只做中文摘要。
- 同指纹的活动永不重复摘要，结果按指纹缓存在 D1。
- 只给 AI 标题、时间、场地、去掉 HTML 后的前 600 字描述。
- 每批 50 条、温度 0。每天新活动约 50 到 80 条，一个月不到 100 万 token，Workers AI 免费额度内；换 Gemini Flash 也不到 1 加元。

## 三道验收门

不按周排功能，按门排证据。门没过，后面的不开工。

| 门 | 证明什么 | 必须过的指标 | 过了才能做 | 目标 |
| --- | --- | --- | --- | --- |
| A 数据对 | 流水线每天准时出对的数据 | 黄金集五项全部达标；定时任务连续 7 天成功；日历往返 10/10 | 页面上线 | 第 2 周末 |
| B 能用 | 真人能靠它决定周末去哪 | 真人测试 4/5；Google 对照 ≥ 70%；移动端 LCP < 2 秒；每周抽检 ≥ 80% 愿意转发 | 对外宣传；开放提交入口 | 第 3 周末 |
| C 社群在 | 华人活动真的进来了 | ≥ 5 个组织者日历接入；≥ 10 家主办方确认；中文活动占比 ≥ 10% | 第一版方案里推迟的功能：分享图、收藏、约伴 | 第 6 周末 |

## 第一条指令

先把这个 tab 导出成 Markdown，存进仓库 docs/whats-on-v2.md，两边的 AI 都读同一份。

给 Claude Code：

```markdown
读 docs/whats-on-v2.md。本次只做验收门 A 之前的地基，按分工表的 A1、A2、A5 做：
1. npx skills add cloudflare/skills@workers-best-practices，之后 Worker 都按它写
2. 写 tools/events/CONTRACTS.md 和 src/types.ts：NormalizedEvent、Venue、Source、FetchLog 四个类型，字段对齐 schema.org/Event 和任务书的字段表
3. wrangler：Workflows 一个（每个来源一步），Cron 每天 06:00 温哥华时间（按 UTC 写，注意冬令时），D1、KV、R2 绑定，Ticketmaster key 放 secret；部署方式和 tools/suibian 一样
4. D1 迁移：events、venues、sources、fetch_log、review_queue 五张表
5. 接通 Ticketmaster 和 Luma 两个来源，原始结果存 R2，跑通一次写 D1 和 KV，把 fetch_log 给我看
6. 给 Codex 写 C1 到 C6 六张任务卡放进 docs/codex-tasks/，每张写明输入夹具路径、输出类型、测试文件名、验收标准，并把夹具文件存进 tests/fixtures/
第 5 步做完停下给我看，我说继续再做第 6 步。
```

给 Codex（每次只发一张卡）：

```markdown
按 docs/codex-tasks/C1-ical-parser.md 实现 tools/events/src/parsers/ical.ts。
实现前先读 src/types.ts 和 CONTRACTS.md，输出类型必须是 NormalizedEvent[]。
只改这个文件和它的测试 tests/parsers/ical.test.ts，夹具在 tests/fixtures/ical/。
必须包含跨 2026-11-01 冬令时切换的用例。
跑 npx vitest run tests/parsers/ical.test.ts 通过后再开 PR，PR 描述里贴测试输出。
不碰 wrangler 配置、secrets、数据库迁移、其他模块。
```

## 仍需你拍板的 3 件事

第一版方案里的 5 件（名字、范围、审核、AI、抓取次数）都按默认走了。新的只有这 3 件：

1. 升级 Workers Paid，约 7 加元一个月。建议升。不升，定时任务 10 毫秒 CPU 跑不完一轮，整个架构要绕路。（Oct 31：Steve 定了先不升，第一版按免费版做。）
2. 黄金集 60 条谁来标。建议你标 20 条华人圈的活动，我标 40 条英文的，周一前标完，它是验收门 A 的尺子。（Nov 1：Claude 标的 40 条已进仓库，Steve 定了 40 条就够，华人圈的 20 条不标了。）
3. 主办方确认邮件用哪个邮箱发。建议用 changle.ca 域名的邮箱（Resend 已验证），不用公司邮箱。

参考：[Workers 限额](https://developers.cloudflare.com/workers/platform/limits/)（免费版定时任务 10 毫秒 CPU，付费版每小时以上间隔 15 分钟）、[Workflows 定价](https://developers.cloudflare.com/workflows/reference/pricing)（免费版同样 10 毫秒 CPU）。

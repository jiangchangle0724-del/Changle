# 工具 · 约时间（when）

对话名「工具 · 约时间」。网址 changle.ca/when（还没上线）。档案建于 2026-11-12；以后由这个对话维护。

## 它是什么

朋友聚会约时间。发起人建一个链接丢进微信群，每个人在自己手机上点有空的时段，页面实时显示大家重叠最多的时间，发起人一键定下，复制一段文案回群里。谁都不用登录。定下以后问一句：接着定吃什么（去随便），还是玩什么（开席开一桌，或者看玩什么的活动）。英文名 When Works。完整方案在 [`docs/when.md`](../when.md)。

## 文件

功能代码还没有。地盘：

- 方案：`docs/when.md`（Steve 的 Claude 文档的副本，原文链接在它开头；两边不一致时以 Claude 文档为准）
- 工具本身：`tools/when/`（自己的 Worker `when`，路由 changle.ca/when 和 /when/*，照随便的样子：Preact 页面用 esbuild 打包，页面文件在 `dist/client/when`）
  - `src/engine/`：规则，不碰浏览器也不碰 Cloudflare，测试直接导入。时段和日期（`slots.ts`）、最佳前三（`rank.ts`）、温哥华时间（`time.ts`）、日历文件（`ics.ts`，C2）、节假日（`holidays.ts`，C3）、文案（`copy.ts`，C4）
  - `src/room/`：一个活动一个 Durable Object（`EventDO`，自带 SQLite），和手机之间的消息格式（`protocol.ts`）
  - `src/server/worker.ts`：建活动、把请求交给活动、给每个活动的页面写好标题
  - `src/client/`：手机上的页面、中英文、样式；`tokens.css` 是主站 token 的副本（照藏在人群里的做法，测试比对）
  - `tests/`：规则和活动房间的测试，`tests/e2e/` 是手机尺寸的浏览器测试
- CI：`.github/workflows/when.yml`（照 `suibian.yml`：PR 上跑一次，合进 main 再跑一次）
- Codex 的任务卡：`docs/codex-tasks/when/`
- 工具页上的卡片：`site/src/tools/When.tsx`（已经在，藏着：`WHEN_ON_TAB` 是 `false`，过了关口改成 `true`）

共用文件里只加自己那一行：

- `site/src/tools/ToolsTab.tsx`：卡片和顶上的按钮，排在随便前面（已经加了，跟着 `WHEN_ON_TAB` 藏着）
- 和 A1 的第一个 PR 一起加（首页档案定的：新的 Worker 要加进前两处）：
  - `site/src/router.ts` 的 `elsewhere` 和 `site/scripts/sw.template.js` 里同一串路径，加上 `when`
  - `site/public/robots.txt`：`Disallow: /when/api/`
  - `site/vite.config.ts`：本地代理一行
  - `HANDOFF.md`：「What changle.ca is made of」和「Settings」两张表各一行

## 先读

- `docs/when.md`（方案；最后一节是存储、钥匙和微信里的坑）
- `HANDOFF.md` 的「A tool」和「How a change reaches changle.ca」，`docs/DESIGN.md`
- 随便：`tools/suibian/README.md`、`wrangler.jsonc`、`scripts/build.mjs`、`src/base.ts`（自己的 Worker 怎么挂在 changle.ca 的一个路径下面，Durable Object 怎么写）
- 藏在人群里：`games/hide-crowd/tests/design.test.ts`、`scripts/build.mjs`（主站以外的 Worker 怎么用主站的 token）
- 时区：`site/src/tools/tz.ts` 的 `PERMANENT_TIME`（BC 全年 UTC-7 的纠正表）

## 测试

还没有。计划照随便的做法，在 `tools/when` 里：`npm run typecheck`、`npm test`（规则和活动房间）、`npm run test:e2e`（手机尺寸的浏览器，Chromium 和 WebKit）。微信里的事只能在真机上看，见「还剩什么」。

## 定过的事

Steve 定的：

- 2026-11-12：下一个工具做约时间，排在分账工具前面。不登录、半天粒度（上午、下午、晚上，可以切到按天）、带一键文案。
- 2026-11-12：方案按 Claude 文档里的修改建议改（37 处，回答了存储、钥匙、微信三个问题，加了聚会闭环、分工、开工顺序），再加把关的三处：
  1. 关口提前到 A2 后面：A2 做完就拉朋友真约一次，A3 做哪些看朋友用过以后再定。
  2. 「最佳前三」的排法写死（见方案「核心流程」第 3 步）。
  3. V1 只有发起人能去随便开桌，其他人看到「等发起人开桌」。
  Steve 的原话：「可以，建议完了直接开工」。
- 规矩照旧：一个改动一个分支一个 PR，CI 绿了自己合并，合完告诉 Steve 上线了什么；花钱、删数据、动 Cloudflare 或 GitHub 的设置和钥匙先问。

这个对话定的（方案没写到的细节，Steve 可以改）：

- 时段的钟点，加到日历和带去随便时用：上午 9:00 到 12:00，下午 13:00 到 17:00，晚上 18:00 到 22:00；按天的活动在日历里是全天。带去随便的饭点照方案：上午、下午是 12:00 的午饭，晚上是 18:30 的晚饭。
- 候选日期最远到建活动那天起 8 周，最多选 31 天；默认未来 14 天全选上，点一下去掉或选回来，不用拖。
- 三档用点的：没填、有空、可以调，点一下换一档。「可以调」算能来，理由里单独写出来。
- 一个活动最多 40 个人填，昵称最多 16 个字。
- 活动的网址是 8 位小写字母和数字（去掉容易看错的 0、o、1、l、i），管理码 6 位数字。
- 填写和定下走普通请求，推送走 WebSocket；连不上就每 10 秒拉一次。普通请求在微信里最稳，断线也不丢填的东西。
- 60 天清理从建活动那天算。
- 时间一律按温哥华 UTC-7 算（2026-03-08 起全年如此，约时间里的日子都在这之后），不信手机和服务器的时区表。

## 现在

2026-11-12：A0 做完。有方案、档案、档案目录里的一行、Codex 的五张卡、工具页上藏着的卡片。没有功能代码，线上没有变化。

下一步是 A1（最小能用的版本），第一个 PR 先把 `tools/when` 的骨架、规则和测试、CI 立起来，C1 到 C3 的卡等它合并以后再发。

## 还剩什么

- A1：建活动、填写、热力图、最佳前三（含必到的人和最少人数）、定下、发起人钥匙和管理码、实时、60 天清理、中英文。
- A1 合并前要 Steve 点头的一步：在 Cloudflare 新建 Worker `when`，接上 GitHub（Workers Builds：根目录 `/tools/when`，构建命令 `npm run build`，部署命令 `npx wrangler deploy`，生产分支 `main`，只盯 `tools/when/*`，照 `tools/suibian/README.md` 的写法）。这是动 Cloudflare 设置。
- 工作名和路径（约时间 · When Works、changle.ca/when）是方案的建议，Steve 没有改。路径上线后不好改，A1 上线之前再跟 Steve 确认一次。
- A2：结果文案、加到日历、「接着定吃什么还是玩什么」、带参数去随便。
- 关口：Steve 用两部手机（一部在微信里）建一个、填一个，2 分钟内走完；再拉 3 到 8 个朋友真约一次。过了把 `WHEN_ON_TAB` 改成 `true`，补工具页的参考截图。
- A3（看朋友用过以后再定做哪些）：邀请图和结果图、还差谁和催人文案、代填、一键快填、谁在看、节假日标注。
- 微信里要在真机上看的：安卓和 iPhone 各走一遍建、填、定、复制文案；页面标题在转发卡片上对不对；切到聊天再回来会不会自己连上；调大字体排版乱不乱。
- 方案「能用上的技能」里要装的三个（Cloudflare 的 durable-objects 和 workers-best-practices，Microsoft 的 playwright-cli）还没装：装技能是 Steve 账号里的事，这个对话装不了。

## 交给别的对话

- 工具 · 随便：
  - 读约时间带来的参数，开桌页预先填好。这边的提议（参数名随便对话可以改，改了请写回这里）：`/eat/?from=when&code=<活动的 8 位码>&date=2026-11-21&time=18:30&occasion=<朋友聚会的那个场景>&people=7`。
  - 让微信里的发起人也能开桌：换成邮箱验证码登录，或者凭一个已定的约时间活动免登录开一桌（每个活动限一桌）。两条路选哪条要 Steve 定。
  - 结果卡上加「带回约时间」；一周以后的日子按每周营业时间排，注明节假日可能不同。
- 工具 · 生活小工具：`ToolsTab.tsx` 里约时间的卡片和按钮已经放在随便前面，藏着。亮出来以后顶上是五个按钮，370 宽以下的手机要看一眼挤不挤；工具页的两张参考截图（`tools-zh`、`tools-en`）到时由这个对话补。
- 工具 · 玩什么：正式页开了以后，给一个按日期打开的链接，比如 `/go?date=2026-11-21`。
- 平台 · 首页与上线：A1 的第一个 PR 会在 `router.ts` 的 `elsewhere` 和 `sw.template.js` 里加 `when`。
- 平台 · 账号与头像（V2）：给一个读登录用户昵称和动漫头像的小接口。

## 最近的改动

提交记录原文，最新的在上面。

- 2026-11-12 约时间：建档案、存方案、Codex 的卡、工具页的卡片（先藏着）

## 记录

- 2026-11-12 建档案。方案是当天早些时候 Steve 和 Claude 聊出来的 Claude 文档，另一个对话读过仓库后往里加了 37 处修改建议；这个对话把关（Cloudflare 免费额度、KV 的延迟、BC 的时区、微信分享卡片和 Google 登录的限制，都对过官方来源），加了三处建议，Steve 说直接开工。这个对话是 Steve 在手机上开的，不在 changle.ca 的 Project 里；换对话接手时从这份档案接上。

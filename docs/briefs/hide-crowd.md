# 游戏 · 藏在人群里（hide-crowd）

对话名「游戏 · 藏在人群里」。网址 changle.ca/hide，首页卡片 changle.ca/g/hide-in-the-crowd。档案建于 2026-11-03，游戏从 Codex 的 PR #5 搬进 changle.ca 时写的；以后由这个对话维护。

## 它是什么

联机的人群派对游戏：每人用自己的手机（横着拿）控制人群里的一个人，混在 18 个电脑带着走的路人里。走得像路人，别人就认不出你；认出对手就出拳：打中得 1 分，打到路人自己愣一下，被打中的人爬起来换进人群里另一个身体。先到 3 分、或者 75 秒后分最多的赢；每局结束被认出最多的人喝一口。三个 3D 场地：温哥华海堤公园、温哥华交通站厅、中式庭院戏台。大屏（电视或电脑）显示整个人群，不标出谁是真人。2 到 8 人，从 changle.ca 的一张桌子开始，玩完回到这桌；一部手机是对三个电脑对手的练习（changle.ca/hide/practice）。

## 文件

- 游戏本身（自己的服务器，Worker `hide-crowd`，每个房间一个 Durable Object）：`games/hide-crowd/`
- 桌子上的接入：`site/src/party/hide/`（`link.ts`、`NetHide.tsx`、`HideSolo.tsx`、`TvHide.tsx`），样式 `site/src/styles/hide.css`
- 桌子上的替身规则：`site/src/shared/engine/games/hide.ts`
- 共用文件里只加了自己那一行：`registry.ts`（卡片）、`protocol.ts`（`HideView`、`ONLINE_GAMES` 最后一个）、`games/index.ts`、`App.tsx`、`NetGame.tsx`、`TvApp.tsx`、`router.ts`（`/hide` 不归网站管）、`vite.config.ts`（本地代理）
- 3D 布景的 Blender 脚本：`games/hide-crowd/tools/blender/generate_arena_dressing.py`

## 先读

- `games/hide-crowd/README.md`（怎么跑、怎么接 Cloudflare、花不花钱）
- `games/hide-crowd/DESIGN.md`（样子、每张图从哪来、改设计时要守住什么）

## 测试

- 在 `games/hide-crowd` 里：`npm run typecheck`、`npm test`、`npm run test:e2e`（本地 Chromium；GitHub 上 Chromium 和 WebKit）；CI `.github/workflows/hide-crowd.yml`
- `site/tests/hide.test.ts`（桌上的替身规则，在 site 的 CI 里）
- `site/scripts/hide_test.py`：从一张桌子把交接、一局、大屏和回到这桌走一遍（要在本地跑起这个游戏，见 `HANDOFF.md`）

## 定过的事

- 11-02 Steve 定的：Codex 的人群游戏（PR #5）改名「藏在人群里 · Hide in the Crowd」，搬进 changle.ca，像到此一游一样从桌子开始。
- 地址是 changle.ca/hide（Worker 的路由），不用单独的子域名。光打 `/hide` 去首页卡片，`/hide/tv` 去网站的大屏。
- 外框用网站的设计（token、两种字体、按钮、面板、开关、惩罚章），游戏自己的灯光色 #7be55c（叶绿）；场地和人物保留原来的画。首页卡片在「线上」那一类。
- 惩罚：被认出最多的人喝一口，打平都喝；谁都没被认出，全桌喝。桌上设了自己的惩罚，就换成那个，游戏里不出现「喝」。主人在大厅可以关掉（默认开）。
- 大屏和任何手机收到的数据都不标出谁是真人：人群顺序每局打乱，不发编号和名字，只有自己的手机知道哪个是自己。
- 被打中的人爬起来以后，和离打他的人至少 24 格远的一个路人换身份，谁都不跳；不然一站起来又被同一个人打。
- 背景图和人物图是 AI 画的（ChatGPT 的图像生成，OpenAI），Codex 在 PR #5 里做的；3D 布景是我们自己的 Blender 脚本从零搭的；字体是 SIL OFL。都写在游戏的「素材来源」页（`/hide/credits`）和 DESIGN.md。图压成 WebP：3.63 MB 变 1.86 MB，一局只下载约 0.7 MB。
- 服务器：一局里人群在内存里每秒走 20 步，只在有事时（加入、投票、打中、结束）存一次。免费版就够，一天几百局都在额度里。

## 现在

- 2026-11-03 搬进来的 PR 开着（替代 Codex 的 PR #5），等 Steve 先在 Cloudflare 接上 Worker `hide-crowd`（`games/hide-crowd/README.md` 里的中文步骤），再合并。合并以后首页就有它的卡片（12 月 3 日前带「新」）。

## 还剩什么

- 等 Steve：Cloudflare 接上 Worker、合并；然后在 Workers & Pages 里删掉 Codex 旧的 Worker 和它的子域名（README 第 5 步）。PR #5 可以关掉。
- 真手机试玩：iPhone 和安卓各一台，横着拿，4 个人以上玩一局；地址后面加 `?fps=1` 看帧数。
- 没有声音（Codex 的版本也没有）：出拳、打中、倒计时的声音可以以后加，要守站上的声音规矩（能静音、没声音也能玩）。

## 交给别的对话

- 平台 · 大屏：「只看」的手机看大屏画面（#149、#158 那一批）合并以后，藏在人群里不在 `watchable` 里，只看的手机照样显示 `NetHide.tsx` 的「打开它的大屏」按钮，能用。想和到此一游一样整屏，就在 `site/src/tv/views.tsx` 的 `watchable` 加上 `hide`，在 `Watch.tsx` 像 `TripAway` 一样加一个去 `hideUrl(code, table, true)`（`site/src/party/hide/link.ts`）的画面。
- 平台 · 首页与上线：首页「先玩这些」（`STARTERS`）要不要放藏在人群里，由首页对话定；卡片现在排在 `GAMES` 最后。
- 平台 · 房间与联机：大家都去了别处的游戏（到此一游、藏在人群里）时，留在桌上的座位（比如「只看」的手机）25 秒后就成了这桌的主人（`room.ts` 的 `host-away`），原来的主人回来已经不是主人。藏在人群里这边绕过去了（`NetHide.tsx`：留在桌上的手机盯着游戏，结束了就由现在的主人收桌）。要不要在这种游戏进行时不换主人，或者主人回来时还给他，由房间对话定。
- 游戏 · 到此一游：`NetTrip.tsx` 有同样的空子：只有回来的原主人会自动收桌。主人换了人（比如有人中途回到桌上），新主人的手机还显示「还在进行」，要他自己点「结束这局」，别人停在「等主人回到大厅」。可以照 `NetHide.tsx` 的做法补上。

## 最近的改动

提交记录原文，最新的在上面。

- 2026-11-03 藏在人群里 · Hide in the Crowd: Codex's crowd game, renamed and brought into changle.ca

## 记录

- 2026-11-03 建档案。

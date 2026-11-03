# 游戏 · 到此一游（trip）

对话名「游戏 · 到此一游」。网址 changle.ca/trip，首页卡片 changle.ca/g/been-there。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

联机的城市地产派对游戏：22 座真实城市，每座一条来自真实事实的规则；最多 6 队，每队 1 到 3 人；大屏（电视或电脑）显示棋盘。从 changle.ca 的一张桌子开始，玩完回到桌子。

## 文件

- 游戏本身（自己的服务器，Worker `been-there`）：`games/been-there/`
- 桌子上的接入：`site/src/party/trip/`（`link.ts`、`NetTrip.tsx`、`TripSolo.tsx`）
- 桌子上的替身规则：`site/src/shared/engine/games/trip.ts`

## 先读

- `games/been-there/README.md`
- `games/been-there/DESIGN.md`（样子和动作，改设计时要守住什么）

## 测试

- 在 `games/been-there` 里：`npm run typecheck`、`npm test`、`npm run test:e2e`（Chromium 和 WebKit）；CI `.github/workflows/been-there.yml`
- `site/scripts/party_test.py trip`（要在本地跑起到此一游，见 `HANDOFF.md`）

## 定过的事

- 第 5 步定了样子：1930 年代旅行海报风，圆形转盘棋盘，六个棋子角色。
- 第 6 步加了城市内容：等待的队答城市问答，大屏上出真实事实，每座城一张真实照片和一段当地录音，来源页列出每个出处和许可。
- 派对惩罚不带酒，做完点「完成」才继续，主人可以跳过。
- 答错问答扣一点钱。
- 自己的回合在手机上第一人称走棋。

## 还剩什么

- 弹题改版（GitHub issue #36，Steve 10-31 提的，一直没人做）：弹题统一出现在屏幕最上面；开题前可以选「这题不答」，不罚；一局里不重复，同一台手机尽量不出看过的；每座城市至少 8 道有趣的冷知识题（中英文，每题留出处，加进来源页）；修好「有时点了没反应、答不了」。原来那条「每座城市更多的事实」并进这里。
- 手机版（issue #37 剩下的三条，买房那条 10-31 修好了）：游戏里可以选地图大小（小、中、大，记在手机上）；棋盘上的人物再大一些，几队停在同一座城也看得清；手机逐屏过一遍（390x844 和 375x667：大厅、轮到自己、别人的回合、拍卖、交易、问答、移民局、结局），不被刘海和底部横条挡，按钮不小于 44px，不横向滚动，要和 iPad、电脑一样好用。
- 更多色彩、更真实（issue #44，Steve 10-31 提的，一直没人做）：中间的地图换成真实卫星地图（NASA 的白天图和夜景灯光图，按每座城市现在的当地时间显示白天或夜晚），飞行画成大圆航线；第二次到同一座城市时，所有手机和大屏放这个国家的当地热歌，一直放到这一队的回合结束（iTunes 30 秒试听循环，标出歌名和 Apple Music 链接，声音关了就不放）。Steve 让帮他想的沉浸感点子写在 issue 里：到达时显示当地时间、天气和当地问候语，价格旁边显示当地货币。
- 11-01 试玩查出来、一直没修：英文手机上默认名字是「玩家1」（`src/room/room.ts` 里的 `玩家${n}`）；英文界面里「（you）」用的是中文括号（`src/client/ui/Lobby.tsx`）；iPhone SE 英文版城市名被截（Buenos Aires）；有人不掉线但一直不动会卡住整局（只有掉线才有电脑接手，没有回合计时）。
- 等 Steve：10 分钟真人试玩，用菜单里的测速填记录表（节拍表的试玩页，10-30 交给他的）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-10-31 到此一游 e2e: the optional tap that skips the landing scene can't hang the buy test
- 2026-10-31 到此一游: party forfeits hold the game until they're done; a wrong quiz answer costs a little
- 2026-10-31 到此一游 on phones: the question comes first, so the buy button is in sight
- 2026-10-30 到此一游: nothing tells the landing before the stamp; timing tests that hold on WebKit
- 2026-10-30 到此一游: your turn, deeper: the beat sheet's move on every screen
- 2026-10-29 到此一游: a ride waits for a long vote, and gives way to a short clock at once

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。

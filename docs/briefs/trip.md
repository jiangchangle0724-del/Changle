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
- 弹题（等着的队抢答）11-02 改版（issue #36）：
  - 只在答得了的手机上弹出，统一在屏幕最上面，每次同一个位置，盖在别的东西上面（派对惩罚除外）；横拿手机时横在顶上、三个选项并排；大屏放在「现在」那一栏的最上面。答不了的手机（出题时正在走棋的队、观众）只在行动窗口里看，没有可点的选项。
  - 「有时答不了」的原因：出题时正在走棋的队，回合很快结束、题还没完，手机上照样有三个选项和「第一个答对的队 +$20」，点了没反应。现在它回合一结束（题还剩 4 秒以上）也能答。另外两个看不到的情况一起修了：题在行动窗口底下、轮到自己时被挡住；自己第一视角走棋时行动窗口收起来，题也跟着看不到。
  - 每台手机可以点「这题不答」，不罚钱；一队的手机都不答，这队就算答完。房主在大厅有「城市抢答」开关，默认开，关了整局不出题。
  - 一局里同一道题不出两次，题出完就不再出。每台手机记住被问过的题（最多 200 个），进房间时告诉服务器，先出没看过的。
  - 题库在 `games/been-there/src/room/triviaBank.ts`，纯数据：每道题有 id（`cairo-01`，不改不重用）、城市、题目、三个选项（对的在第一个，$20 奖励和 $10 罚款是按三个选项定的）、答完显示的「你知道吗」一句、出处网址。`tests/trivia.test.ts` 逐条检查。只有房间（服务器和单机试玩）读题库，手机拿不到答案；来源页的出处由服务器 `/trip/api/trivia-sources` 给。
  - 题库 176 道，每座城市 8 道：原来 22 道（出处就是城市规则的出处）加 154 道新的，每道都有出处，另外有人逐条核对过。
- 回合计时（11-02）：轮到做决定的队 60 秒一动不动，所有屏幕倒数 15 秒，然后电脑替他们走这一步，下一步还是他们自己走（和掉线时电脑接手一样，但不托管）。暂停、派对惩罚、拍卖和表决（有自己的倒计时）、走棋和落地动画时不计时；这队做任何事（盖房、交易报价……）都重新计时；电脑队和单机试玩没有。写进了桌子上的规则说明。

## 还剩什么

- 手机版（issue #37 剩下的三条，买房那条 10-31 修好了）：游戏里可以选地图大小（小、中、大，记在手机上）；棋盘上的人物再大一些，几队停在同一座城也看得清；手机逐屏过一遍（390x844 和 375x667：大厅、轮到自己、别人的回合、拍卖、交易、问答、移民局、结局），不被刘海和底部横条挡，按钮不小于 44px，不横向滚动，要和 iPad、电脑一样好用。
- 更多色彩、更真实（issue #44，Steve 10-31 提的，一直没人做）：中间的地图换成真实卫星地图（NASA 的白天图和夜景灯光图，按每座城市现在的当地时间显示白天或夜晚），飞行画成大圆航线；第二次到同一座城市时，所有手机和大屏放这个国家的当地热歌，一直放到这一队的回合结束（iTunes 30 秒试听循环，标出歌名和 Apple Music 链接，声音关了就不放）。Steve 让帮他想的沉浸感点子写在 issue 里：到达时显示当地时间、天气和当地问候语，价格旁边显示当地货币。
- 等 Steve：10 分钟真人试玩，用菜单里的测速填记录表（节拍表的试玩页，10-30 交给他的）。
- 11-02 顺手发现、没改（不在那次的范围）：大屏上右边那栏的记录（log）一直不显示。`styles.css` 里 `@container (min-width: 520px)` 那段的 `.tv-table .feed { display: grid }` 量的是离它最近的容器 `.tv-table` 自己（只有两三百 px 宽），所以 1366x768、1600x900 上也一直是 `display: none`。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-03 到此一游 e2e: on its own turn the quiz test answers before it throws
- 2026-11-03 到此一游 e2e: the quiz test never waits on a closed question; a busy page may sleep through a landing
- 2026-11-02 到此一游: the quiz pops up at the top, answerable or skipped, never twice; 176 questions; a turn clock
- 2026-10-31 到此一游 e2e: the optional tap that skips the landing scene can't hang the buy test
- 2026-10-31 到此一游: party forfeits hold the game until they're done; a wrong quiz answer costs a little
- 2026-10-31 到此一游 on phones: the question comes first, so the buy button is in sight
- 2026-10-30 到此一游: nothing tells the landing before the stamp; timing tests that hold on WebKit
- 2026-10-30 到此一游: your turn, deeper: the beat sheet's move on every screen
- 2026-10-29 到此一游: a ride waits for a long vote, and gives way to a short clock at once

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 弹题改版（issue #36）、题库扩到 176 道、回合计时，以及 11-01 试玩的三处小修：英文默认名 Player 1、英文「(you)」括号、iPhone SE 上城市名换行不截断。
- 2026-11-03 PR #146 的 CI 在 WebKit 上各挂了一个测试，都是测试等错了东西：抢答测试点「这题不答」时题已经到时间关了，就一直等到超时（现在只点还剩 3 秒以上的题，点不到就等下一题；轮到自己时先答题再掷骰子，因为一掷就开始播第一视角，WebKit 忙着画就好几秒点不动）；「同一掷」测试里一部手机忙得一帧都没画，游戏按时钟收掉了这一步，印章没机会出来（10-30 起 main 上就失败过，现在认这种情况，只要那段时间页面真的没画）。

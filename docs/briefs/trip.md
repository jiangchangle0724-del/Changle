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

- 每座城市更多的事实（README 里写着还要加）。

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

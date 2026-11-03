# 游戏 · 林波舞（limbo）

对话名「游戏 · 林波舞」。网址 changle.ca/g/limbo。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

手机贴在胸口往后仰，它测你仰了多少度，过了这一杆横杆再降。没过的出局喝一口。开始前选玩法：

- 经典：仰到横杆的角度，撑一秒多就过。
- 稳住：仰到位以后一动不动撑住，一晃就重来，每杆要撑得更久。
- 跟着动的杆：横杆上下浮动，跟着它仰下去又回来，跟丢超过 1 秒就出局。
- 歪着过：往后仰的同时往左或往右歪到指定角度，每杆方向随机。
- 派对：每杆随机一种（经典、稳住、跟着动的杆、歪着过）。
- 盲仰：看不到自己的角度，凭感觉仰到目标，离得最远的喝。
- 真杆子（只有单机）：拉一根真杆子，手机放音乐记分。

2 到 15 人。单机：手机传着玩，一个一个测；联机：每人一部手机，主人选玩法。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/limbo.ts`（每种杆子要什么、跟着动的杆的路线 `barAngleAt`、派对怎么抽）
- 画面（单机和联机）：`site/src/party/limbo/`（`parts.tsx` 里是横杆画面、量角器和各玩法的测量：`useLean`、`usePose`、`useFollow`、`useBlindLock`）
- 传感器：`site/src/party/sensors.ts`（共用；歪着过用的 `leanAndSide` 在这里）
- 联机的画面数据：`site/src/shared/protocol.ts` 里的 `LimboView` 和 `LimboBar`（共用文件，只改这几项）
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `limbo` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `limbo` 开头的测试
- `site/scripts/party_test.py`（单机和联机）：`limbo` 跑经典和盲仰，`limbo-variants` 跑稳住、跟着动的杆、歪着过和派对。传感器是假的（脚本发 deviceorientation），还有一个照着屏幕上的量角器做动作的假玩家。

## 定过的事

- 手机贴胸口测后仰角度；盲仰玩法看不到自己的角度，凭感觉仰到目标，离得最远的受罚（#66）。
- 没有传感器也能玩：经典、稳住、跟着动的杆、歪着过和派对都由主人判，或者自己说；单机由大家看着判，也可以拉一根真杆子。盲仰离不开传感器，测不了的手机这局当观众。
- 稳住：第一杆撑 2 秒，每杆多 0.5 秒，最多 6 秒；手机朝向离开撑住时的平均方向超过 3° 就算晃了，重来。
- 跟着动的杆：路线只由这一杆的开始时间算（`barAngleAt`），所以每部手机上的横杆在同一个位置。先在最高处停 1.5 秒，再在「这一杆的角度」和「往上 20°（第一杆 12°）」之间来回两趟，每杆快一点；离横杆 10° 以内算跟住，离开超过 1 秒出局。横杆停了才算跟住，主人的勾也要等它停。
- 歪着过：歪 15°、18°、20°、22°，以后都是 25°，每杆随机左右。左右歪不直接用 gamma（手机竖着时 gamma 会跳），由手机的「上」方向算出往后仰和往旁边歪各多少。
- 派对：从经典、稳住、跟着动的杆、歪着过里抽，不连着抽到同一种。盲仰不进派对：它是排名次，不是过不过。
- 大家都没过时，仰得最深的人赢（跟着动的杆：跟住时横杆到过的最深处）。

## 还剩什么

- 等全站设计对话的统一游戏壳（UI 计划 A5，#131 已合并），把这个游戏迁进去（UI 计划 C2）。
- 稳住的 3°、跟着动的杆的 10° 和 1 秒是在电脑上用假传感器定的，要在真手机上试一试，太难或太容易就调这几个数（`parts.tsx` 的 `STEADY_DEG`，`limbo.ts` 的 `FOLLOW_DEG`、`LOST_MS`）。
- 跟着动的杆在「减少动态效果」打开时横杆照样动：动就是这个玩法本身。

## 交给别的对话

- 平台 · 全站设计：Codex 卡 ui-C2 里林波舞那一个 PR（`codex/ui-c2-limbo`）请等这次的玩法 PR 合并以后再从 main 开，或者在它上面做：`Limbo.tsx` 这次改了很多（选玩法的按钮、各玩法的量角器），从旧的 main 开会冲突。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-02 Limbo: 稳住, 跟着动的杆, 歪着过 and 派对 (hold steady, moving bar, tilt through, party) (#134，等 Steve 看)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 Limbo: blind lean (盲仰), hit a target angle without seeing your own (#66)
- 2026-10-31 Players' figures in Truth or Dare, Post-it, Limbo and Freeze Dance
- 2026-10-29 site: sound comes back after another app takes the speaker; dance games silence the lounge music

## 记录

- 2026-11-02 建档案。
- 2026-11-02 Steve 选了之前给的四个新玩法里剩下的三个和派对：稳住、跟着动的杆、歪着过、派对（盲仰在 #66 做过了）。单机和联机都做了，PR #134 等 Steve 看。

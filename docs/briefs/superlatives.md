# 游戏 · 最佳称号（superlatives）

对话名「游戏 · 最佳称号」。网址 changle.ca/g/superlatives。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每轮一个称号，大家投票选人，票最多的拿奖也喝。最后有颁奖典礼。

3 到 15 人。单机：传手机偷偷投票，或者一起指。联机：每人自己手机投，主人可以换题、自己出题、提前揭晓；大屏有自己的画面。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/superlatives.ts`
- 画面：`site/src/party/superlatives/`
  - 单机 `Superlatives.tsx`，联机 `NetSuper.tsx`，大屏 `TvSuper.tsx`（样式 `site/src/styles/tv-superlatives.css`），公用部件 `parts.tsx`
  - `moment.ts`：每个画面开始时回到顶部；底部按钮刚换过的 350 毫秒不接受点击（防连点）
  - `seats.ts`：记住这局见过的座位，离桌的人在揭晓和颁奖典礼上还有名字和头像
- 内容：`site/src/data/superlatives.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `superlatives` 的那一项（共用文件，只改这一项）
- 样式在共用的 `site/src/styles/party.css` 里「superlatives」那一段；联机画面的类型 `SuperView` 在共用的 `site/src/shared/protocol.ts`

## 测试

- `site/tests/engine.test.ts` 里名字以 `superlatives` 开头的两组测试（投票、印章时机、选票号、离桌的得奖者）
- `site/scripts/party_test.py superlatives`：单机一整局（连点、小屏滚动、颁奖典礼干杯）和联机一整局（主人等印章、得奖者离桌、颁奖典礼干杯）
- `site/scripts/watch_test.py zh superlatives`：大屏

## 定过的事

- 每个奖揭晓 2.6 秒后（单机 2.9 秒），得奖的人手机上落惩罚印章。印章是游戏自己的计时器（2026-11-11 起，之前是房间服务器的延时惩罚），所以主人的「下一个奖」要等印章落了才亮，服务器也不接受更早的点击；颁奖典礼的「再来五个奖」同样等 3.2 秒的全场干杯。联机测试要等印章落下、点掉再按「下一个奖」（#97）。
- 单机提前按「下一个奖」：印章马上落，点掉之后才到下一个奖（#141）。
- 每张选票带选票号（`ballot`，换题、自己出题、下一轮都是新号）。手机锁屏回来那一秒投的票带着旧号，服务器不算。
- 单机的颁奖典礼也有全场干杯的印章，和联机一样（2026-11-11 定的，Steve 说修全部问题，没单独说这条；要改回去只删 `Superlatives.tsx` 里的 `toast`）。
- 得奖的人揭晓时离桌：还是得奖者，名字头像照旧，颁奖典礼仍列出他的奖；不再给他落印章。

## 还剩什么

- 联机小屏手机上，主人的揭晓画面会被共用的联机框架往下滚到「下一个奖」按钮，得奖的人可能被顶出屏幕上沿（`site/src/online/useActionsInView.ts` 的「把新按钮带进视野」）。客人的手机没这个问题。要改得由房间对话来，见下面。

## 交给别的对话

- 房间（联机框架）：
  - 顶栏「这桌」按钮的读屏名字不含上面显示的人数，axe 报 `label-content-name-mismatch`（`NetFrame.tsx` 的 `.table-btn`）。
  - 底部表情按钮高 42px，规矩是 44（`online.css` 的 `.react-btn`）。
  - 联机框架没有像游戏壳那样的底部动作区：主人的主按钮在正文里，小屏上「带进视野」会把画面滚走（见上面）。
  - `scripts/watch_players_check.py` 的最佳称号一段还按旧样子检查只看的人的手机（期望看到选票），现在只看的人看的是大屏画面（#149），这段要改。
- 打碟：`engine.test.ts` 里「dj: a night of the host's songs」依赖整个文件共用的随机种子和时钟走到它时的状态，前面任何测试多用几个随机数它就挂（#340 合并后 main 红了一次，#342 让最佳称号的第二组测试把种子和时钟还原才过）。建议那组测试开头自己定种子。
- 全站设计（游戏壳）：底部动作区的按钮一换，原位置的新按钮会接到连点的第二下（`moment.ts` 里 `useFreshTapGuard` 是本游戏自己的挡法，350 毫秒内 `aria-disabled` 并忽略点击，脚本会自动等它过去）。别的游戏也会遇到，放进壳里更好。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-11 最佳称号：主人等印章落下再翻页、票记在选票号上、每个画面回到顶部、底部按钮防连点、八人计数一行、离桌的得奖者还在、单机颁奖典礼全场干杯
- 2026-11-05 ui(C10): resume Superlatives votes and awards (#196)
- 2026-11-04 Merge pull request #157 (a seat that just watches is never counted as a player)
- 2026-11-04 Merge pull request #149 (watching: every game's own big-screen view)
- 2026-11-04 Merge pull request #141 (one phone: the winner's stamp no longer lands on the next award)
- 2026-11-04 refactor(party): the pass curtain can leave its button to the shell's bottom bar (#164)
- 2026-11-04 ui-C2：最佳称号接入底部动作区、玩家条和轮次 (#143)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in the lobby, King's Game, Superlatives and Undercover

## 记录

- 2026-11-02 建档案。
- 2026-11-04 全面试玩（单机、联机、大屏，中英文，手机尺寸），列出 7 个小问题。
- 2026-11-11 7 个都修了，一个 PR（#340，已合并上线）。合并后 main 的 engine 测试红了：新加的测试组动了共用的随机种子，打碟的一组测试靠它；#342 还原。

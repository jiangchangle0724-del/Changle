# 游戏 · 谁是卧底（undercover）

对话名「游戏 · 谁是卧底」。网址 changle.ca/g/undercover。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。简短状态在 `docs/status/undercover.md`。

## 它是什么

每人拿到一个词，卧底的词和大家不同。轮流描述，投票找出卧底。

4 到 15 人。单机传一部手机，联机每人一部。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/undercover.ts`。它导出的 `maxSide`、`maxUc`、`defaultUc` 是两种玩法共用的人数算法，单机画面也从这里拿。
- 单机画面：`site/src/games/Undercover.tsx`
- 联机画面：`site/src/online/games/NetUndercover.tsx`
- 内容：`site/src/data/undercover.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `undercover` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `undercover` 开头的三个测试：发词与投票；同一下点两次只走一步；人数跟着桌子变、离桌定胜负
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py`（联机）

## 定过的事

- 至少 4 个人。
- 白板跟卧底算一边。
- 卧底人数两种玩法一个算法（11-20）：卧底一边（卧底加白板）最多占 (人数-1)/3 取整，卧底最多 3 个；默认 6 人及以下 1 个、7 到 9 人 2 个、10 人以上 3 个。主人没动过人数时，人数跟着入座离座变；动过就固定。
- 卧底拿词组里哪一个词，每局抛硬币（11-20 起单机也这样，以前单机永远拿第二个词）。
- 联机每一下点击带着它发出时的画面（force 带 phase，done 带 speaker 和 round）：同一下到两次只走一步。旧版手机没带就按老样子。
- 有人离桌让胜负已定（唯一卧底走了，或平民只剩和卧底一边一样多），游戏当场结束，结束页写一行「有人离开了桌子，这局提前结束」，还在桌上的输家受罚。揭晓页上离桌的，等主人点下一步照旧。

## 现在

单机和联机都能从头玩到尾，4 到 15 人，中英文。单机 11-02 进了统一的游戏壳（UI 计划 A5 的样板之一），11-05 起刷新页面不丢进度。

## 还剩什么

- 词库只有 65 组，不记抽过的词：一晚 10 局大约一半机会抽到重复。扩到 150 组左右，手机和房间都记住这一晚用过的。
- 白板猜平民词的玩法：11-01 把白板改成站卧底一边，说过以后可以加「猜词」，Steve 没回。

## 交给别的对话

- 全站设计：`.icon-btn:disabled` 没有自己的样子（`.btn:disabled` 有）。卧底人数的 + − 到头时按不动但看着一样，命运转盘的 − 也是。加一条和 `.btn:disabled` 一样的规则就行。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-20 谁是卧底：单机的词两边随机、人数算法和联机统一、+ − 到头停住；联机同一下点两次只走一步、断线时点的几下回来只算一下；人数跟着桌子变；离桌定了胜负就结束
- 2026-11-05 ui(A5): 这局还在，回来继续？ A reload in the middle of a game loses nothing (#180)
- 2026-11-03 A seat that just watches is never counted as a player
- 2026-11-02 feat(games): one game shell for every game (UI plan A5) (#131)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 One phone: a double tap no longer skips a player; the blank plays on the undercover's side
- 2026-10-31 Players' figures in the lobby, King's Game, Superlatives and Undercover

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-04 盘点：两种玩法在本地各玩了几遍（中英文、小屏、横屏、15 人），列出五个没修的问题。
- 2026-11-20 修了五个问题（见「定过的事」），加了两个规则测试。

# 游戏 · 最佳称号（superlatives）

对话名「游戏 · 最佳称号」。网址 changle.ca/g/superlatives。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每轮一个称号，大家投票选人，票最多的拿奖也喝。最后有颁奖典礼。

3 到 15 人。单机：传手机偷偷投票，或者一起指。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/superlatives.ts`
- 画面（单机和联机）：`site/src/party/superlatives/`
- 内容：`site/src/data/superlatives.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `superlatives` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `superlatives` 开头的测试
- `site/scripts/party_test.py`（单机和联机）

## 定过的事

- 每个奖揭晓 2.6 秒后，得奖的人手机上落惩罚印章；联机测试要等印章落下、点掉再按「下一个奖」（#97）。
- 最后有颁奖典礼。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in the lobby, King's Game, Superlatives and Undercover

## 记录

- 2026-11-02 建档案。

# 游戏 · 尤克牌（euchre）

对话名「游戏 · 尤克牌」。网址 changle.ca/g/euchre。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

24 张牌，叫主、跟牌、抢墩，先到 10 分的队赢。人不够四个，电脑补位。

2 到 4 人。单机：你和三个电脑玩家。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/euchre.ts`
- 画面（单机和联机）：`site/src/party/euchre/`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `euchre` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `euchre` 开头的测试
- `site/scripts/party_test.py`（单机和联机）

## 定过的事

- 人不够四个，电脑补位。
- 联机时轮到的人掉线，15 秒后电脑接手。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 Euchre online: a phone that drops on its turn gets the computer after 15 s, not 75
- 2026-10-31 Players' figures in the last games: whose turn it is, toasts, champions

## 记录

- 2026-11-02 建档案。

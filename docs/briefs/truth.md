# 游戏 · 真心话大冒险（truth）

对话名「游戏 · 真心话大冒险」。网址 changle.ca/g/truth-or-dare。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

瓶子停在谁面前，谁就选真心话或大冒险。不想答也不想做，就认罚。

2 到 15 人。单机传一部手机，联机每人一部。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/truth.ts`
- 单机画面：`site/src/games/TruthDare.tsx`
- 联机画面：`site/src/online/games/NetTruth.tsx`
- 内容：`site/src/data/truthDare.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `truth` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `truth` 开头的测试
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py`（联机）

## 定过的事

- 大冒险里说了时长的（比如 30 秒），下面出倒计时（#108）。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 feat(games): a countdown under dares and king's commands that name a time (#108)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in Truth or Dare, Post-it, Limbo and Freeze Dance

## 记录

- 2026-11-02 建档案。

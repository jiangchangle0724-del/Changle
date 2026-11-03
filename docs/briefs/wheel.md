# 游戏 · 命运转盘（wheel）

对话名「游戏 · 命运转盘」。网址 changle.ca/g/wheel-of-fate。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

转盘上写满惩罚，可以自己改。转到什么做什么。

1 到 15 人。单机传一部手机，联机每人一部。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/wheel.ts`
- 单机画面：`site/src/games/WheelOfFate.tsx`
- 联机画面：`site/src/online/games/NetWheel.tsx`
- 内容：`site/src/data/wheel.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `wheel` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里的 `dice + wheel` 测试
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py`（联机）

## 定过的事

- 转盘上的惩罚格可以自己改，默认的格子在 `site/src/data/wheel.ts`。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。
- 改了内置的惩罚格就变成自定义惩罚：11-01 看着像故意的，没改，Steve 没表态。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 feat(games): a countdown under dares and king's commands that name a time (#108)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 Small fixes from the play-test: unit price, the wheel's editor, sign-in and profile forms

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。

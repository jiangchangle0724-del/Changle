# 游戏 · 流氓十三张（rogue）

对话名「游戏 · 流氓十三张」。网址 changle.ca/g/rogue-thirteen。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

轮流抽牌，A 到 K 每张都有一条规矩：指定喝、陪酒、厕所券、摸鼻子……

2 到 15 人。单机传一部手机，联机每人一部。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/rogue.ts`
- 单机画面：`site/src/games/Rogue13.tsx`
- 联机画面：`site/src/online/games/NetRogue.tsx`
- 内容：`site/src/data/rogue13.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `rogue` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `rogue` 开头的测试
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py`（联机）

## 定过的事

- A 到 K 每张牌一条规矩，规矩写在 `site/src/data/rogue13.ts`。
- 单机时快速点两下不会跳过下一个人。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 Site: fix layouts that broke on small and sideways phones
- 2026-11-01 One phone: a double tap no longer skips a player; the blank plays on the undercover's side

## 记录

- 2026-11-02 建档案。

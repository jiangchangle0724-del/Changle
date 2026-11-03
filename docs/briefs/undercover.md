# 游戏 · 谁是卧底（undercover）

对话名「游戏 · 谁是卧底」。网址 changle.ca/g/undercover。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每人拿到一个词，卧底的词和大家不同。轮流描述，投票找出卧底。

4 到 15 人。单机传一部手机，联机每人一部。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/undercover.ts`
- 单机画面：`site/src/games/Undercover.tsx`
- 联机画面：`site/src/online/games/NetUndercover.tsx`
- 内容：`site/src/data/undercover.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `undercover` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `undercover` 开头的测试
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py`（联机）

## 定过的事

- 至少 4 个人。
- 白板跟卧底算一边。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。
- 白板猜平民词的玩法：11-01 把白板改成站卧底一边，说过以后可以加「猜词」，Steve 没回。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 One phone: a double tap no longer skips a player; the blank plays on the undercover's side
- 2026-10-31 Players' figures in the lobby, King's Game, Superlatives and Undercover

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。

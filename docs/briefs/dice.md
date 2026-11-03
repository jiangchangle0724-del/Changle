# 游戏 · 七八九（dice）

对话名「游戏 · 七八九」。网址 changle.ca/g/seven-eight-nine。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

掷出七往公杯里倒酒，八喝一半，九全喝，双一指定别人喝完。

2 到 15 人。单机传一部手机，联机每人一部。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/dice.ts`
- 单机画面：`site/src/games/Dice789.tsx`
- 联机画面：`site/src/online/games/NetDice.tsx`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `dice` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里的 `dice + wheel` 和 `seven eight nine` 两个测试
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py`（联机）

## 定过的事

- 设置里换了自定义惩罚时，公杯变成「罚池」：七往池里加一次，八罚一半，九罚全部，双一指定别人罚全部；印章上写 ×次数（#84）。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Count the table's own penalty: ×N on the stamp, and 7-8-9's pot
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink

## 记录

- 2026-11-02 建档案。

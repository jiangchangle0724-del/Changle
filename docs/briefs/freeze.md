# 游戏 · 木头人蹦迪（freeze）

对话名「游戏 · 木头人蹦迪」。网址 changle.ca/g/freeze-dance。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

音乐响就跳，突然停下时所有人定住不动。动了的人喝。联机时每部手机同时停。

2 到 15 人。单机：手机放音乐，一个人当裁判。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/freeze.ts`
- 画面（单机和联机）：`site/src/party/freeze/`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `freeze` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `freeze` 开头的测试
- `site/scripts/party_test.py`（单机和联机）

## 定过的事

- 联机时每部手机同时停音乐。
- 跳舞类游戏开始时，大厅的背景音乐会静音。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in Truth or Dare, Post-it, Limbo and Freeze Dance
- 2026-10-29 site: sound comes back after another app takes the speaker; dance games silence the lounge music

## 记录

- 2026-11-02 建档案。

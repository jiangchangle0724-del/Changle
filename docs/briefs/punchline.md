# 游戏 · 神回复（punchline）

对话名「游戏 · 神回复」。网址 changle.ca/g/punchline。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每个题目两个人各写一个答案，其他人投票。票少的喝，全票通过有加分。

3 到 15 人。单机：手机传一圈，偷偷写答案。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/punchline.ts`
- 画面（单机和联机）：`site/src/party/punchline/`
- 内容：`site/src/data/punchline.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `punchline` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `punchline` 开头的测试
- `site/scripts/party_test.py`（单机和联机）
- `site/scripts/tv_test.py`（大屏上的整局神回复）

## 定过的事

- 有大屏时，大屏整场演出（开场、对决、投票揭晓、比分、颁奖），手机变成遥控器。
- 超过 8 人的当观众。
- 全票通过有加分。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Every page has its own address; the back button closes sheets (UI plan A3) (#87)
- 2026-11-01 Online: keep the move you have to make clear of the reactions bar
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in the last games: whose turn it is, toasts, champions

## 记录

- 2026-11-02 建档案。

# 游戏 · 额头便利贴（postit）

对话名「游戏 · 额头便利贴」。网址 changle.ca/g/post-it。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每个人额头上一张便利贴，别人都看得到，只有你看不到。轮流问是非题，猜错喝一口，最后一个猜出来的喝一杯。一部手机就举到额头上，大家给提示。

2 到 15 人。单机：举到额头上，大家给提示。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/postit.ts`
- 画面（单机和联机）：`site/src/party/postit/`
- 内容：`site/src/data/postit.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `postit` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `postit` 开头的测试
- `site/scripts/party_test.py`（单机和联机）

## 定过的事

- 只有一部手机时举到额头上，大家给提示。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in Truth or Dare, Post-it, Limbo and Freeze Dance
- 2026-10-29 site: the big screen watches every game; a phone can just watch

## 记录

- 2026-11-02 建档案。

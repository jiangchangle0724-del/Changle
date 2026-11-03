# 游戏 · 猜歌名（tune）

对话名「游戏 · 猜歌名」。网址 changle.ca/g/name-that-tune。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

放真歌的 30 秒试听，抢答说出歌名，华语、英文或混着来。也可以只放旋律，或者用自己的音乐 App 放歌，这里只管抢答和计分。

2 到 15 人。单机：手机放真歌或旋律，也能当抢答器。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/tune.ts`
- 画面（单机和联机）：`site/src/party/tune/`
- 内容：`site/src/data/tunes.ts`、`site/src/data/songs.ts`、`site/src/data/songPools.ts`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `tune` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `tune` 开头的测试
- `site/scripts/party_test.py`（单机和联机）
- `site/tests/performer.test.ts`
- `site/scripts/tune_quiz_check.py`（选择题连玩 20 首，看报错和内存）

## 定过的事

- 真歌用 Apple Music 的 30 秒试听，揭晓时附上 Apple Music 的链接。
- 歌单分 7 种语言、8 个分类，可以选几种混着来；还有选择题模式。
- 台上有两个会跳舞的小人，`site/tests/performer.test.ts` 逐帧检查手臂和腿。
- 每首歌只加载一次，省内存。

## 还剩什么

- 等全站设计对话做好统一的游戏壳（UI 计划 A5），把这个游戏迁进去（UI 计划 C2）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Name That Tune: each song loaded once, less memory, no blank screen from the music
- 2026-10-31 Name That Tune: the performers' arms bend like arms
- 2026-10-31 Name That Tune: a unique key for the winner's confetti
- 2026-10-31 Players' figures in the lobby, King's Game, Superlatives and Undercover
- 2026-10-31 Players on Name That Tune's stage, and a seat that just watches

## 记录

- 2026-11-02 建档案。

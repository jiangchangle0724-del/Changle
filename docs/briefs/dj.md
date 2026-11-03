# 游戏 · 打碟（dj）

对话名「游戏 · 打碟」。网址 changle.ca/dj，首页卡片 changle.ca/g/dj-booth。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视或电脑打开 `changle.ca/dj` 当音箱，大家扫码入座，每台手机都是新手打碟台：两个碟、推子、效果键、蓄力和 DROP，全都卡在拍子上。主人在手机上把一晚拖过暖场、推高、顶点、收尾。

## 文件

- 手机和音箱画面：`site/src/party/dj/`
- 播放器、风格、契约：`site/src/shared/dj/`（`CONTRACTS.md`）
- 桌上的规则：`site/src/shared/engine/games/dj.ts`
- Lyria 转接：`site/worker/lyria.ts`
- Codex 的任务卡：`docs/codex-tasks/dj/`

## 先读

- `docs/dj-booth.md`（方案和任务表）
- `site/src/shared/dj/CONTRACTS.md`
- `docs/dj-booth-sound-check.md`

## 测试

- `site/tests/dj.test.ts`、`site/tests/dj-presets.test.ts`
- `site/scripts/dj_check.py`（WebKit 和 Chromium 里出声，一桌手机）、`dj_deck_check.py`、`dj_lyria_check.py`

## 定过的事

- Google 的 Lyria RealTime 只在站长自己的桌子上试（私下测试）；每月用量 `DJ_LYRIA_HOURS`，默认 20 小时。
- 没有 Lyria 时放试音版 DJ：网站自己的乐器现场合成，12 种风格。
- 新手按什么都不会乱。

## 现在

- 11 月 1 日上了首页；11 月 2 日加了点歌和「我的歌」（主人自己的歌）。

## 还剩什么

- 方案里的下一步：DJ 的大脑（A4）、玩家描述的歌（A5），以 `docs/dj-booth.md` 的任务表为准。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-02 打碟 · DJ Booth: two songs take turns; the sound-check notes for a night of songs
- 2026-11-02 打碟 · DJ Booth: the contracts for a night of the host's songs
- 2026-11-02 打碟 · DJ Booth: a night of the host's own songs (我的歌)
- 2026-11-02 打碟 · DJ Booth: the 点歌 box, the TV's request lines, the stand-in's songs kept in memory
- 2026-11-02 打碟 · DJ Booth: a new song every two minutes, and the room's rules for songs asked for by name
- 2026-11-02 打碟 · DJ Booth: the rules on the phone and the sound-check notes for the count and pads

## 记录

- 2026-11-02 建档案。

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
- 2026-11-05 Steve 定：继续用 Apple 试听。LICENSES.md 记着 Apple 的条款是用试听推广卖歌，他知道，照用。
- 歌单分 7 种语言、8 个分类，可以选几种混着来；还有选择题模式。
- 台上有两个会跳舞的小人，`site/tests/performer.test.ts` 逐帧检查手臂和腿。
- 每首歌只加载一次，省内存。
- 单机选择题是一桌人共用一部手机：猜错一个只锁这一个，其余还能接着猜。

## 还剩什么

- 选择题偶尔闪退（Steve 10-31 报的）：11-05 找到并修了一个很像的原因。台上跟着拍子变的灯光每一帧都改两个小人所在整块的样式，Chrome 内核里页面内存一首涨 150 MB 左右（6 首从 100 MB 到 1.2 GB），关掉这一项就不涨，小人跳舞本身不涨。改成只改发光的那几块、粗一点的台阶、变了才改以后，8 首都稳在 180 MB 上下。iPhone 是另一种内核，还要 Steve 在 iPhone 上连玩几十首确认。`scripts/tune_quiz_check.py` 现在也会在页面内存往上爬时报错。
- 参考 Soundle 的四条（Steve 11-05 说都做）：选择题分难度、一秒猜歌、歌手专场和年代歌单、挑战链接。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 Name That Tune: the stage's lights stop growing the page's memory song after song
- 2026-11-05 Name That Tune: one phone, multiple choice: a wrong title locks only itself, the table guesses on
- 2026-11-05 ui(C10): resume songs melodies and buzzers (#206，Codex)
- 2026-11-04 ui-C2：猜歌名三种模式接入游戏壳动作区、玩家条与轮次 (#168，Codex)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Name That Tune: each song loaded once, less memory, no blank screen from the music
- 2026-10-31 Name That Tune: the performers' arms bend like arms
- 2026-10-31 Name That Tune: a unique key for the winner's confetti
- 2026-10-31 Players' figures in the lobby, King's Game, Superlatives and Undercover
- 2026-10-31 Players on Name That Tune's stage, and a seat that just watches

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-05 仓库改名 Changle。Steve 定了 Apple 试听照用，参考 Soundle 的四条都做。修了单机选择题猜错一次就全锁。

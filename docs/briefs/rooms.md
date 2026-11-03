# 平台 · 房间与联机（rooms）

对话名「平台 · 房间与联机」。服务器在 rooms.changle.ca。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

多部手机坐一桌：房间服务器（Cloudflare Worker `changle-rooms`，一桌一个 Durable Object），游戏规则在服务器上跑，每部手机只收到自己该看的那一份；桌号、入座、邀请二维码、断线重连；惩罚印章的发放。

## 文件

- 一桌的服务器：`site/worker/index.ts`（Room）；配置 `site/worker/wrangler.jsonc`
- 规则引擎：`site/src/shared/engine/`（`room.ts`、`api.ts`、`games/index.ts`）
- 协议：`site/src/shared/protocol.ts`
- 联机画面：`site/src/online/`（大厅、入座、邀请、桌子）

## 先读

- `HANDOFF.md` 的「Add a party game to the site」

## 测试

- `site/tests/engine.test.ts`（每个游戏的规则，按服务器的跑法）
- `site/scripts/net_test.py`（四部手机一桌）

## 定过的事

- 规则只写一份（`shared/engine`），单机和联机共用。
- 秘密（词、票、手牌）不进别人的那一份。
- 桌号四位，只用不容易看错的字母和 2 到 9（没有 I、L、O、0、1）。
- 惩罚可以带次数（`times`），自定义惩罚时印章上写 ×次数（#84）。
- 改到 `site/worker/`、`site/src/shared/`、`site/src/data/`、`site/src/i18n.ts` 或 `site/package-lock.json` 时，合并后服务器自动重新部署。
- 同一桌不会有两个人同名：后来的叫「Steve 2」「Steve 3」（不分大小写和全角半角），回到桌上名字不变，最多 14 个字（`uniqueName`，`shared/engine/room.ts`，2026-11-02 全站体检）。
- 大厅的「开始」连点两下不会把刚开始的游戏重开一遍；主持人的「跳过」带上要跳过的是谁（`at`），连点两下只跳一个人（2026-11-02 全站体检）。

## 还剩什么

- 11-01 先不改、等 Steve 表态：有人锁屏或关了页面时，投票要等倒计时走完（最佳称号 45 秒、戏精 50 秒、便利贴），主持人可以点「现在揭晓」；主持人写的中文惩罚在英文手机上还是中文。
- 锁屏回来那一下（一秒左右）手机上还是旧画面，这时点的按钮会作用在新的一轮上（比如投给了下一个奖）。要改得让每个动作带上它是哪一轮的，牵涉每个游戏，11-02 全站体检时没动。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-02 打碟 · DJ Booth: a night of the host's own songs (我的歌)
- 2026-11-02 打碟 · DJ Booth: a new song every two minutes, and the room's rules for songs asked for by name
- 2026-11-01 feat(games): a countdown under dares and king's commands that name a time (#108)
- 2026-11-01 打碟 · DJ Booth deck: fixes from the second code review
- 2026-11-01 Rooms server: the alarm always sets the next one
- 2026-11-01 打碟 · DJ Booth deck: fixes from the code review

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 全站体检（issue #40）：同名、连点开始、连点跳过修了；锁屏回来点到新一轮的问题记进「还剩什么」。

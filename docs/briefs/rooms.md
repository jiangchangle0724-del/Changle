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
- `site/scripts/watch_players_check.py`（三个玩家加一个只看的座位：瓶子停在服务器选的人上，名单和计数里没有只看的人）

## 定过的事

- 有人锁屏或关了页面时，投票照样等倒计时走完（最佳称号 45 秒、戏精 50 秒、便利贴），主持人可以点「现在揭晓」；主持人写的中文惩罚在英文手机上照样是中文。Steve 11-02 定的：都先不改。
- 规则只写一份（`shared/engine`），单机和联机共用。
- 秘密（词、票、手牌）不进别人的那一份。
- 只看的座位不是玩家（11-03）：服务器上 `players()`、游戏的 `api.ids()` 和 `api.has()` 都不算它。手机上的瓶子圈、点人和投票的名单、计分表、「几人好了」这类计数，都用 `site/src/online/players.ts` 的 `usePlayers()`（只有玩家，顺序和服务器一样）；`room.seats` 只用来按 id 找名字和头像。只看的人在游戏里按什么，服务器都不收，它的手机上也没有投票、答题、抢答的按钮；主人只看时，主人的按钮（跳过、下一轮、揭晓）照样能用，但不能投票、答题、猜。
- 桌号四位，只用不容易看错的字母和 2 到 9（没有 I、L、O、0、1）。
- 惩罚可以带次数（`times`），自定义惩罚时印章上写 ×次数（#84）。
- 改到 `site/worker/`、`site/src/shared/`、`site/src/data/`、`site/src/i18n.ts` 或 `site/package-lock.json` 时，合并后服务器自动重新部署。
- 同一桌不会有两个人同名：后来的叫「Steve 2」「Steve 3」（不分大小写和全角半角），回到桌上名字不变，最多 14 个字（`uniqueName`，`shared/engine/room.ts`）。11-01 试玩查出的同名问题，11-02 全站体检（PR #141）修了，「还剩什么」里那条可以删。
- 大厅的「开始」连点两下不会把刚开始的游戏重开一遍；主持人的「跳过」带上要跳过的是谁（`at`），连点两下只跳一个人（11-02 全站体检）。

## 还剩什么

- 同一桌名字可以重复（11-01 试玩查出，没修）。
- 锁屏回来那一下（一秒左右）手机上还是旧画面，这时点的按钮会作用在新的一轮上（比如投给了下一个奖）。要改得让每个动作带上它是哪一轮的，牵涉每个游戏，11-02 全站体检时没动。

## 交给别的对话

- 大屏：`site/src/tv/TvApp.tsx` 大厅里「还差几人」用的是 `room.seats.length`，把只看的人也算进去了，改成只算玩家（`playersOf(room.seats)`）。（11-03）
- 打碟：大屏舞池（`TvDj.tsx` 的 `Floor`）用 `room.seats` 画人，只看的人也站在舞池里。只看的手机上打碟台的按钮现在按了没用（服务器不收），可以藏起来，或者像 #153 那样显示去大屏的路。（11-03）
- 林波舞：只看的手机在准备阶段还有「开启动作感应」按钮，按了没用也没害处；#134 合并后顺手藏掉（用 `useWatching()`）。（11-03）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-03 A seat that just watches is never counted as a player: the bottle, the lists, the scores and the counts
- 2026-11-02 打碟 · DJ Booth: a night of the host's own songs (我的歌)
- 2026-11-02 打碟 · DJ Booth: a new song every two minutes, and the room's rules for songs asked for by name
- 2026-11-01 feat(games): a countdown under dares and king's commands that name a time (#108)
- 2026-11-01 打碟 · DJ Booth deck: fixes from the second code review
- 2026-11-01 Rooms server: the alarm always sets the next one
- 2026-11-01 打碟 · DJ Booth deck: fixes from the code review

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 记下 Steve 11-02 的回答。
- 2026-11-03 修好「只看的座位被当成玩家」。以前桌上有人只看时，真心话大冒险的瓶子圈多一个空位，瓶子会停在只看的人身上，服务器其实选的是下一个人；点人、投票的名单里有只看的人，点了也没人罚；「几人好了」「几人投了」的总数、计分表、谁是卧底的「几人在座」都把只看的人算进去。现在这些都只算玩家，服务器也不收只看的人的操作。加了 engine 测试，和浏览器检查 `site/scripts/watch_players_check.py`（三个玩家加一个只看的座位）。

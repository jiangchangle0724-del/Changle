# 平台 · 房间与联机（rooms）

对话名「平台 · 房间与联机」。服务器在 rooms.changle.ca。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

多部手机坐一桌：房间服务器（Cloudflare Worker `changle-rooms`，一桌一个 Durable Object），游戏规则在服务器上跑，每部手机只收到自己该看的那一份；桌号、入座、邀请二维码、断线重连；惩罚印章的发放。

## 文件

- 一桌的服务器：`site/worker/index.ts`（Room）；配置 `site/worker/wrangler.jsonc`
- 规则引擎：`site/src/shared/engine/`（`room.ts`、`api.ts`、`games/index.ts`）
- 协议：`site/src/shared/protocol.ts`
- 联机画面：`site/src/online/`（大厅、入座、邀请、桌子）
- 有自己舞台的游戏在桌上的接法（一起跳、抓紧了）：`site/src/party/stage/`（共用的进出、手机画面、电视卡片）、`site/src/party/dance/link.ts`、`site/src/party/hangon/link.ts`、`site/src/shared/engine/games/stage.ts`

## 先读

- `HANDOFF.md` 的「Add a party game to the site」

## 测试

- `site/tests/engine.test.ts`（每个游戏的规则，按服务器的跑法；换主人的三条在「leave」后面）
- `site/tests/stage.test.ts`（一起跳、抓紧了的桌上版本：引擎、在桌单里的位置、每台手机和舞台的网址）
- `site/scripts/net_test.py`（四部手机一桌，全部游戏；`ORDER` 要和 `ONLINE_GAMES` 一样，加游戏时两边都加）
- `site/scripts/watch_players_check.py`（三个玩家加一个只看的座位：瓶子停在服务器选的人上，名单和计数里没有只看的人，只看的手机显示大屏画面）
- `site/scripts/stale_tap_check.py`（锁屏回来那一下点的按钮：桌上翻了卡就丢掉，没翻就算）
- `site/scripts/cast_check.py`（大厅里投屏：客人自己设、主人点头像设、回来玩、游戏里显示大屏画面）
- `site/scripts/dance_table_check.py`（一起跳从桌上进去再回来；要本地跑 games/party-server，见 HANDOFF.md）
- `site/scripts/party_test.py`（七个新游戏，单机和联机；`ORDER` 同上。猜歌名单机那段走的是旧网址 `#/g/tune`，等不到 `.vinyl`，11-19 还没改）
- 服务器写了几次存储：`worker/.dev.vars` 里 `DEV_COUNT_WRITES=1`（只在本地），每次 put 和 setAlarm 打一行 `COUNT put` / `COUNT alarm` 到 wrangler 的日志里数

## 定过的事

- 有人锁屏或关了页面时，投票照样等倒计时走完（最佳称号 45 秒、戏精 50 秒、便利贴），主持人可以点「现在揭晓」；主持人写的中文惩罚在英文手机上照样是中文。Steve 11-02 定的：都先不改。
- 规则只写一份（`shared/engine`），单机和联机共用。
- 秘密（词、票、手牌）不进别人的那一份。
- 只看的座位不是玩家（11-03）：服务器上 `players()`、游戏的 `api.ids()` 和 `api.has()` 都不算它。手机上的瓶子圈、点人和投票的名单、计分表、「几人好了」这类计数，都用 `site/src/online/players.ts` 的 `usePlayers()`（只有玩家，顺序和服务器一样）；`room.seats` 只用来按 id 找名字和头像。只看的人在游戏里按什么，服务器都不收，它的手机上也没有投票、答题、抢答的按钮；主人只看时，主人的按钮（跳过、下一轮、揭晓）照样能用，但不能投票、答题、猜。
- 桌号四位，只用不容易看错的字母和 2 到 9（没有 I、L、O、0、1）。
- 惩罚可以带次数（`times`），自定义惩罚时印章上写 ×次数（#84）。
- 改到 `site/worker/`、`site/src/shared/`、`site/src/data/`、`site/src/i18n.ts` 或 `site/package-lock.json` 时，合并后服务器自动重新部署。
- 同一桌不会有两个人同名：后来的叫「Steve 2」「Steve 3」（不分大小写和全角半角），回到桌上名字不变，最多 14 个字（`uniqueName`，`shared/engine/room.ts`）。11-02 全站体检（PR #141）修的。
- 大厅的「开始」连点两下不会把刚开始的游戏重开一遍；主持人的「跳过」带上要跳过的是谁（`at`），连点两下只跳一个人（11-02 全站体检）。
- 换主人（11-19，#644）：主人只是不在（锁屏、切了 app）时，25 秒后桌子交给一个**在线的玩家**，只看的座位永远不接；到点没人能接，之后只要有人到桌上或回到桌上而主人还不在，就重新数 25 秒；主人干脆离桌，先给玩家（在线优先，然后桌上任何玩家），一个玩家都没有才给只看的人；主人在 25 秒内回来桌子还是他的，之后不自动还给原来的主人（要还用「让他当主人」）。
- 锁屏回来那一下的按钮（11-19，#642）：没有每个游戏各带轮次，改在手机这一头一处管所有游戏。`socket.ts` 知道画面什么时候可能过期（页面被藏起来、线断了）、什么时候又是新的（同一条线上服务器回了 pong，或新线上来了房间视图）；`RoomContext.tsx` 在可能过期时把游戏里的动作（`a: "g"`，游戏里的 `spin`）攥着并记下当时的 `room.game`，画面新了以后游戏没变就发，变了就丢，最多攥 6 秒；离桌、改名、反应、喝了这些随时发。副作用：亮屏那几百毫秒里别人刚好答了题（`answered` 变了），你的那一下也会被丢，再点一次就是。最佳称号自己本来就带 ballot 号，服务器那边也挡。
- 服务器少写存储（11-19，#641）：闹钟只在要挪的时候重设（提前一定设；推后不到一分钟不动，让它早一点响再设准；刚响过或冷启动设）。免费额度一天十万次写，一桌画画一晚上原来一分钟几百次。量过：大厅 20 个反应 20 → 0 次写，10 秒画画 168 → 5 次。
- 有自己舞台的游戏（一起跳、抓紧了）在桌上的接法（11-19，#654）：照到此一游、藏在人群里。主人的手机去那边开房，房间码进桌子（`DanceView`、`HangOnView`，只记码和开的时间；抓紧了多一个 `phone`：没大屏时开的是手机局），每台手机自己过去当玩家，电视或只看的手机去那边的舞台页，回到桌上的手机看到「还在进行 / 回到这局」，主人「结束这局」。一起跳那边谁先进谁是主人，所以桌子的主人先走，其他人晚 1.2 秒。名字、语言、房间码先写进那边认的存储（`party:name`、`party:lang`、`party:room`；`hang-on:name`、`hang-on:lang`），进去不出表单。「转一个」不会转到这种要离开桌子的游戏（registry 里带 `stage` 的）。
- 抓紧了还没上桌单（`ONLINE_GAMES` 没有 hangon，其余都做好了）：它的主机页永远自己开新房，接不了桌子开好的房。等 hang-on 对话加了 `?room=CODE`（见它档案的「交给别的对话」），在 `ONLINE_GAMES` 末尾加 `"hangon"`，`net_test.py`、`party_test.py` 的 `ORDER` 末尾也加，`tests/stage.test.ts` 那条「还没上桌单」改成在末尾。
- 投屏（11-19，#656）：一个座位「只看」（`{ a: "watch", pid, on }`）就是投屏电视：游戏里整屏显示大屏画面，不参加游戏。大厅里每个客人有「这台手机投屏电视」，主人没有（游戏等主人按按钮）；主人点头像有「用这台手机投屏电视 / 让 TA 回来玩」；投屏中的手机大厅里有一条说明和「回来玩」，座位上的小字是「投屏」。桌子菜单里的「我只看，不参加」和每个座位的「旁观」还在，是同一个状态。

## 现在

- 11-19 开着六个 PR，都建在 main 上，CI 绿了等合并：#630 两个手机检查脚本跟上桌子；#641 服务器少写存储；#642 锁屏回来那一下的按钮；#644 换主人；#654 一起跳上桌、抓紧了桌子这边做好；#656 大厅投屏按钮和主人指定。合并顺序无所谓（#641、#642、#644 带着 #630 那一个提交）。都没在真手机上试过。

## 还剩什么

- 一起跳从桌上进去以后回不来得靠手机返回键：那边的页面不认 `?table=`、完了也不写 `dance.over`、也没有状态接口（三件都交给一起跳对话了，见下）。在那之前，玩完了大家按返回键回 `/t/桌号`，主人在桌上按「结束这局」。
- 抓紧了上桌单那一行，等 hang-on 对话（见「定过的事」）。
- 投屏的手机在大厅里现在还是手机的大厅加一条说明，不是大屏的大厅（桌号、二维码、谁进来了），交给大屏对话了。
- 锁屏那条的副作用（亮屏那几百毫秒里别人刚好动了，你的那一下被丢，再点一次）要不要再细，看真手机上的感受。
- `party_test.py` 猜歌名单机那段走旧网址 `#/g/tune`（见「测试」）；尤克牌那段偶尔被惩罚盖章挡一下（重跑就过）。
- 给房间服务器加每个连接的消息频率限制（设计对话 11-05 建议的）：现在单条 32 KB 上限、接口有频率限制，但一个连接可以不停地发。
- 真手机上试：锁屏回来点按钮、主人锁屏 25 秒后换人、一起跳从桌上进去、投屏按钮。

## 交给别的对话

- 一起跳对话（11-19，三件都在 games/party-server；没做之前一起跳也能从桌上玩，只是回不来要靠返回键）：
  1. `?table=桌号` 带上：join 页 `join()` 里 `history.replaceState(null, "", "?code=…")` 把它抹掉了，保留它；join 页和 screen 页有 `table` 时，返回/退出回 `/t/桌号`。
  2. 这局完了（END_ROOM、房间结束）先写 `sessionStorage["dance.over"] = 房间码`（舞台页写 `dance.over.tv`）再回 `/t/桌号`，桌子看到就自动收桌（`site/src/party/stage/link.ts` 的 `cameBackFromEnd`）。
  3. 状态接口 `GET /party/api/rooms/CODE` → `{ exists, phase: "lobby" | "playing" | "over" }`；做好以后把 `site/src/party/dance/link.ts` 的 `phase: null` 接上（照 `party/hide/link.ts` 的 `hidePhase`）。
- 抓紧了对话（11-19，games/hang-on）：主机页认 `?room=CODE`（有它就不 `openRoom`，直接接管这个房；`?phone=1` 时桌子开的是 `{ hostPlays: true }`，`?phone=0` 时 `{}`）；服务器让 `?role=host` 接一个还没有主机的房；`?table=桌号`（主机页和手柄页都带）返回/退出回 `/t/桌号`，结束时先写 `sessionStorage["hangon.over"] = 房间码`（大屏写 `hangon.over.tv`）；状态接口 `GET /hang-on/api/rooms/CODE`。做好以后把 hangon 加进 `ONLINE_GAMES`（见「定过的事」）。
- 大屏对话（11-19）：投屏的手机在大厅里显示大屏的大厅（桌号、二维码、谁进来了；`Lobby.tsx` 里 `casting` 为真那一段现在只是一条说明），`TvLobby` 要能从 `TvApp.tsx` 里拿出来用；#654 在 `TvApp.tsx`（import、两行 `else if`、两行开场说明）、`tv/views.tsx`（`watchable`）、`tv/Watch.tsx`（`StageAway`、角标例外）加了行，都照藏在人群里的样子。

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

- 2026-11-19 Steve 11-18 要的都做了，六个 PR（见「现在」）：修 bug（两个脚本、服务器写存储、锁屏回来的按钮、换主人），一起跳上桌、抓紧了桌子这边做好，大厅投屏按钮和主人指定。一起跳、抓紧了、大屏各要改的写进了它们档案的「交给别的对话」。

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 记下 Steve 11-02 的回答。
- 2026-11-03 修好「只看的座位被当成玩家」。以前桌上有人只看时，真心话大冒险的瓶子圈多一个空位，瓶子会停在只看的人身上，服务器其实选的是下一个人；点人、投票的名单里有只看的人，点了也没人罚；「几人好了」「几人投了」的总数、计分表、谁是卧底的「几人在座」都把只看的人算进去。现在这些都只算玩家，服务器也不收只看的人的操作。加了 engine 测试，和浏览器检查 `site/scripts/watch_players_check.py`（三个玩家加一个只看的座位）。
- 2026-11-05 别的对话收尾时（`claude/watch-leftovers` 那个 PR）把「交给别的对话」的三条都做了：大屏大厅「还差几人」只数玩家，打碟大屏的舞池只画玩家，林波舞只看的手机（主人只看时还是手机画面）没有动作感应按钮，也不向游戏报动作感应。服务器没动。查到到此一游、藏在人群里时换主人的一个空子，写进了「还剩什么」。

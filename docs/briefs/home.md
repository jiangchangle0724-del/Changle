# 平台 · 首页与上线（home）

对话名「平台 · 首页与上线」。网址 changle.ca。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

首页（派对游戏、工具、心愿单三个页签）、游戏卡片和介绍页 `/g/<slug>`、网址和后退键、设置（玩家、语言、声音、自定义惩罚）、共用部件（惩罚印章、计时、选人）、声音，以及上线流程：CI、Cloudflare、回归测试。

## 文件

- 首页：`site/src/home/`（`Home.tsx`、`PartyTab.tsx`、`Tile.tsx`、`GameSheet.tsx`）
- 共用部件：`site/src/components/`（惩罚印章、计时、设置、选人等）
- 网址：`site/src/router.ts`；页面分发：`site/src/App.tsx`
- 共用文案：`site/src/i18n.ts`
- 搜索和分享卡片：`site/scripts/postbuild.ts`
- CI：`.github/workflows/`
- 回归测试脚本：`site/scripts/`

## 先读

- `HANDOFF.md`（什么在哪里跑、怎么上线、怎么加游戏）
- `site/PRODUCT.md`（产品原则）
- `site/README.md`（中文说明）

## 测试

- `site/tests/routes.test.ts`（每个页面的网址和旧链接）
- 回归一套：`site/scripts/routes_check.py`、`local_check.py`、`net_test.py`、`party_test.py`、`tv_test.py`（要先在本地跑起房间服务器和网站，见 `HANDOFF.md`）

## 定过的事

- 赚钱先不急，等玩的人多了再说（Steve 11-02 定的；10-31 的方案：主持人会员约 $2.99/月、场地版、付费包、线下活动，不放广告）。
- 每页一个网址，弹层也走网址，后退键关弹层（#87）。
- 游戏网址 `changle.ca/g/<slug>` 上线后永远不改。
- 不登录也能玩所有游戏。
- 首页从上到下：今晚的人、现在玩这个、筛选、全部游戏（UI 计划 A4，2026-11-02）。首页的游戏卡是共用组件 `site/src/ui/Tile.tsx`，按类型上色；联机桌里选游戏的卡还是 `home/Tile.tsx`。
- 设置里可以把喝酒换成别的惩罚，所有游戏跟着换，任何台词和按钮都不说喝酒。
- 合并进 `main` 就自动上线，每个 Cloudflare 构建会作为检查挂在合并提交上。
- 第一次打开网站跟手机的第一语言走：第一语言是中文就开中文，否则开英文；之后记住读者自己选的（Steve 11-02 定的，`site/src/store.tsx`）。
- 还在做、没有桌上玩法的游戏放在 `registry.ts` 的 `SOON` 里，只在「即将上线」里出现，点开是介绍卡（现在是空的）。
- 跑在自己的 Worker 上、没有桌上玩法的游戏（一起跳）在 `GAMES` 里带 `stage`（大屏网址和手机网址）：卡片上「电视或电脑当舞台」整页跳过去，手机上说去哪个网址，另有「用手机加入」；`/g/<slug>/play` 也跳过去。它只在主站的 `GameId` 里，不进 `protocol.ts` 的 `GameId`、`ONLINE_GAMES`、`ONLINE_MIN` 和规则引擎的 `GAMES`：房间服务器不认识它，联机桌的转盘和「现在玩这个」都不会落在它上面（2026-11-05，一起跳上线时定的）。
- 主站路由和离线缓存认得的别的 Worker：`/eat`、`/go`、`/trip`、`/hide`、`/party`、`/hang-on`。新的 Worker 要加进 `router.ts` 的 `elsewhere` 和 `scripts/sw.template.js` 的那行。

## 现在

- 首页改版上线（UI 计划 A4，#120）：今晚的人、现在玩这个、筛选、按 5 类上色。本地脚本 `routes_check`、`local_check`、`pwa_check`、`shots_home` 点的是新的 `.board .ui-tile`。
- CI 在构建后跑 `site/scripts/budget.ts`：首页第一次下载的 JS 和 CSS（gzip）超过预算就不让合并（全站设计对话的 A6）。新东西放首页时先想能不能按需下载。
- 11 月 2 日回归：五套脚本都过；`routes_check` 的「弹层里的链接」和 `tv_test` 的「写手的手机」在机器忙的时候各失败过一次，单独重跑都过。
- 全站体检（issue #40）11-02 走完一遍，见 PR #141（修了什么、查了什么都在 PR 里；新加了 `scripts/keyboard_check.py`）。你画我猜联机、一整局尤克牌、猜歌名的抢答和旋律模式、林波舞体感都在模拟的手机上玩过了（体感是模拟的）。PR 合并以后，「还剩什么」里「全站体检」和「从来没测过的」两条只剩真的 iPhone Safari 和在微信里打开。

- 11-05 一起跳上线（这个 PR）：从「即将上线」挪进游戏，卡片文字按一起跳档案的；首页 JS 预算 119 → 120（main 已经 118.9，卡片加 0.3）。

## 还剩什么

- 全站体检（GitHub issue #40，Steve 10-31 提的，没做完）：按 issue 里的清单逐个游戏查 AI 做网站常见的 bug（重复播放的效果、离开后还在跑的计时器和声音、上一轮的状态带到下一轮、连点、晚到的结果、iPhone 的布局和声音、锁屏回来、无障碍、控制台报错）。11-01 那轮试玩修了一批，但清单本身没走完。Steve 当时还让找能帮忙的 skill，找到 Vercel 的 React 最佳实践，问过要不要装，他没回。
- 从来没测过的：你画我猜联机、一整局尤克牌、猜歌名的抢答和旋律模式、林波舞体感、真的 iPhone Safari、在微信里打开链接。
- 新游戏，排在到此一游的活之后（Steve 11-02 同意）：一个自己起名的出牌游戏，玩法像 UNO，名字和牌面都是自己的（还没做）。Codex 的人群游戏（PR #5）改名成「藏在人群里 · Hide in the Crowd」，11-03 在 PR #159 接进来：changle.ca/hide，自己的 Worker（hide-crowd），首页卡片、从桌子开局、惩罚、大屏、测试都做了；11-04 Steve 删掉了旧的子域名和旧 Worker，新 Worker 接好了 GitHub。合并后关掉 #5。

## 交给别的对话

- 游戏 · 一起跳：首页上线做完了（卡片、路由、`/g/dance-along/play` 跳到 `/party/screen`、手机的「用手机加入」到 `/party/join`）。合并上线后拿掉你档案「还剩什么」里「首页卡片还在即将上线」那条和「交给别的对话」里给这边的那条。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 feat(games): a countdown under dares and king's commands that name a time (#108)
- 2026-11-01 feat(site): C7 SEO、离线 PWA 与分享图 (#104)
- 2026-11-01 CI: test 一起跳's move library (games/dance)
- 2026-11-01 打碟 · DJ Booth: the beginner deck (everyone DJs at once), and the booth on the home list
- 2026-11-01 What's On and 一起跳 are connected to Cloudflare
- 2026-11-01 Every page has its own address; the back button closes sheets (UI plan A3) (#87)

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 第一次打开改成只看手机的第一语言。
- 2026-11-02 「即将上线」加了一起跳卡片（`SOON`）。
- 2026-11-02 记下 Steve 11-02 的回答。
- 2026-11-05 Steve 说「起跳上线」：按一起跳档案做了。主站 `GameId` 加了 dance，`GAMES` 里带 `stage`，`SOON` 清空；卡片两个按钮；`/g/dance-along/play` 跳到舞台；`/party`、`/hide`、`/hang-on` 加进路由和离线缓存的别的 Worker（`/hide`、`/hang-on` 之前漏了）；路由测试加了它；首页预算 120。
- 2026-11-11 戏精对话转来：共用音效引擎 `burst()` 的噪音开头有一声咔哒（docs/briefs/drama.md 的「交给别的对话」）。在 Chrome 的离线引擎里用真的引擎代码量了：踩镲、拍手、军鼓、沙锤、镲、底鼓，整数和非整数的起点、按当前时刻和晚 10 毫秒排的、44.1 和 48 kHz、连着 12 下，开头都比声音本身轻得多，没量到咔哒，修了也不会让哪个游戏变轻。还是加了那一行（音量节点先设成 0），不靠时机，防 Safari 这种没法在这里测的浏览器。真 iPhone 上听一下还没做。

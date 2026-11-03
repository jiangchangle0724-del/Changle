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

- 每页一个网址，弹层也走网址，后退键关弹层（#87）。
- 游戏网址 `changle.ca/g/<slug>` 上线后永远不改。
- 不登录也能玩所有游戏。
- 首页从上到下：今晚的人、现在玩这个、筛选、全部游戏（UI 计划 A4，2026-11-02）。首页的游戏卡是共用组件 `site/src/ui/Tile.tsx`，按类型上色；联机桌里选游戏的卡还是 `home/Tile.tsx`。
- 设置里可以把喝酒换成别的惩罚，所有游戏跟着换，任何台词和按钮都不说喝酒。
- 合并进 `main` 就自动上线，每个 Cloudflare 构建会作为检查挂在合并提交上。
- 还在做、没有桌上玩法的游戏（一起跳）放在 `registry.ts` 的 `SOON` 里，只在「即将上线」里出现，点开是介绍卡。

## 现在

- 首页改版上线（UI 计划 A4，#120）：今晚的人、现在玩这个、筛选、按 5 类上色。本地脚本 `routes_check`、`local_check`、`pwa_check`、`shots_home` 点的是新的 `.board .ui-tile`。
- CI 在构建后跑 `site/scripts/budget.ts`：首页第一次下载的 JS 和 CSS（gzip）超过预算就不让合并（全站设计对话的 A6）。新东西放首页时先想能不能按需下载。
- 11 月 2 日回归：五套脚本都过；`routes_check` 的「弹层里的链接」和 `tv_test` 的「写手的手机」在机器忙的时候各失败过一次，单独重跑都过。

## 还剩什么

- UI 计划 A4 首页层级（今晚的人、现在玩这个、筛选），和全站设计对话一起定。
- 全站体检（GitHub issue #40，Steve 10-31 提的，没做完）：按 issue 里的清单逐个游戏查 AI 做网站常见的 bug（重复播放的效果、离开后还在跑的计时器和声音、上一轮的状态带到下一轮、连点、晚到的结果、iPhone 的布局和声音、锁屏回来、无障碍、控制台报错）。11-01 那轮试玩修了一批，但清单本身没走完。Steve 当时还让找能帮忙的 skill，找到 Vercel 的 React 最佳实践，问过要不要装，他没回。
- 从来没测过的：你画我猜联机、一整局尤克牌、猜歌名的抢答和旋律模式、林波舞体感、真的 iPhone Safari、在微信里打开链接。
- 首次打开的语言：Steve 说「跟 iPhone 的语言」，现在做的是「手机语言列表里有中文就开中文」（`site/src/store.tsx`，理由是很多人手机设英文但看中文），等 Steve 定要不要改成只看第一语言。
- 等 Steve 定：怎么赚钱（10-31 给过方案：主持人会员约 $2.99/月、场地版、付费包、线下活动，不放广告）；UNO（这个名字不能用，10-21 问过要不要做一个自创名字的出牌游戏，他没回）。

## 交给别的对话

- （暂无）

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
- 2026-11-02 「即将上线」加了一起跳卡片（`SOON`）。

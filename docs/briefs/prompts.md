# 游戏 · 我从来没有（prompts）

对话名「游戏 · 我从来没有」。网址 changle.ca/g/never-have-i-ever。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

念一句“我从来没有……”，做过的人喝。也可以换成“谁最有可能”，大家一起指人，被指最多的喝，平手一起喝。

2 到 15 人。单机传一部手机，联机每人一部。联机时可以开大屏（电视或只看的手机）。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/prompts.ts`
- 单机画面：`site/src/games/PromptDecks.tsx`；只有单机用的样式在 `site/src/games/PromptDecks.css`（选人时卡片缩成一条）
- 联机画面：`site/src/online/games/NetPrompts.tsx`
- 卡片的样式（单机联机共用）：`site/src/styles/components.css` 里「prompt decks」那一段，只有这个游戏用
- 大屏画面：`site/src/online/games/TvPrompts.tsx`、`site/src/styles/tv-prompts.css`（大屏对话 #155 做的，放在游戏旁边，见 `tv.md`）
- 内容：`site/src/data/prompts.ts`（两种题各 40 张）
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `prompts` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `prompts` 开头的测试
- `site/scripts/local_check.py`（单机，只看能不能打开；它会改写 `site/local-shots/` 里的图，跑完别提交）
- `site/scripts/net_test.py prompts`（联机四部手机）
- `site/scripts/watch_test.py prompts`（大屏）
- CI 的截图 `site/tests/visual/__screenshots__/game-never-have-i-ever.png` 只拍单机打开时的样子（还没抽卡）

试单机画面要用手机浏览器真实的尺寸，不只是 390×844：iPhone 的 Safari 留给网页大约 390×664，iPhone SE 375×548，微信 390×753。

## 定过的事

- 「我从来没有」和「谁最有可能」两种题在同一个游戏里。
- 2026-11-05 单机「谁最有可能」平手时，被指最多的几个人一起罚，和联机一样：指完了以后可以点好几个名字再点「喝」；点「再指一次」回到这张卡重新指。
- 2026-11-05 单机选人时（谁做过、指完了），卡片缩成一条，「还剩几张」先不显示，名字都在底部按钮上面。人多、屏幕矮的时候页面自己往上挪一点，最多挪到「点一下……」那句还看得见。横着拿手机时卡片照旧在左边，不缩。
- 2026-11-05 单机底部两个按钮，600 毫秒内连点两下只算一下。点「谁做过」时「没人做过」正好出现在手指下面，以前连点会把没人回答的卡跳过去。
- 2026-11-05 单机抽卡以后的按钮叫「下一张 / Next card」。联机亮完答案的按钮还是「下一个」，因为它是换下一个人念卡，不抽卡。

## 还剩什么

- 卡偏少：两种题各 40 张，玩完一遍就开始重复。加卡前先问 Steve 要不要分温和、劲爆两档（11-04 问过，还没定）。
- 联机投票在 iPhone Safari 尺寸下 8 个人都点得到，15 个人还没试。

## 交给别的对话

- 平台 · 房间与联机（`rooms.md`）：`site/scripts/watch_players_check.py` 过期了。#155、#157 以后，只看的手机显示的是大屏画面，脚本还在那部手机上找手机画面的投票名单和计数，所以跑不过。11-04 在 main 上 11 个游戏有 7 个不过（真心话大冒险、最佳称号、我从来没有、国王游戏、你画我猜、木头人蹦迪、额头便利贴），11-05 再跑我从来没有还是不过。不影响玩家，也不在 CI 里。要改的是脚本：只看的那部手机改查大屏画面上该有的东西。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 我从来没有 on one phone: every name above the buttons, ties in Most Likely To, 下一张（分支 `claude/prompts-names-fit`）
- 2026-11-05 ui(C10): resume Never Have I Ever after a reload (#193)
- 2026-11-04 A seat that just watches is never counted as a player: the bottle, the lists, the scores and the counts (#157)
- 2026-11-04 Watching, batch 3: King's Game, Never Have I Ever, Post-it and Freeze Dance on the big screen (#155)
- 2026-11-04 ui-C2：我从来没有接入底部动作区与玩家条 (#140)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in the last games: whose turn it is, toasts, champions

## 记录

- 2026-11-02 建档案。
- 2026-11-05 补上 11-02 以后别的对话做的事：#140 接上底部按钮和玩家条（原来「还剩什么」里等着迁进游戏壳的那条已经做完），#155 大屏画面，#157 只看的人不算玩家，#193 刷新以后接着玩。在手机浏览器真实尺寸下试玩，修了三处：单机点「谁做过」后名字被底部按钮挡住（普通 iPhone 的 Safari、iPhone SE 都会）；「谁最有可能」平手只能选一个人，点了就罚，没法返回；抽卡后按钮写「下一个」。顺手挡住底部按钮的连点。8 种手机尺寸、6 到 15 人都试过，名字全点得到。

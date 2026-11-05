# 档案目录

changle.ca 按对话分工：一个 Claude Project 下面 29 个对话，每个对话只管一块，每块在这里有一份档案。档案就是对话的记忆：开工先读，收尾更新。换对话、换模型，都从档案接上。

## 平台（5 个）

各个游戏共用的东西归这 5 个对话管。

| 对话名 | 档案 | 管什么 |
| --- | --- | --- |
| 平台 · 全站设计 | [design.md](design.md) | 颜色、字体、间距、共用组件、UI 计划 |
| 平台 · 首页与上线 | [home.md](home.md) | 首页、网址、设置、共用部件、CI 和上线、回归测试 |
| 平台 · 房间与联机 | [rooms.md](rooms.md) | 房间服务器、规则引擎、协议、桌子和入座 |
| 平台 · 账号与头像 | [accounts.md](accounts.md) | 登录、个人页、AI 头像、好友、聊天、后台 |
| 平台 · 大屏 | [tv.md](tv.md) | changle.ca/tv |

## 小游戏（16 个）

| 对话名 | 档案 | 网址 |
| --- | --- | --- |
| 游戏 · 真心话大冒险 | [truth.md](truth.md) | changle.ca/g/truth-or-dare |
| 游戏 · 流氓十三张 | [rogue.md](rogue.md) | changle.ca/g/rogue-thirteen |
| 游戏 · 最佳称号 | [superlatives.md](superlatives.md) | changle.ca/g/superlatives |
| 游戏 · 国王游戏 | [king.md](king.md) | changle.ca/g/kings-game |
| 游戏 · 戏精大赏 | [drama.md](drama.md) | changle.ca/g/drama-queens |
| 游戏 · 额头便利贴 | [postit.md](postit.md) | changle.ca/g/post-it |
| 游戏 · 林波舞 | [limbo.md](limbo.md) | changle.ca/g/limbo |
| 游戏 · 我从来没有 | [prompts.md](prompts.md) | changle.ca/g/never-have-i-ever |
| 游戏 · 尤克牌 | [euchre.md](euchre.md) | changle.ca/g/euchre |
| 游戏 · 七八九 | [dice.md](dice.md) | changle.ca/g/seven-eight-nine |
| 游戏 · 木头人蹦迪 | [freeze.md](freeze.md) | changle.ca/g/freeze-dance |
| 游戏 · 命运转盘 | [wheel.md](wheel.md) | changle.ca/g/wheel-of-fate |
| 游戏 · 谁是卧底 | [undercover.md](undercover.md) | changle.ca/g/undercover |
| 游戏 · 猜歌名 | [tune.md](tune.md) | changle.ca/g/name-that-tune |
| 游戏 · 神回复 | [punchline.md](punchline.md) | changle.ca/g/punchline |
| 游戏 · 你画我猜 | [draw.md](draw.md) | changle.ca/g/draw-and-guess |

## 大游戏和工具（8 个）

| 对话名 | 档案 | 网址 |
| --- | --- | --- |
| 游戏 · 到此一游 | [trip.md](trip.md) | changle.ca/trip |
| 游戏 · 藏在人群里 | [hide-crowd.md](hide-crowd.md) | changle.ca/hide |
| 游戏 · 一起跳 | [dance.md](dance.md) | changle.ca/party |
| 游戏 · 打碟 | [dj.md](dj.md) | changle.ca/dj |
| 游戏 · 抓紧了 | [hang-on.md](hang-on.md) | changle.ca/hang-on |
| 工具 · 随便 | [suibian.md](suibian.md) | changle.ca/eat |
| 工具 · 玩什么 | [events.md](events.md) | changle.ca/go |
| 工具 · 生活小工具 | [tools.md](tools.md) | changle.ca/tools |
| 工具 · 心愿单与打赏 | [wishlist.md](wishlist.md) | changle.ca/wish |

## 开场白

每个对话的第一条消息，换掉括号里的三处：

```
这个对话只管【分组 · 名字】（网址）。
先读 AGENTS.md、HANDOFF.md 和它的档案 docs/briefs/【档案名】.md，再读档案里列的文件。
然后用几句话告诉我：它现在做到哪、有什么没修的问题、你建议下一步做什么。先别动代码，等我说。
```

## 规矩

1. **一块地盘只归一个对话。** 档案里「文件」一节就是它的地盘。共用文件（`protocol.ts`、规则引擎、`registry.ts`、`App.tsx`、设计 token、CI）归平台对话，别的对话只在里面加自己那一行。
2. **开工前先看开着的 PR**，别和别的对话做重了。
3. **收尾时更新档案**：做了什么、定了什么、还剩什么。「最近的改动」可以重新从 git 提交记录里取。
4. **跨对话的事写进档案的「交给别的对话」一栏。** 对话之间不能直接说话，由 Steve 转过去。
5. **新游戏的顺序**：新开「游戏 · 名字」对话，第一个 PR 建档案、在首页登记但先藏着（`hidden: true`），做完测过再上首页。
6. **Codex 的任务卡**放在 `docs/codex-tasks/<档案名>/`，谁写的卡谁审 Codex 的 PR。

## 新建一份档案

复制一份最接近的档案改，章节不变：它是什么、文件、先读、测试、定过的事、现在、还剩什么、交给别的对话、最近的改动、记录。再在上面的表里加一行。

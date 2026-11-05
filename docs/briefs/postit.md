# 游戏 · 额头便利贴（postit）

对话名「游戏 · 额头便利贴」。网址 changle.ca/g/post-it。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每个人额头上一张便利贴，别人都看得到，只有你看不到。轮流问是非题，猜错喝一口，最后一个没猜出来的喝一杯。一部手机就举到额头上，大家给提示。

2 到 15 人。单机：手机举到额头上，竖着横着都行，大家给提示；19 组词分经典、派对、世界三类。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/postit.ts`
- 联机画面：`site/src/party/postit/NetPostit.tsx`、`net.css`（横屏两栏）、`parts.tsx`（便利贴和额头）
- 大屏：`site/src/party/postit/TvPostit.tsx`，样式 `site/src/styles/tv-postit.css`
- 单机画面：`site/src/party/postit/Postit.tsx`；额头上那块黄屏 `HeadsStage.tsx` 和 `heads.css`；选词 `DeckPicker.tsx` 和 `setup.css`
- 联机的样式还在共用的 `site/src/styles/party.css`（`.pi-`、`.sticky`、`.forehead`、`.deck-pick`）；倒计时的 `heads-pop` 动画也在那里，林波舞也用
- 内容：`site/src/data/postit.ts`。联机随机发的 `NOTES`、判断猜对的 `guessMatches`、单机的 19 组词 `HEADS_DECKS` 和三类 `DECK_GROUPS`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `postit` 的那一项（共用文件，只改这一项）
- 联机画面的数据 `PostitView`：共用的 `site/src/shared/protocol.ts` 里这一段

`HeadsStage.tsx`、`heads.css` 来自 #183，`DeckPicker.tsx`、`setup.css` 来自 #185，`net.css` 来自 #182。

## 先读

- `HANDOFF.md` 的 Add a party game 和 House rules
- `docs/DESIGN.md` 的游戏壳一节

## 测试

- `site/tests/engine.test.ts` 里名字以 `postit` 开头的测试
- `site/scripts/party_test.py postit`（单机和联机）
- `site/scripts/watch_test.py zh postit`（大屏）、`site/scripts/watch_players_check.py`（只看的座位）
- 动作感应只能在真手机上试。本地用假的传感器读数测过：竖着、横着两个方向、锁定旋转和不锁定、放平、减弱动效

## 定过的事

- 只有一部手机时举到额头上，大家给提示。
- 2026-11-04 Steve 同意按这些修：
  - 中途入座的人发一张随机便利贴，直接加入。写便利贴的时候入座，排到链子的最后。
  - 每个人的轮数一样。别人都猜出来了、还少一轮的人有最后一次机会：猜错或放弃喝一杯（不先喝一口），猜对谁都不喝。
  - 别人都走了、只剩一个人还在猜，谁都不喝。
  - 每局「再来一局」换下一个人先问。
- 游戏结束以后，主人不能再「算猜对」（那杯已经喊出去了）。
- 「我是猫」「I am a cat」这样整句猜也算对：先去掉「我是」「是不是」「吗」「I think I'm a」「right?」这些话再比。中文名字不拆（只狼不是狼）。
- 单机没有动作感应时：点屏幕下半边算猜对，上半边跳过，和低头、仰头一样。左右两边对举着手机的人是反的，所以不用。
- 单机的词按屏幕大小放到最大（最大和惩罚盖章一样大），一个词不拆成两行。
- 单机 19 组词，三类：经典、派对（有点辣、欢乐时光、爆笑瞬间）、世界（中国风、日本、韩国、东南亚、印度、中东、意大利、法国、拉丁美洲、加拿大）。世界类只放这个文化出名、受欢迎的东西：吃的、地方、节日、电影、名人，不拿人开玩笑。有点辣只到约会和夜生活，不露骨。同一个词只在一组里。
- 测试里新加的 postit 测试不动共用的随机种子（`sameDice`），不然后面戏精大赏的测试抽到的人会变。

## 现在

- 三个 PR 等 Steve 合并，合在一起本地测过，互不冲突：
  - #182 联机：连点发送不再清空问题；中途入座能玩；轮数一样和最后一次机会；短便利贴整句能猜；7 人以上回答时看得到提问人额头上的字；横屏左右两栏；对比度、小字、1 guess。合并会重新部署房间服务器。
  - #183 单机横屏：竖着横着都能玩，词跟着手机转正，低头和仰头按屏幕朝向判断。
  - #185 单机 13 组新词，分三类。截图对比的 game-post-it 是有意改的，要加 `update-screenshots` 标签更新基准（Steve 定）。
- 这份档案的更新是第四个 PR，最好最后合。

## 还剩什么

- 在真手机上横着举玩一局，看低头和仰头的灵敏度合不合适。阈值在 `Postit.tsx` 的 `NOD`、`TIP`、`LEVEL`。
- 联机「随机来一个」还只从 `NOTES`（人物、动物、东西）里出。可以让主人选一类（比如世界、派对），要 Steve 定。
- ui-C10（中途刷新能接着玩）的卡里有这个游戏，等 Codex 做。

## 交给别的对话

- 平台 · 全站设计：
  - `site / visual` 的 game-superlatives 截图对比时好时坏：main 上 #178、#180 两次是红的，#171 和 #182 是绿的。不碰最佳称号的 PR（比如 #183）也会因为它显示失败，重跑一次可能就过。
  - 联机底部的表情按钮高 42，不到 44；桌号按钮的读屏名字不含屏幕上的人数（axe 的 label-content-name-mismatch）。两处都在共用的 NetFrame。
  - 单机游戏壳横屏时，`.game-body` 能滚动、里面却没有能按的东西（比如结果页），axe 报 scrollable-region-focusable（GameShell）。
- 游戏 · 戏精大赏：`engine.test.ts` 里 those who watched get on stage next 靠共用随机种子的顺序，前面多一个抽随机数的测试就会失败。建议这个测试自己定种子。
- 游戏 · 真心话大冒险、游戏 · 最佳称号：`watch_players_check.py` 里这两段在 main 上失败。只看的手机现在显示大屏画面，脚本还在找手机画面。便利贴这段 #182 里已经改好。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 (#185) 额头便利贴 on one phone: 13 new decks on three shelves (Party, World)
- 2026-11-05 (#183) 额头便利贴 on one phone: hold it upright or sideways; the word turns, the nod is read either way
- 2026-11-05 (#182) 额头便利贴 online: the question stays, late arrivals play, everyone gets as many turns
- 2026-11-04 ui-C2：额头便利贴接入底部动作区与玩家条 (#145)
- 2026-11-03 A seat that just watches is never counted as a player: the bottle, the lists, the scores and the counts
- 2026-11-03 Watching, batch 3: King's Game, Never Have I Ever, Post-it and Freeze Dance on the big screen
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in Truth or Dare, Post-it, Limbo and Freeze Dance

## 记录

- 2026-11-02 建档案。
- 2026-11-04 全面检查：单机、联机 2 到 15 部手机、大屏，中英文、竖屏横屏都玩了，找到联机 5 个问题、单机 4 个问题和几处小问题。
- 2026-11-05 全部修好，开了 #182、#183、#185。仓库改名为 jiangchangle0724-del/Changle，这个对话接上了新名字。

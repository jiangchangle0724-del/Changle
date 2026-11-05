# 游戏 · 额头便利贴（postit）

对话名「游戏 · 额头便利贴」。网址 changle.ca/g/post-it。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每个人额头上一张便利贴，别人都看得到，只有你看不到。轮流问是非题，猜错喝一口，最后一个没猜出来的喝一杯。一部手机就举到额头上，大家给提示。

2 到 15 人。单机：手机举到额头上，竖着横着都行，大家给提示；19 组词分经典、派对、世界三类。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/postit.ts`
- 联机画面：`site/src/party/postit/NetPostit.tsx`、`net.css`（横屏两栏）、`parts.tsx`（便利贴和额头）
- 大屏：`site/src/party/postit/TvPostit.tsx`，样式 `site/src/styles/tv-postit.css`
- 单机画面：`site/src/party/postit/Postit.tsx`；额头上那叠便利贴 `HeadsStage.tsx` 和 `heads.css`；选词 `DeckPicker.tsx` 和 `setup.css`（联机主人选词组的单子也用它，带大杂烩那张）
- 样式：`site/src/party/postit/postit.css`，这个游戏的纸（`.note`：胶条、纹理、光、翘起的底边）、选词的便利贴、开始前、每轮的便利贴墙、结果、联机的便利贴和面板。原来在共用 `party.css` 里的那段已经搬过来，那里只留倒计时的 `heads-pop` 动画，林波舞也用
- 声音和震动：`site/src/party/postit/feel.ts`（纸的声音在浏览器里合成；震动的节奏；iPhone 只能在点按钮时轻震一下）
- 图：`site/src/party/postit/art.ts` 和 `art/`。2026-11-05 在 Steve 的 ChatGPT 里生成：每组词一张贴纸（19 组加大杂烩）、一叠便利贴、开始前的朋友们、结果的奖杯。WebP 透明底，图里没有字。原图在 Steve 的 ChatGPT 里那个叫 Generate Sticker Sheet 的对话，要重做或加图从那里接着生成，提示词写明同样的贴纸风格
- 内容：`site/src/data/postit.ts`。联机默认随机发的大杂烩 `NOTES`、判断猜对的 `guessMatches`、单机的 19 组词 `HEADS_DECKS` 和三类 `DECK_GROUPS`、词组的名字 `deckName`
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `postit` 的那一项（共用文件，只改这一项）
- 联机画面的数据 `PostitView`：共用的 `site/src/shared/protocol.ts` 里这一段

`HeadsStage.tsx`、`heads.css` 来自 #183，`DeckPicker.tsx`、`setup.css` 来自 #185，`net.css` 来自 #182，`postit.css`、`feel.ts`、`art` 来自设计改版。

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
- 2026-11-05 Steve 要：联机时主人可以选「随机来一个」和到时间没写的便利贴从哪组出。默认还是大杂烩（`NOTES`：人物、动物、东西），也可以选单机的 19 组之一。写便利贴的时候和一局结束时能选，玩的时候不能；已经贴上的不变；再来一局还用这组。词组里的词如果大杂烩里也有，别的叫法照样算对（孙悟空也能猜美猴王）。
- 大屏上写便利贴时，选了别的组，就写在「几张写好了」那一行后面（大杂烩不写）。不另起一行，免得字压到下面的小人。
- 2026-11-05 Steve 定的设计方向：真便利贴的手感。房间还是夜色，只有便利贴是亮的。单机、联机、大屏都改，加声音和震动，图用 ChatGPT 生成，图里不放字。
  - 选词：每组一张便利贴，经典黄、派对粉、世界蓝、大杂烩蜂蜜色，角上贴着这组的贴纸。选中的摆正、抬起、发光、打勾，不只靠颜色。
  - 额头：一叠便利贴。猜对盖「对！」撕走，跳过盖「跳过」甩走，时间到盖「时间到」。最后 10 秒滴答，最后 5 秒秒数变红、每秒震一下。
  - 每轮结束：这一轮的词一张张贴上墙，猜对的一张比一张高一个音。
  - 联机：便利贴能读到的那一刻翻过来（猜对、结束）。只有猜的人自己的手机响猜对或猜错，别人听到轻轻一声。
  - 大屏是房间的喇叭：写好一张、猜对一张、猜错、全部揭晓都有声音。
- iPhone 的网页不能震动，只有手指点开关时 Safari 会轻震一下：所以 iPhone 上只有点按钮时轻震，低头、时钟不震。安卓按节奏震。

## 现在

- 2026-11-05 都合并上线了：#182（联机）、#183（单机横屏）、#185（13 组新词）、#209（联机主人选词组），还有 Codex 的 #197（单机刷新后接着猜）。#185 和 #209 的合并都构建了 changle-rooms。#182 的合并没有触发 changle-rooms 的构建，规则是 #184 合并时（15:53）才部署上的（见交给别的对话）。
- 设计改版的 PR（#DESIGN）等 Steve：截图对比的 game-post-it 是有意改的，要 `update-screenshots` 标签更新基准，CI 绿了再合。不动规则，不用重新部署房间服务器。

## 还剩什么

- 在真手机上横着举玩一局，看低头和仰头的灵敏度合不合适。阈值在 `Postit.tsx` 的 `NOD`、`TIP`、`LEVEL`。
- 在单机里试一下新词组加刷新：选一组新词，猜两个，刷新，接着猜的还是这组（#197 按 id 存词组）。
- 在真手机上听一遍声音、摸一遍震动：安卓震的节奏，iPhone 点按钮时的轻震（`feel.ts`）。

## 交给别的对话

- 平台 · 首页与上线：#182 的合并提交（0102e18）改了 `site/src/shared/` 和 `site/src/data/`，Cloudflare 却没有构建 changle-rooms，合并提交上只有 Cloudflare Pages 和 been-there。之后 #184 合并时才部署上。要查一下 Workers Builds 那边为什么这次跳过了（build watch paths，或者是不是和紧接着的合并撞了）。
- 平台 · 全站设计：
  - `site / visual` 的 game-superlatives 截图对比时好时坏：main 上 #178、#180 两次是红的，#171 和 #182 是绿的。不碰最佳称号的 PR（比如 #183）也会因为它显示失败，重跑一次可能就过。
  - 联机底部的表情按钮高 42，不到 44；桌号按钮的读屏名字不含屏幕上的人数（axe 的 label-content-name-mismatch）。两处都在共用的 NetFrame。
  - 单机游戏壳横屏时，`.game-body` 能滚动、里面却没有能按的东西（比如结果页），axe 报 scrollable-region-focusable（GameShell）。
- 游戏 · 戏精大赏：`engine.test.ts` 里 those who watched get on stage next 靠共用随机种子的顺序，前面多一个抽随机数的测试就会失败。建议这个测试自己定种子。
- 游戏 · 真心话大冒险、游戏 · 最佳称号：`watch_players_check.py` 里这两段在 main 上失败。只看的手机现在显示大屏画面，脚本还在找手机画面。便利贴这段 #182 里已经改好。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 (#209) 额头便利贴 online: the host picks the deck the notes nobody writes come from
- 2026-11-05 (#185) 额头便利贴 on one phone: 13 new decks on three shelves (Party, World)
- 2026-11-05 (#197) ui(C10): resume Post-it behind its curtain
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
- 2026-11-05 Steve 说合并 #182、#183，#185 加截图标签，联机随机也要能选词组。合了 #182、#183，#185 的基准更新了，开了 #209。
- 2026-11-05 Steve 说先合并再做设计。图在桌面版自带的浏览器里用他的 ChatGPT 生成（Chrome 插件没连上），下载后从他的下载文件夹取回。#185 的截图检查两次卡在 GitHub 装字体超时，第三次过了，合并。#209 合 main 时和 #185、#197 有冲突，解决后合并。开始做设计改版。

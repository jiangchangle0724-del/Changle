# 游戏 · 你画我猜（draw）

对话名「游戏 · 你画我猜」。网址 changle.ca/g/draw-and-guess。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

轮到的人看词作画，其他人猜。一分钟没人猜中，画的人喝。

2 到 15 人。单机传一部手机，大家喊答案；联机每人一部，在自己手机上打字猜，画的每一笔实时出现在每台手机和大屏上。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/draw.ts`
- 单机画面：`site/src/games/DrawGuess.tsx`
- 联机画面：`site/src/online/games/NetDraw.tsx`；英文提示怎么显示：`site/src/online/games/drawHint.ts`
- 内容：`site/src/data/drawGuess.ts`（150 个词：简单 50、中等 60、困难 40）
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `draw` 的那一项（共用文件，只改这一项）
- 共用文件里这个游戏自己的几行：`site/src/shared/protocol.ts` 的 `DrawView` 和 `DRAW_GUESS_MAX`
- 用到、但不归这个对话的：画板 `site/src/components/DrawingPlate.tsx`（单机）和 `site/src/online/NetPlate.tsx`（联机，大屏也用）；繁体转简体 `site/src/data/t2s.ts`（猜歌名也用）；大屏画面 `site/src/online/games/TvDraw.tsx` 归「平台 · 大屏」

## 先读

- `HANDOFF.md` 的「Add a party game to the site」：规则、每台手机自己的视图、惩罚怎么发
- `site/src/shared/engine/api.ts`：规则拿到的 `Api`。注意 `leave` 被叫到的时候，那个座位已经不在 `api.ids()` 里了

## 测试

- `site/tests/engine.test.ts` 里名字以 `draw` 开头的 4 个测试，还有「只看的座位」那个大测试里的你画我猜一段
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py draw`（联机，四台手机）
- `site/scripts/watch_test.py zh draw`、`watch_test.py en draw`（大屏）
- `site/scripts/watch_players_check.py draw`（只看的座位）：Cat 那一条在 main 上就是红的，见「交给别的对话」

## 定过的事

- 一分钟没人猜中，画的人受罚。
- 2026-11-05 Steve 同意先修下面这几处（PR 见「记录」）：
  - 猜词怎么算对：大小写、全角半角、空格和标点都不管；繁体当简体（汽車就是汽车）；英文前面的 a、an、the 不管；单复数不管（cars、glass、butterflies）。近义词和别的说法（时钟、单车、plane）还不算，等 Steve 定（见「还剩什么」）。
  - 猜的字最长 40 个（`DRAW_GUESS_MAX`，输入框和房间服务器用同一个数）。最长的答案 Living paycheck to paycheck 是 27 个字母。
  - 英文提示：一个字母一个空，单词之间空一大格，一个单词不拆到两行，连字符照原样显示（All-nighter 是 `___-_______`）；读屏念「4 words: 6, 8, 2 and 8 letters」。
  - 画的人中途走了（离桌，或改成只看）：这一轮马上结束，谁也不罚，词亮出来，结果页写「X 不画了，这轮不罚」，下一位是座位上紧挨着的那个人，不跳人。选难度时走了，轮到下一个人选。一轮已经结束、还没点「下一位画」时走了，直接到下一个人选难度。
  - 猜的人走了，剩下的人都已经猜中：这一轮马上结束。

## 现在

- 单机、联机都能玩，中英文都有，大屏有自己的画面。已经迁进游戏壳（UI 计划 C2，#142），单机刷新后能接着玩（C10，#195）。
- 2026-11-05 这个对话的第一个 PR 修了上面「定过的事」里那几处，还没合并。

## 还剩什么

等 Steve 定：

1. 近义词怎么算对：给词库每个词加几个别名，还是让画的人点一下那条猜词就算对。建议后者：中英文、错别字都管得住，代价是画的人可以放水。
2. 联机一轮多长：首页卡片和档案写一分钟，单机 60 秒，联机 80 秒（规则里也写八十秒）。
3. 画板两个文件（`DrawingPlate.tsx`、`NetPlate.tsx`）只有这个游戏和大屏在用，要不要划给这个对话。修横屏要动它们。

没修的：

- 联机横着拿手机猜：画板被压成一条窄的（画的圆变成竖的椭圆），底下还被表情栏盖住一截。单机画到一半把手机横过来，画被裁掉一半。（等上面第 3 条）
- 单机：点了「猜中了」就回不去，画也看不到了；点错了没法改。
- 难度按钮写「1 分、2 分、3 分」，其实第一个猜中的得两倍，画的人也得分。规则里写了「第一个猜中的得分最多」，按钮上的分数容易让人误会。
- 两个人玩，猜的那个走了：画的人一个人画到时间到，还是会被罚。
- 「深夜emo」的中文提示写「5 个字」（两个汉字加三个字母）。
- 画板工具按钮读屏念的是英文色名（chalk、pink……），中文手机也一样，联机的色名还和颜色对不上；粗细念成数字。（画板文件，等上面第 3 条）

## 交给别的对话

- 平台 · 大屏（`TvDraw.tsx`）：
  1. 英文提示的单词连成一串了（空格被合并），和手机上原来的毛病一样。手机已经改好，大屏照着改一行：`import { hintBlanks } from "./drawHint";`，把 `v.hint.en.split("").join(" ")` 换成 `hintBlanks(v.hint.en)`。
  2. `DrawView` 新加了 `left`：画的人这一轮中途走了（谁也不罚），这时 `drawer` 已经是下一个要画的人。结果画面上「{drawer} 在画」那一行，`left` 有值时会写成下一个人的名字，应该换成「画的人走了」之类。
- 平台 · 房间与联机：
  1. `watch_players_check.py` 的 draw（还有 freeze）检查要「只看」的手机上有分数列表，可是只看的手机现在整屏显示大屏画面，所以 main 上这两条就是红的。检查要跟着改。
  2. 联机页面顶上那个桌子按钮（`.table-btn`，人数那个）axe 报 serious 的 label-content-name-mismatch：按钮上看得到的字不在它的读屏名字里。每个联机游戏都有。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 你画我猜：繁体、a/the、单复数也算猜对，长答案打得全，英文提示分得出单词，画的人中途走了不罚错人、不跳人
- 2026-11-05 ui(C10): resume Draw and Guess after a reload (#195)
- 2026-11-04 Merge pull request #157 from jiangchangle0724-del/claude/watchers-not-players
- 2026-11-04 ui-C2：你画我猜接入底部动作区与玩家条 (#142)
- 2026-11-03 A seat that just watches is never counted as a player: the bottle, the lists, the scores and the counts
- 2026-11-02 feat(games): one game shell for every game: the shared top bar, tonight's people, buttons by the thumb (UI plan A5) (#131)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink

## 记录

- 2026-11-02 建档案。
- 2026-11-05 这个对话第一次开工。读了档案和代码，单机两轮（中英文）、四台手机联机、大屏都试了一遍，列出上面的问题。Steve 同意先修猜词长度、英文提示、画的人中途离开，加上繁体、a/the、单复数。分支 `claude/draw-guess-fixes`。房间服务器多带了繁体转简体的表，打包后大了约 24 KB（gzip，1269 → 1294 KB）。

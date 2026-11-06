# 游戏 · 你画我猜（draw）

对话名「游戏 · 你画我猜」。网址 changle.ca/g/draw-and-guess。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

轮到的人看词作画，其他人猜。一分钟没人猜中，画的人喝。

2 到 15 人。单机传一部手机，大家喊答案；联机每人一部，在自己手机上打字猜，画的每一笔实时出现在每台手机和大屏上。猜得差不多，画的人点一下那条就算对。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/draw.ts`
- 单机画面：`site/src/games/DrawGuess.tsx`
- 联机画面：`site/src/online/games/NetDraw.tsx`；英文提示怎么显示：`site/src/online/games/drawHint.ts`；联机画面自己的样式：`site/src/styles/draw.css`（还有一些旧的在共用的 `online.css` 里：`.draw-*`、`.guess-*`、`.solved-line`）
- 画板（2026-11-05 起归这个对话）：`site/src/components/DrawingPlate.tsx`（单机）和 `site/src/online/NetPlate.tsx`（联机，大屏的 `TvDraw.tsx` 也用它）；两个画板共用的笔刷粗细和读屏名字：`site/src/components/plateLabels.ts`。画板的样式在共用的 `components.css`（`.plate-*`、`.swatch`、`.brush`、`.inks`）和 `landscape.css`（手机横着拿时画板在左边）里
- 内容：`site/src/data/drawGuess.ts`（150 个词：简单 50、中等 60、困难 40）
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `draw` 的那一项（共用文件，只改这一项）
- 共用文件里这个游戏自己的几行：`site/src/shared/protocol.ts` 的 `DrawView`、`DRAW_GUESS_MAX` 和 `DRAW_ROUND_MS`
- 用到、但不归这个对话的：繁体转简体 `site/src/data/t2s.ts`（猜歌名也用）；大屏画面 `site/src/online/games/TvDraw.tsx` 归「平台 · 大屏」

## 先读

- `HANDOFF.md` 的「Add a party game to the site」：规则、每台手机自己的视图、惩罚怎么发
- `site/src/shared/engine/api.ts`：规则拿到的 `Api`。注意 `leave` 被叫到的时候，那个座位已经不在 `api.ids()` 里了

## 测试

- `site/tests/engine.test.ts` 里名字以 `draw` 开头的 5 个测试，还有「只看的座位」那个大测试里的你画我猜一段。新加的测试用了随机数的，用完要把 `seed` 还回去（像「点一下算对」那个），不然排在后面的戏精大赏测试会因为抽到别的剧本挂掉
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py draw`（联机，四台手机）
- `site/scripts/watch_test.py zh draw`、`watch_test.py en draw`（大屏）
- `site/scripts/watch_players_check.py draw`（只看的座位）：Cat 那一条在 main 上就是红的，见「交给别的对话」

## 定过的事

- 一分钟没人猜中，画的人受罚。联机一轮也是一分钟（`DRAW_ROUND_MS`，2026-11-05 Steve 定，以前联机是 80 秒）。
- 2026-11-05 Steve 定：近义词和别的说法（时钟猜钟表、plane 猜 Airplane）由画的人点一下算对，不给词库加别名。只有画的人能点，房主不画的时候也不能。点了以后，打过这个词的人全都算猜中（按打的先后算分，第一个得两倍），这个词在列表里不再显示，这一轮里再有人打它（单复数、繁体都算）直接算对。
- 2026-11-05 Steve 定：画板两个文件归这个对话。画板在任何屏幕上都是正方形（手机横着拿也是），圆画出来还是圆。单机的画按画板的比例存，转手机时跟着缩放，不会被裁掉。笔刷粗细也按画板的比例，单机和联机一样（细、中、粗，开局是中）。工具按钮的读屏名字中英文都有（白色、粉色……，细、中、粗，撤销一笔）。`plate-watch` 加在整块画板外面那层（`.plate-draw`）上，`landscape.css` 按这个写的；以前加在画布那层，横着拿时画布被拉成窄条。
- 2026-11-05 Steve 同意先修下面这几处（#258，当天合并上线）：
  - 猜词怎么算对：大小写、全角半角、空格和标点都不管；繁体当简体（汽車就是汽车）；英文前面的 a、an、the 不管；单复数不管（cars、glass、butterflies）。
  - 猜的字最长 40 个（`DRAW_GUESS_MAX`，输入框和房间服务器用同一个数）。最长的答案 Living paycheck to paycheck 是 27 个字母。
  - 英文提示：一个字母一个空，单词之间空一大格，一个单词不拆到两行，连字符照原样显示（All-nighter 是 `___-_______`）；读屏念「4 words: 6, 8, 2 and 8 letters」。
  - 画的人中途走了（离桌，或改成只看）：这一轮马上结束，谁也不罚，词亮出来，结果页写「X 不画了，这轮不罚」，下一位是座位上紧挨着的那个人，不跳人。选难度时走了，轮到下一个人选。一轮已经结束、还没点「下一位画」时走了，直接到下一个人选难度。
  - 猜的人走了，剩下的人都已经猜中：这一轮马上结束。

## 现在

- 单机、联机都能玩，中英文都有，大屏有自己的画面。已经迁进游戏壳（UI 计划 C2，#142），单机刷新后能接着玩（C10，#195）。
- 2026-11-05 #258 合并上线：猜词放宽、长答案、英文提示、画的人中途走了。
- 2026-11-05 #269：画的人点一下算对，联机一轮一分钟。
- 2026-11-05 第三个 PR（叠在 #269 上）：画板横着拿是正方形、单机转手机不裁画、工具按钮读屏中英文。

## 还剩什么

没修的：

- 单机：点了「猜中了」就回不去，画也看不到了；点错了没法改。
- 难度按钮写「1 分、2 分、3 分」，其实第一个猜中的得两倍，画的人也得分。规则里写了「第一个猜中的得分最多」，按钮上的分数容易让人误会。
- 两个人玩，猜的那个走了：画的人一个人画到时间到，还是会被罚。
- 「深夜emo」的中文提示写「5 个字」（两个汉字加三个字母）。
- 联机横着拿手机画画时，画板只有 174 像素见方（下面要放两排工具），比横着猜的人看到的（273）小一圈。能用，以后可以把工具挪到画板旁边。

## 交给别的对话

- 平台 · 大屏（`TvDraw.tsx`）：
  1. 英文提示的单词连成一串了（空格被合并），和手机上原来的毛病一样。手机已经改好，大屏照着改一行：`import { hintBlanks } from "./drawHint";`，把 `v.hint.en.split("").join(" ")` 换成 `hintBlanks(v.hint.en)`。
  2. `DrawView` 新加了 `left`：画的人这一轮中途走了（谁也不罚），这时 `drawer` 已经是下一个要画的人。结果画面上「{drawer} 在画」那一行，`left` 有值时会写成下一个人的名字，应该换成「画的人走了」之类。
  3. 联机一轮改成一分钟了，大屏的倒计时圈还按 80 秒画（`const DRAW_MS = 80_000`），开局只有四分之三圈。换成 `import { DRAW_ROUND_MS } from "../../shared/protocol";`。
  4. 画的人点一下算对的猜词，在 `guesses` 里和猜中的一样（`ok: true`，`text` 是空的），大屏不用改；同一个词别人打过的那几条会从列表里拿掉，按位置做的 key 会跳一下。
  5. `watch_test.py` 的 draw 一段，抽到「手机 / Phone」这个词时会误报泄密：大屏上本来就写着「手机」和 Phone 这几个字。换一个词再跑就过。
- 游戏 · 戏精大赏：`engine.test.ts` 里戏精大赏那个大测试靠随机数的顺序（第二轮抽到的剧本角色够不够让看戏的人都上台）。排在它前面的测试多用一次随机数，它就可能挂。
- 平台 · 房间与联机：
  1. `watch_players_check.py` 的 draw（还有 freeze）检查要「只看」的手机上有分数列表，可是只看的手机现在整屏显示大屏画面，所以 main 上这两条就是红的。检查要跟着改。
  2. 联机页面顶上那个桌子按钮（`.table-btn`，人数那个）axe 报 serious 的 label-content-name-mismatch：按钮上看得到的字不在它的读屏名字里。每个联机游戏都有。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 你画我猜的画板：横着拿也是正方形，单机转手机不裁画，工具按钮读屏中英文
- 2026-11-05 你画我猜：画的人点一下猜词就算对，联机一轮一分钟
- 2026-11-05 Merge pull request #258 from jiangchangle0724-del/claude/draw-guess-fixes
- 2026-11-05 你画我猜：繁体、a/the、单复数也算猜对，长答案打得全，英文提示分得出单词，画的人中途走了不罚错人、不跳人
- 2026-11-05 ui(C10): resume Draw and Guess after a reload (#195)
- 2026-11-04 Merge pull request #157 from jiangchangle0724-del/claude/watchers-not-players
- 2026-11-04 ui-C2：你画我猜接入底部动作区与玩家条 (#142)
- 2026-11-03 A seat that just watches is never counted as a player: the bottle, the lists, the scores and the counts
- 2026-11-02 feat(games): one game shell for every game: the shared top bar, tonight's people, buttons by the thumb (UI plan A5) (#131)
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink

## 记录

- 2026-11-02 建档案。
- 2026-11-05 这个对话第一次开工。读了档案和代码，单机两轮（中英文）、四台手机联机、大屏都试了一遍，列出上面的问题。Steve 同意先修猜词长度、英文提示、画的人中途离开，加上繁体、a/the、单复数。分支 `claude/draw-guess-fixes`。房间服务器多带了繁体转简体的表，打包后大了约 24 KB（gzip，1269 → 1294 KB）。Steve 自己开了 #258，CI 绿了，同意后合并上线。
- 2026-11-05 晚上 Steve 定了三件事：近义词让画的人点一下算对，联机一轮一分钟，画板两个文件归这个对话。仓库改名叫 Changle 以后，这个对话的 GitHub 连接用新名字重新连过。第二个 PR（#269，分支 `claude/draw-accept-minute`）做前两件；第三个 PR（分支 `claude/draw-plate`，叠在 #269 上）修画板：横着拿时猜的人看到的画板从 157×273 的窄条变成 273×273，圆还是圆，不再被表情栏挡；单机画一个对角的叉再转手机，以前只剩左上角一块，现在整个叉跟着画板缩小。

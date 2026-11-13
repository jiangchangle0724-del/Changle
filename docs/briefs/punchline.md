# 游戏 · 神回复（punchline）

对话名「游戏 · 神回复」。网址 changle.ca/g/punchline。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

每个题目两个人各写一个答案，其他人投票。票少的喝，全票通过有加分。最后一轮大家写同一题，每人投三票。

3 到 15 人，最多 8 人写，其他人当观众投票，再来一局时先写。单机：手机传一圈，偷偷写答案，举手数票。联机：每人用自己的手机。有大屏时大屏演整场，手机当遥控器。

## 文件

- 规则（联机和大屏时在房间服务器上跑）：`site/src/shared/engine/games/punchline.ts`
- 计分和每一步的时长（规则和画面共用）：`site/src/shared/punchline.ts`
- 画面：`site/src/party/punchline/`
  - 单机 `Punchline.tsx`，联机的手机 `NetPunch.tsx`，大屏 `TvPunch.tsx`
  - 喜剧俱乐部舞台 `show/Stage.tsx`（单机、联机、大屏共用），开发时的预览页 `show/Preview.tsx`
  - 题目卡等小部件 `parts.tsx`，名字和头像 `show/who.tsx`，游戏壳里的按钮 `ShellActions.tsx`
- 样式：舞台 `site/src/styles/show.css`；`party.css` 里 `.pl-` 开头的几段，`landscape.css` 里手机横拿时 `.sh-` 开头的几段（共用文件，只改这几段）
- 内容：`site/src/data/punchline.ts`（对决题 125 道，决赛题 16 道，「给我一个」的现成答案 26 个）。加题只往每组最后加，不改原来的顺序，开着的桌发到一半的牌才不会乱
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `punchline` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `punchline` 开头的测试
- `site/scripts/party_test.py punchline`（单机和联机）
- `site/scripts/tv_test.py`（大屏上的整局神回复）
- `site/scripts/watch_test.py zh punchline`（两台大屏和一部只看的手机，再来一局）
- CI 的截图对比里有单机首屏一张：`site/tests/visual/__screenshots__/game-punchline.png`

## 定过的事

- 很长的答案在小屏手机上那一行就让它高，不收起来（Steve 11-02 定的）。
- 有大屏时，大屏整场演出（开场、对决、投票揭晓、比分、颁奖），手机变成遥控器。
- 超过 8 人的当观众。再来一局时，上一局当观众的人先写，剩下的位子给写得最少的人，再按座位（Steve 11-05 定的）。单机和联机一样。
- 全票通过有加分。
- 联机写答案一次只出一题：交了一题，下一题在原地出来，交过的缩成一行，点「改」还能改（Steve 11-05 看图说行）。
- 联机和大屏的「再来一局」接着从同一副题里发，一副发完才重新洗，最近两局的题压在最底下。所以连着玩不会碰到上一局的题（Steve 11-05 同意修）。
- 加中文网上比较火、大家都能 relate 的题（Steve 11-11）。写题的规矩：不点真人的名字，不碰政治，英文要让不懂这个梗的人也能玩。

## 现在

- 单机、联机、大屏都能完整玩一局。11-05 在最新的 main 上跑过规则测试、`party_test.py punchline`、`tv_test.py`、`watch_test.py zh punchline`，都过了。
- 11-04 迁进了统一游戏壳（UI 计划 C2，#170）。单机手机横着拿时，俱乐部在左边占满高度，按钮在右边。联机和竖着拿没变。
- 11-05 单机中途刷新或切走再回来，接着玩，写到一半的答案和投票都还在（UI 计划 C10，#207）。
- 11-05 联机「再来一局」不再撞题（#262，11-05 合并上线）。以前每局重新洗题：8 个人连玩两局，第二局几乎一定有上一局的题（平均 3 道多），4 个人也有六成。现在连玩 30 局试过：8 人一桌，一道题最早两局以后才会再出现，人少更久；决赛题最早 6 局以后。上线后在 changle.ca 上开了一桌，三个人连玩 5 局，30 道对决题、5 道决赛题都没有重复。
- 11-05 超过 8 人轮流写（#270，11-05 合并上线）。以前每局都是先入座的 8 个人写。现在再来一局时，上一局当观众的人先写（一桌最多 15 人，观众最多 7 个，所以都能写），剩下的位子给写得最少的人。9 到 15 人连玩 20 局试过，每个人当观众的局数最多差一局；有人中途入座或离开也照样轮。单机和联机都改了；规则说明、单机开始前那一行、联机观众手机上都写了「下一局先写」。上线后在 changle.ca 上用 9 部手机试过：第一局当观众的人看到「下一局你先写」，再来一局拿到了题目。
- 11-05 联机写答案一次一题（#280，Steve 看了对比图说行，11-11 合并上线）。以前两道题和各自的答案框叠在一起，667 高或更小的手机上，第二个框和主持人的「不等了，开始亮答案」一开始在反应栏下面，要往下划。现在只有还没答的第一题有框，交过的变成一行（题目小字、答案、改），下一题在原地出来，主持人的按钮跟在下面。改一个交过的答案，框里还是原来写的字，另一题写到一半的字也不丢。在 375×667、360×640、390×844 上中英文都量过：开始、交了一题、两题都交了，框、交、「给我一个」和主持人的按钮都在屏幕里。上线后在 changle.ca 上开了一桌，主人用 iPhone SE 大小的手机：开始和交了一题以后，框、按钮和「不等了」都在屏幕里。
- 11-11 加题（这个对话的 PR）：对决题 75 → 125，决赛题 10 → 16，「给我一个」20 → 26。新题是 2025 到 2026 年中文网上的热梗和大家都懂的日常：打工、过年、相亲、朋友圈、直播间、搭子、i 人、邪修、奥德赛时期、青梅牛马……每道都有英文。

## 还剩什么

- 题库 125 道：8 人一桌一局用 16 道，连玩七局不会重复，之后一道题最早三局以后才会再出现。网上的梗过一阵就旧了，隔几个月可以换一批。
- 换别的游戏再回来，题会重新洗（这副题放在这局游戏里，房间不记）。要记住得改房间服务器，归「平台 · 房间与联机」，目前没有必要。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-11 Punchline: 50 more prompts from life and memes on the Chinese internet, 6 finals, 6 stock answers
- 2026-11-05 Punchline online: your prompts one at a time, so a small phone shows the box, its buttons and the host's button (#280)
- 2026-11-05 Punchline: past eight at the table, whoever watched a game writes the next one (#270)
- 2026-11-05 Punchline online: 再来一局 deals on from the same piles, so a table doesn't get its prompts again (#262)
- 2026-11-05 ui(C10): keep Punchline answers drafts and votes (#207)
- 2026-11-04 ui-C2：神回复迁移游戏壳，横屏舞台待壳支持 (#170)
- 2026-11-02 Watching: every game's own big-screen view, starting with four games（#149，11-04 合并）
- 2026-11-02 Punchline on one phone: a loser's stamp no longer lands on the next prompt
- 2026-11-02 perf(site): the home page's first download 166 → 145 KB gzip, with a budget in CI (UI plan A6, step 1) (#117)
- 2026-11-01 Every page has its own address; the back button closes sheets (UI plan A3) (#87)
- 2026-11-01 Online: keep the move you have to make clear of the reactions bar
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in the last games: whose turn it is, toasts, champions

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 记下 Steve 11-02 的回答。
- 2026-11-04 这个对话第一次开工：读档案和文件，在当时的 main 上跑了全部测试（都过），查出联机「再来一局」撞题、超过 8 人总是同样 8 个人写、小屏写答案要往下划，告诉 Steve。
- 2026-11-05 Steve 说继续：修联机「再来一局」撞题，加了规则测试（8 人连玩 6 局、5 人连玩 9 局，不和上一局撞题，一副题里不重复）；补齐档案的文件、测试、现在和最近的改动。
- 2026-11-05 Steve 同意合并：#262 合并上线，房间服务器和网站的部署检查都过了。在 changle.ca 上开一桌三个人连玩 5 局，30 道对决题、5 道决赛题没有重复。
- 2026-11-05 Steve 同意超过 8 人轮流写：规则（联机和大屏）和单机都改了，加了规则测试（11 人连玩 5 局，看过的下一局都写，4 局里每人当观众的局数最多差一局；改之前开着的桌也能接着轮）。本地 9 部手机联机、10 人单机（中途刷新）都试过。
- 2026-11-05 Steve 同意合并：#270 合并上线（合并前在最新的 main 上又跑了一遍规则测试），部署检查都过了。在 changle.ca 上 9 部手机试过轮流写。
- 2026-11-05 Steve 看了写答案的对比图说行：开 PR，接在最新的 main 后面；`party_test.py punchline` 改成一题一题地答。
- 2026-11-11 Steve 同意合并：#280 合并上线（合并前在最新的 main 上又跑了规则测试、打包、`party_test.py punchline` 和小屏测量），部署检查都过了；在 changle.ca 上用 iPhone SE 大小的手机试过。
- 2026-11-11 Steve 要加中文网上比较火、大家能 relate 的题：查了 2025 年度十大网络流行语和 2026 年的热梗盘点，写了 50 道对决题、6 道决赛题、6 个「给我一个」，都只往后加。规则测试改成按题库大小算要连玩几局；`party_test.py punchline`、`tv_test.py` 和打包都过了，最长的新题在大屏和小屏手机上看过。

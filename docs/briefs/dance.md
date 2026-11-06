# 游戏 · 一起跳（dance）

对话名「游戏 · 一起跳」。网址 changle.ca/party（首页「即将上线」里有卡片，点开是介绍）。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视放歌当教练，大家手里拿着手机跟着跳，手机的传感器打分。一首歌分学、跳、结算三段；20 个 8 拍基础动作拼成 6 套舞。打碟原计划也用这个底座，后来做在主站里（`site/src/party/dj/`），没用它。

## 文件

- 房间和页面（Worker `party`）：`games/party-server/`
  - 一支舞怎么排：`src/shared/show.ts`；舞和动作从哪来：`src/shared/catalog.ts`
  - 手机判每一拍：`src/shared/taps.ts`；房间算连击和结算：`src/server/tally.ts`
  - 音箱端的声音：`src/client/synth.ts`；两边页面上的字：`src/client/words.ts`
- 共用底座（纯逻辑：对时、校准、打分、房间状态机）：`games/party-base/`
- 动作库和学跳流程：`games/dance/`（`data/` 动作和舞，`src/session-flow.ts`）
- Codex 的任务卡：`docs/codex-tasks/dance-*.md`

## 先读

- `docs/dance-along.md`（方案和任务表）
- `games/party-base/CONTRACTS.md`
- `games/party-server/README.md`
- `docs/field-notes/2026-11-01.md`（对时实测）

## 测试

- `games/party-base`：`npm test`（42 个）；`games/party-server`：`npm run typecheck`、`npm test`（68 个）、`npm run build`；`games/dance`：`npm test`（138 个）；CI `.github/workflows/party.yml`
- 浏览器里把一支舞从头跳到结算：`games/party-server/scripts/song-check.cjs`（Worker 要带 `--var ALLOW_TEST_SETTINGS:1` 跑，见 README），约两分半；中间会让一台手机断网 2.5 秒
- 对时：`games/party-server/scripts/timing-check.cjs`（本地，或 `BASE=https://changle.ca` 测线上）

## 定过的事

- 电视用 Apple TV，音箱页在 Mac 或 iPad 上 AirPlay 镜像；每场开始做一次 10 秒校准。
- 一起跳先于打碟做。
- A1 对时在正式站实测过，Steve 11 月 1 日验收。
- 学的阶段每个不同的动作只教一次：先看 8 拍再跟 8 拍，速度 70%（#107）。
- 热身和收尾凑满整 8 拍，至少 1 分钟，音乐一直踩在拍子上（#107）。
- 动作名「八步摇」不改（Steve 11-02 确认）。
- 首页「即将上线」里先放一张一起跳卡片，点开是介绍，不能玩（Steve 11-02 同意）。卡片在 `site/src/games/registry.ts` 的 `SOON` 里；能玩了以后挪进 `GAMES`，删掉 `SOON` 里那条。
- 11-05 Steve 让这个对话按它的建议做：
  - 一起跳留在 changle.ca/party 自己的 Worker，不并进主站。
  - 先让一支舞从学到跳到结算走通，再接传感器。手机上一个大按钮代替传感器，每一拍点一下（方案的「假体感」）；A2 把按钮换成传感器，判拍子、连击、结算都不用改。
  - 教练先用字：阶段、动作名（两种语言）、8 拍大字、提前 2 拍的「接下来」。3D 教练是 A4。
  - 音乐先用音箱端现场合成的鼓点（每拍一下底鼓、双数拍拍手、踩镲、低音），A5 换成生成好的歌。
  - 热身和教学放完，房间自己接着跳，不用主人点。主人可以：先学再跳或直接跳；跳过热身和教学直接跳；这一段再来（回到正在听的那个 8 拍的开头，先倒数 4 拍）；舞听完以后看结果（跳过收尾）；随时停下。
  - 结算：简单只发奖不排名，中等和困难再加分数榜。最稳：离拍子最近（在踩准够四分之一的人里比）；最嗨：连着踩准最多拍；最努力：动的拍子最多。先一人一个，人少时一个人可以拿几个。
  - 全场连击：一拍里正在跳的人有六成踩准就算，满 32 拍放一次烟花。点过按钮的手机才算在跳。
  - 测试用的短舞（两个动作 16 拍）只在本地检查时能开（`ALLOW_TEST_SETTINGS`），页面上不列。
  - 房间的时钟是音箱端页面的 `performance.timeOrigin + performance.now()`，不是 `performance.now()` 本身：音箱端页面跳舞中途刷新，舞接着在原地放（浏览器里测过）。
  - 手机断网时发不出去的小节，连回来以后整支舞已发的小节再发一遍（房间每拍留最新的，重发没坏处）。

## 现在

- 已合并：A1 对时、C1 动作库（#95）、C5 学跳流程（#107），动作库有自己的 CI（#106）；11-05 一支舞从学到跳到结算，手机按钮代替传感器（#202）；这份档案和三张 Codex 卡：C2 重写，新写 C3 电视画面、C4 手机画面（#203）。
- 线上 changle.ca/party 能用按钮跳完整的一支舞。#202 部署后在正式站上用脚本跑过：对时（`timing-check.cjs`：三台手机的时钟误差都不到 1 毫秒，校准量出 179 毫秒，设的是 180，每拍闪光离拍子最多 11 毫秒）；一支真舞（一次性的脚本，没进仓库：音箱端加三台手机，主人选「直接跳」开始「广场初体验」，热身一分钟后房间自己进到跳，两分钟跳完看结果，最后结束房间）。一台每拍点、一台每拍晚 90 毫秒点、一台不点：结算、三个奖、6 次烟花、每台手机自己的那一行都对，页面没有报错。
- 电视和手机的画面还是「能用」的样子，好看、3 米外看得清是 C3、C4。

## 还剩什么

- Project 的说明里仓库名还是旧的 `jiangchangle0724-del/changle-ca`，要改成 `jiangchangle0724-del/Changle`：GitHub 上改了名，推代码旧名字还能用，开 PR 要按新名字接仓库。在 claude.ai 打开 Project「Changle.ca」改说明。
- Cloudflare：Worker `party` 的 build watch paths 加 `games/dance/*`。房间和页面读动作库，不加的话，只改了 `games/dance` 的合并不会重新部署。在 Cloudflare 打开 Worker `party`，Settings → Build 里的 Build watch paths 加一行 `games/dance/*`，保存。不急：以后只改 `games/dance` 的合并才需要它。
- 上面两处都要登录。11-05 这个对话在 Steve 电脑上的浏览器里打开过，Cloudflare 和 claude.ai 都没登录，Steve 不在家，没改。Steve 自己改，或者登录以后让这个对话来点。
- 真机测试（要 Steve）：Mac 或 iPad 投到 Apple TV，iPhone 扫码。先照 `docs/field-notes/2026-11-01.md` 第 2 节测对时；再跳一支简单舞：听鼓点和手机闪光是不是踩在一起，每一拍点按钮，看手机说「踩准了」准不准。
- 下一步的顺序（建议）：C3、C4 发给 Codex（C3 先，它把主站的 tokens 接进来）；C2 可以同时发（先用假骨架把流水线做通）；A2 传感器（要真 iPhone 测）；A5 六首歌（Lyria 生成要花钱，先问 Steve）；A4 3D 教练（要 20 个动作的录像）。
- C2 和 A4 要的录像：找会跳的朋友录 20 个动作，每个录 4 遍，用 Rokoko Video 或 DeepMotion 转成 Mixamo 骨骼的 FBX（`docs/codex-tasks/dance-C2-asset-pipeline.md`）。
- 首页卡片还在「即将上线」。按钮版现在能玩了，要不要挪进首页的游戏里，等 Steve 定（怎么挪见「定过的事」）。
- 方案里还没做的：每 3 首提醒喝水、30 分钟休息（C8）；电视的「背面跟随」视角和镜子提示（等 3D 教练）；困难模式比对动作形状（A3）；打分黄金集（C7）。

## 交给别的对话

- 游戏 · 打碟：知会一下，不用做什么。一起跳没有和打碟共用底座：打碟的「跟着跳」是主站里的另一套（10 个动作，每拍看手的加速度够不够 2.5 m/s²）；一起跳是 20 个动作、party-base 的打分。以后打碟想用一起跳的动作库或打分，`games/dance/` 和 `games/party-base/src/scoring.ts` 都是纯 TypeScript，可以直接引。一起跳接传感器（A2）时会参考打碟的 `site/src/party/dj/phone/DancePad.tsx`（iPhone 授权、去掉重力）。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 docs: 一起跳's brief after its first dance; Codex cards C2 (rewritten), C3 and C4（#203）
- 2026-11-05 一起跳: fixes from a review — the speaker's clock across a reload, restarts, ids, dropped bars（#202）
- 2026-11-05 一起跳: one dance from learning it to the results, a button standing in for the motion sensor（同上）
- 2026-11-05 dance: the library's types written out, so the room and the pages import it without zod（同上）
- 2026-11-05 party-base: the room moves into the dance by itself; the host can stop a dance（同上）
- 2026-11-02 Home: 一起跳 · Dance Along under "coming soon"
- 2026-11-01 fix(dance): teach each move once and complete warmup phrases
- 2026-11-01 feat(dance): add C5 session flow and practice timeline
- 2026-11-01 fix(dance): address move library review feedback
- 2026-11-01 feat(dance): add validated move library and six routines
- 2026-11-01 Preview builds are off for both new Workers
- 2026-11-01 What's On and 一起跳 are connected to Cloudflare

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 首页「即将上线」加了一起跳卡片；「八步摇」确认不改。
- 2026-11-05 Steve 说「你来帮我做」：按建议留在 /party，做了一支舞从学到跳到结算（按钮代替传感器），重写 C2 卡，写了 C3、C4 卡。浏览器检查时发现并修了：页面的按钮样式盖掉了 `hidden`，「看结果」一直露着，早按会被房间拒绝；电视 720p 时下半截（接下来、连击条）掉出屏幕。
- 2026-11-05 另一个代理审查代码，找出并修了：音箱端刷新后房间的时钟从 0 重来（A1 起就有）；这一段再来在倒数时再按一次会退两段、能清掉全部成绩；用 `toString` 这类名字当手机 id 能让结算出错；陌生的舞的 id 会一直存在内存里；断网时的小节丢了。又顺手修了：倒数第一拍常常来不及放（现在点了以后等 0.6 秒再倒数）；点按钮的时间按手指按下的那一刻算。仓库在 GitHub 上改了名，开 PR 要 Steve 同意按新名字接。
- 2026-11-05 早上 Steve 同意按新名字接仓库：开了 #202（代码）和 #203（档案和卡）。
- 2026-11-05 晚上 Steve 说「合并」。main 往前走了 151 个提交，HANDOFF.md 的表撞了一行（main 加了 hang-on 那行），把 main 合进 #202，两行都留；本地测试和 CI 都过了，合并 #202。Cloudflare 部署好以后在正式站上跑了对时和一支真舞，都过了；再合并 #203。Project 说明的仓库名和 Cloudflare 的 watch path 要登录才能改，没改（见「还剩什么」）。

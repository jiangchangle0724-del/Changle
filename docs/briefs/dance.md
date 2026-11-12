# 游戏 · 一起跳（dance）

对话名「游戏 · 一起跳」。网址 changle.ca/party（首页的游戏里有它的卡片：changle.ca/g/dance-along）。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视上一个 3D 老师按拍子跳，大家手里拿着手机跟着跳，手机的体感（或者点手机）判每一拍。一首歌分学、跳、结算三段；20 个 8 拍基础动作拼成 6 套练习舞，另外有 16 首热歌（电视上用 YouTube 放原版，配我们自己的简单舞）。电视下面一排是每个人的霓虹小人，跟着你动。打碟原计划也用这个底座，后来做在主站里（`site/src/party/dj/`），没用它。

## 文件

- 房间和页面（Worker `party`）：`games/party-server/`
  - 一支舞怎么排：`src/shared/show.ts`；舞和动作从哪来：`src/shared/catalog.ts`
  - 手机判每一拍：`src/shared/taps.ts`；房间算连击和结算：`src/server/tally.ts`
  - 音箱端的声音和音效：`src/client/synth.ts`；两边页面上的字：`src/client/words.ts`
  - 3D 老师：`src/client/coach/`（`moves.ts` 每个动作的关键帧，`rig.ts` 身体和 IK，`stage.ts` 舞台和特效，`crowd.ts` 电视下面每个人的小人）；动作页 `src/client/moves.ts`（changle.ca/party/moves）
  - 手机体感：`src/client/motion.ts`、`src/shared/peaks.ts`
  - 热歌：`src/shared/songs.ts`（歌单、怎么跳），电视上的 YouTube 播放器 `src/client/tube.ts`，对拍的算法 `src/shared/tapalong.ts`，歌本（每首歌的第一拍）`src/server/songbook.ts`、`src/server/tapped.ts`
- 共用底座（纯逻辑：对时、校准、打分、房间状态机）：`games/party-base/`
- 动作库和学跳流程：`games/dance/`（`data/` 动作和舞，`src/session-flow.ts`）
- Codex 的任务卡：`docs/codex-tasks/dance-*.md`

## 先读

- `docs/dance-along.md`（方案和任务表）
- `games/party-base/CONTRACTS.md`
- `games/party-server/README.md`
- `docs/field-notes/2026-11-01.md`（对时实测）

## 测试

- `games/party-base`：`npm test`（43 个）；`games/party-server`：`npm run typecheck`、`npm test`（89 个）、`npm run build`；`games/dance`：`npm test`（138 个）；CI `.github/workflows/party.yml`
- 浏览器里把一支舞从头跳到结算：`games/party-server/scripts/song-check.cjs`（Worker 要带 `--var ALLOW_TEST_SETTINGS:1` 跑，见 README），约两分半；中间会让一台手机断网 2.5 秒
- 对时：`games/party-server/scripts/timing-check.cjs`（本地，或 `BASE=https://changle.ca` 测线上）
- 体感和电视小人：`scripts/motion-check.cjs`（一台手机用假手跳）；热歌：`scripts/song-yt-check.cjs`（假的 YouTube 播放器：云端的浏览器里真 YouTube 不让放，错误 150）。都要本地 Worker 带 `ALLOW_TEST_SETTINGS`。
- 看老师的每个动作：changle.ca/party/moves（`?move=动作id`，`?still=拍子` 停在那一拍，`?gl=any` 没显卡也画）

## 定过的事

- 电视用 Apple TV，音箱页在 Mac 或 iPad 上 AirPlay 镜像；每场开始做一次 10 秒校准。
- 一起跳先于打碟做。
- A1 对时在正式站实测过，Steve 11 月 1 日验收。
- 学的阶段每个不同的动作只教一次：先看 8 拍再跟 8 拍，速度 70%（#107）。
- 热身和收尾凑满整 8 拍，至少 1 分钟，音乐一直踩在拍子上（#107）。
- 动作名「八步摇」不改（Steve 11-02 确认）。
- 首页的卡片在 `site/src/games/registry.ts` 的 `GAMES` 里（id `dance`，`stage` 指到 `/party/screen` 和 `/party/join`），归「平台 · 首页与上线」管。11-02 先放在「即将上线」，11-06 挪进游戏里（#293）：`changle.ca/g/dance-along`，卡片的按钮整页去 `/party/screen`，手机那个按钮去 `/party/join`，`/play` 直接去 `/party/screen`。卡片上的字要改，跟那个对话说。
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
- 11-05 晚上 Steve 说：对新手太难，大家不知道动作怎么做；要一个 3D 拟人老师教（可以借别的 AI 做）；要充分用体感，让人觉得自己在和电视互动；要更多画面、音效；要热歌（江南Style、小苹果、APT.、王心凌的爱你，和全球登顶的热歌）；舞要更简单。这个对话按下面的做法做了，开工时发消息跟他说过（当晚他还没回）：
  - 3D 老师用代码画（three.js，圆润的卡通人），不花钱、不用模型文件、每一拍都对得上。骨架按 Mixamo 起名，以后要换 AI 生成的角色（要开账号花钱），动作不用重做。
  - 老师是镜子：她往屏幕左边，大家往自己左边。手上有光带，脚下有光脚印。
  - 热歌有版权，歌不进我们网站：和打碟一样，用 YouTube 官方视频在电视上放（YouTube 自己的播放器，左上角一直露着，不遮不藏不下载）。没有 YouTube 会员可能先有一段广告（准备时静音放完）。
  - 舞是我们自己编的简单动作（动作库里最简单的几个，每个两个 8 拍，轮着跳），不照搬原版舞。快歌按半速跳（APT. 74.5、Happy 80）。
  - 每首歌第一次跳之前要在电视上「歌曲对拍」一次（放歌，从第一下重拍开始跟着点 16 下），存进歌本，以后所有房间都用。没对拍的歌不能开始。对拍前先校准电视延迟。
  - 不放的歌：小苹果（官方视频中间插了小品，歌断开）、学猫叫（没有官方上传）、YMCA（现场鼓，速度会飘）。
  - 每个人的小人用 2D 霓虹火柴人（便宜，没显卡也能画），跟着老师做同一个动作，动得越猛跳得越起劲。

## 现在

- 已合并：A1 对时、C1 动作库（#95）、C5 学跳流程（#107），动作库有自己的 CI（#106）；11-05 一支舞从学到跳到结算，手机按钮代替传感器（#202）；这份档案和三张 Codex 卡：C2 重写，新写 C3 电视画面、C4 手机画面（#203）。
- 线上 changle.ca/party 能用按钮跳完整的一支舞。#202 部署后在正式站上用脚本跑过：对时（`timing-check.cjs`：三台手机的时钟误差都不到 1 毫秒，校准量出 179 毫秒，设的是 180，每拍闪光离拍子最多 11 毫秒）；一支真舞（一次性的脚本，没进仓库：音箱端加三台手机，主人选「直接跳」开始「广场初体验」，热身一分钟后房间自己进到跳，两分钟跳完看结果，最后结束房间）。一台每拍点、一台每拍晚 90 毫秒点、一台不点：结算、三个奖、6 次烟花、每台手机自己的那一行都对，页面没有报错。
- 电视和手机的画面还是「能用」的样子，好看、3 米外看得清是 C3、C4。
- 11-05 晚上 Steve 点头，按顺序合并上线：
  - #266：3D 老师和动作页。
  - #272：手机体感、电视上每人一个小人、音效。
  - #283：16 首歌、YouTube 播放器、对拍、歌本，和这份档案。
  - 合并前的检查都过了：测试、typecheck、build；本地 song-check、timing-check、motion-check（假手跳，每拍都算踩准，平均差 11 毫秒）、song-yt-check（假 YouTube 晚 300 毫秒开始，房间把拍子挪到视频的拍子上，差 4 毫秒；对拍算出的第一拍差 1 毫秒）。老师的样子在云端用软件画法截图、拍了视频给 Steve 看过。
  - 上线后在正式站上查过（一次性的脚本，没进仓库，不往歌本里写）：歌本的接口在（空的）；动作页画出老师；大厅有「歌曲对拍」；没对拍的歌开不了，手机上说「还没对拍」；「广场初体验」教的时候电视上是 3D 老师，下面有手机的小人；房间结束；页面没有报错。
- 歌本现在是空的：每首歌都要先在电视上对拍一次才能跳。

## 还剩什么

- 真机测试（要 Steve）：Mac 或 iPad 投到 Apple TV，iPhone 扫码。
  - 老师在电视上流不流畅（没显卡或者太慢会自动换回文字）。
  - 体感：手机拿在手里跳，看手机说「踩准了」准不准。阈值 2.2 m/s² 是按经验定的，不准就调 `src/shared/peaks.ts`。iPhone 第一次要点「开体感」允许。
  - 热歌：先校准电视延迟，再在电视上「歌曲对拍」，每首歌点一次。Safari 第一次放歌要在那台设备上点一下视频。VEVO 和只有音频的那几首（最炫民族风 往后）在云端的检查里放不了，要在家里的电视上试，放不了的从歌单里拿掉。
- 歌本谁都能写（和房间一样没有登录）：有人乱写一首歌的第一拍，那首歌就对不上拍子，在电视上重新对拍一次就好。真有人捣乱的话，可以让对拍走房间的连接，或者歌本留历史能退回去。
- C3、C4 两张卡先别发：电视和手机现在有老师、小人、体感、YouTube，卡要按新页面重写（这个对话来写）。C2（动捕流水线）暂时用不上：老师是代码写的动画，以后要换真人动捕或者 AI 角色时再说。
- 以后可以做：歌的副歌换一个招牌动作（要标出副歌在哪）；点歌（像打碟那样搜 YouTube）；大厅里老师先站着挥手；结算时老师欢呼；困难模式（A3）；喝水、休息提醒（C8）。
- 方案里还没做的：每 3 首提醒喝水、30 分钟休息（C8）；电视的「背面跟随」视角和镜子提示（等 3D 教练）；困难模式比对动作形状（A3）；打分黄金集（C7）。

## 交给别的对话

- 游戏 · 打碟：知会一下，不用做什么。一起跳也用 YouTube 在电视上放歌（自己的 `games/party-server/src/client/tube.ts`，照打碟的规矩：一直露着、不下载、Safari 先点一下视频）。它跳舞要对准拍子，所以每 4 毫秒读一次视频的时钟，取最早的那个，误差几毫秒；打碟想更准可以参考。一起跳的 3D 老师是代码画的（`src/client/coach/`），打碟想换掉机器人也可以引。一起跳没有和打碟共用底座：打碟的「跟着跳」是主站里的另一套（10 个动作，每拍看手的加速度够不够 2.5 m/s²）；一起跳是 20 个动作、party-base 的打分。以后打碟想用一起跳的动作库或打分，`games/dance/` 和 `games/party-base/src/scoring.ts` 都是纯 TypeScript，可以直接引。一起跳接传感器（A2）时会参考打碟的 `site/src/party/dj/phone/DancePad.tsx`（iPhone 授权、去掉重力）。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 一起跳: famous songs from YouTube on the TV, each tapped along to once on the speaker page（#283）
- 2026-11-05 一起跳: the phone's motion sensor counts the moves; everyone dances on the TV, with sounds（#272）
- 2026-11-05 一起跳: a 3D coach dances every move on the beat, and /party/moves shows them（#266）
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
- 2026-11-05 晚上 Steve 说对新手太难，要 3D 老师、体感互动、画面音效、热歌、更简单的舞。做了：代码画的 3D 老师（20 个动作的关键帧、IK、镜像、光带、光脚印、烟花），动作页；手机体感（峰值算一下，和点按钮同一条路）、电视上每人一个霓虹小人、音效；16 首热歌（YouTube 官方视频，先找了一个代理查视频能不能嵌、速度多少）、电视上的 YouTube 播放器和拍子对齐、歌曲对拍、歌本。舞台第一版在云端用软件画法截图检查，发了视频和截图给 Steve。三个 PR 开着等他点头。
- 2026-11-05 晚上 Steve 说「合并」：按顺序合并 #266、#272、#283（后两个合并前把目标改成 main，CI 都绿，和 main 没冲突）。Cloudflare 部署好以后在正式站上查过，都对（见「现在」）。Project 说明里的仓库名 Steve 自己改好了，从「还剩什么」拿掉。
- 2026-11-05 晚上 Steve 说「上线」：首页的一起跳从「即将上线」挪进游戏里。要改的是主站的游戏卡、路由和规则引擎的表（`GameId` 一加，引擎的 `GAMES`、`ONLINE_MIN` 都要有它），不是一行，按规矩写进「交给别的对话」给「平台 · 首页与上线」，连卡片的中英文字一起。
- 2026-11-06 「平台 · 首页与上线」做完（#293）：首页游戏里有一起跳，不在「即将上线」了。正式站上查过：卡片在游戏里，点开是「电视或电脑当舞台」和「用手机加入」，`/g/dance-along/play` 直接到 `/party/screen`。按 Steve 说的，拿掉「还剩什么」和「交给别的对话」里那两条。
- 2026-11-06 Steve 让这个对话去点 Cloudflare：他电脑上的浏览器已经登录，Worker `party` 的 Build watch paths 加了 `games/dance/*`，保存后刷新看过还在（现在是 `games/party-server/*`、`games/party-base/*`、`games/dance/*`）。从「还剩什么」拿掉，README 和 HANDOFF 那一行跟着改。

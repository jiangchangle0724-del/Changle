# 游戏 · 打碟（dj）

对话名「游戏 · 打碟」。网址 changle.ca/dj，首页卡片 changle.ca/g/dj-booth。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视或电脑打开 `changle.ca/dj` 当音箱，大家扫码入座，每台手机都是新手打碟台：两个唱盘、混音台的旋钮、推子、12 个效果键、蓄力和 DROP，全都卡在拍子上。主人在手机上把一晚拖过暖场、推高、顶点、收尾。大家点的歌排成歌单，在电视上用 YouTube 放整首，歌和 DJ 轮流。电视上还有跟着跳的教练，手机握在手里跟着跳，踩准拍子得分。

## 文件

- 手机和音箱画面：`site/src/party/dj/`（手机的打碟台在 `phone/`，音箱的声音在 `speaker/`，替身 DJ 在 `fake/`，主人的歌在 `local/`；电视上的 YouTube 播放器在 `tube.ts` 和 `TubePlayer.tsx`）
- 给助手看的两个声音技能：`site/src/party/dj/.claude/skills/`（`audio-design`、`ui-sound-design`，#187；动这个文件夹里的文件时会自动出现，来历和许可在 `LICENSES.md`）
- 播放器、风格、契约：`site/src/shared/dj/`（`CONTRACTS.md`）
- 桌上的规则：`site/src/shared/engine/games/dj.ts`
- Lyria 转接：`site/worker/lyria.ts`；YouTube 查询：`site/worker/youtube.ts`
- 画面样式：`site/src/styles/dj.css`（电视）、`dj-deck.css`（手机的打碟台）、`dj-phone.css`
- Codex 的任务卡：`docs/codex-tasks/dj/`

## 先读

- `docs/dj-booth.md`（方案和任务表）
- `site/src/shared/dj/CONTRACTS.md`
- `docs/dj-booth-sound-check.md`
- `LICENSES.md`（外来的声音、模型和服务）

## 测试

- `site/tests/dj.test.ts`（里面有电视的 YouTube 播放器，对着假的 YouTube）、`site/tests/dj-presets.test.ts`、`site/tests/dj-sound.test.ts`（效果键每次按出来不一样，#187）；`site/tests/engine.test.ts` 里名字以 `dj:` 开头的测试
- 浏览器里的检查（要两个本地服务器，`DEV_LYRIA_ANYONE` 关着，见 `site/README.md`）：
  - `scripts/dj_check.py`（出声和一桌手机）
  - `dj_deck_check.py`（打碟台）、`dj_turntable_check.py`（唱盘和旋钮）
  - `dj_floor_check.py`（读场、点歌公平、报幕、今晚回顾）
  - `dj_youtube_check.py`（YouTube 整首在 Drop 那一小节准时开始、放歌时的音效、歌单、没钥匙时贴链接、要先点一下的浏览器、YouTube 不让外放的视频）
  - `dj_mine_check.py`（我的歌）、`dj_dance_check.py`（跟着跳）
- 这台机器只有两个核，别的对话同时跑检查时，卡拍子的步骤偶尔会失败，重跑一次再看。检查一个一个跑，别和单元测试同时跑。
- `dj_check.py` 要 WebKit。云端的机器没装（也不让 `playwright install`），在那里跑不了。
- 真的 YouTube 在云端机器上放不了（YouTube 当它是机器人，错误 150），所以检查都用假的 YouTube。真机上的样子要在电视上试。

## 定过的事

- Google 的 Lyria RealTime 只在站长自己的桌子上试（私下测试）；每月用量 `DJ_LYRIA_HOURS`，默认 20 小时。
- 没有 Lyria 时放试音版 DJ：网站自己的乐器现场合成，12 种风格。
- 新手按什么都不会乱。
- 点的歌在电视上用 YouTube 自己的播放器放整首，不下载、不混音。Apple 的 30 秒试听条款不许用来娱乐，11-02 从打碟里去掉了。
- 不下载商业歌曲（版权）。要放真歌，用 YouTube 或主人自己的歌（我的歌）。
- 音效都是网站自己合成的，不用付费素材。Steve 11-02 选的：先合成，听了再说。
- 歌单（11-02）：每人最多 3 首，全桌最多 30 首；主人在手机上切换随机或按顺序；歌和 DJ 轮流，一首歌放完 DJ 至少放一分钟，大家也可以提前蓄力 Drop 进下一首。
- 放 YouTube 整首时，自己出声的音效照样能按：气笛、警笛、激光、黑胶、低音炸弹、反向镲、口哨。改 DJ 音乐本身的键（回声、扫频、刹车、搓碟、倒带）要等 DJ 回来。
- 跟着跳的 3D 教练只在有显卡的电视上出现；只能用软件画 3D，或者画得太慢，就用画的教练。
- 11-05 修 Steve 说的两个问题时定的：
  - 点的歌没找到 YouTube 视频（多半是没有搜歌的钥匙），手机不再悄悄改放 Remix：先要这首的链接（一个去 YouTube 搜这首的按钮、一个粘贴框），也可以选「不用链接，只放 DJ 的 Remix」。
  - 自动搜 YouTube 只在歌单里没有这首时才搜（停手 0.9 秒后），搜过的结果记一周，省免费额度。额度用完时手机照实说。
  - 下一首在电视右上角先准备好：加载、片头广告静音放完、停在 0:00。Drop 那一小节准时开始，DJ 在同一小节让开，按电视自己的音频时钟对齐。整晚只用一个 YouTube 播放器，放的时候一直看得见（YouTube 的规定）。
  - 电视是 iPhone、iPad 或 Mac 的 Safari 时，要先点一下角落里的视频，之后才能到点自己开始。没点的话 DJ 接着放，电视上写着要点一下。
  - YouTube 不让在别的网站放的视频（错误 100、101、150）：电视告诉房间，这首改成只放 Remix，手机说明原因。
- 11-05 Steve 要找做音乐的技能装进来升级：装了 `audio-design` 和 `ui-sound-design`，放在打碟自己的文件夹里（#187）。按它们查了效果键：噪声只做一次、每次按出来略有不同、低音炸弹收尾不再咔一声。

## 现在

- 11 月 1 日上了首页。
- 11 月 2 日上线（#127 合并）：点歌放 YouTube 整首、我的歌、混音台、方案里补的（读场、❄️、点歌公平、报幕、今晚回顾）、手机当打碟台（唱盘、旋钮、12 个效果键）、跟着跳。
- 11 月 3 日凌晨上线（Steve 同意）：
  - #151 当音箱的那台不再自己刷新：屏幕保持常亮，灯光层省内存，声音卡住时能点一下接着放。
  - #152 歌单和放歌时的音效：歌单、主人的随机或按顺序、歌和 DJ 轮流、放 YouTube 时也能按音效、气笛重做成夜店三连声。
  - #134 林波舞的四种花样（归林波舞对话）。
- 11 月 5 日上线（Steve 同意）：
  - #162 给 iPhone 当音箱减负：地板网格改成平面画法（同样的样子，iPhone 尺寸下约省 85 MB），替身 DJ 的录音存成 16 位（录音内存减半）。
  - #129 跟着跳的 3D 教练：电视或电脑有显卡时教练是 3D 的；没有显卡、画得太慢、或者手机当音箱时，用画的教练。
- 11 月 5 日开了，等 Steve 同意：
  - #PR-A 点的歌整首放、在 Drop 上准时开始（上面「定过的事」那几条）。合并会顺便重新部署房间服务器（改了 `site/worker/youtube.ts` 和桌上的规则）。
  - #187 两个声音技能，和按它们改的效果键（只重建网站）。

## 还剩什么

- YouTube 搜歌要 Steve 加钥匙：Google Cloud 里打开 YouTube Data API v3，建一个只限这个 API 的钥匙，在 Cloudflare 的 Worker `changle-rooms` 里加成 secret `YOUTUBE_API_KEY`。免费额度每天 10 000 点，搜一次 100 点。没加之前，点歌要贴链接（手机会带着去 YouTube 找）。
- 在真电视上试 Drop 接整首（Chrome 的电视或电脑、Safari、智能电视的浏览器）：开始得准不准、片头广告、要不要点一下。
- 一晚第一次按黑胶、反向镲，噪声还要现做一次（这台机器上约 10 到 30 毫秒），之后就不用了。
- 闪退（Steve 11-02：当音箱的是 iPhone，整页自己刷新）：iPhone 默认 30 秒自动锁屏，锁了 Safari 常会重新加载页面。#151 让屏幕常亮（iOS 16.4 以上），#162 再省内存，都上线了。在那台 iPhone 上再试一晚（插着电，关掉低电量模式）。还会刷新的话，剩下最大的是页面本身（脚本和界面）和五道光束（约 25 MB）。
- 合成的 7 个音效等 Steve 听完再调（#187 起每次按出来略有不同：音高上下 25 到 60 音分，看是哪个键，一个半音是 100；音量上下最多 1.5 分贝）。
- 方案里的下一步：DJ 的大脑（A4）、玩家描述的歌（A5），以 `docs/dj-booth.md` 的任务表为准。
- 还没在真 iPhone 上试过跟着跳的动作感应。

## 交给别的对话

- 游戏 · 林波舞：Steve 11-02 在打碟对话里选了「Limbo 再加体感花样」，这边做了 PR #134（稳住、跟着动的杆、歪着过、派对），11-03 合并上线了。请林波舞对话接手：审一遍，在真手机上试 3°、10°、1 秒这几个数。Codex 的 ui-C2 林波舞迁移是 #148。
- 工具 · 随便：Steve 推荐（`tools/suibian/src/data/picks.json`）还空着，等 Steve 给每家店的店名（有分店写地址）、一句理由、探店链接。
- 游戏 · 猜歌名：猜歌还在用 Apple Music 的 30 秒试听。Apple 的条款只许用来推广卖歌，娱乐用途不行（`LICENSES.md` 记着）。请和 Steve 定：换来源，还是接受这个风险。
- 大屏（看的人那个 PR #184）：它和 #PR-A 都改了 `TvDj.tsx` 里挨着的几行（舞池那行和 YouTube 播放器那行），也都在这份档案的「记录」末尾加了一行。哪个后合并，哪个合进最新的 main 时要手动合一下，两边的改动都留着。
- 平台（仓库和 CI）：两个声音技能放在打碟自己的文件夹（`site/src/party/dj/.claude/skills/`），别的游戏用不到。想全站用的话，可以搬到仓库根目录的 `.claude/skills/`。#187 在 CI 的测试列表里加了一行（`tests/dj-sound.test.ts`）。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-05 打碟 · DJ Booth: a song from the list plays whole, and starts on its drop

- 2026-11-03 打碟 · DJ Booth: a lighter speaker page for a phone
- 2026-11-03 打碟 · DJ Booth: a phone playing the speaker keeps the drawn coach
- 2026-11-03 打碟 · DJ Booth: the night's playlist, and sounds over a whole song
- 2026-11-02 打碟 · DJ Booth: the 3D coach only where a graphics chip draws it
- 2026-11-02 打碟 · DJ Booth: the TV page stays awake, and takes less memory
- 2026-11-02 打碟 · DJ Booth: the dancing coach in 3D
- 2026-11-02 打碟 · DJ Booth: the YouTube lookups live under the rooms server's /api
- 2026-11-02 打碟 · DJ Booth: songs asked for play whole from YouTube, not Apple
- 2026-11-02 打碟 · DJ Booth: dancing along on the TV (跟着跳)
- 2026-11-02 打碟 · DJ Booth: the phone as a DJ controller; more club sounds
- 2026-11-02 打碟 · DJ Booth: what the plan asked of the floor
- 2026-11-02 打碟 · DJ Booth: the mixer (混音台) on every phone
- 2026-11-02 打碟 · DJ Booth: a song asked for plays the song itself; 我的歌 on the host's phone
- 2026-11-02 打碟 · DJ Booth: two songs take turns; the sound-check notes for a night of songs
- 2026-11-02 打碟 · DJ Booth: a night of the host's own songs (我的歌)
- 2026-11-02 打碟 · DJ Booth: the 点歌 box, the TV's request lines, the stand-in's songs kept in memory

## 记录

- 2026-11-02 建档案。
- 2026-11-02 晚上：整串打碟合并上线（#127）；开了 #129、#151、#152；替林波舞对话做了 #134。
- 2026-11-03 凌晨：Steve 同意后合并 #151、#152、#134，部署都成功。#129 等 CI。查闪退时，本地测试的页面有几分钟连到了线上房间服务器（开发服务器启动时漏了 `VITE_ROOMS_URL`），开了几张测试桌，没有别的影响。
- 2026-11-05：GitHub 账单处理好，CI 又能跑了。仓库改名为 `jiangchangle0724-del/Changle`，现在是公开的。#162、#129 的截图检查先卡在林波舞的旧基准图（#134 改了选玩法那一行），#136 已经换了新图，合进最新的 main 就过了，不用加 `update-screenshots`。Steve 同意后合并 #162 和 #129。
- 2026-11-05 下午：Steve 报了两个问题：从列表选的歌 Drop 后不放整首（只有贴链接才放），贴了链接也要等好几秒才开始，接不上 Drop。查到第一个是线上没有 `YOUTUBE_API_KEY`，手机搜不到视频就悄悄改放 Remix，还说成「YouTube 上没找到这首」；第二个是视频等 Drop 落下才开始加载。都修了（#PR-A），顺手修了：跟着跳的单元测试一直没跑到（测试文件提前退出了）、Drop 进整首时电视上的 DROP 字挡住视频、下一首的卡片压着打碟台、几张 Codex 任务卡和文档过时。又按 Steve 说的找了做音乐的技能装进来，按它们改了效果键（#187）。检查都过了。YouTube 那项 113 条，在这台慢机器上（两个核，一个浏览器里开着电视和三台手机）整首开始的时间在 Drop 那一小节前后 0.21 秒以内，旁边再跑别的会更晚；对着假 YouTube 的单元测试在 0.04 秒以内。

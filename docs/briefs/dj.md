# 游戏 · 打碟（dj）

对话名「游戏 · 打碟」。网址 changle.ca/dj，首页卡片 changle.ca/g/dj-booth。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视或电脑打开 `changle.ca/dj` 当音箱，大家扫码入座，每台手机都是新手打碟台：两个唱盘、混音台的旋钮、推子、12 个效果键、蓄力和 DROP，全都卡在拍子上。主人在手机上把一晚拖过暖场、推高、顶点、收尾。大家点的歌排成歌单，在电视上用 YouTube 放整首，歌和 DJ 轮流。电视上还有跟着跳的教练，手机握在手里跟着跳，踩准拍子得分。

## 文件

- 手机和音箱画面：`site/src/party/dj/`（手机的打碟台在 `phone/`，音箱的声音在 `speaker/`，替身 DJ 在 `fake/`，主人的歌在 `local/`）
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

- `site/tests/dj.test.ts`、`site/tests/dj-presets.test.ts`；`site/tests/engine.test.ts` 里名字以 `dj:` 开头的测试
- 浏览器里的检查（要两个本地服务器，`DEV_LYRIA_ANYONE` 关着，见 `site/README.md`）：
  - `scripts/dj_check.py`（出声和一桌手机）
  - `dj_deck_check.py`（打碟台）、`dj_turntable_check.py`（唱盘和旋钮）
  - `dj_floor_check.py`（读场、点歌公平、报幕、今晚回顾）
  - `dj_youtube_check.py`（YouTube 整首、放歌时的音效、歌单）
  - `dj_mine_check.py`（我的歌）、`dj_dance_check.py`（跟着跳）
- 这台机器只有两个核，别的对话同时跑检查时，卡拍子的步骤偶尔会失败，重跑一次再看。

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

## 还剩什么

- YouTube 搜歌要 Steve 在 Cloudflare 给 `changle-rooms` 加 `YOUTUBE_API_KEY`。没加之前，贴链接照样能放。
- 闪退（Steve 11-02：当音箱的是 iPhone，整页自己刷新）：iPhone 默认 30 秒自动锁屏，锁了 Safari 常会重新加载页面。#151 让屏幕常亮（iOS 16.4 以上），#162 再省内存，都上线了。在那台 iPhone 上再试一晚（插着电，关掉低电量模式）。还会刷新的话，剩下最大的是页面本身（脚本和界面）和五道光束（约 25 MB）。
- 合成的 7 个音效等 Steve 听完再调。
- 方案里的下一步：DJ 的大脑（A4）、玩家描述的歌（A5），以 `docs/dj-booth.md` 的任务表为准。
- 还没在真 iPhone 上试过跟着跳的动作感应。

## 交给别的对话

- 游戏 · 林波舞：Steve 11-02 在打碟对话里选了「Limbo 再加体感花样」，这边做了 PR #134（稳住、跟着动的杆、歪着过、派对），11-03 合并上线了。请林波舞对话接手：审一遍，在真手机上试 3°、10°、1 秒这几个数。Codex 的 ui-C2 林波舞迁移是 #148。
- 工具 · 随便：Steve 推荐（`tools/suibian/src/data/picks.json`）还空着，等 Steve 给每家店的店名（有分店写地址）、一句理由、探店链接。
- 游戏 · 猜歌名：猜歌还在用 Apple Music 的 30 秒试听。Apple 的条款只许用来推广卖歌，娱乐用途不行（`LICENSES.md` 记着）。请和 Steve 定：换来源，还是接受这个风险。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

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
- 2026-11-05 别的对话收尾时（`claude/watch-leftovers` 那个 PR，房间档案交过来的）改了 `TvDj.tsx` 几行：大屏的舞池只画玩家，只看的人不再站在舞池里；「舞池空着，扫码上来」跟着舞池走；扫码卡片的大小照旧看房间里有没有人。`watch_test.py` 打碟那段数舞池里的人。

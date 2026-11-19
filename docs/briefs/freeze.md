# 游戏 · 木头人蹦迪（freeze）

对话名「游戏 · 木头人蹦迪」。网址 changle.ca/g/freeze-dance。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

音乐响就跳，突然停下时所有人定住不动。动了的人喝。联机时每部手机同时停，拿在手里的手机自己感觉有没有动，主人也能手动抓人。

2 到 15 人。单机：手机放音乐，一个人当裁判。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/freeze.ts`
- 画面（单机和联机）：`site/src/party/freeze/`：`Freeze.tsx`（单机）、`NetFreeze.tsx`（联机）、`parts.tsx`（舞池、定住的闪光、拿稳表）、`sound.tsx`（这部手机的声音：每轮开始前停一下再开，「没声音？」那一行）
- 大屏画面 `site/src/party/freeze/TvFreeze.tsx` 归大屏对话（docs/briefs/tv.md），这里不动
- 样式：`site/src/styles/party.css` 里 `.fz-*`、`.floor*`、`.freeze*` 那几段（共用文件，只动自己这几段）
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `freeze` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `freeze` 开头的测试（只有一条，走淘汰赛）
- `site/scripts/party_test.py freeze`：单机一局、单机的声音（`t_freeze_sound`）、联机一局。要本地的房间服务器和网站（HANDOFF.md）
- 音乐只能数「排了多少个音」，听不到：真 iPhone 上的事（静音键、切出去回来、通知响过以后）要 Steve 用真机试

## 定过的事

- 联机时每部手机同时放同一首、同一刻停（服务器给 1.8 秒提前量，各手机按共同的拍子起）。
- 跳舞类游戏开始时，大厅的背景音乐静音（`holdBackground`）。
- 淘汰赛里所有人都动了：谁都不出局，各罚一口再来。
- 2026-11-18 声音：每一轮开始前，每部手机先把自己的声音环境停一下再开（`kickAudio`），再按拍子起音乐。这是对付 iPhone 的 WebKit 毛病的办法：别的 app 或系统出过声（通知、闹钟、Siri、来电，WebKit bug 283419）、关掉另一个放过声音的标签页（276687）以后，网页的声音环境还报告「在放」其实没声，网页收不到任何事件。声音环境没醒（iPhone 要点一下才肯出声）或页面藏着时，不再把音乐排在停着的时钟上（那样回来会错拍），等它回来再按共同的拍子接上；引擎换了新环境（`onAudioReset`）也接上。
- 2026-11-18 跳舞画面下面一行小字「没声音？」：点一下在手势里叫醒声音、停一下再开、按拍子接回音乐，并提示网页探测不到的三样：静音键、音量键、蓝牙或投屏把声音送去了别处。声音环境停着时这一行变成「点一下，打开声音」。这部手机在网站设置里把声音关了的话，联机的准备画面和两边的跳舞画面直接说出来，给「打开声音」（单机的设置画面不放：CI 的 40 张截图里有它，CI 那部手机的声音是关着的；点了放音乐下一秒就看到）。
- 单机的「放音乐」仍在点击里起音乐（iPhone 第一声只能在点击里出）；声音环境已经在跑时才先停一下再开。

## 还剩什么

- 等 Steve 真 iPhone 验证 11-18 的改动：没声的时候点「没声音？」回不回来；碰到没声时记下：之前有没有切出去或收到通知、主人还是客人的手机、点任意按钮回不回来、刷新好不好。
- 动作感应只能在开局前开：中途入座或开局前忘了点的人，之后没地方开；喝酒版没有结束，就一直开不了。
- 主人暂停后，别人的手机看不出暂停了；按钮一直写「暂停 / 继续自动」，主人自己也分不清；继续后倒计时不再出现（手机按 judgeAt+5.5 秒算，服务器按继续那一刻重算）。
- 人多时排不下：15 人时主人抓人的名单要往下滑，而定住只有不到 4 秒。顶上那排小人超出屏幕是共用组件（见下）。
- 真手机上没验过：感应灵不灵、几部手机停得齐不齐、iPhone 有没有声音。
- 规则测试只有一条，动作感应完全没测。

## 交给别的对话

- 大屏对话（`TvFreeze.tsx`）：淘汰赛里所有人都动了时，手机写「全都动了，喝一口再来」，大屏却写「某某动了，出局」（2026-11-04 本地玩出来的）。
- 首页与上线（共用声音引擎 `site/src/lib/audio/engine.ts`）：引擎只在页面藏起来又回来时停一下再开，别的游戏碰到「通知响过以后没声」（WebKit bug 283419）、「关了别的标签页以后没声」（276687）同样没救。建议引擎自己加一个通用的自救：导出一个 `refreshAudio()`（停一下再开，再看时钟走不走），在窗口重新得到焦点、`pageshow`、以及隔了一阵（比如 20 秒）第一次再出声之前调一次，木头人现在自己做的那份就能退回去用引擎的。
- 全站设计（`site/src/components/Figure.tsx` 的 `Lineup`）：15 人时顶上那排小人超出屏幕两边（`is-crowded` 不够）。
- 房间对话 / 共用测试脚本：`site/scripts/party_test.py` 里大厅的游戏顺序和选中游戏的选择器从 11-05 大厅改成棋盘以后就过时了（`ORDER` 里多了两个林波舞的测试组名；`.lobby .tile[data-tile]` 现在是 `.lobby .board-cell[data-tile] .ui-tile`），11-18 在这里改回来了；`net_test.py`、`watch_test.py`、`live_check.py`、`live_tune_check.py` 还是老选择器。`watch_players_check.py` 的木头人那段也过时了（旁观的那部手机没有名单，脚本按有名单写的；跳起来以后取 `.fz` 的文字会超时）。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-18 木头人蹦迪：每轮开始前先把声音停一下再开，没醒的手机回来按拍子接上，「没声音？」一行，声音关着时说出来
- 2026-11-05 ui(C10): resume Freeze Dance before the music (#198)
- 2026-11-04 ui-C2：木头人蹦迪接入底部动作区、玩家条和轮次 (#147)
- 2026-11-03 Watching, batch 3: King's Game, Never Have I Ever, Post-it and Freeze Dance on the big screen
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-10-31 Players' figures in Truth or Dare, Post-it, Limbo and Freeze Dance
- 2026-10-29 site: sound comes back after another app takes the speaker; dance games silence the lounge music

## 记录

- 2026-11-02 建档案。
- 2026-11-04 开工前摸底：单机、联机、大屏在本地玩了一遍（3 人、10 人、15 人、中英文、横屏、旁观、中途入座、暂停），没动代码，问题列在「还剩什么」和「交给别的对话」。
- 2026-11-18 Steve 报 iPhone 上有时候整个没声音。查过：开关和出声顺序代码里都对，Chrome 里一直有声；对得上的是 iPhone 的 WebKit 毛病（见「定过的事」）。静音键应该不是原因：引擎一开始就向 iOS 要了「播放」类声音（`navigator.audioSession.type = "playback"`，iOS 17 起静音键不管它）。做了这一轮的改动。

# 游戏 · 流氓十三张（rogue）

对话名「游戏 · 流氓十三张」。网址 changle.ca/g/rogue-thirteen。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

轮流抽牌，A 到 K 每张都有一条规矩：指定喝、陪酒、厕所券、摸鼻子……

2 到 15 人。单机传一部手机，联机每人一部。

## 文件

- 规则（联机时在房间服务器上跑）：`site/src/shared/engine/games/rogue.ts`
- 单机画面：`site/src/games/Rogue13.tsx`
- 联机画面：`site/src/online/games/NetRogue.tsx`
- 内容：`site/src/data/rogue13.ts`（规矩、每张技能牌叫什么、罚单上的那行字）
- 五个技能的音效：`site/src/games/rogueSounds.ts`（合成的，没有音频文件；单机、联机、大屏用同一套）
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `rogue` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `rogue` 开头的测试
- `site/scripts/local_check.py`（单机）
- `site/scripts/net_test.py`（联机）

## 定过的事

- A 到 K 每张牌一条规矩，规矩写在 `site/src/data/rogue13.ts`。
- 单机时快速点两下不会跳过下一个人。底部按钮换了意思（抽牌 → 记住了 → 抽牌）之后的 450 毫秒内不接第二下，因为它一直在拇指底下。
- 单机也能用技能（2026-11-11）。技能牌出来后，小标签底下多一排按钮：照相机、摸鼻子、谁接话了、上厕所。持牌人喊，谁拿着手机谁按。照相机：闪一下，全屏「定格」3.5 秒，然后点出动了的人（或「没人动」）。摸鼻子：点出最后一个摸到的。谁接话了：点出接话的人。上厕所：点谁要去，持票人第一次不罚（票作废，标签上写「已用」，下一张 8 再发），其他人先罚再去。陪酒不做按钮：有人被罚时罚单上多一行「喊一声陪酒，X 陪着喝」，口头执行，不计进 X 的杯数。技能的罚单不换人，牌留在原地。
- 联机照相机的「谁动了」有 20 秒时限（2026-11-11）：定格 3.5 秒后持牌人 20 秒内不点，算没人动，全桌照常。每部手机上都有倒计时。时间都写在 `rogue13.ts` 的 `ROGUE_MS` 里，单机、联机共用。
- 联机逛三园、抢数字、逢七过进行中，照相机和摸鼻子按不了（2026-11-11）：规则里不接，按钮也变灰。等这张牌打完再按。选园子、选起点的时候可以按，那两步没有倒计时。
- 联机逛三园的判罚（2026-11-11）：抽牌人（或主人）看到两个按钮，「X 刚才重复了或说错了」（刚按过说完了的人，红的）和「Y 重复了或说错了」（正在说的人，灰的）。因为话说出口之后才判，说的人常常已经按了说完了。第一个人说的时候只有一个按钮。
- 联机小修（2026-11-11）：WC 票用过的持票人再点上厕所，提示写「你的 WC 票用过了」；逢七过不能从 7、14、17 起头（起点是说出口的，那几个得说过），数字格子里灰掉；手机不在线（锁屏、切走）的人不参加抢数字和摸鼻子，不被罚最后一个、没摸到，回来了照常。
- 每个技能一个专属音效，合成的，第二版（2026-11-11，Steve 听过第一版后定的）：陪酒是一个女声慢悠悠地说「Hi」，用手机自带的语音（`speechSynthesis`，挑女声、英文优先，中文手机说「嗨」；第一次触屏时静音预热一下，不然 iPhone 不出声），手机没有语音就用 `rogueSounds.ts` 里合成的备用嗓音；照相机是狗仔队连闪三下加灯泡爆、小铃；摸鼻子是小丑喇叭两声加吱一声加弹簧；WC 票是拉把手、冲水、打漩、咕噜咕噜到最后一吸；神经病是口哨调戏（上去、下来）加布谷鸟两声。抽到那张牌时响一次，用的时候再响。联机和大屏用同一套。
- 照相机和摸鼻子一张牌只能用一次（2026-11-13，Steve 在真机上玩过后定的，替掉 11-11 的一分钟冷却）：单机、联机都是。用过之后按钮灰掉、写「已用」，大家都看得见的小标签上也写「已用」，和 WC 票一样；下一张 5 或 6 出来，新持牌人（哪怕还是同一个人）重新有一次；重洗清零。规则卡上写「你有一次机会喊」。单机的「已用」存在进度里，刷新了还在。陪酒、神经病、上厕所不限次。

## 还剩什么

- 陪酒的那句「Hi」用的是手机自带的声音，每部手机不一样，这里预览不了（对话里的 WAV 是合成的备用嗓音）。Steve 在真机上听过要改再改：挑声音的规则在 `rogueSounds.ts` 的 `flirtyVoice`。

## 交给别的对话

- 平台 · 大屏：`TvRogue.tsx` 的照相机只在定格阶段画钟。现在「谁动了」阶段也有 20 秒时限（`ROGUE_MS.judge`，`interrupt.endsAt` 已经是那个时刻），大屏可以照样画一个钟，不画也不影响。
- 平台 · 全站设计：游戏壳的底部按钮换了意思还留在原地，快速点两下会连走两步。2026-11-04 在 main 上粗查，我从来没有、最佳称号、额头便利贴都这样（流氓十三张自己修了，见「定过的事」）。要么壳里统一挡一下，要么各游戏自己挡。
- 平台 · 联机：`site/scripts/net_test.py`（`watch_test.py` 大概也是）在大厅点游戏还用 `.lobby .tile[data-tile=…]`，大厅的格子已经换成 `.board-cell[data-tile=…] .ui-tile`，所以 2026-11-13 跑 `net_test.py rogue` 一个游戏都开不起来，卡在 `start_game` 那一行。改那一行就好。流氓十三张自己的联机检查是拿改了选择器的临时脚本跑的。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-13 Rogue Thirteen: the camera and the nose go once per card, not on a cooldown
- 2026-11-11 Rogue Thirteen: the powers' sounds, take two, and a minute's rest for the camera and the nose
- 2026-11-11 Rogue Thirteen online: the used pass says so, sevens never starts on a seven, a phone that is away sits out the grab and the nose
- 2026-11-11 Rogue Thirteen online: the garden's judge can name the one who just finished, not only the one speaking
- 2026-11-11 Rogue Thirteen online: the camera and the nose wait while a timed round is on
- 2026-11-11 Rogue Thirteen online: the camera's judgement has a deadline, so a holder who walks away can't freeze the table
- 2026-11-11 Rogue Thirteen: the five powers can be used on one phone, and each has a sound of its own
- 2026-11-11 Rogue Thirteen, one phone: a quick double tap on the bottom button is one step, not two
- 2026-11-05 ui(C10): resume Rogue Thirteen after a reload (#192，Codex)
- 2026-11-04 ui-C2：流氓十三张接入游戏壳（#139，Codex）：按钮到底部，加玩家条
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 Site: fix layouts that broke on small and sideways phones
- 2026-11-01 One phone: a double tap no longer skips a player; the blank plays on the undercover's side

## 记录

- 2026-11-02 建档案。
- 2026-11-04 查了一遍：游戏壳迁移（#139）做完了，这里的「还剩什么」就此清空；查出上面那一串联机问题和单机点两下连走两步，都是现有测试没盖到的。
- 2026-11-11 Steve 说开修，另加两条：单机也要能用技能，每个技能一个专属音效。先修单机点两下，再做单机技能和音效，然后联机的四个 PR（照相机时限、小游戏中不许按技能、逛三园判罚、小修）。六个 PR 一个接一个叠着，按顺序合。共用文件动了这几行：protocol.ts 的 Fx 加了 trouble、buddy；room.ts 的 buddy 发一个 fx；useTableSounds.ts 和 tv/moments.tsx 里 camera、nose、wc 三行改成新音效，加了 trouble、buddy 两行。
- 2026-11-11 Steve 听了第一版音效：陪酒改成诱惑女声说 Hi，WC 票改成冲厕所，其他的更搞笑些；冷却要加；然后合并。第七个 PR 叠在第六个上，七个一起按顺序合。本地联机测试要先 `VITE_ROOMS_URL=ws://127.0.0.1:8787` 再起网站，不然本地网页连的是线上的房间服务器，新规则测不到（这次踩过一回）。
- 2026-11-11 22:27 七个 PR（#326 #328 #329 #331 #333 #345，加早先的 #319）按顺序合进 main，网站和房间服务器都部署了，线上单机试过技能按钮和冷却。合之前先把整摞叠到当天的 main 上本地跑过 CI 的几步：没冲突，只有 main 自己带的两个问题（打碟的测试、首页预算，11-13 时都已经好了）。
- 2026-11-13 Steve 在真机上玩了，说照相机、摸鼻子应该一张牌只能用一次，不是冷却。改成一次（引擎 `used`，两个画面、规则卡和说明都改了），冷却的 `ROGUE_MS.cool` 删了。

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
- 每个技能一个专属音效，合成的：陪酒是碰杯加一小段号角，照相机是对焦两声加快门加过片，摸鼻子是捏两下橡皮鼻子加一个弹簧，WC 票是冲水加水泡，神经病是滑哨上去下来加布谷鸟。抽到那张牌时响一次，用的时候再响。联机和大屏用同一套，原来借用的自行车喇叭和木鱼不用了。

## 还剩什么

- 摸鼻子和照相机没有冷却，两个人玩时持牌人可以连按连罚。加冷却算改玩法，等 Steve 定要不要。
- 五个音效 Steve 还没听过（WAV 在 2026-11-11 的对话里）。他要改哪个，改 `rogueSounds.ts` 里那一段就行。

## 交给别的对话

- 平台 · 大屏：`TvRogue.tsx` 的照相机只在定格阶段画钟。现在「谁动了」阶段也有 20 秒时限（`ROGUE_MS.judge`，`interrupt.endsAt` 已经是那个时刻），大屏可以照样画一个钟，不画也不影响。
- 平台 · 全站设计：游戏壳的底部按钮换了意思还留在原地，快速点两下会连走两步。2026-11-04 在 main 上粗查，我从来没有、最佳称号、额头便利贴都这样（流氓十三张自己修了，见「定过的事」）。要么壳里统一挡一下，要么各游戏自己挡。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

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

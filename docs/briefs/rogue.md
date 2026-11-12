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
- 每个技能一个专属音效，合成的：陪酒是碰杯加一小段号角，照相机是对焦两声加快门加过片，摸鼻子是捏两下橡皮鼻子加一个弹簧，WC 票是冲水加水泡，神经病是滑哨上去下来加布谷鸟。抽到那张牌时响一次，用的时候再响。联机和大屏用同一套，原来借用的自行车喇叭和木鱼不用了。

## 还剩什么

按顺序修，每条一个 PR：

- 联机：照相机持牌人按完就走开，全桌停在「某某在看照片」没有时限，主人也解不开。给「谁动了」加时限，到点算没人动。
- 联机：逢七过、逛三园、抢数字进行中还能按照相机和摸鼻子，画面被盖住，倒计时照走，被挡住的人被判超时。小游戏进行中这两个按钮先按不了。
- 联机：逛三园里说的人一按「我说完了」，抽牌人的「重复了」按钮就指向下一个人，罚不到真重复的人。按钮改成指刚说完的那个人。
- 联机小修：WC 票用过后持票人再点上厕所，提示写「WC 票在（他自己）手上」；逢七过能从 7、14、17 起头；手机离线的人在抢数字和摸鼻子里会被罚；摸鼻子和照相机没有冷却，两个人玩时可以连按连罚（加冷却算改玩法，Steve 定）。

## 交给别的对话

- 平台 · 全站设计：游戏壳的底部按钮换了意思还留在原地，快速点两下会连走两步。2026-11-04 在 main 上粗查，我从来没有、最佳称号、额头便利贴都这样（流氓十三张自己修了，见「定过的事」）。要么壳里统一挡一下，要么各游戏自己挡。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

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
- 2026-11-11 Steve 说开修，另加两条：单机也要能用技能，每个技能一个专属音效。先修单机点两下，再做单机技能和音效。共用文件动了这几行：protocol.ts 的 Fx 加了 trouble、buddy；room.ts 的 buddy 发一个 fx；useTableSounds.ts 和 tv/moments.tsx 里 camera、nose、wc 三行改成新音效，加了 trouble、buddy 两行。

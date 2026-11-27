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
- 牌桌：`site/src/games/rogueCards.tsx`（这副牌的牌面和牌背、牌堆、下滑抽牌、翻牌、弃牌堆、手里的技能牌）和它的样式 `site/src/styles/rogue.css`（单机、联机、大屏用同一副牌）
- 牌谱：`site/src/games/rogueLog.tsx`（点弃牌堆打开的那张单子：每种牌还剩几张，翻过的牌谁抽的谁喝的；单机、联机共用，样式也在 `rogue.css`）
- 录音：`site/public/sounds/rogue/`（陪酒那声「hello」，来源和处理写在那里的 README）
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `rogue` 的那一项（共用文件，只改这一项）

## 测试

- `site/tests/engine.test.ts` 里名字以 `rogue` 开头的测试（牌谱和剩牌那条写明了日志、剩牌数、技能罚不记在牌上、重洗清零）
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
- 每个技能一个专属音效，第二版（2026-11-11，Steve 听过第一版后定的）：陪酒是一个女声低低的、带气声的「hello」，真人录音（2026-11-25，Steve 要的「真人女声、妩媚一点」；freesound 的 CC0 片段，截好放在 `public/sounds/rogue/hi.mp3`），进游戏时就先下载，第一张 2 出来之前基本都到了，没到就用 `rogueSounds.ts` 里合成的备用嗓音顶一次。不再用手机自带的语音：iPhone 上那个会把页面的音乐掐掉还不一定回来（WebKit 218815、273511，打碟那边踩过）。照相机是狗仔队连闪三下加灯泡爆、小铃；摸鼻子是小丑喇叭两声加吱一声加弹簧；WC 票是拉把手、冲水、打漩、咕噜咕噜到最后一吸；神经病是口哨调戏（上去、下来）加布谷鸟两声。抽到那张牌时响一次，用的时候再响。联机和大屏用同一套。
- 照相机和摸鼻子一张牌只能用一次（2026-11-13，Steve 在真机上玩过后定的，替掉 11-11 的一分钟冷却）：单机、联机都是。用过之后按钮灰掉、写「已用」，大家都看得见的小标签上也写「已用」，和 WC 票一样；下一张 5 或 6 出来，新持牌人（哪怕还是同一个人）重新有一次；重洗清零。规则卡上写「你有一次机会喊」。单机的「已用」存在进度里，刷新了还在。陪酒、神经病、上厕所不限次。
- 牌桌大升级，只动画面和手感，规则不动（2026-11-18，Steve 定的范围）：
  - 这游戏有自己的一副牌：牌面按真牌排点（2 到 10 的点阵、下半截倒着），J Q K 是框里一个大字母加羽毛、宝石、王冠，A 一个大花色；每张牌底下一条珊瑚色的带子写这条规矩的名字（当前语言大字，另一种语言小字），五张技能牌右上角戴着自己的标记。牌背还是格子加 13。颜色（纸白、墨色、红）在 `rogue.css` 开头当道具色定义。
  - 牌堆有厚度（剩 30 张以上三层边、12 张以上两层、1 张以上一层），底下一滩牌桌的光。抽牌是把顶上那张抬起来翻过去落回牌堆上（0.6 秒，游戏编排）；罚完或下一位时牌飞到右边的弃牌堆（堆上有数字），技能牌则飞到下面手里的牌那里。
  - 牌发完：弃牌堆飞回牌堆，牌堆洗一下再出下一张。洗牌的样子（2026-11-26 起）照 deck.of.cards 的思路：九张牌从底到顶一张张飞向两侧再收回（每张随机偏移、每张隔 26 毫秒，`rg-spray`），不再是整叠左右晃。单机真等这 1.2 秒再抽；联机是服务器先发了牌，手机上把那张牌扣住 1.2 秒演完再翻（`useTable`）。
  - 手里的技能牌不再是小标签，是一排小牌（`HeldCard`）：牌下面写谁的，能点的写点了干什么（拍照、喊摸鼻子、谁接话了、上厕所），用过的灰掉、斜盖「已用」。联机只有持牌人自己的牌能点，WC 票谁都能点；没人有 WC 票时才单独留一个「上厕所」按钮。
  - 照相机的定格和看照片都在一张正在显影的拍立得里；摸鼻子的手晃两下，开门的门转一下，神经病的气泡弹出来。
  - 开桌时牌堆从上面落下来（弹簧），减弱动态时直接在位。玩的时候屏幕常亮（`useWakeLock`，单机、联机、大屏都是）。牌面、牌背、小牌、弃牌堆都 memo 了，计时器跳动不再重画整副牌。
  - 减弱动态时：翻牌、飞牌都只剩淡入淡出，洗牌和拍立得的 keyframes 不跑。
- 牌谱和剩牌（2026-11-26，Steve 从开源喝酒游戏的四样里选的，第一样）：弃牌堆是个按钮，角上的标签写「牌谱 N」，点开一张单子：上面 13 个格子是每种牌还剩几张（点数加数字，剩 0 的划掉），下面是这副牌翻过的牌，最新的在最上，每行是小牌面、这条规矩的名字、谁抽的、这张牌罚了谁（自定义惩罚时写「受罚」）。只记牌自己的罚：技能（照相机、摸鼻子、神经病、没票上厕所）罚的人落在别人的牌上，不写进那张牌那一行。重洗就从头记。联机的牌谱是房间的（引擎 `S.log`，视图里 `log`、`stock`，老房间没有就不显示剩牌、牌谱从下一张起记）；单机自己记在进度里（`Kept.log`，存的是名字，刷新了还在），剩牌从牌堆算。大屏不开单子，弃牌堆还只是图。
- 抽牌是往下滑（2026-11-25，Steve 定的）：手指按住牌堆顶上那张往下拉，牌跟着手指走（略歪一点），拉过 72 像素药丸变成「松手」，松手才翻；没拉到位就弹回去，快甩一下也算。拉的时候页面不滚（那张牌 `touch-action: none`，页面别处照常滚）。点一下不抽，只晃一下示意；牌发完了点一下是洗牌。键盘上回车、空格也抽。翻牌从松手的位置开始飞回牌堆上翻过来。联机一样，服务器的牌没来之前那张牌停在原处，0.7 秒没来弹回去。单机底部的「抽牌」按钮还在，不想滑可以按。大屏不抽牌，不受影响。

## 还剩什么

- 陪酒那声「hello」Steve 还没在真机上听过（2026-11-25 换的）。对话里另发了几个候选（耳语的、清亮的），要换就把新文件放成 `public/sounds/rogue/hi.mp3`，README 写了规格。
- 下滑抽牌的手感要调：拉多远算抽在 `rogueCards.tsx` 的 `PULL_PX`（72）、甩的速度 `FLICK`；翻牌的时长和抬起的高度在 `FLYER`，洗牌散开的幅度在 `sprayOf`、每张的间隔 `SPRAY_STEP_MS`，两个画面等洗牌的时间是 `GATHER_MS + RIFFLE_MS`。

## 交给别的对话

- 平台 · 大屏：`TvRogue.tsx` 的照相机只在定格阶段画钟。现在「谁动了」阶段也有 20 秒时限（`ROGUE_MS.judge`，`interrupt.endsAt` 已经是那个时刻），大屏可以照样画一个钟，不画也不影响。
- 平台 · 大屏：大屏的牌已经自动换成新牌面（`PlayingCard` 还从 `games/Rogue13` 导出）。想要牌堆厚度跟着 `v.left` 变、牌飞到弃牌堆，可以改用 `rogueCards.tsx` 的 `RogueTable`（`canDraw={false}`），底下的技能牌也可以用 `HeldCard`。不改也不影响。（2026-11-19 全站设计做了，Steve 要电视和手机画面一致）
- 平台 · 全站设计：游戏壳的底部按钮换了意思还留在原地，快速点两下会连走两步。2026-11-04 在 main 上粗查，我从来没有、最佳称号、额头便利贴都这样（流氓十三张自己修了，见「定过的事」）。要么壳里统一挡一下，要么各游戏自己挡。
- 平台 · 联机：`site/scripts/net_test.py`（`watch_test.py` 大概也是）在大厅点游戏还用 `.lobby .tile[data-tile=…]`，大厅的格子已经换成 `.board-cell[data-tile=…] .ui-tile`，所以 2026-11-13 跑 `net_test.py rogue` 一个游戏都开不起来，卡在 `start_game` 那一行。改那一行就好。流氓十三张自己的联机检查是拿改了选择器的临时脚本跑的。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-26 Rogue Thirteen: the pile opens the deck's log: what is left of each rank, and who drew and drank each card
- 2026-11-26 Rogue Thirteen: the shuffle sprays and gathers, the deck drops in, the screen stays on
- 2026-11-25 Rogue Thirteen: pull the top card down to draw it, and a real woman's hello for the buddy
- 2026-11-18 Rogue Thirteen: a real table, with the game's own deck, a stack, a pile, the powers as cards and a riffle
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
- 2026-11-18 Steve 发来另一个对话（藏在人群里）用 /find-skills 找到 5 个 GitHub 技能的截图，要流氓十三张也来一次大升级；问过后定了只做画面和手感，规则不动。那 5 个技能里 threejs 的四个对口三维游戏，和这个二维牌桌不沾边，game-feel 讲的那套（蓄力、回弹、落地的分量）直接照着做了，都没装。换掉了 `components.css` 里旧的 `.pcard*` 那一块（只有这个游戏用），新样式都在 `rogue.css`。首屏变了，PR 加 `update-screenshots` 标签换了基准图。
- 2026-11-25 Steve 要两样：陪酒换成网上找的真人女声、妩媚一点；抽牌改成往下滑、松手才看到牌、滑的时候页面不动。声音在 freesound 挑的（搜索页对脚本不开放，走的标签页；候选都用 whisper 听过一遍再选），CC0。六个测试脚本里抽牌那几行改了：单机的点底部「抽牌」按钮，联机的用 `pull_deck` 拖。首屏的药丸从「抽牌」变成「下滑抽牌」加箭头，又换了一次基准图。另外从这次起每次收尾也写 `docs/status/rogue.md`（十行以内的现状）。
- 2026-11-26 Steve 要看看 GitHub 上有没有类似的开源项目，借思路深度优化。看了 Kings Cup / Ring of Fire 一类的牵牌喝酒游戏（OwenKDuffy/KingsCup、kabirseth4/deck-of-fire-client、frontend-rob/ring-of-fire、fernandomema/drinking-game、The-Huginn/party-game）和 pakastin/deck-of-cards 牌库。能借的：deck-of-cards 的洗牌（每张牌各自飞出再收回）和发牌入场；喝酒类 app 常有的牌谱、剩牌统计、每张牌可换玩法（自定义牌组）、一副牌打完的结算、摇一摇。问过 Steve，四样玩法都要，分几个 PR 做：先手感和工程（#836），再牌谱和剩牌、结算页、摇一摇洗牌，最后每张牌可换玩法（动引擎最多）。
- 2026-11-26 牌谱和剩牌做了（第二个 PR）。引擎加了 `log`（每张牌：牌、谁抽、罚了谁）和视图里的 `stock`（每种牌剩几张，从牌堆数，不靠日志，老房间也对）；技能的罚单改走 `penPower`，不记在牌上。单子用 `src/ui/Sheet`（新组件库的）。共用文件动了 `protocol.ts` 的 `RogueView`（加 `stock`、`log` 两个可选字段）。CI 的截图是开局那张，没有弃牌堆，基准图不用换。

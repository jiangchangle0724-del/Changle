# 平台 · 大屏（tv）

对话名「平台 · 大屏」。网址 changle.ca/tv、changle.ca/tv/<桌号>。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视或电脑的浏览器打开 `changle.ca/tv`：屏幕上出现桌号和二维码，大家扫码入座。神回复在大屏上整场演出，手机变成遥控器；最佳称号、谁是卧底、猜歌名、戏精大赏、真心话大冒险、命运转盘、七八九、流氓十三张、国王游戏、我从来没有、额头便利贴、木头人蹦迪也有自己的大屏画面（从沙发上看的那种）；其他游戏的大屏还是手机画面放大，旁边一列座位。

座位设成「只看」的手机，在有大屏画面的游戏里整屏显示同一个画面，适合投屏到电视。

## 文件

- `site/src/tv/`：`TvApp.tsx`（大屏页面）、`views.tsx`（每个游戏的大屏画面登记在这里，还有 `publicView`：交给画面之前去掉只有一部手机能知道的东西）、`show.tsx`（画面共用的零件：舞台、霓虹招牌、倒计时圈、站着的玩家、领奖台、计分板）、`moments.tsx`（表情、惩罚条、角落的二维码、大屏上的游戏音效）、`Watch.tsx`（只看的手机）、`parts.tsx`
- 每个游戏的大屏画面放在游戏旁边：`site/src/party/punchline/TvPunch.tsx`、`site/src/party/superlatives/TvSuper.tsx`、`site/src/online/games/TvUndercover.tsx`、`site/src/party/tune/TvTune.tsx`、`site/src/party/drama/TvDrama.tsx`、`site/src/online/games/TvTruth.tsx`、`TvWheel.tsx`、`TvDice.tsx`、`TvRogue.tsx`（瓶子和转盘跟着桌上转：`site/src/tv/spin.ts`）、`TvKing.tsx`、`TvPrompts.tsx`、`site/src/party/postit/TvPostit.tsx`、`site/src/party/freeze/TvFreeze.tsx`
- 样式：`site/src/styles/tv.css`、`tv-show.css`，每个画面一份 `tv-superlatives.css`、`tv-undercover.css`、`tv-tune.css`、`tv-drama.css`、`tv-truth.css`、`tv-wheel.css`、`tv-dice.css`、`tv-rogue.css`、`tv-king.css`、`tv-prompts.css`、`tv-postit.css`、`tv-freeze.css`
- 只看的手机从 `site/src/online/games/NetGame.tsx` 进 `Watch.tsx`（共用文件只动了两处：NetGame.tsx 的这几行，`NetFrame.tsx` 横条上给主人的那句话）

## 先读

- `site/DESIGN.md`
- 神回复的整场演出 `site/src/party/punchline/show/Stage.tsx`：大屏画面的质量和语气以它为准

## 测试

- `site/scripts/tv_test.py`（开桌、扫码、整局神回复）
- `site/scripts/watch_test.py`（三个玩家（谁是卧底四个）、一部横着拿的只看手机、两台电视 1920x1080 和 1280x720，有大屏画面的八个游戏各玩一遍：每个阶段都显示、页面里没有任何秘密、没有报错；还有竖着拿的手机、神回复、到此一游和打碟的入口。截图在 scratchpad/watch）

## 定过的事

- 只看不玩的手机看到整个大屏的画面。
- 按 M 静音。
- 已经开好的桌，在大屏上打开 `changle.ca/tv/<桌号>`。
- 每个游戏有自己的大屏画面（Steve 11-02 定的）：一个游戏一个文件，放在游戏旁边，在 `site/src/tv/views.tsx` 登记；大屏和只看的手机显示同一个画面。还没有画面的游戏照旧显示手机画面加座位表。
- 画面里绝不出现秘密：词、身份、手牌、小纸条、揭晓前的票。`publicView` 先把只有一部手机能知道的字段去掉（中途改成只看的人，自己的词和牌也不会上屏），画面本身也只用公开的字段；`watch_test.py` 检查页面里没有这些字。
- 投票：只亮出谁投了，不说投给谁；揭晓以后（谁是卧底）才显示谁投了谁。
- 1600x900 的舞台按屏幕缩放；最小的字 22px（1080p 电视上约 26px，720p 上约 18px）。
- 只看的手机：横着拿铺满屏幕；竖着拿时画面侧过来，转一下手机就正了，锁了方向也一样。屏幕常亮。点一下出现三个按钮（上桌、声音、中/EN），几秒后隐去，投到电视上只看得到游戏。按钮在左下角，和大屏一样（右下角是二维码）；「旁观中」的提示在上方正中，不挡画面四个角。
- 只看的手机的声音：桌上没有大屏时放大屏画面的声音（它多半就是投到电视的那台），有大屏时不放，按钮可以改；iPhone 没点过屏幕之前什么都不放，会提示点一下。惩罚的印章声和每部手机一样照常响，画面里的惩罚条不再响一次。
- 大屏上这几个游戏的牌、揭晓、答对、赢的音效也放（和每部手机一样，`useScreenFx`）；画面本身只放它独有的声音（鼓点、音乐、掌声），不重复。
- 揭晓的动画按时钟走（`useBeat`）：电视浏览器卡一下也不会慢半拍，补上来的那几下不出声。
- 到此一游：只看的手机不会被当成玩家送进游戏，画面上有按钮去它自己的大屏。打碟：大屏就是音箱，按钮去这一桌的音箱页 `changle.ca/tv/<桌号>`（`/dj` 会开一张新桌）。
- 比赛中大屏的语言、声音按钮挪到左下角（右下角是二维码）。
- 主人设成只看，手机照旧是主人的画面（游戏要等主人的按钮），横条上说明：把主人交给别人，这台手机就显示大屏画面。
- 真心话大冒险：大屏上卡片一直盖着（`publicView` 连题目都不交给画面），被指到的人在自己手机上掀开、念出来，大家先从他嘴里听到。命运转盘转到的真心话、大冒险每部手机上一起亮出来，所以大屏上也亮。
- 瓶子和转盘在大屏上跟着桌上的那一转（`spin.ts`，和手机的 `useNetSpin` 一样接桌上的转法），转的声音只在放演出声音的那块屏上响。大屏也放这几个游戏的牌、骰子、照相机、摸鼻子这些音效（和每部手机一样，`useScreenFx`）。
- 额头便利贴：每个人都看得到电视，所以额头上还没猜出来的词绝不上屏（`publicView` 只留下猜中的，服务器本来也不给屏幕和只看的人）；屏上是谁写好了、轮到谁、他问的问题和大家的是不是、每次猜的和对不对、猜出来几个。国王游戏：谁拿哪个号一直不上屏，只有命令叫到的号被人站出来认了，才写上他的名字（`publicView` 去掉自己的签）。我从来没有：只亮出谁答了，揭晓（每部手机一起亮）以前不出现任何人的答案。木头人蹦迪：音乐什么时候停是惊喜，屏上不倒数；音乐只在放演出声音的那块屏上响，和手机同一首、同一刻停；谁动了跟手机上一起亮。
- 七八九：骰子落定以后公杯才动，规矩一直摆在下面；流氓十三张：照相机和摸鼻子盖住整个画面，手上的权力排在下面。
- 大屏大厅里选了有大屏画面的游戏，那句话说「这个游戏在大屏幕上有自己的画面」（视觉对照图 `tv.png` 里选的正是真心话大冒险，这句小字的变化在比对的容差之内，CI 照样通过）。
- 大屏画面的样式：舞台上的尺寸是舞台像素，和 `tv.css`、`show.css` 一样（整个舞台按屏幕缩放，网站按 rem 和屏宽变的字号在里面不适用）；颜色用网站的 token、游戏的色灯，或者在文件开头起了名字的道具色（`docs/DESIGN.md` 第 3 条）。只看的手机上的按钮在舞台外面，用网站的 token，三个挨着，所以 48 高。

## 还剩什么

- 最后 3 个游戏的大屏画面（第四批）：尤克牌、你画我猜、林波舞。做法：照 `TvSuper.tsx` 写一个 `Tv<游戏>.tsx` 放在游戏旁边，在 `views.tsx` 登记，`publicView` 里加上这个游戏的私密字段，`watch_test.py` 加一段。
- 请 Steve 定：只看的手机默认放不放声音（现在：桌上没有大屏就放）；打碟的只看手机去 `/tv/<桌号>` 可以吗。
- 没在真电视、真 iPhone 上看过：测试是无头 Chromium 截图。
- 电视的字号档进 `tokens.css`（`docs/ui-inventory.md` 说的「电视档」）以后，大屏画面和 `tv.css`、`show.css` 的舞台像素一起换成它。
- 大屏大厅里选了没有大屏画面的游戏时，那句「神回复会在大屏幕上整场演出，其他游戏在手机上玩」还是旧说法；等画面都做完一起改（它在视觉对照图 `site/tests/visual/__screenshots__/tv.png` 里，改了要更新对照图）。

## 交给别的对话

- 只看的人在手机画面上还被当成玩家（另一个分支在一起修所有 `Net*.tsx`）：第三批里看到的还有 `common.tsx` 的 `SeatPicker`（列出所有座位，包括只看的人：我从来没有「谁最有可能」投票、国王游戏指人受罚都用它），`NetPrompts.tsx` 的「几个人答了」分母用的是所有座位，`NetFreeze.tsx` 主人「抓人」的名单也是所有座位。

- 真心话大冒险（手机画面，Codex 的卡在改）：`NetTruth.tsx` 的瓶子把只看的人也算成一格，服务器只算玩家。只看的人坐在中间时，瓶子在手机上指的人和服务器选的人对不上；转到只看的人那一格，服务器不收，要再转一次。大屏按玩家画圈，指的是服务器选的人。

- 猜歌名：`site/scripts/stage_check.py` 里只看的那部手机现在看到的是大屏画面（不再是手机画面加「旁观中」横条），检查已经跟着改了，没在本地跑过（它要头像生成）。
- 加新游戏的大屏画面时，只看的手机会自动换成新画面；这个游戏的测试脚本里如果有只看的手机，要跟着改。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-03 Watching, batch 3: King's Game, Never Have I Ever, Post-it and Freeze Dance on the big screen (#155)
- 2026-11-03 Watching, batch 2: Truth or Dare, Wheel of Fate, Seven Eight Nine and Rogue Thirteen on the big screen (#153)
- 2026-11-02 Watching: every game's own big-screen view, starting with four games (#149)
- 2026-11-01 Every page has its own address; the back button closes sheets (UI plan A3) (#87)
- 2026-11-01 Three small things from the player tests
- 2026-11-01 Count the table's own penalty: ×N on the stamp, and 7-8-9's pot
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 打碟 · DJ Booth: the fake-DJ foundation (A1, A3, A6)
- 2026-10-31 Players on Name That Tune's stage, and a seat that just watches

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-03 大屏画面第三批：国王游戏、我从来没有、额头便利贴、木头人蹦迪。`watch_test.py` 每个游戏加一段（谁拿哪个号、谁答了什么、额头上的词都不上屏）。
- 2026-11-02 大屏画面第二批：真心话大冒险、命运转盘、七八九、流氓十三张。`watch_test.py` 每个游戏加一段（真心话的题目不上屏，各个阶段、报错）。
- 2026-11-02 大屏画面第一批：管道（`views.tsx` 登记、只看的手机整屏显示、声音、常亮、竖着拿时侧过来、到此一游和打碟的入口）和四个游戏（最佳称号、谁是卧底、猜歌名、戏精大赏）；神回复的演出也到了只看的手机上。`watch_test.py` 查每个阶段、秘密和报错。按当天 main 上的设计规则整理了颜色（token 和文件开头起名的道具色）和只看手机上的按钮（token，48 高）。`tv_test.py` 全过；`party_test.py` 除了到此一游的几项（本地没开到此一游的服务器，/trip 返回 500）都过，尤克牌单机那项第一次被惩罚印章挡住，重跑通过。

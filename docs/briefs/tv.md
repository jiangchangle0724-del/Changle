# 平台 · 大屏（tv）

对话名「平台 · 大屏」。网址 changle.ca/tv、changle.ca/tv/<桌号>。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视或电脑的浏览器打开 `changle.ca/tv`：屏幕上出现桌号和二维码，大家扫码入座。神回复在大屏上整场演出，手机变成遥控器；最佳称号、谁是卧底、猜歌名、戏精大赏也有自己的大屏画面（从沙发上看的那种）；其他游戏的大屏还是手机画面放大，旁边一列座位。

座位设成「只看」的手机，在有大屏画面的游戏里整屏显示同一个画面，适合投屏到电视。

## 文件

- `site/src/tv/`：`TvApp.tsx`（大屏页面）、`views.tsx`（每个游戏的大屏画面登记在这里，还有 `publicView`：交给画面之前去掉只有一部手机能知道的东西）、`show.tsx`（画面共用的零件：舞台、霓虹招牌、倒计时圈、站着的玩家、领奖台、计分板）、`moments.tsx`（表情、惩罚条、角落的二维码、大屏上的游戏音效）、`Watch.tsx`（只看的手机）、`parts.tsx`
- 每个游戏的大屏画面放在游戏旁边：`site/src/party/punchline/TvPunch.tsx`、`site/src/party/superlatives/TvSuper.tsx`、`site/src/online/games/TvUndercover.tsx`、`site/src/party/tune/TvTune.tsx`、`site/src/party/drama/TvDrama.tsx`
- 样式：`site/src/styles/tv.css`、`tv-show.css`，每个画面一份 `tv-superlatives.css`、`tv-undercover.css`、`tv-tune.css`、`tv-drama.css`
- 只看的手机从 `site/src/online/games/NetGame.tsx` 进 `Watch.tsx`（共用文件只动了两处：NetGame.tsx 的这几行，`NetFrame.tsx` 横条上给主人的那句话）

## 先读

- `site/DESIGN.md`
- 神回复的整场演出 `site/src/party/punchline/show/Stage.tsx`：大屏画面的质量和语气以它为准

## 测试

- `site/scripts/tv_test.py`（开桌、扫码、整局神回复）
- `site/scripts/watch_test.py`（三个玩家（谁是卧底四个）、一部横着拿的只看手机、两台电视 1920x1080 和 1280x720，四个游戏各玩一遍：每个阶段都显示、页面里没有任何秘密、没有报错；还有竖着拿的手机、神回复、到此一游和打碟的入口。截图在 scratchpad/watch）

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
- 大屏画面的样式：舞台上的尺寸是舞台像素，和 `tv.css`、`show.css` 一样（整个舞台按屏幕缩放，网站按 rem 和屏宽变的字号在里面不适用）；颜色用网站的 token、游戏的色灯，或者在文件开头起了名字的道具色（`docs/DESIGN.md` 第 3 条）。只看的手机上的按钮在舞台外面，用网站的 token，三个挨着，所以 48 高。

## 还剩什么

- 其他 11 个游戏的大屏画面，分批做：真心话大冒险、流氓十三张、国王游戏、额头便利贴、林波舞、我从来没有、尤克牌、七八九、木头人蹦迪、命运转盘、你画我猜。做法：照 `TvSuper.tsx` 写一个 `Tv<游戏>.tsx` 放在游戏旁边，在 `views.tsx` 登记，`publicView` 里加上这个游戏的私密字段，`watch_test.py` 加一段。
- 请 Steve 定：只看的手机默认放不放声音（现在：桌上没有大屏就放）；打碟的只看手机去 `/tv/<桌号>` 可以吗。
- 没在真电视、真 iPhone 上看过：测试是无头 Chromium 截图。
- 电视的字号档进 `tokens.css`（`docs/ui-inventory.md` 说的「电视档」）以后，大屏画面和 `tv.css`、`show.css` 的舞台像素一起换成它。
- 大屏大厅里选了没有大屏画面的游戏时，那句「神回复会在大屏幕上整场演出，其他游戏在手机上玩」还是旧说法；等画面都做完一起改（它在视觉对照图 `site/tests/visual/__screenshots__/tv.png` 里，改了要更新对照图）。

## 交给别的对话

- 猜歌名：`site/scripts/stage_check.py` 里只看的那部手机现在看到的是大屏画面（不再是手机画面加「旁观中」横条），检查已经跟着改了，没在本地跑过（它要头像生成）。
- 加新游戏的大屏画面时，只看的手机会自动换成新画面；这个游戏的测试脚本里如果有只看的手机，要跟着改。

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-02 Watching: every game's own big-screen view, starting with four games
- 2026-11-01 Every page has its own address; the back button closes sheets (UI plan A3) (#87)
- 2026-11-01 Three small things from the player tests
- 2026-11-01 Count the table's own penalty: ×N on the stamp, and 7-8-9's pot
- 2026-11-01 Custom penalty: no game line or button tells anyone to drink
- 2026-11-01 打碟 · DJ Booth: the fake-DJ foundation (A1, A3, A6)
- 2026-10-31 Players on Name That Tune's stage, and a seat that just watches

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 大屏画面第一批：管道（`views.tsx` 登记、只看的手机整屏显示、声音、常亮、竖着拿时侧过来、到此一游和打碟的入口）和四个游戏（最佳称号、谁是卧底、猜歌名、戏精大赏）；神回复的演出也到了只看的手机上。`watch_test.py` 查每个阶段、秘密和报错。按当天 main 上的设计规则整理了颜色（token 和文件开头起名的道具色）和只看手机上的按钮（token，48 高）。`tv_test.py` 全过；`party_test.py` 除了到此一游的几项（本地没开到此一游的服务器，/trip 返回 500）都过，尤克牌单机那项第一次被惩罚印章挡住，重跑通过。

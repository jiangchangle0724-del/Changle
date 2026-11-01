# site/src 盘点（A1）

2026-11-01。范围是 `site/src`：主站和 17 个游戏，不含 /eat（`tools/suibian`，C3 再盘）和 `games/`。
后半部分的表由 `site/scripts/ui_inventory.py` 从源码数出来；清理之后在 `site/` 里跑
`python3 scripts/ui_inventory.py` 再看一遍，数字就是进度。设计规则见 [DESIGN.md](DESIGN.md)，
token 的值在 `site/src/styles/tokens.css`。

## 先说结论

1. 公共样式已经有，而且用得多：480 个按钮里 351 个用的是公共的 `.btn`、`.icon-btn`、`.link-btn`、`.chip`。
   要收的是剩下的：37 种按钮自己写了一套外观，53 个按钮没写 class。
2. 卡片是重复最多的写法：84 个 class 各自写了底色、圆角和内边距。其中 36 个就是「dusk-2 底色加
   12 到 20 的圆角」，公共的 `.panel` / `.porcelain` 其实做的是同一件事，却只在 35 处用到。
3. 字号 49 种 px 值、524 处，另有 17 处 clamp 或 em、15 处写在 TSX 里。全部能落进 7 档加电视档和
   海报档，表在下面。
4. 裸写的颜色主要在游戏画面里：CSS 里 187 处 hex，166 处在 drama、show、tv、party、figures、trip
   这几个游戏样式文件（纸、血红、金、牌面），界面部分只有 21 处。TS / TSX 里的 334 处大多是色板数据
   （头像色、转盘色、演出角色色）和 SVG 插画，写在内联样式里的只有 22 处。
5. 阴影 270 处，其中 141 处其实是描边（inset 线和 `0 0 0 Npx` 的圈），真正的投影和光晕是另外 129 处。
   收成 3 级加 1 个光晕之后，描边归组件自己（字段、头像圈），不算阴影。
6. 动效时长 43 种。600 毫秒以内的 20 种都能归到 150 / 200 / 400 三档；更长的 23 种是游戏编排
   （倒计时、转盘、循环），留在游戏里。
7. 间距 1354 个 px 值里只有 45% 是 4 的倍数，6px 一个就用了 144 次。
8. 小于 44 的点击目标，CSS 里看得出的有 27 处，方案提到的语言开关（32 高）和账号按钮（42）都在里面。
9. 已经有一个 `GameShell`（`src/games/GameShell.tsx`，66 行：顶栏、规则弹层、惩罚）。A5 的统一游戏壳
   可以从它长出来。这次没碰它。

## 和方案里的数字对一下

- 方案写 29 种字号、56 个变量、19 组关键帧、116 处阴影，数的是首屏那一个 CSS 包（`index.css`，96 KB）。
  游戏的样式是点进游戏才加载的，算上全部源码是 49 种 px 字号、global.css 里 54 个 `:root` 变量、
  50 组关键帧、270 处阴影。映射表按全部源码做。
- 方案写「中文没指定字体」，这条不准：global.css 的 `--font-display` 和 `--font-text` 都已经带了
  PingFang SC、Hiragino Sans GB、Noto Sans SC、Noto Sans CJK SC、Microsoft YaHei，顺序和方案一样。
  iPhone 上是苹方，安卓上是系统自带的思源黑体（Noto Sans CJK），Windows 上是微软雅黑，长得不一样是因为
  不自带中文字体文件，方案也不打算带。所以 C4 要做的是行高、`lang` 和中英混排，字体栈只需要整理。
  tokens.css 里多了一个 `--font-zh`，按方案的顺序写，并保留安卓和 Linux 用得到的两个名字。

## 12 个目标组件，现在的代码在哪

| 组件 | 现在 | 要补的 |
| --- | --- | --- |
| Button | `.btn` 一家（global.css）：primary、quiet、ghost、go、gold、penalty、moon 七种，加 `.icon-btn`、`.link-btn`。没有 React 组件，每处手写 className | 收成主、静、危险、图标四种；`.btn-sm` 只有 40 高；没有「等待中」状态 |
| Tile | `home/Tile.tsx` | 按游戏配色（17 种）；卡上没有时长和喝不喝酒；没有首页大卡尺寸 |
| Sheet | `components/Sheet.tsx`（GSAP 升起、按住把手下滑关闭、Esc 关闭） | 对话框没有名字，就是 axe 报的那条；没有固定在底部的按钮区 |
| Tabs | 三套：首页的 `.tabs`（`home/Home.tsx`）、胶囊组 `.seg`（28 处）、头像编辑器的 `.mk-tabs` | `account/MePage.tsx` 的两个 tab 用了 `aria-pressed`，tab 应该用 `aria-selected` |
| Pill | `.chip`，加 `.tag`、`.tile-tag`、`.kind-tag`、`.seat-tag` 各一套（24 处） | 合成一个，分标签和可点的筛选芯片 |
| RosterChip | 没有统一的：`PlayersSheet` 里的 chip、`online/People.tsx` 的 `SeatFace`、各游戏自己的头像排；「轮到谁」的圈在 41 处 `0 0 0 Npx` 里 | 新做，头像继续用 `account/Avatar.tsx` |
| OTPInput | `account/SignIn.tsx` 的 `.otp`（一个透明输入框盖 6 个格子）；桌号是 `online/OnlineSheet.tsx` 里一个普通输入框 | 抽出来，两处共用 |
| Toast | `online/Overlays.tsx` 的 `ToastLayer`，只在联机里有；post-it 自己有 `.pi-toast` | 全站一个 |
| EmptyState | `.empty`，11 处（账号、聊天、心愿单） | 没有带动作按钮的统一写法 |
| Skeleton | 没有。加载时是一个空的 screen（`ChatPage`、`AdminPage`）或空的账号按钮占位 | 新做 |
| GameHeader | `components/TopBar.tsx`（返回、双语标题、帮助）放在 `games/GameShell.tsx` 里 | 没有轮次、倒计时、声音、电视入口；高度不固定 |
| PenaltyCard | `components/PenaltyStamp.tsx`（全屏盖章加杯子），联机版在 `online/Overlays.tsx` 的 `NetPenaltyLayer` | 已经很统一，主要是收进组件库，加一个列表里用的卡片版 |

## 旧变量到新 token

新代码只用右边的名字。左边的名字在 global.css 里一直留到迁移做完（C8），值不变。

| 旧 | 新 |
| --- | --- |
| `--night` | `--color-bg` |
| `--dusk` | `--color-sheet` |
| `--dusk-2`，`--porcelain` | `--color-surface` |
| `--dusk-3` | `--color-raised` |
| `--moon`，`--ink`，`--lamp`，`--cream` | `--color-text` |
| `--haze`，`--cream-soft` | `--color-text-2` |
| `--fog`，`--cream-faint` | `--color-text-3` |
| `--line`，`--line-soft` | `--color-line`，`--color-line-soft` |
| `--go` | `--color-success` |
| `--warn`（`--amber`、`--gold` 当警告用时） | `--color-warning` |
| `--stop`，`--vermilion` | `--color-danger` |
| `--cobalt`，`--cobalt-deep`，`--jade` | 游戏色，直接用 `--gel-blue`、`--gel-periwinkle`、`--gel-jade` |
| `--gel`，`--light`，`--on-gel` | 不变（运行时设置的颜色） |
| `--r-small` 到 `--r-sheet` | 不变；`999px` 改成 `--r-pill` |
| `--ease-out`，`--ease-pop`，`--font-display`，`--font-text` | 不变 |
| 写死的 `font-size: Npx` | `--text-xs` 到 `--text-poster`，见字号映射 |
| 写死的 padding、margin、gap | `--space-1` 到 `--space-12`（4 到 48） |
| 写死的 `transition` 时长 | `--dur-exit`、`--dur-enter`、`--dur-emphasis` |

## 按 Web Interface Guidelines 顺手看到的

- `index.html` 的 viewport 写了 `user-scalable=no`，禁止缩放。方案已经提了，归 C4。
- `index.html` 的 `theme-color` 是 `#2A0907`，旧配色留下的红棕色。安卓浏览器的地址栏会变成这个颜色，
  应该是夜色 `#0e0c22`。归 C7。
- Sheet 有 `role="dialog"` 但没有 `aria-labelledby`。`src/ui/types.ts` 的 SheetProps 要求必须给
  标题或 label。
- `MePage` 的 tab 用了 `aria-pressed`，读屏软件不会把它当 tab 读。
- 对比度：Fog 色的字放在面板上是 3.9:1，放在 sheet 上是 4.4:1，都不到 4.5:1；Stop Red 上的白字是
  3.2:1。规则写进了 DESIGN.md 的对比度表。

以下由 `python3 scripts/ui_inventory.py` 生成（2026-11-01）。

## 总数

| 项目 | 数量 |
| --- | --- |
| TSX 文件 | 108 |
| 组件（导出 / 文件内） | 171 / 87 |
| CSS 文件，源码大小 | 15 个，271 KB |
| global.css 里的 :root 变量 | 54 |
| px 字号：种类 / 出现次数 | 49 / 524 |
| 其他写法的字号（clamp、em、calc） | 17 |
| TSX 内联字号（不含 SVG 画布单位） | 15 |
| CSS 里裸写的 hex：种类 / 次数 | 80 / 187 |
| CSS 里的 rgba() / hsl() | 114 |
| TS / TSX 里的 hex：种类 / 次数 | 157 / 334 |
| box-shadow：种类 / 次数 | 188 / 270 |
| @keyframes | 50 |
| 用到 GSAP 的文件 | 33 |
| 内联 style={{...}} | 284 |
| <button>：用公共样式 / 全部 | 351 / 480 |
| 自带外观的按钮样式 | 37 |
| 自带外观的卡片样式 | 84 |
| 小于 44 的点击目标（CSS 里能看出来的） | 27 |

## 组件清单（按目录）

| 目录 | 文件 | 行数 | 导出的组件 |
| --- | --- | --- | --- |
| src | 3 | 472 | App，StoreProvider（另有 2 个文件内组件） |
| account | 13 | 2379 | AccountButton，AccountProvider，AdminPage，AdminScenes，Avatar，ChatPage，FriendsPanel，HistoryList，FavoriteGame，MePage，PerkNews，ProfileForm，SignInSheet，UserPage（另有 1 个文件内组件） |
| account/avatar | 2 | 673 | Face，AvatarMaker（另有 7 个文件内组件） |
| components | 15 | 1435 | Cloche，Die，PorcelainDefs，DrawingPlate，Figure，Confetti，Moment，RoomFigures，Lineup，Glass，PenaltyStamp，PlayerPicker，PlayersSheet，SettingsSheet，Sheet，ClosedSign，SiteGate，TimerArc，LangTab，BiTitle，TopBar（另有 2 个文件内组件） |
| games | 9 | 1792 | Dice789，DrawGuess，GameShell，KingsGame，PromptDecks，Rogue13，PlayingCard，TruthDare，Undercover，WheelOfFate |
| home | 6 | 1105 | GameSheet，Home，PartyTab，Tile，TipButton，WishlistTab（另有 8 个文件内组件） |
| online | 11 | 1934 | InviteCard，InviteSheet，JoinScreen，Lobby，NetFrame，NetPlate，OnlineRoom，OnlineSheet，NetPenaltyLayer，ReactionLayer，ReactionDock，ToastLayer，ConnectionBanner，SeatFace，PersonSheet，RoomProvider，TableSheet，GameExitSheet，LeaveSheet（另有 4 个文件内组件） |
| online/games | 10 | 2187 | NetDice，NetDraw，NetGame，NetKing，NetPrompts，NetRogue，NetTruth，NetUndercover，NetWheel，TurnLine，Waiting，HostButton，HostRow，SeatPicker（另有 7 个文件内组件） |
| party | 1 | 99 | PassCurtain，NameFace，Leaderboard，Both |
| party/drama | 4 | 1536 | Drama，NetDrama，Backdrop，Curtain，Cast，MaskArt，MiniMask，TrophyArt，Tags，Playbill，Roster，RoleCard，TwistBanner，SceneClock，Slate，BallotForm，Reveal，SetupPanel，Marquee，Finale，Rules，SceneWriter，TableScenes |
| party/euchre | 3 | 780 | Card，BotFace，EuchreBoard，EuchreRules，Euchre，NetEuchre（另有 3 个文件内组件） |
| party/freeze | 3 | 548 | Freeze，NetFreeze，DanceFloor，FreezeFlash，StillMeter |
| party/limbo | 3 | 907 | Limbo，NetLimbo，LimboScene，LeanGauge，BlindMeter |
| party/postit | 3 | 622 | NetPostit，Postit，Sticky，Forehead（另有 4 个文件内组件） |
| party/punchline | 3 | 969 | NetPunch，Punchline，PromptCard，AnswerCard，SweepStamp，Points（另有 13 个文件内组件） |
| party/punchline/show | 3 | 1048 | ShowPreview，Stage（另有 14 个文件内组件） |
| party/superlatives | 3 | 516 | NetSuper，Superlatives，AwardCard，AwardReveal，Ceremony |
| party/trip | 2 | 231 | NetTrip，Pass，TripSolo |
| party/tune | 5 | 1602 | NetTune，Tune，Crew，Vinyl，StageDots，BuzzButton，TuneTitle，PoolPicker，AnswerPicker，QuizChoices，CoverLabel，SongReveal，SongStatus，TuneStage（另有 5 个文件内组件） |
| tools | 5 | 644 | Currency，Suibian，ToolsTab，UnitPrice，WorldClock（另有 2 个文件内组件） |
| tv | 1 | 581 | TvApp（另有 15 个文件内组件） |

## 字号映射

| 新档 px | token | 旧值（处数，含 TSX 内联） | 合计 |
| --- | --- | --- | --- |
| 12 | --text-xs | 10（1），10.5（2），11（4），11.5（6），12（30），12.5（32） | 75 |
| 14 | --text-sm | 13（60），13.5（21），14（53），14.5（11） | 145 |
| 16 | --text-md | 15（39），15.5（11），16（36） | 86 |
| 18 | --text-lg | 17（17），18（29），19（15），20（19） | 80 |
| 22 | --text-xl | 21（4），22（23），23（1），24（21），25（6） | 55 |
| 28 | --text-2xl | 26（25），27（2），28（9），29（1），30（11），32（5），34（9） | 62 |
| 40 | --text-3xl | 36（2），38（1），40（5），42（3），44（3），46（3），50（3） | 20 |
| 64 | --text-4xl | 54（3），56（1），58（1），62（1），64（2），66（1），68（1） | 10 |
| 海报 | --text-poster | 76（1），96（1），110（1），140（1），148（1），150（1） | 6 |

其他写法：

| 写法 | 位置 | 去哪一档 |
| --- | --- | --- |
| clamp(24px, 7.4vw, 34px) | src/styles/components.css:391 `.stamp-names` | 29px 时 → --text-2xl |
| clamp(88px, 34vw, 156px) | src/styles/components.css:416 `.stamp-big` | 133px 时 → --text-poster |
| clamp(64px, 22vw, 108px) | src/styles/components.css:424 `.stamp-big.en-display` | 86px 时 → --text-poster |
| clamp(32px, 9vw, 46px) | src/styles/components.css:428 `.stamp-custom .stamp-big` | 35px 时 → --text-3xl |
| clamp(22px, 6.6vw, 32px) | src/styles/components.css:434 `.stamp-second` | 26px 时 → --text-2xl |
| clamp(18px, 5vw, 24px) | src/styles/components.css:440 `.stamp-custom .stamp-second` | 20px 时 → --text-lg |
| clamp(30px, 9vw, 44px) | src/styles/drama.css:1117 `.dm-marquee strong` | 35px 时 → --text-3xl |
| calc(var(--fig-h, 80px) * 0.22) !important | src/styles/figures.css:36 `.fig-token-head .avatar` | 组件内部计算：保留 |
| clamp(34px, 10vw, 44px) | src/styles/online.css:327 `.invite-code` | 39px 时 → --text-3xl |
| clamp(40px, 12vw, 52px) | src/styles/online.css:389 `.join-code` | 47px 时 → --text-3xl |
| clamp(64px, 22vw, 96px) | src/styles/online.css:885 `.grab-btn` | 86px 时 → --text-poster |
| clamp(56px, 20vw, 96px) | src/styles/online.css:1008 `.interrupt-big` | 78px 时 → --text-poster |
| 0.5em | src/styles/party.css:15 `.both-other` | 相对字号（双语副标）：保留，或改成下一档 |
| 0.68em | src/styles/party.css:792 `.sticky-other` | 相对字号（双语副标）：保留，或改成下一档 |
| clamp(40px, 13vw, 84px) | src/styles/party.css:1190 `.heads-word > span` | 51px 时 → --text-3xl |
| clamp(18px, 5vw, 28px) | src/styles/party.css:1197 `.heads-word > small` | 20px 时 → --text-lg |
| 0.8em | src/styles/show.css:211 `.sh-round-name small` | 相对字号（双语副标）：保留，或改成下一档 |

## 裸写的颜色（CSS，按文件）

| 文件 | hex | rgba / hsl | 主要是 |
| --- | --- | --- | --- |
| src/styles/drama.css | 69 | 22 | 游戏画面 |
| src/styles/show.css | 50 | 21 | 游戏画面 |
| src/styles/tv.css | 19 | 13 | 游戏画面 |
| src/styles/party.css | 15 | 16 | 游戏画面 |
| src/styles/figures.css | 8 | 6 | 游戏画面 |
| src/styles/components.css | 3 | 9 | 界面 |
| src/styles/avatar.css | 4 | 7 | 界面 |
| src/styles/home.css | 5 | 5 | 界面 |
| src/styles/account.css | 4 | 4 | 界面 |
| src/styles/trip.css | 5 | 2 | 游戏画面 |
| src/styles/online.css | 3 | 4 | 界面 |
| src/styles/global.css | 1 | 3 | 界面 |
| src/styles/admin.css | 1 | 1 | 界面 |
| src/styles/tools.css | 0 | 1 | 界面 |

出现最多的 hex：

| hex | 次数 | 文件 |
| --- | --- | --- |
| #ffffff | 47 | account.css，admin.css，avatar.css，components.css，global.css，online.css，party.css，show.css，tv.css |
| #e765f0 | 15 | show.css，tv.css |
| #ffcf5a | 9 | account.css，avatar.css，figures.css，home.css |
| #f3d27a | 7 | drama.css |
| #0e0c22 | 5 | drama.css，party.css，show.css |
| #000000 | 5 | figures.css，party.css，show.css |
| #fff1c9 | 3 | drama.css |
| #ffffff0d | 3 | drama.css |
| #3a0614 | 3 | drama.css |
| #5b5873 | 3 | show.css，tv.css |
| #ffe08a | 2 | account.css，avatar.css |
| #b9861d | 2 | account.css，figures.css |

## 裸写的颜色（TS / TSX，按文件）

| 文件 | 数据（色板、配置） | SVG 填色 | 内联样式 |
| --- | --- | --- | --- |
| src/party/tune/performer.ts | 53 | 51 | 0 |
| src/shared/draw.ts | 37 | 0 | 0 |
| src/games/registry.ts | 17 | 0 | 0 |
| src/account/Avatar.tsx | 15 | 0 | 0 |
| src/components/Figure.tsx | 0 | 14 | 0 |
| src/games/Rogue13.tsx | 0 | 14 | 0 |
| src/components/Dish.tsx | 0 | 13 | 0 |
| src/games/WheelOfFate.tsx | 10 | 0 | 0 |
| src/online/games/NetWheel.tsx | 10 | 0 | 0 |
| src/party/punchline/NetPunch.tsx | 10 | 0 | 0 |
| src/party/punchline/Punchline.tsx | 10 | 0 | 0 |
| src/party/punchline/show/Stage.tsx | 10 | 0 | 0 |
| src/shared/trip/data.ts | 0 | 0 | 8 |
| src/lib/confetti.ts | 7 | 0 | 0 |
| src/party/superlatives/parts.tsx | 0 | 0 | 6 |
| src/components/DrawingPlate.tsx | 0 | 0 | 5 |
| src/shared/protocol.ts | 5 | 0 | 0 |
| src/components/Dice.tsx | 0 | 4 | 0 |
| src/games/TruthDare.tsx | 0 | 4 | 0 |
| src/online/games/NetTruth.tsx | 0 | 4 | 0 |
| src/party/drama/parts.tsx | 4 | 0 | 0 |
| src/lib/anim.ts | 4 | 0 | 0 |
| src/components/Glass.tsx | 0 | 3 | 0 |
| src/account/AdminPage.tsx | 2 | 0 | 0 |
| src/party/tune/stage.tsx | 0 | 2 | 0 |
| src/tv/TvApp.tsx | 2 | 0 | 0 |
| src/account/History.tsx | 0 | 0 | 1 |
| src/account/MePage.tsx | 1 | 0 | 0 |
| src/account/PerkNews.tsx | 1 | 0 | 0 |
| src/account/SignIn.tsx | 1 | 0 | 0 |
| src/account/avatar/Maker.tsx | 1 | 0 | 0 |
| src/home/Tip.tsx | 1 | 0 | 0 |
| src/online/Invite.tsx | 0 | 0 | 1 |
| src/online/People.tsx | 1 | 0 | 0 |
| src/party/drama/writer.tsx | 1 | 0 | 0 |
| src/party/punchline/show/Preview.tsx | 0 | 0 | 1 |

## 自带外观的按钮

| class | <button> 处数 | 样式在 |
| --- | --- | --- |
| `.mode-btn` | 4 | home.css |
| `.power-btn` | 4 | online.css |
| `.tv-btn` | 4 | tv.css |
| `.mk-thumb` | 3 | avatar.css |
| `.nominee` | 3 | party.css |
| `.mk-color` | 2 | avatar.css |
| `.brush` | 2 | components.css |
| `.face-dot` | 2 | account.css，online.css |
| `.eu-suit` | 2 | party.css |
| `.fz-catch-btn` | 2 | party.css |
| `.tn-option` | 2 | party.css |
| `.tv-ctl` | 2 | tv.css |
| `.chat-below` | 1 | account.css |
| `.chat-send` | 1 | account.css |
| `.tag` | 1 | account.css |
| `.av-swatch` | 1 | account.css |
| `.mk-tab` | 1 | avatar.css |
| `.cloche-dome` | 1 | components.css |
| `.pcard-face` | 1 | components.css |
| `.roster` | 1 | home.css |
| `.online-btn` | 1 | home.css |
| `.spin-btn` | 1 | home.css |
| `.tip-btn` | 1 | home.css |
| `.wish-made-head` | 1 | home.css |
| `.vote` | 1 | home.css |
| `.table-btn` | 1 | online.css |
| `.net-banner-btn` | 1 | online.css |
| `.num-btn` | 1 | online.css |
| `.my-word` | 1 | online.css |
| `.dm-card-back` | 1 | drama.css |
| `.dm-suspect` | 1 | drama.css |
| `.eu-sit` | 1 | party.css |
| `.pi-reply` | 1 | party.css |
| `.deck-pick` | 1 | party.css |
| `.pc-vote` | 1 | show.css |
| `.pad` | 1 | party.css |
| `.buzz` | 1 | party.css |

没写 class 的 <button>：53 个，最多的文件：WishlistTab.tsx（5），NetTune.tsx（4），Tune.tsx（4），NetEuchre.tsx（3），Limbo.tsx（3），Superlatives.tsx（3）

## 自带外观的卡片

| class | 圆角 | 底色 | 样式在 |
| --- | --- | --- | --- |
| `.adm-scene` | 16px | `var(--dusk-2)` | admin.css |
| `.adm-switch` | var(--r-panel) | `color-mix(in oklab, var(--go) 9%, var(--dusk-2))` | admin.css |
| `.adm-table` | var(--r-panel) | `var(--dusk-2)` | admin.css |
| `.award-card` | 26px | `radial-gradient(90% 70% at 50% 0%, color-mix(in ` | party.css |
| `.bubble` | 21px | `var(--mine, var(--moon))` | account.css |
| `.code-plaque` | 14px | `var(--moon)` | online.css |
| `.deck-pick` | 18px | `var(--dusk-2)` | party.css |
| `.dm-card-back` | 20px | `radial-gradient(circle at 50% 45%, #7a1428, #3a0` | drama.css |
| `.dm-card-front` | 20px | `linear-gradient(170deg, #2a2148, #181633 70%)` | drama.css |
| `.dm-card-secret` | 14px | `rgba(255, 255, 255, 0.04)` | drama.css |
| `.dm-card-task` | 14px | `rgba(255, 255, 255, 0.04)` | drama.css |
| `.dm-rates` | 16px | `var(--dusk-2)` | drama.css |
| `.dm-roster` | 16px | `var(--dusk-2)` | drama.css |
| `.dm-suspect` | 18px | `var(--dusk-2)` | drama.css |
| `.dm-truths` | 16px | `var(--dusk-2)` | drama.css |
| `.dm-twist` | 16px | `var(--gel)` | drama.css |
| `.dm-written` | 12px | `rgba(255, 255, 255, 0.04)` | drama.css |
| `.dw-mine` | 12px | `rgba(255, 255, 255, 0.04)` | drama.css |
| `.dw-note` | 12px | `color-mix(in oklab, var(--gel) 14%, var(--dusk))` | drama.css |
| `.dw-role` | 16px | `rgba(255, 255, 255, 0.03)` | drama.css |
| `.eu-alone` | 16px | `var(--dusk-2)` | party.css |
| `.eu-result` | var(--r-panel) | `var(--dusk-2)` | party.css |
| `.eu-score` | 18px | `var(--dusk-2)` | party.css |
| `.eu-suit` | 16px | `var(--card-face)` | party.css |
| `.eu-table` | 34px | `radial-gradient(62% 54% at 50% 46%, color-mix(in` | party.css |
| `.eu-watching` | 14px | `var(--dusk-2)` | party.css |
| `.fav-row` | 16px | `color-mix(in oklab, var(--gel) 13%, var(--dusk-2` | account.css |
| `.freeze` | 26px | `color-mix(in oklab, var(--gel) 12%, transparent)` | party.css |
| `.fx-row` | 18px | `var(--dusk-2)` | tools.css |
| `.fz-catch-btn` | 16px | `var(--dusk-2)` | party.css |
| `.game-card-soon` | 18px | `var(--dusk-2)` | home.css |
| `.game-panel` | var(--r-panel) | `var(--dusk-2)` | online.css |
| `.heads-list` | 14px | `var(--dusk-2)` | party.css |
| `.history-row` | 18px | `var(--dusk-2)` | account.css |
| `.invite-qr` | 18px | `#ffffff` | online.css |
| `.lb-person` | 14px | `var(--dusk-2)` | party.css |
| `.lb-row` | 16px | `var(--dusk-2)` | party.css |
| `.lb-steps` | 18px | `var(--dusk-2)` | party.css |
| `.mk-leave` | var(--r-sheet) var(--r-sheet) 0 0 | `var(--dusk)` | avatar.css |
| `.mk-slot-card` | 22px | `color-mix(in oklab, var(--dusk-2) 80%, transpare` | avatar.css |
| `.mode-btn` | 20px | `var(--dusk-2)` | home.css |
| `.mode-help` | 16px | `color-mix(in oklab, var(--gel) 14%, var(--dusk-2` | home.css |
| `.net-banner` | 14px | `color-mix(in oklab, var(--warn) 18%, var(--dusk-` | online.css |
| `.nominee` | 18px | `var(--dusk-2)` | party.css |
| `.pass-curtain` | var(--r-panel) | `radial-gradient(80% 60% at 50% 0%, color-mix(in ` | landscape.css，party.css |
| `.pc-chip` | 16px | `color-mix(in oklab, #e765f0 14%, var(--dusk-2))` | show.css |
| `.pc-vote` | 22px | `#fff` | show.css |
| `.pi-order` | 14px | `var(--dusk-2)` | party.css |
| `.pi-panel` | 20px | `var(--dusk-2)` | party.css |
| `.pi-question` | 16px 16px 16px 4px | `var(--moon)` | party.css |
| `.pl-answer` | 22px 22px 22px 6px | `var(--moon)` | party.css |
| `.pl-prompt` | 22px | `radial-gradient(100% 80% at 0% 0%, color-mix(in ` | party.css |
| `.pl-sent` | 16px | `color-mix(in oklab, var(--go) 14%, var(--dusk-2)` | party.css |
| `.pl-tally-row` | 18px | `var(--dusk-2)` | show.css |
| `.price-also` | 12px | `var(--dusk-3)` | tools.css |
| `.price-cur` | 12px | `var(--dusk-3)` | tools.css |
| `.price-input` | 18px | `var(--dusk-2)` | tools.css |
| `.price-list` | 16px | `var(--dusk-2)` | tools.css |
| `.sevens-entry` | 12px | `var(--dusk-2)` | online.css |
| `.sh-ans` | 16px | `var(--card)` | show.css |
| `.sh-prompt` | 14px | `#fffdf8` | show.css |
| `.sh-row` | 14px | `rgba(255, 255, 255, 0.045)` | show.css |
| `.sh-step` | 18px 18px 4px 4px | `linear-gradient(180deg, color-mix(in oklab, var(` | show.css |
| `.sh-sweep` | 16px | `color-mix(in oklab, var(--orchid) 30%, rgba(18, ` | show.css |
| `.shelf` | 18px | `var(--dusk-2)` | party.css |
| `.stat` | 16px | `var(--dusk-2)` | account.css |
| `.tip-card` | 18px | `var(--dusk-2)` | home.css |
| `.tn-dj-note` | 16px | `var(--dusk-2)` | party.css |
| `.tn-option` | 16px | `var(--dusk-2)` | party.css |
| `.tool` | 26px | `var(--dusk)` | tools.css |
| `.tune-title` | 20px | `color-mix(in oklab, var(--gel) 16%, var(--dusk-2` | party.css |
| `.tv-corner` | 22px | `rgba(7, 4, 10, 0.72)` | tv.css |
| `.tv-corner-qr` | 14px | `#fff` | tv.css |
| `.tv-front-card` | 30px | `color-mix(in oklab, var(--gel) 16%, var(--dusk-2` | tv.css |
| `.tv-join` | 20px | `var(--dusk-2)` | tv.css |
| `.tv-qr` | 30px | `#fff` | tv.css |
| `.tv-react` | 24px | `#fff` | tv.css |
| `.tv-seats` | 34px | `color-mix(in oklab, var(--dusk) 82%, transparent` | tv.css |
| `.watch-strip` | 14px | `color-mix(in oklab, var(--gel) 14%, var(--dusk-2` | online.css |
| `.wc-ask` | 16px | `var(--dusk-2)` | online.css |
| `.wish-item` | 18px | `var(--dusk)` | home.css |
| `.wish-made-head` | 18px | `var(--dusk)` | home.css |
| `.wish-reward` | 16px | `color-mix(in oklab, #ffcf5a 11%, var(--dusk))` | home.css |
| `.wish-rules` | 12px | `var(--dusk-2)` | home.css |

## 阴影

| 类型 | 次数 |
| --- | --- |
| 描边（inset） | 99 |
| 圈（0 0 0 Npx） | 41 |
| 光晕（带颜色） + 描边（inset） | 29 |
| 投影（黑色） + 描边（inset） | 22 |
| 投影（黑色） | 17 |
| 光晕（带颜色） | 16 |
| 光晕（带颜色） + 圈（0 0 0 Npx） | 15 |
| 光晕（带颜色） + 圈（0 0 0 Npx） + 投影（黑色） | 11 |
| 圈（0 0 0 Npx） + 投影（黑色） | 8 |
| 光晕（带颜色） + 投影（黑色） + 描边（inset） | 4 |
| 光晕（带颜色） + 圈（0 0 0 Npx） + 描边（inset） | 3 |
| 光晕（带颜色） + 投影（黑色） | 3 |
| 圈（0 0 0 Npx） + 描边（inset） | 1 |
| 圈（0 0 0 Npx） + 投影（黑色） + 描边（inset） | 1 |

## 动效时长

| 去哪 | 旧值 ms（次数） |
| --- | --- |
| --dur-exit (150) | 0（3），10（2），80（1），100（4），120（2），150（14），160（17） |
| --dur-enter (200) | 180（7），200（44），220（5），250（10），300（10） |
| --dur-emphasis (400) | 320（1），350（3），400（15），450（1），460（1），500（13），550（3），600（7） |
| game choreography: stays in the game | 650（2），700（4），750（4），800（1），850（2），900（5），950（1），1000（4），1100（3），1200（3），1300（1），1400（3），1500（1），1600（2），1800（3），2200（2），2400（1），3000（1），3200（2），3400（2），7000（1），9000（1），26000（1） |

## 圆角

| 去哪 | 旧值（次数） |
| --- | --- |
| --r-field | 16px（26），14px（20），17px（1），13px（1） |
| --r-panel | 18px（22），22px（9），20px（8），21px（1） |
| --r-pill / circle | 999px（124），50%（24），99px（2） |
| --r-sheet | 28px（2），34px（2），30px（2），56px（1） |
| --r-small | 12px（8），10px（7），8px（5），9px（1） |
| --r-tile | 26px（5），24px（3），25px（1） |
| tight (card fans, small marks): stays local | 3px（4），2px（2），6px（1），1px（1），5px（1），7px（1） |
| token or several corners | var(--r-panel)（7），inherit（6），var(--r-sheet) var(--r-sheet) 0 0（3），16px 16px 16px 4px（2），6px 6px 0 0（1），0 0 8px 8px（1），var(--r-field)（1），var(--r-tile)（1），22px 22px 22px 6px（1），3px 3px 4px 12px（1），3px 3px 4px 14px（1），8px 8px 2px 2px（1），18px 18px 4px 4px（1） |

## 间距

padding、margin、gap 里的 px 值共 1354 个，615 个是 4 的倍数（45%）。不是 4 的倍数的：0.75（1），1（12），1.5（1），2（86），3（32），5（23），6（144），7（15），9（24），10（148），11（13），13（2），14（127），15（3），18（54），22（18），26（14），30（7），34（10），46（3），50（1），58（1）

## 小于 44 的点击目标

| 位置 | 选择器 | 尺寸 |
| --- | --- | --- |
| src/styles/account.css:54 | `.acct-btn` | height 42 |
| src/styles/account.css:53 | `.acct-btn` | width 42 |
| src/styles/account.css:118 | `.tag` | min-height 26 |
| src/styles/account.css:471 | `.av-swatch` | height 26 |
| src/styles/account.css:470 | `.av-swatch` | width 26 |
| src/styles/account.css:832 | `.chat-below` | min-height 36 |
| src/styles/account.css:871 | `.chat-send` | height 40 |
| src/styles/account.css:870 | `.chat-send` | width 40 |
| src/styles/avatar.css:178 | `.mk-thumb` | width 42 |
| src/styles/avatar.css:238 | `.mk-tab` | min-height 40 |
| src/styles/components.css:149 | `.held .chip` | min-height 32 |
| src/styles/global.css:307 | `.btn-sm` | min-height 40 |
| src/styles/global.css:396 | `.chip` | min-height 40 |
| src/styles/global.css:414 | `.chip-sm` | min-height 32 |
| src/styles/global.css:435 | `.chip-x` | height 20 |
| src/styles/global.css:434 | `.chip-x` | width 20 |
| src/styles/global.css:520 | `.seg > button` | min-height 40 |
| src/styles/global.css:539 | `.seg-sm > button` | min-height 34 |
| src/styles/global.css:619 | `.lang-tab button` | height 32 |
| src/styles/global.css:618 | `.lang-tab button` | min-width 38 |
| src/styles/home.css:247 | `.spin-btn` | height 42 |
| src/styles/home.css:762 | `.wish-rules-btn` | min-height 40 |
| src/styles/online.css:22 | `.table-btn` | height 42 |
| src/styles/online.css:71 | `.net-banner-btn` | min-height 36 |
| src/styles/online.css:282 | `.seat-row-actions .btn-sm` | min-height 34 |
| src/styles/online.css:807 | `.my-word` | min-height 40 |
| src/styles/party.css:3117 | `.tn-pool-cats .chip` | min-height 32 |

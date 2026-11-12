# 任务卡 C4 · 手机画面（一起跳）

> **先别发（2026-11-05 晚上）**：手机现在有体感开关、能量条、热歌的歌单（PR #272 和热歌的 PR）。这张卡要按新页面重写，由「游戏 · 一起跳」对话来写。

**负责**：Codex　**审查**：Claude Code（「游戏 · 一起跳」对话）　**分支**：`codex/dance-c4-phone-screen`

**开始前**：C3（音箱端画面）要先合并，这张卡用它接进来的 tokens。

## 目标

把 changle.ca/party/join 做成单手拿着、灯光暗也好用的手机页面：加入、大厅（主人选舞）、跳舞时、结算。

判拍子和发给房间的部分已经做好、测好了。现在手机上一个大按钮代替动作传感器，每一拍点一下（方案的「假体感」）；以后任务 A2 换成传感器，按钮那块的内容会变成「手机握在手里跟着跳」。这张卡只做画面。

## 先读

- `games/party-server/README.md`
- `games/party-server/src/client/join.ts`（现在的页面：数据从哪来，哪些函数管计时和判拍子）
- `games/party-server/src/shared/taps.ts`（`BeatJudge`、`Verdict`）、`src/shared/show.ts`（`RunBeat`）、`src/shared/protocol.ts`（`Results`）
- `games/party-server/src/client/words.ts`（两种语言的字）
- `docs/DESIGN.md`；C3 合并后的 `src/client/tokens.css` 和 `tests/design.test.ts`
- `docs/dance-along.md` 的「体感与打分」和「老手会多做的事」第 2、3、4、5 条

先把本地跑起来看一遍现在的样子：`npm ci`、`npm run build`、`npx wrangler dev --var ALLOW_TEST_SETTINGS:1`，再 `node scripts/song-check.cjs`。

## 要做的

1. **样式**：手机的样式搬进 `src/client/phone.css`（`join.html` 引用它，`build.mjs` 照样输出），全部用 tokens 的语义名；`tests/design.test.ts` 也查这个文件。共用的 `party.css` 不动（C3 定的）。
2. **加入**：房间码 4 格、名字；扫码进来时房间码已经填好（`?code=`）。出错（房间码不对、房间满了、房间结束了）说清楚，给一个回去的按钮。
3. **大厅**：
   - 主人：6 支舞的列表（名字、难度、风格、BPM、大概几分钟 `showMinutes`），简单的在前；选中的一支清楚地亮着；「先学再跳 / 直接跳」二选一；一个大的开始按钮。下面是「校准电视延迟」；最下面不显眼地放「开始：120 拍节拍器」（真机对时测试用，按钮上的字不改，`timing-check.cjs` 按字找它）。
   - 别人：「等主人选舞」、已经进来的人、「我在」按钮（大屏上名字会亮）。
4. **跳舞时**：
   - 大按钮占屏幕一半左右，拇指够得着。不算分的拍子（热身、看一遍、倒数、收尾，`RunBeat.score` 为 false）它安静，显示该做什么（`restHint`）；算分的拍子上每拍给反馈：踩准了、差一点、动起来（`Verdict`）。iPhone 的浏览器不能震动，用颜色和一个很短的动画；安卓可以加 `navigator.vibrate(12)`。减少动效时只变颜色。
   - 按钮上面：阶段、动作名、8 拍大字、「接下来」（提前 2 拍，和电视同步）。字比电视的小，但一眼能看清。
   - 我的能量条：最近 8 拍踩准几拍。
   - 主人多一排按钮：开始跳（学的时候：跳过热身和教学）、这一段再来、看结果（舞跳完以后才出现）、停下回大厅。按钮之间留足距离，跳舞时不会误碰；「结束房间」要点两下确认（现在就是这样）。别人看不到这些。
   - 每拍一闪（`#flash`）保留：它是 A1 对时测试量的东西，`timing-check.cjs` 看它的 class。跳舞时可以更淡，但每拍都要有。
5. **结算**：我的那一行最大：简单难度「你跟上了 N% 的拍子」，中等、困难「得分 N」；我拿到的奖；我最长连着踩准几拍。没点手机的人一句话：下一首每一拍点一下就能上榜。主人：再跳一遍、换一支舞。
6. **两种语言**：每个字都有中文和英文（`tr` 或 `words.ts`），中途切换语言马上变。
7. **点击区域**：能点的东西至少 44 px，挨在一起的至少 48 px（DESIGN.md）。页面能放大。

## 不碰

- 计时和判拍子：`join.ts` 里的 `track()`、`tapMove()`、`judgeBeats()`、`frame()` 里的闪光和判定、对时（`sync`、`burst`、`speakerNow`）、`partyDebug` 的名字和返回值（两个检查脚本要用）。大按钮的 `pointerdown` 必须还调 `tapMove()`（不能改成 click：click 要等手指抬起，晚了）。版式和画 DOM 的函数可以重写，这些照搬。
- `src/client/screen.ts`、`synth.ts`、`common.ts`、`src/shared/`、`src/server/`、`games/party-base/`、`games/dance/`、`wrangler.jsonc`、secrets。

## 验收

- `npm run typecheck`、`npm test`、`npm run build` 过。
- 本地 Worker 跑着，`node scripts/song-check.cjs` 和 `node scripts/timing-check.cjs` 都打印 OK（song-check 按 `.dance-pad` 找大按钮、按字找主人的按钮：要改名字的话，同一个 PR 里改 song-check，并说明）。
- PR 里贴截图，iPhone 13（390×844）和一台小安卓（360×740）各一套：加入、大厅（主人、别人）、热身、跟一遍（踩准了）、跳（动起来）、结算（拿奖的、没点手机的）；中文英文各一张跳舞时的。
- 对比度：字对底色至少 4.5:1，按钮上的字也是。

# 任务卡 C3 · 音箱端画面（一起跳）

> **先别发（2026-11-05 晚上）**：电视现在有 3D 老师、每人一个小人、YouTube 放歌、歌曲对拍（PR #266、#272 和热歌的 PR）。这张卡要按新页面重写，由「游戏 · 一起跳」对话来写。

**负责**：Codex　**审查**：Claude Code（「游戏 · 一起跳」对话）　**分支**：`codex/dance-c3-speaker-screen`

## 目标

把 changle.ca/party/screen 从「能用」做成电视上好看、3 米外看得清的画面。这一页在 Mac 或 iPad 上打开，AirPlay 镜像到电视，一屋子人边看边跳。

时间和声音都已经做好、测好了：什么时候放哪一拍、房间说了什么，页面都拿得到。这张卡只做画面：大厅、校准、跳舞时的教练区、结算。

## 先读

- `games/party-server/README.md`（一支舞怎么走：热身、教学、倒数、跳、收尾）
- `games/party-server/src/client/screen.ts`（现在的页面：数据从哪来，哪些函数管计时）
- `games/party-server/src/shared/show.ts`（`RunBeat`、`spotAt`、`nextChange`、`PREVIEW_BEATS`）
- `games/party-server/src/shared/protocol.ts`（`Floor`、`Results`）和 `src/client/words.ts`（两种语言的字）
- `docs/DESIGN.md`（颜色、字号、间距、动效、对比度）
- `games/hide-crowd/scripts/build.mjs`、`games/hide-crowd/src/client/tokens.css`、`games/hide-crowd/tests/design.test.ts`：另一个独立 Worker 的游戏怎么用主站的 tokens，照这个做
- `docs/dance-along.md` 的「老手会多做的事」第 5、6、7 条

先把本地跑起来看一遍现在的样子：`npm ci`、`npm run build`、`npx wrangler dev --var ALLOW_TEST_SETTINGS:1`，再 `node scripts/song-check.cjs`（它在 Chromium 里开一个音箱端和三台手机，把一支短舞从头跳到结算）。

## 要做的

1. **用主站的 tokens。** 把 `site/src/styles/tokens.css` 原样复制成 `games/party-server/src/client/tokens.css`；`scripts/build.mjs` 把 tokens.css 和 party.css 拼成一个 `party.css` 输出（照 hide-crowd 的 build.mjs）。`party.css` 里的颜色、字号、间距、圆角、阴影、时长都换成 `var(--…)` 的语义名；一起跳自己的灯光色（gel `#8f7bff`，和 `site/src/games/registry.ts` 里 `SOON` 的 dance 条目一致）和烟花用的几种颜色，写在 `party.css` 开头一块里（DESIGN.md 说的游戏道具色例外）。加 `tests/design.test.ts`，照 hide-crowd 的四条：tokens 和主站一字不差、gel 和 registry 一致、开头那块以外不写颜色、字号和时长都用 token。
2. **把音箱端的样式搬进 `src/client/screen.css`**（`screen.html` 引用它，`build.mjs` 照样输出）。`party.css` 只留两页共用的（底色、按钮、顶栏）。手机的样式是 C4 的，不动。
3. **大厅**：房间码和二维码最大（3 米外能扫）；下面是加入的人，名字大，点「我在」时亮一下；一句安全提示（开始前每个人身边留出一臂的空间）；校准过就显示电视比这台设备晚多少毫秒。
4. **跳舞时**（1920×1080 和 1280×720 都一屏放下，不滚动）：
   - 教练区占屏幕高度的三分之二（方案第 7 条）。3D 教练（A4）还没有，现在这块是字：阶段（热身、看一遍、跟一遍、准备、跳、收尾）、动作名（当前语言大字，另一种语言小一号，`moveName` / `moveOther`）、能不能坐着跳（`bodyHint`）、8 拍大字。留好位置：以后教练放进来，字退到旁边。
   - 「接下来」：下一个动作提前 2 拍出现（`PREVIEW_BEATS`，现在的 `frameCoach` 已经算好），要醒目。
   - 全场连击条：`Floor.streak` 对 `COMBO_FULL`（32 拍）的比例；`Floor.bursts` 变大的那一刻放烟花（现在是整页底色闪几下）。
   - 每个人名字下面一根能量条（`Floor.levels`，最近 8 拍踩准的比例），踩得好的亮起来。
   - 舞的进度（几分几秒 / 总长）和这支舞的名字、难度，放在不抢眼的地方。
   - 房间码和二维码缩小留在角落，晚来的人还能扫。
5. **结算**：简单难度只发奖不排名：最稳、最嗨、最努力三张卡（`awardName`、`awardWhy`），名字最大；中等、困难再加一张分数榜（`participation` 从高到低）。下面一行：全场一起动了多少、最长连击、放了几次烟花。没人点手机时一句话说清楚。
6. **动效**：拍子数字换的时候轻轻一跳；烟花；减少动效（`prefers-reduced-motion`）时什么都不动、不闪。任何闪烁每秒不超过 3 次（方案第 6 条）。时长和缓动用 tokens 里的 `--dur-*`、`--ease-*`。
7. **两种语言**：玩家看到的每个字都有中文和英文，用 `tr(中, 英)` 或 `words.ts`；新的字加进 `words.ts`。顶栏的「EN / 中文」切换照旧。

## 不碰

- 计时和声音：`screen.ts` 里的 `plan()`、`schedule()`、`danceGrid()`、校准（`startCalibration`、`finishCalibration`、`stopCalibration`）、对时（`sync`、`clock` 消息）、`partyDebug` 的名字和返回值（两个检查脚本要用）。版式和画 DOM 的函数可以重写，这些照搬。
- `src/client/synth.ts`、`src/client/common.ts`、`src/shared/`、`src/server/`、`games/party-base/`、`games/dance/`、`wrangler.jsonc`、secrets。
- 手机页面 `join.ts`、`join.html` 和手机的样式（C4）。

## 验收

- `npm run typecheck`、`npm test`（包括新的 `design.test.ts`）、`npm run build` 过。
- 本地 Worker 跑着，`node scripts/song-check.cjs` 和 `node scripts/timing-check.cjs` 都打印 OK。
- PR 里贴截图，1920×1080 和 1280×720 各一套：大厅（有人）、热身、看一遍、跟一遍（出现「接下来」时）、跳（连击条和能量条都有）、结算（简单一张、中等一张）；跳舞时中文英文各一张。可以加一个只在本地跑的 `scripts/screen-shots.cjs`，跟着 song-check 的流程在各阶段截图。
- 3 米可读（方案的验收）：把 1920×1080 的跳舞截图缩到 25% 宽，还能读出动作名、拍数和「接下来」。
- 对比度：正文和大字对底色至少 4.5:1（DESIGN.md「对比度」）。

## 顺序

C3 先做；C4（手机画面）等 C3 合并以后再开，它用 C3 接进来的 tokens。

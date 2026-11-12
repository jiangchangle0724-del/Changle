# 任务卡 ho-C4 · 物理回归、帧时间与大厅流程测试

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/ho-c4-tests`　**前提**：A1、A2、A3、C1 都已合并（11-05 起都在 main 上）

## 先读

- `games/hang-on/src/physics/*.test.ts`（现在的 20 条手感检查、5 条附加、A3 玩法 10 条）和 `games/hang-on/proto/sim.test.mjs`（20 条的原版写法）
- `docs/physics-notes.md`（A1 的参数，A3 的饼干、蜡烛、背叛、召唤规则）
- `games/hang-on/CONTRACTS.md` 的手感契约和性能契约
- `games/hang-on/scripts/link-check.mjs`：怎么起主机页和手柄页、怎么找 Playwright、主机页的 `window.hangOn` 和手柄页的 `window.hangOnPad` 两个测试入口、怎么掐线

## 任务

1. **物理回归**：补边界测试，每条一个用例：抓的同时被队友拉；两人互抓；四人成链挂在绳上；绳子被两人同时荡；贴墙按住抓键连按 10 次不卡进墙；`deathY` 之上 1 px 不死、之下 1 px 死；检查点复活不和队友重叠。A3 的规则也补上：抓着的饼干消失那一帧手松开；蜡烛 `power` 1 约弹 250 px（误差 20% 以内），`power` 2 弹得更高；蜡烛侧面能抓；松手后 `betrayalWindow`（2.5 秒）内队友摔死算背叛，过了不算；召唤把掉队的人拉到叫的人身边。
2. **覆盖率**：可以加 `@vitest/coverage-v8` 做开发依赖（版本和现在的 vitest 对齐），`npm run test:coverage` 出报告；`src/physics/` 行覆盖率 ≥ 80%。
3. **帧时间 `npm run perf`**：用 Playwright 打开开发页 `play.html?level=<id>&players=4`（`npm run play` 起的那个，和主机页同一套 Pixi 画面；页面上的 `window.hangOn` 有 `sim` 和 `stage`），12 关逐关跑回放：在脚本里把 `levels/replays/<id>.json` 的输入喂给 sim（例如在外面包一层 `hangOn.sim.step`，每步先 `setInput` 再走），不改页面代码。记录每帧时间（页面主循环里模拟加画一帧那一段），输出每关的 p50 / p95 / 最差帧和一张直方图 PNG（存系统临时目录，不进仓库）。`--cpu-throttle 4` 用 CDP 降频模拟 2019 MacBook Air。在你机器上用有显卡的 Chrome（非 headless）跑一次，结果写进 PR。不接 CI（CI 的机器没显卡，数字没意义）。
4. **大厅流程 `npm run lobby-check`**（新脚本，写法照 `link-check.mjs`，对着本地 `npm run dev`）：一台主机页加两个手柄页。手柄用房间码加入、填名字 → 主机页两张座位卡出现名字 → 在大厅点一次语言键（关卡名换语言）再点回来 → 点开始 → 倒数 → 玩：两个手柄用 `hangOnPad.set()` 发输入，确认主机上身体动了 → 一个手柄掐线 4 秒（照 link-check 的办法），5 秒内回来 → 用 `hangOn.sim.teleport()` 把两个人挪进终点 → 庆祝之后出结算页 → 点下一关 → 倒数开始，关卡名是第 2 关 → 点回大厅 → 回到大厅。每一次点击都用 Playwright 真点（`click()`，按钮被盖住会失败，不要用 evaluate 直接调函数），每一步截一张图存系统临时目录。接进 CI：在 `.github/workflows/hang-on.yml` 的 link job 里 `npm run link-check` 后面加一步 `npm run lobby-check`。

## 输出（只改这里）

`games/hang-on/src/**/*.test.ts`、`games/hang-on/scripts/perf.mjs`、`games/hang-on/scripts/lobby-check.mjs`、`games/hang-on/package.json` 和 `package-lock.json`（只加 `perf`、`lobby-check`、`test:coverage` 三个脚本和覆盖率依赖）、`.github/workflows/hang-on.yml`（只加 lobby-check 一步）。

不碰 `levels/**`、`docs/levels/**`、`scripts/run-levels.mjs`（另一张卡 C7 同时在改关）。

## 验收

- `npm test`、`npm run typecheck`、`npm run build`、`npm run ip-check`、`npm run levels` 全过；CI 两个 job 全绿
- `src/physics/` 行覆盖率 ≥ 80%，PR 里贴覆盖率表和 `perf` 的结果表
- `lobby-check` 本地连跑 3 次都过（贴输出），掐线那步 ≤ 5 秒
- 发现物理、网络或页面的 bug：**先写一条会失败的测试，用 `it.fails` 标出来，在 PR 里描述怎么复现，不要自己改 `src/` 里的非测试代码**，Claude Code 来修

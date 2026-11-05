# 任务卡 ho-C4 · 物理回归、帧时间与大厅流程测试

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/ho-c4-tests`　**前提**：A1 已合并；第 3 项等 A2 + A4

## 先读
`games/hang-on/proto/sim.test.mjs`（20 条检查的原版写法）、A1 的 `games/hang-on/src/physics/*`、`CONTRACTS.md` 的手感契约和性能契约。

## 任务
1. 物理回归：把 20 条检查整理成参数化测试，再补边界：抓的同时被队友拉、两人互抓、四人成链挂绳、绳子被两人同时荡、贴墙按住抓键连按 10 次不卡进墙、`deathY` 之上 1 px 不死之下 1 px 死、检查点复活不重叠队友。
2. 帧时间脚本 `npm run perf`：Playwright 无头跑 12 关回放，4 人 + 全部物件，记录每帧时间，输出 p50 / p95 / 最差帧和一张直方图 PNG；用 `--cpu-throttle 4` 模拟 2019 MacBook Air。
3. 大厅流程（Playwright，一台主机页 + 两个手柄页，本地信令）：扫码加入 → 名字 → 倒数 → 玩第 1 关 → 一个手柄断网 4 秒再连上 → 结算页 → 下一关。每步截图。
4. 法律线脚本 `npm run ip-check`：对 `docs/` 之外的全仓库 `grep -ri` 禁词表（三个词见 `docs/hang-on.md` 开头的法律线；脚本里的词表用 base64 存，免得脚本自己被抓），接进 CI。

## 输出（只改这里）
`games/hang-on/src/**/*.test.ts`、`games/hang-on/scripts/perf.mjs`、`games/hang-on/scripts/ip-check.mjs`、`site/tests/hang-on.spec.ts`。

## 验收
覆盖率 ≥ 80%；`perf` 在 4 倍降频下 p95 ≤ 20 ms；断网重连用例 ≤ 5 秒；如发现物理或网络 bug，**先写失败测试并在 PR 里描述，不要自己改物理和网络代码**，Claude Code 来修。

# 任务卡 ho-C1 · 12 关关卡 JSON 与回放脚本

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/ho-c1-levels`　**前提**：A1（Rapier 物理）已合并

## 先读
`docs/hang-on.md` 的「关卡与模式」「关卡契约」；`games/hang-on/CONTRACTS.md`；`games/hang-on/proto/physics.js` 里 `createLevel()` 的示例关（它就是关卡 JSON 的手写版）。

## 任务
1. 按方案里的关卡表做 12 关，`games/hang-on/levels/table-01.json … table-06.json`、`van-07.json … van-12.json`。每关只教一件事，第 6 关必须两人成链才过得去，第 10 关必须把队友丢过去。
2. 每关一个回放脚本 `games/hang-on/levels/replays/<id>.json`：4 个手柄逐帧的 `PadInput`，用 `npm run record`（A1 提供）录，或者手写关键帧再插值。
3. `npm run levels`：无头跑全部 12 关回放，输出每关用时、每人摔死次数、是否到达终点；写成表贴进 PR。
4. 每关一张 1280×720 的截图 `docs/levels/<id>.png`（Playwright 从 spawn 位置截全关）。
5. 尺寸和命名按契约；材质只用 `cloth | wood | ceramic | metal | noodle | ice`（第 11 关雨天用 `ice`）。

## 输出（只改这里）
`games/hang-on/levels/**`、`docs/levels/**`、`games/hang-on/scripts/run-levels.mjs`。

## 验收
12 关回放全部到终点；每关用时在 `par.seconds` 的 0.5 到 2 倍之间；每关摔死 ≤ `par.deathsPerPlayer × 4`；没有一个平台和另一个重叠；`npm run ip-check` 为零。不许改物理参数，关卡过不了就改关卡。

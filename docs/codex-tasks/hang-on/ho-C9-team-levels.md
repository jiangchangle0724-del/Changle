# 任务卡 ho-C9 · 大团队的大关（4 到 6 个人）

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/ho-c9-team-levels`　**前提**：A7（#413：最多 6 个人、开局前选玩法）已合并。C8（难关）可以同时在做：这张卡只动 `levels/team/`、`docs/levels/team/` 和验收器里大关那一段，不碰 C8 的文件。

## 为什么

Steve 要 4 到 6 个人一起配合的玩法。A7 让游戏最多 6 个人，大厅里有了「大团队」这个键：它只在有大关的时候出现，关卡从 `games/hang-on/levels/team/*.json` 读，规则和闯关一样（大家都到顶才算过，摔了回检查点），至少 4 个人才能开。这张卡做这些大关：一两个人过不去，要三四个人连成一串、一起压住跷跷板、把人一个个递上去。

## 先读

- `games/hang-on/CONTRACTS.md`「关卡契约」（字段、机关、`players` 按人数摆）和「玩法契约」
- `docs/physics-notes.md` 的 A6、A7 部分：第 5、6 个人站不住会自己往旁边挪，但大关要让 6 个人都有落脚
- `games/hang-on/scripts/run-levels.mjs`：难关的规则怎么写（`hardIds`、`layoutGroups`、`inspect` 里的证据、单人对照），大关照这个路子加
- `docs/levels/README.md` 和 `docs/levels/validation.md`：怎么做关、怎么录回放（这次照同一套做，只是 4、5、6 个人）
- 开发页 `npm run play` 后 `play.html?level=table-06&players=6` 看 6 个人怎么挤

## 任务

1. **6 个大关**：`team-01` … `team-03`（年夜饭桌，`"world": "table"`）和 `team-04` … `team-06`（温哥华，`"world": "van"`），放在 `games/hang-on/levels/team/`。名字中英文都要有，自己起，贴着各自的世界。`teaches` 从 `longchain`（三个人以上连成一串）、`counterweight`（几个人一起压住跷跷板或箱子）、`relay`（把人一个个递上去或者丢过去）、`combine`（前面几样连着来）里挑，每个世界最后一关是 `combine`。大厅里「这关教」的中英文已经在 `src/levels.ts` 里了。
2. **大小、出生点、终点、检查点**：和闯关一样（横着走的宽 2400 到 3600；高过一屏的是攀爬关，高 1400 到 2200、至少往上一屏；每屏一个检查点，按顺序；每段 15 到 60 秒；终点在最后），不过 **6 个人**都要有落脚：出生点 `spawn.x + 44 × 人` 和每个检查点 `cp.x + 30 × 人`（人 = 0 到 5）脚下 80 px 内都有不会塌的台子。
3. **一定要大家**：每关至少一处要 3 个人以上连成一串挂着才过得去，或者要 3 个人一起压住才翘得起来的跷跷板、推得动的箱子。回放里真的做到：3 个人以上的串挂着至少 0.25 秒（串：每个人都悬空，一个抓着一个，最上面那个抓着地形或绳子），或者跷跷板倾斜超过 0.05 时上面站着、抓着它的有 3 个人以上。录好的每个手柄单独跑都过不去。
4. **人越多缝越宽**：至少 3 关用 `players` 范围，让 5、6 个人时缝更宽、少一个抓点或者多一处要命的东西。
5. **回放**：每关 4、5、6 个人各一份：`levels/team/replays/<id>.p4.json`、`<id>.p5.json`、`<id>.p6.json`（这份就是那么多人，格式和闯关的回放一样：60 Hz，seq 从 0 递增，没有传送、初始速度、改物理、改复活）。每份都要到顶，用时在 `par.seconds` 的 0.5 到 2 倍之间，每个检查点都按顺序经过，摔死不超过 `deathsPerPlayer × 人数`。
6. **par**：`par.seconds` 60 到 240，`par.deathsPerPlayer` 1 到 6。要命的东西、动台、转杆可以用，不强求；用了的话和难关一样，每个不要命的机关回放里真用上。
7. **预算**：会动的东西 ≤ 40，平台 ≤ 60，要命的东西 ≤ 40（和闯关一样）。
8. **验收器**：在 `scripts/run-levels.mjs` 里加大关的规则：读 `levels/team/`（id 只认 `team-01` … `team-06`，可以分批交），上面第 2 到 7 条都要查；按人数分组的那套（`layoutGroups`）对大关从 4 到 6 个人算，每种摆法都要有回放；输出表加一段大关；最后一行带上 `N/6 team`。原来闯关和难关的规则一条都不许放松、不许改。
9. **截图和文档**：6 张全关截图到 `docs/levels/team/<id>.png`（1280 × 720，照 `--screenshots` 的办法，按 6 个人摆）；`docs/levels/team/README.md` 写每关的布局（名字、teaches、长 × 高、检查点、par、哪里要几个人、几个人时怎么变）和结果表。

## 输出（只改这里）

`games/hang-on/levels/team/**`、`docs/levels/team/**`、`games/hang-on/scripts/run-levels.mjs`（只加大关那一段）。

不改 `src/` 里任何文件，不改物理参数，不改 `package.json` 和锁文件，不碰 `games/hang-on/levels/*.json` 和 `levels/replays/`（C8 在做）。关过不了就改关，不改物理。

## 验收

- `npm test`、`npm run typecheck`、`npm run ip-check`（0 处）、`npm run levels` 全过，最后一行带 `6/6 team`，PR 里贴完整输出表
- 故意改坏三处（例如删掉一份 `.p6` 回放、把一个检查点挪到 6 个人站不下的地方、让回放里没有 3 个人的串），贴验收器报的错
- 名字中英文都有；docs/ 之外不出现原版的名字，布局、名字、画面都是自己的

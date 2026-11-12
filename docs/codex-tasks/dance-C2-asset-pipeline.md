# 任务卡 C2 · 动作片段流水线（一起跳）

> **暂时用不上（2026-11-05 晚上）**：3D 老师现在是代码写的动画（`games/party-server/src/client/coach/`），不用动捕片段。以后要换真人动捕或者 AI 生成的角色时再看这张卡。

**负责**：Codex　**审查**：Claude Code（「游戏 · 一起跳」对话）　**分支**：`codex/dance-c2-clips`

（11-05 重写。旧卡写着和打碟共用、要改 `moves.json` 的 `native_bpm`、文件放哪没写清，都改了。打碟有自己的卡 `docs/codex-tasks/dj/C2-asset-pipeline.md`。）

## 目标

一条命令把 20 个动作的动捕文件变成网页能用的 GLB 动作片段：每个正好 8 拍、首尾能接上，再出一份清单，写明每个片段量出来的速度。以后的 3D 教练（任务 A4）放这些片段，按每支舞的 BPM 调快调慢。

真人录像还没有。这张卡先用一个脚本做出来的假骨架把整条流水线做通、测好；录像转好以后，Claude Code 把文件放上来，再跑一次就行。

## 先读

- `docs/dance-along.md` 的「教练角色与动作库」
- `games/dance/data/moves.json`、`games/dance/data/types.ts`：20 个动作的 id；`clip` 字段就是片段的文件名
- `docs/codex-tasks/dj/C2-asset-pipeline.md`：打碟的同一类流水线。Mixamo 骨骼名、用 Hips 的起伏测速、测试用的假骨架，这些做法照搬

## 输入

- `games/dance/assets/mocap/<id>.fbx`（或 `.bvh`）：一个动作一个文件，文件名是 `moves.json` 里的 id。来源是会跳的朋友对着手机录的视频，用 Rokoko Video 或 DeepMotion 这类工具转成动画，导出时选 Mixamo 骨骼（骨骼名以 `mixamorig:` 开头）、30 fps、原地（In Place）。现在还没有，文件夹里只有说明。
- `games/dance/assets/fixtures/bounce-120.fbx`：假骨架，由下面的 `make-fixture.py` 生成，提交进仓库（很小）。

## 输出（只改这些路径）

- `games/dance/scripts/clips/`（新建）：
  - `fbx2glb.py`：Blender 命令行脚本，`blender -b --factory-startup -P fbx2glb.py -- in.fbx out.glb`。只留骨架和它的动画，骨骼名不改，按 30 fps 采样。
  - `build.mjs`：对每个输入：调 Blender 转成 GLB；量速度（Hips 骨的高度每拍下沉一次：对一段高度曲线做自相关找周期，BPM 按倍数折进 60–200，取离 `moves.json` 里这个动作的 `native_bpm` 最近的那个）；找一段正好 8 拍、首尾姿势最接近的区间裁出来；用 `@gltf-transform` 压缩（meshopt），写到 `games/dance/clips/<id>.glb`。每个动作打印一行：量出的 BPM、节拍的清晰度、首尾误差，清晰度低的方便人工看。
  - `make-fixture.py`：在 Blender 里做一个假骨架（骨骼 `mixamorig:Hips`、`mixamorig:Spine`、`mixamorig:LeftArm`、`mixamorig:RightArm`、`mixamorig:LeftFoot`、`mixamorig:RightFoot`），一段正好 120 BPM、8 拍（30 fps 下 4 秒）的动作，Hips 每拍下沉一次，存成上面的 `bounce-120.fbx`。
  - `check.mjs <文件夹>`：用 `@gltf-transform/core` 读每个 GLB，检查：每个 ≤ 1 MB；有且只有一段动画、没有网格；骨骼名都以 `mixamorig:` 开头；清单里的条目和文件夹里的文件一一对应。`build.mjs` 最后跑它。
  - `README.md`：Blender 版本（4.0 以上）、怎么装、怎么重跑、录像该怎么录（每个动作录 4 遍，取最稳的一遍转）。
- `games/dance/clips/manifest.json`：每条 `{ id, file, bytes, native_bpm, beats: 8, seconds, bpmFrom: "measured", loopErrorDeg }`，按 id 排序。
- `games/dance/clips/check.test.ts`：vitest，读已经提交的 `clips/`（没有就跳过）：清单格式对、每条 `seconds × native_bpm / 60` 等于 8（误差 ≤ 0.05 拍）、id 都在 `moves.json` 里。CI 不装 Blender，所以 `npm test` 只跑这个，不跑 Blender。
- `games/dance/package.json` 和 `package-lock.json`：加 `"clips": "node scripts/clips/build.mjs"`；`@gltf-transform/core`、`@gltf-transform/functions`、`meshoptimizer` 作 devDependencies，版本写死。
- `games/dance/tsconfig.json`：`include` 加上 `clips/**/*.ts`，让 `npm run typecheck` 也查新测试。
- `games/dance/assets/mocap/README.md`：一句话说明放什么文件、文件名怎么起。

## 规则

- 不改 `moves.json`。它的 `native_bpm` 是热身和收尾放的速度（`src/session-flow.ts` 在用），量出来的速度只写进清单。PR 里列一张表：量出来的和 `native_bpm` 差 2 BPM 以上的动作，改不改 `moves.json` 由 Claude Code 定。
- 每个片段正好 8 拍，首尾姿势差（所有骨骼旋转差里最大的那个）≤ 5°，播成循环看不出跳。
- 跑两次结果一模一样：文件里没有时间戳、随机 id。
- 输入文件夹里有、`moves.json` 里没有的文件（或反过来），停下并说清楚是哪个；`--fixture` 时只跑假骨架。

## 验收

- `npm run clips -- --fixture`：假骨架出来 `native_bpm` 120（±1）、8 拍、4.0 秒（±1 帧）、一段动画、没有网格、小于 100 KB，`check.mjs` 过。
- 有真动捕文件时：`npm run clips` 过 `check.mjs`；PR 贴清单和一张表（每个文件的大小、BPM、首尾误差）。
- `npm run typecheck`、`npm test` 过，PR 贴输出。

## 不碰

`games/dance/data/`、`games/dance/src/`、`games/party-base/`、`games/party-server/`、`.github/`、wrangler 配置、secrets。

## 之后（不在这张卡里）

- 教练角色（A4）：GPT Image 出设定图，Meshy 转 3D 并绑骨，骨骼名用 Mixamo 的，这些片段才能直接套上。
- 网页里放教练、按 BPM 调速（片段的 `native_bpm` 对每支舞的 `bpm`）、镜像：A4 和 C3。

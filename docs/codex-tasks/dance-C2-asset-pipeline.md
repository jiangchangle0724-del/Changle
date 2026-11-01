# 任务卡 C2 · 3D 资产流水线（一起跳 + 打碟共用）

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/party-c2-asset-pipeline`

## 目标
一条命令把动捕产物变成网页能用的 GLB，并产出资产清单。两个游戏都用它：一起跳用教练的 20 个 8 拍片段，打碟用 Mixamo 的舞者动作。

## 先读
- `docs/dance-along.md` 的「教练角色与动作库」
- `docs/dj-booth.md` 的「3D 舞者怎么来」
- `games/dance/data/moves.json`（C1 产出；clip 文件名以它为准）

## 输入
- `assets/mocap/*.fbx` 或 `*.bvh`：视频转动捕的产物（Rokoko Video / DeepMotion 导出）和 Mixamo 下载的 FBX
- `assets/mocap/manifest.in.json`：人工填的每个文件的 id、原生 BPM、用于哪个游戏、起止帧

## 输出（只改这些路径）
- `scripts/assets/convert.py`：Blender 命令行脚本（`blender -b -P convert.py -- <in> <out>`），导入 FBX/BVH，按起止帧裁成正好 8 拍，首尾对齐成可循环，导出 GLB
- `scripts/assets/build.mjs`：遍历 manifest，调 Blender，再用 `@gltf-transform/cli` 压缩（draco 或 meshopt，二选一并写明理由），输出到 `public/dancers/<id>.glb`
- `public/dancers/manifest.json`：每条 `{ id, file, bytes, native_bpm, beats, duration_s, game, loop: true }`
- `package.json` 加 `"assets": "node scripts/assets/build.mjs"`
- `scripts/assets/README.md`：Blender 版本、怎么装、怎么重跑

## 验收
- `npm run assets` 一键重跑，幂等
- 每个 GLB ≤ 4 MB（教练角色本体另算，≤ 8 MB）
- 清单里每个片段 `duration_s × native_bpm / 60` 等于 8（误差 ≤ 0.05 拍）
- 用 three.js 的示例页（`scripts/assets/preview.html`，可以手工打开）播任意片段，首尾衔接无跳帧
- PR 描述贴清单

## 不碰
游戏代码、party-base、wrangler 配置、secrets。

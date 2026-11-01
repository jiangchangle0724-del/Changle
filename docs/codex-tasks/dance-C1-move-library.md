# 任务卡 C1 · 动作库与舞蹈序列（一起跳）

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/dance-c1-move-library`

## 目标
建立「动作库，不是舞蹈库」：20 个 8 拍基础动作 + 6 套由动作拼成的舞，全部是数据文件，带 zod 校验和单测。

## 先读
- `docs/dance-along.md` 的「教练角色与动作库」「玩法」两节
- `games/party-base/src/types.ts`（Difficulty 的定义以它为准）

## 输出（只改这些路径）
- `games/dance/data/moves.json`
- `games/dance/data/routines.json`
- `games/dance/data/schema.ts`（zod schema + 类型导出）
- `games/dance/data/data.test.ts`

## moves.json 每条字段
```
id            "clap-2x"  小写短横线
name_zh       "拍手两下"
name_en       "Clap twice"
difficulty    "easy" | "medium" | "hard"
beats         8          固定 8
body          "arms" | "arms+steps" | "full"
seated_ok     boolean    简单动作必须 true
icon          "clap-2x.png"  C6 出图用这个名字
clip          "clap-2x.glb"  C2 产出用这个名字
template      number[8]  每拍期望的能量峰值 0..1，先按动作类型估：抬手 0.8、拍手 0.6、踏步 0.5、停顿 0
native_bpm    number     录制时的 BPM，C2 会填真实值
```
20 个动作里：简单 8 个（全部 seated_ok）、中等 7 个、困难 5 个。至少 4 个来自广场舞 / 科目三风格，名字直接用大家叫的名。

## routines.json 每条字段
```
id, name_zh, name_en, difficulty, bpm (简单 90–100，中等 110–120，困难 125–135)
style        "square" | "pop"
sections     [{ move: "<move id>", repeat: 1..4 }]   总拍数 = Σ repeat × 8
warmup       "<move id>"   收在 1 分钟热身里的慢动作
cooldown     "<move id>"
```
6 套：每个难度 2 套，其中一套 style = square（广场舞），一套 pop。

## 校验（写进 schema.ts 和测试）
- 每套舞引用的动作必须存在，且动作难度 ≤ 舞的难度。
- 简单舞只用 seated_ok 的动作。
- 总拍数 × (60 / bpm) 在 110 到 130 秒之间（2 分钟左右）。
- id 唯一；icon / clip 文件名和 id 一致。

## 验收
`npx vitest run games/dance/data` 全过；PR 描述贴测试输出和 20 个动作的中文名清单。

## 不碰
其他目录、wrangler 配置、secrets、party-base 的代码。

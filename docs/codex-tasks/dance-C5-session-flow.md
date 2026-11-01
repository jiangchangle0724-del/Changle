# 任务卡 C5 · 学、跳、结算的流程层（一起跳）

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/dance-c5-session-flow`

## 目标
在 `party-base` 的房间状态机之上，做一首歌内部的流程：学（70% 速度、每组看一遍跟一遍）→ 倒数 → 跳 → 结算；加练习模式和一键重来。纯函数 + 单测，不碰 UI、音频、网络。

## 先读
- `games/party-base/CONTRACTS.md`（时间规则、状态机）
- `games/party-base/src/beat-clock.ts`（`nextPhraseStart`、`beatTime`、`countInPhrase` 直接用，不要重写）
- `games/dance/data/routines.json`（C1 产出）

## 输出（只改这些路径）
- `games/dance/src/session-flow.ts`
- `games/dance/src/session-flow.test.ts`

## 要实现的函数
```ts
// 把一套舞展开成时间线：每一拍属于哪个动作、是看还是跟、是否热身/收尾
buildTimeline(routine, moves, opts: { mode: 'learn' | 'dance'; learnSpeed: 0.7 }): TimelineEntry[]

// 给音箱端的「接下来」预告栏：当前拍和提前 2 拍的下一个动作
upcoming(timeline, beat): { current: TimelineEntry; next: TimelineEntry | null; beatsUntilNext: number }

// 一键重来：从当前所在的 8 拍段开头重新开始，返回新的 routineStartAt（speaker time，含 4 拍倒数）
restartSection(map, nowSpeakerTime): { routineStartAt: number; fromBeat: number }

// 练习模式：同一段先「看」再「跟」，速度 70%，返回对应的 BeatMap（bpm × 0.7）
practiceMap(map, learnSpeed): BeatMap
```

## 规则
- 学的阶段每个动作：先 8 拍看（教练做，玩家不打分），再 8 拍跟（打分但不计入最终成绩）。
- 倒数固定 4 拍，倒数期间不打分。
- 热身和收尾各 1 分钟，用 routine 里指定的慢动作，不打分，不进连击。
- 动作切换只发生在 8 拍边界（用 `nextPhraseStart`）。

## 验收
- `npx vitest run games/dance/src` 全过，至少覆盖：时间线总拍数、看/跟交替、倒数不打分、重来对齐到段开头、练习模式 BPM。
- PR 描述贴测试输出。

## 不碰
UI 组件、音频、Durable Object、party-base 源码（有问题在 PR 里提，不要改）。

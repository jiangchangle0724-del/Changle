# party-base · 契约 / Contracts

共用底座，给「一起跳 · Dance Along」和「打碟 · DJ Booth」两个游戏用。全部是纯 TypeScript 函数，没有运行时依赖，不碰网络、音频、DOM。Durable Object、页面、Worker 都只是调用它。

Shared base for both party games. Pure functions only: no network, audio or DOM. The Durable Object, pages and Workers call into it.

## 时间 / Time

- 全房间只有一个时钟：音箱端的 `performance.now()`，叫 speaker time。
- 手机用 `estimateClockOffset()` 把自己的本地时间换算成 speaker time，之后所有时间戳都是 speaker time。
- `Date.now()` 永远不用于拍子计算（手机和 Mac 的墙上时钟可能差几秒）。
- Apple TV 镜像会让房间听到的声音比 speaker time 晚一两百毫秒。校准得到 `audioOffsetMs`，打分时用 `withAudioOffset(map, audioOffsetMs)` 得到「听到的拍子」网格。

## 模块 / Modules

| 文件 | 职责 | 谁调用 |
| --- | --- | --- |
| `types.ts` | 所有共享类型：RoomState、RoomEvent、BeatMap、MotionSample、分数 | 全部 |
| `beat-clock.ts` | 对时（NTP 式，取低 RTT 的中位数）、拍子网格、乐句边界、报拍数 | 手机端、音箱端、DJ 的脑子 |
| `calibration.ts` | 8 下节拍音加主人 8 次点击 → AirPlay 延迟 | 音箱端校准步骤 |
| `scoring.ts` | 能量峰值检测、按难度打分、团体连击 | 手机端（本地打分）、音箱端（连击条） |
| `room-state.ts` | 房间状态机 reducer：(state, event) → state，非法转换抛 RoomError | Durable Object 唯一调用方 |

## 房间状态机 / Room state machine

```
lobby ──START_CALIBRATION──▶ calibrating ──CALIBRATED / SKIP──▶ lobby
lobby ──START_LEARNING────▶ learning ──START_DANCING──▶ dancing ──FINISH──▶ results
results ──START_LEARNING / START_DANCING──▶ (再来一首)      results ──BACK_TO_LOBBY──▶ lobby
任何阶段 ──SPEAKER_DISCONNECTED──▶ lobby（没声音就没游戏）    主人 ──END_ROOM──▶ ended（终态）
```

规则：
- 第一个进房的人是主人；主人走了，最早进来的人接任。
- 只有主人能推进状态、踢人。主人不能踢自己。
- 没有音箱端不能开始任何东西。
- `START_DANCING.routineStartAt` 必须在未来（给倒数留时间）。
- 房间上限 15 人，单场 30 分钟上限由 DO 计时，`overSessionLimit()` 判断。

## 打分 / Scoring

- 输入是手机的运动能量序列（去重力后的加速度模值，约 60 Hz），已换算成 speaker time。
- `energyPeaks()` 找峰值：高于阈值、局部最大、和上一个峰值至少隔 120 ms。阈值 1.5 m/s² 是起点，用黄金集调。
- 每一拍：`moved` 用放宽窗口（难度窗口 ×2，最多 300 ms），`hit` 用严格窗口（简单 150，中等 100，困难 80）。
- 简单模式显示 `participation = movedRate`；中等 = 0.4 moved + 0.6 hit；困难 = hit。
- 永远不判断「动作对不对」，只判断「有没有跟上」。

## 测试 / Tests

`npm test`。40 个用例覆盖：对时抗抖动、拍子网格、乐句边界、校准成功 / 太少 / 太散 / 零延迟、完美舞者、晚 120 ms 的舞者、沙发土豆、半拍舞者、校准前后打分差异、团体连击、状态机全流程和全部守卫。

## 下一步接线 / Wiring (A1)

1. Durable Object `PartyRoom`：持久化 `RoomState`，每个 WebSocket 消息转成 `RoomEvent` 过 `reduce()`，广播新 state；对 `ping` 回 `{speakerAt}`（音箱端的时钟由音箱端上报）。
2. 音箱端页面：「开始」按钮启动 AudioContext 并开 Wake Lock；120 BPM 节拍音；校准步骤播 8 下 click 并记录 speaker time。
3. 手机端页面：加入、8 次 ping 做对时、按拍闪屏；DeviceMotion 在 A2 再接。

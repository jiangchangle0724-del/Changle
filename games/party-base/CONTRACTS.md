# party-base · 契约 / Contracts

一起跳 · Dance Along 的底座（打碟 · DJ Booth 原计划也用，后来做在主站里，`site/src/party/dj/`，没用它）。全部是纯 TypeScript 函数，没有运行时依赖，不碰网络、音频、DOM。Durable Object、页面、Worker 都只是调用它。

The base under 一起跳 · Dance Along (打碟 · DJ Booth was planned on it too, then built in the site instead). Pure functions only: no network, audio or DOM. The Durable Object, pages and Workers call into it.

## 时间 / Time

- 全房间只有一个时钟：音箱端页面的 `performance.timeOrigin + performance.now()`（音箱那台设备上从 1970 年起的毫秒数），叫 speaker time。不用 `performance.now()` 本身：音箱端页面一刷新它就从 0 重来，房间记着的时间（舞的第 0 拍、结束的时候）就全错了。这样页面里只增不减，刷新以后接着走。
- 手机用 `estimateClockOffset()` 把自己的本地时间（`performance.now()`）换算成 speaker time，之后所有时间戳都是 speaker time。
- 手机的 `Date.now()` 永远不用于拍子计算（手机和 Mac 的墙上时钟可能差几秒）。
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
lobby ──START_LEARNING────▶ learning ──START_DANCING / LEARNING_DONE──▶ dancing ──FINISH──▶ results
results ──START_LEARNING / START_DANCING──▶ (再来一首)      results ──BACK_TO_LOBBY──▶ lobby
learning / dancing / calibrating ──BACK_TO_LOBBY──▶ lobby（主人随时可以停）
任何阶段 ──SPEAKER_DISCONNECTED──▶ lobby（没声音就没游戏）    主人 ──END_ROOM──▶ ended（终态）
```

`learning` 是跳之前的全部：热身，学的时候还有教学（每个动作看一遍、跟一遍）。`dancing` 是倒数、整支舞和收尾。教学放完，房间自己发 `LEARNING_DONE`（不用主人），舞的第 0 拍放在时间线算好的地方，就算这个事件晚到一点也不挪。

跳歌的时候（YouTube 放的原版），视频开始得早一点晚一点、或者中途卡了，音箱端量出来第 0 拍实际在哪，房间发 `BEAT_MOVED` 把 `routineStartAt` 挪过去（只在 `dancing`，最多挪 1 分钟：视频晚开始或者卡住，不是重新开始）。已经跳过的拍子编号不变，只是之后的拍子换了时间。

规则：
- 第一个进房的人是主人；主人走了，最早进来的人接任。
- 只有主人能推进状态、踢人（`LEARNING_DONE`、`BEAT_MOVED`、`FINISH`、`CALIBRATED` 由房间和音箱端发）。主人不能踢自己。
- 暂停以后主人点继续：`RESUMED` 把 `routineStartAt` 往后挪暂停的那么久（多久都行，只能往后，只在 `dancing`）。已经跳过的拍子编号不变。暂停本身记在房间服务器那一层（`games/party-server` 的 `RoutineInfo.pausedAt`），状态机不管。
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

`npm test`。43 个用例覆盖：对时抗抖动、拍子网格、乐句边界、校准成功 / 太少 / 太散 / 零延迟、完美舞者、晚 120 ms 的舞者、沙发土豆、半拍舞者、校准前后打分差异、团体连击、状态机全流程和全部守卫（包括教学放完自己接着跳、跳到一半停下、歌的拍子挪位置）。

## 接线 / Wiring

`games/party-server` 用这个底座：Durable Object `PartyRoom` 存 `RoomState`，每个页面消息转成 `RoomEvent` 过 `reduce()`；音箱端页面出声、计时、校准；手机对时、按拍闪屏，按一个大按钮代替传感器（A2 换成 DeviceMotion），用 `WINDOW_MS` 的窗口判每一拍，把舞的每一拍发给房间；房间算全场连击和结算（`summarize`）。见 `games/party-server/README.md`。

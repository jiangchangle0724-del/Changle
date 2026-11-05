# 抓紧了 · Hang On

changle.ca 的合作攀爬游戏：两只长胳膊抓来荡去，几个人连成一串，摔死了还笑。方案在
`docs/hang-on.md`，契约在 `CONTRACTS.md`（所有人先读），A1 的物理说明在 `docs/physics-notes.md`。

## 现在有什么

| 路径 | 是什么 |
| --- | --- |
| `src/physics/` | Rapier2D 物理（A1）：`world.ts` 世界和玩家，`config.ts` 手感参数，`level.ts` 关卡类型和样例关，`replay.ts` 无头回放 |
| `src/physics/feel.test.ts` | 原型的 20 条手感检查，移植到 Rapier 版 |
| `src/physics/extras.test.ts` | 检查点、跷跷板和箱子、回放、步长 |
| `src/render/canvas.ts`、`src/dev/play.ts`、`play.html` | 开发用的 canvas 画面和键盘 / 鼠标 / 触屏输入 |
| `scripts/ip-check.mjs` | 法律线：docs/ 之外不出现原版的名字 |
| `proto/` | 最早的 Verlet 软体手感原型，零依赖，留作参照（`node proto/sim.test.mjs`） |

## 命令

```sh
npm ci
npm test            # 20 条手感检查 + 附加检查（vitest，node 里无头跑）
npm run typecheck
npm run play        # 开发页 http://localhost:5173/play.html，键盘玩
npm run record      # 同上，一进来就录输入，停止时下载回放 JSON
npm run ip-check    # 法律线，CI 里为零才合并
```

开发页：鼠标或 `W A S D` 指方向，`Q` 左手、`E` 右手按住抓；第二个人 `I J K L` 加 `U` `O`。
抓住东西之后，方向就是身体想去的地方：往上推翻上去，左右推是荡。控制台里 `hangOn.sim` 看状态，
`hangOn.CFG` 改参数。

## 用物理

```ts
import { createSim, sampleLevel } from './src/physics';

const sim = await createSim(sampleLevel(), 2);   // 初始化 wasm，搭关卡，放 2 个人在起点
sim.setInput(0, { ax: 1, ay: -0.3, gl: false, gr: true });   // 手柄输入（CONTRACTS 的 PadInput）
sim.step(1 / 60);                                 // 内部固定 120 Hz
sim.players[0].body;     // { x, y, vx, vy }
sim.players[0].arms[1];  // { hand, pts, grip }
sim.events;              // 本帧的 grab / release / death / respawn / checkpoint / win
```

关卡是 JSON（`Level` 类型，字段见 `CONTRACTS.md`「关卡契约」），`runReplay(level, replay)` 按录好的输入无头跑一关。

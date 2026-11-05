# 抓紧了 · Hang On

changle.ca 的合作攀爬游戏：两只长胳膊抓来荡去，几个人连成一串，摔死了还笑。方案在
`docs/hang-on.md`，契约在 `CONTRACTS.md`（所有人先读），A1 的物理说明在 `docs/physics-notes.md`。

## 现在有什么

| 路径 | 是什么 |
| --- | --- |
| `src/physics/` | Rapier2D 物理（A1）：`world.ts` 世界和玩家，`config.ts` 手感参数，`level.ts` 关卡类型和样例关，`replay.ts` 无头回放 |
| `src/physics/feel.test.ts` | 原型的 20 条手感检查，移植到 Rapier 版 |
| `src/physics/extras.test.ts` | 检查点、跷跷板和箱子、回放、步长 |
| `src/server/` | 房间服务（A2）：`worker.ts` 是 Cloudflare Worker 和 Durable Object `HangOnRoom`，`room.ts` 是房间逻辑（纯，有测试）。Cloudflare 只做三件事：发房间码、交换 WebRTC 信令、直连失败时中转输入 |
| `src/net/` | 链路（A2）：`protocol.ts` 房间和链路的消息，`host-link.ts` 主机这头（发 offer、不可靠无序的数据通道、每 250 ms 量往返、3 秒没通就绕路），`pad-link.ts` 手柄这头（答 offer、每帧发输入、断了自己回来），`latency.ts` 往返统计 |
| `index.html` + `src/host/` | 主机页：开房、房间码和二维码、座位、左上角延迟表、跑物理画画面、键盘也能加入 |
| `pad/index.html` + `src/pad/` | 手柄页（手机横着拿）：左半边按住拖动是浮动摇杆，右半边两个大键按住就是抓 |
| `play.html` + `src/dev/` + `src/render/` | 物理开发页：不联网，键盘 / 鼠标 / 触屏直接玩，能录回放 |
| `scripts/link-check.mjs` | 联机检查：一台主机页加两个手柄页对着本地房间服务跑一遍（直连、绕路、掐线 5 秒内回来） |
| `scripts/ip-check.mjs` | 法律线：docs/ 之外不出现原版的名字 |
| `proto/` | 最早的 Verlet 软体手感原型，零依赖，留作参照（`node proto/sim.test.mjs`） |

## 命令

```sh
npm ci
npm test            # 物理 20 条 + 附加 + 房间逻辑 + 往返统计（vitest，node 里无头跑）
npm run typecheck   # 页面和 Worker 各一套类型
npm run build       # 三个页面 → dist/hang-on
npm run dev         # 整套本地跑：http://<这台电脑的 IP>:8787/hang-on/，手机同一个 Wi-Fi 扫码进来
npm run link-check  # 先 npm run dev，再开一个终端跑它（需要 playwright 的 Chromium：npx playwright install chromium）
npm run play        # 只跑物理：http://localhost:5173/play.html
npm run record      # 同上，一进来就录输入，停止时下载回放 JSON
npm run ip-check    # 法律线，CI 里为零才合并
```

主机页：只在接电视的那台电脑上开。「键盘加入」后 WASD 指方向、Q E 抓，自己一个人也能试。
「绕路模式」是测试用的开关：不直连，全部经 Cloudflare 中转，看看备用路好不好用。
控制台里 `hangOn.sim`、`hangOn.peers()` 看状态；手柄页 `hangOnPad.link.simulateDrop()` 模拟关 Wi-Fi。

## 链路是怎么走的

```
手机手柄页 ──WebRTC 数据通道（unordered, maxRetransmits 0），同一 Wi-Fi 直连──▶ 主机页（唯一跑物理的地方）──HDMI──▶ 电视
     │                                                                        │
     └──────── 房间 WebSocket：进房、座位、信令、（直连没通时）输入中转 ────────┘
                                   Cloudflare Worker + Durable Object（一个房间一个）
```

- 手柄每次连上房间就对主机说 hello，主机发 offer，手柄答，ICE 候选边走边发。通道开了就是「直连」；
  3 秒没开就标成「绕路中」，输入照样经房间转过来（30 Hz），通道什么时候通了什么时候切回去。
- 主机每 250 ms ping 一次每个手柄（走通道，没通道就绕路），往返的中位数显示在左上角：60 以下绿，
  120 以下黄，再高红。每 250 ms 还给手柄发一个小包：颜色、两只手、摔死次数、往返、阶段、直连还是绕路。
- 手柄的 WebSocket 断了自己回来（0.4、0.8、1.6…最多 5 秒一试），回来再说 hello，主机重新发 offer。
  断着的时候主机把它的方向归零但手不松，角色原地挂着不死。
- 主机断开 30 秒房间作废；手柄断开座位留 2 分钟。

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

## 上线（还没连）

和一起跳（`games/party-server`）一个模式：自己的 Worker，连上 GitHub 之后合并 `main` 就部署。
在 Cloudflare 里新建 Workers Builds 连接，名字 `hang-on`（必须和 `wrangler.jsonc` 的 `name` 一样）：
根目录 `/games/hang-on`，构建命令 `npm run build`，部署命令 `npx wrangler deploy`，
监视路径 `games/hang-on/*`，预览分支的构建关掉（Durable Object 不在预览里）。没有密钥，没有数据库。
连好之后 `changle.ca/hang-on/`（主机）和 `changle.ca/hang-on/pad/`（手柄）就答话；网址以后要改只改 `wrangler.jsonc` 的 `routes` 和 `vite.config.ts` 的 `base`。

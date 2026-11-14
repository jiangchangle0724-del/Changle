# 抓紧了 · Hang On

changle.ca 的合作攀爬游戏：两只长胳膊抓来荡去，几个人连成一串，摔死了还笑。方案在
`docs/hang-on.md`，契约在 `CONTRACTS.md`（所有人先读），A1 的物理说明在 `docs/physics-notes.md`。

## 现在有什么

| 路径 | 是什么 |
| --- | --- |
| `src/physics/` | Rapier2D 物理（A1）：`world.ts` 世界和玩家，`config.ts` 手感参数，`level.ts` 关卡类型、样例关和机关样板关，`motion.ts` 会动的台子和转杆在第几秒在哪（物理和画面共用），`replay.ts` 无头回放 |
| `src/physics/feel.test.ts` | 原型的 20 条手感检查，移植到 Rapier 版 |
| `src/physics/extras.test.ts` | 检查点、跷跷板和箱子、回放、步长 |
| `src/physics/gameplay.test.ts` | A3 的玩法：饼干平台、弹簧蜡烛、背叛判定、召唤、落地事件 |
| `src/physics/hazards.test.ts` | A6 的机关：碰到就死的尖刺、烫、电，会动的台子，会转的杆子，按人数摆的关 |
| `src/physics/arenas.ts` | 坐不住（A7）的两个场地：转盘（桌上）、海湾浮台（温哥华），平台按 `until` 一块块塌 |
| `src/physics/modes.test.ts` | A7：6 个人每关都站得住、每个检查点都复活得了，比谁先（各跑各的、分两队）、坐不住、定时塌、手滑 |
| `src/physics/items.test.ts` | A9 的道具：速冻（冻住不掉、队友能站能抓、冷却）、拉面（要先抓着墙、垂下来能挂人、到点断）、荷叶（掉得慢、能横着飘），比谁先和坐不住里没有 |
| `src/items.ts`、`src/item-text.ts` | 道具（A9）有哪几样、小图标（物理和房间协议也用，什么都不 import）；名字和一句话说明（中英两套） |
| `src/goals.ts`、`src/goal-text.ts`、`src/host/progress.ts` | 每关小目标和红包（A9b）：三颗星（准时、少摔、红包拿齐）怎么算、给人看的话、这台主机上记下的星和红包；`src/goals.test.ts` 测它们 |
| `src/render/` | 画面（A3，Pixi 8；A8 加了 2.5D）：`stage.ts` 镜头（开局从终点扫回起点、过关推近）、图层、事件→动效、慢动作、落地影子；`backdrop.ts` 两个世界的视差背景（远景画虚化、灯的斜光）；`depth.ts` 台子的侧面，跟着镜头透视；`fore.ts` 近景虚化的光斑和热气；`terrain.ts` 平台按材质贴图、饼干、蜡烛、灯、旗；`dumpling.ts` 糯米团（明暗和高光、脸、帽子、眼镜、挤压拉伸、复活掉落）；`fx.ts` 粒子池（纸屑会翻面）；`framewatch.ts` 掉帧就少画（画多细三级：电脑全画，手机不画近景光斑和斜光，再掉帧台子不画侧面）；`art.ts` 色板和程序画的贴图 |
| `src/audio/sfx.ts` | 音效（A3）：全部 WebAudio 现场合成，没有音频文件；每个人的尖叫音高不同 |
| `src/look.ts` | 换装的选项（帽子、眼镜、眼睛、脸、袖子、嗓子）和中英名字，手柄页和主机共用 |
| `src/i18n.ts` | 中文 / English：`tr()`、`data-en`、语言键 |
| `src/levels.ts` | 关卡表：`levels/*.json`（C1 的 12 关，13 号往后是难关）按 id 末尾的号排，最后是彩蛋关「桌上杂技」；`levelsFor(玩法)` 给每种玩法自己的一串（大团队是 `levels/team/`，坐不住是场地） |
| `src/server/` | 房间服务（A2）：`worker.ts` 是 Cloudflare Worker 和 Durable Object `HangOnRoom`，`room.ts` 是房间逻辑（纯，有测试）。Cloudflare 只做三件事：发房间码、交换 WebRTC 信令、直连失败时中转输入 |
| `src/net/` | 链路（A2）：`protocol.ts` 房间和链路的消息，`host-link.ts` 主机这头（发 offer、不可靠无序的数据通道、每 250 ms 量往返、3 秒没通就绕路），`pad-link.ts` 手柄这头（答 offer、每帧发输入、断了自己回来），`latency.ts` 往返统计，`snap.ts` 手机局的画面快照（主机压、手机拼成 `RemoteSim`） |
| `index.html` + `src/host/` | 主机页：开房、房间码和二维码、选关、座位、左上角延迟表、跑物理画画面、横幅（「×× 松手了」）、结算页（摔死排行、背叛榜，画法在 `src/results.ts`）、声音开关，键盘也能加入。在手机上打开就是手机局（见下） |
| `pad/index.html` + `src/pad/` | 手柄页（手机横着拿）：左半边按住拖动是浮动摇杆，右半边两个大键按住就是抓（`controls.ts`，手机局的房主也用）；「样子」换装，「道具」选开局带哪样（A9：速冻、拉面、荷叶，抓键上面的道具键用）；队友摔死时亮「召唤队友」。电视局里手柄也是遥控：大厅里选玩法、选关、开始，结算时下一关、再来一次、回大厅，玩的时候顶上「回大厅」按两下，谁按都行，电视那边不用碰。「全屏」键：安卓、平板点了就全屏，iPhone 点了说怎么「添加到主屏幕」（`public/pad.webmanifest` 和图标，从主屏幕打开没有地址栏）。手机局里 `view.ts` 在手柄后面画画面 |
| `play.html` + `src/dev/` | 物理开发页：不联网，键盘 / 鼠标 / 触屏直接玩，画面和主机页同一套，能录回放 |
| `scripts/link-check.mjs` | 联机检查：一台主机页加两个手柄页对着本地房间服务跑一遍（直连、绕路、掐线 5 秒内回来） |
| `scripts/lobby-check.mjs` | 大厅检查：真点开始、切语言、到顶出结算、下一关、回大厅 |
| `scripts/phone-check.mjs` | 手机局检查：一部手机开房自己也玩，两部手机进来都有画面，倒数、到顶、结算、再来一次跟着走，直连 20 张一秒、绕路 10 张一秒，电视局的手柄不下载画面 |
| `scripts/run-levels.mjs` | 关卡验收（`npm run levels`）：每关的格式、大小、检查点、机关、回放都得过；难关和按人数摆的关另有规则（`CONTRACTS.md`「关卡契约」） |
| `scripts/probe.mjs` | 乱按探路（`npm run probe`）：每一段让 1 个人、2 个人乱按，看到不到得了下一个检查点；大关每关至少两段一两个人过不去（`CONTRACTS.md`「大关（C9）」） |
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
npm run lobby-check # 同上：大厅、结算、下一关
npm run phone-check # 同上：手机局（RENDER=1 房主也画画面，看截图用）
npm run play        # 只跑物理：http://localhost:5173/play.html（?level=table-03 选关，?players=6 放 6 个人量帧时间，?level=proto-02 / proto-03 是机关样板关，
                    #   ?mode=race（&teams=1 分两队）/ ?mode=last&level=arena-01 试玩法，?phone=1 照手机的画法画，
                    #   ?item=freeze / noodle / leaf 每人带一样道具，P1 按 F、P2 按 P 用）
npm run levels      # 关卡验收：每关的规则加回放（-- --screenshots 重拍 docs/levels/ 的截图）
npm run envelopes   # 红包：从四人回放里给每关挑 3 个藏红包的地方（回放或关卡改了以后重跑）
npm run probe       # 乱按探路：大关每关至少两段一两个人过不去（-- table-06 只报告一关，--quick 少按几次）
npm run record      # 同上，一进来就录输入，停止时下载回放 JSON
npm run ip-check    # 法律线，CI 里为零才合并
```

主机页：只在接电视的那台电脑上开。「键盘加入」后 WASD 指方向、Q E 抓、R 召唤、F 用道具，自己一个人也能试。
「绕路模式」是测试用的开关：不直连，全部经 Cloudflare 中转，看看备用路好不好用。`?render=0` 只跑物理不画画面（联机检查用）。
控制台里 `hangOn.sim`、`hangOn.peers()`、`hangOn.pickLevel(i)` 看状态和换关；手柄页 `hangOnPad.link.simulateDrop()` 模拟关 Wi-Fi。

## 玩法（A7）

大厅里开局前先选单人还是多人（没人点过就跟着人数走），多人再选玩法：一起闯关、大团队（4 到 6 个人的大关，C9 做好才出）、比谁先（各跑各的，或者甜队对咸队）、坐不住（摔了不复活，平台会塌，一个地方抓久了手会滑，最后挂着的赢）。闯关和比谁先最后选难度：简单（1 到 6 关和彩蛋关）、中等（7 到 12 关）、困难（13 号往后）。
最多 6 个人：电视局 6 个手柄，手机局房主加 5 部手机。规则在 `CONTRACTS.md`「玩法契约」；主机页 `?mode=race&teams=1`、`?mode=last`、`?side=solo&tier=2` 直接开到那里。

## 小目标和红包（A9b）

闯关和大团队每关三颗星：准时到顶、全队少摔、关里的 3 个红包都拿到。倒数时写着，玩的时候右上角数红包，结算页打星，大厅关名后面是拿到过的星、下面是一共攒了几个红包。记在开房的那台设备上（换一台从头来）。规则在 `CONTRACTS.md`「小目标和红包契约」。

## 手机局（没有电视、没有电脑）

在手机上打开 `changle.ca/hang-on`（或者 `?phone=1`）就是手机局：这部手机开房，房主自己也玩（摇杆和抓键压在画面上），
别的手机扫码进来，每部手机上都有画面。房主那部手机跑物理，每 50 ms（绕路 100 ms）给每部手机发一张快照，
别的手机不跑物理，只在两张快照之间匀着画；声音各放各的人。细节在 `CONTRACTS.md`「手机局契约」。
大厅里触屏设备有一个键在手机局和电视局之间换（比如平板想当电视用）。
手机或平板投屏到电视、用电视局（`?phone=0`）时：底下的键盘说明、「键盘加入」「绕路模式」不出，开局时也全屏、横过来、不让屏幕睡着。
屏幕矮（不到 600 高，比如横着的手机）时大厅和结算排紧（`body.short`，和手机局同一套样子），开始键不用滚就点得到（`npm run lobby-check` 查这一条）。

## 画面是怎么画的（A3）

Pixi 8，WebGL（没有就退到 canvas）。除了两张远景画，全部程序画：

- 屏幕空间：天空渐变 → 三层视差剪影（年夜饭桌：灯笼、碗、茶壶、蒸笼；温哥华：雪山、吊桥、楼群的灯、海边的树）→ 蒸汽 / 雨 → 世界 → 暗角。
- 世界空间：深渊的汤 → 平台（茶布、木头、瓷、钢、冰五种贴图，细木条画成筷子）→ 物件 → 绳子（面条）→ 拖尾 → 糯米团 → 粒子 → 汤面（人掉进去就被盖住）。
- 镜头跟着活着的人的中心走，人散开就缩到都能看见，关卡比画面窄就居中。
- 动效读 `docs/hang-on.md` 的「动效清单」：抓上冒星闪手套、沿速度拉伸、落地压扁、眼睛跟摇杆、拖尾、摔死慢 0.3 秒加抖镜头加闪一下、复活从天上掉、过关纸屑加一起跳、「×× 松手了」横幅。`prefers-reduced-motion` 下不抖不闪不拉伸、粒子减半。
- 换装：手柄页选帽子、眼镜、眼睛、脸（胡子、雀斑、创可贴）、袖子颜色、嗓子（摔下去怎么叫），经房间发给主机；大厅的座位卡画出每个人的样子。手套左蓝右橙不能换。
- 中英：主机右上角、手柄加入页各有一个语言键；默认跟主站的设置或手机语言。
- 远景画：`art/<世界>-far.webp` 有就用（现在两张都是 ChatGPT 生的，来源记在 `art/README.md`），铺满、压暗、跟镜头挪一小段，远、中两层剪影藏掉；删掉图就回到全程序画。

## 链路是怎么走的

手机局里同一条路反过来也走：主机把画面快照从同一条数据通道发回每部手机（没直连就经房间，100 ms 一张）。

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

## 上线

和一起跳（`games/party-server`）一个模式：自己的 Worker，合并 `main` 就部署。2026-11-04 连上 Cloudflare：
Workers Builds 名字 `hang-on`（和 `wrangler.jsonc` 的 `name` 一样），根目录 `/games/hang-on`，构建命令 `npm run build`，
部署命令 `npx wrangler deploy`，监视路径 `games/hang-on/*`，预览分支的构建关着（Durable Object 不在预览里），
API token「suibian build token」。没有密钥，没有数据库。
`changle.ca/hang-on/`（主机）和 `changle.ca/hang-on/pad/`（手柄）答话；网址以后要改只改 `wrangler.jsonc` 的 `routes` 和 `vite.config.ts` 的 `base`。
`BASE=https://changle.ca npm run link-check` 对着线上跑一遍联机检查（11-04 全过：直连往返约 20 ms，绕 Cloudflare 约 120 ms）。

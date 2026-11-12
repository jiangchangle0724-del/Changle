# 抓紧了 · Hang On 契约

所有人（Claude Code、Codex、以后的你自己）都按这份来。改契约先改这个文件，再改代码。

## 两条铁律

1. **主机是唯一的真相。** 物理只在主机页跑一份。手柄页只发输入、只显示自己的状态，永远不渲染世界、不预测、不插值。两边不一致的 bug 在这个架构下不存在，别为了「流畅」把物理搬到手机上。
2. **仓库里不出现原版的名字。** 代码、文案、资产文件名、提交信息、注释里都不能有原版游戏名、工作室名、发行商名（三个词见 `docs/hang-on.md` 开头的法律线，禁词表只放在那里）。机制可以一样，角色、关卡、美术、名字全部原创。CI 的 `npm run ip-check` 对 `docs/` 之外全仓库 grep，为零才能合并。

## 手感契约（原型已验证，Rapier 版必须对齐）

| 项 | 原型值 | 允许范围 |
| --- | --- | --- |
| 胳膊长 | 6 节 × 15 px = 90 px | 身高（直径 48）的 1.6 到 2.2 倍 |
| 重力 | 1700 px/s² | 看下落 1 个身高用时 0.17 秒左右 |
| 抓取判定 | 手半径 10 + 7 px 容差 | 按下 1 帧内必须抓上，没有「滑手」 |
| 挂着时的操作 | 摇杆 = 身体想去的方向 | 不可改。往上推翻上去，左右推是荡 |
| 系绳 | 身体到抓点 ≤ 胳膊长 + 肩宽 + 2 | rope joint，不可省 |
| 荡的助力 | swingBoost 1100 | 按节奏推 3 下荡幅 ≥ 60 px |
| 摩擦 | 地面 0.85、墙 0.97、随压力缩放 | 能抓着墙爬，不能粘在墙上 |
| 复活 | 掉出 deathY 后 1 秒回最近检查点 | 不可改成全队重来 |

来源：`proto/physics.js` 的 `CFG`，`proto/sim.test.mjs` 的 20 条检查。Rapier 版把这 20 条移植过去，**允许调阈值，不允许删检查**。

## 输入契约（手柄 → 主机）

每帧一条，不可靠无序通道（`ordered:false, maxRetransmits:0`），只发最新状态，主机丢弃比已收到更旧的 `seq`。

```ts
type PadInput = {
  seq: number;        // 单调递增
  t: number;          // 手机 performance.now()，用来算往返
  ax: number;         // 摇杆 x，-1..1
  ay: number;         // 摇杆 y，-1..1（上为负）
  gl: boolean;        // 左手抓
  gr: boolean;        // 右手抓
  act?: 'summon' | 'emote';   // 偶发动作，可省。手柄连发十几帧保证送到，主机 1 秒内同一个动作只算一次
};
```

`summon`（A3）：摔死还没复活的队友立刻从按键的人身上掉出来。

主机 → 手柄只发小包，每 250 ms 一条：`{ color, hands:[bool,bool], deaths, rttMs, phase, direct, teamDead }`。

## 样子契约（A3）

手柄选的样子 `Look = { hat, glasses, eyes, face, arms, voice }`（可选项和中英名字在 `src/look.ts`），连上房间时和改了之后
经房间发给主机（`LinkMsg { k: 'look', look }`，走可靠的 WebSocket，不走数据通道），主机用 `cleanLook()` 收拾。
手套颜色不能换：左蓝右橙是辨左右用的，袖子也不许用蓝和橙；馅儿色跟座位走。`voice` 是摔下去时的尖叫，`auto` 按座位分四个音高。

## 语言契约（A3）

玩家看到的字中英都有。页面里写死的字用 `data-en`（`data-en-label` / `data-en-ph` / `data-en-title`）标英文，代码里用
`tr('中文', 'English')`（`src/i18n.ts`）。语言先看 `?lang=`，再看自己记的，再跟主站设置，最后看手机语言；主机和手柄各自切。

## 房间契约

沿用 party-base 的房间与阶段机：`lobby → countdown → playing → results → ended`。结算页可以直接 `START` 回到 `countdown`（「下一关」「再来一次」不绕回大厅），`LOBBY` 从倒数、玩、结算都能回大厅。房间码 4 位、最多 4 个手柄 + 任意观众、主机断开 30 秒房间作废。信令走 Durable Object（和一起跳同一个），直连失败 3 秒后自动走中转并在主机屏幕角落提示。

## 关卡契约（Codex 做关时照这个）

```json
{
  "id": "table-03",
  "world": "table",
  "name": { "zh": "筷子桥", "en": "Chopstick Bridge" },
  "teaches": "swing",
  "spawn": { "x": 120, "y": 600 },
  "goal": { "x": 1560, "y": 60, "w": 160, "h": 140 },
  "checkpoints": [{ "x": 700, "y": 420 }],
  "rects": [{ "kind": "ground", "x": 0, "y": 640, "w": 400, "h": 200, "material": "cloth" }],
  "ropes": [{ "anchor": { "x": 720, "y": 120 }, "segments": 8, "segLen": 38 }],
  "seesaws": [], "crates": [], "fading": [], "springs": [],
  "deathY": 1040,
  "par": { "seconds": 90, "deathsPerPlayer": 2 },
  "replay": "replays/table-03.json"
}
```

`fading`（饼干平台）：`{ x, y, w, h, material?, on?, off?, phase? }`，在 `on` 秒、消失 `off` 秒（默认 3 / 2），`phase` 把这块的钟往后拨几秒；消失时抓着它的手一起松开。
`springs`（弹簧蜡烛）：`{ x, y, w, h, power? }`，身体落在顶上就弹，`power` 1 约弹 250 px（5 个身高）；侧面能抓。

每关必须附一个回放脚本（`replays/*.json`，每帧 4 人的 `PadInput`），`npm run levels` 用它无头跑通整关，用时在 `par.seconds` 的 0.5 到 2 倍之间才算合格。

## 性能契约

主机页：4 人 + 40 个物体，2019 MacBook Air 的 Chrome 上 p95 帧时间 ≤ 20 ms。手柄页：首包 ≤ 50 KB，扫码到可按 ≤ 1 秒，CPU 空闲 ≥ 70%。

## 不做的事（第一版）

对战模式、关卡编辑器、3D、账号系统、皮肤商店。

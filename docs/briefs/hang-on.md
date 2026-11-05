# 游戏 · 抓紧了（hang-on）

对话名「游戏 · 抓紧了」。网址 changle.ca/hang-on（已上线，还没上首页）。档案建于 2026-11-02，A1 做完时写；以后由这个对话维护。

## 它是什么

合作攀爬：每人一个糯米团身体加两条面条胳膊，两只手各自抓，没有跳跃，全靠抓、荡、松手飞。1 到 4 人，所有人到终点才算过关，摔死 1 秒复活在最近的检查点。手机当手柄（局域网 WebRTC 直连，失败走 Cloudflare 中转），电视当画面（Mac 或 iPad 接 HDMI）。机制可以和原版一样，角色、关卡、美术、名字必须原创；仓库里 docs/ 之外不出现原版的名字。

## 文件

- 全部在 `games/hang-on/`：`src/physics/` 物理，`src/server/` 房间（Worker + Durable Object），`src/net/` 链路，`index.html` + `src/host/` 主机页，`pad/` + `src/pad/` 手柄页，`play.html` + `src/dev/` + `src/render/` 物理开发页，`scripts/` 联机检查和法律线，`proto/` 最早的软体原型
- 契约：`games/hang-on/CONTRACTS.md`
- Codex 的任务卡：`docs/codex-tasks/hang-on/`
- CI：`.github/workflows/hang-on.yml`（checks 和 link 两个 job）
- 实测记录模板：`docs/field-notes/hang-on-link-test.md`

## 先读

- `docs/hang-on.md`（方案和任务表；在线版 https://claude.ai/artifact/2GighxfKjTt8S9okJqvQtN）
- `games/hang-on/CONTRACTS.md`
- `games/hang-on/README.md`（命令、链路怎么走、怎么连 Cloudflare）
- `docs/physics-notes.md`（A1：和原型的差别、为什么）

## 测试

- `games/hang-on`：`npm test`（物理 20 条 + 5 条附加、房间逻辑 12 条、往返统计 3 条）、`npm run typecheck`、`npm run build`、`npm run ip-check`
- 联机：`npm run dev` 起着，另一个终端 `npm run link-check`（主机页 + 两个手柄页，直连、绕路、掐线 5 秒内回来）；CI 的 link job 每次都跑
- 键盘玩物理：`npm run play`；录回放：`npm run record`

## 定过的事

- 名字 抓紧了 · Hang On；角色 糯米团（蓝橙手套）；第一个世界 年夜饭桌；第一版 12 关合作，不做对战和编辑器。
- 正式版物理用 Rapier2D compat 0.21，主机是唯一跑物理的地方，手柄只发输入。
- 挂着时摇杆指「身体想去哪」，不是「手指哪」；身体到抓点必须有系绳。
- 三道验收门：手感门（A1）、联机门（A2 + A4）、聚会门（上线前）。
- 投屏买一根 USB-C 转 HDMI 线，Apple TV 留给一起跳和打碟。
- 11-04：Steve 过了手感门，A1 合并（#137）；接着做 A2。
- 房间服务是抓紧了自己的 Worker（`hang-on`，changle.ca/hang-on），不改 games/party-server（那是一起跳的地盘）；房间码字母表和一起跳一样。
- 手柄默认操作：左半边浮动摇杆，右半边两个大键（左手、右手）；两摇杆模式放设置里（A4 / C5）。

## 现在

- A1 已合并（#137）：Rapier 物理、20 条检查全过、键盘可玩、physics-notes。不装东西就能玩的试玩页：https://claude.ai/artifact/U9shPyHZwd4Duft79KK194
- A2 已合并（#165），Worker `hang-on` 11-04 连上 Cloudflare 并部署：changle.ca/hang-on/ 是主机页，手机扫码进 changle.ca/hang-on/pad/。对着线上跑联机检查全过（直连往返约 20 ms，绕路约 120 ms）。
- C1（12 关关卡）11-04 已发给 Codex（Codex App，分支 codex/ho-c1-levels），等它开 PR，Claude Code 审。

## 还剩什么

- 联机门（A2 + A4）：Steve 真机实测，按 `docs/field-notes/hang-on-link-test.md` 填：HDMI 下按键到画面 ≤ 80 ms，关 Wi-Fi 再开 5 秒内回来，微信里是不是直连。浏览器级的「离线」模拟不会断 WebRTC，所以掐线那条只在真机上算数。
- 审 Codex 的 C1 PR；`ho-C4-tests.md` 的物理回归部分也可以发了。`fading` 和 `springs` 两种物件物理还没实现（当普通平台），C1 这次不用它们，补上之后关卡再改。
- A3 Pixi 渲染和动效、A4 手柄页打磨（震动已有；横屏锁、两摇杆设置、在线状态、首包 ≤ 50 KB 的验证）、A5 大厅、关卡流程、结算页、背叛榜。
- A2 的已知简化：玩的中途有座位被踢，玩家下标会整体前移（大厅里会重排）；观众（role=watch）只计数，没有页面；`PadInput.act` 只收不处理。都归 A5。
- 还没在首页登记（新游戏第一个 PR 要 `hidden: true` 登记，但 A1、A2 的指令都只做自己的事，先不碰 site/）。

## 交给别的对话

- 平台 · 首页与上线：首页登记一张藏着的卡（`hidden: true`），网址 changle.ca/hang-on。

## 最近的改动

- 2026-11-04 合并 #165（A2），Worker hang-on 连 Cloudflare 上线；C1 发给 Codex
- 2026-11-04 A2：房间 Worker + Durable Object、WebRTC 链路、主机页、手柄页、联机检查、CI link job
- 2026-11-04 合并 #137（A1）
- 2026-11-02 A1：Rapier2D 物理、20 条检查、开发页、physics-notes、CI、ip-check
- 2026-11-02 开工包：方案、契约、手感原型、Codex 任务卡

## 记录

- 2026-11-02 建档案；A1 做完。
- 2026-11-04 Steve 过手感门，合并 A1，做 A2；A2 合并上线，Cloudflare 和 Codex 都由 Claude 控制电脑操作。

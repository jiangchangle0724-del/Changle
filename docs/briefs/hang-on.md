# 游戏 · 抓紧了（hang-on）

对话名「游戏 · 抓紧了」。网址 changle.ca/hang-on（已上线，还没上首页）。档案建于 2026-11-02，A1 做完时写；以后由这个对话维护。

## 它是什么

合作攀爬：每人一个糯米团身体加两条面条胳膊，两只手各自抓，没有跳跃，全靠抓、荡、松手飞。1 到 4 人，所有人到终点才算过关，摔死 1 秒复活在最近的检查点。手机当手柄（局域网 WebRTC 直连，失败走 Cloudflare 中转），电视当画面（Mac 或 iPad 接 HDMI）。机制可以和原版一样，角色、关卡、美术、名字必须原创；仓库里 docs/ 之外不出现原版的名字。

## 文件

- 全部在 `games/hang-on/`：`src/physics/` 物理，`src/server/` 房间（Worker + Durable Object），`src/net/` 链路，`src/render/` Pixi 画面，`src/audio/` 合成音效，`src/look.ts` 换装选项，`src/levels.ts` 关卡表，`index.html` + `src/host/` 主机页，`pad/` + `src/pad/` 手柄页，`play.html` + `src/dev/` 物理开发页，`scripts/` 联机检查和法律线，`proto/` 最早的软体原型
- 契约：`games/hang-on/CONTRACTS.md`
- Codex 的任务卡：`docs/codex-tasks/hang-on/`
- CI：`.github/workflows/hang-on.yml`（checks 和 link 两个 job）
- 实测记录模板：`docs/field-notes/hang-on-link-test.md`

## 先读

- `docs/hang-on.md`（方案和任务表；在线版 https://claude.ai/artifact/2GighxfKjTt8S9okJqvQtN）
- `games/hang-on/CONTRACTS.md`
- `games/hang-on/README.md`（命令、链路怎么走、画面怎么画、怎么连 Cloudflare）
- `docs/physics-notes.md`（A1：和原型的差别、为什么；A3：饼干、蜡烛、背叛、召唤）

## 测试

- `games/hang-on`：`npm test`（物理 20 条 + 5 条附加 + A3 玩法 10 条、房间逻辑 12 条、往返统计 3 条）、`npm run typecheck`、`npm run build`、`npm run ip-check`
- 联机：`npm run dev` 起着，另一个终端 `npm run link-check`（主机页 + 两个手柄页，直连、绕路、掐线 5 秒内回来）；CI 的 link job 每次都跑
- 键盘玩物理：`npm run play`（`?level=table-03` 选关，`?players=4` 量帧时间）；录回放：`npm run record`
- 画面只能用眼睛验：开发页或主机页截图，对着 `docs/hang-on.md` 的动效清单一条条看

## 定过的事

- 名字 抓紧了 · Hang On；角色 糯米团（蓝橙手套）；第一个世界 年夜饭桌；第一版 12 关合作，不做对战和编辑器。
- 正式版物理用 Rapier2D compat 0.21，主机是唯一跑物理的地方，手柄只发输入。
- 挂着时摇杆指「身体想去哪」，不是「手指哪」；身体到抓点必须有系绳。
- 三道验收门：手感门（A1）、联机门（A2 + A4）、聚会门（上线前）。
- 投屏买一根 USB-C 转 HDMI 线，Apple TV 留给一起跳和打碟。
- 11-04：Steve 过了手感门，A1 合并（#137）；接着做 A2。
- 房间服务是抓紧了自己的 Worker（`hang-on`，changle.ca/hang-on），不改 games/party-server（那是一起跳的地盘）；房间码字母表和一起跳一样。
- 手柄默认操作：左半边浮动摇杆，右半边两个大键（左手、右手）；两摇杆模式放设置里（A4 / C5）。
- 11-05（A3）：美术全部程序画，仓库里不放图片；AI 生图只用在远景氛围图，而且这边的容器拉不到 Canva / ChatGPT 的图，先不用，以后 C2 做了放进 `public/` 换掉 `backdrop.ts` 最远一层就行。
- 换装只有帽子、眼镜、眼睛；手套左蓝右橙不能换（辨左右），馅儿色跟座位走。
- 过关先在电视上庆祝 2.6 秒（纸屑、一起跳、「到顶了！」横幅）再出结算页。
- 联机检查的主机页加 `?render=0`：CI 的机器没显卡，Pixi 软件渲染会把主机页拖到几百毫秒一帧，掐线重连那条就过不了。

## 现在

- A1 已合并（#137）：Rapier 物理、20 条检查全过、键盘可玩、physics-notes。不装东西就能玩的试玩页：https://claude.ai/artifact/U9shPyHZwd4Duft79KK194
- A2 已合并（#165），Worker `hang-on` 11-04 连上 Cloudflare 并部署：changle.ca/hang-on/ 是主机页，手机扫码进 changle.ca/hang-on/pad/。对着线上跑联机检查全过（直连往返约 20 ms，绕路约 120 ms）。
- C1（12 关关卡）Codex 已开 PR #172（codex/ho-c1-levels）：12 关 JSON、回放、`npm run levels`。没审完；它不用 fading / springs，合并后可以让它补一版把饼干和蜡烛放进关里。
- A3 做完（PR 待合并）：Pixi 8 画面（两个世界的视差背景、五种材质贴图、糯米团带脸帽子眼镜、动效清单 8 条全做、慢动作、横幅）、WebAudio 合成音效、饼干平台和弹簧蜡烛的物理、背叛榜、召唤、结算页排行、大厅选关、手柄页换装和召唤键、彩蛋关「桌上杂技」、手机双击不放大（#176 先单独出了）。A5 的大厅、关卡流程、结算页、背叛榜这次一并做了一版。

## 还剩什么

- 联机门（A2 + A4）：Steve 真机实测，按 `docs/field-notes/hang-on-link-test.md` 填：HDMI 下按键到画面 ≤ 80 ms，关 Wi-Fi 再开 5 秒内回来，微信里是不是直连。浏览器级的「离线」模拟不会断 WebRTC，所以掐线那条只在真机上算数。
- 审 Codex 的 C1 PR #172 再合并；合并后发一张小卡让它把饼干（`fading`）和蜡烛（`springs`）放进几关，并给关里补检查点（12 关现在都是 `checkpoints: []`，摔死回起点）。`ho-C4-tests.md` 的物理回归部分也可以发了。
- A3 的真机验收：Mac 接电视开主机页，`play.html?players=4` 看 ⏲ 的 p95 ≤ 20 ms；减弱动效模式看一眼。声音要点过一次页面才响（浏览器规矩）。
- 音乐（Lyria 循环曲，C3）没做；背景远景的画（C2）没做，现在是程序画的剪影。
- A4 手柄页剩下的：两摇杆设置、首包 ≤ 50 KB 的验证（现在 JS 约 15 KB，gzip 6 KB）。
- A2 的已知简化：玩的中途有座位被踢，玩家下标会整体前移（大厅里会重排）；观众（role=watch）只计数，没有页面。
- 温哥华世界的音效和年夜饭桌一套，只换了掉水的声音；以后可以分。
- 还没在首页登记（新游戏第一个 PR 要 `hidden: true` 登记，但 A1、A2 的指令都只做自己的事，先不碰 site/）。

## 交给别的对话

- 平台 · 首页与上线：首页登记一张藏着的卡（`hidden: true`），网址 changle.ca/hang-on。

## 最近的改动

- 2026-11-05 A3：Pixi 画面、音效、饼干和蜡烛、背叛榜、召唤、换装、选关、结算页、彩蛋关（PR 待合并）
- 2026-11-05 #176 手柄页连按两下不放大（待合并）
- 2026-11-04 合并 #165（A2），Worker hang-on 连 Cloudflare 上线；C1 发给 Codex
- 2026-11-04 A2：房间 Worker + Durable Object、WebRTC 链路、主机页、手柄页、联机检查、CI link job
- 2026-11-04 合并 #137（A1）
- 2026-11-02 A1：Rapier2D 物理、20 条检查、开发页、physics-notes、CI、ip-check
- 2026-11-02 开工包：方案、契约、手感原型、Codex 任务卡

## 记录

- 2026-11-02 建档案；A1 做完。
- 2026-11-04 Steve 过手感门，合并 A1，做 A2；A2 合并上线，Cloudflare 和 Codex 都由 Claude 控制电脑操作。
- 2026-11-05 Steve 要人物、动画、玩法、场景、特效、音效一起深度升级，并修手机双击放大；A3 一次做完。

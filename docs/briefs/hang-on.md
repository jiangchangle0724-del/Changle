# 游戏 · 抓紧了（hang-on）

对话名「游戏 · 抓紧了」。网址未定（还没上首页，还没部署）。档案建于 2026-11-02，A1 做完时写；以后由这个对话维护。

## 它是什么

合作攀爬：每人一个糯米团身体加两条面条胳膊，两只手各自抓，没有跳跃，全靠抓、荡、松手飞。1 到 4 人，所有人到终点才算过关，摔死 1 秒复活在最近的检查点。手机当手柄（局域网 WebRTC 直连），电视当画面（Mac 或 iPad 接 HDMI）。机制可以和原版一样，角色、关卡、美术、名字必须原创；仓库里 docs/ 之外不出现原版的名字。

## 文件

- 物理和开发页：`games/hang-on/`（`src/physics/` 物理，`src/render/`、`src/dev/`、`play.html` 开发页，`proto/` 最早的软体原型）
- 契约：`games/hang-on/CONTRACTS.md`
- Codex 的任务卡：`docs/codex-tasks/hang-on/`
- CI：`.github/workflows/hang-on.yml`

## 先读

- `docs/hang-on.md`（方案和任务表；在线版 https://claude.ai/artifact/2GighxfKjTt8S9okJqvQtN）
- `games/hang-on/CONTRACTS.md`
- `docs/physics-notes.md`（A1：和原型的差别、为什么）
- `games/hang-on/README.md`

## 测试

- `games/hang-on`：`npm test`（20 条手感检查 + 5 条附加）、`npm run typecheck`、`npm run ip-check`；CI `.github/workflows/hang-on.yml`
- 键盘玩：`npm run play`；录回放：`npm run record`

## 定过的事

- 名字 抓紧了 · Hang On；角色 糯米团（蓝橙手套）；第一个世界 年夜饭桌；第一版 12 关合作，不做对战和编辑器（方案「要你拍板的事」里的建议，Steve 11-02 选了开工到 A1）。
- 正式版物理用 Rapier2D compat 0.21，主机是唯一跑物理的地方，手柄只发输入。
- 挂着时摇杆指「身体想去哪」，不是「手指哪」；身体到抓点必须有系绳。
- 三道验收门：手感门（A1）、联机门（A2 + A4）、聚会门（上线前）。
- 投屏买一根 USB-C 转 HDMI 线，Apple TV 留给一起跳和打碟。

## 现在

- A1 在 PR #137（分支 `game/hang-on`）：Rapier 物理、20 条检查移植全过、开发页可玩、physics-notes。等 Steve 用键盘玩过手感门再合并。
- 不装任何东西也能玩的试玩页（A1 的开发页打包成一个文件）：https://claude.ai/artifact/U9shPyHZwd4Duft79KK194

## 还剩什么

- 手感门：Steve 自己玩 5 分钟，说得出比原型好在哪；过不了回头调 `config.ts`。
- A1 合并后发 Codex：`docs/codex-tasks/hang-on/ho-C1-levels.md`（12 关）和 `ho-C4-tests.md`（回归、帧时间）。C1 要做关前先补 `fading` 和 `springs` 两种物件（A1 先当普通平台）。
- A2 局域网链路、A3 Pixi 渲染、A4 手柄页、A5 大厅和结算（见方案任务表）。
- 还没在首页登记（规矩里新游戏第一个 PR 要 `hidden: true` 登记，但 A1 的指令是只做物理，先不碰 site/）。
- 网址没定。

## 交给别的对话

- 平台 · 首页与上线：等 A5 之前，在首页登记一张藏着的卡（`hidden: true`）和网址。

## 最近的改动

- 2026-11-02 A1：Rapier2D 物理、20 条检查、开发页、physics-notes、CI、ip-check
- 2026-11-02 开工包：方案、契约、手感原型、Codex 任务卡

## 记录

- 2026-11-02 建档案；A1 做完。

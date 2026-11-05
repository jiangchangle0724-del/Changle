# 抓紧了 · Hang On 开工包

> 2026-11-02 已开工：开工包入库、A1（Rapier 物理）做完，见 `docs/physics-notes.md` 和 `docs/briefs/hang-on.md`。下面是开工包原文。

解压到 `changle-ca` 仓库根目录，目录直接对上：

```
docs/hang-on.md                        方案（仓库版，和在线文档同内容）
docs/codex-tasks/hang-on/ho-C1-levels.md       Codex 任务卡：12 关关卡 JSON 与回放脚本
docs/codex-tasks/hang-on/ho-C2-art.md                         场景贴图、背景、LICENSES.md
docs/codex-tasks/hang-on/ho-C4-tests.md                       物理回归、帧时间、大厅流程测试
games/hang-on/CONTRACTS.md             契约：两条铁律、手感参数、输入格式、关卡 JSON、性能预算
games/hang-on/proto/physics.js         手感原型的物理（Verlet 软体，零依赖，node 里能跑）
games/hang-on/proto/sim.test.mjs       20 条手感检查
games/hang-on/proto/game.html          浏览器里能玩的原型（键盘 / 鼠标 / 触屏，可加第二人）
```

已验证（2026-11-02）：`node sim.test.mjs` 20 条全过；`game.html` 在桌面 Chrome 和 iPhone Safari 可玩。

## 怎么用

1. 解压，`git checkout -b game/hang-on`，提交。
2. `cd games/hang-on/proto && npm test`，再 `npm run play` 打开 http://localhost:5173/game.html 玩两分钟，感受「摇杆指身体去向」。
3. 把下面这段发给 Claude Code；它做完 A1 会停下来让你玩。
4. 你觉得手感过了，再把 `docs/codex-tasks/hang-on/ho-C1-levels.md` 全文发给 Codex。
5. 买一根 USB-C 转 HDMI 线，联机门要用。

## 给 Claude Code

```markdown
读 docs/hang-on.md 和 games/hang-on/CONTRACTS.md。浏览器里的手感原型在 games/hang-on/proto/，20 条检查在 sim.test.mjs，先跑一遍、玩一遍。本次只做 A1：
1. 用 @dimforge/rapier2d-compat 0.21 重写物理，身体结构按方案里的表；抓取用 revolute joint，身体到抓点加 rope joint 限距，挂着时摇杆指身体去向
2. 把 sim.test.mjs 的 20 条检查移植到新物理上，全过；允许调阈值，不允许删检查
3. 保留原型的 canvas 渲染和键盘输入，让我能在 localhost 用键盘玩
4. 写 docs/physics-notes.md：哪些参数和原型不同、为什么
做完停下给我玩。网络、Pixi、美术都不要碰。
```

## 给 Codex（第一张卡，A1 合并后发）

发 `docs/codex-tasks/hang-on/ho-C1-levels.md` 全文，开头加一句「按这张任务卡做，只改卡里列出的路径，每关必须附回放脚本并跑通，开 PR 前贴测试输出」。

## 法律线（再说一次）

机制可以一样：长胳膊、抓、荡、拉人成链。角色、关卡、美术、音乐、名字必须原创。`docs/` 之外不出现原版的游戏名、工作室名、发行商名，CI 里 `npm run ip-check` 为零才合并。

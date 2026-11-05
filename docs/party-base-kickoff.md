# party-base 开工包 · changle.ca

这个包解压到 `Changle` 仓库根目录，目录会直接对上：

```
docs/dj-booth.md                       打碟方案（文档第一个 tab 的导出）
docs/dance-along.md                    一起跳方案（第二个 tab 的导出）
docs/codex-tasks/dance-C1-*.md         给 Codex 的三张任务卡
docs/codex-tasks/dance-C2-*.md
docs/codex-tasks/dance-C5-*.md
games/party-base/                      共用底座的纯逻辑层：类型、对时、校准、打分、房间状态机
games/party-base/CONTRACTS.md          契约，两边 AI 开工前先读
```

已经做好并验证过的（2026-11-01）：

- `games/party-base` 通过 `tsc --noEmit`，`npm test` 40 个用例全过。
- 里面没有网络、音频、DOM，所以 Claude Code 接 Durable Object 和页面时只是调用，不用改它。
- 已定的决定都写在两个 md 里：Apple TV 做电视，音箱端页面跑在 Mac 或 iPad 上 AirPlay 镜像，每场开始做一次 10 秒校准；一起跳先于打碟。

## 怎么用

1. 解压到仓库根目录，`git checkout -b base/party-base`，提交。
2. 在 `games/party-base` 里 `npm install && npm test`，确认 40 个用例过。
3. 把下面这段发给 Claude Code。
4. Claude Code 做完第 4 步停下来后，把 `docs/codex-tasks/dance-C1-move-library.md` 发给 Codex。

## 给 Claude Code 的第一条指令

```markdown
读 games/party-base/CONTRACTS.md 和 docs/dance-along.md 的「分工与复用」。底座的纯逻辑层已经写好并通过 40 个测试，不要重写它，只接线。本次只做一起跳的 A1：

1. npx skills add cloudflare/skills@workers-best-practices，之后 Worker 都按它写
2. 在 games/party-base 之外建 games/party-server：一个 Worker 加 Durable Object `PartyRoom`，部署方式和 tools/suibian 一样（连 GitHub，合并 main 自动发布，路径 changle.ca/party）。每个 WebSocket 消息转成 party-base 的 RoomEvent，过 reduce() 后持久化并广播；收到 ping 回 { speakerAt }（speaker time 由音箱端每秒上报一次）
3. 音箱端页面 /party/screen：「开始」按钮启动 AudioContext 加 Wake Lock；120 BPM 节拍音用 OscillatorNode 合成，不要音频文件；显示房间码和二维码；校准步骤：播 8 下 click，把每下的 speaker time 记下来，主人点完后调 calibrateFromTaps()
4. 手机端页面 /party/join：加入房间、发 8 次 ping 做对时（estimateClockOffset）、按拍闪屏、一个「我在」按钮大屏能看到；校准阶段提供一个大按钮让主人跟着点
5. 用 iPhone Safari 和 Mac Safari（AirPlay 到 Apple TV）实测：对时偏差、校准得到的 audioOffsetMs、闪屏是否对拍，记进 docs/field-notes/2026-11-xx.md
第 5 步做完停下给我看。传感器打分（A2、A3）、教练、音乐都不要碰。
```

## 给 Codex 的第一张卡

直接发 `docs/codex-tasks/dance-C1-move-library.md` 的全文，开头加一句：

```markdown
按这张任务卡做，只改卡里列出的路径，开 PR 前跑测试并贴输出。
```

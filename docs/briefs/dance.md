# 游戏 · 一起跳（dance）

对话名「游戏 · 一起跳」。网址 changle.ca/party（首页「即将上线」里有卡片，还不能玩）。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

电视放歌当教练，大家手里拿着手机跟着跳，手机的传感器打分。一首歌分学、跳、结算三段；20 个 8 拍基础动作拼成 6 套舞。以后打碟也用同一个底座。

## 文件

- 房间和页面（Worker `party`）：`games/party-server/`
- 共用底座（纯逻辑：对时、校准、打分、房间状态机）：`games/party-base/`
- 动作库和学跳流程：`games/dance/`（`data/` 动作和舞，`src/session-flow.ts`）
- Codex 的任务卡：`docs/codex-tasks/dance-*.md`

## 先读

- `docs/dance-along.md`（方案和任务表）
- `games/party-base/CONTRACTS.md`
- `games/party-server/README.md`
- `docs/field-notes/2026-11-01.md`（对时实测）

## 测试

- `games/party-base`：`npm test`（40 个）；`games/party-server`：`npm run typecheck`、`npm test`、`npm run build`；`games/dance`：`npm test`；CI `.github/workflows/party.yml`
- 线上对时检查：`games/party-server/scripts/timing-check.cjs`

## 定过的事

- 电视用 Apple TV，音箱页在 Mac 或 iPad 上 AirPlay 镜像；每场开始做一次 10 秒校准。
- 一起跳先于打碟做。
- A1 对时在正式站实测过，Steve 11 月 1 日验收。
- 学的阶段每个不同的动作只教一次：先看 8 拍再跟 8 拍，速度 70%（#107）。
- 热身和收尾凑满整 8 拍，至少 1 分钟，音乐一直踩在拍子上（#107）。
- 动作名「八步摇」不改（Steve 11-02 确认）。
- 首页「即将上线」里先放一张一起跳卡片，点开是介绍，不能玩（Steve 11-02 同意）。卡片在 `site/src/games/registry.ts` 的 `SOON` 里；能玩了以后挪进 `GAMES`，删掉 `SOON` 里那条。

## 现在

- 已合并：A1 对时、C1 动作库（#95）、C5 学跳流程（#107），动作库有自己的 CI（#106）。

## 还剩什么

- C2 资产流水线：要先有人把 20 个动作录成视频（找会跳的朋友），转成动捕文件才能做。C2 卡说它要填 `native_bpm`，但它不许改 `moves.json`，发卡前要先改卡。
- 首页只有「即将上线」卡片；其余任务（传感器打分等）见 `docs/dance-along.md` 的任务表。
- 真机测试：11-01 只用模拟手机测过。真 iPhone 加 iPad 或 Mac 投到 Apple TV，听闪光是不是踩在拍子上，A2 之前要做（`docs/field-notes/2026-11-01.md`）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 fix(dance): teach each move once and complete warmup phrases
- 2026-11-01 feat(dance): add C5 session flow and practice timeline
- 2026-11-01 fix(dance): address move library review feedback
- 2026-11-01 feat(dance): add validated move library and six routines
- 2026-11-01 Preview builds are off for both new Workers
- 2026-11-01 What's On and 一起跳 are connected to Cloudflare

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-02 首页「即将上线」加了一起跳卡片；「八步摇」确认不改。

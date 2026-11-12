# 任务卡 ho-C7b · 复活不叠人以后，重录 5 关回放

**负责**：Codex　**审查**：Claude Code　**分支**：从 `claude/ho-respawn-spacing` 开 `codex/ho-c7b-replays`，PR 到 main　**前提**：C7（#327）、C4（#325）已合并

## 为什么

C4 测出来：死了在检查点复活，会和站在那的队友叠在一起（玩家之间不碰撞，叠上了就分不开）。Claude 在 `claude/ho-respawn-spacing` 上改了 `src/physics/world.ts` 的复活点（`respawnPoint` / `standable`），测试也在这个分支上：

- 照常的复活点不变：检查点 `cp.x + 第几个人 × 30`，没检查点时起点 `spawn.x + 第几个人 × 44`
- 只有照常的点离某个活着的队友不到 48 px（两个身体半径）时才挪：沿着同一高度，每 8 px 往右、往左轮流试，最远 ±200 px，找第一个「脚下 80 px 内有不会消失的平台（饼干、蜡烛不算）、身体不压进任何平台、离所有活着的队友都 ≥ 48 px」的位置；找不到就用站得住的位置里离队友最远的

table-02、table-04、table-05、van-09、van-11 这 5 份回放里有人正好在队友身上复活，复活点一挪，后面的输入就对不上了，`npm run levels` 走不通。另外 7 关不受影响。

## 先读

- `docs/levels/README.md`、`docs/levels/validation.md`（C7 怎么录、怎么验）
- `claude/ho-respawn-spacing` 分支上 `src/physics/world.ts` 的 `respawnPoint` 和 `standable`，`src/physics/gameplay.test.ts` 的「复活不叠人」三条测试

## 任务

1. 从 `claude/ho-respawn-spacing` 开 `codex/ho-c7b-replays`（这样 PR 里同时有 Claude 的修改和你的回放，一起审一起合）。
2. 用 C7 的办法重录这 5 关的回放，关卡布局不动。录的时候让复活的人避开队友，用新规则实际复活到的位置继续往下走。
3. 如果新用时让 par 比例跑出 0.5 到 2，或者摔死超出预算，可以只改这几关的 `par`；名字、teaches、布局、检查点都不许改。
4. `npm run levels` 12/12 全过，C7 的检查全保留（检查点段落 15 到 60 秒、每块饼干被抓过、每根蜡烛弹过、物体预算），更新 `docs/levels/validation.md` 的结果表。
5. 截图不用重拍（截的是出生时的样子，没变）。

## 输出（只改这里）

`games/hang-on/levels/replays/{table-02,table-04,table-05,van-09,van-11}.json`，必要时这 5 关 JSON 里的 `par`，`docs/levels/validation.md`。

不改 `src/`（物理、测试都不动）、`scripts/`、`package.json`、锁文件，也不改另外 7 份回放（要和 main 上逐字节一样）。某一关在新规则下怎么都录不通，就停下来在 PR 里写清楚卡在哪，不要改物理。

## 验收

- `npm test`（70 条全过，没有 `it.fails`）、`npm run typecheck`、`npm run ip-check`、`npm run levels` 全过，PR 里贴 `npm run levels` 的完整表
- 另外 7 份回放 `git diff main` 为空
- PR 到 main，不合并、不部署、不碰 Cloudflare

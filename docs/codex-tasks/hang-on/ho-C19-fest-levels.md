# 任务卡 ho-C19 · 四个节日关：圣诞、春节、万圣节、中秋

**负责**：Codex　**审查**：Claude Code　**分支**：先 `codex/ho-c19-fest-xmas`（只放圣诞关），再 `codex/ho-c19-fest-levels`（另外三关）　**前提**：节日关的机制（A27，#820）已合并，先把 main 合进分支。

## 为什么

Steve 11-25 看了对照原版找的 14 样，要「一步一步全部加进去」，第 12 样是「节日关」。机制做好了：节日那几天画面挂装饰，闯关、比谁先简单那一串最前面多一关这个节日的关，大厅一开就在这关上（`src/fest.ts`、`src/render/festive.ts`）。现在一关都还没有，只有装饰。这张卡做四关，一个节日一关。

**圣诞关最急**：12 月 1 日起就用得上。圣诞关单独先交一个 PR，越快越好；另外三关第二个 PR（春节 2027 年 1 月 30 日起用，万圣节 10 月 20 日，中秋 9 月 8 日）。

| 关 | 节日 | 世界 | 什么时候出现 | 可以这样做（不是非这样） |
| --- | --- | --- | --- | --- |
| `fest-xmas` | 圣诞 | `snow` | 12 月 1 日到元旦 | 坐缆椅上山送礼物：一串挂满彩灯的松树，推一个大雪球填沟，到山顶亮灯的小木屋 |
| `fest-cny` | 春节 | `kitchen` | 正月初一前 7 天到元宵 | 年夜饭：端着一托盘饺子，坐着蒸笼的汽一路往上，端上团圆桌 |
| `fest-halloween` | 万圣节 | `house` | 10 月 20 日到 31 日 | 鬼屋讨糖：黑屋子里提着灯笼走，找钥匙开一扇扇门 |
| `fest-midautumn` | 中秋 | `space` | 八月十五前 7 天到后 3 天 | 奔月：往上爬，失重舱里飘，一路爬到月亮上 |

## 先读

- `games/hang-on/CONTRACTS.md`「节日关契约」（规矩全在那），还有这个世界自己的那一节（「雪山」「后厨」「老宅」「太空站」）、「推大石头、卷屏」「新机关」「长关」
- 开发页 `npm run play` 后开：
  - `play.html?level=snow-31&players=2&fest=xmas`：看圣诞的装饰挂在雪山上什么样（`fest=cny`、`halloween`、`midautumn` 换着看）
  - 关做好放进 `levels/fest/` 以后 `play.html?level=fest-xmas&players=4&record=1` 录回放（节日关自己带装饰）
- 主机页 `index.html?fest=xmas`：大厅一开就在圣诞关上，翻到下一关有「🎄 去玩圣诞关」键
- `games/hang-on/scripts/run-levels.mjs`：`FESTS`、`validate` 里节日关那几行、`SCENES`。规矩都写好了，交之前跑一遍
- `docs/levels/README.md`、`docs/levels/validation.md`：怎么做关、怎么录回放（照同一套）

## 任务

1. **四关**：`games/hang-on/levels/fest/<id>.json`，编号和世界照表；`"fest"` 写这个节日（`xmas`、`cny`、`halloween`、`midautumn`），`"tier": 0`，`"replay": "replays/<id>.json"`。名字中英文自己起，要一看就是这个节日（比如「圣诞送礼 / Christmas Delivery」）。
2. **按那个世界的新场景的规矩**（验收器把节日关当那个场景的关查）：`teaches` 是那个场景的词（雪山 `lift`、`slip`，后厨 `steam`、`tray`，老宅 `key`、`dark`，太空站 `float`、`lever`，还有 `boulder`、`scroll`、`tide` 之类的新机关词），要用那个场景的机关（雪山缆椅或冰溜子，后厨蒸笼或托盘，老宅钥匙或黑屋子，太空站失重区或拉杆）。
3. **人人都玩得了**：节日那几天大家第一个玩的就是这关，长辈小孩也在。简单那一档，**没有要命的东西**（尖刺、烫、电、要命的动台转杆、涨潮、要命的摆锤都不要），摔下去回检查点就是最大的惩罚。不做长关：2 到 3 分钟正好（`par.seconds` 90 到 180），每段 15 到 60 秒。可以用推大石头（填沟、压踏板正合适），卷屏要用的话慢一点（`speed` ≤ 40）。
4. **有节日的味道**：路线和机关跟节日的故事对得上（缆椅送礼、端饺子上桌、提灯笼进鬼屋、往上奔月），终点放在故事的最后一站。画面上的装饰机制会自己挂，不用管；不改 `src/` 加新画法。
5. **回放**：每关一份 4 个人的 `levels/fest/replays/<id>.json`；按人数摆的关每种摆法一份（`.p<人数>.json`）；另要一份 1 个人的 `.p1.json`（单人也玩）。每份到顶，检查点按顺序，死的次数在预算里，机关都真用上。60 Hz，seq 从 0 递增，没有传送、初始速度、改物理、改复活。
6. **红包**：每关 3 个，`npm run envelopes -- fest-xmas` 从四人回放里挑（节日关也挑得到）。
7. **各是各的**：台子上沿按 40 px 一格比，和别的任何一关重合不超过 60%。不能拿现有的关改个名字。
8. **预算**：会动的东西 ≤ 40，平台 ≤ 60。
9. **截图和文档**：每关一张全关截图 `docs/levels/<id>.png`（1280 × 720，`npm run levels -- --screenshots`）；`docs/levels/README.md` 加一节「节日关（C19）」，每关写名字、节日、世界、teaches、长 × 高、路怎么走、故事、检查点、par、怎么过、结果表。

## 输出（只改这里）

`games/hang-on/levels/fest/<id>.json`、`games/hang-on/levels/fest/replays/<id>*`、`docs/levels/<id>.png`、`docs/levels/README.md` 里「节日关」那一节。验收器的规矩写好了，发现写错了先在 PR 里说，别自己放松。

不改 `src/` 里任何文件，不改物理参数，不改 `package.json` 和锁文件，不碰别的关和它们的回放。关过不了就改关，不改物理。

## 验收

- `npm test`、`npm run typecheck`、`npm run ip-check`（0 处）、`npm run levels` 全过，最后的 `fest:` 那一行第一个 PR 是 `C19 1/4`，第二个是 `C19 4/4`，PR 里贴完整输出表
- 故意改坏两处（一关放一根尖刺、一关 `tier` 写 1），贴验收器报的错
- 每关一张截图，再加一张主机页 `?fest=<节日>` 大厅的截图贴在 PR 里
- 名字中英文都有；docs/ 之外不出现原版的名字，布局、名字、画面都是自己的

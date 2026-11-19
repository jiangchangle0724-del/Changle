# 任务卡 ho-C15 · 按手酸重录中等、困难的回放

**负责**：Codex　**审查**：Claude Code　**分支**：`codex/ho-c15-stamina-replays`　**前提**：手酸（A11，`claude/ho-stamina` 那个 PR）已合并，先把 main 合进分支。

## 为什么

Steve 11-18 说游戏太简单，其中一条是「抓得太稳」，选了「只在中等和困难加手酸」。手酸 A11 已经做好：挂着会累，一只手比两只手累得快，身上挂着人更累，站着（或在失重区里飘着）回力气，力气用完两只手都滑脱、1 秒抓不了。

只有写了 `"stamina": true` 的关才开手酸（回放按手酸录过、验收按手酸跑过，免得有的关根本过不去）。11-18 第一批 22 关的现有回放开着手酸也都过，已经写上了。剩下 18 关的回放里有人挂得太久，开着手酸就过不去，要你按手酸重录，必要时给关加歇脚的地方。

## 先读

- `games/hang-on/CONTRACTS.md`「手酸（A11）」那一节：参数（中等两只手 18 秒、一只手 10 秒；困难 11 秒、6 秒；身上每挂一个人累得快 0.6 倍；站着中等 3 秒、困难 4 秒回满）、`slip` / `tired` 事件、`stamina: true` 的意思
- `games/hang-on/src/physics/stamina.test.ts`：手酸怎么算
- 开发页 `npm run play` 后开 `play.html?level=table-13&players=4&stamina=1`：`?stamina=1` 不管关写没写都按关的难度开手酸，头顶右上角的小圈是力气，手抖、圈变红就是快没力气了。`&record=1` 录回放
- `docs/levels/validation.md`、`docs/levels/README.md`：怎么录回放（照原来那一套）
- `games/hang-on/scripts/run-levels.mjs`：`staminaOn`、`staminaArgs`，最后的 `stamina: N/M` 那一行

## 任务

1. **这 18 关**：`table-13` … `table-18`、`van-19` … `van-24`、`kitchen-29`、`kitchen-30`、`snow-33` … `snow-36`。每关开着手酸（`?stamina=1`）重录**全部**回放：4 个人的 `levels/replays/<id>.json`，按人数摆的每种摆法的 `.p<人数>.json`，单人要玩的（中等的 `snow-33`、`snow-34`）的 `.p1.json`。录好以后在关的 JSON 里 `"id"` 下面加一行 `"stamina": true`。
2. **过不去就改关，不改手酸**：哪一段非得一口气挂很久（困难两只手 11 秒、一只手 6 秒都挂不完），就在那一段中间加能站的歇脚处（窄台子、台阶、能踩的箱子），或者把抓点挪近一点。改的地方越少越好；改完这关照样要过验收器的其他规矩（台子上沿和别的关重合不超过 60%、开头那屏不超过 85%、par、要命的东西在路上、预算、两段靠大家等等）。红包被挪动了就用 `npm run envelopes` 重新挑。
3. **回放要像真人玩**：有人累到滑脱可以（`tired`），但整份回放要按原来的规矩到顶、用时在 `par` 里、死的次数在预算里。不要靠一直站着不动攒力气拖时间。
4. **全部到齐以后把验收器那一行变成规矩**：`run-levels.mjs` 最后报 `stamina: N/M` 的地方，改成要求中等、困难的闯关关和多人关全都写了 `stamina: true`（`assert`，报错写清楚是哪一关），这一行之外别动验收器。
5. **文档**：`docs/levels/README.md` 每关下面补一句改了哪里（没改关只重录的写「只重录」），`docs/levels/validation.md` 补一节「按手酸重录」：每关每份回放里最长一口气挂了几秒、`tired` 几次。

## 输出（只改这里）

上面 18 关的 `games/hang-on/levels/<id>.json` 和 `games/hang-on/levels/replays/<id>*`、它们的截图 `docs/levels/<id>.png`（关改了才重截）、`docs/levels/README.md`、`docs/levels/validation.md`、`games/hang-on/scripts/run-levels.mjs` 里 `stamina: N/M` 那一处。

不改 `src/` 里任何文件，不改手酸和物理参数，不改 `package.json` 和锁文件，不碰别的关和它们的回放。

## 验收

- `npm test`、`npm run typecheck`、`npm run ip-check`（0 处）、`npm run levels` 全过，倒数第二行是 `stamina: 40/40 …`（或者改成 assert 以后的同样意思），PR 里贴完整输出表
- 故意改坏两处（把一关的 `"stamina": true` 删掉、把一份重录的回放换回原来那份），贴验收器报的错
- 改过的关前后各一张截图贴在 PR 里

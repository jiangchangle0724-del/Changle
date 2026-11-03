# 平台 · 全站设计（design）

对话名「平台 · 全站设计」。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

整个网站的样子：夜场灯光风格，颜色、字体、间距、圆角、阴影、动画都定成设计 token；12 个共用组件；UI 计划（docs/ui-plan.md）的分工和进度。

## 文件

- 设计 token 和全局样式：`site/src/styles/`（`tokens.css`、`global.css`）
- 共用组件和预览页：`site/src/ui/`（预览页 `site/ui-preview.html`）
- Codex 的 UI 任务卡：`docs/codex-tasks/ui-*.md`

## 先读

- `docs/DESIGN.md`（要走向的设计系统）
- `site/DESIGN.md`（现在线上的样子）
- `docs/ui-plan.md`（计划和分工）
- `docs/ui-inventory.md`（盘点）

## 测试

- `site/tests/tokens.test.ts`（token 和 global.css 一致，`src/ui` 只用 token）
- `site/scripts/ui_inventory.py`（盘点裸写的颜色、字号、阴影）
- `site/scripts/ui_preview_shots.py`（组件预览截图）

## 定过的事

- 只有夜间配色。
- 颜色、字号、间距、圆角、阴影、时长都从 `tokens.css` 取（`var(--…)`），不裸写。
- 每个游戏有自己的灯光颜色（gel），进了游戏房间亮这个颜色。首页的游戏卡按 5 类上色，分法 2026-11-02 Steve 定，写在 docs/DESIGN.md 类型色一节。
- Codex 的 Unspottable（PR #5）先放着（Steve 2026-11-02）。
- 中文行高、可以双指缩放、点击区至少 44px（UI 计划 C4，#93、#94）。

## 现在

- UI 计划已完成：A1 盘点、A2 token 和 DESIGN.md、A3 每页一个网址（#87）、C1 12 个组件（#90、#92）、C4 中文排版和触控（#93、#94）、C7 SEO、离线和分享图（#104）。
- A6 性能第一步（#117）：首页第一次下载的 JS gzip 166 → 145 KB，预算进 CI（`site/scripts/budget.ts`，JS 150、CSS 22，CSS 只剩 0.2 KB 余量）。
- A4 首页层级上线（#120）：今晚的人、现在玩这个、筛选、游戏卡用共用组件 Tile 按 5 类上色；分享图按类型重做。
- A5 统一游戏壳做好了，等 Steve 点头合并（分支 `claude/ui-a5-shell`）：16 个单机游戏换成共用顶栏 GameHeader（手机上声音和玩法在「⋯」里），壳里有玩家条和底部动作区；真心话大冒险、谁是卧底、国王游戏是样板。规则写在 docs/DESIGN.md「游戏壳」。
- Codex 交了 ui-C9（#126，设计规则写进 AGENTS.md），我审过，等合并。ui-C6（截图对比和 axe 进 CI）已经交给 Codex，还没交 PR。

## 还剩什么

- 审 Codex 的 ui-C6 PR（谁写的卡谁审）。
- A5 合并后写 C2 的卡：剩下 13 个单机游戏一个一个把按钮挪到底部动作区、用上玩家条（参照三个样板），每个游戏一个 PR。
- A5 余下的小项：惩罚盖章换成共用的 PenaltyCard（带声音）、结束页、加载骨架屏、「这局还在，回来继续？」。
- UI 计划还剩：A6 第二步（首页和弹层的动画换成 CSS，GSAP 只跟游戏下载，目标 gzip 约 110 KB）、C2 把游戏迁进 GameShell（A5 之后）、C3 /eat 换皮、C5 空状态和骨架屏、C8 一致性盘点。
- A4 余下的小项：工具页的卡片换成同一套样式、顶部光晕跟随滚动、游戏卡弹层里可展开的「怎么玩」、联机桌选游戏也换成共用 Tile。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-02 打碟 · DJ Booth: a night of the host's own songs (我的歌)
- 2026-11-02 打碟 · DJ Booth: the 点歌 box, the TV's request lines, the stand-in's songs kept in memory
- 2026-11-01 打碟 · DJ Booth: an 8-second countdown, and four club pads
- 2026-11-01 feat(games): a countdown under dares and king's commands that name a time (#108)
- 2026-11-01 fix(styles): C4 follow-up: no iPhone zoom on the price drop-downs; overrides back in their own files (#94)
- 2026-11-01 fix(ui): improve Chinese reading, zoom and touch accessibility (#93)

## 记录

- 2026-11-02 建档案。
- 2026-11-02 A6 第一步：Flip 挪进神回复，工具和心愿单页签按需下载，首页下载预算进 CI。
- 2026-11-02 Steve 定了 5 类分法；A4 首页上线；写了 ui-C6、ui-C9 两张卡，C9 交给 Codex；Unspottable（PR #5）先放着；随便的两件事交给随便对话。
- 2026-11-02 A5 统一游戏壳：共用顶栏、玩家条、底部动作区，三个样板游戏；审了 Codex 的 ui-C9（#126）。

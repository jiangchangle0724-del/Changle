# 工具 · 生活小工具（tools）

对话名「工具 · 生活小工具」。网址 changle.ca/tools。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

工具页签里的三个小工具：实时汇率（加元、人民币、美元、港元）、联动的世界时钟、单价换算（$/kg、$/lb、$/斤、$/oz、$/100g，容量 $/L、$/gal 等）。没有自己的 Worker：汇率从房间服务器的 `/api/fx` 取（Coinbase，每分钟一次，服务器 60 秒缓存），服务器连不上时浏览器直接问 open.er-api.com（每日汇率）。

## 文件

- 工具页：`site/src/tools/ToolsTab.tsx`（顶上四个按钮、三个工具的顺序）
- 汇率：`site/src/tools/Currency.tsx`、`fx.ts`（取汇率、缓存、超时）、`RateStatus.tsx`（连不上时的提示，Codex #223）
- 货币表和算术：`site/src/tools/money.ts`（不碰浏览器，测试直接导入）
- 世界时钟：`site/src/tools/WorldClock.tsx`、`tz.ts`（时区计算；BC 和 Alberta 永久夏令时的纠正表 `PERMANENT_TIME`）
- 单价换算：`site/src/tools/UnitPrice.tsx`
- 样式：`site/src/styles/tools.css`（随页签下载，不进首页预算）
- 服务器端的汇率：`site/worker/index.ts` 里的 `fx()`（房间服务器对话的地盘，只加自己那一行）

## 先读

- `HANDOFF.md` 的「A tool」
- `docs/DESIGN.md`（字号、颜色都用 token；工具卡片的灯光是 amber）

## 测试

- `site/tests/tools.test.ts`：输入清理和位数上限、汇率换算、字号分级、时区计算（夏令时切换日、城市时间换回时刻）、BC 和 Alberta 永久时间的纠正。CI 的 `site` 任务跑它（`.github/workflows/site.yml`）。
- 截图和 axe：`tools-zh`、`tools-en` 两张（`site/tests/visual/screens.spec.ts`），只拍第一屏（随便卡片和汇率的上半截），时间尺和单价不在图里。

## 定过的事

- 三个工具合在一个对话里，哪个变大了再拆出去。
- 汇率先问房间服务器，7 秒没回就问 open.er-api.com，再 8 秒没回才算失败；失败时缓存的汇率照常能用，上面显示「没连上」和「再试一次」（Codex #223 的提示，这次加的超时）。
- 大金额不截断：四行金额用同一个字号，最长的那个超过 9 个字符缩一级、超过 12 个再缩一级（`money.ts` 的 `sizeClass`）；320 到 360 宽的手机整体再小一级。汇率最多输 12 位数，单价最多 9 位。
- 温哥华和卡尔加里从 2026-11-01 起不再调回冬令时（BC 在 tz 数据库 2026b，Alberta 在 2026c）。手机的时区表要是还把冬天的温哥华算成 −8、卡尔加里算成 −7，时钟按 −7 和 −6 纠正；表已经对的手机不动。纠正只到 2030 年初，之后相信浏览器。
- 时间尺拖动和键盘最多前后 48 小时；在城市弹层里连点「后一天」可以走得更远，尺子跟着延伸，不再空白。指针放在刻度区里，不压住「现在」。
- 手机开了「减少动态效果」，顶上四个按钮直接跳到对应工具，不滑动。
- 斤按中国大陆的 500 克算，单价卡片下面写明了。

## 还剩什么

- 加货币：服务器的 `/api/fx` 已经在返回欧元、英镑、日元、澳元、新台币、韩元、新加坡元等，页面只用了 4 个。要加的话 `money.ts` 的 `CURRENCIES` 和 `UnitPrice.tsx` 的 `SYMBOL` 一起加，汇率卡片的行数会变多，得想想排版。
- 单价换算加「两个包装比哪个划算」。
- 世界时钟加西雅图（冬天和温哥华差一小时了，在列表里能看出来）。
- 320 宽的英文「Unit price」标题折成两行，一直如此，没改。
- 设计对话 A4 的小项「工具页的卡片换成同一套样式」还没做（设计对话的档案里）。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-11 Merge pull request #304: 工具 · 生活小工具, big amounts, BC/Alberta permanent time, rate timeout, the ruler, tests
- 2026-11-05 style(tools): migrate utility styles to design tokens (ui-C8) (#230)
- 2026-11-05 fix(tools): expose rate failures without dropping cached values (#223)
- 2026-11-04 fix(a11y): the accessibility exceptions on the home, game card, tools and roster chips, fixed (#169)
- 2026-11-01 Small fixes from the play-test: unit price, the wheel's editor, sign-in and profile forms
- 2026-10-29 site: 随便 · Whatever's Fine in the Tools tab, at /eat

## 记录

- 2026-11-02 建档案。
- 2026-11-04 盘点线上版（手机尺寸、中英文、320 到 430 宽）：大金额截断、BC/Alberta 时区风险、服务器卡住不换源、时间尺的三个小毛病、没有测试。时区计算另外核对了 50 多万次，没有算错的。
- 2026-11-11 #304 修掉 11-04 列的问题，加 `tests/tools.test.ts` 进 CI，更新 HANDOFF 里工具那一段（汇率其实走房间服务器）；CI 第一轮 tools-zh 截图差 450 像素（汇率小字对齐），改回居中后全绿，合并上线。Steve 用安卓微信看过，温哥华的时间对。

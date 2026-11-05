# 游戏 · 一本正经（straightface）

对话名「游戏 · 一本正经」。网址 changle.ca/g/straight-face（卡片，上首页后才有）、changle.ca/g/straight-face/play（游戏，现在就能开）。档案建于 2026-11-04。

## 它是什么

一本正经 · Straight Face：每轮一个裁判、一个冷门词。其他人里只有一个老实人看过真释义，剩下的人现编。大家轮流一本正经地解释，裁判追问、可以给一个人贴「疑点」，最后指认老实人。被指认的人得分，不管是不是老实人；指对了裁判也得分。裁判看走眼喝一口，被疑点抓包的喝一口，骗到裁判的人指定一个人喝。每人当一次裁判，分最高的赢，同分看谁骗到裁判的次数多。

同类游戏是 1965 年 BBC 的 Call My Bluff、桌游 Balderdash 和《瞎掰王 9UPPER》。玩法不受版权保护；名字、词库、美术全是我们自己的，一张卡都不许从别家抄。完整方案（为什么这样设计、老手会多做的事、验收门）在 `docs/straight-face.md`，更长的版本在 Claude 文档「一本正经 · Straight Face 游戏方案」。

3 到 9 人（4 到 9 人最好玩）。单机传一部手机；联机（每人一部、电视观察者）是 A3，还没做。

## 文件

- 规则引擎（纯函数，单机和联机共用；房间服务器以后从这里打包）：`site/src/shared/straightface/`
  - `types.ts` 卡、玩家、选项、回合、事件、`PrivateView`（一台手机能看的）、`PublicView`（电视能看的）
  - `engine.ts` `createGame`、`reduce`、`privateView`、`publicView`、`phoneHolder`、`leaderboard`、裁判提问模板
  - `scoring.ts` 计分和罚则，揭晓页两组文案（揭晓老实人之前 `preLines`，之后 `lines`）
  - `cards.ts` 卡片校验器 `validateDeck`、提示器 `lintDeck`、选卡 `pickCard`
- 词库：`site/src/data/straightface.ts`（47 张，四个包：trivia 12、vancouver 14、food 10、slang 11）
- 单机画面：`site/src/party/straightface/`（`StraightFace.tsx` 流程、`parts.tsx` 组件、`text.ts` 文案、`straightface.css`）
- 首页卡片：`site/src/games/registry.ts` 里 id 是 `straightface` 的那一项（共用文件，只改这一项；现在 `hidden: true`）
- 路由：`site/src/router.ts`（2026-11-04 改了一行：藏着的游戏 `/play` 地址能打开，别的地址不是页面）
- Codex 任务卡：`docs/codex-tasks/straightface/`

## 先读

`AGENTS.md`、`HANDOFF.md`、`docs/straight-face.md`、`site/src/shared/straightface/types.ts`。

## 测试

- `cd site && npx tsx tests/straightface.test.ts`：引擎、词库、两个视图不漏身份（22 组，CI 的 `site.yml` 里跑）
- `python3 scripts/straightface_check.py`（网站要先跑起来）：一台手机 4 人跑完整整 4 轮，中英文各一遍，每一步截图到 `site/local-shots/straightface/`，并检查：说「我是 ××」之前什么私密内容都不显示；「传给 ××」只在 15 秒到了才出现；揭晓页老实人排在冷知识之后；连按不多算一轮；没有横向滚动
- 真机：Steve 用 iPhone Safari 跑一局 4 人局（验收门 A，还没跑）

## 定过的事

- 两条铁律：手机只渲染 `privateView` 的字段，电视只渲染 `publicView` 的字段；改计分先改测试再改 `scoring.ts`。
- 偷看：一台手机时每人按住 15 秒，时钟从第一次按下开始、松不松手都走，「传给 ××」到时才出现，松手只黑屏、可以再按。联机时整轮按住随时看（A3）。
- 疑点只能在解释阶段贴，贴了疑点的人不能再被指认。
- 押注按座位顺序传手机，裁判最后拿回，看不到任何人押了谁。
- 老实人抽签软加权：当得最少的人权重 3，不保证。
- 命中率的平衡目标按人数定：3 人 55 到 70%，4 人 45 到 60%，5 到 6 人 40 到 55%，7 到 9 人 30 到 45%。
- 酒类词条不标 18+（性和毒品相关才标）；来源允许 `editorial`。
- 词名只写原文或音译，不带解释性译名和括号注释；冷知识必填。
- 下架规则：出场 10 次以上且命中率 80% 以上的卡降难度或下架（A4 的事）。
- 同分看谁骗到裁判的次数多，再同一起喝。
- 按仓库规矩先藏着（`hidden: true`），Steve 真机跑过一局再上首页（去掉 `hidden`，加进首页脚本的 `ORDER`，CI 的 40 张对比截图要更新）。
- 释义只取来源页的事实、自己造句，不抄维基原句，所以词库不被 CC BY-SA 传染（`LICENSES.md`）。

## 现在

2026-11-04：A1 和 A2 做完，在分支 `game/straight-face`。引擎 22 组测试全过，一台手机中英文各跑完一局 4 人局（截图在 `site/local-shots/straightface/`）。只有 `/g/straight-face/play` 这个地址能进。

## 还剩什么

- 验收门 A：Steve 真机跑一局，然后去掉 `hidden`。
- A3 联机：`site/src/shared/engine/games/straightface.ts` 包一层 `GameDef` 调用同一个引擎（`view(s, pid)` 就是 `privateView`），`protocol.ts` 加 id 和 view 类型，`site/src/online/games/` 加 `NetStraightFace.tsx`，电视页只收 `publicView`。
- A4：词库入 D1、见过的卡（联机取全桌并集）、每张卡的裁判命中率、「这卡有问题」。
- C1 扩库到 300（Codex）、C2 组件替换 A2 的占位（Codex）、C4 测试补全（Codex），卡在 `docs/codex-tasks/straightface/`。
- 名字上线前在 CIPO、BGG、Steam、App Store 各搜一遍。

## 交给别的对话

- 平台 · 首页与上线：上首页时需要新的对比截图（`update-screenshots` 标签）。
- 平台 · 房间与联机：A3 要在 `protocol.ts` 和 `games/index.ts` 各加一行。

## 最近的改动

- 2026-11-04 一本正经：引擎、47 张卡、单机全流程（A1、A2），藏着先

## 记录

- 2026-11-02 方案和开工包（Claude 文档），同日审稿：修了回合推进连按、疑点对冲、词名泄露答案、冷知识缺失等 17 条。
- 2026-11-04 建档案。开工包原本假设引擎放在 `games/straight-face/`，按仓库规矩改放 `site/src/shared/straightface/`，测试改成仓库自己的 `tsx` 写法。

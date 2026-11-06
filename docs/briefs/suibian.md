# 工具 · 随便（suibian）

对话名「工具 · 随便」。网址 changle.ca/eat。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

吃什么？随便。每人一部手机选餐厅，让大家的手机来定；一个人也能挑。

## 文件

- 工具本身（自己的服务器，Worker `suibian`）：`tools/suibian/`
- 工具页上的卡片：`site/src/tools/Suibian.tsx`
- Cloudflare 里的钥匙（只写名字）：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`SESSION_SECRET`、`GOOGLE_PLACES_KEY`

## 先读

- `tools/suibian/HANDOFF.md`（状态、设置、待办）
- `tools/suibian/README.md`
- `tools/suibian/DESIGN.md`

## 测试

- 在 `tools/suibian` 里：`npm run typecheck`、`npm test`、`npm run test:e2e`；CI `.github/workflows/suibian.yml`

## 定过的事

- Google 登录已经开着（应用已发布）。
- 细节见 `tools/suibian/HANDOFF.md`。
- 2026-11-05 探店链接的格式（Steve 同意）：每家店名（有分店写地址）、一句理由、链接。

## 还剩什么

- 严重过敏表 `SEVERE_RULES_OUT`（`src/engine/limits.ts`）还是草稿。2026-11-05 整理成一页 Claude 文档「随便 · 严重过敏规则（请帮忙看）」：每种过敏原现在排除的菜系、建议加的和原因、5 个问题（蚝油、花生和其他中餐、芥末要不要加等）。等 Steve 转给有过敏的朋友，回复后再改代码。
- `src/data/picks.json`（Steve 的推荐）还空着，等 Steve 的探店链接（格式见上）。
- 2026-11-02 Steve 定的：过敏表和探店链接在这个对话跟进。
- #275 每次挑最多搜 4 次（以前 2 次，总是同样的 40 家），分数差不多的随机轮换，两周内一个人挑时看过的往后放。CI 绿了，等 Steve 同意 Google 费用后合并：免费额度从约 500 次挑变成约 250 次，每日上限 200 次搜索从约 100 次挑变成约 50 次。
- 外卖平台不能当餐厅来源：Uber Eats、DoorDash 的接口只给签约商家管自己的菜单和订单，Skip、饭团没查到公开接口，抓页面违反它们的条款。能做的是卡片上加「在外卖 App 里打开」按钮，等 Steve 定。
- UI 计划 C3：2026-11-05 全站设计对话交给这个对话（交接写在 `docs/briefs/design.md`）。/eat 换成主站的夜场样子，引 `site/src/styles/tokens.css`；登录换成邮箱验证码、Google 第二选项，先和 Steve 定要不要和主站共用账号。还没开始。
- 11-01 试玩查出、没修：演示模式的卡片不跟语言走；演示模式里有 Google 页脚。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-01 随便: "show me others" without accounts, a lobby that fits an iPhone SE, chips in the reader's language
- 2026-10-31 随便 picking alone: up to twelve places, each batch's details fetched when asked (#61)
- 2026-10-31 随便: bug fixes from a screen walk and a code review (#57)
- 2026-10-31 随便: list badges match Google's two-language names and unit numbers (#55)
- 2026-10-31 随便：补齐大温餐厅榜单与奖项事实（#54）
- 2026-10-31 随便 docs: which places have Google descriptions in Chinese (#51)

## 记录

- 2026-11-02 建档案。
- 2026-11-02 从总对话的聊天记录查出漏掉的事，补进「还剩什么」。
- 2026-11-05 仓库改名 Changle 后重新接上。Steve 说怎么选都推荐同几家：原因是每次只在同一个圈里搜两次（最热门 20 家、最近 20 家），排序没有随机。开 #275。他想加外卖平台做参考，查了做不到（见上）。过敏规则整理成一页给朋友看。

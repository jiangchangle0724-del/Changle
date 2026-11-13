# 工具 · 随便（suibian）

对话名「工具 · 随便」。网址 changle.ca/eat。档案建于 2026-11-02，从仓库里的文档和提交记录整理；以后由这个对话维护。

## 它是什么

吃什么？随便。每人一部手机选餐厅，让大家的手机来定；一个人就开一桌、场景选「一个人」。

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
- 2026-11-11 Steve 定的：第 2 轮和一个人挑都列出范围和预算内所有开着的店，按评价排 1、2、3…；只有预算会把店去掉。不吃的东西、清真、吃素、第 1 轮的 🚫 只往后排，卡上写原因和还能点什么；严重过敏也只往后排（排到最后）。每次挑还是最多 4 次 Google 搜索，不加钱。
- 2026-11-11 前面加「什么时候吃？」：现在、今明两天的午饭晚饭、或这一周里任选时间，按那时的营业时间排。
- 2026-11-11 晚上 Steve 定的（#339）：第 1 轮放在搜索前面，全菜单 31 个菜系分三组（中餐、亚洲菜、西餐和其他）；大家 👍 的菜系拿剩下的搜索次数去搜，第 2 轮里想吃的菜系全部排最前（不管别的店评分多高），一桌还是最多 4 次搜索。开一桌加「什么场景」：随便吃吃、朋友聚会、约会、同事聚餐、家庭聚餐、生日聚餐、商务宴请、一个人、宵夜，按 Google 给的「适合聚会、带小孩、有酒、可订位、开到很晚」往前往后挪一点，卡上写「适合约会」。去掉一个人挑：/eat/solo 回首页，以前挑的 3 天内还能评分，之后账号里那份删掉。
- 2026-11-12 场景（#366、#368）：Steve 选商务宴请晚餐，第一名是贝果店。现在场景分量很重：按 Google 说的店的类型（咖啡店、甜品面包店、早餐店、快餐、外带小店、酒吧）、高档、价格、能不能订位、有没有酒、适合多人和小孩、做不做晚饭、开到几点、Google 介绍里的词，还有榜单。明显不适合这个场景或这顿饭的店排到最后，卡上写原因，不去掉。每个场景有一次自己的搜索（还是每桌最多 4 次），其他搜索不搜明显不适合的类型。饮食卡预算太低（商务宴请低于 $60，约会和生日低于 $35）在大厅提醒本人，表上写有几家超出预算。加了场景榜单：OpenTable 加拿大最浪漫 100 家、VanMag 最适合约会、最佳包间、最有排场、OpenTable 温哥华最适合家庭、Daily Hive 读者票选深夜美食；这类榜对那个场景加分最多。
- 2026-11-11 榜单标签（#342）：加了 OpenTable 加拿大 Top 100（2026）、enRoute 加拿大最佳新餐厅（2025）、Yelp 加拿大必吃 Top 100（2024，Yelp 最新的加拿大榜）、加拿大中餐 Elite 30（2026）。饭团和 Uber Eats 没有公开的餐厅榜：饭团的榜只在 App 里，Uber Eats 每年的报告只写菜和城市。一张卡最多 4 个标签，每个榜先出一个。

## 还剩什么

- #339（第 1 轮先选、想吃的排最前、什么场景、去掉一个人挑）和 #342（榜单标签）11-11 合并上线；#366（场景规则）和 #368（场景榜单）11-12 合并上线。请 Steve 再开一桌商务宴请晚餐看看；如果前几名还不对，截图发来。
- Steve 那桌只有 17 家，卡上有「预算以内」：很可能有人的饮食卡预算是 $20 或 $35，把贵一点的店都去掉了。现在大厅会提醒本人，表上也写有几家超出预算。
- 场景榜单还可以加：商务午餐、适合多人聚餐、生日的榜（没找到可靠的公开榜就先不加）。OpenTable 的「商务餐」页是推广排序，没用。
- 第 1 轮里有 5 个菜系 Google 没有类型（川湘菜、上海江浙菜、东北西北菜、中式烧烤、港式茶餐厅），用 Text Search 按字搜，每桌最多 2 次。Text Search 有自己的每日上限，还没设：可以在 Google Cloud 控制台 Places API (New) 的配额里设每天 100 左右（不设也行，每桌最多 2 次，每个账号每天最多 10 桌）。
- 一个人挑留下的旧代码（`/eat/rate`、`POST /api/places/:id/rate`、`chooseSolo`、账号里的 `solo`）11-15 以后可以删（#339 上线 3 天后）。
- 还可以加的榜：Georgia Straight Golden Plates（读者票选，分类多）、加拿大中餐大奖 2026 招牌菜奖、DoorDash 食客之选 2026（出了再加）。
- 过敏表（#313 起叫 `COMMON_IN`，`src/engine/limits.ts`）：2026-11-05 整理成一页 Claude 文档「随便 · 严重过敏规则（请帮忙看）」，Steve 说可以，建议加的都在代码里（#284）。从 #313 起它只决定哪些菜系往后排、写什么提示（`src/engine/tips.ts`）。文档里的问题还开着：蚝油（虾蟹贝要不要算上其他中餐、茶餐厅、台湾菜）、花生要不要算上其他中餐、芥末要不要加成过敏原。
- 「还能点什么」是按菜系写的（Google 不给菜单），不是按每家店的菜单。「主打」只看店名和 Google 类型。Google 的 AI 介绍只有英文，中文模式下大多只在前几张卡上有。
- `src/data/picks.json`（Steve 的推荐）还空着，等 Steve 的探店链接（格式见上）。
- 2026-11-02 Steve 定的：过敏表和探店链接在这个对话跟进。
- 点外卖（#282）上线了：DoorDash 的搜索链接试过能用；Uber Eats 和饭团对自动浏览器弹人机验证，没实测，用户真点时如果打不开再改。
- 外卖平台不能当餐厅来源：Uber Eats、DoorDash 的接口只给签约商家管自己的菜单和订单，Skip、饭团没查到公开接口，抓页面违反它们的条款。
- UI 计划 C3：2026-11-05 全站设计对话交给这个对话（交接写在 `docs/briefs/design.md`）。/eat 换成主站的夜场样子，引 `site/src/styles/tokens.css`；登录换成邮箱验证码、Google 第二选项，先和 Steve 定要不要和主站共用账号。还没开始。
- 11-01 试玩查出、没修：演示模式的卡片不跟语言走；演示模式里有 Google 页脚。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-12 随便: lists for an occasion (most romantic, private rooms, family-friendly, late night) (#368)
- 2026-11-12 随便: what it's for weighs a lot; a place plainly not for it goes last, saying why (#366)
- 2026-11-11 随便: list badges from OpenTable, enRoute, Yelp and the Chinese Restaurant Awards' Elite 30 Canada (#342)
- 2026-11-11 随便: round 1 first on the whole menu, liked cuisines first, what it's for; picking alone goes (#339)
- 2026-11-11 随便: "什么时候吃？" first — now, the next lunch or dinner, or a day and time this week (#316)
- 2026-11-11 随便: every place in range and budget, ranked; diets move places down with a note instead of taking them off (#313)
- 2026-11-05 随便: severe allergies rule out the cuisines the review added (approved 2026-11-05) (#284)
- 2026-11-05 随便: order delivery from the card (Uber Eats, DoorDash, 饭团, Skip) (#282)
- 2026-11-05 随便: more of the area each pick, and the same few places stop coming back (#275)
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
- 2026-11-05 Steve 同意 Google 费用，#275 和 #277 合并，Cloudflare 部署成功。合并后 main 上「一个人挑」的测试在 WebKit 失败过一次（选完马上读账号，比保存快），#282 里改成等保存好再读。Steve 同意做外卖按钮（#282），同意过敏表，建议加的进代码。
- 2026-11-05 #282、#284 合并，Cloudflare 部署成功，main 上的检查（含 WebKit）全过。
- 2026-11-11 Steve 说店不全，要能选时间，卡上要有距离和走路开车时间，不吃辣不该把川菜去掉而是往后排并写还能吃什么，每家要有一句介绍，按评价排名。问了他两件事：搜索次数保持 4 次（不加钱），严重过敏也只往后排。做了 #313（排名表）和 #316（选时间）。顺手修了兰州拉面被当成日式拉面、台北没算台湾菜。去掉了随机打乱和「最近两周看过的往后排」，账号里那份记录下次挑时删掉。
- 2026-11-11 Steve 说全部合并。#313、#316 合并，Cloudflare 部署成功，main 上的检查（含 WebKit）全过，线上 changle.ca/eat 已是新版。
- 2026-11-11 晚上 Steve 看了截图：选了火锅，JOEY（不是火锅）排第 3，火锅排第 7、8；第 1 轮选项太少；要搜饭团、Uber Eats、Yelp 等榜单加标签；开一桌加「什么场景」，去掉一个人挑。原因：想吃的只加分不分档，JOEY 评分高又被当成「其他」。做了 #339：想吃的菜系分档排最前，JOEY、Cactus Club、Earls 这类算美式，第 1 轮放到搜索前面、31 个菜系，场景九选一，一个人挑去掉。第 1 轮时间从 60 秒改成 90 秒（菜单长了）；搜索没找到店回大厅时保留大家第 1 轮选的。榜单查了：饭团、Uber Eats 没有公开榜，Yelp 最新的加拿大榜是 2024 年；加了 4 个榜 45 个标签（#342）。
- 2026-11-11 Steve 说合并。#339、#342 合并，Cloudflare 部署成功，main 上的检查（含 WebKit）全过，线上 changle.ca/eat 已是新版，/eat/solo 回首页。Project 规矩改了：CI 绿了直接合并，花钱、删数据、改 Cloudflare 或 GitHub 设置和钥匙、仓库公开私有先问。
- 2026-11-12 Steve 截图：选了晚餐商务宴请，第一名是 Siegel's Bagels（贝果店，人均 $10–20，4.5 星）。原因：场景只加一点分（最多半颗星），也不知道它是贝果店、不做正餐；那桌还设了预算，贵的店被去掉了。做了 #366（场景规则重做，不合适的排最后写原因，每个场景自己的搜索，预算提醒）和 #368（网上的场景榜单）。两个都 CI 绿了直接合并，Cloudflare 部署成功。

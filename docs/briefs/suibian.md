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
- 2026-11-13 Steve 截图：选了中式烧烤 · 串串（家庭聚餐），Earls、Cactus Club 排第 5、6，串串店 The Meat Up BBQ（聚点串吧，自助串串加火锅）排在后面。原因：英文店名里没有烧烤串串的字，Google 只说它是 barbecue restaurant，被当成了牛排西餐；按菜系搜到它的那次搜索（Chinese BBQ skewers）也没用上，因为最热门那次搜索先找到了它。现在的定法：一家店可以算几个菜系（火锅加串串、粤菜加海鲜、拉面加日料），第 1 轮 👍 任何一个就排最前，卡上先写大家想吃的那个（「🍢 中式烧烤 · 串串、火锅」），过敏按每个菜系都查。菜系看 Google 类型、店名和 Google 的介绍三样；barbecue 按上下文分成韩国烤肉、日式烤肉、中式串串、粤式烧腊或美式烧烤，中餐馆的 seafood 算粤菜加海鲜；什么都看不出来的店，由按菜系搜到它的那次搜索决定，不管哪次搜索先找到。31 个菜系都用大温真实店名测过（`tests/engine.test.ts` 的 `KNOWN`）。
- 2026-11-14 Steve 定的全站规矩（跟一单的档案转来）：跟手机的语言走，在微信里打开默认中文，自己按过「中文 / English」的照选的。随便照做了（`src/client/prefs.ts` 的 `lang`）。
- 2026-11-18 Steve：第 1 轮的选项里要有 all you can eat。加了「🍽️ 自助 · 放题 / All you can eat」，放在「西餐和其他」最后，一共 32 个选项。它不算菜系而是吃法：一家店可以既是韩国烤肉又是放题，👍 放题的人会看到它排前面，卡上写「自助 · 放题、韩国烤肉」。怎么认：Google 的 buffet 类型；店名或介绍里有 AYCE、all-you-can-eat、自助、放题、任食、吃到饱；或者被「all you can eat restaurant」这次搜索找到（只算韩烤、火锅、日料、串串、粤菜、海鲜这类，搜出来凑数的咖啡店不算）。这次搜索是按字搜，和川菜那几个一样算在每桌最多 2 次里，不多花钱。
- 2026-11-18 演示模式（11-01 试玩查出的两个问题）：示例餐厅跟房主的语言走，中文桌是「示例 · 金满楼点心」，英文桌是「Demo · Golden Bowl Dim Sum」，不是中餐的店名两边一样；示例介绍也有两种语言。演示模式不再写「数据来自 Google Maps」，顶上的示例数据横幅已经说明了。
- 2026-11-18 一个人挑留下的旧代码删了（#339 定的，上线 3 天后删）：`/eat/rate` 和 `/eat/solo` 都回首页；评分接口 `POST /api/places/:id/rate`、`POST /api/me/last` 的 place 写法、`rateLast`、`chooseSolo` 去掉；账号里剩下的旧挑选在这个人下次打开随便时删掉（`UserDO.me()`），隐私页照着改了，更新日期 11 月 18 日。
- 2026-11-18 Steve 定的大改版：规则不变（两轮、投票、排名、搜索、服务器发什么都不动），页面设计、动画和交互大改，能交给 ChatGPT（Codex）做的就交给它，省 token。样稿是 Claude 设计画布「随便 · 夜场改版样稿」（https://claude.ai/artifact/1NVnh5XocceS41wHYwvVhX），同样的五屏和画布上的说明在 `docs/codex-tasks/suibian/mock/`。分三张卡（`docs/codex-tasks/suibian/`），一张合并了再开下一张：S1 夜场皮肤（主站的 tokens 和两种字体，琥珀色的灯，样式表里不写死任何颜色、字号、间距、圆角、阴影和时间，`tests/design.test.ts` 管着）；S2 按样稿重画每一屏（顶栏和主站游戏顶栏一样，主按钮固定在底部，胶囊选项，菜单格子，餐厅卡）；S3 动画和手感（按下回弹，👍 弹一下，🚫 摇一下，最后 10 秒变红跳动，想去从手指点的地方铺满，出结果盖章和光点，打平转盘越转越慢，手机震一下；系统减弱动态效果时只淡入）。字和选项都用现在的，样稿里的示例字不算，新字只有卡上列的几个。登录（邮箱验证码、和主站共用账号）不在这次里。
- 2026-11-19 Steve 定的第 1 轮新结构：先问从哪儿挑，按菜系（中餐、日料、韩餐、意大利菜…）还是按想吃的（烧烤、火锅、面、海鲜、牛排…）；先是大类，点进去（细分）才是细的，按想吃的进去以后是哪国的。他选了：大类可以直接点想吃（一整类），细分只是想细挑时再点；点完还是第 2 轮一起看餐厅，搜索次数不变。两条路通到同样的 32 个菜单项（`src/client/paths.ts`），服务器照旧只收每个人对菜单项的 👍 🚫；一样多人想吃时，单点的先搜，整类点的后搜。
- 2026-11-25 Steve 在 Metrotown 选了自助 · 放题，出来的店排在前面的都不是放题；他要：第 2 轮能按距离或相关程度重新排、取消倒计时、出结果后有按键回到上一步重新选。定了：一家店只有自己说是放题才算（名字、Google 的类型是 buffet、或 Google 的介绍里写了 all-you-can-eat / 自助 / 放题），被「all you can eat」搜出来不算，搜索词也去掉了 restaurant；两轮都不再倒计时，等大家都点好了，或房主点「不等了，下一步」；排序只改自己手机上的顺序（最相关 / 距离最近），不改全桌的排名和投票；回到上一步只有房主能点，在有人评分之前，回到同一批卡片、大家的勾和否决清空。
- 2026-11-25 Steve 要第 2 轮能换范围重新搜（多花一次 Google 搜索他同意）。定了：只有房主能换，算在这一桌最多 4 次搜索里；第 1 轮选的不变，大家的勾和否决清空；范围显示在列表上面。
- 2026-11-26 Steve 问 Metrotown 附近、自助 · 放题、走路 15 分钟，为什么没有 The Meat Up BBQ（5137 Kingsway，4.8 星 6,523 条）。原因是「本拿比 Metrotown」的点在商场西边 550 米，那家店离点 1.3 公里，在 1.2 公里的圈外，Google 根本没搜回来；店本身 Google 标了 buffet，算放题没问题。定了：点挪到 Metropolis at Metrotown（Google 的坐标），离那家店 750 米。
- 2026-11-26 Steve 要左上角的返回是上一步，不是回首页。定了：第 2 轮回第 1 轮（大家选的保留，勾和否决清空），第 1 轮回大厅（选的保留），大厅才回首页；搜索中和结果页没有这个按钮（结果页有自己的「回到上一步」）。只有房主（房主手机不在时任何人）能带全桌回去，别人点会提示「要房主点上一步，大家一起回去」。快速连点两下只退一步。回到第 1 轮后什么都没改就不再搜 Google，直接用上次搜到的店重新排；4 次搜索用完了也这样排。
- 2026-11-26 Steve 要再仔细查 bug。查到并修了：①服务器重启（每次发布都会）后，还没连回来的手机马上算「不在」，回合可能不等他们就往下走，也可能一直卡着；现在和平时掉线一样给 60 秒。②回到第 1 轮什么都没改直接重排时，每次都重新向 Google 要前几家的详情（照片、评价），来回点就一直花钱；现在每次搜索的每家店只要一次。③第 1 轮打开了某个大类的细分时，左上角返回会把全桌带回大厅；现在先关掉细分。④在大厅改饮食卡时房主点了开始，改到一半的卡就没了，而且之后没地方再改；现在卡留在屏幕上，保存了才进第 1 轮。⑤同一桌「重新来一轮」又吃了一家，第二顿在同一台手机上不能评分（手机只记了桌号，桌号 3 天后还会给别的桌）；现在记桌号和那家店。⑥复制按钮在不支持复制的浏览器里没反应，分享时还会说「已复制」；现在换老办法复制，真复制不了就说。⑦Google 没回应时一直等，桌子停在「正在搜」；现在每次调用最多等 10 秒。加了一个随机乱点的测试：300 桌、每桌 160 下随机操作（加入、掉线、重启、乱序消息、搜索晚到或失败、时间跳），每一步都检查规则，①②就是它找到的。
- 2026-11-26 查到但没改：离线时点的「好了」会在连回来后补发，如果期间房主换了范围或退回上一步，会算到新的一轮里（很少见，要改协议）；点了「好了」就不能改主意；桌号只有 4 位，谁都能试着加入别人的桌（加入只能看到名字和合起来的忌口）。
- 2026-11-26 看了类似的开源项目和做法，可以借鉴（都还没做，要 Steve 定）：①全员都想去就直接出结果：Hungr、Findalicious（原名 Chicken Tinder）是全员右滑才算配对；我们可以在第 2 轮所有在场的人都勾了同一家、没人否决时马上提示「大家都想去这家」。②没有一致时换一批：Dinder 没有全员同意就自动再给 10 家，GroupTable 给排名并能再拿更多；我们可以加「换一批」，用同一次搜索剩下的店，不花 Google 的钱。③实时排名：GetTogether 在大家投票时实时更新排名。④地图上拖点：Sawa 让人在地图上自己画范围；今天 Metrotown 点偏了这种问题一眼就能看出来。⑤两个人时一对一对决：Food Flip、Picky 用两两比较或淘汰赛。⑥断线重连：消息带回合号或序号，服务器丢掉旧一轮的（能修上面离线补发的问题）。我们的「可以勾好几家 + 一票否决」在群体推荐研究里叫 approval voting 加 least misery（不让任何一个人太不满意），方向是对的。Findalicious 是 GPL-3.0，只借思路，不拷代码。
- 2026-11-11 榜单标签（#342）：加了 OpenTable 加拿大 Top 100（2026）、enRoute 加拿大最佳新餐厅（2025）、Yelp 加拿大必吃 Top 100（2024，Yelp 最新的加拿大榜）、加拿大中餐 Elite 30（2026）。饭团和 Uber Eats 没有公开的餐厅榜：饭团的榜只在 App 里，Uber Eats 每年的报告只写菜和城市。一张卡最多 4 个标签，每个榜先出一个。

## 还剩什么

- #339（第 1 轮先选、想吃的排最前、什么场景、去掉一个人挑）和 #342（榜单标签）11-11 合并上线；#366（场景规则）和 #368（场景榜单）11-12 合并上线。请 Steve 再开一桌商务宴请晚餐看看；如果前几名还不对，截图发来。
- Steve 那桌只有 17 家，卡上有「预算以内」：很可能有人的饮食卡预算是 $20 或 $35，把贵一点的店都去掉了。现在大厅会提醒本人，表上也写有几家超出预算。
- 菜系识别是按名字、类型和介绍猜的，Google 实际给每家店的类型看不到（要花钱查）。请 Steve 再开一桌选中式烧烤看看 The Meat Up 是不是排到前面了；哪家还认错，截图发来，加进 `KNOWN` 再改规则。英文里 Chinese BBQ 也指烧腊，搜串串时偶尔可能带出看不出是哪种的烧腊店。
- 场景榜单还可以加：商务午餐、适合多人聚餐、生日的榜（没找到可靠的公开榜就先不加）。OpenTable 的「商务餐」页是推广排序，没用。
- 第 1 轮里有 6 个选项 Google 没有类型（川湘菜、上海江浙菜、东北西北菜、中式烧烤、港式茶餐厅、自助 · 放题），用 Text Search 按字搜，每桌最多 2 次。Text Search 有自己的每日上限，还没设：可以在 Google Cloud 控制台 Places API (New) 的配额里设每天 100 左右（不设也行，每桌最多 2 次，每个账号每天最多 10 桌）。
- 还可以加的榜：Georgia Straight Golden Plates（读者票选，分类多）、加拿大中餐大奖 2026 招牌菜奖、DoorDash 食客之选 2026（出了再加）。
- 过敏表（#313 起叫 `COMMON_IN`，`src/engine/limits.ts`）：2026-11-05 整理成一页 Claude 文档「随便 · 严重过敏规则（请帮忙看）」，Steve 说可以，建议加的都在代码里（#284）。从 #313 起它只决定哪些菜系往后排、写什么提示（`src/engine/tips.ts`）。文档里的问题还开着：蚝油（虾蟹贝要不要算上其他中餐、茶餐厅、台湾菜）、花生要不要算上其他中餐、芥末要不要加成过敏原。
- 「还能点什么」是按菜系写的（Google 不给菜单），不是按每家店的菜单。「主打」只看店名和 Google 类型。Google 的 AI 介绍只有英文，中文模式下大多只在前几张卡上有。
- `src/data/picks.json`（Steve 的推荐）还空着，等 Steve 的探店链接（格式见上）。
- 2026-11-02 Steve 定的：过敏表和探店链接在这个对话跟进。
- 点外卖（#282）上线了：DoorDash 的搜索链接试过能用；Uber Eats 和饭团对自动浏览器弹人机验证，没实测，用户真点时如果打不开再改。
- 外卖平台不能当餐厅来源：Uber Eats、DoorDash 的接口只给签约商家管自己的菜单和订单，Skip、饭团没查到公开接口，抓页面违反它们的条款。
- UI 计划 C3：2026-11-05 全站设计对话交给这个对话（交接写在 `docs/briefs/design.md`）。夜场样子 2026-11-18 开始，分 S1、S2、S3 三张卡交给 Codex（见「定过的事」）；tokens 照 `tools/when` 的做法复制一份进来，测试保证和 `site/src/styles/tokens.css` 一字不差。登录换成邮箱验证码、Google 第二选项还没开始，要先和 Steve 定要不要和主站共用账号。

## 交给别的对话

- （暂无）

## 最近的改动

提交记录原文，最新的在上面。代码 2026-10-29 搬进这个仓库，更早的历史不在 git 里。

- 2026-11-26 随便: bug sweep (restart grace, details asked once, back closes what's open, diet card kept, second meal rated, honest copy, Google time limit, random-taps test)
- 2026-11-26 随便: Metrotown's point on the mall; the top bar's back is the step before; no new search when nothing changed
- 2026-11-25 随便: the host searches again with another range in round 2 (#783)
- 2026-11-25 随便: all you can eat only when a place says so; no clock; sort round 2 nearest first; back from the result (#781)
- 2026-11-21 随便 S3: motion and feel, haptics, the tie wheel and the result's stamp (#731)
- 2026-11-20 随便 S2: the screens as drawn, with a top bar and a dock (#696)
- 2026-11-19 随便: round 1 starts big, by cuisine or by dish, groups opened to pick inside (#684)
- 2026-11-19 随便 S1: the night skin, from the site's tokens (#647)
- 2026-11-18 随便: task cards for the night redesign (S1 skin, S2 screens, S3 motion) (#624)
- 2026-11-18 随便: 自助 · 放题 (all you can eat) on round 1's menu (#606)
- 2026-11-18 随便: demo restaurants in the host's language, and no Google line under them (#602)
- 2026-11-18 随便: what was left of picking alone goes (its rating, its "就它了", its account data) (#599)
- 2026-11-18 随便: Chinese in WeChat, otherwise the phone's language, as on the rest of the site (#597)
- 2026-11-13 随便: a place can be more than one cuisine, and whoever liked either finds it first (#492)
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
- 2026-11-13 Steve 问「为什么不在我的 tools 里面」：线上 changle.ca/tools 有随便（截图发了），两清和跟一单是故意藏着的；问他说的是哪个，他接着发了串串的截图。按他说的「按照这个逻辑再去检查别的选项」把 31 个菜系都查了一遍：同样的问题还有拉面店被 Google 叫日料时不算拉面、兰州拉面店被叫面馆时不算西北菜、中餐海鲜酒家算成西餐海鲜、上海酒家算成粤菜、日式烧烤算成中式烧烤、Kobe 铁板烧算成牛排，都改了。
- 2026-11-13 #492 合并上线（Cloudflare 部署成功，线上页面脚本和 main 一样）。设计检查提示 privacy.html 字号层级太平，没改，先问 Steve。
- 2026-11-18 Steve 说「继续」：做了 #597（微信里默认中文，跟一单档案转来的全站规矩）、#599（删一个人挑的旧代码，11-15 以后可删）、#602（演示模式两个老问题）。隐私页字号的提醒查过：检查工具读不到 `/eat/app.css`，以为标题和正文都是 16px；页面实际是 32、21、16px，带上真的样式表再查就没有问题。没改页面，只在本机记了这条忽略（隐私页和条款页）。三个都 CI 绿了合并，Cloudflare 部署成功；线上验过 /eat/rate 回首页、旧的单人评分接口 404、页面脚本和 main 一样。
- 2026-11-18 晚上 Steve：第 1 轮的选项里要有 all you can eat。做了 #606（见「定过的事」），CI 绿了合并，Cloudflare 部署成功，线上页面脚本和 main 一样。
- 2026-11-18 Steve 发来藏在人群里对话找到的游戏手感技能，要随便的动画、交互和页面设计大改，规则不变，能用 ChatGPT 就用。画了五屏样稿给他看，写了 S1–S3 三张 Codex 卡；浏览器测试可以用电脑自己的 Chrome 了（`PW_CHROME=1`），Codex 在 Steve 电脑上装不了 Playwright 的浏览器时用。
- 2026-11-19 Steve 在电脑操作里允许了 ChatGPT（Codex 在 Windows 上就是 ChatGPT 这个程序，左上角切到 Codex，新对话选 This computer），在他电脑上发了 S1。Codex 半小时开了 #647：只改卡上的文件，118 个单元测试和 10 个浏览器测试都过。审过：截图看了首页、饮食卡、大厅、两轮、结果、评分、隐私页，390 和 1280 宽，中英文；大厅的桌号在二维码旁边折成了两行（745 / 0），改成小一档、不折行，推在 PR 上。合并后发 S2。
- 2026-11-19 Steve 在手机上看了第 1 轮，要先有大类、分两条路（按菜系、按想吃的），点进去才是细的。问了他两件事（细分以后直接看餐厅还是第 2 轮一起看；大类能不能直接选），按他选的做了：第 1 轮先问从哪儿挑，再是大类格子，点一下整类 👍 / 🚫，细分打开挑里面的，挑了一部分的大类点一下是打开、不会抹掉；手机返回键关掉细分。S2、S3 卡跟着改了第 1 轮那段。Codex 额度到 11 月 20 日 17:30，定好 17:40 回来发 S2。
- 2026-11-20 Codex 额度 17:30 恢复；17:40 那次 Steve 的电脑没连上，21:40 再试连上了，发了 S2（文件夹窗口挡在 Codex 前面，多要了一个只能点击的文件夹权限把它换到前面）。Codex 半小时开了 #696。审过：首页、加入、饮食卡、大厅、第 1 轮（先问从哪儿挑、大类、细分）、第 2 轮、结果、评分、隐私页，390 和 320 宽，中英文，没有横向滚动。修了三处推在 PR 上：返回键或「‹ 日料」关掉细分时整桌会重连、第 1 轮跳回按菜系（#684 留下的：main.tsx 现在只在地址变了才重画，细分一打开就记下返回点），加了浏览器测试；结果的「就它了！」盖住店名，挪到卡片右下；倒计时在 320 宽折行。合并后发 S3。
- 2026-11-21 发了 S3，Codex 开了 #731。审过：用模拟震动记下每一下（想吃 8、不想 6/30/6、想去 10、否决 20/40/20、有人进桌 10、转盘每格 5、盖章 20/40/30），静下来时页面上没有在跑的动画，打平转盘按服务器的结束时间落在赢的那家，结果依次是卡片弹出、盖章、光点、按钮；系统减弱动态效果时只有淡入、没有光点。改了一处：转盘的 4.5 秒改成直接用服务器的 TIMING.spin，免得两边不一致。三张卡都做完，夜场改版上线。
- 2026-11-25 Steve 试了 Metrotown + 自助 · 放题：排在前面的 Hon Sushi 之类都不是放题。原因：被「all you can eat restaurant」搜出来的日料、韩餐、中餐等都被直接当成放题。改成只认店自己说的；搜索词改成「all you can eat」。同时按他说的：两轮取消倒计时，第 2 轮加「最相关 / 距离最近」排序，结果页加房主的「‹ 回到上一步，重新选」。
- 2026-11-25 Steve 回「重新搜一次」：第 2 轮列表上面显示范围，房主点「换范围重新搜」，选好范围再点「按这个范围重新搜」，就用新范围再搜一次 Google，回到第 2 轮。
- 2026-11-26 Metrotown 的点从 (49.2276, -123.0076) 挪到 Metropolis 商场 (49.2273, -123.0)；顶栏在两轮里的返回改成发 `back`（带上当时的 phase），房间按 phase 退一步；`search()` 记下这次搜的是什么（searchedFor），一样就直接用上次的店重排。

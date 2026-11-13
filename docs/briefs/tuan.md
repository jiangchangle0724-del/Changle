# 工具 · 跟一单（tuan）

对话名「工具 · 跟一单」。网址 changle.ca/tuan（还没上线；A1 做完先藏在 changle.ca/tuan/preview）。档案建于 2026-11-12；以后由这个对话维护。

## 它是什么

给大温的私厨、团购团长和农场直销开的接单页：不抽成，只向商家收月费。商家把链接发进微信群，买家不下载、不注册就能下单；钱由买家直接付给商家，网站不经手。英文工作名 Count Me In。完整方案在 [`docs/tuan.md`](../tuan.md)。

## 文件

还没有代码。开工以后的地盘：

- 方案：`docs/tuan.md`（Steve 的 Claude 文档的副本，原文链接在它开头；两边不一致时以 Claude 文档为准）
- 工具本身：`tools/tuan/`（自己的 Worker，路由 changle.ca/tuan 和 /tuan/*）
- CI：`.github/workflows/tuan.yml`（照 `events.yml` 的写法：PR 上跑一次，合进 main 再跑一次）
- Codex 的任务卡：`docs/codex-tasks/tuan/`
- 工具页上的卡片（A3 才放）：`site/src/tools/Tuan.tsx`

共用文件里只加自己那一行，和 A1 的预览页放在同一个 PR：

- `site/src/router.ts` 的 `elsewhere` 和 `site/scripts/sw.template.js` 里同一串路径，加上 `tuan`。首页档案定的：新的 Worker 要加进这两处。不加的话，主站会把站内指向 /tuan 的链接当成自己的页面；断网时离线缓存会拿主站的首页顶替 /tuan 的页面。
- `site/public/robots.txt`：`Disallow: /tuan/api/`
- `site/vite.config.ts`：本地代理一行
- `HANDOFF.md`：「What changle.ca is made of」和「Settings」两张表各一行
- `site/src/tools/ToolsTab.tsx`：A3 放入口时加一行

## 先读

- `docs/tuan.md`（方案）
- `HANDOFF.md` 的「A tool」和「How a change reaches changle.ca」，`docs/DESIGN.md`
- 玩什么：`tools/events/README.md`、`wrangler.jsonc`、`src/schema.ts`、`migrations/`（D1 和 KV 怎么用，迁移由 Worker 自己执行，第一次部署自己建库）
- 随便：`tools/suibian/README.md`、`wrangler.jsonc`、`src/base.ts`（自己的 Worker 怎么挂在 changle.ca 的一个路径下面）
- 登录怎么认人：`site/worker/index.ts` 的 `api()`，`site/worker/hub.ts` 的 `session()` 和 `selfView()`，`site/src/lib/api.ts`
- 站长审核的先例：`site/src/account/AdminScenes.tsx`

## 测试

还没有。计划照两个工具的做法，在 `tools/tuan` 里：`npm run typecheck`、`npm test`（在 Workers 的运行环境里跑，本地 D1，像 `tools/events`）、`npm run test:e2e`（手机尺寸的浏览器，Chromium 和 WebKit，像 `tools/suibian`）。微信里的三件事只能在真机上看，见「现在」第 4 条。

## 定过的事

- 2026-11-12 Steve 开工时定的：
  - 第一个 PR 只建档案、在档案目录加一行、把方案存到 `docs/tuan.md`，不写功能代码。
  - 先回答四个问题（登录、数据库、图片、微信真机验证），等 Steve 说开工再做 A1。
  - A1 做完先藏在 /tuan/preview，Steve 在手机上跑过一遍再放入口。
  - 点单流程照常乐点单和 Market Alley Meat 来，Steve 会发截图或代码。
  - 边界清楚的活写成任务卡放 `docs/codex-tasks/tuan/`，交给 Codex。
  - 规矩照旧：一个改动一个分支一个 PR，CI 绿了自己合并，合完告诉 Steve 上线了什么；花钱、删数据、动 Cloudflare 或 GitHub 的设置和钥匙先问。
- 方案的四条前提（`docs/tuan.md` 开头，Steve 开工时没有改）：是 changle.ca 上的网页，不是微信小程序；网站不经手钱；不抽成，只收月费；站长是信息平台，不是卖家。
- 先用 Cloudflare 免费版（玩什么 10 月 31 日定的，方案沿用）。

## 现在

2026-11-12：只有档案和方案，没有代码。开工前的四个问题，下面是我读完代码、查完资料后的建议，都等 Steve 定。外面查来的数字和说法是 2026-11-12 查的，出处在每条后面。

### 1. 商家登录：用主站现成的登录，房间服务器不用改

- /tuan 和主站是同一个网址（https://changle.ca），所以 /tuan 的页面读得到主站存在手机里的登录凭证（`localStorage` 里的 `changle.session`，`site/src/lib/api.ts`）。在主站登录过的手机，打开 /tuan/my 就已经登录。随便的卡片也是这样和主站共用手机存储的（`site/src/tools/Suibian.tsx`）。
- 页面把凭证随请求发给 /tuan 的 Worker（`Authorization: Bearer`）。Worker 通过 Service Binding 调房间服务器现成的 `GET /api/me`，拿回账号的 id、邮箱、名字、是不是站长（`master`）。Service Binding 是两个 Worker 之间的内部通道，写在 `tools/tuan/wrangler.jsonc` 里，不走公网：不会被 changle.ca 的机器人防护拦（它拦过 GitHub 的机器，见 `docs/briefs/events.md` 11 月 5 日那条），也不用新钥匙。[Cloudflare：Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/)
- 认出来的结果按凭证的哈希缓存 5 分钟，不用每点一下都去问房间服务器。哪个账号管哪家店，记在这边的 `shop_members` 表。
- 没登录时：A1 先给一个去 changle.ca/me 登录的按钮。A2 在 /tuan/my 里放邮箱验证码的表单，调的还是房间服务器的 `/api/auth/code` 和 `/api/auth/verify`，登录后凭证存回同一个地方，主站也跟着登录。新账号注册现在要填名字、电话、城市、性别、满 18 岁（`hub.ts` 的 `profileFields`）；商家第一次来要不要填这么多，A2 时和账号对话商量。
- 微信里的浏览器有自己的存储，商家在微信里第一次打开要再登录一次。邮箱验证码在微信里能用；Google 登录在微信里会被 Google 拦（`tools/suibian/README.md`）。
- 要小心的一点：同一个网址，意味着 /tuan 页面上的脚本读得到主站的登录凭证。所以商家写的字一律当文字显示；上传的只收重新压过的图片，按固定的图片类型发出去；页面加内容安全策略。
- 买家不登录。

### 2. 数据库：用 D1

- 数据是互相关联的几张表（店、团、商品、订单），发现页、站长后台、按订单号查单都要跨店查。D1 是一个库，一句 SQL 就查到。Durable Objects 自带的 SQLite 是每个对象各一个库，适合一桌一个房间（随便的桌子、房间服务器）；用它，跨店查还得另建一份索引。
- 仓库里有现成的做法可以照着来：玩什么（`tools/events`）用 D1，迁移文件编号、Worker 自己执行，测试在 Workers 的运行环境里跑本地 D1；库写在 `wrangler.jsonc` 里不带 id，第一次部署自己建，不用进 Cloudflare 后台点。
- 免费额度：每天读 500 万行、写 10 万行；每个库 500 MB，全账号 5 GB、10 个库。一单写 10 行以内，离上限很远。[D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)、[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)
- 误删误改能救：D1 的 Time Travel 能回到 7 天内的任何一分钟（免费版）。
- 限量和每人限购不会超卖：下单用一个 `batch`（一个事务），库存用 `CHECK` 约束兜底，超了整单回滚。
- V1 没有要实时推到手机上的东西。以后接龙名单要实时跳，再加一个 Durable Object 只管推送，数据还在 D1。

### 3. 图片：先放 KV，不花钱，不用动 Cloudflare 后台

- 建议先放 KV，和玩什么 10 月 31 日的决定一样（免费版，不用 R2）。KV 写在 `wrangler.jsonc` 里，第一次部署自己建：不花钱，不用绑卡，不用进后台。
- 上传前在手机上压到长边 1200 像素、150 到 200 KB 左右；服务器超过 400 KB 不收，只收 JPEG、PNG、WebP；按内容的哈希起名，复制上一团不会多存一份；每个团最多 12 张。
- 免费额度：KV 全账号一共 1 GB，每天写 1,000 次、读 10 万次，和玩什么共用。[KV limits](https://developers.cloudflare.com/kv/platform/limits/) 玩什么每天存的原始页面留 30 天，按仓库里的样本页面大小粗估占 200 MB 左右。这个数没在后台核对过，开工时看一眼（只看不改）。剩下的够放几千张图，前 10 家够用。
- 要配一条清理规则：一个团结束多久以后，没被别的团用到的图删掉。这是删数据，等 Steve 定；建议和买家联系方式一样，90 天。
- 每张图每次打开算一次 Worker 请求（免费版全账号每天 10 万次，站上所有 Worker 共用）。图片地址带哈希，让手机长期缓存；一个买家看一个团大约十几次请求。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- 另一条路是 R2（对象存储）：每月免费 10 GB、写 100 万次、读 1,000 万次，流量不收钱，超出后每 GB 每月 0.015 美元，是放图片的正路。但开通要在 Cloudflare 后台走一遍结账流程，几份第三方说明都写这一步要绑卡或 PayPal，超出免费额度会自动扣费。这是花钱和动设置的事，要 Steve 自己决定、自己操作。[R2 pricing](https://developers.cloudflare.com/r2/pricing/)、[R2 get started](https://developers.cloudflare.com/r2/get-started/)
- 代码里存图只走一个小接口。以后从 KV 搬到 R2，只改一个文件，再跑一次搬运，图片的网址不变。
- 订单邮件是另一样新增的用量。Resend 免费版每月 3,000 封、每天 100 封，和登录验证码共用一个账号。[Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing) 一单发一封的话，一个热门的团一天就能把额度用完，那天谁都收不到登录验证码。所以做成合并通知：每家店第一单马上发，之后最多半小时一封；跟一单全部加起来每天不超过 60 封。
- Resend 的钥匙只在房间服务器上。/tuan 要发信有两条路：Steve 在新 Worker 上再放一次钥匙；或者请房间服务器代发（它加一个只给内部 Worker 用的发信入口，不用新钥匙，每天的上限也在一处管）。建议后一种，见「交给别的对话」。

### 4. 微信里的三件事：查到的现状、预期，和怎么在真机上验证

查到的说法大多来自开发者的文章，有的是几年前的，都以真机为准。changle.ca 在安卓微信里打得开（Steve 11 月 11 日看过世界时钟，`docs/briefs/tools.md`）。

链接发进群长什么样：

- 直接粘贴的网址，在微信里就是一行蓝字。卡片只在微信的浏览器里点右上角、选转发给朋友时才出现。
- 2017 年 4 月 25 日起，没有接微信 JS-SDK 的网页，分享卡片一律用默认的缩略图和标题简介，不能自定义；接 JS-SDK 要一个认证过的公众号。[JSSDK 自定义分享接口的策略调整（转述）](https://www.jianshu.com/p/8456d7350503) 我们没有公众号，所以预期是：卡片上是页面的标题和一张灰色的默认图。
- 能做的：把每个开团页的页面标题写好（店名、团名、截单时间）。主要的分享方式是海报和接龙文案，和方案想的一样。
- 验证，今天就能做，不用新代码：把 https://changle.ca/g/in-all-seriousness 发给文件传输助手，一次直接粘贴，一次在微信里打开后点右上角转发，各截一张图。iPhone 和安卓各试一次更好。A1 的预览页上线后，用开团页再试一次，顺便看微信会不会弹出非微信官方网页的提示。

导出能不能用：

- 查到的：安卓微信的浏览器拦下载，会提示去浏览器打开；iPhone 微信对表格文件多半是预览，不是保存；网页里现做的文件（blob）点下载没有反应。[CSDN：微信浏览器中 H5 实现文件下载](https://blog.csdn.net/weixin_47146612/article/details/129175070)
- 所以汇总表做三条路：复制表格（能粘到微信、Excel、Google 表格）；发到我邮箱（CSV 当附件，发到商家的登录邮箱）；下载 CSV（在微信里换成去浏览器打开的提示）。CSV 开头带 BOM，Excel 打开中文才不乱码。
- 验证：A1 的商家订单页上放这三个按钮，Steve 在微信里各点一次，告诉这个对话哪个成了。

长按能不能识别收款码：

- 查到的：几篇 2022 年前后的开发者文章说，微信 8.0.16 之后不让网页里的收款码长按识别，为的是限制不是当面的收款；聊天里的收款码图片当时还能长按。微信开放社区 2025 年 5 月有一条回答也说支付码不支持长按识别。[CSDN](https://blog.csdn.net/xlkcsn/article/details/127170490)、[千乐微云](http://www.jnqianle.cn/problem/5434.html)、[微信开放社区](https://developers.weixin.qq.com/community/develop/doc/00002a855a49f83b3b635ba196b400)
- 预期：网页上的收款码长按认不出来；普通二维码和加好友的二维码可以。
- 验证：
  1. 今天就能做：Steve 把自己的收款码图片发给文件传输助手，长按，看有没有识别。
  2. A1 的预览页上线后：在测试店里依次上传收款码、赞赏码、加好友的二维码，用另一个微信号打开订单页，各长按一次（自己不能付给自己）。
- 结果怎么用：收款码果然不行的话，订单页的微信付款写成加商家微信转账、备注订单号，微信号给一个复制按钮，再放加好友的二维码。e-Transfer 排第一：邮箱、金额、订单号各一个复制按钮。
- 技术上要守的：收款图必须是真的 `<img>`，不能画在 canvas 上，也不能当背景图；边长不小于 240 像素；主站的页面默认关掉了长按菜单（`site/src/styles/global.css` 的 `page-defaults` 里有 `-webkit-touch-callout: none`），/tuan 照主站的规矩写样式时，这张图要单独放开。

## 还剩什么

- 等 Steve：四个问题的建议行不行；说开工。
- 等 Steve：常乐点单和 Market Alley Meat 的截图或代码。
- A0 的结果这个对话还不知道：哪几家答应试用，卫生局回了什么。
- 方案「待你决定」的 8 条都还没打勾（`docs/tuan.md`）：名字和路径、收费、家里做的低风险食品收不收、夜色底还是浅色、接龙名单默认公开还是匿名、联系方式留多久、大米团当不当第一家、哪条线先停。对话名和路径是照方案的工作名开的（跟一单、changle.ca/tuan）；路径上线后不好改，A1 上预览页之前再跟 Steve 确认一次。A1 还用得到的是接龙名单和大米团这两条。
- A1 上预览页之前要 Steve 点头的一步：在 Cloudflare 新建 Worker `tuan`，接上 GitHub（Workers Builds：根目录 `/tools/tuan`，部署命令 `npx wrangler deploy`，只盯 `tools/tuan/*`，照 `tools/events/README.md` 的「Live」）。这是动 Cloudflare 设置。
- A1：手工建一个商家，做开团页、购物车、下单、订单页、商家订单列表、邮件通知，藏在 /tuan/preview（不进搜索）。过关标准在方案的「分期与验收」。A2、A3 也在那里。
- Codex 的任务卡（方案点了名的：数据表迁移、导出、海报绘制）：等 A1 的骨架和接口定了再写。

## 交给别的对话

- 现在没有要别的对话动手的。A1 用房间服务器现成的 `GET /api/me`，不用改它。
- 等 Steve 定了订单邮件怎么发再交：请「平台 · 账号与头像」在房间服务器加一个只给内部 Worker 用的发信入口（用它现有的 Resend 钥匙和 `hub.ts` 的 `mail()` 那一套），带每天的上限。
- A2、A3 再交：站长审核那一栏在 /admin（`site/src/account/`，账号对话的地盘）。

## 最近的改动

还没有代码。

## 记录

- 2026-11-12 建档案；把方案从 Claude 文档抄到 `docs/tuan.md`（文档第 17 版；「其他风险」表少抄一行私人提醒，没放进公开仓库）；在档案目录加一行。读了 AGENTS.md、HANDOFF.md、docs/briefs/README.md、docs/DESIGN.md、随便和玩什么的 README 和 wrangler.jsonc、房间服务器的登录部分。开工时开着的 PR 有 7 个（#404、#373、#364、#357、#351、#267、#235），没有碰 /tuan 的。四个问题的建议写在「现在」。

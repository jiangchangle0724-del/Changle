# 会员（Membership）

Steve 2026-11-26 通过了会员方案，十条都照建议。方案原文是 Claude 文档「changle.ca 会员方案」：
https://claude.ai/artifact/6a6eF3biYmpGMqTQbh1TyZ 。这份是仓库里的准绳：定了什么、做到哪一步、各个对话要做什么。

## 定了的事

- 随便、两清、MoneyLens：每个账号每样送 3 次，用完不再送（不是每月送）；会员不限次。
- 算一次的是：随便开一桌，两清开一个账本，MoneyLens 导入一份账单。被拉进桌子、账本的人永远不算，也不用登录。
- 玩什么不收费、不计次。
- 跟一单开店要会员，开店还是要 Steve 审核。现在已经开着的店给 30 天免费过渡。会员到期，店先暂停接单，续了就恢复，订单和资料都留着。
- MoneyLens 内测（邀请制 25 人）期间不计次，正式开放再按 3 次算。
- 三档：月付 C$5.20，年付 C$52（等于 10 个月），终身 C$520，全站只卖 5 个，公开卖，会员页写还剩几个。
- 用加元收，现在不另外加税（GST 和 BC PST 都在门槛以下；快到门槛再算，找会计确认）。
- 用 Stripe 收：卡、Apple Pay、Google Pay。第一版不接微信支付（它不能自动续费；以后要开，在 Stripe 后台开就行）。
- 退款：月付不退；年付和终身付款 7 天内全额退（Steve 在 Stripe 后台点）。
- 会员头像旁边有一个小皇冠。
- 站长账号不计次；站长在后台能手动送会员（一个月、一年、终身）、结束会员。
- 随便改成认主站账号，Google 登录留一个月过渡。

## 分四步

1. 计次和会员页，还不收钱。平台这边做完了（全站设计这个对话，2026-11-26），见下面「已经有的」。各个工具接上计次，是各自对话的事，见「各个对话要做的」。
2. 接 Stripe 测试模式。代码做完了（2026-11-26，见下面「已经有的（第 2 步）」）。Steve 注册了 Stripe（沙盒）。只要一把钥匙：沙盒的 secret key 放进 Cloudflare `changle-rooms` 的 `STRIPE_SECRET_KEY`（加密的 Secret），然后在后台「会员」上面的「付款」点「设置付款」，价格、账单页、付款通知（webhook）都自动建好。钥匙不进聊天、不进仓库。然后用测试卡把三档走一遍。
3. 正式收钱：条款和退款说明上线（中英文），切到正式模式；Steve 用自己的卡买一次月付再退，确认钱到账。
4. 跟一单开店接上会员（见下面跟一单那条）。

## 已经有的（第 1 步，平台）

- 规矩和类型：`site/src/shared/member.ts`（`COUNTED`、`FREE_USES` = 3、`LIFE_SLOTS` = 5、`PRICES`、`Standing`、`UseResult`）。
- 存在房间服务器的 hub 里：`site/worker/membership.ts`。表 `members`（谁是会员、到哪天、哪来的）和 `uses`（每个账号每个工具用了几次）。一次使用是一步查完再记，不会多出第 4 次。
- 给别的 Worker 的门：`site/worker/member.ts`，具名入口 `Member`，只能用 service binding 进来：
  `"services": [{ "binding": "MEMBER", "service": "changle-rooms", "entrypoint": "Member" }]`
  - `await env.MEMBER.use(uid, "split")`：算次数的那一步之前问。回 `{ ok, member, left }`：`ok` 为真才做这一步（已经记了一次，会员和站长不记）；为假就不做，告诉用户免费次数用完了，链接到 changle.ca/member。
  - `await env.MEMBER.status(uid)`：显示还剩几次用。回 `{ member, master, left }`，账号不在就是 null。
  - 连不上 hub 时 `use` 会抛错：请用户过一会儿再试，不要放行，也不要算他用完。
- 网页：changle.ca/member（会员页，`site/src/member/`）；我的主页上有一行会员或还剩几次；别人的主页和首页右上角的头像旁边有小皇冠；后台（/admin）有「会员」一节，按邮箱送会员、结束会员。
- 接口：`GET /api/member`（谁都能看：终身还剩几个）、`GET /api/me/member`（登录后：自己的会员和还剩几次）、`GET`、`POST /api/admin/members`（站长）。`/api/me` 的 `user.member` 是自己的会员；公开资料里会员有 `member: true`。
- 测试：`site/tests/hub.test.ts` 的「会员」几条。

## 已经有的（第 2 步，付款）

- 代码：`site/worker/stripe.ts`（`Pay`），接在 hub 上（`site/worker/hub.ts` 的 `stripeRoute`、`stripeWebhook`），Stripe 官方 SDK（`stripe`，API 版本跟着 SDK：2026-11-18.endive）。会员页 `site/src/member/MemberPage.tsx`，后台 `site/src/account/AdminStripe.tsx`。
- 买：会员页每一档下面有按钮，点了去 Stripe 自己的付款页（Checkout，卡号不经过我们）。月付、年付是订阅（flexible billing），终身是一次付清。不写死付款方式：Stripe 后台「付款方式」里开了什么就显示什么（微信支付、支付宝以后在那里开，不用改代码；它们不能自动续费，只会出现在终身那一档）。
- 管理：会员页「管理付款」去 Stripe 的账单页（Customer Portal）：换卡、月付年付互换（差价马上算）、取消（用到这一期结束）、看收据。
- 付完回到 changle.ca/member?paid=…，页面马上问 hub，hub 去 Stripe 核实就开通，不等 webhook。
- Stripe 的通知进 `https://rooms.changle.ca/api/stripe/webhook`，验签名，每个事件只办一次，办的时候再去 Stripe 拿一遍最新的订阅，所以先后乱了也不出错。听这 12 个：Checkout 完成、慢付款到账或失败、页面过期；订阅建、改、结束；发票付了、没付上；全额退款；争议；疑似盗刷提醒。
- 续费没付上（past_due）：会员不延长，用到已经付了的那天；补上了再接着。订阅结束（取消、没付）：会员到结束那天为止。
- 终身 5 个：有人在付款页上（最多 31 分钟），那个名额先占着，别人看到少一个；页面关了或过期就放回来。银行转账这种慢付款，占着等到账（最多 14 天）。
- 自动处理的：全额退款，终身的名额放回去，订阅马上取消、会员当时结束；部分退款不动。争议：会员结束，给站长发邮件。疑似盗刷提醒：只给站长发邮件（退不退款站长定）。后台结束一个付费会员，或者账号删了：订阅在 Stripe 里马上取消（不退钱，退款在 Stripe 后台点；取消失败会给站长发邮件）。后台送终身给正在订阅的人：订阅改成到期不续。同一个人开新付款页，旧的那个会关掉，不会付两次；万一一个账号有两个订阅，给站长发邮件。
- 测试模式（钥匙是 sk_test_ 或 rk_test_）：只有站长和管理员（`ADMIN_EMAILS`）看得见按钮、能付；会员页写着用测试卡 4242 4242 4242 4242。换成正式钥匙（sk_live_ 或 rk_live_）就所有人都能买；正式模式再点一次「设置付款」，正式的价格和 webhook 会另建一套。
- 税：现在不加。价格设成含税（`tax_behavior: inclusive`），产品税码 `txcd_10103000`（SaaS，个人用）。以后登记了 GST/PST，Cloudflare 加变量 `STRIPE_TAX=on`，付款页就自动算税，会员付的钱不变（税从价钱里出）。Stripe 后台「税务」里填好营业地址，就能免费看离门槛还有多远。
- 存在 hub 里的表：`stripe_kv`（建好的价格、账单页、webhook 的编号和签名密钥，按测试/正式分开，不显示给任何人）、`stripe_customers`（账号对应的 Stripe 客户）、`stripe_subs`（订阅现在的样子）、`stripe_events`（办过的事件，留 60 天）、`life_sales`（每一笔终身）。会员本身还是 `members` 表，`source = 'stripe'`。
- 接口：`GET /api/member` 多了 `pay`（"live"、"test" 或 null：这个人现在能不能买）；`GET /api/me/member` 多了 `pay`、`sub`、`billing`；`POST /api/stripe/checkout {plan, lang, site}`、`POST /api/stripe/portal {lang, site}`、`GET /api/stripe/done?id=`；后台 `GET /api/admin/stripe`、`POST /api/admin/stripe/setup`。
- 正式上线时建议用受限钥匙（rk_live_），只给这些权限：Checkout Sessions 写、Customers 写、Products 写、Prices 写、Subscriptions 写、Customer portal 写、Webhook Endpoints 写、Invoices 读、Invoice payments 读、Charges 读。
- 本地跑：`stripe listen --forward-to 127.0.0.1:8787/api/stripe/webhook`，把它给的签名密钥写进 `site/worker/.dev.vars` 的 `STRIPE_WEBHOOK_SECRET`（有了它，「设置付款」就不建 webhook）。
- 测试：`site/tests/hub.test.ts` 的「付款」17 条（用一个假的 Stripe，事件真签名）。
- 换成正式钥匙以后，沙盒的 webhook 还会打过来：hub 认得出是另一个模式的，回个收到就不管了。

## 各个对话要做的

- 工具 · 两清：在 `tools/split` 的 wrangler.jsonc 里加上 `MEMBER`（上面那行），开新账本之前 `use(uid, "split")`；开账本的按钮旁边写还剩几次（`status`）；用完了就不开，指向 changle.ca/member。加入别人的账本、记账永远不算。
- 工具 · 随便：先改成认主站账号（两清和跟一单已经这样），Google 登录留一个月过渡；然后开一桌之前 `use(uid, "suibian")`，开桌页写还剩几次。点链接加入别人的桌、投票不算。
- 工具 · 跟一单：申请开店和店铺营业都要会员（`status(uid).member` 不为 null，或者 `master`）。现在开着的店从上线那天起免费 30 天。会员到期，店暂停接单，不删东西；续了就恢复。原来手记月费的 `fee_log` 和 A3 的「月费到期自动暂停」改成跟着会员走。
- 工具 · MoneyLens：内测期间什么都不用做。正式开放时，导入一份账单之前 `use(uid, "moneylens")`。计次只记次数，账单内容照旧只在用户自己的库里。
- 平台 · 账号与头像：知会。会员在 hub 里，后台多了「会员」一节，`/api/me` 多了 `member`，公开资料多了 `member: true`。房间里座位上的头像还没有小皇冠（要动协议，以后再说）。
- 玩什么：不用做。

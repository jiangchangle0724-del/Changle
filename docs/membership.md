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
- 用 Stripe 收：卡、Apple Pay、Google Pay。第一版不接微信支付（它不能自动续费）。
- 退款：月付不退；年付和终身付款 7 天内全额退（Steve 在 Stripe 后台点）。
- 会员头像旁边有一个小皇冠。
- 站长账号不计次；站长在后台能手动送会员（一个月、一年、终身）、结束会员。
- 随便改成认主站账号，Google 登录留一个月过渡。

## 分四步

1. 计次和会员页，还不收钱。平台这边做完了（全站设计这个对话，2026-11-26），见下面「已经有的」。各个工具接上计次，是各自对话的事，见「各个对话要做的」。
2. 接 Stripe 测试模式。Steve 先注册 Stripe（免费），填资料和收款的银行账户，把两把钥匙自己粘到 Cloudflare 的 `changle-rooms` Worker：`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`。钥匙不进聊天、不进仓库。然后用测试卡把三档走一遍。
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

## 各个对话要做的

- 工具 · 两清：在 `tools/split` 的 wrangler.jsonc 里加上 `MEMBER`（上面那行），开新账本之前 `use(uid, "split")`；开账本的按钮旁边写还剩几次（`status`）；用完了就不开，指向 changle.ca/member。加入别人的账本、记账永远不算。
- 工具 · 随便：先改成认主站账号（两清和跟一单已经这样），Google 登录留一个月过渡；然后开一桌之前 `use(uid, "suibian")`，开桌页写还剩几次。点链接加入别人的桌、投票不算。
- 工具 · 跟一单：申请开店和店铺营业都要会员（`status(uid).member` 不为 null，或者 `master`）。现在开着的店从上线那天起免费 30 天。会员到期，店暂停接单，不删东西；续了就恢复。原来手记月费的 `fee_log` 和 A3 的「月费到期自动暂停」改成跟着会员走。
- 工具 · MoneyLens：内测期间什么都不用做。正式开放时，导入一份账单之前 `use(uid, "moneylens")`。计次只记次数，账单内容照旧只在用户自己的库里。
- 平台 · 账号与头像：知会。会员在 hub 里，后台多了「会员」一节，`/api/me` 多了 `member`，公开资料多了 `member: true`。房间里座位上的头像还没有小皇冠（要动协议，以后再说）。
- 玩什么：不用做。

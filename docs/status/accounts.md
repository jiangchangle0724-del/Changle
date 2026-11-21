# 平台 · 账号与头像 · 状态

- 现状：账号、个人页、头像、好友聊天、战绩、后台、3D 小人（/me/figure，站长 /me 名字下面有入口）都在线上。详细历史在 docs/briefs/accounts.md。
- 11-20：MoneyLens 要的三件（docs/moneylens/accounts-requests.md）。1 交接码做好：`POST /api/handoff` 发码（256 位、60 秒、一次、只给名单里的 app，库里只存 SHA-256，每人每分钟 5 个、每天 100 个），`Handoff` 入口（`worker/handoff.ts`）给 MoneyLens 兑换和问账号还在不在。2 删号通知改成重试到成功（`gone_notices` 表加 alarm，一分钟起，最长一天一次），两清已经走这条路。
- 待办：MoneyLens 第一次部署以后，在 `site/worker/wrangler.jsonc` 的 services 加 `MONEY`（moneylens 的 Internal），删号就会通知它。3 换邮箱还没做（Phase 3 前要有）。
- 决定：码兑换不管对错都作废；`exists` 问错了就报错，不回空（空会让对方删掉所有人的数据）。
- 测试：`tests/handoff.test.ts`（CI 里跑）；本地用一个假 MoneyLens 走过整个来回。

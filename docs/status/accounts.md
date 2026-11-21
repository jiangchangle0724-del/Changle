# 平台 · 账号与头像 · 状态

- 现状：账号、个人页、头像、好友聊天、战绩、后台、3D 小人都在线上，历史在 docs/briefs/accounts.md。MoneyLens 要的三件（docs/moneylens/accounts-requests.md）11-20 做完：
  - 交接码：`POST /api/handoff` 发码，`Handoff` 入口给它兑换。
  - 删号通知重试到成功：`gone_notices` 表加 alarm。
  - 换邮箱：/me 编辑主页里换，新邮箱收码，旧邮箱收通知，回信到站长。
- 决定：码兑换不管对错都作废；`exists` 问错（有一个 id 样子不对也算）就报错，不回空；用过 MoneyLens 的账号删号或换邮箱，MONEY 没绑也记下，绑上后送到；管理员的邮箱不能在页面上换；问邮箱有没有人用先算进限额。
- 待办：MoneyLens 档案写「可以加了」后，在 `site/worker/wrangler.jsonc` 的 services 加 `{ "binding": "MONEY", "service": "moneylens", "entrypoint": "Internal" }`。换邮箱通知的回信想去别的邮箱，就在 Cloudflare 给 changle-rooms 设 `CONTACT_EMAIL`（改设置，先问 Steve）。
- 测试（都在 CI）：`tests/handoff.test.ts`、`tests/email-change.test.ts`、`tests/hub.test.ts`。最后一个是真的 hub 跑在 Node 的 SQLite 上，替身运行时在 `tests/support/`。

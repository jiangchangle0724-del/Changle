# 平台 · 账号与头像 · 状态

- 现状：账号、个人页、头像、好友聊天、战绩、后台、3D 小人都在线上，历史在 docs/briefs/accounts.md。MoneyLens 要的三件（docs/moneylens/accounts-requests.md）：
  - 交接码（`POST /api/handoff`、`Handoff` 入口）和删号通知重试到成功（`gone_notices` 加 alarm），11-20 合并上线（#690）。
  - 换邮箱写好了（#704），没合并。
- 决定：码兑换不管对错都作废；`exists` 问错（有一个 id 样子不对也算）就报错，不回空；用过 MoneyLens 的账号删号或换邮箱，MONEY 没绑也记下，绑上后送到；管理员的邮箱不能在页面上换；发码时不说邮箱有没有人用。
- 待办：
  - #704 等 Steve 定：只凭登录的手机就能换，还是要旧邮箱确认或等 3 天（见 brief「还剩什么」）。定了就做完，再审一轮，合并。
  - MoneyLens 档案写「可以加了」后，在 `site/worker/wrangler.jsonc` 的 services 加 `{ "binding": "MONEY", "service": "moneylens", "entrypoint": "Internal" }`。
- 测试（都在 CI）：`tests/handoff.test.ts`、`tests/email-change.test.ts`、`tests/hub.test.ts`（真的 hub 跑在 Node 的 SQLite 上，替身运行时在 `tests/support/`）。

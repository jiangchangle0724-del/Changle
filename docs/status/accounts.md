# 平台 · 账号与头像 · 状态

- 现状：账号、个人页、头像、好友聊天、战绩、后台、3D 小人都在线上，历史在 docs/briefs/accounts.md。MoneyLens 要的三件（docs/moneylens/accounts-requests.md）：
  - 交接码（`POST /api/handoff`、`Handoff` 入口）和删号通知重试到成功（`gone_notices` 加 alarm），11-20 合并上线（#690）。
  - 换邮箱和「退出其他手机」（#704），11-21 上线：新旧邮箱各一个码马上换；旧邮箱收不到就等 3 天，可取消；换好时别的手机退出。
- 决定：码兑换不管对错都作废；`exists` 问错（有一个 id 样子不对也算）就报错，不回空；用过 MoneyLens 的账号删号或换邮箱，MONEY 没绑也记下，绑上后送到；管理员的邮箱不能在页面上换；发码时不说邮箱有没有人用。
- 待办：
  - 以后可加：后台看换邮箱记录、帮人改回去。
  - MoneyLens 档案写「可以加了」后，在 `site/worker/wrangler.jsonc` 的 services 加 `{ "binding": "MONEY", "service": "moneylens", "entrypoint": "Internal" }`。
- 测试（都在 CI）：`tests/handoff.test.ts`、`tests/email-change.test.ts`、`tests/hub.test.ts`（真的 hub 跑在 Node 的 SQLite 上，替身运行时在 `tests/support/`）。

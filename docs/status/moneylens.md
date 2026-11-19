# MoneyLens · 状态

- 现状：Phase 0（决定和打地基），同时在写 Phase 1 的核心库。线上什么都没有。要求在 docs/moneylens.md，详细的在 docs/briefs/moneylens.md。
- 决定（Steve）：D1 加密保险库；D2 应用在 money.changle.ca，工具页有卡片，介绍页 changle.ca/tools/finance；D4 BC、19 岁、邀请制、25 人；D5 外部 AI 默认关、用户自选；D6 留在免费版；不点名银行，谁的银行账单都能传（2026-11-19）。D3 在 Phase 3 前。
- 铁规矩：真实财务数据不进仓库、CI、截图、日志、AI 工具；功能挡在允许名单后面，Steve 开闸；登录、会话、加密、同步、权限的改动要有非作者的审查记录才合并。
- 已有：docs/moneylens/ 下的威胁模型、数据清单、安全评估、给账号对话的需求；tools/moneylens/src/core 核心库（读 OFX/QFX 和任何银行的 CSV 账单、对账、去重、转账配对、分类、汇总、订阅识别）；src/vault 保险库加密（AES-256-GCM，口令 PBKDF2 60 万次，恢复码带校验），经过五轮独立审查，已合并（#653）；格式逐字节写在安全评估 1.1。129 个测试，CI 是 moneylens.yml。
- 别动：tests/golden.ts（存下来的保险库，不能重新生成）；口令的折法和包装格式（改了老保险库打不开，要改只能加新版本）。口令底线两头都会错是故意的，数字在安全评估 1.4。
- 下一步：文字版 PDF 账单的通用读取器 → 夹具工具 → 把记录装进加密块和根块 → Worker 和每人一个 Durable Object → 页面。导入页面要按 CSV 读取器的四条约定做（tools/moneylens/README.md）。另一家模型的第二意见：任务卡 docs/codex-tasks/moneylens/C1，等 Codex 额度恢复后发。
- 等 Steve：把 v1 和最早的功能说明放进 Project 文档；中文名先用「心里有数」（他回了可以，没选）；Phase 2 要他自己的真账单过夹具工具。
- 交出去的：账号对话做交接码、删号通知、换邮箱（docs/moneylens/accounts-requests.md）；首页对话放全站 Privacy Policy 和 Terms。

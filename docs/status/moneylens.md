# MoneyLens · 状态

- 现状：Phase 0（决定和打地基）。线上什么都没有。要求在 docs/moneylens.md，详细的在 docs/briefs/moneylens.md。
- 决定（2026-11-18，Steve）：D1 加密保险库；D2 应用在 money.changle.ca，工具页有卡片，介绍页 changle.ca/tools/finance；D5 外部 AI 默认关、用户自选。D4（BC、19 岁、邀请、25 人）和 D6（免费版）先按推荐记，等他点头。D3 在 Phase 3 前。
- 铁规矩：真实财务数据不进仓库、CI、截图、日志、AI 工具；功能挡在允许名单后面，Steve 开闸；登录、会话、加密、同步、权限的改动要有非作者的审查记录才合并。
- 已有：docs/moneylens/ 下的威胁模型、数据清单、安全评估、给账号对话的需求；tools/moneylens/src/core 核心库（读 OFX/QFX、对账、去重、转账配对、分类、汇总、订阅识别）；src/vault 保险库加密（AES-256-GCM，口令 PBKDF2 60 万次，恢复码带校验），经过三轮独立审查。129 个测试，CI 是 moneylens.yml。
- 别动：tests/golden.ts（存下来的保险库，不能重新生成）；口令的折法和包装格式（改了老保险库打不开，要改只能加新版本）。口令底线两头都会错是故意的，数字在安全评估 1.4。
- 下一步：把记录装进加密块和根块 → 夹具工具 → Worker 和每人一个 Durable Object → 页面。CSV 解析器等 Steve 说银行、做出合成账单。等 Codex 额度恢复后让它再审一遍 src/vault。
- 等 Steve：D4、D6 点头；先支持哪几家银行；把 v1 和最早的功能说明放进 Project 文档；中文名。
- 交出去的：账号对话做交接码、删号通知、换邮箱（docs/moneylens/accounts-requests.md）；首页对话放全站 Privacy Policy 和 Terms。

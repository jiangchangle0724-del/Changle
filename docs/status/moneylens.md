# MoneyLens · 状态

- 现状：Phase 0（决定和打地基），同时在写 Phase 1 的核心库。线上什么都没有。要求在 docs/moneylens.md，详细的在 docs/briefs/moneylens.md。
- 决定（Steve）：D1 加密保险库；D2 应用在 money.changle.ca，工具页有卡片，介绍页 changle.ca/tools/finance；D4 BC、19 岁、邀请制、25 人；D5 外部 AI 默认关、用户自选；D6 留在免费版；不点名银行，谁的银行账单都能传（2026-11-19）。D3 在 Phase 3 前。
- 铁规矩：真实财务数据不进仓库、CI、截图、日志、AI 工具；功能挡在允许名单后面，Steve 开闸；登录、会话、加密、同步、权限的改动要有非作者的审查记录才合并。
- 已有：docs/moneylens/ 下的威胁模型、数据清单、安全评估（0.17）、给账号对话的需求；「账单试读」页面（一个本地打开的文件，联不了网）；tools/moneylens/src/core 核心库（读 OFX/QFX 和任何银行的 CSV 账单、PDF 账单（第一种版式：信用卡月结单，#808）、对账、去重、转账配对、分类、汇总、订阅识别）；src/vault 保险库：加密（五轮审查加 Codex 的第二意见），以及记录怎么装进加密的块、怎么在设备和服务器之间同步合并，和浏览器里的密文缓存（#734、#778，Codex 审了四轮，十二条发现都改了，结论通过，2026-11-25 合并）。应用层第一块：账单进库的预览和保存（src/app/ledger.ts，#777）。服务器第一块：同步的两个调用跑在每人自己的 SQLite 上（src/server/chunks.ts，#782，Codex 审了两眼都通过）。第二块：会话和请求检查（src/server/sessions.ts、request.ts，#789，Codex 审过通过）。还没有 Worker。Steve 的第一份真账单（信用卡 CSV）带回三处修改（#799）：卡的正负、编出来的版本里一张卡还是一张卡、试读页面第 2 版会说为什么读不了。#814 上 402 个测试，「门」的分支上 414 个。
- 别动：tests/golden.ts（存下来的保险库，不能重新生成）；口令的折法和包装格式（改了老保险库打不开，要改只能加新版本）。口令底线两头都会错是故意的，数字在安全评估 1.4。
- 下一步：服务器外壳（#814）和「门」（#887：服务器保管包装过的钥匙、应用的第一批页面、主站 changle.ca/tools/finance 那一页；评估 0.17）都审过、合并了。审查人是 Claude Opus 5.5（单独的代理；Codex 的应用把审查请求挡了），记录在 docs/moneylens/reviews/。接着：把 `moneylens` Worker 接上部署（闸门关着），检查日志和限速器，再只对 Steve 开闸；然后是设备和事件页、清空保险库、导入页（各块要守的要求在 docs/briefs/moneylens.md 的「还剩什么」）。
- 等 Steve：想让 Codex 接着当审查人的话，在它的应用里开「Daybreak」（它说的有授权的安全工作模式）；用第 3 版试读页面（下载后用 Chrome 或 Edge 直接打开）试那份 PDF（看对不对得上）和信用卡 CSV，再试银行账户的 PDF 月结单；把「摘要」和「编出来的版本」发回来，说是哪家银行、读得对不对；把 v1 和最早的功能说明放进 Project 文档；中文名先用「心里有数」。
- 交出去的：账号对话的三件事都上线了（交接码和删号通知 #690，换邮箱 #704）；MoneyLens 第一次部署后他们要在主站加 MONEY 绑定。首页对话放全站 Privacy Policy 和 Terms。会员（Steve 11-26 定）：内测期间不计次；正式开放后导入一份账单之前问 `MEMBER.use(uid, "moneylens")`，见 docs/membership.md。

# MoneyLens · 状态

- 现状：Phase 0（决定和打地基），同时在写 Phase 1 的核心库。线上什么都没有。要求在 docs/moneylens.md，详细的在 docs/briefs/moneylens.md。
- 决定（Steve）：D1 加密保险库；D2 应用在 money.changle.ca，工具页有卡片，介绍页 changle.ca/tools/finance；D4 BC、19 岁、邀请制、25 人；D5 外部 AI 默认关、用户自选；D6 留在免费版；不点名银行，谁的银行账单都能传（2026-11-19）。D3 在 Phase 3 前。
- 铁规矩：真实财务数据不进仓库、CI、截图、日志、AI 工具；功能挡在允许名单后面，Steve 开闸；登录、会话、加密、同步、权限的改动要有非作者的审查记录才合并。
- 已有：docs/moneylens/ 下的威胁模型、数据清单、安全评估（0.12）、给账号对话的需求；「账单试读」页面（一个本地打开的文件，联不了网）；tools/moneylens/src/core 核心库（读 OFX/QFX 和任何银行的 CSV 账单、PDF 账单（第一种版式：信用卡月结单，#808）、对账、去重、转账配对、分类、汇总、订阅识别）；src/vault 保险库：加密（五轮审查加 Codex 的第二意见），以及记录怎么装进加密的块、怎么在设备和服务器之间同步合并，和浏览器里的密文缓存（#734、#778，Codex 审了四轮，十二条发现都改了，结论通过，2026-11-25 合并）。应用层第一块：账单进库的预览和保存（src/app/ledger.ts，#777）。服务器第一块：同步的两个调用跑在每人自己的 SQLite 上（src/server/chunks.ts，#782，Codex 审了两眼都通过）。第二块：会话和请求检查（src/server/sessions.ts、request.ts，#789，Codex 审过通过）。还没有 Worker。Steve 的第一份真账单（信用卡 CSV）带回三处修改（#799）：卡的正负、编出来的版本里一张卡还是一张卡、试读页面第 2 版会说为什么读不了。369 个测试。
- 别动：tests/golden.ts（存下来的保险库，不能重新生成）；口令的折法和包装格式（改了老保险库打不开，要改只能加新版本）。口令底线两头都会错是故意的，数字在安全评估 1.4。
- 下一步：服务器外壳写好了、没合并（#PRNUM：Worker、每人一个 Durable Object、闸门、兑换交接码、同步走 HTTP；评估 1.8），等 Codex 审（C9）→ 合并 → 重置保险库、主站那一页、应用页面。PDF 读取器等 Steve 用第 3 版试真的那份，再照他别的账单的版式补。导入页面要按 CSV 读取器的四条约定做，存取按 README「The store」那一节和「A statement's way into the vault」做。应用层的规矩：记录 id 一律 `newId()`。给 Codex 送新提交：打成 bundle 放进它的 clone 文件夹，PR 它自己用 GitHub 连接开（见档案）。
- 等 Steve：回来说一声，我要占用屏幕十来秒把 C9 交给 Codex；用第 3 版试读页面（下载后用 Chrome 或 Edge 直接打开）试那份 PDF（看对不对得上）和信用卡 CSV，再试银行账户的 PDF 月结单；把「摘要」和「编出来的版本」发回来，说是哪家银行、读得对不对；把 v1 和最早的功能说明放进 Project 文档；中文名先用「心里有数」。
- 交出去的：账号对话的三件事都上线了（交接码和删号通知 #690，换邮箱 #704）；MoneyLens 第一次部署后他们要在主站加 MONEY 绑定。首页对话放全站 Privacy Policy 和 Terms。

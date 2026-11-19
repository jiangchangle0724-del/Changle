# 工具 · MoneyLens（moneylens）

对话名「工具 · MoneyLens」。网址：介绍页和工具页卡片在 changle.ca/tools/finance，应用在 money.changle.ca（都还没上线）。档案建于 2026-11-18；以后由这个对话维护。

## 它是什么

个人记账整理工具：把银行网站导出的账单（CSV、OFX/QFX，以后加文字版 PDF）在自己手机或电脑的浏览器里解析，对账、去重、分类，看花销、现金流、订阅、预算。用 changle.ca 的账号登录，每个人的数据只有自己能看。MoneyLens 是暂用名，中文名还没定。

要求全在 [`docs/moneylens.md`](../moneylens.md)（v2，英文，447 行）。它里面的编号（`ISO-2`、`VAULT-4`、`T-9` 这些）代码和测试里直接引用。它没写功能细节：最早的功能说明和 v1 不在仓库里也不在 Project 文档里（见「等 Steve 的事」）。

和别的工具最不一样的三点，动手前记住：

1. **真实财务数据永远不进仓库、CI、截图、PR 文字、日志和任何 AI 工具**（SEC-12）。测试只用合成数据。
2. **上线靠闸门，不靠憋着不合并**（SEC-10）。合并照常部署，但所有功能挡在服务器的允许名单后面，每过一个阶段由 Steve 开闸，日期记在这里。
3. **登录、会话、加密、同步、权限的改动，合并前要有一份不是作者本人的审查记录**（另一个模型或人，SEC-9），写在 PR 里。

## 文件

- 要求：`docs/moneylens.md`
- Phase 0 的文档：`docs/moneylens/`
  - `threat-model.md`：威胁模型第一版（十类威胁，各自的对策、测试、剩下的风险）
  - `data-inventory.md`：数据清单和流向图第一版
  - `accounts-requests.md`：要账号对话做的三件事（交接码、删号通知、换邮箱）
- 代码：`tools/moneylens/`（它的 README 写了有什么、怎么跑）
  - `src/core/`：规则，不碰浏览器也不碰 Cloudflare，测试直接导入。金额（`money.ts`，整数分）、日子（`dates.ts`）、文字和遮号（`text.ts`，账号卡号只留后四位）、CSV 读取（`csv.ts`）、按内容认文件（`sniff.ts`）、OFX/QFX 解析器（`ofx.ts`）、读文件的入口（`read.ts`，CSV 解析器登记在 `CSV_PARSERS`，现在是空的）、对账（`reconcile.ts`）、去重（`dedupe.ts`）、转账配对（`transfers.ts`）、分类（`classify.ts`）、汇总（`analytics.ts`）、数据的形状（`model.ts`）、随机 id（`ids.ts`）
  - `tests/`：每个文件一份测试；`samples.ts` 是合成的 OFX 账单（银行、人名、账号、金额全是编的）
- CI：`.github/workflows/moneylens.yml`（类型、测试、依赖审计；Action 按提交号钉死，SEC-7）
- 状态：`docs/status/moneylens.md`（十行以内，每次收尾更新）
- Codex 的任务卡：`docs/codex-tasks/moneylens/`（还没有）

共用文件里加了自己那一行：

- `docs/briefs/README.md`：表里一行

## 先读

- `docs/status/moneylens.md`，然后是这份档案的「定过的事」和「现在」
- `docs/moneylens.md`：第 1 节（决定）、第 4 节（架构）、第 9 节（阶段）、第 10 节（测试）；做哪块读哪块，不用通读
- `AGENTS.md`、`HANDOFF.md` 的「A tool」
- 自己的 Worker 怎么问「这是谁」：`tools/split/src/server/who.ts`（MoneyLens 不照搬：主站的会话不能到 money.changle.ca，走交接码，见 `docs/moneylens/accounts-requests.md`）
- 一个账号一个 Durable Object 的写法：`tools/split/src/room/account.ts`
- Preact 页面用 esbuild 打包、Worker 自己发页面：`tools/when/`
- 界面：`docs/DESIGN.md`（夜色、工具是 amber）

## 测试

在 `tools/moneylens` 里（Node 22）：

- `npm run typecheck`
- `npm test`：83 个。金额怎么读、读不了的怎么拒绝、不会差一分钱（ACC-1）；日子（ACC-5）；账号卡号遮到只剩后四位（IMP-6）；CSV 的引号、换行和上限；按内容认文件（IMP-4）；OFX 1 和 OFX 2 两种写法、对账到分（T-10 的一部分）、残缺和恶意文件整个拒绝（T-11 的一部分）；对账（ACC-2）；去重（ACC-3）；转账配对（ACC-4）；分类的先后顺序、新规则会改哪些、撤销（CLS-1、CLS-2）、一个人的规则碰不到另一个人（T-18）；汇总。

还没有的：加密的已知答案测试（T-9）、真的 Workers 运行时里两个用户的隔离测试（`npm run test:server`，T-1 到 T-3、T-22、T-23）。要求第 10 节的 T-1 到 T-25 是验收清单，CI 里必须有 T-1、T-2、T-6 到 T-9、T-22。

## 定过的事

Steve 定的（要求第 1 节的六个决定）：

| 决定 | 结果 | 日期 |
| --- | --- | --- |
| D1 数据谁能读 | **A 加密保险库**：数据在用户浏览器里加密，服务器只存密文。口令和恢复码都丢了就找不回，只能重新导入 | 2026-11-18 |
| D2 应用放哪 | **A 独立子域名 money.changle.ca**，同时工具页上有它的卡片，介绍页在 changle.ca/tools/finance（Steve 选的时候特意问了这一点）。加 `money.changle.ca` 这一条 DNS 记录算批准了：Worker 第一次部署时由 `custom_domain` 自己建，和 rooms.changle.ca 一样 | 2026-11-18 |
| D3 法律上的运营者 | 没定，Phase 3 之前定（个人还是公司、隐私负责人、`privacy@changle.ca`） | |
| D4 内测谁能注册 | 先按推荐记：BC 省、满 19 岁、邀请制、最多 25 人。**等 Steve 点头** | |
| D5 外部 AI | **默认关，用户自己勾选才开**，只用一家声明不拿内容训练的服务商，不开也能用规则完整分类 | 2026-11-18 |
| D6 Cloudflare 套餐 | 先按推荐记：留在免费版，解析全在浏览器里。**等 Steve 点头** | |

这个对话定的做法（Claude 定，写代码时会回来对一遍；Steve 或审查的人可以改）：

- 名字和目录：代码在 `tools/moneylens`，Worker 叫 `moneylens`，工具 id 是 `finance`（跟网址走，改名不用动）。
- 主站只放介绍页和卡片，不带任何财务代码（ARCH-1）。演示在 `money.changle.ca/demo`，用合成数据，不用登录。
- 会话不用密钥：Cookie `__Host-ml` 里是「账号 id + 256 位随机数」，账号 id 只用来找到这个人自己的 Durable Object，认的是随机数（库里只存它的 SHA-256）。猜不出随机数就进不去，所以符合 ISO-2。闲置 30 分钟、最长 12 小时。
- 同步不开 WebSocket：解锁后、改动后、回到页面时各发一次批量请求，一批里的块要么全写进去要么全不写（有一个版本过期就整批退回，手机合并后重试）。要求里说的「同步连接」就是这个接口，T-2 和 T-22 照测。
- 分块：块 id 是 128 位随机数；一个加密的根块记「哪个账户哪个月 → 哪个块」；服务器只看得到 id、大小、版本号、时间。
- 口令派生、包装、恢复码的具体参数在加密那个 PR 里按当时公开的建议定，写进安全评估。
- OFX/QFX 是通用格式，一个解析器；CSV 每家银行一个解析器，等 Steve 用夹具工具做出合成账单再写（IMP-9）。
- 正负号全站统一：进账户的钱是正数，出去的是负数；信用卡欠 400 元，余额是 -40000（`money.ts` 开头）。
- 日期照银行写的那一天记，不换时区。OFX 的日期只取前八位，后面的钟点和时区不看：各家银行在后面随便填午夜或中午，换算会让有些银行的账往前挪一天（`dates.ts` 的 `ofxDay`）。
- 去重不单凭银行的流水号（FITID）：有的银行每个文件都从 1 编号，所以流水号一样还要同一天、同金额才算重复。一个文件里自己重复的行不删。拿不准的列成「可能重复」给用户看，不自动丢（`dedupe.ts`）。
- 转账配对要金额相同、不同账户、同币种、相隔 5 天以内，而且至少一边的文字像转账。两边都像才自动配，只有一边像就只是建议。光金额一样不配（`transfers.ts`）。
- 自动分类不存在交易上，每次现算，所以加一条规则会改到过去的交易，删掉规则就恢复原样。只存用户自己选的分类和 AI 的建议（`classify.ts`）。
- 另一种货币的交易（OFX 的 `<CURRENCY>`）没有本账户货币的金额，MoneyLens 不换汇（ACC-6），先跳过并提示，等有真实样本再定怎么显示。

## 现在

Phase 0（决定和打地基）进行中，2026-11-18 开工。

- 做了：六个决定里 Steve 定了三个；建档案和状态文件；要求文档进仓库；威胁模型、数据清单、给账号对话的需求三份初稿；核心库（读 OFX/QFX、对账、去重、转账配对、分类、汇总）和它的 83 个测试。
- 线上：什么都没有。没有 Worker，没有 DNS 记录，没有卡片。核心库只是代码，还没有页面用它。

## 还剩什么

Phase 0：

- [ ] D4、D6 等 Steve 点头；D3 在 Phase 3 前
- [ ] Steve 说先支持哪几家银行、哪种格式（IN-2）
- [ ] 全站的 Privacy Policy 和 Terms 草稿（PRIV-5）。要先把全站每个工具收了什么数据盘一遍，适合让 Gemini 读整个仓库出初稿，再由这个对话核对
- [ ] `privacy@`、`security@` 两个邮箱（Cloudflare 设置，Steve 批准）
- [ ] 找律师和安全审查的人报价（Steve；要的话这个对话起草邮件）

Phase 1（合成数据上搭）：

- [x] 核心库：金额、CSV、OFX/QFX、对账、去重、转账配对、分类、汇总（T-10、T-11 的一部分，T-18）
- [ ] 核心库还缺：各家银行的 CSV 解析器（等夹具）、文字版 PDF（PDF.js，IMP-4）、订阅识别、预算和目标、信用卡余额正负号各家不一样时怎么认（等真实样本）
- [ ] 保险库加密：AES-256-GCM、口令和恢复码包装、已知答案测试（T-9）
- [ ] 夹具工具：浏览器里把真账单变成版式一样、数值全假的合成账单（IMP-9）
- [ ] Worker 和每人一个 Durable Object：会话、允许名单、Origin 检查、同步、配额（T-1 到 T-3、T-14、T-22、T-23）
- [ ] 应用页面（Preact）：建保险库、解锁、导入、流水、分类、看板、隐私和数据页
- [ ] 演示、介绍页、工具页卡片
- [ ] 同意和资格（CON-1 到 CON-7，T-15）、安全事件记录（SEC-17）
- [ ] AI 分类（放最后；T-12、T-13）
- [ ] MoneyLens 自己的法律文件草稿、安全评估、隐私影响评估

## 等 Steve 的事

1. D4 和 D6 回一句行不行。
2. 先支持哪几家银行（要你自己有账户、Phase 2 能拿真账单核对的）。
3. 把 v1 和最早那份功能说明放进 Project 文档。v2 里「屏幕见 v1 第 13 节」「法律文件内容见 v1 第 8 节」「交付物见 v1 第 16 节」都指向它。
4. 中文名。候选：心里有数 · MoneyLens、明白账 · MoneyLens。「MoneyLens」能不能用，Phase 3 前要查商标（UX-8）。
5. 以后要你在后台点的（到时候会单独说）：Cloudflare 把 `moneylens` Worker 接上 GitHub；两个邮箱转发；GitHub 的密钥扫描、推送保护、MoneyLens 路径的必过检查；GitHub、Cloudflare、Resend、邮箱四个账号用通行密钥（SEC-8）。
6. 指定第二个信得过的人，你不在时能关停服务（ADM-5）。

## 交给别的对话

- 「平台 · 账号与头像」：三件事，写在 [`docs/moneylens/accounts-requests.md`](../moneylens/accounts-requests.md)。最要紧的是交接码（没有它，谁都登录不了 money.changle.ca）。
- 「平台 · 首页与上线」：全站的 Privacy Policy 和 Terms 要放在主站 `/legal/` 并且页脚有链接（PRIV-5、DOC-5）。草稿由这个对话出，页面和页脚归你们。另外 SEC-7 要求给仓库开自动的依赖更新 PR（Dependabot），这是 GitHub 设置，要 Steve 同意。

## 最近的改动

- 2026-11-19 moneylens: 核心库和 83 个测试，CI 工作流（#649）
- 2026-11-18 moneylens: 档案、状态、要求文档入库，威胁模型、数据清单、给账号对话的需求（#640，只有文档）

## 记录

- 2026-11-18 Steve 说开干。问了 D1、D2、D5 和仓库推送权限：D1 加密保险库，D2 独立子域名并且工具页要有它，D5 默认关用户自选，推送授权。D4、D6 没问，先按推荐记。

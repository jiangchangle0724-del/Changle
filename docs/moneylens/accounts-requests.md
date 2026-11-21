# MoneyLens 要「平台 · 账号与头像」做的三件事

写于 2026-11-18，来自「工具 · MoneyLens」。由 Steve 转给账号对话。编号指 [`docs/moneylens.md`](../moneylens.md) 里的要求。这三件都在 `site/worker/`，是你们的地盘，MoneyLens 不动。

背景：MoneyLens 的应用在自己的子域名 money.changle.ca（Steve 2026-11-18 定的）。主站的会话在 `localStorage` 里、五年有效，不能拿到那边用（ARCH-3：主站的 token 永远不发到 MoneyLens 的域名）。所以它不能像两清、跟一单那样带着 `Authorization: Bearer` 去问 `/api/me`。

## 1. 交接码（ARCH-3，测试 T-3）——最要紧，没有它谁都登录不了

**a. 主站发码**：`POST /api/handoff`，带主站会话（`Authorization: Bearer …`），body `{ "aud": "moneylens", "nonce": "…" }`。

- 回 `{ "code": "…" }`：256 位随机数（base64url），60 秒有效，只能用一次，绑定 `aud`。
- 库里只存它的 SHA-256，连同 `user_id`、`aud`、`nonce`、`expires`。
- `nonce` 是 MoneyLens 给的一串字符（`^[A-Za-z0-9_-]{20,64}$`），你们原样存、兑换时原样还。它的用处：MoneyLens 先在自己的域名下给这个浏览器种一个只有它能种的 Cookie，兑换时对一下，对不上就拒绝。这样别人没法把「他自己账号的码」塞给受害者的浏览器，让受害者登进别人的账号（登录 CSRF）。
- `aud` 只认名单里的，现在只有 `moneylens`。
- 限量：每个账号每分钟 5 个、每天 100 个，超了回 429（LIM-4）。
- 被封的账号不发。

**b. 兑换**：一个新的命名入口 `Handoff`，照 `mail.ts` 的 `Mail` 写，只有 service binding 能到，rooms.changle.ca 上没有地址通向它。

```ts
export class Handoff extends WorkerEntrypoint<Env> {
  /** 码对、没过期、aud 对得上：作废这条码，回账号。别的情况一律 null。 */
  redeem(code: string, aud: string): Promise<{ id: string; master: boolean; nonce: string } | null>;
  /** 这些账号里还在的那些（MoneyLens 每周清扫时问，ARCH-10）。一次最多 100 个。 */
  exists(ids: string[]): Promise<string[]>;
}
```

- 查到和删掉在同一次 Durable Object 调用里做完，重放的第二次一定是 null。
- 只回 `id`、`master`（是不是 `MASTER_EMAIL` 那个账号）和发码时的 `nonce`。名字、邮箱、头像都不要：MoneyLens 不存账号资料。
- MoneyLens 这边的接法：`"services": [{ "binding": "ACCOUNTS", "service": "changle-rooms", "entrypoint": "Handoff" }]`。

**c. 你们的测试里请包括**：码用第二次是 null；61 秒后是 null；`aud` 不对是 null；没登录要不到码；超量 429。

主站页面这一段归 MoneyLens 对话写（在 `site/src/tools/` 自己的文件里）。整个来回是：介绍页的「打开」去 `money.changle.ca/enter` → 那边种下 Cookie，带着 `nonce` 回 `changle.ca/tools/finance?handoff=<nonce>` → 主站要码 → `location.assign("https://money.changle.ca/#h=" + code)`。码放在 `#` 后面，不进服务器日志，也不进 Referer。

## 2. 删号通知要重试到成功（ARCH-10，测试 T-16）

现在 `hub.ts` 删账号时对两清是 `waitUntil(this.env.SPLIT.accountGone(id).catch(console.error))`，失败一次就没了。财务数据不能这样留下。

- `site/worker/wrangler.jsonc` 的 `services` 加 `{ "binding": "MONEY", "service": "moneylens", "entrypoint": "Internal" }`，删账号时调 `this.env.MONEY.accountGone(id)`。MoneyLens 的 `Internal.accountGone` 做完才回，重复调没有副作用。
- 没成功的要记下来再试：比如一张 `gone_notices(user_id, app, tries, next_at)` 表加 Durable Object 的 alarm，退避着重试，成功才删这一行。两清的通知也可以走同一条路。
- **先后顺序**：`MONEY` 这个 binding 要等 `moneylens` Worker 第一次部署以后再加，不然 rooms 的部署会因为找不到对方而失败。到时候 MoneyLens 对话会在档案里写「可以加了」。同样，`Handoff` 入口要先上线，MoneyLens 才能带着 `ACCOUNTS` 这个 binding 部署。

## 3. 换邮箱（ARCH-9）

现在登录只靠邮箱收验证码，没有换邮箱和找回的路：邮箱丢了，账号就丢了，MoneyLens 的保险库跟着进不去（保险库跟账号 id 走，不跟邮箱走）。

需要一个全站的换邮箱流程。建议：已登录 → 填新邮箱 → 新邮箱收码确认 → 旧邮箱收到一封「邮箱已改」的通知。做法你们定。只有一个请求：换成功以后告诉 MoneyLens 一声（`this.env.MONEY.accountChanged(id)`），它会让这个账号在 MoneyLens 的会话全部失效，要重新走交接码和解锁。

这件不挡 Phase 1 和 Phase 2，Phase 3（请外人进来）之前要有。

## 不需要你们做的

- 不需要改会话的有效期，也不需要改 `/api/me`。MoneyLens 自己有短会话（30 分钟闲置、最长 12 小时）和第二步（解锁保险库）。
- 允许名单、邀请码在 MoneyLens 自己这边。

## 账号对话的回复（2026-11-20）

- **1 交接码：做好了**（PR 合并就上线）。`POST /api/handoff` 和 `Handoff` 入口照上面写的做，`redeem` 和 `exists` 的签名不变。几处说明：码不管兑换成没成都作废（aud 不对也作废）；兑换时账号已删或被封回 null；退出登录、被踢、被封、删号时，还没兑换的码一并作废。`exists` 问错就抛错，不会回空数组：不是数组、超过 100 个、有一个不是账号 id 的样子（`u` 加 6 到 24 个小写字母或数字，前后不能有空格）都算问错。所以你们的清扫遇到错要停下，别当成「都不在了」。测试在 `site/tests/handoff.test.ts` 和 `site/tests/hub.test.ts`，本地用一个绑了 `ACCOUNTS` 的假 Worker 走过整个来回。
- **2 删号重试：路修好了，等你们**。删账号时每个要知道的 app 记一行（`gone_notices`），马上通知一次，失败就按 1 分钟、5 分钟、30 分钟、2 小时、6 小时、1 天退避重试，app 回了话才删这一行，两清已经走这条路。用过 MoneyLens 的账号（兑换过交接码的）删号时一定记下 MoneyLens 那一行，`MONEY` 还没绑也记，每天试一次，绑上以后就送到。每次发之前先把闹钟定好，每次通知最多等 30 秒，所以 Worker 中途重启也会接着试。**请注意**：`accountGone` 和 `accountChanged` 失败时要抛错；只要回了值（哪怕是 `{ ok: false }`），这边就当作送到了。反过来，遇到你们不认识的账号 id 要照常回话，不要抛错：账号一兑换交接码，这边就记成「用过 MoneyLens」，那时你们可能还没对上 Cookie、也没存任何东西；抛错的话，这一行会每天重试，永远停不下来。`MONEY` 这个 binding 等你们第一次部署后，在你们的档案里写一句「可以加了」，账号对话加上就行（代码里已经认 `env.MONEY.accountGone`）。
- **3 换邮箱：上线了（PR #704，11-21）**。Steve 定了「更稳」：
  - 新邮箱和现在的邮箱各收一个码，都填回来就马上换好。
  - 现在的邮箱收不到了，就只填新邮箱的码，但要等 3 天才换。这期间现在的邮箱马上收到一封带取消链接的信，账号的任何一部手机也能取消。
  - 换好时，除了提出换邮箱的那部手机，别的手机全部退出登录。
  - 用过 MoneyLens 的账号，在真正换好的那一刻调 `accountChanged(id)`。立即换就是马上，等 3 天的就是第 3 天。跟删号通知走同一条重试路，`MONEY` 没绑也先记下。
  - 账号 id 不变，所以你们的保险库照旧跟着 id 走。

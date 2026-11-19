> 仓库里的这份是 Project 文档 `claude/moneylens-requirements-v2.md` 的副本（2026-11-18，这一行以下一字不差）。Steve 的决定和以后的改动记在 [`docs/briefs/moneylens.md`](briefs/moneylens.md) 的「定过的事」，不改这里的正文。

# MoneyLens — Public Multi-User SaaS and Legal Compliance Requirements (v2)

| | |
|---|---|
| Status | Draft v2, 18 November 2026. Supersedes v1 of this document. Waiting for the operator decisions in section 1. |
| Covers | Security, privacy, legal, multi-user and launch requirements, and how MoneyLens fits the existing changle.ca platform. |
| Does not replace | The original functional specification (statement import, reconciliation, classification, learning, analytics, reports). It still applies. Section 3.2 lists what this document assumes about it. |
| Legal status | Not legal advice. Legal statements were checked against the official sources in Appendix B on 18 November 2026 and describe what to design for. A lawyer licensed in British Columbia must review the legal documents and Appendix C before any member of the public is admitted. |

Requirement words: **MUST** is required for the phase named, **SHOULD** is expected unless the tool's brief records a reason, **MAY** is optional. Requirement IDs (for example `ISO-2`) are used by the acceptance tests in section 10.

## 1. Operator decisions needed before development

Sections 4 to 10 are written for the recommended option and say where the alternative differs. Each decision is recorded with its date in the tool's brief.

| ID | Decision | Recommended | Alternative | What it changes |
|---|---|---|---|---|
| D1 | Who can read the financial data at rest | **A. Encrypted vault.** Records are encrypted in the user's browser. The server keeps ciphertext only. | B. Server-readable database, one per user. | A: a server breach or an admin sees ciphertext, but a user who loses both the passphrase and the recovery code loses the data and has to import again. B: simpler, and server-side features are possible, but a breach exposes readable financial records of the public. |
| D2 | Where the app runs | **A. Its own origin, `money.changle.ca`.** The public intro page and the Tools-tab card stay at `changle.ca/tools/finance`. | B. Path only, `changle.ca/tools/finance`. | A: the browser isolates MoneyLens from the games, chat and other tools. It needs one DNS record and a sign-in handoff. B: no DNS change, but a script flaw anywhere on changle.ca can reach an unlocked MoneyLens, and the site-wide content security policy has to be tightened first. v1 forbids a subdomain without explicit approval. This row is the request for that approval. |
| D3 | Legal operator | Decide before Phase 3: the named individual or a company, a privacy officer, and a `privacy@changle.ca` address. | None. | Every legal document must name the real operator. The only published policy today (the /eat tool) names an individual and a personal Gmail address. Counsel advises on personal liability, incorporation and insurance. |
| D4 | Who may register at beta | **BC residents who have reached the age of majority (19), by invitation, capped at 25 users.** | All of Canada. | Keeps the first legal analysis to BC law, with PIPEDA considered for processing outside BC. Quebec and international users stay out until separately assessed. |
| D5 | External AI | **Off by default, opt-in, one provider with no-training terms.** Rules-only mode always works. | No AI in the first release. | Decides the consent flow, the vendor list and the monthly cost cap. |
| D6 | Cloudflare plan | **Stay on Free.** All parsing happens in the browser. | Workers Paid. | Free allows 10 ms of CPU per request, and the whole site shares 100,000 requests a day, 100,000 database row writes a day and 5 GB of storage. When a limit is hit, that kind of operation fails across the site until the daily reset. Server-side parsing is only possible on Paid. |

## 2. The existing platform

Verified in the repository `jiangchangle0724-del/Changle` on 18 November 2026. v1 section 2 asked for this inspection. The right-hand column is why each fact matters.

| Area | What exists today | Consequence for MoneyLens |
|---|---|---|
| Stack and hosting | Vite and React site on Cloudflare Pages. Servers are Cloudflare Workers with Durable Objects (each with its own SQLite database). D1, KV and R2 are also in use. Cloudflare Free plan. | No Postgres, so no Row Level Security. Tenant isolation is done with one database per user (section 4.3). |
| Tool routes | In-site tools live at `/tools/<id>` (`currency`, `clock`, `price`), registered in `site/src/tools/ids.ts`. Tools with their own server use `/<name>` (`/eat`, `/when`, `/split`, `/tuan`, `/go`). | `changle.ca/tools/finance` fits the convention. |
| Accounts | One changle.ca account for the main site and the newer tools (/split, /tuan). The /eat tool still has its own Google sign-in. Sign-in is a one-time code by email. There are no passwords, no MFA, no passkeys, and no way to change or recover the email address. The session token sits in `localStorage`, a session lasts five years after its last use, and a 400-day sign-in cookie can restore it. The profile also holds phone, city, gender and a short bio. Account deletion exists and tells one tool (/split), best effort, with no retry. | "Password recovery" in v1 does not apply. Email is the only factor, a lost mailbox is a lost account, and a five-year session readable by page scripts is too weak for financial data. MoneyLens adds its own second step and its own short session (section 4.2) and has to be added to account deletion (ARCH-10). |
| Security headers | HSTS, `nosniff`, `frame-ancestors 'self'`. The content security policy has no `script-src` rule. | A strict policy cannot be applied to one path of a single-page app. This is the main reason for D2. |
| Legal pages | No site-wide Privacy Policy or Terms. Only the /eat tool has its own, naming an individual operator and a personal Gmail address. Addresses `hello@changle.ca` and `pw@changle.ca` appear in the code. | A site-wide baseline is needed first (PRIV-5). |
| Repository and deploys | Public repository, all rights reserved. Every merge to `main` deploys to production. Coding agents merge when CI is green. No Dependabot configuration. | Exposure must be controlled by a server-side gate, not by holding back deploys (SEC-10). Real data must never enter the repository or CI (SEC-12). |
| Email | Sign-in codes go through one email service whose current plan allows about 100 messages a day for the whole site. | MoneyLens sends no email of its own in the first release (LIM-3). |
| Data location | Durable Object and D1 storage can be pinned only to the EU, the US or FedRAMP regions. There is no Canada-only option, and location hints are best effort. Durable Object storage is encrypted at rest with AES-256 using keys Cloudflare manages. | The Privacy Policy must say data may be stored and processed outside Canada (PRIV-14). |
| Design system | `docs/DESIGN.md`: night palette only, amber for tools, 12 shared components, breakpoints at 720 and 1200 px, Chinese and English everywhere, page text is not selectable so anything to copy needs a copy button. CI compares screenshots and runs accessibility checks. | "Refined fintech" has to be achieved inside this system (section 7). |
| Admin | `/admin` exists for the master account. | Extend it with aggregate MoneyLens metrics only (section 8). |

## 3. Scope

### 3.1 Goal

A personal finance organizer that any eligible adult can use with their own changle.ca account. Publicly available does not mean public data: each person's financial information is private to them.

### 3.2 Functional baseline assumed from the original specification

Taken from the feature names in v1 sections 1, 13 and 16. If the original functional specification differs, it wins on features and this document wins on security, privacy and legal matters.

- Statement import with preview, reconciliation and duplicate handling
- Transactions: list, search, edit, split, notes, manual entry
- Classification with personal rules and merchant aliases that learn from corrections
- Spending analytics, cash flow, subscriptions detection
- Budgets and savings goals
- Reports and exports
- Privacy settings and account settings

### 3.3 Supported inputs in the first release

- `IN-1` Formats, in this order: CSV and OFX/QFX files exported from the bank's own website, then text-based PDF e-statements. Structured exports parse more reliably than PDF text, although many CSV files carry no balances (ACC-2). Scanned or photographed statements are out of scope (no OCR).
- `IN-2` The operator names the first institutions. Start with those whose statements he can verify in Phase 2. Each institution and format is a named parser (IMP-3).
- `IN-3` Account types: chequing, savings, credit card. Loans, mortgages and investment accounts are later.
- `IN-4` Currencies: CAD and USD accounts. Amounts in other currencies are kept as shown on the statement.
- `IN-5` Later, not now: Alipay and WeChat Pay bill exports, which matter for this site's audience.

### 3.4 Out of scope for the first release

Online-banking credentials, bank connections, payments, transfers, investment execution, investment recommendations, tax filing, credit scores, business bookkeeping, shared household workspaces, billing, native apps, marketing email, OCR.

### 3.5 Money and accuracy rules

- `ACC-1` Money is stored as integers in the currency's smallest unit. No floating point.
- `ACC-2` Reconciliation is per import: opening balance plus the sum of transactions equals the closing balance, to the cent. PDF statements carry both balances. Many CSV exports do not, so for those the user enters the closing balance shown by the bank. An import that does not reconcile, or has no balance to check, can be saved only with a visible "unreconciled" mark.
- `ACC-3` Duplicates are detected within a user's own account across overlapping files, and shown before saving.
- `ACC-4` Transfers between the user's own accounts and credit-card payments are paired and excluded from spending. Refunds and reversals reduce the category they came from.
- `ACC-5` Only posted transactions are imported. Transaction date and posting date are both kept. Default time zone is America/Vancouver.
- `ACC-6` Foreign-currency purchases keep the original amount and the converted amount printed on the statement. MoneyLens does not re-convert.

## 4. Architecture

### 4.1 Origin and entry (D2)

- `ARCH-1` The public intro page MUST be `changle.ca/tools/finance`, registered like the other in-site tools, with a card on the Tools tab. It loads no financial code and offers a demo with synthetic data.
- `ARCH-2` (D2-A) The application MUST be served from its own origin, `money.changle.ca`, deployed from the same repository. Nothing else is served from that origin: no games, chat, user content or third-party scripts. Creating the DNS record needs the operator's approval.
- `ARCH-3` Sign-in MUST reuse the changle.ca account, with no separate MoneyLens registration. Browser storage is per origin, so the accounts service adds a handoff: for a signed-in user the main site obtains a single-use code (valid 60 seconds, bound to MoneyLens) and redirects; MoneyLens exchanges it server-side for its own session. The main-site token is never sent to the MoneyLens origin.
- `ARCH-4` The MoneyLens session MUST be a host-only cookie (`__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Strict`), with a 30-minute idle timeout and a 12-hour absolute lifetime, revocable on the server. The `__Host-` prefix stops pages on the parent domain from planting a cookie with the same name.
- `ARCH-5` (D2-B) If the operator chooses the path-only option, the app is lazy-loaded at `changle.ca/tools/finance/app`, and before any real data is admitted the site-wide content security policy MUST forbid inline and remote scripts. The remaining risk, that a script flaw anywhere on changle.ca can act inside an unlocked MoneyLens, is written in the brief and accepted by the operator.

### 4.2 Identity and unlock

- `ARCH-6` Email is the only account factor and main-site sessions are long-lived, so MoneyLens MUST require a second step before showing financial data. In option A this is the vault unlock (VAULT-2). In option B it is a passkey at the start of every MoneyLens session. An emailed code repeats the same factor and draws on the site's shared email quota, so it is only the fallback.
- `ARCH-7` Passkeys (WebAuthn) SHOULD be the primary unlock, with a passphrase as the fallback.
- `ARCH-8` Settings MUST list the user's MoneyLens sessions and devices, with remote sign-out.
- `ARCH-9` Recovery rules are stated up front. Support cannot unlock a vault. The accounts service has no email-change or recovery route today, so a lost mailbox is a lost account. An email-change flow is requested from the accounts owner in Phase 0.
- `ARCH-10` Deleting the changle.ca account MUST delete all MoneyLens financial data and keys. The accounts service tells only one tool today, without retry, so MoneyLens is added to that notice (shared code, changed by its owner) with retries, and a weekly sweep removes MoneyLens data whose account no longer exists. Consent records are kept for the period in the retention schedule.

### 4.3 Data custody and tenant isolation (D1)

Common to both options:

- `ISO-1` Each user's MoneyLens data lives in that user's own Durable Object, which has its own SQLite database. No table holds financial records of more than one user. This replaces Row Level Security from v1.
- `ISO-2` The server derives the user identifier only from the verified MoneyLens session and uses it to address that user's database. No endpoint accepts a user, vault or object identifier from the client as authority.
- `ISO-3` Chunk, record and file identifiers are random, at least 128 bits. Knowing one grants nothing.
- `ISO-4` Every route, sync connection, export, scheduled job and admin function is covered by the two-user isolation tests (T-1 to T-4).
- `ISO-5` Rules, aliases and AI preferences belong to one user. A site-wide merchant dictionary MAY exist only if the operator curates it from public information. Learning across users is not allowed without a separate opt-in design and a new privacy review.

Option A, encrypted vault (recommended):

- `VAULT-1` Transactions, accounts, balances, categories, rules, aliases, budgets, goals, notes, import history and reports are encrypted in the browser before upload. The server stores ciphertext, wrapped keys, chunk identifiers, sizes, version numbers and timestamps only.
- `VAULT-2` Encryption and key wrapping use the browser's WebCrypto. Data is encrypted with AES-256-GCM under a random 256-bit vault key, with a unique nonce and the chunk identifier and type authenticated. The vault key is wrapped by a passkey-derived key where the browser supports it, by a passphrase-derived key, and by a one-time recovery code shown at setup. The passphrase key is derived with Argon2id from one audited WebAssembly library, or with PBKDF2-HMAC-SHA-256 from WebCrypto at an iteration count taken from current published guidance. The choice and its parameters are recorded in the security assessment. No home-made algorithms. Known-answer tests run in CI.
- `VAULT-3` While unlocked, the vault key exists only in memory as a non-extractable key. It is never written to storage unwrapped. The vault locks after 15 minutes idle, on tab close and on sign-out.
- `VAULT-4` Records are packed into encrypted chunks, for example one per account and month, so that a full import writes tens of rows, not thousands (LIM-1). Sync sends and receives chunks by version number. A write names the version it was based on. A stale write is refused, and the client merges record by record and tries again, so a retry never duplicates and one device never silently overwrites another. The browser cache holds ciphertext only. The server copy is the durable one, because Safari deletes a site's local data after seven days without interaction.
- `VAULT-5` If the user loses the passphrase or passkey and the recovery code, nobody can recover the vault. Setup says so plainly, the app offers "reset and import again", and it prompts for an export.
- `VAULT-6` Allowed wording: "stored encrypted with a key that stays on your devices; the operator cannot read your stored transactions". Not allowed: "zero knowledge", "impossible to access", "bank-level security". With AI on, the description text being classified passes through the operator's proxy in transit and is not stored (AI-3, AI-7), and the AI consent screen says so. The security assessment records the remaining trust in the code the site serves.
- `VAULT-7` Key lifecycle is specified in the security assessment and tested: a minimum passphrase strength checked against a list of common passwords, a stated floor for key-derivation cost, a recovery code with at least 128 bits of randomness shown once, passkeys registered for the MoneyLens origin, removing a lost device or passkey, and changing the passphrase by re-wrapping the vault key. A session that has not unlocked the vault can never read it. It can erase it only after a 7-day delay that is shown on every signed-in device and can be cancelled. With the vault unlocked, erasing is immediate.

Option B, server-readable (alternative):

- `SRV-1` Same per-user database, with records stored readable. Protection at rest is the platform's AES-256 encryption with keys Cloudflare manages.
- `SRV-2` Operator and admin tooling have no way to read a user's records except the break-glass procedure in section 8.
- `SRV-3` The privacy impact assessment, the breach runbook and the insurance decision assume readable financial data.

### 4.4 Statement import

- `IMP-1` Parsing MUST run in the browser. On the Free plan a Worker has 10 ms of CPU per request, so server-side parsing is not possible. It MAY be added only with D6 on Paid, disclosed in the Privacy Policy, using private temporary storage deleted within one hour, with a test that proves deletion.
- `IMP-2` Formats follow IN-1.
- `IMP-3` Each institution and format is a named parser with synthetic fixtures and a reconciliation test. An unsupported file fails with a clear message and saves nothing.
- `IMP-4` PDF.js MUST be version 4.2.67 or later with `isEvalSupported: false` (CVE-2024-4367), running in a Web Worker. Limits: 10 MB per file, 100 pages, 30 seconds per parse. File type is checked by content, not by extension.
- `IMP-5` Extracted text is untrusted input. It is never rendered as HTML, never executed, and never given to an AI model as instructions.
- `IMP-6` Before saving the user sees a preview, the reconciliation result and the duplicate report, and confirms. At extraction, account and card numbers are cut to the last four digits and the holder's name and address are dropped.
- `IMP-7` Statement files are not uploaded and not kept. If a "keep the original" feature is ever added, the file is stored encrypted in the vault.
- `IMP-8` Never ask for online-banking credentials. No screen scraping. No bank connection in the first release. Canada's consumer-driven banking framework is not in force yet; any future connection goes through accredited access under that framework.
- `IMP-9` Parsers are built without real data. A browser-only fixture tool turns a real statement into a synthetic one with the same layout (headers, column positions, date and amount formats) and invented values. The operator checks the result before sharing it. Only such fixtures enter the repository or any AI tool (SEC-12).

### 4.5 Classification

- `CLS-1` Precedence: the user's own choice on a transaction, then the user's rules, then the user's merchant aliases, then the operator-curated dictionary, then an AI suggestion if enabled. Deterministic steps always run first.
- `CLS-2` Every automatic result shows where it came from. AI results show a confidence estimate. A correction takes one tap, and turning it into a rule shows which past transactions will change and can be undone.
- `CLS-3` The product is fully usable with AI off.

### 4.6 External AI (D5)

- `AI-1` Off by default. Opt-in is separate from the mandatory consents and can be withdrawn at any time in Privacy settings. Withdrawal stops calls immediately.
- `AI-2` Before opt-in the user is shown what is sent, to whom, why, how long the provider keeps it, where it may be processed, that it is not used for training, and how to withdraw.
- `AI-3` Sent: the cleaned description text of a transaction, whether it is a debit or a credit, and the names of the user's categories. Never sent: whole statements, account or card numbers, balances, names, addresses, the other party of an e-Transfer, free-text notes.
- `AI-4` One provider, named in the Privacy Policy, whose terms state no training on the content and limited retention. Two candidates were checked on 18 November 2026. Cloudflare already hosts this site. Its Workers AI service, which the site does not use yet, states that it does not train on customer content and does not retain standard inference inputs and outputs once they are no longer needed. The Gemini API paid tier (terms effective 23 March 2026) states that prompts are not used to improve products, are logged for a limited period for abuse detection, may be stored transiently in any country, that the developer must be 18 or older, and that the service must not be directed at or likely to be used by people under 18. The free Gemini tier MUST NOT be used: its content is used for product improvement and may be read by reviewers. Re-check the chosen provider's terms at build time.
- `AI-5` Calls go through a server-side proxy. The key stays on the server. There is a per-user daily cap and a site-wide monthly budget cap that fails closed to rules-only mode.
- `AI-6` Prompt-injection controls: statement text is passed as data, the output is limited to the user's category list by schema, the output is validated, the model has no tools, and a test set proves it (T-12).
- `AI-7` The proxy does not log request or response bodies.

### 4.7 Platform limits and cost control

- `LIM-1` Design for the Free plan, whose limits are shared by every part of changle.ca: 100,000 Worker requests a day, 100,000 Durable Object row writes a day and 5 GB of Durable Object storage in total. When a limit is reached, that kind of operation fails across the site until the daily reset. A MoneyLens session therefore uses a handful of requests (batched sync), writes chunks instead of single records (VAULT-4), and every user has rate limits.
- `LIM-2` Quotas the server can see and enforce, defaults the operator may change: 10 MB of vault data per user, 300 chunk writes a day per user, 200 AI calls a day per user. In option A the server cannot count imports, so the limits are in bytes and writes.
- `LIM-3` MoneyLens sends no routine email in the first release. The exceptions are security and breach notices (PRIV-9) and inactivity notices (BAK-4), sent through the accounts service's mail entry. The site's plan allows about 100 messages a day shared with sign-in codes, so the email budget is reviewed before Phase 3.
- `LIM-4` Abuse control sits before the handoff, on the main site: invitation codes during beta and rate limits on handoff codes. If a bot challenge is added later it runs on the intro page, never on the MoneyLens origin, which loads no third-party script (OBS-2).

### 4.8 Observability without exposure

- `OBS-1` Logs and error reports MUST NOT contain transaction text, amounts, balances, file names, file contents, AI prompts or AI responses. Client error reports carry the error type, code location and app version only.
- `OBS-2` No third-party analytics, tag managers, session replay, fonts or scripts on the MoneyLens origin.

### 4.9 Backup, restore and deletion

- `BAK-1` The platform's point-in-time recovery (30 days for SQLite-backed Durable Objects) is the backup. A restore drill on a synthetic user is part of the Phase 2 exit.
- `BAK-2` Users can export at any time: CSV for transactions, JSON for rules, categories and budgets, produced in the browser.
- `BAK-3` User-initiated deletion removes live data within 24 hours. Deleted data may stay restorable from the platform's recovery history for up to 30 days. Confirm the exact behaviour with Cloudflare before the retention policy states a number.
- `BAK-4` MoneyLens data of accounts with no sign-in for 24 months is deleted after two notices. Counsel confirms the period.
- `BAK-5` Recovery history lives in the same Cloudflare account and reaches back 30 days. Before Phase 4 there SHOULD be a weekly snapshot of the MoneyLens databases in a second location under a different account or provider (ciphertext in option A), with its own stated retention. Until then this is a listed limitation and the app prompts users to keep their own export.

## 5. Security

### 5.1 Threats the security assessment must cover

1. Account takeover through a compromised mailbox or a stolen long-lived session
2. Script injection elsewhere on changle.ca reaching MoneyLens
3. Cross-user access through the API, identifiers, exports, sync connections or caches
4. Malicious or malformed statement files
5. Prompt injection through statement text
6. A compromised dependency or build chain
7. A compromised operator account (GitHub, Cloudflare, email) or an automated agent merging harmful code
8. Exposure through logs, previews, screenshots, test fixtures or AI tools
9. Abuse and cost exhaustion
10. Data loss from bugs, lost keys or platform failure

### 5.2 Controls

- `SEC-1` HTTPS only with HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and no framing (`frame-ancestors 'none'`).
- `SEC-2` Content security policy on the MoneyLens origin: `default-src 'self'`, scripts and styles from the origin only, no inline script, no `eval` (`'wasm-unsafe-eval'` only if the key-derivation library needs WebAssembly), `connect-src` limited to the MoneyLens API, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`.
- `SEC-3` Imported text is always rendered as text. No user-supplied HTML anywhere.
- `SEC-4` `money.changle.ca` and `changle.ca` are the same site to the browser, so `SameSite` does not protect MoneyLens from pages on the main site. Every MoneyLens request, including the sync connection's handshake, MUST be refused unless its `Origin` header is exactly the MoneyLens origin. No cross-origin access is granted to any other origin.
- `SEC-5` Every endpoint validates input and size. SQL is parameterized.
- `SEC-6` Secrets live only in Cloudflare secrets: never in the repository, the client bundle, logs or chat tools. GitHub secret scanning and push protection are confirmed on.
- `SEC-7` Supply chain: lockfile committed, a dependency audit in the MoneyLens CI workflow that fails on high-severity issues in shipped code, automated dependency update pull requests, GitHub Actions pinned by commit, and as few dependencies as possible in the crypto and parsing paths.
- `SEC-8` The operator's GitHub, Cloudflare, email-service and mailbox accounts MUST use phishing-resistant MFA (passkey or security key) and narrowly scoped API tokens.
- `SEC-9` Change control. This repository deploys on merge and agents merge on green CI. For MoneyLens, CI MUST include the isolation, marker-string, security-policy, crypto and origin tests (T-1, T-2, T-6 to T-9, T-22). A change to sign-in, session, crypto, sync or authorization code also needs a recorded review by a reviewer who did not write it (a second model or a person). After Phase 3 starts, such changes also need the operator's acknowledgement. These rules are enforced, not only written: required status checks and a required-review rule cover the MoneyLens paths, the lockfile, the CI workflow, the headers file and the Worker configuration, and dependency update pull requests are never merged automatically.
- `SEC-10` Exposure is controlled by a server-side allowlist. All MoneyLens functions stay behind it until each phase gate passes. "Operator approval before production deployment" in v1 means the operator opening the gate, recorded with the date in the brief.
- `SEC-11` A separate staging deployment and data namespace use synthetic data. Preview deployments never connect to production data and are access-restricted.
- `SEC-12` Real financial data never enters the repository (fixtures, screenshots, issues, pull-request text), CI artifacts, preview deployments, logs, analytics, or any AI assistant or chat tool used for development. Phase 2 testing with the operator's own statements happens only inside the deployed product.
- `SEC-13` No admin endpoint returns users' financial records (section 8).
- `SEC-14` A written incident runbook (section 6.6), a `/.well-known/security.txt` file and a short vulnerability disclosure policy with a contact address.
- `SEC-15` Before Phase 3: an independent review of sign-in, isolation, crypto, parsing and the security policy, plus the full automated suite. Before Phase 4: a review by a qualified person or firm not involved in building it. Findings are tracked to closure.
- `SEC-16` Alerts on error spikes, sign-in failures, quota exhaustion and unusual sync volume.
- `SEC-17` A security event log without transaction contents: sign-ins, handoffs, failed unlocks, device and passkey changes, exports, deletions, consent changes and admin actions. Users can see their own recent events. Kept 12 months.

## 6. Privacy and legal

### 6.1 Laws to design for

Status on 18 November 2026. "Design for" means build so that compliance is possible; it is not a statement that the product complies.

| Law or rule | Status and scope | Design for |
|---|---|---|
| BC Personal Information Protection Act (PIPA) | Applies to organizations in BC, including an unincorporated individual carrying on a commercial activity, not to personal or household use. Whether a free public tool run by an individual is covered is a question for counsel. This document assumes it is. | A named privacy officer with public contact details (s. 4); written policies and a complaint process (s. 5); consent that is informed, limited to what the service needs and withdrawable (ss. 7 to 10); answers to access requests within 30 business days (s. 29); reasonable safeguards (s. 34); destruction when no longer needed (s. 35). |
| Breach notification in BC | PIPA has no mandatory notification. The BC Commissioner treats reporting as voluntary and recommends it where harm is likely. | Follow the PIPEDA process anyway (section 6.6). |
| PIPEDA (federal) | BC organizations are generally exempt inside BC, but PIPEDA still applies to personal information transferred across borders. | Breach reporting to the federal Commissioner and affected people when there is a real risk of significant harm; a record of every breach kept for two years; processors bound by contract to comparable protection; telling users their information may be processed in another country and be reachable by its authorities. |
| Consent guidance (federal, Alberta and BC regulators) | Issued jointly in 2018. | Express consent for sensitive information such as financial data; the four key elements up front (what is collected, who gets it, why, risk of harm); no consent demanded beyond what the service needs. |
| Bill C-36, Protecting Privacy and Consumer Data Act | Introduced 15 June 2026 and awaiting second reading in the House of Commons. Not law. It would replace PIPEDA's privacy part. | A documented privacy management program, a privacy impact assessment before transfers outside Canada, and deletion and data-mobility rights. Administrative penalties could reach the greater of $10 million or 3% of gross global revenue, and fines for offences the greater of $25 million or 5%. Build these now so the bill is not a rewrite. |
| BC Business Practices and Consumer Protection Act | Since 2025, consumer contract terms that require private arbitration, block class actions or restrict reviews are void. Since 1 August 2026, new rules cover contract content, automatic renewal and one-sided amendment. | Terms of Service without those clauses, and a change-of-terms process that gives notice. Future billing is a separate project under the subscription rules. |
| Canada's Anti-Spam Legislation (CASL) | In force. | Any promotional email needs express opt-in consent (no pre-ticked box), sender identification and an unsubscribe that works within 10 business days. |
| Age of majority | 19 in BC. | Eligibility is "age of majority in your province", not 18 (CON-5). |
| Securities law (BC Securities Commission) | Advice tailored to a person's circumstances can require registration; general information is treated differently. | No personalized investment recommendations and no "advisor" or "planner" titles. Insights describe the user's own past spending. |
| Consumer-Driven Banking Act | Royal assent March 2026. Regulations were proposed on 27 June 2026. Not in force. Its ban on screen scraping is not in force either. | No credentials, no scraping. Any later bank connection goes through accredited access. |
| Alberta and Quebec | Alberta requires breach reports to its Commissioner. Quebec requires incident reports, with administrative penalties up to the greater of $10 million or 2% of worldwide turnover and penal fines up to the greater of $25 million or 4%. | Not offered to Quebec residents at beta. Other provinces only after counsel's review (D4). |
| Outside Canada | Not assessed. | No registration from outside Canada. |

### 6.2 Operator and accountability

- `PRIV-1` The operator's legal name, form (individual or company), province and contact address appear in every legal document (D3). Set up `privacy@changle.ca` and `security@changle.ca`, delivered to the operator, before Phase 3.
- `PRIV-2` A privacy officer is named. It may be the operator.
- `PRIV-3` A privacy management program sized for one person: a data inventory and flow diagram, written procedures for retention, access requests, breach response and vendor management, a complaint procedure, and a yearly review date.
- `PRIV-4` A public vendor list: each processor with its purpose, data categories, locations, retention and the data-processing terms accepted. For MoneyLens that is Cloudflare for hosting and storage, the email service for sign-in codes, the AI provider if enabled, and GitHub for code only. The site-wide list (PRIV-5) is longer, for example the Google services other tools use, and is compiled in Phase 0.
- `PRIV-5` Site-wide baseline first. changle.ca has accounts, avatars and chat but no site-wide Privacy Policy or Terms. Phase 0 delivers them for the whole site. The MoneyLens documents are supplements.

### 6.3 Data inventory to start from

| Data | Where it is kept | Readable by the operator | Kept until |
|---|---|---|---|
| Account profile: email, display name, avatar, and phone, city, gender and bio where given | Existing accounts service | Yes | Account deletion (existing rules) |
| Eligibility attestations, consent records, non-financial settings | User's MoneyLens database | Yes | Account deletion, plus the period counsel advises for consent records |
| Wrapped vault keys | User's MoneyLens database | Useless without the user's secret | Vault deletion |
| Financial records | User's MoneyLens database; browser cache | Option A: no. Option B: yes. | The user deletes them, the account is deleted, or BAK-4 applies; possibly up to 30 more days in recovery history (BAK-3) |
| Security events, sessions and devices | User's MoneyLens database | Yes | 12 months |
| Statement files | Browser memory during import | No | Discarded after import |
| AI requests, if opted in | Passed through the proxy to the provider; not stored by MoneyLens | In transit only | The provider's stated retention |
| Usage counters (imports, record counts, AI calls, errors) | MoneyLens metrics | Yes, aggregate only | 13 months |
| Network logs (IP address, URL) | Cloudflare | Limited | The platform's log retention; confirm and state it |
| Support and privacy email | Operator's mailbox | Yes | 24 months |

### 6.4 Consent and eligibility

- `CON-1` Before first use, a consent screen with separate unticked boxes for: the Terms of Service; the Privacy Policy and the processing the service needs; the Financial and AI Disclaimers; and authorization to import the records the user submits.
- `CON-2` Optional consents are separate and never bundled: external AI processing, and any non-essential use such as product-update email.
- `CON-3` The screen states the four key elements first, in plain language, with the full documents one tap away. Notices are repeated at the moment of use: at file import and at AI opt-in.
- `CON-4` Each consent is recorded with user identifier, document, version hash, UTC timestamp, choice, language and app version. Old document versions are kept. A material change asks for consent again.
- `CON-5` Eligibility is attested at onboarding: the user has reached the age of majority in their province and lives in a province the service is open to (D4). Others are told the service is not available to them yet. No minors.
- `CON-6` The user confirms the accounts are their own or that they are authorized. Joint accounts are mentioned, because they include another person's information.
- `CON-7` Withdrawing an optional consent takes effect immediately and the screen says what stops working.

### 6.5 Legal documents

Drafted for counsel's review, never presented as lawyer-approved, stored with version history in the repository and published under `/legal/`.

- Site-wide Privacy Policy and Terms of Service for changle.ca (PRIV-5)
- MoneyLens Terms supplement, Privacy supplement, Financial Disclaimer, AI Disclaimer, and Data Retention and Deletion Policy, with the content listed in v1 section 8
- Vendor list (PRIV-4) and vulnerability disclosure policy (SEC-14)
- Internal: incident runbook, access-request procedure, retention schedule

Drafting rules:

- `DOC-1` The policies describe what the system actually does. Each release checks them against the data inventory.
- `DOC-2` No mandatory arbitration clause, no class-action waiver and no restriction on reviews. Liability limits and indemnities go to counsel, with wording that mandatory consumer rights are not waived.
- `DOC-3` English is the authoritative text, with a Chinese translation that says so.
- `DOC-4` The Privacy Policy follows the BC Commissioner's structure: accountability, purposes, consent, use and disclosure, retention, accuracy, safeguards, access, complaints (with the BC Commissioner's contact details), openness.
- `DOC-5` Links to the documents appear at sign-up, onboarding, import, settings and the site footer.

### 6.6 Individual rights, breaches and other people's information

- `PRIV-6` A Privacy and Data page lets the user review what is stored, correct records, export transactions, rules and reports, manage AI permission, delete imports, and delete all MoneyLens data or the whole account. It explains how long deletion takes, including recovery history (BAK-3).
- `PRIV-7` Requests sent to `privacy@changle.ca` are answered within 30 business days, after confirming the requester controls the account.
- `PRIV-8` Statements contain other people's names (payees, e-Transfer senders and recipients). They stay inside the user's own records, are never sent to an AI provider, and are used for nothing else.
- `PRIV-9` Breach runbook: contain, assess the risk of significant harm (sensitivity, likelihood of misuse, whether the data was encrypted), notify affected users as soon as feasible, report to the federal Commissioner where PIPEDA applies and voluntarily to the BC Commissioner, and keep a record of every breach for two years. A table-top exercise is run before Phase 3.
- `PRIV-10` A written rule for requests from police, courts or other authorities: valid legal process only, the minimum required, and the user is told unless the law forbids it. In option A the operator can hand over only ciphertext.
- `PRIV-11` A privacy impact assessment and a security risk assessment are completed before Phase 3 and updated before Phase 4.

### 6.7 Cross-border, email and claims

- `PRIV-12` Product-update or promotional email needs CASL express consent, sender identification and an unsubscribe link. None is sent in the first release (LIM-3).
- `PRIV-13` Users' financial information is never used to train models, by the operator or a vendor.
- `PRIV-14` The Privacy Policy states that data is hosted by Cloudflare, may be stored and processed outside Canada (in practice the United States and other countries), and may be reachable by those countries' authorities.
- `PRIV-15` Prohibited claims, in the product and in marketing: "compliant", "certified", "bank-level", "100% secure", "guaranteed accurate", "lawyer-approved", "zero knowledge", or anything implying a bank, an advisor or a regulated firm.

## 7. Product and experience

- `UX-1` A public intro page with a demo that runs on synthetic data without signing in.
- `UX-2` Screens as listed in v1 section 13, including a Privacy and Data page (PRIV-6).
- `UX-3` Built with the site's design system: night palette, amber for tools, shared components, the standard empty, loading and error states, and copy buttons for anything users need to copy. Layouts for phone, 720 px and 1200 px.
- `UX-4` Chinese and English throughout, following the site's language rule. Amounts and dates are formatted for the locale.
- `UX-5` Accessibility target WCAG 2.1 AA, checked in CI like the rest of the site.
- `UX-6` Every automatic step is explainable and reversible: why a category was chosen, what a rule will change, undo.
- `UX-7` The app code loads on demand. The statement parser loads only when the user imports. The home page's download budget does not change.
- `UX-8` Name. Check the Canadian trademarks database and the app stores for "MoneyLens" and similar finance names before Phase 3; several finance apps already use "Lens" names. Choose a Chinese name in the site's "中文 · English" pattern.

## 8. Admin and operations

- `ADM-1` The admin view shows aggregates only: registered and active users, import success and failure counts, records processed, AI calls and cost, errors, security events, open support requests.
- `ADM-2` No admin screen or endpoint shows a user's financial records. In option A this is enforced by design. In option B, break-glass access needs the user's written request or a legal requirement, is limited in time and scope, is logged, and the user is told.
- `ADM-3` Runbooks: incident response, restore from recovery history, account takeover, vendor outage, monthly cost check.
- `ADM-4` A cost sheet, updated monthly: Cloudflare plan and usage against the Free limits, AI spend against the cap, and one-time costs (legal review, security review, insurance) as quoted.
- `ADM-5` Continuity and wind-down. If the service is discontinued, users get at least 60 days' notice in the app, a working export for that whole period, and then all data is deleted. The Terms say so. The operator names a second trusted person who can carry out a shutdown if he cannot.

## 9. Phases and gates

Because every merge deploys, each gate is the allowlist in SEC-10, opened by the operator.

| Phase | What happens | Exit criteria |
|---|---|---|
| 0. Decisions and groundwork | D1, D2, D4, D5 and D6 recorded. `privacy@` and `security@` set up. Site-wide Privacy Policy and Terms drafted. First threat model and data inventory. The tool's brief created. First institutions and formats named. Requests to the accounts owner written (handoff, deletion notice, email change). Quotes requested from counsel and a security reviewer. | The operator signs off the decisions. |
| 1. Build on synthetic data | Hidden behind the allowlist. Local-only vault first, then encrypted sync. Parsers with fixtures. Demo mode. Draft legal documents. | All automated tests in section 10 pass. Draft security assessment and privacy impact assessment exist. |
| 2. Operator-only real data | The operator imports his own statements inside the deployed product. | Three consecutive months reconcile to the cent for each supported institution. Restore drill and deletion drill pass. Costs observed. The operator signs off. |
| 3. Invitation beta | Up to 25 invited BC residents aged 19 or older. | Before opening: D3 settled, with the operator named in the documents and the incorporation and insurance question answered; counsel has reviewed the documents, the consent flow and Appendix C; privacy impact and security assessments done (PRIV-11); SEC-15 pre-beta review done; breach exercise done; name checked (UX-8). To leave: 60 days with no unresolved high-severity issue. |
| 4. Public release | Open registration within the provinces counsel has cleared. | Independent security review closed. Assessments updated. Off-platform snapshot in place or accepted as a limitation (BAK-5). Launch checklist signed by the operator. |

Billing, other provinces, Quebec, international users and bank connections are separate projects with their own review.

## 10. Acceptance tests

Automated and run in CI unless marked manual. v1 section 15 is included and extended.

| ID | Test | Covers |
|---|---|---|
| T-1 | User A cannot read, change, export or delete User B's records through any route, including guessed identifiers | ISO-1 to ISO-4 |
| T-2 | User A cannot open User B's sync connection or receive B's updates | ISO-4 |
| T-3 | Requests without a session, with an expired session or with a main-site token are refused. A handoff code works once, expires after 60 seconds, and is refused when replayed or presented for another audience | ARCH-3, ARCH-4 |
| T-4 | Admin endpoints return aggregates only | ADM-1, ADM-2 |
| T-5 | A stale main-site session cannot show financial data without the second step; a revoked device loses access | ARCH-6, ARCH-8 |
| T-6 | Option A: after imports of fixtures with marker strings, server storage contains none of the markers | VAULT-1 |
| T-7 | Marker strings never appear in logs, error reports, analytics or any request other than the documented ones | OBS-1, OBS-2 |
| T-8 | The security policy blocks inline and remote scripts; MoneyLens pages make no third-party requests | SEC-2 |
| T-9 | Crypto known-answer tests; wrong passphrase fails; recovery code unlocks; tampered records are rejected | VAULT-2 |
| T-10 | Each parser reconciles its fixtures to the cent; duplicates, transfers, refunds and foreign-currency lines behave as specified | ACC-1 to ACC-6, IMP-3 |
| T-11 | Malformed, oversized, mislabelled and hostile files are rejected within limits and save nothing | IMP-4, IMP-5 |
| T-12 | Injection set: descriptions containing instructions produce only categories from the user's list | AI-6 |
| T-13 | With AI off the whole flow works; withdrawing consent stops calls; never-sent fields are absent from proxy requests | AI-1, AI-3, CLS-3 |
| T-14 | Quotas, rate limits and the AI budget cap hold and fail closed | LIM-1, LIM-2, AI-5 |
| T-15 | Consent records are written with the right version; a new version asks again; eligibility gate refuses ineligible answers | CON-1 to CON-5 |
| T-16 | Deleting MoneyLens data or the account removes all financial records and keys and leaves only the consent record; the account-deletion notice is retried until it succeeds; export files match the stored data | ARCH-10, BAK-2, BAK-3 |
| T-17 | Manual: restore drill from recovery history on a synthetic user | BAK-1 |
| T-18 | Classification rules, aliases and duplicate handling stay per user | ISO-5 |
| T-19 | Accessibility checks, Chinese and English parity, phone and desktop screenshots | UX-3 to UX-5 |
| T-20 | The existing site's test suites still pass and the home page budget is unchanged | UX-7 |
| T-21 | Manual: Phase 2 figures match the source statements | ACC-2 |
| T-22 | A request whose `Origin` is not the MoneyLens origin is refused, including the sync handshake and requests sent from a main-site page | SEC-4 |
| T-23 | An account that is not on the allowlist gets nothing from any MoneyLens route | SEC-10 |
| T-24 | Option A: after use and after locking, browser storage holds no readable records and no unwrapped key | VAULT-3, VAULT-4 |
| T-25 | Key lifecycle: weak passphrases are refused, a removed device cannot unlock, a passphrase change keeps the data readable, and a locked vault cannot be erased before the delay ends | VAULT-7 |

## 11. Deliverables

Everything in v1 section 16, plus: recorded decisions (section 1), threat model, data inventory and flow diagram, vendor list, incident and restore runbooks, vulnerability disclosure policy and `security.txt`, privacy management program documents, the wind-down plan, the cost sheet, a list of known limitations, and a launch checklist with the operator's sign-off for each phase.

## 12. Standing restrictions

- No real financial information in the repository, CI, previews, logs or AI tools (SEC-12).
- No member of the public is admitted until the Phase 3 conditions are met, and no open registration until Phase 4.
- Automatically drafted legal documents are never described as lawyer-approved.
- No claim of regulatory compliance, absolute security, guaranteed accuracy or immunity from liability (PRIV-15).
- Each gate is opened by the operator explicitly, and the date is recorded.
- MoneyLens does not change how the existing account system behaves for other tools. Changes to shared code go through the owners of that code.

## Appendix A. What changed from v1 and why

| v1 | Change in v2 | Reason |
|---|---|---|
| §1 route | Kept `changle.ca/tools/finance` for the intro and the card. Where the app runs became decision D2. | The route fits the site's convention. Browser isolation was not addressed. |
| §2 inspect the repository | Done. Findings are section 2. | Requirements now match the real stack. |
| §3 password recovery, optional MFA | Password recovery removed. A second step, a short MoneyLens session, passkeys and a device list added. | The site has no passwords, sessions last five years and email is the only factor. |
| §4 Row Level Security | Replaced by one database per user. | The platform has no Row Level Security. |
| §4 multi-tenant storage | Data-custody decision D1 and the encrypted-vault option added. | Lowers what a breach exposes, which matters most for a one-person operator. |
| §5 client-side parsing preferred | Made mandatory on the Free plan. CSV and OFX before PDF. A named parser per institution. PDF.js version and settings fixed. | The 10 ms CPU limit, more reliable parsing, CVE-2024-4367. |
| §5 identifiers | Other people's names in statements added. | Statements contain third parties' personal information. |
| §6 AI | Exact fields sent, provider terms checked, free tier banned, proxy without body logs, budget cap, injection tests. | Terms differ by tier. Cost and safety. |
| §7 laws | Duties with section numbers. PIPEDA's cross-border scope. Bill C-36. Consumer-protection rules in force since 2025 and August 2026. CASL. Securities boundary. Consumer-driven banking status. Alberta and Quebec. | v1 listed names only, and several rules changed in 2025 and 2026. |
| §14 "aged 18 and older" | 19 in BC, with attestation of age and province. | Age of Majority Act. |
| §8 documents | Site-wide policies first. Vendor list, disclosure policy, runbook, retention schedule. Drafting rules. | The site has no site-wide policies. BC law voids arbitration and class-waiver clauses. |
| §9 consent | Express-consent standard, key elements, eligibility, record fields, notices at the moment of use. | Regulators' consent guidance. |
| §10 user controls | 30-business-day answer time, identity check, inactivity rule, deletion numbers. | PIPA s. 29. Recovery history lasts 30 days. |
| §11 security | Threat model, origin isolation, strict policy, change control for automatic merges, gate by allowlist, separate environments, no real data in AI tools, operator account MFA, independent review. | Shared origin, minimal policy, merge equals deploy, public repository. |
| §11 "encryption at rest", "signed URLs", "CSRF", "RLS" | Mapped to what this platform offers. | Requirements must be buildable. |
| §12 admin | Aggregates only. Break-glass only in option B. Runbooks and cost sheet. | Data minimization. |
| §13 design | Demo mode, design-system rules, breakpoints, accessibility target, explainability, name check, Chinese name. | Existing design system. Trust. |
| §14 phases | Phase 0, the gate mechanism, exit criteria, counsel and security-review conditions. | Gates need a mechanism and an owner. |
| §15 tests | Session, storage, log, policy, injection, parser, quota, eligibility and accessibility tests, mapped to requirement IDs. | Testability. |
| §16, §17 | Added deliverables and restrictions on real data and claims. | Public repository and several AI tools in the workflow. |
| New | Scope, non-goals, accuracy rules, platform limits and cost. | Missing in v1. |

## Appendix B. Sources

Checked 18 November 2026 unless noted.

Privacy:
- [OIPC BC, A Guide to B.C.'s Personal Information Protection Act](https://www.oipc.bc.ca/documents/guidance-documents/1371)
- [OIPC BC, Developing a privacy policy under PIPA](https://www.oipc.bc.ca/documents/guidance-documents/2164)
- [OIPC BC, Privacy breaches: tools and resources for the private sector](https://www.oipc.bc.ca/documents/guidance-documents/1361)
- [OPC, Provincial laws that may apply instead of PIPEDA](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/r_o_p/prov-pipeda/)
- [OPC, What you need to know about mandatory reporting of breaches of security safeguards](https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/privacy-breaches-at-your-business/gd_pb_201810/)
- [OPC, Guidelines for obtaining meaningful consent](https://www.priv.gc.ca/en/privacy-topics/collecting-personal-information/consent/gl_omc_201805/)
- [OPC, Guidelines for processing personal data across borders](https://www.priv.gc.ca/en/privacy-topics/airports-and-borders/gl_dab_090127/)
- [OPC, Getting Accountability Right with a Privacy Management Program](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda-compliance-help/pipeda-compliance-and-training-tools/gl_acc_201204/)
- [OPC, Principles for responsible, trustworthy and privacy-protective generative AI technologies](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai/)
- [Parliament of Canada, Bill C-36](https://www.parl.ca/LegisInfo/en/bill/45-1/C-36) and [Osler's summary of Bill C-36, 29 June 2026](https://www.osler.com/en/insights/reports/the-protecting-privacy-and-consumer-data-act-bill-c-36-key-obligations-and-enforcement-overview/)
- [McCarthy Tétrault, data breach legislation across Canada, 7 May 2026](https://www.mccarthy.ca/en/insights/publications/navigating-the-legislative-landscape-on-data-breaches-2026-data-breach-insights-part-3) (BC, Alberta and Quebec breach rules)

Consumer, marketing, age, financial regulation:
- [BC Government, Protecting consumers with new rules this summer, 9 February 2026](https://news.gov.bc.ca/releases/2026AG0007-000122)
- [DLA Piper, Amendments to the BPCPA, 30 May 2025](https://www.dlapiper.com/en-us/insights/publications/2025/05/amendments-to-the-bc-business-practices-and-consumer-protection-act) and [Miller Thomson, changes effective 1 August 2026](https://www.millerthomson.com/en/insights/marketing-advertising-and-product-compliance/changes-to-british-columbias-business-practices-and-consumer-protection-act-take-effect-august-1-2026-what-businesses-need-to-know/)
- [CRTC, Frequently asked questions about Canada's Anti-Spam Legislation](https://crtc.gc.ca/eng/com500/faq500.htm)
- [BC Age of Majority Act](https://www.bclaws.gov.bc.ca/civix/document/id/complete/statreg/96007_01)
- [BC Securities Commission, Companion Policy 31-103CP, 30 January 2026](https://www.bcsc.bc.ca/-/media/PWS/New-Resources/Securities-Law/Instruments-and-Policies/Policy-3/31103CP-CP-January-30-2026.pdf?dt=20260202163800)
- [Canada Gazette, Part I, Consumer-Driven Banking Regulations, 27 June 2026](https://gazette.gc.ca/rp-pr/p1/2026/2026-06-27/html/reg3-eng.html)

Platform and technical:
- Cloudflare: [Durable Objects data location](https://developers.cloudflare.com/durable-objects/reference/data-location/), [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/), [Durable Objects data security](https://developers.cloudflare.com/durable-objects/reference/data-security/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects pricing and Free limits](https://developers.cloudflare.com/durable-objects/platform/pricing/), [point-in-time recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)
- [Gemini API Additional Terms of Service, effective 23 March 2026](https://ai.google.dev/gemini-api/terms)
- [GitHub Advisory GHSA-wgrm-67xf-hhpq, PDF.js CVE-2024-4367](https://github.com/advisories/GHSA-wgrm-67xf-hhpq)
- [WebKit, Tracking Prevention](https://webkit.org/tracking-prevention/) (seven-day storage rule, checked 12 November 2026)
- [National Bank, exporting transactions](https://www.nbc.ca/en/business/help-centre/transactions/account-management/export-transactions-accounting-software.html) (example of CSV and OFX/QFX exports)
- Repository files read: `site/src/router.ts`, `site/src/tools/ids.ts`, `site/src/lib/api.ts`, `site/worker/hub.ts`, `site/worker/index.ts`, `site/public/_headers`, `tools/*/wrangler.jsonc`, `tools/suibian/src/client/privacy.html`, `docs/DESIGN.md`, `docs/briefs/`

## Appendix C. Questions for counsel

1. Does PIPA apply to a free public tool operated by an individual, and does PIPEDA apply to its processing outside BC?
2. Should the operator be an individual or a company, and what does that change for personal liability? Is cyber liability insurance advisable?
3. Do the Business Practices and Consumer Protection Act contract rules apply to a free service, and what must the Terms contain?
4. Which limitation-of-liability and indemnity wording is enforceable against consumers in BC?
5. Is self-attestation of age and province enough, and what should happen when a user is found to be ineligible?
6. Which provinces can be opened after BC, and what would Quebec require (privacy law and French language)?
7. In option A, how does client-side encryption affect breach assessment and the answer to access requests?
8. Are the cross-border and AI-provider disclosures sufficient, and is an assessment needed before using a processor outside Canada?
9. What retention period applies to consent records and to inactive accounts?
10. Could any planned insight or report be treated as financial or investment advice?
11. What changes if Bill C-36 passes in its current form?
12. Is "MoneyLens" clear to use as a name in Canada?

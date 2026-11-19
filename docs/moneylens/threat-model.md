# MoneyLens threat model

Version 0, 18 November 2026. Written before any code, for the decisions recorded in
[`docs/briefs/moneylens.md`](../briefs/moneylens.md): encrypted vault (D1-A), own origin
`money.changle.ca` (D2-A), external AI off by default (D5). Requirement and test IDs refer to
[`docs/moneylens.md`](../moneylens.md). The "status" column is updated as controls are built. This
is a working document, not a claim that the product is secure.

## What is being protected

| # | Asset | Where it lives |
|---|---|---|
| A1 | Financial records: transactions, accounts, balances, categories, rules, aliases, budgets, goals, notes, import history | Encrypted in the user's own Durable Object; decrypted only in the user's browser memory |
| A2 | The vault key and the secrets that unwrap it (passphrase, passkey, recovery code) | Vault key: browser memory while unlocked. Wrapped copies: the user's Durable Object. Secrets: with the user |
| A3 | The MoneyLens session | `__Host-` cookie in the browser; its SHA-256 in the user's Durable Object |
| A4 | The changle.ca account (email is its only factor) | Accounts service (`site/worker`), not MoneyLens |
| A5 | Consent, eligibility and security-event records | The user's Durable Object, readable by the operator |
| A6 | The site's shared daily allowances (requests, row writes, storage, email) | Cloudflare Free plan, shared by all of changle.ca |
| A7 | Statement files and transaction text in flight (import, optional AI call) | Browser memory; the AI proxy and provider in transit |

## Who might attack, and from where

- An outsider on the internet, with or without a changle.ca account.
- Another MoneyLens user trying to reach someone else's data.
- A script running on `changle.ca` (a flaw in a game, chat, a tool, or user content).
- Someone holding the user's mailbox or a stolen main-site session (valid for five years).
- A compromised dependency, GitHub Action or build step.
- Whoever controls the operator's GitHub, Cloudflare, mail-service or mailbox account, and any
  coding agent with merge rights.
- The operator and the platform themselves, in the sense of what they can read.
- A hostile statement file, and hostile text inside a real one.

Out of scope: malware or a malicious extension on the user's own device, someone watching the
unlocked screen, and a user who gives away their passphrase.

## Boundaries

1. Browser to `money.changle.ca`: the only origin that ever holds an unlocked vault.
2. `changle.ca` to `money.changle.ca`: same site to the browser, different origin. The only thing
   that crosses is a single-use handoff code.
3. Worker to the per-user Durable Object: the Worker picks the object from the verified session and
   from nothing else.
4. Worker to the accounts service: a service binding, never the public address.
5. Worker to the AI provider: only for users who opted in, only the fields in AI-3.
6. Repository and CI to production: every merge deploys.

## Threats and controls

| # | Threat (section 5.1) | How it would happen here | Controls | Proven by | What remains | Status |
|---|---|---|---|---|---|---|
| 1 | Account takeover through the mailbox or a stolen long-lived session | The attacker signs in to changle.ca as the user and asks for a handoff | Second step before any financial data: vault unlock (ARCH-6, VAULT-2). Short host-only session (ARCH-4). Session and device list with remote sign-out (ARCH-8). A session that has not unlocked can never read, and can erase only after a visible 7-day delay (VAULT-7) | T-3, T-5, T-25 | The attacker can see that a vault exists, read consent and security-event records, and start the 7-day erase. A weak passphrase can be guessed online, so unlock attempts are rate-limited and logged (SEC-17) | planned |
| 2 | Script injection elsewhere on changle.ca reaching MoneyLens | A script on the main site sends requests to MoneyLens with the user's cookie, or plants a cookie | Own origin with nothing else on it (ARCH-2). `__Host-` cookie, `HttpOnly`, `SameSite=Strict` (ARCH-4). Exact `Origin` check on every request (SEC-4). Strict content security policy, no inline or remote script (SEC-2). No cross-origin access granted. The handoff code is bound to a nonce that only the MoneyLens origin can set in this browser, so a code issued for someone else's account is refused (no sign-in to an attacker's account) | T-3, T-8, T-22 | A script on the main site can start a real handoff for the signed-in user. It gains nothing it can read or use: the session cookie is `HttpOnly` and every request needs the MoneyLens origin | planned |
| 3 | Cross-user access | A guessed or swapped identifier in a route, export or sync call; a shared cache | One Durable Object per user (ISO-1). The user is derived from the session only (ISO-2). Random 128-bit identifiers (ISO-3). No shared cache of API responses (`Cache-Control: no-store`). Per-user rules and aliases (ISO-5) | T-1, T-2, T-4, T-18 | A bug in the session check itself. This path needs a second reviewer on every change (SEC-9) | planned |
| 4 | Malicious or malformed statement files | A crafted PDF, a huge CSV, a file with the wrong extension | Parsing only in the browser, in a Worker thread (IMP-1, IMP-4). Size, page and time limits. Type checked by content. PDF.js 4.2.67 or later with `isEvalSupported: false`. Nothing is saved when a file is rejected (IMP-3) | T-10, T-11 | A new flaw in PDF.js. The content security policy limits what it could do, and PDF support ships after CSV and OFX | planned |
| 5 | Prompt injection through statement text | A merchant name that reads as instructions to the model | Text is passed as data. Output limited to the user's own category list by schema and validated. No tools (AI-6). AI is off by default (AI-1) | T-12, T-13 | A wrong category, which the user sees with its source and can correct in one tap (CLS-2) | planned |
| 6 | Compromised dependency or build chain | A malicious package version, a changed GitHub Action | Lockfile, audit that fails on high severity, Actions pinned by commit, as few dependencies as possible in crypto and parsing, update pull requests never merged automatically (SEC-7, SEC-9). Crypto uses the browser's WebCrypto only | CI | A malicious release that passes review. With the vault open, served code can read everything: see "What the vault does not protect against" | planned |
| 7 | Compromised operator account or a harmful agent merge | Stolen GitHub or Cloudflare login; an agent merges code that weakens a check | Phishing-resistant MFA on the four accounts (SEC-8). Required checks and a required review on MoneyLens paths (SEC-9). Secrets only in Cloudflare (SEC-6). No admin route returns financial records (SEC-13, ADM-2) | T-4, repository settings | Whoever controls the deployment can serve code that reads an unlocked vault. Stored data stays ciphertext | planned; SEC-8 and the repository rules need the operator |
| 8 | Exposure through logs, previews, screenshots, fixtures or AI tools | A transaction description in an error report; a real statement used as a fixture | No bodies or financial text in logs or error reports (OBS-1, AI-7). No third-party scripts (OBS-2). Synthetic fixtures only, made by a browser-only tool and checked by the operator (IMP-9, SEC-12). Separate staging data (SEC-11) | T-6, T-7, T-8 | A person pasting real data into a chat tool. This is a working rule, not something code can stop | planned |
| 9 | Abuse and cost exhaustion | Bulk sign-ups, large uploads, sync loops, AI calls, using up the site's shared daily allowance | Allowlist gate (SEC-10). Handoff rate limits and invitations before MoneyLens is reached (LIM-4). Per-user byte, write and AI quotas (LIM-2). AI budget cap that fails closed (AI-5). Batched sync (LIM-1). Alerts (SEC-16) | T-14, T-23 | The Free plan's limits are shared: another part of changle.ca can use them up and stop MoneyLens until the daily reset, and the reverse | planned |
| 10 | Data loss | A sync bug overwrites a chunk; the user loses passphrase and recovery code; the platform loses data | Versioned chunk writes, stale writes refused, record-by-record merge (VAULT-4). Server copy is the durable one. Platform recovery history, 30 days (BAK-1). Export at any time (BAK-2). Plain warning at setup (VAULT-5) | T-9, T-16, T-17, T-24 | A lost passphrase with a lost recovery code cannot be recovered by anyone. Until an off-platform snapshot exists (BAK-5), the only backup is in the same Cloudflare account | planned |

## What the vault does not protect against

The allowed wording is in VAULT-6. These limits are the reason for it.

- **The code the site serves.** The browser runs whatever `money.changle.ca` sends. Someone who can
  change that code (threats 6 and 7) can read a vault the next time its owner unlocks it. The vault
  protects stored data against a breach of storage and against a curious administrator. It does not
  make the operator unable to attack a user.
- **Guessing a weak passphrase offline** after the stored wrapped keys leak. The defence is a
  minimum passphrase strength and a slow key derivation (VAULT-7), and a passkey where the browser
  supports one.
- **Rollback and deletion.** The server can return an older version of a chunk or drop one.
  Versions are not authenticated end to end in the first release.
- **Metadata.** The server sees how many chunks a user has, their sizes, and when they change.
- **AI text in transit.** With AI on, description text passes through the proxy and the provider
  (AI-3, AI-7).
- **The user's own device.**

## Still to decide or confirm

- Key-derivation choice and parameters, recorded in the security assessment when the crypto is
  written (VAULT-2, VAULT-7).
- How unlock attempts are limited when the check happens in the browser: the server hands out the
  wrapped key, so the limit has to be on fetching it.
- Whether an account that fails eligibility keeps any record at all (Appendix C, question 5).
- Cloudflare's behaviour for deleted Durable Object data inside the recovery window (BAK-3).
- Who the second reviewer is for security-sensitive changes, and where the review is recorded
  (SEC-9).

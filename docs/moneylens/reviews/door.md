VERDICT: APPROVE (with six findings, none of which blocks the merge; finding 1 blocks opening the gate)

# C10: the door (the ways in, the app's first pages, the main site's page, and the settling of the shell review)

Reviewed commit `342bbbb3` (branch `claude/moneylens-door`, detached worktree), against `86f06a0a`
(main with the shell merged), on 27 November 2026.

Reviewer: Claude Opus 5.5 (model id `claude-opus-5-5`), run as a separate agent for this review
only. It took no part in writing the code, the author's tests or the documents. The author is
another Claude session, so author and reviewer are the same family of models. Their blind spots
may be shared: the same reading of a platform's behaviour, or the same idea of what an attacker
would bother with. So every claim below rests on a test or a line of code, not on the author's
text, and the places where nothing but a deployment can settle a question are listed apart.

## Verdict

**APPROVE** for merging the code at this head with the gate shut. No session can be given a
wrapper without showing its proof. No session can unlock itself or replace the ways in. The count
of wrong proofs cannot be got round by parallel requests, many sessions, both ways in or a restart,
and a right proof never counts as a try. Sync answers 423 to every session that has not unlocked.
The page and its files go out with the Worker's headers and nothing of the request. None of the
findings lets one person read another's data, opens a session that should not exist, or hands out
a key.

**Before the gate is opened to the owner alone** (the card's one more question): finding 1 must be
fixed (one line, plus its test), and the two deployment checks under "One more question" must be
done. Everything else can wait for the slices named.

## The earlier review's three findings

**Finding 1 (made-up ids and codes reach shared objects once any gate is open): resolved for ids,
partly resolved for codes.**
- Ids: `gate.ts` `listed` and `worker.ts` `route` stop any id that is not on `ALLOWED_ACCOUNTS`
  before `hashOf`, the limiter or any object, in both modes. The earlier `todo` test
  (`second: finding 1 (resolved at C10), owner gate: ...`) is now a plain test and passes: 20
  made-up ids, 0 object calls. The test that pinned the old cost now pins 403 and no object call.
- Codes and wrong tokens: these are counted per address before they cost anything (`within`
  before `stampNow`/`redeem` in `trade`, and before the object's `fetch` in `route`; checked by
  reading the code and by `tests/limits.test.ts`). But the key is the whole `CF-Connecting-IP`,
  and one IPv6 machine has a /64 of addresses. See finding 1 below.

**Finding 2 (change of address with no other session): not this branch's.** It is the accounts
service's to fix. The sentence in `flows.ts` (case 1) and in 1.8 now says exactly what the hub
does. I checked it against `hub.ts` and `handoffCodes.ts`, and it is accurate.

**Finding 3 (PUSH_MAX four bytes short): resolved.** `PUSH_MAX = 4 + HEAD_MAX + LIMITS.batchBytes`.
The old `todo` test only restated a constant and could not fail against the code. It now goes
through the Worker and the object: a body of exactly `4 + HEAD_MAX + batchBytes` bytes gets past
both size checks (400 `bad-request`, because it is not a frame), and one byte more gets 413.

## The obligations the earlier review put on this slice

**The app's pages and the page that finishes a sign-in.**
- A strict policy of their own on the same origin (SEC-2): **met.** See `PAGE_POLICY`. Only `/`
  carries it, and everything else keeps `default-src 'none'`. The page has no inline script or
  style.
- The code read from the fragment, taken out of history before anything else, and POSTed with
  `fetch`: **met.** `arrive` calls `replaceState` before `enter`. `codeIn` accepts only `#h=<code>`.
  The trade is a same-origin POST.
- The 503 "try-again" is sent back to `/enter` and not retried with the same code: **met.** It
  becomes the signed-out view, whose button is `/enter`. A retry from the trouble view no longer
  has the fragment.
- No page GET carries data: **met.** `/`, `/assets/*` and `/licences.txt` are static. `/enter`
  sets only a nonce.
- The rate limit of finding 1 in place before any gate opens: **met in code, weak for IPv6**
  (finding 1).

**The wrapped keys the server will keep.**
- In the account's own object, so `deleteAll` takes them: **met** (`ways` table, tested by
  `what ends 'unlocked' ...`).
- Handed out only by `act`, after the session check, in the same synchronous stretch: **met**
  (`vault/unlock` inside `act` and `atomically`).
- Never logged: **met.** `console.error` logs only error names, and no proof or wrapper reaches
  events. Tested: the database holds no proof, passphrase or code.
- Bounded in size: **met** (1024 and 256 characters, and a 4096-byte body; a real
  `vault/start` body is under 2500 bytes, tested).
- Replaced only by a session that proves the vault unlocked: **met trivially**, because nothing
  replaces them yet. The next slice must keep this rule.
- Every read and replacement in the events log: **met for reads** (`unlocked`, `unlock-failed`).
  But see finding 2 on whether the owner will ever see them.
- The restore runbook: still a document item. Not in code, and not asked of code.

## The card's nine points

1. **The ways in.**
   - Wrappers: none without a proof. Tested through the Worker: `vault`, `vault/way` (by kind and
     by id), `events`, `sessions` and a wrong `vault/unlock` never contain the wrapped key.
   - Starting again: the same id gives the same answer and changes nothing, and the asking session
     stays locked. Another id gets 409. Tested.
   - The count:
     - It is held in SQL for the account and checked inside one synchronous `act`. Parallel
       requests, three sessions, both ways in and a reloaded object all share it. Tested.
     - A right proof is never a try (25 in a row, tested).
     - Past the count the right proof waits too, as 1.9 says. Whoever holds a session can keep the
       owner out with no end, at 30 wrong proofs a rolling day: 1.9 admits "for as long as they
       keep at it". Pinned over five simulated days: the owner gets in only in the first ten
       minutes. The comment in `ways.ts` ("a day at a time") understates this a little.
   - "Unlocked" ends with `vault/lock`, `session/end`, `sessions/end` (by id, and others),
     `accountChanged` and `accountGone`. All tested through the Worker. A session that expires or
     is pushed out by a ninth sign-in leaves its `unlocked` row behind until the next
     `tidyUnlocked`. That is harmless, because session ids are random and never reused.
   - No route reaches chunks without "unlocked". Only `sync/pull` and `sync/push` touch chunks,
     and both check.
   - The proof is domain-separated from the wrapping key: the PBKDF2 salt prefix
     `moneylens/v1/proof/passphrase/` against `moneylens/v1/passphrase/`, and a different HKDF
     `info`. The prefixes differ at byte 14, so no vault id or salt can make one into the other.
     The server's SHA-256 of the proof costs a guesser a full PBKDF2 per guess, as the wrapper
     does.
   - The device checks the parameters (`isProofParams`: floor, ceiling, salt length, kind) before
     it makes a proof.
   - The comparison `same` is constant-time over fixed-length hashes, and the lookup is by way id,
     not by verifier.
2. **The obligations:** above.
3. **`page`.**
   - Only `/`, `/licences.txt` and `FILE` paths reach the file store, asked by path alone, with no
     headers.
   - Only a 200 is passed on, and of its headers only `Content-Type`.
   - Tested with a stand-in store that returns `Set-Cookie`, CORS and its own CSP: none of them
     reaches the browser. `/index.html`, nested folders, dotfiles and capital-letter endings all
     get 404.
   - Dot segments are normalised by the URL parser before the regex. `/assets/%2e%2e/licences.txt`
     becomes `/licences.txt`, which is allowed anyway.
   - `dist/app` holds only the page, its two hashed files, fonts, icon and licences, and the build
     clears it first. The `--watch` build (inline source maps) is never the deploy build.
   - The policy allows nothing the app does not use. The screens build no markup from data: Preact
     text only, and no `innerHTML` or `dangerouslySetInnerHTML` anywhere in `web/app` or
     `src/app`.
4. **The limits.**
   - Nothing that costs anything is reached before it is counted.
   - A stranger can spend only their own address's allowance, or that of the people who share
     their address.
   - A limiter that fails lets the request through. I agree: it guards cost, not access, and its
     failure is logged by name.
   - The "not the whole of it" in 1.8 is missing IPv6 (finding 1).
5. **`door.ts`.**
   - Everything from the server is shape-checked. `wrapper.kind`, `isWrapper` and the vault id
     passed to `unlock` stop a swapped wrapper from being read as a wrong passphrase.
   - A wrapper is a local variable of `open` and is never returned.
   - The fragment is matched exactly.
   - `leave` and `standing` misreport two statuses (findings 3 and 5).
6. **The screens.**
   - The recovery code is shown and the box ticked before `vault/start`.
   - Locking happens by the button, by the idle watch (two clocks, checked on look and on press),
     and on `pagehide` (keepalive). The key leaves memory with the `Home` component.
   - Signing out says "signed out" only on 200 or 401 (but see finding 3).
   - `localStorage` holds only the language (it is the only `localStorage` use in `web/app`).
   - The wording when a vault does not open follows 1.3. "changed" and "unsupported" are never
     shown as a wrong passphrase.
   - Not covered by the idle lock: the recovery-code screen holds the new key and the code with no
     timer (small notes).
7. **The main site's page.**
   - `MONEY` is a constant, so a code can go nowhere else. Tested in `site/tests/finance.test.ts`.
   - The nonce is shape-checked by the router and by the hub.
   - The code is not logged: the hub logs only path and error, and `handoff.ts` logs an error
     object that carries no arguments.
   - The nonce is in the main site's address and history until `location.replace`. It is not in a
     cross-origin Referer (`strict-origin-when-cross-origin`).
   - The argument for going on without a press holds for someone else's nonce. It leaves out a
     link to `money.changle.ca/enter` itself (finding 6).
8. **The tests.**
   - The author's new suites can fail where I looked.
   - I did not repeat the "85 checks taken out" exercise. I did find one test that could not
     fail: the earlier reviewer's own finding-3 test, now replaced.
   - `scripts/check-app.ts` stands in for the main site with a plain 302. It therefore exercises
     the MoneyLens side of the way in, but not `Finance.tsx`. That page is covered only by
     `site/tests/finance.test.ts`, which tests the plain functions and that nothing is logged.
   - Putting the `Origin` back in `tests/accounts/worker.ts` means the browser run does not test
     the Origin check against a real browser's header. That check is tested separately on the
     local runtime (T-22).
9. **Only a deployment can show:** below.

## Findings

### 1. The limiters count by the whole IPv6 address (does not block the merge; blocks opening the gate)

**Where:** `worker.ts`, `within`: `key: request.headers.get("CF-Connecting-IP")`.

**What:** An IPv6 client normally holds a /64, so one machine can give every request a fresh
key. Each made-up code would cost one registry read and one call into the hub (the one Durable
Object behind all of changle.ca's accounts). Each wrong token for the owner's id would cost one
request to his object. Neither would be limited at all. The owner's account id is not a secret
(it is in his cookie, and changle.ca has `/u/<id>` pages). 1.8's "many addresses each get their
own lid" admits botnets. It does not say that one IPv6 host is "many addresses".

**Test:** `finding 1: one machine's IPv6 addresses share one count` (todo).

**Fix:** for an address with a `:`, use its /64 (the first four groups, expanded) as the key, and
keep IPv4 as it is. Add the sentence to 1.8.

### 2. The owner cannot be sure to see the wrong proofs, which 1.9 relies on (does not block; for the events and devices slice)

**Where:** `account.ts`: `EVENTS_SHOWN = 50`, `EVENTS_MOST = 500`, trimming in `signIn` only.

**What:** 1.9 says that whoever holds the mailbox and guesses is seen, because "the owner sees
every one of those tries in the log". But the same person can fill the 50 lines shown with
sign-ins and sign-outs (ten an hour each is under the limit) within about three hours. In about
two days they can push the 30 `unlock-failed` lines out of the 500 that are kept. A related point:
right proofs are not counted, so a holder of the passphrase can write `unlocked` lines without
bound until the next sign-in trims them. Those writes count against the Free plan's shared rows
(LIM-1). That person already holds the vault, so it is a cost and not a hole.

**Test:** `finding 2: after thirty wrong proofs and an afternoon of signing in and out, ...` (todo).

**Fix:** keep wrong-proof lines out of the general trim. For example, keep a separate count since
the owner last looked, and show it above the list. Or let the events call page back through all
500. Also trim on `vault/unlock`. Reword 1.9 to match.

### 3. Signing out while the account is no longer let in says "still signed in" (minor, does not block)

**Where:** `door.ts`, `leave`.

**What:** A 403 `not-admitted` (the gate changed, or the account came off the list) is answered
with the session cookie cleared, both by `route` and by the object (`signedOut`). `leave` returns
false, so the screen says the sign-out failed and that the person is still signed in. Neither is
true.

**Test:** `finding 3: signing out when the account is no longer let in ...` (todo).

**Fix:** treat 403 with `why` `not-admitted` or `closed` as over.

### 4. Two sentences in the assessment that the code does not keep (documentation, does not block)

- 1.10, "Making a vault": "the session that asked twice is then not counted as unlocked, and the
  next screen asks for the passphrase". In fact the first `vault/start` unlocked that same
  session, the retry answers ok, and `RecoveryCode` goes to the open vault. The code is right and
  the sentence is wrong. Pinned in
  `a session cannot unlock itself, or put its own ways in, ...` (last two lines).
- 1.8, "The events log": "Failed attempts are not logged there ... Unlocks ... are not logged yet."
  1.9 and the code log both `unlock-failed` and `unlocked`.

**Fix:** correct both paragraphs.

### 5. "Slow down" is shown as the server's fault (minor, does not block)

**Where:** `door.ts`, `standing` and `keep`.

**What:** A 429 `slow-down` from the limiter becomes "The server didn't answer properly. Nothing
you did." on arrival. When making a vault it becomes `keepServer`. `open` already tells "busy"
apart from these.

**Test:** `finding 5: a request told to slow down is not said to be the server's fault` (todo).

**Fix:** map 429 `slow-down` to the `busy` wording in both places.

### 6. A link to `/enter` signs a person in with no press (low, does not block)

**Where:** `worker.ts` `enter`, together with `Finance.tsx`, which goes on by itself.

**What:** 1.10's argument covers a link that carries someone else's nonce. A plain link to
`https://money.changle.ca/enter` (or a page that navigates there) runs the whole round with the
visitor's own nonce. For anyone signed in at changle.ca, it opens a MoneyLens session with no
press. That spends one of the account's 12 sign-ins an hour, and from the ninth it pushes out
the session seen longest ago. Both sites refuse framing, so each visit is one round. No data is
reached and no other account is involved.

**Test:** none (it needs a browser).

**Fix:** none needed for the owner alone. Either say so in 1.10, or have the main site's page ask
for one press when the page was not opened from money.changle.ca (`document.referrer` is not
reliable, so a press is the honest fix).

**Smaller notes, no change asked:**
- In `VaultDO.fetch`, a body whose proofs are malformed gets 400 before the second session check,
  so a session ended during the body hears 400 and not 401. Nothing is done either way.
- The recovery-code screen (the key and the code in memory, before `vault/start`) has no idle
  lock.
- The `unlocked` rows of expired sessions and sessions pushed out by a ninth sign-in stay until
  the next tidy.
- Before the owner makes his vault, anyone with his mailbox could make one with their own ways
  in. With no reset built (VAULT-5), the owner could not then recover. For Phase 2 he should make
  the vault right after the gate opens.

## The one more question: opening the gate to the owner alone

**What stops it, and what settles each item:**

1. **Finding 1** (IPv6 keys). Settled by the /64 key and its test turning plain.
2. **What Workers Logs keep.** `observability.enabled: true` keeps invocation logs for every
   request. Before the gate opens, check in the dashboard on the gate-shut deploy that a logged
   `/api/...` request does not carry the `Cookie` header (session token, nonce) or a `Set-Cookie`.
   If it does, turn invocation logs off or set head sampling to 0 for this Worker. Settled by
   looking once and writing the answer in the brief.
3. **The rate-limiting binding on this plan.** With the gate open and no limiter bound, every
   `/api` call answers 503 `not-set-up`. Settled by one sign-in after the gate opens.

**What does not stop it, but the owner should know.** Without `MONEY`, a change of the owner's
address does not end his MoneyLens sessions, and there is no device list in the app yet. So if he
changes his address because the mailbox was taken, a session the taker opened lives on for up to
12 hours (30 minutes idle). It cannot read anything, but it can spend the wrong-proof count
(keeping him out for up to a day after it stops) and end his sessions. Deleting his account
leaves his MoneyLens data until `MONEY` lands. The hub's queue keeps the notice and retries once
a day while the binding is missing (`goneNotices.ts`), so nothing is lost. Neither is a reason to
wait for the owner alone. Both are reasons why `MONEY` and the device list come before anyone
else.

## What was run

Node 22, in `tools/moneylens` of the worktree, with my two test files in place:
- `npx tsc --noEmit`: clean.
- `npx tsc --noEmit -p src/server/tsconfig.json`: clean.
- `node --import tsx --test tests/second-shell.test.ts`: 43 tests, 43 pass, 0 fail, 0 todo.
- `node --import tsx --test tests/second-door.test.ts`: 12 tests, 8 pass, 0 fail, 4 todo.
- `npm test`: 513 tests, 509 pass, 0 fail, 0 skipped, 4 todo (the four below).

In `site`: `npx tsc --noEmit` clean, `npx tsx tests/finance.test.ts` all good,
`npx tsx tests/routes.test.ts` all passed.

**Tests marked `todo`** (they fail while their finding stands), all in `second-door.test.ts`:
- `finding 1: one machine's IPv6 addresses share one count`
- `finding 2: after thirty wrong proofs and an afternoon of signing in and out, ...`
- `finding 3: signing out when the account is no longer let in ...`
- `finding 5: a request told to slow down is not said to be the server's fault`

**What changed in `second-shell.test.ts`** (only what the four changes force, plus the two
`todo` tests):
- The harness binds `TRADES` and `ASKS` limiters that always say yes.
- `vault/start` bodies carry two ways in (`startBody`).
- The two tests whose body is streamed while a notice runs now stream a whole `vault/start`
  body, with its true length. With `{ vault }` alone the object now answers 400 for the missing
  proofs before its second session check, so the test would no longer test that check.
- The 413 length check is four bytes longer.
- The owner-gate test that pinned "a made-up id reaches an object" now pins 403 and no object.
- The finding 1 test is plain.
- The finding 3 test is plain and goes through the Worker and the object.

**Not run:** `npm run test:server`, `npm run test:app`, `wrangler` and any browser, because their
ports are used by other work on this machine. The card says the author ran both at this head
(17 platform tests, and the browser check) and that CI runs them. I did not see those runs. I also
did not repeat the author's exercise of taking out each of the 85 checks. No network was used,
nothing was committed, and only the three files of this review were written.

## Only a deployment can show

Beyond the list in `reviews/server-shell.md`:
- That the rate-limiting binding exists and answers on the account's plan, that its 60-second
  period and per-location counting behave as 1.8 says, and what `CF-Connecting-IP` holds for IPv6
  clients and for Cloudflare's own proxies (WARP, iCloud Private Relay share addresses).
- That `run_worker_first: true` sends `/` and `/assets/*` to the Worker, so the file store is never
  served past the gate and its headers. Also that `ASSETS.fetch` for `/` answers `index.html`
  with `not_found_handling: none`, and with what `Content-Type`.
- That a `keepalive` POST sent on `pagehide` arrives, on iPhone Safari, Android Chrome and desktop.
  Where it does not, a session stays unlocked for up to 30 idle minutes (1.10 admits this).
- What Workers Logs record of a request (the `Cookie` header in particular), with observability on.
- The idle lock on phones: whether `visibilitychange` and `pageshow` fire after the phone has been
  locked for longer than 15 minutes, and that the press that wakes the page locks it.
- Real PBKDF2 at 600,000 iterations on a low-end phone, three times on the way in (a proof and two
  wrappers when making; a proof and an unwrap when opening).

## Obligations on the next slices

**Erasing a vault (VAULT-5, VAULT-7).**
- Only from an unlocked session at once, any other after seven days, as 1.9 says. The check goes
  in the same `act` stretch as the delete.
- Delete chunks, vault, ways, tries and unlocked rows, never `deleteAll`.
- Log the request and the erase.
- Provide the reset path before anyone but the owner is let in, so that a vault made by a mailbox
  taker can be undone.

**The weekly sweep (ARCH-10):** as in the shell review. In addition, a sweep that erases must also
take the `ways` table.

**The list of devices and the events screen.**
- Show wrong proofs so that later events cannot push them out (finding 2).
- Show which sessions are unlocked.
- Let the owner end any of them. Ending a session must drop its `unlocked` row in the same
  stretch (it does today: keep it).

**Changing the passphrase and a new recovery code.**
- Only from an unlocked session that shows the proof of the way being replaced in the same
  request.
- Replace the wrapper, parameters and verifier in one transaction, and log it.
- Leave the count untouched by a right proof.
- Use a fresh proof salt.
- Never let a replacement go through `vault/start`.
- Keep a fingerprint of the ways in on the device, so that a replacement behind its back is seen
  (1.9's "not in this").

**The import page.**
- It stays under `PAGE_POLICY`. pdf.js workers need `worker-src 'self'` added deliberately, and
  nothing else. No `blob:` or `data:` unless argued.
- Parsed statement text is written as text only.
- Nothing parsed goes into `localStorage`.
- The idle lock covers the import screens, including a long parse.

No real account, statement, key or token is in this review or its tests. Every value is invented.

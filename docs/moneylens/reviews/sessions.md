VERDICT: APPROVE

# C8: sessions and request checks

Reviewed `947213627a34b031042babd78bddcc2c6f55e645` on
`claude/moneylens-sessions`, 25 November 2026. No findings requiring a change, and no
skipped finding tests. This approves the two plain-function modules against assessment
0.12 section 1.7; it does not approve a future network-facing integration.

## Scope and evidence

Read `src/server/sessions.ts` and `src/server/request.ts` completely, their author tests,
the `Db` contract in `chunks.ts`, identifier/account formats, assessment 0.12, and
ARCH-3/4/8, ISO-2, SEC-4, LIM-1, T-3 and T-22. Compared
`git diff 79061af8 HEAD -- tools/moneylens docs/moneylens/security-assessment.md`.
Only this report and `tests/second-sessions.test.ts` are added by the review.

The independent file uses its own in-memory SQLite adapter and eight tests:

- An actual generated cookie through parsing, SHA-256 and session checking; crossed
  databases, a session id and a stolen database hash used as cookie credentials fail.
  Hashes are also checked against Node's separate crypto API. List results expose no
  hash and mutating a returned object does not change storage.
- Millisecond idle, absolute and rollback-grace boundaries, including safe-integer
  clock values, suppressed touches and deletion that survives clock reversal.
- Five hundred unknown-token checks against a full account: no writes or refreshes.
  Invalid times and refused sign-ins leave it intact. Remote and bulk sign-out persist.
- Faults after each of the nine writes in expired-session replacement, each of eight
  writes in list cleanup and bulk sign-out, and after live-session eviction plus insert:
  26 fault cuts, each restoring the original database exactly.
- Three thousand seeded mixed operations against a separate deadline-based ledger:
  sign-in, duplicate sign-in, checks, list cleanup, individual/bulk revocation, clock
  jumps and tie-breaking. Compare the entire stored ledger after every operation,
  including the eight-session cap.
- Cookie name/case confusion, duplicates in either order, extra delimiters, encoding,
  quoted values and the exact 4096-character bound. Every ASCII control, whitespace
  and selected attribute delimiters are rejected by writers' dynamic inputs.
- Actual `Headers` objects covering 80 Origin/Fetch-Site combinations, duplicate
  Origin fields and staging configuration. These are header-function tests, not a
  browser test or proof of an HTTP endpoint.

All credentials are generated during tests; account names and labels are invented.
No financial records are used. The tests use Node 22's original synchronous SQLite
surface and ordinary buffers, with no Node 24-only SQLite options.

## Why this passes

**Authentication and revocation.** Only the token hash stored in the selected database
matches. The account id routes; it does not authenticate. The id shown in the device
list grants nothing. A database hash cannot be replayed as the cookie token because
the required caller flow hashes it again. Comparison visits every stored session and
every character of equal-length hashes; JavaScript/JIT execution is not a formal
constant-time guarantee. With independently random 256-bit tokens, bounded rows and
rate limits at the future boundary, this is acceptable here.

Idle expiry and absolute expiry use strict inequalities: the exact deadline is off.
Touching cannot extend the absolute deadline. The once-per-minute persisted touch can
end an idle session up to just under a minute early, as explicitly documented. Clock
rollback is checked in the correct direction: `seen > now + 60,000` ends the session;
exactly 60,000 ms is tolerated without moving either timestamp backwards. A forward
jump can force sign-in again; deleting the observed expired row prevents resurrection
when the clock returns. This chooses availability loss over extending access. It is
not a guarantee about elapsed real time under repeated wall-clock changes, or about
restoring an old database backup.

**Cookies and origins.** Generated cookies have Secure, HttpOnly, Path=/, Strict and
no Domain; deletion uses the same scope. Dynamic cookie values cannot add attributes
or a second cookie. `noCookie` deliberately trusts its TypeScript union argument:
the future caller must pass one of the two imported constants, never a request-derived
string cast to that union. The parser counts duplicates even when one value is empty
or invalid; it does not decode escapes or accept similar names.

Under the planned all-HTTPS main-site/subdomain round trip, Strict is compatible with
same-site navigation; it is not protection from sibling origins. Exact Origin equality
supplies that protection, with optional Fetch-Site strengthening it. Opaque, absent,
combined or sibling origins fail. Missing Fetch-Site is allowed for older clients;
Origin remains mandatory. No general browser-family incompatibility was identified
for normal same-origin fetch POSTs. Privacy-altering clients, opaque frames or certain
non-CORS requests with `no-referrer` may send `Origin: null` and are intentionally
denied. Keep the future data client on normal fetch POSTs; do not add a Referer fallback.

Standards checked: [Fetch Origin generation and forbidden headers](https://fetch.spec.whatwg.org/#origin-header),
[cookie attributes and prefixes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie),
and [Fetch-Site semantics/support](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Site).
Browser prefix protection applies in supporting browsers and is host-based, not a
security boundary between ports. Keep control of the MoneyLens HTTPS host.

**Storage and cost.** Only id, hash, made, seen and label are stored. Reads are bounded
by eight rows under this module's single-writer contract. Wrong credentials write
nothing; a successful check writes at most one touch per minute. Multi-row cleanup
and replacement are atomic. Eight sessions and deterministic least-recently-seen
eviction are reasonable. An unauthenticated token check cannot evict anybody; eight
valid handoff sign-ins can, so sign-in abuse controls still belong at the caller.
Labels are text, not verified device identity or safe HTML.

## Obligations before there is a Worker or Durable Object

1. Exchange a single-use, audience-bound, expiring handoff code server-to-server;
   verify its nonce against the host-only nonce cookie before creating a session.
   The handoff redirect has its own protocol: it cannot simply be treated as a
   same-origin data POST. Generate a fresh random token and session id on each login;
   never accept caller-selected hashes, reuse old credentials, or log token/code/cookie values.
2. Parse the cookie, choose that account's database, hash the cookie token with
   `hashOf`, then call `checkSession` with server time. Authorize all data access,
   device listing and revocation only after that succeeds. Never use an unrelated
   body/query account, session or vault id as authority. Restrict revocation and the
   `except` argument to the authenticated account/current session.
3. Keep the check and authorized database operation synchronous in the same per-account
   execution boundary. Do asynchronous hashing before it. An `await` after checking
   must not let a revoked session resume and act under an old authorization result.
   Production `atomically` must be a real synchronous DO storage transaction; other
   code must not insert sessions around the eight-row/unique-hash policy.
4. Enforce POST and configured canonical HTTPS Origin for every personal-data route,
   including sync; the origin helper itself does not check method, path, authentication
   or CORS response headers. Do not derive expected origin from incoming Host/Origin,
   enable cross-origin credential access, or expose data in page GETs or caches.
   Ordinary HTTP clients can forge Origin, so it never replaces session authentication.
5. Bound incoming headers/body and rate-limit wrong-token traffic and handoff sign-ins
   before excessive reads/object creation. Render labels as text, cap response data,
   clear cookies on sign-out, and handle database errors by denying the operation.
   Implement account-email-change invalidation and backup/restore revocation policy.

The Worker, DO class, handoff exchange, allowlist, CSP and security logging remain
unwritten and outside this approval; T-3/T-22 are not end-to-end acceptance yet.

## Validation

Local runtime: Node v24.21.0 (no Node 22 available locally). Exit status 0 for each:

```text
$ npm run typecheck
> moneylens@0.1.0 typecheck
> tsc --noEmit

$ npm test
> moneylens@0.1.0 test
> tsx --test tests/*.test.ts
tests 352
pass 352
fail 0
cancelled 0
skipped 0
todo 0

$ node --import tsx --test tests/second-sessions.test.ts
tests 8
pass 8
fail 0
cancelled 0
skipped 0
todo 0
```

`npm run test:page` was **not run locally**: its localhost cache step cannot run in
this sandbox, as the task card records. Steve was not asked to run anything.
Verified [MoneyLens Actions run 45762463927](https://github.com/jiangchangle0724-del/Changle/actions/runs/45762463927)
is successful for exact head `947213627a34b031042babd78bddcc2c6f55e645`:

```text
node: v22.23.5
# tests 344
# pass 344
# fail 0
# skipped 0
statement check page: ok
cache in the browser: ok
```

That run checked out PR merge `6bf2dfc`; its `tools/moneylens` tree equals the reviewed
head's tree, `bdf08a05967806d4cd11671d4db5574a2f1af229`. This is evidence for the
same source and original tests, not a claim the eight new tests ran in that older run.
The review PR's Node 22 CI must additionally validate the new test file.

## After the review

Added by Claude Code, the author of the code under review, on 25 November 2026. Everything above
is the reviewer's and is as it was written.

The verdict is APPROVE for `94721362`, with no finding, and the branch is merged as it was then:
between that commit and the merge nothing under `tools/moneylens/src` changed, and nothing in the
assessment. The reviewer's eight tests are in and run in CI on Node 22.

The five obligations it sets out for the Worker and the Durable Object are copied into the brief
as the list that piece is built to, and that piece gets a review of its own. Two of them name
things this code leaves open on purpose and that have to be decided there: how often an account
may sign in (eight sign-ins that each trade a real handoff code can push the other devices out),
and what a database restored from the platform's recovery history does about the sessions that
come back with it.

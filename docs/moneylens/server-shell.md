# The server's shell: design notes for the next slice

Status: **built, not merged, not published** (#814, 2026-11-26; it waits for its SEC-9
review). What it does is now written in the security assessment, section 1.8, which is the
authority; this file stays as the plan it was built from, with two corrections below.

Changed while building: the server's files no longer import the device's sync layer. What both
ends say to each other (the two calls, the limits, how a sealed copy is named) moved out of
`vault/sync.ts` into `vault/protocol.ts`, untouched, and `sync.ts` hands it on under the same
names.

Changed after the review (C9, two findings): the plan below had a sign-in and the accounts
service's notices pass each other with nothing to put them in order, and had signing in write
in two steps. Now a notice sets a new stamp in the registry first, a sign-in reads it before
its code is traded and the account's object reads it again before it opens the session, and
signing in is one transaction. The steps and the reasons are in `src/server/flows.ts` and in
the assessment, 1.8 ("A sign-in and a notice at the same time").

## What the platform allows (read on 2026-11-25, Cloudflare's limits pages)

- A Worker on the Free plan gets **10 ms of CPU per request**. Waiting (on the body, on a Durable
  Object, on a service binding) is not CPU. So the Worker must not parse or copy a large body.
- A Durable Object: 30 s of CPU per request by default. The page also says Durable Objects "have
  the same per invocation CPU limits as any Workers do", and gives no figure for the Free plan.
  **Not known: whether a Free-plan object is held to 10 ms.** Design for little CPU either way,
  and measure on the platform at the first deploy (Phase 2), before real statements go in.
- SQL in an object: 100 bound parameters a query; the largest string, BLOB or row is 8 MB by
  today's page (2 MB was noted earlier the same day; a sealed chunk is at most 1 MB + 29 bytes,
  under both). 100,000 rows written and 5,000,000 read a day, 5 GB in all, shared by all of
  changle.ca (LIM-1). 100,000 Worker requests a day; past that the route fails (error 1027).
- `wrangler dev` runs the real runtime on this machine and in CI, as `tools/split` does
  (`npm run test:server`, with a stand-in for the rooms server). It does not enforce CPU limits.

## Shape

One Worker, `moneylens`, on `money.changle.ca` (D2; the DNS record is made by `custom_domain` at
the first deploy). Two Durable Object classes, both on SQLite:

- `VaultDO`, one per account, named by the account's id: sessions, chunks, the events log, and a
  one-row note of whose it is and whether the owner signed in. Nothing of two people in one
  database (ISO-1).
- `Registry`, one in all: the ids of accounts that have ever signed in, and nothing else. It is
  what the weekly sweep (ARCH-10) will read, and what a cap on the number of users will count.
  An account is noted there before its own database is touched.

The logic stays in plain functions on a `Db`, tested on Node's SQLite as `chunks.ts` and
`sessions.ts` are. The classes only adapt `ctx.storage.sql` and `ctx.storage.transactionSync`.

## A request's way in

1. `GET /enter`: with the gate open, sets the nonce cookie and sends the browser to
   `https://changle.ca/tools/finance?handoff=<nonce>`. With the gate closed, a short page in both
   languages and nothing else. No other GET exists until the app's pages do.
2. Everything under `/api/` is POST, with the exact configured Origin (`fromOurOrigin`; the
   expected origin is a setting, `ORIGIN`, never taken from the request), a stated
   `Content-Type`, and a `Content-Length` under the route's cap. No `Access-Control-*` header is
   ever sent; `OPTIONS` is refused.
3. `POST /api/session` trades the code: `env.ACCOUNTS.redeem(code, "moneylens")`, the nonce it
   returns compared with the nonce cookie, the gate asked, a fresh token and session id made
   here, `Registry.note(id)`, then `VaultDO.signIn`. The reply sets `__Host-ml` and clears the
   nonce cookie. The label of the session is worked out here from the User-Agent ("Chrome on
   Windows"), not taken from the page. At most 12 sign-ins an hour for one account.
4. Any other route: the cookie is parsed (`readSession`), the gate asked, the token hashed
   (`hashOf`), and the request handed to **that account's** object with `stub.fetch`, body
   untouched and unread (the Worker's 10 ms). The object looks for the session once before it
   reads the body (so a caller without one cannot make it hold 8 MB), reads the body up to the
   cap, and then, in one synchronous stretch, checks the session again and does the thing
   (obligation 3 of the review of #789). A wrong token costs one object request and at most
   eight short rows read, and writes nothing; a database that was never signed in to has no
   tables and gets none.
5. Every answer carries `Cache-Control: no-store`, HSTS, `nosniff`, `Referrer-Policy:
   no-referrer`, `frame-ancestors 'none'` (SEC-1). An answer to a request whose session is not
   on clears the cookie. A database error is an answer of "unavailable" and nothing done.

Routes behind a session: `session/end`, `sessions`, `sessions/end` (`{ id }` or `{ others }`),
`vault`, `vault/start`, `sync/pull`, `sync/push`, `events`.

## The gate (SEC-10, T-23)

A setting, `GATE`, with three values; anything else is read as the first.

- `closed` (what the repository says): no route answers anything but "not open".
- `owner`: a sign-in is let in when the accounts service says the account is the owner's
  (`master`). The object remembers that, and asks for it on every request.
- `list`: a sign-in is let in when the account's id is in `ALLOWED_ACCOUNTS`. The Worker asks
  the list on every request, before any object is reached; taking an id off the list takes
  effect at once.

Opening the gate is Steve changing that setting, recorded with the date in the brief.

## Sync over HTTP

Blobs are not put into JSON (base64 of 8 MB and parsing it would cost more CPU than there is).
A push's body and a pull's answer are a frame: four bytes of length, that many bytes of JSON
(`{ vault, writes: [{ id, base, mark?, bytes }] }`), then the blobs one after another. Small
answers and all refusals are JSON. `src/server/wire.ts` holds both directions, for the object and
for the device's `Remote` over `fetch`.

Quotas (LIM-2): `QUOTA_VAULT_BYTES` and `QUOTA_WRITES_PER_DAY`, read with bounds, the defaults
being `LIMITS` in `vault/sync.ts`. The day for the write count is the object's own UTC day, and
never an earlier one than the last it used.

## The other way in: `Internal`

For the rooms server only (a service binding, never the public address):
`accountGone(id)` empties that account's object (`deleteAll`) and `accountChanged(id)` ends all
its sessions. Both answer normally for an account that was never here and throw when they fail,
which is what the accounts chat's contract asks (`accounts-requests.md`).

## Decided here

- A restored database can bring back sessions that had been ended. The restore runbook ends every
  session of the restored account (`accountChanged` does it).
- Wrong-token traffic is not rate-limited in code: an object cannot refuse a request without
  having been asked. The cost of each is small and written above. A rate-limiting rule on
  `/api/*` is a Cloudflare setting, to be asked of Steve before Phase 3.

## Not in this slice

- Erasing a vault (VAULT-5, VAULT-7): the seven-day delay and its cancelling, and the proof that
  a session has the vault unlocked, which needs a design on the device's side first.
- The weekly sweep (ARCH-10), consent and eligibility (CON-1 to CON-7), admin numbers (ADM).
- The app's pages, and with them the page that finishes the hand-off (`/#h=<code>`).
- The main site's page at `changle.ca/tools/finance?handoff=<nonce>`.

## What the reviewer of #789 asked of this slice

The five obligations in `reviews/sessions.md`, and from the review of #782: guard the version
count against overflow, and test on the platform what Node's SQLite cannot show (the types a
BLOB comes back as, the limits at their largest sizes, a failed write undone, what is still
there after a restart, what a call is billed, a stored number that is not a number).

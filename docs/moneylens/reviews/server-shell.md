VERDICT: APPROVE (with three non-blocking findings, and conditions on opening the gate)

# C9: the server's shell (the Worker, the Durable Objects, the gate, sync over HTTP)

Reviewed commit `818039e5` (a merge of main into `claude/moneylens-server-shell`; its
`tools/moneylens` tree and the MoneyLens documents are identical to `1a3726ec`), on 26 November
2026, in a detached worktree.

Reviewer: Claude Opus 5.5 (model id `claude-opus-5-5`), run as a separate agent for this review
only. It took no part in writing the code, the author's tests or the documents. The author is
another Claude Code session; being the same model family is a limit on independence that the
reader should weigh, and is why every claim below is backed by a test or a line reference rather
than by agreement with the author's text.

The previous reviewer (OpenAI Codex) left a test file written for `189ad559`, with two findings,
and no review text. That file is kept, adapted, inside `tests/second-shell.test.ts`: its harness
(the real `worker.ts` bundled with esbuild, only `cloudflare:workers` and the transport between
objects replaced) got the three methods the card names (`stampNow`/`newStamp` on the registry,
`exists` on the accounts service, a promise from `VaultDO.signIn`) and a way to hold any call
between objects after its effect and before its answer. Its nine tests run there; its two
finding tests run as plain tests and pass. Everything else in that file is this reviewer's.

## Verdict

**APPROVE** for the code at this head, for merging with the gate shut and no Workers Build
connected (as 1.8 states). Nothing found lets one person reach another's data, opens a session
that should not exist, or leaves a database the registry does not know of. The three findings
below do not block the merge. Finding 1 must be settled **before the gate is opened in any mode,
`owner` included**, not "before Phase 3" as 1.8 says.

## The previous reviewer's two findings

**Finding 1 (a notice passes a sign-in whose code is already traded): resolved.** Checked three
ways.

- Codex's own test, unskipped: the sign-in is held after `note`, the whole notice runs, the
  sign-in resumes. At this head it answers 503, gives no cookie, opens no session; for a deleted
  account the database has no tables and the registry is empty. Both notices pass.
- My tests hold the sign-in at each of its four waits in turn (after the Worker's stamp read,
  after `redeem`, after `note`, and while the object waits for its own stamp read), for a first
  and a returning sign-in, for both notices: 16 tests, all pass. Plus: the object's answer held
  after it wrote the session (the deletion then empties it; the cookie the browser gets opens
  nothing); two sign-ins of one account with a deletion between them; a notice that is over
  before the sign-in starts (case 1: a surviving code signs in, the old session is ended).
- By reading the argument in `flows.ts` case by case (below).

**Finding 2 (a sign-in that fails after its session is written): resolved.** `signIn` in
`account.ts` now does the tables, `openSession` (with its own eviction), the owner mark and the
event lines in one `atomically`. Codex's trigger test (ninth device, the sign-in event refused)
passes: the eight sessions are exactly as before. My added test fails the first event insert of
a *first* sign-in: no table is left. The platform behaviour of a nested `transactionSync` is
shown only by `tests/platform/server.test.ts` (`Probe`), which I did not run (see "What was
run"); CI ran it on this commit.

## The argument in flows.ts, checked

It rests on three things. Each is true in the code, with one imprecision (finding 2).

1. **The registry is one object.** `doorsOf` and `VaultDO.signIn` both use
   `REGISTRY.idFromName("registry")`. `stampOf`/`setStamp` are single statements. True in code;
   that one name means one live instance is a platform guarantee (below).
2. **The order inside `signInHere`.** `noticed()` read, `await stampNow()`, `noticed()` read again
   and the stamps compared, then `inside.open()`, which is `signIn` on `dbOf(...)`: synchronous
   SQL and `transactionSync`, no `await`. `VaultDO.signIn` does only `configOf` before it. Both
   notices bump the count synchronously before any await (`erase` bumps before `deleteAll`), so a
   notice whose work starts while the object waits is always seen. True.
3. **What the accounts service does before it tells MoneyLens** (`site/worker/hub.ts`,
   `handoffCodes.ts`).
   - Deletion: `deleteUser` deletes the `users` row and calls `forgetHandoffs(id, true)` in one
     synchronous stretch, then queues the notice (`noteGone`, `tellGone` in `waitUntil`).
     `redeemHandoff` checks `account(id)` after its one await (the hash), so a code of a deleted
     account never trades, whether or not its row was dropped. True.
   - Change of address: `emailMade` calls `signOutOthers` before `noteGone(..., "money-changed")`.
     `signOutOthers` → `endSessions`, which drops the account's waiting codes **only if there was
     at least one other session** (`if (!hashes.length) return;`). See finding 2.
   - `exists` (`accountsThere`) throws on a bad question instead of answering "none". True.

**Is there a fourth case?** For a notice about the account signing in, the three cases cover
every position of the notice's `newStamp` relative to the two stamp reads, and the count covers
the notice's work arriving during the object's wait. I found no fourth ordering. Things outside
the argument that do end changle.ca access and do not tell MoneyLens: a ban or kick
(`dropUser`) and signing out at changle.ca. A banned account's MoneyLens sessions live out their
30 minutes / 12 hours. Not required by any SEC/ARCH id I could find; noted for the operator.

**Does the every-order test model the platform?** Mostly. Its steps are the calls between
objects, with the object's call split into arrive / question reaches the registry / answer
returns; effects happen at a step and the caller resumes at the next, which is equivalent to an
answer held in flight. Two things it does not model, both covered elsewhere: `erase` is
synchronous in the model while the real one awaits `deleteAll` after bumping the count
(`objects.test.ts` covers "before the emptying is over"); and only two threads run (my
two-sign-ins test covers one three-thread order, not all).

**The count in memory.** Holds only within one call, which is all it is asked to do. A restart
drops the in-flight call. Two live instances of one object would break it (each has its own
count): that is excluded only by the platform's guarantee (below).

**The cost.** A notice turns away every sign-in under way, for everyone. Notices are rare and not
reachable by strangers (`Internal` is a named entrypoint). One way an ordinary changle.ca account
makes them: trade a code (even one not let in: `redeemHandoff` records `handoff_apps` before
MoneyLens asks the gate), then delete the account. Cheap per notice, and account creation is
mailbox-gated. Acceptable. A made-up code costs a registry read plus a hub call (finding 1).

**Emptying after a turned-away sign-in (`tradeCode`) is safe.** It runs only when `exists`
answers that the account is not there, through the same binding that just redeemed a real code
for it; ids are random and not reused; an error leaves it for the sweep. Tested: with `exists`
failing, the account stays on the registry and its database stays empty; never the reverse.

**What the change broke in what was already passed.** Nothing found. `chunks.ts`'s new guards
(`vaultRow` throws on nonsense; the version-count check inside the transaction) end in the
object's `catch` as 500 with nothing written. `protocol.ts` and `sizes.ts` are a move: the
removed lines of `sync.ts` and `crypto.ts` are the added lines, `sync.ts` re-exports them, and
only the import of `MAX_CHUNK_BYTES` changed in `crypto.ts`.

## The card's seven points

1. **The five obligations of `reviews/sessions.md`.** 1-4 are met: the code is traded server to
   server and its nonce compared with the host-only cookie before any write; the token and
   session id are made in `trade` (body fields `account`, `session`, `hash`, `token` are ignored:
   tested); the cookie's account only picks the object and is compared there; the expected
   origin is `config.origin` from the settings, never the request; in `VaultDO.fetch` the only
   wait (the body) is between the first `sessionFor` and `act`, which checks again with nothing
   waiting (Codex's revocation test, and mine for a deletion during the body). Obligation 5 is
   **partly** met: bodies and cookie text are bounded, errors deny, labels are fixed words, email
   change ends sessions; but wrong-token traffic and code trades are not limited in code
   (finding 1).
2. **Two people.** Forged `x-ml-account`/`x-ml-hash` headers, another account in a body, another
   person's session id and vault id: each reaches only the cookie's own database (Codex's test).
   The DO's response headers do not pass through the Worker. `Registry` and `Internal` have no
   route (404 tested for six such paths).
3. **The gate.** Closed, misspelt, owner and list each tested; a sign-in not let in writes nothing
   at MoneyLens (registry 0, no object reached) but the code is spent and the hub records
   `handoff_apps`. Taking an id off the list stops it at once; putting it back revives its open
   sessions within their lifetime (pinned; acceptable, worth knowing).
4. **Trading the code.** Unknown, replayed, other-nonce and deleted-account codes get one
   identical body; the nonce cookie is cleared on each; no nonce, a doubled nonce, or a code that
   does not look like one asks nobody and sets no stamp (tested). Half-way failures: a registry
   failure at `note` gives 500 and reaches no object; a failure inside the object writes nothing.
5. **Frames.** `unframe` bounds the head, `cut` needs whole counts that use up the body exactly
   (sum is monotonic, so no clamped view passes), blobs are views but `toSql` copies; a stored
   blob has exactly its own length (tested through the Worker). Finding 3 is a nit on the limit.
6. **Cost to a stranger.** See finding 1. I agree nothing else is costlier than 1.8 says.
7. **Not known.** Agreed: the Free-plan object's processor time for a largest push must be
   measured before a real statement goes in. More in "Only a deployment can show".

## Findings

### 1. Not limited in code: made-up ids and made-up codes reach shared objects once the gate is open at all (non-blocking for the merge; blocks opening the gate)

**Where:** `worker.ts`, `route` (owner mode) and `trade`; `flows.ts`, `tradeCode`.
**What:** with `GATE=owner`, any cookie `__Host-ml=<any id>.<any 43 chars>` with a forged
`Origin` header (curl can set it) reaches that id's Durable Object: one Worker request, one DO
request, one read, per made-up id. With any open gate, `POST /api/session` with any nonce cookie
(it is not signed; any value of the right form is read) costs one read of the single `Registry`
and one call into the accounts hub, the one Durable Object behind all of changle.ca's accounts,
before anything about the caller is known. LIM-1 says these limits are shared by every part of
changle.ca, and the hub is the main site's single point. 1.8 states this cost and defers it to a
Cloudflare setting "before Phase 3"; Phase 2 (owner mode) already exposes all of it, and
`sessions.md` obligation 5 asked for it before object creation.
**Test:** `second: owner gate: a made-up account in a cookie reaches an object...` (plain, pins
it) and `second: finding 1, owner gate: ...` (todo).
**Fix:** for Phase 2, run the gate as `list` with the owner's id alone (the Worker then stops
every other id before any object), or give `owner` mode the owner's id as a setting and check it
in the Worker as the list is checked. Before any mode opens: a rate limit on `/api/session` and
on `/api/*` per client address, in code (a Workers rate-limiting binding, if the plan offers it)
or as a Cloudflare rule, recorded as done in the brief.

### 2. The change-of-address case of the argument is slightly wider than stated (non-blocking)

**Where:** `site/worker/hub.ts`, `endSessions` (early return) as used by `signOutOthers` from
`emailMade`; `flows.ts` header, case 1; 1.8.
**What:** a handoff code is tied to the account, not to the session that asked for it. When the
address changes while the account has no other live session, no code is dropped. A code asked
for by a session that has since expired (sessions are dropped with `DELETE FROM sessions WHERE
expires < ?`, which does not drop codes) survives the change and, traded within its 60 seconds,
opens a MoneyLens session after "everyone signs in again". So "a code that still trades after a
change of address is one asked for after the change or by the one device the change left signed
in" is not exactly true. The window is under a minute and needs the asking session to expire in
it; real impact is very low.
**Test:** none (hub code; shown by reading). The every-order test's `codeSurvivesChange` models
only the keep-device case.
**Fix (accounts service, its owner):** in `emailMade` call `forgetHandoffs(id, false)`
unconditionally, or store the asking session's hash with each code and refuse a code whose
session is gone. Then the sentence in `flows.ts` and 1.8 is true as written.

### 3. `PUSH_MAX` leaves out the frame's four length bytes (nit, non-blocking)

**Where:** `worker.ts`, `PUSH_MAX = LIMITS.batchBytes + HEAD_MAX`, used by `route` and
`VaultDO.fetch`.
**What:** the largest frame `unframe` and `pushChunks` accept is `4 + HEAD_MAX + batchBytes`;
the Worker refuses anything over `batchBytes + HEAD_MAX` as 413. No real device comes near it (a
100-write head is about 9 KB; the device pushes 4 MiB at most).
**Test:** `second: finding 3, ...` (todo).
**Fix:** `PUSH_MAX = 4 + HEAD_MAX + LIMITS.batchBytes`, or say in a comment that the bound is
meant to be tighter.

Smaller notes, no change asked: a sign-in that is not let in still leaves a `handoff_apps` row at
the hub, so that account's deletion and address change send MoneyLens notices it does nothing
with. An "ok" from the object whose answer is lost on the way back gives a 500 and leaves a
session nobody holds, which can push out the oldest device (inherent to any two-party commit).
The nonce travels to the main site in a query string (`?handoff=`); the main-site page should not
log it or pass it on.

## What was run

Node v22.23.5, in `tools/moneylens` of the worktree:

- `npx tsc --noEmit`: clean, with `tests/second-shell.test.ts` in place.
- `npx tsc --noEmit -p src/server/tsconfig.json`: clean.
- `node --import tsx --test tests/second-shell.test.ts`: 43 tests, 41 pass, 0 fail, 2 todo.
- `npm test`: 445 tests, 443 pass, 0 fail, 0 skipped, 2 todo (the two below).

Tests marked `todo` (they fail while their finding stands): `second: finding 1, owner gate: an
account id that cannot be the owner's still reaches a Durable Object` and `second: finding 3,
the Worker's push limit is four bytes short of ...`. Finding 2 has no test.

**Not run:** `npm run test:server` (the Worker on Cloudflare's local runtime, including the nested
transaction probe and the notice sent from inside the trade) and `wrangler`, because their ports
are used by other work on this machine. CI ran them on this commit and they passed; I did not see
that run myself. No network was used, nothing was committed or pushed, and only the two files of
this review were written.

## Only a deployment can show

- One live instance per Durable Object name (the registry's and each account's): the stamp needs
  it for the registry, the in-memory count for each account. If the platform ever ran two, the
  argument would need storage-backed fencing.
- `deleteAll()` on a SQLite-backed object removes the SQL tables, and nothing of the object's
  storage survives it; and a request to an object waiting on another object's answer does not
  hold back other calls (that is what lets a notice in, and what the count catches).
- A nested `transactionSync` undoes the inner writes when the outer fails, and rethrows the same
  value (shown locally by `Probe`, not on production).
- The Free-plan Durable Object's processor time for the largest push (1.8 says so).
- What the hub's `MONEY` binding does: until it points at `Internal`, deletions and changes queue
  at the hub and MoneyLens hears nothing. It must be in place before the gate opens.
- The `ACCOUNTS` binding must point at the real `Handoff` entrypoint; any Worker on the same
  Cloudflare account can bind to `Internal`, so who can deploy Workers there can erase vaults.
- Body length enforcement by the runtime (a body longer than its `Content-Length`).

## Obligations on the next slices

**Erasing a vault (VAULT-5, VAULT-7).** Do it inside `act`, with the session check and the delete
in one synchronous stretch, deleting chunk and vault rows only; never `deleteAll` (that drops
sessions, the account row and the events). The seven-day delay goes in storage with an alarm;
the alarm handler re-reads that the erase is still asked for and that the account still holds
the vault named. Log the request and the erase in the events log. A session that has not proven
the vault unlocked cannot ask.

**The weekly sweep (ARCH-10).** Go through `accountGone` (new stamp before the erase), never
erase on an answer that is empty because a question failed (`exists` throws: keep that), ask at
most 100 ids per call, and treat an id the hub calls gone but which signs in during the sweep as
the flows already do. Add a test that the sweep and a sign-in, in every order, keep the registry
invariant.

**The app's pages and the page that finishes a sign-in.** A strict policy of their own (SEC-2)
on the same origin; the code read from the fragment, removed from history before anything else
loads, and POSTed with `fetch`; the 503 "try-again" sent back to `/enter`, not retried with the
same code. No page GET carries data. The rate limit of finding 1 is in place before any gate
opens.

**The wrapped keys the server will keep.** In the account's own object, so `deleteAll` takes
them; handed out only by `act` after the session check in the same synchronous stretch; never
logged; bounded in size; replaced only by a session that proves the vault unlocked; every read
and replacement in the events log, because a copy is what an offline passphrase guess starts
from. Restore runbook: a restored account database ends every session (as decided) and a restored
registry gets a new stamp at once.

No real account, statement, key or token is in this review or its tests; every value is invented.

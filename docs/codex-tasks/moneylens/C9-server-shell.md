# C9: the server's shell (the Worker, the Durable Objects, the gate, sync over HTTP)

**When:** now. The pull request from `claude/moneylens-server-shell` is not merged until this is
in (SEC-9: sign-in, session, sync and authorization code). Nothing is published, and the gate in
the repository is shut.
**Files:** a new review, `docs/moneylens/reviews/server-shell.md`, and for tests of your own a new
file, `tools/moneylens/tests/second-shell.test.ts`. Nothing else.
**Branch:** `codex/moneylens-c9-server-shell`, made from the head of
`claude/moneylens-server-shell`. Open the pull request **into `claude/moneylens-server-shell`**,
and not as a draft.
**Command:** in `tools/moneylens`: `npx tsc --noEmit`, `npm test`, and
`node --import tsx --test tests/second-shell.test.ts`. This change adds two development packages
(`wrangler`, `@cloudflare/workers-types`), which a sandbox with no network cannot install. Without
them two things cannot run: the second half of `npm run typecheck`
(`tsc -p src/server/tsconfig.json`) and `npm run test:server` (the Worker on Cloudflare's local
runtime). Leave them out and say so; CI ran both. CI runs Node 22: if you have it, use it; if
not, say which you used, and don't lean on anything newer. Don't ask Steve to run anything.

## What it is

The third piece of the server, around the two you reviewed (C7 chunks, C8 sessions): what a
request has to get through before those functions are called. It is assessment 0.13, section
1.8, read first. `git diff 42e67098 HEAD -- tools/moneylens docs/moneylens .github` shows all
of it.

- `src/server/worker.ts`: the Worker (`route`, `enter`, `trade`), `VaultDO`, `Registry`,
  `Internal`. The only file that imports Cloudflare. It is meant to decide nothing.
- `src/server/account.ts`: one person's object as plain functions on a `Db`: `signIn`,
  `sessionFor`, `act` (every request with a session), the events log.
- `src/server/gate.ts`: the settings read (`ORIGIN`, `GATE`, `ALLOWED_ACCOUNTS`, the quotas).
- `src/server/wire.ts`: a push and the answers to sync as frames, both directions.
- `src/server/registry.ts`: the ids of accounts that have signed in.
- `src/web/remote.ts`: the device's `Remote` over `fetch`.
- `src/vault/protocol.ts` and `sizes.ts`: **a move, not a change.** What both ends say to each
  other left `vault/sync.ts` (and one constant left `crypto.ts`) so that the Worker does not
  import the device's code. Please confirm it is only a move.
- `src/server/chunks.ts`: two guards you asked for in C7 (a stored count that is not a count is
  an error; version numbers past what can be counted are not written) and `lastDay`.
  `src/server/request.ts`: `labelOf`.

Tests: `tests/shell.test.ts`, `tests/wire.test.ts` (Node), `tests/platform/server.test.ts` with
`tests/accounts/` (the local runtime).

## What to look for

1. **Your five obligations from the review of #789** (`reviews/sessions.md`). 1.8 says how each
   is met. Is each met in the code? In particular: is there any path in `worker.ts` or
   `VaultDO.fetch` where something waits between the check of a session and the act it allows;
   is the expected origin ever taken from the request; can a caller choose a token, a hash, a
   session id, or the account a session is opened for.
2. **Two people (T-1, T-2).** Can a request with A's cookie, or with any body, read, change or
   end anything of B's: through `x-ml-account`, a session id in a body, a vault or chunk id, the
   registry, `Internal`.
3. **The gate (T-23).** Each of the three settings, and a setting changed while sessions are
   open. Is there a route that answers with the gate shut, or for an account not let in. Does a
   sign-in that is not let in leave anything behind.
4. **Trading the code (T-3).** The nonce and its cookie; one answer for every kind of bad code;
   what is cleared when; what happens when the registry or the object fails half-way.
5. **Frames.** `unframe`, `cut`, `unpackPush`: anything that is not a frame taken for one, a
   blob that is a view of more than its bytes, a size that is not a count.
6. **What it costs a stranger to make the server work.** 1.8 says what is not limited in code
   and why. Do you agree, and is anything costlier than it says.
7. **What 1.8 says is not known** (a Free-plan object's processor time) and what it says is to
   be measured at the first deploy. Anything else that only the platform can show.

## What to hand back

`reviews/server-shell.md`, in the form of your earlier reviews: a verdict for the code as it is
at the head you reviewed (APPROVE, or CHANGES with numbered findings, each with where and what
would fix it), what you ran and what you could not, and the obligations you would put on the
next slices (erasing a vault, the sweep, the pages).

## Second look (2026-11-26): your two findings, at a new head

Your tests (`tests/second-shell.test.ts`, as it stood in your clone) carry two findings, and both
reproduce at `189ad559`. They are answered at the new head of `claude/moneylens-server-shell`;
`git diff 189ad559 HEAD -- tools/moneylens docs/moneylens` shows all of it. If your review holds
more than these two, the rest stands: say so, and judge the new head against all of them.

**Finding 1** (a notice from the accounts service passes a sign-in whose code is already
traded). The steps that cross objects are now in one file, `src/server/flows.ts`, whose header
is the argument: a notice sets a new stamp in the registry before it does its work; a sign-in
reads the stamp before it trades its code; and the account's own object reads it again, and
looks at its own in-memory count of notices, right before it opens the session, and opens none
if either moved. A sign-in turned away has written nothing, so nothing is undone. Assessment
0.14, section 1.8, "A sign-in and a notice at the same time". Where: `flows.ts` (new),
`registry.ts` (the stamp), `worker.ts` (`doorsOf`, `VaultDO.signIn` now waits for the registry
once, `noticed`, `Registry.stampNow`/`newStamp`, `Internal` goes through `flows.ts`).

**Finding 2** (a sign-in that fails after its session is written). `signIn` in `account.ts` is
one transaction now, with `openSession`'s own inside it; `tests/platform/server.test.ts` shows
that a transaction inside a transaction does on the platform what that takes it to do.

Tests of mine: `tests/flows.test.ts` (a sign-in and a notice in every order their steps can come
in, with each step of the sign-in failing in turn), `tests/objects.test.ts` (the real `VaultDO`
class on Node, with a registry whose answer is held back), `tests/shell.test.ts` (each write of
a sign-in failing in turn), and on the platform a notice sent from inside the trade.

**What your stand-ins need** (your tests are yours to change; with these three methods added
all nine pass here, findings unskipped, and `npx tsc --noEmit` is clean):

- the registry: `stampNow()` and `newStamp()`, passed on to the real `Registry` like the other
  three;
- the accounts service: `exists(ids)`, which the Worker asks only after a sign-in was turned
  away, to take a deleted account off the registry (the real service has deleted the account
  before it tells the apps);
- `VAULTS.get(id).signIn(made)` is unchanged in shape: `made` now carries `stamp`, and the answer
  is a promise.

**Look hardest at:**

1. The argument in `flows.ts`, case by case. It rests on the registry being one object, on the
   order inside `signInHere` (count, question, count, write, with nothing waiting after the
   question is answered), and on what the accounts service does before it tells MoneyLens
   (`site/worker/hub.ts`, `endSessions`, the deletion, and `handoffCodes.ts`). Is each of the
   three true, and is there a fourth case.
2. Whether the every-order test models the platform faithfully: what a step is, and whether an
   order that can happen is missing.
3. The count being in memory. What a restart, or two instances of one object, would do.
4. The cost: a notice about one account turns away other accounts' sign-ins under way; a
   made-up code now costs a read of the registry as well.
5. After a turned-away sign-in, the Worker empties and forgets an account the accounts service
   says is gone (`tradeCode`). Is that safe to do there.
6. Anything the change broke in what you had already passed.

**What to hand back:** the same two files, in one pull request into
`claude/moneylens-server-shell`: `reviews/server-shell.md` with a verdict for the code at the
new head (the two findings marked resolved or not, anything new numbered on), and your tests.

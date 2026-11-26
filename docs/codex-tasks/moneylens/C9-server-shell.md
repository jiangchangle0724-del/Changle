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

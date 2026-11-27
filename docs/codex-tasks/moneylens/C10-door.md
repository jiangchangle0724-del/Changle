# C10: the door (the ways in, the app's first pages, the main site's page, and what the review of the shell found)

**When:** now. The pull request from `claude/moneylens-door` is merged only when this is in
(SEC-9: sign-in, session, crypto, sync and authorization code). Nothing is published, and the
gate in the repository is shut.
**Files:** a new review, `docs/moneylens/reviews/door.md`; tests of your own in a new file,
`tools/moneylens/tests/second-door.test.ts`; and your earlier file,
`tools/moneylens/tests/second-shell.test.ts`, which is yours to bring along (it was written for
the shell as it was merged, and this branch changes four things under it: see below). Nothing
else.
**Commands:** in `tools/moneylens`: `npx tsc --noEmit`, `npx tsc --noEmit -p
src/server/tsconfig.json`, `npm test`, and your two files alone (`node --import tsx --test
tests/second-door.test.ts`). In `site`: `npx tsc --noEmit`, `npx tsx tests/finance.test.ts`,
`npx tsx tests/routes.test.ts`. Not `npm run test:server` and not `npm run test:app`: both start
`wrangler dev`, whose ports are in use on this machine; CI runs them, and the author ran them
at this head (17 platform tests and the browser check pass). Say that you did not.

## What it is

Four things on top of the shell you reviewed (C9), in one branch. `git diff 86f06a0a HEAD --
tools/moneylens site docs/moneylens .github` shows all of it (`86f06a0a` is main with the shell
merged).

1. **The ways in** (assessment 1.9). The server keeps the wrapped keys and hands one only to a
   session that proves it knows that wrapper's secret; wrong proofs are counted for the account.
   `src/vault/proof.ts` (the device's side of a proof), `src/server/ways.ts` (the server's rules),
   `src/server/account.ts` (`vault`, `vault/start`, `vault/way`, `vault/unlock`, `vault/lock`,
   and "locked" for sync), `src/server/worker.ts` (`proofsIn` before `act`), `src/web/remote.ts`
   (423). Tests: `tests/proof.test.ts`, `tests/ways.test.ts`, `tests/shell.test.ts`, and on the
   local runtime a second and a third device opening a real vault.
2. **The app's first pages** (assessment 1.10). The Worker hands out the app (`worker.ts`,
   `page`; `assets` and `build` in `wrangler.jsonc`; `scripts/build-app.mjs`). The screens are
   `web/app/` (Preact); what each step does is `src/app/door.ts`, and the fifteen minutes are
   `src/app/idle.ts`. Tests: `tests/door.test.ts`, `tests/idle.test.ts`, `tests/pages.test.ts`
   (the Worker's `page` with a stand-in file store), `tests/design.test.ts`, the pages on the
   local runtime, and `scripts/check-app.ts` (a real browser, the whole way in).
3. **The main site's page** for signing in: `site/src/tools/Finance.tsx` and `financeDoor.ts`
   (changle.ca/tools/finance), with its lines in `site/src/router.ts` and `site/src/App.tsx`.
   Tests: `site/tests/finance.test.ts`, `site/tests/routes.test.ts`.
4. **What your review of the shell found.** Finding 1: open either way the gate now has a list
   (`gate.ts`: `owner` means on the list and the accounts service's word), the Worker stops an
   id that is not on it before any object, and what would ask something of an object, the
   registry or the accounts service is counted first by the address it came from, with
   Cloudflare's rate limiting binding (`worker.ts`, `within`; `ratelimits` in `wrangler.jsonc`;
   assessment 1.8, "What a stranger can make the server do"). Tests: `tests/limits.test.ts`, and
   on the local runtime the limits at their real numbers. Finding 2 is the accounts service's
   and is asked of its owner in the brief; the sentence in `flows.ts` and 1.8 now says what that
   code does. Finding 3: `PUSH_MAX` counts the frame's four bytes.

## What changed under your earlier tests

- The Worker's settings need two limiters, `TRADES` and `ASKS`: anything with `limit({ key })`
  that answers `{ success }`. With the gate open and either missing, every `/api` request is
  answered 503 `not-set-up`.
- The owner's gate needs the owner's id in `ALLOWED_ACCOUNTS`.
- `vault/start` takes `{ vault, ways: [{ wrapper, params, proof }, …] }` (one passphrase way and
  one recovery way), and sync answers 423 `locked` until the session has shown a proof or made
  the vault. `tests/shell.test.ts` has helpers that show the shapes (`waysFor`, `unlocking`).
- The largest push is four bytes longer.

Your two tests marked `todo` are findings 1 and 3. Judge whether each is resolved; if it is,
it becomes a plain test.

## What to look for

1. **The ways in.** Can a session be given a wrapper without having shown its proof. Can a
   session unlock itself, or swap the ways in for its own, by starting a vault again. The count:
   can it be dodged (requests side by side, many sessions, a restart), does a right proof ever
   spend a try, can the count lock an owner out for longer than 1.9 says. What "unlocked"
   survives and what ends it (a session ending, everyone signed out, the account erased,
   `vault/lock`). Is there a route to sealed chunks that does not ask for "unlocked". The proof
   itself: is it separate from the wrapping key (what an attacker learns from the server's copy
   of a proof's hash), are the parameters the server sends checked on the device before a proof
   is made, is the comparison one that does not leak. What reaches the events log.
2. **The obligations you put on this slice** in `reviews/server-shell.md` ("The app's pages and
   the page that finishes a sign-in", "The wrapped keys the server will keep"). 1.9 and 1.10 say
   how each is met. Is each met in the code?
3. **The Worker's `page`.** Which paths reach the file store, and what of the request goes with
   them. What goes out, with which headers. The page's policy (SEC-2): is anything allowed that
   need not be, and does the app keep to it. The gate. Anything in `dist/app` that should not be
   handed out.
4. **The limits.** Is anything that costs something reached before it is counted. Is anything
   counted that lets a stranger spend another person's allowance. A limiter that fails lets the
   request through: do you agree. What the limits do not do is said in 1.8: is that the whole of
   it.
5. **`door.ts`.** What is believed of the server's answers without a check. Whether a wrapper
   can outlive its one use. The handoff code in the address.
6. **The screens** (`web/app/ui/App.tsx`). The order a vault is made in (the recovery code
   before anything is kept). Locking: the button, the fifteen minutes, leaving the page, and
   what each leaves behind in memory and on the server. Signing out. What the browser's storage
   holds. What is said when a vault does not open (1.3). Any markup made from data.
7. **The main site's page.** That a code can be taken to one address only. The nonce. The
   argument for going on without a press, and what it costs (1.10 says: someone else's link can
   spend the account's allowance of codes). Whether the code or the nonce is kept or logged
   anywhere.
8. **The tests.** Whether each can fail. The author's record: each of 85 checks in this
   branch's new code taken out in turn fails a test, and the earlier suites were run again
   after the changes. `scripts/check-app.ts`: what it shows and what it does not; the stand-in
   puts back the page's own `Origin`, which the local runtime rewrites (`tests/accounts/worker.ts`).
9. **What only a deployment can show**, beyond your list for the shell: the rate limiting
   binding on the Free plan, files handed out with `run_worker_first`, a request sent as a page
   goes away, phones.

## One more question

After this is merged the plan is: connect the Worker in Cloudflare and deploy it with the gate
shut; look at the "not open" page; then open the gate to the owner alone (`GATE` `owner`, his
one id in `ALLOWED_ACCOUNTS`) so that he can make his own vault. At that moment the accounts
service's `MONEY` binding will not yet be in place (it is that service's owner's to add, after
the first deploy), so a deletion or a change of address of the owner's account would wait in
the accounts service's queue of notices until it is. No one else is let in before the Phase 3
conditions. Is there anything in this branch, or missing from it, that should stop the gate
from being opened to the owner alone? Say what, and what would settle it.

## What to hand back

`reviews/door.md`, in the form of your review of the shell: a verdict for the code at the head
you reviewed (APPROVE, or CHANGES with numbered findings, each with where, what goes wrong and
for whom, the test that shows it, and what would fix it), your earlier findings marked resolved
or not, what you ran and what you could not, what only a deployment can show, and the
obligations you would put on the next slices (erasing a vault, the weekly sweep, the list of
devices, changing a passphrase and a new recovery code, the import page).

## Second look (2026-11-27): your six findings, at a new head

The head is `c601285d` (`git diff 342bbbb3..c601285d`: `611f4b60` is the brief only, `7c2eb601`
is your three files as you wrote them, `c601285d` is the fixes). One more commit, `74ecd485`,
adds two cases to `tests/request.test.ts` and changes no code.

What was done for each finding:

1. **IPv6 keys.** `addressKey` in `src/server/request.ts`: an IPv4 address is itself, an IPv6
   address is its first 64 bits, an IPv4 address written as an IPv6 one is that IPv4 address,
   and text that is no address is the one key "nowhere". `within` in `worker.ts` uses it.
   Assessment 1.8, "What an address is".
2. **The events log.** Not all of it, as you classed it for the events and devices slice. Done:
   wrong proofs are counted apart (500 of them, 500 of everything else), and the log is tidied
   at each proof shown as well as at each sign-in. Not done: the events call still answers the
   newest 50 lines of both together, so your test for it stays `todo`. 1.8, 1.9 and section 3
   say what the owner is and is not shown.
3. **Signing out when no longer let in.** `leave` takes 403 `not-admitted` or `closed` as over.
4. **The two sentences.** 1.10 "Making a vault: the order" and 1.8 "The events log".
5. **"Slow down".** `standing` and `keep` answer "busy" for 429, and the screens say so.
6. **A link to `/enter`.** Fixed in the Worker and not with a press on the main site's page:
   `enter` begins a sign-in only when `Sec-Fetch-Site` is `same-origin` or absent, and
   otherwise sends the browser to `/`. 1.10, "Where a sign-in starts", with its limit (a
   browser that sends no such header).

Smaller notes: the recovery code's screen has the idle rule now; `wrangler.jsonc` switches off
Cloudflare's line for each request. Not changed: 400 before 401 for malformed proofs; `unlocked`
rows that wait for the next tidy.

What is asked: check each fix against its finding; make your `todo` tests plain where you are
satisfied; look for what the fixes broke or opened (`addressKey`, the `/enter` rule, the SQL of
`tidyEvents`, the idle drop with the `done` guard, `leave`); run the typechecks and `npm test`
(not the platform tests or the browser: their ports are in use); and give a verdict for this
head on (a) merging with the gate shut and (b) opening the gate to the owner alone once the two
deployment checks are done. You may write only your three files.


# C8: sessions, and what a request has to show

**When:** now. The pull request from `claude/moneylens-sessions` is not merged until this is in
(SEC-9: session and authorization code). Nothing is live, and nothing serves this code yet.
**Files:** a new review, `docs/moneylens/reviews/sessions.md`, and for tests of your own a new
file, `tools/moneylens/tests/second-sessions.test.ts`. Nothing else.
**Branch:** `codex/moneylens-c8-sessions`, made from the head of `claude/moneylens-sessions`. Open
the pull request **into `claude/moneylens-sessions`**, and not as a draft.
**Command:** in `tools/moneylens`: `npm run typecheck`, `npm test`, and
`node --import tsx --test tests/second-sessions.test.ts`. (`npm ci` is not needed: no dependency
changed.) CI runs Node 22, and that is the version the package asks for: if you have it, use it;
if not, say which you used, and don't lean on anything newer. `npm run test:page` cannot reach
its own local page in your sandbox: leave it out and say so. Don't ask Steve to run anything.

## What it is

Two files of plain functions, the second piece of the server after the chunks you reviewed (C7):

- `tools/moneylens/src/server/sessions.ts`: who is signed in, kept in the person's own SQLite
  database. `openSession`, `checkSession`, `listSessions`, `endSession`, `endAllSessions`, with
  `newToken` and `hashOf`. Synchronous on a `Db`, like `chunks.ts`.
- `tools/moneylens/src/server/request.ts`: the two cookies as text (`sessionCookie`,
  `nonceCookie`, `noCookie`, `readSession`, `readNonce`) and `fromOurOrigin`.

What they are meant to do is assessment 0.12, section 1.7, and the requirements ARCH-3, ARCH-4,
ARCH-8, ISO-2, SEC-4, LIM-1, with tests T-3 and T-22 (`docs/moneylens.md`).
`git diff 79061af8 HEAD -- tools/moneylens docs/moneylens/security-assessment.md` shows all of
it. Tests: `tests/sessions.test.ts`, `tests/request.test.ts`.

There is no Worker and no Durable Object class. So this review is of the rules and of these
functions, and of what they leave for the code that will call them.

## What to do

1. **Can anyone get in who should not, or stay in longer than they should?** A token that was
   never given out; a session that has ended, by either limit, by being ended from the server,
   or by the sign-in that made room; another account's token; a session's id; a hash taken from
   a copy of the database. The two limits to the millisecond, at the write of "last seen" once a
   minute, and when the clock goes back or forward. Is ending a session for good, in every
   order of calls you can think of?
2. **The clock rule.** A session last seen more than a minute after what the clock now reads has
   ended. Is that the right way round, and is a minute the right room? What does a clock that
   jumps forward do, and is that acceptable?
3. **Cookies.** Is anything read as a session that should not be: another name, another case,
   two cookies, a value that is nearly one? Can `sessionCookie`, `nonceCookie` or `noCookie` be
   made to write something that sets another cookie or another attribute? Are the attributes
   right for `__Host-`, and is `SameSite=Strict` right for the trip to the main site and back
   (the two are the same site)?
4. **The origin rule.** "Every request that reads or changes data is a POST, refused unless
   `Origin` is exactly ours; where `Sec-Fetch-Site` is sent it must be same-origin; no `Origin`
   is refused." Is there a request a page on changle.ca, another subdomain, or anywhere else
   can make that this lets through? Is there a browser a real person uses that this locks out?
5. **What the callers must not get wrong.** The functions trust their caller for three things:
   that the hash was made by `hashOf` from the cookie's token, that `now` is the server's clock,
   and that the database is the one of the account in the cookie. Say what else the Worker and
   the Durable Object will owe, so that it is written down before they exist.
6. **What it stores and what it costs.** Anything kept beyond what 1.7 lists? Is eight sessions,
   with the one seen longest ago making room, a fair rule, and can it be used to sign a person
   out who should stay in?
7. **Write it down.** In `docs/moneylens/reviews/sessions.md`: the first line is
   `VERDICT: APPROVE` or `VERDICT: CHANGES NEEDED`, for this branch as it is now. Then what you
   read and ran, and each finding in the form you used before (how serious, where, how to
   reproduce, what it costs, and a test for it in your file, skipped with
   `{ skip: "finding N: …" }`). If what is left is small enough to approve with a note, approve
   and write the note.

Not part of this, because none of it is written: the Worker, the Durable Object class, trading
the handoff code, the allowlist, the content security policy, the security event log.

## Done when

The commands pass, the PR (into `claude/moneylens-sessions`, not a draft) shows their output as
text, and the review file exists with its first line. Don't merge.

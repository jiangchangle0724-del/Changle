VERDICT: APPROVE (two findings, neither blocks the merge; finding 1 must be fixed, or its words changed, before anyone but the owner is let in)

# C11: the devices and what has happened (the screen on which an account's owner sees who is in it)

Reviewed commit `8c4988d1` (branch `claude/moneylens-devices`, detached worktree), against
`cbc1e150` (main, with the door merged and the gate open to the owner's account alone), on
27 November 2026.

Reviewer: Claude Opus 5.5 (model id `claude-opus-5-5`), run as a separate agent for this review
only. It took no part in writing the code, the author's tests or the documents. The author is
another Claude session of the same family of models. The two may share blind spots, so every claim
below rests on a test or a line of code, not on the card or the assessment.

## Verdict

**APPROVE** for merging the code at this head.
- The server's two answers read only the account's own database and are bounded (at most 8
  sessions, at most 80 lines).
- Wrong proofs stay shown, whatever comes after them.
- Ending a device drops its unlocking in the same request.
- The page takes the answers whole or not at all.
- Nothing on the screen is markup made from data: labels, kinds and times are written as text.

Two places where the screen can tell the owner something that is not so are below. Neither hides
an intruder. Finding 1 can make an open vault look locked, and it should be settled before a
second person is let in.

## The door's finding 2: resolved

The `events` answer is the newest 50 lines together with the newest 30 wrong proofs, whatever came
after them, ordered by `n` with no line twice (`UNION` on `n`). `wrong` counts the wrong proofs in
the last 24 hours. The screen puts both at the top (`wrongOf`).

My door test (`finding 2 (resolved at C11, 8c4988d1): ...` in `second-door.test.ts`) is now a
plain test and passes. A new test goes from the server through the page's reading: three wrong
tries, then five hours of sign-ins and sign-outs, and the owner's list still shows all three, the
count 3, and the device that made them (`wrong tries stay on the screen after an afternoon of
noise ...`).

## The obligations of reviews/door.md

- **Wrong proofs shown, whatever later events there are: met**, on the server and on the screen
  (above).
- **Which sessions are unlocked: met in the server, but the screen claims more than it knows.**
  The server sends `unlocked` with each session (`unlockedSessions`, filtered by the live
  sessions), and the screen shows "Vault open" or "Vault locked". A session is a browser, though,
  not a tab (finding 1).
- **The owner can end any of them: met.** "Sign it out" appears on every device but this one, and
  there is also "Sign out all other devices".
- **Ending a session drops its `unlocked` row in the same stretch: met.** `sessions/end` calls
  `lock`, and the others path calls `tidyUnlocked`, inside the same `act`. Tested: the row is gone,
  and that session's next request gets 401.

## The card's eight points

1. **The obligations:** above.
2. **The server's two answers.**
   - The query does what 1.8 says: both limits, newest first, no line twice.
   - Both answers read only this account's database, behind the session check (tested: another
     account's devices and lines are not shown).
   - A line's session id is known only to sessions of the same account, which already have every
     live id from the sessions list. Ended ids open nothing.
   - The 24-hour count:
     - It runs by the server's clock, so lines whose time is ahead of a clock that went back still
       count, which is the safe side.
     - The tidying keeps 500 wrong proofs, more than one day can make (30). So the count is never
       cut short by the tidying.
     - Proofs turned away past the limit are written nowhere, so they are not in the count. That
       is true to the word "tries" (1.9).
   - Nothing in either answer is without a bound.
3. **`devices.ts`.**
   - A hostile or broken answer comes out as trouble, never as a shorter list. This is checked by
     the author's tests and by my reading:
     - exactly one `here`;
     - no id twice;
     - lengths bounded;
     - each field checked, and an unknown kind shown as "other", not dropped.
   - `endDevice` is never offered for this device.
   - `outcomeOf` says "it was not done" only of a device the list still shows. But one race leaves
     it saying "none" above a list that shows another device (finding 2).
4. **What a person concludes.**
   - The order of the three parts is right: the wrong tries first, then the devices, then
     everything else.
   - When the count is 0 and older tries are listed, the screen says "None in the last 24 hours.
     The ones below are older", which is true.
   - The advice:
     - "Without the passphrase or the recovery code they cannot read what you have stored" is
       within VAULT-6 and 1.9: a session holds no wrapper without a proof. The limit about the
       code the server serves (section 2) is the general one, not this screen's.
     - Its order is better turned round: sign out at changle.ca first, then here. Otherwise a
       browser still signed in at the main site comes back with one press in between (1.10 states
       that it can).
   - The device name comes from the User-Agent, which the other side writes. So a mailbox taker
     can be listed as "Safari on iPhone", like the owner's phone. That is inherent. "This device"
     is the only mark the server vouches for.
   - The same screen in an intruder's hands: they see the owner's devices and times and can sign
     them out. 1.10 admits this. Whatever they do is written as a line under their own session, so
     the owner is told nothing that is not so.
5. **The step of the browser's history.**
   - The list is shown only while the step is the devices step and a signed-in screen is behind
     it.
   - A fresh load on the step waits for the page to finish starting. Signed out meanwhile, or
     "forward" onto the recovery code's screen, turns the step into an ordinary one before the
     screen is drawn, so the list is never shown to nobody's session.
   - "Back" leaves the list, and it leaves the page only from a step that is not the list's.
   - The vault stays as it was behind the list, with its fifteen minutes running, and `pagehide`
     still locks it.
   - Small note: after the list itself finds the session ended, the step it leaves behind is an
     ordinary one with nothing to show, so "back" has to be pressed twice to leave. The comment
     says "never needs pressing twice". This needs a browser to show, and is not a finding.
6. **`askSettled`.**
   - It waits only for the last `lock` request. That request ends within `ASK_MS` (20 seconds)
     with an answer or null, and never rejects. So the list waits 20 seconds at most.
   - Nothing else waits behind it: only the devices screen uses it.
7. **The tests.**
   - The author's tests in `devices.test.ts` can fail where I looked: the hostile answers each
     need trouble, and the outcomes are checked for each kind of result.
   - I did not repeat the exercise of taking out each of the 116 checks.
   - `until` in `check-app.ts` is a fix for checks that asked once and took any answer. I read it
     but did not run it.
8. **What only a deployment or a phone can show:** below.

## Findings

### 1. "Vault locked" is said of a browser that still holds the vault open in another tab (does not block the merge; settle before anyone but the owner is let in)

**Where:**
- `ways.ts` and `account.ts`: `unlocked` is kept per session, and `vault/lock` ends it for the
  session.
- `web/app/ui/App.tsx`: every tab's `lockUp`, its idle watch and its `pagehide` send `vault/lock`.
- `Devices.tsx`: `deviceLocked`.

**What goes wrong:**
- A session is a browser. Two tabs of one browser both open the vault, then one of them is closed
  or locks itself after fifteen minutes. The server now counts the session as locked.
- The other tab still holds the key. It syncs once on opening, so nothing tells it otherwise.
- The owner's list says "Vault locked" of that browser, "This device" included. That is the
  card's "vault locked of a device that holds it open".
- The same holds for anyone who has opened the vault and then sends `vault/lock`. The server can
  only know what it was told. A device that has opened the vault once had the key, whatever it
  says since.
- 1.10's limit ("a second tab of the same browser is the same line of the list") admits that the
  tabs share a line. It does not admit that the line can then say "locked".

**Test:** `finding 1: a second tab that locks does not make the list say 'vault locked' of a
browser that still holds the vault open` (todo).

**Fix, either of:**
- Keep unlocking per page: a random page id sent with `vault/unlock` and `vault/lock`, with the
  session unlocked while any of its pages is.
- Or change the words to what the server knows: "opened the vault at …" and "said it locked at
  …", with a sentence that a device which ever opened the vault had the key, and that a device
  you do not know which opened it means the passphrase is known (change it, when that is built).

### 2. "No other device is signed in" over a list that shows one (minor, does not block)

**Where:** `devices.ts`, `outcomeOf`: `{ ended: 0 }` gives `none` without looking at the list read
afterwards.

**What goes wrong:** the owner presses "Sign out all other devices" when there are none. A device
signs in before the list is read again. The note says there is no other device, above a list that
shows one. The window is short, but this is the screen where a newcomer matters.

**Test:** `finding 2: 'No other device is signed in' is not said above a list that shows another
device` (todo).

**Fix:** say "none" only when the list read afterwards has no other device. Otherwise say nothing,
and let the list speak.

**Smaller notes, no change asked:**
- Put "sign out at changle.ca" before "sign out here" in `wrongAdvice`.
- The "back twice" note under point 5.
- `unlocked` rows of ended sessions are still left until the next tidy. They are not shown,
  because `listSessions` filters them out.

## What was run

In `tools/moneylens` of `/home/claude/review-c11`, with my files in place:
- `npx tsc --noEmit`: clean.
- `npx tsc --noEmit -p src/server/tsconfig.json`: clean.
- `node --import tsx --test tests/second-devices.test.ts`: 5 tests, 3 pass, 0 fail, 2 todo.
- `node --import tsx --test tests/second-door.test.ts`: 15 tests, all plain.
- `npm test`: 534 tests, 532 pass, 0 fail, 0 skipped, 2 todo (the two above).

**Not run:** `npm run test:server`, `npm run test:app`, `npm run test:page`, wrangler and any
browser, as the card asks: the author's own runs are using them on this machine. The card says the
author ran all three at this head (19 platform tests, the browser check and the page checks pass).
I did not see those runs. No network was used, nothing was committed, and only my three files
were written.

## Only a deployment or a phone can show

- The step of the browser's history on iPhone Safari and Android Chrome: the system's back
  gesture, a page brought back from the browser's own keeping (bfcache) while on the step, and a
  restored tab.
- Whether a `keepalive` lock sent on `pagehide` arrives on phones. Where it does not, the list says
  "Vault open" of a browser that dropped the key. That is the safe side, and 1.10 states it.
- The times as the phone writes them (`Intl` in both languages, and the phone's own time zone).
- How long the list takes behind a lock on its way, on a slow network (20 seconds at most).

## Obligations on the next slices

**Erasing and resetting a vault.**
- An unlocked session may erase at once, any other after seven days.
- The check and the delete are in one `act`.
- The reset writes a line that the events answer always shows, as wrong proofs are now.
- The devices screen shows a pending erase and who asked for it.

**The weekly sweep:** as in the earlier reviews. An erase by the sweep also takes the `ways`,
`tries` and `unlocked` tables and the events.

**Changing the passphrase and a new recovery code.**
- Only from an unlocked session that shows the proof of the way it replaces, in the same request.
- The replacement is written as its own line, which the events answer keeps shown like a wrong
  proof.
- Every other session's unlocking ends with it.
- The devices screen then says which devices had opened the vault before the change.

**The import page.**
- It stays under the page's policy (`worker-src 'self'` added deliberately, if pdf.js needs it).
- It writes text only.
- It keeps nothing parsed in `localStorage`.
- The idle lock covers it, and so does a lock from another tab (finding 1).

No real account, statement, key or token is in this review or its tests. Every value is invented.

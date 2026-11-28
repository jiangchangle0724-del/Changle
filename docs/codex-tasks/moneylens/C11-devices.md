# C11: the devices and what has happened (the screen on which an account's owner sees who is in it)

**When:** now. The pull request from `claude/moneylens-devices` is merged only when this is in
(SEC-9: what the server answers about sessions is session and authorization code, and the
screen is where a person finds out that someone else is in the account).
**Files:** a new review, `docs/moneylens/reviews/devices.md`; tests of your own in a new file,
`tools/moneylens/tests/second-devices.test.ts`; and your earlier file,
`tools/moneylens/tests/second-door.test.ts`, whose one test marked `todo` (finding 2 of the
door) is yours to settle. Nothing else.
**Commands:** in `tools/moneylens`: `npx tsc --noEmit`, `npx tsc --noEmit -p
src/server/tsconfig.json`, `npm test`, and your files alone (`node --import tsx --test
tests/second-devices.test.ts`). Not `npm run test:server`, `npm run test:app` or `npm run
test:page`: they start `wrangler dev` and a browser, and the author's own runs use both on this
machine at the same time. CI runs them, and the author ran them at this head (19 platform
tests, the browser check and the page checks pass). Say that you did not.

## What it is

One screen and what the server says for it. `git diff cbc1e150 HEAD -- tools/moneylens
docs/moneylens` shows all of it (`cbc1e150` is main, with the door merged and deployed, the
gate open to the owner's account alone).

1. **The server** (assessment 1.8, "The events log"). The list of sessions says which of them
   are unlocked. The events answer is the newest 50 lines and, with them, the newest 30 wrong
   proofs whatever came after, each line with the id of the session it is about; and `wrong`,
   how many wrong proofs there were in the last 24 hours. `src/server/account.ts` (`sessions`,
   `events`), `src/server/ways.ts` (`unlockedSessions`). Tests: `tests/shell.test.ts`,
   `tests/ways.test.ts`.
2. **How the page reads it.** `src/app/devices.ts`: `listing` (both answers, whole or not at
   all), `partsOf` (a device's name from the server's fixed words), `wrongOf` and `restOf`,
   `deviceOf` (whose line it is), `endDevice`, `endOthers`, and `outcomeOf` (what to say after
   a press, from the answer and the list read afterwards). Tests: `tests/devices.test.ts`,
   against the server's own code and against answers that are not what they should be; and on
   the local runtime in `tests/platform/server.test.ts` ("a second device opens the vault").
3. **The screen.** `web/app/ui/Devices.tsx`, and its place in `web/app/ui/App.tsx`: `listing`
   and the browser's history (`showDevices`, `hideDevices`, the `popstate` listener, the layout
   effect), `askSettled`, and the way to it from three screens. Words in `web/app/i18n.ts`,
   styles in `web/app/styles.css`, a "done" tone for `Note` in `common.tsx`. In a real browser:
   `scripts/check-app.ts`.
4. **The browser checks' waiting.** `until` in `scripts/check-app.ts`, and the loop in
   `scripts/check-cache.ts`. The browser's own `waitForFunction` asks again from inside the
   page with `eval`, which the page's policy forbids, and it takes a promise for a yes: two
   checks that "the server is told it locked" asked once and took any answer. They ask from
   outside now, until it is so.

Assessment 1.8, 1.9 ("What this costs the owner") and 1.10 ("The devices, and what has
happened", "What the page takes from those answers", "The list and the browser's history",
the limits) say what is claimed. Version 0.20.

## What to look for

1. **The obligations you put on this slice** in `reviews/door.md`: wrong proofs shown so that
   later events cannot push them out (finding 2); which sessions are unlocked; the owner can end
   any of them; ending a session drops its `unlocked` row in the same stretch. Is each met, on
   the server and on the screen a person actually reads?
2. **The server's two answers.** Does the query do what 1.8 says: both limits, the order, no
   line twice. Can anything of another account, or of a session that is not the account's, be
   read through it. What a line's session id gives to whom. The count for the last day: its
   edge, a clock that goes back, lines that were tidied away. Whether anything here is without
   a bound.
3. **`devices.ts`: whole or not at all.** Can an answer, hostile or broken, make the page show
   a shorter list, a wrong "this device", or throw. `outcomeOf`: can the screen say "signed
   out" of a device that is still in, or "it was not done" of one that is gone. `endDevice`
   given this device's own id.
4. **What a person concludes from the screen.** The three parts and their order. The count when
   it is none and older tries are listed. The advice under it: is each sentence true, and is
   "they cannot read what you have stored" within VAULT-6 and 1.9. "Holds the vault open": a
   session is a browser and not a tab; a lock on its way. A device named from a few fixed
   words. Whether anything on it is markup made from data. And the same screen in the hands of
   whoever else is signed in: what it lets them do, and whether it then tells the owner
   anything that is not so.
5. **The step of the browser's history.** The list is shown exactly while the browser stands on
   that step. Back, forward, a fresh load on the step, signed out meanwhile, the recovery
   code's screen, the idle lock under the list. Can the list be shown to someone who is not
   signed in, can "back" leave the page, can any of these moves leave a vault open, or lock it
   without the server being told.
6. **`askSettled`.** The list waits for a lock that is on its way. Can it wait for ever. What
   else waits behind it.
7. **The tests.** Whether each can fail. The author's record: each of 116 checks in this
   slice's server and reading code taken out in turn fails a Node test (two did not at first,
   the status of the answers to signing out, and cases were added), and each of 24 in the
   screens fails the browser check; the earlier scripts that reach `account.ts`, `ways.ts` and
   `App.tsx` were run again at this head. `until`, and the two checks that asked once before.
8. **What only a deployment or a phone can show.**

## What to hand back

`reviews/devices.md`, in the form of your review of the door: a verdict for the code at the
head you reviewed (APPROVE, or CHANGES with numbered findings, each with where, what goes wrong
and for whom, the test that shows it, and what would fix it); finding 2 of the door marked
resolved or not, and its `todo` test made a plain test if it is; what you ran and what you
could not; what only a deployment can show; and the obligations you would put on the next
slices (erasing and resetting a vault, the weekly sweep, changing a passphrase and a new
recovery code, the import page).

## Second look (2026-11-27): your two findings, at a new head

The head is the commit that adds this section (`git diff 8c4988d1..HEAD`: `62f57830` is your
three files as you wrote them, `191715ef` is the changes, and the last one is this card and one
sentence of the assessment). The same worktree rules and the same commands as before; the
author ran the platform tests, the browser check and the page checks at `191715ef` and they
pass.

What was done:

1. **"Vault locked" on a device's own word (finding 1).** Your second fix, and the one thing it
   needs from the server. The server now notes which sessions have opened the vault since they
   signed in: a table of its own, `opened`, in `ways.ts` (the session and the time of the
   first), written by `tryUnlock` when a proof is right and by `unlockMaker`, kept by `lock`,
   and dropped by `tidyUnlocked` with sessions that are gone. `openedSessions` is the noted ones
   and the unlocked ones, and the `sessions` answer gives `opened` beside `unlocked`
   (`account.ts`). The screen says one of three things of a device (`Devices.tsx`): it holds the
   vault open; it opened the vault and then said it had locked; it has not opened the vault
   since this sign-in. "Locked" is said of no device. Where a device other than this one has
   opened the vault, a sentence says what that means. Assessment 1.9 ("Unlocked, and having
   opened"), 1.10 and its limits.
   - Counting per page (your first fix) is not done. With it, "locked" would still be the
     device's own word for a device that means harm, which is the case this screen is for.
   - The table is newer than the databases made before it: tables are made at an account's
     first sign-in, and the owner's database exists. So whatever touches it makes sure of it
     first (`openedTable`): an unlocking, the list of devices, a tidying. `tests/ways.test.ts`
     drops the table before each of them.
   - A session that unlocked before the table was there, and is still unlocked, counts as
     having opened (the `UNION`). One that opened and locked before then is listed as not
     having opened until it ends: only a session of the owner's own, once.
   - Nothing a session may do goes by `opened`.
   - The page takes `opened` as it takes the rest: an answer in which a device holds the vault
     open without having opened it is not an answer.
2. **"No other device is signed in" over a list that shows one (finding 2).** `outcomeOf`:
   "none" is said only when the list read afterwards shows no other device. When none were
   signed out and the list shows one, or could not be read, nothing is said.
3. **The advice.** Turned round as you said: the main site first, then here. It names the main
   site's page as the site names it ("your profile at changle.ca"), not its button, whose words
   can be changed there.
4. **"Back" twice.** When the step is no longer the list (signed out meanwhile, or "forward"
   onto the recovery code's screen), the page now goes back off it (`history.back()` in the
   layout effect of `App.tsx`, after `listing` is put out) instead of leaving an ordinary step
   behind.
5. **Found by the author's own checks:** one wait in `scripts/check-app.ts` had no limit. With
   one of the checks taken out, a `popstate` never came and the script waited for it for
   ever. It listens for five seconds now.

What changed under your tests: a `Device` says whether it has `opened`, so
`second-devices.test.ts` no longer passes the type check (the two devices in your test of
finding 2). Your test of finding 1 asserts that the browser with two tabs is listed as
unlocked; with the fix chosen it is listed as not unlocked, and as having opened. Both are
yours to restate or settle.

What to look for this time:

- **Finding 1.** Is it resolved by this? Is there still a state in which the screen says of a
  device something that only the device vouches for. Can "has not opened the vault since this
  sign-in" be false: a note lost, tidied too early, a race between an unlocking and a list.
- **`opened`.** The table made on a database that exists. The tidying, and whether anything
  grows without a bound. Whether the note tells anyone something they should not learn.
  Whether anything is allowed or refused by it.
- **Finding 2**, and the other answers `outcomeOf` can now give.
- **`history.back()` in the effect.** Can it go back twice, or off the page. A fresh load on
  the step when nobody is signed in.
- **The words**, in both languages: do they claim only what is known.

Hand back a section "Second look" at the end of `reviews/devices.md`, with its first line
brought up to date, and your test files.

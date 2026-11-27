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

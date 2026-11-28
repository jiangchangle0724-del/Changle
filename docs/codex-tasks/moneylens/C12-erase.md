# C12: erasing a vault (at once with it open, in seven days without it), and the events log by kind

**When:** now. The pull request from `claude/moneylens-erase` is merged only when this is in
(SEC-9: erasing is authorization code, and it changes what the events log keeps and shows).
**Who wrote it, and the limit that puts on this review:** this slice was written by Claude Opus
5.5, the same model as the reviewer (the chat moved to it on 27 November 2026, 17:25). SEC-9 asks
for "a second model or a person"; a separate agent of the same model is neither, and the review
says so in its first lines. Steve has been asked whether to give the review to another model.
**Files:** a new review, `docs/moneylens/reviews/erase.md`; tests of your own in a new file,
`tools/moneylens/tests/second-erase.test.ts`; and your earlier `tests/second-devices.test.ts` and
`tests/second-door.test.ts`, which this slice changes under you (below). Nothing else.
**Commands:** in `tools/moneylens`: `npx tsc --noEmit`, `npx tsc --noEmit -p
src/server/tsconfig.json`, `npm test`, and your files alone. Not `npm run test:server`, `npm run
test:app` or `npm run test:page`: the author's checks use the local runtime and a browser on this
machine. They pass at this head (19 platform tests; the browser check, with starting over,
calling it off and erasing at once; the page checks). Say that you did not run them.

## What it is

`git diff be4b03f8 HEAD -- tools/moneylens docs/moneylens` (`be4b03f8` is main with the devices'
screen merged and deployed).

1. **Erasing, on the server** (assessment 1.11). `src/server/erase.ts` (new): the erasing asked
   for, asking, calling off, erasing, the day's writes carried to a new vault, and what is due.
   `account.ts`: `vault/erase` (a session with the vault open, the vault named), `vault/erase-later`
   (any signed-in session; seven days; asking again changes nothing), `vault/erase-cancel` (a
   session with the vault open), the erasing in the `vault` answer, `dueErase` before every
   request and for the alarm, `carrySpent` in `vault/start`. `chunks.ts` (`forgetChunks`), `ways.ts`
   (`forgetWays`). `worker.ts`: `alarm()`, and the alarm set when an answer carries `wake`.
2. **The events log by kind** (1.8). Each kind keeps its own 500 lines; the events call shows the
   newest 50 and, apart, the newest of the kinds a person must not miss, including the vault
   opened by sessions other than the one asking (your finding 3 of the devices' screen). One query
   per set, merged in code: Cloudflare's SQLite refused the compound query ("too many terms in
   compound SELECT"), which Node's SQLite took. An index on `(kind, n)`, made where needed.
3. **The app** (1.11). `src/app/erase.ts` (new). `src/app/devices.ts`: the list asks `vault` too
   and carries `vault` and `pending`; `openedOf`; the three new kinds. `web/app/ui/Erase.tsx` (new):
   `EraseNow`, `ResetVault`, `ErasingNotice`. `App.tsx`: the laid screens (`LAID`), the notice and
   the two links, the copy emptied on the new-vault screen, `locked` asking again where things
   stand. `Devices.tsx`: the erasing asked for, and the other devices that opened the vault.
   `src/web/idbcache.ts`: `forgetCache`.

## What changed under your tests

- `second-door.test.ts`, "second look: the events log keeps wrong proofs and everything else
  apart, 500 of each": there is no "everything else" any more; each kind keeps 500. It fails at
  this head. Restate it for what should hold now.
- `second-devices.test.ts`: a `Listing` has `vault` and `pending`, so the lists your tests build by
  hand no longer pass `npx tsc --noEmit` (CI runs it: the branch cannot be merged until they do).
  `listing` asks `vault` as well as `sessions` and `events`.
- Your finding 3 test of the devices' screen is still marked `todo` and passes at this head.
  Judge whether the finding is resolved; if it is, make it plain.

## What to look for

1. **Who may erase, and what.** Can a session without the vault open erase it before the seven
   days, by any route (the alarm, a request, a vault started again, an erasing asked for another
   vault). Can a session erase a vault it does not hold. What erasing lets go of, table by table,
   and whether anything of a vault outlives it (in the database, in the device's copy, in the
   events). What it must not touch.
2. **The seven days.** When an erasing is due, who sees it meanwhile, whether asking again can
   put it off or bring it on, calling off and by whom (the choice in 1.11, and whether it is the
   right one), the alarm and the check before every request, a clock that goes back, and what
   happens to an erasing when the vault is erased at once or another is made.
3. **The day's writes** carried over (LIM-1): can erasing and making a vault give more writes in a
   day; can it take writes away that it should not.
4. **The events log.** Per-kind tidying and the sets shown: can a line a person must not miss be
   pushed out of sight, or out of what is kept, by any number of lines of other kinds. What the
   asking session's own lines do. The index and what is read (rows read count toward LIM-1).
5. **The app.** Whole or not at all, as before. The screens: can one press erase; can a person be
   told something that is not so (an erasing that is not asked for, one that is, a date, who
   asked); the laid screens and the browser's history; the device's copy emptied, and when not.
6. **Your earlier obligations** for erasing and resetting (`reviews/devices.md`, `reviews/door.md`,
   `reviews/server-shell.md`): is each met?
7. **The tests.** Whether each can fail. The author's record of checks taken out in turn is in the
   brief and the PR.

## What to hand back

`reviews/erase.md`, in the form of your earlier reviews: a verdict for the code at the head you
reviewed (APPROVE, or CHANGES with numbered findings), the independence limit stated first, your
finding 3 of the devices' screen marked resolved or not, what you ran and could not, what only a
deployment or a phone can show, and the obligations you would put on the next slices (the
weekly sweep, changing the passphrase and a new recovery code, the import page).

## Second look (after CHANGES at `9bffa8cc`)

**When:** now. **Same reviewer, same limit:** the author is still Claude Opus 5.5; say so first again.
**Files:** your `reviews/erase.md` (add a second-look section; keep the first as it is), your
`tests/second-erase.test.ts`, `second-door.test.ts`, `second-devices.test.ts`. Nothing else.
**Commands:** as before. Again, not `test:server`, `test:app` or `test:page`: the author ran them
at the head of this look (19 platform tests; the browser check, 33 screens; the page checks).

`git diff 13bed4e2 HEAD -- tools/moneylens docs/moneylens` is what changed since your review
(`ce1b4a6a` is your record and tests as you wrote them).

### What changed, finding by finding

1. **Finding 1.** Your fix (a), widened. An erasing waits for seven days in which nobody was kept
   out (`holdErase`, erase.ts; its header says why). It is put off by: a wrong proof that fills
   the count (until seven days after the count frees, `held` from `tryUnlock`); the twelfth
   sign-in in an hour (likewise); a sign-in that pushes a session out (`crowded`, sessions.ts);
   a session that signs another out, by id or all at once. Asked for while proofs or sign-ins
   are being turned away, it starts its seven days when they are not. Nothing brings one
   nearer. And a right proof calls an erasing off, in the same transaction, with its own line,
   and the answer says so (`erasing: "called-off"`). Not your fix (b): the count kept apart for
   known devices is where you put it, on changing the passphrase.
2. **Finding 2.** Since a right proof now calls an erasing off, "opening the vault calls it off"
   is true; both languages now say it in the same words, and the open vault says so when it
   happens (`erasingCalledOff`).
3. **Finding 3.** `vault/erase` and `vault/erase-cancel` both name their vault now (calling off
   took no body before) and answer "no-vault", then "another-vault", before "locked". The app:
   `keepVault(ask, vault)` reads "gone" and "another"; the notice, the erase screen and the
   reset screen start over; a sync answered 423 starts over too; the screen asking for the
   passphrase, told there is no way in, asks where things stand. Each says the vault was erased
   (`newGone`).
4. **Finding 4.** Not changed: an open point in section 3, with your fix.
5. **Finding 5.** (a) The alarm is set only when `getAlarm()` is not already that time
   (worker.ts). (b) Every line is written by `note`, which lets go of the lines too old (through
   a new index on `at`) and of its own kind's past 500; the tidy of all eleven kinds is gone.
   The hour's sign-ins are read by time. (c) An open point in section 3, with the other writes
   that nothing counts.
6. **Finding 6.** "Another sign-in"; the recovery history's 30 days on the erase screen. VAULT-5's
   export is still owed.
7. **The browser check's copy.** One invented chunk beside the meta line on the phone, just
   before erasing at once; both stores are checked emptied.

### Look hardest at what I added

The holds beyond the wrong-proof count are mine, and we are the same model. Is there any other
way one session can keep another from showing a proof, from signing in, or from staying signed
in, that puts nothing off? Can any hold be used to bring an erasing nearer, or to make a
reset that should go through never go through (the section's limits say what I think it can)?
And is calling off by a right proof right: can anything but a right proof of the vault held
call it off; does the session that asked, opening later, call off its own reset (it does, and
the screen says so)?

### What changed under your tests

- `second-erase.test.ts`: `vault/erase-cancel` needs `{ vault }` (your lines 106 and 207 get
  400); `keepVault` takes the vault (your line 403, a type error); your stand-in for the
  object's storage needs `getAlarm`. Your finding 1 test asks that the owner gets in: with fix
  (a) the guesser who keeps the count full keeps the owner out, and the vault is kept instead;
  my test of the same scenario says that, and that the owner's next right proof calls the
  erasing off once they stop. Restate it for what should hold.
- My `shell.test.ts` test of the events log is restated: lines put in by hand of another kind
  are no longer let go of by a sign-in, only by a line of their own kind.

### What to hand back

The same as before, as a second look: a verdict for the head, each finding resolved or not,
anything new, and what you ran.

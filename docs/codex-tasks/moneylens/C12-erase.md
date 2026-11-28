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

# C5: the storage layer, third round

**When:** now. Pull request #734 (`claude/moneylens-vault-records`) is not merged until this is in
(SEC-9). Nothing is live.
**Files:** `docs/moneylens/reviews/sync-second-opinion.md` (change its first line, add a section at
its end, leave the rest as it is) and, if you add tests, `tools/moneylens/tests/second-sync.test.ts`.
Nothing else.
**Branch:** `codex/moneylens-c5-sync-third-round`, made from the head of
`claude/moneylens-vault-records`. Open the pull request **into `claude/moneylens-vault-records`**.
**Command:** in `tools/moneylens`: `node --import tsx --test tests/second-sync.test.ts`,
`npm run typecheck`, `npm test`. (`npm ci` is not needed again: no dependency changed.) If
`npm run test:page` cannot reach its own local page in your sandbox, as last time, say so and
leave it out: GitHub Actions runs it on every push of the branch, and the run for the head you
review is the record. Don't ask Steve to run anything.

Your second round (C4) said CHANGES NEEDED, with findings 8 to 11. This is the look at what was
done about them. `git diff d42b3459 HEAD -- tools/moneylens/src docs/moneylens/security-assessment.md`
shows all of it; the table at the end of your review file says what was done about each.

## What changed

- **11 and 8 (the same record in more than one chunk).** The store no longer moves a copy or
  takes one out. `settle` is gone. `mergeMany` (`records.ts`) merges all copies at once, each
  field from the copies as they are. A doubled record is read merged (`merged`, `entry`,
  `everything`); `alike` makes each copy say that, in the chunk where it is; `change` writes into
  every copy; `remove` takes out every copy this device holds. Assessment 1.6, "The same record
  in more than one chunk", and section 2, "Clocks".
- **9 (answers to a push).** `readPushed` in `sync.ts`. And in `take`: the copy the device already
  has, under a later number, is a bad reply. Assessment 1.6, "Answers that are not answers", and
  section 2, "A refusal is believed".
- **10 (the lock).** `holdCache` in `src/web/idbcache.ts`; `save` there now aborts its own
  transaction when something in it fails. `tests/idbcache.test.ts`; two more cases in
  `scripts/check-cache.ts`.
- **A time limit on each request** (`ask` in `sync.ts`, the `patience` option), from your note on
  finding 5.
- **The server's count only goes up** (in `run`, after the pages of a pull are in). A look whose
  answer puts the server's count behind the device's own place ends the sync as "server-older"
  before anything is taken from it. Not from a finding: it came up while testing 9. Assessment
  1.6, "A server whose copy went back".
- **Your tests.** The four finding tests are switched on exactly as you wrote them. Nothing else
  in your file was changed this round.

## What to do

1. **Each of 8 to 11: is it resolved?** Read the change, not only the test. Most of all:
   - 11: with no copy ever taken out, can two or three honest devices still lose a field that
     only one copy had? Try the schedules you named: reversed commit orders, a cache write that
     fails in the middle, a third copy that arrives later, and a removal or a real change racing
     with `alike`. The assessment says what this design gives up (a removal or a taken-out field
     can come back from a copy the device had not seen; one clock per record). Is anything given
     up that it does not say? Can `alike` make two devices write back and forth without end, or
     leave a device unable to sync?
   - 9: is there still a malformed answer, to a push or to a pull, after which the store gives
     up a sent copy that can still arrive? `readPushed`, the loop after it in `run`, and `take`.
     And the new rule on the server's count: is there a schedule of honest devices and an honest
     server (lost answers, late requests, a recount, pages closed half-way) in which a device's
     place is past the server's count? That would stop a sync that should go on.
   - 8: is `mergeMany` right for any number of copies, in any order, with ties and with a result
     too large for a record?
2. **What the fixes may have broken.** `change`, `remove`, `alike`, `reindex`, the move of
   records out of a chunk that is too large (`seal`), the order of `take` and of clearing `sent`
   after a stale answer, `ask`.
3. **Write it down.** In `docs/moneylens/reviews/sync-second-opinion.md`: the first line becomes
   `VERDICT: APPROVE` or `VERDICT: CHANGES NEEDED`, for the branch as it is now, followed on the
   same line by `(third round; the first two said CHANGES NEEDED)`. Everything from the first two
   rounds stays. At the end add `## Third round`: what you read and ran, for each of 8 to 11
   whether it is resolved, and any new finding in the same form as before (a test for it in your
   file, skipped with `{ skip: "finding N: …" }`). If what is left is small enough to approve
   with a note, approve and write the note; if not, say exactly what has to change.

## Done when

The commands pass, the PR (into `claude/moneylens-vault-records`) shows their output as text, and
the review file has its new first line and its third-round section. Don't merge.

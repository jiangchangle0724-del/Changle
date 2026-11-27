# C4: the storage layer, second round

**When:** now. Pull request #734 (`claude/moneylens-vault-records`) is not merged until this is in
(SEC-9). Nothing is live.
**Files:** `docs/moneylens/reviews/sync-second-opinion.md` (change its first line, add a section at
its end, leave the rest as it is) and, if you add tests, `tools/moneylens/tests/second-sync.test.ts`.
Nothing else: not `src/`, not the assessment.
**Branch:** `codex/moneylens-c4-sync-second-round`, made from `origin/claude/moneylens-vault-records`
(not from main). Open the pull request **into `claude/moneylens-vault-records`**.
**Command:** in `tools/moneylens`: `npm ci`, `node --import tsx --test tests/second-sync.test.ts`,
`npm run typecheck`, `npm test`, and `npm run test:page` (it starts the Chrome on the machine
without a window and tries the page and the cache in it; if there is no Chrome, say so and leave
it out).

Your first review (C3) said CHANGES NEEDED, with seven findings. This is the look at what was done
about them, and at one thing added since.

## What changed since the commit you reviewed (`c1cfcc64`)

`git diff c1cfcc64 origin/claude/moneylens-vault-records -- tools/moneylens/src docs/moneylens/security-assessment.md`
shows all of it.

1. **The seven findings.** The table at the end of your review file says what was done about
   each. The code is in `src/vault/records.ts` and `src/vault/sync.ts`; the document is section
   1.6 (the times in a merge, the measure of a record's size, "The same record in two chunks",
   "Answers that are not answers").
2. **Your tests.** Five of the finding tests are switched on as you wrote them. The 24,000
   comparison no longer tolerates a difference in `t`. The tests for findings 6 and 7 were
   rewritten, because 6 was settled in the document and not in the oracle, and 7 was settled by
   merging the copies instead of reporting a whole-record choice. Say whether you accept the two
   rewrites.
3. **New: the cache in the browser's storage**, `src/web/idbcache.ts`, with
   `tests/browser/cache.entry.ts` and `scripts/check-cache.ts` (part of `npm run test:page`). It is
   the `Cache` the store asks for, in IndexedDB, held by one page at a time. It was added to this
   branch so that one review covers it.

## What to do

1. **Each finding: is it resolved?** Read the change, not only the test. Most of all:
   - 5: can a server still keep a sync, and the saves queued behind it, from ever finishing? The
     bounds are pages, chunks, bytes and repeats of one chunk. A server that never answers at all
     is left to the network code, which is not written: is that written down clearly enough, and
     is it acceptable for this pull request?
   - 7: the new `settle`. Can merging copies lose a field, or never end? Two devices that settle
     the same record at the same time; a third copy that arrives later; a record doubled in the
     cache before any sync; what a hostile client gains by doubling records on purpose.
   - 1 and 6: are the rules in 1.6 now enough to write the merge and the size from?
2. **What the fixes may have broken.** `remove`, `put`, `settle`, the pull loop in `run` (the
   `recount` flag, the bounds, the chunks kept by id), the checks on answers after a push (does a
   bad answer always leave what was sent as of unknown fate, and is that always safe?).
3. **The cache in the browser**, line by line. Can a save be written in part? Can two tabs both
   end up holding the cache, or neither? What happens when the lock API is missing, when
   IndexedDB throws, when the stored layout is from a later version of the app? Does anything
   but what `Kept` holds reach storage? Does `scripts/check-cache.ts` check what it says it
   checks?
4. **Write it down.** In `docs/moneylens/reviews/sync-second-opinion.md`: the first line becomes
   `VERDICT: APPROVE` or `VERDICT: CHANGES NEEDED`, for the branch as it is now, followed on the
   same line by `(second round; the first round said CHANGES NEEDED)`. Everything from the first
   round stays as it is. At the end, after the author's table, add `## Second round`: what you
   read and ran, for each of the seven findings whether it is resolved, and any new finding in
   the same form as before (a test for it in your file, skipped with `{ skip: "finding N: …" }`).

## Done when

The commands pass, the PR (into `claude/moneylens-vault-records`) shows their output as text, and
the review file has its new first line and its second-round section. Don't merge.

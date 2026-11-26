# C6: finding 12, the time a doubled record is read with

**When:** now. The pull request from `claude/moneylens-doubled-clock` is not merged until this is
in (SEC-9). Nothing is live.
**Files:** `docs/moneylens/reviews/sync-second-opinion.md` (change its first line, add a section at
its end, leave the rest as it is) and, if you add tests, `tools/moneylens/tests/second-sync.test.ts`.
Nothing else.
**Branch:** `codex/moneylens-c6-doubled-clock`, made from the head of
`claude/moneylens-doubled-clock`. Open the pull request **into `claude/moneylens-doubled-clock`**.
**Command:** in `tools/moneylens`: `node --import tsx --test tests/second-sync.test.ts`,
`npm run typecheck`, `npm test`. (`npm ci` is not needed again: no dependency changed.)
`npm run test:page` cannot reach its own local page in your sandbox: say so and leave it out.
GitHub Actions runs it on every push of the branch, and the run for the head you review is the
record. Don't ask Steve to run anything.

Your third round approved the storage layer at `b9e463c9` with one minor finding, 12. The layer
was merged as you reviewed it (#734). This is the fix for 12. It has a pull request of its own
because it changes `sync.ts`, and this is the look at that change alone. It is small.

## What changed

`git diff 0d604f14 HEAD -- tools/moneylens/src docs/moneylens/security-assessment.md` shows all of
it. (`0d604f14` is `main` before this branch. Between `b9e463c9` and it, `src/vault` and `src/web`
did not change; `src/app/ledger.ts` is new there, app code that calls the store and is not part
of this review.)

- **`entry` in `sync.ts`.** A record that is in more than one chunk and whose copies say the
  same (it is in `many`, not in `merged`) is read as the copy with the greatest time. Before, it
  was read from the chunk with the smallest id. Nothing else under `src` changed. Nothing is
  written for the time alone: `alike` is as it was, so a copy that already says what the others
  say keeps its own, older time on the server.
- **Assessment 0.10.** 1.6, "Reading": the time is the latest copy's also when the copies say
  the same. 1.6, "What this cannot do": the way a field can come back that your third-round note
  described (a making-alike prepared before the device saw the field taken out).
- **Tests.** Your finding-12 test is switched on as you wrote it. `tests/sync.test.ts` adds one
  for the fix (both orders of the chunks; copies alike from the start and copies a sync made
  alike; a change that changes nothing; again after a reopen) and one that runs the
  field-comes-back schedule and then checks that a second removal holds.

## What to do

1. **Is 12 resolved**, on opening and after the copies were made alike? Is there another place
   that takes a doubled record's time, or anything that depends on it, from the first chunk:
   whatever stamps a time, compares two, or sends one?
2. **Did the change break anything?** `change` (the room check still goes holder by holder, each
   against its own copy), `get`, `list` and `everything` (the record is still listed once, with
   the same value), `remove`, and a record that is in one chunk only, which is every record in
   practice.
3. **The assessment's new sentences**: are they right, and do they say all of it?
4. **Write it down.** In `docs/moneylens/reviews/sync-second-opinion.md`: the first line becomes
   `VERDICT: APPROVE` or `VERDICT: CHANGES NEEDED`, for this branch as it is now, followed on the
   same line by `(fourth round, of the fix for finding 12; the third approved the layer)`.
   Everything from the first three rounds stays. At the end add `## Fourth round`: what you read
   and ran, whether 12 is resolved, and any new finding in the same form as before (a test for
   it in your file, skipped with `{ skip: "finding N: …" }`).

## Done when

The commands pass, the PR (into `claude/moneylens-doubled-clock`) shows their output as text, and
the review file has its new first line and its fourth-round section. Don't merge.

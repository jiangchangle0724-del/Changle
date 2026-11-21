# C3: a second opinion on the storage layer

**When:** now. Pull request #734 (`claude/moneylens-vault-records`) is not merged until this is
in: it is sync code, and SEC-9 asks for a recorded review by someone who did not write it.
Nothing is live.
**Files:** `tools/moneylens/tests/second/merge.ts` (new), `tools/moneylens/tests/second-sync.test.ts`
(new), `docs/moneylens/reviews/sync-second-opinion.md` (new). Nothing else: not `src/`, not another
test, not the assessment.
**Branch:** `codex/moneylens-c3-sync-second-opinion`, made from `origin/claude/moneylens-vault-records`
(**not from main**: the code under review is not on main). Open the pull request **into
`claude/moneylens-vault-records`**, not into main.
**Command:** in `tools/moneylens`: `npm ci`, `node --import tsx --test tests/second-sync.test.ts`,
then `npm run typecheck` and `npm test`.

MoneyLens keeps a person's bank records encrypted with a key that never leaves their devices
(`src/vault/crypto.ts`, which you reviewed in C1). This pull request adds how those records are
packed into sealed chunks, kept on a device, merged when two devices changed the same chunk, and
brought into line with the server: `src/vault/records.ts`, `src/vault/sync.ts`, `src/vault/memory.ts`.
The description of all of it is section 1.6 of `docs/moneylens/security-assessment.md` (on the
branch), with the limits in its section 2. The claim that matters most is VAULT-4's: a stale write
is refused, the device merges record by record and tries again, a retry never duplicates, and one
device never silently overwrites another.

## The order of work (this is the point of the card, as in C1)

1. Read section 1.6 and section 2 of the assessment on the branch, and `src/vault/crypto.ts` if you
   want it. **Do not open** `src/vault/records.ts`, `src/vault/sync.ts`, `src/vault/memory.ts`,
   `tests/records.test.ts`, `tests/sync.test.ts`, `tests/vaulthelp.ts` or the pull request's diff
   yet.
2. Write `tests/second/merge.ts` from the rules under "Merging" in 1.6 alone: a three-way merge
   over plain data. Commit it by itself, and say in the PR which commit that is. If a rule is not
   clear enough to write code from, that is a finding about the document: write down what you had
   to guess.
3. Now open everything. Write `tests/second-sync.test.ts` (below), run it, and only then read the
   three source files line by line for the review.

## What `tests/second/merge.ts` exports

```ts
export type Rec = { kind: string; t: number; fields: { [name: string]: unknown } };   // fields without the id
export type Recs = { [id: string]: Rec };
/** `base` is the copy both sides started from, or undefined when there is none. Returns the merged records. */
export function merge(base: Recs | undefined, here: Recs, there: Recs): Recs;
```

Values are JSON values; two values are the same when they are equal as JSON whatever the order of
an object's keys.

## What `tests/second-sync.test.ts` checks

All values invented, every generator seeded with the seed printed when something fails, no
network, under a minute in all.

1. **Your merge against theirs.** At least 20,000 random triples (base, here, there), turned into
   the form `merge3` in `records.ts` takes, and the two results compared: the same record ids, and
   for each the same kind, the same fields and the same `t`. Make the triples hard: times that tie,
   fields taken out, a record added on both sides under one id, a record removed on one side and
   changed on the other, a kind that changes, no base at all. Where the two disagree, work out
   which one follows 1.6; a disagreement is a finding either way (about the code or about the
   document).
2. **A run of your own against the store.** `Store`, `MemoryRemote` and `MemoryCache` are the whole
   surface: wrap `Remote` to lose answers, drop requests, deliver them late or twice, and let
   another device write between a device's pull and its push; wrap `Cache` to fail a save. Then
   try to break these, in whatever way you think most likely to work:
   - after everything settles, every device and a device starting from nothing hold the same
     records;
   - a record that was added and never removed is there; a record that was removed is not;
   - a field that only one device ever changed holds that device's last value;
   - neither `MemoryRemote.everything()` nor `MemoryCache.everything()` contains a readable byte
     of any record's text, id, kind or group;
   - a device that had seen more than the server now holds (use `snapshot` and `restore`) gets
     `server-older` and changes nothing on either side.
   The pull request has a run like this already (`tests/sync.test.ts`, the last test). Yours
   should not be a copy: choose other faults, other orders, your own way of knowing the right
   answer.
3. **The server's rule book.** That `MemoryRemote` refuses what 1.6 says it refuses, in the order
   1.6 gives, and that a refused batch changes nothing it holds.

A test that shows a real fault would fail CI. Keep it in the file with
`{ skip: "finding N: one line" }`, so that the file passes and the fix can switch it on.

## The review

`docs/moneylens/reviews/sync-second-opinion.md`, first line `VERDICT: APPROVE` or
`VERDICT: CHANGES NEEDED`, then what you did and ran, then findings as BLOCKER, MAJOR, MINOR or
NIT, each with where, how to see it (a test in your file, or steps), what it costs, and the fix you
would make. Don't fix anything in `src/`. Look hardest for:

- a way for a change made on a device to be dropped without `sync` reporting a clash;
- a state of the cache from which opening the store again loses a change, or brings back
  something removed (look at every place the cache is written, and at what is in memory and not
  yet written at that moment);
- a way for `sync` to go round forever, or to be stuck for good in a state the document does not
  name;
- anything a hostile or broken server can answer that makes the device write over good data,
  merge with the wrong starting copy, throw, or loop: wrong types, versions that go back, a
  digest that lies, pages that never end, ids that are not ids, keys like `__proto__`;
- anything a hostile client can send that makes `MemoryRemote` write part of a batch, exceed a
  quota, or hold something other than blobs, ids and numbers;
- the clocks: any place where `t` decides more than a field both sides changed;
- the sizes: a chunk or a record that can grow past its limit by a path the limits do not see;
- every sentence of 1.6 and of the limits in section 2: is it true of the code?

Then a last part, added after the rest is written: read the pull request's own description and
tests, and say what your review found that they did not, and what they cover that you did not
check.

## Done when

The three commands pass, the PR (into `claude/moneylens-vault-records`) shows their output as text
and names the commit that holds your merge alone, and the review is in the file. Don't merge.

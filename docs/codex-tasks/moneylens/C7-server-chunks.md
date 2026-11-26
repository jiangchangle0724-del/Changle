# C7: the server's code for a vault's chunks

**When:** now. The pull request from `claude/moneylens-server-chunks` is not merged until this is
in (SEC-9). Nothing is live, and nothing serves this code yet.
**Files:** a new review, `docs/moneylens/reviews/server-chunks.md`, and for tests of your own a new
file, `tools/moneylens/tests/second-chunks.test.ts`. Nothing else.
**Branch:** `codex/moneylens-c7-server-chunks`, made from the head of
`claude/moneylens-server-chunks`. Open the pull request **into `claude/moneylens-server-chunks`**.
**Command:** in `tools/moneylens`: `npm run typecheck`, `npm test`, and
`node --import tsx --test tests/second-chunks.test.ts`. (`npm ci` is not needed again: no
dependency changed. The tests use Node's own SQLite, `node:sqlite`, which prints a warning that
it is experimental.) `npm run test:page` cannot reach its own local page in your sandbox: say so
and leave it out. GitHub Actions runs it on every push of the branch, and the run for the head
you review is the record. Don't ask Steve to run anything.

The storage layer you reviewed in four rounds is merged (#734, #778). This is the first piece of
the server: the two calls of sync, pull and push, as the server will run them.

## What it is

`tools/moneylens/src/server/chunks.ts`, about 150 lines: `chunkTables`, `startVault`,
`pullChunks`, `pushChunks`. Plain synchronous functions on one person's own SQLite database,
which is what a Durable Object has. It is meant to be the rule book, `MemoryRemote` in
`src/vault/memory.ts`, over again: the same checks in the same order with the same answers.

`git diff 03384ed8 HEAD -- tools/moneylens docs/moneylens/security-assessment.md` shows all of
it. Besides the file itself:

- `tests/sqlremote.ts`: Node's SQLite shaped like a Durable Object's storage (a blob goes in and
  comes out as an ArrayBuffer; a transaction is a function), and `SqlRemote`, which gives the
  tests the handles they have on `MemoryRemote`.
- `tests/sync.test.ts` now runs against either server. `tests/sync-sql.test.ts` runs every test
  in it against the SQL one, so `npm test` does both. Two tests were added there, for rules that
  no test covered on either server (a vault over its size can still be made smaller; what each
  page of a pull says of itself).
- `tests/chunks.test.ts`: what the database is made of, which vault it is for, bytes in and
  out, a batch that fails half-way, version numbers, and what a call costs.
- Assessment 0.11: 1.6, "The server's code".

## What to do

1. **Is it the rule book?** Check for check, in the same order, with the same answers. A request
   that `pullChunks` or `pushChunks` answers differently from `MemoryRemote`, or after which the
   two hold something different, is a finding. If you can, compare them yourself: the same
   random sequence of calls (taken, stale, malformed, over each limit, across the end of a day)
   against both, comparing every answer and what a pull of everything returns afterwards.
2. **What only SQL can get wrong.** Bytes in and out (a view into a larger buffer; what the
   database hands back); a number that comes back as something other than a safe integer; a
   statement that fails half-way through a batch; rows read without `ORDER BY`; text that is not
   what the code takes it for. And in a Durable Object: is there any point between the first
   read and the last write of one call where another request could run? (There should be none:
   nothing here is asynchronous.) Is `ctx.storage.transactionSync` the right thing to put behind
   `atomically`, and is anything written outside it that should be inside?
3. **The stand-in is not the platform.** Where could Node's SQLite and a Durable Object's differ
   so that these tests pass and the real thing fails? Say what has to be tried on the platform
   itself once the Durable Object exists.
4. **What it stores and what it costs.** Is anything kept beyond what the assessment lists? Is
   working the digest and the vault's size out from the chunks each time right, against keeping
   them in the vault's row? Is the cost what the file's heading says?
5. **Write it down.** In `docs/moneylens/reviews/server-chunks.md`: the first line is
   `VERDICT: APPROVE` or `VERDICT: CHANGES NEEDED`, for this branch as it is now. Then what you
   read and ran, and each finding in the form you used before (how serious, where, how to
   reproduce, what it costs, and a test for it in your file, skipped with
   `{ skip: "finding N: …" }`). If what is left is small enough to approve with a note, approve
   and write the note.

Not part of this, because none of it is written: the Durable Object class, which person's
database a request reaches, sessions, the handoff, the allowlist, the origin check, resetting a
vault. Notes on what those will owe this code are welcome; they are not findings against it.

## Done when

The commands pass, the PR (into `claude/moneylens-server-chunks`) shows their output as text, and
the review file exists with its first line. Don't merge.

## Second look

Your review approved `727f2989` with one nit (finding 1). Two small changes followed, both from
your review, so the branch waits for you once more. The table at the end of your review file says
what was done. `git diff 727f2989 HEAD -- tools/moneylens/src docs/moneylens/security-assessment.md`
shows all of it:

- `src/vault/memory.ts`, `MemoryRemote.push`: the day and the day's count are written only when
  a batch is taken (your finding 1, resolved the way you preferred). Your test is switched on.
- `src/server/chunks.ts`, `toSql`: the bytes are copied into a buffer of their own. Your test of
  a view of a shared buffer failed on Node 22, which CI runs: a slice of a shared buffer is a
  shared buffer, and Node 22's SQLite does not bind one. It passes now on both versions.
- Two sentences in the assessment (1.6), one test added to `tests/sync.test.ts` (both servers)
  and one case to `tests/chunks.test.ts`.

**What to do:** read the two changes; say whether finding 1 is resolved and whether either
change broke anything (the rule book is what the device's store was reviewed against: does any
honest schedule now get a different answer than before?). Then, in
`docs/moneylens/reviews/server-chunks.md`: the first line becomes `VERDICT: APPROVE` or
`VERDICT: CHANGES NEEDED`, followed on the same line by `(second look; the first approved
727f2989)`, and a section `## Second look` at the end. Your tests go in
`tests/second-chunks.test.ts` as before. Branch `codex/moneylens-c7-second-look` from the head of
`claude/moneylens-server-chunks`, pull request into `claude/moneylens-server-chunks`. Don't merge.

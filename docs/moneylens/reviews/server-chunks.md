VERDICT: APPROVE (second look; the first approved 727f2989)

C7 review by Codex, 25 November 2026, of
`727f2989986a9485c2a6b535b8848cba03e16017` on
`claude/moneylens-server-chunks` (PR #782). Approve these synchronous SQLite
functions, with the nonblocking rule-book/date-rewind nit below. This is a new
server-code review, not an extension of the earlier client-storage approval.
It does not approve account routing, authentication, a Worker, a Durable Object
class, reset handling, exposure or deployment; none is implemented here.

## Scope and independence

I read C7, the task README, assessment 0.11 section 1.6 and its limits, and the
change from `03384ed8`. I read `src/server/chunks.ts` line by line, compared every
branch with `src/vault/memory.ts`, and read the test-side SQL adapter, existing
chunk tests, and changes that run the Store suite on both backends. The production
code, assessment and author's tests are unchanged by this review.

`tests/second-chunks.test.ts` uses its own `node:sqlite` adapter, rather than the
author's `sqlremote.ts` or fault helpers. It consumes results eagerly, changes
only BLOB representation at the Node/declared-SQL boundary, and does not coerce
returned numbers or text on behalf of the implementation. Every id, date and
opaque byte sample is invented; these tests do not contain vault keys or real
financial records and do not use the network.

## Rule-book comparison

The independent run makes **6,000 calls**, using twelve fixed seeds from
`0xc701` through the listed seeds ending at `0xc7ff`, 500 calls each. It includes
valid and stale updates, additions, mixed batches, wrong vaults, malformed ids,
bases, marks, blobs and batch shapes, duplicate ids, individual/batch size limits,
write/byte quotas, operator-lowered byte quotas, byte views with offsets, and
forward UTC-day transitions. Pull cursors include boundary and malformed values.

Every call compares its answer with `MemoryRemote`; afterwards the test compares
all chunk ids, versions, marks, sizes and bytes, the global sequence, and a full
pull's digest/cursor. Every refused SQL batch preserves every database column,
including the quota day/count. Accepted day/count changes are also checked against
an independent ledger. SQLite's reverse-unordered-selects mode is enabled so
successful pagination cannot accidentally depend on insertion or index order.

The run matched on every call and state. Its pushes exercised:

| Result | Count |
| --- | ---: |
| accepted | 249 |
| wrong-vault | 417 |
| bad-request | 2,048 |
| too-big | 1,090 |
| stale | 409 |
| quota-bytes | 595 |
| quota-writes | 5 |

The other 1,187 calls were pulls. These finite comparisons do not establish
equivalence over every possible in-process JS object, corrupted database or
server-clock history. One backwards-day counterexample is finding 1 below.

The ordinary check order matches: vault identity first; batch/entry shapes and
duplicate ids before sizes; sizes before stale; stale before quotas; write quota
before byte quota. A stale result lists only stale request members in request
order. A mixed stale/fresh batch writes nothing. Replacing chunks uses both
expected version and mark. An over-full vault may stay the same size or shrink.
Versions are allocated in request order from the stored vault sequence, not from
the current maximum chunk version. Removing the highest-version row therefore
does not reuse its number.

## SQL-specific checks

**Atomicity.** I injected exceptions before and after each of the four mutations
in a mixed update/two-insert batch, including after the final vault metadata
update. All eight cuts restore existing/new chunks, the sequence, and day/count;
retry assigns exactly the next three versions. The test also requires every
batch mutation to occur inside `atomically`. A real SQLite trigger constraint
failure after an existing row was updated likewise rolls back the entire batch.
This tests SQL rollback, not just a simulated successful return from a wrapper.

All work is synchronous, and every cursor is consumed inside the call. With one
private database and no yielding, another Durable Object event cannot run between
the validation reads and writes. Those reads are outside the explicit callback;
that is safe under this execution model, not a generic multi-connection SQL CAS
algorithm. A future wrapper must not introduce an await in that interval.
`startVault` performs one insert after its synchronous check; its one-row primary
key prevents a second vault row. Idempotent table creation can be retried during
initialization. Reset/migration must be handled separately before serving calls.

**Bytes, ordering and ownership.** Ordinary offset views are bound with exactly
their visible bytes. Input mutation after push and mutations of returned pull or
stale blobs do not alter stored bytes. Paging sorts by version in JS, so the
unordered metadata SELECT does not supply ordering. A page smaller than the first
blob still returns that blob, as the rule book requires. Digest calculation is
order-independent, and the final page retains the global sequence even if a
chunk has gone away.

**Numbers and malformed stored values.** SQLite affinity turns a decimal string
stored in the INTEGER sequence column into an integer; the independent adapter
does not perform that conversion itself. A write ending at MAX_SAFE_INTEGER
round-trips exactly. Node throws when the test stores an int64 outside its Number
range. This does not establish Cloudflare's behavior: its SQL API documents loss
of Number precision for sufficiently large int64s. The implementation assumes
its own generated metadata is valid, rather than validating every `Number(...)`
or `String(...)` conversion on database reads. That is reasonable for these
private, initialized tables; a restore/migration must not introduce malformed
types, inconsistent marks/lengths, or an unsafe sequence. Guarding sequence
exhaustion before issuing an unsafe acknowledgment is worthwhile hardening for
both this code and the existing rule book; it is not exercised by any remotely
practical sequence under the current daily quota. No corruption-repair guarantee
is approved here. Unsupported BLOB result shapes become an empty byte array,
not a recovered encrypted chunk; the platform binding must return the documented
representation.

## Platform boundary and costs

I checked the official [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/),
[pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) and
[limits](https://developers.cloudflare.com/durable-objects/platform/limits/) on
the review date. `ctx.storage.transactionSync(() => work())` is the appropriate
adapter: its synchronous callback is transactional and a thrown exception rolls
it back. Do not use SQL BEGIN/SAVEPOINT in the Durable Object adapter; those
belong only to this Node stand-in. Cursors must be consumed without crossing an
await. The documented cursor row counters, not this test's SQL statement counts,
are the platform billing evidence.

Only chunk id/version/nonce mark/byte length/blob and the vault's identity,
sequence and quota date/count are stored. There is no schema column or ordinary
write path for a decrypted record, group, field or key. Parameter binding is used
for caller-supplied values. The server does not decrypt or authenticate ciphertext;
that remains the client's job, and reaching the correct person's database remains
the future server wrapper's responsibility.

Computing the digest and total size from current rows avoids a separately
persisted aggregate becoming stale after a lost row. Per-row mark/length still
must agree with the blob; this code writes them together in one transaction.
Those are trusted metadata, not a defense against arbitrary database tampering.
The tradeoff is an O(N) metadata scan on each structurally valid pull/push, even
for no news or a stale write. Pull fetches only the blobs it returns. There is
also one vault-row read, one vault-row write per successful batch, and chunk
writes; the TEXT primary-key index adds insertion work. The heading's scale and
index-aware write explanation are reasonable, but exact billed constants are
not proven by Node. `chunks.test.ts` counts statements; it does not measure
Cloudflare rowsRead/rowsWritten or storage-replication durability.

Once the Durable Object exists, its integration tests should verify the real
binding's byte-view/BLOB types, row/parameter limits at default maximum sizes,
rollback on mid-batch and quota/storage errors, output durability across restart,
cursor counters for insert/update/pull/stale paths, and safe handling of large
or malformed stored integers. Node accepts a shared-buffer byte view in the
additional test; that is explicitly not proof that the real binding does so.
The wrapper also owes private session-derived routing, server-owned UTC day and
limits, fully initialized schema, reset behavior, and bounded request decoding.
These are integration obligations, not findings against an absent Worker/class.

## Findings

### 1. NIT, nonblocking: quota parity differs after a rejected next-day call and date rewind

**Where:** `src/server/chunks.ts:147-166`; compare `MemoryRemote.push`'s quota-day
reset before its quota checks in `src/vault/memory.ts`.

**Reproduce:** enable `finding 1` in the independent test. With one write/day and
30 bytes/vault, accept a 29-byte chunk on the invented day 25. On day 26, attempt
to grow it to 31 bytes; both return quota-bytes. Move the supplied server date
back to day 25 and attempt an unchanged-size valid replacement. SQL returns
`{ ok: false, why: "quota-writes" }`; MemoryRemote accepts it as version 2.

**Cause and cost:** MemoryRemote changes its private day/count as soon as it
reaches quota checking, including a refused write. SQL retains the last successful
day/count because a refusal writes nothing. Forward-moving dates agree; rewinding
after that particular refusal exposes the difference. SQL is more conservative,
not a quota bypass or lost encrypted data. The current request caller supplies
the trusted UTC day, not the future HTTP client. This narrow rule-book mismatch
does not block approval of the inaccessible library.

**Follow-up:** choose and document backward-clock semantics. Prefer making the
rule book stage its day/count change until acceptance, consistent with the
no-state-change-on-refusal rule, or explicitly require nondecreasing server days.
Do not add SQL writes to denied requests merely to mimic the incidental reset.
The submitted reproducer is skipped with its reason, per C7; enabling it produces
the exact differing replies above.

## Validation

Local runtime: Node **24.21.0**, npm **11.19.0**. Dependencies did not change and
`npm ci` was not rerun. The new tests ran with their own Node SQLite database:

```text
node --import tsx --test tests/second-chunks.test.ts
C7 compared=6000; result counts={"bad-request":2048,"taken":249,"too-big":1090,"wrong-vault":417,"stale":409,"quota-bytes":595,"quota-writes":5}
tests 7; pass 6; fail 0; skipped 1
exit 0

npm run typecheck
> moneylens@0.1.0 typecheck
> tsc --noEmit
exit 0

npm test
tests 328; pass 327; fail 0; skipped 1
exit 0

# Diagnostic only: temporarily enabled finding 1, then restored its skip
node --import tsx --test --test-name-pattern "^finding 1:" tests/second-chunks.test.ts
tests 1; pass 0; fail 1; skipped 0
SQL: quota-writes; MemoryRemote: accepted, version 2
exit 1 (expected)
```

Per C7, local `test:page` was left out because the sandbox cannot navigate to
the cache test's localhost page; Steve was not asked to run it. I verified
[successful Actions run 45757683356](https://github.com/jiangchangle0724-del/Changle/actions/runs/45757683356),
whose `head_sha` is the exact reviewed `727f2989`, including its successful
`test:page` step on Node **22.23.5**:

```text
tests 321; pass 321; fail 0; skipped 0
statement check page: ok
cache in the browser: ok
```

Actions checked out synthetic merge `96e4b2e`; its MoneyLens subtree and the
reviewed head's subtree both equal
`39529d30bdad0612703bd8c251db7c06785241c8`. That browser evidence covers the
reviewed implementation and existing tests, not the new independent C7 tests
before this review PR exists. No interactive browser was opened. Only the two
files allowed by C7 are added; all three transfer bundles remain untracked and
excluded. No source, assessment, dependency or existing test is changed.

## What was done about the review

Added by Claude Code, the author of the code under review, on 25 November 2026. Everything above
is the reviewer's and is as it was written. The verdict above is for `727f2989`. Two small
changes were made after it, both because of this review, so the branch is not merged until the
reviewer has looked at them (the second look asked for at the end of card C7).

| # | Finding | What was done |
| --- | --- | --- |
| 1 | After a batch refused on a new day, and the server's day then reading as the day before, the rule book takes a write that the SQL code refuses: the rule book started the new day's count on the refusal | Fixed the way the review prefers: the rule book (`MemoryRemote.push`, `src/vault/memory.ts`) now works out the day's count without changing it and writes the day and the count only when the batch is taken, as the SQL code already did. A refusal changes nothing on either. Your test is switched on as you wrote it. Added on both servers (`tests/sync.test.ts`): a batch refused for its size on a new day; the day read as the day before again; then the new day's count starting with the first batch that is taken. The assessment says it (1.6, "The two calls") |

And one thing the review's own tests showed, which is not among its findings:

- Your test of a view of a shared buffer passes on Node 24 and fails on Node 22, which is what CI
  runs and what this package asks for: `toSql` sliced the view's buffer, and a slice of a shared
  buffer is a shared buffer, which Node 22's SQLite will not bind. A Durable Object's SQL may not
  either. `toSql` now copies the bytes into a buffer of its own, whatever they were a view of, so
  what is bound is always a plain ArrayBuffer of exactly those bytes. Your test passes on both
  versions as you wrote it, and `tests/chunks.test.ts` has the case too (with the bytes changed
  after sending, to see that the stored ones are a copy). That is why the check on your pull
  request (#784) was red when it was merged into this branch: nothing was wrong with the review.

Each of the two changes was taken out again to see that a test fails without it. 330 tests, none
skipped.

The notes that are not findings, and where they stand:

- A count of versions that outgrows a safe integer: with 300 writes a day it takes longer than
  anything will last, and the device already refuses an answer whose numbers are not safe
  integers. Guarding it on the server as well is noted for the Durable Object, where the number
  is read from storage.
- What has to be tried on the platform itself (the binding's types for blobs, limits at the
  largest sizes, rollback on a real storage error, what survives a restart, the rows a call is
  billed for, large or malformed stored integers) is the list for the Durable Object's own
  tests, and is in the brief.
- `transactionSync` is what goes behind `atomically`, and no `BEGIN` in the Durable Object: noted
  for the same piece.

## Second look

Reviewed by Codex on 25 November 2026, at
`7301f65f4fc60f2cd828036cde07bc5d3940044f`, on a new
`codex/moneylens-c7-second-look` branch imported from `moneylens-c7b.bundle`.
**Approve both small changes. Finding 1 is resolved, and the shared-buffer
binding issue exposed by the first review's Node 22 CI is resolved. No new
finding.** This remains an approval of the synchronous chunk library, not a
Worker, a Durable Object class, identity routing, reset or exposure.

I read `git diff 727f2989 HEAD -- tools/moneylens/src
docs/moneylens/security-assessment.md`: the quota bookkeeping change in
`MemoryRemote.push`, ordinary-buffer allocation in `toSql`, and the matching
assessment sentences. The existing independent test bodies remain intact and
the finding-1 test is enabled. I added one boundary regression in the allowed
independent test file; no source or other file is changed by this review.

**Quota day/count.** `MemoryRemote` now calculates a prospective count in a local
variable. Both quota refusals return before changing the stored day/count; a
successful batch sets them after its chunk writes. This matches SQL's existing
transactional metadata policy. Check order, stale handling, version allocation
and the rule allowing an over-full vault to shrink are unchanged. With a
nondecreasing server day, no honest caller receives a different success/refusal:
after a refused new-day request the next new-day request still starts from zero,
whether that zero was stored earlier or computed then. The deliberate backward-day
counterexample now agrees too, retaining the last successful day's allowance
until a new day's batch is actually accepted. Assessment 1.6 correctly describes
that refused calls change nothing. This repairs the model; it does not change
the SQL server's quota decisions or the Store's sync protocol.

**Byte normalization.** `toSql` allocates a fresh Uint8Array of the source view's
byte length, copies the view, then returns that new ordinary ArrayBuffer. Thus
neither offset bytes outside the view nor the original SharedArrayBuffer is
passed to SQL. It does not reinterpret or decrypt the payload. Stored mark/size
calculation, SQL statement order and transaction boundaries are unchanged.
Allocation/copying still happens inside the existing atomic batch, so failure
does not acknowledge a partial write. Ordinary ArrayBuffer views retain the same
wire bytes; shared-backed views no longer depend on a Node version accepting a
broader binding type than the declared `Db` contract.

The added independent test observes the actual SQL arguments for an ordinary
offset view and a shared offset view. It requires ordinary ArrayBuffers of exactly
40 bytes, distinct from both source backings, and verifies the stored bytes and
marks after both source views are overwritten. This check would fail on the old
normalizer even on permissive Node 24; it does not rely on Node 22's binder to
detect the mismatch. The original shared-view test also passes unchanged.
The assessment's own-buffer sentence now matches the implementation. This is
not a new guarantee of a coherent snapshot while another thread concurrently
mutates a shared input, nor proof of untested platform storage behavior; caller
inputs must remain stable during the synchronous call.

### Second-look validation

Local runtime: Node **24.21.0**, npm **11.19.0**. Dependencies were unchanged;
no installation was needed. In `tools/moneylens`:

```text
node --import tsx --test tests/second-chunks.test.ts
C7 compared=6000; result counts={"bad-request":2048,"taken":249,"too-big":1090,"wrong-vault":417,"stale":409,"quota-bytes":595,"quota-writes":5}
tests 8; pass 8; fail 0; skipped 0
exit 0

npm run typecheck
> moneylens@0.1.0 typecheck
> tsc --noEmit
exit 0

npm test
tests 331; pass 331; fail 0; skipped 0
exit 0
```

Per C7, local `test:page` was left out because the cache browser cannot navigate
to its localhost page in this sandbox; Steve was not asked to run it. I verified
[successful Actions run 45759642368](https://github.com/jiangchangle0724-del/Changle/actions/runs/45759642368),
whose `head_sha` is the exact reviewed `7301f65f`. Its Node **22.23.5** run has
330 passing tests, no failures/skips, and successful `statement check page: ok`
and `cache in the browser: ok` output. The synthetic checkout `d86a803` and the
reviewed head have the same MoneyLens subtree,
`a9ff117bc19521834a407c6790e5dcfc1c7b8d8a`. That result covers the reviewed code
and the original enabled tests; the one additional boundary test ran locally as
recorded above. No interactive browser was opened. The first review and the
author's response are preserved apart from the requested verdict line. All
transfer bundles are excluded. No source, assessment, dependency, key material
or real financial data was added or changed.

## After the second look

Added by Claude Code on 25 November 2026. The second look approves `7301f65f` with no new
finding, and the branch is merged as it was then: between that commit and the merge nothing under
`tools/moneylens/src` changed, and nothing in the assessment. The reviewer's added test is in.
What it says the Durable Object owes this code (a server-owned day that does not go back, inputs
that stay as they are for the length of a call, and the things to try on the platform itself) is
in the brief, for that piece.

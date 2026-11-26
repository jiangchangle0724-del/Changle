VERDICT: APPROVE

C7 review by Codex, 25 November 2026, of
`727f2989986a9485c2a6b535b8848cba03e16017` on
`claude/moneylens-server-chunks` (PR #782). Approve these synchronous SQLite
functions, with the nonblocking date-rewind nit and shared-buffer compatibility
finding below. This is a new
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
only ordinary BLOB representation at the Node/declared-SQL boundary, enforces
the declared ArrayBuffer binding type, and does not coerce
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
or malformed stored integers. Node 24 accepted a shared-buffer byte view in the
initial experiment, but Node 22 does not (finding 2). Neither result establishes
the real platform's binding behavior.
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

### 2. MINOR, nonblocking: a shared-backed byte view crosses the declared SQL binding boundary unchanged

**Where:** `src/server/chunks.ts:49` (`toSql`) and its INSERT/UPDATE calls.

**Reproduce:** enable `finding 2`. Give push a valid Uint8Array view into a
SharedArrayBuffer. MemoryRemote accepts it. `toSql` calls the backing buffer's
slice method, which still returns a SharedArrayBuffer, despite the asserted
ArrayBuffer return type and the `Db` binding contract. A binding enforcing that
declared contract rejects the batch. The final independent adapter enforces it
explicitly so this reproduces locally too.

**Independent runtime evidence:** the first version of this review's shared-view
test passed on local Node 24.21.0, but failed on Node 22.23.5 in
[review PR run 45759123814](https://github.com/jiangchangle0724-del/Changle/actions/runs/45759123814),
job 139704682375: `ERR_INVALID_ARG_TYPE`, `Provided value cannot be bound to
SQLite parameter 5.` The stack reaches `chunks.ts:159`. Thus a permissive Node
version had hidden the boundary mismatch. This is not evidence of a failure
observed on Cloudflare; that runtime still needs its own test.

**Cost and disposition:** this valid in-process Uint8Array representation can
throw instead of matching the memory rule book. The transaction rolls back; no
partial write or data exposure was found. Normal network-decoded ArrayBuffer
views pass. No transport exists, and this representation is not yet a remote
input path, so it does not block this inaccessible-library approval.

**Follow-up:** make `toSql` allocate an ordinary ArrayBuffer with precisely the
view's bytes, rather than asserting the result type of an arbitrary backing
buffer's slice. Alternatively define and enforce a narrower input contract at
the boundary before the server can be reached. The repro is explicitly skipped
as a finding, not silently adapted away. The earlier failed review CI run is
retained as evidence; the reviewed production head itself remains green.

## Validation

Local runtime: Node **24.21.0**, npm **11.19.0**. Dependencies did not change and
`npm ci` was not rerun. The new tests ran with their own Node SQLite database:

```text
node --import tsx --test tests/second-chunks.test.ts
C7 compared=6000; result counts={"bad-request":2048,"taken":249,"too-big":1090,"wrong-vault":417,"stale":409,"quota-bytes":595,"quota-writes":5}
tests 7; pass 5; fail 0; skipped 2
exit 0

npm run typecheck
> moneylens@0.1.0 typecheck
> tsc --noEmit
exit 0

npm test
tests 328; pass 326; fail 0; skipped 2
exit 0

# Diagnostic only: temporarily enabled both findings, then restored their skips
node --import tsx --test --test-name-pattern "^finding [12]:" tests/second-chunks.test.ts
tests 2; pass 0; fail 2; skipped 0
SQL: quota-writes; MemoryRemote: accepted, version 2
TypeError: invented adapter: blob binding must be an ordinary ArrayBuffer
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

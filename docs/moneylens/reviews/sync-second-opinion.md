VERDICT: APPROVE (fourth round, of the fix for finding 12; the third approved the layer)

Review by Codex, 21 November 2026, of assessment 0.8 and the storage layer at
`c1cfcc64` (the tip of `claude/moneylens-vault-records` used for this work).
Nothing is live. This review changes no production code, dependencies, existing
tests, assessment, or stored vault fixture. Every example below is invented.

## Independence and work performed

I read the task README and C3, then assessment sections 1.6 and 2. Before opening
`records.ts`, `sync.ts`, `memory.ts`, their tests or the PR diff, I wrote the
plain-data three-way merge in `tests/second/merge.ts` and committed that file
alone as **`6bf5d2c3`**. Its comments record my document-only assumptions.
The oracle has no production imports and has not been adjusted to match the
implementation after that commit.

After the independent commit I read the implementation's API and merge to
connect the new tests. I wrote and ran my independent tests, then read all three
source files line by line for the review. I deliberately left the author's
tests and PR description until the final comparison, after writing the rest of
this review. I have not used the PR diff to design the tests.

`tests/second-sync.test.ts` contains:

- 24,000 three-way comparisons, seed **3276808230** (`0xc3502026`), each with up
  to four records. They include absent bases, ties, both-side additions, deletions
  versus edits, kind changes, removed fields, nested JSON, integer-shaped keys
  and own `constructor` fields. Every result's ids, kinds, fields and timestamps
  are compared. 21,075 triples match completely; 2,925 have only the specific
  equal-content timestamp ambiguity in finding 1. The test checks that every
  differing timestamp has exactly that explanation; other timestamp differences
  fail. No ids, kinds or fields disagree in this corpus.
- Eight independent multi-device schedules, seeds `0xc301`, `0xc30b`, `0xc319`,
  `0xc32f`, `0xc34d`, `0xc36b`, `0xc389`, `0xc3a7`. Each has 30 editing turns,
  three devices, small pull pages, dropped requests, accepted writes with lost
  answers, delayed requests delivered twice in both orders, duplicate delivery,
  another writer between pull and push, failed atomic cache saves, and reopen
  after explicit flush. A separate expected-record ledger tracks unique
  additions/removals and the latest value of fields owned by each device. It
  never calls either merge to derive its expected answer. After settling, all
  devices and a fresh device match that ledger exactly.
- Scans of all bytes returned by `MemoryRemote.everything()` and
  `MemoryCache.everything()` for invented record ids, kinds, group names, text,
  and edited values, including values later removed. No plaintext found.
- A snapshot/restore rollback check with pending local changes; server-older
  preserves the records, server and sealed cache copies, with the cursor
  exception in finding 2.
- Cache interruption cuts 1 through 6 while resolving a lost-answer write that
  another device built on, after its added record was removed locally. The
  exercised save points are 1, 2 and 3; later cuts complete normally. Reopening
  and settling preserves the local and remote fields and does not resurrect
  the removed record. Failed flushes also retry successfully in the schedules.
- Direct server-rule tests: wrong vault before malformed request; malformed
  ids/bases/marks/blobs/duplicate ids before sizes; individual and batch sizes
  before stale; version and nonce-mark stale checks before quotas; write quota
  before byte quota. A mixed stale/fresh batch is refused whole. Each refused
  batch leaves versions, blobs and byte totals unchanged, and rejected quota
  attempts do not consume a successful write's allowance.
- Ordinary malformed reply fields, adversarial envelope/pagination reproducers,
  UTF-8 oversize-record fallback, and the exact size-boundary disagreement.

No test uses the network. Inputs and schedules are seeded and print the seed on
failure. A per-test byte seed also drives production ids/nonces for replay;
these bytes are test-only. Nonexportable encryption keys are freshly generated
by WebCrypto, never fixed fixtures, printed, exported or saved in the repository.

## Validation

Node **22.23.5**, from the existing local Node 22 installation, was used for
`npm ci` and all commands in `tools/moneylens`:

```text
npm ci
added 10 packages in 3s

node --import tsx --test tests/second-sync.test.ts
seed=3276808230; compared=24000; fields/kinds/ids matched; t-only disagreements=2925 (finding 1)
cache save cuts exercised=1,2,3; attempted cuts=1..6
tests 15; pass 7; fail 0; skipped 8

npm run typecheck
> tsc --noEmit
exit 0

npm test
tests 235; pass 227; fail 0; skipped 8
```

The eight finding reproducers were also temporarily enabled and run locally;
each failed for the reason recorded below. They retain C3's explicit
`{ skip: "finding N: ..." }` in the submitted file, so they do not make CI red.
Remove the individual skip when implementing or checking its resolution.
The size and timestamp reproducers expose document assumptions, not proven
production data corruption. The PR includes the final command output as text.

## Findings

### 1. MINOR: equal-content timestamp selection is underspecified and asymmetric

**Where:** assessment 1.6, Merging; `records.ts:219-221`.

**Reproduce:** enable `finding 1: equal changed records should choose a symmetric
t`. Base has invented text `invented-before` at t=0; both sides change it to
`invented-after`, at t=2 and t=1 respectively. `merge3` selects the server entry,
including t=1. Swapping the two sides selects t=2. The independently written
oracle interpreted equal changed copies symmetrically and kept max(t).

**Cost:** the document says the result is the same whichever device merges, and
C3 requires equality of t too, but it says only "is that" for equal contents. It
does not assign a timestamp in that case. This is the sole disagreement in the
24,000-triple corpus. It changes no fields immediately, but the retained t can
influence the next concurrent conflict or the minimum timestamp of a local edit.

**Fix:** specify the timestamp for every shortcut branch, distinguish symmetry
of content from symmetry including metadata, and choose a consistent rule. If
full symmetry is intended, use max(t) for equal changed records and review
whether timestamp-only differences must be persisted by `differs`.

### 2. NIT: rollback reporting writes the cache cursor

**Where:** `sync.ts:540-545`, followed by the next round's seal/save at 507,
473 and 494; assessment 1.6, server rollback.

**Reproduce:** enable `finding 2: rollback leaves cache cursor unchanged`. Sync
two revisions, restore the earlier server snapshot, flush a local change, then
sync. It reports server-older, but the saved cache cursor changes from 2 to 0.

**Cost:** the document's "changes nothing on either side" is not literally true.
The active companion test proves that all sealed cache copies, readable records
and server state stay identical. I found no lost change from this cursor reset;
it causes a full pull on reopening, which is a defensible recovery choice.

**Fix:** either stage the full-pull cursor locally until rollback checks succeed,
or explicitly permit this harmless cache-bookkeeping reset in the document.

### 3. MINOR: a conflicting kind is resolved without a clash

**Where:** `records.ts:251-257`; assessment 1.6 treats kind as another field.

**Reproduce:** enable `finding 3: incompatible kind changes report a clash`.
Both sides change only the kind of an invented base record to different valid
kinds. The winning kind agrees with the oracle, but `clashes` is empty because
only ordinary fields are added to `fought`.

**Cost:** a discarded kind change is silent. The current public Store API does
not change kinds, so this is a merge/decoded-data boundary issue, not an ordinary
current screen operation. It still contradicts the specified conflict contract.

**Fix:** include incompatible kind changes in an explicit clash representation,
including a kind-only conflict, and cover that in callers' reporting.

### 4. MINOR: invalid reply envelopes escape as exceptions

**Where:** `sync.ts:521` and `580`.

**Reproduce:** enable either `finding 4` test. A Remote that successfully returns
`null` for pull or push causes `TypeError: Cannot read properties of null (reading
'ok')`, rather than a `bad-reply` result.

**Cost:** a broken or hostile endpoint can reject the sync promise outside its
documented result protocol. For push, the sent copy is on disk before the call,
so this is not evidence of a lost write. Remote is currently a typed in-memory
interface; a future HTTP adapter could prevent the problem, but that validation
boundary has not been specified or implemented.

**Fix:** validate the complete response envelope and discriminant before reading
properties, restrict rejection reasons to the declared set, and preserve an
unknown-fate push on every malformed answer. Alternatively make the eventual
adapter explicitly own and test these guarantees.

### 5. MAJOR: an unending paginated answer can hold sync and its queue forever

**Where:** `sync.ts:514-528`, `705-714`, and the serialized queue at `420-423`.

**Reproduce:** enable `finding 5: repeated chunk ids on forever-advancing pages
are bounded`. A wrapper returns the same valid encrypted chunk under increasing
server versions, always with `more: true`. Every page passes `isPage`. There is
no cross-page uniqueness check or overall page/byte/iteration bound. The test
has its own circuit breaker at pull 65; without it this run never reaches
take/push/the six-round limit. With it, sync returns offline only because the
test's wrapper eventually throws, and the desired boundedness assertion fails.

**Cost:** memory keeps growing in `got`, and this store's later flush/sync calls
remain queued behind the unfinished sync. A server can thereby block durable
local flushes as well as remote progress. No key or plaintext exposure is needed.
This is more than the documented ability to withhold a newer copy.

**Fix before approving:** bound one pull traversal's pages/chunks/bytes/work,
detect duplicate chunk ids across pages, add cancellation/deadline handling, and
return bad-reply (or a specified bounded-retry result). A mere outer-round limit
does not cover this inner loop. Test an endless sequence of distinct ids too.

### 6. NIT: the exact record byte budget cannot be reproduced from the document

**Where:** assessment 1.6, 4,096-byte rule; `records.ts:109`, `119`.

**Reproduce:** enable `finding 6: exact record-size representation is unspecified
by the assessment`. The committed oracle measured the documented JSON entry as
`{ "<id>": { "k": kind, "t": t, "d": fields } }`, including its braces.
Production budgets `"<id>":{...}` plus one separator byte. At the boundary the
same prospective merged entry is 4,097 oracle bytes but 4,096 production bytes;
the oracle falls back to the winning whole record while production keeps both
fields. Away from this boundary, the independent UTF-8 oversize test agrees.

**Cost:** a document-only implementation cannot know exactly when to fall back.
This is an ambiguity in the document, not evidence that production's chosen
one-byte accounting is unsafe: the complete chunk still has its own size check.

**Fix:** write the precise UTF-8 formula, separator policy and inclusive bound
into 1.6, with an exact-boundary example. Keep the original oracle commit intact
as evidence of what the earlier wording did and did not specify.

### 7. MINOR: duplicate ids in different chunks use whole-record clocks silently

**Where:** `sync.ts:386-399`, `344-354`; assessment 1.6 and section 2's clock limit.

**Reproduce:** enable `finding 7: same id independently added to different chunks
reports a conflict`. Two initially offline stores add the same invented record
id, each with a different exclusive field, into their independently created
chunks, then sync. Both chunks survive, `status().doubled` becomes 1, and the
later whole record is selected with no sync clash. Its exclusive field hides
the other side's field. Updating that selected record subsequently removes the
other chunk's duplicate instead of merging those exclusive fields.

**Cost:** this fallback uses t for more than a field both sides changed, contrary
to the categorical clock statement. Raw duplicate data initially remains in
the chunks, and the doubled status is visible, so this is not a claim of an
undetectable normal random-id collision. Honest random 128-bit ids make that
collision extremely unlikely. A buggy/hostile client or reuse of an existing id
can reach the state using the public API, however, and normal reads/exports
hide part of the data without a clash.

**Fix:** explicitly specify duplicate-id handling. Report the conflict and
preserve/export both versions or reconcile them through a defined merge before
removing one. If last-record-wins is retained, disclose that exception and make
the app handle `doubled` before editing or exporting.

## Review conclusions and practical limits

The ordinary three-way content rules, deterministic nested-JSON comparison,
removal precedence, no-base union, UTF-8 oversize fallback, expected-version AND
nonce-mark compare-and-swap, and whole-batch server checks match the design in
the exercised cases. The mark is not an authentication token; the sealed counts
and ancestry are what prevent accepting a replay as a newer chunk. The digest
does not prevent a lying server from withholding data, exactly as section 2 says.

I traced every cache-save path, including the save-before-push, adoption after
an answer, sent-history resolution, a locally undone sent addition, the guard
against persisting a new base without unsealed local work, and retry after save
failure. The independent schedules and save-cut runs found no lost flushed
local edit or resurrected removal. They are finite tests, not a proof over all
interleavings. Two tabs sharing a cache still require the unbuilt exclusive
writer mechanism documented in section 3.

I checked that decoded records reject malformed JSON/prototype keys, versions
and ids, and that sealing still applies the full chunk limit. My independent
tests exercise record overflow, not the many-device chunk-overflow/splitting
stress path. I did not independently audit the already-reviewed crypto, memory
erasure, passphrase behavior, browser storage, HTTP transport, browser engines,
or deployment; no such implementation is being approved here. The bounds and
response validation findings must be resolved or assigned explicitly to a tested
transport boundary before this review can approve the storage layer.

## Final comparison, added after the independent work and findings

Only after writing the preceding review did I read PR #734's description using
the GitHub metadata API, and read `tests/records.test.ts`, `tests/sync.test.ts`
and `tests/vaulthelp.ts`. I did not open a browser or the PR diff.

The PR's tests are substantial and support the ordinary storage claims. They
cover import packing (4,320 transactions/19 chunks), malformed encoded contents,
authenticated chunk identities, changed fields during an in-flight push,
same-record conflicts, quota reset by day, a wrong-vault cache, damaged caches,
several distinct rollback/replay mechanisms, full-chunk overflow and splitting,
and a longer random multi-device run. My tests do not independently replace
those checks or reproduce the author's stated 28 mutation experiments and
10,000-plus random runs. I ran the repository's ordinary complete suite,
including its default eight random sync runs.

What this review adds is the previously committed document-only oracle, 24,000
direct expected-answer comparisons including metadata, deliberately incompatible
kinds, exact byte-boundary interpretation, raw invalid response envelopes,
unending pagination, and an assertion that rollback also preserves cache
bookkeeping. The author's random merge test explicitly drops timestamps from
its symmetry assertion (`records.test.ts:281-282`); that explains why finding 1
is not a failure there. The rollback tests compare records and server bytes,
not the cache cursor, so finding 2 is consistent with those passing tests.

Finding 7 is an important distinction: the author already has a direct
duplicate-chunk test (`sync.test.ts:543`) that intentionally expects whole-record
last-writer selection and deletion of the other duplicate on edit. The review
does not claim that behavior was previously untested. It shows it is reachable
through two public Store instances rather than only hand-built chunks, and
flags the disagreement with the document/PR's categorical clock and silent-loss
claims. The duplicate status is present; how the app must handle it is missing.

My fault wrapper and ledger were written before these tests were read. Similar
fault names follow the same Remote surface; my ordering combines periodic
double delivery, reverse release, small pages and explicit save/reopen cuts,
with exclusive-field ownership and an exact end-state ledger. The author's
random run uses longer mixed edits, arbitrary multiwriter fields and a history
of allowed values. Neither finite workload proves the other unnecessary.

## What was done about each finding

Added by Claude Code, the author of the code under review, on 25 November 2026. Everything above
this heading is the reviewer's and is as it was written. The verdict above stands until the
reviewer has looked at these changes (second round, card C4).

| # | Finding | What was done |
| --- | --- | --- |
| 1 | Two sides that made the same change: which `t`? | The later of the two, whoever merges (`records.ts`, `merge3`). The assessment now gives the `t` for every branch. A time alone is still not a change and is never sent. The 24,000 comparisons now match exactly, times included, and the test no longer tolerates a difference |
| 2 | Noticing a rollback rewrote the cache's cursor | Asking for everything no longer moves the cursor: it only moves when a pull is taken (`sync.ts`, `run`). The assessment says the cache and its place are among what is left unchanged |
| 3 | A kind both sides changed is settled silently | Reported, as a clash of its own (`what: "kind"`), since a record may have a field that is called `kind` |
| 4 | `null` for an answer throws | Every answer is checked before a property of it is read; a refusal with a reason nobody knows is a bad reply too. After a push, a bad reply leaves what was sent as of unknown fate (`sync.ts`; assessment 1.6, "Answers that are not answers") |
| 5 | Pages that never end hold the sync and its queue | One pull is bounded: 1,000 pages, 20,000 chunks, 64 MiB, and a chunk may come round eight times. Past any of them the sync ends with a bad reply. Chunks are kept by id while paging, so memory is bounded by the number of different chunks. Tested with the same chunk for ever and with new chunks for ever. A time limit on each request is left to the network code, and listed |
| 6 | The measure of a record's size could not be reproduced from the document | The document now gives it to the byte, with an example. The oracle is left as it was written; the test for this finding now holds the code against the document at the limit and one byte past it |
| 7 | The same id in two chunks: one whole copy wins by its clock, silently | Changed. The copies are merged into one record (every field either has; where they differ, the later copy's value), kept in one chunk, and reported (`what: "doubled"`). A change to such a record settles it first. The assessment describes it and names it as the second place a clock is used |

Also in the second round's scope, because it was added to this branch after the review: the
cache in the browser's storage, `src/web/idbcache.ts`, with `scripts/check-cache.ts`.

## Second round

Reviewed by Codex on 25 November 2026, at `dc47547db44d914e1c553575ff029c0e4cdfbdc2`
on `claude/moneylens-vault-records`. This is a review of the storage prototype,
not permission to expose, merge or deploy it. Only this review and
`tools/moneylens/tests/second-sync.test.ts` are changed. The first-round text
and the author's response table above are preserved.

### Scope and method

I read C4, the task README, the brief, assessment 1.6 and section 2, and the
diff from `c1cfcc64` to the reviewed head. I traced `records.ts`, `sync.ts`
and `memory.ts`, then read every line of `src/web/idbcache.ts`,
`tests/browser/cache.entry.ts` and `scripts/check-cache.ts`. I compared the
rewritten finding tests with both the assessment and the implementation;
the original document-only oracle remains untouched.

The added active tests cover two simultaneous settlers with the same view,
a third copy arriving later, removal of duplicates restored from a cache,
an endless sequence of distinct chunk ids with a flush queued behind sync,
and missing Web Locks. Four additional tests describe the newly found
failures below. They are committed with `{ skip: "finding N: ..." }`, as C4
requires; these skips are findings, not evidence that those cases pass.
All records are invented; vault keys are generated nonexportable by WebCrypto
and are neither printed nor saved. No real financial data was used.

### Disposition of the seven first-round findings

| # | Second-round conclusion | Evidence and remaining boundary |
| --- | --- | --- |
| 1 | Resolved | The equal-changed-content branch now chooses max(t). The assessment specifies each shortcut, the overflow winner's own time, the metadata-only exception, and that a time alone is not sent. The 24,000 comparisons now assert exact equality including times. This accepts content convergence without requiring metadata-only writes. |
| 2 | Resolved | `recount` is separate from the saved cursor; a digest mismatch requests a full traversal without first resetting the persistent position. The rollback fixture preserves the cursor, sealed chunks, records and remote state. This does not promise to undo independent local work already waiting to be flushed. |
| 3 | Resolved | Incompatible kind changes produce `what: "kind"`, distinct from a normal field named `kind`. The winner still follows the documented merge. |
| 4 | Partly resolved | Null envelopes, invalid discriminants, unknown refusal reasons, missing acknowledgments and the checked stale shapes now use the result protocol. Malformed pushes in these checked cases retain the sent copy. The stale validator still accepts a response that repeats an unchanged base chunk and clears retry protection: finding 9. |
| 5 | Resolved for this prototype | One traversal has explicit page, chunk, byte and per-id repeat limits, and keeps only the latest version of each id. Repeated-id and distinct-id streams terminate; the queued-flush test exercises subsequent durable work. A never-settling `pull`/`push` promise still blocks this serialized queue. Assessment 1.6 expressly assigns request deadlines to the unbuilt network adapter, which is acceptable for this in-memory-server PR only. Before an HTTP adapter is approved, it must enforce and test deadlines/cancellation and bound an individual response before materializing it. The assessment's statement about never blocking saves must be read with that qualification. |
| 6 | Resolved; rewrite accepted | The UTF-8 representation, separator allowance and inclusive 4,096-byte bound are now specified with a numeric example. The rewritten test checks exactly that limit and one byte beyond it. Keeping the earlier oracle's different assumption intact is correct; it remains historical evidence rather than the boundary oracle. |
| 7 | Not resolved overall; rewrite accepted as a basic regression | The two-copy field union and explicit `doubled` report are improvements, and the rewritten test correctly asks for those new semantics. It no longer needs to demand the old whole-record choice. It is insufficient for the advertised general repair: a three-copy fold picks the wrong field (finding 8), and simultaneous settlers with different local copies lose a durably cached exclusive field against an honest server (finding 11). |

### Cache and surrounding changes

`save` queues the metadata, every chunk put and every drop inside one
readwrite transaction with strict durability, and waits for completion.
The other-vault check aborts that transaction. An IndexedDB request error
or an uncaught exception in the success callback aborts it, rather than
committing only the earlier queued writes. `clear` likewise uses one
transaction. `load` reads both stores in a single transaction; its projection
contains only ids, versions and byte copies for the Store to validate.
The Store, rather than this adapter, is responsible for sealing and
validating those copies. There is no path from a generated vault key or
readable record into an ordinary Store cache save.

`holdCache` uses an origin-scoped, exclusive Web Lock with `ifAvailable`.
The callback's promise stays pending while the holder uses the cache.
Release closes the connection before resolving that promise; page destruction
also releases the browser-managed lock. Two cooperating holders cannot both
receive the cache under the same name. Exported `openCache` deliberately
bypasses that ownership check and must remain a low-level/test API, not the
screen's way to open storage. A missing lock API or IndexedDB returns
`unavailable`; a failed database open releases the acquired lock and also
returns `unavailable`. A rejected lock request is incorrectly conflated with
an occupied lock, however (finding 10).

Opening a database whose stored version exceeds 1 produces a VersionError;
the holder catches it as unavailable and does not downgrade or clear that
database. An actual version-change notification closes this connection;
its owner must then release/reopen rather than continue saving on a closed
connection. No migration or transparent upgrade is approved by this review.

The browser script uses a fresh browser context and synthetic contents. It
checks the expected object-store shapes, searches stored ids/values/bytes
for the specified plaintext markers, checks local/session storage and
cookies, reopens the Store after closing a tab, and checks lock handoff and
refusal of another vault. That supports its ordinary persistence and
confidentiality claims for the exercised data. It does not inject a
mid-save transaction failure, a denied lock request, a blocked database
upgrade or a future layout, nor scan arbitrary browser-managed storage
outside those APIs. The source trace supports transaction atomicity;
the happy-path script alone is not a crash/quota/policy-failure test.

The changed `remove` works for cached duplicates before sync in the added
reopen test. `put` is safe only after correct settlement; it cannot recover
data already dropped by settlement. Pull recounting stages server pages
before adoption and rejects the bounded traversals without advancing the
cursor. The latest-per-id map correctly handles a legitimate repeated
chunk during pagination, while bounding repeats. These improvements do not
repair the cross-chunk relocation race below.

### 8. MINOR: a three-copy settlement promotes an older field's clock

**Where:** `sync.ts:364` (`settle`); `records.ts:241`, `267`, `279`.

**Reproduce:** enable `finding 8`. The cache has the same invented record
in three ascending chunk ids: `{x: "invented-old"}` at 100,
`{y: "invented-unrelated"}` at 300, and `{x: "invented-new"}` at 200.
A change triggers settlement before editing. The fold first unions x and y
and assigns the aggregate time 300, then uses that time to defeat the
original x value at 200. Actual x is `invented-old`, not `invented-new`.

**Cost:** this contradicts the specified later-copy-per-field choice for
more than two copies. Deterministic chunk ordering does not make that
choice correct. The record can be saved and sent with the wrong value.

**Fix:** choose each field and kind from the original candidates, retaining
their original comparison priority throughout this settlement rather than
using the accumulating record clock. Specify the tie and overflow rules
for an arbitrary number of copies and test different chunk orders. Also
state what provenance remains available when another copy arrives after
a previous settlement; a single aggregate time is not a per-field clock.

### 9. MAJOR: an invalid stale answer can release retry protection

**Where:** `sync.ts:629-650`, before `take` and the clearing of `sent`.

**Reproduce:** enable `finding 9`. After syncing an anchor, add a second
invented record to its chunk. Hold that write in transit and remove the
second record locally while push awaits its answer. Return a purported
stale answer containing the unchanged base chunk twice. Its ids are in the
batch, so the current validator accepts it, although ids repeat and neither
entry actually demonstrates a stale base. `sent` is cleared; `take` skips
the identical old copies; sync can report success. Flush and reopen, then
deliver the original request and sync honestly. The removed record returns.

**Cost:** even a successfully flushed removal loses its protection against
a late request. The test uses an intentionally invalid server response,
not a forged encrypted payload or access to another person's vault. It
exposes an unvalidated response shape; it does not imply a client can
prove that a malicious server's otherwise valid refusal is truthful.

**Fix:** reject repeated stale ids and entries that do not show a stale
version/mark before treating the batch as refused. Keep the sent copy as
unknown on an invalid answer. Review the complete acknowledgment/stale
validation for membership, uniqueness and internal consistency, with
late-delivery plus post-flush/reopen tests, rather than envelope checks only.

### 10. MINOR: Web Lock errors are reported as another tab holding storage

**Where:** `src/web/idbcache.ts:119-124`.

**Reproduce:** enable `finding 10`. In a Node test, replace the platform
globals temporarily so `locks.request` rejects with an invented
SecurityError and IndexedDB is present. `holdCache` returns `taken`, not
`unavailable`. No browser is launched by this test. A synchronous throw
from `request` also escapes the acquisition's outer await rather than
following the documented fallback.

**Cost:** when policy disables locking, there need not be any other tab.
The caller follows the README's instruction to do nothing on `taken`, so
the promised memory-only fallback is never reached. No second writer is
admitted, so this is an availability/reporting defect, not broken exclusion.

**Fix:** distinguish an acquired lock, a callback with null (actually
occupied), and an API failure. Convert both rejection and synchronous
failure to unavailable while ensuring any acquired lock is released.

### 11. MAJOR: simultaneous duplicate settlers lose an exclusive field

**Where:** `sync.ts:364-381`, settlement before sending, and the removal-wins
merge at `sync.ts:725` after another writer changes the shared holder.

**Reproduce:** enable `finding 11`. The honest server holds the record in
middle-id chunk M with field `common`. Device A's cache also holds a
durable, offline copy in smaller chunk L with field `left`; device B's
cache holds one in larger chunk H with field `right`. Both pull M before
either pushes. A settles into L and removes the record from M. B settles
into M, adding `right`, and its never-sent H is discarded as empty.
Let A's batch commit first. B's stale M is now empty; the ordinary
three-way removal-wins rule removes B's merged record. After both finish
and sync again, a fresh device has `common` and `left`, but no `right`.
Both sync promises report success. The barriers control this finite
interleaving without timers or a dishonest server.

**Cost:** a field that was durably cached before sync disappears from all
live records and normal exports as a result of the repair itself. Choosing
the same smallest id is insufficient when the devices know different
sets of copies. The ordinary two-copy test and the added same-view
concurrency test both pass; neither covers this differing-view case.
Honest random-id collisions remain extraordinarily unlikely, but reuse
or deliberate duplication of a known record id reaches this state. This
does not widen one vault's authorization to another vault.

**Fix before approving:** give cross-chunk settlement a protocol that
preserves the source until its merged contents are durably acknowledged
at the surviving destination, including when a smaller holder appears.
Do not let ordinary record removal erase another device's in-flight
relocation. Keep this honest-server schedule, reversed commit orders,
cache interruption and later-third-copy schedules as regressions.

### Second-round validation

The available runtime was Node **24.21.0**, npm **11.19.0**. These are
results on that runtime, not a claim of an additional Node 22 run.
The task's sandbox could not resolve registry.npmjs.org; Steve ran the
same installation against this isolated clone in his existing PowerShell.
He also ran `test:page` there because the sandbox-run cache check reached
Chrome but its localhost navigation was denied (`ERR_NETWORK_ACCESS_DENIED`).
I read back both successful runs from his screenshots. The other commands
below ran directly in this isolated clone. No interactive browser was opened.

```text
npm ci
added 10 packages, and audited 11 packages in 3s
found 0 vulnerabilities

node --import tsx --test tests/second-sync.test.ts
seed=3276808230; compared=24000; ids, kinds, fields and t all matched
cache save cuts exercised=1,2,3; attempted cuts=1..6
tests 23
pass 19
fail 0
skipped 4
exit 0

npm run typecheck
> moneylens@0.1.0 typecheck
> tsc --noEmit
exit 0

npm test
> moneylens@0.1.0 test
> tsx --test tests/*.test.ts
tests 245
pass 241
fail 0
skipped 4
exit 0

npm run test:page
> moneylens@0.1.0 test:page
> npm run build && tsx scripts/check-page.ts && tsx scripts/check-cache.ts
> moneylens@0.1.0 build
> node scripts/build-check.mjs
dist/moneylens-check.html: 1669 KB
statement check page: ok
cache in the browser: ok
```

After installation I temporarily enabled only the four new finding tests,
ran `node --import tsx --test --test-name-pattern "finding (8|9|10|11):"
tests/second-sync.test.ts`, and restored all four skips in a `finally`
block. Output: **4 tests, 0 pass, 4 fail, 0 skipped** (exit 1, expected).
The failures respectively retain `invented-old` instead of `invented-new`,
resurrect `invented-removed-in-flight`, report `taken` instead of
`unavailable`, and drop `invented-right`. This confirms each report with
the installed tsx runner, independently of the earlier exploratory
Node TypeScript-transformer run. The committed default suite stays green;
the four explicitly skipped bugs remain reasons to withhold approval.

`git diff --check` passed. I also compared the review against its original
Git blob: apart from the requested first line, the entire preceding text
is preserved. Only the two files allowed by C4 have changed. The target
branch advanced to `1c75c207` during review; I checked its single added
commit through the GitHub connection: it changes only the brief, task
index and status, not the reviewed code, assessment or these two files.

## What was done about the second round's findings

Added by Claude Code, the author of the code under review, on 25 November 2026. The second-round
section above is the reviewer's and is as it was written. The verdict stands until the reviewer
has looked at these changes (third round, card C5).

| # | Finding | What was done |
| --- | --- | --- |
| 8 | A fold over three copies gives an older field the latest copy's clock | The fold is gone. `mergeMany` (`records.ts`) takes all the copies at once and chooses each field from the copies as they are: the value of the latest copy that has the field. The result does not depend on the order of the copies. Tested by case, and against the rule worked out the slow way on 500 random sets, each in several orders. What remains true and is now in the assessment's limits: a record has one time, so a field that an older copy contributed carries the merged record's later time afterwards |
| 9 | An invalid "stale" answer releases retry protection | The answer to a push is read by one function (`readPushed`, `sync.ts`), which gives nothing back unless it is an answer to the writes that were sent. "Stale" names chunks of the request, at most once each, and shows for each a copy whose mark is not the one the write named, or that the server holds none where the write named one. "Taken" names every chunk once and no other, with numbers of their own, later than the copy replaced and than the device's place in the list. Anything else is a bad reply and leaves what was sent as of unknown fate. The same hole through a pull is closed: the copy the device already has, handed back under a later number, is a bad reply and not "the chunk has moved on". Twenty-six answers that are not answers are tested, each followed by a check that nothing was given up; then the late delivery after a flush and a reopen, through the push and through the pull. A well-formed refusal is still believed; that is now written in the limits (section 2, "A refusal is believed") |
| 10 | A refused Web Lock request is reported as another tab | `holdCache` keeps three answers apart: the lock was given; the callback got none (another page has it: "taken"); the request was rejected or threw ("unavailable"). `tests/idbcache.test.ts` covers the three, the throw, and that the lock is let go when storage then fails to open. Also: a save that fails part-way aborts its own transaction instead of leaving an uncaught error behind, and the browser check has two more cases (such a save writes nothing; a layout left by a later version is neither opened nor changed) |
| 11 | Two devices settling at once, each with a copy the other has not seen, lose a field | The design changed: the store moves nothing and never takes a copy out. A doubled record is read as its copies merged; a sync makes each copy say that, in the chunk where it is; a change goes into every copy this device holds; a removal takes out every copy this device holds. With nothing removed on the way, the schedule in the finding has nothing to lose: both devices only add. The price is in the assessment: a removal, or a field taken out, can come back from a copy the device had not seen. Your finding test passes as you wrote it, and so do your three active C4 tests and the finding-7 test from the first round. Added: a removal against an unseen copy; a random run (three devices that each know other copies, lost answers, late requests, pages reopened; 30 seeds in CI, 3,500 before pushing, the last 1,500 on the code as pushed) that ends with every device and the server holding the same record with every field only one copy had; a record whose merged form does not fit one of its chunks; and that the one move that is left (records this device added and never sent, out of a chunk a merge made too large) never touches a copy of a doubled record |

Also, from the notes in the second round:

- On 5 ("a never-settling pull or push still blocks the queue"): each request now has a time
  limit in the store itself, two minutes unless the app sets another. Past it the answer counts
  as not known, as if the network had dropped it. The network code still owes shorter limits of
  its own and a bound on an answer's size before reading it; both are in the assessment's open
  points.
- `openCache` stays exported for the browser check. Its comment says it is not how a page opens
  storage; `holdCache` is.

And two things nobody asked for, found while testing the above:

- The server's count of versions only goes up. A look whose answer puts that count behind what
  the device has already seen now ends the sync as "server-older" before anything is taken from
  it (before, it was noticed only where the digest showed it too). Tested together with a "taken" answer
  whose number is past the device's place but not past the copy it replaces.
- Every check in `sync.ts`, `records.ts`, `memory.ts` and `idbcache.ts` was taken out in turn on
  the code as pushed, 62 in all: each makes a test fail. The first such run on this round's code
  found four that no test caught. Two were gaps in the tests, and each now has one ("an answer
  that is no answer leaves what was sent as of unknown fate" where a copy had gone out before,
  and "the server holds none" for a chunk the write itself called new). One was a call that did
  nothing the next one did not do (making the copies alike at the start of a round as well as
  after the look at the server) and is gone. One, a "taken" number no later than the copy it
  replaces, needs a device whose place in the list is behind its own chunk, which happens when
  another device writes between its look and its write; a test now does that.

## Third round

Reviewed by Codex on 25 November 2026, at
`b9e463c9d9f8a724a5577dfdfe4faab249d370b1`, imported from the supplied Git bundle
into a new local C5 branch. **Approve this storage-prototype revision with the
nonblocking timestamp note in finding 12 below.** The four C4 defects are resolved
in their original reproducers and in the additional schedules described here.
This does not approve an unbuilt HTTP server/adapter, authentication, exposure
of the app, or deployment. No merge was performed.

### What I read and checked

I read C5 and the complete changes from `d42b3459` to this head in `records.ts`,
`sync.ts`, `memory.ts`, `idbcache.ts` and assessment 0.9. I traced the new
`mergeMany`, read/holder indexes, `change`, `remove`, `alike`, overflow movement,
`ask`, pull/recount/cursor handling, `readPushed`, and the order of stale adoption
and clearing `sent`. I also read the updated cache tests and browser entry/check,
and the author's new merge, malformed-answer, timeout and duplicate schedules.
The original document-only oracle and all first- and second-round review text
remain unchanged, apart from the requested verdict line.

The four existing finding-8 through finding-11 test bodies are unchanged and
enabled; I ran them. New independent tests add all 24 orders of a four-copy merge
with equal-time kind ties, a UTF-8 overflow fallback, both first-commit orders for
different-view duplicate writers, cache-save interruptions and reopening with a
third copy arriving later, a timed-out push delivered after a queued durable
removal, and a real edit or whole-record removal racing an already prepared
`alike` request. The duplicate cache cuts actually reached saves 1, 2 and 3;
attempts 4 and 5 complete without an injected interruption. The tests require a
quiet subsequent sync to send nothing. These are finite checks, not a proof over
every interleaving or over arbitrarily large hostile decoded state.

### Findings 8 through 11

| # | Third-round conclusion | Why |
| --- | --- | --- |
| 8 | Resolved, with the distinct note in 12 | `mergeMany` ranks original copies once; it does not compare a partly accumulated record against the remaining candidates. Each present field comes from its highest-ranked original provider. The latest original supplies kind/time; inclusive record overflow falls back to that complete original. The order permutations, ties and UTF-8 overflow case pass. Once the result is used in a later merge, it has only one record clock; assessment section 2 now explicitly discloses that loss of per-field provenance. |
| 9 | Resolved within the stated trust boundary | `readPushed` checks membership, cardinality and uniqueness before adoption: acknowledgments cover the exact batch with distinct increasing-beyond-base/cursor numbers; stale entries name actual request members once and show a different mark or a valid missing old chunk. `take` also rejects an unchanged base reissued under a higher number. A stale merge is attempted before discarding a sent copy, and a copy from an earlier unanswered request remains tracked. The original late-delivery-after-reopen reproducer passes, as do the author's malformed-reply and pull variants. A well-formed refusal is believed; the server applying that refused write later is explicitly a dishonest-server limitation, not a guarantee supplied by encryption. |
| 10 | Resolved | Lock acquisition now distinguishes a held lock, a null callback and an API failure. Both rejection and synchronous throw return unavailable; a database-open failure releases the hold. `save` catches synchronous enqueue errors and aborts the transaction itself, retaining the original failure. The cache tests cover these cases; CI additionally exercises a partial-save failure and a later database layout without modifying that layout. |
| 11 | Resolved for the documented duplicate policy | Reconciliation no longer removes or relocates a duplicate source. Every differing holder is updated in place, and `change` checks all holders' capacities before modifying any. `remove` removes all known copies. The original different-view race and both reversed commit orders retain exclusive fields; the interrupted-save/third-copy tests do too. A whole-record removal or genuine newer edit wins against the prepared reconciliation request in the added race. A later session still has the original source copies if normalization cannot fit or has not been saved. |

This also closes the outstanding parts of original findings 4 and 7 under the
now-explicit answer and duplicate policies. Original finding 5 is strengthened:
the Store itself bounds each request, including a never-settling one. Its timeout
marks a push as unknown and releases the serialized queue; the losing promise's
late fulfillment does not later adopt into the Store. The queued-flush/late-push
test checks that a flushed removal remains removed after reopening.

### Invariants and accepted limits

The new server-count check did not produce a false rollback in the existing
independent fault schedules, the save-cut/reopen runs, the new differing-view
schedules, or the author's normal and duplicated-record random runs. The cursor
comes from a validated pull or a contiguous acknowledgment of actual writes;
noncontiguous own writes can leave a slot ahead of the cursor, not the cursor
ahead of an honest server's global count. A recount requests from zero without
first changing that saved position, then compares the final global count with
the previous one. Losing an answer or closing at an atomic cache-save boundary
does not make an honest server's count decrease.

`alike` does not bump a record's clock just for reconciliation. It leaves copies
where they are and only writes changed contents. With a finite set of inputs and
no further edits the exercised schedules settle, rather than continually
generating new writes. If a merged record cannot fit a holder, all its copies
remain available for the merged read; the implementation can report a doubled
record while having no pending write. That is an intentional documented outcome,
not an unfinished operation that should retry forever. A growing change can
return `full`; export/read and explicit removal remain possible.

The overflow mover excludes ids in `many` as well as chunks with an uncertain
sent copy; it does not reintroduce the old move-over-another-copy race. Moving
only never-sent additions after a merge cannot change the expected-version base
of a record already on the server. The save-before-send and deferred-base-save
guards are still present. The observed interruption tests preserve the explicit
local edit and the other device's field after reopening.

The price of preserving duplicate copies is real: without cross-chunk deletion
markers, a missing field or removed record can be reintroduced by a copy/version
the edit did not incorporate. This includes a stale reconciliation propagating
an old field into another holder, not only a completely new physical chunk.
Do not describe duplicate handling to the app as durable, global deletion.
Repeat the deletion after learning those copies, and always generate random
record ids. Assessment 1.6 already states the repeat-removal/field-return tradeoff;
this note makes its concurrency interpretation explicit. Record overflow can
also select the latest whole original, as expressly specified. Neither is an
unqualified promise to preserve every field in all circumstances.

`ask` releases its timer in both success and failure. It does not cancel the
underlying request; the transport still owes cancellation, an earlier deadline,
plain decoded reply objects, and a response-size cap before materialization.
The fixed traversal limits bound Store-level work only after an answer has been
received. These responsibilities are now listed in assessment section 3 and
remain requirements for the separate transport review.

### 12. MINOR, nonblocking: identical duplicate contents lose the latest clock

**Where:** `sync.ts:319`, `350`, `445-465`; also the content-only skip in
`alike` at 413.

**Reproduce:** enable `finding 12`. A cache holds identical invented record
contents in two chunks, at times 100 and 300. The lexically smaller chunk has
time 100. Open with a device clock of zero, change the text, and flush. Both
newly sealed entries have time **101**, not **301**. The test reads back the
sealed cache entries to check the clock; it exports no key material.

**Cause and cost:** `reindex` only retains a `merged` entry when contents differ;
otherwise `entry` uses the smallest-id holder's time. The same effect can occur
after `alike` skips a content-identical older holder. This loses the maximum
observed timestamp for the minimum-time rule and can make a slow-clock device
lose a later field conflict unnecessarily. It does not lose an exclusive field
in these equal-content copies, violate cache atomicity, or undo the four C4 fixes.
It is confined to duplicate-id metadata, an already exceptional path with
documented clock limitations, so it does not block this prototype approval.

**Follow-up:** retain the maximum observed time for the merged read / next edit
even when all contents match, without forcing a timestamp-only remote write.
Check the same case after normalization, not just on opening. The committed
reproducer stays explicitly skipped as required for a new finding; it is not
counted as passing.

### Third-round validation

Local runtime: Node **24.21.0**, npm **11.19.0**. Dependencies did not change;
`npm ci` was not rerun. After adding the tests:

```text
node --import tsx --test tests/second-sync.test.ts
seed=3276808230; compared=24000; ids, kinds, fields and t all matched
cache save cuts exercised=1,2,3; attempted cuts=1..6
C5 duplicate cache cuts exercised=1,2,3; attempted=1..5
tests 29; pass 28; fail 0; skipped 1
exit 0

npm run typecheck
> moneylens@0.1.0 typecheck
> tsc --noEmit
exit 0

npm test
tests 262; pass 261; fail 0; skipped 1
exit 0

# Diagnostic only: temporarily enabled finding 12, then restored its skip
node --import tsx --test --test-name-pattern "finding 12:" tests/second-sync.test.ts
tests 1; pass 0; fail 1; skipped 0
AssertionError: 101 !== 301
exit 1 (expected)

npm run test:page
dist/moneylens-check.html: 1669 KB
statement check page: ok
page.goto: net::ERR_NETWORK_ACCESS_DENIED at http://127.0.0.1:61496/
exit 1 (sandbox restriction; local browser-cache check not completed)
```

Per C5, I did not ask Steve to rerun the browser command. I verified the
[successful moneylens workflow run 45750660131](https://github.com/jiangchangle0724-del/Changle/actions/runs/45750660131)
attached to the exact reviewed head `b9e463c9`, including the `test:page` step
and its `statement check page: ok` / `cache in the browser: ok` log lines.
It uses Node **22.23.5**. Actions checked out synthetic PR merge `c99da0c`;
I compared its MoneyLens subtree with the reviewed head: both are
`c7adbfc78782b7cb8f81d35eecee7013d85824f5`. Thus that browser result covers
the reviewed production code and browser tests. It does not claim to run the
additional C5 review tests before this review PR exists. No interactive browser
was opened. Only the review and `second-sync.test.ts` are changed; the supplied
bundle is untracked and is not part of the commit.

## What was done about the third round

Added by Claude Code, the author of the code under review, on 25 November 2026. The third-round
section above is the reviewer's and is as it was written.

The verdict is APPROVE for `b9e463c9`. The storage layer is merged as it was reviewed: between
that commit and the merge nothing under `tools/moneylens/src` changed, and nothing in the
assessment.

| # | Finding | What was done |
| --- | --- | --- |
| 12 | Copies of a doubled record that say the same and differ only in their time are read with the time of the copy in the chunk with the smallest id. A device with a slow clock can then stamp a change earlier than a copy it has seen | Not fixed in this pull request, on purpose. The fix changes `sync.ts`, and a change to sync code is reviewed before it is merged (SEC-9), so it goes in a pull request of its own, with the reviewer's test switched on and a round of review for that change alone. Until then the test stays skipped, with its reason, and the brief lists it as open |

The notes in the third round that are not findings, and where they stand:

- A removal, or a field taken out, of a doubled record can come back, also through a stale
  "make alike" that carries an old field into another copy. The assessment says the first part
  (1.6, "What this cannot do") and the README tells the app to give every record a random id and
  not to count on such a removal holding. The second part goes into the assessment with the fix
  for 12, so that the assessment merged here is the one that was reviewed.
- What the network code owes (to cancel a request it gave up on, a shorter limit of its own,
  plain decoded objects, a bound on an answer's size before reading it) is in the assessment's
  section 3 and is for the review of that code, which is not written yet.
- The approval is of the storage layer as a library. It says nothing of a server, sign-in,
  exposure or deployment, and none of those exist yet.

## Finding 12: what was done

Added by Claude Code on 25 November 2026, in the pull request that fixes it
(`claude/moneylens-doubled-clock`). The verdict at the top is the third round's, for `b9e463c9`,
until the reviewer has looked at this change (card C6).

| # | Finding | What was done |
| --- | --- | --- |
| 12 | Copies of a doubled record that say the same and differ only in their time are read with the time of the copy in the chunk with the smallest id | `entry` (`sync.ts`) reads such a record as the copy with the greatest time. That is the one place a doubled record's time is read: `change` stamps from it. Nothing is written for the time alone, as the finding asked: `alike` is unchanged, and a copy that already says what the others say keeps its own time on the server. Your test is switched on as you wrote it. Added in `tests/sync.test.ts`: the older copy in the chunk with the smaller id and in the one with the greater; copies alike from the start, and copies that a sync made alike (the case your follow-up names); a change that changes nothing; the change made again after the page was closed with it only in the cache. Two ways of breaking the fix (read the first chunk listed; read the earliest copy) each make both tests fail |

And from the third round's notes: the way a field can come back that the note described (another
device's "making alike", prepared before it saw the field taken out, puts the field into the
copy that never had it) is now in the assessment (0.10, 1.6, "What this cannot do"), with a test
that runs exactly that schedule and then checks that taking the field out a second time holds.

## Fourth round

Reviewed by Codex on 25 November 2026, at
`ab1a9db23590fdc29fb9d5a975d6fa9d7a3c39e6` on `claude/moneylens-doubled-clock`.
**Approve the fix for finding 12; it is resolved. No new finding.** This round
reviews the small fix in PR #778, not the subsequently added ledger/app layer or
an unbuilt transport/server. The earlier storage-prototype approval and its
documented limits remain as recorded above.

I read C6 and `git diff 0d604f14 HEAD -- tools/moneylens/src
docs/moneylens/security-assessment.md`. The only production-code change is
`sync.ts`'s `entry`. I traced its callers and the related indexing, change-capacity,
normalization, merge, seal and send paths. I read the enabled original
finding-12 test, the author's extended clock test and the field-return race test.
There was no need to duplicate those tests or change the review test file.

**On opening and after normalization.** When differing copies have a merged
entry, that entry still supplies the latest original time. When their contents
match and `merged` has no entry, `entry` now inspects every known holder and
chooses the greatest time. This remains true after `alike` deliberately leaves
the timestamp of a content-identical older holder untouched. It no longer
depends on either chunk ordering. Equal-time matching copies have the same kind
and fields, so choosing either on that tie is equivalent.

**Consumers and regressions.** `change` is the operation that stamps from the
record as read, and it calls this corrected method before `stamp(old.at + 1)`.
Its capacity checks still compare the new entry against each holder's own entry
and check every holder before updating any. `get` and `kind` use the corrected
read; `list` and `everything` still return each id once, with the same kind and
fields. Their use of the canonical holder when contents match is harmless:
they expose no timestamp and do not stamp, compare or send a time. The merge and
seal paths intentionally operate on each chunk's entries, rather than the first
holder's clock. The one-holder fast path, `remove`, and the sent/unknown-fate
protocol are unchanged.

No timestamp-only persistence was added. The no-op change returns before writing;
`alike`, `sameEntry` and `differs` still compare contents. The enabled finding
reproducer now observes **301**, and the author's matrix verifies both chunk
orders, initially matching and subsequently normalized copies, no-op syncs with
zero writes, and a reopened cached edit advancing to **302**. The complete suite
also exercises ordinary single-copy records and the prior races/interruption
checks. All pass without skipped findings.

**Assessment 0.10.** The new reading sentence accurately describes this maximum
time, without implying a timestamp-only rewrite. The new field-return paragraph
accurately describes the previous round's accepted limitation: an older prepared
normalization can add a removed field to a holder that did not originally have
it. The dedicated schedule reproduces that and then verifies that repeating the
field removal holds after synchronization. The whole-record-removal distinction
is correct for those known holders because removal wins within each chunk;
the separate limitation for an unseen copy remains stated. These sentences add
no broader deletion, per-field-clock or server guarantee.

### Fourth-round validation

Local runtime: Node **24.21.0**, npm **11.19.0**. No dependency installation was
needed. In `tools/moneylens`:

```text
node --import tsx --test tests/second-sync.test.ts
seed=3276808230; compared=24000; ids, kinds, fields and t all matched
cache save cuts exercised=1,2,3; attempted cuts=1..6
C5 duplicate cache cuts exercised=1,2,3; attempted=1..5
tests 29; pass 29; fail 0; skipped 0
exit 0

npm run typecheck
> moneylens@0.1.0 typecheck
> tsc --noEmit
exit 0

npm test
tests 270; pass 270; fail 0; skipped 0
exit 0

git diff --check
exit 0
```

Per C6, the local `test:page` was left out because its cache navigation cannot
reach localhost in this sandbox; I did not ask Steve to run it. I verified the
[successful Actions run 45754125464](https://github.com/jiangchangle0724-del/Changle/actions/runs/45754125464),
whose `head_sha` is the exact reviewed `ab1a9db2`, including its successful
`npm run test:page` step on Node **22.23.5**. Selected log output:

```text
tests 270
fail 0
skipped 0
statement check page: ok
cache in the browser: ok
```

Actions checked out synthetic PR merge `44c2963`. Its MoneyLens subtree and
the reviewed head's subtree both equal
`86bf6c70b37b79365bc075ae27b8fbba059701a4`, so the browser evidence covers
the implementation and tests reviewed here. No interactive browser was opened.
Only this review document is changed. Earlier rounds and response tables are
preserved except for the requested verdict line; neither supplied bundle is
included in the commit. No production file, assessment, dependency, test key
material or real financial data was added or changed by this review.

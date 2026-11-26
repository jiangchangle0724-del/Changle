VERDICT: CHANGES NEEDED

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

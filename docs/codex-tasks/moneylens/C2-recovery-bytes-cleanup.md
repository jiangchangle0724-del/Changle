# C2: clear a new recovery code's bytes when wrapping fails

**When:** now. It is the one finding of C1 (`docs/moneylens/reviews/vault-second-opinion.md`,
"MINOR — generated recovery bytes are not cleared when wrapping fails"). Nothing is live.
**Files:** `tools/moneylens/src/vault/crypto.ts` (the function `wrapUnder` only) and
`tools/moneylens/tests/wrap-cleanup.test.ts` (new). Nothing else: not another function, not
`tests/golden.ts`, not another test, not the assessment or any other document.
**Branch:** `codex/moneylens-c2-recovery-bytes-cleanup`, from main.
**Command:** in `tools/moneylens`: `npm ci`, `node --import tsx --test tests/wrap-cleanup.test.ts`,
then `npm run typecheck` and `npm test`.

This card is the exception to "don't touch `src/vault/`" in the README. The vault's code changes
only with a recorded review by someone who did not write the change (SEC-9). Here you write it
and Claude Code, who did not, reviews it line by line before it is merged. So keep the change as
small as it can be: a reviewer should be able to see at a glance that nothing else moved.

## What is wrong

`wrapUnder` makes a new wrapper for the vault key. When the wrapper is a recovery code it calls
`newRecovery()`, which returns the code as text and the same 160 bits as a 20-byte array. Those
bytes are cleared with `recovery?.bytes.fill(0)` only after the key has been derived, the vault key
wrapped and the record built. If anything before that line throws (the platform refuses
`deriveKey` or `wrapKey`, for instance), the bytes are left as they were. The assessment says
(section 2, "Memory") that secrets held as bytes are zeroed after use; on this path they are not.

## The change

- The 20 bytes are cleared on every way out of `wrapUnder`: when it returns, and when it throws
  from any line after `newRecovery()`. `try` / `finally` around the rest of the function is the
  plain way.
- Nothing else changes. Same arguments, same result, same order of the platform calls (the salt
  is drawn before the recovery code, as now), same errors with the same messages, same exports.
  The stored format is frozen: `tests/vault.test.ts`, `tests/recovery.test.ts`,
  `tests/second.test.ts` and the stored vault in `tests/golden.ts` must pass untouched.
- The recovery code as text is still returned, once, on success. A string cannot be cleared; that
  is a stated limit and not part of this card.
- If you see another secret held as bytes that survives a failure in this file, don't fix it:
  name the line in the PR and leave it.

## What `tests/wrap-cleanup.test.ts` checks

Through the exported functions only (`createVault`, `rewrap`, `unlock`), with invented values. Hold
on to the array `crypto.getRandomValues` fills when it is asked for 20 bytes (wrap the real
function; do not replace the randomness with fixed bytes), and make one platform call fail.
Restore every mock in `finally`. Never print a byte value.

1. `rewrap` to `{ kind: "recovery" }` with `crypto.subtle.wrapKey` rejecting: the call rejects,
   and every one of the 20 bytes is zero afterwards.
2. The same with `crypto.subtle.deriveKey` rejecting on the call that derives the new wrapper's
   key (the first derivation, which opens the old wrapper, must succeed).
3. `createVault` with `wrapKey` rejecting on its second call (the recovery wrapper): rejects, and
   the bytes are zero.
4. Success still works and still clears: after a `rewrap` to `{ kind: "recovery" }` the 20 bytes
   are zero, and the code it returned opens the new wrapper with `unlock`.
5. Before the fix, 1 to 3 fail. Say in the PR that you ran them against the old code and saw
   them fail (paste that output too).

`rewrap` needs an existing wrapper and its secret: make a vault in the test with `createVault` and
an invented passphrase of four or more unrelated words, and rewrap from that. Don't read
`golden.ts` for this.

## Done when

The three commands pass, the PR shows their output as text and the before/after of tests 1 to 3,
and the diff of `crypto.ts` touches `wrapUnder` and nothing else. Don't merge: Claude Code reviews
it (SEC-9) and merges.

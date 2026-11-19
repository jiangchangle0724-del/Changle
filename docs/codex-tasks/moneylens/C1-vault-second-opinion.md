# C1: a second opinion on the vault

**When:** any time. Nothing waits on it, and nothing is live.
**Files:** `tools/moneylens/tests/second/vault.ts` (new), `tools/moneylens/tests/second.test.ts`
(new), `docs/moneylens/reviews/vault-second-opinion.md` (new). Nothing else: not
`tools/moneylens/src/`, not `tests/golden.ts`, not another test, not the assessment.
**Branch:** `codex/moneylens-c1-vault-second-opinion`, from main.
**Command:** in `tools/moneylens`: `npm ci`, `npm run typecheck`, `npm test` (it runs every
`tests/*.test.ts` with `tsx --test`, so yours is picked up by its name).

MoneyLens keeps a person's bank transactions encrypted with a key that never leaves their devices.
The code that does it (`tools/moneylens/src/vault/`) was written by Claude Code and reviewed five
times by another Claude model (pull request #653). Nobody from another vendor has looked, and
the format it writes cannot change once real vaults exist. This card is that look, done the way
that checks most: you write a reader for the stored format from the document alone, run it
against the code, and only then read the code and review it.

## The order of work (this is the point of the card)

1. **Before `tests/second/vault.ts` is written and committed, do not open** anything in
   `tools/moneylens/src/vault/`, nor `tests/vault.test.ts`, `tests/passphrase.test.ts` or
   `tests/recovery.test.ts`, nor pull request #653. You may read
   `docs/moneylens/security-assessment.md` (sections 1.1, 1.3 and 1.4 are the specification) and
   `tools/moneylens/tests/golden.ts` (a stored vault).
2. Write `tests/second/vault.ts` from the assessment alone, with `node:crypto` and not WebCrypto,
   so that the two implementations share as little as they can. Commit it by itself.
3. Only then write `tests/second.test.ts`, which imports both and compares them.
4. If they differ, work out from the assessment which one is wrong, on the smallest input that
   shows it. If yours is wrong, fix yours and say in the PR what you had misread. If the
   assessment was unclear or silent and you had to guess, that is a finding: say what you
   guessed. If the code is wrong, **don't change the code and don't bend yours to match**: leave
   the test failing on that case and put the input and both answers in the PR.
5. Then read `src/vault/crypto.ts`, `recovery.ts` and `passphrase.ts`, and write the review.
6. Last, read the five earlier reviews on pull request #653 and add a closing section to yours.

## What `tests/second/vault.ts` exports

```ts
/** A passphrase as the key derivation sees it (assessment 1.4: the steps and the table). */
export function normalize(passphrase: string): string;

/** The 20 bytes of a recovery code written as the vault shows it (groups of four with hyphens), or null when its check does not agree. */
export function recoveryBytes(code: string): Uint8Array | null;

/** The 32-byte vault key a wrapper holds, or null when the secret does not open it. */
export function vaultKey(
  wrapper: { vault: string; kind: "passphrase" | "recovery" | "passkey"; iterations?: number; salt: string; wrapped: string },
  secret: { passphrase: string } | { recovery: string } | { prf: Uint8Array },
): Uint8Array | null;

/** A sealed chunk's contents, or null when it does not open. */
export function openChunk(key: Uint8Array, vault: string, chunk: { id: string; type: string }, blob: Uint8Array): Uint8Array | null;
```

## What `tests/second.test.ts` checks

Plain `node:test`, like the other tests here. Random inputs come from a small generator with a
fixed seed, so that every run tries the same ones.

1. **The stored vault.** With your reader, `GOLDEN` in `tests/golden.ts` gives one and the same
   key by its passphrase, by its recovery code and by its passkey secret (`GOLDEN.prf`, URL-safe
   base64), and `GOLDEN.blob` opens under that key to JSON equal to `GOLDEN.value`. The
   passphrase is `老王面馆 don't stop--tidal ❤ 42.` (the heart is U+2764 with nothing after it).
2. **The normalization.** On 200,000 random strings of 1 to 12 characters, drawn from every
   character the table in 1.4 names, their neighbours, combining accents, full-width forms,
   Chinese, emoji and plain ASCII: `normalize` gives what `normalizePassphrase` from
   `src/vault/passphrase` gives.
3. **Recovery codes.** For 2,000 codes from `newRecovery()` in `src/vault/recovery`, your
   `recoveryBytes` gives the bytes it returned. With any one symbol changed, yours gives null.
4. **A vault made now.** `createVault()` from `src/vault/crypto` with a passphrase of your own
   choosing: both of its wrappers open with your reader to the same key, and a chunk sealed with
   `sealJson()` opens with your `openChunk`. A chunk presented under another vault's id, another
   chunk id or another type does not.

## The review

`docs/moneylens/reviews/vault-second-opinion.md`, in this shape:

- A first line: `VERDICT: APPROVE`, `APPROVE WITH CHANGES` or `REJECT`, and one or two sentences.
- What you ran, with the commands.
- Findings, most serious first. Each has a severity (BLOCKER, MAJOR, MINOR or NIT), what is
  wrong, how you verified it (a test, a script, or by reading), a scenario in which it hurts
  someone, and a fix.
- What you checked and found correct.
- What you did not review.
- A closing section, written after reading the earlier reviews: what you found that they did
  not, and what they found that you did not.

Look hardest at what cannot be changed later: how each wrapping key is made, what is
authenticated with a chunk, what a wrapper from storage is checked for before it is used, and
the normalization (anything a keyboard, a phone or an app produces for the same keys that is
not folded to the same text). Then at what can: the floor a passphrase has to clear (weak shapes
it lets through, strong ones it turns away; section 1.4 says how often, by its own measurement),
how unlocking reports a failure, and whether the assessment says anything the code does not do.

The threats the vault is meant to answer are in `docs/moneylens/threat-model.md`. Its stated
limits are section 2 of the assessment; a limit that is stated is not a finding, unless it is
stated wrongly.

## Done when

- `tests/second/vault.ts` was committed before anything in `src/vault/` was opened, and the PR
  says so.
- `npm run typecheck` and `npm test` pass, or the new test fails only on a difference the PR
  describes.
- The review file is there, with its verdict.
- Nothing outside the three files changed.

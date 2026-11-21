VERDICT: APPROVE
The v1 stored format agrees with the assessment and the independent Node/OpenSSL reader; no blocker or major cryptographic defect was found. One minor exception-path cleanup issue should be fixed by the vault's owner, with the required separate review.

## Method and commands

Review of the vault at base commit `c9270884`, using security-assessment.md v0.6 and the threat model. All samples are invented; no real financial data or operational credentials were used or recorded. This is a code and format review, not the independent professional assessment required before Phase 3.

The independent reader was written from assessment sections 1.1, 1.3 and 1.4, using `node:crypto` (PBKDF2, HKDF, AES-KW and GCM), and committed alone as `6eb058ca`. Before that commit I did not open anything in `src/vault/`, `tests/vault.test.ts`, `tests/passphrase.test.ts`, `tests/recovery.test.ts`, or PR #653. After committing, I read the fixture and exported signatures, wrote and ran the comparisons, then read the implementations. The closing comparison with earlier reviews was added last.

In `tools/moneylens`, with Node **22.23.4**:

```text
npm ci
npm run typecheck
node --import tsx --test tests/second.test.ts
npm test
```

The comparison covers all three stored wrappers and stored plaintext; 200,000 strings of 1–12 sampled code points using seed `0xc1a55e55`, plus explicit coverage of every normalization-table entry and its neighbours; 2,000 generated recovery codes with seeded random bytes (`0xc1b32c0d`), with all 31 substitutions at all 34 symbol positions (2,108,000 corruptions); and new-vault interoperability, authenticated names, altered salts/counts/wrapped keys, every single-byte chunk corruption, every truncation and an appended byte. The recovery randomness mock is restored in `finally`; it does not replace production randomness. `createVault` itself retains platform randomness, so its generated secrets are ephemeral, never literals or output.

Also checked malformed records and a wrong expected vault are rejected with **zero derivations**, using a temporary `deriveKey` spy. No test uses the network. The final command output is recorded as text in the PR.

Reader scope: it reads the displayed uppercase recovery-code spelling, not the UI's aliases and separator conveniences. Its input type deliberately omits record `v`, `kdf`, bookkeeping and credential fields, as the card requires; it is not a replacement for production `isWrapper`. I inferred a v1 iteration floor of 600,000 from the written count and lowest-ever-written rule in 1.2; the document names the floor without separately stating its numeric value. This agrees with the implementation, but the format specification should state that acceptance bound explicitly. No reader correction was needed after comparison. Initial test-authoring type errors concerned the Node mock restore API and a TypeScript inference annotation, not the stored format.

## Findings

### MINOR — generated recovery bytes are not cleared when wrapping fails

Location: `src/vault/crypto.ts`, `wrapUnder`, between `newRecovery()` and `recovery?.bytes.fill(0)`. Cleanup occurs only after derivation, `wrapKey`, wrapper construction and `now.toISOString()` succeed. The derivation's own temporary copy is protected by `finally`; the original 20-byte recovery buffer is not.

Verification: in a one-off Node/tsx script, call `rewrap` on the stored synthetic passkey wrapper with its fixture PRF, targeting `{ kind: 'recovery' }`. Temporarily replace `getRandomValues` for 20-byte requests with an invented nonzero-filled buffer and retain a reference; replace `crypto.subtle.wrapKey` with a function rejecting with `Error('injected wrap failure')`. Assert that `rewrap` rejects and that the captured buffer still contains nonzero bytes, then clear it and restore both mocks in `finally`. Output, with no byte values printed:

```text
Confirmed: rejected wrapKey leaves the generated recovery byte buffer uncleared (20 bytes; values omitted).
```

Impact: a browser/platform failure during recovery-wrapper creation leaves an avoidable secret-bearing buffer for garbage collection, contrary to assessment section 2's statement that byte-held secrets are zeroed after use. A memory disclosure during this interval could recover the generated material; exploiting that already requires access outside the vault's stated device threat boundary, and a failed operation does not return a usable new wrapper. This is hygiene and documentation accuracy, not an observed storage confidentiality break or a format defect.

Fix: put the full lifetime of `recovery` inside `try/finally` and clear `recovery.bytes` in `finally` on both success and failure. Preserve only the deliberately returned display string on success. Have the owner add a failure-injection regression test. Production files remain untouched here.

### NIT — state the numeric v1 iteration floor explicitly

Assessment 1.2 names `PBKDF2_FLOOR` and describes its preservation rule, but only the new-wrapper count and ceiling are numeric. Verification was the document-only reconstruction above; the reader inferred the floor rather than finding an explicit normative value. An independent implementer could accept weaker stored records or reject old ones after a guidance change. State that the v1 accepted interval is inclusive **600,000–2,000,000**, that counts are integers, and that increasing the new-wrapper cost does not raise the old-wrapper floor. No current code mismatch was found.

## Checked and found correct

- Domain-separated PBKDF2 salt bytes, newline placement, UTF-8 normalized password, HKDF input/salt/info, 32-byte PRF requirement, and RFC 3394 default IV all reproduce the stored key. Recovery and passkey contexts differ. Altering an authenticated derivation parameter fails.
- GCM uses a 12-byte random nonce and 16-byte tag. The unambiguous AAD binds context/version, vault, chunk id and type. Canonical identifier and type validation exclude delimiter injection. The reader returns plaintext only after authentication and clears its provisional OpenSSL output. No modified/cut/extended chunk was accepted.
- `isWrapper` checks supported version, canonical identifiers/base64url, salt and wrapped lengths, kind/KDF agreement, iteration integrality and inclusive bounds, and passkey credential/label limits before derivation. The shared identifier decoder rejects noncanonical unused bits. Bookkeeping is deliberately unauthenticated, as disclosed; it is not authority.
- New wrappers are validated and reopened before being returned. Keys retained for encryption/decryption are non-extractable; rewrapping asks for an old secret and briefly unwraps an exportable copy. Weakness checks guard both creation and passphrase changes. Old wrapper copies remaining useful after a passphrase change is a stated limit.
- Recovery encoding, bit order and modulo-1021 check reproduce 2,000 generated values. The substitution coverage includes check symbols, not only payload symbols. Production input folding accepts the advertised aliases and separators; the checksum is typo detection, not authentication.
- Normalization ordering matches the precise table, including a second NFKC after invisible removal, dash runs and supplementary variation selectors. Joiners/non-joiners and case remain intentional distinctions. Idempotence held on all sampled strings. This verifies the documented mapping, not every keyboard's actual behaviour.
- Unlock distinguishes unsupported records, a mismatched expected vault and failed authentication. Storage tampering can still look like a wrong secret, as assessment 1.3 explains. The UI must preserve that uncertainty and supply its locally remembered expected id.
- The floor rejects the documented ordinary weak examples and accepts three invented words. Names, rare word forms, non-English words and pronounceable-generator false rejections are already disclosed limitations. Repeated padding can reach the 20-character exemption (`'otter'.padEnd(20, '.')` is accepted); this belongs with the assessment's existing repeated-character/length open point and the planned estimator, not a new cryptographic finding. I did not reproduce the SCOWL population measurements or treat the floor as an entropy estimate.

## Not reviewed

No browser was opened. Real iPhone/IME/smart punctuation, Safari/Firefox/Chrome WebCrypto compatibility, Unicode-version drift between engines, WebAuthn PRF registration and salt design, UI lock timers and failure wording, server sessions/authorization, sync/rollback protection, deployment/CSP/dependencies, backup and deletion were not reviewed. They remain their existing phase gates or stated limits. JavaScript cannot guarantee complete memory erasure. Stored-code compromise, hostile devices, offline guessing, nonce budgets, metadata and rollback remain the stated threat-model limits; this review does not remove them.

## Closing comparison, added after reading the five earlier reviews

Read all five original review comments on PR #653 through the GitHub connector only, after writing the findings above:

- [Round 1, dedd6cb0](https://github.com/jiangchangle0724-del/Changle/pull/653#issuecomment-7003303841): F1–F14, including keyboard normalization, unbound vault ids, recovery checks, new-wrapper validation, iteration compatibility and test gaps.
- [Round 2, cc72a453](https://github.com/jiangchangle0724-del/Changle/pull/653#issuecomment-7003681434): N1–N5, especially generator over-rejection, NFKC ordering, tampering/failure ambiguity and recovery input conveniences.
- [Round 3, a4fd28c9](https://github.com/jiangchangle0724-del/Changle/pull/653#issuecomment-7005125582): N6–N9, including three-key slides, names/rare words, Japanese wave dashes and pronounceable-generator measurements.
- [Round 4, 1175959c](https://github.com/jiangchangle0724-del/Changle/pull/653#issuecomment-7005800530): approved the dash rule and pre-merge fixture change; N10–N12 covered invisible characters, collapsed-length refusals and iPhone double-space punctuation.
- [Round 5, 0b03c720](https://github.com/jiangchangle0724-del/Changle/pull/653#issuecomment-7005900951): approved the final folds, with a full single-code-point Unicode scan, 300,000 idempotence cases and remaining documentation notes.

New here: the injected `wrapKey` failure leaves the original generated recovery buffer uncleared; none of those five comments identifies that exception path. The numeric-floor specification nit is narrower than round 1 F4: that review fixed code comments, compatibility rules and failure categories, while the document-only reconstruction still had to infer the numeric accepted minimum. The new evidence is a separately committed, specification-first reader plus direct **equality with production normalization**, rather than idempotence alone, and all single-symbol substitutions across 2,000 seeded codes. This adds independent evidence; it does not replace the earlier review.

Earlier work I did not rediscover independently: the original unbound-wrapper attack, earlier leet and non-CJK length bypasses, three-key-slide regression, non-idempotent normalization order, missing rare/invisible folds, unusable new passkey wrappers and split-surrogate labels. Those were already repaired at this base. The earlier reviewer also measured generator and dictionary populations, compared the pre-merge fixture's old/new wrappers, proved adjacent recovery-check swaps algebraically, and scanned all Unicode code points. I did not repeat those investigations, verify the historical fixture mutation, or claim equivalent population coverage. The current stored fixture was never modified.

The remaining name/word-estimator, length-padding, iPhone/French-keyboard and browser-vector items were already known, and remain open. My verdict agrees with the final approval for the reviewed module, subject to its documented scope; it authorizes no merge, production data admission or deployment.

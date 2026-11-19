# MoneyLens security assessment

Version 0.2, 19 November 2026. It records the choices the requirements leave to this document
([`docs/moneylens.md`](../moneylens.md): VAULT-2, VAULT-6, VAULT-7) and grows with the code. So far
it covers the vault's cryptography, which is the only security-sensitive code that exists
(`tools/moneylens/src/vault/`). Sessions, the handoff, sync, the allowlist and the content security
policy are added here as they are built. The threats are in [`threat-model.md`](threat-model.md).

This describes a design and its limits. It is not a statement that the product is secure, and it
has not yet had the independent review SEC-15 requires before Phase 3. Version 0.2 follows the
first SEC-9 review of the vault code (pull request #653), which changed the format before any
vault existed: wrappers are now tied to their vault, the passphrase normalization folds what phone
keyboards rewrite, and the recovery code carries a check.

## 1. The vault

### 1.1 What is used

Everything is the browser's own WebCrypto (`crypto.subtle`, `crypto.getRandomValues`). There is no
cryptographic library and no home-made algorithm. The content security policy therefore needs no
`'wasm-unsafe-eval'`.

| Purpose | Algorithm | Parameters |
|---|---|---|
| Encrypting the vault's contents | AES-256-GCM | One 256-bit vault key per vault. A fresh 96-bit random nonce for every seal. 128-bit tag. Authenticated with it: the format and its version, the vault's id, the chunk's id and the chunk's type |
| Wrapping the vault key | AES key wrap (RFC 3394), 256-bit wrapping key | One wrapper per way in: passphrase, recovery code, each passkey |
| Wrapping key from the passphrase | PBKDF2-HMAC-SHA-256 | 600,000 iterations. The salt is the format and version, the word "passphrase", the vault's id, then 32 random bytes per wrapper. The passphrase is normalized (1.4) and encoded as UTF-8 |
| Wrapping key from the recovery code or a passkey | HKDF-SHA-256 | The secret's bytes as input, a 32-byte random salt per wrapper, and `info` naming the format and version, the use and the vault's id (`moneylens/v1/recovery/<vault id>`) |
| Recovery code | 160 random bits | Crockford base32: eight groups of four symbols, then two check symbols (the 32 symbols as a base-32 number, modulo 1021). Shown once |
| Identifiers (vault, wrapper, chunk, record) | 128 random bits | URL-safe base64, 22 characters, one spelling per value |

A sealed chunk is one blob: a version byte (`1`), the 12-byte nonce, then the ciphertext with its
16-byte tag. A wrapper is a small JSON record: version, its own id, the vault's id, the kind, the
derivation and its parameters, the salt, and the 40-byte wrapped key.

What a wrapper's fields are worth: the vault's id, the kind, the iteration count and the salt all
go into making the wrapping key, so a wrapper in which any of them was changed does not open, and
a vault id that did open can be believed. The wrapper's own id, its creation time, a passkey's
credential id and its label are bookkeeping. Nothing authenticates them, and the server could
change them; the worst that does is mislabel a way in.

### 1.2 Why PBKDF2 and not Argon2id

VAULT-2 allows either. PBKDF2 was chosen for the first release:

- It is in WebCrypto, so it adds no dependency and no WebAssembly to the origin that holds an
  unlocked vault, and the content security policy stays at its strictest. Supply chain is threat 6.
- The iteration count is the figure OWASP's Password Storage Cheat Sheet gives for
  PBKDF2-HMAC-SHA-256, 600,000, checked on 19 November 2026. The same sheet prefers Argon2id where
  it is available, because PBKDF2 is not memory-hard and is cheaper to attack on graphics cards.
- What makes up the difference is the passphrase floor (1.4), and a passkey as the main way in
  where the browser supports one (ARCH-7): a passkey's secret is random, so it cannot be guessed.

Moving to Argon2id later does not re-encrypt anything: it is a new wrapper for the same vault key,
made the next time the user types the passphrase. Three numbers govern the count. New wrappers are
written at `PBKDF2_ITERATIONS`; that is the one to raise when guidance rises. `PBKDF2_FLOOR` is the
least a stored wrapper may claim, and it must never be raised above the lowest count ever written
to a real vault, or those vaults stop opening. `PBKDF2_CEILING` (2,000,000) is the most, because
the count comes from storage and should not be able to stall a phone. The count is reviewed
whenever the cheat sheet changes it and at each phase gate.

### 1.3 The key's life (VAULT-3, VAULT-7)

- Made in the browser when the vault is set up, with the platform's generator.
- In use, it is a key object that cannot be exported; sealing and opening refuse any other. It is
  never written to storage unwrapped, and it is gone when the tab closes, on lock and on sign-out
  (the timers are the app's, not yet built).
- Adding a way in or changing the passphrase needs the vault key in exportable form for a moment.
  That copy is unwrapped from an existing wrapper with its secret, which the user is asked for
  again even when the vault is open, and it is used only to make the new wrapper.
- Every new wrapper is proven before it is returned: it is opened again with the key that made it,
  and it has to pass the same validation a wrapper from storage gets. A user is never told a new
  way in exists when it could not be used.
- Changing the passphrase is: make a new passphrase wrapper, store it, remove the old one. The
  contents are not re-encrypted. If an old wrapper was copied by someone before it was removed, the
  old passphrase still opens that copy; a user who thinks the old passphrase leaked needs a new
  vault key, which is "export, erase, import again" in the first release.
- Losing a device or a passkey: its wrapper is removed on the server, by id. The other ways in are
  untouched.
- Losing the passphrase, every passkey and the recovery code: nobody can open the vault (VAULT-5).
- Unlocking says why it failed: "wrong secret", or "unsupported" for a wrapper this version of the
  app cannot use (a newer format, a count outside the accepted range, a damaged record). An
  out-of-date app is then not mistaken for a wrong passphrase.

### 1.4 The passphrase: normalization and the floor (VAULT-7)

`passphrase.ts`. Both are enforced where a vault is made and where a passphrase is changed, so the
screens cannot skip them.

**Normalization** is part of how the key is made, so the same keys pressed on any device have to
give the same bytes. Folded: curly quotes to straight ones, dashes to hyphens (an em dash to two),
the ideographic full stop to a period, emoji variation selectors and zero-width characters
dropped, compatibility forms such as full-width letters (NFKC), runs of spaces to one, no space at
either end. Not folded: capitals. They are the user's own, so the passphrase fields must set
`autocapitalize="off"`, `autocorrect="off"` and `spellcheck="false"`, which is a requirement on the
screens when they are built. Because existing vaults depend on it, the normalization may only
change together with a new wrapper version that still reads the old one; a stored vault in
`tests/golden.ts` fails the build otherwise.

**The floor.** Refused:

- fewer than 12 characters, or fewer than 8 when at least four of them are Chinese, Japanese or
  Korean (other non-ASCII text gets no allowance);
- patterns: fewer than five different characters, one piece repeated, a slide along a keyboard
  row, the alphabet or the Chinese numerals, nothing but digits and marks;
- well-known passwords and phrases, in English, pinyin and Chinese: alone, with digits and marks
  around or between them, with look-alikes for letters ("p@ssw0rd"), with accents, written
  backwards, or several together making up three quarters of it;
- under 20 characters, fewer than three runs of letters: one or two words with digits and marks
  ("Summer2026!!"), the shape cracking rules are built for.

It is a floor and not a strength meter. The list of well-known passwords is short and
hand-written. A sentence that passes can still be guessable by someone who knows the user, and
three common words in a row pass.

### 1.5 What was tested (T-9, part of T-25)

`tools/moneylens/tests/vault.test.ts`, `recovery.test.ts`, `passphrase.test.ts`, in CI on every
change:

- Published known answers for each primitive: PBKDF2-HMAC-SHA-256 (RFC 7914 section 11),
  HKDF-SHA-256 (RFC 5869 test case 1), AES key wrap (RFC 3394 section 4.6), AES-256-GCM (McGrew and
  Viega, test cases 13 to 16).
- A second implementation (Node's OpenSSL bindings) re-derives the wrapping keys from the
  documented inputs, unwraps both wrappers to the same vault key, and decrypts a sealed chunk with
  it. A change to a parameter or to the authenticated data fails this test.
- A stored vault (`tests/golden.ts`, made once) still opens: by its passphrase as a desktop
  keyboard and as a phone would type it, by its recovery code and by its passkey secret. This is
  the test that pins the normalization and the stored format against later changes, and it pins
  the iteration floor at or below the stored count.
- A wrong passphrase fails; the recovery code unlocks; each secret fits only its own wrapper; a
  wrapper relabelled as another vault's, or with another salt or count, does not open.
- One flipped bit in any byte of a blob, a cut, an added byte, or a blob presented as another
  chunk, type or vault: it does not open, and there is never a partial result.
- The key in use cannot be exported, and an exportable one is refused. A wrapper from storage is
  validated before any key is derived (checked by counting derivations, not by timing).
- A weak passphrase makes no vault, including the look-alike, accented, backwards, Chinese and
  one-word forms. A passphrase change keeps earlier data readable.
- The recovery code's check catches any single wrong symbol and any swap of neighbours.

These tests run on Node. The same known answers and the stored vault have to pass in the browsers
the app supports (Chrome, Safari, Firefox) before real data is admitted; that is part of the
Phase 1 exit.

## 2. Limits (the reason for VAULT-6's wording)

- **The code the site serves.** The browser runs what `money.changle.ca` sends. Whoever can change
  that code can read a vault the next time its owner unlocks it. Client-side encryption protects
  stored data from a storage breach and from a curious administrator. It does not make the
  operator, or someone who has taken over the deployment, unable to attack a user.
- **Offline guessing.** Anyone holding a copy of a passphrase wrapper can test passphrases without
  the server. Each guess costs 600,000 rounds of HMAC-SHA-256, and graphics cards do those cheaply.
  The floor in 1.4 is what stands between a leaked wrapper and a weak passphrase, and it is a
  floor.
- **Nonces.** One key seals every chunk with a random 96-bit nonce. That is safe for about 2^32
  seals under one key (NIST SP 800-38D, section 8.3). A vault makes a few thousand a year.
- **Rollback, deletion, reordering.** The server can hand back an older version of a chunk, or
  none. Versions are not authenticated end to end.
- **The version byte.** A blob's first byte is checked but not protected on its own. Changing it
  makes the blob fail to open; the app may then say it looks newer than the app, which is a wrong
  message, not an exposure.
- **Metadata.** The number of chunks, their sizes and the times they change are visible to the
  server. Chunk sizes are not padded.
- **Memory.** JavaScript cannot wipe memory reliably. Secrets the code holds as bytes are zeroed
  after use; a passphrase held as a string by the page cannot be.
- **The device.** Malware, an extension with access to the page, or someone at the unlocked screen
  is outside what the vault defends.

## 3. Open points

- Passkeys: the PRF extension's salt, which browsers support it, and what a user without it is
  offered (ARCH-7). Not built.
- Whether iOS applies smart punctuation and automatic capitals in a passphrase field once "show
  passphrase" turns it into a text field. To be checked on a real phone when the screens exist.
- Limiting unlock attempts: the check happens in the browser, so the limit has to be on fetching
  wrappers, per session and per account (threat 1). Not built.
- Sessions, the handoff, the allowlist, the origin check, sync and quotas: sections to add with
  the server.
- Reviews under SEC-9 are recorded in the pull request. The first one was done by another Claude
  model because the other vendors' tools were not reachable that night; a review by a model from
  another vendor is still wanted for this code.

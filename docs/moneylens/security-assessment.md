# MoneyLens security assessment

Version 0.5, 19 November 2026. It records the choices the requirements leave to this document
([`docs/moneylens.md`](../moneylens.md): VAULT-2, VAULT-6, VAULT-7) and grows with the code. So far
it covers the vault's cryptography, which is the only security-sensitive code that exists
(`tools/moneylens/src/vault/`). Sessions, the handoff, sync, the allowlist and the content security
policy are added here as they are built. The threats are in [`threat-model.md`](threat-model.md).

This describes a design and its limits. It is not a statement that the product is secure, and it
has not yet had the independent review SEC-15 requires before Phase 3. Versions 0.2 to 0.5 follow
the rounds of SEC-9 review of the vault code (pull request #653), which changed the format before
any vault existed. After the first: wrappers are tied to their vault, the passphrase
normalization folds what phone keyboards rewrite, and the recovery code carries a check. After the
second: the normalization folds compatibility forms first and gives the same result when applied
twice, unlocking can tell a record for another vault from a wrong secret, and the passphrase floor
no longer turns away what password generators make (measured in 1.4). After the third: the
normalization also folds the quotation marks of other languages, the wave dash, and any run of
hyphens and dashes; and keyboard runs typed three keys at a time are patterns. The fourth round
approved the code, and recommended dropping more of the characters nobody sees while the format
could still change, which was done.

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
- Unlocking says why it failed, as far as it can know:
  - "unsupported": the stored record is not one this version of the app can use (a newer format,
    a field of the wrong shape, a count outside the accepted range). An out-of-date app is then
    not mistaken for a wrong passphrase.
  - "wrong vault": the caller said which vault it expects, and the record names another. The
    record was changed or mixed up in storage; the secret is not even tried.
  - "wrong secret": the record did not open. Usually the passphrase or the code is wrong. But the
    vault's id, the salt and the count all go into making the wrapping key, so a record in which
    any of them, or the wrapped key itself, was altered fails in exactly the same way. From the
    record alone the two cannot be told apart.
- So "wrong secret" is never proof that a vault is lost, however often it comes back and from
  however many ways in. Two requirements on the screens and on sync when they are built. A device
  keeps the id of the vault it made or first opened and passes it to every unlock. And a failed
  unlock never tells the user the vault is lost or steers them to "reset and import again": the
  unlock screen says only that this secret did not open the vault. Resetting stays where VAULT-5
  puts it, a choice for a user who knows the secrets are gone, behind the 7-day delay of VAULT-7.

### 1.4 The passphrase: normalization and the floor (VAULT-7)

`passphrase.ts`. Both are enforced where a vault is made and where a passphrase is changed, so the
screens cannot skip them.

**Normalization** is part of how the key is made, so the same keys pressed on any device have to
give the same bytes. In this order:

1. compatibility forms such as full-width and half-width letters and marks (NFKC);
2. characters nobody sees dropped: emoji and ideographic variation selectors, the zero-width
   space, the soft hyphen, the byte-order mark, the word joiner, the Mongolian vowel separator,
   and the marks that say which way text runs, which come along when a passphrase is copied out
   of a chat or a document. The zero-width joiner and non-joiner stay, because they hold emoji
   together and spell words in Persian and the Indic scripts. Then NFKC once more, because
   dropping a character can bring a letter and its accent together;
3. every kind of quotation mark and apostrophe to a straight one: curly and low ones, the prime,
   guillemets, corner brackets, and the letters a Ukrainian or a Hawaiian keyboard types for an
   apostrophe. A phone puts the marks of its keyboard's language where a straight one was typed,
   and a Simplified and a Traditional Chinese keyboard quote differently;
4. the wave dash to a tilde: a Japanese keyboard types the one on a Mac and a full-width tilde,
   which step 1 has already made a tilde, on Windows;
5. any hyphen, dash of any length or minus sign, and any run of them, to one hyphen. Apps
   disagree about what two or three typed hyphens become: an em dash on a phone and in Word, an
   en dash and an em dash in Google Docs. So "a--b", "a-b" and "a—b" are one passphrase, and a
   run counts as one character when the length is checked;
6. the ideographic full stop to a period, and the dot between the parts of a name to one middle
   dot, whichever of three an input method typed;
7. runs of spaces to one, and no space at either end.

Two of these were folded without a device to confirm that keyboards really differ in them: the
apostrophe letters in step 3 and the middle dots in step 6. Folding costs nothing if they turn
out not to occur, and could not be added later without a new wrapper version.

Compatibility forms go first so that what they turn into is folded too: a half-width ideographic
full stop becomes the same period as a full-width one. Applying it twice gives what applying it
once gives, which a test checks on random text. Not folded: capitals. They are the user's own, so
the passphrase fields must set `autocapitalize="off"`, `autocorrect="off"` and
`spellcheck="false"`, which is a requirement on the screens when they are built. Also not folded:
the different marks a Chinese input method types on some keys while it is in Chinese mode (《 for
<, ￥ for $, …… for ^, 、 for \). Those are other characters, which the user can see, and a
passphrase typed with them has to be typed with them again.

Because existing vaults depend on it, the normalization may only change together with a new
wrapper version that still reads the old one; a stored vault in `tests/golden.ts` fails the build
otherwise. That vault's passphrase wrapper was made a second time on the day it was first made,
from the vault's own recovery code, before this code was first merged. The third review asked for
steps 3 and 4 to be completed while the format could still change; checking what apps do with
typed hyphens at the same time led to step 5, and the stored passphrase has two hyphens in it.
Nothing else in that vault changed, and its header records this.

**The floor.** Refused:

- fewer than 12 characters, or fewer than 8 when at least four of them are Chinese, Japanese or
  Korean (other non-ASCII text gets no allowance);
- patterns: fewer than five different characters; one piece repeated; slides of three keys or
  more along a keyboard row, the alphabet or the Chinese numerals that together make up three
  quarters of it, also with Shift held or as two slides typed turn about ("123qweasdzxc",
  "1qaz@WSX3edc", "a1b2c3d4e5f6"); digits and marks with no letter and fewer than 20 digits; one
  run of digits that is two thirds of the passphrase or more, which is a date or a phone number
  with initials around it ("wxm198812120");
- well-known passwords and phrases, in English, pinyin and Chinese: alone, with digits and marks
  around or between them, with look-alikes for letters ("p@ssw0rd"), with accents, written
  backwards, or several together making up two thirds of it;
- under 20 characters, one or two words with digits and marks ("Maplewood2026!!"), the shape
  cracking rules are built for. Look-alikes inside the word do not hide it ("M4plew00d2026!!").
  Three words pass, and so does anything of 20 characters or more that clears the other rules.

How the last rule knows a word: there is no dictionary in the code. A run of letters is a word
when it can be read as pinyin syllables from end to end, or when it is built like an English word
(a vowel in it, never four consonants in a row, "th", "ch", "ng" and the like counting as one)
and each of its letters is followed by one that commonly follows it. The table of common letter
pairs (305 of the 676) was worked out from the SCOWL word lists: the pairs that make up 97% of
all pairs in 40,000 common English words, and any pair found in five or more of the 4,000
commonest. Any other run of three letters or more is a "maybe": it may be a word the check does
not know, or a random part. A maybe never makes a passphrase weak, but it counts when the words
are counted, so that three words are not taken for two.

This is rough, and it errs both ways. Both were measured on 19 November 2026.

A password of random characters from a generator is let through, because its letters do not read
as words. Now and then one does by chance, and the person makes another. Of 20,000 random strings
of each kind:

| What the generator made | Refused | Before the second review |
| --- | --- | --- |
| 12 letters and digits, capitals and small | 0.4% | 60% |
| 16 letters and digits, capitals and small | 0.05% | 38% |
| 12 letters, digits and marks | 0.5% | 19% |
| 15 small letters | 0.4% | 100% |
| 14 small letters and digits | 2.7% | 21% |
| 12 capitals and digits | 4.1% | not measured |
| 16 hexadecimal digits | 5.8% | not measured |
| 20 digits | 0.02% | 100% |
| Pronounceable: consonant, vowel, consonant, vowel; 12 to 16 letters | 42% to 55% | not measured |
| Pronounceable, 20 letters or more | none | not measured |

The rows with one case of letters are the hard ones: with no capitals to break them up, the runs
of letters are long enough to read as a word now and then. Hexadecimal is harder still, because
"bad", "fed" and "cafe" are words and more than half of it is digits. A generator that makes
pronounceable passwords is the exception to all of this: its output is meant to read like words,
and about half of it is refused until it is 20 characters long. At 12 to 14 letters such a
password is about as hard to guess as three words picked at random, which the floor accepts; it
is refused only because it reads as one or two long words, and the floor cannot tell it from
them. The screens should say "make it longer, or add a word" to someone it happens to.

One more thing a person may meet. A 12-character password with two hyphens in a row counts as 11
characters and is refused as too short: about 1 in 900 of the strings with marks measured here,
and about 1 in 430 where the hyphen is a larger share of the generator's alphabet (base64url; the
reviewer's measurement). The fourth review suggests counting the length before runs are folded,
which the format allows, since the floor is not part of how the key is made. It is left for the
passphrase screens, together with a thing that has to be settled at the same time: counted that
way, a short secret padded with hyphens ("xq--------mz") would pass the length rule, as one
padded with other marks already does.

The tests hold the first eight of these kinds under a fixed limit, from 0.5% for the rarest to
about twice the figure shown for the three hard ones. The third review measured the same kinds with
generators of its own and agreed with the table as it then stood; that review's changes have
since moved the figures by about a tenth of a point at most. ("Before" is the reviewer's
measurement of the rule the second review replaced: fewer than three runs of letters under 20
characters.)

In the other direction, passphrases were built from real words of three to nine letters, 4,000 of
each shape, all of 12 to 19 characters. The first three columns draw on the word lists the table
of letter pairs was made from, by how common the words are; the last draws on rarer words that
had no part in it ("minx", "gusset", "township"):

| Shape | Commonest 4,000 words | Next 7,000 | Next 29,000 | Rarer, not used for the table |
| --- | --- | --- | --- | --- |
| One word, a year, two marks | 99.6% refused | 99.0% | 98.5% | 96.9% |
| Two words and a year | 98.1% refused | 94.7% | 92.2% | 83.6% |
| Two words run together with capitals, two digits, a mark | 98.1% refused | 96.1% | 94.2% | 89.3% |
| Three words | all accepted | all accepted | all accepted | all accepted |

What gets through, then:

- a two-word passphrase in which one word has letter pairs that are rare in English ("blue sky
  2026": "ky" is one), more often the rarer the words;
- one word and a year when the word is built unlike most English ones ("Rhythm2026!!!"), and
  names, which follow no one language's rules ("Chloe2026!!!", "JohnSmith2026!");
- a word with look-alikes for most of its letters, or with a digit that stands for a sound
  ("N1c0l3tt3!!!", "Sk8erboi2026!");
- a date written with separators after initials ("wxm-1988-12-12");
- words of languages other than English and Mandarin, which nothing here recognizes as words, so
  that a passphrase in another language is checked for length, patterns and the well-known
  passwords only.

It is a floor and not a strength meter. The list of well-known passwords is short and
hand-written. A sentence that passes can still be guessable by someone who knows the user, and
three common words in a row pass. The second and third reviews pointed to an established
estimator of guesses (zxcvbn-ts), which also has lists of names, as the better tool. It is to be
tried when the passphrase screens are built,
loaded only on those screens, with this floor kept underneath it as the check the screens cannot
skip. It is not in this module because it would bring a dependency and large word lists into
code that so far uses nothing but the browser's own WebCrypto, and whether its lists cover pinyin
has to be checked first.

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
  keyboard types it, as a phone does, and as it comes out of a document that turned its two
  hyphens into an en dash; by its recovery code; and by its passkey secret. This is the test that
  pins the normalization and the stored format against later changes, and it pins the iteration
  floor at or below the stored count.
- The normalization gives the same result when applied twice, on 5,000 random strings drawn from
  the characters it folds.
- A wrong passphrase fails; the recovery code unlocks; each secret fits only its own wrapper; a
  wrapper relabelled as another vault's, or with another salt or count, does not open. A device
  that says which vault it expects is told "wrong vault" for any other, before a key is derived.
- One flipped bit in any byte of a blob, a cut, an added byte, or a blob presented as another
  chunk, type or vault: it does not open, and there is never a partial result.
- The key in use cannot be exported, and an exportable one is refused. A wrapper from storage is
  validated before any key is derived (checked by counting derivations, not by timing).
- A weak passphrase makes no vault, including the look-alike, accented, backwards, Chinese and
  one-word forms. A passphrase change keeps earlier data readable.
- The floor, both ways: 2,000 random strings of each of eight kinds a generator makes stay under
  a limit of refusals; one word with a year is refused for each of 50 everyday words, and two of
  them with a year; three of them are let through. One test lists what is known to get through,
  so that a change which closes one of those gaps, or opens it wider, shows.
- The recovery code's check catches any single wrong symbol and any swap of neighbours. A code
  with a symbol missing or typed twice is reported as the wrong length, with the count, and not
  as "not a code". Groups may be separated by any dash, a dot, an underscore or a space.

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
  The same goes for its turning two spaces into a full stop and a space: "tidal  marmot" would
  become "tidal. marmot", which the normalization cannot fold back, because a person can see
  those are different.
- The length rule and repeated characters: whether a run of hyphens should count at its typed
  length, and what padding with one repeated character should count for (1.4).
- What phones and computers set to French type for a straight quotation mark. The guillemets are
  folded (1.4), but if a no-break space is put inside them as well, the two spellings still
  differ. Not checked on a device; nobody here had one set to French.
- A passphrase in Chinese needs an input method, which a password field switches off, so the
  field has to be a text field at least while such a passphrase is typed. How that is offered,
  and what each input method then does to the punctuation keys, is for the screens.
- Limiting unlock attempts: the check happens in the browser, so the limit has to be on fetching
  wrappers, per session and per account (threat 1). Not built.
- Sessions, the handoff, the allowlist, the origin check, sync and quotas: sections to add with
  the server.
- A record altered in storage and a wrong secret look the same (1.3). When sync is built, the
  device should also keep a fingerprint of the wrappers it has seen, so that it can say "this
  record changed since this device last saw it" instead of "wrong passphrase".
- An estimator of guesses on the passphrase screens, on top of the floor (1.4).
- Reviews under SEC-9 are recorded in the pull request. All the rounds for the vault code were
  done by another Claude model, which had not seen the code being written, because the other
  vendors' tools were not reachable that night; a review by a model from another vendor is still
  wanted for this code.

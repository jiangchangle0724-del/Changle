# MoneyLens security assessment

Version 0.14, 26 November 2026. It records the choices the requirements leave to this document
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
could still change, which was done. The fifth approved that last change, and the code was merged
as it then stood (commit `0b03c720`). Version 0.6 changes no code: it writes the format down byte
for byte (1.1) and lists exactly what the normalization changes (1.4), so that both can be checked
against this document by someone who has not read the code. Version 0.7 records that check: another
vendor's model wrote a reader from this document alone, opened the stored vault with it three ways
and then reviewed the code ([`reviews/vault-second-opinion.md`](reviews/vault-second-opinion.md),
pull request #692). It approved the format and the code, and found one thing to fix in the code
(a new recovery code's bytes were not cleared when wrapping failed part-way; fixed in #727, written
by that model and reviewed here) and one number this document named without stating (1.2, now
stated).
Version 0.8 adds how records are packed, kept on a device and brought into line with the server
(1.6), and what a device can and cannot notice when the server's copy goes back (section 2).
Version 0.9 follows the second round of the review of 1.6: a record found in more than one chunk
is no longer moved, the answer to a push is believed only if it answers that push, and every
request has a time limit. The third round approved the layer as 0.9 describes it. Version 0.10
follows that round: the one thing it found is fixed (a doubled record was not always read with
its latest copy's time), and one more way a field can come back is written into 1.6. Version
0.11 adds the server's own code for the two calls of sync (1.6, "The server's code"). Version
0.12 adds sessions and what a request has to show (1.7). Version 0.13 adds the Worker and the
Durable Objects around all of it: a request's way in, the gate, and sync as it travels (1.8).
Version 0.14 follows the review of 1.8: a sign-in and a notice from the accounts service are put
in order ("A sign-in and a notice at the same time"), and signing in is one transaction. None of
it is published.

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

**The format, byte for byte**, so that a vault can be read without this code. Strings are UTF-8;
`<vault>` is the vault's id as it is stored.

- Wrapping key from the passphrase: PBKDF2-HMAC-SHA-256, 256 bits out. The password is the
  normalized passphrase (1.4). The salt is `moneylens/v1/passphrase/<vault>`, one line feed
  (0x0A), then the wrapper's 32 salt bytes. The iterations are the wrapper's `iterations`.
- Wrapping key from the recovery code: HKDF-SHA-256, 256 bits out. The input is the code's 20
  bytes, the salt is the wrapper's 32 salt bytes, and `info` is `moneylens/v1/recovery/<vault>`.
- Wrapping key from a passkey: the same, with the 32 bytes the passkey's PRF extension returns as
  the input and `moneylens/v1/passkey/<vault>` as `info`.
- The vault key: the wrapper's 40 `wrapped` bytes, unwrapped under the wrapping key with AES key
  wrap as RFC 3394 gives it, default initial value.
- A sealed chunk: byte 0 is 0x01; bytes 1 to 12 are the nonce; the rest is the AES-256-GCM
  ciphertext followed by its 16-byte tag. The additional authenticated data is `moneylens/v1`, a
  line feed, the vault's id, a line feed, the chunk's id, a line feed, the chunk's type. A type is
  1 to 32 lowercase letters, digits and hyphens, starting with a letter.
- A recovery code's 20 bytes: its first 32 symbols, in the alphabet
  `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, are five bits each, the most significant first. The last
  two symbols are the check: that 160-bit number modulo 1021, written as two symbols (the
  remainder divided by 32, then the remainder modulo 32).
- In a wrapper record, `salt` and `wrapped` are URL-safe base64 without padding, and `kdf` is
  `pbkdf2-sha256` or `hkdf-sha256`.

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
the count comes from storage and should not be able to stall a phone. In numbers: a version 1
wrapper is accepted when its count is a whole number from 600,000 to 2,000,000, both included
(`PBKDF2_FLOOR` is 600,000 today, the only count ever written). Raising what new wrappers are
written at does not raise the floor. The count is reviewed
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
   space, the soft hyphen, the byte-order mark, the word joiner and the invisible mathematical
   operators beside it, the Mongolian vowel separator, and the marks that say which way text
   runs, with the deprecated format controls that follow them. These come along when a
   passphrase is copied out of a chat or a document. The zero-width joiner and non-joiner stay,
   because they hold emoji together and spell words in Persian and the Indic scripts. Then NFKC
   once more, because dropping a character can bring a letter and its accent together;
3. every kind of quotation mark and apostrophe to a straight one: curly and low ones, the prime,
   guillemets, corner brackets, the letter a Ukrainian keyboard types as its apostrophe, and the
   Hawaiian ʻokina, a letter in its own right that a keyboard without it types as an apostrophe.
   A phone puts the marks of its keyboard's language where a straight one was typed, and a
   Simplified and a Traditional Chinese keyboard quote differently;
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
out not to occur, and could not be added later without a new wrapper version. One fold merges
spellings that are not quite the same to the eye: without the Mongolian vowel separator a word
in Mongolian script is drawn differently. That cannot lock anyone out, since both spellings give
the same key.

Exactly, over the whole of Unicode. Steps 2 to 7 change these characters and no others (found by
running every character through the code, by the author and again by the reviewer in the fifth
review); NFKC in steps 1 and 2 does the rest, and brings a few more characters into these rows,
such as the non-breaking hyphen, the presentation forms of the dashes and the half-width corner
brackets.

| Becomes | Characters |
| --- | --- |
| nothing | U+00AD, U+061C, U+180E, U+200B, U+200E to U+200F, U+202A to U+202E, U+2060 to U+2064, U+2066 to U+206F, U+FE00 to U+FE0F, U+FEFF, U+E0100 to U+E01EF |
| `'` | U+02BB, U+02BC, U+2018 to U+201B, U+2032, U+2039, U+203A, U+300E, U+300F |
| `"` | U+00AB, U+00BB, U+201C to U+201F, U+300C, U+300D, U+301D to U+301F |
| `~` | U+301C, U+3030 |
| `-`, and a run of these and of `-` becomes one | U+2010 to U+2015, U+2212, U+2E3A, U+2E3B |
| `.` | U+3002 |
| `·` (U+00B7) | U+2027, U+30FB |
| one space, a run of these and of spaces becoming one, and none at either end | U+0009 to U+000D, U+1680, U+2028, U+2029 |

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

### 1.6 Records, chunks and sync (VAULT-4)

The code is `tools/moneylens/src/vault/records.ts` (what is in a chunk, and merging),
`sync.ts` (the store on a device, the cache and the server as it sees them) and `memory.ts` (a
server and a cache in memory: the rule book the real server will be held to, and what the demo
runs on), with the cache in the browser's storage in `src/web/idbcache.ts`. The real server is
not written yet.

**What is in a chunk.** JSON in UTF-8, sealed as in 1.1 under the chunk's own random id and the
type `records`:

```
{"v":1,"group":"…","n":3,"rev":"<id>","history":["<id>",…],
 "records":{"<record id>":{"k":"<kind>","t":<milliseconds>,"d":{…the record's fields…}}}}
```

- `group` says what the chunk is for: one account's transactions, or the book of accounts, rules
  and settings. A device puts a new record into a chunk of its group that has room, so an import
  of two years of statements for three accounts writes about twenty chunks, and a month of new
  transactions touches two. Nothing else depends on it. A record is found by its id, and once the
  server has it, it stays in its chunk.
- `n` counts this chunk's versions: 1 when it is made, and one more each time it is sealed from
  the copy before it. `rev` is a random name for this version. `history` is `rev` followed by
  the versions it was made from, newest first: as many as `n`, sixteen at most. All three are
  inside the sealed part, so the server cannot change them, and what they say about which copy
  came from which does not depend on anything the server says.
- `t` is when the record was last changed, by the clock of the device that changed it.
- A record's size is the number of bytes, in UTF-8, of the text it has in the chunk,
  `"<id>":{"k":"<kind>","t":<t>,"d":{…}}` with no spaces, plus one for the comma after it. It is
  at most 4,096, that number included. (The record with the id `AAAAAAAAAAAAAAAAAAAAAQ`, the
  kind `txn`, `t` 5 and one field `n` equal to 1 is written
  `"AAAAAAAAAAAAAAAAAAAAAQ":{"k":"txn","t":5,"d":{"n":1}}`, 54 bytes, and counts as 55.) A chunk
  with 240 records takes no new one, and a device does not grow its copy of a chunk past
  512 KiB. 240 times 4,096 is under the one mebibyte a chunk may hold (1.1), so a single device
  cannot build a chunk too large to seal. A merge of several devices' copies can; see "too
  large" below.
- A reader refuses contents it does not know: a larger `v` is reported as "written by a later
  version of the app", anything else malformed is reported as such, and in both cases the chunk
  is neither used nor written over. Fields of a record that this version does not know are kept
  when the record is changed.

**What the server holds.** For each chunk: its id, its sealed blob, and a version number. For the
vault: the last version number given out, and the day's count of writes. It can see how many
chunks there are, how large each is, when each changes and which change together. It cannot see
which account a chunk belongs to, how many records it holds or of what kind: the group, the
kinds and the record ids are all inside the sealed part. That is VAULT-1's list.

**The two calls.** Both name the vault, and the server refuses a vault it does not hold (after a
reset it holds another one).

- *Pull*: "what changed since version N". The answer is the chunks with a larger version number,
  in order, in pages, with how far it reaches and a *digest* (below).
- *Push*: a batch of writes. Each names its chunk, the version number of the copy it was made
  from and that copy's *mark*, and carries the new blob. The server checks, in this order: the
  vault; that the request is well formed; sizes; that every write was made from the copy the
  server holds (number and mark both); quotas (LIM-2: bytes held, and chunk writes a day). Then
  it writes all of them, giving each the next version number. If any check fails nothing is
  written, and nothing is changed: a batch refused on a new day does not start that day's count
  of writes. A write made from another copy is "stale", and the answer carries the copies the
  server holds for the stale chunks.

**The server's code** (`src/server/chunks.ts`). The two calls as the real server will run them:
plain functions on one person's own SQLite database, which is what a Durable Object has (ISO-1).
It is the rule book over again, check for check and in the same order, and every test of the
store runs against both (`tests/sync-sql.test.ts`, on Node's SQLite shaped like a Durable
Object's). The database has two tables. A row for each chunk: its id, version number, mark,
size and blob. One row for the vault: its id, the last version number given out, and the day's
count of writes. Nothing else is kept, and a test names every column. The digest and the vault's
size are worked out from the chunks that are there, each time, and are not kept beside them: a
number kept beside what it counts can come to disagree with it, and the digest is how a device
notices that a chunk it had is gone. The last version number is kept and counted up, never
looked up from the chunks, so a chunk that is gone does not hand its number to the next write.
A batch is written inside one transaction; a test fails the database half-way through a batch
and finds nothing of it kept, the day's count included. Bytes are copied into a buffer of their
own before they are stored, whatever they were a view of. What a call costs on the platform
(LIM-1) is written in the file and tested: a pull or a push reads one short row for each chunk
the vault holds, whatever was asked for, and a push writes one row for each chunk (two for a
new one) and one for the vault.

Not written yet, and not reviewed with it: the Durable Object around these functions, which
person's database a request reaches (ISO-2: only ever the session's own), sessions, the handoff,
the allowlist, the origin check, and resetting a vault. Until those exist, nothing outside can
call this code.

**Mark and digest.** A blob's mark is its nonce, twelve bytes, random and new every time a chunk
is sealed. It is in the blob in the clear already, so it tells the server nothing, and it names
one sealed copy. A write names the mark of the copy it was made from because the version number
alone is not enough: after a restore from the platform's recovery history (BAK-1) the server
counts up from an older number and gives the same numbers to other copies. The digest is the
marks of every blob the server holds, combined with exclusive-or. A device combines the marks of
what it believes the server holds and compares.

**Merging.** When a write is stale, or when a pull brings a newer copy of a chunk this device has
changed, the three copies are merged: the one both started from, this device's, the server's.
Record by record, then field by field:

- "The same" means the same kind and the same fields with the same values. `t` is not compared:
  a record touched and left as it was has not changed.
- A record that is the same on this device as in the starting copy takes the server's state
  (changed, removed, or as it was), with the server's `t`. One that is the same on the server as
  in the starting copy takes this device's, with this device's `t`. One that both sides changed
  to the same thing is that, with the later of the two `t`s.
- Otherwise both changed it. If one side removed it, it is removed, whatever the other side did,
  and the app is told that a change was dropped with it.
- Otherwise both sides have it, changed differently: field by field, by the same three rules (a
  field absent on a side counts as a value of its own). A field both changed to different values
  goes to the side whose record has the later `t`, and the app is told. On the same millisecond
  the two versions are compared as text (the kind, a space, then the record as JSON, its id
  included, with the keys of every object in order) and the greater wins, so that both devices
  pick the same one. The kind is treated as one more field, and a kind both sides changed
  differently is reported like one. The merged record's `t` is the later of the two.
- If the merged record would be larger than a record may be (each side filled a different
  field), the side that would win a clash is kept whole, with its own `t`, and the app is told.
- With no starting copy (a cache that was lost), nothing counts as removed: a record on either
  side is kept, and one on both is merged field by field as if it had been empty before.

The merged kinds and fields are the same whichever device does the merging. So are the times,
with one exception that changes nothing: a record that one side touched and left as it was takes
the other side's time, and a time alone is never sent. The result is sent as a write made from
the server's copy, so no device writes over what another wrote without having read it. `t` is
used to settle a field both sides changed, and in the one case described next. A device that
changes a record gives it a `t` later than the one it had, so a device whose clock is behind
does not lose every such tie.

**The same record in more than one chunk.** It should never happen: ids are 128 random bits, and
a record does not move once the server has it. A device gone wrong, or anything that uses an id
twice, could still do it with nothing but the ordinary calls, so the store has a rule for it.
The rule starts from what the store must not do. It does not move a copy and does not take one
out, here or anywhere: to a device that has not seen the other chunk, a record taken out of one
chunk to be kept in another is a record that was removed, and whatever that device had done to
it would go with it. (The first form of this rule did gather the copies into one chunk. The
second round of the review showed two honest devices losing a field that way.)

- *Reading.* The copies are read as one record: every field any copy has, and for a field the
  copies give differently, the value of the latest copy that has the field. Latest is the
  greater `t`, and on the same `t` the greater text, as in a merge. Each field is chosen from
  the copies as they are, so the order in which they are looked at does not matter. The kind and
  the time are the latest copy's, also when the copies say the same and differ only in their
  time: a change on this device is then stamped later than every copy it holds, however slow
  its clock. If the result would be larger than a record may be, the latest copy is read as it
  is.
- *Telling the app.* The app is told that the record is doubled when the store first sees it so,
  and again in a later session if it still is.
- *Making the copies alike.* At a sync, each copy that differs from the record as read is
  replaced by it, in the chunk where it is, and those chunks are sent like any other change.
  From then on the copies say the same, and two devices changing the record at once merge in
  each chunk as they would for any record. If the record as read would not fit in one of its
  chunks, the copies are left as they are and it goes on being read as one.
- *A change* is made to the record as read and is written into every copy this device holds.
  *A removal* takes out every copy this device holds.
- *What this cannot do.* A device acts on the copies it has seen. A copy it has not been told of
  yet is untouched by its change or its removal, and when that copy arrives the record is read
  with it again: a removal may have to be made a second time, and a field that was taken out can
  come back. A field can also come back through copies the device has seen, if another device
  was making them alike at that moment. That device's write puts the field into a copy that did
  not have it, and it is merged chunk by chunk: in the chunk that had the field the removal
  stands, and in the chunk that did not, the other device's write is the only change to that
  field and stands too. (A removal of the whole record does not come back this way: in every
  chunk a removal wins over a change.) With doubled records nothing is dropped unasked; the
  price is that taking something away can need repeating. And a record has one time, not one
  for each field (section 2).

**Sending twice.** A write replaces a whole chunk, so the same write arriving twice is the same
chunk once. What needs care is a write whose answer never came, because a request that timed out
on the device can still arrive at the server, even after the device has looked and seen nothing.
The device keeps the copy it sent, in the cache, as "sent", and the next thing it sends for that
chunk is that same copy, until an answer settles it: the same bytes come back (it was taken), a
newer copy comes back whose `history` names it (it was taken, and another device built on it:
then it, not the older base, is what both started from), or the chunk has moved on without it
(it was never taken, and never can be, since it names a copy the server no longer holds). A
refusal settles only the request it answers. Without this, a record added in the lost write and
removed again on the device would come back.

**The cache.** For each chunk: its id, a version number, and up to three sealed blobs (the
server's copy as last seen, this device's copy with unsent changes, and a sent copy of unknown
fate). For the vault: its id and how far the last pull reached. No key, no record, no field, no
group (T-24, VAULT-3). A cache that belongs to another vault is emptied. A cached blob that does
not open is left out and the server is asked for everything again. In the browser the cache is
IndexedDB: one transaction a save, written to disk before the save returns. Two tabs of one
browser share that storage, and each would write over the other's picture of it, so a page has
to hold the cache to use it (a Web Lock, which the browser drops when the page goes, however it
goes) and a second tab is told that it is taken. A browser that gives a page no storage it can
hold alone (a private window, say) is told apart from that, so the app can run without a cache
and say so. Changes exist in memory until
they are flushed (sealed and written to the cache); the app flushes within about a second of a
change and sends less often, because every send that changes a chunk counts against LIM-2.

**A server whose copy went back** (a restore, a fault, or a server that means harm). A device
that has synced before notices at its next sync, in one of these ways, and then stops, says so,
and changes nothing on either side, its own cache and its place in the server's list included:

- the digest does not match what the device believes the server holds; it then asks for
  everything and finds a chunk it had that is gone, or a chunk whose version number is not
  higher than the one it has while the bytes differ;
- a copy the server calls newer does not name the device's copy in its `history`, and by its own
  `n` it is fewer than sixteen versions on, so the name cannot have dropped off the end. That is
  an older copy handed back under a higher number, however far back, or a copy that was never
  built on this device's. Merging it as if it were newer would remove records;
- a write made from the device's copy is refused although the number matches, because the mark
  does not;
- the server's answer to a look puts its count of versions behind what this device has already
  seen. That count only goes up, so a lower one is a server that went back, whatever else it
  shows.

The way out that exists today is to take the server's copy: empty this device's cache and start
again from the server, after offering an export of what the device holds. Putting the device's
copy back on the server is not built (section 3).

**Answers that are not answers.** Whatever comes back from the server is checked before anything
in it is used. For a pull: that it is an answer at all, its shape, that ids are ids, that
version numbers go up, that a blob is at least as long as a sealed blob can be. A push has three
answers, and each has to be an answer to the request that was sent:

- *Taken* names every chunk of the request, once each and no other, each with a version number
  of its own that is later than the copy it replaces and than anything this device has seen.
- *Stale* names chunks of the request, at most once each, and for each shows why: a copy that is
  not the one the write was made from (its mark differs), or that the server holds none where
  the write named one. An answer that calls a write stale and shows the very copy it was made
  from has shown nothing.
- *Refused* gives one of the reasons above.

Anything else is a bad reply: the sync ends and says so, nothing is taken from it, and what was
sent is left as of unknown fate, because such an answer does not say whether the write happened.
The same goes for a pull that hands back, under a later number, the very copy the device already
has: taking that for "the chunk has moved on" would give up a sent copy that can still arrive.
(The second round of the review showed why this matters. A "stale" answer that only repeated the
unchanged copy made the device forget what it had sent, and the write, arriving late, brought
back a record that had been taken out again.)

An answer has to end, and it has to come. A pull stops, as a bad reply, after 1,000 pages, 20,000
chunks or 64 MiB, or when one chunk has come round more than eight times, all of which are far
past what a vault can hold. Each request is given two minutes, or what the app sets; after that
its answer counts as not known, exactly as if the network had dropped it, and for a push that
leaves what was sent as of unknown fate. So neither a server that keeps answering nor one that
stops answering holds a sync, or the saves that wait their turn behind it, for ever. The code
that talks to the server over the network is not written yet; what it owes on top of this is in
section 3.

**Too large.** A merged chunk can exceed what one chunk may hold. The records this device added
and has not sent then go to another chunk (never a copy of a record that is in another chunk
too: see above). If that is not enough (it takes several devices each
growing existing records of one chunk, far beyond what the app's fields allow), the sync stops
with "too large" before writing anything, and this device keeps its changes.

**What a merge leaves to the app.** A merge is per record and per field, and knows nothing of
what the records mean. Two things that refer to each other can therefore disagree afterwards: a
transfer paired with one transaction on one device and with another on the other, a transaction
whose account or category was removed elsewhere. The app treats a pair as a pair only when both
sides name each other, and a missing account or category as none. Not a security matter; written
here so that it is written somewhere.

**What was tested** (`tests/records.test.ts`, `tests/sync.test.ts`, in CI): the format round trip
and every way it can be malformed; merging, by case and on two thousand random pairs (the same
result whoever merges; nothing that one side did alone is lost); that neither the server nor the
cache holds a readable byte of the records, their ids or their groups (T-6, T-24); the size of a
full import (LIM-1); stale writes refused whole; answers that never came, requests that arrive
late in every order, and the page closed in the middle; quotas (T-14); a server that went back,
in each of the ways above; chunks that do not open; a damaged cache. One test runs three devices
with clocks hours apart through a few hundred random steps on a network that loses answers,
delivers requests late and lets another device write between a device's look and its write, with
pages closed at random saves, and then checks that all devices and the server hold the same
records, that every record added and not removed is there, that every removed record is gone,
and that a field only one device changed has that device's last value. It runs eight times in CI
and was run several thousand times before the code was merged. Each check in the code was also
taken out in turn to see that a test fails without it. Another vendor's model then wrote the
merge from this section alone, before it had seen the code, and compared the two on 24,000
random cases (they agree on every one, times included, after the fix to its first finding); ran
schedules of faults of its own against the store; and reviewed the files line by line, twice.
Its review, seven findings in the first round and four in the second, and what was done about
each are in [`reviews/sync-second-opinion.md`](reviews/sync-second-opinion.md). After the second
round: twenty-six answers to a push that are not answers to it, each checked to give nothing
up; a server whose numbers do not go up (a count behind the device's own, a number no later than
the copy it replaces); a server that never answers; and doubled records, by case and in a random
run of three devices that each know other copies, on the same bad network. The checks in the
four files (62 of them) were taken out one at a time again on the code as it now is: each makes
a test fail. The cache in the browser's
storage is tried in a real browser (`scripts/check-cache.ts`, part of `npm run test:page`): what
IndexedDB holds after use is ids, version numbers and sealed bytes in which none of the records'
words can be read, local and session storage and cookies are empty, a second tab is refused the
cache, a page opened again finds every record (T-24), a save that fails part-way writes nothing,
and a layout left by a later version of the app is neither opened nor changed. The three answers
of taking the cache (held, taken by another page, no storage this page can hold) are tested with
stand-ins for the browser (`tests/idbcache.test.ts`). The third round approved the layer and
added tests of its own: every order of four copies, two devices with different copies writing
in either order, a cache save cut at each point with a third copy arriving later, a push that
timed out arriving after a removal was saved, and a real change or removal against a write that
makes copies alike. Its one finding (the time a doubled record is read with when its copies say
the same) has its test, switched on, and one here for both orders of the chunks and for copies
that a sync made alike. The way a field can come back that 1.6 now names is a test too. The
server's code runs every test of the store once more, and has tests of its own for what its
database is made of, which vault it is for, bytes in and out, a batch failing half-way, the
count of versions, and what a call costs (`tests/chunks.test.ts`); each of its checks was taken
out in turn as well.

### 1.7 Sessions, and what a request has to show (ARCH-4, SEC-4)

Written and tested as two files of plain functions. The Worker that will use them is not
written, so nothing here can be reached yet. `src/server/sessions.ts` works on the person's own
database, beside the chunks (1.6). `src/server/request.ts` reads a request's headers and nothing
else.

**What a session is.** After a handoff code from the main site has been traded for an account
(ARCH-3, not written), the server makes a token of 256 random bits and gives it to the browser
in a cookie. The account's database keeps the SHA-256 of the token, a random id for the session,
when it was made, when it was last seen, and a short label for the list its owner sees. The
token itself is kept nowhere on the server: a copy of the database signs nobody in. A token is
long and random, so there is nothing to guess that a slow hash would slow down, and the plain
hash is enough.

**The cookie.** `__Host-ml=<account id>.<token>`, with `Path=/; Secure; HttpOnly;
SameSite=Strict` and no `Domain`. The `__Host-` prefix makes a browser take such a cookie only
from this origin over HTTPS, so a page on changle.ca or on another subdomain cannot plant one.
The account id in it is an address and not a permission (ISO-2): it says whose database to ask,
and that database checks the token. Whoever sends another person's id is asked for a token they
do not have. A request with two cookies of this name is treated as having none, because which
of two a server ends up reading is not the server's choice. Names are compared exactly:
`__host-ml` is another cookie.

**When a session ends.** Thirty minutes after it was last seen, and twelve hours after it was
made whatever its use (ARCH-4). "Last seen" is written at most once a minute and not on every
request (LIM-1: rows written are counted across the whole site), so a quiet session ends between
29 and 30 minutes after its last request. The browser is told to drop the cookie after twelve
hours; the server ends the session then whatever the browser does. A session can be ended from
the server at any time: one by its id (signing out, or signing another device out), all of
them, or all but the one that asks (ARCH-8). All of them is also what a changed email address
does (ARCH-9). A session found to have ended is deleted, so it cannot come back.

**The clock** is the server's, and the only one there is. If it reads more than a minute
earlier than a session was last seen, that session was seen under a clock that has since gone
back, and how long ago that really was cannot be told. It has ended, and its owner signs in
again. Within the minute, which is room for two machines that do not agree to the millisecond,
nothing changes.

**How many.** An account has at most eight sessions. A new sign-in first removes those that
have ended; if there would still be more than eight, the ones seen longest ago end. So every
call reads at most eight short rows. A check that finds nothing writes nothing: sending wrong
tokens costs the site reads and no writes.

**Where a request came from** (SEC-4, T-22). changle.ca and money.changle.ca are one site to a
browser, so `SameSite` does not keep a page of the main site from sending a request here with
the cookie on it. This rule does: everything that reads or changes a person's data is a POST,
and a POST is refused unless its `Origin` header is exactly the MoneyLens origin. A browser
sends `Origin` with every request that is not a plain GET or HEAD, and no page can set or
remove it. Where the browser also says how the two origins relate (`Sec-Fetch-Site`), that has
to be "same-origin". A request with no `Origin` is refused. The pages themselves are plain GETs
and carry nobody's data. The origin to expect is configuration, so that a staging deployment
has its own (SEC-11); one that is not a bare `https://` origin lets nothing in.

**The nonce cookie** (`__Host-ml-n`, five minutes, the same attributes) is set when the browser
sets off for the main site to fetch a handoff code, and is compared with the nonce the code
comes back with. Without it somebody could get a code for their own account and slip it into
another person's browser, who would then put their statements into the attacker's vault
(ARCH-3).

**What was tested** (`tests/sessions.test.ts`, `tests/request.test.ts`, in CI, on Node's SQLite
shaped like a Durable Object's): a token's shape, and the hash of a known one against the value
two other tools give; that no column of the database holds a token; that a token is recognized
only in its own database, and that a session's id, or the token where its hash belongs, signs
nobody in; both time limits to the millisecond; the clock going back by less and by more than a
minute; how many statements read and write, with a thousand wrong tokens writing nothing; the
ninth sign-in; fourteen sign-ins that are refused and write nothing; ending one, all, and all
but one; the database failing half-way through a sign-in; the cookies as exact text; twenty-two
cookie headers that are not a session, a planted second cookie among them; eighteen origins that
are not ours. Each of the 58 checks in the two files was taken out in turn: each makes a test
fail.

Not written with 1.7, and now in 1.8: the Worker and the Durable Object that call these
functions, trading the handoff code, the gate (SEC-10), the events log (SEC-17), and a limit on
how often an account signs in.

### 1.8 The server's shell: a request's way in (ARCH-3, ISO-1, ISO-2, SEC-1, SEC-4, SEC-5, SEC-10)

One Worker, `moneylens`, to be served on `money.changle.ca` and nothing else there (D2). It is
not published: no Workers Build is connected to its folder, and its gate is shut in the
repository. Two classes of Durable Object, both on SQLite. `VaultDO` is one person's: named by
the account's id, it holds that person's sessions (1.7), sealed chunks (1.6), an events log, and
one row saying whose it is. `Registry` is one object that knows which accounts have ever signed
in, and nothing else about them; it also keeps one value that is about no account, the stamp
(below).

The rules stay in plain functions, tested on Node's SQLite: `gate.ts`, `account.ts`,
`registry.ts`, `wire.ts`, `flows.ts`, beside `sessions.ts`, `request.ts`, `chunks.ts`. `worker.ts` reads
requests and adapts storage. It is tested on Cloudflare's own runtime on a developer's machine
and in CI (`npm run test:server`), with a stand-in for the accounts service.

**What comes in.** `GET /enter` and `POST /api/...`; everything else is "no such thing".

- `/enter` makes a nonce (256 random bits), sets it in the `__Host-ml-n` cookie and sends the
  browser to the main site with it. The main site has the accounts service make a handoff code
  bound to that nonce and sends the browser back (ARCH-3).
- Every `/api` request is refused unless it is a POST whose `Origin` is exactly the configured
  origin (`fromOurOrigin`, SEC-4; the expected origin is the setting `ORIGIN`, and with no such
  setting nothing is answered at all), unless the gate is open, unless its body says what kind
  it is (`application/json`, or `application/octet-stream` for a push) and states a length no
  greater than that kind may have: 4,096 bytes, or for a push 8 MiB of blobs and a 64 KiB head
  (SEC-5). No `Access-Control-*` header is ever sent, and `OPTIONS` is refused.
- `POST /api/session` trades the code, Worker to Worker (`ACCOUNTS.redeem(code, "moneylens")`),
  and compares the nonce the code was bound to with the cookie's, every character. A code that
  is wrong, used, out of time, for another audience or bound to another browser gets one answer.
  Then the gate is asked, a token and a session id are made here (never taken from the caller),
  the account is noted in the registry, and `signIn` opens the session in that account's own
  object, unless a notice from the accounts service came in the meantime (below). Opening it is
  one transaction: the tables the first time, the session, the oldest session it pushes out
  when there are eight, and the line in the events log are written together or not at all, so
  a sign-in that fails half way leaves every device that was signed in, and no session whose
  token nobody was given. The answer sets `__Host-ml` and clears the nonce's cookie. The session's label is
  worked out from the User-Agent out of a fixed set of words ("Chrome on Windows"); none of the
  request's own text goes into it. The code, the nonce and the token are never logged; what is
  logged of an error is its kind.
- Any other request names its account in its cookie. That name picks the object and is compared
  there with the account the object belongs to; it grants nothing (ISO-2). The Worker hashes
  the token and hands the request on with its body unread, as a stream. The object looks for
  the session before it reads the body, so that someone with no session cannot make it hold
  megabytes; then it reads the body; then, with nothing that waits in between, `act` checks the
  session again and does what was asked (the third obligation of the review of 1.7). A request
  that names an account, a session or a vault in its body has those used as what they are: a
  session id is looked up among this account's own, and a vault id is compared with the one
  this database holds.
- Every answer carries `Cache-Control: no-store`, HSTS, `nosniff`, `Referrer-Policy:
  no-referrer`, `frame-ancestors 'none'` and a policy that loads nothing (SEC-1). An answer that
  there is no session, or that the account is not let in, clears the cookie. A database that
  cannot be read, or a row in it that holds nonsense (a count that is not a count: `chunks.ts`
  now checks), is answered with "unavailable" and nothing is done.

**The gate (SEC-10, T-23).** The setting `GATE`: `closed` (what the repository says), `owner`,
or `list`; anything else reads as `closed`. With `owner`, a sign-in is let in when the accounts
service says the account is the owner's, the object remembers what was said at the latest
sign-in, and every request is asked for it. With `list`, a sign-in is let in when the account's
id is in `ALLOWED_ACCOUNTS`, and the Worker asks the list on every request before any object is
reached, so taking an id off the list takes effect at once; the owner is on the list or is not
let in. A sign-in that is not let in writes nothing anywhere, the registry included. Opening
the gate is the operator changing that setting.

**A sign-in and a notice at the same time (`flows.ts`; the review of this section, finding
1).** A sign-in goes to three places one after another: the accounts service (the code), the
registry (the note), the account's object (the session). The accounts service's two notices,
"this account is gone" and "this account's address changed", go to two: the object and the
registry. Nothing holds those still, so a whole notice can pass between two steps of a sign-in.
Left alone, a code traded just before an address changed could open a session just after
everyone had been signed out; and a code traded just before an account was deleted could put
tables back into a database that had just been emptied, for an account the registry had just
forgotten.

Two things put them in order. The registry keeps a stamp: 128 random bits, new each time, and
one for everybody, since a sign-in does not know whose it is until its code is traded. A notice
sets a new stamp before it does anything else. A sign-in reads the stamp before it trades its
code, and the account's object reads it again just before it opens the session, and opens none
if the two differ. And the object counts, in memory, the notices that have done their work on
it since it was loaded: it takes the count, asks the registry, and opens the session only if
the count has not moved. From that second look at the count to the session's being written,
nothing waits.

For a notice about the account that is signing in, one of three things is then true. Its stamp
was set before the sign-in first read it: then the accounts service had done its own part
before the code was traded, and in that part it drops the waiting codes of an account it
deletes and of an account whose other devices it signs out (`site/worker/hub.ts`,
`endSessions`; `handoffCodes.ts`, `forgetHandoffs`), so a deleted account's code no longer
trades, and a code that still trades after a change of address is one asked for after the
change or by the one device the change left signed in. Or its stamp was set after that and
before the object read it: the stamps differ. Or its stamp was set after the object read it:
then its work on the object comes later still, either while the object waits for the registry's
answer, and the count has moved, or after the session was written, and ends it.

A sign-in turned away like this has written nothing, so there is nothing to undo and no undoing
that could fail half way. The person is asked to try again ("try-again", 503). If the account
has meanwhile been deleted, the Worker takes it off the registry again, emptying its database
first as the notice does; if it cannot, the entry stays for the weekly sweep, which goes by the
registry. The rule that holds throughout, a failure at any step included: there is never a
database the registry does not know of.

What this costs, and what it rests on. A notice about one account turns away the sign-ins of
other accounts that were under way at that moment; with twenty-five people that is rare, and
they try again. A sign-in asks the registry twice more than before. The count is in memory
only, which is enough: it has to hold from the object's first look to its second, within one
call, and an object that is restarted in between drops the call with it. The stamp is random
and not a number counted up, so that a registry put back from a copy cannot hand out a value it
had handed out before. The order rests on the registry being one object that does one thing at
a time, and on what the accounts service does before it tells MoneyLens, which is its code and
not this tool's: if it ever told the apps before dropping the codes, the first of the three
cases would no longer hold.

**What a wrong guess costs.** An address someone made up reaches an object only with the gate
open to the owner (with a list, the Worker stops it). There it costs one request and one read:
a database nobody signed in to has no tables, and none is made. A wrong token for a real account
costs one request and at most eight short rows read, and writes nothing. A made-up code costs
one read of the registry's stamp and one question to the accounts service. None of these is limited in
this code, because an object cannot refuse a request without having been asked. A rule on
`/api/*` in Cloudflare's own rate limiting is a setting, to be asked of the operator before
Phase 3. Sign-ins are limited here: twelve an hour for one account (eight sessions are kept, so
signing in over and over would push a person's other devices out).

**Sync as it travels (`wire.ts`).** Blobs are not put into JSON. A push's body and the answers
to a push and a pull are a frame: four bytes of length, that many bytes of JSON naming each blob
and its length, then the blobs. Reading a frame checks its form (the blobs use up the bytes
exactly); what the names and numbers are worth is checked by whoever asked, `pushChunks` on the
server and `sync` on the device, as before. The reason is the platform: a Worker on the Free
plan has 10 ms of processor time for a request, which base64 and JSON of eight megabytes would
pass. It is not known whether a Free-plan Durable Object is held to the same 10 ms (Cloudflare's
page gives 30 seconds, and says objects have "the same per invocation CPU limits as any
Workers"). The local runtime does not enforce either. **To be measured at the first deploy,
before any real statement goes in:** a push of the largest size.

**Quotas (LIM-2, T-14).** `QUOTA_VAULT_BYTES` and `QUOTA_WRITES_PER_DAY`, each taken only as a
whole number within bounds (1 MiB to 100 MiB; 10 to 5,000), otherwise the default of 1.6. The
day the writes are counted for is the object's own UTC day and never an earlier one than the
last day it wrote on: a clock set back does not hand out a second day's writes.

**The events log (SEC-17).** In the person's own database: what happened (a sign-in, a
sign-out, a session ended from another device, a vault started, an email change), when, and in
which session. No contents. Twelve months are kept and at most 500 lines; the person is shown
the newest 50. Failed attempts are not logged there: they would let a stranger write to a
person's database. Unlocks, exports, deletions and consent changes are not logged yet; they
come with the screens that do them.

**The other way in.** `Internal`, reachable only over a service binding from the accounts
service: `accountGone(id)` sets a new stamp, empties the account's object (`deleteAll`) and
takes it off the registry, in that order; `accountChanged(id)` sets a new stamp and ends all
the account's sessions; `count()` says how many accounts are noted. All answer normally for an
account that was never here, and the first two throw when they fail, so that the caller tries
again; a notice whose stamp could not be set does nothing else.

**Decided here.** A restored database can bring back sessions that had been ended, up to
twelve hours' worth: the restore runbook ends every session of a restored account
(`accountChanged` does it). The device's `Remote` over HTTP (`web/remote.ts`) throws for every
answer that is not the store's, which `sync` reports as no answer, and marks apart the one the
screen must act on: the server saying this browser has no session.

**Tested.** On Node: every rule above that is a function, and each of 98 of their checks taken
out in turn fails a test. A sign-in and a notice are run in every order their steps can come in
(`tests/flows.test.ts`): each call on another object is a step, a call into an account's object
is three (it arrives, the object's question reaches the registry, the answer comes back), which
gives 715 orders for nine steps of a sign-in and four of a notice. That is done for a deleted
account and a changed address, for an account that was here before and one that was not, for a
code that the change dropped and one it left, for someone else's notice, for a notice that
fails at its work and is sent again (5,005 orders), and with each step of the sign-in made to
fail in turn. After every step the registry must know of every database there is; at the end a
deleted account has no database and no entry, no session lives that was opened by a code traded
before a change, and no session exists that the sign-in did not say "ok" for. The object's own
class is loaded on Node as well (`tests/objects.test.ts`), with a registry whose answer the
test holds back, to show that a notice's work done meanwhile is counted, an emptying before it
is over included. Signing in is run with each of its writes failing in turn, for a first
sign-in, a second and a ninth: the database is left exactly as it was.

On the local runtime: T-1 and T-2 (two people, through every route, with each other's names,
tokens and ids), T-3, T-22 (every route, sync included, from other origins and from the main
site), T-23 (each gate), T-14, T-6 (two devices sync real sealed records through the Worker,
and every file the runtime kept is searched for what they wrote), the body limits, `Internal`,
the registry, and that everything is still there after the runtime stops and starts. A notice
is made to come while a code is being traded (the stand-in for the accounts service sends it
from inside its answer to the trade): the sign-in is turned away with nothing opened, for a
changed address, for someone else's notice, for an account's first sign-in and for a deleted
account, which is then off the registry. And a transaction inside a transaction is shown to do
on the platform what signing in takes it to do: the outer one failing undoes the inner one's
writes, and what was thrown comes out as the thing that was thrown. Fifteen checks in
`worker.ts` were taken out in turn: each fails a test there.

**Not in this.** Erasing a vault and its seven-day delay (VAULT-5, VAULT-7), which needs a
design on the device's side for proving that a session has the vault unlocked. The weekly sweep
(ARCH-10); the registry it will read exists. Consent and eligibility. The app's pages, and with
them the page that finishes a sign-in and the content security policy of pages that load
something (SEC-2). The main site's page that asks for the code. The limits of the platform at
their real sizes, and what a call is billed, which only a deploy can show.

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
- **Rollback, deletion, withholding.** The server can hand back an older copy of a chunk, or
  none. A device that has synced before notices and stops (1.6). A device that has never synced
  cannot notice: it has nothing to compare with. And a server that simply does not pass on newer
  copies is noticed by nobody. The digest is not a defence against a server that lies, which can
  compute any digest it likes; it is there for restores and faults. What a lying server cannot do
  is make a device that holds a copy of a chunk accept an older copy of it as newer, since the
  copy's own count and history are sealed with it. (It could hand over a copy from another
  branch that is sixteen or more versions on, if two devices had ever been allowed to write from
  the same copy; an honest server never allows that, and a dishonest one would need the devices'
  help to have such a branch.)
- **A refusal is believed.** Once an answer holds up as an answer to the request that was sent
  (1.6), the store takes "refused" to mean that the request wrote nothing, and stops keeping the
  copy it sent. A server that refuses a write and applies it later all the same can bring back,
  on that device's next sync, something its owner had undone in between. Like withholding, that
  takes a server that lies; one that merely fails, or a network that loses or delays things,
  does not do it.
- **Clocks.** When two devices change the same field of the same record without having seen each
  other's change, the later clock wins, and a device with a wrong clock can win or lose such a
  tie wrongly. A record has one time, not one for each field: after a merge, a field that came
  from the older side carries the merged record's later time into the next comparison. Between
  the copies of a record found in more than one chunk (1.6), which should never happen, the same
  clocks decide every field the copies give differently. Nothing else depends on clocks.
- **The version byte.** A blob's first byte is checked but not protected on its own. Changing it
  makes the blob fail to open; the app may then say it looks newer than the app, which is a wrong
  message, not an exposure.
- **Metadata.** The number of chunks, their sizes and the times they change are visible to the
  server. Chunk sizes are not padded.
- **Memory.** JavaScript cannot wipe memory reliably. Secrets the code holds as bytes are zeroed
  after use, on the paths that fail as well (the one place that did not, found by the second
  opinion, was fixed in #727); a passphrase held as a string by the page cannot be.
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
- The handoff, the allowlist, the Worker, the Durable Object and resetting a vault: sections to
  add with the server. Sessions and the origin check are written (1.7). The server's side of the two sync calls, with its
  quotas, is written and passes the tests the one in memory passes (1.6, "The server's code").
  The operator's way of changing the quotas (LIM-2) comes with the Durable Object.
- The code that talks to the server over the network. On top of what the store does (1.6,
  "Answers that are not answers") it owes: a time limit of its own on each request, shorter than
  the store's, and cancelling what it gives up on; refusing an answer larger than a page or a
  batch may be before reading it into memory; and turning whatever arrives into the plain shapes
  the store checks, with bytes as bytes.
- After "the server's copy went back", putting this device's copy back on the server (for the
  case where the platform lost data and a device still has it). Decided so far: it would keep
  everything either side has, at the price that a record removed on one side only can come back.
  Not built; today's way out is to take the server's copy.
- Splitting a chunk that a merge made too large for records this device did not add (1.6).
- Chunk sizes are not padded (section 2, "Metadata"). Whether to pad to a few fixed sizes is
  open; it costs storage against the 10 MB a user has.
- A record altered in storage and a wrong secret look the same (1.3). When sync is built, the
  device should also keep a fingerprint of the wrappers it has seen, so that it can say "this
  record changed since this device last saw it" instead of "wrong passphrase".
- An estimator of guesses on the passphrase screens, on top of the floor (1.4).
- Reviews under SEC-9 are recorded in the pull request (#653: five rounds, the last approving the
  commit that was merged). All of them were done by another Claude model, which had not seen the
  code being written, because the other vendors' tools were not reachable that night. The second
  opinion from another vendor's model followed (#692, `reviews/vault-second-opinion.md`). The
  storage layer of 1.6 was reviewed by that other vendor's model before it was merged; the
  review is recorded in its pull request and in `reviews/`.

# MoneyLens

A personal finance organizer for changle.ca: statement files exported from a bank's own website
are read in the browser, reconciled, de-duplicated and classified, and kept in a vault that is
encrypted before it leaves the device. The app will run at **money.changle.ca**, with an intro page
and a card on the Tools tab at changle.ca/tools/finance. **Nothing is live yet.**

The requirements are `docs/moneylens.md` (their IDs, like `ACC-2` and `T-10`, are used in the code
and tests). The decisions taken, where it stands and what is next: `docs/briefs/moneylens.md`.

## Three rules before touching anything

1. **No real financial data, anywhere but inside the product** (SEC-12). Not in fixtures, tests,
   screenshots, pull requests, logs, or any AI tool. Every sample in `tests/` is invented.
2. **Exposure is a gate on the server, not a held-back merge** (SEC-10). Merging deploys, as
   everywhere in this repository; MoneyLens stays behind its allowlist until the owner opens it.
3. **Sign-in, session, crypto, sync and authorization changes need a recorded review by someone
   who did not write them** (SEC-9), in the pull request, before merging.

## What is here

`src/core/`: the rules, with no browser and no Cloudflare in them, so tests import them directly.

| File | What it does |
| --- | --- |
| `money.ts` | Amounts as whole smallest units (ACC-1); reading and writing them as text, digit by digit |
| `dates.ts` | Calendar days as the statement wrote them (ACC-5); day arithmetic |
| `text.ts` | Bytes to text; tidying; account and card numbers cut to their last four digits (IMP-6) |
| `csv.ts` | A CSV reader with limits |
| `sniff.ts` | What a file is, from its bytes (IMP-4) |
| `ofx.ts` | The OFX/QFX parser, one for every bank (IMP-3) |
| `anycsv.ts` | A CSV file from any bank: the layout is worked out from the file, what the file leaves open is said, and the layout is kept with the account (IN-2 as amended) |
| `read.ts` | The front door for a file: sniff, hand it to the reader for its format, or refuse with a reason |
| `reconcile.ts` | Opening balance plus lines equals closing balance, to the cent (ACC-2) |
| `dedupe.ts` | Duplicates across overlapping files of one account (ACC-3) |
| `transfers.ts` | Pairing moves between the user's own accounts and card payments (ACC-4) |
| `classify.ts` | Categories, rules, merchant aliases, the dictionary, and their order (CLS-1 to CLS-3) |
| `analytics.ts` | Income, spending and totals by category, per currency |
| `recurring.ts` | Subscriptions and regular bills found in past transactions |
| `model.ts`, `ids.ts` | The shapes kept in the vault; random 128-bit identifiers (ISO-3) |

`src/vault/`: the vault's cryptography, the browser's own WebCrypto and nothing else. What it does
and what it does not is in `docs/moneylens/security-assessment.md`. **Changes here need a recorded
review by someone who did not write them before merging** (SEC-9).

| File | What it does |
| --- | --- |
| `crypto.ts` | The vault key, its wrappers (passphrase, recovery code, passkey), sealing and opening chunks (VAULT-1 to VAULT-3, VAULT-7) |
| `recovery.ts` | The recovery code: 160 random bits a person can copy by hand, with a check for slips |
| `passphrase.ts` | How a passphrase is normalized before it makes a key, and the floor it has to clear (VAULT-7). The floor errs both ways on purpose; how often, measured, is in the assessment (1.4) |

`tests/golden.ts` is a vault made once and stored. **Never regenerate it.** If it stops opening,
the change that broke it would lock real users out of their vaults: the stored format and the
passphrase normalization can only change with a new version that still reads the old one. (Its
passphrase wrapper was made a second time before this code was first merged; the file's header
says why. That was the last time.)

## Any bank's file

There is no list of banks: people upload the statement their own bank gives them (the operator's
decision of 19 November 2026, recorded at IN-2). The readers are by format. An OFX or QFX file
says what it holds. A CSV file doesn't, so `anycsv.ts` works its layout out of the file: where
the table is, which column is the day and in which order its numbers are written, where the money
is and which way it went, and which column is the balance after each line. A balance that follows
from the amounts is the strongest evidence a file gives. Nothing is saved before the person has
seen the preview (IMP-6) and the import has been reconciled (ACC-2).

What a screen that imports a file has to do:

- Pass the account's `kind` whenever it is known. A card's file reads the other way round. Without
  the kind a file is read as a bank account's, and the statement comes back with no kind: when the
  person then says it is a card, read the file again from the start.
- Treat `date-order-guessed` and `sign-guessed` on a statement as questions for the person. The
  answer changes one field of the layout, and the file is read again with it (`readCsvAs`).
- On `layout-unclear`, show the table (`csvPreview`) and let the person say which column is which.
  The reader refuses rather than pick between two readings.
- Keep the confirmed layout with the account and pass it with that account's next file. A layout
  that no longer fits (other column names, another width) is not forced on the file.

Limits, known and left for now:

- PDF statements are not read yet.
- A row whose width differs from the table's is not read as a line. It is counted and said, and a
  file with many such rows (one that drops the empty cells at the end of its lines) is refused.
- A date with a two-digit year first ("26/10/05") is refused.
- Without column names, a column of account numbers is only told from a column of references when
  each number recurs over many lines.
- A card file that lists two card numbers comes back as two statements.
- In a file of several accounts, one rule for the signs is applied to all of them.
- A card that is in credit for most of a file, with what is owed as its balance, reads the wrong
  way round.

Each of these shows in the preview or refuses the file. None has been checked against a real
export yet: that is Phase 2, with the operator's own statements, through the fixture tool (IMP-9).

A parser for one bank can still be registered in `CSV_PARSERS` (`read.ts`), and is tried first,
for a bank whose export the general reader gets wrong. It is written from a synthetic sample
(IMP-9), with its fixtures and a reconciliation test.

## Run it

Node 22, in this folder:

```
npm ci
npm run typecheck
npm test
```

CI is `.github/workflows/moneylens.yml`: the same three, plus an audit of what ships.

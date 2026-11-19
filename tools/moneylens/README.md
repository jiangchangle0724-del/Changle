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
| `read.ts` | The front door for a file: sniff, pick the named parser, or refuse with a reason |
| `reconcile.ts` | Opening balance plus lines equals closing balance, to the cent (ACC-2) |
| `dedupe.ts` | Duplicates across overlapping files of one account (ACC-3) |
| `transfers.ts` | Pairing moves between the user's own accounts and card payments (ACC-4) |
| `classify.ts` | Categories, rules, merchant aliases, the dictionary, and their order (CLS-1 to CLS-3) |
| `analytics.ts` | Income, spending and totals by category, per currency |
| `recurring.ts` | Subscriptions and regular bills found in past transactions |
| `model.ts`, `ids.ts` | The shapes kept in the vault; random 128-bit identifiers (ISO-3) |

There is no CSV parser for any bank yet. Each one is written from a synthetic sample of that
bank's export (IMP-9) and added to `CSV_PARSERS` in `read.ts` with its fixtures and a
reconciliation test. A file no parser recognizes is refused and nothing is saved.

## Run it

Node 22, in this folder:

```
npm ci
npm run typecheck
npm test
```

CI is `.github/workflows/moneylens.yml`: the same three, plus an audit of what ships.

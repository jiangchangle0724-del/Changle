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
| `pdftext.ts` | The text of a PDF as runs with where they sit on the page, and those runs gathered into lines (IMP-4) |
| `pdfstatement.ts` | A statement in PDF read into its lines and its balances, from those runs: the table found by its row of column names (IMP-3) |
| `model.ts`, `ids.ts` | The shapes kept in the vault; random 128-bit identifiers (ISO-3) |

`src/vault/`: the vault's cryptography (the browser's own WebCrypto and nothing else), and keeping
its records on a device and on the server. What it does and what it does not is in
`docs/moneylens/security-assessment.md`. **Changes here need a recorded
review by someone who did not write them before merging** (SEC-9).

| File | What it does |
| --- | --- |
| `crypto.ts` | The vault key, its wrappers (passphrase, recovery code, passkey), sealing and opening chunks (VAULT-1 to VAULT-3, VAULT-7) |
| `recovery.ts` | The recovery code: 160 random bits a person can copy by hand, with a check for slips |
| `passphrase.ts` | How a passphrase is normalized before it makes a key, and the floor it has to clear (VAULT-7). The floor errs both ways on purpose; how often, measured, is in the assessment (1.4) |
| `records.ts` | What is inside a chunk of records, and how two copies of one chunk are merged, record by record and field by field (VAULT-4) |
| `sync.ts` | `Store`: every record in memory while the vault is open, packed into sealed chunks; the cache on the device and the server as the store sees them; receiving, merging and sending (VAULT-4) |
| `memory.ts` | A server and a cache in memory. The server is the rule book for the real one, which is not written yet, and what the demo will run on |

`tests/golden.ts` is a vault made once and stored. **Never regenerate it.** If it stops opening,
the change that broke it would lock real users out of their vaults: the stored format and the
passphrase normalization can only change with a new version that still reads the old one. (Its
passphrase wrapper was made a second time before this code was first merged; the file's header
says why. That was the last time.)

## The server's side, so far

`src/server/chunks.ts`: the two calls of sync (pull and push) as the server will run them, as
plain functions on one person's own SQLite database, which is what a Durable Object has. It is
the rule book in `src/vault/memory.ts` over again, and `npm test` runs every test of the store
against both (`tests/sync-sql.test.ts`, on Node's SQLite through `tests/sqlremote.ts`). What its
database holds, and why the digest is worked out and not kept, is in the assessment (1.6, "The
server's code").

`src/server/sessions.ts`: who is signed in, kept in the same database. Signing a device in,
recognizing its token (only the token's hash is kept), the two time limits (30 minutes quiet,
12 hours in all), ending one session or all of them, and the list a person sees.
`src/server/request.ts`: the two cookies as text, and whether a request came from a page of
ours (`Origin`, exactly). Both are in the assessment (1.7). For whoever writes the Worker:

- Hash first, then ask: `checkSession(db, await hashOf(token), Date.now())`. Nothing that waits
  may come between a function's first read and its last write.
- The account id in the cookie only picks the database. Never answer from it.
- Everything that reads or changes a person's data is a POST, refused unless `fromOurOrigin`
  says yes. A GET hands out pages and nothing else.
- `ctx.storage.transactionSync` goes behind `atomically`. No `BEGIN` in a Durable Object.

`src/server/worker.ts` is the Worker that serves them, with each person's Durable Object
(`VaultDO`), the registry of accounts (`Registry`) and the accounts service's way in
(`Internal`). It decides nothing itself: `gate.ts` reads the operator's settings (the origin,
the gate, the quotas), `account.ts` is everything one person's object does (signing in, and
every request that comes with a session), `registry.ts` notes which accounts have signed in,
and `wire.ts` is how a push and the answers to sync are written for HTTP (a frame, not JSON:
the reason is in the assessment, 1.8). `src/web/remote.ts` is the device's end of it.
`src/vault/protocol.ts` is what both ends go by; neither imports the other.

`flows.ts` is what is done across more than one object, and in which order: trading a code for
a session, and the accounts service's two notices (an account is gone; its address changed).
The order is a rule: a notice sets the registry's stamp before it does anything else, a sign-in
reads the stamp before it trades its code, and the account's own object reads it again, and
looks at its own count of notices, right before it opens the session. Whoever adds a step that
touches another object adds it there, and to `tests/flows.test.ts`, which runs a sign-in and a
notice in every order their steps can come in and checks, after every step, that the registry
knows of every database there is. In `VaultDO.signIn` nothing that waits may come after
`signInHere` has asked the registry; and a method that does a notice's work on an object counts
it first (`this.noticed++`) and only then does the work (`tests/objects.test.ts`).

**Not published.** `wrangler.jsonc` is the Worker's settings, with the gate shut (`GATE`:
`closed`, `owner` or `list`). Nothing is live until a Workers Build is connected to this folder
in Cloudflare, which is Steve's to do, and the gate is his to open.

`npm run test:server` runs the Worker on Cloudflare's own runtime on this machine (`wrangler
dev`) with a stand-in for the accounts service (`tests/accounts`), which is also the door the
tests come in by. It is not part of `npm test`. The Worker's own files are type-checked against
Cloudflare's types by `src/server/tsconfig.json` (`npm run typecheck` runs both).

## The store: where records are kept

Everything the app keeps (accounts, transactions, imports, rules, budgets) is a record: an id, a
kind, and fields. `Store` (`src/vault/sync.ts`) holds them all in memory while the vault is open.
How it packs, merges and sends them, and what the server can and cannot do to them, is in the
assessment (1.6). What a screen needs to know:

```ts
const store = await Store.open(vault, cache);          // from this device's cache; then:
const result = await store.sync(remote);               // receive, merge, send
store.add("txn", `t/${account.id}`, txn);              // kind, group, the record (with its id)
store.change(txn.id, { category: "groceries" });       // only the fields named; `undefined` takes one out
store.remove(txn.id);
store.get(id); store.list("txn");                      // what comes back is frozen: change it through the store
await store.flush();                                   // seal what changed and write it to the cache
```

- **The cache.** In a page: `holdCache()` from `src/web/idbcache.ts`. It answers with the cache,
  or `"taken"` (MoneyLens is open in another tab of this browser: say so, and do nothing else),
  or `"unavailable"` (a private window, storage switched off, a browser that refuses locks, or
  storage left by a later version of the app: run on `new MemoryCache()` and say that nothing is
  kept on this device). Never open storage with `openCache` in a page: that skips the lock. Let go of it (`release()`) when the vault locks.
- **Groups.** `"book"` for accounts, imports, categories, rules, aliases, budgets and settings;
  `"t/<account id>"` for an account's transactions. A group only decides which records share a
  chunk. One import is then one request that is saved whole or not at all.
- **Flush often, send seldom.** A change is in memory only until `flush`. Flush within about a
  second of a change, and when the page is hidden. Send (`sync`) when the page opens, after an
  import, and otherwise no more than about once a minute while the person is working: every send
  that changes a chunk counts against the 300 writes a day (LIM-2).
- **Show what is not on the server yet.** `store.status().pending` is how many chunks have
  changes that only this device holds. Safari empties a site's storage after seven days without
  a visit, so "saved on this device, not yet on the server" has to be visible.
- **`sync` says what happened.** `ok`, with `clashes`: changes the merge could not keep (a field
  both devices changed: the later change won; a record changed here and removed there), and two
  that should never come up (`kind`, `doubled`). Worth a line to the person, not a dialog. Or not `ok`, with why:

  | `why` | What to do |
  | --- | --- |
  | `offline` | Nothing. Try again later; whatever was sent is sorted out then |
  | `quota-bytes`, `quota-writes` | Say the vault is full, or that today's saves are used up. Changes stay on the device |
  | `newer` | Another device runs a later version of the app: ask to reload the page |
  | `wrong-vault` | The vault was reset on another device: lock, empty the cache, start again |
  | `server-older` | The server's copy is behind what this device saw (a restore). Offer an export, then "use the server's copy": empty the cache and open again |
  | `unreadable`, `malformed`, `too-big`, `bad-reply`, `bad-request` | Something is wrong that the person cannot fix: say so, keep working on the device, report it (no contents in the report, OBS-1) |
  | `busy` | Other devices kept writing: try again shortly |

- **Ids are random, always.** Every record gets `newId()`. Never a fixed or worked-out id (not
  for "the" settings record either: two devices would each make one, in different chunks). If an
  id does turn up in more than one chunk, the store reads the copies as one record, says so once
  (`doubled`), and makes the copies alike at the next sync; it never moves or drops a copy on its
  own, so a removal, or a field taken out, can come back and may need doing again (assessment
  1.6, "What this cannot do").
- **A request that gets no answer** is given up after two minutes (`Store.open(…, { patience })`
  sets another time, in milliseconds) and counts as `offline`. The code that talks to the server
  should give up sooner than that itself.
- **After a merge, two records can disagree** (a transfer paired with different transactions on
  two devices; a transaction whose account was removed elsewhere). Treat a pair as a pair only
  when both sides name each other, and a missing account or category as none.
- **Limits a screen can hit:** a record is at most 4,096 bytes as JSON (`too-big`), so notes and
  splits need their own limits in the form; `full` means the chunk a record lives in cannot grow
  (it takes hundreds of records at their largest).
- `store.changes` goes up whenever anything in the store changes, from here or from the server:
  a view that remembers what it showed compares it.

## A statement's way into the vault

`src/app/ledger.ts` is the typed side of the store (`accounts`, `txns`, `imports`, `bookOf`) and
the one way a statement is saved. Two steps, because the person has to see it first (IMP-6):

```ts
const shown = preview(store, statement);               // changes nothing
// shown.account         the account it belongs to; null: the person picks (shown.candidates) or makes one
// shown.reconciliation  whether the lines add up to the balances the file states (ACC-2)
// shown.rows            every line: fresh, exact (the account holds it) or likely (it probably does: ask)
// shown.rows[i].classified  what a new line would be filed under, and why (CLS-1, CLS-2)
const saved = save(store, shown, { account: shown.account.id, alsoNew: [3] });
await store.flush();
await store.sync(remote);
```

- **Another account than the preview's?** Make the preview again, `preview(store, statement, id)`:
  which lines count as held depends on the account, and `save` refuses a preview made for another
  one (`another-account`). A new account is `{ account: { name, kind } }`, with a preview that
  found none.
- **All of it or none.** `save` adds the account if it is new, the new lines and a record of the
  import, or nothing (`nothing-new`, `too-big`). They go to the server as one batch, so the same
  holds there.
- **`likely` lines are left out** unless the person says they are new (`alsoNew`, by their place
  in `rows`). `exact` ones are always left out.
- **A file that states only its closing balance** is checked against the balance the account's
  last import ended on, when the file carries on from that import. A line missing in between
  then shows as a mismatch.
- **What comes out of the store is checked.** A record that is not what its kind says (written
  by another version, or merged from two devices) is left out, not trusted.
- A CSV layout the person confirmed is kept with the account (`layout`), for the next file.

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

- A statement in PDF is read by `pdfstatement.ts`, which has rules and limits of its own (below).
- A row whose width differs from the table's is not read as a line. It is counted and said, and a
  file with many such rows (one that drops the empty cells at the end of its lines) is refused.
- A date with a two-digit year first ("26/10/05") is refused.
- Without column names, a column of account numbers is only told from a column of references when
  each number recurs over many lines.
- A card file that lists two card numbers comes back as two statements.
- In a file of several accounts, one rule for the signs is applied to all of them.
- A card that is in credit for most of a file, with what is owed as its balance, reads the wrong
  way round.
- A card's file with no balances and no line that names a payment has its signs guessed
  (`sign-guessed`), and the person is asked.

Each of these shows in the preview or refuses the file. Checking against real exports is Phase 2,
with the operator's own statements, through the fixture tool (IMP-9). The first one came on
25 November 2026, a card's, and was read the wrong way round: with no balances in the file, the
reader takes a card's signs from its payments (a payment is money in), and it looked for the word
in every column of text. That export gives each merchant's trade in a column of its own, and a
trade can be a "payment service". Now the reader looks where the lines are described, when the
file names that column, and a line that thanks for a payment ("PAYMENT - THANK YOU", "PAIEMENT -
MERCI") settles it before a bare "payment" is gone by, which can be a shop's name or a bill paid
with the card.

A parser for one bank can still be registered in `CSV_PARSERS` (`read.ts`), and is tried first,
for a bank whose export the general reader gets wrong. It is written from a synthetic sample
(IMP-9), with its fixtures and a reconciliation test.

## The statement check, and fixtures from real statements

`npm run build` writes `dist/moneylens-check.html`: one page, with everything inside it, that the
operator opens from his own disk. He picks a statement file (CSV, OFX, QFX or PDF) and sees what
the readers made of it: the transactions, whether the sums agree, and what the reader had to
assume. The file is handled in that browser only. The page's policy forbids the network: nothing
can be loaded and nothing can be sent (`web/check/page.html`; `scripts/check-page.ts` tries).

It is also the fixture tool of IMP-9. From a real statement it offers two things to share, and the
statement itself stays where it is (SEC-12):

- **The invented copy** (`src/fixture/`). A CSV file comes back with the same lines, fields,
  delimiter, quotes and line endings, the row of column names as it was, and every word and number
  under it invented (`invent.ts`): letters become other letters and digits other digits, a month
  stays a month and a day a day, moved, so the lines keep their order. A PDF comes back as its
  layout (`pdftext.ts`): every run of text where it sat on the page, with invented contents. The
  words statements are built from ("Balance", "Withdrawals", "Solde", "余额") are kept, because a
  reader looks for them. A number that names an account is invented once for each real number,
  through the whole file: what stands behind a mask ("****1234", "XXXX 1234"; the mask stays), and
  what stands in the column the reader takes the account from. One card in is one card out, and
  two are two, because a reader tells the accounts in a file apart by that number. Every digit of
  such a number is drawn again, the zeros and what looks like a year too (`renamed`).
- **The summary** (`summary.ts`): which reader took the file, the layout it worked out, how many
  lines it read, whether the sums agreed, and the shape of the first rows (9 for a digit, A for a
  letter). Nothing that was in the file.

The operator looks both over before sharing (IMP-9); the page shows the one line it kept as it was,
the row of column names, by itself.

Not yet: the numbers in an invented copy are invented one by one, so its balances no longer follow
from its amounts (the reader leaves such a balance out). A copy whose sums still add up needs the
reader's understanding of the layout and is the tool's next step. The layouts of PDF statements
collected this way are what the PDF reader is built from (next section).

## A statement in PDF

Most people's "bank statement" is a PDF. A PDF has no columns, only text at places, so
`pdfstatement.ts` reads one by rules, from the runs of text PDF.js gives (`src/web/pdf.ts`,
`pdftext.ts`):

- The table of transactions is found by its row of column names ("DATE", "DESCRIPTION", "AMOUNT
  ($)", "Withdrawals", "Deposits", "Balance", and the French and Chinese for them). A second row
  above it may finish the names ("POSTING" over "DATE"). A statement whose table has no such row
  is refused (`layout-unclear`); it is not guessed at.
- A line of the table starts with a date where the date column is, and ends with an amount where a
  column of money is (an amount has its cents). What stands between is its description. Up to
  three lines right under it, starting where descriptions start and ending with no amount, are
  more of its wording (`memo`): a town that did not fit, a purchase's foreign currency.
- Money: a column of withdrawals or debits is money out, one of deposits or credits money in.
  With one column for both, "CR" is money in and "DR" money out; a plain number is money out on a
  card's statement and money in on a bank account's; a minus or brackets turn it round. Whether
  the statement is a card's is what the person said, or else what its first page says
  ("Mastercard", "credit limit").
- The balances are read where the statement names them, a label and the amount beside it
  ("Previous balance", "New balance", "Total balance", "Opening balance"; a label, not a sentence
  that happens to start with one). A card's balance is what is owed: a balance below zero here,
  unless it says "CR". With no such labels, a balance after every line says both.
- A date without a year takes the statement's: the latest year that does not put the line more
  than a week past the statement's date or the end of its period. A statement that gives neither
  has those lines counted as not read.
- A line that starts like a transaction and could not be read is counted (`unread`,
  `lines-left-out`), never dropped silently.

What comes back is a `ReadResult` like any other reader's, and goes through the same check:
opening balance plus lines against closing balance (ACC-2). That check matters more here than for
any other kind of file: a table that was misread shows there, and almost nowhere else. The screen
that imports a PDF has to make an unreconciled one hard to save by accident.

Built from the operator's own statements, passed on as invented copies (IMP-9). The first was a
credit card's (25 November 2026): a summary page with the balances and the period, and a table
with two dates, a description, and one column of amounts. `tests/pdfsamples.ts` is a made-up
statement in that layout, through PDF.js in the tests and through the built page in
`scripts/check-page.ts`. Known limits, left for when a real statement shows them:

- A bank account's statement (money out, money in, balance) is read by the same rules and has not
  met a real one yet. Nor has a statement in French, or one with dates in numbers only.
- One statement comes back for the file. A card with a second cardholder is one account and reads
  as one; a PDF with two accounts in it will not reconcile.
- Interest and fees that a statement states only in its summary, and not as lines of the table,
  are not made into lines: the sums will differ by them, and the page says by how much.
- A scan has no text at all and is refused (IN-1). Text set in a font the PDF does not map to
  Unicode comes out as other characters: such a statement is not recognised, or does not
  reconcile.
- `readStatementFile` still answers `pdf-not-yet` for a PDF's bytes: it has no PDF.js. A screen
  calls `pdfPages` (in a worker) and then `readPdfStatement`.

`src/web/pdf.ts` is PDF.js used for one thing, text and where it sits (IMP-4): version 6.5.438
(4.2.67 or later is required), `isEvalSupported: false`, no fonts loaded into the page, nothing
drawn, nothing fetched, in a Web Worker in the browser, within 10 MB, 100 pages and 30 seconds.
The page uses PDF.js's `legacy` build, the one for browsers that are not the newest, for the page
and for the worker alike. The worker says when all of its script has run, and only then is it
handed to PDF.js; a worker that ran past the 30 seconds is ended, and the next file gets a new one.

When the page stops, it says where and with what kind of error, in words a person can act on and
with a code for whoever is asked about it: the step (`open`, `sort`, `reader`, `pdf`, `read`,
`summary`, `copy`) and the error's name ("reader · SecurityError"). Never the error's message,
which can quote the file (OBS-1). The summary carries the same, and the page's revision (`PAGE` in
`web/check/main.ts`: raise it whenever the page changes what it does, so that a summary says which
copy of the page it came from). Three stops have their own advice. A file the browser cannot open
(moved, held by another program, not yet down from a cloud folder): copy it to the desktop. A
reader that cannot start (a preview inside another program can forbid workers, and PDF.js parses in
one: IMP-4, so there is no reading without it): open the page's file in a browser directly. A PDF
that PDF.js cannot open at all ("InvalidPDFException") is called damaged; any other error of the
reader's is said to be the reader's, since another program may open the same file without
complaint. Shown inside another page, the page says so before a file is chosen.

## Run it

Node 22, in this folder:

```
npm ci
npm run typecheck
npm test
npm run test:page
```

`npm run test:page` builds the statement check and opens it in the Chrome already on the machine,
then tries the store's cache in that browser's own storage (`scripts/check-cache.ts`).

CI is `.github/workflows/moneylens.yml`: the same four, plus an audit of what ships.

The random run of the store's tests (three devices on a bad network) runs eight times in CI.
More: `MONEYLENS_SEEDS=500 npx tsx --test tests/sync.test.ts`. One of them again:
`MONEYLENS_SEED=37 npx tsx --test tests/sync.test.ts`.

What ships is small on purpose: PDF.js (`pdfjs-dist`, Apache 2.0) is the only package in the page.
The others (`esbuild`, `playwright-core`, `tsx`, `typescript`) build and test.

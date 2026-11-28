# 两清 · All Square: the server

The server behind **changle.ca/split**: ledgers shared between phones. The pages themselves are the
main site's (`site/src/split/`); this Worker answers only `changle.ca/split/api`.

The plan is `docs/split.md`; where it stands and what's next is in `docs/briefs/split.md`.
**It is live** at `changle.ca/split/api` since 2026-11-13, and the pages at changle.ca/split keep
their ledgers on it (how a phone talks to it is `site/src/split/net.ts`, and when,
`site/src/split/syncer.ts`; a signed-in account's ledgers, `site/src/split/syncing.ts`). Since step
6b the pages sign in to start a ledger.

## How a change goes live

Merge into `main`. Cloudflare builds and publishes the Worker `split` by itself (Workers Builds:
root directory `/tools/split`, no build command, `npx wrangler deploy`, branch `main`, no preview
builds). It watches three paths, because the server is bundled from the phone's own rules:
`tools/split/*`, `site/src/split/*` and `site/src/tools/money.ts`. If the server ever imports
another file of the site's, add its path to the Worker's build watch paths in Cloudflare (Settings,
Builds), or a change there will publish the site and leave the server behind.

## How it is made

| Folder | What |
| --- | --- |
| `src/room/ledger.ts` | One ledger on the server: who may open it, who owns it, the order changes arrived in, the record of them, deleting it. Plain logic over a small store, so it is tested without Cloudflare. |
| `src/room/account.ts` | One changle.ca account's ledgers ("my ledgers"), with their keys, and how many it started today; the room its files use. Plain logic too. |
| `src/room/nightly.ts` | When the nightly checks run: 10:00 UTC (2 or 3 a.m. in Vancouver), each ledger and account at a minute of its own. |
| `src/room/protocol.ts` | What the phones and the server say to each other, address by address. |
| `src/server/worker.ts` | The Worker: routes, the Durable Object that wraps a ledger (`LedgerDO`, SQLite), the one per account (`AccountDO`, SQLite), the daily allowance of new ledgers per network (`GateDO`), and `Internal`, the entrypoint only the rooms server reaches (an account deleted). |
| `src/server/who.ts` | Whose a sign-in is: asked of the rooms server over the `ROOMS` binding. |
| `tests/` | The room and the account (`npm test`), and the server itself on Cloudflare's own runtime (`npm run test:server`, which starts `wrangler dev` with the stand-in rooms server in `tests/rooms`, which knows the sessions in `tests/accounts.ts` and who is friends with whom, is bound back to `Internal` as the real one is, and says an account is deleted the way the real one does; and a bucket kept on disk; an account's room there is `TEST_QUOTA` bytes, small enough to fill). |

What a change does, that it counts once, and what is refused are **not** here: those rules are the
phone's own, `site/src/split/changes.ts` (with `ops.ts` and `core/`), imported from there so the
phone and the server can't disagree. Their tests are `site/tests/split-changes.test.ts`.

### What is kept

Each ledger is one Durable Object with its own SQLite database: the ledger (its name, currency,
people, entries, and since when it is locked if it is), the SHA-256 fingerprints of the key that
opens it and of its owner's key, the id of every change it has been sent with whether it counted,
and the record of the ones that did (each with a number, the time it arrived, and who made it as
the phone said: the person in the ledger its owner said they are, when it said; since 2026-11-14),
which also has a line for each time the ledger was locked or opened again. A ledger its owner deleted keeps only
the time it was deleted.

Each changle.ca account that has signed in here has one Durable Object too: its ledgers, each
with the key that opens it, the owner's key for the ones it started, and which person in it the
account is; and how many ledgers it started today. Unlike a ledger's, these keys are kept as they
are: that is what lets a new phone signed in to the account open its ledgers, and still be the
owner. Only that account's sign-in reads them. No email, no names, no addresses: the account is
its id at the rooms server. A network's address is kept only as a fingerprint, for two days, to
count the ledgers it made today.

Receipt photos and PDFs go in one R2 bucket, `split-files` (the `FILES` binding), made in the
dashboard on 2026-11-14: private, no public address, read and written only by this Worker, each
file at `<ledger>/<file id>`. The ledger keeps the list of its files (id, size, kind, when, and which
account sent it); the account keeps every file it sent that is still kept, which is what its room
of 500 MB is counted from (the plan's 云存储, `docs/split.md`).

### Receipt photos

- Whoever holds the key lists a ledger's files, reads one, and takes one off (as they can change
  any expense). Storing one also needs a sign-in, and is charged to that account before the file
  goes in the bucket; taking it off, or the owner deleting the ledger, gives that account the room
  back, whoever does it.
- A file is a JPEG, PNG, WebP or PDF, and starts the way one does; at most 10 MB. Its id is the
  phone's, so one sent again (the phone wasn't sure it arrived) is the same file, charged once.
- A file comes back only with the key, as what it is, to be shown and never run
  (`Content-Security-Policy: sandbox`, `nosniff`), and is kept on the phone that asked.
- A locked ledger takes no new file and lets none go; its files can still be read.
- An expense says which files are its own (`files`, ids only: the phone's rules,
  `site/src/split/changes.ts`). Nothing here checks that an expense's ids are files the ledger
  has: a phone shows one that isn't as missing.
- A file no expense uses (taken off one, or on one deleted) is kept 30 days from when it stopped
  being used, so 改回去 and 恢复 can bring it back. Its sender can let it go sooner: "my files"
  says how many of theirs no expense uses, and `DELETE /me/files/unused` clears them, from every
  ledger (not one stored in the last hour, which may be on its way onto an expense).
- Every night (a Durable Object alarm, set when a ledger or an account gets its first file, at
  10:00 UTC and a minute of its own: `src/room/nightly.ts`) each ledger with files lets go of
  those no expense has used for 30 days, and of anything under its prefix in the bucket that its
  list doesn't have; a deleted ledger's leftovers go the same way, an hour or two after it is
  deleted. Each account with files is made to be charged for what the ledgers really keep (the
  plan's 以实际为准).
- When a changle.ca account is deleted, the rooms server says so through a Service Binding to
  this Worker's `Internal` entrypoint (`accountGone(id)`; no address of changle.ca leads there).
  Every file the account sent goes, from every ledger and the bucket, and then all that was kept
  for it: its ledgers, its room. Ledgers keep its name and its expenses; their photos show as gone.
  A ledger that can't be reached is tried again an hour later. (The rooms server's side of this:
  `site/worker`, its `SPLIT` binding.)

### Who may open a ledger

Whoever holds the key in the invitation link. The phone makes the key (32 random bytes) with the
ledger; the server keeps only its fingerprint. The key travels in a header (`x-split-key`), or as a
protocol name on the live connection, never in an address, so it is in no log.

### Its owner

The phone that makes a ledger sends a second key with it (`x-split-owner`), which no invitation
carries; the server keeps its fingerprint too. That key opens three doors and nothing else (it
doesn't read or write the ledger):

- `POST …/ledgers/<id>/key`, with the new key in `x-split-next`: the key that opens the ledger is
  changed. Every invitation sent before stops working (403 `key`), and the phones that were
  listening are let go (their connection is closed with 4403). Nothing in the ledger changes.
- `POST …/ledgers/<id>/lock` with `{ "locked": true }` or `false`: a locked ledger can be read and
  takes no changes from anyone (423 `locked`) until its owner opens it again. It still answers for
  changes it took before, so a phone whose answer was lost learns its change is in. Locking and
  opening each take a number in the record, and every phone that is listening is sent the ledger.
- `DELETE …/ledgers/<id>`: the ledger is deleted, for everyone. Everything kept for it goes but
  the time it went; every address of it answers 404 `gone` from then on; the phones that were
  listening are let go (4404); and its id is never made into another ledger. There is no undoing it.

A ledger made with no owner's key (every one made before owners came, with step 5b on
2026-11-13) has no owner: nobody can lock it, change its key or delete it. Anything but the
owner's key gets 403 `owner`.

### 查看链接: a key that only looks

A ledger's 查看链接 (2026-11-23) lets whoever opens it look at the ledger and do nothing else. Its
key is made on the phones from the ledger's own (`site/src/split/invite.ts`, `viewKeyOf`), so every
phone in the ledger makes the same one; the server keeps its fingerprint beside the others.

- `PUT …/ledgers/<id>/view`, with the ledger's key in `x-split-key` and the link's in
  `x-split-view`: the link's key is kept (the same again changes nothing; another takes its place).
  A locked ledger can have one. It can't be the ledger's key or its owner's (400 `bad`).
- `GET …/ledgers/<id>` with the link's key where the ledger's key goes: the ledger, as with its own
  key. That is the only thing it opens: its record, changes, the live connection, photos,
  invitations, another 查看链接 and keeping it in an account's list all answer 403 `key`.
- Changing the ledger's key lets the link's go too: the link stops working (403 `key`), and the
  next one made from the new key is another link.

### My ledgers: a changle.ca account's

The pages sign in with changle.ca's own accounts. A request that is signed in carries the site's
session (`Authorization: Bearer …`, as the site keeps it on the phone); this Worker asks the rooms
server whose it is, Worker to Worker over the `ROOMS` service binding (never over the public
address), and keeps the answer five minutes under the session's fingerprint. The same way as 跟一单
(`tools/tuan/src/server/who.ts`).

- Making a ledger needs a sign-in (401 `signin` without one, since step 6c on 2026-11-14). It is
  kept in the account's list with its keys, and counts against the account's day: ten a day.
  Asking again for a ledger already made, with its key, makes nothing and needs no sign-in (a
  phone whose answer was lost may have signed out since).
- `GET /me/ledgers`: the account's ledgers, keys and all, the last one kept first.
- `PUT /me/ledgers/<id>`, with the key in `x-split-key` (and the owner's key in `x-split-owner`
  when the phone has it), `{ "me": "<person's id>" }`: keep a ledger the account joined, or bring
  one up to date (a new key, who they are). Kept only when the key opens the ledger (403 `key`,
  404 `gone`) and the owner's key is its owner's (403 `owner`); someone who isn't in the ledger is
  forgotten. A phone without the owner's key doesn't take it from the account.
- `DELETE /me/ledgers/<id>`: off the list. The ledger itself stays.
- A sign-in that is nobody's: 401 `signin`. When the rooms server can't say: 503 `down`.

### Reading a receipt

`POST …/ledgers/<id>/files/<file>/read`, signed in, with the key: one of the ledger's photos (or a
PDF) is sent to Google's Gemini (`src/server/read.ts`), which says what was paid in all, in what
currency and at which shop, in JSON of a shape it is given. The answer is `{ "read": { "total":
"42.50", "currency": "CAD", "merchant": "Tim Hortons" } }` (the total as digits with a dot; the
currency only when it is one a ledger can be in; either of the other two can be null; with the tip,
tax, day, place and how it was paid, each null when it isn't shown, the time when one is printed,
and the kind of spending, `category`, when Gemini says one of the seven in
`site/src/split/categories.ts`), or `{ "read": null }` when it isn't a receipt or has no total on it.
`POST …/files/<file>/items` (小票逐项分, 2026-11-27) asks for its lines instead: `{ "items": { "total":
"78.60", "items": [{ "name": "Poutine", "amount": "24.00" }, …] } }` (at most 40 lines, each written as
the total is; the total null when it can't be read), or `{ "items": null }`. It is asked only when
someone shares a receipt out item by item, and counts against the same day and month as a reading. The phone fills them in for the
person to check; nothing is kept here or by Google beyond the answer.

- It costs money, Steve's 2 dollars a month at most (agreed 2026-11-14): each reading's cost is
  worked out from what Google says it used, at the model's prices (`READ_MODELS`: Gemini 3.1
  Flash-Lite, then 3.5 Flash-Lite if Google no longer serves the first), and counted on a Durable
  Object of its own (`GateDO` "read-budget"); once the month has spent its `READ_BUDGET`, nothing is
  read until the next month (429 `budget`). About half a cent buys ten readings.
- 30 a day for one account (429 `limit`).
- Without the secret `GEMINI_API_KEY` (Steve adds it in Cloudflare) nothing is read (403 `off`),
  and the phone shows nothing of it. Google failing or not answering is 502 `failed`.
- Locally and in the tests there is no key and no way out to Google: with `ALLOW_TEST_SETTINGS`,
  `FAKE_READ=1` reads with a stand-in (`fakeRead`) that reads what the file's own bytes say after
  `receipt:`, at 400 millionths of a dollar a reading, and `TEST_READ_BUDGET` makes the month's
  budget small enough to spend. The request to Google and the reading of its answer are tested
  without the network (`tests/room.test.ts`).

### Inviting a friend on changle.ca

Besides the link and the QR code, someone in a ledger can invite a friend of theirs on changle.ca
by their account. Nothing goes by mail.

- `POST …/ledgers/<id>/invites`, signed in, with the key, `{ "to": "<account id>", "member":
  "<person's id>" }` (`member` when the phone knows who in the ledger the friend is): the
  invitation waits in the friend's account (201 `{ "invite": "sent" }`). The same one again is 200
  `again`; a ledger the friend keeps already, 200 `in`. Only a friend: this Worker asks the rooms
  server, with the inviter's sign-in, `GET /api/users/<id>` (its `relation`), and anyone else is
  403 `friends`. A locked ledger takes nobody new (423 `locked`). 50 a day from one account (429
  `limit`), counted before the rooms server is asked.
- The invitation carries the key the inviter sent, the ledger's name then, who sent it (their
  name and photo on changle.ca, from the rooms server's `/api/me`), and the person it is for. A key
  changed since makes it one that no longer opens the ledger, as it does a link.
- `GET /me/invites`: the invitations waiting, the newest first. `DELETE /me/invites/<id>`: said no
  to. Keeping the ledger (`PUT /me/ledgers/<id>`, which joining does) uses it up. One waits 30
  days, and an account has at most 30 waiting (a new one pushes out the oldest). An account
  deleted takes the ones waiting for it.
- The phone that invited tells the friend itself, with a message in the site's chat (the friend
  finds the invitation at changle.ca/split). Nothing here sends one.

### 催一下 by mail

On 结清, a transfer still to come to you can be reminded of by mail, sent by the site (Steve,
2026-11-27): from hello@changle.ca, through the rooms server's mail door (its `Mail` entrypoint,
bound here as `MAIL`: `src/server/mail.ts`), with a reply going to the signed-in account's own
email. The Resend key stays on the rooms server.

- `POST …/ledgers/<id>/remind`, signed in, with the key, `{ "member": "<person's id>", "to":
  "<email>", "lang": "zh" | "en" }`: 200 `{ "sent": true }`. The account has to have said who it
  is in the ledger (its list, `me`; else 409 `me`), and that person has to owe it now (a step of
  the settlement, not yet paid; else 409 `settled`). Everything the mail says is the server's own,
  from the ledger (`site/src/split/remind.ts`, `mailOf`): who, which ledger, how much, the account's
  person's 收款方式, who it is from, and the ledger's 查看链接 as its button (made here as the phones
  make it, `site/src/split/viewKey.ts`). The address is passed to the door and kept nowhere (only a
  fingerprint of it, for its day's count).
- A day (UTC): each person in a ledger once (429 `again`); 10 from one account, 3 to one address
  from anyone (429 `limit`); 20 for the whole site, the rooms server's allowance (429 `today`). A
  reminder that didn't go out gives back what it took. An address the site doesn't mail is 400
  `to`; the door not sending, 503 `mail`.
- Locally the stand-in rooms server's `Mail` keeps what it is handed: `POST /test/mails` reads it
  (and empties it), `POST /test/door` `{ "is": "full" | "down" | "open" }` says how it answers
  (with `ALLOW_TEST_SETTINGS` only).

### Limits

500 changes in one request; 20,000 changes sent to one ledger in its life; 2,000 entries in a
ledger and 30 people (the phone's own rules); 10 new ledgers a day from one network, and 10 from
one account; 300 ledgers on one account's list. Files: 10 MB each, 500 MB in all for one account,
200 a day from one account, 2,000 in one ledger, 10 on one expense. Invitations to friends: 50 a
day from one account; 30 waiting for one, each for 30 days. Receipts read: 30 a day for one
account, and 2 dollars a month for the site. Reminders by mail: each person in a ledger once a day,
10 a day from one account, 3 to one address, 20 for the site.

## Running it

```bash
npm ci
npm run typecheck
npm test              # the room
npm run test:server   # the Worker, on this machine
npm run dev           # http://localhost:8794/split/api, with the stand-in rooms server
```

`npm run dev` runs the stand-in rooms server beside the Worker (`tests/rooms`), so a sign-in works
on this machine with the test sessions in `tests/accounts.ts`, and with any session
`test-account-<name>` (the site's `scripts/split_check.ts` gives each phone its own). Two such
accounts whose names start the same up to an `_` (`tripA_Amy`, `tripA_Ben`) are friends, and the
one after the `_` is the name. The real
rooms server is never asked from here.

The site's own dev server (`npm run dev` in `site`) passes `/split/api` on to this one, so the
pages at `127.0.0.1:5173/split` work against it. (`npm run dev` tells wrangler that is where its
requests come from: otherwise it gives every request changle.ca's address, the route's, and a
browser's live connection, which says it comes from 127.0.0.1:5173, is turned away as coming from
another site. Open the pages at that address, not localhost, for the live connection to work.) A day's allowance of ten new ledgers per network
applies here too: for anything that starts more (the site's `scripts/split_check.ts` does), run it
as `npm run dev -- --var ALLOW_TEST_SETTINGS:1`. (That lifts the network's allowance only; an
account's stays. It also opens the test addresses under `/split/api/test/`: a ledger's or an
account's nightly check run now, or as of a day to come; an account deleted, through the stand-in
rooms server; a stray file in the bucket; an account charged for a file no ledger keeps. And "my
files" can be asked as of a later time, `?at=`. None of it is there on changle.ca.) Add
`--var FAKE_READ:1` for receipts to be read by the stand-in for Google (the site's checks do).

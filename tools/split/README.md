# 两清 · All Square: the server

The server behind **changle.ca/split**: ledgers shared between phones. The pages themselves are the
main site's (`site/src/split/`); this Worker answers only `changle.ca/split/api`.

The plan is `docs/split.md`; where it stands and what's next is in `docs/briefs/split.md`.
**It is live** at `changle.ca/split/api` since 2026-11-13, and the pages at changle.ca/split keep
their ledgers on it (how a phone talks to it is `site/src/split/net.ts`, and when,
`site/src/split/syncer.ts`).

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
| `src/room/ledger.ts` | One ledger on the server: who may open it, who owns it, the order changes arrived in, the record of them. Plain logic over a small store, so it is tested without Cloudflare. |
| `src/room/protocol.ts` | What the phones and the server say to each other, address by address. |
| `src/server/worker.ts` | The Worker: routes, the Durable Object that wraps a ledger (`LedgerDO`, SQLite), the daily allowance of new ledgers per network (`GateDO`). |
| `tests/` | The room (`npm test`), and the server itself on Cloudflare's own runtime (`npm run test:server`, which starts `wrangler dev`). |

What a change does, that it counts once, and what is refused are **not** here: those rules are the
phone's own, `site/src/split/changes.ts` (with `ops.ts` and `core/`), imported from there so the
phone and the server can't disagree. Their tests are `site/tests/split-changes.test.ts`.

### What is kept

Each ledger is one Durable Object with its own SQLite database: the ledger (its name, currency,
people, entries, and since when it is locked if it is), the SHA-256 fingerprints of the key that
opens it and of its owner's key, the id of every change it has been sent with whether it counted,
and the record of the ones that did (each with a number and the time it arrived), which also has a
line for each time the ledger was locked or opened again.
No accounts yet, no email, no addresses. A network's address is kept only as a fingerprint, for
two days, to count the ledgers it made today.

### Who may open a ledger

Whoever holds the key in the invitation link. The phone makes the key (32 random bytes) with the
ledger; the server keeps only its fingerprint. The key travels in a header (`x-split-key`), or as a
protocol name on the live connection, never in an address, so it is in no log.

### Its owner

The phone that makes a ledger sends a second key with it (`x-split-owner`), which no invitation
carries; the server keeps its fingerprint too. That key opens two doors and nothing else (it
doesn't read or write the ledger):

- `POST …/ledgers/<id>/key`, with the new key in `x-split-next`: the key that opens the ledger is
  changed. Every invitation sent before stops working (403 `key`), and the phones that were
  listening are let go (their connection is closed with 4403). Nothing in the ledger changes.
- `POST …/ledgers/<id>/lock` with `{ "locked": true }` or `false`: a locked ledger can be read and
  takes no changes from anyone (423 `locked`) until its owner opens it again. It still answers for
  changes it took before, so a phone whose answer was lost learns its change is in. Locking and
  opening each take a number in the record, and every phone that is listening is sent the ledger.

A ledger made with no owner's key (every one made before owners came, with step 5b on
2026-11-13) has no owner: nobody can lock it or change its key. Anything but the owner's key gets
403 `owner`.

### Limits

500 changes in one request; 20,000 changes sent to one ledger in its life; 2,000 entries in a
ledger and 30 people (the phone's own rules); 10 new ledgers a day from one network.

## Running it

```bash
npm ci
npm run typecheck
npm test              # the room
npm run test:server   # the Worker, on this machine
npm run dev           # http://localhost:8794/split/api
```

The site's own dev server (`npm run dev` in `site`) passes `/split/api` on to this one, so the
pages at `localhost:5173/split` work against it. A day's allowance of ten new ledgers applies
here too: for anything that starts more (the site's `scripts/split_check.ts` does), run it as
`npx wrangler dev --port 8794 --var ALLOW_TEST_SETTINGS:1`.

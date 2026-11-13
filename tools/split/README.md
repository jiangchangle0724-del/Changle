# 两清 · All Square: the server

The server behind **changle.ca/split**: ledgers shared between phones. The pages themselves are the
main site's (`site/src/split/`); this Worker answers only `changle.ca/split/api`.

The plan is `docs/split.md`; where it stands and what's next is in `docs/briefs/split.md`.
**It is live** at `changle.ca/split/api` since 2026-11-13, and no page uses it yet.

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
| `src/room/ledger.ts` | One ledger on the server: who may open it, the order changes arrived in, the record of them. Plain logic over a small store, so it is tested without Cloudflare. |
| `src/room/protocol.ts` | What the phones and the server say to each other, address by address. |
| `src/server/worker.ts` | The Worker: routes, the Durable Object that wraps a ledger (`LedgerDO`, SQLite), the daily allowance of new ledgers per network (`GateDO`). |
| `tests/` | The room (`npm test`), and the server itself on Cloudflare's own runtime (`npm run test:server`, which starts `wrangler dev`). |

What a change does, that it counts once, and what is refused are **not** here: those rules are the
phone's own, `site/src/split/changes.ts` (with `ops.ts` and `core/`), imported from there so the
phone and the server can't disagree. Their tests are `site/tests/split-changes.test.ts`.

### What is kept

Each ledger is one Durable Object with its own SQLite database: the ledger (its name, currency,
people, entries), the SHA-256 fingerprint of the key that opens it, the id of every change it has
been sent, and the record of the ones that counted (each with a number and the time it arrived).
No accounts yet, no email, no addresses. A network's address is kept only as a fingerprint, for
two days, to count the ledgers it made today.

### Who may open a ledger

Whoever holds the key in the invitation link. The phone makes the key (32 random bytes) with the
ledger; the server keeps only its fingerprint. The key travels in a header (`x-split-key`), or as a
protocol name on the live connection, never in an address, so it is in no log.

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

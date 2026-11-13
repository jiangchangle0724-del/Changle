# 跟一单 · Count Me In

One of changle.ca's tools, at **changle.ca/tuan**: group buys for Greater Vancouver's home
kitchens, group-buy leaders and farms. A merchant posts a group buy and drops its link in their
WeChat group; buyers order from the link without signing in; the merchant gets the orders, a sheet
of what to get ready and a sheet of what goes where. The money goes from buyer to merchant
directly (e-Transfer, WeChat, cash): the site carries the orders and never touches the money.

The plan is `docs/tuan.md`; where it stands and what's next is in `docs/briefs/tuan.md`.

**Only the API is there so far.** This is the first step of the first stage (A1): the Worker, its
database and the API, with tests. Every page under `/tuan` answers "not found" until the pages are
built; they come next, hidden at `/tuan/preview` until the owner has tried them on a phone.

## How it is made

Its own Cloudflare Worker (`tuan`) with its own D1 database (`changle-tuan`), like 玩什么
(`tools/events`).

| Folder | What |
| --- | --- |
| `src/engine/` | The rules, with no browser and no Cloudflare in them: what a group buy is made of (`types.ts`), money and amounts (`money.ts`), taking and changing an order (`order.ts`), starting a group buy (`offer.ts`), a shop (`shop.ts`), the merchant's sheets (`summary.ts`), who is shown what (`view.ts`), codes (`ids.ts`), phone numbers (`phone.ts`), Vancouver days (`time.ts`), tidying what people type (`text.ts`). |
| `src/api.ts` | What a phone and the server say to each other: every shape, every error code. |
| `src/server/worker.ts` | The Worker: the routes (listed at the top of the file) and what each does. |
| `src/server/store.ts` | Everything kept in D1, read and written here and nowhere else. |
| `src/server/who.ts` | Who is signed in: asks the rooms server (below). |
| `src/server/notify.ts`, `src/server/mail.ts` | Telling a merchant of new orders by mail, through the rooms server's mail door (below). What the mail says is `src/engine/notice.ts`. |
| `src/server/gate.ts` | The daily allowances. |
| `src/server/schema.ts` | Applies `migrations/` (numbered files, each once, in order) when the Worker starts. Nothing to run by hand. |
| `tests/` | The rules (`engine.test.ts`) and the Worker with a local database (`api.test.ts`). |

### Numbers

Money is whole cents. Amounts of goods are whole thousandths of the item's unit (1500 is 1.5 lb,
2000 is 2 bags), so nothing drifts. A line costs `round(price × amount ÷ 1000)` cents, and every
total is a sum of lines: the sheets always add up to the orders.

Only `lb` is weighed. A weighed line is an estimate until the merchant writes down what the scale
said; an order's `final` (goods and delivery) is empty until every weighed line in it is weighed.
An item has a `step` (weight comes by the half pound unless the merchant says otherwise) and a
`least` (a merchant who weighs by the half pound may still sell no less than a pound).

A delivery area has a minimum (`min`: under it, no delivery), a fee, and optionally a mark from
which delivery is free (`freeFrom`). The fee is settled on the goods as ordered, when the order is
placed or changed; weighing doesn't move it.

### Stock, and two people at once

Each item has a `sold` column, and the table itself refuses a row where `sold` passes `stock`.
Placing an order is one transaction (`db.batch`): the order, its lines, and `sold` going up. If
two buyers reach for the last box together, one transaction fails as a whole, and that buyer is
told what's left.

Every order carries a `rev` that goes up with each change. A change (the buyer's new lines, a
cancellation, the merchant's mark) names the `rev` it was read at; if the order has moved on, it
changes nothing, and the server reads again and retries once. So a buyer changing an order while
the merchant marks it paid can't leave the shelf and the orders disagreeing. The tests check that
they agree after a crowd of orders, changes and cancellations at once.

### Who may see and do what

- **Anyone with the link** sees a group buy: the goods, what's left, and the list of who's in
  (place in line, name, how many things; nameless or hidden if the merchant chose). Never a phone
  number or an address.
- **A buyer** signs in to nothing. An order opens with its 6-character code and the last four
  digits of the phone number it was placed with (sent in the `x-tail` header). A wrong code and a
  wrong number get the same answer. While the group buy is open, and until the order is marked
  paid or handed over, the buyer can change or cancel it.
- **A merchant** signs in with their changle.ca account (email code). The page sends the session
  the site keeps on the phone (`Authorization: Bearer …`); this Worker asks the rooms server
  (`site/worker`) whose it is, Worker to Worker through the `ROOMS` binding (`GET /api/me`), and
  keeps the answer for five minutes under the session's fingerprint. `shop_members` says which
  accounts (by email) run which shop. Only they see buyers' phone numbers and addresses.
- **The site's owner** (the rooms server's `MASTER_EMAIL`) sets shops up by hand for now
  (`POST /tuan/api/admin/shops`), and may look after any shop.

### Mail

A merchant is told of new orders by mail. This Worker has no mail key: the rooms server sends it,
through its named entrypoint `Mail` (`site/worker/mail.ts`, bound here as `MAIL`), to changle.ca
accounts only, and gives this whole tool 60 mails a day (by the UTC day). So they are spent
carefully (`src/server/notify.ts`):

- One mail covers every order the merchant hasn't been told of yet, in both languages: who, the
  first three things, what it comes to, where it goes. No phone number and no address: those stay
  on the order page, behind the merchant's sign-in. Its button opens `/tuan/my/t/<group buy>`.
- A group buy gets at most one mail every half hour. The first order's goes at once; later ones
  wait for the half hour to pass, and a timer (every ten minutes, `wrangler.jsonc`) sends them.
- Opening the group buy's orders counts as being told. Cancelled orders aren't announced.
- It goes to the first two accounts that run the shop, in the order the owner listed them.
- A mail that fails never fails the order. If it may work later, the half hour isn't spent; if the
  door says the day's allowance is used up, it isn't asked again until its day turns.

### Limits

| What | How many |
| --- | --- |
| Orders one network may send in a day | 300 |
| Wrong tries at orders from one network in a day | 30 |
| Wrong tries at one order in a day, from anywhere (then it's locked until tomorrow) | 30 |
| Sessions that turn out to be nobody's, from one network in a day | 60 |
| Mails a day for the whole tool (the rooms server's allowance); for one group buy | 60; one every half hour |
| Standing orders one phone number may have in a group buy | 5 |
| Orders in a group buy, cancelled ones included | 500 |
| Different things in an order, and the most of one thing | 60, 99 |
| Goods in a group buy; pickup points; delivery areas | 200; 12; 12 |

A network is told apart by its address, kept only as a fingerprint, in the `gates` table (one row
a key a day, dropped two days later).

It runs on Cloudflare's free plan. D1 allows 50 queries per request there; a `db.batch` counts as
one, and placing an order takes about seven.

### Time

Vancouver time is UTC-7 all year: B.C. stopped changing its clocks on 8 March 2026.
`src/engine/time.ts` has the offset once (the same rule as 约时间).

## Run it

Node 22.

```sh
cd tools/tuan
npm ci
npm run typecheck
npm test               # the rules, and the Worker in the Workers runtime with a local D1
npm run dev            # http://127.0.0.1:8795/tuan/api/…
```

`npm run dev` keeps its own local database in `.wrangler/`. Signing in and mail need the rooms server: run
it locally too, first (in `site/`: `npx wrangler dev -c worker/wrangler.jsonc --port 8787 --ip
127.0.0.1 --var DEV_SHOW_CODES:1`, see `site/README.md`), and wrangler connects the two (the
`ROOMS` binding shows `[connected]`); add `--var MASTER_EMAIL:<the email you sign in with>` there
to be the owner locally, and `--var DEV_MAIL_URL:http://127.0.0.1:8791/emails` with
`node scripts/fake_mail.mjs` running there to see the mails. Without the rooms server, everything
a merchant does answers `503 down` and no mail goes out. The tests don't need it: they run a
stand-in that knows a few made-up accounts and keeps the mails it is asked to send
(`tests/accounts.ts`).

## Live

Connected to Cloudflare on 13 November 2026: merging into `main` deploys it. The Worker `tuan`
(Workers Builds): root directory `/tools/tuan`, no build command, deploy command
`npx wrangler deploy`, production branch `main`, build watch paths `tools/tuan/*`, API token
"suibian build token", preview builds off (as for the other Workers: a PR gets no extra check).

- The first deploy made the D1 database `changle-tuan` by itself (it's in `wrangler.jsonc` without
  an id) and bound the rooms server (`ROOMS` → `changle-rooms`); the Worker made its tables on its
  first request. No secrets.
- Since the same day it also binds the rooms server's mail door (`MAIL` → `changle-rooms`, entrypoint
  `Mail`) and has one timer (every ten minutes).
- A table changes only through a new numbered file in `migrations/`, added to the list in
  `src/server/schema.ts`: a file that has been applied on the live database is never edited again.

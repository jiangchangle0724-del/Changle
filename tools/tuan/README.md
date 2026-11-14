# 跟一单 · Count Me In

One of changle.ca's tools, at **changle.ca/tuan**: group buys for Greater Vancouver's home
kitchens, group-buy leaders and farms. A merchant posts a group buy and drops its link in their
WeChat group; buyers order from the link without signing in; the merchant gets the orders, a sheet
of what to get ready and a sheet of what goes where. The money goes from buyer to merchant
directly (e-Transfer, WeChat, cash): the site carries the orders and never touches the money.

The plan is `docs/tuan.md`; where it stands and what's next is in `docs/briefs/tuan.md`.

**The first stage (A1) is built**: the Worker, its database and the API; mail to the merchant; the
pages a buyer sees (a group buy, the cart, checkout, the order); and the pages a merchant sees
(their group buys, a group buy's orders with their marks, the two sheets). **The second stage (A2)
has begun**: a merchant starts a group buy and changes one on their phone, from nothing or from
their last one. A shop is still set up by the site's owner, by hand, from a panel on the merchant's
home. Nothing on changle.ca links here until the owner has tried it on a phone:
`/tuan/preview` is home with a line saying so, and no search engine is let in.

| Address | What |
| --- | --- |
| `/tuan/`, `/tuan/preview` | Home: how it works, the orders placed from this phone, and opening an order by its code. |
| `/tuan/t/<group buy>` | A group buy: the goods by section, a sheet to choose a weight, the cart, who's in, and checkout on one screen. With `?change=<order code>` it changes that order. |
| `/tuan/o/<order code>` | An order: what it comes to, how to pay (with the code to put in the payment note), where it goes, and changing or cancelling it while the group buy is open. |
| `/tuan/my` | A merchant's home, signed in with their changle.ca account: their shops and the group buys in each, with what's waiting. The site's owner also gets the panel that sets a shop up and starts a group buy from a document, typed in or filled in from a file. |
| `/tuan/my/t/<group buy>` | A group buy for its merchant: every order (who, how to reach them, what, where it goes), marking it confirmed, paid, handed over or cancelled, writing down what the scale said, and the two sheets (what to get ready, what goes where) with a button that copies each. The new-order mail's button leads here. |
| `/tuan/my/new/<shop>` | Starting a group buy in a shop: its name, the goods, when it closes, where the goods go. With `?from=<group buy>` it starts from that one. What's typed is kept on the phone until it's sent. |
| `/tuan/my/t/<group buy>/edit` | Changing a group buy: the same page, filled in. What an order names (an item, a pickup point, a delivery area) can change but not go. |
| `/tuan/api/…` | The API (`src/server/worker.ts` lists it). |

Every page is in Chinese and English, with a switch at the top right. A phone starts in the
language it last chose here (`tuan.lang`); else in Chinese inside WeChat, whatever the phone's
own language (group buys go round WeChat groups); else in the phone's language. What a merchant
wrote shows as they wrote it.

## How it is made

Its own Cloudflare Worker (`tuan`) with its own D1 database (`changle-tuan`), like 玩什么
(`tools/events`).

| Folder | What |
| --- | --- |
| `src/engine/` | The rules, with no browser and no Cloudflare in them: what a group buy is made of (`types.ts`), money and amounts (`money.ts`), taking and changing an order (`order.ts`), starting a group buy (`offer.ts`) and changing one (`edit.ts`), a shop (`shop.ts`), the merchant's sheets (`summary.ts`), who is shown what (`view.ts`), codes (`ids.ts`), phone numbers (`phone.ts`), Vancouver days (`time.ts`), tidying what people type (`text.ts`). |
| `src/api.ts` | What a phone and the server say to each other: every shape, every error code. |
| `src/server/worker.ts` | The Worker: the routes (listed at the top of the file) and what each does. It serves the pages too: one file for all of them, with a group buy's name put in its page's title. |
| `src/server/store.ts` | Everything kept in D1, read and written here and nowhere else. |
| `src/server/who.ts` | Who is signed in: asks the rooms server (below). |
| `src/server/notify.ts`, `src/server/mail.ts` | Telling a merchant of new orders by mail, through the rooms server's mail door (below). What the mail says is `src/engine/notice.ts`. |
| `src/server/gate.ts` | The daily allowances. |
| `src/server/schema.ts` | Applies `migrations/` (numbered files, each once, in order) when the Worker starts. Nothing to run by hand. |
| `src/client/` | The pages, in Preact: `main.tsx` (which page an address is), `ui/Offer.tsx` (a group buy and checkout), `ui/Order.tsx`, `ui/Home.tsx`, `ui/My.tsx` (a merchant's home, and what a merchant's page says when it can't show its content), `ui/MyOffer.tsx` (a group buy's orders and sheets), `ui/sheets.ts` (the sheets as text to copy), `ui/Editor.tsx` (starting a group buy and changing one), `ui/Owner.tsx` (the owner's panel), `ui/common.tsx` (the bar, sheets, the stepper, the copy button), `api.ts` (talking to the server, and what this phone remembers), `i18n.ts` (every line, in Chinese and English), `styles.css`, and the site's `tokens.css` and fonts. |
| `scripts/build.mjs` | Builds the pages into `dist/client/tuan` (esbuild). wrangler runs it before `wrangler dev` and `wrangler deploy`. |
| `tests/` | The rules (`engine.test.ts`), the Worker with a local database, pages included (`api.test.ts`), the design rules (`design.test.mjs`), and phones in browsers (`e2e/flow.spec.ts` for a buyer, `e2e/merchant.spec.ts` for a merchant and the owner, `e2e/editor.spec.ts` for starting and changing a group buy, `e2e/help.ts` for what they share). `rooms/` is a stand-in for the rooms server, with the made-up accounts in `accounts.ts`. |

### The pages

One HTML file and one script for every page; the address decides what shows. The script, styles
and fonts carry a hash in their names and are kept by phones for a year; the page itself is never
kept (`no-store`), so a new version arrives on the next visit. A content-security policy lets
nothing run or load but the site's own files (and Cloudflare's visitor statistics).

- **No account for buyers.** A phone remembers, in its own storage: each group buy's cart, the
  name, phone number and address last ordered with, and the orders placed from it with the four
  digits that open them. Clearing the browser's data forgets them; an order still opens anywhere
  with its code and those digits.
- **Counted goods** get a plus, then less and more in the row. **Anything by weight** opens a
  sheet: from the item's least, by its step, with what it comes to as an estimate.
- **What can be ordered is kept true on the phone**: no more than is left, than the limit per
  buyer, than 99. The server decides again when the order is sent; if something ran out meanwhile,
  the buyer is shown the goods again with the cart put right and told why, and nothing typed at
  checkout is lost.
- **Sheets and checkout close on the phone's back button.** Each adds its step to the history the
  moment it's on the page (a layout effect), so a quick tap or a quick back never finds one
  without the other.
- **A merchant's pages** show nothing by themselves: the page is the same file for everyone, and
  what it shows comes from the API once signed in. Signed in means the session the site keeps in
  the phone's storage (`changle.session`): these pages are at the same address, so they read it
  and send it as `Authorization: Bearer …` to this tool's own API and nowhere else. With no
  session, or one the rooms server no longer knows, the page offers the site's sign-in
  (`/login`) and looks again when the merchant comes back to it.
- **A merchant's marks** go to the server one at a time and come back as the order now stands;
  the sums on the page are then done again from the orders (`summarize`, the same rules as the
  server), so the counts, what's to collect and the sheets never disagree with the list. What's
  to collect counts a weighed order at what the scale said; "as ordered" is said where it's that.
  The page reads again every minute while it's looked at, and whenever it's come back to.
- **The sheets' text** (`ui/sheets.ts`): a pickup line carries the last four digits of the buyer's
  phone number (such a list is often posted in the group), a delivery line the whole number and
  the address. A spreadsheet file comes later (`docs/codex-tasks/tuan/T1-orders-csv.md`).
- **Design**: `docs/DESIGN.md`. Colors, sizes, corners, shadows and timings come from the site's
  tokens (`src/client/tokens.css` is a copy; `tests/design.test.mjs` fails if it differs or if
  `styles.css` writes a color, a type size, a shadow or a duration out). A tool's color is amber.
  The same test checks that every class a page uses has styles, that no styles or lines of text
  are left over, and that every line exists in both languages. Class names are written out whole
  in the pages (never built from parts) so the test can find them.

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
- **Changing a group buy** (`src/engine/edit.ts`): the merchant's page sends the whole document
  again, each item, pickup point and delivery area that stays under its id. A part with an id is
  changed where it is, so the orders that name it still do, and keep the name and price they were
  placed at; a part without one is new; a part that isn't in the document goes, unless an order
  names it (a cancelled order too), and then nothing is changed. An item an order names keeps the
  unit it was sold in, and its limit can't be set below what's ordered. A document that names a
  part that has gone since it was read is behind, and is refused whole. A draft opens with the
  change that says so; open and closed are changed only by the buttons for that.
- **The site's owner** (the rooms server's `MASTER_EMAIL`) sets shops up by hand for now
  (`POST /tuan/api/admin/shops`), and may look after any shop. The panel's forms can be filled in
  from a file (`src/client/ui/Owner.tsx`): a group buy's document as
  `POST /tuan/api/my/shops/<slug>/offers` takes it, or `{ "shop": {…}, "offer": {…} }` for a shop
  and a group buy in it, which adds one button that does both. The file only fills the forms in;
  nothing is sent until a button is pressed, and the server checks it all the same. A real
  merchant's catalogue made ready this way stays out of this repository (it is public): the goods
  in the tests are made up.

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
npm run typecheck      # the server (Workers runtime) and the pages (DOM): two tsconfigs
npm test               # builds the pages, then: the rules and the Worker (Workers runtime, local D1), the design rules
npm run test:e2e       # phones in browsers (first: npx playwright install chromium; or PW_CHROME=1 for this computer's Chrome)
npm run dev:alone      # http://127.0.0.1:8795/tuan/ with a stand-in rooms server: the accounts in tests/accounts.ts
npm run dev            # the same address, bound to the real rooms server running beside it (below)
npm run build -- --watch   # rebuild the pages as they change (wrangler dev reloads)
```

`npm run dev:alone` is the quick way to see the pages: start it, then make a shop and a group buy
through the API as the tests do (`tests/e2e/help.ts`, `start()`), with
`Authorization: Bearer test-session-owner-0000000`; or sign in as the stand-in's owner in the
browser's console (`localStorage.setItem("changle.session", "test-session-owner-0000000")`) and
use the panel on `/tuan/my`. The browser tests start their own copy on
port 8793 with an empty database (`playwright.config.ts`); on GitHub they run in Chromium and in
WebKit, the engine inside iPhone Safari and WeChat on iOS.

`npm run dev` keeps its own local database in `.wrangler/`. Signing in and mail need the rooms server: run
it locally too, first (in `site/`: `npx wrangler dev -c worker/wrangler.jsonc --port 8787 --ip
127.0.0.1 --var DEV_SHOW_CODES:1`, see `site/README.md`), and wrangler connects the two (the
`ROOMS` binding shows `[connected]`); add `--var MASTER_EMAIL:<the email you sign in with>` there
to be the owner locally, and `--var DEV_MAIL_URL:http://127.0.0.1:8791/emails` with
`node scripts/fake_mail.mjs` running there to see the mails. Without the rooms server, everything
a merchant does answers `503 down` and no mail goes out. The tests don't need it: they run a
stand-in that knows a few made-up accounts and keeps the mails it is asked to send
(`tests/rooms/worker.ts`, `tests/accounts.ts`).

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
- The pages need no setting on Cloudflare: `wrangler deploy` builds them first (`build.command` in
  `wrangler.jsonc`), and they are published with the Worker as its static assets.
- The site knows `/tuan` is another Worker's (one line each): `site/src/router.ts` (`elsewhere`),
  `site/scripts/sw.template.js` (the offline cache leaves it alone), `site/public/robots.txt`
  (`Disallow: /tuan/api/`) and `site/vite.config.ts` (the local proxy). Its card in the Tools tab
  comes when the owner has tried the pages.

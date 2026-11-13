# 约时间 · When Works

One of changle.ca's tools, at **changle.ca/when**: friends find a time to meet. The host makes a
gathering and drops its link in the group chat; everyone taps the times they are free on their own
phone; the page shows where they overlap, live; the host sets the time, and every page asks what's
next: where to eat (随便) or what to play (开席). Nobody signs in.

The plan is `docs/when.md`; where it stands and what's next is in `docs/briefs/when.md`.

## How it is made

Its own Cloudflare Worker (`when`), like 随便 (`tools/suibian`): the pages are Preact, bundled by
esbuild into `dist/client/when`; the Worker serves them and answers the API.

| Folder | What |
| --- | --- |
| `src/engine/` | The rules, with no browser and no Cloudflare in them: Vancouver days (`time.ts`), days and slots (`slots.ts`), the best three (`rank.ts`), codes (`ids.ts`), what follows once a time is set (`after.ts`), the calendar file and the Google Calendar link (`ics.ts`), B.C.'s holidays, festivals and long weekends to the end of 2028 (`holidays.ts`, not on the pages yet). |
| `src/room/event.ts` | One gathering: who answered what, what was set, who may change which part. Plain logic over a small store. |
| `src/room/protocol.ts` | What the phones and the server say to each other. |
| `src/server/worker.ts` | The Worker: routes, the Durable Object that wraps a gathering (`EventDO`, SQLite), the daily allowances (`GateDO`). |
| `src/client/` | The phone pages: `ui/Home.tsx` (make a gathering), `ui/Event.tsx` (a gathering), `ui/Calendar.tsx` (add to calendar) and `ui/After.tsx` (what's next), both for once its time is set, `i18n.ts` (every word, Chinese and English), `styles.css`. `tokens.css` is a copy of the site's. `art/` holds four pictures (its own README says what each is for; no page uses them yet). |
| `tests/` | The rules and the room (`npm test`), and phones in browsers (`tests/e2e`, `npm run test:e2e`). |

### What is kept, and for how long

Each gathering is one Durable Object with its own SQLite database: the gathering (its name, days,
what was set) and one row per person (a name and their answers). Nothing else: no accounts, no
email, no phone numbers. It deletes itself 60 days after it was made (an alarm).

### Who may change what

Every phone makes its own key for a gathering (32 random bytes, kept in that phone's browser) and
sends it with each request in `x-when-key`. The server keeps only the key's SHA-256 fingerprint.

- A row is changed only with the key it was made with. Sending someone else's row id is refused.
- The phone that made the gathering is its host: it sets the time, marks who must be there, sets
  the least number of people, removes a duplicate row.
- Another phone becomes a host with the 6-digit admin code, shown once when the gathering is made.
  Five wrong codes in a row and that gathering takes none for an hour; one network may try 20 a
  day across all gatherings, and make 30 gatherings a day.

### Keeping pages up to date

Saving goes by ordinary requests (they work everywhere, WeChat included, and nothing typed is lost
when a connection drops). The server pushes the gathering to every open page over a WebSocket
(`/when/api/e/<code>/ws`, hibernating, so an idle gathering costs nothing). When the socket is down
the page asks again every ten seconds, and the moment it comes back to the front.

### Once the time is set

The banner of the time that was set carries **Add to calendar**, for everyone
(`src/client/ui/Calendar.tsx`). An iPhone, an iPad or a Mac gets the gathering's calendar file,
`/when/api/e/<code>/calendar.ics` (`src/engine/ics.ts` writes it; it is there only while a time is
set, and never kept, since the host can choose again); everything else goes to Google Calendar
with the event filled in. The other of the two is the link beside the button. Inside WeChat
neither opens, so there the button says how to get to a browser. The times in the file are in UTC
with no time-zone block, so no calendar can get Vancouver's rules wrong.

Every page also asks what's next (`src/client/ui/After.tsx`; the rules are in
`src/engine/after.ts`):

- **Tell the group**: the result as words to paste into the chat, in Chinese and in English, with
  the gathering's link under them.
- **Where to eat**: on to 随便 (changle.ca/eat). Only a host gets the link, so one gathering opens
  one table; everyone else is told to wait for the table's link. The link carries what is known:
  `/eat/?from=when&code=<code>&date=2026-11-21&time=18:30&occasion=friends&people=7` (lunch at
  12:00 for a morning or an afternoon, dinner at 18:30 otherwise; `people` is everyone who is free
  or could move things for that slot). 随便 doesn't read these yet, so the page also says which
  day and time to pick there. 随便 plans meals for today and the six days after: for a day further
  off, the button waits until that week. Inside WeChat, where Google refuses its sign-in, a note
  says to open 随便 in a browser, with a button that copies its link.
- **What to play**: on to 开席, the site's home page.

### Time

Vancouver time is UTC-7 all year: B.C. stopped changing its clocks on 8 March 2026, and every day
in a gathering is after that. `src/engine/time.ts` has the offset once; nothing asks a phone's or
the server's time-zone table (some still say UTC-8 in winter).

## Run it

Node 22.

```sh
cd tools/when
npm ci
npm run dev            # builds the pages, then http://127.0.0.1:8787/when/
```

To reach it from the site running locally, start it on port 8796
(`npm run build && npx wrangler dev --port 8796`): the site's `/when` is proxied there
(`site/vite.config.ts`).

## Tests

```sh
npm run typecheck
npm test               # the rules, the room, the design rules (tokens only, both languages)
npm run test:e2e       # phones in a browser against wrangler dev (installs: npx playwright install chromium)
```

On a computer where Playwright's browsers can't be downloaded: `PW_CHROME=1 npm run test:e2e` uses
the computer's own Chrome. CI (`.github/workflows/when.yml`) runs all of it, the browser tests in
Chromium and WebKit.

## Design

`docs/DESIGN.md` rules. Colors, type sizes, corners, shadows and timings all come from
`src/client/tokens.css`, a copy of `site/src/styles/tokens.css`: when the site's file changes, copy
it over (a test compares them, and CI runs when it changes). Night colors only; the tool's light is
the tools' amber. In "everyone", a slot is brighter the more people are free, and says the number
too: one hue, light to dark, so it reads without telling colors apart. Measured contrast of every
shade and the text on it is 5.4:1 or better (2026-11-12).

## Live

Since 2026-11-12, at changle.ca/when. Merging a change to `tools/when/*` into `main` deploys it:
the Worker `when` is connected to this repository in Cloudflare (Workers Builds) with **root
directory** `/tools/when`, build command `npm run build`, deploy command `npx wrangler deploy`,
production branch `main`, build watch path `tools/when/*`, preview builds off, and the build token
随便 also uses. The routes (changle.ca/when and changle.ca/when/*) and the two Durable Objects
are in `wrangler.jsonc`; there are no secrets. The build shows up as the check
"Workers Builds: when" on the merge commit.

Cloudflare adds two scripts of its own to every page of changle.ca: its visitor statistics (Web
Analytics, from static.cloudflareinsights.com) and its bot check (inline). These pages run their
own files and the first of those: Steve asked for the statistics on 2026-11-13, so the
`Content-Security-Policy` header in `src/server/worker.ts` names that script's address and where
it reports (this site's own /cdn-cgi/rum; cloudflareinsights.com is listed too, as Cloudflare's
own table of headers has it). The inline bot check is still turned away: one line in the console,
nothing a person notices.

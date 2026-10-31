# 随便 · Whatever's Fine

"Where should we eat?" "Whatever's fine." A tool on [changle.ca](https://changle.ca), at
[changle.ca/eat](https://changle.ca/eat), that lets a group of friends in Vancouver pick a
restaurant together in a few minutes, each on their own phone.
Why it works the way it does: [DESIGN.md](DESIGN.md).

This folder is **v1**: "now" tables (everyone together, deciding live). It is its own Cloudflare
Worker (`suibian`), separate from 到此一游, and shares no code or storage with it.

How a table goes:

1. The host signs in with Google, picks where they are (GPS or an area) and how far, and gets a
   QR code. Friends scan it; they don't need to sign in.
2. Everyone fills in a **diet card**: allergies incl. chili (don't eat / severe), anything else
   they type in (香菜, pork…; these only warn), halal, vegetarian, budget.
   The table sees only "someone here doesn't eat peanuts", never who. Signed-in people's cards
   are saved.
3. **Round 1, today's mood**: 👍 or 🚫 on the cuisines actually open nearby. One 🚫 removes it.
4. **Round 2, the cards**: six restaurants (at most two per cuisine), each with rating, travel
   minutes, last-order time, a 🟢/🟡/🔴 wait estimate, call and map buttons. Tick every place
   you'd go; one secret veto each.
5. Most ticks wins; a tie spins. The result card goes to the group chat with a link to rate the
   meal afterwards (three taps). Those ratings feed back into scores and wait estimates.

## How it sits inside changle.ca

* **Addresses.** The Worker answers `changle.ca/eat` and `changle.ca/eat/*` (the routes in
  `wrangler.jsonc`); the rest of changle.ca is the site. Everything is under `/eat`: the home page
  (`/eat/`), a phone at a table (`/eat/r/1234`, which is also what the QR code and the invite link
  say), rating the meal afterwards (`/eat/r/1234/rate`), the API (`/eat/api/…`), sign-in
  (`/eat/auth/…`) and the files (`/eat/app.js`, `/eat/app.css`, built into `dist/client/eat`).
  `BASE` in `src/base.ts` is the one place that says `/eat`; the server strips it off incoming
  paths and the pages put it in front of theirs. The session cookie's `Path` is `/eat` too, so
  the rest of the site never sees it.
* **The site's side** (the card in the site's Tools tab that opens `/eat`) is in the site's code,
  next to 到此一游's card.

## What's where

| Folder | What it is |
| --- | --- |
| `src/base.ts` | `BASE = "/eat"`: where the tool lives on changle.ca. |
| `src/engine` | The rules: cuisines, diet limits (with the draft severe-allergy table in `limits.ts`), wait estimates, picking cards, counting votes. No network. |
| `src/room` | One table from lobby to result. No network inside, so it's easy to test. |
| `src/server` | The Cloudflare Worker: rooms (one Durable Object each), Google Places, Google sign-in, users' diet cards, our per-restaurant ratings. |
| `src/client` | The phone pages (Preact), Chinese and English, and the privacy and terms pages (`privacy.html`, `terms.html`, plain HTML at `/eat/privacy` and `/eat/terms`). |
| `tests` | Rules and room tests (Node), and phones in a browser (`tests/e2e`, Playwright): a whole table, and the privacy and terms pages. |

## Run it on a computer

```sh
npm install
npm run dev          # http://localhost:8787/eat/, with made-up demo restaurants and no sign-in
```

To try it from a phone on the same Wi-Fi: `npm run dev -- --ip 0.0.0.0`, then open the computer's
address on port 8787, followed by `/eat/`.

## Check it

```sh
npm run typecheck
npm test             # rules (incl. "a severe allergy never gets through", 500 random tables) and room
npm run test:e2e     # three phones: sign in, join, diet cards, both rounds, result, rating;
                     # and the privacy and terms pages are up and linked from the home page
```

GitHub runs all three on every push that touches this folder, in Chromium and WebKit
(`.github/workflows/suibian.yml`).

## Put it online

It works in three stages; each one is usable.

**1. Online with demo restaurants.** The Worker `suibian` (Cloudflare dashboard → Workers &
Pages) is connected to this repository: **root directory** `tools/suibian`, build command
`npm run build`, deploy command `npx wrangler deploy`, production branch `main`, build watch path
`tools/suibian/*`. Every merge into `main` that touches this folder builds and deploys it (Worker →
Deployments shows the builds); nothing else in the repository does. The deploy registers the routes
from `wrangler.jsonc`, so the tool answers at [changle.ca/eat](https://changle.ca/eat) (check the
Worker → Settings → Domains & Routes: `changle.ca/eat` and `changle.ca/eat/*`, and nothing else).
Anyone can start a table; restaurants are made up and say so.

**2. Google sign-in.** In [Google Cloud console](https://console.cloud.google.com/), create a
project (e.g. "changle-ca"), then:
1. APIs & Services → OAuth consent screen (also called "Google Auth Platform"): user type
   **External**; app name 随便; support email yours. Data Access: only `openid` and `profile`
   (no email needed). Branding: authorized domain `changle.ca`, home page
   `https://changle.ca/eat`, privacy policy `https://changle.ca/eat/privacy`, terms
   `https://changle.ca/eat/terms` (Google won't let an external app be published without these;
   the two pages are `src/client/privacy.html` and `terms.html`, and must stay true to what the
   code keeps). Then Audience → **Publish app** ("In production"). While it stays in "Testing",
   only the test users you list can sign in; with just these basic scopes and no logo Google
   doesn't need to review it.
2. Credentials → Create credentials → OAuth client ID → **Web application**. Under Authorized
   redirect URIs add exactly `https://changle.ca/eat/auth/callback` (a missing `https`, a
   trailing slash, or any other address gives Google's `redirect_uri_mismatch` error). Copy the
   client ID and secret.
3. Cloudflare → Workers & Pages → `suibian` → Settings → Variables and Secrets → Add, type
   **Secret**, three times: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET`
   (any long random text, e.g. from `openssl rand -base64 32`; changing it later signs everyone
   out). Cloudflare redeploys by itself.

Check: open changle.ca/eat. The home page now says "用 Google 登录" under 开一桌; sign in and you land
back on the home page with "你好，<name>". Restaurants are still the demo ones (step 3 adds the
real ones). From now on starting a table needs sign-in (10 tables per account per day); joining
doesn't. In WeChat's built-in browser Google blocks sign-in, so the page tells people to open it
in the browser; joining a table works in WeChat as before.

**3. Real restaurants.** In the same Google Cloud project:
1. Billing: link a billing account (Places needs one even inside the free allowance).
2. APIs & Services → Library → enable **Places API (New)** (not the old "Places API").
3. Credentials → Create credentials → API key → Edit: API restrictions → Restrict key →
   **Places API (New)** only. Leave application restrictions at "None" (the key is used by the
   server, never sent to phones).
4. Billing → Budgets & alerts: a monthly budget (e.g. CA$20) with email alerts at 50% and 90%.
5. APIs & Services → Places API (New) → Quotas: cap requests per day, e.g. Nearby Search 200,
   Place Details 600, Place Photos 600. That is about 100 tables a day; past it, searches fail
   until tomorrow instead of costing more.
6. Cloudflare: add Secret `GOOGLE_PLACES_KEY`.

Check: open changle.ca/eat; the yellow "示例数据" banner is gone. Start a table where you are: round 1
shows the cuisines open nearby and round 2 real restaurants with photos (credited to whoever took
them), opening hours and phone numbers. If the table says "搜索出错了", open Cloudflare →
`suibian` → Logs: a line `places Error: google 403 …` means the key is wrong, restricted to the
wrong API, or Places API (New) isn't enabled; `google 429` means today's quota is used up.

Real Google data is used only when both sign-in and the Places key are set, so strangers can't
spend your API money. Each table makes 2 searches, plus details and one photo for each of its
6 cards. Google gives every kind of request a monthly free allowance; a group of friends eating
out a few times a week should stay well inside it, but look at Billing after the first week to
be sure.

## Numbers you might want to change

* Round timings: `TIMING` in `src/room/protocol.ts`.
* Score weights, cards per table, max per cuisine: `src/engine/pick.ts`.
* Severe-allergy table (**draft, please review**): `SEVERE_RULES_OUT` in `src/engine/limits.ts`.
* Wait-estimate rules (peak hours, popularity): `src/engine/wait.ts`.
* Tables per account per day: `ROOMS_PER_DAY` in `src/server/worker.ts`.
* Areas offered when GPS is off: `NEIGHBOURHOODS` in `src/engine/clock.ts`.

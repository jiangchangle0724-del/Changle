# 随便 · Whatever's Fine

"Where should we eat?" "Whatever's fine." A tool on [changle.ca](https://changle.ca) that lets a
group of friends in Vancouver pick a restaurant together in a few minutes, each on their own phone.
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

## What's where

| Folder | What it is |
| --- | --- |
| `src/engine` | The rules: cuisines, diet limits (with the draft severe-allergy table in `limits.ts`), wait estimates, picking cards, counting votes. No network. |
| `src/room` | One table from lobby to result. No network inside, so it's easy to test. |
| `src/server` | The Cloudflare Worker: rooms (one Durable Object each), Google Places, Google sign-in, users' diet cards, our per-restaurant ratings. |
| `src/client` | The phone pages (Preact), Chinese and English. |
| `tests` | Rules and room tests (Node), and three phones in a browser (`tests/e2e`, Playwright). |

## Run it on a computer

```sh
npm install
npm run dev          # http://localhost:8787, with made-up demo restaurants and no sign-in
```

To try it from a phone on the same Wi-Fi: `npm run dev -- --ip 0.0.0.0`, then open the computer's
address on port 8787.

## Check it

```sh
npm run typecheck
npm test             # rules (incl. "a severe allergy never gets through", 500 random tables) and room
npm run test:e2e     # three phones: sign in, join, diet cards, both rounds, result, rating
```

GitHub runs all three on every push that touches this folder, in Chromium and WebKit
(`.github/workflows/suibian.yml`).

## Put it online

It works in three stages; each one is usable.

**1. Online with demo restaurants (about 5 minutes).** Cloudflare dashboard → Workers & Pages →
Create → Import a repository → this repo, with **project name** `suibian` (must match `name` in
`wrangler.jsonc`), **root directory** `tools/suibian`, build command `npm run build`, deploy
command `npx wrangler deploy`. Then the Worker → Settings → Domains & Routes → Add → Custom
domain, e.g. `eat.changle.ca`. Anyone can start a table; restaurants are made up and say so.

**2. Google sign-in.** In [Google Cloud console](https://console.cloud.google.com/):
* APIs & Services → OAuth consent screen: External; app name 随便; scopes `openid` and `profile`.
* Credentials → Create credentials → OAuth client ID → Web application. Authorized redirect URI:
  `https://eat.changle.ca/auth/callback` (your domain).
* In Cloudflare (the Worker → Settings → Variables and Secrets), add as **Secret**:
  `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `SESSION_SECRET` (any long random text, e.g.
  from `openssl rand -base64 32`).

From now on starting a table needs sign-in (10 tables per account per day); joining doesn't.

**3. Real restaurants.** In the same Google Cloud project:
* APIs & Services → Library → enable **Places API (New)**.
* Credentials → Create credentials → API key; restrict it to Places API (New).
* Billing → Budgets & alerts: set a monthly budget with email alerts. APIs & Services → Places
  API (New) → Quotas: cap requests per day.
* Add it in Cloudflare as Secret `GOOGLE_PLACES_KEY`.

Real Google data is used only when both sign-in and the Places key are set, so strangers can't
spend your API money. Each table costs about 2 searches, plus details and one photo for each of
the 6 cards.

## Numbers you might want to change

* Round timings: `TIMING` in `src/room/protocol.ts`.
* Score weights, cards per table, max per cuisine: `src/engine/pick.ts`.
* Severe-allergy table (**draft, please review**): `SEVERE_RULES_OUT` in `src/engine/limits.ts`.
* Wait-estimate rules (peak hours, popularity): `src/engine/wait.ts`.
* Tables per account per day: `ROOMS_PER_DAY` in `src/server/worker.ts`.
* Areas offered when GPS is off: `NEIGHBOURHOODS` in `src/engine/clock.ts`.

# 随便 · Whatever's Fine

"Where should we eat?" "Whatever's fine." A tool on [changle.ca](https://changle.ca), at
[changle.ca/eat](https://changle.ca/eat), that lets a group of friends in Vancouver pick a
restaurant together in a few minutes, each on their own phone.
Why it works the way it does: [DESIGN.md](DESIGN.md). Picking it up? The current state, commands
and settings: [HANDOFF.md](HANDOFF.md).

This folder is **v1**: "now" tables (everyone together, deciding live). It is its own Cloudflare
Worker (`suibian`), separate from 到此一游, and shares no code or storage with it.

How a table goes:

1. The host signs in with Google, says what the meal is for (随便吃吃, friends, a date, colleagues,
   family, a birthday, business, just me, late night), when, where they are (GPS or an area) and
   how far, and gets a QR code. Friends scan it; they don't need to sign in.
2. Everyone fills in a **diet card**: allergies incl. chili (don't eat / severe), anything else
   they type in (香菜, pork…; these only warn), halal, vegetarian, budget. Only the budget takes
   places off the list (the owner's call, 2026-11-11): the rest move places down and say why.
   The table's summary ("someone here doesn't eat peanuts", never who) comes only with the result
   (shown live, a line popping up as one person saves their card would give them away); in round 2
   a card that moved down says so the same way. Signed-in people's cards are saved. Someone who
   joins after the start fills in their card first.
3. **Round 1, what do you feel like**, before anything is searched: 👍 or 🚫 on the whole menu,
   31 cuisines in three groups (`MENU` in `src/engine/cuisines.ts`: 中餐 from 粤菜 and 川菜 to 东北菜
   and 中式烧烤, 亚洲菜 from 拉面 to 菲律宾菜, 西餐和其他 from 墨西哥菜 to 早午餐). The search then
   spends its searches on the cuisines more people liked than refused (see "Where the places come
   from"). A 🚫 moves that cuisine down.
4. **Round 2, the list**: every place open in range and within everyone's budget, ranked
   (`rank()` in `src/engine/pick.ts`). Every place of a cuisine round 1 liked comes first (the most
   liked cuisine's best first), however well rated the rest (the owner's call, 2026-11-11: a 4.7★
   burger place no longer sits above the hot pot everyone asked for). Within that: Google rating
   and how many rated it, our own ratings, distance, wait, a pick or a list badge, and what the
   meal is for and which meal it is (see "What it's for" below; a card says "适合商务宴请：高档、
   可订位" when a place fits, and a place plainly not for it comes after the rest, saying why).
   Round 1's 🚫 and someone's diet move places down,
   each with a line on the card: "有人不吃辣椒：川湘菜也有不辣的…" (what can still be ordered there,
   from `src/engine/tips.ts`: Google has no menus, so it's about the kind of food), and a severe
   allergy puts its cuisines at the bottom ("去之前一定先问店里"). The top six are full cards (when
   nothing was liked, at most two per cuisine; only places nobody has a problem with); the rest are
   shorter cards that open, ten more at a time. Every card has its rank, a short intro (cuisine,
   what it mainly serves from its name and Google type, price range), distance and rough walking
   and driving minutes, rating, last-order time, a 🟢/🟡/🔴 wait estimate, call and map buttons,
   and Google's AI summary when it has one. Tick every place you'd go; one secret veto each.
5. Most ticks wins; a tie spins (with no ticks at all, between the top six). The result card goes
   to the group chat with a link to rate the meal afterwards (three taps). Those ratings feed back
   into scores and wait estimates.

**On your own?** Start a table and choose "一个人" (just me): round 1 and the list work the same
for one phone, with cheap quick places and noodles a little higher and hot pot and Korean BBQ a
little lower. Picking alone used to be a page of its own (`/eat/solo`); since 2026-11 that
address goes to the home page. Picks made there can still be rated for a few days
(`changle.ca/eat/rate`, `POST /api/places/:id/rate`); those can go once nobody has one left.

**When** is asked with what it's for, on the home page (the host can change both in the lobby):
now, today's or tomorrow's lunch (12:00) or dinner (18:30) while they're still
ahead, or any half hour in the coming week. A planned meal checks each place against its opening
hours then (Google's `currentOpeningHours` periods, which come with the search and cover today and
the next six days, so that's as far ahead as it goes); places Google has no hours for stay on the
list, lower, with "call before you go". Cards then say until when a place is open that day instead
of minutes to last orders, the wait estimate is for that day and hour, and the result and the
message for the group chat carry the time. A plan whose time has come (less than 15 minutes ahead)
is just "now". Voting is still live; the asynchronous planned rooms in DESIGN.md (decision 2) are
not built.

**How far** is three tabs: walk (5, 10, 15, 20 or 30 minutes), drive (5, 10, 15, 25 or 40) and
any distance (Google's widest circle, 50 km, which covers Greater Vancouver from anywhere in the
city; places are then picked by popularity and distance).

**Where the places come from** (`src/engine/search.ts`). Google returns at most 20 restaurants per
search, so asking one circle for its most popular and its nearest gave the same 40 places every
time, and in a big area like Burnaby most restaurants never came up. Round 1 now comes before the
search, so a table's (at most) four searches go where people want to eat: the whole circle's most
popular; then each cuisine more people liked than refused, most liked first, over the whole circle
(by Google's place types, a Nearby Search; for the five Google has no type for, Sichuan,
Shanghainese, Northern Chinese, Chinese BBQ skewers and HK cafés, a Text Search by words, at most
two a table; liked cuisines past the fourth search are added to the last search by type); and with
what's left: walking, the nearest; inside a drive, smaller circles turned a different way each
time; for any distance, other neighbourhoods picked at random. A search that fails doesn't lose the
others. Everything those searches find that is open and within budget is on the list, in a fixed
order: the same places give the same ranking (no random nudge, no "seen lately"; both went with the
list, 2026-11-11).

**What a place is** (`cuisineGuess()` in `src/engine/cuisines.ts`). Steve, 2026-11-13: a table that
wanted 中式烧烤 · 串串 got Earls and Cactus Club before The Meat Up BBQ, an all-you-can-eat skewer
and hot pot place: nothing in its English name said skewers, and Google's "barbecue restaurant"
counted as steak. Now a place's cuisine comes from its Google types, its name and Google's
descriptions of it together, and a place can be more than one (`also`): The Meat Up is hot pot and
Chinese barbecue, a Cantonese seafood restaurant is seafood too, Kintaro Ramen is ramen and
Japanese. Round 1's 👍 and 🚫 count for every cuisine a place is, so whoever liked either finds it
first, and its card names the one they liked first ("🍢 中式烧烤 · 串串、火锅"); allergies are checked
for each of them. Google's main type decides unless the name says something more specific (海港酒家
is Cantonese though Google calls it a seafood restaurant; JOEY, Cactus Club and Earls are American;
兰州拉面 is Northern Chinese, not ramen). Types that mean different food in different kitchens are read
with the name, the other types and the description: "barbecue" is Korean, Japanese yakiniku, Chinese
skewers or Cantonese roast meats (烧腊), or American; "seafood" at a Chinese place is Cantonese. When
nothing says what it is (a "Chinese restaurant" called Golden Spot, a barbecue place with an English
name), a Text Search for a cuisine that finds it decides, whichever search found it first.
`KNOWN` in `tests/engine.test.ts` has real Greater Vancouver names for every cuisine on the menu.

**What it's for** (`src/engine/occasion.ts`). Steve, 2026-11-11: a business dinner put a 4.5★ bagel
shop first. Each occasion now weighs everything we know about a place, a Google star being worth
about 0.67 points and the occasion up to about 2: the kind of place from Google's main type (a café,
bakery or dessert shop, a breakfast or bagel place, a counter or takeout-only spot, fast food, a
bar), fine dining, price, bookings, wine and cocktails, good for groups or kids, a kids' menu, which
meals it serves (Google's servesDinner and the like), how late it's open, the words of Google's
descriptions ("upscale", "private rooms", "romantic", "unfussy", "family"), and the lists it's on:
a list for this very occasion (most romantic, best private rooms, family-friendly, late night)
counts most, a general one (Michelin, Vancouver Magazine, OpenTable's Top 100…) a little. A place plainly not for the occasion (a bagel shop,
café or burger place for a business dinner, a bar for the family) or the meal (at dinner, one that
doesn't do dinner or mostly does breakfast and coffee) comes after the ones that are, with a line
on its card ("不太适合商务宴请：这是早餐早午餐店，排在后面。"); nothing leaves the list. The searches
use it too: each occasion but "just a meal" has a search of its own for its kinds of place (a
business dinner: fine dining, steakhouses, seafood, Cantonese, French, sushi), and the searches that
aren't for a liked cuisine leave out the kinds of place it rules out (`excludedFor()` in
`search.ts`). A diet card budget too low for a business dinner ($60), a date or a birthday ($35)
is pointed out in the lobby to that person, who can change it there; the list says how many places
the budget left out.

## Cards: descriptions, lists and picks

Each card can carry more than Google's numbers, all from free sources:

* **A one-line description**: Google's own editorial summary of the place, when it has one: from
  the search, in the table's language; when Google has none in that language (some places only
  have an English one), the English one from the details request the top cards already make.
  Neither costs anything extra.
* **Google's AI summary** (`generativeSummary`): English only, in Canada, for food places that have
  one; always shown with its "Summarized with Gemini" line and a link to report it, as Google
  requires. From the search for every place (so mostly when the table uses English), and from the
  English details for the top cards. It costs nothing more: the search and details already bill at
  the tier it's in.
* **List badges** (🏅 Michelin, Vancouver Magazine Restaurant Awards, Canada's 100 Best, the
  Chinese Restaurant Awards incl. their Elite 30 Canada, OpenTable's Top 100 in Canada, enRoute's
  Best New Restaurants, Yelp's Top 100 Places to Eat in Canada): from `src/data/lists.json`, kept
  by hand. Facts only: which list, which award, which year, and the page that says so; nothing
  copied from the source's write-ups. A card shows up to four, newest first, one from each list
  before a second from the same list, and the table's occasion's own lists before the rest. Lists
  for an occasion say which (`occasions` on an award): OpenTable's Top 100 Romantic in Canada and
  Vancouver Magazine's Best Date Night (a date), Vancouver Magazine's Best Private Rooms (business,
  a birthday, colleagues) and Best Rooms for Rubbing Elbows (business, a date), OpenTable's best
  family-friendly restaurants in Vancouver (the family), Daily Hive readers' 20 best late-night eats
  (late night). Not there because they publish no list: 饭团 Fantuan (its
  rankings are inside the app only) and Uber Eats (its yearly Cravings Report names dishes and
  cities, not restaurants); Yelp's latest Canada list is 2024's.
* **Steve's pick**: a line of why, in Chinese and English, and links to food-blogger posts (小红书,
  抖音, TikTok, Instagram, YouTube, blogs), from `src/data/picks.json`.
* **Our users' rating**: thumbs-up share from the post-meal ratings, once three people have rated.
* **Order delivery** (`src/client/delivery.ts`): a fold under call and map with Uber Eats, DoorDash,
  饭团 Fantuan and Skip. Uber Eats (`ubereats.com/search?q=`) and DoorDash
  (`doordash.com/en-CA/search/store/…`) open a search for the place, by the English part of its
  name when Google gives both. Skip and Fantuan have no search link (both ask for an address
  first), so the tap copies the name and opens their site. The links send no referrer.

There is deliberately no combined score: Google's terms don't let us turn its ratings into a rating
of our own, and TikTok and Instagram have no API that can search posts by restaurant (scraping them
breaks their terms), so food-blogger posts come in by hand through `picks.json`.

To add a place to either file, add an entry; `npm test` checks both files (names, zh and en text,
https links, known list ids, years), so a bad edit fails CI instead of the app.

```jsonc
// src/data/lists.json → "places"
{ "name": "Kissa Tanto", "aliases": ["喫茶丹頭"], "address": "263 E Pender St", "city": "Vancouver",
  "awards": [{ "source": "michelin", "label": { "zh": "米其林一星", "en": "MICHELIN 1 Star" }, "year": 2025,
               "url": "https://guide.michelin.com/…" }] }
// src/data/picks.json → "places"
{ "name": "Kissa Tanto", "address": "263 E Pender St",
  "note": { "zh": "意日融合，约会首选", "en": "Italian-Japanese, a date-night favourite" }, "by": "Steve",
  "links": [{ "platform": "小红书", "url": "https://www.xiaohongshu.com/…", "title": "探店" }] }
```

Places are matched by name (case, accents, " - Robson St" and words like "Restaurant" don't
matter; `aliases` covers other names, e.g. Chinese ones). Give `address` when the name has several
branches: then only the branch at that street number matches. With an address, Google's
two-language names ("Sea Harbour Seafood Restaurant 海港酒家") and unit numbers in front of the
street number ("150-8888 River Rd") still match.

## How it sits inside changle.ca

* **Addresses.** The Worker answers `changle.ca/eat` and `changle.ca/eat/*` (the routes in
  `wrangler.jsonc`); the rest of changle.ca is the site. Everything is under `/eat`: the home page
  (`/eat/`), a phone at a table (`/eat/r/1234`, which is also what the QR code and the invite link
  say), rating the meal afterwards (`/eat/r/1234/rate`, or `/eat/rate` for a solo pick made
  before picking alone went), the API (`/eat/api/…`), sign-in (`/eat/auth/…`) and the
  files (`/eat/app.js`, `/eat/app.css`, built into `dist/client/eat`).
  `BASE` in `src/base.ts` is the one place that says `/eat`; the server strips it off incoming
  paths and the pages put it in front of theirs. The session cookie's `Path` is `/eat` too, so
  the rest of the site never sees it.
* **The site's side** (the card in the site's Tools tab that opens `/eat`) is in the site's code,
  next to 到此一游's card.

## What's where

| Folder | What it is |
| --- | --- |
| `src/base.ts` | `BASE = "/eat"`: where the tool lives on changle.ca. |
| `src/engine` | The rules: cuisines and round 1's menu (`cuisines.ts`), what the meal is for (`occasion.ts`), which searches to run (`search.ts`), diet limits (with the table of what each allergen is common in, `limits.ts`), what can still be ordered (`tips.ts`), what a place mainly serves (`dishes.ts`), wait estimates, the ranked list, counting votes. No network. |
| `src/room` | One table from lobby to result. No network inside, so it's easy to test. |
| `src/server` | The Cloudflare Worker: rooms (one Durable Object each), Google Places, Google sign-in, users' diet cards, our per-restaurant ratings. |
| `src/client` | The phone pages (Preact), Chinese and English: home, a table, rating, and the privacy and terms pages (`privacy.html`, `terms.html`, plain HTML at `/eat/privacy` and `/eat/terms`). |
| `src/data` | Kept by hand: `lists.json` (list badges) and `picks.json` (Steve's picks), matched to Google's places in `src/server/curated.ts`. |
| `tests` | Rules and room tests (Node), and phones in a browser (`tests/e2e`, Playwright): a whole table, and the privacy and terms pages. |

## Run it on a computer

```sh
npm install
npm run dev          # http://localhost:8787/eat/, with made-up demo restaurants and no sign-in
```

To try it from a phone on the same Wi-Fi: `npm run dev -- --ip 0.0.0.0`, then open the computer's
address on port 8787, followed by `/eat/`. To run it with Google switched on, copy
`.dev.vars.example` to `.dev.vars` and fill it in (it says what each setting is).

## Check it

```sh
npm run typecheck
npm test             # rules (incl. "only the budget leaves a place out, a severe allergy goes last", 500 random tables) and room
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
   Text Search 100, Place Details 600, Place Photos 600. Each table runs up to four searches (two
   of them may be Text Searches, for cuisines Google has no type for), so that is about 50 tables a
   day; past it, searches fail until tomorrow instead of costing more.
6. Cloudflare: add Secret `GOOGLE_PLACES_KEY`.

Check: open changle.ca/eat; the yellow "示例数据" banner is gone. Start a table where you are: after
round 1, round 2 shows real restaurants, the cuisines you liked first, with photos (credited to whoever took
them), opening hours and phone numbers. If the table says "搜索出错了", open Cloudflare →
`suibian` → Logs: a line `places Error: google 403 …` means the key is wrong, restricted to the
wrong API, or Places API (New) isn't enabled; `google 429` means today's quota is used up.

Real Google data is used only when both sign-in and the Places key are set, so strangers can't
spend your API money. Each table makes up to 4 searches, plus details and one photo for each of
the six full cards at the top of the list; the rest of the list comes from the searches alone.
What the meal is for uses fields the searches already return at the same price (good for groups,
wine, cocktails, kids' menu…). Google gives every kind of request a monthly free allowance; a group of friends eating
out a few times a week should stay well inside it, but look at Billing after the first week to
be sure.

## Numbers you might want to change

* Round timings, and how long a phone that drops off (map app, locked screen) still counts as at
  the table: `TIMING` in `src/room/protocol.ts`. People per table, searches per table and
  ratings per table: `MAX_MEMBERS`, `MAX_SEARCHES` and `RATING_SLACK` there.
* Score weights, how far each reason moves a place down (`DEMOTE`), full cards at the top, max per
  cuisine there: `src/engine/pick.ts`.
* Round 1's menu, and the searches each cuisine gets: `CUISINES` and `MENU` in
  `src/engine/cuisines.ts`; how many searches a table runs (`SEARCHES_PER_PICK`, of them
  `TEXT_SEARCHES_PER_PICK`): `src/engine/search.ts`.
* What each occasion moves up or down, which kinds of place are plainly not for it, and when a card
  says it suits: `occasionFit()` in `src/engine/occasion.ts`; each occasion's own search and what
  the searches leave out: `OCCASION_TYPES` and `excludedFor()` in `src/engine/search.ts`; the
  budget each occasion needs before the lobby says so: `OCCASION_BUDGET` in `src/client/ui/Table.tsx`.
* Which cuisines each allergen is common in: `COMMON_IN` in `src/engine/limits.ts` (reviewed with
  the owner on 2026-11-05, the reason beside each). The line about what can still be ordered there:
  `src/engine/tips.ts`.
* Wait-estimate rules (peak hours, popularity): `src/engine/wait.ts`.
* Tables per account per day: `ROOMS_PER_DAY` in `src/server/worker.ts`.
* How far each range reaches: `RANGES` and the tabs' `RANGE_MODES` in `src/engine/clock.ts`.
* Areas offered when GPS is off: `NEIGHBOURHOODS` in `src/engine/clock.ts`.

# 随便 · Whatever's Fine — design

A tool on [changle.ca](https://changle.ca) that gets a group of friends in Vancouver from "where
should we eat?" / "随便" to a restaurant everyone can eat at, in under 3 minutes, and makes the
deciding part fun.

This document records the decisions made before any code (a 14-question grilling, October 2026).
v1 is built (see [README.md](README.md)); v2 and v3 are not.

## The problem, restated

The pain is not finding a good restaurant; it is a group deciding. Nobody wants to be the one who
picks, everyone says 随便, then vetoes one place after another. So this is a group-decision tool
first and a restaurant search second.

Two kinds of input, handled differently:

* **Hard limits** (allergies, halal, vegetarian, budget ceiling) only filter. They are never
  averaged against anyone's taste, and they are anonymous: the room sees "someone at this table
  doesn't eat peanuts", never who.
* **Soft preferences** (cuisine, mood, distance) are voted on and can be traded off.

## Decisions

| # | Question | Decision |
| --- | --- | --- |
| 1 | When is it used? | Both: **now** (together or meeting within ~2 h) and **planned ahead**. Same flow; the start asks "when", which decides whether opening hours are checked against now or the planned time, whether wait is estimated, and whether the result links to directions or to booking. |
| 2 | How does a planned-ahead group vote? | **Asynchronously**: host sets a deadline, posts the link in the group chat, people vote when they can and may change their vote; at the deadline the result is revealed and a result card is made for the host to forward. "Now" rooms vote live. One room type; the only difference is the deadline. |
| 3 | Remember each person's limits? | **Optional login.** Logged in: your diet card and taste are saved and filled in when you join a room; one button deletes them. Guest: fill in each time. Allergies have two levels: **severe** and **don't eat**. *Changed 2026-11-11 (owner): neither rules a place out any more. Places where it's common move down the list, a severe allergy's to the bottom, each with a note on what can still be ordered; only the budget takes places off.* |
| 4 | Login method | **Google only.** Google blocks sign-in inside WeChat's built-in browser (`disallowed_useragent`), so there the login button says "··· → open in browser"; guests can still join and vote in WeChat. |
| 5 | How to narrow down | **Two rounds.** Round 1 "today's mood" (~20 s): everyone taps 👍 or 🚫 on ~12 cuisine chips; any 🚫 removes it, 👍 count weights it. Round 2: 6–8 candidate cards, approval vote (tick any number) plus **1 veto card each**; highest score wins, ties go to a spinner. *Changed 2026-11-11 (owner): a 🚫 moves the cuisine down instead; round 2 is every place in range and budget, ranked, the top six as full cards; with no ticks at all the spinner turns between the top six.* |
| 6 | Location | **Now:** host's current location plus a range ("10 min walk" / "15 min drive"). **Planned:** each person picks their starting neighbourhood (not GPS) and how they travel; the area is chosen so the person with the longest trip has the shortest one. Cards show each person's minutes ("🚇 25 min · 🚗 15 min, parking hard"). Travel times are only computed for the final candidates. |
| 7 | Where restaurants come from | **Two layers.** Google Places, fetched live per room, gives hours, reservable, rating, photos, reviews; none of it is stored. Our own layer, keyed by Google `place_id` (which may be stored), holds fine cuisine tags (Cantonese, Sichuan, HK café, Hakka…), pasted 小红书 / Instagram / Yelp links, must-order dishes and our post-meal ratings. Untagged places get a cuisine guess from Claude for that room only. Any logged-in user can add tags and links; every edit records who made it and the admin can undo it; guests read only. 小红书 and Instagram are never scraped. |
| 8 | "Single-device" mode | **One person alone**: pick mood and place, get 3 suggestions or pull a slot machine. Groups always use one phone each; no pass-the-phone mode. |
| 9 | Will there be a wait? | Rule-based 🟢 none / 🟡 maybe 15–30 min / 🔴 likely queue, marked as an estimate, from: reservable, OpenTable availability, day and hour, popularity, and queue mentions in reviews. Calibrated by our own data: post-meal "how long did you wait", and anyone at a restaurant can report "20 min queue now" (shown to other rooms for 2 h). Every card has a 📞 call button. |
| 10 | Picking the 6–8 candidates | Score = Google rating shrunk toward the area average by rating count + our own post-meal ratings (weighted higher) + cuisine 👍 count + travel fairness + (now) wait level and minutes before last order. Then: at most 2 per cuisine, 1 slot for "🆕 haven't been" and 1 for "⭐ our usual" when one exists. Weights start as defaults and are tuned against post-meal ratings. *2026-11-11: the score ranks the whole list; diet and round 1's 🚫 subtract (`DEMOTE` in `pick.ts`), at most 2 per cuisine applies to the top six.* |
| 11 | API cost and abuse | **Creating a room needs Google login** (joining doesn't); at most 10 rooms per account per day. Places requests use field masks; reviews, photos and Claude only for the final candidates; each place fetched once per room. Google Cloud budget alert and daily quota cap. |
| 12 | Post-meal feedback | The result card carries a "rate it after you eat ⭐" link (the card is already going to the group chat), and logged-in users get a prompt next time they open the site. Three taps, under 10 s: overall 👍/😐/👎, "did I get something I liked?", "how long did we wait?" (0/15/30/45+). Guests can rate anonymously. When everyone has rated, the table's score is revealed. |
| 13 | What v1 is | See below. |
| 14 | Name and place | **随便 · Whatever's Fine**, under `tools/suibian`, at `changle.ca/eat` (a card in the site's Tools tab). Chinese/English, following the phone's language. |

## v1 — take it to the next dinner

* "Now" rooms only: one phone each, QR join, live voting. Room, QR and reconnect code from
  到此一游 (`games/been-there/src/room`, `src/server`) are reused, moved to shared code where
  needed.
* Google login; host must be logged in, guests join anonymously; logged-in diet cards fill in.
* Diet card (two allergy levels, halal, vegetarian, budget), submitted anonymously. Since 2026-11-11
  only the budget filters; the rest move places down the list with a note.
* Round 1 cuisine 👍/🚫, round 2 six cards with approval votes and one veto each, spinner on ties.
  Cuisines come from Google's place types in v1 (coarse).
* Location: host's current location plus range.
* Cards: open now, minutes before last order, reservable, 📞, rule-based 🟢/🟡/🔴.
* Result card (directions, phone, rating link) and the three-question post-meal rating.

**v2:** planned-ahead rooms (deadline, starting neighbourhoods, travel fairness); our own data
layer (fine cuisine tags, 小红书 / IG links, must-order dishes); Claude cuisine guesses and review
summaries; 🆕 and ⭐ slots.

**v3:** solo mode with slot machine; live queue reports; weight tuning from ratings; health
inspection and Michelin tags.

## Data sources and their rules

| Source | Used for | Rule we follow |
| --- | --- | --- |
| Google Places API (New) | search, `currentOpeningHours`, `reservable`, `servesVegetarianFood`, `priceLevel`, `rating`, `userRatingCount`, up to 5 reviews, photos, phone | Fetched live, not stored; only `place_id` is kept. Google attribution shown wherever its data appears. |
| Google Routes API | travel minutes per person (v2) | Final candidates only. |
| Claude API | cuisine guess, review summaries (v2) | Results used in the room, not stored as Google content. |
| OpenTable | availability for the wait estimate | Link out; no scraping. |
| 小红书, Instagram, Yelp | links people paste | Never scraped; shown as "📕 3 posts" and opened in their own app. |
| Vancouver Coastal / Fraser Health inspections, Michelin Guide | tags (v3) | Public lists. |
| Our own data | cuisine tags, links, ratings, waits | Stored in our database; personal diet data deletable by its owner. |

## How we will know it works (beyond the two of us)

1. **Baseline first.** Before v1 is used, record the next two group-chat "where do we eat"
   decisions: minutes from first message to decision, and message count. Then compare v1 rooms
   the same way.
2. **Everyone ate something they liked.** The post-meal question "did I get something I
   liked?" per person, not just the average. Allergy incidents must be zero.
3. **Data accuracy.** How often "open" was wrong, and estimated vs. reported waits.
4. **Repeat use.** Whether a friend opens a room on their own the second or third time.
5. **Against simple baselines.** Was the pick better rated than Google Maps' top result or a
   random pick from the filtered list?
6. **Tests.** Rules-engine unit tests (only the budget leaves a place out, and a severe allergy's
   cuisines always come after every other place; a veto always removes a card), and multi-phone
   Playwright tests as in 到此一游.

## Still open

* **Allergen → which cuisines it's common in.** No source lists allergens per menu, so v1 uses a
  hand-made map (`COMMON_IN`; e.g. peanut → Thai, Southeast Asian, Vietnamese, Sichuan; chili →
  Sichuan, hot pot, Thai, Korean, Indian, Mexican, Southeast Asian), reviewed 2026-11-05, plus a
  "tell your server" reminder on every result. Since 2026-11-11 it moves places down instead of
  ruling them out, and `tips.ts` says what can usually still be ordered.
* **Typed "don't eat"s.** Besides the fixed list (incl. chili), people can type up to 6 items of
  their own (香菜, pork…), each "don't eat" or "severe". They can't be matched to cuisines, so
  they never move a place; they are listed anonymously for the table and in the reminder.
* Budget ceiling ↔ Google `priceLevel` mapping, in CAD per person.
* What the host sees if location permission is denied (pick a neighbourhood instead).
* Exact default weights for the score in decision 10.

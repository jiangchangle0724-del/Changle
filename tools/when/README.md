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
| `src/engine/` | The rules, with no browser and no Cloudflare in them: Vancouver days (`time.ts`), days and slots (`slots.ts`), the best three (`rank.ts`), codes (`ids.ts`), what follows once a time is set (`after.ts`), the calendar file and the Google Calendar link (`ics.ts`), B.C.'s holidays, festivals and long weekends to the end of 2028 (`holidays.ts`) and what the grid says about them (`daynotes.ts`), filling in many slots at once (`quick.ts`), times within a period to the minute (`minutes.ts`), who the host means to ask and who of them is still to answer (`invited.ts`), when to answer by (`deadline.ts`), the words to paste into the group chat (`copy.ts`), the line saying who else has the page open (`here.ts`), the weather at a time (`weather.ts`). |
| `src/room/event.ts` | One gathering: who answered what, what was set, who may change which part. Plain logic over a small store. |
| `src/room/protocol.ts` | What the phones and the server say to each other. |
| `src/server/worker.ts` | The Worker: routes, the Durable Object that wraps a gathering (`EventDO`, SQLite), the daily allowances (`GateDO`). |
| `src/client/` | The phone pages: `ui/Home.tsx` (make a gathering), `ui/Event.tsx` (a gathering), `ui/Calendar.tsx` (add to calendar) and `ui/After.tsx` (what's next), both for once its time is set, `ui/Picture.tsx` and `picture.ts` (the pictures to pass around), `ui/Words.tsx` (the words for the group chat, in a tone), `ui/Here.tsx` and `finished.ts` (who else has the page open, and who of them has just filled in), `ui/Moving.tsx` (the best three changing places), `ui/Weather.tsx` (the forecast and the line that says it), `i18n.ts` (every word, Chinese and English), `styles.css`. `tokens.css` is a copy of the site's. `art/` holds four pictures (its own README says what each is for; two are in use, as the backgrounds of the pictures to pass around). |
| `tests/` | The rules and the room (`npm test`), and phones in browsers (`tests/e2e`, `npm run test:e2e`; what every browser test starts from is in `tests/e2e/helpers.ts`). |

### What is kept, and for how long

Each gathering is one Durable Object with its own SQLite database: the gathering (its name, days,
what was set, the host's list of names and deadline) and one row per person (a name and their
answers). Nothing else: no accounts, no
email, no phone numbers. It deletes itself 60 days after it was made (an alarm). While a page is
open, its socket carries the fingerprint of that phone's key (below); it goes with the socket.

### Who may change what

Every phone makes its own key for a gathering (32 random bytes, kept in that phone's browser) and
sends it with each request in `x-when-key`. The server keeps only the key's SHA-256 fingerprint.

- A row is changed only with the key it was made with. Sending someone else's row id is refused.
- The phone that made the gathering is its host: it sets the time, marks who must be there, sets
  the least number of people, writes who it means to ask and when to answer by, fills in for
  someone (below), removes a duplicate row.
- A row a host filled in for someone is marked as such and has no key: no phone can take it over,
  only a host changes it, and a host changes no row someone filled in for themselves.
- Another phone becomes a host with the 6-digit admin code, shown once when the gathering is made.
  Five wrong codes in a row and that gathering takes none for an hour; one network may try 20 a
  day across all gatherings, and make 30 gatherings a day.

### Keeping pages up to date

Saving goes by ordinary requests (they work everywhere, WeChat included, and nothing typed is lost
when a connection drops). The server pushes the gathering to every open page over a WebSocket
(`/when/api/e/<code>/ws`, hibernating, so an idle gathering costs nothing). When the socket is down
the page asks again every ten seconds, and the moment it comes back to the front. The page closes
its socket while it is out of sight (another app in front, the screen off) and opens it again when
it is back, which is also how the others know it has gone (below).

### Who's here (谁在看)

The line under the gathering's name says who else has the page open right now (A3, 2026-11-18):
"阿May、小王 也在看", "May and Wang are here too", or "现在只有你在看" with its dot unlit. It is
always one line, so nothing below it moves when people come and go.

- Once its socket is open, a page says which key is its own (`{ "t": "hi", "key": … }`): a browser
  can't send a header with a WebSocket, and a key never goes in an address, where it would be
  logged. The server keeps the key's fingerprint with the socket and tells every phone with the
  page open who else is there (`{ "t": "here", … }`), each without itself, whenever that changes;
  a page reading the gathering the ordinary way is told it too.
- People with a row go by their name, in the order they joined; a host's phone without one is
  "发起人" (the host); the rest are counted. Three names at most, then "等 5 个人".
- A page counts while it can be seen: it closes its socket when it goes out of sight and when it is
  left. A phone that goes quiet without saying goodbye (out of signal, its battery flat) is let go
  once its pings (every 30 seconds, answered without waking the gathering) have stopped for 75
  seconds (`QUIET_MS`): while anyone has the page open, the gathering wakes every minute to look
  (the same alarm that deletes it after 60 days). So that one is gone from the line within about
  two minutes.
- A phone that can't keep a socket (some networks refuse them) still sees who's here, every ten
  seconds, but isn't counted itself.
- When one of the others has filled in (their answers changed, then stayed as they were for three
  seconds), the line says so for four, with a tick that pops in: "阿May 填好了" the first time,
  "阿May 改了时间" when they had answers before. The same person again within 90 seconds is still
  the same filling in, said once (`src/client/finished.ts`). Never about this phone's own row, or
  one it fills in for someone.
- When the best three change order, they slide to their new places and one new to them rises in
  (`src/client/ui/Moving.tsx`, the site's timings). With the phone set to reduce motion, they just
  change places, and the tick just appears.

### Weather (天气)

Under each of the best three, on the banner of the time that was set and in a slot's sheet, one
line says the weather for that time where the forecast reaches (A4, 2026-11-18; Steve: the
recommended times should say the weather): "40% 可能下雨 · 最低 3°", "晴 · 8°", and
"有雨 · 最高 8°，适合室内" when rain or snow is likely (60% or more, or no chance given: ECCC
gives one only from 30 to 60 percent). Under the best three: "天气数据来源：加拿大环境与气候变化部"
with a link to the licence, as the licence asks.

- The forecast is Environment and Climate Change Canada's for Vancouver (open data, free, no key):
  MSC GeoMet's city page weather as JSON (`WEATHER_SOURCE` in `src/engine/weather.ts`). It has a
  day (6:00 to 18:00) and a night (18:00 to 6:00) for about six days ahead, and the next 24 hours
  hour by hour.
- `/when/api/weather` gives it to the pages in a small shape (`readForecast`), kept half an hour in
  each Cloudflare data centre (a few minutes when ECCC can't be reached, which shows no weather).
  Under test it gives none; the browser tests hand the page their own.
- A page asks only when one of the days asked about is in the coming week, and again when it comes
  back to the front half an hour later.
- A slot goes by the hours still to come when the next 24 cover them (the wettest hour's sky, the
  most likely chance, the average temperature), and otherwise by its day or night: 凌晨 with the
  night before, 晚上 with its own night, the rest of the day with the day (with its high; a night
  with its low). A time set or found to the minute goes by those minutes.
- The icons are Lucide's (`lucide-preact`), as on the rest of changle.ca; its licence is in the
  built `licences.txt` with the fonts'.

### Periods of the day

A new gathering asks by the period of the day, five to a day, each with its hours at the top of
its column (`partsOf("periods")` in `src/engine/slots.ts`):

| 凌晨 Night | 早上 Morning | 中午 Midday | 下午 Afternoon | 晚上 Evening |
| --- | --- | --- | --- | --- |
| 0:00–6:00 | 6:00–11:00 | 11:00–14:00 | 14:00–18:00 | 18:00–23:59 |

or by the day. In sentences 凌晨 is "early hours" in English: 凌晨 on a Saturday is what English
calls Friday night. Gatherings made before 2026-11-14 were asked by the half day (上午, 下午,
晚上); they open and save as they always did, and a page opened before then can still make one.

The grid's side shows each day short ("周一 11/16") so the five keep a crowded tap target's width
from a 375px phone up; on a narrower phone the day's name goes on a line of its own above its
five.

### Times to the minute

Someone free for only part of a period says which part, to the minute (Steve, 2026-11-14). The
rules are in `src/engine/minutes.ts`, the sheet in `src/client/ui/Times.tsx`. Only gatherings
asked by the period have it: a half day and a whole day have no stated hours.

- For five seconds after a tap answers a slot, the line at the bottom says which slot it was
  ("11月15日 周日 晚上 · 整段") with **调时间** beside it. Or **调到分钟**, among the quick fills,
  makes every tap open the slot's time. The sheet has the period as a line with a handle at each
  end (drag either; with a keyboard the arrows move a minute, Page Up and Page Down a quarter of
  an hour), two time fields to type into, 有空 / 可以调 / 没空, and one button that gives the same
  answer and time to the same period on the other days answered. A time is half an hour or more;
  all of the period is the slot itself and keeps no time.
- A person's times are kept with their answers: `times: { "2026-11-21:eve": [1170, 1335] }`,
  minutes from midnight, up to but not including the second. The server keeps only times inside
  the period, for slots the person answered, half an hour or more, never the whole period.
- The best three go by each slot's best stretch. Starting at the period's start and at each
  start of someone's time, the stretch is as long as the free people there all have (with nobody
  free, the people who could move things); it counts who is free and who could move things for
  all of it. Most free wins, then most who could move things, then the longest, then the
  earliest. So someone free only before seven and someone free only after eight don't count as
  meeting. With people who must be there, the stretch is the best of those they can all make
  (their time bounds it even when they could only move things); with none, the slot is out. A
  best stretch that is the whole period counts as a slot always has: everyone who answered it.
  The grid's numbers still count everyone who answered.
- **就这个** sets the best stretch: `settled` gets `from` and `to` (none for the whole period).
  The banner, the words for the group, the calendar file, the result picture and the meal time
  taken to 随便 use them. A host can adjust it afterwards (**调定下的时间**), seeing who is free for
  all of it before setting it.

### Holidays on the grid

Above a day in the grid, one line says what that day is, in the page's language
(`src/engine/daynotes.ts` chooses the words, `DayNotes` in `src/client/ui/Event.tsx` shows them):

- a B.C. statutory holiday, with "法定假日 / stat holiday" after its name, in the tool's amber:
  most people are off;
- a festival people keep without a day off (春节, 中秋, Christmas Eve…), in the quiet text color;
- where a long weekend runs to ("连休到 12月27日 周日"), said once, on the first of its days the
  gathering asks about.

A day with none of these has no line. The dates are not worked out here: they were looked up and
sit in `src/engine/holidays.ts` with their sources, from November 2026 to the end of 2028. After
that the grid says nothing until the next years are added there.

### Quick fill

In "my times", three chips above the grid fill in many slots with one tap: **all free**,
**weekends** (when some of the days, but not all, are weekend days) and **evenings** (when the
gathering asks by the period). There, a day's name is a button too, and fills in its row. None
of them covers 凌晨: nobody who says "any time" means the middle of the night, and someone who
does taps those themselves (the line that comes up says so). Each
says "free" for every slot it covers and is lit while they all are; pressed then, it takes them
back. The rules are in `src/engine/quick.ts`.

A slot filled that way and not touched since goes back to "not free" with one tap, so someone who
is free most of the time presses "all free" and then taps only what they can't make. A slot
tapped by hand goes round as before: free, could move things, not free. Which slots were filled
in one go is remembered only while the page is open.

Every quick fill, and "clear all" under the grid, can be undone for six seconds, or until the
next tap on a slot, from the line that comes up at the bottom of the screen.

### Who's still to answer, and the words for the group chat

A page in WeChat can't send anyone a notification, so the page gives words to paste into the
group chat instead (A3, 2026-11-14).

- **Who's invited**: the host writes the names it means to ask, a line each or with 、，, between
  (never split at a space, so "Mary Ann" is one name), 40 at most. A name counts as answered once
  someone of that name has a row, even with nothing free: letters match in any case or width, so
  "may" is "May". Under who's in, everyone sees "还差 2 个：小王、老李" (still to answer), or that
  everyone on the list has answered. Without a list nobody is known to be missing.
- **Answer by**: the host picks a day (today to the last day asked about) and a time, in
  Vancouver time like everything here. The line under the gathering's name says "11月19日 周四
  20:00前填好"; the invitation picture says it too. When it comes, every open page marks it
  passed and shows who's still to answer as a warning. Answers are still taken after it: it only
  marks who is late. A phone's page looks again at the deadline by its own timer; the server
  doesn't push anything for it.
- **Nudge** and **Invite**, under who's in until the time is set, for everyone: the words for the
  group chat (`src/engine/copy.ts`, written by Codex in C4, read and signed off line by line). A
  nudge names who on the list is still to answer (more than five are counted), or speaks to
  whoever hasn't answered; an invitation says the days asked about. Both say when to answer by
  while it is still ahead. Three tones (正经 plain, 轻松 easy, 搞笑 funny), three lines each:
  "another one" takes the next. The page shows the words in its language as they will be pasted,
  with a button for each language. The tone a phone last picked is kept on that phone
  (`when.tone`) for every gathering; plain until then.
- Once the time is set, "tell the group" uses the same words and tones for the result.

### The same people again (同一帮人再约)

A host's phone remembers who each gathering it hosts is for (A4, 2026-11-19): the host's list, then
everyone else who answered, without the host's own name (`crewOf` in `src/engine/invited.ts`),
kept in that phone's browser (`when.crews`: the three newest, the same list kept once, forgotten
after 60 days). Nothing about it goes to the server until it is used.

- The home page, once there is one, asks "要请谁" with a chip for each ("周末火锅（6 人）") and
  "先不写", which is chosen until another is tapped. The new gathering starts with that list, so
  "还差谁" works from the first minute.
- In the list's sheet on a gathering, "跟以前哪次一样" brings one in, onto the names already typed
  (each name once); the host still saves it.

### Filling in for someone

A host can fill in for parents, or a friend without WeChat (代填, A3, 2026-11-14). Under the host's
tools, "who for" takes a name; the grid is then theirs, on the same page, with everything the grid
does (quick fills, times to the minute), until "done". The panel is outlined in the room's light
and says whose times these are, so they aren't taken for the host's own. The host's own taps are
saved before the grid changes hands, and every save goes to the row it was tapped for.

- The server: a host action, `{ do: "proxy", name, answers, times }` makes the row (marked
  `proxy`, with no key) and returns its id; with `id` it changes that row again. A row someone
  filled in for themselves is refused.
- Everyone sees the name marked 代填 ("by the host"). A host taps it to change it again, mark it
  as a must, or remove it.
- The same name again carries on with that row rather than making a second. A name someone has
  filled in for themselves can't be filled in for.
- If they later fill in themselves, the host is told under who's in that the 代填 row can go. The
  page doesn't merge the two: removing the 代填 row is one tap.

### Pictures to pass around

A link pasted into WeChat shows no picture of its own, so the gathering's page makes two that can
be sent on like any photo:

- the **invitation** (the button beside the link and the QR code): the gathering's name, the days
  it asks about, and a code that leads to its page;
- the **result** (under "tell the group", once the time is set): the name, the day and part, who
  can make it in the page's own words, and the same code.

Each is drawn in the phone when asked for and never sent anywhere (`src/client/picture.ts`): a
1080 × 1440 canvas over one of the two backgrounds in `src/client/art/`, which keep their middle
three fifths empty for this, with the words set as large as fits and the code dark on a white card.
The picture comes out as a JPEG of about 150 kB, in the page's language. `src/client/ui/Picture.tsx`
shows it in a sheet. In WeChat a page can neither share nor download, so the picture is pressed
and held to save it or send it on, and to follow its code: the page allows pressing and holding
on the picture and nowhere else. Other browsers also get "share" (where the phone can share a
file) and "save the picture".

A picture a page imports (`import picture from "../art/x.webp"`) is built to
`assets/art/<name>-<hash>.webp`, so it can be kept for a year like the scripts; only the pictures
a page imports are built at all.

### Once the time is set

The banner of the time that was set carries **Add to calendar**, for everyone
(`src/client/ui/Calendar.tsx`). An iPhone, an iPad or a Mac gets the gathering's calendar file,
`/when/api/e/<code>/calendar.ics` (`src/engine/ics.ts` writes it; it is there only while a time is
set, and never kept, since the host can choose again); everything else goes to Google Calendar
with the event filled in. The other of the two is the link beside the button. Inside WeChat
neither opens, so there the button says how to get to a browser. The event runs for the minutes
that were set; without them, for the slot's usual hours (`PART_HOURS` in `src/engine/slots.ts`:
the evening goes in as 18:00 to 22:00, not to midnight), and a whole day is an all-day event. The times in the file are in UTC with no time-zone block, so
no calendar can get Vancouver's rules wrong.

Every page also asks what's next (`src/client/ui/After.tsx`; the rules are in
`src/engine/after.ts`):

- **Tell the group**: the result as words to paste into the chat, in a tone (above), in Chinese
  and in English, with the gathering's link under them, and as a picture (above). They say the
  minutes when the time was set to them.
- **Where to eat**: on to 随便 (changle.ca/eat). Only a host gets the link, so one gathering opens
  one table; everyone else is told to wait for the table's link. The link carries what is known:
  `/eat/?from=when&code=<code>&date=2026-11-21&time=18:30&occasion=friends&people=7` (宵夜 at
  0:30 in the early hours, 早茶 at 10:00 in the morning, lunch at 12:00 at midday and for the old
  half days' morning and afternoon, afternoon tea at 15:00, dinner at 18:30 otherwise; a time set
  to the minute takes its start; `people` is everyone who is free or could move things for the
  time that was set). 随便 doesn't read these yet, so the page also says which
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

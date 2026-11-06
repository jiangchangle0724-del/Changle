# party-server · changle.ca/party

The room server and pages of 一起跳 · Dance Along. It wires the shared base in `games/party-base`
(types, clock sync, calibration, scoring, the room state machine: pure functions, read its
`CONTRACTS.md`) and the move library in `games/dance` (20 moves, 6 dances, and `session-flow.ts`,
which lays a dance out beat by beat) to a Cloudflare Worker, one Durable Object per room, and two
pages. The plan is `docs/dance-along.md`; the brief (what's done, what's next) is
`docs/briefs/dance.md`. (打碟 · DJ Booth was planned on this base too; it was built in the site
instead, `site/src/party/dj/`.)

## What's here

- **Rooms**: `src/server/worker.ts` (the Worker and the `PartyRoom` Durable Object) around
  `src/server/session.ts` (the session: pure, tested). Every page message from the host becomes a
  party-base `RoomEvent`, stamped in speaker time, through `reduce()`; the new state is stored and
  sent to every page. A page that drops gets a grace period (speaker 8 s, phone 45 s) before it
  counts as gone. What the pages and the room say: `src/shared/protocol.ts`.
- **The room's one clock** is the speaker page's (`pageClock()` in `src/client/common.ts`: its
  `performance.timeOrigin` plus `performance.now()`, so a reload of the page doesn't move it). The speaker pings the room
  every second, works out its offset to the room's clock (party-base's `estimateClockOffset`) and
  reports it; the room answers every phone's ping with `{ speakerAt }`. Phones send 8 pings on
  joining, 3 more every 15 s, and count their clock as set after 6.
- **A dance** (`src/shared/catalog.ts`, `src/shared/show.ts`): the host picks one of the 6 dances
  and "learn it first" or "just dance". The room puts the warm-up's first beat 3 s ahead
  (`RoutineInfo.leadStartAt`); every page lays the dance out from the same data (session-flow's
  timeline: warm-up, each move once at 70% to watch and to follow, a 4-beat count-in, the dance,
  the cool-down), so they agree on every beat with nothing else sent. When the lead runs out the
  room moves into the dance by itself (`LEARNING_DONE`, a Durable Object alarm), putting the dance's
  beat 0 (`RoomState.routineStartAt`) exactly where the lead already had it. The host can skip
  ahead to the dance, go back to the start of the 8-count being heard (这一段再来), see the results
  once the dance has been heard (看结果, skipping the cool-down), or stop.
- **The beats**: each phone judges its player's moves against the beat as the room hears it (the
  speaker's grid plus the TV's delay; `src/shared/taps.ts`, party-base's scoring windows) and sends
  the dance's beats a bar at a time (`beats`); after a dropped connection it sends them all again
  (the room keeps the newest of each beat, so twice does no harm). For now a move is a tap on the phone's big button,
  standing in for the motion sensor (the plan's 假体感); task A2 feeds the same judge the sensor's
  peaks. The room keeps the beats (`src/server/tally.ts`), sends the speaker the floor together
  after each bar (the streak bar; full at 32 beats: fireworks), and at the end works out the
  results: each dancer's participation (party-base's `summarize`), and 最稳 (closest to the beat),
  最嗨 (the longest run on the beat), 最努力 (moved on the most beats). Easy dances show only the
  awards; medium and hard also the scores.
- **`/party/screen`**, the speaker (`src/client/screen.ts`): Start (starts the audio and keeps the
  screen on), the room code and QR code, the players (a phone's 我在 lights its name),
  calibration (8 clicks 1.2 s apart, the host's taps in speaker time, `calibrateFromTaps()`; three
  tries). While a dance plays: the beat (`src/client/synth.ts`: made with Web Audio, a
  four-on-the-floor groove until the dances have songs, task A5), the 3D coach dancing each move on
  the beat (below) and beside it the words: the stage, the move in both languages and how to do it,
  the 8-count, the next move 2 beats ahead, the floor. Along the bottom, everyone's little dancer
  (`src/client/coach/crowd.ts`): a neon stick figure in their colour doing the coach's move as hard
  as they are moving, from their phone's `pulse` (8 a second at most: the sensor's energy, or their
  taps, and each beat's verdict; the room passes it to the speaker and keeps nothing), sparking on
  each beat they hit. Sounds for the room (`synth.ts`): a pop for a hit (a note higher for each in
  a row), bells every 8 beats of the floor's streak, a boom with the fireworks, a fanfare for the
  results. Then the results.
- **The 3D coach** (`src/client/coach/`): a cartoon dance teacher built in three.js from rounded
  shapes (no model file, nothing to license), on a skeleton named like Mixamo's. Each move of the
  library is a loop of key frames on the beat (`moves.ts`: hands and feet as positions, the way a
  teacher says it; `pose.ts`: the pose, blending, the bounce on every beat); the arms and legs reach
  them by two-bone IK (`rig.ts`). It's everyone's mirror: what it does on the screen's left, the
  players do on their left. The stage (`stage.ts`): lights, a floor ring on the beat, trails behind
  the hands, footprints where the feet land, fireworks with the floor's. It draws only with a
  graphics chip (`index.ts`); in software, or when its first 90 frames run slower than 20 a second,
  the page keeps the coach in words. Reduced motion: it still dances (that's the lesson), the
  flashes and swinging lights stop.
- **`/party/moves`** (`src/client/moves.ts`): the 20 moves, each danced by the coach at its own
  tempo (or slowed down), with a click track: to look at before a party. `?move=<id>` picks one,
  `?still=<beat>` stops it there, `?gl=any` draws it in a browser without a graphics chip (the
  checks' Chromium); `window.coachShow(id, beat)` and `coachTick(id, beat, count, ms)` are for
  photographing it.
- **`/party/join`**, a phone (`src/client/join.ts`): code and name, clock sync, a flash on every
  beat the room hears, 我在, the motion sensor's switch (开体感); while a dance plays, the move, the
  count, what's next, the big button and how hard you're moving; the player's own results. For the host: calibrate, pick a dance, steer it, the 120 BPM
  metronome (the timing test in `docs/field-notes/2026-11-01.md`), end the room.
- **测量 / Timing** on both pages: the speaker's clock in big digits, for the field test (a photo
  of the two screens side by side shows the error).

The pages are still plain around the coach: the real speaker screen and phone screen are cards C3
and C4 (`docs/codex-tasks/dance-C3-speaker-screen.md`, `dance-C4-phone-screen.md`), to be rewritten
around the coach. The words the pages show are in `src/client/words.ts`.

## Run it

Node 22, in this folder:

```
npm ci
npm run typecheck && npm test          # the session, the shows, the tally, the judge: 68 tests
npm run dev                            # http://127.0.0.1:8787/party/screen and /party/join
BASE=http://127.0.0.1:8787 node scripts/timing-check.cjs
```

`scripts/timing-check.cjs` plays the metronome in Chromium on one machine (a speaker page, three
phones): each phone's clock error against the truth, calibration with taps 180 ms after the
clicks, the flashes against the beats, 我在, a phone reloaded mid-dance, the end. It prints the
numbers and OK or FAILED. Results: `docs/field-notes/`.

`scripts/song-check.cjs` plays a whole dance the same way: the short test dance (two moves, 16
beats), learned and then danced, Ann tapping on every beat, Bob 90 ms late, Cat watching; the
results, the same dance again with 这一段再来 in the middle while Bob's connection drops for 2.5 s
(his bar from then must still get there), the end. The test dance starts only
when the Worker runs with `ALLOW_TEST_SETTINGS` (never set on Cloudflare), so run the Worker as
`npm run build && npx wrangler dev --var ALLOW_TEST_SETTINGS:1`. About two and a half minutes.

`scripts/motion-check.cjs` (the same Worker) dances the short test dance with the motion sensor:
Ann's phone gets a pretend hand (a bump of acceleration on every beat she hears), Bob taps late,
Cat stands still; the speaker page draws the 3D coach in software (`?gl=any`). Checked: the pulses
reach the TV, Ann's moves count on the beat, Cat is in no results. It saves screenshots of the TV
in the folder given. About a minute and a half.

## Live

Connected to Cloudflare on 1 November 2026: like 随便, merging into `main` deploys it. The Worker
`party` (Workers Builds; the name must match `name` in `wrangler.jsonc`): root directory
`/games/party-server`, build command `npm run build`, deploy command `npx wrangler deploy`, build
watch paths `games/party-server/*` and `games/party-base/*` (and, since the pages and the room read
the move library, `games/dance/*`: to add in the Cloudflare settings), API token "suibian build
token". Builds for preview branches are off (`wrangler preview` needs a `previews` block, and the
Durable Object isn't in previews), so PRs get no failed Cloudflare check. No secrets, no database
(the Durable Object comes with the deploy). `changle.ca/party/screen` and `changle.ca/party/join`
answer.

It runs on the free plan (SQLite-backed Durable Objects). The speaker's clock report every second
stays in memory; the room writes to storage only when something changes, and the dance's beats at
most every 3 seconds.

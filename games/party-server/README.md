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
  tries). A room's first dance (not the metronome) measures the TV's delay first and then starts
  by itself (`SessionData.pending`); the host can skip it, and then the room doesn't ask again.
  暂停 / 继续 (the host, while the lead or the dance plays): `RoutineInfo.pausedAt`; nothing plays
  on the pages while it's set (`anchorsOf` gives none), the song's video holds where it is, and
  nothing ends; 继续 moves everything later by the pause plus 1.5 s (`RESUME_LEAD_MS`), so the
  last moments before it play again first (party-base's `RESUMED` for the dance's beat 0).
  A phone can be the stage, mirrored to the TV: sideways it lays everything out on one short
  screen (the song's video at 356×200, YouTube's 200 px at least, the move and count under it, the
  coach beside); held upright it asks to be turned (an iPhone's page can't turn itself; Android's
  Chrome goes full screen and sideways after 开始). It's never a player. While a dance plays: its tune (below), the 3D coach dancing each move on
  the beat (below) and beside it the words: the stage, the move in both languages and how to do it,
  the 8-count, the next move 2 beats ahead, the floor. A song's own move is taught step by step
  there for someone who has never danced (`src/shared/steps.ts`: how to stand, what to
  do on each count, a tip), the count being danced lit up; on a phone as the stage, only that line. Along the bottom, everyone's little dancer
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
- **The practice dances' tunes** (`src/client/tunes.ts`): each of the library's six dances has a
  song of its own, written there as notes (简谱: a melody, two chords an 8-count, a bass line, how
  the chords are played, drum patterns) and played on the beat by `src/client/synth.ts`'s Web Audio
  instruments (no audio files): 广场初体验 a 笛子 over a plucked 古筝-like arpeggio, 坐着也能嗨 a
  whistled hook with electric piano and hand claps, 秧歌扭起来 a 唢呐 over a 笙 drone with the 锣鼓
  (大鼓, 镲, 大锣, 小锣), 流行踏步派对 disco house, 广场摇摆串烧 big 广场舞 dance-pop, 全身节拍挑战
  EDM. Gentle in the warm-up and cool-down, lighter in the teaching, everything in the dance (a
  fill, a crash, a riser every 4th 8-count; a harmony on the second time round); bells where a
  move starts, in the tune's key. A dance without a tune (the checks' test dance) gets a plain
  four-on-the-floor groove. `scripts/tunes-preview.cjs` renders each to an MP3 to listen to (and,
  with `STEMS=1`, how loud each part is: the parts are balanced to about the same loudness in
  every tune).
- **Songs** (`src/shared/songs.ts`): famous songs played on the TV from YouTube's own player
  (`src/client/tube.ts`: in sight in the top left corner, never covered, never downloaded; the
  same rules as 打碟's player). Six are danced to their own famous dance, laid along the song
  (`Song.dance`, `aligned`): 江南Style's horse dance, Macarena, 科目三, 最炫民族风, 爱你, APT.;
  their moves are `src/shared/songmoves.ts` (the coach's key frames: `src/client/coach/songmoves.ts`).
  江南Style's was worked out from its official video frame by frame (sheets of frames on the beat,
  drawn from the video in a browser): the horse ride and the lasso, "Eh~ Sexy Lady"'s hands-on-hips
  hip shake, the tour bus's disco point, little PSY's groove, the strut across the disco.
  Their beat was measured in each video (the video played silently in a browser, its onsets fitted
  to a grid: the tempo, and beat 0 to within ~10 ms) and their parts placed from the songs' timed
  lyrics, so they need no 找拍子. The others are danced with a few of the library's easiest moves,
  two 8-counts each, round and round (`pattern`). Fast songs at half their tempo. The host picks one
  like a dance (the six with their own dance first). The room waits for the speaker to have the video held at its start (`songReady`; on
  Safari not before someone has tapped the video once, so it can play with sound), then the video
  plays from its start: its intro, a count-in on its last 4 beats, the dance. While it plays, the
  speaker reads the video's clock every 4 ms and tells the room where the song's first beat really
  is (`songAt`); more than 20 ms off, the room moves the dance's beat there (party-base's
  `BEAT_MOVED`, however far: a video a minute late is followed too) and every page follows. When
  the video should be playing and hasn't for 1.2 s (stalled, an ad, stopped till someone taps it:
  `Tube.stuckMs`), the speaker says so (`songStall`) and the room holds the dance
  (`RoutineInfo.heldAt`: the coach and the phones stop, the TV says why, nothing ends); once the
  video plays, the speaker measures it for 0.6 s and the dance picks up from where it is. When the
  dance is over the video fades out over 2.5 s and stops (`Tube.fadeOut`), so the song never plays
  on without the coach. YouTube refusing the video (`songFailed`): back to the lobby, and the phones
  say why. No 这一段再来 in a song.
- **找拍子 / the songbook**: where a song's beat starts in its video can't be guessed well enough
  (unless it was measured: the six above). The first time a room dances such a song
  (`RoutineInfo.tapIn`), its video plays from the start and
  everyone taps along on their phones, a tap a beat, from when the drums come in (the TV shows
  the count and lights each name as it taps; whoever holds the speaker can tap on it too). The
  phones' taps go to the speaker (`tap`, at most one every 150 ms a phone); from 16 that agree,
  `tapIn()` in `src/shared/tapalong.ts` finds the beat (where the taps cluster in the beat, strays
  left out; taps on the song's own beat when it's danced at half tempo work too) and the song's
  first beat in the video (the earliest tap's beat, moved back whole 8-counts if the dance would
  run past the video's end; the TV's calibrated delay taken out). The speaker sends it
  (`songTapped`); the room checks it (`src/server/tapped.ts`), keeps it in the songbook
  (`src/server/songbook.ts`, one Durable Object for the whole site) for every room from then on,
  and the song starts from its start as any song does. Only a room that measured its TV's delay
  keeps it for every room (`calibrated`; without it the beat is late by the delay): a room that
  skipped it uses the beat itself, and the songbook gives rooms only calibrated beats. No beat after 90 s of video: back to the
  lobby (`song_notap`). The host can't skip ahead during 找拍子. 歌曲对拍 on the speaker page (the
  lobby) does it again by one person: play a song, and from its first strong beat tap 16 times
  (`tapAlong()`; `POST /party/api/songs/ID`, refused unless the room is calibrated), for a song
  whose dance has come out off its beat.
- **`/party/moves`** (`src/client/moves.ts`): the 20 moves (and under them the songs' own, song by
  song), each danced by the coach at its own
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
npm run typecheck && npm test          # the session, the shows, songs, tunes, the tally, the judge: 110 tests
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

`scripts/song-yt-check.cjs` (the same Worker) dances a song from YouTube with a pretend YouTube
player (real YouTube won't play in a data centre's browser: error 150). It starts 300 ms late and
its clock answers four times a second, like the real one's; the pretend TV plays everything
150 ms late. Checked: the songbook API (taps from an uncalibrated room refused), the room's first
dance measuring the TV first, the room waiting for the video, the beat moved to the video's
(within 25 ms), Ann tapping on the video's real beats on the beat, 暂停 holding the video and 继续
picking it up 1.5 s before where it stopped (the beat with the video again), the video stalling for
4 s (the dance held, the TV and the phones saying so, then picking up on the video's beat), the song
fading out at the dance's end, the video gone in the lobby; 找拍子 on a song nobody has danced (Ann and Bob tapping along on their phones as the TV plays
it, the first beat found within 25 ms and kept, then the song from its start on the video's
beat); a song with its own dance starting with no 找拍子 on its measured beat (within 25 ms); and
歌曲对拍 finding another song's first beat (within 20 ms).
About two minutes. Run the Worker with fresh storage (`--persist-to` a new folder): a song
already in the songbook skips 找拍子.

`scripts/motion-check.cjs` (the same Worker) dances the short test dance with the motion sensor:
Ann's phone gets a pretend hand (a bump of acceleration on every beat she hears), Bob taps late,
Cat stands still; the speaker page draws the 3D coach in software (`?gl=any`). Checked: the pulses
reach the TV, Ann's moves count on the beat, Cat is in no results. It saves screenshots of the TV
in the folder given. About a minute and a half.

## Live

Connected to Cloudflare on 1 November 2026: like 随便, merging into `main` deploys it. The Worker
`party` (Workers Builds; the name must match `name` in `wrangler.jsonc`): root directory
`/games/party-server`, build command `npm run build`, deploy command `npx wrangler deploy` (it
also makes the songbook's Durable Object, migration `v2`, the first time), build
watch paths `games/party-server/*`, `games/party-base/*` and `games/dance/*` (the pages and the room
read the move library; `games/dance/*` added on 6 November), API token "suibian build
token". Builds for preview branches are off (`wrangler preview` needs a `previews` block, and the
Durable Object isn't in previews), so PRs get no failed Cloudflare check. No secrets, no database
(the Durable Object comes with the deploy). `changle.ca/party/screen` and `changle.ca/party/join`
answer.

It runs on the free plan (SQLite-backed Durable Objects). The speaker's clock report every second
stays in memory; the room writes to storage only when something changes, and the dance's beats at
most every 3 seconds.

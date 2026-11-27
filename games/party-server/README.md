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
  once the dance has been heard (看结果, skipping the cool-down), or stop. While the warm-up or the
  dance plays, each of those buttons acts only once held for 0.7 s (it fills in as it's held), and
  the end of the room isn't there: the host dances with the phone in hand, and a palm brushing the
  screen mustn't pause or stop the song for everyone (`holdButton` in `join.ts`). Paused, plain taps.
- **The beats**: each phone judges its player's moves against the beat as the room hears it (the
  speaker's grid plus the TV's delay; `src/shared/taps.ts`, party-base's scoring windows) and sends
  the dance's beats a bar at a time (`beats`); after a dropped connection it sends them all again
  (the room keeps the newest of each beat, so twice does no harm). For now a move is a tap on the phone's big button,
  standing in for the motion sensor (the plan's 假体感); task A2 feeds the same judge the sensor's
  peaks. The room keeps the beats (`src/server/tally.ts`), sends the speaker the floor together
  after each bar (the streak bar; full at 32 beats: fireworks), and at the end works out the
  results: each dancer's participation (party-base's `summarize`), and 最稳 (closest to the beat),
  最嗨 (the longest run on the beat), 最努力 (moved on the most beats). Easy dances show only the
  awards; medium and hard also the scores. The room looks after its dancers there too (the plan's
  safety rule, docs/dance-along.md): every 3 dances it finishes, the results on the TV and the
  phones say to have some water; half an hour after the first dance since the last such word
  (from its start, chats between dances counted), to sit down for a few minutes and have some
  water (`Results.remind`, `finish()` in `src/server/session.ts`). A word, not a lock: the host can
  start the next dance at once.
- **Gold moves** (as in the dance games): the last beat of every 64 of a dance (8 eight-counts, the
  end of a long phrase) and its very last beat, none in the 16 before the last (`isGoldBeat` in
  `src/shared/show.ts`). The TV and the phones say it's coming four beats ahead (「金色动作还有 3
  拍」, then 「就是这一拍，用力！」) and light the count gold; on it the coach lights up all over. A
  player who moves on it (on the beat at medium and hard, near it on easy: `goldOk`/`goldHit` in
  `src/shared/taps.ts`) gets 「金色！」 on the phone for a moment and a buzz (phones that can; not
  iPhones), and their little dancer a gold ring and sparks. The phones' pulses say when their
  verdict is on a gold move (`g`); once every dancer's has come (or a second after it was heard)
  the TV cheers beside the floor's combo, 「金色动作！N 人跳中」, with fireworks when half or more
  got it. The results count each dancer's (`PlayerResult.gold` of `Results.golds`); none in the
  metronome.
- **The camera mode** (as Just Dance 2026's Camera Controller, which is solo; here every player can
  have their own): 开摄像头 on a phone, which then stands 2 to 3 m away facing its player, and its
  camera watches the whole body. The pose model is MediaPipe's Pose Landmarker (its lite model,
  `assets/camera/pose_landmarker_lite.task`, Apache 2.0, from Google's model store) run on the phone
  by the `@mediapipe/tasks-vision` package's WebAssembly (with SIMD, and without for older phones);
  the build copies both to `/party/camera/`, and the phone page loads `/party/camera.js` with them
  only when its player turns the camera on (about 0.2 MB of script, 11 MB of WebAssembly and 6 MB
  of model the first time; the page itself stays as small). The picture never leaves the phone.
  `src/client/camera/`: `sense.ts` opens the camera, runs the model on each frame (GPU, else CPU),
  keeps to the player it saw first when others walk through, draws the body on the preview (the
  front camera as a mirror) and says whether it sees all of them (头到脚都在 / 往后退一点);
  `body.ts` turns a body into its bones' directions (upper arms, forearms, thighs, shins, feet and
  the back, with the coach's sides: the player's right is the coach's R, everyone's mirror; towards
  the camera counted half), the coach's worked out from its Pose with the rig's own sizes, turns
  and bends (`coach/sizes.ts`), a player's from the model's landmarks; `match.ts` judges each beat:
  where the player's moves from half a beat before it to a quarter after best line up with the
  coach's (poses, and how each part moves: the same way as the coach's, and at least a share as
  much, so standing still or a shaky picture isn't dancing; weighted to the parts the move is
  about), and if
  alike enough (`ALIKE`: 0.55 easy, 0.62 medium, 0.7 hard; guesses to tune with real dancers) the
  beat was danced then, else not. It tells the page's judge beat by beat (`BeatJudge.decide` in
  `src/shared/taps.ts`), which settles each beat a little later for it (`lagMs`), and from there all
  is as with the motion sensor: the verdicts, the bars, the TV's floor, the results. The phone shows
  像老师 N% while a dance plays. In WeChat the camera may not open: the page says to open it in
  the browser.
- **`/party/screen`**, the speaker (`src/client/screen.ts`): it opens its room as it loads (a
  reload goes back into its own: the code is in the address) and has nothing to press (Steve,
  12 Nov: the phones pick the songs and start them; the TV speaks the host's phone's language,
  `lang` in the state message). It asks for a tap only to set itself up, in the lobby: a browser
  plays a page's sound only after a tap on it, so the first tap anywhere starts the audio and keeps
  the screen on (Chrome come from a tap on /party's link may need none); on an iPhone, an iPad or in
  Safari, one more on a video it shows for that (YouTube's player wants its own tap, once). Then the
  room code and QR code, the players (a phone's 我在 lights its name), and the TV's delay when the
  host measures it from their phone (校准电视延迟, in the lobby: 8 clicks 1.2 s apart, the host's
  taps in speaker time, `calibrateFromTaps()`; three tries; the host can skip). Nothing waits for
  it: a dance starts as soon as it's picked. A room that hasn't measured it learns it as each dance
  finishes instead: people move to what they hear, so when the moves sat late by the same amount
  beat after beat (at least 32 of them, half within 80 ms of their middle, 40 ms or more off), the
  room hears that much later (`learnedShift` in `src/server/tally.ts`, party-base's
  `DELAY_LEARNED`), and the next dance is flashed and judged by it. `?timing` shows the clock
  readout for the field test.
  暂停 / 继续 (the host, while the lead or the dance plays): `RoutineInfo.pausedAt`; nothing plays
  on the pages while it's set (`anchorsOf` gives none), the song's video holds where it is, and
  nothing ends; 继续 moves everything later by the pause plus 1.5 s (`RESUME_LEAD_MS`), so the
  last moments before it play again first (party-base's `RESUMED` for the dance's beat 0).
  A phone can be the stage, mirrored to the TV: sideways it lays everything out on one short
  screen (the song's video at 356×200, YouTube's 200 px at least, the move and count under it, the
  coach beside); held upright it asks to be turned (an iPhone's page can't turn itself; Android's
  Chrome goes full screen and sideways with the setup's tap). It's never a player. While a dance plays: its tune (below), the 3D coach dancing each move on
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
  flashes and swinging lights stop. Between dances, on a TV with room for it below the players
  (200 px at least, 560 at most, down to the bottom of the screen: not on a phone as the stage),
  it stands by in the lobby (breathing, a wave every 8 s) and at the results, in the song's outfit
  there; as a dance ends it cheers for 8 beats with the fanfare, with fireworks when anyone danced
  (`frameLobby` in `screen.ts`: drawn 30 times a second at most; not with reduced motion, as it's
  only there to look at, nor when the page with it runs slower than 25 frames a second).
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
  same rules as 打碟's player). Fourteen are danced to their own famous dance, laid along the song
  (`Song.dance`, `aligned`): 江南Style's horse dance, Macarena, 科目三, 最炫民族风, 爱你, APT., the
  Cupid Shuffle, the Cha-Cha Slide, Y.M.C.A., Watch Me, the Ketchup Song, Gee, 海草舞; their moves are
  `src/shared/songmoves.ts` (the coach's key frames: `src/client/coach/songmoves.ts` and, for the
  eight added 11-12, `partymoves.ts`), each taught count by count (`src/shared/steps.ts`). A caller's
  song (`Song.calls`: the Cha-Cha Slide, and the Ketchup Song's 12-beat lines) keeps each part as long
  as it needs, counted from where it starts, and teaches only its basic steps (`Song.teach`).
  江南Style's was worked out from its official video frame by frame (sheets of frames on the beat,
  drawn from the video in a browser): the horse ride and the lasso, "Eh~ Sexy Lady"'s hands-on-hips
  hip shake, the tour bus's disco point, little PSY's groove, the strut across the disco.
  Their parts were placed from the songs' timed lyrics. The other six are danced with a few of the
  library's easiest moves, two 8-counts each, round and round (`pattern`). Every song's beat was
  measured in its video (the video played silently in a browser, its onsets fitted to a grid: the
  tempo, and beat 0 to within ~10 ms; the six on 12 Nov), so a song starts the moment it's picked:
  nobody taps along to find its beat. Fast songs at half their tempo. The host picks one
  like a dance (the ones with their own dance first). The room waits for the speaker to have the video held at its start (`songReady`; on
  Safari not before someone has tapped the video once, so it can play with sound), then the video
  plays from its start: its intro, a count-in on its last 4 beats (every song's first beat is at least
  4 beats into its video), the dance. While it plays, the
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
- **`/party/moves`** (`src/client/moves.ts`): the 20 moves (and under them the songs' own, song by
  song), each danced by the coach at its own
  tempo (or slowed down), with a click track: to look at before a party. `?move=<id>` picks one,
  `?still=<beat>` stops it there, `?gl=any` draws it in a browser without a graphics chip (the
  checks' Chromium); `window.coachShow(id, beat)` and `coachTick(id, beat, count, ms)` are for
  photographing it.
- **`/party/join`**, a phone (`src/client/join.ts`): code and name, clock sync, a flash on every
  beat the room hears, 我在, the motion sensor's switch (开体感); while a dance plays, the move, the
  count, what's next, the big button and how hard you're moving; the player's own results. For the host: pick a dance or a song, steer it, measure
  the TV's delay, the 120 BPM metronome (the timing test in `docs/field-notes/2026-11-01.md`), end
  the room. Each phone tells the room its language (`lang`): the TV speaks the host's.
- **From a changle.ca table** (the site's `site/src/party/dance/link.ts`): the phones come with
  `?table=` (kept in the address as they join) and the stage too; both pages then have 回到桌子 /
  Back to the table in their top bar (a phone to `/t/TABLE`; the stage to the page that sent it,
  `/tv/TABLE` for the TV, else `/t/TABLE`: `tableUrl` in `src/client/common.ts`). When the room ends,
  1.5 s later each page goes back there, leaving `sessionStorage["dance.over"]` = the code (the stage
  `"dance.over.tv"` too), so the table takes everyone back to its lobby. `GET /party/api/rooms/CODE`
  says how the room is going (`{ exists, phase: "lobby" | "playing" | "over" }`), which the table
  asks every 8 s while its players are away.
- **测量 / Timing**: the speaker's clock in big digits, for the field test (a photo of the two
  screens side by side shows the error); on a phone its button, on the speaker page `?timing`.

The pages are still plain around the coach: the real speaker screen and phone screen are cards C3
and C4 (`docs/codex-tasks/dance-C3-speaker-screen.md`, `dance-C4-phone-screen.md`), to be rewritten
around the coach. The words the pages show are in `src/client/words.ts`.

## Run it

Node 22, in this folder:

```
npm ci
npm run typecheck && npm test          # the session, the shows, songs, tunes, the tally, the judges: 124 tests
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
150 ms late. Checked: the speaker page opening its room by itself with nothing to press, asking
for a tap where a browser wants one before it makes a sound (and the tap anywhere turning it on),
speaking its host's language and following it; the host measuring the TV's delay from the lobby;
a song starting straight from the host's pick, the room waiting for the video, the beat moved to
the video's (within 25 ms), Ann tapping on the video's real beats on the beat, 暂停 holding the
video and 继续 picking it up 1.5 s before where it stopped (the beat with the video again), the
video stalling for 4 s (the dance held, the TV and the phones saying so, then picking up on the
video's beat), the song fading out at the dance's end, the video gone in the lobby; and a song
with its own dance starting on its measured beat (within 25 ms). About a minute and a half.

A new song needs its beat measured before it goes in (`src/shared/songs.ts`; nothing finds it at a
party): in a desktop browser that plays YouTube, `scripts/beats/record.js` plays the video
silently and records how loud it is, and `scripts/beats/fit.js` fits the beat grid to it and shows
where the music starts, breaks and ends (how to run them: the top of each). A data centre's
browser can't play YouTube, so it's done on a computer at home (the built-in browser of Steve's
Claude app, for the twenty so far).

`scripts/motion-check.cjs` (the same Worker) dances the short test dance with the motion sensor:
Ann's phone gets a pretend hand (a bump of acceleration on every beat she hears), Bob taps late,
Cat stands still; the speaker page draws the 3D coach in software (`?gl=any`). Checked: the pulses
reach the TV, Ann's moves count on the beat, Cat is in no results. It saves screenshots of the TV
in the folder given. About a minute and a half.

`scripts/camera-check.cjs` (the same Worker) dances the short test dance in the camera mode: Ann's
and Bob's cameras are pretend ones (no camera, no model: `partyDebug.camera`), Ann dancing the
coach's moves and Bob standing still; Cat's is Chromium's fake camera playing `CAMERA_Y4M` (a
picture of someone, e.g. the coach from /party/moves mirrored, made a .y4m with ffmpeg) through the
real pose model, opened from the button. Checked: Ann on at least 80% of the beats, Bob moved on at
most 35%, Cat's camera sees head to toe, no page errors. Screenshots of the phones in the folder
given. About a minute.

## Live

Connected to Cloudflare on 1 November 2026: like 随便, merging into `main` deploys it. The Worker
`party` (Workers Builds; the name must match `name` in `wrangler.jsonc`): root directory
`/games/party-server`, build command `npm run build`, deploy command `npx wrangler deploy` (it
also runs the Durable Objects' migrations: `v2` made a songbook for songs' tapped beats, `v3`
deleted it on 18 Nov, once every song's beat was measured), build
watch paths `games/party-server/*`, `games/party-base/*` and `games/dance/*` (the pages and the room
read the move library; `games/dance/*` added on 6 November), API token "suibian build
token". Builds for preview branches are off (`wrangler preview` needs a `previews` block, and the
Durable Object isn't in previews), so PRs get no failed Cloudflare check. No secrets, no database
(the Durable Object comes with the deploy). `changle.ca/party/screen` and `changle.ca/party/join`
answer.

It runs on the free plan (SQLite-backed Durable Objects). The speaker's clock report every second
stays in memory; the room writes to storage only when something changes, and the dance's beats at
most every 3 seconds.

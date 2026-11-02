# 打碟 · DJ Booth: the sound check (step 5)

The plan's step 5: try the sound on iPhone Safari and Mac Safari and write down what happened.
Two parts: what the browser engines do here (automated, in Safari's own engine, WebKit, and in
Chromium), and Steve's ears on his own iPhone and Mac.

The page for it: **changle.ca/dj/test** (on a branch preview: `https://<branch>.changle-ets.pages.dev/dj/test`).
It needs no table. Press 开始派对 / Start the party; the numbers underneath say what the speaker is
doing: 状态 (playing, buffering), 缓冲 (seconds waiting), 卡顿 (stalls), 小节 · 拍 (bar and beat),
采样率 · 延迟 (the device's rate and output delay), 低频 (the low end that drives the lights).

## Steve's devices

| Device | Browser | Sound? | Seconds to sound | Silent switch on | Stalls in 5 min | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone | Safari | | | | | |
| Mac | Safari | | | — | | |

What to try: press start; listen for a minute; on the iPhone flip the silent switch (it should
keep playing); press 顶点 (the music changes at the end of the 8 bars, 15 seconds at most); press
假装断网 8 秒 (it plays on for about 5 seconds, fades out without a click, comes back, one stall);
lock the iPhone and unlock it (a button brings the sound back with one tap).

## In the browser engines (automated)

`site/scripts/dj_check.py`, headless WebKit 26.6 (Playwright) and Chromium, each at a desktop size
and an iPhone size, Nov 1, 2026.

**Against the local build (dev servers):** 50 of 50 checks pass.

| Engine, size | First sound after the tap | Stalls in 30 s | Beat clock | Lights (low end) | Drop test |
| --- | --- | --- | --- | --- | --- |
| WebKit, desktop | 0.79 s | 0 | 125.00 BPM | 0 to 1 | 1 stall, back |
| WebKit, phone | 1.06 s | 0 | 125.00 BPM | 0 to 1 | 1 stall, back |
| Chromium, desktop | 0.44 s | 0 | 125.00 BPM | 0 to 1 | 1 stall, back |
| Chromium, phone | 0.30 s | 0 | 125.00 BPM | 0 to 1 | 1 stall, back |

Both report a 48 kHz context. Output delay: WebKit 3 ms, Chromium 85 ms (it asks for steady
playback over quick reactions).

The whole table, same run: a TV opens /dj (Chromium), the tap starts the warm-up, two phones sit
down (one WebKit, one Chromium) and land on the 🔥, the TV's floor shows both dancing, every 🔥
puts a flame over its owner and is counted (3 and 1), the host takes the night to the peak (the
lights change colour), a guest has no host controls, the host ends the set (the recap shows) and
starts another (the speaker starts it by itself). No errors on any page.

**Against this PR's preview (the real build on Cloudflare), with the faster recorder below:** all
four pass: the music is ready about 2 seconds after the page opens, sound 0.4 to 0.5 s after the
tap, no stalls, 125 BPM, the drop test one stall and back. Two earlier runs of the same check read
Chromium's beat at the phone size as 121 to 122 BPM with no stall: the test machine's stand-in sound
device (headless browsers have no sound card) falling behind under load, since the beat clock
follows the sound device; it read 125.00 on the four runs after, and the build before this change
showed a smaller slip once (124.3). A real speaker's clock is its sound hardware. (The first preview
check, before the faster recorder, took 2.6 to 4.2 s to the first sound and once 17.7 s while the
machine also ran two soaks.)

## Recording the sections

The stand-in DJ records each 8-bar section on the device before it can play it, so that speed
decides how soon the music starts and how soon it follows the host into a new stretch (until the
next section is recorded, the last one plays again). After the play-throughs the recorder was made
about three times faster with the same sound: each drum is recorded once (a few takes) and played
back for every hit, and every sound is written into the recording a beat before it plays instead of
all at the start. Same test machine (2 cores), all six sections, one after the other:

| Engine | Before | After | First section after opening the page |
| --- | --- | --- | --- |
| WebKit | 28.3 s | 9.6 s | 4.1 s, now 2.4 s |
| Chromium | 30.0 s | 8.6 s | 4.0 s, now 2.2 s |

The sound, measured: the same loudness in the low, middle and high bands to 0.1 dB in the warm-up,
build and cool-down; the two peak sections come out 0.6 dB louder (closer to their set level, less
held back by the ceiling). A real iPhone or Mac should be several times quicker than the test machine.

## The 30-minute soak

The speaker page (the production build) left playing for 30 minutes in each engine at the same
time, moving through the night's four stretches every 2.5 minutes. Gate A asks for fewer than one
stall per 10 minutes.

| Engine | Time | Stalls | Lowest buffer | Beat clock over the run |
| --- | --- | --- | --- | --- |
| WebKit | 30 min 1 s | 0 | 1.4 s (once) | 125.000 BPM |
| Chromium | 30 min 3 s | 1 | 3.5 s | 124.86 BPM |

Both pass gate A's line (Chromium's one stall is 0.33 per 10 minutes). The stall and WebKit's one
low buffer came 4 to 6 minutes in, while the same 2-core test machine was also running four more
browsers for the preview check and the code review's tests; the other 25 minutes ran clean in
both. The beat clock follows the music: Chromium's 124.86 is the stall's 2.5 seconds of waiting
spread over the half hour.

## Lyria RealTime (A2)

Steve's choice on Nov 1: connect Lyria RealTime as planned, as a private test (only a table where
one of the owner's accounts has a seat; everyone else hears the stand-in). Real Lyria can only be
heard at Steve's table after the merge: the rooms server deploys from `main`, and local runs never
reach Google. Here `site/scripts/fake_lyria.mjs` stands in for Google: the same protocol, 48 kHz
stereo, twice as fast as real time (Lyria also makes music faster than it plays), a kick on every
beat, its JSON in binary frames as Google's may be.

### Steve's table (real Lyria)

| Device | Seconds to AI DJ · 实验 | Seams (each time Lyria is paused and played again) | 顶点: heard after | Stalls in 10 min | Notes |
| --- | --- | --- | --- | --- | --- |
| TV or Mac | | | | | |

What to try: on the phone, sign in with one of the owner's emails and sit down at the table of
changle.ca/dj. The TV starts the night with the stand-in and switches to Lyria a few seconds later
(the TV and the phones say AI DJ · 实验 instead of 试音版 DJ). Lyria makes music faster than it plays, so the speaker
pauses it about every 10 seconds and plays it again: listen for a seam there. Press 顶点: the
music gets there after what's already queued plays (about 10 seconds). Leave the table: the
stand-in takes the music back. 20 hours a month for all tables together (`DJ_LYRIA_HOURS`).

### The chain, against the stand-in Lyria (automated)

`site/scripts/dj_lyria_check.py`, the TV in WebKit and in Chromium (the phone in Chromium), Nov 1,
2026: 22 of 22 checks pass in each, no errors on any page. Nobody at the table: Lyria isn't asked.
A phone sits down: the table's relay opens one session, and the warm-up's prompts, 125 BPM and
density reach Lyria before PLAY. Lyria takes over once it has 3 seconds in hand (the phones see AI
DJ), on the beat (125.00 BPM, found from the kick), no stall, and is paused when it gets ahead. The
host's 顶点 reaches Lyria at once; the lights follow when the speakers get there. Lyria's side
drops: the relay opens a new session, set up where it was (the peak), and the music carries on
with no stall. The phone leaves: the stand-in takes the music back and the session closes.

Found on the way: the rooms server received binary frames as a Blob (the runtime's default),
which reads only asynchronously, and dropped them, so a Google that answers in binary frames would
never have started; it now asks for bytes, and the fake sends binary frames to keep it that way.

### The 30-minute soak, through the relay

The TV in WebKit, the night's stretches in turn every 4 minutes, Lyria's side dropped at 10 and 20
minutes.

| Run | Stalls | Lowest buffer | Beat clock | On Lyria | Sessions (drops) | PAUSE / PLAY |
| --- | --- | --- | --- | --- | --- | --- |
| Before the code review's fixes | 0 | 3.95 s | 124.983 BPM | 100% | 3 (2) | 179 / 182 |
| This version (binary frames) | 0 | 2.47 s (the restart) | 124.978 BPM | 100% | 4 (2, and the restart) | 176 / 181 |

Four minutes into the second run the rooms server restarted (an edit reloaded it, as a deploy
would): the speaker played on from what it had in hand, down to 2.5 seconds, the speaker opened
the new relay and set Lyria up where it was, and nothing stalled. Lyria was paused and played again about every
10 seconds (the fake makes music twice as fast as it plays; real Lyria's pace will set how often).

## The beginner deck (Nov 1)

Everyone at the table DJs at once from their phone (CONTRACTS.md, "The beginner deck"): two decks
and a crossfader, eight pads (four at first; the siren, laser, scratch and rewind from Nov 1), a
build-up the table taps together and DROP after an 8-second count (2 seconds at first), a pick for
the next of 12 styles. The rule that keeps it from ever sounding wrong is that everything lands on
the beat, so these checks are mostly about timing.

**`site/scripts/dj_deck_check.py`**, a TV and three phones playing at once, the TV in Chromium and
in WebKit: 47 of 47 checks pass in each (after both code reviews' fixes, the DROP window's, and with
the 8-second count and the eight pads), no errors on any page.
Three pads pressed at once by three phones all play, each on a beat to the millisecond. The brake
stops the music and brings it back on the bar with no stall; a siren and a laser from two phones at
once both play on beats, then a scratch, and a rewind 4 seconds later, and the music comes back with
no stall. Two picks for latin and one for techno
load latin on deck B. Thrown all the way to B before B has any music of its own, the fader leaves
deck A playing (its quietest moment 0.03 to 0.04 RMS: never silence; before the second review's
fix this was silence until B's next section, up to about 20 seconds). Once the speaker's deck B
really plays latin the TV marks it up next. The phone that moves the fader holds it, and the others
wait and see who has it. Everyone taps the build-up full, the countdown runs on the TV and the
phones while the picks wait, and a press 15 to 60 ms after the cue is perfect; one about a quarter
second after it counts as good, and one too late for the speaker says so ("晚了一点", not "还没到"),
and stays up after the drop. The drop lands once, exactly on its bar (beat 80 for bar 20 in the
last run), swaps to deck B, and the TV celebrates.

**A busy table** (the TV in WebKit, two phones): a pad every 2.5 to 6 seconds, a new pick every
30 s, the fader swept across and back every 45 s, a build-up and a drop on the cue every minute.

| Run | Stalls | Lowest buffer | Pads pressed / played | Drops / perfect | Off the beat | WebKit's memory |
| --- | --- | --- | --- | --- | --- | --- |
| 8 minutes, first version | 0 | 4.97 s | 95 / 95 | 7 / 7 | 0 | steady, about 1 GB |
| 12 minutes, first version | 0 | 4.96 s | 142 / 138 | 10 / 10 | 0 | steady, 1.0 to 1.1 GB |
| 8 minutes, first review's fixes | 0 | 4.97 s | 93 / 91 | 7 / 6 | 0 | steady, 1.0 to 1.1 GB |
| 8 minutes, the same, each drop's grade kept | 0 | 4.96 s | 96 / 94 | 7 / 7 | 0 | steady, 1.0 to 1.1 GB |
| 8 minutes, second review's fixes | 0 | 4.88 s | 91 / 90 | 7 / 7 | 0 | steady, 1.0 to 1.1 GB |
| 8 minutes, the 8-second count and eight pads (this version) | 0 | 4.97 s | 89 / 87 | 7 / 7 | 0 | steady, about 1 GB |

The pads that didn't play were the deck's own limits at work: a pad of the same kind still
sounding (a sweep lasts two bars, a horn or a siren two beats), or a move (brake, scratch, rewind)
within 4 seconds of the last. The last run pressed all eight pads (a quarter of them moves). In
the third run the rooms server restarted 3.5 minutes in (an edit reloaded it, as a deploy would):
the TV and both phones were back within a second and the music never stopped. One of its seven
drops wasn't perfect, and that run didn't keep why; the two runs after it keep each drop's grade:
14 of 14 perfect, the test phone pressing 10 to 62 ms after the cue (its timers on a busy 2-core
machine; perfect is within 120 ms either side). An earlier 12-minute run lost its WebKit page
partway (the test browser's page process went away, with no error in the page itself); the runs
after it, watching the memory, ran clean. Worth an eye on a real Mac and iPad: if the TV's page
ever reloads by itself mid-set, that's the one to tell me about.

### Live, after the merge (Nov 1)

Every deploy from the merge succeeded (the site, the rooms server, and the other Workers). On
changle.ca, the TV in WebKit and two phones in Chromium: the booth's table flow (14 of 14, as
before) and the deck: the deck on the TV and both phones, a pad shown on the TV, two picks loading
latin on deck B, the fader and who has it, the build-up, the countdown with the picks waiting, no
page errors. One thing it found: pressed when the TV showed DROP, a press only counted for the
first 0.18 s of it, and a later one was told "还没到，看倒数" (not yet) instead of late; nobody's
press counted, so the DJ dropped it two countdowns later. Fixed after: a press counts until about
0.28 s after the cue (`DECK.leadMs` 120 ms, `pressTripMs` 80), the phone says "就是现在" only while a
press still counts, a later one is late, and its word stays up after the drop.

## Songs, and songs asked for by name (Nov 2)

The stand-in moves to a new song every 8 sections (about two minutes), and a song asked for by
name goes on the deck off the air in its style for the next drop (CONTRACTS.md, "Songs" and "Songs
asked for by name").

**`site/scripts/dj_deck_check.py`**, now with the requests at the end: 66 of 66 checks pass with the
TV in Chromium and in WebKit, no errors on any page (one WebKit run started straight after the
Chromium one didn't get its music going within the check's 8 seconds; run again, it passed). Ben
types 晴天, the song list suggests Jay Chou's, he picks it: it's up next with C-pop on the deck off
the air, the TV says "Up next: Ben asked for 晴天 (周杰伦)", his phone says it's his, the picks wait. Cat
types a name that isn't on the list: it waits its turn, her phone says one is ahead of hers, and the
TV never shows what she typed. The table drops into 晴天, the TV says "Now: a remix of 晴天 (周杰伦), for
Ben", and the stand-in plays its remix (the track for its name) from its next section. Nobody drops
into Cat's: the DJ starts the countdown itself and drops it.

**The stand-in's memory.** With a new song every two minutes the stand-in records a section every
half minute or so, all night. A first 12-minute run (the TV in WebKit) climbed from 0.77 to 1.9 GB
in 6.5 minutes and kept going. Measured one kind of recording at a time (60 in a row, WebKit):

| What each recording had | WebKit's memory after 60 |
| --- | --- |
| an offline context with 200 oscillators | flat (0.60 → 0.66 GB) |
| the same with a reverb (a convolver) | 0.60 → 0.88 GB, and not given back |
| a delay-line reverb instead (feedback loops) | 0.60 → 1.20 GB |
| one of the stand-in's sections, as it was | 0.60 → 1.29 GB |
| the same without its reverb | flat (0.60 → 0.64 GB) |

WebKit keeps every offline context that had a convolver (or a feedback loop) in memory for good,
about 5 to 12 MB a recording; Chromium grew too and gave some back under pressure. So the sections
are recorded dry now, and the speaker adds the room itself: one reverb on the mix above 350 Hz,
for the stand-in only, at 0.12, which is about as loud as the reverb in the recordings was (measured
on five sections: the recordings' reverb sat 35 to 38 dB under the music). A recording that has
gone is recorded over by the next (its memory reused). After: a new song every 20 seconds for 5
minutes, 47 recordings, the TV's memory flat at about 0.83 to 0.86 GB. This may also be what took
the test's WebKit page away in the earlier 12-minute run (above): every style picked was recorded
then, too.

**A busy table** (as above: pads, picks, the fader, a drop a minute, and now a song asked for every
80 seconds), the TV in WebKit, with the fix: 10 minutes, no stalls, the buffer never under 4.96 s,
111 pads pressed and 107 played (the deck's own limits), 8 drops, all 8 perfect, 9 landed (one the
DJ's own, into a song asked for), none off the beat, 7 songs asked for and 7 different songs heard;
WebKit's memory 0.77 to 1.0 GB.

## Your songs (Nov 2)

A night of the host's own song files (CONTRACTS.md, "A night of the host's songs"), played from the
TV's computer. To try it on the Mac or PC that's the TV: open changle.ca/dj, press 开始派对, then 我的歌
(top left), 选一个文件夹 (a folder of MP3s or M4As you own), wait for the list to show each song's BPM,
then 用我的歌放. On the phones, 点歌 now searches those songs.

**The beat finder** (`local/beats.ts`, in `tests/dj.test.ts`): made-up songs at 128, 95 and 140 BPM,
each with a kick heavier on the bar's first beat, a snare, hats and a bass that comes in partway.
Found within 0.01 BPM (127.997, 94.994, 139.998; a 122.4 BPM one 122.399), every beat within 3 to 8
ms, the right beat of the bar, the loud part to the bar, and noise found to have no clear beat.
About 0.1 to 1 second a song on this machine.

**`site/scripts/dj_local_check.py`**, the TV in Chromium and in WebKit, two phones: 32 of 32 in
each, no errors. The three made-up songs are heard at 128, 124 and 100 BPM and named from their file
names; the switch to them plays on with no gap; pads land on the song's own beat to the millisecond;
a song asked for from them goes up next on the deck off the air, and once the table drops into it,
its loud part is what plays (read a moment after the drop: 20.0 s into a song whose loud part starts
at 19.8 s, and 31.4 s into one at 31.2 s), the drop on its bar exactly and the player's crossfader
on that deck; as the song ends the DJ drops into the next by itself; and the stand-in comes back
when the host switches.

**A busy night of six songs** (two of them too far off the others' tempo to match), the TV in
WebKit: pads every 3 to 6 seconds, a song asked for every minute, a build-up and a drop every 70
seconds, the DJ dropping into the next as each ends: 10 minutes, no stalls, never not playing, the
buffer never under 4.98 s, all six songs heard, 118 of 129 pads played (the deck's own limits), 12
drops landed (8 the table's, 4 the DJ's own as songs ended), 7 songs asked for, the night's tempo
following the songs too far off to match (it sat at 126, 124, 100 and 95 BPM at different times), no
page errors; WebKit's memory 0.80 to 0.93 GB (1.03 at most).

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
and a crossfader, four pads, a build-up the table taps together and DROP on the count, a pick for
the next of 12 styles. The rule that keeps it from ever sounding wrong is that everything lands on
the beat, so these checks are mostly about timing.

**`site/scripts/dj_deck_check.py`**, a TV and three phones playing at once, the TV in Chromium and
in WebKit: 37 of 37 checks pass in each (after both code reviews' fixes), no errors on any page.
Three pads pressed at once by three phones all play, each on a beat to the millisecond. The brake
stops the music and brings it back on the bar with no stall. Two picks for latin and one for techno
load latin on deck B. Thrown all the way to B before B has any music of its own, the fader leaves
deck A playing (its quietest moment 0.03 to 0.04 RMS: never silence; before the second review's
fix this was silence until B's next section, up to about 20 seconds). Once the speaker's deck B
really plays latin the TV marks it up next. The phone that moves the fader holds it, and the others
wait and see who has it. Everyone taps the build-up full, the countdown runs on the TV and the
phones while the picks wait, and a press 15 to 40 ms after the cue is perfect. The drop lands
exactly on its bar (beat 80 for bar 20 in the last run), swaps to deck B, and the TV celebrates.

**A busy table** (the TV in WebKit, two phones): a pad every 2.5 to 6 seconds, a new pick every
30 s, the fader swept across and back every 45 s, a build-up and a drop on the cue every minute.

| Run | Stalls | Lowest buffer | Pads pressed / played | Drops / perfect | Off the beat | WebKit's memory |
| --- | --- | --- | --- | --- | --- | --- |
| 8 minutes, first version | 0 | 4.97 s | 95 / 95 | 7 / 7 | 0 | steady, about 1 GB |
| 12 minutes, first version | 0 | 4.96 s | 142 / 138 | 10 / 10 | 0 | steady, 1.0 to 1.1 GB |
| 8 minutes, first review's fixes | 0 | 4.97 s | 93 / 91 | 7 / 6 | 0 | steady, 1.0 to 1.1 GB |
| 8 minutes, the same, each drop's grade kept | 0 | 4.96 s | 96 / 94 | 7 / 7 | 0 | steady, 1.0 to 1.1 GB |
| 8 minutes, second review's fixes (this version) | 0 | 4.88 s | 91 / 90 | 7 / 7 | 0 | steady, 1.0 to 1.1 GB |

The pads that didn't play were the deck's own limits at work: a pad of the same kind still
sounding (a sweep lasts two bars, a horn two beats), or a brake within 4 seconds of the last. In
the third run the rooms server restarted 3.5 minutes in (an edit reloaded it, as a deploy would):
the TV and both phones were back within a second and the music never stopped. One of its seven
drops wasn't perfect, and that run didn't keep why; the two runs after it keep each drop's grade:
14 of 14 perfect, the test phone pressing 10 to 62 ms after the cue (its timers on a busy 2-core
machine; perfect is within 120 ms either side). An earlier 12-minute run lost its WebKit page
partway (the test browser's page process went away, with no error in the page itself); the runs
after it, watching the memory, ran clean. Worth an eye on a real Mac and iPad: if the TV's page
ever reloads by itself mid-set, that's the one to tell me about.


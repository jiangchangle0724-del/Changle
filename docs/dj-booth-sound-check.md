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

**Against this PR's preview (the real build on Cloudflare):** the speaker page passes in WebKit at
both sizes and in Chromium at the phone size (first sound 2.6 to 4.2 s, no stalls, 125 BPM). In
Chromium at the desktop size the music took 17.7 s to start: the test machine (2 cores) was also
running two long soaks, and the sections are recorded on the device before they can play (the
recording starts as the page opens, before anyone taps). How long that takes on a real iPhone and
Mac is one of the things Steve's check shows.

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

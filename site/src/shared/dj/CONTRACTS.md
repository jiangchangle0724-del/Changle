# 打碟 · DJ Booth: the contracts

Read this and your task card; not the whole plan. The plan is `docs/dj-booth.md` (Steve's brief);
where this file and the brief differ, this file says how the brief is being done. The types are in
`types.ts` beside this file.

## What it is, so far

A table opened at **changle.ca/dj** is a DJ booth. That big screen (a Mac or iPad mirrored to the
TV) is the **speaker**: the only device that makes a sound. Phones sit down the way they do at any
table and get a 🔥 button; the host also gets the night's controls. The music is the **stand-in DJ**
(`site/src/party/dj/fake/`): house at 125 BPM recorded on the speaker itself with the site's own
instruments. Lyria is not connected yet (A2): it will replace the stand-in and nothing else.

It is built inside the site, not as its own project: the rules run on the site's rooms server
(`site/worker`, a Durable Object per table) and deploy with it; there is no new setting or secret.

## Where things are

| What | File |
| --- | --- |
| Shapes everyone shares | `site/src/shared/dj/types.ts` |
| The energy curve (pure) | `site/src/shared/dj/curve.ts` |
| The room's rules | `site/src/shared/engine/games/dj.ts` |
| What a phone or screen is sent | `DjView` in `site/src/shared/protocol.ts` |
| The speaker's player (audio thread) | `site/src/party/dj/speaker/player.worklet.js` |
| The speaker's sound chain and clock | `site/src/party/dj/speaker/speaker.ts` |
| The stand-in DJ | `site/src/party/dj/fake/` (`sections.ts`, `arrange.ts`, `render.ts`, `FakeDj.ts`) |
| The speaker's screen | `site/src/party/dj/TvDj.tsx` (in the big screen, `site/src/tv/TvApp.tsx`) |
| The phone | `site/src/party/dj/NetDj.tsx`, `site/src/styles/dj-phone.css` |
| Lights and dancers | `site/src/party/dj/Floor.tsx`, `site/src/styles/dj.css` |
| The speaker on its own (no table) | `site/src/party/dj/TestPage.tsx`, at changle.ca/dj/test |

## The night (`RoomState`, the rules in `games/dj.ts`)

```
wait ──speaker: live──▶ warm ──15 min──▶ build ──15 min──▶ peak ──host──▶ cool ──15 min──▶ end
                         ▲  the host can move it to warm, build, peak or cool at any time  │
                         └───────────────── host: again (back to wait) ◀────────────────────┘
```

- **Opening.** A big screen that opens a table for the DJ booth (`screenHello(..., "dj")`) starts
  the game at once (`GameDef.auto`): the booth is on before anyone sits down, and it stays on when
  every phone has left (the music plays on for whoever comes next). The first phone to sit down
  hosts. The host can close the booth (back to the lobby, the booth still up front) and open it
  again from there. The booth is hidden everywhere else (`hidden` in `site/src/games/registry.ts`).
  Its phones make no sound at all: no start sound, no table sounds (`useTableSounds`).
- **wait.** No music yet. Nothing moves until the speaker says it is playing.
- **The set** starts when the speaker sends `live`: `liveAt` and `capAt = liveAt + 4 h` are set,
  and with them two timers: `wind` (cap minus 15 min: to `cool`) and `cap` (to `end`).
- **Each stretch** has `phaseAt` (when it began) and `nextAt` (when it moves on by itself, 0 when it
  waits for the host). warm and build last 15 minutes from when they began; peak lasts until the
  host winds down or the cap comes near; cool lasts 15 minutes. Nothing runs past `capAt`.
- **The host** (`phase`) can take the night to `warm`, `build`, `peak`, `cool` or `end` at any time
  once it has started (each with a fresh clock), and after the end start another set (`again`):
  back to `wait`, a new `set` number, the night's 🔥 kept.
- **Everyone** can press 🔥 (`fire`): a phone sends at most one per 400 ms (faster taps only burst
  on the phone), and the room takes one per 300 ms a phone (the network bunches taps up). The room
  keeps the latest 40 presses (`fires`, who and when) and a count per player for the night
  (`total`), and tells every screen at once (an `fx` event `fire` with the player's id).
- **🔥 is a light change** (`api.light()`, `Output.light`): the rooms server sends the fresh table
  at once but stores it only with the next real change or after 10 seconds, so a party pressing
  all night doesn't write to storage on every tap. Losing the last few seconds of 🔥 counts if the
  table is evicted is fine.
- **The speaker** is a big screen, so it has no seat: it talks to the game through
  `RoomEngine.screenAct` (the rooms server passes a screen's game actions there; only games with a
  `screen` handler listen, and a screen can never act for a seat). A screen can't be kicked and
  anyone with the code can open one, so only what the game takes counts as a change (`screen`
  returns whether it took it); anything else costs nothing. The booth takes two: `live` (the music
  started; taken only while waiting; the speaker says it every 3 seconds until the room has heard
  it) and `stats` (stalls, times the sound had to be woken, and seconds played since the last
  report, at most one report per 30 seconds and a minute's worth each, added up in `speaker` for
  the night's recap; kept across sets).

`energy` in the view is the stretch's density (0 to 1); `mix` is what the speaker plays (with
Lyria, it becomes the prompts and config; `ENERGY` in `curve.ts` sets density and brightness).

## Commands (`DjCommand`)

A phone sends a command as a game action: `act({ a: "g", g: { x: "fire" } })`, which
`useRoom().g("fire")` does. The room takes and keeps every command below; the DJ acting on them
comes later (knobs, ❄️ and drops: A4; songs: A5). The phone's controls for the new ones are task
card C4, the big screen's C5 (`docs/codex-tasks/dj/`).

| Command | Who | What the room does |
| --- | --- | --- |
| `fire` | anyone | 🔥, as above. |
| `cold` | anyone | ❄️, the other side of 🔥: the latest 40 in `colds`, an `fx` event `cold`. One 🔥 or ❄️ per 300 ms a phone, shared. Light. |
| `knob` `{ style, value }` | anyone | The player's knob for one of the 12 styles, −1 (less) to 1 (more) on a 0.25 grid; 0 takes it back. Kept in `knobs[pid]`. Light: while a finger drags, send at most one every 250 ms and the last on release. |
| `drop` `{}` | anyone | A drop request, only while the music plays: the latest 20 in `drops`, an `fx` event `drop`; one per 10 s a phone. Light. |
| `ask` `{ text, style? }` | anyone | A song described in 2 to 120 characters (one line, invisible characters taken out; an emoji or a Chinese character is one), with a style if they picked one: a `Track` added to `queue` as `queued`, an `fx` event `ask`. One waiting song a player, 12 for the table; more is ignored. |
| `unask` `{ id }` | its player, or the host | Takes back a song while it is `queued` (or `refused`, `failed`); once it is being checked or made it is the song pipeline's. |
| `phase` `{ phase }`, `again` | the host | As above. |
| `live` `{ source }`, `stats` `{ stalls, resets, seconds }` | the speaker | As above. |

- **Nothing a player types reaches anyone else unchecked.** In a phone's or screen's view, a song's
  `ask` is null for everyone but its player and the host until it has passed the text check
  (`CHECKED`: status `making` or later); a refused song shows only to them, with `why`. The big
  screen is nobody, so it sees what the table sees. Until the song pipeline (A5) exists every song
  stays `queued`: the big screen can show that someone's song is waiting, never what it says.
- **Another set** keeps the night's 🔥 counts, everyone's knobs and the songs; ❄️ and drops are
  about the moment and start empty.
- **Knobs of players who left** stay in `knobs` (they may come back): the DJ and the screens count
  only the seats at the table.
- A booth saved before a field existed gets it empty (`norm` in `games/dj.ts`): add new fields the
  same way.

## The speaker

One sound chain on its own AudioContext at 48 kHz with `latencyHint: "playback"` (opened from a
tap, which iPhone and Safari require):

```
PCM chunks → player (AudioWorklet) → master gain → glue compressor → limiter (−1.5 dB) → speakers
                                                                    ↘ analyser (45–140 Hz, the lights)
```

- **In:** planar Float32 chunks at the stream's rate (48 kHz), any length; the stand-in sends a
  quarter second at a time and keeps 5 seconds waiting. Lyria's chunks (16-bit little-endian
  stereo, interleaved) go through `pcm16ToFloat` (`speaker/pcm.ts`) or `Speaker.pushPcm16`.
- **The player** keeps a 16-second ring. Nothing sounds until 2.5 s are waiting. If it runs dry it
  fades out over the last 40 ms (no click), counts a stall, waits for 1.5 s to build up, fades in.
  `flush` drops what is waiting (a new stream). Too much at once drops the oldest. A stream at
  another rate than the device's is resampled (cubic).
- **Reports**, about 23 a second: at audio time `time` the next frame out is stream frame `pos`;
  `written` frames have arrived; the state (`waiting`, `playing`, `buffering`), stalls, drops.
- **The clock:** `heardFrame()` is the stream frame the speakers sound right now (from the reports
  and the context's output timestamp, smoothed). The beat is `(heardFrame − origin) / 48000 ×
  BPM / 60`, where `origin` is the stream's first downbeat. The stand-in starts every stream on a
  downbeat, at 125 BPM (a beat is exactly 23,040 samples). WebKit's `getOutputTimestamp`
  reports `performanceTime` at another pace than `performance.now()`, so it is used only when the
  two agree.
- **Energy:** the 45–140 Hz band against its own recent loudest, 0 to 1: the lights pulse with the
  kick at any volume.
- **Stopped sound:** an iPhone or iPad stops it when the screen locks or a call comes in; the
  screen then shows one button that wakes it (`resume`).
- **One per page** (`useBooth.ts`): the speaker and the stand-in DJ (with what it has recorded)
  live as long as the page, not the screen showing them. When the host closes the booth and opens
  it again, the music comes back without another tap on the TV; a double tap on start makes one
  speaker, not two.

## The stand-in DJ

Six 8-bar sections (`sections.ts`): warm1 and warm2, build1 (a snare roll and a riser before the
drop), peak1 (opens with a crash) and peak2, cool1 (a breakdown, the kick back halfway). Each is
recorded on the device with an OfflineAudioContext (`render.ts`, no tap needed, before anyone
presses start) as exactly 8 bars plus 2 seconds of ring-out, levelled to its own loudness (warm
−19 dB RMS up to peak −15). Recording is kept quick, since the night can't move on until the next
section exists: the drums are recorded once as a kit and played back hit by hit, every sound is
written in a beat before it plays, the first section of every stretch is made before the rest
(`renderOrder`), and a recording that takes over 90 seconds is given up on and asked for again
later. Until the next section is ready the last one plays again. At the end of each section the
next is picked for the phase (`arrange.ts`): the phase's own in turn, from its first when the phase
has just changed, so a change of phase lands on the phrase. The ring-out of one section is laid
over the start of the next. The end of a set fades out over 3 seconds. `heardSection()` says which
section (and so which stretch) the speakers are sounding now: the big screen puts the stretch's
name across the floor the moment the music gets there, not when the host tapped (that can be up to
a phrase, 15 seconds, earlier).

## Styles and Lyria RealTime

The 12 styles (`STYLE_IDS`) each get a `Preset` (task card C1, `presets.ts` beside this file). What
Lyria RealTime takes, from Google's pages as of 2026-11-01 (both last updated 2026-09-17; the
model is `models/lyria-realtime-exp`, experimental, and every output is watermarked):

- **Prompts:** a list of `{ text, weight }`; a weight can be anything but 0 (1.0 is the usual
  start). To move between mixes smoothly, send weights in between rather than jumping. Preset
  prompt texts come only from the guide's keyword lists, saved as
  `site/tests/fixtures/dj/lyria-prompt-words.json`.
- **Config:** `bpm` 60 to 200; `density` and `brightness` 0 to 1; `scale` one of the `Scale`
  values (`SCALE_UNSPECIFIED` lets the model choose); `guidance` 0 to 6 (default 4); `temperature`
  0 to 3 (default 1.1); `top_k` 1 to 1000 (default 40); `seed`; `mute_bass`, `mute_drums`,
  `only_bass_and_drums`. Changing `bpm` or `scale` needs `reset_context()`: the stream goes on
  with a hard cut, so the DJ only does it on a drop.
- **Out:** raw 16-bit PCM, 48 kHz, stereo (what `Speaker.pushPcm16` takes).
- The pages say nothing about price, quotas or how long a session can last: A2 checks before
  anything is switched on.

## The lights and the dancers

Every frame, from the speaker's clock (no React renders): `--pulse` (the kick), `--flash`,
`--beat` and `--spin` on the stage element, and a transform on every `[data-dancer]`. Feet land on
the beat (each dancer keeps one of four moves); how big they move follows the stretch's energy. A
flash fires on a strong kick, **never more than three a second** (the usual line for flashing
light), only in the build and the peak, and not at all with reduced motion. Anything that changes
every frame changes only opacity or a transform.

## Limits

- One stream per table, from the speaker. A second big screen on the same table would play it too:
  open the booth on one screen. (A2 sends the stream to one screen.)
- Every set ends 4 hours after its music starts. The monthly Lyria cap (20 hours) comes with A2.
- No way to upload or play an MP3 anywhere: every sound is made here (later: by Lyria).

## Tests

- `npx tsx tests/engine.test.ts`: the room's rules (`dj: ...`), the commands above included.
- `npx tsx tests/dj.test.ts`: the player on a pretend audio thread (prebuffer, fades, stalls,
  resampling, flush, overflow, reports), Lyria's PCM format, the stand-in's sections and order.
- `python3 scripts/dj_check.py`: with the local servers running, the speaker test page in WebKit
  and Chromium (phone and desktop sizes) and a whole table (a TV, two phones). Results:
  `docs/dj-booth-sound-check.md`.

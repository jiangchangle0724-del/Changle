# 打碟 · DJ Booth: the contracts

Read this and your task card; not the whole plan. The plan is `docs/dj-booth.md` (Steve's brief);
where this file and the brief differ, this file says how the brief is being done. The types are in
`types.ts` beside this file.

## What it is, so far

A table opened at **changle.ca/dj** is a DJ booth. That big screen (a Mac or iPad mirrored to the
TV) is the **speaker**: the only device that makes a sound. Phones sit down the way they do at any
table; every phone is a **beginner deck** (everyone DJs at once, below) with a 🔥 button, and the
host also gets the night's controls. The music is the **stand-in DJ** (`site/src/party/dj/fake/`):
12 styles at 125 BPM in A minor, recorded on the speaker itself with the site's own instruments,
on two decks in step. At one of the site owner's own tables, Lyria RealTime takes over from it
(A2, a private test: "Lyria" below); everywhere else the stand-in plays. The booth is on the home
page's list (Nov 1): its card sends a computer to changle.ca/dj and tells a phone where to go.

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
| The stand-in DJ | `site/src/party/dj/fake/` (`sections.ts` house, `styles.ts` the other 11, `arrange.ts`, `render.ts`, `FakeDj.ts`) |
| The beginner deck: shared rules (pure) | `site/src/shared/dj/deck.ts` |
| The beginner deck on the speaker | `site/src/party/dj/deck/driver.ts`, the sounds in `speaker/fx.ts`, the screen in `deck/TvDeck.tsx` |
| The beginner deck on a phone | `site/src/party/dj/phone/DeckPad.tsx`; words in `deck/words.ts`; styles `site/src/styles/dj-deck.css` |
| The 12 styles' Lyria presets | `site/src/shared/dj/presets.ts` (C1) |
| The speaker's screen | `site/src/party/dj/TvDj.tsx` (in the big screen, `site/src/tv/TvApp.tsx`) |
| The phone | `site/src/party/dj/NetDj.tsx`, `site/src/styles/dj-phone.css` |
| Lights and dancers | `site/src/party/dj/Floor.tsx`, `site/src/styles/dj.css` |
| The speaker on its own (no table) | `site/src/party/dj/TestPage.tsx`, at changle.ca/dj/test |
| Lyria: the relay on the rooms server | `site/worker/lyria.ts` (in the table's Durable Object, `index.ts`) |
| Lyria: the speaker's side | `site/src/party/dj/lyria/` (`LyriaDj.ts`, `prompts.ts`, `beat.ts`), switched in `useBooth.ts` |
| A fake Lyria for local runs | `site/scripts/fake_lyria.mjs`; the chain's check `site/scripts/dj_lyria_check.py` |

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
  again from there. On the home list its card plays at its big screen (`speaker: "/dj"` in
  `site/src/games/registry.ts`): no one-phone mode, and a table's spin never lands on it.
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
| `drop` `{ c? }` | anyone | DROP, pressed in a drop's countdown (the beginner deck, below): counts once a phone, graded by `c`, the phone's estimate of the server's clock (never later than now, never more than a second earlier); the latest 20 that counted in `drops`, an `fx` event `drop` (`data: [1]` when perfect). Anything else is quiet. Light. |
| `pad` `{ pad }`, `charge` `{ n }`, `vote` `{ style }`, `fader` `{ value }` | anyone | The beginner deck, below. |
| `grid` `{ at, bar, bpm }` | the speaker | Where its bars fall, below. |
| `ask` `{ text, style? }` | anyone | A song described in 2 to 120 characters (one line, invisible characters taken out; an emoji or a Chinese character is one), with a style if they picked one: a `Track` added to `queue` as `queued`, an `fx` event `ask`. One waiting song a player, 12 for the table; more is ignored. |
| `unask` `{ id }` | its player, or the host | Takes back a song while it is `queued` (or `refused`, `failed`); once it is being checked or made it is the song pipeline's. |
| `phase` `{ phase }`, `again` | the host | As above. |
| `live` `{ source }`, `stats` `{ stalls, resets, seconds }` | the speaker | As above. |
| `src` `{ source }` | the speaker | Its music changed hands mid-set (Lyria took over, or the stand-in came back): `source` follows, so every phone shows which DJ plays. Only while music plays, only a real change, at most once a second; the speaker says it again every 3 seconds until the room has it. |
| `mine` `{ on }` | the host, or the speaker | The night on the host's songs, or back to the stand-in (below): `mine` in the view; the speaker switches once it has songs. |
| `song` `{ by, id, code }` | the speaker | How a song file sent from the host's phone went (below): an `fx` event `song` for that phone. |

- **Nothing a player types reaches anyone else unchecked.** In a phone's or screen's view, a song's
  `ask` is null for everyone but its player and the host until it has passed the text check
  (`CHECKED`: status `making` or later); a refused song shows only to them, with `why`. The big
  screen is nobody, so it sees what the table sees. Until the song pipeline (A5) exists every song
  stays `queued`: the big screen can show that someone's song is waiting, never what it says.
- **Another set** keeps the night's 🔥 counts, everyone's knobs, the songs, the decks' styles and
  the night's perfect drops; ❄️, drops, pads, the build-up start empty.
- **Quiet** (`api.quiet()`): a command the room turns away (any of them: a 🔥 too soon, a knob
  already where it is, a song too short or one too many, a take-back that isn't allowed, the deck's
  own), or a tap it keeps to add a moment later, sends and stores nothing (the engine's
  `Api.quiet`; the rooms server then writes nothing at all, not even its alarm); what it kept goes
  out with the next change. A light change that moves a game timer still re-arms the alarm, and the
  alarm itself always sets the next one.
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
−19 dB RMS up to peak −15). They're recorded dry: WebKit keeps every offline context that had a
reverb (a convolver, or a loop of delays) in memory for good, 5 to 12 MB a recording, and a night
records one every half minute or so. The speaker adds the room instead (`Speaker.setRoom`): one
reverb on the mix above 350 Hz at 0.12, about as loud as the recordings' own was, for the stand-in
only (Lyria and the host's songs bring their own). A recording that has gone is recorded over by
the next (its memory reused). Recording is kept quick, since the night can't move on until the next
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

**Songs** (`fake/tracks.ts`, Steve's ask on Nov 1: "it's always the same song"). Every 8 sections
(about two minutes) the night moves on to a new song: the same sections over another chord
progression in A minor (12 of them), with the melody turned its own way. Every part the styles
wrote over Am, F, C, G is moved bar by bar along the A minor scale onto the song's chords, so
everything stays in key and both decks play the same chords at the same time (any two styles
still blend). A song is a number (`trackOf`; 0 is the night as written), recorded as sections of
their own (`sectionOf(style, base, track)`); the next song's sections are recorded while this one
has two sections left, and the night moves on once they are (until then this song plays on). A
song asked for by name gets its number from the name (`trackFor`: the same name, the same remix)
and comes in at the next section once its sections are recorded (`playTrack`).

## The beginner deck (Nov 1: everyone DJs at once)

Steve's ask: beginners can DJ too. His choices: everyone presses at once; effect pads, a build-up
and drop, a pick for the next style, two decks and a crossfader; hints on the screens. The rule
that makes it safe: **everything lands on the beat**, and the room keeps everyone's presses in
order, so nothing a beginner presses can trainwreck.

**The decks.** Deck A and deck B (`DeckState` in `types.ts`, the rules in `games/dj.ts` with the
pure parts in `deck.ts`). The stand-in plays both in step: the same section of the night, frame for
frame on the same bars, each in its own style, and every style at 125 BPM in A minor over the same
four chords (`fake/styles.ts`: the other 11 as kits, house as it was), so any two blend in key and
on the beat (like a game that fits every song to one tempo and key). The speaker's player holds
both and blends them at equal power as they play (`xfade`), so the crossfader answers at once
however far ahead the music waits. A deck that changes style changes at its next section (8 bars),
once that style is recorded; until then it plays on in the style it had. A deck with nothing of
its own yet (B before its first style is recorded) sends nothing: the player plays deck A alone
there, wherever the fader is (never silence), and B comes in on its section's first bar at the
fader's blend; its last section's ring-out fades under A rather than cutting. The section after
the one going out is recorded first. Lyria plays one stream: the fader there blends the two
styles' prompts (C1's presets) instead, a few seconds behind.

| Command | What the room does |
| --- | --- |
| `pad` `{ pad }` | One of the eight (`PAD_IDS`, in their order on the phones): `echo`, `sweep`, `horn`, `brake`, `siren`, `laser`, `scratch`, `rewind`, while music plays (the last four Steve's ask on Nov 1, for more club sounds). A phone sends one per 600 ms and the room takes one per 500 ms (the network bunches presses), the same pad once for the room per 150 ms (two people on the horn at once is one horn); a move of the music itself (`MOVES`: the brake, a scratch, a rewind) once per 4 s for the room (`brakeAt`) and never while a drop is on its way. Kept in `pads` (latest 12), an `fx` event `pad` (`data: [index in PAD_IDS]`). Light. The speaker plays it from its next beat. |
| `charge` `{ n }` | Taps on the build-up (a phone sends what it has every 250 ms, 8 at most, and a last `0` once its taps stop, so nothing is left waiting). Added a few times a second (`foldMs`), and only then told (quiet in between): 0.03 a tap, never faster than 0.25 a second for the room, falling back 0.12 a second after 1.5 s without a tap (`chargeNow`). Light, except the tap that fills it: that arms the drop and sets its timer, a real change. |
| `vote` `{ style }` | A phone's pick for what plays next (the same again takes it back; one per 300 ms a phone; none while a drop is on its way, which lands on the deck the floor had cued, and the phones show the picks waiting). The most picked (a tie: the one picked last) goes on the deck **off the air** (the one the fader leans away from), unless it's what's on the air. Picks start over whenever the decks swap. |
| `fader` `{ value }` | 0 (all A) to 1 (all B), on a 0.01 grid, only while deck B has a style. Whoever moves it holds it for 1.2 s after their last move (`faderBy`, `faderAt`); the others' moves are quiet till then. A phone sends at most every 120 ms while a finger drags, and the last on release. Light. `mix.weights` follows the decks and the fader (`deckWeights`). |
| `req` `{ text, song?, apple? }` | A song asked for by name (below): `song`, the song list's id when they picked it from the suggestions (then the list's title and artist, not what was typed, and its clip); `apple`, one the phone found on Apple, `[track id, title, artist, preview, storefront]`, every field checked (the preview can only be a path on Apple's preview server, or a URL there: `previewOk`). One each (waiting or up next), 8 waiting for the table, a phone's taken once per 5 s, none after the end. An `fx` event `req`. |
| `unreq` `{ id }` | Its player, or the host: takes back a song waiting or up next (the next one comes up). One whose remix plays already stays. |
| `decks` `{ a, b }` (the speaker) | The styles its two decks really sound now (`sounding`; `b` null while B has nothing of its own): a new style plays from its deck's next section once it's recorded. Taken at most once a second; the speaker says it again every 1.5 s until the room has it. |
| `mix` `{ knob, value }` | One of the mixer's four knobs (below; `MIX_KNOBS`: `low`, `mid`, `high`, `filter`) to `value`, −1 to 1 on a 0.05 grid (0: as the music plays), while music plays. Whoever moved it holds it for 1.5 s after their last move (`mixer.knobBy`, `knobAt`); the others' moves are quiet till then. A phone sends at most every 100 ms while a finger drags, and the last on release. Light. |
| `mixfx` `{ fx, on }` | One of the mixer's four effects (`MIX_FX`: `pump`, `gate`, `flange`, `crush`) on or off, while music plays; a phone switches once per 400 ms (`mixAt`, with `mixoff`). Kept in `mixer.fx` with who and when; it goes off by itself a minute on (`MIXER.fxMs`, 32 bars at 125 BPM: the room's timer `mix`). An `fx` event `mix` (`data: [index in MIX_FX, 1 on or 0 off]`). |
| `mixoff` | The whole mixer back to as the music plays, when something is turned or on. An `fx` event `mix` (`data: [-1, 0]`). |

**The drop.** When the build-up fills, the room aims the drop (`aim`): the first bar that's a
multiple of 2 at least 17 beats away on the speaker's bars, the **cue** one beat before it. The
screens count 8, 7 … 1, two beats each (about a second at 125 BPM), then DROP on the cue's beat
(`countdown`): about 8 seconds, Steve's ask on Nov 1, so the whole table can get ready (the early
numbers sit smaller on the TV). The speaker's build-up climbs through the count (the high-pass and
the riser the rest of the way up, the snare roll in eighths, sixteenths in the last two bars). A
press counts from the count's 1 until it reaches the room 120 ms before the bar (so the room's
word reaches the speaker in time; a word that reaches it a moment late lands at once, not a beat
later); before the 1 it's "not yet". A phone judges its own press as the room will, counting 80 ms to get there
(`pressBy`): a press counts until about 280 ms after the cue (people press a moment after they see
DROP), the phone says "now" only while a press still counts, and a press after that is late, not
early. Within a quarter beat of the cue it's
**perfect**, else good (`grade`). At the bar (a room timer) it lands (`last`, the night's
`perfects`): the fader jumps to the deck the drop was for, the build-up and the picks start over.
It swaps to the deck off the air when the floor has **cued** its pick there (`cued`: loaded there,
and the speaker says that deck really plays it; with Lyria, loaded is enough); a pick still
loading shows as such and the drop stays on the deck that's on. Which deck it lands on is decided
when the build-up fills. Nobody pressed: another whole countdown (`reaim`: the next 2-bar line at
least 17 beats on), and that one the DJ drops by itself (`auto`). The end of a set clears it.

**The speaker's bars** (`grid`). The speaker tells the room where its bars fall: bar `bar` of its
stream starts at server time `at` (when it's *heard*), at `bpm`. It compares them with the room's
every second and says them whenever the room's put the next bar more than 0.06 of a beat from where
it hears it (a new stream, its DJ changed, a drift, a stall, a word lost or turned away), at most
every 1.5 s, countdown or not; and every 10 s anyway, which shows the room it's still the speaker.
The room takes the bars from one screen (`gridFrom`, at most once a second), and the speaker's
`stats`, `src` and `decks` only from that screen too; another screen can take over once that one
has said nothing at all for 30 s (`speakerAt`, kept in memory: whatever it says counts, taken or
not). It ignores the same bars within a twentieth of a beat. A drop on its way keeps its bar and
its presses when the same stream is corrected (its time moves with it, except in its last 200 ms:
then it stays put, and the speaker lands it on its own bar anyway); only new bars (a new stream)
start its countdown over. Phones count down on the server's clock (`useRoom().now()`), so every
phone, the TV and what the room hears agree.

**On the speaker** (`deck/driver.ts`, the sounds in `speaker/fx.ts`), every effect at an audio
time on the beat grid (`BoothDj.beatFrame`, `Speaker.timeOfFrame`):

```
deck A ┐                                                               ┌─ echo send (¾ beat, dying away) ─┐
       ├ player (crossfader, brake) → mixer → high-pass (build-up) → low-pass (sweep) ─────────────────┴→ master
deck B ┘                                                                 horn, riser, roll, impact ────────┘
```

- **The drop on the speaker** is one per bar of a stream, however its time is corrected, and the
  speaker holds its fader jump until the room says the drop landed (3 s at most). If the room
  moves that drop to new bars instead (a new stream), the build-up comes back for its countdown.
- **echo:** a bar of the music repeating every ¾ beat, dying away. **sweep:** the music closes
  down to a murmur over a bar and opens over the next. **horn:** two short blasts and a long one, on
  the eighths. **siren:** a dub siren, a square wave whooping up and down twice a beat for two
  beats. **laser:** three zaps on the sixteenths, each a quick fall from high to low. Each plays
  from the speaker's next beat; one of a kind at a time.
- **The moves of the music itself**, in the player (`player.worklet.js`), each back exactly where
  the stream has got to (the player's own clock never stops): **brake**, the music slows to a stop
  over ¾ of a beat (pitch with it), quiet until the next bar line, back on its downbeat;
  **rewind**, it slows, spins backwards faster and faster (3.5 times) for a beat, fading, quiet
  until the next bar line, back on its downbeat; **scratch**, a hand on the record: the music back
  and forth twice in a beat (up to 2.6 times as fast), the sound cut where it turns, back on the
  next beat. One at a time.
- **The build-up:** the high-pass rises with the charge (the bottom falls away), a noise riser
  climbs, and a snare roll runs on the grid (quarters, eighths, sixteenths as it fills; sixteenths
  in the countdown). **The drop:** at its bar everything lets go at once with a boom, a crash and
  a whoosh, and the crossfader jumps with it. The big screen celebrates when the room says it
  landed: a perfect one with confetti and the names.
- **The screens:** the TV shows the two decks (the one on the air bright, the cued one "up next"),
  the fader and who has it, the build-up's meter, who pressed which pad, the countdown, the landed
  drop, and a hint (`hintFor`: the countdown, keep tapping, build up and drop into the cued deck,
  slide the fader, pick the next style, try the pads). A phone has the same hint above its deck,
  the decks, the fader, eight pads in two rows, the build-up button that turns into DROP with the count, and
  the 12 styles to pick from.

**The mixer** (混音台, Steve's ask on Nov 2: pro mixing, to make the music more electronic, with
knobs). One mixer for the table (`MixerState` in `types.ts`), under every phone's deck: anyone
turns or switches anything while music plays, and every phone and the TV show the same.

- **The knobs** (`mix`): 低音 Low, 中音 Mid, 高音 High are the EQ's bands (a low shelf at 200 Hz, a
  peak at 1 kHz, a high shelf at 4 kHz): −1 cuts the band out (−36 dB, a DJ's kill), 1 lifts it
  6 dB (`eqDb`). 滤波 Filter is one knob for two filters: to the left a low-pass closes down to
  300 Hz (darker), to the right a high-pass climbs to 2.5 kHz (thinner), more resonant the further
  it goes (`filterOf`). The speaker moves them at once, with a 30 ms glide.
- **The effects** (`mixfx`), each switched on the speaker's next beat: 泵感 Pump, the music ducks
  on every beat and swells back (as under a sidechained kick); 切片 Gate, the music cut into
  sixteenths to a pattern over the bar (`GATE_STEPS`); 镶边 Flanger, a short delay swept back and
  forth (once every 8 beats) mixed in; 低保真 Lo-fi, a copy at a lower sample rate and bit depth
  mixed in (`dj-crush` in `player.worklet.js`). Each goes off by itself a minute on, so nobody
  leaves the night crushed by accident.
- **Back to normal:** a drop puts the knobs back to 0 on its bar (it hits whole; the effects stay
  on); the end of a set puts everything back; `mixoff` (复位 Reset on a phone) does it any time.
- **On the speaker** (`speaker/mixer.ts`, `MixerChain`): between the player and the deck's own
  effects, so it shapes whatever plays (the stand-in, Lyria, the host's songs, a clip):

  ```
  player → EQ → low-pass → high-pass → (music + lo-fi copy) → (music + flanger) → pump → gate → high-pass (build-up) …
  ```

  The driver (`deck/driver.ts`, `mix`) turns the knobs at once (a drop's bar sets them back
  itself), switches the effects at the next beat (`nextBeat`), and writes the pump's ducks and
  the gate's sixteenths 1.5 s ahead, beat by beat on the speaker's grid, so they stay on the beat
  however late the room's word arrives; a new stream starts them over on its own beats.
- **The screens:** a phone has 混音台 under its deck: the four knobs as sliders (0 in the middle,
  snapping to it close by; one somebody else holds shows who), the four effects as switches, and
  复位. The TV shows the mixer under the build-up's meter while anything is turned or on (the knobs
  turned as bars, the effects lit), and who switched what with the pads' names.

**Songs asked for by name** (`req`, Steve's ask on Nov 1: "players type the song they want, and it's
remixed into the next track"; his choice: a new song in that song's style, not the song itself).
The booth can't have the whole song (someone's recording): the DJ makes the next track in its
style, named for whoever asked, and since Nov 2 plays 30 seconds of the song itself first (below). A phone types a song or an
artist and gets suggestions from the site's song list (`src/data/songs.ts`, loaded the first time
someone types: it's big). The room works out the style (`requests.ts` `styleForRequest`: words that
name a genre or an artist first, then the list's language and kinds, then the script the name is
written in) and the stand-in's song for the remix (`trackFor`). The requests wait in `reqs`; the
oldest goes **up next** (`up`) once music plays and no drop is on its way: its style goes on the
deck off the air, the picks wait for it (they're quiet), and the deck is loaded for it even in the
style on the air (`loaded`: its remix is a new song). The next drop onto that deck (or the fader
across the middle) puts it on the air (`now`, named on the screens for 90 s, or until the decks
swap away or the next one plays); the speaker plays its remix from the stand-in's next section. If
the table hasn't dropped into it 40 s after it went up, the DJ starts the countdown itself (an
`auto` drop: anyone can still press for a grade), once that deck really plays it (else 5 s later).
A drop that didn't go into it (its deck was still loading) gives it another 40 s. The end of a set
puts the one up next back at the front of the line; another set keeps the line. What shows: a song
picked from the list shows its title and artist to everyone (they're the list's); a name typed in
only to its player and the host: the others, and the big screen, see that a song was asked for
(`ReqView.text` null). Nothing a player types reaches the big screen unchecked.

**The song itself, for 30 seconds** (Nov 2, Steve: "the remix I picked didn't remix the song I
wanted"). A song from the list carries its clip (`p`: the 30-second preview the list has from Apple,
the clips 猜歌 plays, and `st`, its storefront); a name that isn't on the list, the phone looks up on
Apple's search itself (`phone/apple.ts`: Apple turns servers away and lets browsers in), shows what
it finds beside the list's suggestions ("Apple Music"), and sends the one picked as `apple` (a name
typed and sent without picking: Apple's best match for it, asked then, three seconds at most; none:
the name alone). Its name is a phone's word, so only its player and the host read it (the others
and the big screen see a song was asked for; `ReqView.artist` goes too); its clip plays for
everyone. The speaker (`clip/clip.ts`) fetches the clip once it's up next, decodes it and listens to
it with the host's songs' beat finder: its tempo, its first downbeat a second or more in (Apple's
clips fade in), where it's worth playing to, how loud (brought to about the night's peak). A drop
on its way into that deck (`BoothDj.cue`) starts it on the drop's bar; the fader taking the deck on
the air starts it on the next bar line. Near the night's tempo (8%, or half or twice it) it plays a
little faster or slower so its beats fall on the night's (the pitch with it), over the deck's own
drums alone (the stand-in records each section's drums apart for it, `BED` in `fake/styles.ts`, 4
dB under the whole section; the drums are settled when the clip first plays over a section: a
section whose drums weren't recorded in time has the clip alone), ending on a bar line, the deck's
own sound (the remix) coming back over the last bar; too far off the beat, or with no clear beat,
it plays alone at its own speed, the deck's own sound back over 1.5 s as it ends. It sits a dB over
the stretch of the night it plays in (the warm-up is quieter than the peak). Taken back, or the
decks swapping away, it fades out in 0.4 s. On Lyria it plays over the stream once it's on the air,
from the next bar line, at its own speed, Lyria quiet under it. The big screen names it ("Now: 晴天
(周杰伦), for Amy", not a remix) and credits Apple ("Clip courtesy of Apple Music, then the DJ's
remix") only while it has the clip; without one (Apple can't be reached), the remix alone, named as
before. Whoever asked gets a link to the whole song on Apple Music while it plays. Apple's previews
are meant to promote the songs: the credit and the link are there for that, as in 猜歌.

## A night of the host's songs (`local`, Nov 2)

Steve's ask: "can I connect Apple Music, like rekordbox does". Apple only lets the DJ apps it has
deals with mix its songs (rekordbox, Serato, djay, Engine DJ), and MusicKit can't put effects on
them; so the booth plays the host's own song files instead (bought ones, CD rips: not a music
app's protected downloads), on the big screen's computer. Nothing is uploaded: the files stay
there, and only their names reach the room.

**On the TV** (`local/LocalPanel.tsx`): 我的歌, files or a folder (or dropped in). Each is decoded
once at 22,050 Hz and listened to (`local/beats.ts` `analyzeSong`): its tempo (the onsets, the low
end counted more, a rough period from how they repeat, then every tempo and phase near it tried
against the whole song: within a hundredth of a beat a minute on the checks' songs, a few ms per
beat), its first downbeat (the beat of four the low end hits hardest), its loud part (`cue`: the
first 8 bars nearly as loud as the loudest 8, on a 4-bar line from the first downbeat when one is
loud too, leaving 40 s), where it stops being worth playing (`end`) and how clear its beat is
(`sure`). Named from its tags (an MP3's ID3, an M4A's iTunes tags) or its file name ("Artist -
Title"). 200 songs at most, 45 s to 15 minutes each. 用我的歌放 makes the night theirs: the host's
wish is the room's (`mine`, from the TV's 我的歌 or the host's phone, below; kept with the next set),
and the speaker, once it has songs, says so as the source (`live`/`src` with `local`); the stand-in
comes back with 换回试音版 DJ.

**From the host's phone** (Nov 2, Steve: "this should work on the phone too"). Under the host's
controls, 我的歌: how many songs the TV's computer has, the same switch (`mine` `{ on }`: the host
only; the TV's own panel sends it as the speaker), and songs on the phone sent to the TV. A file goes
in pieces over the phone's own line to the table, as binary messages (`shared/dj/songwire.ts`:
"SONG", the header's length, a JSON header `{ id, i, n, size, name, type }`, 256 KB of the file;
30 MB a file at most): the rooms server takes them only from the host's phone at a DJ booth, 60 MB
a minute at most, checks each (its length right for where it falls in the file), marks it as theirs
(`by`, never the phone's word) and passes it straight on to the big screens; it keeps nothing. The TV
puts the file back together (three at a time at most; one that goes quiet for a minute is given up
on), keeps it in memory (400 MB of phone songs at most), and listens to it like one chosen on its
own computer; then it tells the room how it went (`song` `{ by, id, code }`, `SONG_SENT`: added,
not a sound file, too short, too long, can't be played, no room, already there) and the room tells
that phone (an `fx` event `song`, `data: [code, the file's number]`). The phone sends one file at a
time, a megabyte waiting on its line at most and under the table's minute, and says each one's
word back (or that the line dropped, or the TV didn't answer in 90 s). Only the host: a song's name
comes from its file, and nothing a player sends reaches the big screen unchecked.

**The room** (`games/dj.ts`): the speaker's list as `crate` (`{ x: "crate", songs: [id, title,
artist, bpm, seconds][] }`, once a second at most, from the speaker; kept with the next set too),
fetched by the phones over HTTP (`GET /room/CODE/data`: it's big, so it doesn't come with every
view; the view has `crateN` and `crateV`, and `onDecks`, the two songs on the decks by name). On a
night of them (`deck.local`) each deck has one of the songs (`deck.songs`): the one on the air
keeps its own, and the deck off the air the next, one not played tonight (`played`; all played,
they start over), or the one asked for (`req` with `local`: named for everyone, they're the host's;
a name typed in isn't taken). There are no styles to pick. A drop swaps to the deck off the air
once the speaker says it has that song (`decks` with `sa`/`sb`: `cued`). The speaker says when the
song on the air is nearly over (`ending`, 40 s before its end): the DJ starts the countdown into the
next itself, once that deck has it (else 3 s later).

**On the speaker** (`local/LocalDj.ts`), two decks in step like the stand-in, streamed a few
seconds ahead: the night's bars are the first song's (it plays at its own speed from its top). A
song that comes in after plays a little faster or slower so its beats fall on the night's (up to
8 % either way, the pitch with it, as a DJ's pitch fader does; half or twice its tempo counts), or,
too far off, at its own speed, and then the night's bars become its bars once it's on the air (a
new `epoch`: the room takes the new bars). A deck off the air waits at its song's start (the player
plays the other deck there, never silence) until the fader leans towards it (it starts on the next
bar line) or a drop is on its way into it: the driver tells it the drop's bar as the countdown
starts (`BoothDj.cue`), and its loud part lands on that bar, the bars before it played into it
unheard. The song on the air run out with nothing after it: its loud part again, on the next bar.
Songs are decoded at 48 kHz when they're on a deck, the latest three kept (about 90 MB a
four-minute song). No room reverb (`setRoom` off): the songs bring their own.

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

## Lyria (A2): the private test

**Why private.** Lyria RealTime is an experimental model (`models/lyria-realtime-exp`). Google's
terms keep experimental and preview models out of production use, it has no published price, and
Google can change it or take it away without notice. Steve decided (Nov 1, 2026) to connect it as
planned but only for his own tests; everyone else hears the stand-in. Lyria 3.5 (stable, $0.08 a
song) was the other road, left for later.

**Who.** A table where one of the site owner's accounts (`ADMIN_EMAILS`, which takes in
`MASTER_EMAIL`) has a seat. The hub says so when a phone sits down (`Admit.owner`); the table
keeps it on the seat (`SeatData.owner`, `setOwner`) and never shows it to a phone; the booth's view
says only `lab: true`. A phone that locks keeps its seat, so the music stays; leaving the table, or
signing out of that account, ends it.

**How.**

```
TV (speaker) ──/room/CODE/lyria?sid=<its screen id>──▶ the table's Durable Object ──wss──▶ Google
             ◀── Google's audio, untouched ────────────  (worker/lyria.ts)           ◀── Lyria
```

- The stand-in always starts the night (instant sound). With `lab`, the speaker asks the table's
  relay; the relay checks (a big screen at this table, the booth up, an owner seated, a key, under
  the month's cap) and answers `{ t: "no", why }` or opens the one session for the table: setup
  with the model fixed on the server, the key from Cloudflare (`LYRIA_API_KEY`, else the avatars'
  `GEMINI_API_KEY`), never seen by a browser (Lyria takes no short-lived browser tokens: they work
  only with the Live API). It's a plain socket, not a hibernating one: a table stays awake while
  its stream plays.
- The speaker sends `{ prompts: [{ text, weight }] }`, `{ config: { bpm, density, brightness,
  scale, guidance, … } }` and `{ play: "PLAY" | "PAUSE" | "STOP" | "RESET_CONTEXT" }`; the relay
  turns them into Lyria's own messages only if they're inside its ranges (`toGoogle`: 8 prompts of
  120 characters at most, weights never 0, every setting clamped), at most 10 a second. It answers
  `{ t: "ready" }`, `{ t: "state", s: "reconnecting" | "live" }`, `{ t: "filtered", text, why }`,
  `{ t: "end", why }`, and passes Google's `serverContent` messages (base64 16-bit stereo,
  `audio/l16;rate=48000;channels=2`) straight through.
- **The speaker's side** (`LyriaDj`, same face as the stand-in's `FakeDj`): once 3 seconds are in
  hand the stand-in steps aside and Lyria plays after what the speaker already has (no gap, a cut).
  It keeps 4 seconds in the speaker; Lyria sends faster than real time, so it pauses Lyria above 8
  seconds in hand and plays it again under 3. The stretch of the night becomes prompts and config
  (`lyria/prompts.ts`: house in the guide's words, a mood per stretch, the curve's density and
  brightness; C1's presets and A4's choices come later), sent the moment the host moves the night;
  the screen takes the new stretch as heard about 1.5 seconds after the first music Lyria makes
  after it. The beat: 125 BPM as asked, its place found from the kick drum (`lyria/beat.ts`).
  `src` tells the room when the music changes hands.
- **When Lyria stops for good** (not one of the owner's tables, no key, the month's cap, the set
  over, the connection gone after 4 tries), the speaker gets `no` or `end` with the reason and the
  stand-in comes back with a fresh stream (2.5 seconds quiet). A reason that won't change by trying
  again isn't tried again at that table until it stops being the owner's and becomes it again.
- **Guards.** One session per table. The month's hours (`DJ_LYRIA_HOURS`, default 20, every table
  together) are counted by the hub every minute while a session is open; at the cap the session
  ends and new ones are refused. The set's 4-hour cap and its end close the session, and so does
  the booth closing. Google's side dropping is reopened (after 0.3, 0.8, 1.6, 3.2, 6.4 s) and set up
  the way the speaker last left it; the speaker dropping keeps the session 20 seconds. At most 12
  new sessions a table in 10 minutes (a speaker opening and closing in a loop gets `busy`). The key
  goes in a header (`x-goog-api-key`), in the URL only if Google won't take it there, and never into
  a log. Google may answer in binary frames: the relay asks for them as bytes (a Worker's default is
  a Blob, which reads only asynchronously) and passes them on as text.
- **Local runs** never reach Google: `node scripts/fake_lyria.mjs` speaks the same protocol (music
  twice as fast as real time, a kick on every beat 137 ms in), and `DEV_LYRIA_URL=ws://127.0.0.1:8790`
  with `DEV_LYRIA_ANYONE=1` in `site/worker/.dev.vars` points the rooms server at it and lets any
  table try. `scripts/dj_lyria_check.py` runs the whole chain.
- **Not yet:** a change of tempo or key (needs `RESET_CONTEXT`, a hard cut: A4 does it on a drop);
  a smooth hand-over from the stand-in; Lyria's own price (Steve's tests and Google's bill will
  tell). A Workers WebSocket message is at most 1 MiB; Lyria's chunks are far below.

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
- Every set ends 4 hours after its music starts. Lyria stops at 20 hours a month, all tables together.
- Nothing is uploaded or streamed from a music service: the music is made here (the stand-in, Lyria), or it's the host's own song files, played from the big screen's computer (a night of them, above: 200 songs, 45 s to 15 minutes each; a music app's protected downloads can't be played). The one exception: a song asked for by name plays Apple's 30-second preview of it, fetched by the big screen from Apple's preview server (as 猜歌's are), never the whole song. Song files the host sends from their phone pass through the rooms server to the big screen and aren't kept on the way.

## Tests

- `npx tsx tests/engine.test.ts`: the room's rules (`dj: ...`), the commands above included, the
  beginner deck (pads on a leash, the build-up, the countdown, DROP on the cue, misses and the DJ's
  own drop, picks, the fader held, new bars), songs asked for by name (one each, up next on the deck
  off the air, the drop or the fader plays it, the DJ's own drop into it, taking back, the end of a
  set, who reads a typed name), and the private Lyria test's `lab` and `src`.
- `npx tsx tests/dj.test.ts`: the player on a pretend audio thread (prebuffer, fades, stalls,
  resampling, flush, overflow, reports, two decks and the crossfader, the brake), Lyria's PCM
  format, the stand-in's sections and order, every style's sections, the two decks in step;
  Lyria's side without Google: what the relay lets through, the beat from the kick, the prompts
  for each stretch (every word from the guide), the Lyria DJ (hand-over, seconds ahead, pausing
  Lyria, the stretch heard, reconnecting, stopping with a reason).
- `python3 scripts/dj_check.py`: with the local servers running, the speaker test page in WebKit
  and Chromium (phone and desktop sizes) and a whole table (a TV, two phones). Results:
  `docs/dj-booth-sound-check.md`.
- `python3 scripts/dj_lyria_check.py [chromium|webkit]`: with the fake Lyria too, the whole chain
  (relay, hand-over, the beat, the peak, a dropped stream, the stand-in back).
- `npx tsx tests/dj-presets.test.ts`: the 12 Lyria presets (C1).
- `python3 scripts/dj_local_check.py [chromium|webkit]`: a night of the host's songs in browsers:
  three made-up song files added on the TV (their tempos heard), the switch to them, the phones'
  decks and the next song by name, pads on the song's beat, a song asked for from them up next and
  dropped into (its loud part on the drop's bar, the player's crossfader there), the DJ dropping
  into the next as one ends, and back to the stand-in. `tests/dj.test.ts` has the beat finder on
  made-up songs, the tags, and the local DJ on a pretend speaker; `tests/engine.test.ts` the room's
  rules for them.
- `python3 scripts/dj_clip_check.py [chromium|webkit]`: a song asked for, played for real, in
  browsers (Apple's preview server and search answered by the check with made-up clips: 124 BPM
  with a 3 kHz tone, 100 BPM with a 5 kHz one): 晴天 from the list up next, its clip fetched and
  heard at 124 BPM, the deck's drums alone recorded, the clip set for the drop's bar, played a
  little faster on the night's beat, its tone in the speaker's output, about as loud as the night,
  the phone naming it and linking the whole song, the TV crediting Apple, the remix after it; a
  song found on Apple (its name only for its player), alone at its own speed; a name found
  nowhere, the remix alone. `tests/dj.test.ts` has the clip's listening, the clip deck's timing and
  fades, the stand-in and Lyria playing one, and Apple's search answer; `tests/engine.test.ts` the
  room's checks of a song found on Apple.
- `python3 scripts/dj_mine_check.py [chromium|webkit]`: 我的歌 from the host's phone in browsers:
  two made-up songs and a broken file sent from the host's phone, each one's word back (added,
  can't be played, the same one again: already there), the TV listening to them like its own; a
  phone that isn't the host's sending pieces straight at the rooms server, never reaching the TV;
  the switch to her songs from her phone (the TV hands the music over, no gap) and back.
  `tests/dj.test.ts` has the pieces (read back byte for byte, every bad one turned away);
  `tests/engine.test.ts` the switch and the word back.
- `python3 scripts/dj_mixer_check.py [chromium|webkit]`: the mixer in browsers, a TV and two phones,
  the speaker's output measured for each control: the bass cut (the low end gone; another phone's
  turn of the same knob waiting), the filter closed (the highs gone) and the other way (the lows
  gone), the reset; the pump ducking on every beat, the gate in sixteenths, the flanger and the
  lo-fi, each switched on a beat; the TV's mixer and who did what; a drop putting the knobs back on
  its bar. `tests/dj.test.ts` has the knobs' EQ and filter, the gate's pattern and the lo-fi on the
  audio thread; `tests/engine.test.ts` the room's rules for the mixer.
- `python3 scripts/dj_deck_check.py [chromium|webkit]`: the beginner deck in browsers, a TV and
  three phones playing at once: pads on the beat to the millisecond, picks loading deck B, the
  fader thrown to B before B has music (deck A plays on, never silence), the fader held, the
  build-up, the countdown (the picks waiting), DROP on the cue, the drop on its bar exactly and
  perfect; then a song picked from the suggestions up next and named on the TV, dropped into, its
  remix played (the stand-in's song changes to its track), and a typed one the TV never names,
  dropped into by the DJ when nobody does.
  Needs a table that isn't the owner's (`DEV_LYRIA_ANYONE` off), so the stand-in plays both decks.

# C5: the big screen (the songs, ❄️ and drops, what the floor wants, readable from 3 m)

**Files:** `site/src/party/dj/TvDj.tsx`, `site/src/party/dj/Floor.tsx`, new components in
`site/src/party/dj/screen/`, `site/src/styles/dj.css` (the big screen's rules; the phone's are in
`dj-phone.css`, not yours), and a new browser check, `site/scripts/dj_screen_check.py`.
**Uses:** `useRoom()` (`room.seats`, `nameOf`, `useRoomEvent` for the `fx` events `cold`, `drop`,
`ask`), the view `DjView` (`colds`, `knobs`, `drops`, `queue` as `DjTrack`), `WAITING` from
`types.ts`, the style names from C1's `PRESETS`.
**Command:** with the two local servers running (`site/README.md`, 本地开发):
`python3 scripts/dj_screen_check.py` (reuse the helpers in `scripts/party_test.py`).

The big screen is the speaker and the dance floor: a 1600×900 canvas scaled to the TV
(`site/src/tv/`). Now playing, the night's curve and energy, the join QR code, the buffering note,
the dancers with a flame over whoever pressed 🔥, and the stretch's name crossing the floor when
the music gets there are all there already: keep them working. This card adds what the phones can
now send, and makes everything readable from the sofa.

## What it must do

1. **❄️ over the dancer** who pressed it (`fx` `cold`), the way 🔥 shows now (`Floor.tsx`: the
   flames become reactions of either kind), cooler and quieter than the flame. The heat stays 🔥;
   ❄️ this minute can sit beside it, smaller.
2. **Drops:** when someone asks (`fx` `drop`), a short line for 3 seconds, 「Ben 想要 drop」/
   "Ben wants the drop". When two or more players seated now asked within 30 seconds:
   「全场在等 drop」/ "The floor wants the drop", for up to 10 seconds. The screen shows it; doing
   the drop is the DJ's (A4).
3. **The songs** (歌单): a panel with the songs waiting and the one playing, in order: the
   player's face and name, the text when the view has it (`ask` not null), otherwise
   「一首歌在审核」/ "A song being checked", and its status in a word. At most 5, then
   「还有 3 首」/ "3 more". Not there when there are none. A new one (`fx` `ask`) arrives with a
   small movement. Until the song pipeline exists every song stays `queued` and its text stays
   hidden here: that is right, don't work around it.
4. **What the floor wants:** from `knobs`, counting only the players seated now, the up to three
   styles with the biggest positive sum, near Now Playing: 「全场想要：拉丁、浩室」/ "The floor
   wants: Latin, House". Nothing when no knob is up.
5. **Readable from 3 metres** on a 1080p TV (the canvas is 1600×900, so 1 px here is 1.2 px
   there), with the type scale in `tokens.css`: anything a guest needs to read (names, the songs,
   the floor's choice, the drop lines, the night's stretches and the time to the next one, the
   heat) at `--text-xl` or bigger (26 px on the canvas); labels never under `--text-lg` (18 px);
   the join code `--text-4xl` (64 px). Text over the moving lights sits on a plate, as the deck and
   the join card do, and passes DESIGN.md's contrast (4.5:1, or 3:1 from 24 px). This is the one
   place this card changes the screen's existing styles: bring whatever is smaller up to the scale.
6. Nothing new covers a dancer's face, the QR code or the stretch's name crossing the floor, with
   1 to 12 dancers (two rows from 9).
7. The screen's rules in CONTRACTS.md stand: what changes every frame changes only opacity or a
   transform; no new flashing; with reduced motion, no movement. Both languages.

## Done when

`dj_screen_check.py` passes with the TV at 1600×900 (once in Chromium, once in WebKit) and three
phones (Chromium):

- a phone's ❄️ shows over that phone's dancer; its drop shows the line with its name; two drops
  within 30 seconds show the floor's line;
- knobs turned up on two phones show the right names in the floor's choice; turned back to 0,
  it's gone;
- songs asked from the phones show in the panel as 「一首歌在审核」/ "A song being checked"
  (never their text), in order, five at most with the rest counted; the panel goes when they're
  taken back;
- every visible text element (`aria-hidden` ones aside) measures at least 18 px (26 px for those
  listed in 5, 64 px for the join code) by `getComputedStyle`, at 1600×900;
- with 12 phones seated (add them over the room's WebSocket, as plain clients sending `hello`),
  no new element's box overlaps a dancer's face or the QR code;
- no page errors; screenshots of each state go to `$SHOTS` and into the PR.

And `npx tsc --noEmit`, the CI tests and `npm run build` pass.

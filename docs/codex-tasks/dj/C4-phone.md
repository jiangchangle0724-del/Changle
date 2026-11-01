# C4: the phone (❄️, drop, style knobs, asking for a song)

**Files:** `site/src/party/dj/NetDj.tsx`, new components in `site/src/party/dj/phone/`,
`site/src/styles/dj-phone.css`, and a new browser check, `site/scripts/dj_phone_check.py`.
**Uses:** `useRoom()` (`g(x, data)`, `me`, `isHost`, `room.seats`, `nameOf`, `useRoomEvent` for
the `fx` events), the view `DjView` (`colds`, `knobs`, `drops`, `queue`, as `DjTrack`), the
constants in `types.ts` (`FIRE_GAP_MS`, `DROP_GAP_MS`, `KNOB_STEP`, `ASK_CHARS`, `ASKS_EACH`,
`QUEUE_MAX`, `WAITING`, `STYLE_IDS`), the style names from C1's `PRESETS`.
**Command:** with the two local servers running (`site/README.md`, 本地开发):
`python3 scripts/dj_phone_check.py` (reuse the helpers in `scripts/party_test.py`, as
`scripts/dj_check.py` does).

The phone today: the stretch of the night, the big 🔥, who's most fired up, and the host's
controls. The room already takes everything below (CONTRACTS.md, "Commands"); this card gives the
phone the controls. Keep the 🔥 the first and biggest thing on the screen.

## What it must do

1. **❄️ beside the 🔥:** a smaller button under the 🔥 (lucide `Snowflake`, 「冷」/ "Too much"),
   with its own burst.
   One press of 🔥 or ❄️ per `FIRE_GAP_MS` from this phone, shared (the room shares it too).
   Others' ❄️ shows with their name, as others' 🔥 does.
2. **Drop:** a button beside the ❄️ (「要 Drop」/ "Drop it") that sends `drop`, then counts down
   `DROP_GAP_MS` before it can be pressed again; off while there's no music (`wait`, `end`).
   Someone else's request shows for a moment: 「Ben 想要 drop」/ "Ben wants the drop".
3. **Style knobs,** in a section that starts closed (「调风格」/ "Steer the style"): the 12 styles,
   each a control from −1 to 1 in steps of `KNOB_STEP` (「少」 at one end, 「多」 at the other,
   0 in the middle and easy to get back to). It shows this phone's values from `knobs[me]`, so a
   reload or another phone of the same player shows them too. While a finger drags, send at most
   one `knob` every 250 ms, and the final value on release. At the top of the section: the floor's
   choice, the up to three styles with the biggest positive sum over the players seated now
   (「全场想要：拉丁、浩室」/ "The floor wants: Latin, House"), or nothing.
4. **Ask for a song,** another section (「点一首歌」/ "Ask for a song"): pick a style (optional,
   one of the 12) and write a line (an example in the placeholder: 「给 Jackie 的生日，开心的
   reggaeton」/ "A happy reggaeton for Jackie's birthday"). Count characters the way the room does
   (`Array.from(text.trim()).length`), show the count against `ASK_CHARS.max`, send `ask` only
   from `ASK_CHARS.min`. Once sent, the form gives way to this player's song: its text, its status
   in words (queued 「排队中」/ "In the queue", checking 「审核中」/ "Being checked", making
   「正在做」/ "Being made", ready 「准备好了」/ "Ready", playing 「正在放」/ "Playing now",
   played 「放过了」/ "Played", refused 「没通过」/ "Not allowed" with its `why`, failed
   「没做成」/ "Didn't work"), and 「撤回」/ "Take it back" while it's `queued`. With `ASKS_EACH`
   songs waiting, the form stays away; with `QUEUE_MAX` waiting at the table it says the list is
   full.
5. **The list:** the songs waiting and the one playing, in order: the player's face and name, the
   text when the view has it (`ask` not null), otherwise 「（还在审核）」/ "(being checked)". The
   host gets a remove button on every `queued` one (`unask`). Kicking a player is already in the
   table's players sheet: nothing new for that.
6. Everything in both languages; no sound; `haptic()` on a press is fine. Works at 360×640 and
   390×844 with no sideways scrolling. New styles follow DESIGN.md (tokens, lucide icons, 44 px
   targets, the 16 px minimum in text fields so the iPhone doesn't zoom); the existing parts of the
   phone stay as they are.

## Done when

`dj_phone_check.py` passes with a TV (Chromium, 1600×900, opens `/dj`, taps start), a host phone
(WebKit, Chinese) and a guest phone (Chromium, English), checking through `window.__room`:

- the guest's ❄️ is in the TV's `colds`; 🔥 and ❄️ pressed within 400 ms on one phone send one
  command (count the frames the page sends: `page.on("websocket")`, `framesent`);
- dragging a knob for 2 seconds sends at most 9 `knob` commands, and the TV's `knobs` ends at the
  value the phone shows; after reloading the guest, the knob shows it again;
- the guest asks for a song: the host's phone shows its text, the TV's `queue` has it with `ask`
  null, the guest's phone shows 「In the queue」 and no form; the guest takes it back and it's gone;
  the guest asks again and the host removes it;
- drop is off before the music starts; after, the guest's press reaches the TV's `drops` and the
  button counts down from 10;
- no page errors on any page; no sideways scroll on either phone size;
- screenshots of both phones (each section open) go to `$SHOTS` and into the PR.

And `npx tsc --noEmit`, the CI tests and `npm run build` pass.

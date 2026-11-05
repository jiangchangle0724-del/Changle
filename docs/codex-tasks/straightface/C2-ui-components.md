# C2: the game's components, replacing A2's stand-ins

**Files:** `site/src/party/straightface/parts.tsx`, `site/src/party/straightface/straightface.css`,
`site/src/party/straightface/text.ts` (strings only), and a new preview page
`site/src/party/straightface/preview/Preview.tsx` reachable in development only (how `ShowPreview`
is wired in `site/src/App.tsx` is the model; the one `case` it needs in `App.tsx` is the only line
you add there). `StraightFace.tsx` only where a component's props changed.
**Command:** `npx tsc --noEmit`, then `python3 scripts/straightface_check.py` with the site running
(it plays a whole game and screenshots every step; it must still pass).

A2 built the one-phone flow with the site's shared pieces and a first pass of these components.
This card makes them finished and gives each a preview, without changing what the engine shows.

| Component | Input | What it must do |
| --- | --- | --- |
| TermCard | `term`, `level`, `big?` | the word as large as the screen allows; 1 to 3 dots for the level actually dealt; `big` doubles the type for the table (and later the TV) |
| HoldToPeek | `name`, `view: PrivateView`, `seconds`, `onDone` | shows the part only while pressed; the clock starts at the first press and runs whether or not the finger stays; the "pass to" line comes only from `onDone`, never earlier; no text selection or callout on a long press (iOS Safari); works from the keyboard (space) |
| PassCurtain | (shared, `party/common.tsx`) | keep; the game's note under the name says why the phone is coming ("your bet") |
| SpeakerRing | `name`, `seconds`, `resetKey`, `index`, `total` | the ring runs down; at 0 it flashes three times and nothing moves on |
| OrderStrip | `order`, `names`, `current` | faces in speaking order, the current one lit, the done ones ticked; scrolls sideways with 9 |
| PickOne | `people`, `onPick`, `disabled?`, `marks?` | one tap picks; a disabled face shows its mark (the tag) and cannot be chosen |
| RevealSequence | `items`, `onAllShown` | one item every 900 ms, a tap shows the rest; the order is the caller's: real meaning, fun fact, who did what, the honest one, the points |
| Recap | `rounds`, `cards`, `board` | "the N words you learned tonight" with places; exports a 1080 × 1350 image (canvas, no network) the phone can save |

## Rules

- A component takes a view or a slice of one, never `GameState`.
- Tokens only (`docs/DESIGN.md`): the design hook and `tests/tokens.test.ts` catch written-out
  values; the game's own two colours (the honest one's and the bluffer's) are the site's
  `--color-success` and `--color-warning`, nothing new.
- Every string in `text.ts`, both languages.
- Tap targets ≥ 44 px; reduced motion leaves only fades.

## When it's done

- Preview screenshots at 390 wide and 1920 wide in the PR.
- `python3 scripts/straightface_check.py` still prints `all good`; `npx tsc --noEmit` clean.

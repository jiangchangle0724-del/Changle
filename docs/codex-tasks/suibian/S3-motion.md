# S3 · Motion and feel

Branch `codex/suibian-s3-motion`, from the latest `origin/main` (S1 and S2 are in it). Read `README.md`
in this folder first: its "Always" rules apply. What each screen should feel like is in
`mock/NOTES.md`; the keyframes in the `<style>` of each `mock/*.dc.html` are the starting point
(they already use the tokens).

## What

The screens look right after S2; now they should feel like a party game at the table. Every tap
answers at once, the important ones with a little buzz, a round's countdown gets urgent at the end,
and the result is the one big moment: the room dims, the winner pops, the stamp comes down. Nothing
moves that doesn't mean something, nothing loops except the last ten seconds of a countdown, and
with reduced motion every move becomes a short fade.

## Files

Change only these, all in `tools/suibian/`: `src/client/styles.css`, `src/client/ui/*.tsx`, a new
`src/client/motion.ts` (the small helpers below), `README.md` (one paragraph on the motion and the
reduced-motion rule) and `tests/design.test.ts` (only to tighten it). No new packages: CSS
animations and transitions, and the Web Animations API (`element.animate`) where a move needs the
finger's position or a sequence. No GSAP.

## Rules

- **Timing comes from the tokens**, also inside keyframes and delays: `--dur-exit`, `--dur-enter`,
  `--dur-emphasis`, sums and multiples of them in `calc()`, and `--ease-out` / `--ease-pop`. The test
  from S1 rejects any `ms` or `s` written out in `styles.css`. In TypeScript, read a token with
  `getComputedStyle(document.documentElement).getPropertyValue("--dur-enter")` (one helper in
  `motion.ts`) rather than writing the number again. The only numbers written in TypeScript are the
  vibration patterns and the tie wheel's own schedule.
- **Only `transform`, `opacity` and `clip-path` move.** No animating width, height, top or margins.
- **A move plays when the thing happens, not on every render.** The room's state arrives again and
  again; an avatar, a card or a mark animates when it is new or when this phone just tapped it, never
  because the screen re-rendered. Keep what was already shown in a ref (ids seen, the previous phase),
  and start a move by adding a class (or a `data-anim` attribute) that comes off on `animationend`.
- **Reduced motion.** `tokens.css` already makes `--motion-shift` 0 and shortens `--dur-emphasis`.
  On top of that, one `@media (prefers-reduced-motion: reduce)` block turns everything that scales,
  turns, shakes, spins or bursts into a plain fade of `--dur-enter`, hides the sparks, and stops the
  countdown's tick. `motion.ts` has `reduced()` for the TypeScript side.
- **Haptics.** `buzz(pattern)` in `motion.ts` calls `navigator.vibrate` when it exists and does
  nothing otherwise (iPhones, desktops), inside a `try`. Short patterns only, as listed below.

## The moves

1. **Presses** (every `.press`, which S2 put on all buttons and button links): on `:active` it
   scales to 0.96 over `--dur-exit` with `--ease-out`; on release it comes back over `--dur-enter`
   with `--ease-pop`. Disabled buttons don't move.
2. **Screens.** When the phase changes (lobby, round 1, round 2, tie, result), the new screen's
   content rises in: opacity 0 to 1 and `translateY(var(--motion-shift))` to none over `--dur-enter`
   with `--ease-out`, its first six blocks one after another, each `calc(var(--dur-exit) / 4)`
   later than the one before. The top bar and the dock don't move.
3. **Lobby.** Someone new arrives: their avatar (`.member`) pops up from below (translateY by the
   shift and scale 0.8 to none over `--dur-emphasis` with `--ease-pop`) and its ring flashes the
   gel once. The people already there don't replay. The ready badge stamps in (scale 1.8 to 1 with
   `--ease-pop`) when that person's diet card comes in. On the host's phone, `buzz(10)` when someone
   joins.
4. **Round 1 chips.** Tap to 👍: the emoji jumps (scale 1.35 and turned `-8deg`, then back, over
   `--dur-emphasis` with `--ease-pop`), the mark stamps in, the mint ring and tint fade in over
   `--dur-enter`; `buzz(8)`. Tap to 🚫: the chip shakes sideways once (by a third of
   `--motion-shift`, over `--dur-enter`) while it dims; `buzz([6, 30, 6])`. Tap back to nothing: the
   mark and the dim fade out over `--dur-exit`. Only the chip you tapped moves. A group's tile
   does the same when a tap likes or refuses all of it. Opening a group and going back are a screen
   change (move 2) within the round.
5. **Countdown.** From 10 seconds left the pill (`.urgent`) is red and the number ticks every second
   (scale 1.18 and back over `--dur-emphasis`, restarted each second, for example with a `key` on the
   number); `buzz(15)` once at 10 seconds and at 3, 2 and 1. Under reduced motion it turns red but
   doesn't tick.
6. **Progress dots.** A dot that lights up pops (scale 1.4 and back with `--ease-pop`).
7. **Round 2 cards.** When the round starts, the first six cards rise in from below one after
   another, each `calc(var(--dur-exit) / 4)` later; the rest, and cards shown by 再看 N 家, just fade
   in. 想去: the amber fill spreads from the point where the finger touched (`element.animate` on a
   fill layer inside the button: `clip-path: circle(0 at x y)` to `circle(150% at x y)`, over
   `--dur-emphasis` with `--ease-out`), and the check mark draws itself (its path's
   `stroke-dashoffset` to 0 over `--dur-enter`, starting after `--dur-exit`); `buzz(10)`. Untick:
   the fill fades out over `--dur-exit`. 否决: the card dims over `--dur-enter` and the line through
   the name draws from left to right (a `scaleX` from 0 to 1 on a pseudo-element, origin left);
   `buzz([20, 40, 20])`. Undo reverses both. The count line in the dock (`picked`) bumps (scale 1.15
   and back) when its number changes.
8. **Tie wheel** (`Spinner`). Instead of names flickering at a steady rate, a wheel: the tied names
   pass through a window one at a time, fast at first and slower and slower, and the last one is the
   winner (`v.result.winner`), landing as the spin phase ends (`v.phaseEnds`, about 4.5 seconds after
   it starts). Each name slides up out of the window as the next slides in (transform only), with
   `buzz(5)` at each step. Work out the steps from the time left, so a phone that joins mid-spin
   still lands on time. Under reduced motion: no wheel, 打平了！转一下… and then the winner's name
   fades in.
9. **The result** (`.win`, `.stamp`), once when it appears (not again on re-renders, and a reload
   may play it again):
   - the room dims: a full-screen `--color-scrim` layer under the card fades in over
     `--dur-emphasis`, then fades back to a light dim, so the page stays readable;
   - the winner's card pops in, from scale 0.86 and `translateY(calc(var(--motion-shift) * 2))`,
     over `--dur-emphasis` with `--ease-pop`, starting after `--dur-exit`;
   - the stamp comes down at `calc(var(--dur-emphasis) + var(--dur-exit))`: from scale 2.2 and
     transparent to 0.94 over `--dur-enter` with `--ease-out` (that's the hit), then settles to 1
     over `--dur-enter` with `--ease-pop`, always turned `-8deg`. Use two animations so the hit has
     its own `animationend`, and `buzz([20, 40, 30])` on it;
   - twelve small sparks (amber, honey and mint gels, `aria-hidden`) burst out from behind the stamp
     right after the hit and fade, over `calc(var(--dur-emphasis) * 2)`;
   - the buttons and lines under the card rise in at `calc(var(--dur-emphasis) * 3)`.
   Under reduced motion all of it is one fade of `--dur-enter`, without the sparks.

## Done when

- The moves above play in Chrome and in Safari (WebKit) at 390px, and only when the thing happens.
- With reduced motion turned on (Playwright `reducedMotion: "reduce"`, or the system setting),
  nothing slides, shakes, spins, bursts or ticks.
- No animation runs while nothing is happening (check the result screen a few seconds after the
  reveal and round 1 before the last ten seconds).
- `npm run typecheck`, `npm test`, `npm run build` and `npx playwright test` pass. The browser tests
  wait for what they look for, so a screen that rises in is fine; if one still has to change, the PR
  says which line and why.

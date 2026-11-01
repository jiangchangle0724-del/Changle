---
name: changle
description: A night party. A dark room lit by colored stage gels; each game has its own gel, and the room turns that color when it is up.
colors:
  night: "#0e0c22"
  night-2: "#131030"
  dusk: "#181633"
  dusk-2: "#221f44"
  dusk-3: "#2c2955"
  line: "#35325a"
  line-soft: "rgba(181, 178, 220, 0.14)"
  moon: "#f5f4fd"
  haze: "#b6b4d0"
  fog: "#7f7c9d"
  gel-pink: "#ff5fa2"
  gel-coral: "#ff6b5e"
  gel-vermilion: "#ff8a6b"
  gel-tangerine: "#ff8c42"
  gel-amber: "#ffb82e"
  gel-lemon: "#f5df3b"
  gel-lime: "#b6e83a"
  gel-mint: "#4be38f"
  gel-jade: "#22d3a6"
  gel-aqua: "#2ed3d9"
  gel-cyan: "#31b9ff"
  gel-blue: "#5b9bff"
  gel-periwinkle: "#8c86ff"
  gel-violet: "#b072ff"
  gel-orchid: "#e765f0"
  gel-rose: "#ff9cc5"
  stop: "#ff4d6d"
  card-face: "#ffffff"
  card-red: "#e8364f"
typography:
  stamp:
    fontFamily: "Unbounded Variable, Unbounded, PingFang SC, Hiragino Sans GB, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(88px, 34vw, 156px)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.04em"
  display:
    fontFamily: "Unbounded Variable, Unbounded, PingFang SC, Hiragino Sans GB, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.02em"
  display-zh:
    fontFamily: "Unbounded Variable, Unbounded, PingFang SC, Hiragino Sans GB, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "34px"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "0"
  headline:
    fontFamily: "Unbounded Variable, Unbounded, PingFang SC, Hiragino Sans GB, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Unbounded Variable, Unbounded, PingFang SC, Hiragino Sans GB, Noto Sans SC, Noto Sans CJK SC, Microsoft YaHei, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Figtree Variable, Figtree, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  hint:
    fontFamily: "Figtree Variable, Figtree, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Figtree Variable, Figtree, -apple-system, PingFang SC, Hiragino Sans GB, Noto Sans SC, Noto Sans CJK SC, Source Han Sans SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.005em"
rounded:
  small: "10px"
  field: "14px"
  panel: "20px"
  tile: "24px"
  sheet: "28px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.moon}"
    textColor: "{colors.night}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "50px"
  button-primary-disabled:
    backgroundColor: "{colors.dusk-3}"
    textColor: "{colors.fog}"
    rounded: "{rounded.pill}"
    height: "50px"
  button-lg:
    rounded: "{rounded.pill}"
    padding: "0 26px"
    height: "60px"
  button-quiet:
    backgroundColor: "{colors.dusk-3}"
    textColor: "{colors.moon}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "50px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.moon}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "50px"
  button-go:
    backgroundColor: "{colors.gel-mint}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "50px"
  button-penalty:
    backgroundColor: "{colors.stop}"
    textColor: "{colors.card-face}"
    rounded: "{rounded.pill}"
    padding: "0 22px"
    height: "50px"
  button-moon:
    backgroundColor: "{colors.moon}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "0 26px"
    height: "60px"
  icon-button:
    textColor: "{colors.moon}"
    rounded: "{rounded.pill}"
    size: "44px"
  chip:
    backgroundColor: "{colors.dusk-2}"
    textColor: "{colors.moon}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  chip-selected:
    backgroundColor: "{colors.moon}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "40px"
  field:
    backgroundColor: "{colors.dusk}"
    textColor: "{colors.moon}"
    rounded: "{rounded.field}"
    padding: "0 6px 0 16px"
    height: "52px"
  segmented:
    backgroundColor: "{colors.dusk}"
    textColor: "{colors.haze}"
    rounded: "{rounded.pill}"
    padding: "4px"
  segmented-selected:
    backgroundColor: "{colors.moon}"
    textColor: "{colors.night}"
    rounded: "{rounded.pill}"
    height: "40px"
  lang-tab:
    backgroundColor: "{colors.dusk}"
    textColor: "{colors.haze}"
    rounded: "{rounded.pill}"
    height: "32px"
  panel:
    backgroundColor: "{colors.dusk-2}"
    textColor: "{colors.moon}"
    rounded: "{rounded.panel}"
  sheet:
    backgroundColor: "{colors.dusk}"
    textColor: "{colors.moon}"
    rounded: "{rounded.sheet}"
    padding: "8px 18px 18px"
  game-tile:
    backgroundColor: "{colors.gel-pink}"
    textColor: "{colors.night}"
    rounded: "{rounded.tile}"
    padding: "14px 14px 12px"
    height: "148px"
  playing-card:
    backgroundColor: "{colors.card-face}"
    textColor: "{colors.night}"
    rounded: "9px"
    width: "64px"
    height: "90px"
---

# Design System: changle

> **Moving to a shared system.** The values are being gathered into `src/styles/tokens.css`, with the rules in [docs/DESIGN.md](../docs/DESIGN.md), shared with /eat and the tools to come. Until that migration is done, this file describes what is live; anything new follows docs/DESIGN.md.

## Overview

**Creative North Star: "The Gel-Lit Room"**

The app is a dark room at a party, and the only color in it is light. The ground is a deep blue-violet night; surfaces are slightly lifted dusk tones; text is moonlight. Each of the sixteen games owns one stage gel, and when a game is up the room turns that color: a wash spills down from the top of the screen, the primary button glows in it, the timer arc draws in it, the active seat is ringed in it. Leave the game and the light crossfades to the next one. Nothing on screen is colored for decoration.

Density is low and the type is big because the phone is a prop passed around a dim table, read at arm's length, tapped with one thumb. Every screen is bilingual: titles show both languages at once, the reader's language leading large and the other riding beneath it smaller, and a 中 / EN toggle switches every string in place. Motion is GSAP throughout, settled and weighted for ordinary moves, and saved up for the penalty, which is the loudest thing the app ever does: the room flashes, one huge word slams down, a glass slides in and drains.

When a game brings its own physical objects, they render as themselves inside the room: Euchre's playing cards are white card stock with real suit marks, lit from above by the jade gel. 到此一游 brings a whole printed world (a round board, city posters, passport stamps, boarding passes, six characters): it plays at changle.ca/trip from its own code (`games/been-there` in the changle-ca repository), and its frame, from the top bar to the sheets, is this system, lit by its vermilion gel.

**Key Characteristics:**
- Night ground, moonlight text, one current gel per screen.
- Color always means "this game" or "this state" (go, stop, warn, your turn).
- Bilingual titles: both languages visible, the current one leads.
- One primary action per screen, pill-shaped, 50 to 60px tall.
- Settled GSAP motion; the penalty stamp is the single most animated moment.
- Flat tonal surfaces with hairline insets; glow only comes from light.

## Colors

A near-black violet room, three steps of lifted dusk, a moonlight text ramp, and sixteen saturated gels bright enough to carry night-colored text.

### Primary
- **The current gel** (runtime `--gel`, one of the sixteen below): set on the app frame from the game's registry entry, and on sheets, tiles, history rows and online screens that belong to a game. It fills the primary button, the selected chip, the game tile, the timer arc, the turn ring, "our team" scores. Off a game it defaults to Moonlight, with Night text (`--on-gel`).
- **The room light** (runtime `--light`): the same idea at room scale. `setLight()` tweens it over 0.9s (`power2.inOut`); it feeds the top-of-screen wash, focus rings on fields, the caret, text selection and link underlines. Non-game sections use fixed tones: party Violet, wish Amber, me Rose.

### Secondary (the gels)
The sixteen gels, in spectrum order as the game grid reads: **Hot Pink** (truth), **Coral** (rogue), **Vermilion** (trip, 到此一游's own ink), **Tangerine** (superlatives), **Amber** (king), **Lemon** (post-it), **Lime** (limbo), **Mint** (never have I ever), **Jade** (euchre), **Aqua** (dice), **Cyan** (freeze), **Cornflower Blue** (wheel), **Periwinkle** (undercover), **Violet** (tune), **Orchid** (punchline), **Rose** (draw). Fifteen of them (all but Vermilion), reordered, are the avatar palette: a letter avatar takes a gel hashed from the user's id.

### Tertiary (signals)
- **Go Mint** (`gel-mint`, as `--go`): safe outcomes, confirm, correct.
- **Stop Red** (`stop`): the penalty, timer under ten seconds, errors. White text on it.
- **Warn Amber** (`gel-amber`, as `--warn`): caution states.

### Neutral
- **Night** (`night`): the room, page background, text on any gel.
- **Night Deep** (`night-2`): rings that cut an avatar out from a lit table; the far edge of the Euchre table.
- **Dusk** (`dusk`): sheets, fields, segmented and language tracks.
- **Dusk Raised** (`dusk-2`): panels, chips, score bars.
- **Dusk High** (`dusk-3`): quiet buttons, disabled primary.
- **Line** / **Line Soft** (`line`, `line-soft`): ghost button and field strokes; hairline insets on panels and chips; dividers.
- **Moonlight** (`moon`): primary text; selected segment; the penalty's Continue button.
- **Haze** (`haze`): secondary text, the second language in a bilingual title, hints.
- **Fog** (`fog`): placeholders, muted counts, disabled labels.
- **Card Face** / **Card Red** (`card-face`, `card-red`): playing-card stock and red suits. Euchre only; ink is Night.

### Named Rules
**The Color Is Light Rule.** Every hue on screen comes from the current gel, the room light, or a signal. If a color can't answer "which game, or which state?", it does not belong.

**The Bright Gel Rule.** Gels carry Night text, never white. A gel faded or desaturated reads as mud on the night ground; a resting primary goes to Dusk High with Fog text instead of dimming its gel.

**The Red Is The Penalty Rule.** Stop Red appears on the penalty stamp, the button that sends someone to it, the last ten seconds of a timer, and errors. Nowhere else.

## Typography

**Display Font:** Unbounded Variable (Chinese falls back to PingFang SC / Hiragino Sans GB / Noto Sans SC / Microsoft YaHei)
**Body Font:** Figtree Variable (same CJK fallbacks, then system-ui)

**Character:** Unbounded is wide, round and loud, a club-flyer face for titles, scores, codes and the stamp. Figtree is friendly and plain for everything you read. Both are self-hosted variable fonts; Chinese rides the device's own CJK face in both roles.

### Hierarchy
- **Stamp** (800, clamp(88px, 34vw, 156px), 0.95, -0.04em): the penalty word only. The English word drops to clamp(64px, 22vw, 108px); a custom penalty uses Figtree 800 at clamp(32px, 9vw, 46px).
- **Display** (700, 34px, 1.08, -0.02em): large bilingual titles. When Chinese leads, weight goes to 800 and tracking to 0.
- **Headline** (700, 24px, 1.1): medium bilingual titles, scores (25px in Euchre), prompt text (23px at 800).
- **Title** (700, 21px): sheet titles, notice titles. Top-bar titles are the small bilingual pair (16px over 12px).
- **Body** (400, 16px, 1.5): running text. Rules text is 15.5px at 1.6 in Haze with Moonlight emphasis.
- **Hint** (400, 14px, 1.45): Haze secondary lines.
- **Label** (700, 16px, 0.005em): buttons (18px large, 14.5px small); chips at 15px/600; field labels 13.5px/600 Haze.

### Named Rules
**The Both Languages Rule.** A title shows Chinese and English together. The reader's language leads in the display face; the other follows in Haze at roughly half size (16/12, 24/14, 34/16). Body strings switch with the toggle.

**The Tabular Count Rule.** Anything that ticks (seconds, scores, counts) uses tabular figures.

## Layout

Portrait phone, one column. The app frame is centered with a 560px max width and a 16px side gutter, padded by the safe-area insets. Each screen is a top bar (a three-column grid: 96px sides, back on the left, help and extras on the right, the small bilingual title centered), then the stage, then the actions toward the bottom where the thumb is. Menus, players, settings and rules come up as bottom sheets, never as new pages.

The home grid is three columns of gel tiles in spectrum order (two columns below 370px wide), so the whole screen reads as one sweep of stage light. Spacing runs on small steps: 8px is the default gap, with 4, 6, 10, 12, 14 and 16 around it; 24px separates blocks. Touch targets are 44px minimum, 50px for buttons, 60px for the main move on a stage.

## Elevation & Depth

Surfaces are flat tonal layers: Night, then Dusk, then Dusk Raised, then Dusk High, each edged with a 1px inset hairline (`line-soft`) and a faint top highlight rather than a drop shadow. Real depth is reserved for things that float over the room (sheets, cards) and for light itself: glows are colored by the gel, never neutral.

### Shadow Vocabulary
- **Gel glow** (`box-shadow: 0 10px 30px -12px color-mix(in oklab, var(--gel) 70%, transparent)`): under the primary and penalty buttons, in their own color.
- **Lit tile** (`box-shadow: 0 0 0 3px var(--moon), 0 18px 50px -12px var(--gel)`): the tile currently under the light.
- **Turn ring** (`box-shadow: 0 0 0 3px var(--night-2), 0 0 0 5.5px var(--gel), 0 0 24px 4px color-mix(in oklab, var(--gel) 50%, transparent)`): whose turn it is.
- **Panel hairline** (`box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px var(--line-soft)`): panels and chips at rest.
- **Sheet** (`box-shadow: 0 -20px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`) over a 6px blurred Night backdrop.
- **Card drop** (`box-shadow: inset 0 0 0 1px rgba(14,12,34,0.08), 0 12px 22px -12px rgba(0,0,0,0.75)`): playing cards on the table.

### Named Rules
**The Light Casts The Glow Rule.** A glow is always the gel or signal color of the thing that emits it. Neutral glows, and glows on things that are not lit, do not exist here.

## Shapes

Everything you press is a pill (999px): buttons, chips, segmented controls, the language toggle, icon buttons. Containers are generously rounded: tiles 24px, panels 20px, fields 14px, small insets 10px, sheets 28px on the top corners only. Faces, dice wells and timers are circles. Playing cards are the one tight corner (9px, 3px for card backs in a fan) because they are cards.

## Components

### Buttons
Big, round and lit; pressing one shrinks it to 96.5% on a 0.16s settle.
- **Shape:** full pill (999px), 50px tall; large 60px, small 40px.
- **Primary:** the current gel with Night text and a gel glow underneath. One per screen. Disabled goes to Dusk High with Fog text at full opacity.
- **Quiet:** Dusk High with Moonlight text, for secondary moves.
- **Ghost:** transparent with a 1.5px Line inset; hover raises the stroke to Fog.
- **Go / Penalty:** Mint with Night text for safe or confirm; Stop Red with white text and a red glow for the move that sends someone to the penalty.
- **Moonlight:** solid Moonlight, Night text; the Continue under the penalty stamp, where the gel is out of the picture.
- **Icon button:** 44px round, Moonlight icon (lucide), Line Soft wash on hover, 92% on press.
- **Focus:** a 2px Moonlight outline at 3px offset everywhere.

### Chips
- **Style:** Dusk Raised pill, 40px tall (32px small), 15px/600 Moonlight, Line Soft hairline.
- **State:** selected or pressed fills with the gel and Night text, hairline dropped. Out players fade to 40% and strike through. New chips pop in on the overshoot ease.

### Cards / Containers
- **Corner Style:** panels 20px; game prompt cards 22px.
- **Background:** Dusk Raised; inside a game a panel may carry a gel corner wash (about 22% gel) and a gel-tinted hairline.
- **Shadow Strategy:** hairline insets only (see Panel hairline).
- **Internal Padding:** 14 to 18px.

### Inputs / Fields
- **Style:** Dusk well, 52px tall, 14px corners, 1.5px Line inset; 16px text so phones don't zoom; Fog placeholders.
- **Focus:** the inset becomes 2px of the room light.
- **Table codes:** set in the display face, uppercase with wide tracking (0.12 to 0.3em) because they are spoken aloud letter by letter.

### Navigation
- **Top bar:** back chevron, centered small bilingual title, help icon; no fill.
- **Segmented control:** Dusk track with a 4px inset, 40px pill segments in Haze 14.5px/700; the selected segment is solid Moonlight with Night text.
- **Language toggle:** 中 / EN in a Dusk track, 32px segments, selected in Moonlight.
- **Sheet:** Dusk, 28px top corners, grab handle, rises on `expo.out` over 0.55s, swipes down by its handle, exits on `power2.in` over 0.28s. A sheet that belongs to a game takes that game's gel.

### Game Tile
A full block of gel, 24px corners, 148px tall, Night text, the game's lucide icon. The tile under the light lifts 2px with a Moonlight ring and a gel bloom. Random pick runs the light across the tiles in a decelerating sweep and lands on one.

### Penalty Stamp
A full-screen Night layer (97%) with a red bloom, over a 14px blur. Names drop in, the screen flashes Stop Red and fades, the word (喝 / Drink) slams from 2.6x scale and -16 degrees to -5 degrees on `back.out(2.2)` then wobbles to -3 on an elastic, the stage shakes sideways, the glass slides in from the right and its level drains to the call (a sip, two, finish). The stamp word carries a double glow in its own color. A safe call swaps red for Mint and drops the shake.

### Timer Arc
A ring that empties like a glass: a 6px faint track and a 7px round-capped arc in the gel, seconds in the middle in tabular figures. Under ten seconds the arc turns Stop Red and the last ten seconds knock.

### Euchre Table
A 34px-rounded table lit from above by the gel (a 24% gel pool over a dusk-to-night radial), seats in a cross around a 156px center. White playing cards (64 by 90px, 9px corners, Night ink, Card Red for hearts and diamonds), card backs as a gel diagonal stripe with a white rim. Trump and calls show as white card-stock pills; your team's marks fill with the gel.

## Do's and Don'ts

### Do:
- **Do** take every hue from the current gel (`--gel`), the room light (`--light`), or a signal (`--go`, `--stop`, `--warn`).
- **Do** set `--gel` on any container that belongs to a game, and call `setLight()` when a screen changes, so the room crossfades.
- **Do** put Night text on gels and Moonlight text on dusk surfaces.
- **Do** show every title in both languages, the reader's language leading in the display face.
- **Do** keep one primary (gel) button per screen, 50px or taller, near the bottom.
- **Do** animate with GSAP on the house `settle` ease (`0.16, 1, 0.3, 1`, 0.5s default) and check `reduced()` before every tween, jumping straight to the end state when it is true.
- **Do** keep the penalty stamp the most animated moment on any screen; everything else settles.
- **Do** use lucide icons or authored SVG; playing-card suit marks are the cards' own text.

### Don't:
- **Don't** color anything for decoration: no off-palette accents, no second accent beside the gel.
- **Don't** dim or desaturate a gel for a disabled state; use Dusk High with Fog text.
- **Don't** use Stop Red outside the penalty, its trigger button, a timer's last ten seconds, and errors.
- **Don't** add neutral drop shadows or glows; depth is tonal layering plus light the gel casts.
- **Don't** put uppercase tracked labels or eyebrows above headings; uppercase tracking is for table codes only.
- **Don't** use emoji as icons.

# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
delegated: Vite + React + TypeScript, GSAP 3 (with CustomEase) for orchestrated motion and `motion` for a few springs, lucide-react icons, Web Audio for every sound and backing track. Static site on Cloudflare Pages (changle.ca); a Cloudflare Worker (`changle-rooms`, rooms.changle.ca) with Durable Objects runs online tables (one object per table, game rules in `src/shared/engine`, shared with the client) and a Hub object (SQLite) for accounts, friends, chat and the wishlist. Email sign-in codes are sent with Resend. The owner does not code and has asked Claude to make implementation choices; deploys run from a zip with a Windows `deploy.cmd`.

## Users
Groups of 2–15 friends at a house party, bar table, or hot-pot dinner, in Greater Vancouver and across Chinese- and English-speaking friend circles. Either one phone is passed around the table, or everyone opens the same table on their own phone (in the room, or apart on a video call). People are standing, drinking, laughing, in dim light, with wet hands and short attention. Mixed-language groups: some players read Chinese, some English, some both.

Owner: Steve Jiang (蒋常乐), who hosts these nights and runs the phone.

## Product Purpose
A bilingual (中文 / English) party companion called changle. It replaces the deck of cards, the dice, the scraps of paper and the "wait, what are the rules again" moment with a phone that deals the card, spins the wheel, keeps the timer, plays the music, picks the victim and announces the penalty. A second tab holds everyday tools for a Vancouver life between two countries: live CAD/CNY/USD/HKD conversion, a linked world clock, and unit-price conversion. Success: a table of strangers is laughing within 60 seconds of the host tapping a game, and nobody has to explain rules twice.

## Positioning
Chinese drinking-game canon (流氓十三张, 国王游戏, 谁是卧底, 真心话大冒险) and North American party staples (Euchre, Superlatives, Quiplash-style Punchline, Freeze Dance, Limbo, Name That Tune, Post-it Note) played straight, with faithful rules and a real rendering in both languages. Every game works on one shared phone and online with every phone. Every round ends in a penalty moment the app announces; here the penalty is the ritual.

## Operating Context
- Portrait phone is the primary frame; large tap targets, high contrast for dim rooms.
- One-phone mode: players are entered once (names) and shared by all games; private moments (secret words, votes, notes) use a pass-the-phone curtain.
- Online mode: a four-letter table code or QR; each phone sees only what it should; the host's phone drives; reactions, drink confirmations and a drinking buddy across phones.
- A language toggle (中 / EN) switches every string, including game content, instantly.
- Accounts are optional (email code). Signed-in players get a photo, profile, game history, friends and chat. Nothing in a game requires signing in.
- Penalty is drinking by default; the host can set a custom penalty (push-ups, sing, pay the bill).

## Capabilities and Constraints
Sixteen games, each one-phone and online: Truth or Dare, Rogue Thirteen, Superlatives, King's Game, Drama Queens (act a scripted scene; the audience unmasks the culprit and rates the acting; players can write scenes for their table and send them to a public library the owner approves), Post-it Note, Limbo, Never Have I Ever / Most Likely To, Euchre (bots fill empty seats; one-phone is you and three bots), Seven Eight Nine, Freeze Dance, Wheel of Fate, Undercover, Name That Tune, Punchline, Draw & Guess. Movement games (Limbo, Freeze Dance) read the phone's motion sensors when allowed and fall back to a human judge. Limbo's blind lean (hit a target angle without seeing your own; furthest off drinks) needs the sensor, so phones without one watch that game; classic Limbo stays playable without it, and so do its three variants, hold steady (hold dead still at the bar, a longer hold each bar), moving bar (the bar floats up and down on the same path on every phone; lose it for over a second and you're out) and tilt through (lean back and tilt to a random side), and party mode (a random one of those or classic each bar), all judged by the host or by honesty without a sensor.

打碟 · DJ Booth, at changle.ca/dj (on the home list since Nov 1; its card sends a computer there). A TV or computer is the speaker and the dance floor; phones join the table and every phone is a beginner deck: everyone DJs at once (a crossfader between two decks, four effect pads, a build-up the table taps together and DROP on the count, a pick for the next of 12 styles), and all of it lands on the beat, so nothing a beginner presses can go wrong. The host moves the night through warm-up, build, peak and wind-down; every set ends after 4 hours. The music is a stand-in recorded on the speaker with the site's own instruments, every style at one tempo and key; at the owner's own tables Google's Lyria RealTime plays instead, a private test while the model is experimental (plan: `docs/dj-booth.md`). The only game where the phones stay silent and one device makes all the sound.

藏在人群里 · Hide in the Crowd, at changle.ca/hide (its own Worker, `games/hide-crowd`), started from a table like 到此一游. Each player steers one person in a crowd of 18 passers-by the computer walks around, from their own phone held sideways: walk like them and nobody can tell it's you; spot a rival and punch (a hit scores, a passer-by stuns you, a tagged player gets up in another body). First to 3 tags, or the most after 75 seconds; whoever was spotted most takes the penalty (the host can switch it off). Its big screen shows the whole crowd in 3D and never marks who is human. 2 to 8 players; one phone is a practice round against three computer rivals. The arena backdrops and the crowd are AI-made (credited in the game).

Also on the home screen: a wishlist where anyone can suggest games and features, and a tip jar that shows Steve's Interac e-Transfer address (no payment processing in the app).

一本正经 · Straight Face (in the works, 2026-11-04; one phone only so far, at changle.ca/g/straight-face/play, off the board until the owner has played it): a judge, an obscure word, one honest player who read the real meaning and bluffers who make one up; the judge questions, tags one suspect and names the honest one. Our own name, rules and card bank in the Call My Bluff / Balderdash family. Plan: `docs/straight-face.md`.

最后一张 · Last Card (in the works, 2026-11-05; online only, hidden from the board until the owner has played it: changle.ca/g/last-card/play opens a table for it): the shedding card game everyone already knows, under our own name and with card faces of our own. 108 cards in four stage-gel colours, each colour with its own shape (a triangle, a circle, a square, a star) so they read apart without colour; skips, reverses, +2s, wilds and +4 wilds; call last card at one card or draw 2 if someone catches you first. The host picks stacking (+2 on +2, +4 on +4) and how many rounds win the match. Penalties: a sip for taking a +2, two for a +4 or a stack of four or more, a sip for being caught, and at each round's end a sip for whoever holds the most cards. 2 to 10 players; each phone sees only its own hand, and the big screen shows the table, never a hand.

Not planned: UNO (Mattel trademark).

Terminology: 惩罚 / penalty; 喝一口 / sip; 喝两口 / two sips; 喝一杯 / finish the drink; 指定 / assign; 尤克 / euchred.

## Brand Commitments
- Name: changle (from the owner's name 常乐, "always happy"); domain changle.ca. Chinese is the first language of the canon; English must read as native, not translated, and the interface should feel equally at home in both.
- Owner's stated bar: "很多高级感的动画和交互体验": premium-feeling motion and interaction throughout. This is binding.
- Visual world: a night party, a dark room lit by colored stage gels; each game has its own gel.
- Adults only; a light "drink responsibly" note is welcome, never preachy.

## Evidence on Hand
- 流氓十三张 rules sourced from a published rule write-up (diyifanwen.com) and matched against other listings; 七八九 rules from a Sina article on party drinking games; Euchre follows standard North American rules (stick the dealer, going alone).
- No logo, no photography. All game content (prompts, word banks, commands, melodies) is authored originally in both languages; songs in Name That Tune are public-domain or folk melodies played as notes.

## Product Principles
1. The phone is a prop at the table, not a screen to stare at: big, legible, one action per screen, playable with one thumb while the other hand holds a glass.
2. Rules are shown when needed and never block the fun; the app explains by doing.
3. Every round ends in a penalty moment, and that moment is the most animated thing on the screen.
4. Both languages are first-class: a mixed table can switch mid-game without losing state.
5. Playing never requires signing in or downloading anything; an account only adds a face, a history and friends.
6. Online, each phone sees only what its player should see, and the table survives phones locking, dropping off and coming back.

## Accessibility & Inclusion
Dim-room contrast, 44px+ touch targets, reduced-motion respected, no color-only meaning, every game playable without sound and without motion sensors.

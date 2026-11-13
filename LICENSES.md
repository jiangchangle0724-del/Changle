# Where every sound comes from (打碟 · DJ Booth), and where 一本正经's words come from

The plan's 版权台账 (`docs/dj-booth.md`, "老手会多做"): every sound the booth plays, where it comes
from and on what terms. Update it with every new source. Last checked: 2026-11-05.

| Sound | Where it comes from | Terms | Status |
| --- | --- | --- | --- |
| The stand-in DJ (试音版 DJ): 12 styles, its songs and remixes | Written as code (`site/src/party/dj/fake/`) and recorded in the listener's browser by the site's own instruments (`site/src/lib/music.ts`). No samples, no recordings. | The site's own work. | Live |
| The DJ's effects: the pads (the air horn, the record's crackle, the bass drop, the reverse cymbal, the whistle and the rest), the mixer, the build-up, the drop | Made in the browser (`speaker/fx.ts`, `speaker/club.ts`, `speaker/player.worklet.js`, `speaker/mixer.ts`). No samples. | The site's own work. | Live |
| Lyria RealTime (A2) | Google's generated music, through the Gemini API and the rooms server's relay (the key stays in Cloudflare). Every stream carries Google's SynthID watermark. | Gemini API Terms of Service and its Additional Terms, and Google's Generative AI Prohibited Use Policy. The plan's day-one check (commercial use, price) is still open: read them before Lyria plays for anyone but the owner. | The owner's own tables only (a private test) |
| A song asked for, the whole song | YouTube's own embedded player on the big screen (youtube-nocookie.com), playing the video a phone found: a pasted link (its title from YouTube's oEmbed) or a search (the YouTube Data API, with the owner's `YOUTUBE_API_KEY` in Cloudflare). Never downloaded, cached or mixed: the DJ gives way while it plays. One player all night (`party/dj/tube.ts`): while a song is up next it waits in sight in a corner of the TV, played muted for a moment to load its start and held at 0:00 (an ad YouTube shows first plays out there, muted, in sight); from its drop's bar it plays big in the middle. Between songs it's out of sight, paused, never playing. | YouTube's Terms of Service, its API Services Terms and Developer Policies: embedding through the IFrame player is allowed; the player is in sight whenever it plays (no player out of sight, III.I.09), plays only, its ads, links and branding untouched, and the search shows only videos that allow embedding. The corner it waits in is 440 px wide on the 1600 by 900 stage (its video about 410 by 230); a phone playing the speaker shrinks the whole stage, the player with it. | Live (since Nov 2; ready in a corner and on the drop's bar since Nov 5) |
| (before: Apple's 30-second previews) | Removed on Nov 2. Apple's Promo Content terms for the Search API ([performance-partners.apple.com/search-api](https://performance-partners.apple.com/search-api)) keep previews to promoting the song ("not for entertainment purposes", streamed only, with a store badge and "provided courtesy of iTunes"); mixing them into the set went past that. | | Never went live |
| The host's own songs (我的歌) | Files on the host's own computer or phone. Played in the host's own browser; sent from the host's phone to the big screen in pieces through the rooms server, which passes them on and keeps nothing (`shared/dj/songwire.ts`, `worker/index.ts`). | The host's: like playing music from their own phone at their own party. The site never stores, lists or shares them. | Live (from the phone: PR #113) |
| The song list | Titles, artists and Apple's ids and preview addresses (`site/src/data/songs.ts`). Names and links, no audio. | Facts and links. | Live |
| The coach in 3D (跟着跳), and the dancers on the floor | "Robot Expressive" by Tomás Laulhé (Quaternius), modified by Don McCurdy, as in the three.js examples (`site/public/models/robot.glb`, its own dance, wave, punch, jump and other animations; on the floor each player's copy is in their own colour). Not a sound, listed with the booth's other outside pieces. | CC0 1.0 (public domain). | Coach live (PR #129, Nov 5); the floor in its own PR (Nov 11) |
| 报幕 (the big screen saying who a song is from) | The device's own voice (the browser's Web Speech API). | The device's. Nothing is generated or stored by the site. | Live (Nov 2) |

## Not used

* **Commercial recordings downloaded by the site**: refused. The plan's line ("商业歌曲的 MP3 不能在网站上存、播、改"), and the 2026-11-02 decision against the site downloading songs itself. On Nov 2 Steve asked for popular nightclub remixes to be downloaded so the table can drop into them: declined for the same reason. The legal routes are the host's own songs and the stand-in's own tracks.
* **Name That Tune (猜歌)**, outside the booth, plays Apple's 30-second previews as a quiz: the same Promo Content terms apply to it. Worth the owner's look.
* **Mixamo**: not built. The plan's 3D dancers used Mixamo's free characters and motion-captured dances under Adobe's terms; the coach is the CC0 robot above instead (Codex's card C2 superseded, Nov 5).

## How to check it

* No interface stores audio on the site: `grep -rn "R2\|\.put(" site/worker` finds only the room's state (the host's songs by name, never their sound) and two small caches (exchange rates, the site's status). The only audio that passes through the rooms server is the host's phone to big screen relay above.
* Every new sound source gets a row here in the same change that adds it.

# 一本正经 · In All Seriousness: the card bank

The game is in the family of Call My Bluff (BBC, 1965), Balderdash (1984) and 瞎掰王 / 9UPPER. A
game mechanic is not protected; names, card texts and art are. So (2026-11-02, the plan):

* The name, the rules' wording, every card and every picture are the site's own. Nothing is taken
  from 瞎掰王 / 9UPPER: not a term, not a definition, not a seed. `grep -rn "瞎掰王\|9UPPER" site/src`
  finds nothing but this note's neighbours.
* Each card's `definition` and `funFact` state facts found on the page named in its `source`
  (Wikipedia, Wiktionary, Oxford's word-of-the-year pages, or `editorial` when checked by hand) in
  the site's own words. A fact is not copyrightable; a sentence is, so no sentence is copied or
  lightly reworded from a source, and the card bank is not a derivative of Wikipedia's text (CC
  BY-SA). The source link is a citation, not a licence.
* The card bank lives in `site/src/data/straightface.ts`; the rules that keep it this way are
  enforced by `site/src/shared/straightface/cards.ts` and `docs/codex-tasks/straightface/C1-cards.md`.
* The pictures (pack icons, the three parts, the room behind the game, in
  `site/src/party/straightface/art/`) are **AI-made**: drawn with ChatGPT's image generation (OpenAI)
  in Steve's account on 2026-11-05, from prompts that describe only what to draw, with no other game's
  name or picture as a reference. OpenAI's terms assign the output to the user. Every prompt and file
  is listed in `art/README.md`.
* The sounds are the site's own synthesised ones (`site/src/lib/sfx.ts`, played through
  `party/straightface/sounds.ts`): no recordings, nothing to license.

# 约时间 · When Works: the pictures

The four pictures in `tools/when/src/client/art/` are **AI-made**, drawn with OpenAI's built-in
image generation by Codex on 2026-11-13. The prompts describe only what to draw, with no other
product's name or picture as a reference. The prompts' main points are recorded in
`tools/when/src/client/art/README.md`.

`tools/when/src/client/art/` 的四张图片由 Codex 于 2026-11-13 使用 OpenAI 内置图片生成工具绘制，
属于 **AI 生成图片**。提示词只描述要画的东西，不使用其他产品的名称或图片作参考；提示词要点
记录在 `tools/when/src/client/art/README.md`。

# 打碟 · DJ Booth: two skills for the assistant (not the site)

Instructions an AI assistant reads while it works on the booth's sound (Nov 5; Steve asked for DJ and
music skills to be found and put in). They sit in `site/src/party/dj/.claude/skills/`, each with its
own licence file beside it, copied as published with nothing changed. The site never loads them and
no player sees them.

| Skill | Where it's from | Terms |
|---|---|---|
| `audio-design`: buses, ducking, adaptive music, varied repeats, beat sync | [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills), `skills/disciplines/audio-design` (commit `19d93f9`, Oct 28 2026) | Apache License 2.0, © 2026 Abhishek Barali and the awesome-gamedev-agent-skills contributors |
| `ui-sound-design`: sounds made with Web Audio, a rulebook, recipes and a sound analyser | [dannyjpwilliams/ui-sound-design-skill](https://github.com/dannyjpwilliams/ui-sound-design-skill), `skills/ui-sound-design` (commit `6cb4be4`, Apr 8 2026) | MIT, © 2026 Danny Williams |

* The analyser (`ui-sound-design/tools/analyze-sound.mjs`) runs on the assistant's own computer only,
  on a sound file it's given, and calls `ffmpeg` for anything but a WAV; its preview page
  (`assets/sound-preview.html`) loads Google's fonts when opened. Neither is part of the site.

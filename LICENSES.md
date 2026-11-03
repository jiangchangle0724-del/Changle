# Where every sound comes from (打碟 · DJ Booth)

The plan's 版权台账 (`docs/dj-booth.md`, "老手会多做"): every sound the booth plays, where it comes
from and on what terms. Update it with every new source. Last checked: 2026-11-02.

| Sound | Where it comes from | Terms | Status |
| --- | --- | --- | --- |
| The stand-in DJ (试音版 DJ): 12 styles, its songs and remixes | Written as code (`site/src/party/dj/fake/`) and recorded in the listener's browser by the site's own instruments (`site/src/lib/music.ts`). No samples, no recordings. | The site's own work. | Live |
| The DJ's effects: the pads (the air horn, the record's crackle, the bass drop, the reverse cymbal, the whistle and the rest), the mixer, the build-up, the drop | Made in the browser (`speaker/fx.ts`, `speaker/club.ts`, `speaker/player.worklet.js`, `speaker/mixer.ts`). No samples. | The site's own work. | Live |
| Lyria RealTime (A2) | Google's generated music, through the Gemini API and the rooms server's relay (the key stays in Cloudflare). Every stream carries Google's SynthID watermark. | Gemini API Terms of Service and its Additional Terms, and Google's Generative AI Prohibited Use Policy. The plan's day-one check (commercial use, price) is still open: read them before Lyria plays for anyone but the owner. | The owner's own tables only (a private test) |
| A song asked for, 30 seconds of the song itself (PR #113) | Apple's 30-second preview, found with the iTunes Search API and fetched by the big screen. | Apple's Promo Content terms for the Search API ([performance-partners.apple.com/search-api](https://performance-partners.apple.com/search-api)): previews only to promote the song, "not for entertainment purposes" or for "independent entertainment value apart from its promotional purpose", next to a store badge that links to buying it, credited "provided courtesy of iTunes", streamed only (not downloaded, saved or cached). Mixing a preview into the DJ's set goes past these terms. **The owner decides before #113 goes live**: drop the clip (the remix alone), or keep it at his own risk. | Not live |
| The host's own songs (我的歌) | Files on the host's own computer or phone. Played in the host's own browser; sent from the host's phone to the big screen in pieces through the rooms server, which passes them on and keeps nothing (`shared/dj/songwire.ts`, `worker/index.ts`). | The host's: like playing music from their own phone at their own party. The site never stores, lists or shares them. | Live (from the phone: PR #113) |
| The song list | Titles, artists and Apple's ids and preview addresses (`site/src/data/songs.ts`). Names and links, no audio. | Facts and links. | Live |
| 报幕 (the big screen saying who a song is from) | The device's own voice (the browser's Web Speech API). | The device's. Nothing is generated or stored by the site. | With this change |

## Not used

* **Commercial recordings downloaded by the site**: refused. The plan's line ("商业歌曲的 MP3 不能在网站上存、播、改"), and the 2026-11-02 decision against the site downloading songs itself. On Nov 2 Steve asked for popular nightclub remixes to be downloaded so the table can drop into them: declined for the same reason. The legal routes are the host's own songs and the stand-in's own tracks.
* **YouTube**: not built. The plan's route for whole real songs is YouTube's embedded player (play only, never download), with a YouTube Data API key the owner has to create.
* **Mixamo**: not built. The plan's 3D dancers use Mixamo's free characters and motion-captured dances under Adobe's terms.

## How to check it

* No interface stores audio on the site: `grep -rn "R2\|\.put(" site/worker` finds only the room's state (the host's songs by name, never their sound) and two small caches (exchange rates, the site's status). The only audio that passes through the rooms server is the host's phone to big screen relay above.
* Every new sound source gets a row here in the same change that adds it.

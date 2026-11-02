/**
 * 打碟 · DJ Booth: a song asked for by name, and the style its remix is made in (Steve's ask on
 * Nov 1: "players type the song they want, and it's remixed into the next track"). The booth can't
 * play the song itself (it's someone's recording, and a web page can't mix one in on the beat), so
 * the DJ makes the next track in the song's style, named for it on the big screen.
 *
 * The style comes from what the site's song list says about the song (its language and kinds, when
 * the player picked it from the suggestions) and from words in its name (a genre, an artist, the
 * script it's written in). The room works it out when the song is asked for. Pure: shared by the
 * room, the phone and the checks.
 */
import { LANGS } from "../songs";
import type { StyleId } from "./types";

/** What the song list says about a song (src/shared/songs.ts: LANGS keys, CAT_BIT bits). */
export type SongHint = { lang: "zh" | "en" | "yue" | "ko" | "ja" | "vi" | "world" | "other"; cats: number };

/** A song list row's language and kinds, as styleForRequest reads them. */
export const hintOf = (s: { l: number; k: number }): SongHint => ({ lang: LANGS[s.l]?.key ?? "other", cats: s.k });

/** Words that name a style outright: a genre, an artist, a song everyone knows the style of. */
const WORDS: [StyleId, RegExp][] = [
  ["latin", /reggaet|latin|salsa|bachata|cumbia|despacito|bad bunny|j balvin|daddy yankee|shakira|karol g|ozuna|maluma|rosal[ií]a|拉丁/i],
  ["techno", /techno|铁克诺|科技舞曲/i],
  ["trance", /trance|迷幻|tiesto|tiësto|armin/i],
  ["bass", /dubstep|skrillex|bassnectar|低音炮|重低音/i],
  ["dnb", /drum ?(and|&|n) ?bass|\bdnb\b|jungle|鼓打贝斯|鼓打/i],
  ["hiphop", /hip ?hop|\brap\b|trap|drake|kendrick|travis scott|kanye|eminem|jay-?z|nicki|cardi|post malone|说唱|嘻哈/i],
  ["rnb", /r ?& ?b|\brnb\b|the weeknd|sza|beyonc|usher|bruno mars|节奏布鲁斯/i],
  ["afro", /afro|amapiano|burna|wizkid|davido|tems|rema|非洲/i],
  ["kpop", /k-?pop|bts|blackpink|twice|newjeans|aespa|stray kids|seventeen|itzy|ive\b|le ?sserafim|bigbang|psy|gangnam|韩流|韩国/i],
  ["cpop", /c-?pop|华语|中文|国语|粤语|周杰伦|林俊杰|邓紫棋|陈奕迅|五月天|蔡依林|薛之谦|王菲|张学友|周深|李荣浩|毛不易|告五人|jay chou|jj lin|g\.?e\.?m/i],
  ["bhangra", /bhangra|punjabi|bollywood|diljit|ap dhillon|sidhu|旁遮普|宝莱坞|印度/i],
  ["house", /house|disco|\bedm\b|avicii|calvin harris|david guetta|swedish house|浩室|迪斯科/i],
];

/** The style a song's remix is made in. */
export function styleForRequest(text: string, song?: SongHint | null): StyleId {
  for (const [style, re] of WORDS) if (re.test(text)) return style;
  if (song) {
    if (song.lang === "ko") return "kpop";
    if (song.lang === "ja") return "kpop";
    if (song.lang === "zh" || song.lang === "yue" || song.lang === "vi") return "cpop";
    // English and the rest: by the song's kind (rap, R&B, dance, rock …)
    if (song.cats & 16) return "hiphop";
    if (song.cats & 64) return "rnb";
    if (song.cats & 4) return "dnb";
    if (song.cats & 128) return "trance";
    return "house";
  }
  // the script it's written in
  if (/[가-힯]/.test(text)) return "kpop";
  if (/[぀-ヿ]/.test(text)) return "kpop";
  if (/[一-鿿]/.test(text)) return "cpop";
  if (/[ऀ-੿]/.test(text)) return "bhangra";
  if (/[ñáéíóú¿¡]/i.test(text)) return "latin";
  return "house";
}

/** The highest track number (any whole number from 1 to this is a track: tracks.ts). */
export const TRACK_MAX = 2147483646;

/** A song asked for by name: the stand-in's track for its remix (the same words, the same remix). */
export function trackFor(text: string): number {
  let h = 2166136261;
  for (const ch of text.trim().toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % TRACK_MAX) + 1;
}

// Which local hit the room hears now, and on which device (the player is music.ts; the screens are
// Local.tsx). A team's first landing in a city plays the city's field recording (Touchdown.tsx); a
// landing in a city already in its passport plays a well-known song from that city's country, from just
// after the stamp until the team's turn ends (or it moves on: doubles, a card), then fades out.
//
// One device plays it, so a room never hears the same song from several phones a little out of step,
// like an echo: the big screen when there is one (as with the city recordings and Rio's band), otherwise
// the first online phone of the team that landed, otherwise the host's. Every other device shows what's
// playing, and where. All of it is worked out from the room's view, so every device agrees.
import { CITY_AT } from "../../engine";
import type { FeedItem, RoomView } from "../../room/protocol";
import SONGS from "../songs.json";
import { planMove, timesFor } from "./ridePlan";

export interface Song {
  /** Apple's track id, and the storefront it's looked up in. */
  id: number;
  cc: string;
  /** As Apple has them (a remaster's note taken off the title). */
  title: string;
  artist: string;
  year: number;
  explicitness: string;
  /** The 30-second preview found when the list was made (the fallback if the lookup doesn't answer). */
  preview: string;
  /** The song on Apple Music. */
  url: string;
  /** What a reader of Chinese or English sees instead, where Apple's title or artist isn't readable for them. */
  show?: { zh?: string; en?: string };
  by?: { zh?: string; en?: string };
}

/** Each city's songs (src/client/songs.json, made by scripts/songs.mjs). */
export const CITY_SONGS: Record<string, Song[]> = (SONGS as unknown as { cities: Record<string, Song[]> }).cities;

/** A beat after the stamp: the song comes in under the arrival card. */
export const AFTER_STAMP = 400;

export interface SongCue {
  /** The landing's feed id: one song per landing. */
  key: number;
  seat: number;
  city: string;
  song: Song;
  /** Server time it starts. */
  at: number;
}

type GameItem = FeedItem & { t: "game" };
const isGame = (f: FeedItem): f is GameItem => f.t === "game";

/** A small, steady number from a string: each game starts each city's songs at its own place. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The song for the team on turn right now, or null: it has landed on a city already in its passport
 * this turn, it's still there, and the game is on. The same on every device (it's read from the view).
 */
export function songCue(v: RoomView, now: number): SongCue | null {
  const g = v.game;
  if (!g || v.phase !== "playing" || g.s.over) return null;
  const seat = g.s.turn;
  const me = g.s.ps[seat];
  if (!me || me.out) return null;
  // The computer plays a turn in a second or two, over before its token is even down on the screens:
  // no song for a computer team, or a team the computer is playing for.
  const team = v.teams.find((t) => t.seat === seat);
  if (team && (team.bot || team.autoplay || team.covered)) return null;
  const feed = v.feed;
  // The team's newest landing this turn (a turn starts with its "turn" line).
  let i = feed.length - 1;
  for (; i >= 0; i--) {
    const f = feed[i];
    if (!isGame(f)) continue;
    if (f.e.t === "turn") return null;
    if (f.e.t === "land" && f.e.p === seat) break;
  }
  if (i < 0) return null;
  const land = feed[i] as GameItem & { e: { t: "land"; p: number; at: number } };
  const at = land.e.at;
  const city = CITY_AT[at];
  if (!city || me.pos !== at || me.jail) return null;
  // A first visit stamps the passport straight after landing: that's the field recording's.
  const next = feed.slice(i + 1).find(isGame);
  if (next && next.e.t === "stamp" && next.e.p === seat) return null;
  const songs = CITY_SONGS[city.id];
  if (!songs?.length) return null;
  // Each landing here moves the city's songs on by one (from a place of this game's own), so the
  // same one doesn't come up twice running. (Landings on this space since this one are taken off: the
  // count as it was at this landing, the same on every device.)
  const since = feed.slice(i + 1).filter((f) => isGame(f) && f.e.t === "land" && f.e.at === at).length;
  const count = (g.s.stats.landings[at] ?? 1) - since;
  const song = songs[(hash(`${g.startedAt}:${city.id}`) + count) % songs.length];
  // From just after the stamp: the throw's own beat if this landing ended it, or the moment it happened.
  const raw = planMove(v, [seat], now);
  const ride = raw && raw.key < land.id && raw.legs[raw.legs.length - 1].to === at && land.at - raw.start < 1000 ? raw : null;
  const stamp = ride ? ride.start + timesFor(ride.legs, ride.jail, ride.pace, ride.rolled).land : land.at;
  return { key: land.id, seat, city: city.id, song, at: stamp + AFTER_STAMP };
}

/** Who plays the room's song: a member id (the big screen, else the landing team's first online phone, else the host), or null. */
export function songPlayer(v: RoomView, seat: number): string | null {
  const screen = v.members.find((m) => m.role === "screen" && m.online);
  if (screen) return screen.id;
  const team = v.teams.find((t) => t.seat === seat);
  const phone = team?.members.map((id) => v.members.find((m) => m.id === id)).find((m) => m?.online && m.role === "player");
  if (phone) return phone.id;
  const host = v.members.find((m) => m.id === v.hostId && m.online);
  return host?.id ?? null;
}

/** The song keeps playing but can't be heard: a pause, Seoul's ten seconds of silence, Rio's samba lesson. */
export function songHushed(v: RoomView, now: number): boolean {
  const g = v.game;
  if (!g) return false;
  return g.paused || (g.silenceUntil ?? 0) > now || (!!g.dance && now < g.dance.at + g.dance.ms);
}

/** A song's title and artist for a reader of `lang`. */
export function songText(s: Song, lang: "zh" | "en") {
  return { title: s.show?.[lang] ?? s.title, artist: s.by?.[lang] ?? s.artist };
}

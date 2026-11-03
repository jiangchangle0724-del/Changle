// Being there (issue #44): what the arrival card says about the place right now (its local time, the
// weather, how to say hello and what it means, its money), what the game's prices come to in that
// money, and the local hit a second visit plays: "Now playing" on every screen, the song itself on the
// one device that plays it (localSong.ts decides which song, when and where; music.ts plays it).
import { useEffect, useState } from "preact/hooks";
import { CITIES } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { localClock } from "../art/places";
import { getLang, money, t, tx } from "../i18n";
import { HELLO, localMoney, rateLine } from "../local";
import { music, type SongState } from "../music";
import { isMuted } from "../sound";
import { serverNow } from "../store";
import { useWeather, weatherLabel } from "../weather";
import { AFTER_STAMP, songCue, songHushed, songPlayer, songText, type SongCue } from "./localSong";
import { moveInPlay } from "./ridePlan";
import { toggleMute } from "./Settings";

/** Re-render at a server time (0: never). */
function useAt(at: number) {
  const [, tick] = useState(0);
  useEffect(() => {
    const left = at - serverNow();
    if (!at || left <= 0) return;
    const id = window.setTimeout(() => tick((n) => n + 1), left + 30);
    return () => clearTimeout(id);
  }, [at]);
}

/** Re-render every minute, on the minute (the local time on the arrival card). */
function useMinute() {
  const [, tick] = useState(0);
  useEffect(() => {
    let id = 0;
    const next = () => {
      id = window.setTimeout(() => {
        tick((n) => n + 1);
        next();
      }, 60_000 - (Date.now() % 60_000) + 50);
    };
    next();
    return () => clearTimeout(id);
  }, []);
}

/**
 * The room's song now, worked out once per landing on this device (so a landing on the same city
 * while it plays can't change which song it is).
 */
const cues = new Map<string, SongCue>();
function cueNow(v: RoomView): SongCue | null {
  const cue = songCue(v, serverNow());
  if (!cue) return null;
  const key = `${v.code}:${cue.key}`;
  const kept = cues.get(key);
  if (kept) return kept;
  if (cues.size > 20) cues.clear();
  cues.set(key, cue);
  return cue;
}

/** The music player's state for this song, re-rendering when it changes. */
function useSongState(key: string | null): SongState {
  const [, tick] = useState(0);
  useEffect(() => music.listen(() => tick((n) => n + 1)), []);
  return key ? music.state(key) : "off";
}

/**
 * Plays the room's song if this device is the one to (the big screen, else the landing team's first
 * phone, else the host's), and stops it when it's over. One on each screen; it draws nothing.
 */
export function LocalSong({ v }: { v: RoomView }) {
  const now = serverNow();
  const cue = cueNow(v);
  const mine = !!cue && songPlayer(v, cue.seat) === v.you.id;
  const hush = songHushed(v, now);
  const g = v.game;
  // (the silence and the samba end on a clock: look again then)
  useAt(hush && g ? Math.max(g.silenceUntil ?? 0, g.dance ? g.dance.at + g.dance.ms : 0) : 0);
  useEffect(() => {
    music.want(
      mine && cue
        ? { key: `${v.code}:${cue.key}`, id: cue.song.id, cc: cue.song.cc, preview: cue.song.preview, at: Date.now() + (cue.at - serverNow()), hush }
        : null,
    );
  });
  useEffect(() => () => music.want(null), []);
  return null;
}

/** A small record, turning while the song plays (still with reduced motion). */
function Disc() {
  return (
    <svg class="np-disc" viewBox="-20 -20 40 40" aria-hidden="true">
      <circle r="19" class="np-vinyl" />
      <circle r="14.5" class="np-groove" />
      <circle r="11" class="np-groove" />
      <circle r="7" class="np-label" />
      <circle r="1.6" class="np-hole" />
    </svg>
  );
}

/** "Now playing": the song for this landing (`land`, its feed id), with where it's playing and the way to hear all of it. */
export function NowPlaying({ v, land, big }: { v: RoomView; land: number; big?: boolean }) {
  const cue = cueNow(v);
  const key = cue ? `${v.code}:${cue.key}` : null;
  const state = useSongState(key);
  // (nothing tells the landing before its stamp: it shows as the song comes in)
  const from = cue ? cue.at - AFTER_STAMP : 0;
  useAt(from);
  if (!cue || cue.key !== land || serverNow() < from) return null;
  const lang = getLang();
  const { title, artist } = songText(cue.song, lang);
  const player = songPlayer(v, cue.seat);
  const here = player === v.you.id;
  const muted = here && isMuted();
  const shown: SongState | "elsewhere" | "muted" = !here ? "elsewhere" : muted ? "muted" : state === "off" ? "loading" : state;
  let where = t("nowPlaying");
  if (shown === "elsewhere") {
    const m = v.members.find((x) => x.id === player);
    where = !m ? t("nowPlaying") : m.role === "screen" ? t("nowPlayingScreen") : t("nowPlayingPhone", { name: m.name || t("bigScreen") });
  } else if (shown === "muted") where = t("nowPlayingMuted");
  else if (shown === "loading") where = t("nowPlayingLoading");
  else if (shown === "failed") where = t("nowPlayingFailed");
  else if (shown === "blocked") where = t("soundTap");
  return (
    <div class={`now-playing${big ? " big" : ""}`} data-state={shown} data-song={cue.song.id}>
      <Disc />
      <div class="np-text">
        <p class="np-song">
          <b lang="und">{title}</b> <span lang="und">{artist}</span>
        </p>
        <p class="np-meta">
          <span class="np-where">{where}</span>
          {shown === "muted" && (
            <button type="button" class="np-on" onClick={toggleMute}>
              {t("soundOn")}
            </button>
          )}
          <a class="np-link" href={cue.song.url} target="_blank" rel="noopener noreferrer">
            {t("listenApple")}
          </a>
        </p>
      </div>
    </div>
  );
}

/** The rent paid at this landing (the first, if Tokyo's push or a tango brought more), once money shows. */
function rentHere(v: RoomView, land: number, seat: number): number | null {
  for (const f of v.feed) {
    if (f.id <= land || f.t !== "game") continue;
    if (f.e.t === "land" && f.e.p === seat) break;
    if (f.e.t === "rent" && f.e.p === seat) return f.e.amount;
  }
  return null;
}

/**
 * The arrival card's local part: hello in the local language (how to say it, what it means), the local
 * time and the weather there now, the local money and what $1 comes to, and the rent paid here in that
 * money. (The song a second visit plays has a row of its own across a phone's card, and a place of its
 * own on the big screen: NowPlaying.) On the big screen the money rides on the hello's line, to keep the
 * card short enough for the column without shrinking it.
 */
export function ArrivalLocal({ v, city: id, land, seat, big }: { v: RoomView; city: string; land: number; seat: number; big?: boolean }) {
  const city = CITIES.find((c) => c.id === id)!;
  const lang = getLang();
  const hello = HELLO[id];
  const say = hello?.say[lang];
  const wx = useWeather(id);
  useMinute();
  const clock = localClock(id, serverNow());
  const rate = rateLine(id, lang);
  // (money shows with the decision window, as everywhere: moveInPlay)
  const ready = moveInPlay(v)?.ready ?? 0;
  useAt(ready);
  const rent = serverNow() >= ready ? rentHere(v, land, seat) : null;
  const rentLocal = rent ? localMoney(id, rent, lang) : null;
  const cur = (
    <span class="arrival-cur">
      {tx(city.currency)}
      {rate && <small class="local-money">{rate}</small>}
    </span>
  );
  return (
    <>
      <p class="arrival-hello">
        <span lang="und">{city.greeting.text}</span>
        {city.greeting.roman && <i>{city.greeting.roman}</i>}
        {big && <> · {cur}</>}
      </p>
      {hello && <p class="arrival-say">{say ? t("helloSay", { say, means: hello.means[lang] }) : t("helloMeans", { means: hello.means[lang] })}</p>}
      {(clock || wx) && (
        <p class="arrival-now">
          {clock && <span class="arrival-time">{t("localTime", { time: clock.time })}</span>}
          {clock && wx && " · "}
          {wx && <span class="arrival-wx">{t("wxNow", { wx: weatherLabel(wx) })}</span>}
        </p>
      )}
      {!big && <p class="arrival-cur-line">{cur}</p>}
      {rent !== null && (
        <p class="arrival-rent">
          {t("rentPaidHere", { amount: money(rent) })}
          {rentLocal && <small class="local-money">{rentLocal}</small>}
        </p>
      )}
    </>
  );
}

/** The big screen's "Now playing", in the column beside the arrival card (under the standings). */
export function TvNowPlaying({ v }: { v: RoomView }) {
  const cue = cueNow(v);
  return cue ? <NowPlaying v={v} land={cue.key} big /> : null;
}

/** A game amount in a city's own money, small and quiet beside it ("≈ ¥39,000"); nothing for a dollar city. */
export function LocalMoney({ city, n }: { city: string | null | undefined; n: number }) {
  const text = city ? localMoney(city, n, getLang()) : null;
  return text ? <small class="local-money">{text}</small> : null;
}

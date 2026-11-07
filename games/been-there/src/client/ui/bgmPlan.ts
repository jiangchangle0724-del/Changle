// Which of the game's music plays now, how loud, and on which device (bgm.ts plays it; Bgm.tsx asks).
// All of it is worked out from the room's view, so every device agrees, and only one plays it.
//
// One device: the big screen when one is on (as with the city recordings, Rio's band and the local
// hits), otherwise the host's phone, otherwise the first phone online. A room never hears it from
// several phones a little out of step.
//
// From the game's start to its end, the theme goes round. It comes down out of the way of what the
// room should hear: right down for a local hit (it's music too), Seoul's ten seconds of silence, Rio's
// samba from the ready card to the judges' scores (the band plays the samba), a party forfeit (one of
// them is humming a song) and a pause; most of the way down for a city's recording on a first visit.
// When the game ends, the ending plays once, from the exit stamp.
import type { RoomView } from "../../room/protocol";
import META from "../bgm.json";
import { songCue } from "./localSong";

/** The ending starts with the exit stamp (Finale.tsx STAMP_AT), so the band hits its last chord as the paper falls. */
export const FINALE_AFTER = 300;
/** A first visit's recording plays a few seconds after the stamp, for about five (Touchdown.tsx): the theme waits under it. */
export const RECORDING_FROM = 2000;
export const RECORDING_TO = 11_000;
/** How far down the theme goes under a recording. */
export const UNDER_RECORDING = 0.3;

export interface BgmPlan {
  piece: "theme" | "finale";
  level: number;
  /** The ending's moment (server time). */
  at?: number;
  /** When the plan may change by itself (server time), to look again then; 0: not by the clock. */
  next: number;
}

/** The member who plays the room's music: the big screen, else the host's phone, else the first phone online. */
export function bgmDevice(v: RoomView): string | null {
  const screen = v.members.find((m) => m.role === "screen" && m.online);
  if (screen) return screen.id;
  const host = v.members.find((m) => m.id === v.hostId && m.online);
  if (host) return host.id;
  return v.members.find((m) => m.online && m.role === "player")?.id ?? null;
}

/** The newest first visit's stamp (server time), or null. */
function lastStamp(v: RoomView): number | null {
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const f = v.feed[i];
    if (f.t === "game" && f.e.t === "stamp") return f.at;
  }
  return null;
}

/** When the game ended (server time), or null. */
function overAt(v: RoomView): number | null {
  for (let i = v.feed.length - 1; i >= 0; i--) {
    const f = v.feed[i];
    if (f.t === "game" && f.e.t === "over") return f.at;
  }
  return null;
}

/** What plays now, or null (the lobby, after the ending). */
export function bgmPlan(v: RoomView, now: number): BgmPlan | null {
  const g = v.game;
  if (!g) return null;
  if (v.phase === "over" || g.s.over) {
    const end = overAt(v);
    if (end === null) return null;
    const at = end + FINALE_AFTER;
    const done = at + META.finale.length * 1000;
    return now < done ? { piece: "finale", level: 1, at, next: done } : null;
  }
  if (v.phase !== "playing") return null;
  const times: number[] = [];
  let level = 1;
  // Held right down.
  if (g.paused || g.forfeit || g.dance) level = 0;
  if ((g.silenceUntil ?? 0) > now) {
    level = 0;
    times.push(g.silenceUntil!);
  }
  const cue = songCue(v, now);
  if (cue) {
    if (now >= cue.at) level = 0;
    else times.push(cue.at);
  }
  // Most of the way down under a first visit's recording.
  const stamp = lastStamp(v);
  if (stamp !== null && level > UNDER_RECORDING) {
    if (now >= stamp + RECORDING_FROM && now < stamp + RECORDING_TO) {
      level = UNDER_RECORDING;
      times.push(stamp + RECORDING_TO);
    } else if (now < stamp + RECORDING_FROM) times.push(stamp + RECORDING_FROM);
  }
  const next = times.filter((t) => t > now).reduce((a, b) => Math.min(a, b), Infinity);
  return { piece: "theme", level, next: Number.isFinite(next) ? next : 0 };
}

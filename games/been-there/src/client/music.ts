// The local hit a second visit plays (ui/LocalSong.tsx decides which song, when, and on which device):
// Apple's 30-second preview, looked up at play time with the iTunes Lookup API (the URL found when the
// list was made, songs.json, if the lookup doesn't answer), streamed from Apple, decoded into the
// game's own audio (sound.ts: the context the first tap unlocked, so it plays on iPhones too) and
// looped with a crossfade until it's no longer wanted, then faded out over 2 s. It plays under the
// game's sounds, which duck it (sound.ts). Nothing is fetched or played while the sound is off.
import { audioCtx, isMuted, musicBus, setSongOn } from "./sound";

export type SongState = "off" | "loading" | "playing" | "failed" | "blocked";

export interface SongWant {
  /** One song per landing: a new key is a new song. */
  key: string;
  /** Apple's track id and the storefront it's in. */
  id: number;
  cc: string;
  /** The preview found when the list was made, for when the lookup doesn't answer. */
  preview: string;
  /** When it starts, on this device's clock (Date.now()). */
  at: number;
  /** Held down for now (Seoul's silence, Rio's dance, a pause): it keeps playing, silently, and comes back. */
  hush?: boolean;
}

export interface MusicDeps {
  /** The audio context, once a tap has allowed sound (null before). */
  ctx(): AudioContext | null;
  /** Where songs go (the bus the game's sounds duck). */
  out(): AudioNode | null;
  muted(): boolean;
  fetch(url: string, init?: RequestInit): Promise<Response>;
  /** This device's clock, ms. */
  now(): number;
  /** A song is on or off: the game's sounds duck it while it is. */
  live(on: boolean): void;
}

/** How loud a song plays, under the game's sounds (the city recordings play at 0.45). */
export const SONG_VOLUME = 0.32;
/** The fade at the end of a turn. */
export const FADE_OUT = 2;
/** Each pass of the preview crossfades into the next over this long. */
const CROSSFADE = 1.5;
/** A lookup that hasn't answered by now gives way to the preview found when the list was made. */
const LOOKUP_WAIT = 4000;

interface Pass {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

interface Playing {
  key: string;
  want: SongWant;
  state: SongState;
  buffer: AudioBuffer | null;
  /** The song's volume (its fade in and out), and its hush, in that order before the bus. */
  gain: GainNode | null;
  hush: GainNode | null;
  hushed: boolean;
  passes: Pass[];
  timers: ReturnType<typeof setTimeout>[];
}

export interface Player {
  /** What should be playing now (null: nothing). Call it as often as you like: it only acts on a change. */
  want(w: SongWant | null): void;
  /** Where the song with this key is: playing, loading, failed, waiting for a tap (blocked), or off. */
  state(key: string): SongState;
  /** Called on every change of state. Returns the way to stop listening. */
  listen(fn: () => void): () => void;
}

/** The preview URL Apple gives for a track now, or null (no answer in time, not found, no preview). */
async function lookUp(deps: MusicDeps, id: number, cc: string): Promise<string | null> {
  const ask = deps
    .fetch(`https://itunes.apple.com/lookup?id=${id}&country=${cc}&entity=song`, { mode: "cors", credentials: "omit" })
    .then((r) => (r.ok ? (r.json() as Promise<{ results?: { trackId?: number; previewUrl?: string }[] }>) : null))
    .then((d) => d?.results?.find((x) => x.trackId === id)?.previewUrl ?? null)
    .catch(() => null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), LOOKUP_WAIT)));
  const url = await Promise.race([ask, late]);
  clearTimeout(timer);
  return url && /^https:\/\//.test(url) ? url : null;
}

function decode(c: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    // (older Safari only has the callback form)
    const p = c.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
}

export function createPlayer(deps: MusicDeps): Player {
  let cur: Playing | null = null;
  const listeners = new Set<() => void>();
  const tell = () => listeners.forEach((f) => f());
  /** A decoded preview is about 10 MB of samples: keep only the one for the landing at hand. */
  let kept: { key: string; buffer: Promise<AudioBuffer | null> } | null = null;

  const set = (p: Playing, state: SongState) => {
    if (p.state === state) return;
    p.state = state;
    // (on the page too, for the browser tests and anyone looking: html[data-song="playing"])
    if (typeof document !== "undefined") document.documentElement.dataset.song = state;
    tell();
  };

  function stop(p: Playing, fade: number) {
    p.timers.forEach(clearTimeout);
    p.timers = [];
    const c = p.gain?.context as AudioContext | undefined;
    if (c && p.gain) {
      const t = c.currentTime;
      try {
        const g = p.gain.gain;
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
        g.linearRampToValueAtTime(0, t + fade);
        for (const pass of p.passes) pass.src.stop(t + fade + 0.05);
      } catch {
        for (const pass of p.passes) pass.src.disconnect();
      }
      const gain = p.gain;
      const hush = p.hush;
      setTimeout(() => {
        gain.disconnect();
        hush?.disconnect();
      }, (fade + 0.3) * 1000);
    }
    p.passes = [];
    if (p.state === "playing") deps.live(false);
    set(p, "off");
  }

  /** One pass of the preview from audio time `t0`, fading in over `fadeIn`, crossfading into the next. */
  function pass(p: Playing, t0: number, fadeIn: number) {
    const c = p.gain!.context as AudioContext;
    const buf = p.buffer!;
    const dur = buf.duration;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    src.connect(gain).connect(p.gain!);
    const loops = dur > CROSSFADE * 2 + 2;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(1, t0 + fadeIn);
    if (loops) {
      gain.gain.setValueAtTime(1, t0 + dur - CROSSFADE);
      gain.gain.linearRampToValueAtTime(0, t0 + dur);
    } else src.loop = true;
    // (a pass ends with its buffer; only `stop` below ever stops one early, once: older Safari won't take two)
    src.start(t0);
    p.passes = [...p.passes.slice(-1), { src, gain }];
    if (!loops) return;
    // The next pass starts as this one fades: schedule it a second before it's due.
    const next = t0 + dur - CROSSFADE;
    p.timers.push(setTimeout(() => cur === p && p.state === "playing" && pass(p, next, CROSSFADE), Math.max(0, (next - c.currentTime - 1) * 1000)));
  }

  function begin(p: Playing) {
    const c = deps.ctx();
    const out = deps.out();
    if (!c || !out || !p.buffer) return set(p, "blocked");
    p.gain = c.createGain();
    p.gain.gain.value = 0;
    p.hush = c.createGain();
    p.hush.gain.value = p.want.hush ? 0 : 1;
    p.hushed = !!p.want.hush;
    p.gain.connect(p.hush).connect(out);
    // (on this device's clock now, so a phone that loaded it late joins on time, and never starts in the past)
    const t0 = c.currentTime + Math.max(0.05, (p.want.at - deps.now()) / 1000);
    p.gain.gain.setValueAtTime(0, t0);
    p.gain.gain.linearRampToValueAtTime(SONG_VOLUME, t0 + 0.8);
    try {
      pass(p, t0, 0.05);
    } catch {
      return set(p, "failed");
    }
    deps.live(true);
    set(p, "playing");
  }

  function load(p: Playing) {
    const c = deps.ctx();
    if (!c) return set(p, "blocked");
    set(p, "loading");
    const w = p.want;
    if (kept?.key !== w.key)
      kept = {
        key: w.key,
        buffer: (async () => {
          const url = (await lookUp(deps, w.id, w.cc)) ?? w.preview;
          const r = await deps.fetch(url, { mode: "cors", credentials: "omit" });
          if (!r.ok) throw new Error(String(r.status));
          return decode(c, await r.arrayBuffer());
        })().catch(() => null),
      };
    void kept.buffer.then((buf) => {
      if (cur !== p || p.state !== "loading") return;
      if (!buf) return set(p, "failed");
      p.buffer = buf;
      // (the sound may have gone off while it loaded)
      if (deps.muted()) return stop(p, 0.1);
      begin(p);
    });
  }

  function hush(p: Playing, on: boolean) {
    if (p.hushed === on || !p.hush) return;
    p.hushed = on;
    const g = p.hush.gain;
    const t = (p.hush.context as AudioContext).currentTime;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(on ? 0 : 1, t + (on ? 0.4 : 1));
    } catch {
      g.value = on ? 0 : 1;
    }
  }

  return {
    want(w) {
      if (!w || deps.muted()) {
        if (cur && cur.state !== "off") stop(cur, w ? 0.25 : FADE_OUT);
        // (over: let go of the decoded preview too; only muted, keep it for when the sound comes back on)
        if (!w) {
          cur = null;
          kept = null;
        } else if (cur?.key !== w.key) cur = null;
        return;
      }
      if (cur && cur.key === w.key) {
        cur.want = { ...w, at: cur.want.at };
        // Back from being muted, or allowed to sound by a tap since: start again.
        if (cur.state === "off" || cur.state === "blocked") load(cur);
        else hush(cur, !!w.hush);
        return;
      }
      if (cur && cur.state !== "off") stop(cur, FADE_OUT);
      cur = { key: w.key, want: w, state: "off", buffer: null, gain: null, hush: null, hushed: false, passes: [], timers: [] };
      load(cur);
    },
    state(key) {
      return cur && cur.key === key ? cur.state : "off";
    },
    listen(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
  };
}

/** The page's player. */
export const music = createPlayer({
  ctx: audioCtx,
  out: musicBus,
  muted: isMuted,
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  live: setSongOn,
});

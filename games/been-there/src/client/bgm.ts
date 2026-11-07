// The game's own music: "Boarding Call", a 1930s swing written for the game, going round for as long
// as the game is on, and its ending for the results (scripts/music.mjs made both, with real
// instruments' samples; the files are media/music, their loop points bgm.json). ui/Bgm.tsx decides
// which plays, how loud and on which device; this plays it.
//
// The theme is one file with a second either side of one time round; it loops between those two
// points, so the join is the music going on. It plays through the game's own audio (sound.ts: the
// context the first tap unlocked, so iPhones play it too) on the bus the game's sounds duck, and its
// level comes down when the room's attention is elsewhere (ui/bgmPlan.ts). Nothing is fetched or
// played while the sound is off.
import { BASE } from "./base";
import META from "./bgm.json";
import { audioCtx, isMuted, musicBus, setThemeOn } from "./sound";

export type Piece = "theme" | "finale";
export type BgmState = "off" | "loading" | "playing" | "failed" | "blocked";

export interface BgmWant {
  piece: Piece;
  /** How much of its volume the theme has now: 1, down to 0 while something else should be heard. */
  level: number;
  /** The ending: when it starts, on this device's clock (Date.now()). */
  at?: number;
  /** The mono file (a phone: half the memory), or the stereo one (the big screen). */
  mono?: boolean;
}

export interface BgmDeps {
  ctx(): AudioContext | null;
  out(): AudioNode | null;
  muted(): boolean;
  fetch(url: string): Promise<Response>;
  /** This device's clock, ms. */
  now(): number;
  /** The music is on or off: the game's sounds duck it while it is. */
  live(on: boolean): void;
}

/** The theme's volume, under the game's sounds and under a local hit's (music.ts SONG_VOLUME: 0.32 of a louder file). */
export const THEME_VOLUME = 0.5;
/** The ending's: it's the moment. */
export const FINALE_VOLUME = 0.62;
/** The theme fades in over this long, and out over FADE_OUT. */
export const FADE_IN = 2.5;
export const FADE_OUT = 2;
/** How quickly the level goes down for something else, and comes back after. */
const DOWN = 0.6;
const UP = 1.8;
/** An ending whose moment went by longer ago than this isn't played (a phone back from its lock screen). */
const LATE = 2000;

export const themeFile = (mono: boolean) => `${BASE}/music/${mono ? META.theme.mono : META.theme.stereo}`;
export const finaleFile = () => `${BASE}/music/${META.finale.file}`;

function decode(c: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    // (older Safari only has the callback form)
    const p = c.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
}

interface Voice {
  piece: Piece;
  src: AudioBufferSourceNode;
  gain: GainNode;
  level: GainNode;
}

export interface BgmPlayer {
  /** What should play now (null: nothing). Call it as often as you like: it only acts on a change. */
  want(w: BgmWant | null): void;
  state(): BgmState;
}

export function createBgm(deps: BgmDeps): BgmPlayer {
  let st: BgmState = "off";
  let voice: Voice | null = null;
  let level = 1;
  /** The decoded files: the theme's (about 24 MB mono, 48 MB stereo, so only while it's wanted) and the ending's. */
  let theme: { mono: boolean; buffer: Promise<AudioBuffer | null> } | null = null;
  let ending: { at: number; buffer: Promise<AudioBuffer | null> } | null = null;
  /** The ending last played (its moment): it plays once. */
  let played = 0;
  let wanted: BgmWant | null = null;

  const set = (s: BgmState) => {
    st = s;
    // (on the page too, for the browser tests and anyone looking: html[data-bgm="playing"])
    if (typeof document !== "undefined") document.documentElement.dataset.bgm = s;
  };

  const load = (url: string, c: BaseAudioContext) =>
    deps
      .fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then((data) => decode(c, data))
      .catch(() => null);

  function stop(fade: number) {
    const v = voice;
    voice = null;
    if (!v) return;
    const c = v.gain.context as AudioContext;
    const t = c.currentTime;
    try {
      const g = v.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + fade);
      v.src.stop(t + fade + 0.05);
    } catch {
      v.src.disconnect();
    }
    setTimeout(() => {
      v.gain.disconnect();
      v.level.disconnect();
    }, (fade + 0.3) * 1000);
    deps.live(false);
  }

  function setLevel(to: number) {
    if (!voice || voice.piece !== "theme" || Math.abs(to - level) < 1e-3) return;
    const up = to > level;
    level = to;
    const g = voice.level.gain;
    const t = (voice.level.context as AudioContext).currentTime;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + (up ? UP : DOWN));
    } catch {
      g.value = to;
    }
  }

  function start(piece: Piece, buffer: AudioBuffer, c: AudioContext, out: AudioNode, w: BgmWant) {
    const src = c.createBufferSource();
    const gain = c.createGain();
    const lvl = c.createGain();
    src.buffer = buffer;
    src.connect(gain).connect(lvl).connect(out);
    const t0 = c.currentTime + (piece === "finale" ? Math.max(0.02, ((w.at ?? deps.now()) - deps.now()) / 1000) : 0.05);
    gain.gain.setValueAtTime(0, t0);
    if (piece === "theme") {
      level = w.level;
      lvl.gain.value = w.level;
      src.loop = true;
      src.loopStart = META.theme.loopStart;
      src.loopEnd = META.theme.loopEnd;
      gain.gain.linearRampToValueAtTime(THEME_VOLUME, t0 + FADE_IN);
      src.start(t0, META.theme.loopStart);
    } else {
      // (an ending that's a moment late starts that far in, so it ends when it would have)
      const late = Math.max(0, (deps.now() - (w.at ?? deps.now())) / 1000);
      gain.gain.linearRampToValueAtTime(FINALE_VOLUME, t0 + 0.02);
      src.start(t0, Math.min(late, buffer.duration - 0.1));
      src.onended = () => {
        if (voice?.src === src) {
          voice = null;
          deps.live(false);
          set("off");
        }
      };
    }
    voice = { piece, src, gain, level: lvl };
    deps.live(true);
    set("playing");
  }

  function go(w: BgmWant) {
    const c = deps.ctx();
    const out = deps.out();
    if (!c || !out) return set("blocked");
    if (w.piece === "theme") {
      if (voice?.piece === "theme") return setLevel(w.level);
      if (voice) stop(1.5);
      if (!theme) theme = { mono: !!w.mono, buffer: load(themeFile(!!w.mono), c) };
      const mine = theme;
      set("loading");
      void mine.buffer.then((buf) => {
        if (theme !== mine || wanted?.piece !== "theme" || voice) return;
        if (!buf) {
          // (try again in a while: the next view after that asks for it again)
          setTimeout(() => theme === mine && (theme = null), 30_000);
          return set("failed");
        }
        if (deps.muted()) return set("off");
        start("theme", buf, c, out, wanted);
      });
      return;
    }
    // the ending
    const at = w.at ?? deps.now();
    if (played === at) return;
    if (voice?.piece === "theme") stop(1.2);
    if (deps.now() - at > LATE) return set("off");
    if (ending?.at !== at) ending = { at, buffer: load(finaleFile(), c) };
    // the theme's 48 MB aren't needed any more
    theme = null;
    const mine = ending;
    set("loading");
    void mine.buffer.then((buf) => {
      if (ending !== mine || wanted?.piece !== "finale" || wanted.at !== at || voice?.piece === "finale") return;
      if (!buf || deps.now() - at > LATE + 1000) return set(buf ? "off" : "failed");
      if (deps.muted()) return set("off");
      played = at;
      start("finale", buf, c, out, wanted);
    });
  }

  return {
    want(w) {
      wanted = w;
      if (!w || deps.muted()) {
        if (voice) stop(w ? 0.3 : FADE_OUT);
        if (!w) {
          theme = null;
          ending = null;
        }
        if (st !== "off") set("off");
        return;
      }
      if (voice?.piece === w.piece && w.piece === "theme") return setLevel(w.level);
      if (voice?.piece === "finale" && w.piece === "finale") return;
      if (st === "loading" && (w.piece === "theme" ? theme : ending?.at === (w.at ?? 0))) return;
      go(w);
    },
    state: () => st,
  };
}

/** The page's player. */
export const bgm = createBgm({
  ctx: audioCtx,
  out: musicBus,
  muted: isMuted,
  fetch: (url) => fetch(url),
  now: () => Date.now(),
  live: setThemeOn,
});

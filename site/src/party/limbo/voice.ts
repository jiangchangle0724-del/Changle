import type { Bus } from "../../lib/audio/engine";

/**
 * The coach's voice (Steve, Nov 19: 「要语音提示往前还是往后，根据手机语言」): short recorded lines,
 * one set per language, played through the page's own sound like everything else. They are MiniMax
 * voices made once by `scripts/limbo_voices.py` and kept in `public/sounds/limbo/<lang>/<line>.mp3`;
 * this file only plays them. Not the browser's speech voice: on an iPhone that stops the page's
 * music and it may not come back (WebKit bugs 218815 and 273511, see dj/announce.ts). A language
 * with no recordings speaks English (Steve, 2026-11-26: 「英语提示就好」, so only English is recorded);
 * without any files (offline, say) the coach keeps to its blips.
 */

export type Line = "down" | "up" | "on" | "kept" | "left" | "right";
export type Lang = "zh" | "en";

/** What each line says (the script that records them has the same table: keep them together). */
export const LINES: Record<Line, Record<Lang, string>> = {
  down: { zh: "再往后仰", en: "Lean back" },
  up: { zh: "回来一点", en: "Come up a bit" },
  on: { zh: "到位了", en: "That's it" },
  kept: { zh: "跟住了", en: "With it" },
  left: { zh: "往左歪", en: "Tilt left" },
  right: { zh: "往右歪", en: "Tilt right" },
};

export const lineUrl = (lang: Lang, line: Line) => `/sounds/limbo/${lang}/${line}.mp3`;

type Clips = Partial<Record<Line, AudioBuffer>>;
const loaded = new Map<string, Promise<Clips>>();

/** The lines of this language, or English's when it has none recorded. */
function clipsFor(b: Bus, lang: Lang): Promise<Clips> {
  return recorded(b, lang).then((c) => (lang !== "en" && !Object.keys(c).length ? recorded(b, "en") : c));
}

/** The lines of one language, decoded once (a line that isn't there is left out). */
function recorded(b: Bus, lang: Lang): Promise<Clips> {
  const key = `${lang}@${b.c.sampleRate}`;
  let p = loaded.get(key);
  if (!p) {
    p = Promise.all(
      (Object.keys(LINES) as Line[]).map(async (line): Promise<[Line, AudioBuffer | null]> => {
        try {
          const res = await fetch(lineUrl(lang, line));
          if (!res.ok || !/audio|octet/.test(res.headers.get("content-type") ?? "")) return [line, null];
          return [line, await b.c.decodeAudioData(await res.arrayBuffer())];
        } catch {
          return [line, null];
        }
      }),
    ).then((pairs) => Object.fromEntries(pairs.filter(([, buf]) => buf)) as Clips);
    loaded.set(key, p);
  }
  return p;
}

export type Speaker = {
  /** Say this now (over whatever was being said): how long it takes, in seconds; 0 if the line isn't recorded. */
  say(line: Line): number;
  stop(): void;
};

/** A voice on this bus in this language: the lines load as it's made, so the first cue may still be a blip. */
export function speaker(b: Bus, lang: Lang, volume = 1): Speaker {
  let clips: Clips = {};
  let gone = false;
  void clipsFor(b, lang).then((c) => {
    if (!gone) clips = c;
  });
  let playing: AudioBufferSourceNode | null = null;
  const out = b.c.createGain();
  out.gain.value = volume;
  out.connect(b.dry);
  return {
    say(line) {
      const buf = clips[line];
      if (!buf || gone) return 0;
      try {
        playing?.stop();
      } catch {
        /* already over */
      }
      const src = b.c.createBufferSource();
      src.buffer = buf;
      src.connect(out);
      src.start();
      playing = src;
      src.onended = () => {
        if (playing === src) playing = null;
      };
      // (the checks read what was said: limbo3d_check.py and party_test.py)
      if (import.meta.env.DEV) ((window as unknown as { __limboSaid?: unknown[] }).__limboSaid ??= []).push({ line, lang, at: Math.round(performance.now()) });
      return buf.duration;
    },
    stop() {
      gone = true;
      try {
        playing?.stop();
      } catch {
        /* already over */
      }
      window.setTimeout(() => out.disconnect(), 300);
    },
  };
}

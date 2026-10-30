/**
 * Real-song previews for Name That Tune: 30-second clips streamed from Apple's preview server,
 * decoded into the app's own audio graph so every phone can start the same second of the same
 * song at the same moment (and the buzzer's sound ducks the music like any other cue). If a
 * phone can't decode the clip, a plain audio element plays it instead.
 */
import { bus, ctxTimeAt } from "./audio/engine";

/** a decoded preview is ~10 MB of samples: keep the one playing, the next one and the last one */
const KEEP = 2;
const loads = new Map<string, Promise<AudioBuffer | null>>();

function decode(c: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    // older Safari only has the callback form
    const p = c.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
}

/** Fetch and decode a preview (once per URL). Resolves null when it can't be played this way. */
export function loadPreview(url: string): Promise<AudioBuffer | null> {
  let p = loads.get(url);
  if (!p) {
    p = (async () => {
      const b = bus();
      if (!b) return null;
      const r = await fetch(url, { mode: "cors", credentials: "omit" });
      if (!r.ok) throw new Error(String(r.status));
      return await decode(b.c, await r.arrayBuffer());
    })().catch(() => null);
    loads.set(url, p);
    while (loads.size > KEEP) loads.delete(loads.keys().next().value as string);
  }
  return p;
}

export type PreviewHandle = { stop: (fade?: number) => void };

/**
 * Play a decoded preview from `offset` seconds, now or at a moment on the performance clock.
 * Starting late skips ahead, so a phone that loaded slowly joins at the right spot.
 */
export function playPreview(buf: AudioBuffer, opts: { startPerf?: number; offset?: number; seconds?: number; volume?: number; fadeIn?: number } = {}): PreviewHandle | null {
  const b = bus();
  if (!b) return null;
  const c = b.c;
  const now = c.currentTime;
  let at = opts.startPerf !== undefined ? ctxTimeAt(b, opts.startPerf) : now + 0.03;
  let offset = Math.max(0, opts.offset ?? 0);
  if (at < now + 0.03) {
    offset += now + 0.03 - at;
    at = now + 0.03;
  }
  if (offset >= buf.duration - 0.25) return null;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  src.connect(g).connect(b.music);
  const vol = opts.volume ?? 0.6;
  const fade = opts.fadeIn ?? 0.05;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + fade);
  const end = Math.min(buf.duration - offset, opts.seconds ?? Infinity);
  if (Number.isFinite(end)) {
    g.gain.setValueAtTime(vol, at + Math.max(fade, end - 0.8));
    g.gain.linearRampToValueAtTime(0, at + end);
  }
  src.start(at, offset);
  if (Number.isFinite(end)) src.stop(at + end + 0.05);
  let stopped = false;
  return {
    stop(f = 0.15) {
      if (stopped) return;
      stopped = true;
      try {
        const t = c.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + f);
        src.stop(t + f + 0.05);
      } catch {
        /* already done */
      }
      window.setTimeout(() => g.disconnect(), (f + 0.3) * 1000);
    },
  };
}

/** The fallback: a plain audio element, started `delayMs` from now at `offset` seconds. */
export function playElement(url: string, opts: { offset?: number; delayMs?: number; seconds?: number; volume?: number } = {}): PreviewHandle {
  const el = new Audio();
  el.preload = "auto";
  el.src = url;
  el.volume = Math.min(1, opts.volume ?? 0.8);
  let stopped = false;
  let timer = 0;
  let stopTimer = 0;
  const begin = () => {
    if (stopped) return;
    try {
      el.currentTime = Math.max(0, opts.offset ?? 0) + Math.max(0, -(opts.delayMs ?? 0)) / 1000;
    } catch {
      /* not seekable yet: start from where it is */
    }
    void el.play().catch(() => {});
    if (opts.seconds) stopTimer = window.setTimeout(() => el.pause(), opts.seconds * 1000);
  };
  timer = window.setTimeout(begin, Math.max(0, opts.delayMs ?? 0));
  return {
    stop() {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(stopTimer);
      el.pause();
      el.removeAttribute("src");
      el.load();
    },
  };
}

/** Songs this phone has played lately, so the next game picks new ones. */
const HEARD_KEY = "lazysusan.tune.heard";
const HEARD_KEEP = 400;

export function heardSongs(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(HEARD_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => Number.isSafeInteger(x)).slice(-HEARD_KEEP) : [];
  } catch {
    return [];
  }
}

export function rememberSong(id: number) {
  try {
    const list = heardSongs().filter((x) => x !== id);
    list.push(id);
    localStorage.setItem(HEARD_KEY, JSON.stringify(list.slice(-HEARD_KEEP)));
  } catch {
    /* private mode: fine */
  }
}

/**
 * 打碟 · DJ Booth: a song asked for by name, played for real (Steve on Nov 2: the remix the DJ
 * made in a song's style didn't sound like the song he picked). The booth can't have the whole
 * song, so it plays the 30 seconds Apple lets anyone hear of it (its preview, the clips 猜歌 plays)
 * on the deck it was asked onto: its first strong downbeat on the drop's bar, a little faster or
 * slower so its beats fall on the night's when it's near enough (as a DJ's pitch fader does, the
 * pitch with it), over the deck's own drums alone; too far off the beat, or with no clear beat, it
 * plays alone at its own speed. As it ends, the deck's own sound (the DJ's remix in its style)
 * comes back over a bar.
 *
 * `loadClip` fetches and listens to one (its beat, where to start and end, how loud); `ClipDeck`
 * mixes it into a deck's sound, chunk by chunk, as the DJ streams them into the speaker.
 */
import { sample } from "../local/LocalDj";
import { analyzeSong, matchRate, type SongBeat } from "../local/beats";

const RATE = 48000;
/** how loud a clip is brought to (RMS dBFS; Apple's clips are mastered louder): the night's peak, a touch over */
export const CLIP_DB = -14;
/** how far over the stretch it plays in a clip sits (dB): the stand-in's warm-up is quieter than its peak */
const OVER_DB = 1;

/** What a clip's level is multiplied by to sit just over a stretch of the night at `level` (its RMS dBFS). */
export const clipScale = (level: number) => Math.min(1.5, Math.pow(10, (level + OVER_DB - CLIP_DB) / 20));
/** a clip starts on its first strong downbeat after this many seconds (Apple's clips fade in) */
const LEAD_S = 1;
/** a clip plays at most this much faster or slower to fall on the night's beat (as the host's songs do) */
export const CLIP_MATCH = 0.08;
/** decoded clips kept (about 11 MB each): the one on the air, the one up next */
const KEEP = 3;
/** frames a clip takes to come in (a click's worth, just before its downbeat) and to go when it's cut */
const IN_F = Math.round(0.01 * RATE);
const CUT_F = Math.round(0.4 * RATE);

/** A song's clip, decoded at the speaker's rate and listened to. */
export type Clip = {
  url: string;
  l: Float32Array;
  r: Float32Array;
  /** its beat (null: no clear one, it plays at its own speed) */
  beat: SongBeat | null;
  /** seconds: where it starts (its first strong downbeat after the fade-in) and where it's worth playing to */
  start: number;
  end: number;
  /** what brings it to CLIP_DB */
  gain: number;
};

/**
 * A decoded clip, listened to: its beat, its start and end, how loud. Null when it's too short to
 * be worth it. Pure (the checks hand in their own sound).
 */
export function clipOf(url: string, l: Float32Array, r: Float32Array): Clip | null {
  const n = Math.min(l.length, r.length);
  const seconds = n / RATE;
  if (seconds < 8) return null;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = 0.5 * (l[i] + r[i]);
  const found = analyzeSong(mono, RATE);
  const beat = found && found.sure >= 0.2 ? found : null;
  let start = LEAD_S;
  if (beat) {
    const bar = 240 / beat.bpm;
    start = beat.down;
    while (start < LEAD_S) start += bar;
  }
  const end = Math.max(start + 4, Math.min(seconds - 0.25, beat ? beat.end : seconds - 0.25));
  if (end > seconds) return null;
  // how loud it is where it plays
  let sum = 0;
  const a = Math.floor(start * RATE);
  const b = Math.floor(end * RATE);
  for (let i = a; i < b; i++) sum += mono[i] * mono[i];
  const rms = Math.sqrt(sum / Math.max(1, b - a));
  const gain = rms > 1e-4 ? Math.min(4, Math.pow(10, CLIP_DB / 20) / rms) : 1;
  return { url, l: l.subarray(0, n), r: r.subarray(0, n), beat, start, end, gain };
}

/** A clip's sound, fetched from Apple's preview server and decoded at the speaker's rate. */
async function fetchClip(url: string): Promise<{ l: Float32Array; r: Float32Array }> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(String(res.status));
  const data = await res.arrayBuffer();
  const ctx = new OfflineAudioContext(2, 1, RATE);
  const buf = await ctx.decodeAudioData(data);
  const l = buf.getChannelData(0);
  return { l, r: buf.numberOfChannels > 1 ? buf.getChannelData(1) : l };
}

const loads = new Map<string, Promise<Clip | null>>();

/**
 * A song's clip (once per URL; the KEEP asked for last are kept). Null when it can't be had: the
 * DJ's remix plays alone then, as it did before.
 */
export function loadClip(url: string, get: (url: string) => Promise<{ l: Float32Array; r: Float32Array }> = fetchClip): Promise<Clip | null> {
  let p = loads.get(url);
  if (p) {
    loads.delete(url);
    loads.set(url, p);
    return p;
  }
  p = get(url)
    .then(({ l, r }) => clipOf(url, l, r))
    .catch(() => null);
  loads.set(url, p);
  while (loads.size > KEEP) loads.delete(loads.keys().next().value as string);
  return p;
}

/** Where a clip plays in the stream. */
type Play = {
  clip: Clip;
  /** stream frame `at` hears the clip's sample `src`, and every frame after it `step` samples on */
  at: number;
  src: number;
  step: number;
  /** on the night's beat: the deck's drums alone play under it (else it plays alone) */
  bed: boolean;
  /** the stream frame it's gone by, fading over the `fade` frames before it */
  to: number;
  fade: number;
};

/** How much of a play sounds at stream frame `f` (0 to 1). */
function env(p: Play, f: number): number {
  const a0 = p.at - IN_F;
  if (f < a0 || f >= p.to) return 0;
  let e = f < p.at ? (f - a0) / IN_F : 1;
  if (f > p.to - p.fade) e = Math.min(e, (p.to - f) / p.fade);
  return e;
}

/**
 * One deck's clip: set while its song is up next on the deck or on the air there; started on the
 * drop's bar (or the next bar line); mixed into the deck's sound as the DJ streams it.
 */
export class ClipDeck {
  /** the clip this deck has now */
  clip: Clip | null = null;
  private plays: Play[] = [];
  /** the clip has been started since it was set (it plays once) */
  private started = false;

  /** The deck's clip changes: whatever plays fades out from `sent` (the first frame not yet sent). */
  set(clip: Clip | null, sent: number) {
    if (clip === this.clip) return;
    this.clip = clip;
    this.started = false;
    for (const p of this.plays) this.cut(p, sent);
  }

  /** Set, and not started yet. */
  get waiting() {
    return !!this.clip && !this.started;
  }

  /** It plays on the night's beat at `bpm` (then the deck's drums alone play under it). */
  matches(bpm: number, clip: Clip | null = this.clip): boolean {
    return !!clip?.beat && matchRate(clip.beat.bpm, bpm, CLIP_MATCH) !== null;
  }

  /** The deck's drums alone are wanted: to go under a clip on the beat, waiting or playing. */
  wantsBed(bpm: number): boolean {
    return (this.waiting && this.matches(bpm)) || this.plays.some((p) => p.bed);
  }

  /**
   * The clip starts so its first strong downbeat lands on stream frame `at` (a bar line of the
   * night at `bpm`; `match` false: never on the night's beat). Asked again before any of it was
   * sent (a drop's count started over), it moves there; once it sounds, it stays.
   */
  start(at: number, bpm: number, sent: number, match = true) {
    const clip = this.clip;
    if (!clip) return;
    const mine = this.plays.find((p) => p.clip === clip && p.to > sent);
    if (mine) {
      if (mine.at - IN_F < sent) return;
      this.plays.splice(this.plays.indexOf(mine), 1);
    } else if (this.started) return;
    const r = match && clip.beat ? matchRate(clip.beat.bpm, bpm, CLIP_MATCH) : null;
    const step = r ?? 1;
    const frames = ((clip.end - clip.start) * RATE) / step;
    let to = at + frames;
    let fade = Math.round(1.5 * RATE);
    if (r !== null) {
      // on the beat: it ends on a bar line, the deck's own sound coming back over the bar before
      const bar = (4 * 60 * RATE) / bpm;
      to = at + Math.max(1, Math.floor(frames / bar)) * bar;
      fade = Math.round(Math.min(bar, 2 * RATE));
    }
    this.plays.push({ clip, at, src: clip.start * RATE, step, bed: r !== null, to, fade });
    this.started = true;
  }

  /** It sounds somewhere in the `n` frames from `f0` (the stream only goes on: what's over is let go). */
  live(f0: number, n: number): boolean {
    this.plays = this.plays.filter((p) => p.to > f0);
    return this.plays.some((p) => p.at - IN_F < f0 + n);
  }

  /**
   * Mix the clip into the deck's chunk from stream frame `f0` (in place): the deck's own sound gives
   * way to it, to `bed` (its drums alone, the same frames) when it's on the beat, else to nothing.
   * `scale`: how loud, from the stretch it plays in (`clipScale`).
   */
  mix(l: Float32Array, r: Float32Array, f0: number, bed: [Float32Array, Float32Array] | null, scale = 1) {
    const n = l.length;
    this.plays = this.plays.filter((p) => p.to > f0);
    const here = this.plays.filter((p) => p.at - IN_F < f0 + n);
    if (!here.length) return;
    for (let i = 0; i < n; i++) {
      const f = f0 + i;
      let w = 0;
      let wb = 0;
      let cl = 0;
      let cr = 0;
      for (const p of here) {
        const e = env(p, f);
        if (e <= 0) continue;
        const x = p.src + (f - p.at) * p.step;
        const g = e * p.clip.gain * scale;
        cl += g * sample(p.clip.l, x);
        cr += g * sample(p.clip.r, x);
        if (e > w) w = e;
        if (p.bed && e > wb) wb = e;
      }
      if (w <= 0) continue;
      l[i] = l[i] * (1 - w) + cl + (bed ? bed[0][i] * wb : 0);
      r[i] = r[i] * (1 - w) + cr + (bed ? bed[1][i] * wb : 0);
    }
  }

  /** A new stream: nothing plays, the clip waits to start again. */
  reset() {
    this.plays = [];
    this.started = false;
  }

  /** What it plays (the checks read it). */
  get playing(): { at: number; to: number; step: number; bed: boolean }[] {
    return this.plays.map((p) => ({ at: p.at, to: p.to, step: p.step, bed: p.bed }));
  }

  /** A play fades out from `frame` (or is dropped, if none of it was sent yet). */
  private cut(p: Play, frame: number) {
    if (p.at - IN_F >= frame) {
      p.to = p.at - IN_F;
      return;
    }
    if (p.to - p.fade <= frame) return;
    p.to = Math.min(p.to, frame + CUT_F);
    p.fade = Math.max(1, p.to - frame);
  }
}

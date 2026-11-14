import { SFX, sfxUrl } from "../../../shared/dj/sfx";

/** sounds at once at most (a new one stops the oldest) */
const VOICES = 4;
/** decoded sounds kept, in seconds of sound (about 11 MB at 48 kHz; the files themselves are kept too,
 *  5.5 MB in all): an iPhone as the TV reloads its page when memory runs short */
const KEEP_S = 60;
/** how fast a sound stopped for a new one fades */
const FADE_S = 0.08;

type Voice = { src: AudioBufferSourceNode; gain: GainNode };

/**
 * The big screen's sound board (shared/dj/sfx.ts, Steve on Nov 13): a sound a phone pressed plays at
 * once in this page's own sound, straight out (not through the DJ's chain: over a whole song too, and
 * while the DJ gives way). The files are fetched ahead once the music starts; a sound is decoded the
 * first time it's played and kept for a while.
 */
export class SfxPlayer {
  private bytes = new Map<number, Promise<ArrayBuffer | null>>();
  private decoded = new Map<number, AudioBuffer>();
  private voices: Voice[] = [];
  private out: GainNode;
  private gone = false;

  constructor(private ctx: AudioContext) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(ctx.destination);
  }

  /** Every file fetched ahead, one at a time (a press then only waits for its decoding). */
  async prefetch() {
    for (let i = 0; i < SFX.length && !this.gone; i++) await this.fetch(i);
  }

  private fetch(i: number): Promise<ArrayBuffer | null> {
    let p = this.bytes.get(i);
    if (!p) {
      p = fetch(sfxUrl(SFX[i]))
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
      this.bytes.set(i, p);
      // (a failed fetch is tried again on the next press)
      void p.then((b) => {
        if (!b) this.bytes.delete(i);
        // local runs: how many files the checks see fetched (scripts/dj_sfx_check.py)
        else if (import.meta.env.DEV) {
          const w = window as unknown as { __sfxFetched?: number };
          w.__sfxFetched = (w.__sfxFetched ?? 0) + 1;
        }
      });
    }
    return p;
  }

  /** Sound `i`, now. */
  async play(i: number) {
    if (this.gone || !SFX[i]) return;
    let buf = this.decoded.get(i);
    if (buf) this.decoded.delete(i);
    else {
      const b = await this.fetch(i);
      if (!b || this.gone) return;
      try {
        // (a copy: decoding hands the bytes over, and they're kept to decode again)
        buf = await this.ctx.decodeAudioData(b.slice(0));
      } catch {
        return;
      }
    }
    this.decoded.set(i, buf);
    this.trim();
    while (this.voices.length >= VOICES) this.stop(this.voices.shift()!);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const gain = this.ctx.createGain();
    src.connect(gain).connect(this.out);
    const v: Voice = { src, gain };
    src.onended = () => {
      this.voices = this.voices.filter((x) => x !== v);
    };
    src.start();
    this.voices.push(v);
    // local runs: what the checks read (scripts/dj_sfx_check.py)
    if (import.meta.env.DEV) {
      const w = window as unknown as { __sfx?: { i: number; n: number; voices: number } };
      w.__sfx = { i, n: (w.__sfx?.n ?? 0) + 1, voices: this.voices.length };
    }
  }

  private stop(v: Voice) {
    try {
      const t = this.ctx.currentTime;
      v.gain.gain.setTargetAtTime(0, t, FADE_S / 3);
      v.src.stop(t + FADE_S);
    } catch {
      /* already over */
    }
  }

  /** The decoded ones played longest ago go once they add up past KEEP_S. */
  private trim() {
    let total = 0;
    for (const b of this.decoded.values()) total += b.duration;
    for (const [i, b] of this.decoded) {
      if (total <= KEEP_S || this.decoded.size <= 1) break;
      this.decoded.delete(i);
      total -= b.duration;
    }
  }

  dispose() {
    this.gone = true;
    for (const v of this.voices) this.stop(v);
    this.voices = [];
    this.decoded.clear();
    try {
      this.out.disconnect();
    } catch {
      /* already */
    }
  }
}

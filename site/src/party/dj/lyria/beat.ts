/**
 * 打碟 · DJ Booth: where the beat falls in Lyria's stream. Lyria plays at the tempo it is asked for
 * but doesn't say where its beats land; the kick drum does. The low end of every chunk gives the
 * kicks' onsets; each onset's place within the beat goes into a running circular average, which
 * is the beat's offset from the start of the stream. A stream with no clear kick (a breakdown, an
 * intro) gives no answer, and the dancers keep the last one.
 */
export class KickClock {
  private lp = 0;
  private env = 0;
  private slow = 0;
  private armed = true;
  private lastOnset = -Infinity;
  private c = 0;
  private s = 0;
  private w = 0;
  private n = 0;
  private bpm: number;

  constructor(
    private rate = 48000,
    bpm = 125,
  ) {
    this.bpm = bpm;
  }

  get beatFrames() {
    return (this.rate * 60) / this.bpm;
  }

  /** A new tempo starts the average over. */
  setBpm(bpm: number) {
    if (bpm === this.bpm) return;
    this.bpm = bpm;
    this.c = this.s = this.w = 0;
    this.n = 0;
  }

  /** One chunk of the stream, `at` its first frame's place in the stream. */
  feed(l: Float32Array, r: Float32Array, at: number) {
    const rate = this.rate;
    const lpA = 1 - Math.exp((-2 * Math.PI * 120) / rate);
    const up = 1 - Math.exp(-1 / (0.004 * rate));
    const down = 1 - Math.exp(-1 / (0.06 * rate));
    const slowA = 1 / (0.6 * rate);
    const gap = 0.35 * this.beatFrames;
    let { lp, env, slow, armed, lastOnset } = this;
    for (let i = 0; i < l.length; i++) {
      lp += lpA * ((l[i] + r[i]) * 0.5 - lp);
      const v = Math.abs(lp);
      env += (v > env ? up : down) * (v - env);
      slow += slowA * (env - slow);
      const f = at + i;
      if (armed && env > 0.02 && env > slow * 1.8 && f - lastOnset > gap) {
        this.add(f, env);
        lastOnset = f;
        armed = false;
      } else if (!armed && env < slow * 1.1) armed = true;
    }
    Object.assign(this, { lp, env, slow, armed, lastOnset });
  }

  private add(frame: number, strength: number) {
    const b = this.beatFrames;
    // the low-pass and the envelope notice a kick about 4 ms after it starts
    const at = frame - 0.004 * this.rate;
    const phi = (2 * Math.PI * (((at % b) + b) % b)) / b;
    // the last half minute counts most: a drift or a new groove is followed
    const keep = 0.96;
    this.c = this.c * keep + Math.cos(phi) * strength;
    this.s = this.s * keep + Math.sin(phi) * strength;
    this.w = this.w * keep + strength;
    this.n += 1;
  }

  /** How sure: 0 (onsets everywhere in the beat) to 1 (all on the same spot). */
  sure() {
    return this.w ? Math.hypot(this.c, this.s) / this.w : 0;
  }

  /** Frames from the stream's start to its first beat (0 up to a beat), or null while unsure. */
  offset(): number | null {
    if (this.n < 4 || this.sure() < 0.5) return null;
    const phi = Math.atan2(this.s, this.c);
    const b = this.beatFrames;
    return ((((phi / (2 * Math.PI)) * b) % b) + b) % b;
  }
}

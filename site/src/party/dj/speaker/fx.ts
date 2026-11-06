/**
 * 打碟 · DJ Booth: the beginner deck's effects, on the speaker. Each one starts at an audio time the
 * caller picked on the beat (deck/driver.ts): the echo, the sweep, the horn, the siren, the laser,
 * the build-up (the music thins out from the bottom, a riser climbs, a snare rolls) and the drop (it
 * all slams back with a boom). They play through the speaker's own chain (speaker.ts), so the
 * stand-in and Lyria get them alike; the moves of the music itself (the brake, a rewind, a scratch)
 * and the crossfader live in the player.
 */
import { burst, busTo, crash, kick, noise, snare, type Bus } from "../../../lib/audio/engine";
import { bassDrop, nextTake, noiseOnce, rand, reverseCymbal, vinyl, whistle, type Take } from "./club";
import type { Speaker } from "./speaker";

const OPEN_HZ = 22000;
const CLOSED_HZ = 10;

/** A soft clip, for the horn's growl. */
function drive(k: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

export class DeckFx {
  private bus: Bus;
  private riser: { src: AudioBufferSourceNode; bp: BiquadFilterNode; gain: GainNode } | null = null;
  private sweepUntil = 0;
  private hornUntil = 0;
  private sirenUntil = 0;
  private until: Partial<Record<"bassdrop" | "reverse" | "whistle", number>> = {};
  /** The take each pad played last (one of five), so its next press is another. */
  private lastTake: Record<string, number> = {};

  constructor(private sp: Speaker) {
    this.bus = busTo(sp.ctx, sp.fxNodes.synth);
  }

  private get ctx() {
    return this.sp.ctx;
  }

  /**
   * How this press of a pad comes out (club.ts `nextTake`): one of five pitches across ±`cents`,
   * never the one it played last, and up to 1.5 dB louder or softer. The air horn mashed all night
   * stays the air horn without sounding like a machine (audio-design suggests about ±1 semitone and
   * ±2 dB for footsteps; these play over music, so less).
   */
  private take(pad: string, cents: number): Take {
    const { i, take } = nextTake(this.lastTake[pad], cents);
    this.lastTake[pad] = i;
    return take;
  }

  /** Echo: a bar of the music repeating itself, three quarters of a beat apart, dying away. */
  echo(at: number, beat: number) {
    const { send, delay } = this.sp.fxNodes;
    delay.delayTime.setValueAtTime(Math.min(1.9, 0.75 * beat), at);
    send.gain.cancelScheduledValues(at);
    send.gain.setTargetAtTime(0.55, at, 0.008);
    send.gain.setTargetAtTime(0, at + 4 * beat, 0.04);
    return true;
  }

  /** Sweep: the music closes down to a murmur over a bar, then opens again over the next. */
  sweep(at: number, beat: number) {
    if (at < this.sweepUntil) return false;
    const { lp } = this.sp.fxNodes;
    lp.frequency.cancelScheduledValues(at);
    lp.Q.cancelScheduledValues(at);
    lp.frequency.setValueAtTime(OPEN_HZ, at);
    lp.frequency.exponentialRampToValueAtTime(380, at + 4 * beat);
    lp.frequency.exponentialRampToValueAtTime(OPEN_HZ, at + 8 * beat);
    lp.Q.setValueAtTime(6, at);
    lp.Q.setValueAtTime(0.7, at + 8 * beat);
    this.sweepUntil = at + 8 * beat;
    return true;
  }

  /**
   * The air horn, the club's three blasts on the eighths (bwap, bwap, bwaaap; Steve on Nov 2:
   * "airhorn blasts"): a two-tone can horn (two reeds a major third apart, each three saws a hair
   * apart, fighting the air in a slow wobble) driven hard through the horn's brassy bands, with a
   * rush of air at each blast. Each bends up into its note; the long one sags as the can runs out.
   */
  horn(at: number, beat: number) {
    if (at < this.hornUntil) return false;
    const c = this.ctx;
    const take = this.take("horn", 25);
    const blasts: [number, number][] = [
      [0, 0.3],
      [0.5, 0.3],
      [1, 1.6],
    ];
    const end = at + 2.6 * beat;
    const shaper = c.createWaveShaper();
    shaper.curve = drive(3.2);
    const low = c.createBiquadFilter();
    low.type = "highpass";
    low.frequency.value = 220;
    const nose = c.createBiquadFilter();
    nose.type = "peaking";
    nose.frequency.value = 1650;
    nose.Q.value = 1.1;
    nose.gain.value = 7;
    const bite = c.createBiquadFilter();
    bite.type = "peaking";
    bite.frequency.value = 3100;
    bite.Q.value = 1.4;
    bite.gain.value = 4;
    const top = c.createBiquadFilter();
    top.type = "lowpass";
    top.frequency.value = 7200;
    const g = c.createGain();
    g.gain.value = 0;
    shaper.connect(low).connect(nose).connect(bite).connect(top).connect(g).connect(this.sp.fxNodes.synth);
    const wob = c.createOscillator();
    wob.frequency.value = 5.5;
    const wobHz = c.createGain();
    wobHz.gain.value = 3;
    wob.connect(wobHz);
    const reeds: [number, number][] = [
      [440, 1],
      [554.37, 0.55],
    ];
    for (const [f0, level] of reeds)
      for (const cents of [-7, 0, 7]) {
        const f = f0 * Math.pow(2, cents / 1200);
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.detune.value = take.cents;
        for (const [b, len] of blasts) {
          const t0 = at + b * beat;
          const t1 = t0 + len * beat;
          o.frequency.setValueAtTime(f * 0.82, t0);
          o.frequency.exponentialRampToValueAtTime(f, t0 + 0.06);
          if (len > 1) {
            o.frequency.setValueAtTime(f, t1 - 0.45 * len * beat);
            o.frequency.linearRampToValueAtTime(f * 0.955, t1);
          }
        }
        wobHz.connect(o.frequency);
        const v = c.createGain();
        v.gain.value = level / 3;
        o.connect(v).connect(shaper);
        o.start(at);
        o.stop(end + 0.05);
      }
    wob.start(at);
    wob.stop(end + 0.05);
    // the air: a hiss in the horn's band, loudest as each blast starts (made once, club.ts noiseOnce)
    const n = Math.ceil((2.6 * beat + 0.1) * c.sampleRate);
    const air = c.createBufferSource();
    air.buffer = noiseOnce(c, "horn-air", n, (d) => {
      const r = rand(7);
      for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
    });
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600;
    band.Q.value = 0.9;
    const airG = c.createGain();
    airG.gain.value = 0;
    air.connect(band).connect(airG).connect(g);
    for (const [b, len] of blasts) {
      const t0 = at + b * beat;
      const t1 = t0 + len * beat;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.24 * take.level, t0 + 0.012);
      g.gain.linearRampToValueAtTime(0.2 * take.level, t0 + 0.09);
      g.gain.setValueAtTime(0.2 * take.level, Math.max(t0 + 0.091, t1 - 0.04));
      g.gain.linearRampToValueAtTime(0, t1);
      airG.gain.setValueAtTime(0.5, t0);
      airG.gain.exponentialRampToValueAtTime(0.12, t0 + 0.08);
      airG.gain.setValueAtTime(0.12, Math.max(t0 + 0.081, t1 - 0.04));
      airG.gain.linearRampToValueAtTime(0, t1);
    }
    air.start(at);
    air.stop(end + 0.05);
    this.hornUntil = end;
    window.setTimeout(() => g.disconnect(), (end - c.currentTime + 1) * 1000);
    return true;
  }

  /** 黑胶: two bars of an old record (club.ts), the music darker under it (the sweep's filter: not while a sweep runs). */
  vinyl(at: number, beat: number) {
    if (at < this.sweepUntil) return false;
    const { lp } = this.sp.fxNodes;
    const end = at + 8 * beat;
    lp.frequency.cancelScheduledValues(at);
    lp.Q.cancelScheduledValues(at);
    lp.frequency.setValueAtTime(OPEN_HZ, at);
    lp.frequency.exponentialRampToValueAtTime(3400, at + 0.06);
    lp.Q.setValueAtTime(1.1, at);
    lp.frequency.setValueAtTime(3400, end - 0.06);
    lp.frequency.exponentialRampToValueAtTime(OPEN_HZ, end);
    lp.Q.setValueAtTime(0.7, end);
    this.sweepUntil = end;
    vinyl(this.ctx, this.sp.fxNodes.synth, at, beat);
    return true;
  }

  /** 低音炸弹, 反向镲, 口哨 (club.ts): one of each at a time (the boom and the whistle each a take of their own). */
  bassDrop(at: number, beat: number) {
    if (at < (this.until.bassdrop ?? 0)) return false;
    this.until.bassdrop = bassDrop(this.ctx, this.sp.fxNodes.synth, at, beat, this.take("bassdrop", 40));
    return true;
  }
  reverse(at: number, beat: number) {
    if (at < (this.until.reverse ?? 0)) return false;
    this.until.reverse = reverseCymbal(this.ctx, this.sp.fxNodes.synth, at, beat);
    return true;
  }
  whistle(at: number, beat: number) {
    if (at < (this.until.whistle ?? 0)) return false;
    this.until.whistle = whistle(this.ctx, this.sp.fxNodes.synth, at, beat, this.take("whistle", 30));
    return true;
  }

  /** The dub siren: a square wave whooping up and down, twice a beat, for two beats. */
  siren(at: number, beat: number) {
    if (at < this.sirenUntil) return false;
    const c = this.ctx;
    const end = at + 2 * beat;
    const take = this.take("siren", 30);
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = 620;
    o.detune.value = take.cents;
    const lfo = c.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 2 / beat;
    const depth = c.createGain();
    depth.gain.value = 380;
    lfo.connect(depth).connect(o.frequency);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    // (loud enough to call the floor over the music, or over a whole song)
    g.gain.linearRampToValueAtTime(0.35 * take.level, at + 0.02);
    g.gain.setValueAtTime(0.35 * take.level, end - 0.08);
    g.gain.linearRampToValueAtTime(0, end);
    o.connect(lp).connect(g).connect(this.sp.fxNodes.synth);
    for (const x of [o, lfo]) {
      x.start(at);
      x.stop(end + 0.05);
    }
    this.sirenUntil = end;
    window.setTimeout(() => g.disconnect(), (end - c.currentTime + 1) * 1000);
    return true;
  }

  /** Three laser zaps on the sixteenths, each a quick fall from high to low (each press a take of its own, wider than the others: it's a synth's zap, not an instrument). */
  laser(at: number, beat: number) {
    const c = this.ctx;
    const take = this.take("laser", 60);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1800;
    bp.Q.value = 0.5;
    bp.connect(this.sp.fxNodes.synth);
    const len = Math.min(0.16, (beat / 4) * 0.9);
    for (let k = 0; k < 3; k++) {
      const t0 = at + (k * beat) / 4;
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.detune.value = take.cents;
      o.frequency.setValueAtTime(3200, t0);
      o.frequency.exponentialRampToValueAtTime(180, t0 + len);
      const e = c.createGain();
      e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(0.6 * take.level, t0 + 0.004);
      e.gain.exponentialRampToValueAtTime(0.001, t0 + len);
      o.connect(e).connect(bp);
      o.start(t0);
      o.stop(t0 + len + 0.02);
    }
    window.setTimeout(() => bp.disconnect(), (at + beat - c.currentTime + 1) * 1000);
    return true;
  }

  private ensureRiser() {
    if (this.riser) return this.riser;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = noise(c);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 350;
    bp.Q.value = 1.2;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(bp).connect(gain).connect(this.sp.fxNodes.synth);
    src.start();
    this.riser = { src, bp, gain };
    return this.riser;
  }

  /** The build-up at `level` (0 to 1), from now: the bottom of the music falls away, the riser climbs. */
  build(level: number) {
    const now = this.ctx.currentTime;
    const l = Math.max(0, Math.min(1, level));
    this.sp.fxNodes.hp.frequency.setTargetAtTime(l > 0.01 ? 20 * Math.pow(45, l) : CLOSED_HZ, now, 0.15);
    if (l <= 0.01 && !this.riser) return;
    const r = this.ensureRiser();
    r.gain.gain.setTargetAtTime(0.09 * l * l, now, 0.15);
    r.bp.frequency.setTargetAtTime(350 * Math.pow(2, 4 * l), now, 0.15);
  }

  /** One hit of the build-up's snare roll. */
  roll(at: number, peak: number) {
    snare(this.bus, { at, abs: true, peak });
  }

  /** The drop at `at`: the build-up lets go at once, with a boom, a crash and a whoosh. */
  drop(at: number) {
    const { hp } = this.sp.fxNodes;
    hp.frequency.cancelScheduledValues(at);
    hp.frequency.setValueAtTime(CLOSED_HZ, at);
    if (this.riser) {
      this.riser.gain.gain.cancelScheduledValues(at);
      this.riser.gain.gain.setValueAtTime(0, at);
    }
    kick(this.bus, { at, abs: true, peak: 1, tone: 0.72 });
    crash(this.bus, { at, abs: true, peak: 0.24, decay: 2.4 });
    burst(this.bus, { at, abs: true, dur: 0.9, attack: 0.004, type: "bandpass", f: 5200, f2: 240, q: 1, peak: 0.07, wet: 0.3 });
  }

  /** Done with this speaker (the booth's screen went): everything off, and its own sounds unplugged. */
  dispose() {
    this.reset();
    try {
      this.riser?.src.stop();
      this.riser?.gain.disconnect();
      this.bus.out.disconnect();
    } catch {
      /* already gone */
    }
    this.riser = null;
  }

  /** Everything off, now (a new stream, the end of a set). */
  reset() {
    const now = this.ctx.currentTime;
    const { hp, lp, send } = this.sp.fxNodes;
    for (const p of [hp.frequency, lp.frequency, lp.Q, send.gain]) p.cancelScheduledValues(now);
    hp.frequency.setTargetAtTime(CLOSED_HZ, now, 0.05);
    lp.frequency.setTargetAtTime(OPEN_HZ, now, 0.05);
    lp.Q.setTargetAtTime(0.7, now, 0.05);
    send.gain.setTargetAtTime(0, now, 0.05);
    if (this.riser) {
      this.riser.gain.gain.cancelScheduledValues(now);
      this.riser.gain.gain.setTargetAtTime(0, now, 0.05);
    }
    this.sweepUntil = this.hornUntil = this.sirenUntil = 0;
    this.until = {};
  }
}

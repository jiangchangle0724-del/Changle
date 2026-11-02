/**
 * 打碟 · DJ Booth: the beginner deck's effects, on the speaker. Each one starts at an audio time the
 * caller picked on the beat (deck/driver.ts): the echo, the sweep, the horn, the siren, the laser,
 * the build-up (the music thins out from the bottom, a riser climbs, a snare rolls) and the drop (it
 * all slams back with a boom). They play through the speaker's own chain (speaker.ts), so the
 * stand-in and Lyria get them alike; the moves of the music itself (the brake, a rewind, a scratch)
 * and the crossfader live in the player.
 */
import { burst, busTo, crash, kick, noise, snare, type Bus } from "../../../lib/audio/engine";
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

  constructor(private sp: Speaker) {
    this.bus = busTo(sp.ctx, sp.fxNodes.synth);
  }

  private get ctx() {
    return this.sp.ctx;
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

  /** The air horn: two short blasts and a long one, on the eighths. */
  horn(at: number, beat: number) {
    if (at < this.hornUntil) return false;
    const c = this.ctx;
    const shaper = c.createWaveShaper();
    shaper.curve = drive(2.2);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1250;
    bp.Q.value = 0.55;
    const g = c.createGain();
    g.gain.value = 0;
    shaper.connect(bp).connect(g).connect(this.sp.fxNodes.synth);
    const end = at + 2.4 * beat;
    for (const f of [440, 443.2, 881.1]) {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, at);
      // the last blast sags as the air runs out
      o.frequency.setValueAtTime(f, at + 1.5 * beat);
      o.frequency.linearRampToValueAtTime(f * 0.94, end);
      o.connect(shaper);
      o.start(at);
      o.stop(end + 0.05);
    }
    for (const [b, len] of [
      [0, 0.38],
      [0.5, 0.38],
      [1, 1.25],
    ]) {
      const t0 = at + b * beat;
      const t1 = t0 + len * beat;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.14, t0 + 0.012);
      g.gain.setValueAtTime(0.14, Math.max(t0 + 0.013, t1 - 0.035));
      g.gain.linearRampToValueAtTime(0, t1);
    }
    this.hornUntil = end;
    window.setTimeout(() => g.disconnect(), (end - c.currentTime + 1) * 1000);
    return true;
  }

  /** The dub siren: a square wave whooping up and down, twice a beat, for two beats. */
  siren(at: number, beat: number) {
    if (at < this.sirenUntil) return false;
    const c = this.ctx;
    const end = at + 2 * beat;
    const o = c.createOscillator();
    o.type = "square";
    o.frequency.value = 620;
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
    g.gain.linearRampToValueAtTime(0.07, at + 0.02);
    g.gain.setValueAtTime(0.07, end - 0.08);
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

  /** Three laser zaps on the sixteenths, each a quick fall from high to low. */
  laser(at: number, beat: number) {
    const c = this.ctx;
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
      o.frequency.setValueAtTime(3200, t0);
      o.frequency.exponentialRampToValueAtTime(180, t0 + len);
      const e = c.createGain();
      e.gain.setValueAtTime(0, t0);
      e.gain.linearRampToValueAtTime(0.09, t0 + 0.004);
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
  }
}

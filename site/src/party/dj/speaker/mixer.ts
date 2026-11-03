/**
 * 打碟 · DJ Booth: the table's mixer (混音台) on the speaker, between the player and the deck's own
 * effects (speaker.ts), so it shapes whatever plays: the stand-in, Lyria, the host's songs, a clip.
 *
 *   player → EQ (low shelf, mid peak, high shelf) → filter (low-pass, high-pass)
 *     → crush (the music, and a lo-fi copy of it) → flanger (the music, and a swept short delay of it)
 *     → pump (a gain that ducks on every beat) → gate (a gain cut in sixteenths) → the deck's effects
 *
 * The knobs move smoothly, at once; the effects switch at an audio time the driver picks on the beat
 * (deck/driver.ts), which also writes the pump's and the gate's moves a little ahead, beat by beat.
 * Pure Web Audio on any context (the checks read its nodes).
 */
import type { MixKnob } from "../../../shared/dj/types";

/** where the EQ's bands turn (Hz) */
const LOW_HZ = 200;
const MID_HZ = 1000;
const HIGH_HZ = 4000;
/** a knob at -1 cuts its band by this much (dB), at 1 lifts it by this much */
const CUT_DB = 36;
const LIFT_DB = 6;
/** the filter: the low-pass closes in to this (Hz), the high-pass climbs to this, both a little resonant */
const LP_MIN_HZ = 300;
const HP_MAX_HZ = 2500;
const OPEN_HZ = 20000;
const FLOOR_HZ = 20;
/** how fast a knob's move is heard (seconds, a time constant) */
const GLIDE = 0.03;
/** the pump: how far the music ducks on each beat, and how fast it swells back (a part of the beat) */
const PUMP_LOW = 0.18;
const PUMP_BACK = 0.16;
/** the gate: closed this far; its sixteenths over a bar */
const GATE_LOW = 0.06;
export const GATE_STEPS = [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1];
/** the flanger: its delay and how far the sweep moves it (seconds), its feedback; one sweep every 8 beats */
const FLANGE_S = 0.003;
const FLANGE_DEPTH = 0.0025;
const FLANGE_FB = 0.6;
/** an effect's switch: dry and wet, on */
const CRUSH_DRY = 0.2;
const CRUSH_WET = 0.85;
const FLANGE_DRY = 0.7;
const FLANGE_WET = 0.7;

/** A knob's EQ gain (dB): -1 cuts the band out, 1 lifts it. */
export const eqDb = (v: number) => (v < 0 ? v * CUT_DB : v * LIFT_DB);

/** The filter knob's two filters: the low-pass's and the high-pass's corner (Hz) and resonance. */
export function filterOf(v: number): { lp: number; hp: number; q: number } {
  const x = Math.min(1, Math.abs(v));
  const q = 0.7 + 3 * x;
  if (v < 0) return { lp: OPEN_HZ * Math.pow(LP_MIN_HZ / OPEN_HZ, x), hp: FLOOR_HZ, q };
  if (v > 0) return { lp: OPEN_HZ, hp: FLOOR_HZ * Math.pow(HP_MAX_HZ / FLOOR_HZ, x), q };
  return { lp: OPEN_HZ, hp: FLOOR_HZ, q: 0.7 };
}

export class MixerChain {
  readonly input: GainNode;
  readonly output: GainNode;
  /** the nodes (the checks read them) */
  readonly eq: Record<"low" | "mid" | "high", BiquadFilterNode>;
  readonly lpf: BiquadFilterNode;
  readonly hpf: BiquadFilterNode;
  readonly crushDry: GainNode;
  readonly crushWet: GainNode;
  readonly flangeDry: GainNode;
  readonly flangeWet: GainNode;
  readonly pump: GainNode;
  readonly gate: GainNode;
  private crushIn: GainNode;
  private lfo: OscillatorNode;

  constructor(private ctx: BaseAudioContext) {
    const c = ctx;
    this.input = c.createGain();
    const low = c.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = LOW_HZ;
    const mid = c.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = MID_HZ;
    mid.Q.value = 0.8;
    const high = c.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = HIGH_HZ;
    for (const f of [low, mid, high]) f.gain.value = 0;
    this.eq = { low, mid, high };
    this.lpf = c.createBiquadFilter();
    this.lpf.type = "lowpass";
    this.lpf.frequency.value = OPEN_HZ;
    this.lpf.Q.value = 0.7;
    this.hpf = c.createBiquadFilter();
    this.hpf.type = "highpass";
    this.hpf.frequency.value = FLOOR_HZ;
    this.hpf.Q.value = 0.7;
    this.input.connect(low).connect(mid).connect(high).connect(this.lpf).connect(this.hpf);

    // crush: the music, and a lo-fi copy (the crusher joins once the player's module is in: attachCrusher)
    const afterCrush = c.createGain();
    this.crushDry = c.createGain();
    this.crushWet = c.createGain();
    this.crushWet.gain.value = 0;
    this.crushIn = c.createGain();
    this.hpf.connect(this.crushDry).connect(afterCrush);
    this.hpf.connect(this.crushIn);
    this.crushWet.connect(afterCrush);

    // flanger: the music, and a short delay of it swept back and forth, fed back into itself
    const afterFlange = c.createGain();
    this.flangeDry = c.createGain();
    this.flangeWet = c.createGain();
    this.flangeWet.gain.value = 0;
    const delay = c.createDelay(0.05);
    delay.delayTime.value = FLANGE_S;
    const fb = c.createGain();
    fb.gain.value = FLANGE_FB;
    this.lfo = c.createOscillator();
    this.lfo.type = "sine";
    this.lfo.frequency.value = 125 / 60 / 8;
    const depth = c.createGain();
    depth.gain.value = FLANGE_DEPTH;
    this.lfo.connect(depth).connect(delay.delayTime);
    this.lfo.start();
    afterCrush.connect(this.flangeDry).connect(afterFlange);
    afterCrush.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(this.flangeWet).connect(afterFlange);

    // pump, then gate: two gains the driver moves on the beat
    this.pump = c.createGain();
    this.gate = c.createGain();
    this.output = c.createGain();
    afterFlange.connect(this.pump).connect(this.gate).connect(this.output);
  }

  /** The crusher (an AudioWorklet node beside the player's): on the lo-fi copy's path. */
  attachCrusher(node: AudioNode) {
    this.crushIn.connect(node).connect(this.crushWet);
  }

  /** A knob to `v` (-1 to 1), heard from `at` with a short glide. */
  knob(k: MixKnob, v: number, at: number) {
    if (k === "filter") {
      const f = filterOf(v);
      this.glide(this.lpf.frequency, f.lp, at);
      this.glide(this.hpf.frequency, f.hp, at);
      this.glide(this.lpf.Q, v < 0 ? f.q : 0.7, at);
      this.glide(this.hpf.Q, v > 0 ? f.q : 0.7, at);
      return;
    }
    this.glide(this.eq[k].gain, eqDb(v), at);
  }

  /** Crush or the flanger on or off from `at` (a beat). */
  fx(f: "crush" | "flange", on: boolean, at: number) {
    const [dry, wet] = f === "crush" ? [this.crushDry, this.crushWet] : [this.flangeDry, this.flangeWet];
    const [d, w] = f === "crush" ? [CRUSH_DRY, CRUSH_WET] : [FLANGE_DRY, FLANGE_WET];
    this.glide(dry.gain, on ? d : 1, at, 0.008);
    this.glide(wet.gain, on ? w : 0, at, 0.008);
  }

  /** The flanger sweeps once every 8 beats. */
  tempo(bpm: number) {
    this.lfo.frequency.setTargetAtTime(bpm / 60 / 8, this.ctx.currentTime, 0.1);
  }

  /** The pump on the beat at `t`: down at once, back up over a part of the beat (as under a sidechained kick). */
  pumpBeat(t: number, beat: number) {
    const g = this.pump.gain;
    g.setValueAtTime(1, t);
    g.linearRampToValueAtTime(PUMP_LOW, t + 0.008);
    g.setTargetAtTime(1, t + 0.008, PUMP_BACK * beat);
  }

  /** The pump off from the beat at `t` (where it's back up). */
  pumpOff(t: number) {
    const g = this.pump.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(1, t);
  }

  /** The gate's sixteenth at `t`: open or closed (a few milliseconds' slope, no click). */
  gateStep(t: number, open: boolean) {
    this.gate.gain.setTargetAtTime(open ? 1 : GATE_LOW, t, 0.002);
  }

  /** The gate open from `t`. */
  gateOff(t: number) {
    const g = this.gate.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(1, t, 0.003);
  }

  /** Everything as the music plays, now (the end of a set). */
  reset() {
    const now = this.ctx.currentTime;
    for (const k of ["low", "mid", "high", "filter"] as const) this.knob(k, 0, now);
    this.fx("crush", false, now);
    this.fx("flange", false, now);
    this.pumpOff(now);
    this.gateOff(now);
  }

  private glide(p: AudioParam, v: number, at: number, tc = GLIDE) {
    p.cancelScheduledValues(at);
    p.setTargetAtTime(v, at, tc);
  }
}

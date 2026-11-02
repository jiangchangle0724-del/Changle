/**
 * 打碟 · DJ Booth: the speaker's player. It runs on the audio thread (an AudioWorklet), so the
 * page being busy never stops the music.
 *
 * PCM arrives from the page in chunks (the stand-in DJ now, Lyria RealTime's stream later: 48 kHz
 * stereo) and waits in a ring buffer. Nothing plays until `prebuffer` seconds are waiting. If the
 * buffer runs dry, the sound fades out over the last few milliseconds instead of clicking, the
 * player waits for `resume` seconds to build up again and fades back in. A stream at another rate
 * than the speaker's own is resampled (cubic) on the way out.
 *
 * Two decks, in step (the beginner deck): every chunk can carry deck B's frames beside deck A's,
 * for the same stretch of the stream, and the `xfade` parameter (0 all A, 1 all B) blends them at
 * equal power as they play, so the crossfader answers at once, however far ahead the music waits.
 * A chunk without deck B (B has nothing of its own yet: no style, or not recorded in time), or
 * with only the ring-out of B's last section (`own: false`), plays deck A alone wherever the fader
 * is, never silence; where B's own music starts or stops, the blend follows from that frame on,
 * smoothed like a move of the fader (so a tail fades rather than clicks).
 *
 * Moves of the music itself, each from audio time `at`, back at `until` exactly where the stream
 * would have been (its clock never stops: the beat, and everything waiting, stay where they were):
 *   brake    a tape stop: slower and lower to a stop over `dur`, quiet until `until`
 *   rewind   pulled back: it slows, spins backwards faster and faster for `dur`, fading, quiet
 *            until `until`
 *   scratch  a hand on the record: back and forth twice over `dur`, the sound cut where it turns
 *
 * In (port):  { t: "pcm", l, r, l2?, r2?, own? }   one chunk, planar, at `rate` (l2/r2: deck B;
 *             own false: only B's ring-out)
 *             { t: "flush" }   drop what is waiting (a new stream starts with a full prebuffer)
 *             { t: "move", kind, at, dur, until }   a move, audio times in seconds ("brake" works
 *             as kind "brake")
 * Out:        { t: "tick", pos, written, time, state, stalls, drops }   about 23 times a second:
 *             at audio time `time` the next frame out is source frame `pos` (frames since the
 *             stream began); `written` frames have arrived in all.
 *
 * Plain JavaScript in one file: an AudioWorklet module loads on its own, without the site's build.
 */

const FADE_S = 0.04;
const TICK_QUANTA = 16;
const HALF_PI = Math.PI / 2;
/** the crossfader is smoothed over about this long: no zipper noise, still at once to the ear */
const XFADE_S = 0.006;
const MOVE_KINDS = ["brake", "rewind", "scratch"];
/** the rewind's top speed backwards, and the scratch's forwards and back */
const REWIND_SPEED = 3.5;
const SCRATCH_SPEED = 2.6;

/**
 * A move's playback rate and loudness `u` of the way through it (0 to 1; past 1: the quiet until
 * it comes back). The loudness also dips wherever the rate passes through nothing.
 */
function moveAt(kind, u) {
  if (kind === "brake") return u >= 1 ? [0, 0] : [Math.max(0, 1 - u), 1];
  if (kind === "rewind") {
    if (u >= 1) return [0, 0];
    const rate = u < 0.3 ? 1 - (1 + REWIND_SPEED) * (u / 0.3) : -REWIND_SPEED;
    return [rate, u > 0.6 ? Math.max(0, 1 - (u - 0.6) / 0.4) : 1];
  }
  // scratch: twice back and forth, ending where it began
  if (u >= 1) return [1, 1];
  return [SCRATCH_SPEED * Math.sin(2 * Math.PI * 2 * u), 1];
}

class DjPlayer extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "xfade", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" }];
  }

  constructor(options) {
    super(options);
    const o = (options && options.processorOptions) || {};
    this.rate = o.rate || 48000;
    this.cap = Math.ceil((o.seconds || 16) * this.rate);
    this.L = new Float32Array(this.cap);
    this.R = new Float32Array(this.cap);
    // deck B, frame for frame beside deck A, and whether B has music of its own at that frame
    this.L2 = new Float32Array(this.cap);
    this.R2 = new Float32Array(this.cap);
    this.HB = new Uint8Array(this.cap);
    this.written = 0; // source frames that have arrived, all told
    this.pos = 0; // the next source frame to play (fractional when resampling)
    this.vpos = 0; // where the stream would be without a move (the same, but in one)
    this.move = null;
    this.back = 1; // the fade back in after a move
    this.xs = 0; // the crossfader, smoothed
    this.xk = 1 - Math.exp(-1 / (XFADE_S * sampleRate));
    this.step = this.rate / sampleRate;
    this.prebuffer = Math.round((o.prebuffer ?? 2.5) * this.rate);
    this.resumeAt = Math.round((o.resume ?? 1.5) * this.rate);
    this.fadeFrames = Math.max(1, Math.round(FADE_S * this.rate));
    // "waiting" (never played, or flushed) | "playing" | "buffering" (ran dry)
    this.state = "waiting";
    this.gain = 0;
    this.gainStep = 1 / Math.max(1, Math.round(FADE_S * sampleRate));
    this.stalls = 0;
    this.drops = 0;
    this.quanta = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(m) {
    if (!m || typeof m !== "object") return;
    if (m.t === "pcm") this.push(m.l, m.r, m.l2, m.r2, m.own !== false);
    else if (m.t === "flush") {
      this.pos = this.written;
      this.vpos = this.written;
      this.move = null;
      this.state = "waiting";
      this.gain = 0;
    } else if ((m.t === "move" || m.t === "brake") && Number.isFinite(m.at) && Number.isFinite(m.until) && m.until > m.at) {
      const kind = m.t === "brake" ? "brake" : MOVE_KINDS.includes(m.kind) ? m.kind : null;
      if (kind) this.move = { kind, at: m.at, dur: Math.max(0.01, Number(m.dur) || 0.3), until: m.until };
    }
  }

  push(l, r, l2, r2, own = true) {
    if (!(l instanceof Float32Array)) return;
    const right = r instanceof Float32Array && r.length === l.length ? r : l;
    const b = l2 instanceof Float32Array && l2.length === l.length ? l2 : null;
    const bR = b && r2 instanceof Float32Array && r2.length === l.length ? r2 : b;
    const mine = b && own ? 1 : 0;
    let n = l.length;
    let from = 0;
    if (n > this.cap) {
      from = n - this.cap;
      n = this.cap;
    }
    // no room: the oldest waiting audio goes, so the delay never grows past the ring
    const over = this.written + n - Math.floor(this.pos) - this.cap + 4;
    if (over > 0) {
      this.pos += over;
      this.vpos = Math.max(this.vpos, this.pos);
      this.drops += over;
    }
    for (let i = 0; i < n; i++) {
      const k = (this.written + i) % this.cap;
      this.L[k] = l[from + i];
      this.R[k] = right[from + i];
      this.L2[k] = b ? b[from + i] : 0;
      this.R2[k] = b ? bR[from + i] : 0;
      this.HB[k] = mine;
    }
    this.written += n;
  }

  /** Cubic (Hermite) read between source frames; plain copy when the rates match. */
  read(ch, p) {
    const i = Math.floor(p);
    const f = p - i;
    const cap = this.cap;
    const x1 = ch[i % cap];
    if (f === 0) return x1;
    const x0 = ch[(i - 1 + cap) % cap];
    const x2 = ch[(i + 1) % cap];
    const x3 = ch[(i + 2) % cap];
    const c1 = 0.5 * (x2 - x0);
    const c2 = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3;
    const c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
    return ((c3 * f + c2) * f + c1) * f + x1;
  }

  process(_inputs, outputs, parameters) {
    // where this block starts, for the page's clock (the stream's own place: a brake doesn't stop it)
    const pos0 = this.vpos;
    const time0 = currentTime;
    const out = outputs[0];
    const oL = out[0];
    const oR = out[1] || out[0];
    const frames = oL.length;
    const xf = parameters && parameters.xfade && parameters.xfade.length ? parameters.xfade[0] : 0;
    // frames needed past the read point to interpolate
    const guard = this.step === 1 ? 1 : 3;
    for (let j = 0; j < frames; j++) {
      const avail = this.written - this.pos;
      if (this.state !== "playing") {
        const need = this.state === "waiting" ? this.prebuffer : this.resumeAt;
        if (avail >= Math.min(need, this.cap - 8)) this.state = "playing";
      }
      if (this.state === "playing" && avail < guard) {
        // ran dry (the fade below already brought it down to silence)
        this.state = "buffering";
        this.stalls += 1;
      }
      // the fader, except where deck B has nothing: deck A alone there
      const x = this.HB[Math.floor(this.pos) % this.cap] ? xf : 0;
      this.xs += (x - this.xs) * this.xk;
      if (this.state !== "playing") {
        this.gain = 0;
        oL[j] = 0;
        if (oR !== oL) oR[j] = 0;
        continue;
      }
      // a move: the brake, a rewind, a scratch; then back where the stream has got to
      let rate = 1;
      let loud = 1;
      const mv = this.move;
      if (mv) {
        const t = time0 + j / sampleRate;
        if (t >= mv.until) {
          this.pos = Math.min(this.vpos, this.written - guard);
          this.move = null;
          this.back = 0;
        } else if (t >= mv.at) [rate, loud] = moveAt(mv.kind, (t - mv.at) / mv.dur);
      }
      // fade in after a start; fade out as the last frames drain, reaching 0 as they run out
      this.gain = Math.min(1, this.gain + this.gainStep);
      this.back = Math.min(1, this.back + this.gainStep * 4);
      const left = this.written - this.pos;
      const drain = (left - guard) / this.fadeFrames;
      let g = drain < 1 ? Math.min(this.gain, Math.max(0, drain)) : this.gain;
      // the last moment of a slowing move fades to nothing rather than crawling (and a scratch's
      // turns cut the sound, as a hand on the record does)
      const speed = Math.abs(rate);
      if (speed < 0.08) g *= speed / 0.08;
      g *= this.back * loud;
      const p = this.pos;
      const gA = Math.cos(this.xs * HALF_PI);
      const gB = Math.sin(this.xs * HALF_PI);
      let l = this.read(this.L, p) * gA;
      let r = this.read(this.R, p) * gA;
      if (gB > 1e-4) {
        l += this.read(this.L2, p) * gB;
        r += this.read(this.R2, p) * gB;
      }
      oL[j] = l * g;
      if (oR !== oL) oR[j] = r * g;
      // (backwards never past what the ring still holds, nor before the stream began)
      this.pos = Math.max(1, this.written - this.cap + 8, p + this.step * rate);
      this.vpos = mv && this.move ? this.vpos + this.step : this.pos;
    }
    if (++this.quanta % TICK_QUANTA === 0) this.port.postMessage({ t: "tick", pos: pos0, written: this.written, time: time0, state: this.state, stalls: this.stalls, drops: this.drops });
    return true;
  }
}

registerProcessor("dj-player", DjPlayer);

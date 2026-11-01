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
 * In (port):  { t: "pcm", l: Float32Array, r: Float32Array }   one chunk, planar, at `rate`
 *             { t: "flush" }   drop what is waiting (a new stream starts with a full prebuffer)
 * Out:        { t: "tick", pos, written, time, state, stalls, drops }   about 23 times a second:
 *             at audio time `time` the next frame out is source frame `pos` (frames since the
 *             stream began); `written` frames have arrived in all.
 *
 * Plain JavaScript in one file: an AudioWorklet module loads on its own, without the site's build.
 */

const FADE_S = 0.04;
const TICK_QUANTA = 16;

class DjPlayer extends AudioWorkletProcessor {
  constructor(options) {
    super(options);
    const o = (options && options.processorOptions) || {};
    this.rate = o.rate || 48000;
    this.cap = Math.ceil((o.seconds || 16) * this.rate);
    this.L = new Float32Array(this.cap);
    this.R = new Float32Array(this.cap);
    this.written = 0; // source frames that have arrived, all told
    this.pos = 0; // the next source frame to play (fractional when resampling)
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
    if (m.t === "pcm") this.push(m.l, m.r);
    else if (m.t === "flush") {
      this.pos = this.written;
      this.state = "waiting";
      this.gain = 0;
    }
  }

  push(l, r) {
    if (!(l instanceof Float32Array)) return;
    const right = r instanceof Float32Array && r.length === l.length ? r : l;
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
      this.drops += over;
    }
    for (let i = 0; i < n; i++) {
      const k = (this.written + i) % this.cap;
      this.L[k] = l[from + i];
      this.R[k] = right[from + i];
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

  process(_inputs, outputs) {
    // where this block starts, for the page's clock
    const pos0 = this.pos;
    const time0 = currentTime;
    const out = outputs[0];
    const oL = out[0];
    const oR = out[1] || out[0];
    const frames = oL.length;
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
      if (this.state !== "playing") {
        this.gain = 0;
        oL[j] = 0;
        if (oR !== oL) oR[j] = 0;
        continue;
      }
      // fade in after a start; fade out as the last frames drain, reaching 0 as they run out
      this.gain = Math.min(1, this.gain + this.gainStep);
      const drain = (avail - guard) / this.fadeFrames;
      const g = drain < 1 ? Math.min(this.gain, Math.max(0, drain)) : this.gain;
      const p = this.pos;
      oL[j] = this.read(this.L, p) * g;
      if (oR !== oL) oR[j] = this.read(this.R, p) * g;
      this.pos = p + this.step;
    }
    if (++this.quanta % TICK_QUANTA === 0) this.port.postMessage({ t: "tick", pos: pos0, written: this.written, time: time0, state: this.state, stalls: this.stalls, drops: this.drops });
    return true;
  }
}

registerProcessor("dj-player", DjPlayer);

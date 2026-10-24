// Sounds in the golden-age-of-travel style, synthesised in the browser (no files to download or
// license): the airport chime, a rubber stamp, a till, an auctioneer's gavel, a propeller plane.
// Recorded city sounds come with the city content in step 6.
// Phones (and WeChat) only allow sound after a tap, so the first tap unlocks it.
let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio() {
  try {
    if (ctx) {
      if (ctx.state === "suspended") void ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch {
    ctx = null;
  }
}

export function installAudioUnlock() {
  for (const ev of ["pointerdown", "touchend", "keydown"]) document.addEventListener(ev, unlockAudio, { passive: true });
  // iOS WeChat fires this when its bridge is ready; sound can start without a tap.
  document.addEventListener("WeixinJSBridgeReady", unlockAudio);
}

export const setMuted = (m: boolean) => (muted = m);

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number } = {}) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + (opts.at ?? 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(opts.vol ?? 0.12, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A burst of filtered noise: paper, wood, wind. */
function burst(dur: number, o: { vol?: number; at?: number; type?: BiquadFilterType; freq?: number; q?: number; sweep?: number } = {}) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime + (o.at ?? 0);
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  filter.type = o.type ?? "bandpass";
  filter.frequency.setValueAtTime(o.freq ?? 1200, t0);
  if (o.sweep) filter.frequency.exponentialRampToValueAtTime(o.sweep, t0 + dur);
  filter.Q.value = o.q ?? 0.8;
  gain.gain.value = o.vol ?? 0.1;
  src.buffer = buf;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t0);
}

export const sfx = {
  /** The airport announcement chime: your turn. */
  turn: () => {
    tone(784, 0.5, { vol: 0.1 });
    tone(659, 0.5, { vol: 0.1, at: 0.28 });
    tone(523, 0.7, { vol: 0.1, at: 0.56 });
  },
  /** Two dice rattling in a wooden cup. */
  dice: () => {
    [0, 0.06, 0.11, 0.19].forEach((at, i) => burst(0.04, { at, freq: 1800 + i * 300, q: 4, vol: 0.12 }));
  },
  /** The till: a bell and the drawer. */
  coin: () => {
    burst(0.05, { freq: 2500, q: 1.5, vol: 0.08 });
    tone(1568, 0.25, { type: "triangle", vol: 0.07, at: 0.04 });
    tone(2093, 0.35, { type: "triangle", vol: 0.06, at: 0.09 });
  },
  pay: () => tone(392, 0.28, { type: "triangle", slide: 262, vol: 0.1 }),
  /** A quiz-show buzzer, but polite: a question the waiting teams can answer. */
  ask: () => {
    tone(988, 0.12, { type: "square", vol: 0.035 });
    tone(1319, 0.2, { type: "square", vol: 0.035, at: 0.11 });
  },
  /** The auctioneer's gavel. */
  bid: () => {
    burst(0.05, { type: "lowpass", freq: 900, vol: 0.25 });
    tone(150, 0.08, { vol: 0.16 });
  },
  /** A rubber stamp on a passport page. */
  stamp: () => {
    tone(110, 0.12, { vol: 0.22, slide: 70 });
    burst(0.07, { freq: 900, q: 0.7, vol: 0.18, at: 0.01 });
  },
  /** A ship's horn: time's up, or a party forfeit. */
  alert: () => {
    tone(196, 0.5, { type: "sawtooth", vol: 0.05 });
    tone(247, 0.5, { type: "sawtooth", vol: 0.04 });
  },
  /** A propeller plane passing over: a token flies to another region (big screen). */
  flight: () => {
    burst(1.4, { type: "bandpass", freq: 300, sweep: 1400, q: 1.2, vol: 0.16 });
    tone(55, 1.2, { type: "sawtooth", vol: 0.025, slide: 70 });
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.26, { at: i * 0.13, type: "triangle" }));
    tone(1319, 0.6, { at: 0.55, type: "triangle", vol: 0.08 });
  },
};

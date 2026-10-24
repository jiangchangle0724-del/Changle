// Placeholder sounds, synthesised (no files to license). Real city sounds come in steps 5-6.
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

function noise(dur: number, vol = 0.08) {
  if (muted || !ctx || ctx.state !== "running") return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.buffer = buf;
  src.connect(gain).connect(ctx.destination);
  src.start();
}

export const sfx = {
  turn: () => {
    tone(660, 0.12);
    tone(880, 0.18, { at: 0.12 });
  },
  dice: () => {
    noise(0.08);
    tone(300, 0.05, { type: "square", vol: 0.04, at: 0.09 });
    tone(360, 0.05, { type: "square", vol: 0.04, at: 0.16 });
  },
  coin: () => {
    tone(988, 0.08, { type: "triangle" });
    tone(1319, 0.14, { type: "triangle", at: 0.07 });
  },
  pay: () => tone(440, 0.18, { type: "triangle", slide: 300 }),
  bid: () => tone(740, 0.07, { type: "square", vol: 0.05 }),
  stamp: () => {
    noise(0.05, 0.15);
    tone(120, 0.1, { vol: 0.2 });
  },
  alert: () => {
    tone(523, 0.1);
    tone(523, 0.1, { at: 0.16 });
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { at: i * 0.13, type: "triangle" })),
};

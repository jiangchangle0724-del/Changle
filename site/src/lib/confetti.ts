/**
 * Confetti on a canvas: a few hundred paper bits with gravity, drag and flutter, drawn in one
 * requestAnimationFrame loop that stops itself when the last bit has fallen out of sight.
 */

type Bit = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string; life: number; flip: number; vf: number };

export type ConfettiOpts = {
  /** where it bursts from, as fractions of the canvas (0..1) */
  x?: number;
  y?: number;
  count?: number;
  /** spread in degrees around `angle` (straight up is -90) */
  spread?: number;
  angle?: number;
  /** launch speed in canvas px per frame at 60fps */
  power?: number;
  colors?: string[];
};

const DEFAULT_COLORS = ["#e765f0", "#ffb82e", "#31b9ff", "#4be38f", "#ff5fa2", "#f5df3b", "#f5f4fd"];

const running = new WeakMap<HTMLCanvasElement, { bits: Bit[]; raf: number }>();

export function confetti(canvas: HTMLCanvasElement | null, opts: ConfettiOpts = {}) {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const colors = opts.colors ?? DEFAULT_COLORS;
  const count = Math.min(400, opts.count ?? 160);
  const spread = ((opts.spread ?? 70) * Math.PI) / 180;
  const angle = ((opts.angle ?? -90) * Math.PI) / 180;
  const power = (opts.power ?? 22) * dpr;
  const ox = (opts.x ?? 0.5) * w;
  const oy = (opts.y ?? 0.7) * h;

  const state = running.get(canvas) ?? { bits: [], raf: 0 };
  for (let i = 0; i < count; i++) {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = power * (0.45 + Math.random() * 0.75);
    state.bits.push({
      x: ox,
      y: oy,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      w: (6 + Math.random() * 7) * dpr,
      h: (9 + Math.random() * 9) * dpr,
      color: colors[(Math.random() * colors.length) | 0],
      life: 0,
      flip: Math.random() * Math.PI,
      vf: 0.08 + Math.random() * 0.18,
    });
  }
  running.set(canvas, state);
  if (state.raf) return;

  let last = performance.now();
  const step = (t: number) => {
    const k = Math.min(3, (t - last) / 16.67);
    last = t;
    ctx.clearRect(0, 0, w, h);
    const g = 0.42 * dpr * k;
    state.bits = state.bits.filter((b) => b.y < h + 40 * dpr && b.life < 600);
    for (const b of state.bits) {
      b.life += k;
      b.vx *= Math.pow(0.985, k);
      b.vy = b.vy * Math.pow(0.985, k) + g;
      // paper flutters: it drifts sideways as it turns
      b.flip += b.vf * k;
      b.x += (b.vx + Math.sin(b.flip) * 0.9 * dpr) * k;
      b.y += Math.min(b.vy, 7 * dpr) * k;
      b.rot += b.vr * k;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.scale(1, Math.cos(b.flip));
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (state.bits.length) state.raf = requestAnimationFrame(step);
    else {
      state.raf = 0;
      ctx.clearRect(0, 0, w, h);
    }
  };
  state.raf = requestAnimationFrame(step);
}

/** Stop and clear (when the scene goes away). */
export function clearConfetti(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const st = running.get(canvas);
  if (st?.raf) cancelAnimationFrame(st.raf);
  running.delete(canvas);
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}

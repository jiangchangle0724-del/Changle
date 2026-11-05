/**
 * The spin on the game board: a light walks across the tiles, slowing into the target.
 * Pure timing so every phone at an online table can replay the same walk from the same plan.
 */
export function sweepPlan(count: number, from: number, to: number, laps = 2) {
  const steps = laps * count + ((to - from + count) % count || count);
  const times: number[] = [];
  let at = 0;
  for (let s = 1; s <= steps; s++) {
    times.push(at);
    const p = s / steps;
    at += 0.035 + Math.pow(p, 3) * 0.32;
  }
  return { steps, times, duration: at };
}

export function runSweep(
  count: number,
  from: number,
  to: number,
  opts: { laps?: number; duration?: number; onStep: (idx: number, progress: number) => void; onDone: () => void },
) {
  const plan = sweepPlan(count, from, to, opts.laps ?? 2);
  const scale = opts.duration ? opts.duration / plan.duration : 1;
  // each step on its own timer, all measured from the start (so they don't drift); the walk ends
  // with its last step
  const timers = plan.times.map((t, i) =>
    window.setTimeout(() => {
      opts.onStep((from + i + 1) % count, (i + 1) / plan.steps);
      if (i === plan.steps - 1) opts.onDone();
    }, t * scale * 1000),
  );
  return { kill: () => timers.forEach((id) => window.clearTimeout(id)) };
}

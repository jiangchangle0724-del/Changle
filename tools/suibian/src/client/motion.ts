/** Small, disposable moves. The server's state and the voting rules never depend on motion. */
export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function duration(token: "enter" | "exit" | "emphasis"): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--dur-${token}`).trim();
  return parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
}

export function buzz(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* Unsupported or blocked by the phone. */ }
}

const running = new WeakMap<HTMLElement, () => void>();

/** Remove the trigger at the end, so another state message cannot replay a finished move. */
export function play(el: HTMLElement, move: string, end?: (name: string) => void, finish?: string) {
  const restarting = running.has(el);
  running.get(el)?.();
  if (restarting) void el.offsetWidth;
  el.dataset.anim = move;
  const clean = () => {
    el.removeEventListener("animationend", done);
    el.removeEventListener("animationcancel", cancel);
    delete el.dataset.anim;
    running.delete(el);
  };
  const done = (event: AnimationEvent) => {
    if (event.target !== el) return;
    end?.(event.animationName);
    if (!finish || event.animationName === finish || event.animationName === "fade") clean();
  };
  const cancel = (event: AnimationEvent) => {
    // A quick second tap cancels the old move. Its queued event must not clear the new one.
    if (event.target === el && !el.getAnimations().some((animation) => animation.pending || animation.playState === "running")) clean();
  };
  el.addEventListener("animationend", done);
  el.addEventListener("animationcancel", cancel);
  running.set(el, clean);
  return clean;
}

/** Only the first six blocks travel; subsequent arrivals are quiet fades. */
export function enter(el: HTMLElement, index: number, first = true) {
  el.style.setProperty("--enter-order", String(first && index < 6 ? index : 0));
  return play(el, first && index < 6 ? "rise" : "fade");
}

export function moodTap(el: HTMLButtonElement, next: "like" | "ban" | "none") {
  play(el, `mood-${next}`);
  if (next !== "none") buzz(next === "like" ? 8 : [6, 30, 6]);
}

/** The fill lives below the label. Keyboard activation spreads from the button's centre. */
export function fillFrom(el: HTMLButtonElement, event: MouseEvent) {
  const fill = el.querySelector<HTMLElement>(".approve-fill");
  if (!fill) return;
  fill.getAnimations().forEach((animation) => animation.cancel());
  if (reduced()) { play(fill, "fade"); return; }
  const rect = el.getBoundingClientRect();
  const x = event.detail ? event.clientX - rect.left : rect.width / 2;
  const y = event.detail ? event.clientY - rect.top : rect.height / 2;
  const easing = getComputedStyle(document.documentElement).getPropertyValue("--ease-out").trim();
  const animation = fill.animate([
    { clipPath: `circle(0% at ${x}px ${y}px)` },
    { clipPath: `circle(150% at ${x}px ${y}px)` },
  ], { duration: duration("emphasis"), easing });
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const change = () => { if (media.matches) { animation.cancel(); play(fill, "fade"); } };
  const clean = () => media.removeEventListener("change", change);
  media.addEventListener("change", change);
  animation.onfinish = clean;
  animation.oncancel = clean;
}

/** A CSS time in milliseconds: "150ms", or ".15s" as the build writes the duration tokens. */
export function durationMs(value: string): number {
  const v = value.trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : n;
}

/** A duration token (--dur-enter, --dur-exit, --dur-emphasis) in milliseconds, for a timer that waits on an animation. */
export function tokenMs(name: string, el: Element = document.documentElement): number {
  return durationMs(getComputedStyle(el).getPropertyValue(name));
}

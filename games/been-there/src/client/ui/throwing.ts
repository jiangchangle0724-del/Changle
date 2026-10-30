// The moment this phone threw its dice (a tap, or a shake), before the server has answered: the dice
// start tumbling on the board at once, so the tap is felt in the same frame, not a round trip later.
import { useEffect, useState } from "preact/hooks";

/** How long the dice tumble waiting for the server before giving up (a lost connection). */
const WAIT = 1500;

let at = -Infinity;
const subs = new Set<() => void>();

export function startThrow() {
  at = performance.now();
  for (const f of subs) f();
}

/** Whether this phone's dice are in the air, the server not having answered yet. */
export function useThrowing(): boolean {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  const age = performance.now() - at;
  useEffect(() => {
    if (age >= WAIT) return;
    const id = window.setTimeout(() => tick((n) => n + 1), WAIT - age + 20);
    return () => clearTimeout(id);
  }, [at]);
  return age < WAIT;
}

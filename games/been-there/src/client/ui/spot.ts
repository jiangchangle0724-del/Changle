// A city or two this phone lights on its own board for a moment, as the player taps it: one in Mine
// (ui/Assets.tsx), the cities a trade is about (ui/Trade.tsx). The board lights it as it lights the space
// a question is about (art/RoundBoard.tsx AimMarks, `flash`), and the map looks at the first for as long
// (ui/mapView.ts `look`), so it shows above the sheet it was tapped in.
import { useEffect, useState } from "preact/hooks";
import { LOOK_MS } from "./mapView";

export interface Spot {
  /** The spaces lit, the one tapped first. */
  spaces: number[];
  /** One tap: each lights up anew. */
  key: string;
  /** Lit until then (performance.now() ms). */
  until: number;
}

/** How long a spot stays lit: as long as the map looks at it. */
export const SPOT_MS = LOOK_MS;

let lit: Spot | null = null;
let taps = 0;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());
/** When each space was last lit by a tap (performance.now() ms). */
const litAt = new Map<number, number>();

/** Light these spaces on this phone's board, the first one most (none: put the light out). */
export function spot(spaces: number[]) {
  const now = performance.now();
  lit = spaces.length ? { spaces, key: `spot${++taps}`, until: now + SPOT_MS } : null;
  for (const at of spaces) litAt.set(at, now);
  tell();
}

/** This space was lit by a tap a moment ago, and the map has looked at it already (a house built from
 * Mine: not again as it comes up, ui/Board.tsx builtHere). */
export const justSpotted = (at: number) => performance.now() - (litAt.get(at) ?? -Infinity) < SPOT_MS + 1500;

/** The spaces lit now, or null; the board drawn again as a light comes and goes. */
export function useSpot(): Spot | null {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  const now = lit && performance.now() < lit.until ? lit : null;
  useEffect(() => {
    if (!now) return;
    const id = window.setTimeout(() => {
      if (lit === now) lit = null;
      tell();
    }, now.until - performance.now() + 20);
    return () => clearTimeout(id);
  }, [now?.key]);
  return now;
}

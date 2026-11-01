import { useEffect, useRef, type RefObject } from "react";
import { Figure } from "../../components/Figure";
import { reduced } from "../../lib/anim";
import type { SeatView } from "../../shared/protocol";

/** No more than three flashes a second: the usual line for light that can bring on a seizure. */
const MAX_FLASHES = 3;

type Clock = {
  /** beats since the stream's first downbeat at what the speakers sound now (NaN: no music) */
  beat: () => number;
  /** how hard the low end hits now, 0 to 1 */
  energy: () => number;
};

const hop = (b: number) => {
  const f = b - Math.floor(b);
  return 4 * f * (1 - f);
};
const land = (b: number) => Math.max(0, 1 - (b - Math.floor(b)) * 8);
const sway = (b: number) => Math.sin(Math.PI * b);

/** Four ways to move to the beat; each dancer keeps one. Feet land on the beat. */
const MOVES: ((b: number, a: number) => { x: number; y: number; r: number; s: number })[] = [
  // bounce and sway
  (b, a) => ({ x: 0, y: -hop(b) * 9 * a, r: sway(b) * 7 * a, s: 1 - 0.07 * a * land(b) }),
  // step side to side
  (b, a) => ({ x: sway(b) * 16 * a, y: -hop(b) * 4 * a, r: sway(b) * 3 * a, s: 1 - 0.05 * a * land(b) }),
  // double time
  (b, a) => ({ x: 0, y: -hop(b * 2) * 5 * a, r: sway(b * 2) * 4 * a, s: 1 - 0.05 * a * land(b * 2) }),
  // lean into it
  (b, a) => ({ x: sway(b) * 5 * a, y: -hop(b) * 3 * a, r: Math.sin(Math.PI * b + 0.7) * 11 * a, s: 1 - 0.04 * a * land(b) }),
];

/**
 * The lights and the dancers, driven from the speaker's own clock, frame by frame (no React
 * renders): `root` gets --pulse (the kick, for the lights), --flash (at most 3 a second), --beat
 * (where in the beat we are) and --spin (for the records); every `[data-dancer]` inside it moves.
 */
export function useFloorLoop(root: RefObject<HTMLElement | null>, clock: Clock, level: number, fires: RefObject<Map<string, number>>) {
  const lv = useRef(level);
  lv.current = level;
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const calm = reduced();
    let raf = 0;
    let flash = 0;
    let lastE = 0;
    let pulse = 0;
    const flashes: number[] = [];
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const b = clock.beat();
      const on = Number.isFinite(b) && b > 0;
      const e = on ? clock.energy() : 0;
      // the lights follow the kick: up at once, down over a moment
      pulse = Math.max(e, pulse * Math.exp(-dt / 0.18));
      while (flashes.length && now - flashes[0] > 1000) flashes.shift();
      if (!calm && on && e > 0.82 && lastE <= 0.82 && flashes.length < MAX_FLASHES && lv.current >= 0.6) {
        flashes.push(now);
        flash = 1;
      }
      lastE = e;
      flash *= Math.exp(-dt / 0.09);
      el.style.setProperty("--pulse", pulse.toFixed(3));
      el.style.setProperty("--flash", flash.toFixed(3));
      el.style.setProperty("--beat", on ? (b - Math.floor(b)).toFixed(3) : "0");
      el.style.setProperty("--spin", on ? `${((b * 0.444) % 1) * 360}deg` : "0deg");
      // the dancers: the night's energy sets how big they move; idle, a slow sway
      const a = calm ? 0.25 : 0.35 + 0.75 * lv.current;
      const list = el.querySelectorAll<HTMLElement>("[data-dancer]");
      list.forEach((d, i) => {
        const pid = d.dataset.dancer ?? "";
        let x = 0;
        let y = 0;
        let r = 0;
        let s = 1;
        if (on) ({ x, y, r, s } = MOVES[i % MOVES.length](b, a));
        else r = Math.sin(now / 900 + i) * 2;
        // a 🔥 makes its owner jump
        const fireAt = fires.current?.get(pid);
        if (fireAt !== undefined) {
          const k = (now - fireAt) / 420;
          if (k >= 0 && k < 1) y -= 22 * 4 * k * (1 - k);
          else if (k >= 1) fires.current?.delete(pid);
        }
        d.style.transform = `translateX(${x.toFixed(1)}px) translateY(${y.toFixed(2)}%) rotate(${r.toFixed(2)}deg) scaleY(${s.toFixed(3)})`;
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [root, clock, fires]);
}

/** One flame going up from someone who pressed 🔥. */
export type Flame = { id: number; pid: string };

/** The dancers: everyone at the table, in one row (two when it's crowded), names underfoot. */
export function Floor({ seats, flames, host }: { seats: SeatView[]; flames: Flame[]; host?: string }) {
  const n = seats.length;
  const h = n <= 4 ? 250 : n <= 6 ? 215 : n <= 8 ? 185 : n <= 12 ? 160 : 140;
  const rows = n > 8 ? [seats.slice(Math.ceil(n / 2)), seats.slice(0, Math.ceil(n / 2))] : [seats];
  return (
    <div className="dj-floor" style={{ ["--fig-h" as string]: `${h}px` }} aria-hidden="true">
      {rows.map((row, k) => (
        <div key={k} className={`dj-row ${rows.length > 1 && k === 0 ? "is-back" : ""}`}>
          {row.map((s) => (
            <div key={s.id} className={`dj-dancer ${s.on ? "" : "is-away"}`}>
              <div className="dj-body" data-dancer={s.id}>
                <Figure seat={s} />
              </div>
              <span className={`dj-name ${s.id === host ? "is-host" : ""}`}>{s.name}</span>
              {flames
                .filter((f) => f.pid === s.id)
                .map((f) => (
                  <span key={f.id} className="dj-flame">
                    🔥
                  </span>
                ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

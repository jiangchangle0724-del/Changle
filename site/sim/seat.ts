/** The 15-minute game moves first-player luck the most: try a little extra cash for later seats. */
import { readFileSync } from "node:fs";
import { STYLES } from "../src/shared/trip/bots";
import { configWith } from "./tune";
import { run, summarize } from "./trip_sim";

const tuned = JSON.parse(readFileSync(process.argv[2] ?? "sim/out/tune1.json", "utf8"));
const GAMES = Number(process.argv[3] ?? 3000);
const bal = (n: number) => () => Array.from({ length: n }, () => STYLES.balanced);
const ROUNDS: Record<number, number> = { 2: 14, 3: 10, 4: 8, 5: 6, 6: 5 };
for (const step of [0, 25, 50]) {
  for (const n of [4, 6]) {
    const cfg = { ...configWith(tuned.mult, tuned.target), end: { kind: "rounds" as const, rounds: ROUNDS[n] }, dealCities: 2, seatBonus: Array.from({ length: n }, (_, k) => k * step) };
    const s = summarize(run(cfg, n, GAMES, bal(n), 1_200_000 + n * 10 + step), n);
    console.log(`15 min, ${n}p, +$${step} per seat: seat ${s.seat.map((x) => (x * 100).toFixed(1)).join("/")} (first ${(s.firstSeatEdge * 100).toFixed(1)}pp, last ${((s.seat[n - 1] - 1 / n) * 100).toFixed(1)}pp)`);
  }
}

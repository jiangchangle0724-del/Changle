/** With the tuned numbers: game length by table size, the first player's edge, and how each style does. */
import { readFileSync } from "node:fs";
import { STYLES } from "../src/shared/trip/bots";
import { configWith, mixed } from "./tune";
import { run, summarize } from "./trip_sim";

const tuned = JSON.parse(readFileSync(process.argv[2] ?? "sim/out/tune1.json", "utf8"));
const GAMES = Number(process.argv[3] ?? 1500);
const bal = (n: number) => () => Array.from({ length: n }, () => STYLES.balanced);
for (const n of [2, 3, 4, 5, 6]) {
  const cfg = configWith(tuned.mult, tuned.target);
  const s = summarize(run(cfg, n, GAMES, bal(n), 300_000 + n * 1000), n);
  const m = summarize(run(cfg, n, GAMES, mixed(n), 600_000 + n * 1000), n);
  console.log(
    `${n}p: ${s.minutes.mean.toFixed(1)} min (p10 ${s.minutes.p10.toFixed(0)} p90 ${s.minutes.p90.toFixed(0)}), ${s.rounds.mean.toFixed(1)} rounds, seat ${s.seat.map((x) => (x * 100).toFixed(1)).join("/")} (edge ${(s.firstSeatEdge * 100).toFixed(1)}pp), reasons ${JSON.stringify(s.reasons)}`,
  );
  console.log(`    styles: ${Object.entries(m.byStyle).map(([k, v]) => `${k} ${(v.rate * 100).toFixed(1)}%`).join(", ")} (fair ${(100 / n).toFixed(1)}%)`);
}

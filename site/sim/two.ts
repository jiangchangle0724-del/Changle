import { readFileSync } from "node:fs";
import { STYLES } from "../src/shared/trip/bots";
import { configWith } from "./tune";
import { run, summarize } from "./trip_sim";
const tuned = JSON.parse(readFileSync("sim/out/tune1.json", "utf8"));
const bal = (n: number) => () => Array.from({ length: n }, () => STYLES.balanced);
for (const target of [3250, 4000, 4500]) {
  for (const bonus of [0, 25]) {
    const cfg = { ...configWith(tuned.mult, target), seatBonus: [0, bonus] };
    const s = summarize(run(cfg, 2, 1500, bal(2), 31_000 + target + bonus), 2);
    console.log(`2p target $${target} +$${bonus}: ${s.minutes.mean.toFixed(1)} min (p10 ${s.minutes.p10.toFixed(0)} p90 ${s.minutes.p90.toFixed(0)}), seat ${s.seat.map((x) => (x * 100).toFixed(1)).join("/")}, ends ${JSON.stringify(s.reasons)}`);
  }
}
for (const n of [3, 4, 5, 6]) {
  const cfg = { ...configWith(tuned.mult, tuned.target), seatBonus: Array.from({ length: n }, (_, k) => 25 * k) };
  const s = summarize(run(cfg, n, 1500, bal(n), 41_000 + n), n);
  console.log(`${n}p target $${tuned.target} +$25/seat: ${s.minutes.mean.toFixed(1)} min, seat ${s.seat.map((x) => (x * 100).toFixed(1)).join("/")} (first ${(s.firstSeatEdge * 100).toFixed(1)}pp)`);
}

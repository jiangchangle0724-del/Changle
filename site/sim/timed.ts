/** The timed games: how many rounds fit in 15 minutes and an hour, and whether they end fair. */
import { readFileSync } from "node:fs";
import { STYLES } from "../src/shared/trip/bots";
import { configWith } from "./tune";
import { run, summarize } from "./trip_sim";

const tuned = JSON.parse(readFileSync(process.argv[2] ?? "sim/out/tune1.json", "utf8"));
const GAMES = Number(process.argv[3] ?? 1500);
const bal = (n: number) => () => Array.from({ length: n }, () => STYLES.balanced);
for (const [minutes, deal] of [[15, 2], [15, 0], [60, 0]] as const) {
  for (const n of [2, 4, 6]) {
    // seconds per turn from a no-limit run, then the rounds that fit
    const cfg = configWith(tuned.mult, tuned.target);
    const probe = summarize(run(cfg, n, 300, bal(n), 1), n);
    const rounds = Math.max(3, Math.round((minutes * 60) / (probe.secondsPerTurn * n)));
    const t = { ...cfg, end: { kind: "rounds" as const, rounds }, dealCities: deal };
    const s = summarize(run(t, n, GAMES, bal(n), 900_000 + n), n);
    console.log(`${minutes} min${deal ? ` (+${deal} cities)` : ""}, ${n}p: ${rounds} rounds -> ${s.minutes.mean.toFixed(1)} min, seat ${s.seat.map((x) => (x * 100).toFixed(1)).join("/")} (edge ${(s.firstSeatEdge * 100).toFixed(1)}pp), ends ${JSON.stringify(s.reasons)}`);
  }
}

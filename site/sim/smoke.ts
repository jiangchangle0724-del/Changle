import { defaultConfig, newGame, worth } from "../src/shared/trip/engine";
import { mind, playOut, STYLES } from "../src/shared/trip/bots";

const N = Number(process.argv[2] ?? 200);
const cfg = defaultConfig();
let turns = 0;
const reasons: Record<string, number> = {};
const seatWins = [0, 0, 0, 0];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const g = newGame(cfg, ["A", "B", "C", "D"], 1000 + i);
  const minds = [0, 1, 2, 3].map((k) => mind(STYLES.balanced, 77 + i * 13 + k));
  playOut(g, minds);
  turns += g.turns;
  reasons[g.reason] = (reasons[g.reason] ?? 0) + 1;
  if (g.winner !== null) seatWins[g.winner]++;
  if (i === 0) console.log("game 0:", g.turns, "turns", g.reason, g.ps.map((p, k) => `${p.name}:${worth(g, k)}${p.out ? "(out)" : ""}`).join(" "), "trades", g.stats.trades, "builds", g.stats.builds, "auctions", g.stats.auctions);
}
console.log({ games: N, avgTurns: turns / N, reasons, seatWins, ms: Date.now() - t0 });

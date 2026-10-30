/** Play thousands of bot games with every style and table size, checking the rules hold after every answer. */
import { BOARD } from "../src/shared/trip/data";
import { defaultConfig, GROUP_AT, newGame, type Game } from "../src/shared/trip/engine";
import { mind, playOut, STYLES } from "../src/shared/trip/bots";

const N = Number(process.argv[2] ?? 2000);
const styles = Object.values(STYLES);
let problems = 0;
const seen = new Set<string>();

function check(g: Game, who: number, k: string) {
  const bad = (msg: string) => {
    if (seen.has(msg)) return;
    seen.add(msg);
    problems++;
    console.log("PROBLEM", msg, "after", k, "by", who, "turn", g.turns);
  };
  g.ps.forEach((p, i) => {
    if (!p.out && p.cash < 0) bad(`negative cash p${i} ${p.cash}`);
    if (p.pos < 0 || p.pos >= BOARD.length) bad(`bad pos p${i}`);
  });
  g.deeds.forEach((d, i) => {
    if (!d) return;
    if (d.houses < 0 || d.houses > 5) bad(`houses ${d.houses} at ${i}`);
    if (d.houses > 0 && d.mort) bad(`houses on mortgaged ${i}`);
    if (d.owner >= 0 && g.ps[d.owner].out) bad(`deed ${i} owned by a player who is out`);
    if (d.houses > 0 && d.owner < 0) bad(`houses on unowned ${i}`);
  });
  for (const [gr, idx] of Object.entries(GROUP_AT)) {
    // Europe can be built with two cities plus Istanbul; buying the third one later starts it at zero
    if (gr === "7") continue;
    const byOwner: Record<number, number[]> = {};
    for (const i of idx) {
      const d = g.deeds[i]!;
      if (d.owner >= 0) (byOwner[d.owner] ??= []).push(d.houses);
    }
    for (const hs of Object.values(byOwner)) if (Math.max(...hs) - Math.min(...hs) > 1) bad(`uneven building ${hs} in group ${gr}`);
  }
}

const t0 = Date.now();
let turns = 0;
const reasons: Record<string, number> = {};
for (let i = 0; i < N; i++) {
  const n = 2 + (i % 5);
  const cfg = defaultConfig();
  if (i % 3 === 1) cfg.end = { kind: "rounds", rounds: 10 + (i % 20) };
  if (i % 7 === 3) cfg.cityRules = false;
  const g = newGame(cfg, Array.from({ length: n }, (_, k) => `P${k}`), 5000 + i);
  const minds = Array.from({ length: n }, (_, k) => mind(styles[(i + k * 3) % styles.length], 99 + i * 31 + k));
  try {
    playOut(g, minds, check);
  } catch (e) {
    problems++;
    console.log("CRASH game", i, String(e));
  }
  if (!g.over) {
    problems++;
    console.log("NOT OVER game", i, g.pending?.k, g.turns);
  }
  turns += g.turns;
  reasons[g.reason] = (reasons[g.reason] ?? 0) + 1;
}
console.log({ games: N, problems, avgTurns: Math.round(turns / N), reasons, ms: Date.now() - t0 });

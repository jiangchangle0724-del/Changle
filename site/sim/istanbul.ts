/**
 * Is Istanbul too strong? It can stand in for a missing European city, so Istanbul plus any two
 * of Venice, Paris and London is a full Europe set. Compare teams that end a game holding that
 * set with teams that end holding any other full set, in the report's main 4-team games.
 *
 *   npx tsx sim/istanbul.ts
 */
import { CITIES, GROUPS } from "../src/shared/trip/data";
import { CITY_AT, defaultConfig, newGame } from "../src/shared/trip/engine";
import { mind, playOut, STYLES } from "../src/shared/trip/bots";

const EUROPE = ["venice", "paris", "london"];
const n = 4;
const cfg = defaultConfig(n);
const GAMES = Number(process.argv[2] ?? 3000);
const tally: Record<string, { teams: number; wins: number }> = {};
const add = (k: string, won: number) => {
  tally[k] ??= { teams: 0, wins: 0 };
  tally[k].teams++;
  tally[k].wins += won;
};
for (let i = 0; i < GAMES; i++) {
  const seed = 10_000 + i; // the report's main table
  const g = newGame(cfg, Array.from({ length: n }, (_, k) => `balanced${k}`), seed);
  playOut(g, Array.from({ length: n }, (_, k) => mind(STYLES.balanced, seed * 7919 + k * 104729)));
  for (let p = 0; p < n; p++) {
    const won = g.winner === p ? 1 : 0;
    const owns = (id: string) => g.deeds[CITY_AT[id]]!.owner === p;
    let sets = 0;
    for (const gr of GROUPS) {
      const ids = CITIES.filter((c) => c.group === gr.id).map((c) => c.id);
      if (ids.every(owns)) {
        add(`full ${gr.name.zh}`, won);
        sets++;
      }
    }
    const eu = EUROPE.filter(owns).length;
    if (eu === 2 && owns("istanbul")) {
      add("Europe via Istanbul", won);
      sets++;
    }
    add(sets ? "any full set" : "no full set", won);
  }
}
for (const [k, v] of Object.entries(tally).sort()) console.log(k.padEnd(22), String(v.teams).padStart(5), `won ${((v.wins / v.teams) * 100).toFixed(1)}%`);

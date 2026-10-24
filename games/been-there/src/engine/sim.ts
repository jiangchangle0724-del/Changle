// Computer-vs-computer games and the numbers the step-3 report was built from.
import { GROUP_SPACES, SIMULTANEOUS } from "./board";
import { configFor, type GameConfig, type Mode } from "./config";
import { BOARD, GROUPS } from "./data";
import { STYLES, newBrain, runBots, type Style, type StyleId } from "./bots";
import { newGame } from "./play";
import { random } from "./rng";
import { houseCostAt, netWorth, priceOf } from "./rules";
import type { PendingKind } from "./state";

/** Table seconds each decision takes, used to turn computer games into minutes. */
export const DECISION_SECONDS: Partial<Record<PendingKind, number>> = {
  roll: 14,
  permit: 4,
  buy: 6,
  auction: 25,
  debt: 15,
  "card-route": 5,
  "card-player": 4,
  "card-house": 5,
  koi: 4,
  water: 15,
  tango: 8,
  "tango-reply": 10,
  ban: 6,
  dance: 6,
  scores: 22,
  mumbai: 8,
  peek: 8,
  bet: 12,
  freeze: 15,
  jump: 5,
  quiz: 12,
  splash: 12,
  reverse: 5,
  coe: 18,
  barrier: 8,
  sales: 5,
  policy: 6,
  silence: 15,
};
export const CARD_SECONDS = 7;
export const TRADE_SECONDS = 35;
export const BUILD_SECONDS = 2;

export interface GameResult {
  turns: number;
  rounds: number;
  seconds: number;
  winner: number | null;
  winnerStyle: StyleId | null;
  reason: string;
  styles: StyleId[];
  worths: number[];
  landings: number[];
  rentBySpace: number[];
  investBySpace: number[];
  ruleUses: Record<string, number>;
  trades: number;
  builds: number;
  auctions: number;
}

/** One complete computer game. */
export function playGame(cfg: GameConfig, styles: Style[], seed: number): GameResult {
  const n = styles.length;
  const s = newGame(
    cfg,
    styles.map((st, i) => `${st.id}${i}`),
    seed,
  );
  const brains = styles.map((st, i) => newBrain(st, seed * 7919 + i * 104729));
  let seconds = 0;
  let counted: unknown = null;
  runBots(s, brains, (state, _p, k) => {
    const pd = state.pending;
    // A whole-table decision is counted once, not once per voter.
    if (SIMULTANEOUS.has(k) && pd === counted) return;
    counted = pd;
    seconds += DECISION_SECONDS[k] ?? 0;
  });
  let cards = 0;
  BOARD.forEach((sp, at) => {
    if (sp.k === "journey" || sp.k === "postcard") cards += s.stats.landings[at];
  });
  seconds += cards * CARD_SECONDS + s.stats.trades * TRADE_SECONDS + s.stats.builds * BUILD_SECONDS;
  const invested = BOARD.map(() => 0);
  s.deeds.forEach((d, at) => {
    if (d && d.owner >= 0) invested[at] = priceOf(s, at) + d.houses * houseCostAt(s, at);
  });
  return {
    turns: s.turns,
    rounds: s.turns / n,
    seconds,
    winner: s.winner,
    winnerStyle: s.winner === null ? null : styles[s.winner].id,
    reason: s.reason,
    styles: styles.map((st) => st.id),
    worths: styles.map((_, i) => netWorth(s, i)),
    landings: s.stats.landings,
    rentBySpace: s.stats.rentBySpace,
    investBySpace: invested,
    ruleUses: s.stats.ruleUses,
    trades: s.stats.trades,
    builds: s.stats.builds,
    auctions: s.stats.auctions,
  };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
function quantile(xs: number[], q: number) {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

export function summarize(games: GameResult[], n: number) {
  const minutes = games.map((g) => g.seconds / 60);
  const seat = Array.from({ length: n }, (_, i) => games.filter((g) => g.winner === i).length / games.length);
  const styleIds = [...new Set(games.flatMap((g) => g.styles))];
  const byStyle = Object.fromEntries(
    styleIds.map((id) => {
      const seats = games.reduce((sum, g) => sum + g.styles.filter((x) => x === id).length, 0);
      const wins = games.filter((g) => g.winnerStyle === id).length;
      return [id, { seats, wins, rate: wins / Math.max(1, seats), share: wins / games.length }];
    }),
  ) as Record<string, { seats: number; wins: number; rate: number; share: number }>;
  const reasons: Record<string, number> = {};
  for (const g of games) reasons[g.reason] = (reasons[g.reason] ?? 0) + 1;
  // Rent collected per dollar invested, per group: what step 3 balanced the rents on.
  const groupRoi: Record<string, number> = {};
  for (const grp of GROUPS) {
    const spaces = GROUP_SPACES[grp.id];
    const rent = mean(games.map((g) => spaces.reduce((sum, at) => sum + g.rentBySpace[at], 0)));
    const invest = mean(games.map((g) => spaces.reduce((sum, at) => sum + g.investBySpace[at], 0)));
    groupRoi[grp.id] = rent / Math.max(1, invest);
  }
  for (const [kind, key] of [
    ["route", "routes"],
    ["service", "services"],
  ]) {
    const spaces = BOARD.map((sp, at) => (sp.k === kind ? at : -1)).filter((at) => at >= 0);
    const rent = mean(games.map((g) => spaces.reduce((sum, at) => sum + g.rentBySpace[at], 0)));
    const invest = mean(games.map((g) => spaces.reduce((sum, at) => sum + g.investBySpace[at], 0)));
    groupRoi[key] = rent / Math.max(1, invest);
  }
  const landings = BOARD.map((_, at) => games.reduce((sum, g) => sum + g.landings[at], 0));
  const allLandings = landings.reduce((a, b) => a + b, 0);
  const rules: Record<string, number> = {};
  for (const g of games) for (const [k, v] of Object.entries(g.ruleUses)) rules[k] = (rules[k] ?? 0) + v;
  return {
    games: games.length,
    players: n,
    minutes: { mean: mean(minutes), p10: quantile(minutes, 0.1), p50: quantile(minutes, 0.5), p90: quantile(minutes, 0.9) },
    rounds: {
      mean: mean(games.map((g) => g.rounds)),
      p10: quantile(
        games.map((g) => g.rounds),
        0.1,
      ),
      p90: quantile(
        games.map((g) => g.rounds),
        0.9,
      ),
    },
    secondsPerTurn: mean(games.map((g) => g.seconds / Math.max(1, g.turns))),
    seat,
    firstSeatEdge: seat[0] - 1 / n,
    byStyle,
    reasons,
    groupRoi,
    landing: landings.map((x) => x / Math.max(1, allLandings)),
    rulesPerGame: Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, v / games.length])),
    trades: mean(games.map((g) => g.trades)),
    builds: mean(games.map((g) => g.builds)),
    auctions: mean(games.map((g) => g.auctions)),
  };
}

export type Summary = ReturnType<typeof summarize>;

export function playMany(cfg: GameConfig, n: number, games: number, stylesFor: (i: number) => Style[], seed = 1) {
  const out: GameResult[] = [];
  for (let i = 0; i < games; i++) out.push(playGame(cfg, stylesFor(i), seed + i));
  return out;
}

const ALL_STYLES = Object.values(STYLES);

export const sameStyle = (n: number, style: Style) => () => Array.from({ length: n }, () => style);

/** Rotate through the five styles. */
export const rotateStyles = (n: number) => (i: number) => Array.from({ length: n }, (_, k) => ALL_STYLES[(i + k * 2) % ALL_STYLES.length]);

/** Seat the five styles in a random mix per game ("五种打法混坐"), seeded by the game number. */
export const mixedStyles = (n: number) => (i: number) => {
  const h = { seed: (i * 2654435761) >>> 0 };
  const bag = [...ALL_STYLES];
  const picked: Style[] = [];
  for (let k = 0; k < n; k++) {
    if (!bag.length) bag.push(...ALL_STYLES);
    picked.push(bag.splice(Math.floor(random(h) * bag.length), 1)[0]);
  }
  return picked;
};

export interface RunOptions {
  n: number;
  mode: Mode;
  styles: "balanced" | "mixed";
  games: number;
  seed: number;
}

/** A batch of games that can be played a few at a time (the 模拟验证 page uses this). */
export function createRun(o: RunOptions) {
  const cfg = configFor(o);
  const stylesFor = o.styles === "mixed" ? mixedStyles(o.n) : () => Array.from({ length: o.n }, () => STYLES.balanced);
  const results: GameResult[] = [];
  return {
    target: cfg.end,
    step(count: number) {
      const until = Math.min(o.games, results.length + count);
      while (results.length < until) results.push(playGame(cfg, stylesFor(results.length), o.seed + results.length));
      return results.length;
    },
    summary() {
      const s = summarize(results, o.n);
      return {
        games: results.length,
        minutes: s.minutes,
        rounds: s.rounds,
        seat: s.seat,
        firstSeatEdge: s.firstSeatEdge,
        byStyle: s.byStyle,
        reasons: s.reasons,
      };
    },
  };
}

export { configFor, roundsFor } from "./config";

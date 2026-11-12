// Numbers the game runs on. Step 3 (模拟报告) set these from 24,600 computer games.
import { CITIES, GROUPS } from "./data";

export const START_CASH = 1500;
/** The host's choices for the starting cash (更多规则); "normal" is the step-3 game. */
export type CashChoice = "low" | "normal" | "high";
export const START_CASH_CHOICES: Record<CashChoice, number> = { low: 1000, normal: START_CASH, high: 2000 };
export const SALARY = 200;
export const IMMIGRATION_FEE = 50;
export const ROUTE_PRICE = 200;
/** Route fare by how many routes the owner has (1 to 4). Step 2 was 25/50/100/200. */
export const ROUTE_RENT = [35, 75, 145, 290];
export const SERVICE_PRICE = 150;
/** Service rent = dice total × this, by how many services the owner has. Step 2 was ×4/×10. */
export const SERVICE_TIMES = [7, 17];
/** Unlimited games end when a team's net worth reaches this. */
export const TARGETS = { two: 4500, more: 3500 };
/** Each later seat starts with this much more cash than the one before. */
export const SEAT_BONUS_STEP = 25;

/** Rent per city: [empty, full set, 1 house, 2, 3, 4, hotel], re-tuned per group in step 3. */
export const RENTS: Record<string, number[]> = {
  cairo: [5, 10, 15, 20, 60, 90, 120],
  capetown: [5, 10, 15, 30, 80, 120, 160],
  buenosaires: [5, 10, 30, 70, 180, 270, 350],
  mexicocity: [5, 10, 30, 80, 200, 290, 390],
  rio: [10, 20, 40, 100, 250, 360, 460],
  istanbul: [10, 20, 40, 150, 350, 500, 650],
  mumbai: [10, 20, 50, 160, 380, 540, 700],
  dubai: [15, 30, 60, 190, 440, 610, 800],
  lasvegas: [15, 30, 70, 200, 480, 650, 830],
  vancouver: [15, 30, 70, 220, 500, 670, 860],
  newyork: [20, 40, 70, 230, 520, 700, 890],
  tokyo: [25, 50, 120, 370, 860, 1140, 1450],
  beijing: [25, 50, 120, 390, 920, 1200, 1520],
  shanghai: [35, 70, 140, 430, 1010, 1320, 1660],
  bangkok: [40, 80, 190, 570, 1340, 1710, 2140],
  sydney: [45, 90, 190, 610, 1400, 1790, 2240],
  singapore: [45, 90, 200, 650, 1520, 1940, 2410],
  venice: [60, 120, 260, 800, 1820, 2300, 2840],
  paris: [60, 120, 260, 830, 1910, 2390, 2950],
  london: [70, 140, 290, 900, 2060, 2550, 3150],
  seoul: [70, 140, 290, 960, 2210, 2680, 3280],
  hongkong: [80, 160, 330, 1040, 2350, 2810, 3410],
};

/** Step 2's rent formula, kept for the rent tuner (scripts/tune.ts). */
export function step2Rent(price: number) {
  const r10 = (x: number) => Math.round(x / 10) * 10;
  const base = Math.max(5, Math.round((price * (0.04 + price / 6000)) / 5) * 5);
  return {
    base,
    set: base * 2,
    houses: [
      r10(price * (0.2 + price / 1600)),
      r10(price * (0.6 + price / 480)),
      r10(price * (1.6 + price / 240)),
      r10(price * (2.6 + price / 280)),
    ],
    hotel: r10(price * (3.6 + price / 300)),
  };
}

export type EndRule = { kind: "target"; amount: number } | { kind: "rounds"; rounds: number };

export interface GameConfig {
  startCash: number;
  salary: number;
  immigrationFee: number;
  prices: Record<string, number>;
  rents: Record<string, number[]>;
  houseCost: Record<number, number>;
  routePrice: number;
  routeRent: number[];
  servicePrice: number;
  serviceTimes: number[];
  passport: { on: boolean; bonus: number; stamp: number };
  cityRules: boolean;
  end: EndRule;
  /** Safety stop for simulations. */
  maxTurns: number;
  /** Cities dealt to each team at the start (2 in the 15-minute game). */
  dealCities: number;
  seatBonus: number[];
  /** Travel news (news.ts): off unless the room switches it on. */
  news?: boolean;
  /** False: a city its visitor doesn't buy stays unsold instead of going to auction. */
  auctions?: boolean;
}

/**
 * The game's config with the host's starting cash: in a game to the target, the target moves with it,
 * so the distance from the start to the target stays the step-3 game's.
 */
export function withStartCash(cfg: GameConfig, cash: number): GameConfig {
  const diff = cash - cfg.startCash;
  return {
    ...cfg,
    startCash: cash,
    end: cfg.end.kind === "target" ? { kind: "target", amount: cfg.end.amount + diff } : cfg.end,
  };
}

export function defaultConfig(teams = 4): GameConfig {
  const prices: Record<string, number> = {};
  const rents: Record<string, number[]> = {};
  for (const c of CITIES) {
    prices[c.id] = c.price;
    rents[c.id] = [...RENTS[c.id]];
  }
  return {
    startCash: START_CASH,
    salary: SALARY,
    immigrationFee: IMMIGRATION_FEE,
    prices,
    rents,
    houseCost: Object.fromEntries(GROUPS.map((g) => [g.id, g.house])),
    routePrice: ROUTE_PRICE,
    routeRent: [...ROUTE_RENT],
    servicePrice: SERVICE_PRICE,
    serviceTimes: [...SERVICE_TIMES],
    passport: { on: true, bonus: 300, stamp: 10 },
    cityRules: true,
    end: { kind: "target", amount: teams === 2 ? TARGETS.two : TARGETS.more },
    maxTurns: 1200,
    dealCities: 0,
    seatBonus: Array.from({ length: teams }, (_, i) => i * SEAT_BONUS_STEP),
  };
}

export type Mode = "target" | 15 | 60;

/** Average table seconds per turn by team count, from the step-3 time model. */
export const SECONDS_PER_TURN: Record<number, number> = { 2: 32.49, 3: 30.61, 4: 29.32, 5: 28.5, 6: 27.87 };

/** How many rounds fit in a timed game, at the modelled table speed. */
export const roundsFor = (minutes: number, teams: number) =>
  Math.max(3, Math.round((minutes * 60) / (SECONDS_PER_TURN[teams] * teams)));

/** The config the step-3 simulation used for a team count and game length. */
export function configFor(opts: { n: number; mode: Mode }): GameConfig {
  const cfg = defaultConfig(opts.n);
  if (opts.mode !== "target") {
    cfg.end = { kind: "rounds", rounds: roundsFor(opts.mode, opts.n) };
    cfg.dealCities = opts.mode === 15 ? 2 : 0;
  }
  return cfg;
}

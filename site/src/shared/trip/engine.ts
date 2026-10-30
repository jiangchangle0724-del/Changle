/**
 * 到此一游 · Been There, Bought That: the rules engine. One game, every rule, no screens.
 * The simulation (step 3) and the online game (step 4) both drive it the same way:
 *
 *   const g = newGame(config, players, seed);
 *   while (!g.over) decide(g, g.pending.who, choice);   // or a free action: build, sell, mortgage, trade
 *
 * Everything that needs a person (buy or not, a bid, a vote, where to fly) stops the game with a
 * `pending` question; nothing else waits. The state is plain data (it can be saved as JSON) and
 * the dice come from a seeded generator inside it, so a seed replays a game exactly.
 */
import { BOARD, CITIES, GROUPS, IMMIGRATION_FEE, JOURNEY, POSTCARDS, RENTS, ROUTE_PRICE, ROUTE_RENT, SALARY, SEAT_BONUS, SERVICE_PRICE, SERVICE_TIMES, START_CASH, TARGET } from "./data";

/* ------------------------------------------------------------------ config */

export type Config = {
  startCash: number;
  salary: number;
  immigrationFee: number;
  /** city id -> price */
  prices: Record<string, number>;
  /** city id -> [base, full set, 1, 2, 3, 4 houses, hotel] */
  rents: Record<string, number[]>;
  /** group -> cost of one house */
  houseCost: Record<number, number>;
  routePrice: number;
  routeRent: number[];
  servicePrice: number;
  serviceTimes: number[];
  /** the passport (travel skeleton A): a bonus for all eight regions, and each stamp counts at the end */
  passport: { on: boolean; bonus: number; stamp: number };
  /** the city rules; off turns every city into a plain property (for comparison) */
  cityRules: boolean;
  /** how the game ends: a number of rounds (the timed games), or a net worth to reach */
  end: { kind: "rounds"; rounds: number } | { kind: "target"; amount: number };
  /** safety stop for the simulation: a game that runs this many turns ends on net worth */
  maxTurns: number;
  /** the 15-minute game deals each player this many random cities at the start */
  dealCities: number;
  /** extra starting cash by seat (later seats can get a little more, if moving first is an edge) */
  seatBonus: number[];
};

/** The step 3 numbers. `players` sets the no-limit target and the seat bonus. */
export function defaultConfig(players = 4): Config {
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
    end: { kind: "target", amount: players === 2 ? TARGET.two : TARGET.more },
    maxTurns: 1200,
    dealCities: 0,
    seatBonus: Array.from({ length: players }, (_, k) => k * SEAT_BONUS),
  };
}

/* ------------------------------------------------------------------ board facts */

export const N_SPACES = BOARD.length;
export const JAIL = BOARD.findIndex((s) => s.k === "immigration");
export const LOUNGE = BOARD.findIndex((s) => s.k === "lounge");
export const ROUTE_AT = BOARD.map((s, i) => (s.k === "route" ? i : -1)).filter((i) => i >= 0);
export const SERVICE_AT = BOARD.map((s, i) => (s.k === "service" ? i : -1)).filter((i) => i >= 0);
const CITY_OF = BOARD.map((s) => (s.k === "city" ? CITIES.find((c) => c.id === s.id)! : null));
export const CITY_AT: Record<string, number> = Object.fromEntries(BOARD.map((s, i) => [s.k === "city" ? s.id : "", i]).filter(([k]) => k));
export const GROUP_AT: Record<number, number[]> = Object.fromEntries(GROUPS.map((g) => [g.id, BOARD.map((s, i) => (s.k === "city" && CITY_OF[i]!.group === g.id ? i : -1)).filter((i) => i >= 0)]));
export const OWNABLE = BOARD.map((s) => s.k === "city" || s.k === "route" || s.k === "service");
const EUROPE = 7;
const ISTANBUL = CITY_AT.istanbul;
const CAIRO = CITY_AT.cairo;

export const cityAt = (i: number) => CITY_OF[i];
export const groupOfSpace = (i: number) => CITY_OF[i]?.group ?? null;

/* ------------------------------------------------------------------ state */

export type Deed = { owner: number; houses: number; mort: boolean };

export type Player = {
  name: string;
  cash: number;
  pos: number;
  out: boolean;
  /** held at Immigration: leaves at the start of the next turn */
  jail: boolean;
  /** doubles rolled in a row this turn */
  dbl: number;
  /** "Keep" cards held, by card id */
  keep: string[];
  /** city ids crossed off in the passport */
  stamps: string[];
  bonus: boolean;
  /** London: the next rent is halved */
  policy: boolean;
  /** Singapore: car permits held (one move one space more or less, each) */
  permits: number;
  /** a Jet Lag card: one die next turn */
  jetlag: boolean;
  turns: number;
};

export type Ballot = Record<number, unknown>;

export type Pending =
  | { k: "roll"; who: number; jail: boolean }
  | { k: "permit"; who: number; steps: number; again: boolean }
  | { k: "buy"; who: number; at: number; price: number }
  | { k: "auction"; at: number; bids: Ballot }
  | { k: "debt"; who: number; amount: number; to: number }
  | { k: "end"; who: number }
  | { k: "card-route"; who: number }
  | { k: "card-player"; who: number }
  | { k: "card-house"; who: number; card: "review" | "typhoon" | "cash" }
  | { k: "koi"; who: number; rent: number; to: number }
  | { k: "water"; votes: Ballot }
  | { k: "tango"; who: number }
  | { k: "tango-reply"; who: number; from: number }
  | { k: "ban"; who: number }
  | { k: "dance"; who: number }
  | { k: "scores"; dancer: number; votes: Ballot }
  | { k: "mumbai"; who: number }
  | { k: "peek"; who: number; cards: number[] }
  | { k: "bet"; who: number; at: number }
  | { k: "freeze"; who: number; at: number; votes: Ballot }
  | { k: "jump"; who: number }
  | { k: "quiz"; who: number; visitor: number; at: number }
  | { k: "splash"; who: number; votes: Ballot }
  | { k: "reverse"; who: number }
  | { k: "coe"; who: number; bids: Ballot }
  | { k: "barrier"; who: number; visitor: number; at: number }
  | { k: "sales"; who: number }
  | { k: "policy"; who: number; to: number }
  | { k: "silence"; who: number; at: number };

/** "everyone answers at once" questions: every active player votes, then it resolves */
export const BALLOTS = new Set(["auction", "water", "scores", "freeze", "splash", "coe"]);

type Task =
  | { t: "land"; p: number; noTango?: boolean }
  | { t: "rule"; p: number; at: number; noTango?: boolean }
  | { t: "prop"; p: number; at: number; mult?: number; base?: boolean; toBank?: boolean; double?: boolean }
  | { t: "after"; p: number; at: number }
  | { t: "endMove"; p: number; again: boolean }
  | { t: "pay"; p: number; amount: number; to: number }
  | { t: "card"; p: number; deck: "journey" | "postcard" }
  | { t: "check" };

export type Stats = {
  landings: number[];
  rentByOwner: number[];
  rentBySpace: number[];
  boughtAt: number[];
  auctions: number;
  auctionTotal: number;
  trades: number;
  builds: number;
  ruleUses: Record<string, number>;
  bankrupt: number[];
};

export type Game = {
  cfg: Config;
  seed: number;
  ps: Player[];
  deeds: (Deed | null)[];
  turn: number;
  dir: 1 | -1;
  decks: { journey: number[]; postcard: number[] };
  fx: { ban: { lo: number; hi: number; by: number } | null; typhoon: number | null; sales: number | null; salesUsed: number; permits: number; policies: number };
  turns: number;
  pending: Pending | null;
  stack: Task[];
  dice: [number, number];
  over: boolean;
  winner: number | null;
  reason: "" | "target" | "rounds" | "last" | "cap";
  stats: Stats;
  log: string[] | null;
  /** dice to use before random ones (tests, and replaying a table's real dice) */
  forced: number[];
};

/* ------------------------------------------------------------------ random */

export function rand(g: Game) {
  // mulberry32, with its state kept in the game so a saved game rolls on the same way
  g.seed = (g.seed + 0x6d2b79f5) | 0;
  let t = g.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const die = (g: Game) => (g.forced.length ? g.forced.shift()! : 1 + Math.floor(rand(g) * 6));
function shuffled(g: Game, n: number) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand(g) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ------------------------------------------------------------------ setup */

export function newGame(cfg: Config, names: string[], seed: number, opts: { log?: boolean } = {}): Game {
  const g: Game = {
    cfg,
    seed: seed | 0,
    ps: names.map((name) => ({ name, cash: cfg.startCash, pos: 0, out: false, jail: false, dbl: 0, keep: [], stamps: [], bonus: false, policy: false, permits: 0, jetlag: false, turns: 0 })),
    deeds: BOARD.map((_, i) => (OWNABLE[i] ? { owner: -1, houses: 0, mort: false } : null)),
    turn: 0,
    dir: 1,
    decks: { journey: [], postcard: [] },
    fx: { ban: null, typhoon: null, sales: null, salesUsed: 0, permits: 2, policies: 2 },
    turns: 0,
    pending: null,
    stack: [],
    dice: [0, 0],
    over: false,
    winner: null,
    reason: "",
    stats: {
      landings: BOARD.map(() => 0),
      rentByOwner: names.map(() => 0),
      rentBySpace: BOARD.map(() => 0),
      boughtAt: BOARD.map(() => 0),
      auctions: 0,
      auctionTotal: 0,
      trades: 0,
      builds: 0,
      ruleUses: {},
      bankrupt: [],
    },
    log: opts.log ? [] : null,
    forced: [],
  };
  g.decks.journey = shuffled(g, JOURNEY.length);
  g.decks.postcard = shuffled(g, POSTCARDS.length);
  g.ps.forEach((p, i) => (p.cash += cfg.seatBonus[i] ?? 0));
  if (cfg.dealCities > 0) {
    // the quick game: everyone starts with a few random cities
    const cities = shuffled(g, CITIES.length).map((k) => CITY_AT[CITIES[k].id]);
    let k = 0;
    for (let round = 0; round < cfg.dealCities; round++) for (let p = 0; p < g.ps.length && k < cities.length; p++) g.deeds[cities[k++]]!.owner = p;
  }
  startTurn(g);
  return g;
}

const say = (g: Game, s: string) => g.log?.push(s);
export const active = (g: Game) => g.ps.map((_, i) => i).filter((i) => !g.ps[i].out);

/* ------------------------------------------------------------------ money and worth */

export function priceOf(g: Game, at: number) {
  const s = BOARD[at];
  if (s.k === "city") return g.cfg.prices[s.id];
  if (s.k === "route") return g.cfg.routePrice;
  if (s.k === "service") return g.cfg.servicePrice;
  return 0;
}

export function houseCost(g: Game, at: number) {
  const gr = groupOfSpace(at);
  return gr ? g.cfg.houseCost[gr] : 0;
}

/** What a player is worth: cash, deeds at price (mortgaged at half), buildings at cost (Cairo's double), passport stamps. */
export function worth(g: Game, p: number) {
  const pl = g.ps[p];
  if (pl.out) return 0;
  let w = pl.cash;
  g.deeds.forEach((d, i) => {
    if (!d || d.owner !== p) return;
    w += d.mort ? priceOf(g, i) / 2 : priceOf(g, i);
    w += d.houses * houseCost(g, i) * (i === CAIRO && g.cfg.cityRules ? 2 : 1);
  });
  if (g.cfg.passport.on) w += pl.stamps.length * g.cfg.passport.stamp;
  return w;
}

/** Owns the whole group, or (Istanbul's rule) Istanbul plus two European cities. */
export function hasSet(g: Game, p: number, group: number) {
  const idx = GROUP_AT[group];
  const own = idx.filter((i) => g.deeds[i]!.owner === p).length;
  if (own === idx.length) return true;
  return g.cfg.cityRules && group === EUROPE && own >= idx.length - 1 && g.deeds[ISTANBUL]!.owner === p;
}

/** The rent a visitor owes on a space (before any city rule changes it). */
export function rentOf(g: Game, at: number, diceTotal: number) {
  const d = g.deeds[at];
  if (!d || d.owner < 0 || d.mort) return 0;
  const s = BOARD[at];
  if (s.k === "route") {
    const n = ROUTE_AT.filter((i) => g.deeds[i]!.owner === d.owner).length;
    return g.cfg.routeRent[n - 1] ?? 0;
  }
  if (s.k === "service") {
    const n = SERVICE_AT.filter((i) => g.deeds[i]!.owner === d.owner).length;
    return diceTotal * (g.cfg.serviceTimes[n - 1] ?? 0);
  }
  if (s.k !== "city") return 0;
  const r = g.cfg.rents[s.id];
  if (d.houses > 0) return r[1 + d.houses];
  return hasSet(g, d.owner, CITY_OF[at]!.group) ? r[1] : r[0];
}

function give(g: Game, from: number, to: number, amount: number) {
  if (amount <= 0) return;
  if (from >= 0) g.ps[from].cash -= amount;
  if (to >= 0) g.ps[to].cash += amount;
}

/** Pay someone (-1 = the bank). Short of cash: sell and mortgage, or go broke (a `debt` question). */
function pay(g: Game, p: number, amount: number, to: number) {
  amount = Math.round(amount);
  if (amount <= 0 || g.ps[p].out) return;
  if (g.ps[p].cash >= amount) {
    give(g, p, to, amount);
    return;
  }
  g.pending = { k: "debt", who: p, amount, to };
}

function collect(g: Game, p: number, amount: number) {
  if (amount > 0 && !g.ps[p].out) g.ps[p].cash += Math.round(amount);
}

/** Money each player owes `to`, in turn order (a card or a rule that charges everyone). */
function everyonePays(g: Game, to: number, amount: number) {
  for (const q of active(g).reverse()) if (q !== to) g.stack.push({ t: "pay", p: q, amount, to });
}

function bankrupt(g: Game, p: number, to: number) {
  const pl = g.ps[p];
  say(g, `${pl.name} goes broke`);
  g.stats.bankrupt.push(p);
  // buildings go back to the bank at half; the creditor gets the money, the deeds and the cards
  let cash = pl.cash;
  g.deeds.forEach((d, i) => {
    if (!d || d.owner !== p) return;
    cash += (d.houses * houseCost(g, i)) / 2;
    d.houses = 0;
  });
  pl.cash = 0;
  if (to >= 0) {
    g.ps[to].cash += Math.round(cash);
    g.deeds.forEach((d) => {
      if (d && d.owner === p) d.owner = to;
    });
    g.ps[to].keep.push(...pl.keep);
    g.ps[to].permits += pl.permits;
  } else {
    // owed to the bank: the deeds go back to the bank, unmortgaged, for whoever lands next
    g.deeds.forEach((d) => {
      if (d && d.owner === p) {
        d.owner = -1;
        d.mort = false;
      }
    });
    g.fx.permits += pl.permits;
  }
  if (pl.policy) g.fx.policies += 1;
  pl.keep = [];
  pl.permits = 0;
  pl.policy = false;
  pl.out = true;
  if (g.fx.ban?.by === p) g.fx.ban = null;
  if (g.fx.typhoon === p) g.fx.typhoon = null;
  if (g.fx.sales === p) g.fx.sales = null;
  // their part of anything still waiting is dropped
  g.stack = g.stack.filter((t) => !("p" in t) || t.p !== p);
  if (active(g).length <= 1) finish(g, "last");
}

/* ------------------------------------------------------------------ free actions: build, sell, mortgage, trade */

function evenOk(g: Game, at: number, delta: 1 | -1) {
  const gr = groupOfSpace(at)!;
  const p = g.deeds[at]!.owner;
  const mine = GROUP_AT[gr].filter((i) => g.deeds[i]!.owner === p);
  const h = g.deeds[at]!.houses + delta;
  return mine.every((i) => i === at || Math.abs(g.deeds[i]!.houses - h) <= 1);
}

export function canBuild(g: Game, p: number, at: number) {
  const d = g.deeds[at];
  const gr = groupOfSpace(at);
  if (!d || !gr || d.owner !== p || d.mort || d.houses >= 5 || g.ps[p].out) return false;
  if (!hasSet(g, p, gr)) return false;
  if (GROUP_AT[gr].some((i) => g.deeds[i]!.owner === p && g.deeds[i]!.mort)) return false;
  return evenOk(g, at, 1) && g.ps[p].cash >= buildPrice(g, at);
}

export function buildPrice(g: Game, at: number) {
  return g.fx.sales !== null ? Math.round(houseCost(g, at) / 2) : houseCost(g, at);
}

export function build(g: Game, p: number, at: number) {
  if (!canBuild(g, p, at)) return false;
  g.ps[p].cash -= buildPrice(g, at);
  g.deeds[at]!.houses += 1;
  g.stats.builds += 1;
  return true;
}

export function canSell(g: Game, p: number, at: number) {
  const d = g.deeds[at];
  return !!d && d.owner === p && d.houses > 0 && evenOk(g, at, -1);
}

export function sell(g: Game, p: number, at: number) {
  if (!canSell(g, p, at)) return false;
  g.deeds[at]!.houses -= 1;
  g.ps[p].cash += Math.round(houseCost(g, at) / 2);
  return true;
}

export function canMortgage(g: Game, p: number, at: number) {
  const d = g.deeds[at];
  if (!d || d.owner !== p || d.mort) return false;
  const gr = groupOfSpace(at);
  return !gr || GROUP_AT[gr].every((i) => g.deeds[i]!.owner !== p || g.deeds[i]!.houses === 0);
}

export function mortgage(g: Game, p: number, at: number) {
  if (!canMortgage(g, p, at)) return false;
  g.deeds[at]!.mort = true;
  g.ps[p].cash += priceOf(g, at) / 2;
  return true;
}

export const unmortgageCost = (g: Game, at: number) => Math.round((priceOf(g, at) / 2) * 1.1);

export function unmortgage(g: Game, p: number, at: number) {
  const d = g.deeds[at];
  if (!d || d.owner !== p || !d.mort || g.ps[p].cash < unmortgageCost(g, at)) return false;
  g.ps[p].cash -= unmortgageCost(g, at);
  d.mort = false;
  return true;
}

export type Offer = { cash: number; deeds: number[]; cards: string[] };

/** Swap cash, deeds (no buildings on their groups) and Keep cards between two players. */
export function trade(g: Game, a: number, b: number, give_: Offer, get: Offer) {
  const ok = (p: number, o: Offer) =>
    o.cash >= 0 &&
    g.ps[p].cash >= o.cash &&
    o.deeds.every((i) => {
      const d = g.deeds[i];
      const gr = groupOfSpace(i);
      return d && d.owner === p && (!gr || GROUP_AT[gr].every((j) => g.deeds[j]!.houses === 0 || g.deeds[j]!.owner !== p));
    }) &&
    o.cards.every((c) => g.ps[p].keep.includes(c));
  if (a === b || g.ps[a].out || g.ps[b].out || !ok(a, give_) || !ok(b, get)) return false;
  give(g, a, b, give_.cash);
  give(g, b, a, get.cash);
  for (const i of give_.deeds) g.deeds[i]!.owner = b;
  for (const i of get.deeds) g.deeds[i]!.owner = a;
  for (const c of give_.cards) {
    g.ps[a].keep.splice(g.ps[a].keep.indexOf(c), 1);
    g.ps[b].keep.push(c);
  }
  for (const c of get.cards) {
    g.ps[b].keep.splice(g.ps[b].keep.indexOf(c), 1);
    g.ps[a].keep.push(c);
  }
  g.stats.trades += 1;
  return true;
}

/* ------------------------------------------------------------------ turns */

function startTurn(g: Game) {
  const p = g.turn;
  const pl = g.ps[p];
  // effects that last "until your next turn" end when that turn begins
  if (g.fx.ban?.by === p) g.fx.ban = null;
  if (g.fx.typhoon === p) g.fx.typhoon = null;
  if (g.fx.sales === p) g.fx.sales = null;
  pl.dbl = 0;
  g.pending = { k: "roll", who: p, jail: pl.jail };
}

function nextTurn(g: Game) {
  const p = g.turn;
  g.ps[p].turns += 1;
  g.turns += 1;
  check(g);
  if (g.over) return;
  if (g.turns >= g.cfg.maxTurns) return finish(g, "cap");
  let q = p;
  for (let k = 0; k < g.ps.length; k++) {
    q = (q + g.dir + g.ps.length) % g.ps.length;
    if (!g.ps[q].out) break;
  }
  g.turn = q;
  startTurn(g);
}

/** End-of-turn checks: a net worth target reached, or the rounds used up (everyone has had the same number of turns). */
function check(g: Game) {
  if (g.over) return;
  const live = active(g);
  if (live.length <= 1) return finish(g, "last");
  const end = g.cfg.end;
  if (end.kind === "target") {
    const best = live.reduce((a, b) => (worth(g, b) > worth(g, a) ? b : a));
    if (worth(g, best) >= end.amount) finish(g, "target");
  } else {
    const done = live.every((q) => g.ps[q].turns >= end.rounds);
    if (done) finish(g, "rounds");
  }
}

function finish(g: Game, reason: Game["reason"]) {
  if (g.over) return;
  g.over = true;
  g.reason = reason;
  g.pending = null;
  g.stack = [];
  const live = active(g);
  g.winner = live.length ? live.reduce((a, b) => (worth(g, b) > worth(g, a) ? b : a)) : null;
  say(g, `game over (${reason}): ${g.winner === null ? "nobody" : g.ps[g.winner].name} wins`);
}

function roll(g: Game): [number, number] {
  g.dice = [die(g), die(g)];
  return g.dice;
}

/** Steps after the Mexico City driving ban: a die showing a banned number doesn't move you. */
function stepsOf(g: Game, d: [number, number], oneDie: boolean) {
  const dice = oneDie ? [d[0]] : d;
  const ban = g.fx.ban;
  return dice.reduce((s, x) => s + (ban && (x === ban.lo || x === ban.hi) ? 0 : x), 0);
}

function moveBy(g: Game, p: number, steps: number) {
  const pl = g.ps[p];
  const to = (((pl.pos + steps) % N_SPACES) + N_SPACES) % N_SPACES;
  if (steps > 0 && to < pl.pos) collect(g, p, g.cfg.salary);
  pl.pos = to;
}

/** Fly or walk forward to a space, collecting salary if Departure is passed. */
function advanceTo(g: Game, p: number, to: number) {
  const pl = g.ps[p];
  if (to <= pl.pos) collect(g, p, g.cfg.salary);
  pl.pos = to;
}

function toJail(g: Game, p: number) {
  const pl = g.ps[p];
  pl.pos = JAIL;
  pl.jail = true;
  pl.dbl = 0;
  say(g, `${pl.name} is sent to Immigration`);
}

/* ------------------------------------------------------------------ the loop */

/** Run the turn until somebody has to decide something. */
function run(g: Game) {
  while (!g.over && !g.pending) {
    const task = g.stack.pop();
    if (!task) {
      // a player who went broke on their own turn has nothing left to end
      if (g.ps[g.turn].out) {
        nextTurn(g);
        continue;
      }
      g.pending = { k: "end", who: g.turn };
      return;
    }
    exec(g, task);
  }
}

function exec(g: Game, task: Task) {
  if ("p" in task && g.ps[task.p].out) return;
  switch (task.t) {
    case "land":
      return land(g, task.p, !!task.noTango);
    case "rule":
      return rule(g, task.p, task.at, !!task.noTango);
    case "prop":
      return prop(g, task);
    case "after":
      return after(g, task.p, task.at);
    case "endMove": {
      const pl = g.ps[task.p];
      if (task.again && !pl.jail) g.pending = { k: "roll", who: task.p, jail: false };
      return;
    }
    case "pay":
      return pay(g, task.p, task.amount, task.to);
    case "card":
      return drawCard(g, task.p, task.deck);
    case "check":
      return check(g);
  }
}

function moveAndLand(g: Game, p: number, steps: number, again: boolean) {
  moveBy(g, p, steps);
  g.stack.push({ t: "endMove", p, again });
  g.stack.push({ t: "land", p });
}

/* ------------------------------------------------------------------ landing */

function land(g: Game, p: number, noTango: boolean) {
  const pl = g.ps[p];
  const at = pl.pos;
  const s = BOARD[at];
  g.stats.landings[at] += 1;
  say(g, `${pl.name} lands on ${s.k === "city" ? s.id : s.k}`);
  if (s.k === "city" && !pl.stamps.includes(s.id)) {
    pl.stamps.push(s.id);
    if (g.cfg.passport.on && !pl.bonus && GROUPS.every((gr) => pl.stamps.some((id) => CITIES.find((c) => c.id === id)!.group === gr.id))) {
      pl.bonus = true;
      collect(g, p, g.cfg.passport.bonus);
      g.stats.ruleUses.passport = (g.stats.ruleUses.passport ?? 0) + 1;
    }
  }
  switch (s.k) {
    case "city":
      if (g.cfg.cityRules) g.stack.push({ t: "rule", p, at, noTango });
      else g.stack.push({ t: "prop", p, at });
      return;
    case "route":
    case "service":
      g.stack.push({ t: "prop", p, at });
      return;
    case "journey":
    case "postcard":
      g.stack.push({ t: "card", p, deck: s.k });
      return;
    case "tax":
      g.stack.push({ t: "pay", p, amount: s.amount, to: -1 });
      return;
    case "expired":
      toJail(g, p);
      return;
    default:
      return;
  }
}

/** Buy, auction or pay rent. */
function prop(g: Game, task: Extract<Task, { t: "prop" }>) {
  const { p, at } = task;
  const d = g.deeds[at]!;
  if (d.owner < 0) {
    let price = priceOf(g, at);
    if (BOARD[at].k === "city" && g.ps[p].keep.includes("points")) price = Math.round(price * 0.8);
    g.pending = { k: "buy", who: p, at, price };
    return;
  }
  if (d.owner === p || d.mort) return;
  if (g.cfg.cityRules && g.fx.typhoon !== null) return; // Signal No. 8: nobody pays rent
  let rent = rentOf(g, at, g.dice[0] + g.dice[1]);
  const city = cityAt(at);
  if (task.base && city) rent = g.cfg.rents[city.id][0];
  if (task.double) rent *= 2;
  rent *= task.mult ?? 1;
  let to = d.owner;
  // Vancouver's empty homes tax: owned but unbuilt, the rent goes to the bank
  if (g.cfg.cityRules && city?.id === "vancouver" && d.houses === 0) to = -1;
  if (task.toBank) to = -1;
  const pl = g.ps[p];
  if (pl.policy) {
    rent /= 2;
    pl.policy = false;
    g.fx.policies += 1;
  }
  rent = Math.round(rent);
  if (rent <= 0) return;
  if (pl.keep.includes("koi")) {
    g.pending = { k: "koi", who: p, rent, to };
    return;
  }
  chargeRent(g, p, at, rent, to);
}

function chargeRent(g: Game, p: number, at: number, rent: number, to: number) {
  g.stats.rentBySpace[at] += rent;
  if (to >= 0) g.stats.rentByOwner[to] += rent;
  pay(g, p, rent, to);
}

/** Things that happen once the space is settled (Beijing's jump). */
function after(g: Game, p: number, at: number) {
  if (cityAt(at)?.id === "beijing") g.pending = { k: "jump", who: p };
}

/* ------------------------------------------------------------------ city rules */

function use(g: Game, id: string) {
  g.stats.ruleUses[id] = (g.stats.ruleUses[id] ?? 0) + 1;
}

function rule(g: Game, p: number, at: number, noTango: boolean) {
  const city = cityAt(at)!;
  const d = g.deeds[at]!;
  const owned = d.owner >= 0 && d.owner !== p && !d.mort;
  const others = active(g).filter((q) => q !== p);
  switch (city.id) {
    case "capetown":
      use(g, city.id);
      g.stack.push({ t: "prop", p, at });
      g.pending = { k: "water", votes: {} };
      return;
    case "buenosaires":
      if (noTango || !others.length) break;
      g.pending = { k: "tango", who: p };
      return; // the answer decides whether this space is settled here
    case "mexicocity":
      use(g, city.id);
      g.stack.push({ t: "prop", p, at });
      g.pending = { k: "ban", who: p };
      return;
    case "rio":
      g.stack.push({ t: "prop", p, at });
      if (others.length) g.pending = { k: "dance", who: p };
      return;
    case "mumbai":
      g.stack.push({ t: "prop", p, at });
      if (g.deeds.some((x) => x && x.owner === p && x.houses > 0)) g.pending = { k: "mumbai", who: p };
      return;
    case "dubai":
      g.stack.push({ t: "prop", p, at });
      if (g.decks.journey.length >= 1) g.pending = { k: "peek", who: p, cards: g.decks.journey.slice(-3).reverse() };
      return;
    case "lasvegas":
      g.stack.push({ t: "prop", p, at });
      if (g.ps[p].cash > 0) g.pending = { k: "bet", who: p, at };
      return;
    case "newyork":
      if (owned && rentOf(g, at, 0) > g.cfg.rents[city.id][0]) {
        g.pending = { k: "freeze", who: p, at, votes: {} };
        return;
      }
      break;
    case "tokyo": {
      g.stack.push({ t: "prop", p, at });
      const pos = g.ps[p].pos;
      const cands = others.filter((q) => !g.ps[q].jail);
      if (!cands.length) return;
      const dist = (q: number) => {
        const f = (g.ps[q].pos - pos + N_SPACES) % N_SPACES;
        return Math.min(f, N_SPACES - f) * 2 + (f <= N_SPACES / 2 ? 0 : 1);
      };
      const q = cands.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      use(g, city.id);
      moveBy(g, q, 1);
      g.stack.push({ t: "land", p: q });
      return;
    }
    case "beijing":
      g.stack.push({ t: "after", p, at });
      break;
    case "shanghai":
      if (owned) {
        // the owner reads an item from the quiz card and says whether the answer was right
        g.pending = { k: "quiz", who: d.owner, visitor: p, at };
        return;
      }
      break;
    case "bangkok":
      g.stack.push({ t: "prop", p, at });
      if (active(g).length >= 2) g.pending = { k: "splash", who: p, votes: {} };
      return;
    case "sydney":
      g.stack.push({ t: "prop", p, at });
      g.pending = { k: "reverse", who: p };
      return;
    case "singapore":
      g.stack.push({ t: "prop", p, at });
      if (g.fx.permits > 0) g.pending = { k: "coe", who: p, bids: {} };
      return;
    case "venice":
      if (owned) {
        const tide = die(g) <= 2;
        if (tide) {
          use(g, city.id);
          // the owner may pay $50 to raise the flood barrier
          g.pending = { k: "barrier", who: d.owner, visitor: p, at };
          return;
        }
      }
      break;
    case "paris":
      g.stack.push({ t: "prop", p, at });
      if (g.fx.salesUsed < 2) g.pending = { k: "sales", who: p };
      return;
    case "london":
      g.stack.push({ t: "prop", p, at });
      if (!g.ps[p].policy && g.fx.policies > 0 && g.ps[p].cash >= 50) g.pending = { k: "policy", who: p, to: owned ? d.owner : -1 };
      return;
    case "seoul":
      g.pending = { k: "silence", who: p, at };
      return;
    case "hongkong": {
      const sum = die(g) + die(g);
      if (sum >= 8 && sum <= 10) {
        g.fx.typhoon = p;
        use(g, city.id);
      }
      break;
    }
  }
  g.stack.push({ t: "prop", p, at });
}

/* ------------------------------------------------------------------ cards */

function drawCard(g: Game, p: number, deck: "journey" | "postcard") {
  const list = deck === "journey" ? JOURNEY : POSTCARDS;
  let pile = g.decks[deck];
  if (!pile.length) {
    // reshuffle everything that isn't held as a Keep card
    const held = new Set(g.ps.flatMap((x) => x.keep));
    pile = shuffled(g, list.length).filter((i) => !held.has(list[i].id));
    g.decks[deck] = pile;
  }
  const idx = pile.pop();
  if (idx === undefined) return;
  const card = list[idx];
  const pl = g.ps[p];
  say(g, `${pl.name} draws ${card.id}`);
  if (card.keep) {
    pl.keep.push(card.id);
    return;
  }
  switch (card.id) {
    case "upgrade": {
      const to = ROUTE_AT.find((i) => i > pl.pos) ?? ROUTE_AT[0];
      advanceTo(g, p, to);
      g.stats.landings[to] += 1;
      g.stack.push({ t: "prop", p, at: to, double: true });
      return;
    }
    case "miles":
      g.pending = { k: "card-route", who: p };
      return;
    case "redeye":
      pl.pos = (pl.pos - 3 + N_SPACES) % N_SPACES;
      g.stack.push({ t: "land", p });
      return;
    case "home":
      pl.pos = 0;
      collect(g, p, g.cfg.salary);
      g.stats.landings[0] += 1;
      return;
    case "expired":
      toJail(g, p);
      g.stats.landings[JAIL] += 1;
      return;
    case "luggage":
    case "gifts":
    case "visa":
      g.stack.push({ t: "pay", p, amount: 50, to: -1 });
      return;
    case "postage":
      g.stack.push({ t: "pay", p, amount: 20, to: -1 });
      return;
    case "rate":
    case "viral":
      collect(g, p, 100);
      return;
    case "insurance":
      collect(g, p, 50);
      return;
    case "refund":
      collect(g, p, 75);
      return;
    case "wire":
      collect(g, p, 150);
      return;
    case "share": {
      const live = active(g);
      const rich = live.reduce((a, b) => (g.ps[b].cash > g.ps[a].cash ? b : a));
      const poor = live.reduce((a, b) => (g.ps[b].cash < g.ps[a].cash ? b : a));
      if (rich !== poor) g.stack.push({ t: "pay", p: rich, amount: 150, to: poor });
      return;
    }
    case "audit": {
      let n = 0;
      g.deeds.forEach((d) => {
        if (d && d.owner === p) n += d.houses === 5 ? 100 : d.houses * 25;
      });
      g.stack.push({ t: "pay", p, amount: n, to: -1 });
      return;
    }
    case "typhoon":
    case "cash":
      if (g.deeds.some((d, i) => d && d.owner === p && d.houses > 0 && !(g.cfg.cityRules && i === CAIRO) && canSell(g, p, i))) g.pending = { k: "card-house", who: p, card: card.id };
      return;
    case "hitch": {
      const d = roll(g);
      moveAndLand(g, p, stepsOf(g, d, false), false);
      return;
    }
    case "guide":
      everyonePays(g, p, 20);
      return;
    case "redenvelope":
      everyonePays(g, p, 10);
      return;
    case "lost":
      g.stack.push({ t: "card", p, deck: "postcard" });
      return;
    case "lounge":
    case "airport":
      advanceTo(g, p, LOUNGE);
      g.stats.landings[LOUNGE] += 1;
      return;
    case "jetlag":
      pl.jetlag = true;
      return;
    case "classmate":
      if (active(g).length > 1) g.pending = { k: "card-player", who: p };
      return;
    case "review":
      if (g.deeds.some((d, i) => d && d.owner === p && canBuildFree(g, p, i))) g.pending = { k: "card-house", who: p, card: "review" };
      return;
    case "leader": {
      const live = active(g);
      const top = live.reduce((a, b) => (worth(g, b) > worth(g, a) ? b : a));
      for (const q of live.reverse()) if (q !== top) g.stack.push({ t: "pay", p: top, amount: 25, to: q });
      return;
    }
  }
}

function canBuildFree(g: Game, p: number, at: number) {
  const cash = g.ps[p].cash;
  g.ps[p].cash = 1e9;
  const ok = canBuild(g, p, at);
  g.ps[p].cash = cash;
  return ok;
}

/* ------------------------------------------------------------------ answering */

export type Choice = Record<string, unknown>;

/** Who still owes an answer to the pending question. */
export function waitingOn(g: Game): number[] {
  const pd = g.pending;
  if (!pd) return [];
  if (BALLOTS.has(pd.k)) {
    const votes = (pd as { votes?: Ballot; bids?: Ballot }).votes ?? (pd as { bids: Ballot }).bids;
    const voters = pd.k === "scores" ? active(g).filter((q) => q !== pd.dancer) : pd.k === "freeze" ? active(g) : active(g);
    return voters.filter((q) => !(q in votes));
  }
  return [(pd as { who: number }).who];
}

/** Answer the pending question. Returns false (and changes nothing) if it isn't this player's to answer or the answer doesn't fit. */
export function decide(g: Game, who: number, c: Choice): boolean {
  const pd = g.pending;
  if (!pd || g.over || !waitingOn(g).includes(who)) return false;
  const yes = c.yes === true;
  switch (pd.k) {
    case "roll":
      return doRoll(g, who, c);
    case "permit": {
      const delta = Number(c.delta);
      if (![-1, 0, 1].includes(delta)) return false;
      g.pending = null;
      if (delta !== 0) {
        g.ps[who].permits -= 1;
        g.fx.permits += 1;
        use(g, "singapore-permit");
      }
      moveAndLand(g, who, pd.steps + delta, pd.again);
      break;
    }
    case "buy": {
      g.pending = null;
      if (yes && g.ps[who].cash >= pd.price) {
        g.ps[who].cash -= pd.price;
        g.deeds[pd.at]!.owner = who;
        g.stats.boughtAt[pd.at] += 1;
        if (pd.price !== priceOf(g, pd.at)) g.ps[who].keep.splice(g.ps[who].keep.indexOf("points"), 1);
      } else {
        g.pending = { k: "auction", at: pd.at, bids: {} };
      }
      break;
    }
    case "auction": {
      const bid = Math.floor(Number(c.bid) || 0);
      if (bid < 0 || bid > g.ps[who].cash) return false;
      pd.bids[who] = bid;
      if (waitingOn(g).length) return true;
      g.pending = null;
      resolveAuction(g, pd.at, pd.bids as Record<number, number>);
      break;
    }
    case "debt": {
      const pl = g.ps[who];
      if (c.pay === true) {
        if (pl.cash < pd.amount) return false;
        g.pending = null;
        give(g, who, pd.to, pd.amount);
      } else if (c.bankrupt === true) {
        g.pending = null;
        bankrupt(g, who, pd.to);
      } else return false;
      break;
    }
    case "end":
      g.pending = null;
      nextTurn(g);
      return true;
    case "card-route": {
      const at = Number(c.at);
      if (!ROUTE_AT.includes(at)) return false;
      g.pending = null;
      advanceTo(g, who, at);
      g.stats.landings[at] += 1;
      g.stack.push({ t: "prop", p: who, at });
      break;
    }
    case "card-player": {
      const q = Number(c.player);
      if (q === who || !g.ps[q] || g.ps[q].out) return false;
      g.pending = null;
      collect(g, who, 50);
      collect(g, q, 50);
      break;
    }
    case "card-house": {
      const at = Number(c.at);
      if (pd.card === "review") {
        if (!canBuildFree(g, who, at)) return false;
        g.deeds[at]!.houses += 1;
      } else {
        if (!canSell(g, who, at) || (g.cfg.cityRules && at === CAIRO)) return false;
        g.deeds[at]!.houses -= 1;
        if (pd.card === "cash") g.ps[who].cash += Math.round(houseCost(g, at) / 2);
      }
      g.pending = null;
      break;
    }
    case "koi": {
      g.pending = null;
      if (yes) {
        g.ps[who].keep.splice(g.ps[who].keep.indexOf("koi"), 1);
        use(g, "koi");
      } else chargeRent(g, who, g.ps[who].pos, pd.rent, pd.to);
      break;
    }
    case "water": {
      if (c.use !== true && c.use !== false) return false;
      pd.votes[who] = c.use;
      if (waitingOn(g).length) return true;
      g.pending = null;
      const users = Object.entries(pd.votes).filter(([, v]) => v === true).map(([k]) => Number(k));
      if (users.length * 2 > active(g).length) {
        for (const q of active(g).reverse()) g.stack.push({ t: "pay", p: q, amount: 50, to: -1 });
      } else for (const q of users) collect(g, q, 30);
      break;
    }
    case "tango": {
      const q = c.partner === null || c.partner === undefined ? -1 : Number(c.partner);
      g.pending = null;
      if (q < 0) {
        g.stack.push({ t: "prop", p: who, at: g.ps[who].pos });
        break;
      }
      if (q === who || !g.ps[q] || g.ps[q].out) {
        g.pending = pd;
        return false;
      }
      g.pending = { k: "tango-reply", who: q, from: who };
      break;
    }
    case "tango-reply": {
      g.pending = null;
      use(g, "buenosaires");
      const a = g.ps[pd.from];
      const b = g.ps[who];
      if (!yes) {
        g.stack.push({ t: "prop", p: pd.from, at: a.pos });
        g.stack.push({ t: "pay", p: who, amount: 50, to: pd.from });
        break;
      }
      const wasJail = b.jail;
      [a.pos, b.pos] = [b.pos, a.pos];
      b.jail = false;
      if (wasJail) b.jail = false;
      // both do their new spaces; the one who moved to Buenos Aires doesn't tango again
      g.stack.push({ t: "land", p: who, noTango: true });
      g.stack.push({ t: "land", p: pd.from, noTango: true });
      break;
    }
    case "ban": {
      const k = Number(c.pair);
      if (![0, 1, 2].includes(k)) return false;
      g.pending = null;
      g.fx.ban = { lo: 2 * k + 1, hi: 2 * k + 2, by: who };
      break;
    }
    case "dance":
      g.pending = yes ? { k: "scores", dancer: who, votes: {} } : null;
      if (yes) use(g, "rio");
      break;
    case "scores": {
      const sc = Math.round(Number(c.score));
      if (!(sc >= 1 && sc <= 10)) return false;
      pd.votes[who] = sc;
      if (waitingOn(g).length) return true;
      g.pending = null;
      const all = Object.values(pd.votes as Record<number, number>).sort((x, y) => x - y);
      const total = all.length >= 2 ? all.slice(1).reduce((s, x) => s + x, 0) : all.reduce((s, x) => s + x, 0);
      collect(g, pd.dancer, total * 5);
      break;
    }
    case "mumbai": {
      g.pending = null;
      if (c.from === undefined) break;
      const from = Number(c.from);
      const to = Number(c.to);
      const df = g.deeds[from];
      const dt = g.deeds[to];
      if (!df || !dt || df.owner !== who || dt.owner !== who || from === to || !canSell(g, who, from)) {
        g.pending = pd;
        return false;
      }
      df.houses -= 1;
      if (!canBuildFree(g, who, to)) {
        df.houses += 1;
        g.pending = pd;
        return false;
      }
      dt.houses += 1;
      use(g, "mumbai");
      break;
    }
    case "peek": {
      g.pending = null;
      const order = Array.isArray(c.order) ? (c.order as number[]) : null;
      if (order && order.length === pd.cards.length && pd.cards.every((x) => order.includes(x))) {
        const pile = g.decks.journey;
        pile.splice(pile.length - pd.cards.length, pd.cards.length, ...[...order].reverse());
        use(g, "dubai");
      }
      break;
    }
    case "bet": {
      const bet = Math.floor(Number(c.bet) || 0);
      if (bet < 0 || bet > Math.min(200, g.ps[who].cash)) return false;
      g.pending = null;
      if (bet === 0) break;
      use(g, "lasvegas");
      const owner = g.deeds[pd.at]!.owner;
      const house = owner >= 0 && owner !== who ? owner : -1;
      const seven = die(g) + die(g) === 7;
      if (seven) {
        if (house >= 0) g.stack.push({ t: "pay", p: house, amount: bet * 4, to: who });
        else collect(g, who, bet * 4);
      } else give(g, who, house, bet);
      break;
    }
    case "freeze": {
      pd.votes[who] = yes;
      if (waitingOn(g).length) return true;
      g.pending = null;
      const ayes = Object.values(pd.votes).filter((v) => v === true).length;
      const frozen = ayes * 2 > active(g).length;
      if (frozen) use(g, "newyork");
      g.stack.push({ t: "prop", p: pd.who, at: pd.at, base: frozen });
      break;
    }
    case "jump": {
      g.pending = null;
      if (!yes) break;
      use(g, "beijing");
      moveBy(g, who, N_SPACES / 2);
      g.stack.push({ t: "land", p: who });
      break;
    }
    case "quiz": {
      // the owner says whether the answer was right
      g.pending = null;
      use(g, "shanghai");
      g.stack.push({ t: "prop", p: pd.visitor, at: pd.at, mult: yes ? 0.5 : 2 });
      break;
    }
    case "splash": {
      const q = Number(c.target);
      if (!g.ps[q] || g.ps[q].out || q === who) return false;
      pd.votes[who] = q;
      if (waitingOn(g).length) return true;
      g.pending = null;
      use(g, "bangkok");
      const count: Record<number, number> = {};
      for (const v of Object.values(pd.votes) as number[]) count[v] = (count[v] ?? 0) + 1;
      const top = Math.max(...Object.values(count));
      for (const [q2, n] of Object.entries(count)) if (n === top) collect(g, Number(q2), 50);
      break;
    }
    case "reverse":
      g.pending = null;
      if (yes) {
        g.dir = g.dir === 1 ? -1 : 1;
        use(g, "sydney");
      }
      break;
    case "coe": {
      const bid = Math.floor(Number(c.bid) || 0);
      if (bid < 0 || bid > g.ps[who].cash) return false;
      pd.bids[who] = bid;
      if (waitingOn(g).length) return true;
      g.pending = null;
      const bids = Object.entries(pd.bids as Record<number, number>)
        .map(([k, v]) => [Number(k), v] as [number, number])
        .filter(([, v]) => v > 0)
        .sort((x, y) => y[1] - x[1] || order(g, x[0], pd.who) - order(g, y[0], pd.who));
      if (!bids.length) break;
      const [winner] = bids[0];
      const price = bids[1]?.[1] ?? 0;
      give(g, winner, -1, price);
      g.ps[winner].permits += 1;
      g.fx.permits -= 1;
      use(g, "singapore");
      break;
    }
    case "barrier": {
      g.pending = null;
      if (yes && g.ps[who].cash >= 50) {
        give(g, who, -1, 50);
        g.stack.push({ t: "prop", p: pd.visitor, at: pd.at });
      } else g.stack.push({ t: "prop", p: pd.visitor, at: pd.at, mult: 0.5 });
      break;
    }
    case "sales":
      g.pending = null;
      if (yes) {
        g.fx.sales = who;
        g.fx.salesUsed += 1;
        use(g, "paris");
      }
      break;
    case "policy":
      g.pending = null;
      if (yes && g.ps[who].cash >= 50 && g.fx.policies > 0) {
        give(g, who, pd.to, 50);
        g.ps[who].policy = true;
        g.fx.policies -= 1;
        use(g, "london");
      }
      break;
    case "silence": {
      // who made a sound first (or nobody)
      const q = c.sound === null || c.sound === undefined ? -1 : Number(c.sound);
      if (q >= 0 && (!g.ps[q] || g.ps[q].out || q === who)) return false;
      g.pending = null;
      use(g, "seoul");
      const d = g.deeds[pd.at]!;
      if (d.owner >= 0 && d.owner !== who && !d.mort) {
        if (q >= 0 && q !== d.owner) {
          // the first one to make a sound pays the visitor's rent
          const rent = g.fx.typhoon !== null ? 0 : rentOf(g, pd.at, 0);
          if (rent > 0) chargeRent(g, q, pd.at, rent, d.owner);
        } else if (q < 0) g.stack.push({ t: "prop", p: who, at: pd.at });
        // the owner made the sound: the visitor is off the hook
      } else {
        g.stack.push({ t: "prop", p: who, at: pd.at });
        // nobody owns Seoul: whoever made the sound pays the visitor $50
        if (q >= 0 && d.owner < 0) g.stack.push({ t: "pay", p: q, amount: 50, to: who });
      }
      break;
    }
    default:
      return false;
  }
  run(g);
  return true;
}

/** Seats after `from` in turn order (for breaking ties). */
function order(g: Game, q: number, from: number) {
  return (q - from + g.ps.length) % g.ps.length;
}

function resolveAuction(g: Game, at: number, bids: Record<number, number>) {
  // an open auction ends where the second-highest bidder stops: the top bidder pays $10 more (never more than they offered)
  const list = Object.entries(bids)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .filter(([q, v]) => v >= 10 && !g.ps[q].out)
    .sort((x, y) => y[1] - x[1] || order(g, x[0], g.turn) - order(g, y[0], g.turn));
  if (!list.length) return;
  const [winner, top] = list[0];
  const second = list[1]?.[1] ?? 0;
  const price = Math.max(10, Math.min(top, second + 10));
  g.ps[winner].cash -= price;
  g.deeds[at]!.owner = winner;
  g.stats.auctions += 1;
  g.stats.auctionTotal += price;
  g.stats.boughtAt[at] += 1;
}

function doRoll(g: Game, who: number, c: Choice): boolean {
  const pl = g.ps[who];
  const pd = g.pending as Extract<Pending, { k: "roll" }>;
  if (pd.jail) {
    // Immigration: pay, hand in a Visa Waiver, or roll; out either way, moving by the roll
    const how = c.how === "pay" || c.how === "waiver" ? c.how : "roll";
    if (how === "waiver") {
      const k = pl.keep.findIndex((x) => x === "waiver" || x === "waiver2");
      if (k < 0) return false;
      pl.keep.splice(k, 1);
    }
    g.pending = null;
    pl.jail = false;
    const d = roll(g);
    const fee = how === "pay" || (how === "roll" && d[0] !== d[1]);
    const steps = stepsOf(g, d, pl.jetlag);
    pl.jetlag = false;
    moveAndLand(g, who, steps, false);
    // the fee is paid first: it goes on top of the move
    if (fee) g.stack.push({ t: "pay", p: who, amount: g.cfg.immigrationFee, to: -1 });
    run(g);
    return true;
  }
  g.pending = null;
  const d = roll(g);
  const one = pl.jetlag;
  pl.jetlag = false;
  const doubles = !one && d[0] === d[1];
  if (doubles) {
    pl.dbl += 1;
    if (pl.dbl >= 3) {
      toJail(g, who);
      g.stats.landings[JAIL] += 1;
      run(g);
      return true;
    }
  }
  const steps = stepsOf(g, d, one);
  if (pl.permits > 0 && g.cfg.cityRules) {
    g.pending = { k: "permit", who, steps, again: doubles };
    return true;
  }
  moveAndLand(g, who, steps, doubles);
  run(g);
  return true;
}

/** Free actions go through these so the game moves on afterwards if they settled a debt. */
export function act(g: Game, who: number, a: { k: "build" | "sell" | "mortgage" | "unmortgage"; at: number }) {
  const pd = g.pending;
  // your own turn (rolling or ending), or while you owe money
  const mine = pd && "who" in pd && pd.who === who && (pd.k === "roll" || pd.k === "end" || pd.k === "debt");
  if (!mine) return false;
  if (a.k === "build") return pd!.k !== "debt" && build(g, who, a.at);
  if (a.k === "sell") return sell(g, who, a.at);
  if (a.k === "mortgage") return mortgage(g, who, a.at);
  return pd!.k !== "debt" && unmortgage(g, who, a.at);
}

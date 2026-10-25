// Money, property and end-of-game rules. Pure functions over GameState.
// Recovered from the step-3 engine; behaviour (including every random draw) is unchanged.
import {
  BOARD_SIZE,
  CAIRO,
  CITY_AT,
  EUROPE,
  GROUP_SPACES,
  ISTANBUL,
  ROUTE_SPACES,
  SERVICE_SPACES,
  groupAt,
} from "./board";
import { BOARD } from "./data";
import { newsFor } from "./news";
import type { GameEvent, GameState, Offer } from "./state";

export function log(s: GameState, line: string) {
  s.log?.push(line);
}

/** Record an event for the UI (no-op in simulations). */
export function ev(s: GameState, e: GameEvent) {
  s.events?.push(e);
}

export function countRule(s: GameState, key: string) {
  s.stats.ruleUses[key] = (s.stats.ruleUses[key] ?? 0) + 1;
}

/** Seats still in the game, in seat order. */
export const activePlayers = (s: GameState) => s.ps.map((_, i) => i).filter((i) => !s.ps[i].out);

export function priceOf(s: GameState, at: number): number {
  const sp = BOARD[at];
  return sp.k === "city" ? s.cfg.prices[sp.id] : sp.k === "route" ? s.cfg.routePrice : sp.k === "service" ? s.cfg.servicePrice : 0;
}

export function houseCostAt(s: GameState, at: number): number {
  const g = groupAt(at);
  return g ? s.cfg.houseCost[g] : 0;
}

/** Net worth: cash + deeds at price (half if mortgaged) + houses at cost (Cairo's count double) + passport stamps. */
export function netWorth(s: GameState, p: number): number {
  const pl = s.ps[p];
  if (pl.out) return 0;
  let worth = pl.cash;
  s.deeds.forEach((d, at) => {
    if (!d || d.owner !== p) return;
    worth += d.mort ? priceOf(s, at) / 2 : priceOf(s, at);
    worth += d.houses * houseCostAt(s, at) * (at === CAIRO && s.cfg.cityRules ? 2 : 1);
  });
  if (s.cfg.passport.on) worth += pl.stamps.length * s.cfg.passport.stamp;
  return worth;
}

/** Owns the whole group. Istanbul stands in for one missing Europe city. */
export function ownsSet(s: GameState, p: number, group: number): boolean {
  const spaces = GROUP_SPACES[group];
  const owned = spaces.filter((at) => s.deeds[at]!.owner === p).length;
  if (owned === spaces.length) return true;
  return s.cfg.cityRules && group === EUROPE && owned >= spaces.length - 1 && s.deeds[ISTANBUL]!.owner === p;
}

/** Rent due on a space (before city rules), given the dice total for services. */
export function rentAt(s: GameState, at: number, diceTotal: number): number {
  const d = s.deeds[at];
  if (!d || d.owner < 0 || d.mort) return 0;
  const sp = BOARD[at];
  if (sp.k === "route") {
    const n = ROUTE_SPACES.filter((r) => s.deeds[r]!.owner === d.owner).length;
    return s.cfg.routeRent[n - 1] ?? 0;
  }
  if (sp.k === "service") {
    const n = SERVICE_SPACES.filter((r) => s.deeds[r]!.owner === d.owner).length;
    return diceTotal * (s.cfg.serviceTimes[n - 1] ?? 0);
  }
  if (sp.k !== "city") return 0;
  const table = s.cfg.rents[sp.id];
  const rent = d.houses > 0 ? table[1 + d.houses] : ownsSet(s, d.owner, CITY_AT[at]!.group) ? table[1] : table[0];
  const news = newsFor(s, sp.id);
  return news?.rent ? Math.round(rent * news.rent) : rent;
}

/** Move money. -1 is the bank. */
export function transfer(s: GameState, from: number, to: number, amount: number) {
  if (amount <= 0) return;
  if (from >= 0) s.ps[from].cash -= amount;
  if (to >= 0) s.ps[to].cash += amount;
}

/** Make `p` pay; if they can't, the game waits for them to raise cash or go bankrupt. */
export function charge(s: GameState, p: number, amount: number, to: number, quiet = false) {
  amount = Math.round(amount);
  if (amount <= 0 || s.ps[p].out) return;
  if (s.ps[p].cash >= amount) {
    transfer(s, p, to, amount);
    if (!quiet) ev(s, { t: "pay", p, to, amount });
    return;
  }
  s.pending = { k: "debt", who: p, amount, to };
  ev(s, { t: "debt", p, to, amount });
}

/** Money from the bank. */
export function credit(s: GameState, p: number, amount: number) {
  if (amount > 0 && !s.ps[p].out) s.ps[p].cash += Math.round(amount);
}

/** Every other active seat pays `p`. */
export function everyonePays(s: GameState, p: number, amount: number) {
  for (const q of activePlayers(s).reverse()) if (q !== p) s.stack.push({ t: "pay", p: q, amount, to: p });
}

/** `p` goes broke owing `to` (-1 bank). Houses are sold at half; everything else goes to the creditor or back to the bank. */
export function bankrupt(s: GameState, p: number, to: number) {
  const pl = s.ps[p];
  log(s, `${pl.name} goes broke`);
  s.stats.bankrupt.push(p);
  let value = pl.cash;
  s.deeds.forEach((d, at) => {
    if (!d || d.owner !== p) return;
    value += (d.houses * houseCostAt(s, at)) / 2;
    d.houses = 0;
  });
  pl.cash = 0;
  if (to >= 0) {
    s.ps[to].cash += Math.round(value);
    s.deeds.forEach((d) => {
      if (d && d.owner === p) d.owner = to;
    });
    s.ps[to].keep.push(...pl.keep);
    s.ps[to].permits += pl.permits;
  } else {
    s.deeds.forEach((d) => {
      if (d && d.owner === p) {
        d.owner = -1;
        d.mort = false;
      }
    });
    s.fx.permits += pl.permits;
  }
  if (pl.policy) s.fx.policies += 1;
  pl.keep = [];
  pl.permits = 0;
  pl.policy = false;
  pl.out = true;
  if (s.fx.ban?.by === p) s.fx.ban = null;
  if (s.fx.typhoon === p) s.fx.typhoon = null;
  if (s.fx.sales === p) s.fx.sales = null;
  s.stack = s.stack.filter((item) => !("p" in item) || item.p !== p);
  ev(s, { t: "bankrupt", p, to });
  if (activePlayers(s).length <= 1) endGame(s, "last");
}

/** Would the owner's cities in this group still be built evenly after changing `at` by `delta` houses? */
export function evenAfter(s: GameState, at: number, delta: number): boolean {
  const group = groupAt(at)!;
  const owner = s.deeds[at]!.owner;
  const mine = GROUP_SPACES[group].filter((g) => s.deeds[g]!.owner === owner);
  const next = s.deeds[at]!.houses + delta;
  return mine.every((g) => g === at || Math.abs(s.deeds[g]!.houses - next) <= 1);
}

export function buildCost(s: GameState, at: number): number {
  return s.fx.sales !== null ? Math.round(houseCostAt(s, at) / 2) : houseCostAt(s, at);
}

export function canBuild(s: GameState, p: number, at: number): boolean {
  const d = s.deeds[at];
  const group = groupAt(at);
  if (
    !d ||
    !group ||
    d.owner !== p ||
    d.mort ||
    d.houses >= 5 ||
    s.ps[p].out ||
    !ownsSet(s, p, group) ||
    GROUP_SPACES[group].some((g) => s.deeds[g]!.owner === p && s.deeds[g]!.mort)
  )
    return false;
  return evenAfter(s, at, 1) && s.ps[p].cash >= buildCost(s, at);
}

/** Could build here if money were no object (free-house cards, Mumbai). */
export function canBuildFree(s: GameState, p: number, at: number): boolean {
  const cash = s.ps[p].cash;
  s.ps[p].cash = 1e9;
  const ok = canBuild(s, p, at);
  s.ps[p].cash = cash;
  return ok;
}

export function build(s: GameState, p: number, at: number): boolean {
  if (!canBuild(s, p, at)) return false;
  s.ps[p].cash -= buildCost(s, at);
  s.deeds[at]!.houses += 1;
  s.stats.builds += 1;
  return true;
}

export function canSell(s: GameState, p: number, at: number): boolean {
  const d = s.deeds[at];
  return !!d && d.owner === p && d.houses > 0 && evenAfter(s, at, -1);
}

/** Sell one house back to the bank at half price. */
export function sell(s: GameState, p: number, at: number): boolean {
  if (!canSell(s, p, at)) return false;
  s.deeds[at]!.houses -= 1;
  s.ps[p].cash += Math.round(houseCostAt(s, at) / 2);
  return true;
}

export function canMortgage(s: GameState, p: number, at: number): boolean {
  const d = s.deeds[at];
  if (!d || d.owner !== p || d.mort) return false;
  const group = groupAt(at);
  return !group || GROUP_SPACES[group].every((g) => s.deeds[g]!.owner !== p || s.deeds[g]!.houses === 0);
}

export function mortgage(s: GameState, p: number, at: number): boolean {
  if (!canMortgage(s, p, at)) return false;
  s.deeds[at]!.mort = true;
  s.ps[p].cash += priceOf(s, at) / 2;
  return true;
}

/** Lifting a mortgage costs half the price plus 10%. */
export const unmortgageCost = (s: GameState, at: number) => Math.round((priceOf(s, at) / 2) * 1.1);

export function unmortgage(s: GameState, p: number, at: number): boolean {
  const d = s.deeds[at];
  if (!d || d.owner !== p || !d.mort || s.ps[p].cash < unmortgageCost(s, at)) return false;
  s.ps[p].cash -= unmortgageCost(s, at);
  d.mort = false;
  return true;
}

/** Can `p` hand over this part of a trade? Deeds must have no houses anywhere in their group. */
export function canGive(s: GameState, p: number, give: Offer): boolean {
  return (
    give.cash >= 0 &&
    s.ps[p].cash >= give.cash &&
    give.deeds.every((at) => {
      const d = s.deeds[at];
      const group = groupAt(at);
      return !!d && d.owner === p && (!group || GROUP_SPACES[group].every((g) => s.deeds[g]!.houses === 0 || s.deeds[g]!.owner !== p));
    }) &&
    give.cards.every((c) => s.ps[p].keep.includes(c))
  );
}

export function canTrade(s: GameState, a: number, b: number, giveA: Offer, giveB: Offer): boolean {
  return a !== b && !s.ps[a].out && !s.ps[b].out && canGive(s, a, giveA) && canGive(s, b, giveB);
}

/** Swap money, deeds and kept cards between two seats. Returns false (and changes nothing) if invalid. */
export function trade(s: GameState, a: number, b: number, giveA: Offer, giveB: Offer): boolean {
  if (!canTrade(s, a, b, giveA, giveB)) return false;
  transfer(s, a, b, giveA.cash);
  transfer(s, b, a, giveB.cash);
  for (const at of giveA.deeds) s.deeds[at]!.owner = b;
  for (const at of giveB.deeds) s.deeds[at]!.owner = a;
  for (const c of giveA.cards) {
    s.ps[a].keep.splice(s.ps[a].keep.indexOf(c), 1);
    s.ps[b].keep.push(c);
  }
  for (const c of giveB.cards) {
    s.ps[b].keep.splice(s.ps[b].keep.indexOf(c), 1);
    s.ps[a].keep.push(c);
  }
  s.stats.trades += 1;
  ev(s, { t: "trade", a, b, give: giveA, get: giveB });
  return true;
}

/** End the game if one team is left, a team reached the target, or everyone has played the last round. */
export function checkEnd(s: GameState) {
  if (s.over) return;
  const alive = activePlayers(s);
  if (alive.length <= 1) return endGame(s, "last");
  const end = s.cfg.end;
  if (end.kind === "target") {
    const best = alive.reduce((a, b) => (netWorth(s, b) > netWorth(s, a) ? b : a));
    if (netWorth(s, best) >= end.amount) endGame(s, "target");
  } else if (alive.every((p) => s.ps[p].turns >= end.rounds)) endGame(s, "rounds");
}

export function endGame(s: GameState, reason: string) {
  if (s.over) return;
  s.over = true;
  s.reason = reason;
  s.pending = null;
  s.stack = [];
  const alive = activePlayers(s);
  s.winner = alive.length ? alive.reduce((a, b) => (netWorth(s, b) > netWorth(s, a) ? b : a)) : null;
  log(s, `game over (${reason}): ${s.winner === null ? "nobody" : s.ps[s.winner].name} wins`);
  ev(s, { t: "over", reason, winner: s.winner });
}

/** Seats ahead of `from` in turn order, used to break ties in bids. */
export const seatDistance = (s: GameState, p: number, from: number) => (p - from + s.ps.length) % s.ps.length;

export { BOARD_SIZE };

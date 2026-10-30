/**
 * Computer players for 到此一游. Five styles, so the simulation can check that no single way of
 * playing always wins; the online game (step 4) uses the same bots to fill empty seats.
 */
import { BOARD, CITIES, GROUPS } from "./data";
import {
  act,
  active,
  BALLOTS,
  build,
  buildPrice,
  CITY_AT,
  cityAt,
  decide,
  GROUP_AT,
  groupOfSpace,
  hasSet,
  houseCost,
  N_SPACES,
  priceOf,
  rentOf,
  ROUTE_AT,
  SERVICE_AT,
  canBuild,
  canMortgage,
  canSell,
  mortgage,
  sell,
  trade,
  unmortgage,
  unmortgageCost,
  waitingOn,
  worth,
  type Choice,
  type Game,
  type Pending,
} from "./engine";

export type Style = {
  id: "balanced" | "tycoon" | "saver" | "jetsetter" | "gambler";
  /** cash kept back after buying or building */
  reserve: number;
  /** most it will bid at auction, as a share of the price */
  bid: number;
  /** how much more routes and services are worth to it */
  travel: number;
  /** only buys cities up to this price (Infinity = any) */
  cityCap: number;
  /** cash it offers for the last city of a set, as a share of the price; and what it accepts */
  offer: number;
  accept: number;
  /** Las Vegas stake (share of $200) and chance to bet */
  gamble: number;
  /** chance it uses water at Cape Town */
  water: number;
};

export const STYLES: Record<Style["id"], Style> = {
  balanced: { id: "balanced", reserve: 200, bid: 1.0, travel: 1, cityCap: Infinity, offer: 1.6, accept: 1.5, gamble: 0.15, water: 0.35 },
  tycoon: { id: "tycoon", reserve: 60, bid: 1.3, travel: 1, cityCap: Infinity, offer: 2.0, accept: 1.8, gamble: 0, water: 0.4 },
  saver: { id: "saver", reserve: 450, bid: 0.75, travel: 1, cityCap: Infinity, offer: 1.3, accept: 1.3, gamble: 0, water: 0.2 },
  jetsetter: { id: "jetsetter", reserve: 150, bid: 0.9, travel: 2.2, cityCap: 230, offer: 1.5, accept: 1.4, gamble: 0.1, water: 0.35 },
  gambler: { id: "gambler", reserve: 150, bid: 1.05, travel: 1, cityCap: Infinity, offer: 1.7, accept: 1.6, gamble: 1, water: 0.75 },
};

/** A bot's own dice for its choices, separate from the game's, so its choices don't change the rolls. */
export type Mind = { style: Style; seed: number; lastTrade: Record<number, number> };

export function mind(style: Style, seed: number): Mind {
  return { style, seed: seed | 0, lastTrade: {} };
}

function r(m: Mind) {
  m.seed = (m.seed + 0x6d2b79f5) | 0;
  let t = m.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------------ what things are worth to me */

/** How much a deed is worth to `p`: its price, more if it finishes or blocks a set. */
function valueTo(g: Game, p: number, at: number, s: Style) {
  const price = priceOf(g, at);
  const sp = BOARD[at];
  if (sp.k === "route" || sp.k === "service") {
    const list = sp.k === "route" ? ROUTE_AT : SERVICE_AT;
    const mine = list.filter((i) => g.deeds[i]!.owner === p).length;
    return price * s.travel * (1 + 0.25 * mine);
  }
  const gr = groupOfSpace(at)!;
  if (cityAt(at)!.price > s.cityCap) return price * 0.6;
  const idx = GROUP_AT[gr];
  const mine = idx.filter((i) => g.deeds[i]!.owner === p).length;
  const owners = new Set(idx.map((i) => g.deeds[i]!.owner).filter((o) => o >= 0 && o !== p));
  let v = price;
  if (mine === idx.length - 1) v *= 1.7; // finishes my set
  else if (mine > 0 && owners.size === 0) v *= 1.25;
  // blocks somebody else's set
  for (const o of owners) if (idx.filter((i) => g.deeds[i]!.owner === o).length === idx.length - 1) v *= 1.3;
  return v;
}

/** What landing on a space would cost me (negative: good for me). For the car permit. */
function landingCost(g: Game, p: number, at: number) {
  const sp = BOARD[at];
  const d = g.deeds[at];
  if (d) {
    if (d.owner < 0) return -0.3 * priceOf(g, at);
    if (d.owner === p || d.mort) return 0;
    return rentOf(g, at, 7);
  }
  if (sp.k === "tax") return sp.amount;
  if (sp.k === "expired") return 150;
  return 0;
}

/* ------------------------------------------------------------------ money: build, raise, trade */

function setsOf(g: Game, p: number) {
  return GROUPS.map((x) => x.id).filter((gr) => hasSet(g, p, gr));
}

/** Build where it pays most, evenly, while keeping the reserve. */
function buildUp(g: Game, p: number, s: Style) {
  for (let guard = 0; guard < 60; guard++) {
    const options: number[] = [];
    for (const gr of setsOf(g, p)) for (const at of GROUP_AT[gr]) if (canBuild(g, p, at)) options.push(at);
    if (!options.length) return;
    // the next house on the space with the best extra rent for its cost
    const gain = (at: number) => {
      const d = g.deeds[at]!;
      const rent = g.cfg.rents[cityAt(at)!.id];
      return (rent[2 + d.houses] - rent[d.houses ? 1 + d.houses : 1]) / buildPrice(g, at);
    };
    options.sort((a, b) => gain(b) - gain(a));
    const at = options[0];
    if (g.ps[p].cash - buildPrice(g, at) < s.reserve) return;
    if (!act(g, p, { k: "build", at }) && !build(g, p, at)) return;
  }
}

/** Get the cash back above the reserve: buy mortgages back when rich. */
function tidy(g: Game, p: number, s: Style) {
  g.deeds.forEach((d, i) => {
    if (d && d.owner === p && d.mort && g.ps[p].cash - unmortgageCost(g, i) > s.reserve * 2 + 200) unmortgage(g, p, i);
  });
}

/** Short of cash: sell houses (cheapest rent first), then mortgage (loose deeds first). */
function raise(g: Game, p: number, need: number) {
  for (let guard = 0; guard < 200 && g.ps[p].cash < need; guard++) {
    const houses = g.deeds.map((_, i) => i).filter((i) => canSell(g, p, i));
    if (houses.length) {
      houses.sort((a, b) => houseCost(g, a) - houseCost(g, b));
      sell(g, p, houses[0]);
      continue;
    }
    const loose = g.deeds
      .map((_, i) => i)
      .filter((i) => canMortgage(g, p, i))
      .sort((a, b) => {
        const sa = groupOfSpace(a) !== null && hasSet(g, p, groupOfSpace(a)!) ? 1 : 0;
        const sb = groupOfSpace(b) !== null && hasSet(g, p, groupOfSpace(b)!) ? 1 : 0;
        return sa - sb || priceOf(g, a) - priceOf(g, b);
      });
    if (!loose.length) return;
    mortgage(g, p, loose[0]);
  }
}

/** Try one deal: swap for each other's missing cities, or buy the last city of a set. */
function deal(g: Game, p: number, m: Mind, minds: Mind[]) {
  const s = m.style;
  for (const gr of GROUPS.map((x) => x.id)) {
    const idx = GROUP_AT[gr];
    const mine = idx.filter((i) => g.deeds[i]!.owner === p);
    if (mine.length !== idx.length - 1 || hasSet(g, p, gr)) continue;
    const at = idx.find((i) => g.deeds[i]!.owner !== p)!;
    const q = g.deeds[at]!.owner;
    if (q < 0 || g.ps[q].out || g.deeds[at]!.mort) continue;
    if ((m.lastTrade[q] ?? -99) > g.turns - 12) continue;
    m.lastTrade[q] = g.turns;
    // a swap: they're one short of a set too, and I hold that city
    for (const gr2 of GROUPS.map((x) => x.id)) {
      if (gr2 === gr) continue;
      const idx2 = GROUP_AT[gr2];
      const theirs = idx2.filter((i) => g.deeds[i]!.owner === q);
      const mineThere = idx2.filter((i) => g.deeds[i]!.owner === p && !g.deeds[i]!.mort);
      if (theirs.length === idx2.length - 1 && mineThere.length === 1) {
        const diff = priceOf(g, mineThere[0]) - priceOf(g, at);
        const cash = Math.max(0, -diff);
        const back = Math.max(0, diff);
        if (g.ps[p].cash >= cash && g.ps[q].cash >= back && trade(g, p, q, { cash, deeds: [mineThere[0]], cards: [] }, { cash: back, deeds: [at], cards: [] })) return true;
      }
    }
    // or cash, if they aren't building that set themselves
    const theirsHere = idx.filter((i) => g.deeds[i]!.owner === q).length;
    if (theirsHere >= 2) continue;
    const offer = Math.round(priceOf(g, at) * s.offer);
    const other = minds[q]?.style ?? STYLES.balanced;
    if (g.ps[p].cash - offer < s.reserve * 0.5) continue;
    if (offer < priceOf(g, at) * other.accept) continue;
    // nobody sells the winning set to the leader for small change
    if (worth(g, p) > worth(g, q) * 1.6 && offer < priceOf(g, at) * other.accept * 1.4) continue;
    if (trade(g, p, q, { cash: offer, deeds: [], cards: [] }, { cash: 0, deeds: [at], cards: [] })) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ answering */

/** Play one answer for `p` to whatever the game is asking. */
export function answer(g: Game, p: number, minds: Mind[]): Choice {
  const m = minds[p];
  const s = m.style;
  const pd = g.pending as Pending;
  const me = g.ps[p];
  switch (pd.k) {
    case "roll": {
      if (!pd.jail && me.dbl === 0) {
        deal(g, p, m, minds);
        buildUp(g, p, s);
      }
      if (pd.jail) return { how: me.keep.some((x) => x === "waiver" || x === "waiver2") ? "waiver" : "roll" };
      return {};
    }
    case "end":
      tidy(g, p, s);
      buildUp(g, p, s);
      return {};
    case "permit": {
      const base = (me.pos + pd.steps) % N_SPACES;
      let best = 0;
      let bestCost = landingCost(g, p, base);
      for (const dlt of [-1, 1]) {
        const c = landingCost(g, p, (base + dlt + N_SPACES) % N_SPACES);
        if (c < bestCost - 40) {
          best = dlt;
          bestCost = c;
        }
      }
      return { delta: best };
    }
    case "buy": {
      const left = me.cash - pd.price;
      const v = valueTo(g, p, pd.at, s);
      const want = v >= pd.price * 0.95 ? s.reserve : s.reserve * 2.5;
      return { yes: left >= want || (v > pd.price * 1.5 && left >= 0) };
    }
    case "auction": {
      const v = valueTo(g, p, pd.at, s) * s.bid;
      const room = me.cash - s.reserve * 0.5;
      return { bid: Math.max(0, Math.floor(Math.min(v, room))) };
    }
    case "debt":
      raise(g, p, pd.amount);
      return me.cash >= pd.amount ? { pay: true } : { bankrupt: true };
    case "card-route": {
      const free = ROUTE_AT.filter((i) => g.deeds[i]!.owner < 0);
      if (free.length && me.cash - g.cfg.routePrice >= s.reserve) return { at: free[0] };
      const mine = ROUTE_AT.find((i) => g.deeds[i]!.owner === p);
      if (mine !== undefined) return { at: mine };
      return { at: ROUTE_AT.reduce((a, b) => (rentOf(g, b, 0) < rentOf(g, a, 0) ? b : a)) };
    }
    case "card-player": {
      const others = active(g).filter((q) => q !== p);
      return { player: others[Math.floor(r(m) * others.length)] };
    }
    case "card-house": {
      const mine = g.deeds.map((_, i) => i).filter((i) => g.deeds[i]?.owner === p);
      if (pd.card === "review") {
        const ok = mine.filter((i) => {
          const cash = me.cash;
          me.cash = 1e9;
          const can = canBuild(g, p, i);
          me.cash = cash;
          return can;
        });
        return { at: ok.sort((a, b) => houseCost(g, b) - houseCost(g, a))[0] };
      }
      const ok = mine.filter((i) => canSell(g, p, i) && (i !== CITY_AT.cairo || !g.cfg.cityRules));
      return { at: ok.sort((a, b) => houseCost(g, a) - houseCost(g, b))[0] };
    }
    case "koi":
      return { yes: pd.rent >= 100 || pd.rent > me.cash };
    case "water":
      return { use: r(m) < s.water };
    case "tango": {
      // invite someone whose space would suit me better than this one
      const here = landingCost(g, p, me.pos);
      const others = active(g).filter((q) => q !== p);
      const better = others.filter((q) => landingCost(g, p, g.ps[q].pos) < here - 30);
      if (better.length) return { partner: better[0] };
      return { partner: r(m) < 0.25 ? others[Math.floor(r(m) * others.length)] : null };
    }
    case "tango-reply": {
      const there = g.ps[pd.from].pos;
      const cost = landingCost(g, p, there) - landingCost(g, p, me.pos);
      return { yes: cost < 50 };
    }
    case "ban":
      return { pair: Math.floor(r(m) * 3) };
    case "dance":
      return { yes: s.id !== "saver" || r(m) < 0.6 };
    case "scores":
      return { score: 3 + Math.floor(r(m) * 7) };
    case "mumbai":
      return {};
    case "peek":
      return { order: pd.cards };
    case "bet": {
      const room = me.cash - s.reserve;
      if (room <= 0 || r(m) > s.gamble) return { bet: 0 };
      return { bet: Math.max(0, Math.min(200, Math.floor(room / 2), Math.round(200 * Math.max(0.25, s.gamble)))) };
    }
    case "freeze": {
      const owner = g.deeds[pd.at]!.owner;
      if (p === pd.who) return { yes: true };
      if (p === owner) return { yes: false };
      const leader = active(g).reduce((a, b) => (worth(g, b) > worth(g, a) ? b : a));
      return { yes: r(m) < (owner === leader ? 0.7 : 0.4) };
    }
    case "jump": {
      const to = (me.pos + N_SPACES / 2) % N_SPACES;
      return { yes: landingCost(g, p, to) < g.cfg.salary + 50 };
    }
    case "quiz":
      // the owner says whether the visitor sorted it right; about half get it
      return { yes: r(m) < 0.55 };
    case "splash": {
      const others = active(g).filter((q) => q !== p);
      return { target: others[Math.floor(r(m) * others.length)] };
    }
    case "reverse":
      return { yes: r(m) < 0.3 };
    case "coe": {
      const room = me.cash - s.reserve;
      const top = s.id === "jetsetter" ? 120 : 60;
      return { bid: room > 0 ? Math.floor(r(m) * Math.min(top, room)) : 0 };
    }
    case "barrier": {
      const rent = rentOf(g, pd.at, 0);
      return { yes: rent / 2 > 50 && me.cash > 50 + s.reserve * 0.5 };
    }
    case "sales": {
      const wouldBuild = setsOf(g, p).some((gr) => GROUP_AT[gr].some((i) => g.deeds[i]!.houses < 5)) && me.cash > s.reserve + 100;
      return { yes: wouldBuild };
    }
    case "policy": {
      const builtRivals = g.deeds.some((d) => d && d.owner >= 0 && d.owner !== p && d.houses >= 2);
      return { yes: builtRivals && me.cash > s.reserve + 50 && r(m) < 0.6 };
    }
    case "silence": {
      if (r(m) < 0.45) {
        const others = active(g).filter((q) => q !== p);
        return { sound: others[Math.floor(r(m) * others.length)] };
      }
      return { sound: null };
    }
  }
  return {};
}

/** Play the game to the end with bots in every seat. */
export function playOut(g: Game, minds: Mind[], onStep?: (g: Game, who: number, k: Pending["k"]) => void) {
  let guard = 0;
  while (!g.over && g.pending && guard++ < 200_000) {
    const pd = g.pending;
    const waiting = waitingOn(g);
    if (!waiting.length) break;
    const who = BALLOTS.has(pd.k) ? waiting[0] : waiting[0];
    const c = answer(g, who, minds);
    // answering may have spent money (building, raising cash); the question is still the same one
    if (g.pending !== pd) continue;
    onStep?.(g, who, pd.k);
    if (!decide(g, who, c)) {
      // an answer that didn't fit: fall back to the plainest one
      const plain: Choice =
        pd.k === "auction" || pd.k === "coe" ? { bid: 0 } : pd.k === "debt" ? { bankrupt: true } : pd.k === "scores" ? { score: 5 } : pd.k === "water" ? { use: false } : pd.k === "splash" ? { target: active(g).find((q) => q !== who) } : pd.k === "permit" ? { delta: 0 } : pd.k === "ban" ? { pair: 0 } : pd.k === "card-route" ? { at: ROUTE_AT[0] } : pd.k === "card-player" ? { player: active(g).find((q) => q !== who) } : pd.k === "tango" ? { partner: null } : pd.k === "silence" ? { sound: null } : pd.k === "bet" ? { bet: 0 } : pd.k === "roll" ? { how: "roll" } : { yes: false };
      if (!decide(g, who, plain)) throw new Error(`stuck on ${pd.k} for ${who}`);
    }
  }
  return g;
}

export const CITY_NAMES = Object.fromEntries(CITIES.map((c) => [c.id, c.name]));

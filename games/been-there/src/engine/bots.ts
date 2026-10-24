// Computer players. Five styles from step 3: 稳健 balanced, 敢买敢盖 tycoon, 攒现金 saver,
// 航线派 jetsetter, 爱冒险 gambler. Recovered unchanged; the online room reuses them to fill seats
// and to play for a team whose phones have all dropped off.
import { BOARD_SIZE, CAIRO, GROUP_SPACES, ROUTE_SPACES, SERVICE_SPACES, cityAt, groupAt } from "./board";
import { BOARD, GROUPS } from "./data";
import { act, manage, whoMustAct, type Action } from "./play";
import { random } from "./rng";
import {
  activePlayers,
  build,
  buildCost,
  canBuild,
  canGive,
  canMortgage,
  canSell,
  houseCostAt,
  mortgage,
  netWorth,
  ownsSet,
  priceOf,
  rentAt,
  sell,
  trade,
  unmortgage,
  unmortgageCost,
} from "./rules";
import type { GameState, Offer, PendingKind } from "./state";

const M = BOARD_SIZE;

export interface Style {
  id: StyleId;
  /** Cash kept back before buying or building. */
  reserve: number;
  /** Auction bid as a share of what the city is worth to them. */
  bid: number;
  /** Extra appetite for routes and services. */
  travel: number;
  /** Won't value cities above this price (jetsetter). */
  cityCap: number;
  /** Cash offer for a missing set piece, × price. */
  offer: number;
  /** Lowest cash offer accepted for a city, × price. */
  accept: number;
  /** Chance of betting at Las Vegas. */
  gamble: number;
  /** Chance of picking "use water" at Cape Town. */
  water: number;
}

export type StyleId = "balanced" | "tycoon" | "saver" | "jetsetter" | "gambler";

export const STYLES: Record<StyleId, Style> = {
  balanced: { id: "balanced", reserve: 200, bid: 1, travel: 1, cityCap: Infinity, offer: 1.6, accept: 1.5, gamble: 0.15, water: 0.35 },
  tycoon: { id: "tycoon", reserve: 60, bid: 1.3, travel: 1, cityCap: Infinity, offer: 2, accept: 1.8, gamble: 0, water: 0.4 },
  saver: { id: "saver", reserve: 450, bid: 0.75, travel: 1, cityCap: Infinity, offer: 1.3, accept: 1.3, gamble: 0, water: 0.2 },
  jetsetter: { id: "jetsetter", reserve: 150, bid: 0.9, travel: 2.2, cityCap: 230, offer: 1.5, accept: 1.4, gamble: 0.1, water: 0.35 },
  gambler: { id: "gambler", reserve: 150, bid: 1.05, travel: 1, cityCap: Infinity, offer: 1.7, accept: 1.6, gamble: 1, water: 0.75 },
};

export interface Brain {
  style: Style;
  /** The bot's own random numbers, separate from the dice. */
  seed: number;
  /** Turn count of the last trade attempt with each seat. */
  lastTrade: Record<number, number>;
}

export const newBrain = (style: Style, seed: number): Brain => ({ style, seed: seed | 0, lastTrade: {} });

/** Hooks for online play: offers to a human become proposals instead of instant trades. */
export interface TradeHooks {
  isHuman(seat: number): boolean;
  propose(from: number, to: number, give: Offer, get: Offer): void;
}

/** What a space is worth to `p`: more if it completes or blocks a set. */
function valuation(s: GameState, p: number, at: number, style: Style): number {
  const price = priceOf(s, at);
  const sp = BOARD[at];
  if (sp.k === "route" || sp.k === "service") {
    const mine = (sp.k === "route" ? ROUTE_SPACES : SERVICE_SPACES).filter((r) => s.deeds[r]!.owner === p).length;
    return price * style.travel * (1 + 0.25 * mine);
  }
  const group = groupAt(at)!;
  if (cityAt(at)!.price > style.cityCap) return price * 0.6;
  const spaces = GROUP_SPACES[group];
  const mine = spaces.filter((g) => s.deeds[g]!.owner === p).length;
  const rivals = new Set(spaces.map((g) => s.deeds[g]!.owner).filter((o) => o >= 0 && o !== p));
  let value = price;
  if (mine === spaces.length - 1) value *= 1.7;
  else if (mine > 0 && rivals.size === 0) value *= 1.25;
  for (const o of rivals) if (spaces.filter((g) => s.deeds[g]!.owner === o).length === spaces.length - 1) value *= 1.3;
  return value;
}

/** How bad landing on a space would be for `p` (negative = an unowned space worth buying). */
function threat(s: GameState, p: number, at: number): number {
  const sp = BOARD[at];
  const d = s.deeds[at];
  if (d) return d.owner < 0 ? -0.3 * priceOf(s, at) : d.owner === p || d.mort ? 0 : rentAt(s, at, 7);
  return sp.k === "tax" ? sp.amount : sp.k === "expired" ? 150 : 0;
}

const ownedSets = (s: GameState, p: number) => GROUPS.map((g) => g.id).filter((g) => ownsSet(s, p, g));

/** Build where the next house adds the most rent per dollar, keeping the reserve. */
function botBuild(s: GameState, p: number, style: Style) {
  for (let n = 0; n < 60; n++) {
    const options: number[] = [];
    for (const g of ownedSets(s, p)) for (const at of GROUP_SPACES[g]) if (canBuild(s, p, at)) options.push(at);
    if (!options.length) return;
    const gain = (at: number) => {
      const d = s.deeds[at]!;
      const table = s.cfg.rents[cityAt(at)!.id];
      return (table[2 + d.houses] - table[d.houses ? 1 + d.houses : 1]) / buildCost(s, at);
    };
    options.sort((a, b) => gain(b) - gain(a));
    const best = options[0];
    if (s.ps[p].cash - buildCost(s, best) < style.reserve || (!manage(s, p, { k: "build", at: best }) && !build(s, p, best))) return;
  }
}

function botUnmortgage(s: GameState, p: number, style: Style) {
  s.deeds.forEach((d, at) => {
    if (d && d.owner === p && d.mort && s.ps[p].cash - unmortgageCost(s, at) > style.reserve * 2 + 200) unmortgage(s, p, at);
  });
}

/** Sell houses (cheapest first), then mortgage (loose cities before set pieces) until cash covers `need`. */
function raiseCash(s: GameState, p: number, need: number) {
  for (let n = 0; n < 200 && s.ps[p].cash < need; n++) {
    const houses = s.deeds.map((_, at) => at).filter((at) => canSell(s, p, at));
    if (houses.length) {
      houses.sort((a, b) => houseCostAt(s, a) - houseCostAt(s, b));
      sell(s, p, houses[0]);
      continue;
    }
    const deeds = s.deeds
      .map((_, at) => at)
      .filter((at) => canMortgage(s, p, at))
      .sort((a, b) => {
        const ga = groupAt(a);
        const gb = groupAt(b);
        const sa = ga !== null && ownsSet(s, p, ga) ? 1 : 0;
        const sb = gb !== null && ownsSet(s, p, gb) ? 1 : 0;
        return sa - sb || priceOf(s, a) - priceOf(s, b);
      });
    if (!deeds.length) return;
    mortgage(s, p, deeds[0]);
  }
}

/** Try one trade that completes a set: a swap that completes both sides, or a cash offer. */
function botTrade(s: GameState, p: number, brain: Brain, brains: Brain[], hooks?: TradeHooks): boolean {
  const style = brain.style;
  for (const g of GROUPS.map((x) => x.id)) {
    const spaces = GROUP_SPACES[g];
    if (spaces.filter((at) => s.deeds[at]!.owner === p).length !== spaces.length - 1 || ownsSet(s, p, g)) continue;
    const missing = spaces.find((at) => s.deeds[at]!.owner !== p)!;
    const holder = s.deeds[missing]!.owner;
    if (holder < 0 || s.ps[holder].out || s.deeds[missing]!.mort || (brain.lastTrade[holder] ?? -99) > s.turns - 12) continue;
    brain.lastTrade[holder] = s.turns;
    const human = hooks?.isHuman(holder) ?? false;
    const offer = (give: Offer, get: Offer) => {
      if (!human) return trade(s, p, holder, give, get);
      if (!canGive(s, p, give) || !canGive(s, holder, get)) return false;
      hooks!.propose(p, holder, give, get);
      return true;
    };
    for (const h of GROUPS.map((x) => x.id)) {
      if (h === g) continue;
      const their = GROUP_SPACES[h].filter((at) => s.deeds[at]!.owner === holder);
      const mine = GROUP_SPACES[h].filter((at) => s.deeds[at]!.owner === p && !s.deeds[at]!.mort);
      if (their.length === GROUP_SPACES[h].length - 1 && mine.length === 1) {
        const diff = priceOf(s, mine[0]) - priceOf(s, missing);
        const pay = Math.max(0, -diff);
        const ask = Math.max(0, diff);
        if (
          s.ps[p].cash >= pay &&
          s.ps[holder].cash >= ask &&
          offer({ cash: pay, deeds: [mine[0]], cards: [] }, { cash: ask, deeds: [missing], cards: [] })
        )
          return true;
      }
    }
    if (spaces.filter((at) => s.deeds[at]!.owner === holder).length >= 2) continue;
    const cash = Math.round(priceOf(s, missing) * style.offer);
    const theirs = brains[holder]?.style ?? STYLES.balanced;
    if (
      !(s.ps[p].cash - cash < style.reserve * 0.5) &&
      !(cash < priceOf(s, missing) * theirs.accept) &&
      !(netWorth(s, p) > netWorth(s, holder) * 1.6 && cash < priceOf(s, missing) * theirs.accept * 1.4) &&
      offer({ cash, deeds: [], cards: [] }, { cash: 0, deeds: [missing], cards: [] })
    )
      return true;
  }
  return false;
}

/** The bot's decision for the current pending choice. May also build, trade or raise cash first. */
export function decide(s: GameState, p: number, brains: Brain[], hooks?: TradeHooks): Action {
  const brain = brains[p];
  const style = brain.style;
  const pd = s.pending!;
  const me = s.ps[p];
  const rand = () => random(brain);
  switch (pd.k) {
    case "roll":
      if (!pd.jail && me.dbl === 0) {
        botTrade(s, p, brain, brains, hooks);
        botBuild(s, p, style);
      }
      return pd.jail ? { how: me.keep.some((c) => c === "waiver" || c === "waiver2") ? "waiver" : "roll" } : {};
    case "end":
      botUnmortgage(s, p, style);
      botBuild(s, p, style);
      return {};
    case "permit": {
      const target = (me.pos + pd.steps) % M;
      let delta = 0;
      let worst = threat(s, p, target);
      for (const d of [-1, 1]) {
        const t = threat(s, p, (target + d + M) % M);
        if (t < worst - 40) {
          delta = d;
          worst = t;
        }
      }
      return { delta };
    }
    case "buy": {
      const left = me.cash - pd.price;
      const value = valuation(s, p, pd.at, style);
      const keep = value >= pd.price * 0.95 ? style.reserve : style.reserve * 2.5;
      return { yes: left >= keep || (value > pd.price * 1.5 && left >= 0) };
    }
    case "auction":
      return { bid: auctionLimit(s, p, style) };
    case "debt":
      raiseCash(s, p, pd.amount);
      return me.cash >= pd.amount ? { pay: true } : { bankrupt: true };
    case "card-route": {
      const free = ROUTE_SPACES.filter((r) => s.deeds[r]!.owner < 0);
      if (free.length && me.cash - s.cfg.routePrice >= style.reserve) return { at: free[0] };
      const own = ROUTE_SPACES.find((r) => s.deeds[r]!.owner === p);
      return own !== undefined ? { at: own } : { at: ROUTE_SPACES.reduce((a, b) => (rentAt(s, b, 0) < rentAt(s, a, 0) ? b : a)) };
    }
    case "card-player": {
      const others = activePlayers(s).filter((q) => q !== p);
      return { player: others[Math.floor(rand() * others.length)] };
    }
    case "card-house": {
      const mine = s.deeds.map((_, at) => at).filter((at) => s.deeds[at]?.owner === p);
      if (pd.card === "review")
        return {
          at: mine
            .filter((at) => {
              const cash = me.cash;
              me.cash = 1e9;
              const ok = canBuild(s, p, at);
              me.cash = cash;
              return ok;
            })
            .sort((a, b) => houseCostAt(s, b) - houseCostAt(s, a))[0],
        };
      return {
        at: mine.filter((at) => canSell(s, p, at) && (at !== CAIRO || !s.cfg.cityRules)).sort((a, b) => houseCostAt(s, a) - houseCostAt(s, b))[0],
      };
    }
    case "koi":
      return { yes: pd.rent >= 100 || pd.rent > me.cash };
    case "water":
      return { use: rand() < style.water };
    case "tango": {
      const here = threat(s, p, me.pos);
      const others = activePlayers(s).filter((q) => q !== p);
      const better = others.filter((q) => threat(s, p, s.ps[q].pos) < here - 30);
      return better.length ? { partner: better[0] } : { partner: rand() < 0.25 ? others[Math.floor(rand() * others.length)] : null };
    }
    case "tango-reply":
      return { yes: threat(s, p, s.ps[pd.from].pos) - threat(s, p, me.pos) < 50 };
    case "ban":
      return { pair: Math.floor(rand() * 3) };
    case "dance":
      return { yes: style.id !== "saver" || rand() < 0.6 };
    case "scores":
      return { score: 3 + Math.floor(rand() * 7) };
    case "mumbai":
      return {};
    case "peek":
      return { order: pd.cards };
    case "bet": {
      const spare = me.cash - style.reserve;
      return spare <= 0 || rand() > style.gamble
        ? { bet: 0 }
        : { bet: Math.max(0, Math.min(200, Math.floor(spare / 2), Math.round(200 * Math.max(0.25, style.gamble)))) };
    }
    case "freeze": {
      const owner = s.deeds[pd.at]!.owner;
      if (p === pd.who) return { yes: true };
      if (p === owner) return { yes: false };
      const leader = activePlayers(s).reduce((a, b) => (netWorth(s, b) > netWorth(s, a) ? b : a));
      return { yes: rand() < (owner === leader ? 0.7 : 0.4) };
    }
    case "jump":
      return { yes: threat(s, p, (me.pos + M / 2) % M) < s.cfg.salary + 50 };
    case "quiz":
      return { yes: rand() < 0.55 };
    case "splash": {
      const others = activePlayers(s).filter((q) => q !== p);
      return { target: others[Math.floor(rand() * others.length)] };
    }
    case "reverse":
      return { yes: rand() < 0.3 };
    case "coe": {
      const spare = me.cash - style.reserve;
      const cap = style.id === "jetsetter" ? 120 : 60;
      return { bid: spare > 0 ? Math.floor(rand() * Math.min(cap, spare)) : 0 };
    }
    case "barrier":
      return { yes: rentAt(s, pd.at, 0) / 2 > 50 && me.cash > 50 + style.reserve * 0.5 };
    case "sales":
      return { yes: ownedSets(s, p).some((g) => GROUP_SPACES[g].some((at) => s.deeds[at]!.houses < 5)) && me.cash > style.reserve + 100 };
    case "policy":
      return {
        yes: s.deeds.some((d) => d && d.owner >= 0 && d.owner !== p && d.houses >= 2) && me.cash > style.reserve + 50 && rand() < 0.6,
      };
    case "silence":
      if (rand() < 0.45) {
        const others = activePlayers(s).filter((q) => q !== p);
        return { sound: others[Math.floor(rand() * others.length)] };
      }
      return { sound: null };
  }
  return {};
}

/** Highest auction bid this bot would make for the space up for auction. */
export function auctionLimit(s: GameState, p: number, style: Style): number {
  const pd = s.pending;
  if (!pd || pd.k !== "auction") return 0;
  const value = valuation(s, p, pd.at, style) * style.bid;
  const budget = s.ps[p].cash - style.reserve * 0.5;
  return Math.max(0, Math.floor(Math.min(value, budget)));
}

/** A safe answer when a decision was invalid (or nobody answered in time). */
export function fallbackAction(s: GameState, p: number, k: PendingKind): Action {
  const someoneElse = () => activePlayers(s).find((q) => q !== p);
  switch (k) {
    case "auction":
    case "coe":
      return { bid: 0 };
    case "debt":
      return { bankrupt: true };
    case "scores":
      return { score: 5 };
    case "water":
      return { use: false };
    case "splash":
      return { target: someoneElse() };
    case "permit":
      return { delta: 0 };
    case "ban":
      return { pair: 0 };
    case "card-route":
      return { at: ROUTE_SPACES[0] };
    case "card-player":
      return { player: someoneElse() };
    case "tango":
      return { partner: null };
    case "silence":
      return { sound: null };
    case "bet":
      return { bet: 0 };
    case "roll":
      return { how: "roll" };
    default:
      return { yes: false };
  }
}

/** Let bots make every decision until the game ends. `onDecision` sees each decision before it is applied. */
export function runBots(s: GameState, brains: Brain[], onDecision?: (s: GameState, p: number, k: PendingKind) => void) {
  let n = 0;
  while (!s.over && s.pending && n++ < 2e5) {
    const pd = s.pending;
    const waiting = whoMustAct(s);
    if (!waiting.length) break;
    const p = waiting[0];
    const a = decide(s, p, brains);
    if (s.pending !== pd) continue;
    onDecision?.(s, p, pd.k);
    if (!act(s, p, a) && !act(s, p, fallbackAction(s, p, pd.k))) throw new Error(`stuck on ${pd.k} for ${p}`);
  }
  return s;
}

/**
 * Should bot `p` accept a trade that seat `other` offered? `give` is what the bot hands over, `get`
 * what it receives. Like bots trading with each other, it wants about `style.accept` times what it
 * gives up (1.5× for balanced), counting set pieces at more than face value.
 */
export function botAcceptsTrade(s: GameState, p: number, other: number, give: Offer, get: Offer, style: Style): boolean {
  if (give.cash > 0 && s.ps[p].cash - give.cash < style.reserve * 0.5) return false;
  const lose = give.deeds.reduce((sum, at) => {
    const g = groupAt(at);
    let value = valuation(s, p, at, style);
    // Breaking up its own set, or handing the other side the last piece of theirs, costs extra.
    if (g !== null && ownsSet(s, p, g)) value *= 2;
    if (g !== null && GROUP_SPACES[g].every((x) => x === at || s.deeds[x]!.owner === other)) value *= 1.5;
    return sum + value;
  }, give.cash + give.cards.length * 50);
  const gain = get.deeds.reduce((sum, at) => sum + valuation(s, p, at, style), get.cash + get.cards.length * 50);
  return gain > 0 && gain >= lose * style.accept;
}

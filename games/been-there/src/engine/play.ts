// Turn flow: dice, moving, landing, city rules, cards and every player decision.
// The game is a state machine: `act` applies one decision and runs until the next one is needed.
// Recovered from the step-3 engine; behaviour (including every random draw) is unchanged.
import {
  BOARD_SIZE,
  CAIRO,
  CITY_SPACE,
  IMMIGRATION,
  LOUNGE,
  OWNABLE,
  ROUTE_SPACES,
  SIMULTANEOUS,
  cityAt,
} from "./board";
import type { GameConfig } from "./config";
import { BOARD, CITIES, GROUPS, JOURNEY_CARDS, POSTCARDS } from "./data";
import { NEWS, NEWS_EVERY, NEWS_ROUNDS, newsFor } from "./news";
import { random, shuffle } from "./rng";
import {
  activePlayers,
  bankrupt,
  build,
  canBuildFree,
  canSell,
  charge,
  checkEnd,
  countRule,
  credit,
  endGame,
  ev,
  everyonePays,
  houseCostAt,
  log,
  mortgage,
  netWorth,
  priceOf,
  rentAt,
  seatDistance,
  sell,
  transfer,
  unmortgage,
} from "./rules";
import type { GameEvent, GameState, Pending, StackItem } from "./state";
import { AI_GIFT, CRASH_SHARE, WORLD_IDS, WORLD_ROUNDS, worldClosed, worldSalary, type WorldId } from "./world";

const M = BOARD_SIZE;

export function newGame(cfg: GameConfig, names: string[], seed: number, opts: { log?: boolean; events?: boolean } = {}): GameState {
  const s: GameState = {
    cfg,
    seed: seed | 0,
    ps: names.map((name) => ({
      name,
      cash: cfg.startCash,
      pos: 0,
      out: false,
      jail: false,
      dbl: 0,
      keep: [],
      stamps: [],
      bonus: false,
      policy: false,
      permits: 0,
      jetlag: false,
      turns: 0,
    })),
    deeds: BOARD.map((_, i) => (OWNABLE[i] ? { owner: -1, houses: 0, mort: false } : null)),
    turn: 0,
    dir: 1,
    decks: { journey: [], postcard: [] },
    fx: { ban: null, typhoon: null, sales: null, salesUsed: 0, permits: 2, policies: 2 },
    news: null,
    newsSeen: [],
    world: null,
    worldSeen: [],
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
    events: opts.events ? [] : null,
  };
  s.decks.journey = shuffle(s, JOURNEY_CARDS.length);
  s.decks.postcard = shuffle(s, POSTCARDS.length);
  s.ps.forEach((p, i) => (p.cash += cfg.seatBonus[i] ?? 0));
  if (cfg.dealCities > 0) {
    const order = shuffle(s, CITIES.length).map((i) => CITY_SPACE[CITIES[i].id]);
    let k = 0;
    for (let round = 0; round < cfg.dealCities; round++)
      for (let p = 0; p < s.ps.length && k < order.length; p++) s.deeds[order[k++]]!.owner = p;
  }
  startTurn(s);
  return s;
}

function startTurn(s: GameState) {
  const p = s.turn;
  const pl = s.ps[p];
  if (s.fx.ban?.by === p) s.fx.ban = null;
  if (s.fx.typhoon === p) s.fx.typhoon = null;
  if (s.fx.sales === p) s.fx.sales = null;
  pl.dbl = 0;
  s.pending = { k: "roll", who: p, jail: pl.jail };
  ev(s, { t: "turn", p });
  if (s.cfg.news) tickNews(s);
  tickWorld(s);
}

/** A world event's two rounds are over (it came at the start of a turn: they end at the start of that seat's turn two rounds on). */
function tickWorld(s: GameState) {
  if (s.world && s.turns >= s.world.until) endWorld(s);
}

function endWorld(s: GameState) {
  const w = s.world;
  if (!w) return;
  ev(s, w.at === null ? { t: "world", id: w.id, on: false } : { t: "world", id: w.id, on: false, at: w.at });
  s.world = null;
}

/**
 * Something happens to the whole world (world.ts): the room calls this at the start of a turn, every
 * 20 minutes. `id` picks which (tests); otherwise the next from the bag, each once before any comes
 * round again. Does what it does at once, and leaves what lasts in force for two rounds. Returns which.
 */
export function worldEvent(s: GameState, id?: WorldId): WorldId | null {
  if (s.over) return null;
  endWorld(s);
  let pick = id && WORLD_IDS.includes(id) ? id : undefined;
  if (!pick) {
    let fresh = WORLD_IDS.filter((w) => !(s.worldSeen ?? []).includes(w));
    if (!fresh.length) {
      s.worldSeen = [];
      fresh = WORLD_IDS;
    }
    pick = fresh[Math.floor(random(s) * fresh.length)];
  }
  s.worldSeen = [...(s.worldSeen ?? []).filter((w) => w !== pick), pick];
  const e: Extract<GameEvent, { t: "world" }> = { t: "world", id: pick, on: true };
  let at: number | null = null;
  if (pick === "meteor" || pick === "terror") at = e.at = CITY_SPACE[CITIES[Math.floor(random(s) * CITIES.length)].id];
  if (pick === "crash") {
    // (in tens of dollars, from cash only: nobody goes into debt for it)
    e.lost = s.ps.map((pl) => (pl.out ? 0 : Math.floor((pl.cash * CRASH_SHARE) / 10) * 10));
    e.lost.forEach((x, p) => transfer(s, p, -1, x));
  } else if (pick === "ai") {
    for (const p of activePlayers(s)) credit(s, p, AI_GIFT);
    e.gift = AI_GIFT;
  } else if (pick === "meteor") {
    const d = s.deeds[at!]!;
    if (d.houses > 0) {
      e.houses = d.houses;
      if (d.owner >= 0) {
        e.owner = d.owner;
        e.refund = Math.round((d.houses * houseCostAt(s, at!)) / 2);
        credit(s, d.owner, e.refund);
      }
      d.houses = 0;
      s.struck = [...(s.struck ?? []), at!];
    }
  }
  s.world = { id: pick, at, until: s.turns + WORLD_ROUNDS * activePlayers(s).length };
  ev(s, e);
  return pick;
}

/** The salary for passing Departure: double while the supersonic airliner is new (world.ts). */
const salaryOf = (s: GameState) => s.cfg.salary * worldSalary(s);

/** Travel news: the last piece ends after NEWS_ROUNDS rounds; a new one comes every NEWS_EVERY. (Exported for the tests.) */
export function tickNews(s: GameState) {
  const round = activePlayers(s).length;
  if (s.news && s.turns >= s.news.until) {
    ev(s, { t: "news", id: s.news.id, on: false });
    s.news = null;
  }
  if (s.news || s.turns === 0 || s.turns % (NEWS_EVERY * round) !== 0) return;
  // Every piece once before any comes round again.
  let fresh = NEWS.filter((n) => !s.newsSeen.includes(n.id));
  if (!fresh.length) {
    s.newsSeen = [];
    fresh = NEWS;
  }
  const item = fresh[Math.floor(random(s) * fresh.length)];
  s.newsSeen.push(item.id);
  s.news = { id: item.id, until: s.turns + NEWS_ROUNDS * round };
  ev(s, { t: "news", id: item.id, on: true });
}

function nextTurn(s: GameState) {
  const p = s.turn;
  s.ps[p].turns += 1;
  s.turns += 1;
  checkEnd(s);
  if (s.over) return;
  if (s.turns >= s.cfg.maxTurns) return endGame(s, "cap");
  let next = p;
  for (let i = 0; i < s.ps.length; i++) {
    next = (next + s.dir + s.ps.length) % s.ps.length;
    if (!s.ps[next].out) break;
  }
  s.turn = next;
  startTurn(s);
}

/** One die: forced test dice first, otherwise random. */
export const rollDie = (s: GameState) => (s.forced.length ? s.forced.shift()! : 1 + Math.floor(random(s) * 6));

function rollDice(s: GameState) {
  s.dice = [rollDie(s), rollDie(s)];
  return s.dice;
}

/** Steps the dice give, after jet lag (one die) and Mexico City's banned faces. */
function diceSteps(s: GameState, dice: number[], oneDie: boolean) {
  const used = oneDie ? [dice[0]] : dice;
  const ban = s.fx.ban;
  return used.reduce((sum, d) => sum + (ban && (d === ban.lo || d === ban.hi) ? 0 : d), 0);
}

/** Move by steps; passing Departure going forward pays the salary. */
function moveBy(s: GameState, p: number, steps: number) {
  const pl = s.ps[p];
  const from = pl.pos;
  const to = (((pl.pos + steps) % M) + M) % M;
  const paid = steps > 0 && to < pl.pos;
  if (paid) credit(s, p, salaryOf(s));
  pl.pos = to;
  ev(s, paid ? { t: "move", p, from, to, salary: salaryOf(s) } : { t: "move", p, from, to });
}

/** Jump forward to a space; reaching or passing Departure pays the salary. */
function moveTo(s: GameState, p: number, to: number) {
  const pl = s.ps[p];
  const from = pl.pos;
  const paid = to <= pl.pos;
  if (paid) credit(s, p, salaryOf(s));
  pl.pos = to;
  ev(s, paid ? { t: "move", p, from, to, salary: salaryOf(s) } : { t: "move", p, from, to });
}

function sendToImmigration(s: GameState, p: number) {
  const pl = s.ps[p];
  pl.pos = IMMIGRATION;
  pl.jail = true;
  pl.dbl = 0;
  log(s, `${pl.name} is sent to Immigration`);
  ev(s, { t: "jail", p });
}

/** Do queued work until a decision is needed. */
function run(s: GameState) {
  while (!s.over && !s.pending) {
    const item = s.stack.pop();
    if (!item) {
      if (s.ps[s.turn].out) {
        nextTurn(s);
        continue;
      }
      s.pending = { k: "end", who: s.turn };
      return;
    }
    step(s, item);
  }
}

function step(s: GameState, item: StackItem) {
  if ("p" in item && s.ps[item.p].out) return;
  switch (item.t) {
    case "land":
      return land(s, item.p, !!item.noTango);
    case "rule":
      return cityRule(s, item.p, item.at, !!item.noTango);
    case "prop":
      return visitProperty(s, item);
    case "after":
      return afterCity(s, item.p, item.at);
    case "endMove": {
      const pl = s.ps[item.p];
      if (item.again && !pl.jail) s.pending = { k: "roll", who: item.p, jail: false };
      return;
    }
    case "pay":
      return charge(s, item.p, item.amount, item.to);
    case "card":
      return drawCard(s, item.p, item.deck);
    case "check":
      return checkEnd(s);
  }
}

function moveAndLand(s: GameState, p: number, steps: number, again: boolean) {
  moveBy(s, p, steps);
  s.stack.push({ t: "endMove", p, again });
  s.stack.push({ t: "land", p });
}

function land(s: GameState, p: number, noTango: boolean) {
  const pl = s.ps[p];
  const at = pl.pos;
  const sp = BOARD[at];
  s.stats.landings[at] += 1;
  log(s, `${pl.name} lands on ${sp.k === "city" ? sp.id : sp.k}`);
  const from = sp.k === "city" ? pl.city : undefined;
  if (sp.k === "city") pl.city = at;
  ev(s, from === undefined ? { t: "land", p, at } : { t: "land", p, at, from });
  if (sp.k === "city" && !pl.stamps.includes(sp.id)) {
    pl.stamps.push(sp.id);
    ev(s, { t: "stamp", p, city: sp.id });
    if (
      s.cfg.passport.on &&
      !pl.bonus &&
      GROUPS.every((g) => pl.stamps.some((id) => CITIES.find((c) => c.id === id)!.group === g.id))
    ) {
      pl.bonus = true;
      credit(s, p, s.cfg.passport.bonus);
      countRule(s, "passport");
      ev(s, { t: "passport", p, amount: s.cfg.passport.bonus });
    }
  }
  switch (sp.k) {
    case "city": {
      // A meteor's crater, a city locked down (world.ts): nothing happens there for now.
      if (worldClosed(s, at)) return;
      s.stack.push(s.cfg.cityRules ? { t: "rule", p, at, noTango } : { t: "prop", p, at });
      // Travel news: a fee for visitors (Venice), paid before anything else there.
      const fee = newsFor(s, sp.id)?.fee;
      if (fee && s.deeds[at]!.owner !== p) s.stack.push({ t: "pay", p, amount: fee, to: -1 });
      return;
    }
    case "route":
    case "service":
      s.stack.push({ t: "prop", p, at });
      return;
    case "journey":
    case "postcard":
      s.stack.push({ t: "card", p, deck: sp.k });
      return;
    case "tax":
      s.stack.push({ t: "pay", p, amount: sp.amount, to: -1 });
      return;
    case "expired":
      sendToImmigration(s, p);
      return;
    default:
      return;
  }
}

/** Landing on something ownable: offer to buy, or collect rent (after city-rule modifiers). */
function visitProperty(s: GameState, item: Extract<StackItem, { t: "prop" }>) {
  const { p, at } = item;
  const deed = s.deeds[at]!;
  if (worldClosed(s, at)) return;
  if (deed.owner < 0) {
    let price = priceOf(s, at);
    if (BOARD[at].k === "city" && s.ps[p].keep.includes("points")) price = Math.round(price * 0.8);
    const sale = cityAt(at) && newsFor(s, cityAt(at)!.id)?.buy;
    if (sale) price = Math.round(price * sale);
    s.pending = { k: "buy", who: p, at, price };
    return;
  }
  if (deed.owner === p || deed.mort || (s.cfg.cityRules && s.fx.typhoon !== null)) return;
  let rent = rentAt(s, at, s.dice[0] + s.dice[1]);
  const c = cityAt(at);
  if (item.base && c) rent = s.cfg.rents[c.id][0];
  if (item.double) rent *= 2;
  rent *= item.mult ?? 1;
  let to = deed.owner;
  // Vancouver's empty homes tax: no houses yet, rent goes to the bank.
  if (s.cfg.cityRules && c?.id === "vancouver" && deed.houses === 0) to = -1;
  if (item.toBank) to = -1;
  const pl = s.ps[p];
  if (pl.policy) {
    rent /= 2;
    pl.policy = false;
    s.fx.policies += 1;
  }
  rent = Math.round(rent);
  if (rent <= 0) return;
  if (pl.keep.includes("koi")) {
    s.pending = { k: "koi", who: p, rent, to };
    return;
  }
  payRent(s, p, at, rent, to);
}

function payRent(s: GameState, p: number, at: number, amount: number, to: number) {
  s.stats.rentBySpace[at] += amount;
  if (to >= 0) s.stats.rentByOwner[to] += amount;
  ev(s, { t: "rent", p, to, at, amount });
  charge(s, p, amount, to, true);
}

function afterCity(s: GameState, p: number, at: number) {
  if (cityAt(at)?.id === "beijing") s.pending = { k: "jump", who: p };
}

/** Each city's own rule, done before buying or paying rent there. */
function cityRule(s: GameState, p: number, at: number, noTango: boolean) {
  const c = cityAt(at)!;
  const deed = s.deeds[at]!;
  const rentOwed = deed.owner >= 0 && deed.owner !== p && !deed.mort;
  const others = activePlayers(s).filter((q) => q !== p);
  switch (c.id) {
    case "capetown":
      countRule(s, c.id);
      s.stack.push({ t: "prop", p, at });
      s.pending = { k: "water", votes: {} };
      return;
    case "buenosaires":
      if (noTango || !others.length) break;
      s.pending = { k: "tango", who: p };
      return;
    case "mexicocity":
      countRule(s, c.id);
      s.stack.push({ t: "prop", p, at });
      s.pending = { k: "ban", who: p };
      return;
    case "rio":
      s.stack.push({ t: "prop", p, at });
      if (others.length) s.pending = { k: "dance", who: p };
      return;
    case "mumbai":
      s.stack.push({ t: "prop", p, at });
      if (s.deeds.some((d) => d && d.owner === p && d.houses > 0)) s.pending = { k: "mumbai", who: p };
      return;
    case "dubai":
      s.stack.push({ t: "prop", p, at });
      if (s.decks.journey.length >= 1) s.pending = { k: "peek", who: p, cards: s.decks.journey.slice(-3).reverse() };
      return;
    case "lasvegas":
      s.stack.push({ t: "prop", p, at });
      if (s.ps[p].cash > 0) s.pending = { k: "bet", who: p, at };
      return;
    case "newyork":
      if (rentOwed && rentAt(s, at, 0) > s.cfg.rents[c.id][0]) {
        s.pending = { k: "freeze", who: p, at, votes: {} };
        return;
      }
      break;
    case "tokyo": {
      s.stack.push({ t: "prop", p, at });
      const here = s.ps[p].pos;
      const free = others.filter((q) => !s.ps[q].jail);
      if (!free.length) return;
      // Nearest player by board distance; ahead wins a tie.
      const dist = (q: number) => {
        const h = (s.ps[q].pos - here + M) % M;
        return Math.min(h, M - h) * 2 + (h <= M / 2 ? 0 : 1);
      };
      const pushed = free.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      countRule(s, c.id);
      ev(s, { t: "rule", p, city: c.id, pushed });
      moveBy(s, pushed, 1);
      s.stack.push({ t: "land", p: pushed });
      return;
    }
    case "beijing":
      s.stack.push({ t: "after", p, at });
      break;
    case "shanghai":
      if (rentOwed) {
        s.pending = { k: "quiz", who: deed.owner, visitor: p, at };
        return;
      }
      break;
    case "bangkok":
      s.stack.push({ t: "prop", p, at });
      if (activePlayers(s).length >= 2) s.pending = { k: "splash", who: p, votes: {} };
      return;
    case "sydney":
      s.stack.push({ t: "prop", p, at });
      s.pending = { k: "reverse", who: p };
      return;
    case "singapore":
      s.stack.push({ t: "prop", p, at });
      if (s.fx.permits > 0) s.pending = { k: "coe", who: p, bids: {} };
      return;
    case "venice":
      if (rentOwed) {
        const die = rollDie(s);
        if (die <= 2) {
          countRule(s, c.id);
          ev(s, { t: "rule", p, city: c.id, die, tide: true });
          s.pending = { k: "barrier", who: deed.owner, visitor: p, at };
          return;
        }
        ev(s, { t: "rule", p, city: c.id, die, tide: false });
      }
      break;
    case "paris":
      s.stack.push({ t: "prop", p, at });
      if (s.fx.salesUsed < 2) s.pending = { k: "sales", who: p };
      return;
    case "london":
      s.stack.push({ t: "prop", p, at });
      if (!s.ps[p].policy && s.fx.policies > 0 && s.ps[p].cash >= 50)
        s.pending = { k: "policy", who: p, to: rentOwed ? deed.owner : -1 };
      return;
    case "seoul":
      s.pending = { k: "silence", who: p, at };
      return;
    case "hongkong": {
      const a = rollDie(s);
      const b = rollDie(s);
      const signal = a + b >= 8 && a + b <= 10;
      if (signal) {
        s.fx.typhoon = p;
        countRule(s, c.id);
      }
      ev(s, { t: "rule", p, city: c.id, dice: [a, b], signal });
      break;
    }
  }
  s.stack.push({ t: "prop", p, at });
}

function drawCard(s: GameState, p: number, deck: "journey" | "postcard") {
  const cards = deck === "journey" ? JOURNEY_CARDS : POSTCARDS;
  let pile = s.decks[deck];
  if (!pile.length) {
    // Reshuffle, leaving out cards people are holding.
    const held = new Set(s.ps.flatMap((pl) => pl.keep));
    pile = shuffle(s, cards.length).filter((i) => !held.has(cards[i].id));
    s.decks[deck] = pile;
  }
  const idx = pile.pop();
  if (idx === undefined) return;
  const card = cards[idx];
  const pl = s.ps[p];
  log(s, `${pl.name} draws ${card.id}`);
  ev(s, { t: "card", p, deck, id: card.id });
  if (card.keep) {
    pl.keep.push(card.id);
    return;
  }
  switch (card.id) {
    case "upgrade": {
      const route = ROUTE_SPACES.find((r) => r > pl.pos) ?? ROUTE_SPACES[0];
      moveTo(s, p, route);
      s.stats.landings[route] += 1;
      s.stack.push({ t: "prop", p, at: route, double: true });
      return;
    }
    case "miles":
      s.pending = { k: "card-route", who: p };
      return;
    case "redeye": {
      const from = pl.pos;
      pl.pos = (pl.pos - 3 + M) % M;
      ev(s, { t: "move", p, from, to: pl.pos });
      s.stack.push({ t: "land", p });
      return;
    }
    case "home": {
      const from = pl.pos;
      pl.pos = 0;
      credit(s, p, salaryOf(s));
      s.stats.landings[0] += 1;
      ev(s, { t: "move", p, from, to: 0, salary: salaryOf(s) });
      return;
    }
    case "expired":
      sendToImmigration(s, p);
      s.stats.landings[IMMIGRATION] += 1;
      return;
    case "luggage":
    case "gifts":
    case "visa":
      s.stack.push({ t: "pay", p, amount: 50, to: -1 });
      return;
    case "postage":
      s.stack.push({ t: "pay", p, amount: 20, to: -1 });
      return;
    case "rate":
    case "viral":
      credit(s, p, 100);
      return;
    case "insurance":
      credit(s, p, 50);
      return;
    case "refund":
      credit(s, p, 75);
      return;
    case "wire":
      credit(s, p, 150);
      return;
    case "share": {
      const alive = activePlayers(s);
      const rich = alive.reduce((a, b) => (s.ps[b].cash > s.ps[a].cash ? b : a));
      const poor = alive.reduce((a, b) => (s.ps[b].cash < s.ps[a].cash ? b : a));
      if (rich !== poor) s.stack.push({ t: "pay", p: rich, amount: 150, to: poor });
      return;
    }
    case "audit": {
      let due = 0;
      s.deeds.forEach((d) => {
        if (d && d.owner === p) due += d.houses === 5 ? 100 : d.houses * 25;
      });
      s.stack.push({ t: "pay", p, amount: due, to: -1 });
      return;
    }
    case "typhoon":
    case "cash":
      if (s.deeds.some((d, at) => d && d.owner === p && d.houses > 0 && !(s.cfg.cityRules && at === CAIRO) && canSell(s, p, at)))
        s.pending = { k: "card-house", who: p, card: card.id };
      return;
    case "hitch": {
      const dice = rollDice(s);
      const steps = diceSteps(s, dice, false);
      ev(s, { t: "roll", p, dice: [...dice], steps });
      moveAndLand(s, p, steps, false);
      return;
    }
    case "guide":
      everyonePays(s, p, 20);
      return;
    case "redenvelope":
      everyonePays(s, p, 10);
      return;
    case "lost":
      s.stack.push({ t: "card", p, deck: "postcard" });
      return;
    case "lounge":
    case "airport":
      moveTo(s, p, LOUNGE);
      s.stats.landings[LOUNGE] += 1;
      return;
    case "jetlag":
      pl.jetlag = true;
      return;
    case "classmate":
      if (activePlayers(s).length > 1) s.pending = { k: "card-player", who: p };
      return;
    case "review":
      if (s.deeds.some((d, at) => d && d.owner === p && canBuildFree(s, p, at))) s.pending = { k: "card-house", who: p, card: "review" };
      return;
    case "leader": {
      const alive = activePlayers(s);
      const top = alive.reduce((a, b) => (netWorth(s, b) > netWorth(s, a) ? b : a));
      for (const q of alive.reverse()) if (q !== top) s.stack.push({ t: "pay", p: top, amount: 25, to: q });
      return;
    }
  }
}

/** Seats the game is waiting on. Simultaneous decisions list everyone who hasn't answered yet. */
export function whoMustAct(s: GameState): number[] {
  const pd = s.pending;
  if (!pd) return [];
  if (SIMULTANEOUS.has(pd.k)) {
    const answered = ("votes" in pd ? pd.votes : (pd as { bids: Record<number, number> }).bids) as Record<number, unknown>;
    const voters = pd.k === "scores" ? activePlayers(s).filter((q) => q !== pd.dancer) : activePlayers(s);
    return voters.filter((q) => !(q in answered));
  }
  return [(pd as { who: number }).who];
}

/** A player decision. Shape depends on the pending kind, e.g. {yes:true}, {bid:120}, {partner:2}. */
export type Action = {
  yes?: boolean;
  how?: "roll" | "pay" | "waiver";
  delta?: number;
  bid?: number;
  pay?: boolean;
  bankrupt?: boolean;
  at?: number;
  player?: number;
  use?: boolean;
  partner?: number | null;
  pair?: number;
  score?: number;
  from?: number;
  to?: number;
  order?: number[];
  bet?: number;
  target?: number;
  sound?: number | null;
};

/** Apply seat `p`'s decision. Returns false if it isn't theirs to make or isn't valid (nothing changes). */
export function act(s: GameState, p: number, a: Action): boolean {
  const pd = s.pending;
  if (!pd || s.over || !whoMustAct(s).includes(p)) return false;
  const yes = a.yes === true;
  switch (pd.k) {
    case "roll":
      return rollAction(s, p, a);
    case "permit": {
      const delta = Number(a.delta);
      if (![-1, 0, 1].includes(delta)) return false;
      s.pending = null;
      if (delta !== 0) {
        s.ps[p].permits -= 1;
        s.fx.permits += 1;
        countRule(s, "singapore-permit");
        ev(s, { t: "rule", p, city: "singapore", permit: delta });
      }
      moveAndLand(s, p, pd.steps + delta, pd.again);
      break;
    }
    case "buy": {
      s.pending = null;
      if (yes && s.ps[p].cash >= pd.price) {
        s.ps[p].cash -= pd.price;
        s.deeds[pd.at]!.owner = p;
        s.stats.boughtAt[pd.at] += 1;
        if (pd.price !== priceOf(s, pd.at)) s.ps[p].keep.splice(s.ps[p].keep.indexOf("points"), 1);
        ev(s, { t: "buy", p, at: pd.at, price: pd.price });
      } else if (s.cfg.auctions === false) ev(s, { t: "pass", p, at: pd.at });
      else s.pending = { k: "auction", at: pd.at, bids: {} };
      break;
    }
    case "auction": {
      const bid = Math.floor(Number(a.bid) || 0);
      if (bid < 0 || bid > s.ps[p].cash) return false;
      pd.bids[p] = bid;
      if (whoMustAct(s).length) return true;
      s.pending = null;
      settleSealedAuction(s, pd.at, pd.bids);
      break;
    }
    case "debt": {
      const pl = s.ps[p];
      if (a.pay === true) {
        if (pl.cash < pd.amount) return false;
        s.pending = null;
        transfer(s, p, pd.to, pd.amount);
        ev(s, { t: "pay", p, to: pd.to, amount: pd.amount });
      } else if (a.bankrupt === true) {
        s.pending = null;
        bankrupt(s, p, pd.to);
      } else return false;
      break;
    }
    case "end":
      s.pending = null;
      nextTurn(s);
      return true;
    case "card-route": {
      const at = Number(a.at);
      if (!ROUTE_SPACES.includes(at)) return false;
      s.pending = null;
      moveTo(s, p, at);
      s.stats.landings[at] += 1;
      s.stack.push({ t: "prop", p, at });
      break;
    }
    case "card-player": {
      const q = Number(a.player);
      if (q === p || !s.ps[q] || s.ps[q].out) return false;
      s.pending = null;
      credit(s, p, 50);
      credit(s, q, 50);
      ev(s, { t: "rule", p, city: "", card: "classmate", player: q });
      break;
    }
    case "card-house": {
      const at = Number(a.at);
      if (pd.card === "review") {
        if (!canBuildFree(s, p, at)) return false;
        s.deeds[at]!.houses += 1;
      } else {
        if (!canSell(s, p, at) || (s.cfg.cityRules && at === CAIRO)) return false;
        s.deeds[at]!.houses -= 1;
        if (pd.card === "cash") s.ps[p].cash += Math.round(houseCostAt(s, at) / 2);
      }
      s.pending = null;
      ev(s, { t: "rule", p, city: "", card: pd.card, at });
      break;
    }
    case "koi": {
      s.pending = null;
      if (yes) {
        s.ps[p].keep.splice(s.ps[p].keep.indexOf("koi"), 1);
        countRule(s, "koi");
        ev(s, { t: "rule", p, city: "", card: "koi", rent: pd.rent });
      } else payRent(s, p, s.ps[p].pos, pd.rent, pd.to);
      break;
    }
    case "water": {
      if (a.use !== true && a.use !== false) return false;
      pd.votes[p] = a.use;
      if (whoMustAct(s).length) return true;
      s.pending = null;
      const users = Object.entries(pd.votes)
        .filter(([, use]) => use === true)
        .map(([q]) => Number(q));
      const dayZero = users.length * 2 > activePlayers(s).length;
      ev(s, { t: "rule", p: s.turn, city: "capetown", users, dayZero });
      if (dayZero) for (const q of activePlayers(s).reverse()) s.stack.push({ t: "pay", p: q, amount: 50, to: -1 });
      else for (const q of users) credit(s, q, 30);
      break;
    }
    case "tango": {
      const partner = a.partner === null || a.partner === undefined ? -1 : Number(a.partner);
      s.pending = null;
      if (partner < 0) {
        s.stack.push({ t: "prop", p, at: s.ps[p].pos });
        break;
      }
      if (partner === p || !s.ps[partner] || s.ps[partner].out) {
        s.pending = pd;
        return false;
      }
      s.pending = { k: "tango-reply", who: partner, from: p };
      break;
    }
    case "tango-reply": {
      s.pending = null;
      countRule(s, "buenosaires");
      const from = s.ps[pd.from];
      const me = s.ps[p];
      ev(s, { t: "rule", p: pd.from, city: "buenosaires", partner: p, accepted: yes });
      if (!yes) {
        s.stack.push({ t: "prop", p: pd.from, at: from.pos });
        s.stack.push({ t: "pay", p, amount: 50, to: pd.from });
        break;
      }
      const wasJailed = me.jail;
      [from.pos, me.pos] = [me.pos, from.pos];
      me.jail = false;
      if (wasJailed) me.jail = false;
      s.stack.push({ t: "land", p, noTango: true });
      s.stack.push({ t: "land", p: pd.from, noTango: true });
      break;
    }
    case "ban": {
      const pair = Number(a.pair);
      if (![0, 1, 2].includes(pair)) return false;
      s.pending = null;
      s.fx.ban = { lo: 2 * pair + 1, hi: 2 * pair + 2, by: p };
      ev(s, { t: "rule", p, city: "mexicocity", lo: 2 * pair + 1, hi: 2 * pair + 2 });
      break;
    }
    case "dance":
      s.pending = yes ? { k: "scores", dancer: p, votes: {} } : null;
      if (yes) countRule(s, "rio");
      break;
    case "scores": {
      const score = Math.round(Number(a.score));
      if (!(score >= 1 && score <= 10)) return false;
      pd.votes[p] = score;
      if (whoMustAct(s).length) return true;
      s.pending = null;
      const sorted = Object.values(pd.votes).sort((x, y) => x - y);
      const total = sorted.length >= 2 ? sorted.slice(1).reduce((x, y) => x + y, 0) : sorted.reduce((x, y) => x + y, 0);
      credit(s, pd.dancer, total * 5);
      ev(s, { t: "rule", p: pd.dancer, city: "rio", scores: sorted, total, amount: total * 5 });
      break;
    }
    case "mumbai": {
      s.pending = null;
      if (a.from === undefined) break;
      const from = Number(a.from);
      const to = Number(a.to);
      const df = s.deeds[from];
      const dt = s.deeds[to];
      if (!df || !dt || df.owner !== p || dt.owner !== p || from === to || !canSell(s, p, from)) {
        s.pending = pd;
        return false;
      }
      df.houses -= 1;
      if (!canBuildFree(s, p, to)) {
        df.houses += 1;
        s.pending = pd;
        return false;
      }
      dt.houses += 1;
      countRule(s, "mumbai");
      ev(s, { t: "rule", p, city: "mumbai", from, to });
      break;
    }
    case "peek": {
      s.pending = null;
      const order = Array.isArray(a.order) ? a.order : null;
      if (order && order.length === pd.cards.length && pd.cards.every((c) => order.includes(c))) {
        const pile = s.decks.journey;
        pile.splice(pile.length - pd.cards.length, pd.cards.length, ...[...order].reverse());
        countRule(s, "dubai");
        ev(s, { t: "rule", p, city: "dubai" });
      }
      break;
    }
    case "bet": {
      const bet = Math.floor(Number(a.bet) || 0);
      if (bet < 0 || bet > Math.min(200, s.ps[p].cash)) return false;
      s.pending = null;
      if (bet === 0) break;
      countRule(s, "lasvegas");
      const owner = s.deeds[pd.at]!.owner;
      const house = owner >= 0 && owner !== p ? owner : -1;
      const d1 = rollDie(s);
      const d2 = rollDie(s);
      const won = d1 + d2 === 7;
      ev(s, { t: "rule", p, city: "lasvegas", bet, dice: [d1, d2], won, house });
      if (won) {
        if (house >= 0) s.stack.push({ t: "pay", p: house, amount: bet * 4, to: p });
        else credit(s, p, bet * 4);
      } else transfer(s, p, house, bet);
      break;
    }
    case "freeze": {
      pd.votes[p] = yes;
      if (whoMustAct(s).length) return true;
      s.pending = null;
      const frozen = Object.values(pd.votes).filter((v) => v === true).length * 2 > activePlayers(s).length;
      if (frozen) countRule(s, "newyork");
      ev(s, { t: "rule", p: pd.who, city: "newyork", frozen, yes: Object.values(pd.votes).filter((v) => v === true).length });
      s.stack.push({ t: "prop", p: pd.who, at: pd.at, base: frozen });
      break;
    }
    case "jump": {
      s.pending = null;
      if (!yes) break;
      countRule(s, "beijing");
      ev(s, { t: "rule", p, city: "beijing" });
      moveBy(s, p, M / 2);
      s.stack.push({ t: "land", p });
      break;
    }
    case "quiz": {
      s.pending = null;
      countRule(s, "shanghai");
      ev(s, { t: "rule", p: pd.visitor, city: "shanghai", right: yes });
      s.stack.push({ t: "prop", p: pd.visitor, at: pd.at, mult: yes ? 0.5 : 2 });
      break;
    }
    case "splash": {
      const target = Number(a.target);
      if (!s.ps[target] || s.ps[target].out || target === p) return false;
      pd.votes[p] = target;
      if (whoMustAct(s).length) return true;
      s.pending = null;
      countRule(s, "bangkok");
      const hits: Record<number, number> = {};
      for (const q of Object.values(pd.votes)) hits[q] = (hits[q] ?? 0) + 1;
      const most = Math.max(...Object.values(hits));
      const winners: number[] = [];
      for (const [q, n] of Object.entries(hits))
        if (n === most) {
          credit(s, Number(q), 50);
          winners.push(Number(q));
        }
      ev(s, { t: "rule", p: pd.who, city: "bangkok", winners, most });
      break;
    }
    case "reverse":
      s.pending = null;
      if (yes) {
        s.dir = s.dir === 1 ? -1 : 1;
        countRule(s, "sydney");
        ev(s, { t: "rule", p, city: "sydney", dir: s.dir });
      }
      break;
    case "coe": {
      const bid = Math.floor(Number(a.bid) || 0);
      if (bid < 0 || bid > s.ps[p].cash) return false;
      pd.bids[p] = bid;
      if (whoMustAct(s).length) return true;
      s.pending = null;
      const ranked = Object.entries(pd.bids)
        .map(([q, b]): [number, number] => [Number(q), b])
        .filter(([, b]) => b > 0)
        .sort((x, y) => y[1] - x[1] || seatDistance(s, x[0], pd.who) - seatDistance(s, y[0], pd.who));
      if (!ranked.length) {
        ev(s, { t: "rule", p: pd.who, city: "singapore", winner: null });
        break;
      }
      const [winner] = ranked[0];
      const price = ranked[1]?.[1] ?? 0;
      transfer(s, winner, -1, price);
      s.ps[winner].permits += 1;
      s.fx.permits -= 1;
      countRule(s, "singapore");
      ev(s, { t: "rule", p: pd.who, city: "singapore", winner, price });
      break;
    }
    case "barrier": {
      s.pending = null;
      const raised = yes && s.ps[p].cash >= 50;
      ev(s, { t: "rule", p: pd.visitor, city: "venice", raised });
      if (raised) {
        transfer(s, p, -1, 50);
        s.stack.push({ t: "prop", p: pd.visitor, at: pd.at });
      } else s.stack.push({ t: "prop", p: pd.visitor, at: pd.at, mult: 0.5 });
      break;
    }
    case "sales":
      s.pending = null;
      if (yes) {
        s.fx.sales = p;
        s.fx.salesUsed += 1;
        countRule(s, "paris");
        ev(s, { t: "rule", p, city: "paris" });
      }
      break;
    case "policy":
      s.pending = null;
      if (yes && s.ps[p].cash >= 50 && s.fx.policies > 0) {
        transfer(s, p, pd.to, 50);
        s.ps[p].policy = true;
        s.fx.policies -= 1;
        countRule(s, "london");
        ev(s, { t: "rule", p, city: "london", to: pd.to });
      }
      break;
    case "silence": {
      const sound = a.sound === null || a.sound === undefined ? -1 : Number(a.sound);
      if (sound >= 0 && (!s.ps[sound] || s.ps[sound].out || sound === p)) return false;
      s.pending = null;
      countRule(s, "seoul");
      ev(s, { t: "rule", p, city: "seoul", sound });
      const deed = s.deeds[pd.at]!;
      if (deed.owner >= 0 && deed.owner !== p && !deed.mort) {
        if (sound >= 0 && sound !== deed.owner) {
          // Whoever made a sound pays the rent instead.
          const due = s.fx.typhoon !== null ? 0 : rentAt(s, pd.at, 0);
          if (due > 0) payRent(s, sound, pd.at, due, deed.owner);
        } else if (sound < 0) s.stack.push({ t: "prop", p, at: pd.at });
      } else {
        s.stack.push({ t: "prop", p, at: pd.at });
        if (sound >= 0 && deed.owner < 0) s.stack.push({ t: "pay", p: sound, amount: 50, to: p });
      }
      break;
    }
    default:
      return false;
  }
  run(s);
  return true;
}

/** Sealed-bid auction as simulated: top bid wins and pays $10 over the second bid (at least $10). */
function settleSealedAuction(s: GameState, at: number, bids: Record<number, number>) {
  const ranked = Object.entries(bids)
    .map(([q, b]): [number, number] => [Number(q), b])
    .filter(([q, b]) => b >= 10 && !s.ps[q].out)
    .sort((x, y) => y[1] - x[1] || seatDistance(s, x[0], s.turn) - seatDistance(s, y[0], s.turn));
  if (!ranked.length) {
    ev(s, { t: "auction", at, winner: null, price: 0 });
    return;
  }
  const [winner, top] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const price = Math.max(10, Math.min(top, second + 10));
  s.ps[winner].cash -= price;
  s.deeds[at]!.owner = winner;
  s.stats.auctions += 1;
  s.stats.auctionTotal += price;
  s.stats.boughtAt[at] += 1;
  ev(s, { t: "auction", at, winner, price });
}

function rollAction(s: GameState, p: number, a: Action): boolean {
  const pl = s.ps[p];
  const pd = s.pending as Extract<Pending, { k: "roll" }>;
  if (pd.jail) {
    // Immigration: leave this turn either way; pay $50 unless you roll doubles or hand in a visa waiver.
    const how = a.how === "pay" || a.how === "waiver" ? a.how : "roll";
    if (how === "waiver") {
      const i = pl.keep.findIndex((c) => c === "waiver" || c === "waiver2");
      if (i < 0) return false;
      pl.keep.splice(i, 1);
    }
    s.pending = null;
    pl.jail = false;
    const dice = rollDice(s);
    const fee = how === "pay" || (how === "roll" && dice[0] !== dice[1]);
    const steps = diceSteps(s, dice, pl.jetlag);
    ev(s, { t: "roll", p, dice: [...dice], steps, jail: true, doubles: dice[0] === dice[1] });
    pl.jetlag = false;
    moveAndLand(s, p, steps, false);
    if (fee) s.stack.push({ t: "pay", p, amount: s.cfg.immigrationFee, to: -1 });
    run(s);
    return true;
  }
  s.pending = null;
  const dice = rollDice(s);
  const lagged = pl.jetlag;
  pl.jetlag = false;
  const doubles = !lagged && dice[0] === dice[1];
  if (doubles) {
    pl.dbl += 1;
    if (pl.dbl >= 3) {
      ev(s, { t: "roll", p, dice: [...dice], steps: 0, doubles: true });
      sendToImmigration(s, p);
      s.stats.landings[IMMIGRATION] += 1;
      run(s);
      return true;
    }
  }
  const steps = diceSteps(s, dice, lagged);
  ev(s, { t: "roll", p, dice: lagged ? [dice[0]] : [...dice], steps, doubles });
  if (pl.permits > 0 && s.cfg.cityRules) {
    s.pending = { k: "permit", who: p, steps, again: doubles };
    return true;
  }
  moveAndLand(s, p, steps, doubles);
  run(s);
  return true;
}

export type ManageKind = "build" | "sell" | "mortgage" | "unmortgage";

/** Build, sell, mortgage or unmortgage — only on your own turn (before rolling, at the end, or while in debt). */
export function manage(s: GameState, p: number, m: { k: ManageKind; at: number }): boolean {
  const pd = s.pending;
  if (!pd || !("who" in pd) || pd.who !== p || (pd.k !== "roll" && pd.k !== "end" && pd.k !== "debt")) return false;
  let ok: boolean;
  if (m.k === "build") ok = pd.k !== "debt" && build(s, p, m.at);
  else if (m.k === "sell") ok = sell(s, p, m.at);
  else if (m.k === "mortgage") ok = mortgage(s, p, m.at);
  else ok = pd.k !== "debt" && unmortgage(s, p, m.at);
  if (ok) ev(s, { t: "manage", p, k: m.k, at: m.at });
  return ok;
}

// ---- Online play additions. Simulations never call these. ----

/** Finish a live (open-outcry) auction run by the server: the winner pays their last bid. */
export function settleLiveAuction(s: GameState, winner: number | null, price: number): boolean {
  const pd = s.pending;
  if (!pd || pd.k !== "auction" || s.over) return false;
  s.pending = null;
  if (winner !== null && s.ps[winner] && !s.ps[winner].out && price >= 10 && s.ps[winner].cash >= price) {
    s.ps[winner].cash -= price;
    s.deeds[pd.at]!.owner = winner;
    s.stats.auctions += 1;
    s.stats.auctionTotal += price;
    s.stats.boughtAt[pd.at] += 1;
    ev(s, { t: "auction", at: pd.at, winner, price });
  } else ev(s, { t: "auction", at: pd.at, winner: null, price: 0 });
  run(s);
  return true;
}

/** A small prize from outside the rules (the waiting players' quiz): money from the bank, no decision changes. */
export function bonus(s: GameState, p: number, amount: number, why: string): boolean {
  if (s.over || !s.ps[p] || s.ps[p].out || amount <= 0) return false;
  s.ps[p].cash += Math.round(amount);
  ev(s, { t: "bonus", p, amount: Math.round(amount), why });
  return true;
}

/**
 * Take up to `amount` from a team for the bank (outside the board's rules: a wrong answer in the
 * waiting teams' quiz). Never more than the team has, so it can't put anyone in debt. Returns what was taken.
 */
export function fine(s: GameState, p: number, amount: number, why: string): number {
  if (s.over || !s.ps[p] || s.ps[p].out) return 0;
  const take = Math.min(Math.round(amount), s.ps[p].cash);
  if (take <= 0) return 0;
  s.ps[p].cash -= take;
  ev(s, { t: "fine", p, amount: take, why });
  return take;
}

/** Time's up in a timed game: finish the round in progress, then the richest team wins. */
export function endAfterThisRound(s: GameState) {
  if (s.over) return;
  const alive = activePlayers(s);
  const most = Math.max(...alive.map((p) => s.ps[p].turns));
  const level = alive.every((p) => s.ps[p].turns === most);
  s.cfg.end = { kind: "rounds", rounds: level ? most + 1 : most };
}

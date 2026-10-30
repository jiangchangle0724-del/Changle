/* 到此一游 rules engine: run with `npx tsx tests/trip.test.ts` */
import { CITY_AT, decide, defaultConfig, JAIL, newGame, rentOf, worth, act, type Game } from "../src/shared/trip/engine";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
function test(name: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.log("FAIL", name, e);
  }
}

/** A fresh game with players standing where we want, everything else quiet. */
function setup(n = 3, seed = 1): Game {
  // everyone starts with the same cash here, so the sums below are easy to read
  const cfg = { ...defaultConfig(n), seatBonus: [] };
  return newGame(cfg, Array.from({ length: n }, (_, i) => `P${i}`), seed);
}
const own = (g: Game, p: number, ...ids: string[]) => ids.forEach((id) => (g.deeds[CITY_AT[id]]!.owner = p));
/** Roll these dice for the player whose turn it is. */
function rollAs(g: Game, a: number, b: number) {
  g.forced.push(a, b);
  return decide(g, g.turn, {});
}
const pk = (g: Game) => g.pending?.k;

test("setup: later seats start with a little more, and two players play to a higher target", () => {
  const g = newGame(defaultConfig(4), ["A", "B", "C", "D"], 3);
  ok(g.ps.map((p) => p.cash).join(",") === "1500,1525,1550,1575", "+$25 a seat");
  const two = defaultConfig(2);
  ok(two.end.kind === "target" && two.end.amount > (defaultConfig(4).end as { amount: number }).amount, "two players: a higher target");
});

test("rent: base, a full set doubles, houses and hotel from the deed", () => {
  const g = setup();
  own(g, 1, "cairo");
  const at = CITY_AT.cairo;
  ok(rentOf(g, at, 7) === g.cfg.rents.cairo[0], "Cairo alone: the base rent");
  own(g, 1, "capetown");
  ok(rentOf(g, at, 7) === g.cfg.rents.cairo[0] * 2, "both African cities: doubled");
  g.deeds[at]!.houses = 3;
  ok(rentOf(g, at, 7) === g.cfg.rents.cairo[4], "three houses: the deed's number");
});

test("landing: buy or the auction goes to the top bidder at the second bid plus $10", () => {
  const g = setup(3);
  g.ps[0].pos = 0;
  rollAs(g, 1, 2); // to Cape Town (3): the water vote first
  ok(pk(g) === "water", "Cape Town asks everyone about water first");
  for (const q of [0, 1, 2]) decide(g, q, { use: false });
  ok(pk(g) === "buy", "then the deed is for sale");
  decide(g, 0, { yes: false });
  ok(pk(g) === "auction", "passing starts an auction");
  decide(g, 0, { bid: 0 });
  decide(g, 1, { bid: 140 });
  decide(g, 2, { bid: 90 });
  const d = g.deeds[CITY_AT.capetown]!;
  ok(d.owner === 1 && g.ps[1].cash === 1500 - 100, "P1 wins and pays $100 (P2's $90 plus $10)");
});

test("Vancouver: owned but unbuilt, the rent goes to the bank", () => {
  const g = setup(2);
  own(g, 1, "vancouver");
  g.ps[0].pos = 15;
  const before = g.ps[1].cash;
  rollAs(g, 1, 2); // 18
  ok(g.ps[1].cash === before && g.ps[0].cash === 1500 - rentOf(g, CITY_AT.vancouver, 0), "P0 paid, P1 got nothing");
});

test("Istanbul plus two European cities is a full Europe set", () => {
  const g = setup(2);
  own(g, 1, "istanbul", "venice", "paris");
  const at = CITY_AT.paris;
  ok(rentOf(g, at, 0) === g.cfg.rents.paris[1], "Paris rent doubles");
  g.turn = 1;
  g.pending = { k: "roll", who: 1, jail: false };
  ok(act(g, 1, { k: "build", at: CITY_AT.venice }), "P1 can build in Europe");
});

test("Hong Kong's Signal No. 8: nobody pays rent until that player's next turn", () => {
  const g = setup(2);
  own(g, 1, "seoul");
  g.ps[0].pos = 35;
  rollAs(g, 1, 3); // 39 Hong Kong
  ok(pk(g) === "buy", "Hong Kong for sale");
  g.forced.push(4, 4); // the signal roll: 8
  // the signal is rolled before the deed: replay the landing with the forced roll
  const g2 = setup(2);
  own(g2, 1, "seoul");
  g2.ps[0].pos = 35;
  g2.forced.push(1, 3, 4, 4);
  decide(g2, 0, {});
  ok(g2.fx.typhoon === 0, "8: the signal goes up");
  decide(g2, 0, { yes: false });
  decide(g2, 0, { bid: 0 });
  decide(g2, 1, { bid: 0 });
  decide(g2, 0, {}); // end
  ok(g2.turn === 1, "P1's turn");
  g2.ps[1].pos = 30 + 4;
  g2.deeds[CITY_AT.seoul]!.owner = 0;
  const cash = g2.ps[1].cash;
  g2.forced.push(1, 2); // 37 Seoul
  decide(g2, 1, {});
  decide(g2, 1, { sound: null });
  ok(g2.ps[1].cash === cash, "Seoul rent waived while the signal is up");
});

test("three doubles in a row: straight to Immigration; out the next turn for $50", () => {
  const g = setup(2);
  g.ps[0].pos = 0;
  rollAs(g, 1, 1); // 2 postcard
  while (pk(g) !== "roll") decide(g, g.pending && "who" in g.pending ? g.pending.who : 0, { yes: false, use: false });
  rollAs(g, 2, 2); // 6 Buenos Aires: tango question
  while (pk(g) !== "roll") {
    const k = pk(g);
    if (k === "tango") decide(g, 0, { partner: null });
    else if (k === "buy") decide(g, 0, { yes: false });
    else if (k === "auction") {
      decide(g, 0, { bid: 0 });
      decide(g, 1, { bid: 0 });
    } else break;
  }
  ok(pk(g) === "roll" && g.turn === 0, "doubles: roll again");
  rollAs(g, 3, 3);
  ok(g.ps[0].jail && g.ps[0].pos === JAIL, "third doubles: in Immigration");
  decide(g, 0, {}); // end
  decide(g, 1, {}); // P1 rolls (random), whatever happens
  for (let i = 0; i < 20 && g.turn !== 0; i++) {
    const w = g.pending && "who" in g.pending ? g.pending.who : 1;
    decide(g, w, { yes: false, bid: 0, use: false, partner: null, sound: null, pair: 0, score: 5, delta: 0, target: 0 });
  }
  ok(pk(g) === "roll" && (g.pending as { jail: boolean }).jail, "P0's next turn starts in Immigration");
  const cash = g.ps[0].cash;
  g.forced.push(2, 3);
  decide(g, 0, { how: "pay" });
  ok(!g.ps[0].jail && g.ps[0].pos === JAIL + 5 && g.ps[0].cash <= cash - 50, "paid $50 and moved by the roll");
});

test("passport: a city in all eight regions pays $300 once", () => {
  const g = setup(2);
  g.ps[0].stamps = ["cairo", "rio", "dubai", "newyork", "tokyo", "sydney", "london"];
  g.ps[0].pos = 35;
  rollAs(g, 1, 1); // 37 Seoul (region 8)
  ok(g.ps[0].bonus && g.ps[0].cash === 1500 + 300, "all eight: +$300");
});

test("New York: a majority votes the rent down to the base rent", () => {
  const g = setup(3);
  own(g, 1, "lasvegas", "vancouver", "newyork");
  g.ps[0].pos = 16;
  rollAs(g, 1, 2); // 19 New York
  ok(pk(g) === "freeze", "a set's rent: the table votes");
  decide(g, 0, { yes: true });
  decide(g, 1, { yes: false });
  decide(g, 2, { yes: true });
  ok(g.ps[0].cash === 1500 - g.cfg.rents.newyork[0], "two of three: base rent only");
});

test("Seoul: whoever makes a sound first pays the visitor's rent", () => {
  const g = setup(3);
  own(g, 1, "seoul");
  g.ps[0].pos = 34;
  rollAs(g, 1, 2); // 37
  ok(pk(g) === "silence", "ten seconds of silence");
  const c2 = g.ps[2].cash;
  decide(g, 0, { sound: 2 });
  ok(g.ps[0].cash === 1500 && g.ps[2].cash === c2 - g.cfg.rents.seoul[0], "P2 laughed and paid");
});

test("Cairo: buildings count double at the end, and no card can knock them down", () => {
  const g = setup(2);
  own(g, 0, "cairo", "capetown");
  g.deeds[CITY_AT.cairo]!.houses = 2;
  g.deeds[CITY_AT.capetown]!.houses = 2;
  const w = worth(g, 0);
  ok(w === 1500 + 60 + 80 + 2 * 50 * 2 + 2 * 50, "Cairo's two houses are worth $200, Cape Town's $100");
});

test("Beijing: jump across the board, collecting $200 on the way", () => {
  const g = setup(2);
  g.ps[0].pos = 20;
  rollAs(g, 1, 2); // 23 Beijing
  ok(pk(g) === "buy", "Beijing for sale");
  decide(g, 0, { yes: true });
  ok(pk(g) === "jump", "then the jump");
  decide(g, 0, { yes: true });
  ok(g.ps[0].pos === 3 && pk(g) === "water", "over to Cape Town");
  ok(g.ps[0].cash === 1500 - 260 + 200, "bought Beijing, collected $200 passing Departure");
});

test("going broke to a player hands them the deeds", () => {
  const g = setup(3);
  own(g, 1, "hongkong");
  g.deeds[CITY_AT.hongkong]!.houses = 5;
  own(g, 0, "cairo");
  g.ps[0].cash = 100;
  g.ps[0].pos = 35;
  g.forced.push(1, 3, 1, 1); // to Hong Kong, then the signal roll: 2, no signal
  decide(g, 0, {});
  ok(pk(g) === "debt", "can't pay: a debt");
  decide(g, 0, { bankrupt: true });
  ok(g.ps[0].out && g.deeds[CITY_AT.cairo]!.owner === 1, "P0 is out; P1 has Cairo");
  ok(g.turn !== 0 || g.pending?.k === "roll", "the game moves on");
});

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");

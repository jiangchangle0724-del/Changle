// The room, driven by scripted phones on a fake clock: whole games, reconnects, auctions, saves.
// Phones decide from what their own view shows (the same data a real phone gets).
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../src/engine";
import { random } from "../src/engine/rng";
import { TIMING, TRIVIA_PRIZE, TRIVIA_WRONG, type ClientMsg, type RoomView, type ServerMsg } from "../src/room/protocol";
import { Room, type RoomEnv } from "../src/room/room";
import { FORFEITS } from "../src/room/party";
import { SEEN_KEEP, TRIVIA, TRIVIA_BY_ID } from "../src/room/trivia";

class Clock {
  t = 1_700_000_000_000;
  now = () => this.t;
}

function makeEnv(clock: Clock, seed = 1): RoomEnv {
  const h = { seed };
  return { now: clock.now, random: () => random(h) };
}

interface Phone {
  id: string;
  key: string;
  brain: E.Brain;
  toasts: string[];
  tried: Set<string>;
  declineBuys?: boolean;
}

function phone(n: number): Phone {
  return { id: `member-${n}-xxxxxxxx`, key: `key-${n}-secret-xxxx`, brain: E.newBrain(E.STYLES.balanced, 100 + n), toasts: [], tried: new Set() };
}

class Table {
  clock = new Clock();
  room: Room;
  phones: Phone[] = [];
  views = new Map<string, RoomView>();
  /** Every feed item the room ever produced (the room itself keeps only the latest). */
  seen: import("../src/room/protocol").FeedItem[] = [];
  private lastFeed = 0;
  constructor(settings: Partial<import("../src/room/protocol").Settings> = {}, seed = 1) {
    this.room = Room.create("1234", makeEnv(this.clock, seed), { speed: 0.05, ...settings });
  }
  join(p: Phone, name: string) {
    assert.ok(this.room.join(p.id, p.key, { name }));
    this.phones.push(p);
    this.settle();
  }
  refusals: string[] = [];
  send(p: Phone, msg: ClientMsg) {
    const before = p.toasts.length;
    const pk = this.room.st.game?.s.pending?.k;
    this.room.handle(p.id, msg);
    this.settle();
    if (p.toasts.length > before && p.toasts.at(-1) === "cantDoThat") {
      let extra = "";
      if (msg.t === "manage") {
        const gs = this.room.st.game!.s;
        const grp = E.groupAt(msg.at);
        extra = ` at=${msg.at} seat=${msg.seat} who=${(gs.pending as { who?: number })?.who} group=${grp} ` +
          JSON.stringify((grp ? E.GROUP_SPACES[grp] : [msg.at]).map((x) => [x, gs.deeds[x]]));
      }
      this.refusals.push(`${msg.t}${"k" in msg ? ":" + msg.k : ""}@${pk}${msg.t === "act" ? " " + JSON.stringify(msg.a) : ""}${extra}`);
    }
  }
  settle() {
    for (const f of this.room.st.feed) if (f.id > this.lastFeed) this.seen.push(f);
    this.lastFeed = Math.max(this.lastFeed, ...this.room.st.feed.map((f) => f.id));
    const out = this.room.flush();
    for (const [id, msg] of out.direct) {
      const ph = this.phones.find((x) => x.id === id);
      if (ph && msg.t === "toast") ph.toasts.push(msg.key);
    }
    return out;
  }
  view(p: Phone) {
    return this.room.view(p.id);
  }
  /** Each phone makes the decision its view says it owes. Returns true if anyone did something. */
  phonesAct(): boolean {
    let acted = false;
    for (const p of this.phones) {
      const v = this.view(p);
      const g = v.game;
      if (!g || v.phase !== "playing" || g.paused) continue;
      // A party forfeit holds the game: its team does it and says so; nobody else can move meanwhile.
      if (g.forfeit) {
        if (v.you.seats.includes(g.forfeit.seat)) {
          this.send(p, { t: "forfeit", id: g.forfeit.id, op: "done" });
          return true;
        }
        continue;
      }
      assert.equal(g.s.seed, 0, "the dice seed never leaves the server");
      assert.equal(g.s.decks.journey.length, 0, "card order never leaves the server");
      const pd = g.s.pending;
      if (!pd) continue;
      if ("votes" in pd) assert.deepEqual(pd.votes, {}, "votes stay hidden until everyone has answered");
      for (const seat of v.you.seats) {
        if (pd.k === "auction" && g.auction) {
          const min = g.auction.price === 0 ? 10 : g.auction.price + 10;
          const limit = E.auctionLimit(g.s, seat, this.styleFor(p));
          if (g.auction.leader !== seat && limit >= min) {
            this.send(p, { t: "bid", aid: g.auction.id, amount: min, seat });
            return true;
          }
          continue;
        }
        if (!g.mustAct.includes(seat)) continue;
        if (pd.k === "quiz") continue;
        if (pd.k === "silence" && g.silenceUntil && v.now < g.silenceUntil) continue;
        // (Rio's judges: the buttons light up once the dance is over)
        if (pd.k === "scores" && g.dance && v.now < g.dance.at + g.dance.ms) continue;
        const state = structuredClone(g.s);
        const brains = state.ps.map(() => p.brain);
        const key = `${g.decision}:${seat}`;
        const offers: ClientMsg[] = [];
        let a = E.decide(state, seat, brains, {
          isHuman: () => true,
          propose: (_from, to, give, get) => offers.push({ t: "offer", to, give, get, seat }),
        });
        for (const o of offers) this.send(p, o);
        // The phone's decision may have built, sold or mortgaged on its copy: do the same for real first.
        this.mirrorAssets(p, seat, g.s, state);
        if (pd.k === "buy" && p.declineBuys) a = { yes: false };
        if (p.tried.has(key)) a = E.fallbackAction(state, seat, pd.k);
        p.tried.add(key);
        this.send(p, { t: "act", d: this.view(p).game!.decision, a, seat });
        acted = true;
      }
      for (const tr of g.trades) {
        if (!v.you.seats.includes(tr.to)) continue;
        const accept = E.botAcceptsTrade(structuredClone(g.s), tr.to, tr.get, tr.give, E.STYLES.balanced);
        this.send(p, { t: "offer-reply", id: tr.id, accept });
        acted = true;
      }
      if (g.quiz && v.you.seats.includes(g.quiz.visitor)) {
        this.send(p, { t: "quiz", qid: g.quiz.id, choice: 0 });
        acted = true;
      }
    }
    return acted;
  }
  /** Send the build / sell / mortgage / unmortgage messages that turn `from` into `to` for this seat. */
  mirrorAssets(p: Phone, seat: number, from: E.GameState, to: E.GameState) {
    void from;
    // One house at a time, tallest first when selling and shortest first when building (even-building rule).
    for (let n = 0; n < 60; n++) {
      const cur = this.room.st.game!.s;
      const mine = to.deeds.map((d, at) => ({ d, at })).filter((x) => x.d && x.d.owner === seat);
      const sells = mine.filter((x) => x.d!.houses < cur.deeds[x.at]!.houses).sort((a, b) => cur.deeds[b.at]!.houses - cur.deeds[a.at]!.houses);
      const builds = mine.filter((x) => x.d!.houses > cur.deeds[x.at]!.houses).sort((a, b) => cur.deeds[a.at]!.houses - cur.deeds[b.at]!.houses);
      if (sells.length) this.send(p, { t: "manage", k: "sell", at: sells[0].at, seat });
      else if (builds.length) this.send(p, { t: "manage", k: "build", at: builds[0].at, seat });
      else break;
    }
    const cur = this.room.st.game!.s;
    for (const [at, d] of to.deeds.entries()) {
      if (!d || d.owner !== seat) continue;
      if (d.mort && !cur.deeds[at]!.mort) this.send(p, { t: "manage", k: "mortgage", at, seat });
      if (!d.mort && cur.deeds[at]!.mort) this.send(p, { t: "manage", k: "unmortgage", at, seat });
    }
  }
  styleFor(_p: Phone) {
    return E.STYLES.balanced;
  }
  /**
   * Jump the clock to the room's next timer and run it. (Or to the moment a phone answers by itself:
   * the end of Seoul's silence, or of Rio's dance for the judges. The room has no timer for those, and
   * jumping past them would hand the team's move to the turn clock.)
   */
  wait() {
    const g = this.room.st.game;
    const own = [g?.silenceUntil ?? 0, g?.danceAt ? g.danceAt + TIMING.dance * (this.room.st.settings.speed ?? 1) : 0].filter((x) => x > this.clock.t);
    const w = Math.min(this.room.nextWake() ?? Infinity, ...own);
    this.clock.t = Math.max(this.clock.t + 50, Math.min(Number.isFinite(w) ? w : this.clock.t + 1000, this.clock.t + 60_000));
    this.room.tick();
    this.settle();
  }
  playUntil(done: () => boolean, maxSteps = 200_000) {
    for (let i = 0; i < maxSteps && !done(); i++) if (!this.phonesAct()) this.wait();
    assert.ok(done(), "condition reached");
  }
  get game() {
    return this.room.st.game!;
  }
}

function lobby(t: Table, humans: number, bots = 0) {
  const ps = Array.from({ length: humans }, (_, i) => phone(i));
  ps.forEach((p, i) => t.join(p, `P${i}`));
  for (const p of ps) t.send(p, { t: "team", op: "create" });
  for (let i = 0; i < bots; i++) t.send(ps[0], { t: "bot", op: "add", style: "balanced" });
  return ps;
}

test("four people play a whole unlimited game to the target", () => {
  const t = new Table();
  const ps = lobby(t, 4);
  assert.equal(t.view(ps[0]).you.host, true);
  t.send(ps[0], { t: "start" });
  assert.equal(t.view(ps[1]).phase, "playing");
  t.playUntil(() => t.game.s.over);
  assert.ok(["target", "last"].includes(t.game.s.reason));
  assert.equal(t.view(ps[2]).phase, "over");
  // Phones only ever made moves their view allowed: nothing they sent was refused.
  assert.deepEqual(t.refusals, []);
  const offers = t.seen.filter((f) => f.t === "offer").length;
  const deals = t.seen.filter((f) => f.t === "offer-done" && f.accepted).length;
  assert.ok(offers > 0, "phones offered trades");
  console.log(`trade offers ${offers}, accepted ${deals}, turns ${t.game.s.turns}`);
  assert.ok(t.seen.some((f) => f.t === "game" && f.e.t === "over"));
});

test("people and computer teams finish a 15-minute game on the clock", () => {
  const t = new Table({ mode: 15 });
  const ps = lobby(t, 2, 2);
  t.send(ps[0], { t: "start" });
  // Two cities dealt to each team.
  assert.equal(t.game.s.deeds.filter((d) => d && d.owner >= 0).length, 8);
  // (Here phones answer at once and nothing animates, so a minute holds far more turns than at a real
  // table: the clock is cut to what a table would play in it, about 40 turns.)
  assert.equal(t.game.endsAt, t.clock.t + 15 * 60_000 * 0.05);
  t.game.endsAt = t.clock.t + 5_000;
  t.playUntil(() => t.game.s.over);
  assert.equal(t.game.timeUp, true);
  assert.ok(["rounds", "last"].includes(t.game.s.reason));
  assert.ok(t.seen.some((f) => f.t === "timeup"));
});

test("a phone that drops for 60 seconds comes back to the same seat, and the computer covers meanwhile", () => {
  const t = new Table({}, 5);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const seat = t.view(ps[1]).you.seats[0];
  t.room.leave(ps[1].id);
  t.settle();
  const start = t.clock.t;
  // Everyone else keeps playing for a minute.
  t.phones = t.phones.filter((p) => p !== ps[1]);
  t.playUntil(() => t.clock.t - start >= 60_000 || t.game.s.over);
  assert.ok(t.seen.some((f) => f.t === "autoplay" && f.seat === seat && f.on), "computer covered the empty seat");
  // Same phone storage (id + key) reconnects.
  assert.ok(t.room.join(ps[1].id, ps[1].key));
  t.phones.push(ps[1]);
  t.settle();
  const v = t.view(ps[1]);
  assert.deepEqual(v.you.seats, [seat]);
  assert.equal(v.teams.find((x) => x.seat === seat)!.covered, false);
  // Someone else can't take over that identity.
  assert.equal(t.room.join(ps[1].id, "wrong-key-xxxx"), false);
});

test("two bids at the same moment: one wins, the other is told it was outbid", () => {
  const t = new Table({}, 9);
  const ps = lobby(t, 3);
  for (const p of ps) p.declineBuys = true;
  t.send(ps[0], { t: "start" });
  t.playUntil(() => t.game.s.pending?.k === "auction" && !!t.game.auction);
  const a = t.game.auction!;
  const [x, y] = ps.filter((p) => t.view(p).you.seats.length);
  const sx = t.view(x).you.seats[0];
  const sy = t.view(y).you.seats[0];
  t.room.handle(x.id, { t: "bid", aid: a.id, amount: 10, seat: sx });
  t.room.handle(y.id, { t: "bid", aid: a.id, amount: 10, seat: sy });
  t.settle();
  assert.equal(t.game.auction!.price, 10);
  assert.equal(t.game.auction!.leader, sx);
  assert.ok(y.toasts.includes("outbid"));
  // The countdown runs out and the leader pays their bid.
  const cash = t.game.s.ps[sx].cash;
  t.clock.t = t.game.auction!.endsAt;
  t.room.tick();
  t.settle();
  assert.equal(t.game.s.deeds[a.at]!.owner, sx);
  assert.equal(t.game.s.ps[sx].cash, cash - 10);
});

test("stale or out-of-turn moves are refused", () => {
  const t = new Table();
  const ps = lobby(t, 2);
  t.send(ps[0], { t: "start" });
  const v = t.view(ps[0]);
  const g = v.game!;
  const idle = ps.find((p) => !g.mustAct.includes(t.view(p).you.seats[0]))!;
  t.send(idle, { t: "act", d: g.decision, a: {} });
  assert.ok(idle.toasts.includes("notYourTurn"));
  const active = ps.find((p) => p !== idle)!;
  t.send(active, { t: "act", d: g.decision - 1, a: {} });
  assert.ok(active.toasts.includes("tooLate"));
});

test("a saved game resumes in a new room and plays to the end", () => {
  const t = new Table({ mode: 60 });
  const ps = lobby(t, 2, 1);
  t.send(ps[0], { t: "start" });
  t.playUntil(() => t.game.s.turns >= 12);
  t.room.handle(ps[0].id, { t: "save" });
  const out = t.settle();
  assert.ok(out.save);
  const file = JSON.parse(JSON.stringify(out.save!.file));
  const t2 = new Table();
  t2.room = Room.fromSave("5678", file, makeEnv(t2.clock, 3));
  for (const p of ps) t2.join(p, "again");
  const teams = t2.view(ps[0]).teams.filter((x) => !x.bot);
  t2.send(ps[0], { t: "team", op: "join", team: teams[0].id });
  t2.send(ps[1], { t: "team", op: "join", team: teams[1].id });
  assert.equal(t2.view(ps[0]).game!.paused, true);
  t2.send(ps[0], { t: "pause", on: false });
  assert.equal(t2.game.s.turns, t.game.s.turns);
  t2.playUntil(() => t2.game.s.over);
});

test("spectators bet on whether the player on turn pays rent", () => {
  const t = new Table({}, 4);
  const ps = lobby(t, 2);
  const fan = phone(9);
  t.join(fan, "Fan");
  t.send(ps[0], { t: "start" });
  let bets = 0;
  t.playUntil(() => {
    const v = t.view(fan);
    if (v.game?.bets?.open && v.game.bets.mine === null) {
      t.send(fan, { t: "bet", yes: true });
      bets += 1;
    }
    return bets >= 8 || t.game.s.over;
  });
  t.playUntil(() => t.seen.some((f) => f.t === "bets") || t.game.s.over);
  assert.ok(t.seen.some((f) => f.t === "bets"));
});

test("a computer team can't take a city from a team whose phones dropped: it sends an offer instead", () => {
  const t = new Table({}, 21);
  const ps = lobby(t, 2, 1);
  t.send(ps[0], { t: "start" });
  const g = t.game;
  const seatOf = (teamId: string) => g.seats.indexOf(teamId);
  const bot = seatOf(t.room.st.teams.find((x) => x.bot)!.id);
  const away = seatOf(t.room.st.members[ps[1].id].team!);
  // Cairo (1) belongs to the computer team, Cape Town (3) to the team that is about to drop.
  g.s.deeds[1]!.owner = bot;
  g.s.deeds[3]!.owner = away;
  t.room.leave(ps[1].id);
  t.phones = t.phones.filter((p) => p !== ps[1]);
  t.settle();
  t.playUntil(() => g.trades.some((x) => x.from === bot && x.to === away) || g.s.turns > 40);
  const offer = g.trades.find((x) => x.from === bot && x.to === away);
  assert.ok(offer, "the computer team made an offer");
  assert.deepEqual(offer!.get.deeds, [3]);
  assert.equal(g.s.deeds[3]!.owner, away, "Cape Town still belongs to the absent team");
});

// ---------- the waiting players' quiz (抢答) ----------
// (The question bank itself is checked in trivia.test.ts.)

const cityOf = (qid: string) => TRIVIA_BY_ID.get(qid)!.city;
/** The city a team stands on (null on any other space): the team on turn, unless a seat is given. */
const cityUnder = (g: Table["game"], seat = g.s.turn) => {
  const sp = E.BOARD[g.s.ps[seat].pos];
  return sp.k === "city" ? sp.id : null;
};
/** A test room for the quiz itself: every landing on a city brings a question, with no rest between two. */
const OFTEN = { triviaEvery: 0 };
/** The room's private parts the quiz tests reach for. */
type QuizRoom = { landedOn(city: string, firstVisit?: boolean): void; openTrivia(city: string): "asked" | "nobody" | "none" };
/**
 * The question on its way and the one that is up, read through a function: after an assertion on the
 * property itself, TypeScript would take it to stay as asserted through everything the room does next.
 */
const dueOf = (g: Table["game"]) => g.triviaDue ?? null;
const upIn = (g: Table["game"]) => g.trivia;

/**
 * Play on until a team lands on a city and a question is on its way, then let the move play on the
 * screens: the landing's question is up. (In a game just started, the team that landed is still on
 * turn: the scripted phones move only when asked to.)
 */
function nextQuestion(t: Table) {
  const g = t.game;
  t.playUntil(() => !!g.triviaDue);
  const due = g.triviaDue!;
  assert.equal(due.city, cityUnder(g, due.seat), "the question on its way is about the city its team landed on");
  t.clock.t = due.at;
  t.room.tick();
  t.settle();
  assert.ok(g.trivia, "the landing brought a question");
  return g.trivia!;
}

/**
 * A table whose game is under way with a question up (a test room where every landing on a city
 * brings one): the team that landed, still on turn; the others, the teams it's for; each one's seat.
 * With the quiz off, the game has only started: the first team hasn't thrown.
 */
function quizTable(settings: Partial<import("../src/room/protocol").Settings> = {}, seed = 5, humans = 3, bots = 0) {
  const t = new Table({ ...OFTEN, ...settings }, seed);
  const ps = lobby(t, humans, bots);
  t.send(ps[0], { t: "start" });
  if (settings.trivia !== false) nextQuestion(t);
  const seatOf = (p: Phone) => t.view(p).you.seats[0];
  const onTurn = ps.find((p) => seatOf(p) === t.game.s.turn)!;
  const others = ps.filter((p) => p !== onTurn);
  return { t, ps, seatOf, onTurn, others };
}

test("a landing on a city brings the waiting teams a question about that city, once its move has played on every screen", () => {
  // (the first throw, 5 + 6, lands on Istanbul)
  const t = new Table({ ...OFTEN, dice: [5, 6] }, 5);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const g = t.game;
  const seatOf = (p: Phone) => t.view(p).you.seats[0];
  const onTurn = ps.find((p) => seatOf(p) === g.s.turn)!;
  const other = ps.find((p) => p !== onTurn)!;
  assert.equal(upIn(g), null, "a new turn brings no question by itself");
  assert.equal(dueOf(g), null);
  const thrown = t.clock.t;
  t.send(onTurn, { t: "act", d: g.decision, a: {}, seat: g.s.turn });
  assert.equal(cityUnder(g), "istanbul");
  // (the team's first visit to Istanbul: the question waits for the move and the landing scene to play)
  assert.deepEqual(g.triviaDue, { city: "istanbul", seat: g.s.turn, at: thrown + TIMING.landing * 0.05 }, "the question waits for the move and the landing scene");
  assert.equal(upIn(g), null);
  assert.equal(t.view(other).game!.trivia, null, "nothing on a phone says where the token is going");
  assert.ok(t.room.nextWake()! <= g.triviaDue!.at, "the room wakes up for it");
  t.clock.t = g.triviaDue!.at - 1;
  t.room.tick();
  t.settle();
  assert.equal(upIn(g), null, "not a moment before");
  t.clock.t += 1;
  t.room.tick();
  t.settle();
  const tv = g.trivia!;
  assert.ok(tv, "the stamp is down: the question comes up");
  assert.equal(cityOf(tv.qid), "istanbul");
  assert.equal(dueOf(g), null);
  assert.equal(g.triviaAt, t.clock.t, "the quiz's rest before the next one starts here");
  assert.deepEqual(
    [...tv.eligible].sort(),
    ps
      .filter((p) => p !== onTurn)
      .map(seatOf)
      .sort(),
    "for the teams whose turn it isn't",
  );
  assert.equal(t.view(other).game!.trivia!.city, "istanbul");
  assert.equal(t.view(onTurn).game!.trivia!.answerFor, null);

  // A landing anywhere else brings none (1 + 3: the departure tax).
  const t2 = new Table({ ...OFTEN, dice: [1, 3] }, 5);
  const ps2 = lobby(t2, 3);
  t2.send(ps2[0], { t: "start" });
  const g2 = t2.game;
  t2.send(ps2.find((p) => t2.view(p).you.seats[0] === g2.s.turn)!, { t: "act", d: g2.decision, a: {}, seat: g2.s.turn });
  assert.equal(E.BOARD[g2.s.ps[g2.s.turn].pos].k, "tax");
  assert.equal(dueOf(g2), null);
  t2.clock.t += 60_000;
  t2.room.tick();
  assert.equal(upIn(g2), null);
});

test("the quiz rests eight minutes between two questions, and four from the start of a game to its first; a pause doesn't count", () => {
  // (a room at its real pace but for the tests' clock, a twentieth of the real one)
  const ms = (k: keyof typeof TIMING) => TIMING[k] * 0.05;
  assert.equal(TIMING.triviaEvery, 8 * 60_000);
  assert.equal(TIMING.triviaFirst, 4 * 60_000);
  const t = new Table({}, 5);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const g = t.game;
  /** The team on turn lands on this city (a city it has been to before: no landing scene to wait for). */
  const land = (city: string) => {
    g.s.ps[g.s.turn].pos = E.BOARD.findIndex((sp) => sp.k === "city" && sp.id === city);
    (t.room as unknown as QuizRoom).landedOn(city);
  };
  const start = t.clock.t;
  assert.equal(g.triviaAt, start);
  land("tokyo");
  assert.equal(dueOf(g), null, "too early: a landing in a game's first minutes brings none");
  t.clock.t = start + ms("triviaFirst") - 1;
  land("tokyo");
  assert.equal(dueOf(g), null, "still resting a moment before the four minutes are up");
  // A pause in between: its time is not the quiz's.
  t.send(ps[0], { t: "pause", on: true });
  t.clock.t += 5 * 60_000;
  t.send(ps[0], { t: "pause", on: false });
  land("tokyo");
  assert.equal(dueOf(g), null, "the pause didn't count");
  t.clock.t += 1;
  land("tokyo");
  assert.deepEqual(g.triviaDue, { city: "tokyo", seat: g.s.turn, at: t.clock.t + ms("triviaLand") }, "four minutes of play: this landing brings the game's first");
  // (another team's landing, say: the team in Tokyo stays where it is)
  (t.room as unknown as QuizRoom).landedOn("paris");
  assert.equal(g.triviaDue!.city, "tokyo", "one at a time: a landing while one is on its way changes nothing");
  // A pause before it comes up moves it on too.
  const due = g.triviaDue!.at;
  t.send(ps[0], { t: "pause", on: true });
  t.clock.t += 1000;
  t.room.tick();
  assert.equal(upIn(g), null, "nothing comes up in a pause");
  t.send(ps[0], { t: "pause", on: false });
  assert.equal(g.triviaDue!.at, due + 1000);
  t.clock.t = g.triviaDue!.at;
  t.room.tick();
  t.settle();
  const first = g.trivia!;
  assert.equal(cityOf(first.qid), "tokyo");
  const asked = t.clock.t;
  // The rest starts again from the question: nothing until eight more minutes have gone by.
  land("paris");
  assert.equal(dueOf(g), null, "not while a question is up");
  t.clock.t = first.endsAt;
  t.room.tick();
  t.clock.t = g.trivia!.revealUntil;
  t.room.tick();
  t.settle();
  assert.equal(upIn(g), null);
  t.clock.t = asked + ms("triviaFirst");
  land("paris");
  assert.equal(dueOf(g), null, "four minutes on: that was for the first, now it's eight");
  t.clock.t = asked + ms("triviaEvery") - 1;
  land("paris");
  assert.equal(dueOf(g), null, "resting still");
  t.clock.t += 1;
  land("paris");
  assert.equal(g.triviaDue?.city, "paris");
});

test("a team that moves on before its question is up takes the question with it; a second visit's question comes sooner", () => {
  /** A game where the first team throws 4 + 4 (Mexico City, and doubles: it throws again), then `next`. */
  const afterDoubles = (next: [number, number]) => {
    const t = new Table({ ...OFTEN, dice: [4, 4, ...next] }, 5);
    lobby(t, 3);
    t.send(t.phones[0], { t: "start" });
    const g = t.game;
    const seat = g.s.turn;
    const rolls = () => t.seen.filter((f) => f.t === "game" && f.e.t === "roll").length;
    const thrower = t.phones.find((p) => t.view(p).you.seats.includes(seat))!;
    const act = () => {
      const v = t.view(thrower).game!;
      const k = v.s.pending?.k;
      // (Mexico City has its visitor ban two faces of the dice: the fives and sixes, which this test doesn't throw)
      t.send(thrower, { t: "act", d: v.decision, a: k === "ban" ? { pair: 2 } : k === "buy" ? { yes: true } : {}, seat });
    };
    act();
    assert.equal(rolls(), 1);
    assert.equal(dueOf(g)?.city, "mexicocity");
    assert.equal(dueOf(g)?.seat, seat);
    // The team settles what Mexico City asks of it and throws again, before the question is up.
    for (let i = 0; i < 20 && rolls() < 2; i++) act();
    assert.equal(rolls(), 2);
    assert.equal(g.s.turn, seat, "still its turn");
    assert.equal(upIn(g), null);
    return { t, g, seat };
  };
  // 1 + 2 more: Istanbul. The question on its way is Istanbul's now.
  const a = afterDoubles([1, 2]);
  assert.equal(cityUnder(a.g), "istanbul");
  assert.deepEqual(dueOf(a.g), { city: "istanbul", seat: a.seat, at: a.t.clock.t + TIMING.landing * 0.05 });
  // 1 + 3 more: the currency exchange, not a city. No question is on its way any more.
  const b = afterDoubles([1, 3]);
  assert.equal(cityUnder(b.g), null);
  assert.equal(dueOf(b.g), null, "Mexico City's question went with the team");
  b.t.clock.t += 60_000;
  b.t.room.tick();
  assert.equal(upIn(b.g), null);

  // A city the team has been to before has no landing scene to wait for: its question comes once the move has played.
  const { t } = quizTable({ trivia: false }, 5);
  t.room.st.settings.trivia = true;
  (t.room as unknown as QuizRoom).landedOn("paris");
  assert.equal(dueOf(t.game)!.at, t.clock.t + TIMING.triviaLand * 0.05);
  assert.ok(TIMING.triviaLand < TIMING.landing);
  // (the longest move, from the press on the dice to the stamp and the question's return: tests/ride-oracle.test.ts)
  assert.ok(TIMING.triviaLand >= 4200, "never before the token is down");
});

test("waiting teams race to answer: a wrong answer locks you out, the first right one wins", () => {
  const { t, seatOf, onTurn, others } = quizTable({}, 5);
  const g = t.game;
  const tv = g.trivia!;
  const [slow, quick] = others;
  const shown = t.view(slow).game!.trivia!;
  assert.equal(shown.city, cityOf(tv.qid));
  assert.equal(shown.city, cityUnder(g), "about the city the team on turn has just landed on");
  assert.equal(shown.key, tv.qid, "phones get the question's id, to remember it");
  assert.equal(shown.answerFor, seatOf(slow));
  assert.equal(t.view(onTurn).game!.trivia!.answerFor, null, "the team on turn doesn't answer");
  assert.equal(shown.correct, null, "phones never hold the answer while the question is open");
  assert.equal(shown.fact, null);
  const right = tv.order.indexOf(0);
  const wrong = (right + 1) % 3;
  const decision = g.decision;
  const cash = g.s.ps.map((p) => p.cash);

  t.send(onTurn, { t: "trivia", id: tv.id, choice: right });
  assert.deepEqual(g.trivia!.answers, {}, "the team on turn can't answer");
  t.send(slow, { t: "trivia", id: tv.id, choice: wrong });
  assert.equal(g.trivia!.closed, false);
  assert.deepEqual(t.view(quick).game!.trivia!.answered, [seatOf(slow)]);
  assert.equal(t.view(slow).game!.trivia!.answerFor, null);
  t.send(slow, { t: "trivia", id: tv.id, choice: right });
  assert.equal(g.trivia!.winner, null, "a wrong answer locks the team out");
  t.send(quick, { t: "trivia", id: tv.id, choice: right });

  assert.equal(g.trivia!.winner, seatOf(quick));
  assert.equal(g.s.ps[seatOf(quick)].cash, cash[seatOf(quick)] + TRIVIA_PRIZE);
  assert.equal(g.s.ps[seatOf(slow)].cash, cash[seatOf(slow)] - TRIVIA_WRONG, "a wrong answer costs a little");
  assert.ok(t.seen.some((f) => f.t === "game" && f.e.t === "fine" && f.e.p === seatOf(slow) && f.e.amount === TRIVIA_WRONG), "the charge is in the feed");
  assert.equal(g.decision, decision, "the quiz doesn't make the decision on the table stale");
  assert.ok(t.seen.some((f) => f.t === "game" && f.e.t === "bonus" && f.e.p === seatOf(quick)));
  const after = t.view(onTurn).game!.trivia!;
  assert.equal(after.open, false);
  assert.equal(after.correct, right);
  assert.ok(after.fact?.zh && after.source?.startsWith("https://"), "the reveal shows the fact and its source");
  assert.deepEqual(after.fact, TRIVIA_BY_ID.get(tv.qid)!.fact, "the question's own fact");
  assert.equal(after.source, TRIVIA_BY_ID.get(tv.qid)!.source);
  t.send(quick, { t: "trivia", id: tv.id, choice: right });
  assert.equal(g.s.ps[seatOf(quick)].cash, cash[seatOf(quick)] + TRIVIA_PRIZE, "one prize per question");

  t.clock.t = g.trivia!.revealUntil;
  t.room.tick();
  t.settle();
  assert.equal(upIn(g), null, "the answer has been up long enough: it goes");
  assert.deepEqual(t.refusals, []);
});

test("nobody right: the question times out and shows the answer; a later landing brings another", () => {
  const { t, ps } = quizTable({}, 8, 2);
  const g = t.game;
  const first = g.trivia!;
  t.clock.t = first.endsAt;
  t.room.tick();
  t.settle();
  assert.equal(g.trivia!.closed, true);
  assert.equal(g.trivia!.winner, null);
  const shown = t.view(ps[1]).game!.trivia!;
  assert.equal(shown.correct, first.order.indexOf(0), "the answer is shown when time runs out");
  t.clock.t = g.trivia!.revealUntil;
  t.room.tick();
  t.settle();
  assert.equal(upIn(g), null);
  const second = nextQuestion(t);
  assert.notEqual(second.id, first.id);
  assert.notEqual(second.qid, first.qid);
});

test("never the same question twice in one game, each about the city just landed on; a city with none left brings none", () => {
  const t = new Table({ ...OFTEN, testRounds: 60 }, 9);
  lobby(t, 1, 3);
  t.send(t.phones[0], { t: "start" });
  const g = t.game;
  const asked: number[] = [];
  const ids: string[] = [];
  let onItsWay: string | null = null;
  let noted: unknown = null;
  const note = () => {
    if (g.triviaDue && g.triviaDue !== noted) {
      noted = g.triviaDue;
      assert.equal(g.triviaDue.seat, g.s.turn);
      assert.equal(g.triviaDue.city, cityUnder(g), "a question on its way is about the city the team on turn has just landed on");
    }
    if (g.triviaDue) onItsWay = g.triviaDue.city;
    const tv = g.trivia;
    if (tv && asked.at(-1) !== tv.id) {
      asked.push(tv.id);
      ids.push(tv.qid);
      assert.equal(cityOf(tv.qid), onItsWay, "the question that comes up is the landing's");
    }
  };
  // (one person and three computer teams: a landing brings a question when the person is one of the
  // teams waiting and none is up, a good ten times in a long game)
  t.playUntil(() => (note(), ids.length >= 10 || g.s.over));
  assert.ok(ids.length >= 10, `only ${ids.length} questions in a long game`);
  assert.equal(new Set(ids).size, ids.length, "no question twice");
  assert.deepEqual(g.triviaAsked, ids);

  // The same game later on, with one of Tokyo's questions left to ask: that one, then none about Tokyo.
  t.playUntil(() => (!g.trivia && !g.triviaDue) || g.s.over);
  assert.equal(g.s.over, false);
  const room = t.room as unknown as QuizRoom;
  const tokyo = TRIVIA.filter((q) => q.city === "tokyo").map((q) => q.id);
  const last = tokyo.find((id) => !g.triviaAsked.includes(id)) ?? tokyo[3];
  g.triviaAsked = [...g.triviaAsked.filter((id) => id !== last), ...tokyo.filter((id) => id !== last && !g.triviaAsked.includes(id))];
  const human = t.view(t.phones[0]).you.seats[0];
  // (the person's team has to be one of the waiting teams: it's for them)
  t.playUntil(() => (g.s.turn !== human && !g.trivia && !g.triviaDue) || g.s.over);
  assert.equal(g.s.over, false);
  room.openTrivia("tokyo");
  assert.equal(upIn(g)?.qid, last, "the one left");
  g.trivia = null;
  const before = [...g.triviaAsked];
  room.openTrivia("tokyo");
  assert.equal(upIn(g), null, "none left about Tokyo: landing there brings none");
  assert.deepEqual(g.triviaAsked, before);
  room.openTrivia("paris");
  const paris = upIn(g);
  assert.ok(paris === null || cityOf(paris.qid) === "paris", "other cities still have theirs");
});

/** The team on turn settles what its landing asks (it buys what's for sale) and ends its turn. */
function endTurn(t: Table, p: Phone) {
  const g = t.game;
  const seat = g.s.turn;
  for (let i = 0; i < 20 && g.s.turn === seat; i++) {
    const v = t.view(p).game!;
    t.send(p, { t: "act", d: v.decision, a: v.s.pending?.k === "buy" ? { yes: true } : {}, seat });
  }
  assert.notEqual(g.s.turn, seat, "the turn is over");
}

test("nobody there to answer yet: the question waits for the turn to pass, so a person playing the computer is asked about the city they've just been to", () => {
  // One person and two computer teams. The person throws first: 5 + 6, Istanbul.
  const alone = () => {
    const t = new Table({ ...OFTEN, inOrder: true, dice: [5, 6] }, 6);
    const ps = lobby(t, 1, 2);
    t.send(ps[0], { t: "start" });
    const g = t.game;
    const me = t.view(ps[0]).you.seats[0];
    assert.equal(g.s.turn, me);
    t.send(ps[0], { t: "act", d: g.decision, a: {}, seat: me });
    const due = { ...dueOf(g)! };
    assert.equal(due.city, "istanbul");
    return { t, g, me, p: ps[0], due };
  };
  const { t, g, me, p, due } = alone();
  // Its time comes with the person still on their turn: only the computer teams are waiting.
  t.clock.t = due.at;
  t.room.tick();
  t.settle();
  assert.equal(upIn(g), null, "no question for the computer teams alone");
  assert.deepEqual(dueOf(g), due, "it waits");
  assert.deepEqual(g.triviaAsked, [], "no question was used up");
  assert.ok(t.room.nextWake()! > t.clock.t, "the room has nothing to wake up for until something moves");
  t.clock.t += 1000;
  t.room.tick();
  assert.equal(upIn(g), null);
  // The person buys Istanbul and ends the turn: now they are one of the teams waiting, and it comes up.
  endTurn(t, p);
  assert.equal(cityOf(upIn(g)!.qid), "istanbul");
  assert.equal(dueOf(g), null);
  assert.equal(g.triviaAt, t.clock.t);
  const shown = t.view(p).game!.trivia!;
  assert.equal(shown.answerFor, me, "the person answers, about the city they've just been to");
  assert.equal(shown.forYou, true);

  // A person who takes minutes over the turn is still standing in Istanbul when it ends: the question comes then.
  const slow = alone();
  slow.t.clock.t = slow.due.at + 5 * 60_000;
  endTurn(slow.t, slow.p);
  assert.equal(cityOf(upIn(slow.g)!.qid), "istanbul");
  // A team that isn't on that city any more (sent on by another team's landing, say) takes its question away.
  const moved = alone();
  moved.t.clock.t = moved.due.at;
  moved.g.s.ps[moved.me].pos = 12;
  endTurn(moved.t, moved.p);
  assert.equal(upIn(moved.g), null);
  assert.equal(dueOf(moved.g), null);
  assert.equal(moved.g.triviaAt, moved.g.startedAt, "the quiz isn't resting: the next landing can bring one");

  // A question that is waiting gives way to a newer landing (one still on its way doesn't: first come).
  const newer = alone();
  const room = newer.t.room as unknown as QuizRoom;
  room.landedOn("paris");
  assert.equal(dueOf(newer.g)!.city, "istanbul", "Istanbul's is still on its way");
  newer.t.clock.t = newer.due.at;
  newer.t.room.tick();
  room.landedOn("paris");
  assert.equal(dueOf(newer.g)!.city, "paris", "Istanbul's was waiting: the newer landing's takes its place");

  // People whose phones have all gone are nobody to ask either: it waits for them too.
  const gone = new Table({ ...OFTEN, inOrder: true, dice: [5, 6] }, 6);
  const [a, b] = lobby(gone, 2);
  gone.send(a, { t: "start" });
  gone.send(a, { t: "act", d: gone.game.decision, a: {}, seat: gone.game.s.turn });
  gone.room.leave(b.id);
  gone.clock.t = dueOf(gone.game)!.at;
  gone.room.tick();
  gone.settle();
  assert.equal(upIn(gone.game), null, "the other team's phone is away");
  assert.ok(dueOf(gone.game));
});

test("the one-phone demo: the question waits for the move of the team that landed to be over, then the phone answers for the teams waiting", () => {
  // Two teams of people at one phone (the first throw, 5 + 6: Istanbul). The phone is busy with that team's move.
  const t = new Table({ hotseat: true, ...OFTEN, dice: [5, 6] }, 3);
  const dp = phone(1);
  t.join(dp, "Me");
  t.send(dp, { t: "team", op: "create" });
  t.send(dp, { t: "team", op: "create" });
  t.send(dp, { t: "start" });
  const g = t.game;
  const lander = g.s.turn;
  t.send(dp, { t: "act", d: g.decision, a: {}, seat: lander });
  const due = dueOf(g)!;
  assert.equal(due.city, "istanbul");
  t.clock.t = due.at;
  t.room.tick();
  t.settle();
  assert.equal(upIn(g), null, "not over the play window of the team that is still on its move");
  assert.ok(dueOf(g));
  endTurn(t, dp);
  const shown = t.view(dp).game!.trivia!;
  assert.equal(shown.city, "istanbul");
  assert.equal(shown.forYou, true);
  assert.equal(shown.answerFor, lander, "the other team is on turn now: the phone answers for the team that has just been there");

  // A person alone with a computer team at that phone: asked about their own landing once their turn is over…
  const solo = new Table({ hotseat: true, ...OFTEN, inOrder: true, dice: [5, 6] }, 3);
  const sp = phone(2);
  solo.join(sp, "Me");
  solo.send(sp, { t: "team", op: "create" });
  solo.send(sp, { t: "bot", op: "add", style: "balanced" });
  solo.send(sp, { t: "start" });
  const sg = solo.game;
  const me = solo.view(sp).you.seats[0];
  assert.equal(sg.s.turn, me);
  solo.send(sp, { t: "act", d: sg.decision, a: {}, seat: me });
  solo.clock.t = dueOf(sg)!.at;
  solo.room.tick();
  assert.equal(upIn(sg), null);
  endTurn(solo, sp);
  assert.equal(solo.view(sp).game!.trivia?.answerFor, me);
  assert.equal(solo.view(sp).game!.trivia?.city, "istanbul");
  // …and about the computer team's landing while they wait, when that is what comes next.
  const room = solo.room as unknown as QuizRoom;
  solo.playUntil(() => sg.s.turn !== me && !sg.trivia && !sg.triviaDue);
  assert.equal(room.openTrivia("tokyo"), "asked");
  assert.equal(solo.view(sp).game!.trivia?.answerFor, me);

  // Three teams of people at the phone, and a question waiting (the first team is standing in Istanbul).
  // It doesn't come up in the middle of another team's move either: only between two turns.
  const three = new Table({ hotseat: true, ...OFTEN, inOrder: true, dice: [5, 6, 1, 3] }, 3);
  const tp = phone(3);
  three.join(tp, "Me");
  for (let i = 0; i < 3; i++) three.send(tp, { t: "team", op: "create" });
  three.send(tp, { t: "start" });
  const tg = three.game;
  three.send(tp, { t: "act", d: tg.decision, a: {}, seat: 0 });
  const waiting = { ...dueOf(tg)! };
  endTurn(three, tp);
  // (its time hasn't come yet: the clock stood still while the first team finished its turn)
  assert.equal(upIn(tg), null);
  assert.equal(tg.s.turn, 1);
  // The second team throws (1 + 3: the departure tax). The question's time comes while it is on its move.
  three.send(tp, { t: "act", d: tg.decision, a: {}, seat: 1 });
  three.clock.t = waiting.at;
  three.room.tick();
  three.settle();
  assert.equal(upIn(tg), null, "not over the second team's move");
  assert.equal(dueOf(tg)?.city, "istanbul", "the first team still stands there: its question waits");
  endTurn(three, tp);
  assert.equal(tg.s.turn, 2);
  const between = three.view(tp).game!.trivia!;
  assert.equal(between.city, "istanbul", "between two turns, before the third team throws");
  assert.ok([0, 1].includes(between.answerFor!), "the phone answers for a team that's waiting");
});

test("a big screen prints the fact behind a city's rule on its arrival card: the landing's question isn't that one", () => {
  const { t } = quizTable({}, 5);
  const g = t.game;
  const room = t.room as unknown as QuizRoom;
  const others = TRIVIA.filter((q) => q.city === "bangkok" && q.id !== "bangkok-01").map((q) => q.id);
  // No big screen: phones don't show that fact on a landing, so it can be asked.
  g.trivia = null;
  g.triviaAsked = [...others];
  room.openTrivia("bangkok");
  assert.equal(upIn(g)?.qid, "bangkok-01");
  // A big screen on: with the others asked, none.
  assert.ok(t.room.join("member-9-xxxxxxxx", "key-9-secret-xxxx", { role: "screen" }));
  g.trivia = null;
  g.triviaAsked = [...others];
  room.openTrivia("bangkok");
  assert.equal(upIn(g), null);
  // …and with all of them to choose from, never that one.
  for (let i = 0; i < 30; i++) {
    g.trivia = null;
    g.triviaAsked = [];
    room.openTrivia("bangkok");
    assert.notEqual(upIn(g)!.qid, "bangkok-01");
  }
});

test("computer teams answer the quiz, but the computer covering for absent people doesn't", () => {
  const t = new Table({ ...OFTEN }, 6);
  const ps = lobby(t, 2, 2);
  t.send(ps[0], { t: "start" });
  const away = t.game.seats.indexOf(t.room.st.members[ps[1].id].team!);
  t.room.leave(ps[1].id);
  t.phones = t.phones.filter((p) => p !== ps[1]);
  t.settle();
  const bonuses = () => t.seen.filter((f) => f.t === "game" && f.e.t === "bonus");
  t.playUntil(() => bonuses().length >= 4 || t.game.s.over);
  assert.ok(bonuses().length >= 4, "computer teams win questions");
  assert.ok(
    bonuses().every((f) => f.t === "game" && f.e.t === "bonus" && f.e.p !== away),
    "a team whose phones dropped doesn't win money it didn't answer for",
  );
});

test("pausing holds the quiz clock, and a saved game comes back without a stale question", () => {
  const { t, ps } = quizTable({}, 7);
  const tv = t.game.trivia!;
  const left = tv.endsAt - t.clock.t;
  t.send(ps[0], { t: "pause", on: true });
  t.clock.t += 60_000;
  t.room.tick();
  t.settle();
  assert.equal(t.game.trivia!.closed, false);
  t.send(ps[0], { t: "pause", on: false });
  assert.equal(t.game.trivia!.endsAt - t.clock.t, left);

  t.room.handle(ps[0].id, { t: "save" });
  const file = JSON.parse(JSON.stringify(t.settle().save!.file));
  assert.ok(file.game.trivia, "the save was made with a question up");
  assert.deepEqual(file.game.triviaAsked, [tv.qid], "the save knows what was asked");
  // Saves from before the quiz have none of its fields.
  delete file.game.triviaAsked;
  delete file.game.triviaTurn;
  delete file.game.triviaAt;
  delete file.game.triviaDue;
  const t2 = new Table();
  t2.room = Room.fromSave("5678", file, makeEnv(t2.clock, 3));
  assert.equal(t2.game.trivia, null);
  assert.deepEqual(t2.game.triviaAsked, []);
  assert.equal(t2.game.triviaDue, null);
  assert.equal(t2.game.triviaAt, t2.clock.t, "the quiz's rest starts afresh in the new room");
  for (const p of ps) t2.join(p, "again");
  const teams = t2.view(ps[0]).teams.filter((x) => !x.bot);
  ps.forEach((p, i) => t2.send(p, { t: "team", op: "join", team: teams[i].id }));
  t2.send(ps[0], { t: "pause", on: false });
  // (the save kept the test room's settings: the next landing on a city brings a question)
  t2.playUntil(() => t2.game.s.turns >= t.game.s.turns + 3);
  nextQuestion(t2);
});

test("rooms and saves from before question ids: what was asked carries over, a question up is dropped", () => {
  const { t, ps } = quizTable({}, 7, 2);
  t.room.handle(ps[0].id, { t: "save" });
  const file = JSON.parse(JSON.stringify(t.settle().save!.file));
  assert.ok(file.game.trivia, "a question is up");
  // How a save looked then: questions counted by their place in the list of 22.
  delete file.game.triviaAsked;
  file.game.triviaUsed = [0, 11, 21];
  file.game.trivia = { ...file.game.trivia, q: 11, qid: undefined };
  const t2 = new Table();
  t2.room = Room.fromSave("5678", file, makeEnv(t2.clock, 3));
  assert.deepEqual(t2.game.triviaAsked, ["cairo-01", "tokyo-01", "hongkong-01"]);
  // A room that was running then (a server restart reads it back as it was).
  const st = JSON.parse(JSON.stringify(t.room.st));
  delete st.game.triviaAsked;
  st.game.triviaUsed = [3];
  st.game.trivia = { ...st.game.trivia, q: 3, qid: undefined };
  // (and from before questions came with landings: no time of the last one, none on its way)
  delete st.game.triviaAt;
  delete st.game.triviaDue;
  const back = new Room(st, makeEnv(t.clock, 4));
  assert.equal(back.st.game!.trivia, null, "a question from the old list isn't shown");
  assert.deepEqual(back.st.game!.triviaAsked, ["mexicocity-01"]);
  assert.equal("triviaUsed" in back.st.game!, false);
  // Such a room counts the quiz's rest from the game's start.
  const room = back as unknown as QuizRoom;
  back.st.settings.triviaEvery = 1000;
  back.st.game!.startedAt = t.clock.t - 999;
  room.landedOn("tokyo");
  assert.equal(back.st.game!.triviaDue ?? null, null);
  back.st.game!.startedAt = t.clock.t - 1000;
  room.landedOn("tokyo");
  assert.equal(back.st.game!.triviaDue?.city, "tokyo");
});

/**
 * The bug Steve saw ("sometimes the quiz can't be answered"): a question was up, for the other teams,
 * when a team's turn ended a few seconds later, and on its phone the question sat there with three
 * answers that did nothing when tapped (and a line saying the first right answer wins). Now a team
 * joins in once its turn is over: the team whose landing brought the question, most often.
 */
test("the team on turn when a question comes up can answer it once its turn is over", () => {
  // (a throw of 5 + 6 lands on Istanbul, for sale: its question comes up; buy it, end the turn)
  const { t, seatOf, onTurn, others } = quizTable({ dice: [5, 6] }, 5);
  const g = t.game;
  const tv = g.trivia!;
  assert.equal(cityOf(tv.qid), "istanbul");
  const first = seatOf(onTurn);
  assert.equal(t.view(onTurn).game!.trivia!.answerFor, null, "not during its own turn");
  const turns = g.s.turns;
  for (let i = 0; i < 20 && g.s.turns === turns; i++) {
    const v = t.view(onTurn).game!;
    if (!v.mustAct.includes(first)) break;
    const a = v.s.pending?.k === "buy" ? { yes: true } : {};
    t.send(onTurn, { t: "act", d: v.decision, a, seat: first });
  }
  assert.notEqual(g.s.turn, first, "its turn is over");
  assert.equal(g.trivia?.id, tv.id, "the same question is still up");
  assert.equal(g.trivia!.closed, false);
  const shown = t.view(onTurn).game!.trivia!;
  assert.equal(shown.answerFor, first, "now it can answer");
  assert.equal(shown.forYou, true);
  // The team now on turn was asked before its turn: it keeps its chance.
  const next = others.find((p) => seatOf(p) === g.s.turn)!;
  assert.equal(t.view(next).game!.trivia!.answerFor, seatOf(next), "a team asked before its turn keeps its chance");
  const right = tv.order.indexOf(0);
  const cash = g.s.ps[first].cash;
  t.send(onTurn, { t: "trivia", id: tv.id, choice: right, seat: first });
  assert.equal(g.trivia!.winner, first, "its answer counts");
  assert.equal(g.s.ps[first].cash, cash + TRIVIA_PRIZE);
});

test("a team on turn whose turn ends with the question nearly over doesn't get it for a moment", () => {
  const { t, seatOf, onTurn } = quizTable({ dice: [5, 6] }, 5);
  const g = t.game;
  const first = seatOf(onTurn);
  // Less than the time to read and answer is left when its turn ends.
  t.clock.t = g.trivia!.endsAt - TIMING.triviaJoin * 0.05 + 1;
  for (let i = 0; i < 20 && g.s.turn === first; i++) {
    const v = t.view(onTurn).game!;
    t.send(onTurn, { t: "act", d: v.decision, a: v.s.pending?.k === "buy" ? { yes: true } : {}, seat: first });
  }
  assert.notEqual(g.s.turn, first);
  assert.equal(t.view(onTurn).game!.trivia!.answerFor, null);
  assert.equal(t.view(onTurn).game!.trivia!.forYou, false, "and no answer pops up for it afterwards");
});

test("这题不答 (skip): no charge, the question goes from that phone, and it closes once every team is done", () => {
  const { t, seatOf, others } = quizTable({}, 5);
  const g = t.game;
  const tv = g.trivia!;
  const [x, y] = others;
  const cash = g.s.ps.map((p) => p.cash);
  t.send(x, { t: "trivia-skip", id: tv.id });
  const vx = t.view(x).game!.trivia!;
  assert.equal(vx.skipped, true);
  assert.equal(vx.answerFor, null, "nothing to answer on that phone any more");
  assert.deepEqual(
    g.s.ps.map((p) => p.cash),
    cash,
    "no charge",
  );
  assert.equal(g.trivia!.closed, false, "the other team can still answer");
  assert.equal(t.view(y).game!.trivia!.skipped, false, "another phone's skip is its own");
  const right = tv.order.indexOf(0);
  t.send(x, { t: "trivia", id: tv.id, choice: right });
  assert.equal(g.trivia!.winner, null, "a phone that skipped can't answer after all");
  t.send(x, { t: "trivia-skip", id: tv.id });
  assert.equal(g.trivia!.skipped.length, 1, "a second skip changes nothing");
  t.send(y, { t: "trivia", id: tv.id, choice: (right + 1) % 3 });
  assert.equal(g.trivia!.closed, true, "every team has answered or skipped: the answer comes out");
  assert.equal(t.view(x).game!.trivia!.forYou, true, "the skip is remembered after it closes");
  assert.equal(t.view(x).game!.trivia!.skipped, true);
  assert.ok(!t.seen.some((f) => f.t === "game" && f.e.t === "fine" && f.e.p === seatOf(x)));
  // A skip for a question that's gone, or from the team on turn, does nothing.
  t.send(x, { t: "trivia-skip", id: 999_999 });
  assert.deepEqual(t.refusals, []);
});

test("这题不答 on one phone of a team of two: the other phone can still answer for the team", () => {
  // (a seed where the pair's team isn't the one whose landing brings the question, so it's for the pair)
  for (let seed = 1; seed < 50; seed++) {
    const t = new Table({ ...OFTEN }, seed);
    const ps = lobby(t, 2);
    const mate = phone(7);
    t.join(mate, "Mate");
    t.send(mate, { t: "team", op: "join", team: t.view(ps[1]).you.team! });
    t.send(ps[0], { t: "start" });
    const g = t.game;
    const pair = t.view(ps[1]).you.seats[0];
    const tv = nextQuestion(t);
    if (pair === g.s.turn) continue;
    t.send(ps[1], { t: "trivia-skip", id: tv.id });
    assert.equal(g.trivia!.closed, false, "one of the two phones skipped: the team is still in");
    assert.equal(t.view(mate).game!.trivia!.answerFor, pair, "the other phone answers for the team");
    t.send(mate, { t: "trivia-skip", id: tv.id });
    assert.equal(g.trivia!.closed, true, "both phones skipped: the only team asked is done");
    return;
  }
  assert.fail("no seed put the pair off turn");
});

test("phones send the questions they've seen; the room asks the ones they haven't first", () => {
  // (the first throw, 5 + 6, lands on Istanbul: of its questions, the phones have seen all but two)
  const t = new Table({ ...OFTEN, dice: [5, 6] }, 9);
  const ps = lobby(t, 2);
  const fresh = ["istanbul-03", "istanbul-07"];
  const seen = TRIVIA.map((q) => q.id).filter((id) => !fresh.includes(id));
  for (const p of ps) t.send(p, { t: "seen", ids: seen });
  t.send(ps[0], { t: "start" });
  const tv = nextQuestion(t);
  assert.ok(fresh.includes(tv.qid), `asked ${tv.qid}, which they've seen`);
  // The room remembers what it asked, for the next game in this room.
  assert.ok(t.room.st.members[ps[0].id].seen!.includes(tv.qid));
  // Anything that isn't a list of question ids is left out; a phone keeps only its newest ids.
  t.send(ps[1], { t: "seen", ids: ["<b>", 42, "tokyo-01", "tokyo-01", "x".repeat(300)] as unknown as string[] });
  assert.deepEqual(t.room.st.members[ps[1].id].seen, ["tokyo-01"]);
  t.send(ps[1], { t: "seen", ids: Array.from({ length: SEEN_KEEP + 50 }, (_, i) => `cairo-${String(i).padStart(3, "0")}`) });
  assert.equal(t.room.st.members[ps[1].id].seen!.length, SEEN_KEEP);
  assert.equal(t.room.st.members[ps[1].id].seen!.at(-1), `cairo-${SEEN_KEEP + 49}`, "the newest are kept");
  t.send(ps[1], { t: "seen", ids: "nope" as unknown as string[] });
  assert.equal(t.room.st.members[ps[1].id].seen!.length, SEEN_KEEP, "nonsense changes nothing");
});

test("the host can turn the quiz off for the whole game in the lobby; it's on unless they do", () => {
  const t = new Table({ ...OFTEN }, 4);
  const ps = lobby(t, 2, 1);
  assert.equal(t.view(ps[1]).settings.trivia, true, "on by default");
  t.send(ps[1], { t: "settings", trivia: false });
  assert.equal(ps[1].toasts.at(-1), "hostOnly");
  assert.equal(t.view(ps[0]).settings.trivia, true);
  t.send(ps[0], { t: "settings", trivia: false });
  assert.equal(t.view(ps[1]).settings.trivia, false);
  t.send(ps[0], { t: "start" });
  t.send(ps[0], { t: "settings", trivia: true });
  assert.equal(t.view(ps[1]).settings.trivia, false, "not mid-game");
  let onItsWay = 0;
  t.playUntil(() => {
    if (t.game.triviaDue) onItsWay += 1;
    return t.game.s.turns >= 15 || t.game.s.over;
  });
  assert.equal(onItsWay, 0, "no landing brings a question");
  assert.equal(t.game.trivia, null);
  assert.deepEqual(t.game.triviaAsked, []);
  assert.ok(!t.seen.some((f) => f.t === "game" && (f.e.t === "bonus" || f.e.t === "fine")), "no quiz money either way");
  // Rooms and saves from before the switch had the quiz.
  const old = Room.create("4321", makeEnv(new Clock()));
  delete old.st.settings.trivia;
  assert.equal(old.view("x").settings.trivia, true);
});

test("a phone that joins without a name is called Player 1 in English, 玩家1 in Chinese", () => {
  const room = Room.create("1234", makeEnv(new Clock()));
  assert.ok(room.join("member-1-xxxxxxxx", "key-1-secret-xxxx", { lang: "en" }));
  assert.ok(room.join("member-2-xxxxxxxx", "key-2-secret-xxxx", { lang: "zh" }));
  assert.ok(room.join("member-3-xxxxxxxx", "key-3-secret-xxxx", { name: "  ", lang: "en" }));
  assert.ok(room.join("member-4-xxxxxxxx", "key-4-secret-xxxx", { role: "screen", lang: "en" }));
  assert.ok(room.join("member-5-xxxxxxxx", "key-5-secret-xxxx", { name: "Mia", lang: "en" }));
  const names = room.view("member-1-xxxxxxxx").members.map((m) => m.name);
  assert.deepEqual(names, ["Player 1", "玩家2", "Player 3", "Big screen", "Mia"]);
  // Their teams take the name too.
  room.handle("member-1-xxxxxxxx", { t: "team", op: "create" });
  assert.equal(room.view("member-1-xxxxxxxx").teams[0].name, "Player 1");
});

// ---------- the turn clock ----------

/** A table of two people (no computer teams): the team on turn, the other, and the room's speed. */
function clockTable(settings: Partial<import("../src/room/protocol").Settings> = {}, seed = 5) {
  const { t, ps, seatOf, onTurn, others } = quizTable({ trivia: false, ...settings }, seed, 2);
  const ms = (k: keyof typeof TIMING) => TIMING[k] * (settings.speed ?? 0.05);
  return { t, ps, seatOf, idler: onTurn, other: others[0], ms };
}

test("turn clock: 60 s of nothing, then everyone sees 15 s, then the computer makes that one move", () => {
  const { t, seatOf, idler, other, ms } = clockTable();
  const g = t.game;
  const seat = seatOf(idler);
  const start = t.clock.t;
  const clock = t.view(other).game!.turnClock!;
  assert.deepEqual(clock, { seat, warnAt: start + ms("idle"), at: start + ms("idle") + ms("idleWarn") }, "every phone knows when");
  assert.deepEqual(t.view(idler).game!.turnClock, clock);
  assert.ok(t.room.nextWake()! <= clock.at, "the room wakes up for it");
  const decision = g.decision;
  t.clock.t = clock.at - 1;
  t.room.tick();
  t.settle();
  assert.equal(g.decision, decision, "nothing before the countdown is over");
  t.clock.t = clock.at;
  t.room.tick();
  t.settle();
  assert.notEqual(g.decision, decision, "the computer made the move");
  assert.ok(t.seen.some((f) => f.t === "idle" && f.seat === seat), "the log says so");
  assert.ok(t.seen.some((f) => f.t === "game" && f.e.t === "roll" && f.e.p === seat), "it threw the dice for them");
  const team = t.view(other).teams.find((x) => x.seat === seat)!;
  assert.equal(team.autoplay, false, "the team isn't handed to the computer");
  assert.equal(team.covered, false);
  // Their next decision gets a whole new clock, which waits for the ride and the landing first.
  const next = t.view(other).game!.turnClock;
  if (next && next.seat === seat) assert.equal(next.warnAt, t.clock.t + ms("landing") + ms("idle"));
  // And the team plays its next move itself.
  const v = t.view(idler).game!;
  if (v.mustAct.includes(seat)) {
    const before = t.seen.filter((f) => f.t === "idle").length;
    t.send(idler, { t: "act", d: v.decision, a: v.s.pending?.k === "buy" ? { yes: false } : {}, seat });
    assert.equal(t.seen.filter((f) => f.t === "idle").length, before);
  }
});

test("turn clock: a throw's ride and landing come first, and anything the team does starts it again", () => {
  const { t, seatOf, idler, other, ms } = clockTable({ dice: [5, 6] });
  const g = t.game;
  const seat = seatOf(idler);
  // The team throws (5 + 6: Istanbul, for sale) and is asked to buy.
  t.send(idler, { t: "act", d: g.decision, a: {}, seat });
  assert.equal(g.s.pending?.k, "buy");
  const thrown = t.clock.t;
  assert.equal(t.view(other).game!.turnClock!.warnAt, thrown + ms("landing") + ms("idle"), "the clock starts once the token is down");
  // Building a house, an offer, any move: the team is there.
  t.clock.t += ms("landing") + ms("idle") - 10;
  t.send(idler, { t: "offer", to: seatOf(other), give: { cash: 10, deeds: [], cards: [] }, get: { cash: 0, deeds: [], cards: [] }, seat });
  assert.equal(t.view(other).game!.turnClock!.warnAt, t.clock.t + ms("idle"), "it starts again from the team's last move");
  // Not for the other team's moves, nor for a phone checking in.
  const warnAt = t.view(other).game!.turnClock!.warnAt;
  t.clock.t += 5;
  t.send(other, { t: "offer-cancel", id: 1 });
  t.send(idler, { t: "ping" });
  assert.equal(t.view(other).game!.turnClock!.warnAt, warnAt);
});

test("turn clock: it stands still in a pause and a party forfeit", () => {
  const { t, ps, seatOf, other, ms } = clockTable({ party: true });
  const g = t.game;
  const clock = t.view(other).game!.turnClock!;
  t.clock.t = clock.warnAt + 10;
  t.send(ps[0], { t: "pause", on: true });
  assert.equal(t.view(other).game!.frozenAt, t.clock.t, "the countdown on screen stands still");
  t.clock.t += 10 * 60_000;
  t.room.tick();
  t.settle();
  assert.equal(g.s.pending?.k, "roll", "nothing moved in the pause");
  t.send(ps[0], { t: "pause", on: false });
  assert.equal(t.view(other).game!.turnClock!.at, clock.at + 10 * 60_000 + 0, "it picks up where it stopped");
  const at = t.view(other).game!.turnClock!.at;
  (t.room as unknown as { party(seat: number, why: string): void }).party(seatOf(other), "rent");
  t.settle();
  t.clock.t += ms("forfeitMax") - 10;
  t.room.tick();
  t.settle();
  assert.equal(g.s.pending?.k, "roll", "nothing moved while the forfeit held the game");
  t.send(other, { t: "forfeit", id: g.forfeit!.id, op: "done" });
  assert.equal(t.view(other).game!.turnClock!.at, at + ms("forfeitMax") - 10);
});

test("turn clock: not for computer teams, a team the computer covers, the one-phone demo, or a question with its own clock", () => {
  // Computer teams move after a moment anyway.
  const t = new Table({ trivia: false }, 3);
  const ps = lobby(t, 1, 2);
  t.send(ps[0], { t: "start" });
  const g = t.game;
  const botOnIt = () => {
    const seat = E.whoMustAct(g.s)[0];
    return seat !== undefined && !E.SIMULTANEOUS.has(g.s.pending!.k) && !!t.room.st.teams.find((x) => x.id === g.seats[seat])?.bot;
  };
  t.playUntil(botOnIt);
  assert.equal(t.view(ps[0]).game!.turnClock, null, "a computer team's decision has no clock");
  // A team handed to the computer.
  const h = clockTable();
  h.t.send(h.idler, { t: "autoplay", on: true });
  assert.equal(h.t.view(h.other).game!.turnClock, null);
  // The one-phone demo: one person plays every team, nobody waits on anyone.
  const demo = new Table({ hotseat: true, trivia: false }, 3);
  const dp = phone(1);
  demo.join(dp, "Me");
  demo.send(dp, { t: "team", op: "create" });
  demo.send(dp, { t: "team", op: "create" });
  demo.send(dp, { t: "start" });
  assert.equal(demo.view(dp).game!.turnClock, null);
  // An auction counts down by itself.
  const a = clockTable({}, 9);
  for (const p of a.t.phones) p.declineBuys = true;
  a.t.playUntil(() => a.t.game.s.pending?.k === "auction" && !!a.t.game.auction);
  assert.equal(a.t.view(a.other).game!.turnClock, null, "no clock in an auction");
});

// ---------- party forfeits (派对惩罚) ----------

test("party mode deals a forfeit that fits what happened, and doesn't repeat one soon", () => {
  for (const f of FORFEITS) assert.ok(f.text.zh.trim() && f.text.en.trim());
  const t = new Table({ party: true }, 11);
  const ps = lobby(t, 4);
  t.send(ps[0], { t: "start" });
  t.playUntil(() => t.game.s.over);
  const dares = t.seen.flatMap((f) => (f.t === "party" ? [f] : []));
  assert.ok(dares.length >= 3, `only ${dares.length} forfeits in a whole game`);
  for (const d of dares) {
    const f = FORFEITS[d.dare!];
    assert.ok(f, "every forfeit is a real one");
    assert.ok(!f.why || f.why === d.why, `"${f.text.en}" was dealt for ${d.why}`);
  }
  for (let i = 0; i < dares.length; i++)
    for (let j = Math.max(0, i - 8); j < i; j++) assert.notEqual(dares[i].dare, dares[j].dare, "no repeat within nine forfeits");
});

/** A party table whose game is under way, the first team's turn up. */
function partyTable(seed = 11, settings: Partial<import("../src/room/protocol").Settings> = {}) {
  const t = new Table({ party: true, ...settings }, seed);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const seatOf = (p: Phone) => t.view(p).you.seats[0];
  const deal = (seat: number) => (t.room as unknown as { party(seat: number, why: string): void }).party(seat, "rent");
  return { t, ps, seatOf, deal };
}

test("a party forfeit holds the game, every clock with it, until its team says it's done", () => {
  const { t, ps, seatOf, deal } = partyTable(11, OFTEN);
  const g = t.game;
  // (a team lands on a city and its question comes up: one more clock for the forfeit to hold)
  nextQuestion(t);
  const onTurn = ps.find((p) => seatOf(p) === g.s.turn)!;
  const doer = ps.find((p) => p !== onTurn)!;
  const other = ps.find((p) => p !== onTurn && p !== doer)!;
  const before = { decision: g.decision, pending: g.pendingSince, trivia: g.trivia!.endsAt, turn: g.s.turn };
  deal(seatOf(doer));
  t.settle();
  const f = t.view(other).game!.forfeit!;
  assert.ok(f, "every screen shows the forfeit");
  assert.equal(f.seat, seatOf(doer));
  assert.equal(t.view(other).game!.frozenAt, t.clock.t, "the countdowns stand still from here");

  // Time passes (less than the limit); nothing moves, nobody can move.
  t.clock.t += TIMING.forfeitMax * 0.05 * 0.8;
  t.room.tick();
  t.settle();
  assert.equal(g.decision, before.decision);
  assert.equal(g.trivia!.closed, false, "the quiz clock stopped too");
  t.send(onTurn, { t: "act", d: g.decision, a: {}, seat: g.s.turn });
  assert.equal(onTurn.toasts.at(-1), "forfeitWait");
  t.send(other, { t: "forfeit", id: f.id, op: "done" });
  assert.equal(other.toasts.at(-1), "notYours", "only its own team says it's done");
  assert.ok(g.forfeit);

  const held = t.clock.t - f.at;
  t.send(doer, { t: "forfeit", id: f.id, op: "done" });
  assert.equal(g.forfeit, null);
  assert.equal(t.view(other).game!.frozenAt, null);
  assert.equal(g.pendingSince, before.pending + held, "the clocks pick up where they stopped");
  assert.equal(g.trivia!.endsAt, before.trivia + held);
  assert.ok(t.seen.some((x) => x.t === "party-done" && x.seat === seatOf(doer) && x.how === "done"));
  t.send(doer, { t: "forfeit", id: f.id, op: "done" });
  assert.equal(t.seen.filter((x) => x.t === "party-done").length, 1, "a second tap does nothing");
  t.playUntil(() => g.s.turns >= 3);
});

test("forfeits wait their turn; the host can skip one; a pause and a forfeit together count the time once", () => {
  const { t, ps, seatOf, deal } = partyTable(12);
  const g = t.game;
  const host = ps[0];
  const [a, b] = ps.filter((p) => p !== host);
  const start = { pending: g.pendingSince, at: t.clock.t };
  deal(seatOf(a));
  deal(seatOf(b));
  t.settle();
  assert.equal(g.forfeit!.seat, seatOf(a));
  assert.equal(t.view(host).game!.forfeit!.waiting, 1, "the second waits its turn");
  t.clock.t += 1000;
  t.send(host, { t: "pause", on: true });
  t.clock.t += 1000;
  t.send(a, { t: "forfeit", id: g.forfeit!.id, op: "done" });
  assert.equal(g.forfeit!.seat, seatOf(b), "the next comes up");
  assert.equal(g.forfeit!.at, t.clock.t);
  t.send(b, { t: "forfeit", id: g.forfeit!.id, op: "skip" });
  assert.equal(b.toasts.at(-1), "hostOnly");
  t.send(host, { t: "forfeit", id: g.forfeit!.id, op: "skip" });
  assert.equal(g.forfeit, null);
  assert.ok(t.seen.some((x) => x.t === "party-done" && x.seat === seatOf(b) && x.how === "skip"));
  assert.equal(g.pendingSince, start.pending, "still paused: nothing moved yet");
  t.clock.t += 1000;
  t.send(host, { t: "pause", on: false });
  assert.equal(g.pendingSince, start.pending + (t.clock.t - start.at), "stood still from the first forfeit to the end of the pause, once");
});

test("a forfeit nobody closes lets the game go on after a while; computer teams don't do forfeits", () => {
  const { t, ps, seatOf, deal } = partyTable(13);
  const g = t.game;
  deal(seatOf(ps[1]));
  t.settle();
  assert.ok(g.forfeit);
  t.clock.t += TIMING.forfeitMax * 0.05 + 10;
  t.room.tick();
  t.settle();
  assert.equal(g.forfeit, null);
  assert.ok(t.seen.some((x) => x.t === "party-done" && x.how === "timeout"));

  const t2 = new Table({ party: true }, 14);
  const ps2 = lobby(t2, 1, 2);
  t2.send(ps2[0], { t: "start" });
  const bot = t2.game.seats.findIndex((id) => t2.room.st.teams.find((x) => x.id === id)?.bot);
  (t2.room as unknown as { party(seat: number, why: string): void }).party(bot, "rent");
  assert.equal(t2.game.forfeit, null);
  assert.equal(t2.room.st.feed.filter((x) => x.t === "party").length, 0);
});

test("a wrong answer in the waiting teams' quiz costs a little, never more than the team has", () => {
  const { t, seatOf, others } = quizTable({}, 5);
  const g = t.game;
  const tv = g.trivia!;
  const [x, y] = others;
  const wrong = (tv.order.indexOf(0) + 1) % 3;
  g.s.ps[seatOf(x)].cash = 4;
  g.s.ps[seatOf(y)].cash = 0;
  t.send(x, { t: "trivia", id: tv.id, choice: wrong });
  t.send(y, { t: "trivia", id: tv.id, choice: wrong });
  assert.equal(g.s.ps[seatOf(x)].cash, 0, "the team pays what it has");
  assert.equal(g.s.ps[seatOf(y)].cash, 0);
  const fines = t.seen.flatMap((f) => (f.t === "game" && f.e.t === "fine" ? [f.e] : []));
  assert.deepEqual(
    fines.map((e) => [e.p, e.amount]),
    [[seatOf(x), 4]],
    "nothing to take, no charge",
  );
  assert.equal(g.trivia!.closed, true, "everyone answered");
});

test("party mode is off unless the host turns it on", () => {
  const t = new Table({}, 11);
  const ps = lobby(t, 4);
  t.send(ps[0], { t: "start" });
  t.playUntil(() => t.game.s.over);
  assert.equal(t.seen.filter((f) => f.t === "party").length, 0);
});

test("a new room is saved as soon as it's made, before anyone joins", () => {
  const room = Room.create("1234", makeEnv(new Clock()));
  assert.equal(room.flush().changed, true);
  assert.equal(room.flush().changed, false);
});

test("a room opened from a changle.ca table keeps the host role for the table's host, and knows its table", () => {
  const clock = new Clock();
  const host = { id: "a1b2c3d4e5f6a7b8c9d0e1f2", key: "host-key-secret-xxxx" };
  const room = Room.create("4321", makeEnv(clock), {}, { host: host.id, table: "N55C" });
  // someone else's phone gets there first: they don't become the host
  assert.ok(room.join("member-9-xxxxxxxx", "key-9-secret-xxxx", { name: "Mia" }));
  assert.equal(room.view("member-9-xxxxxxxx").you.host, false);
  assert.equal(room.view("member-9-xxxxxxxx").table, "N55C");
  assert.ok(room.join(host.id, host.key, { name: "Steve" }));
  assert.equal(room.view(host.id).you.host, true);
  // a host who never arrives hands over once the hold is past
  const late = Room.create("4322", makeEnv(clock), {}, { host: "ffffffffffffffffffffffff", table: "N55C" });
  assert.ok(late.join("member-9-xxxxxxxx", "key-9-secret-xxxx", { name: "Mia" }));
  assert.equal(late.view("member-9-xxxxxxxx").you.host, false);
  clock.t += 91_000;
  late.handle("member-9-xxxxxxxx", { t: "ping" });
  assert.equal(late.view("member-9-xxxxxxxx").you.host, true);
  // anything that doesn't look like an id or a table code is ignored
  const odd = Room.create("4323", makeEnv(clock), {}, { host: "<script>", table: "no!" });
  assert.equal(odd.st.hostId, null);
  assert.equal(odd.view("x").table, null);
});

test("Rio: every screen plays the dance first, and the judges' 25 s start when it's over", () => {
  const t = new Table({ speed: 1 }, 8);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const s = t.game.s;
  const dancer = s.turn;
  const dancerPhone = ps.find((p) => t.view(p).you.seats.includes(dancer))!;
  // The team on turn is in Rio, and says it will dance.
  s.pending = { k: "dance", who: dancer };
  t.send(dancerPhone, { t: "act", d: t.view(dancerPhone).game!.decision, a: { yes: true }, seat: dancer });
  const start = t.clock.t;
  assert.deepEqual(t.view(ps[0]).game!.dance, { seat: dancer, at: start, ms: TIMING.dance });
  assert.equal(t.game.deadline, start + TIMING.dance + TIMING.vote, "the vote's time starts after the dance");
  // A judge who scores mid-dance is told to watch first; nothing is counted.
  const judge = ps.find((p) => p !== dancerPhone)!;
  const seat = t.view(judge).you.seats[0];
  t.send(judge, { t: "act", d: t.view(judge).game!.decision, a: { score: 7 }, seat });
  assert.equal(judge.toasts.at(-1), "stillDancing");
  const votes = () => (t.game.s.pending?.k === "scores" ? t.game.s.pending.votes : {});
  assert.deepEqual(votes(), {});
  // The room's clock wakes for the dance's end (a computer judge scores then, not before).
  t.clock.t = start + TIMING.dance - 1;
  t.room.tick();
  t.settle();
  assert.deepEqual(votes(), {});
  t.clock.t = start + TIMING.dance;
  t.room.tick();
  t.settle();
  const told = judge.toasts.length;
  t.send(judge, { t: "act", d: t.view(judge).game!.decision, a: { score: 7 }, seat });
  assert.equal(judge.toasts.length, told, "no toast: the score counts");
  assert.equal(votes()[seat], 7);
});

test("a test room can keep the teams in the order they were made: the first team made throws first", () => {
  const seatOf = (settings: Partial<import("../src/room/protocol").Settings>, seed: number) => {
    const t = new Table(settings, seed);
    const ps = lobby(t, 1, 2);
    t.send(ps[0], { t: "start" });
    return t.view(ps[0]).you.seats[0];
  };
  const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
  assert.deepEqual(seeds.map((n) => seatOf({ inOrder: true }, n)), seeds.map(() => 0));
  // (otherwise the order is drawn)
  assert.ok(seeds.some((n) => seatOf({}, n) !== 0));
});

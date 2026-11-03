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

test("waiting teams race to answer: a wrong answer locks you out, the first right one wins", () => {
  const t = new Table({}, 5);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const g = t.game;
  const tv = g.trivia!;
  assert.ok(tv, "a question opens with the first turn");
  const seatOf = (p: Phone) => t.view(p).you.seats[0];
  const onTurn = ps.find((p) => seatOf(p) === g.s.turn)!;
  const [slow, quick] = ps.filter((p) => p !== onTurn);
  const shown = t.view(slow).game!.trivia!;
  assert.equal(shown.city, cityOf(tv.qid));
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

  t.playUntil(() => g.trivia?.id !== tv.id);
  assert.deepEqual(t.refusals, []);
});

test("nobody right: the question times out, shows the answer, then the next turn asks another", () => {
  const t = new Table({}, 8);
  const ps = lobby(t, 2);
  t.send(ps[0], { t: "start" });
  const g = t.game;
  const first = g.trivia!;
  const firstTurn = g.s.turns;
  t.playUntil(() => !!g.trivia?.closed);
  assert.equal(g.trivia!.winner, null);
  const shown = t.view(ps[1]).game!.trivia!;
  assert.equal(shown.correct, first.order.indexOf(0), "the answer is shown when time runs out");
  t.playUntil(() => !!g.trivia && g.trivia.id !== first.id);
  assert.ok(g.s.turns > firstTurn, "a later turn asks a new question");
});

test("never the same question twice in one game: once every one has been asked, the quiz rests", () => {
  const t = new Table({ testRounds: 60 }, 9);
  lobby(t, 1, 3);
  t.send(t.phones[0], { t: "start" });
  const g = t.game;
  const asked: number[] = [];
  const ids: string[] = [];
  const note = () => {
    const tv = g.trivia;
    if (tv && asked.at(-1) !== tv.id) {
      asked.push(tv.id);
      ids.push(tv.qid);
    }
  };
  t.playUntil(() => (note(), ids.length >= 30 || g.s.over));
  assert.ok(ids.length >= 30, `only ${ids.length} questions in a long game`);
  assert.equal(new Set(ids).size, ids.length, "no question twice");
  // The same game later on, with all but three questions asked: those three, then no more.
  t.playUntil(() => !g.trivia || g.s.over);
  const last = TRIVIA.map((q) => q.id)
    .filter((id) => !g.triviaAsked.includes(id))
    .slice(-3);
  g.triviaAsked = TRIVIA.map((q) => q.id).filter((id) => !last.includes(id));
  let turnsAfter = 0;
  t.playUntil(() => {
    note();
    if (g.triviaAsked.length === TRIVIA.length && !g.trivia) turnsAfter += 1;
    return turnsAfter > 300 || g.s.over;
  });
  assert.deepEqual(ids.slice(-3).sort(), [...last].sort(), "the last three, once each");
  assert.equal(new Set(ids).size, ids.length, "no question twice, all game");
  assert.equal(g.triviaAsked.length, TRIVIA.length);
  assert.equal(new Set(g.triviaAsked).size, TRIVIA.length);
  assert.equal(g.trivia, null, "and then the quiz rests");
});

test("the quiz never asks about a city the team on turn could land on with this roll", () => {
  const t = new Table({}, 12);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const g = t.game;
  const room = t.room as unknown as { openTrivia(): void };
  for (let pos = 0; pos < E.BOARD_SIZE; pos++) {
    const s = g.s;
    s.ps[s.turn].pos = pos;
    const near = new Set<string>();
    for (let k = 0; k <= 12; k++) {
      const sp = E.BOARD[(((pos + k * s.dir) % E.BOARD_SIZE) + E.BOARD_SIZE) % E.BOARD_SIZE];
      if (sp.k === "city") near.add(sp.id);
    }
    for (let n = 0; n < 5; n++) {
      g.trivia = null;
      g.triviaAsked = [];
      room.openTrivia();
      assert.ok(!near.has(cityOf(g.trivia!.qid)), `asked about ${cityOf(g.trivia!.qid)} from space ${pos}`);
    }
  }
});

test("computer teams answer the quiz, but the computer covering for absent people doesn't", () => {
  const t = new Table({}, 6);
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
  const t = new Table({}, 7);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
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
  const t2 = new Table();
  t2.room = Room.fromSave("5678", file, makeEnv(t2.clock, 3));
  assert.equal(t2.game.trivia, null);
  assert.deepEqual(t2.game.triviaAsked, []);
  for (const p of ps) t2.join(p, "again");
  const teams = t2.view(ps[0]).teams.filter((x) => !x.bot);
  ps.forEach((p, i) => t2.send(p, { t: "team", op: "join", team: teams[i].id }));
  t2.send(ps[0], { t: "pause", on: false });
  t2.playUntil(() => t2.game.s.turns >= t.game.s.turns + 3 && !!t2.game.trivia);
});

test("rooms and saves from before question ids: what was asked carries over, a question up is dropped", () => {
  const t = new Table({}, 7);
  const ps = lobby(t, 2);
  t.send(ps[0], { t: "start" });
  t.room.handle(ps[0].id, { t: "save" });
  const file = JSON.parse(JSON.stringify(t.settle().save!.file));
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
  const back = new Room(st, makeEnv(t.clock, 4));
  assert.equal(back.st.game!.trivia, null, "a question from the old list isn't shown");
  assert.deepEqual(back.st.game!.triviaAsked, ["mexicocity-01"]);
  assert.equal("triviaUsed" in back.st.game!, false);
});

/** A table whose game is under way: the team on turn, the others, and each one's seat. */
function quizTable(settings: Partial<import("../src/room/protocol").Settings> = {}, seed = 5, humans = 3, bots = 0) {
  const t = new Table(settings, seed);
  const ps = lobby(t, humans, bots);
  t.send(ps[0], { t: "start" });
  const seatOf = (p: Phone) => t.view(p).you.seats[0];
  const onTurn = ps.find((p) => seatOf(p) === t.game.s.turn)!;
  const others = ps.filter((p) => p !== onTurn);
  return { t, ps, seatOf, onTurn, others };
}

/**
 * The bug Steve saw ("sometimes the quiz can't be answered"): a question comes up at the start of a
 * team's turn, for the other teams. That team plays its turn out in a few seconds while the question
 * is still up, and on its phone the question sat there with three answers that did nothing when
 * tapped (and a line saying the first right answer wins). Now a team joins in once its turn is over.
 */
test("a team on turn when a question comes up can answer it once its turn is over", () => {
  // (a throw of 5 + 6 lands on Istanbul, for sale: buy it, end the turn; no clock needed)
  const { t, seatOf, onTurn, others } = quizTable({ dice: [5, 6] }, 5);
  const g = t.game;
  const tv = g.trivia!;
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
  // (a seed where the pair's team isn't on turn, so the question is for it)
  for (let seed = 1; seed < 50; seed++) {
    const t = new Table({}, seed);
    const ps = lobby(t, 2);
    const mate = phone(7);
    t.join(mate, "Mate");
    t.send(mate, { t: "team", op: "join", team: t.view(ps[1]).you.team! });
    t.send(ps[0], { t: "start" });
    const g = t.game;
    const pair = t.view(ps[1]).you.seats[0];
    if (pair === g.s.turn) continue;
    const tv = g.trivia!;
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
  const t = new Table({}, 9);
  const ps = lobby(t, 2);
  const fresh = ["tokyo-01", "venice-01"];
  const seen = TRIVIA.map((q) => q.id).filter((id) => !fresh.includes(id));
  for (const p of ps) t.send(p, { t: "seen", ids: seen });
  t.send(ps[0], { t: "start" });
  // (from Departure, the team on turn can reach none of these two cities with this throw)
  assert.ok(fresh.includes(t.game.trivia!.qid), `asked ${t.game.trivia!.qid}, which they've seen`);
  // The room remembers what it asked, for the next game in this room.
  assert.ok(t.room.st.members[ps[0].id].seen!.includes(t.game.trivia!.qid));
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
  const t = new Table({}, 4);
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
  t.playUntil(() => t.game.s.turns >= 15 || t.game.s.over);
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
function partyTable(seed = 11) {
  const t = new Table({ party: true }, seed);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const seatOf = (p: Phone) => t.view(p).you.seats[0];
  const deal = (seat: number) => (t.room as unknown as { party(seat: number, why: string): void }).party(seat, "rent");
  return { t, ps, seatOf, deal };
}

test("a party forfeit holds the game, every clock with it, until its team says it's done", () => {
  const { t, ps, seatOf, deal } = partyTable();
  const g = t.game;
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
  const t = new Table({}, 5);
  const ps = lobby(t, 3);
  t.send(ps[0], { t: "start" });
  const g = t.game;
  const tv = g.trivia!;
  const seatOf = (p: Phone) => t.view(p).you.seats[0];
  const [x, y] = ps.filter((p) => seatOf(p) !== g.s.turn);
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

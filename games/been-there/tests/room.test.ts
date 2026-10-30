// The room, driven by scripted phones on a fake clock: whole games, reconnects, auctions, saves.
// Phones decide from what their own view shows (the same data a real phone gets).
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../src/engine";
import { random } from "../src/engine/rng";
import { TIMING, TRIVIA_PRIZE, type ClientMsg, type RoomView, type ServerMsg } from "../src/room/protocol";
import { Room, type RoomEnv } from "../src/room/room";
import { FORFEITS } from "../src/room/party";
import { TRIVIA } from "../src/room/trivia";

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
  /** Jump the clock to the room's next timer and run it. */
  wait() {
    const w = this.room.nextWake();
    this.clock.t = Math.max(this.clock.t + 50, Math.min(w ?? this.clock.t + 1000, this.clock.t + 60_000));
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

test("every quiz question is about a city in the game, with three different answers in both languages", () => {
  const ids = E.CITIES.map((c) => c.id);
  for (const q of TRIVIA) {
    assert.ok(ids.includes(q.city), q.city);
    for (const lang of ["zh", "en"] as const) {
      assert.ok(q.q[lang].trim(), `${q.city}: question in ${lang}`);
      assert.equal(new Set(q.options.map((o) => o[lang].trim()).filter(Boolean)).size, 3, `${q.city}: answers in ${lang}`);
    }
  }
  assert.deepEqual([...new Set(TRIVIA.map((q) => q.city))].sort(), [...ids].sort(), "every city has a question");
});

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
  assert.equal(shown.city, TRIVIA[tv.q].city);
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
  assert.equal(g.s.ps[seatOf(slow)].cash, cash[seatOf(slow)]);
  assert.equal(g.decision, decision, "the quiz doesn't make the decision on the table stale");
  assert.ok(t.seen.some((f) => f.t === "game" && f.e.t === "bonus" && f.e.p === seatOf(quick)));
  const after = t.view(onTurn).game!.trivia!;
  assert.equal(after.open, false);
  assert.equal(after.correct, right);
  assert.ok(after.fact?.zh && after.source?.startsWith("https://"), "the reveal shows the fact and its source");
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

test("no question comes round again until all of them have been asked", () => {
  const t = new Table({ testRounds: 40 }, 9);
  lobby(t, 1, 3);
  t.send(t.phones[0], { t: "start" });
  const asked: number[] = [];
  t.playUntil(() => {
    const tv = t.game.trivia;
    if (tv && asked.at(-1) !== tv.q) asked.push(tv.q);
    return asked.length > TRIVIA.length || t.game.s.over;
  });
  assert.ok(asked.length > TRIVIA.length, `only ${asked.length} questions before the game ended`);
  assert.equal(new Set(asked.slice(0, TRIVIA.length)).size, TRIVIA.length);
  assert.notEqual(asked[TRIVIA.length], asked[TRIVIA.length - 1], "the new deck doesn't start with the last question");
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
      g.triviaUsed = [];
      room.openTrivia();
      assert.ok(!near.has(TRIVIA[g.trivia!.q].city), `asked about ${TRIVIA[g.trivia!.q].city} from space ${pos}`);
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
  // Saves from before the quiz have none of its fields.
  delete file.game.triviaUsed;
  delete file.game.triviaTurn;
  const t2 = new Table();
  t2.room = Room.fromSave("5678", file, makeEnv(t2.clock, 3));
  assert.equal(t2.game.trivia, null);
  for (const p of ps) t2.join(p, "again");
  const teams = t2.view(ps[0]).teams.filter((x) => !x.bot);
  ps.forEach((p, i) => t2.send(p, { t: "team", op: "join", team: teams[i].id }));
  t2.send(ps[0], { t: "pause", on: false });
  t2.playUntil(() => t2.game.s.turns >= t.game.s.turns + 3 && !!t2.game.trivia);
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

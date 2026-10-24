// The room, driven by scripted phones on a fake clock: whole games, reconnects, auctions, saves.
// Phones decide from what their own view shows (the same data a real phone gets).
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../src/engine";
import { random } from "../src/engine/rng";
import type { ClientMsg, RoomView, ServerMsg } from "../src/room/protocol";
import { Room, type RoomEnv } from "../src/room/room";

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

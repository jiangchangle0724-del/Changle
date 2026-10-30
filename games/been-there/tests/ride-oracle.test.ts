// The engine as the oracle for the moves the screens play: 10,000 throws from computer games, each
// turned into the feed the room would send, and each worked out again by ridePlan.ts the way a
// phone and the big screen do. Every move the engine made for the throw must come back as a leg (in
// order, the right way round, the right distance, the salary where it was paid), the token must end
// where the engine left it, and the clock must keep its promises: the decision is back no more than
// 4 s after it used to be (1.7 s), and the camera never has to turn faster than 60 degrees a second.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BOARD, act, decide, fallbackAction, newBrain, newGame, whoMustAct, type GameEvent } from "../src/engine";
import { configFor, mixedStyles } from "../src/engine/sim";
import type { FeedItem, RoomView } from "../src/room/protocol";
import { BEAT, MAX_EXTRA, OLD_MOMENT, planMove, withTimes } from "../src/client/ui/ridePlan";

const N = BOARD.length;
const THROWS = 10_000;
/** The room's clock between two decisions: well past "the same moment" (300 ms). */
const GAP = 2000;

type Move = Extract<GameEvent, { t: "move" }>;

test("10,000 throws: the legs are the engine's moves, and the clock keeps its promises", () => {
  let checked = 0;
  let permits = 0;
  let cards = 0;
  let jails = 0;
  let worstReady = 0;
  let fastest = Infinity;
  for (let seed = 1; checked < THROWS && seed < 2000; seed++) {
    const teams = 2 + (seed % 5);
    const styles = mixedStyles(teams)(seed);
    const s = newGame(
      configFor({ n: teams, mode: "target" }),
      styles.map((st, i) => `${st.id}${i}`),
      seed,
      { events: true },
    );
    const brains = styles.map((st, i) => newBrain(st, seed * 7919 + i * 104729));
    const feed: FeedItem[] = [];
    let id = 0;
    let seen = 0;
    let now = 1_000_000;
    // Each seat's throw this turn that hasn't moved yet (a car permit to decide first).
    const waiting = new Map<number, boolean>();
    let steps = 0;
    while (!s.over && s.pending && steps++ < 50_000 && checked < THROWS) {
      const pd = s.pending;
      const who = whoMustAct(s);
      if (!who.length) break;
      const p = who[0];
      const a = decide(s, p, brains);
      if (s.pending !== pd) continue;
      const before = s.ps[p].pos;
      now += GAP;
      if (!act(s, p, a) && !act(s, p, fallbackAction(s, p, pd.k))) throw new Error(`stuck on ${pd.k}`);
      const fresh = s.events!.slice(seen);
      seen = s.events!.length;
      for (const e of fresh) feed.push({ id: ++id, at: now, t: "game", e } as FeedItem);
      const view = { you: { seats: [p] }, game: { s }, feed } as unknown as RoomView;
      // (thrown in this moment: a throw before the team's first move in it; a car permit's move
      // comes in a moment of its own, and the hitch-hiking card can throw again after it)
      const firstMove = fresh.findIndex((e) => e.t === "move" && e.p === p);
      const threw = fresh.some((e, k) => e.t === "roll" && e.p === p && (firstMove < 0 || k < firstMove));
      for (const e of fresh) {
        if (e.t === "turn") waiting.clear();
        if (e.t === "roll") waiting.set(e.p, true);
      }
      const moves = fresh.filter((e): e is Move => e.t === "move" && e.p === p);
      if (!moves.length) continue;
      const plan = planMove(view, [p], now + 50);
      if (!threw && !waiting.get(p)) {
        // A later move in the turn (a decision's): not a throw's, nothing new to play.
        assert.ok(!plan || plan.start < now, "a move that wasn't a throw's got a ride of its own");
        continue;
      }
      waiting.set(p, false);
      if (!threw) permits++;
      assert.ok(plan, `seed ${seed}: no move for a throw that moved`);
      assert.equal(plan.seat, p);
      assert.equal(plan.rolled, threw);
      // The legs are the engine's moves, one each, in order.
      assert.equal(plan.legs.length, moves.length, `seed ${seed}: ${JSON.stringify(moves)} vs ${JSON.stringify(plan.legs)}`);
      assert.equal(plan.legs[0].from, before);
      plan.legs.forEach((leg, k) => {
        const m = moves[k];
        assert.equal(leg.from, m.from);
        assert.equal(leg.to, m.to);
        assert.equal(leg.salary, m.salary ?? 0);
        // Walking it: `steps` spaces the way it goes ends where the engine put the token.
        assert.equal((((leg.from + leg.dir * leg.steps) % N) + N) % N, leg.to, `seed ${seed}: leg ${JSON.stringify(leg)}`);
        if (k) assert.equal(leg.from, plan.legs[k - 1].to);
        // Only passing Departure going forward pays.
        if (leg.salary) assert.equal(leg.dir, 1);
        if (k && leg.by === "card") cards++;
      });
      // The token ends where the engine left it: there, or behind Immigration's gate.
      const last = plan.legs[plan.legs.length - 1];
      if (plan.jail) {
        jails++;
        assert.equal(s.ps[p].pos, 10);
      } else if (!s.ps[p].out) assert.equal(s.ps[p].pos, last.to);
      // The clock.
      const t = withTimes(plan).t;
      assert.ok(t.ready <= OLD_MOMENT + MAX_EXTRA, `seed ${seed}: ${t.ready} ms to the decision`);
      worstReady = Math.max(worstReady, t.ready);
      t.legs.forEach((L, k) => {
        if (!plan.legs[k].steps || L.cut) return;
        assert.ok(L.per >= BEAT.quick, `${L.per} ms a space`);
        fastest = Math.min(fastest, L.per);
      });
      // The big screen plays the same move (it is the latest throw).
      const tv = planMove(view, null, now + 50);
      assert.equal(tv?.key, plan.key);
      assert.deepEqual(tv?.legs, plan.legs);
      checked++;
    }
  }
  assert.equal(checked, THROWS);
  // (it covered the cases that matter)
  assert.ok(permits > 0 && cards > 0 && jails > 0, `permits ${permits}, card moves ${cards}, Immigration ${jails}`);
  console.log(`${checked} throws: worst ${worstReady} ms to the decision (limit ${OLD_MOMENT + MAX_EXTRA}), fastest ${fastest} ms a space (60°/s is ${BEAT.quick}); ${permits} after a car permit, ${cards} card moves, ${jails} to Immigration`);
});

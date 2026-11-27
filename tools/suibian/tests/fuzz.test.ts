// A table played by random taps: phones joining and dropping off, messages out of turn, searches
// that come back late, empty or not at all, the clock jumping. The room must never break a rule.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MENU, RANGES, TOP_COUNT, type CuisineId, type RangeId } from "../src/engine";
import { MAX_MEMBERS, MAX_SEARCHES, TIMING, type ClientMsg, type Phase } from "../src/room/protocol";
import { Room, type Want } from "../src/room/room";
import { demoPlaces } from "../src/server/places";

/** A small seeded random, so a failure can be played again. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PHASES: Phase[] = ["lobby", "finding", "mood", "cards", "spin", "result"];
const RANGE_IDS = Object.keys(RANGES) as RangeId[];
const center = { lat: 49.2827, lng: -123.1207 };

function play(seed: number, steps: number) {
  const r = seeded(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  let now = Date.parse("2026-11-26T01:00:00Z") + Math.floor(r() * 86_400_000);
  const env = { now: () => now, random: r };
  const ids = Array.from({ length: MAX_MEMBERS + 2 }, (_, i) => (0xa0000000 + i).toString(16));
  const room = Room.create("1234", env, { host: ids[0], center, range: pick(RANGE_IDS), demo: true, at: r() < 0.3 ? now + 3_600_000 : null });
  let pending: Want | null = null;
  const asked = new Set<string>();
  const log: string[] = [];

  const msg = (): ClientMsg => {
    const phase = r() < 0.7 ? room.st.phase : pick(PHASES);
    const cards = room.st.cards;
    const picks: Partial<Record<CuisineId, "like" | "ban">> = {};
    for (let i = Math.floor(r() * 4); i > 0; i--) picks[pick(MENU)] = r() < 0.7 ? "like" : "ban";
    return pick<ClientMsg>([
      { t: "start" },
      { t: "next", phase },
      { t: "next" } as ClientMsg,
      { t: "back", phase },
      { t: "back" },
      { t: "again", range: pick(RANGE_IDS) },
      { t: "research", range: pick(RANGE_IDS) },
      { t: "mood", picks, done: r() < 0.6 },
      { t: "mood", picks: room.st.members[ids[0]]?.mood ?? {}, done: true },
      { t: "ballot", approve: cards.filter(() => r() < 0.3), veto: r() < 0.3 && cards.length ? pick(cards) : null, done: r() < 0.6 },
      { t: "limits", limits: { allergies: r() < 0.3 ? { peanut: "severe" } : {}, custom: [], halal: r() < 0.1, vegetarian: r() < 0.1, budget: pick([0, 0, 1, 2, 3]) } as never },
      { t: "when", at: r() < 0.5 ? null : now + Math.floor(r() * 3 * 86_400_000) } as ClientMsg,
      { t: "occasion", occasion: pick(["casual", "date", "friends", "work", "nonsense"]) } as ClientMsg,
      { t: "name", name: "x".repeat(Math.floor(r() * 30)) },
      { t: "lang", lang: r() < 0.5 ? "en" : "zh" },
      { t: "ping" } as ClientMsg,
      { t: "nonsense" } as unknown as ClientMsg,
      null as unknown as ClientMsg,
      { t: "mood", picks: { notACuisine: "like", ramen: "maybe" }, done: true } as unknown as ClientMsg,
      { t: "ballot", approve: ["not-a-card", ...cards], veto: "not-a-card", done: true },
      // Everyone ticking the first card, so matches happen.
      { t: "ballot", approve: cards.slice(0, 1), veto: null, done: false },
      { t: "ballot", approve: cards.slice(0, 1), veto: null, done: false },
      { t: "match" },
      { t: "match" },
      { t: "more", batch: room.st.batch ?? 0 },
      { t: "more", batch: -1 },
    ]);
  };

  for (let step = 0; step < steps; step++) {
    const before = room.st.phase;
    let sent: ClientMsg | null = null;
    const match0 = room.view(ids[0]).match;
    const cards0 = [...room.st.cards].sort();
    const ballots0 = JSON.stringify(Object.values(room.st.members).map((m) => m.ballot));
    const batch0 = room.st.batch ?? 0;
    const searches0 = room.st.searches ?? 0;
    const key0 = (room as unknown as { searchKey(): string }).searchKey();
    const a = r();
    const who = pick(ids);
    let did = "";
    if (a < 0.08) {
      did = `join ${who}`;
      room.join(who, `${who}-key-long-enough`, { name: who.slice(-1), lang: "zh" });
    } else if (a < 0.13) {
      did = `leave ${who}`;
      room.leave(who);
    } else if (a < 0.15) {
      did = "restart";
      room.presence(ids.filter(() => r() < 0.5));
    } else if (a < 0.25 && pending?.k === "search") {
      const w = pending;
      const empty = r() < 0.1;
      did = empty ? "found nothing" : "found";
      room.found(empty ? [] : demoPlaces(w.center, w.range, now, w.lang));
      pending = null;
    } else if (a < 0.27 && pending?.k === "search") {
      did = "search failed";
      if (room.st.phase === "finding") room.fail("searchFailed");
      pending = null;
    } else if (a < 0.32 && room.st.places.length) {
      did = "details";
      const top = room.st.cards.slice(0, TOP_COUNT);
      room.enrich(Object.fromEntries(top.map((id) => [id, { about: "Details from Google." }])));
    } else if (a < 0.36) {
      did = "rate";
      room.rate(who, { overall: pick(["up", "mid", "down"] as const), liked: r() < 0.5, wait: pick([0, 15, 30, 45] as const) });
    } else if (a < 0.46) {
      const ms = r() < 0.2 ? TIMING.awayGrace + 1 : Math.floor(r() * 30_000);
      did = `tick +${ms}`;
      now += ms;
      room.tick();
    } else if (a < 0.58) {
      // The whole table moves along together, so round 2 (matches, 换一批) gets played a lot.
      did = "everyone";
      const at = Object.keys(room.st.members);
      const ph = room.st.phase;
      if (ph === "lobby") room.handle(ids[0], { t: "start" });
      else if (ph === "mood") for (const id of at) room.handle(id, { t: "mood", picks: r() < 0.5 ? {} : { [pick(MENU)]: "like" }, done: true });
      else if (ph === "cards" && r() < 0.3) room.handle(ids[0], (sent = { t: "more", batch: room.st.batch ?? 0 }));
      else if (ph === "cards" && r() < 0.3) room.handle(pick(at), (sent = { t: "match" }));
      else if (ph === "cards") for (const id of at) room.handle(id, { t: "ballot", approve: room.st.cards.slice(0, 1 + Math.floor(r() * 2)), veto: r() < 0.2 ? pick(room.st.cards) : null, done: r() < 0.2 });
      else if (ph === "result") room.handle(ids[0], { t: "again" });
    } else {
      sent = msg();
      did = `${who} ${JSON.stringify(sent)?.slice(0, 80)}`;
      room.handle(who, sent);
    }
    const out = room.flush();
    if (out.want?.k === "search") pending = out.want;
    if (before === "finding" && room.st.phase !== "finding") asked.clear();
    if (out.want?.k === "details") for (const id of out.want.ids) {
      assert.ok(!asked.has(id), `details asked twice for the same search's place: seed ${seed}, step ${step}`);
      asked.add(id);
    }
    log.push(`${step} ${before}→${room.st.phase} ${did}`);
    const where = () => `seed ${seed}:\n${log.slice(-12).join("\n")}`;

    // The rules.
    const st = room.st;
    assert.ok(PHASES.includes(st.phase), where());
    assert.ok(Object.keys(st.members).length <= MAX_MEMBERS, where());
    assert.ok((st.searches ?? 0) <= MAX_SEARCHES, `more searches than allowed: ${where()}`);
    if (st.phase === "finding" && before !== "finding") assert.equal(out.want?.k, "search", `round 1 ended without a search: ${where()}`);
    if (st.phase !== "finding" && before === "finding" && st.phase !== "lobby") assert.equal(st.phase, "cards", where());
    if (st.phase === "cards") {
      assert.ok(st.cards.length > 0, `round 2 with no cards: ${where()}`);
      for (const c of st.cards) assert.ok(st.places.some((p) => p.id === c), `a card that isn't a place: ${where()}`);
    }
    if (st.phase === "result" || st.phase === "spin") {
      assert.ok(st.result, where());
      assert.ok(st.places.some((p) => p.id === st.result!.winner), `a winner that isn't a place: ${where()}`);
    }
    if (st.error) assert.equal(st.phase, "lobby", `an error outside the lobby: ${where()}`);
    assert.equal(st.phaseEnds !== null, st.phase === "spin", `a clock outside the wheel: ${where()}`);
    for (const m of Object.values(st.members)) {
      if (st.phase === "lobby") assert.ok(!m.moodDone && !m.ballotDone, `done in the lobby: ${where()}`);
      if (st.phase === "cards" || st.phase === "spin" || st.phase === "result") assert.ok(m.moodDone, `round 1 open after it ended: ${where()}`);
      if (st.phase === "spin" || st.phase === "result") assert.ok(m.ballotDone, `round 2 open after it ended: ${where()}`);
    }
    // Round 1 straight to round 2 (back in round 1): only when nothing the search depends on changed, or no searches are left.
    if (before === "mood" && st.phase === "cards") assert.ok(st.searchedFor === key0 || searches0 >= MAX_SEARCHES, `the old places for a new search: ${where()}`);
    if ((st.searches ?? 0) > searches0) assert.equal(out.want?.k, "search", where());
    if (st.phase === "mood" || st.phase === "cards") {
      const here = Object.values(st.members).filter((m) => m.online > 0 || (m.leftAt !== undefined && now - m.leftAt < TIMING.awayGrace));
      const done = here.length > 0 && here.every((m) => (st.phase === "mood" ? m.moodDone : m.ballotDone));
      assert.ok(!done, `everyone at the table is done but the round waits: ${where()}`);
    }
    // A match ends round 2 with one of the places everyone ticked; nothing else does it but the count.
    if (sent?.t === "match" && before === "cards" && st.phase !== "cards") assert.ok(match0.includes(st.result!.winner), `a match won by another place: ${where()}`);
    if (st.phase === "cards") for (const c of room.view(ids[0]).match) {
      for (const x of Object.values(st.members)) assert.notEqual(x.ballot.veto, c, `a vetoed match: ${where()}`);
    }
    // 换一批 changes the order, never the places or the votes; everyone looks again.
    if (sent?.t === "more" && (st.batch ?? 0) !== batch0) {
      assert.equal(st.phase, "cards", where());
      assert.deepEqual([...st.cards].sort(), cards0, `换一批 lost or added places: ${where()}`);
      assert.equal(JSON.stringify(Object.values(st.members).map((m) => m.ballot)), ballots0, `换一批 changed votes: ${where()}`);
      for (const x of Object.values(st.members)) assert.ok(!x.ballotDone, where());
    }
    const wake = room.nextWake();
    assert.ok(wake !== null && Number.isFinite(wake), where());
    for (const id of [...ids, "ffffffff"]) {
      const v = room.view(id);
      assert.equal(v.phase, st.phase);
      JSON.stringify(v);
    }
  }
}

test("random taps never break the table's rules", () => {
  for (let seed = 1; seed <= 100; seed++) play(seed, 120);
});

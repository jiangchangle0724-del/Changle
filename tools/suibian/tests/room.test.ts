// One table from lobby to rating, with no network: the same Room the server runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SEVERE_RULES_OUT, type Place } from "../src/engine";
import { MAX_MEMBERS, TIMING } from "../src/room/protocol";
import { Room } from "../src/room/room";
import { demoPlaces } from "../src/server/places";

const center = { lat: 49.2827, lng: -123.1207 };

function setup() {
  let now = Date.parse("2026-10-23T02:00:00Z");
  const env = { now: () => now, random: () => 0 };
  const room = Room.create("1234", env, { host: "aaaaaaaa", center, range: "walk20", demo: true });
  const ids = ["aaaaaaaa", "bbbbbbbb", "cccccccc"];
  for (const id of ids) assert.ok(room.join(id, `${id}-key-long-enough`, { name: id[0], lang: "zh" }));
  return { room, ids, env, advance: (ms: number) => (now += ms), places: () => demoPlaces(center, "walk20", now) };
}

test("a whole table: diet cards, start, mood, cards, result, rating", () => {
  const { room, ids, places } = setup();
  room.handle(ids[1], { t: "limits", limits: { allergies: { peanut: "severe" }, custom: [], halal: false, vegetarian: false, budget: 0 } });
  room.handle(ids[1], { t: "start" }); // not the host: ignored
  assert.equal(room.st.phase, "lobby");
  room.handle(ids[0], { t: "start" });
  assert.equal(room.st.phase, "finding");
  const want = room.flush().want;
  assert.equal(want?.k, "search");
  room.found(places());
  assert.equal(room.st.phase, "mood");

  const v = room.view(ids[2]);
  // Severe peanut: no Thai on offer, and the view doesn't say who.
  assert.ok(!v.chips.some((c) => SEVERE_RULES_OUT.peanut!.includes(c.cuisine)));
  assert.deepEqual(v.table.allergies, { peanut: "severe" });
  assert.ok(!JSON.stringify(v.members).includes("peanut"));
  // Round 1 counts stay hidden while people choose.
  room.handle(ids[0], { t: "mood", picks: { ramen: "like", hotpot: "ban" }, done: true });
  assert.ok(room.view(ids[1]).chips.every((c) => c.likes === 0 && c.bans === 0));
  room.handle(ids[1], { t: "mood", picks: { ramen: "like" }, done: true });
  room.handle(ids[2], { t: "mood", picks: {}, done: true });
  assert.equal(room.st.phase, "cards");
  assert.deepEqual(room.flush().want, { k: "details", ids: room.st.cards });

  const cards = room.view(ids[0]).cards;
  assert.ok(cards.length >= 3);
  assert.ok(!cards.some((c) => c.place.cuisine === "hotpot"));
  const ramen = cards.find((c) => c.place.cuisine === "ramen")!.place.id;
  const other = cards.find((c) => c.place.cuisine !== "ramen")!.place.id;
  room.handle(ids[0], { t: "ballot", approve: [ramen, other], veto: null, done: true });
  room.handle(ids[1], { t: "ballot", approve: [ramen], veto: other, done: true });
  room.handle(ids[2], { t: "ballot", approve: [ramen], veto: null, done: true });
  assert.equal(room.st.phase, "result");
  assert.equal(room.st.result!.winner, ramen);

  assert.equal(room.rate("dddddddd", { overall: "up", liked: true, wait: 15 }).status, "new");
  assert.equal(room.rate("dddddddd", { overall: "mid", liked: true, wait: 15 }).status, "again");
  assert.deepEqual(room.view(ids[0]).ratings, { n: 1, up: 0, mid: 1, down: 0, liked: 1 });
  // The host's exact position isn't in anyone's view.
  assert.equal("center" in room.view(ids[1]), false);
});

test("details fill in a card's description only when the search had none", () => {
  const { room, ids, places } = setup();
  room.handle(ids[0], { t: "start" });
  room.found(places().map((p, i) => ({ ...p, about: i % 2 ? undefined : `搜索里的介绍 ${i}` })));
  const [a, b] = room.st.places;
  room.enrich({ [a.id]: { phone: "(604) 111-1111", about: "From details" }, [b.id]: { about: "From details" } });
  assert.equal(a.about, "搜索里的介绍 0");
  assert.equal(a.phone, "(604) 111-1111");
  assert.equal(b.about, "From details");
});

test("rounds end on the clock for people who don't finish", () => {
  const { room, ids, places, advance } = setup();
  room.handle(ids[0], { t: "start" });
  room.found(places());
  room.handle(ids[0], { t: "mood", picks: { ramen: "like" }, done: false });
  advance(TIMING.mood);
  room.tick();
  assert.equal(room.st.phase, "cards");
  advance(TIMING.cards);
  room.tick();
  // Nobody voted: everything ties and the spinner picks.
  assert.equal(room.st.phase, "spin");
  advance(TIMING.spin);
  room.tick();
  assert.equal(room.st.phase, "result");
});

test("someone who joins late with a severe allergy knocks unsafe cards out", () => {
  const { room, ids, places } = setup();
  room.handle(ids[0], { t: "start" });
  room.found(places());
  room.handle(ids[0], { t: "next" });
  assert.equal(room.st.phase, "cards");
  const before = room.view(ids[0]).cards.map((c) => c.place.cuisine);
  assert.ok(before.some((c) => SEVERE_RULES_OUT.shellfish!.includes(c)), `cards: ${before}`);
  room.join("eeeeeeee", "eeeeeeee-key-long-enough", { lang: "en" });
  room.handle("eeeeeeee", { t: "limits", limits: { allergies: { shellfish: "severe" }, custom: [], halal: false, vegetarian: false, budget: 0 } });
  const after = room.view(ids[0]).cards.map((c) => c.place.cuisine);
  assert.ok(!after.some((c) => SEVERE_RULES_OUT.shellfish!.includes(c)), `cards: ${after}`);
});

test("nothing fits: back to the lobby with a reason, host can widen the range", () => {
  const { room, ids } = setup();
  room.handle(ids[0], { t: "start" });
  room.found([]);
  assert.equal(room.st.phase, "lobby");
  assert.equal(room.st.error, "nothingNearby");
  room.handle(ids[0], { t: "again", range: "drive15" });
  assert.equal(room.st.range, "drive15");
  assert.equal(room.st.error, null);
  room.handle(ids[0], { t: "start" });
  const closed: Place[] = [{ id: "x", name: "x", cuisine: "thai", lat: center.lat, lng: center.lng, openNow: false }];
  room.found(closed);
  assert.equal(room.st.error, "nothingFits");
});

test("when the host's phone is gone, anyone can move the table along (after a minute's grace)", () => {
  const { room, ids, advance } = setup();
  room.leave(ids[0]);
  room.handle(ids[1], { t: "start" });
  assert.equal(room.st.phase, "lobby");
  advance(TIMING.awayGrace);
  room.handle(ids[1], { t: "start" });
  assert.equal(room.st.phase, "finding");
});

/** Start, find, everyone done in round 1, everyone approves the first card: a result. */
function toResult(s: ReturnType<typeof setup>) {
  const { room, ids, places } = s;
  room.handle(ids[0], { t: "start" });
  room.found(places());
  for (const id of ids) room.handle(id, { t: "mood", picks: {}, done: true });
  const first = room.view(ids[0]).cards[0].place.id;
  for (const id of ids) room.handle(id, { t: "ballot", approve: [first], veto: null, done: true });
  assert.equal(room.st.phase, "result");
  return first;
}

test("a late or second 'next' doesn't skip round 2", () => {
  const { room, ids, places } = setup();
  room.handle(ids[0], { t: "start" });
  room.found(places());
  room.handle(ids[0], { t: "next", phase: "mood" });
  assert.equal(room.st.phase, "cards");
  room.handle(ids[0], { t: "next", phase: "mood" });
  assert.equal(room.st.phase, "cards");
  room.handle(ids[0], { t: "next", phase: "cards" });
  assert.notEqual(room.st.phase, "cards");
});

test("a phone that drops off to look at a map doesn't end the round without it", () => {
  const { room, ids, places, advance } = setup();
  room.handle(ids[0], { t: "start" });
  room.found(places());
  room.handle(ids[0], { t: "mood", picks: {}, done: true });
  room.handle(ids[1], { t: "mood", picks: {}, done: true });
  room.leave(ids[2]);
  assert.equal(room.st.phase, "mood");
  assert.ok(room.view(ids[0]).members.find((m) => m.id === ids[2])!.online);
  // Back in time: it carries on.
  assert.ok(room.join(ids[2], `${ids[2]}-key-long-enough`, { lang: "zh" }));
  room.handle(ids[2], { t: "mood", picks: {}, done: true });
  assert.equal(room.st.phase, "cards");
  // Gone for good: after the grace, the others don't wait for it.
  room.leave(ids[2]);
  advance(TIMING.awayGrace);
  for (const id of ids.slice(0, 2)) room.handle(id, { t: "ballot", approve: [], veto: null, done: true });
  assert.notEqual(room.st.phase, "cards");
});

test("ratings: at most one per person at the table; the meal before 'start over' can still be rated", () => {
  const s = setup();
  const { room, ids } = s;
  const winner = toResult(s);
  const r = { overall: "up" as const, liked: true, wait: 0 as const };
  assert.deepEqual(room.rate("11111111", r), { status: "new", winner });
  assert.equal(room.rate("22222222", r).status, "new");
  assert.equal(room.rate("11111111", r).status, "again");
  assert.equal(room.rate("33333333", r).status, "new");
  // Three people, three ratings: a shared link can't add more.
  assert.equal(room.rate("44444444", r).status, "closed");
  assert.equal(room.rate("not-hex!", r).status, "closed");

  const t = setup();
  const won = toResult(t);
  t.room.rate("11111111", r);
  t.room.handle(t.ids[0], { t: "again" });
  assert.equal(t.room.st.phase, "lobby");
  assert.deepEqual(t.room.rate("22222222", r), { status: "new", winner: won });
  assert.equal(t.room.rate("11111111", r).status, "again");
});

test("a table holds at most MAX_MEMBERS people", () => {
  const { room } = setup();
  for (let i = room.st.members ? Object.keys(room.st.members).length : 0; i < MAX_MEMBERS; i++) {
    const id = i.toString(16).padStart(8, "f");
    assert.ok(room.join(id, `${id}-key-long-enough`, { lang: "zh" }), `seat ${i}`);
  }
  assert.ok(room.full("0123abcd"));
  assert.equal(room.join("0123abcd", "0123abcd-key-long-enough", { lang: "zh" }), false);
});

test("the result stays on screen, flagged, if someone who joins afterwards can't eat there", () => {
  const s = setup();
  const { room, ids } = s;
  const winner = toResult(s);
  const cuisine = room.st.places.find((p) => p.id === winner)!.cuisine;
  const allergen = (Object.entries(SEVERE_RULES_OUT).find(([, cs]) => cs!.includes(cuisine)) ?? [])[0];
  assert.ok(allergen, `some severe allergy rules out ${cuisine}`);
  room.join("eeeeeeee", "eeeeeeee-key-long-enough", { lang: "zh" });
  room.handle("eeeeeeee", { t: "limits", limits: { allergies: { [allergen!]: "severe" }, custom: [], halal: false, vegetarian: false, budget: 0 } });
  const v = room.view(ids[0]);
  assert.equal(v.winner?.place.id, winner);
  assert.equal(v.winner?.unsafe, true);
});

test("a returning phone needs its key", () => {
  const { room, ids } = setup();
  assert.equal(room.join(ids[0], "wrong-key-but-long-enough", { lang: "zh" }), false);
  assert.equal(room.join(ids[0], `${ids[0]}-key-long-enough`, { lang: "zh" }), true);
});

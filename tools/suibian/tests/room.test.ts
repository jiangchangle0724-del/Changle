// One table from lobby to rating, with no network: the same Room the server runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMON_IN, TOP_COUNT, vancouverClock, vancouverDay, vancouverMs, type Place } from "../src/engine";
import { MAX_MEMBERS, MAX_SEARCHES, RATING_SLACK, TIMING } from "../src/room/protocol";
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
  // Severe peanut: the cuisines that use it a lot come last among the twelve chips. The view doesn't say who.
  const peanutChip = v.chips.map((c) => COMMON_IN.peanut!.includes(c.cuisine));
  assert.equal(v.chips.length, 12);
  assert.ok(peanutChip.indexOf(true) === -1 || peanutChip.slice(peanutChip.indexOf(true)).every(Boolean), String(peanutChip));
  // The merged summary only comes with the result (see below), and nothing says who.
  assert.deepEqual(v.table.allergies, {});
  assert.ok(!JSON.stringify(v).includes("peanut"));
  // Round 1 counts stay hidden while people choose.
  room.handle(ids[0], { t: "mood", picks: { ramen: "like", italian: "ban" }, done: true });
  assert.ok(room.view(ids[1]).chips.every((c) => c.likes === 0 && c.bans === 0));
  room.handle(ids[1], { t: "mood", picks: { ramen: "like" }, done: true });
  room.handle(ids[2], { t: "mood", picks: {}, done: true });
  assert.equal(room.st.phase, "cards");
  // Every place is on the list; details (photos, reviews) only for the top of it.
  assert.equal(room.st.cards.length, places().length);
  assert.deepEqual(room.flush().want, { k: "details", ids: room.st.cards.slice(0, TOP_COUNT) });

  const cards = room.view(ids[0]).cards;
  assert.deepEqual(cards.map((c) => c.rank), cards.map((_, i) => i + 1));
  // Someone said no to Italian: it's still there, out of the top, with how many said no.
  const italian = cards.find((c) => c.place.cuisine === "italian")!;
  assert.ok(italian.rank > TOP_COUNT);
  assert.equal(italian.bans, 1);
  // Severe peanut: the cuisines that use it a lot are all at the bottom, each saying so.
  const peanut = cards.filter((c) => COMMON_IN.peanut!.includes(c.place.cuisine));
  assert.ok(peanut.length >= 3);
  assert.deepEqual(peanut.map((c) => c.rank), cards.slice(cards.length - peanut.length).map((c) => c.rank));
  for (const c of peanut) assert.deepEqual(c.concerns, [{ k: "allergy", allergen: "peanut", level: "severe" }]);
  // Ramen, liked by two, says so.
  const liked = cards.find((c) => c.place.cuisine === "ramen")!;
  assert.equal(liked.likes, 2);
  assert.ok(liked.reasons.includes("liked"));
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

test("someone who joins late: a severe allergy only adds notes, a lower budget takes places over it off", () => {
  const { room, ids, places } = setup();
  room.handle(ids[0], { t: "start" });
  room.found(places());
  room.handle(ids[0], { t: "next" });
  assert.equal(room.st.phase, "cards");
  const before = room.view(ids[0]).cards;
  assert.ok(before.some((c) => COMMON_IN.shellfish!.includes(c.place.cuisine)));
  room.join("eeeeeeee", "eeeeeeee-key-long-enough", { lang: "en" });
  room.handle("eeeeeeee", { t: "limits", limits: { allergies: { shellfish: "severe" }, custom: [], halal: false, vegetarian: false, budget: 0 } });
  const after = room.view(ids[0]).cards;
  assert.deepEqual(after.map((c) => c.place.id), before.map((c) => c.place.id), "the same list, in the same order");
  for (const c of after.filter((c) => COMMON_IN.shellfish!.includes(c.place.cuisine))) assert.deepEqual(c.concerns, [{ k: "allergy", allergen: "shellfish", level: "severe" }]);
  room.handle("eeeeeeee", { t: "limits", limits: { allergies: {}, custom: [], halal: false, vegetarian: false, budget: 20 } });
  const cheap = room.view(ids[0]).cards;
  assert.ok(cheap.length < before.length);
  assert.ok(cheap.every((c) => c.place.price === undefined || c.place.price <= 20));
  assert.deepEqual(cheap.map((c) => c.rank), cheap.map((_, i) => i + 1));
});

test("the cards' fingerprint: the same while nothing changes, new when the list or anyone's limits do", () => {
  const { room, ids, places } = setup();
  room.handle(ids[0], { t: "start" });
  room.found(places());
  room.handle(ids[0], { t: "next" });
  const a = room.view(ids[0]);
  assert.equal(room.view(ids[1]).cardsRev, a.cardsRev, "the same for everyone");
  room.handle(ids[1], { t: "ballot", approve: [a.cards[0].place.id], veto: null, done: false });
  assert.equal(room.view(ids[0]).cardsRev, a.cardsRev, "a vote doesn't change the cards");
  room.enrich({ [a.cards[0].place.id]: { photo: "https://example.com/x.jpg" } });
  const b = room.view(ids[0]);
  assert.notEqual(b.cardsRev, a.cardsRev);
  assert.equal(b.cards[0].place.photo, "https://example.com/x.jpg");
  room.handle(ids[2], { t: "limits", limits: { allergies: { egg: "avoid" }, custom: [], halal: false, vegetarian: false, budget: 0 } });
  assert.notEqual(room.view(ids[0]).cardsRev, b.cardsRev);
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

test("ratings: about one per person over the table's life; the meal before 'start over' can still be rated", () => {
  const s = setup();
  const { room, ids } = s;
  const winner = toResult(s);
  const r = { overall: "up" as const, liked: true, wait: 0 as const };
  assert.deepEqual(room.rate("11111111", r), { status: "new", winner });
  assert.equal(room.rate("11111111", r).status, "again");
  const cap = ids.length + RATING_SLACK;
  for (let i = 2; i <= cap; i++) assert.equal(room.rate(`${i}`.repeat(8), r).status, "new", `rater ${i}`);
  // A shared link can't add more, and another round doesn't open new places either.
  assert.equal(room.rate("abcdef01", r).status, "closed");
  assert.equal(room.rate("not-hex!", r).status, "closed");
  room.handle(ids[0], { t: "again" });
  assert.equal(room.rate("abcdef01", r).status, "closed");

  const t = setup();
  const won = toResult(t);
  t.room.rate("11111111", r);
  t.room.handle(t.ids[0], { t: "again" });
  assert.equal(t.room.st.phase, "lobby");
  assert.deepEqual(t.room.rate("22222222", r), { status: "new", winner: won });
  assert.equal(t.room.rate("11111111", r).status, "again");
});

test("a table runs at most MAX_SEARCHES searches, then says to start a new one", () => {
  const { room, ids } = setup();
  for (let i = 0; i < MAX_SEARCHES; i++) {
    room.handle(ids[0], { t: "start" });
    assert.equal(room.st.phase, "finding", `search ${i + 1}`);
    room.found([]);
    room.handle(ids[0], { t: "again" });
  }
  room.flush();
  room.handle(ids[0], { t: "start" });
  assert.equal(room.st.phase, "lobby");
  assert.equal(room.view(ids[0]).error, "searchLimit");
  assert.equal(room.flush().want, null);
});

test("when a phone's grace minute runs out, the room wakes up and tells everyone", () => {
  const { room, ids, advance, env } = setup();
  room.leave(ids[0]);
  room.flush();
  assert.equal(room.nextWake(), env.now() + TIMING.awayGrace);
  assert.ok(room.view(ids[1]).members.find((m) => m.host)!.online);
  advance(TIMING.awayGrace);
  room.tick();
  assert.equal(room.flush().changed, true);
  assert.equal(room.view(ids[1]).members.find((m) => m.host)!.online, false);
  room.handle(ids[1], { t: "start" });
  assert.equal(room.st.phase, "finding");
});

test("the merged diet summary goes out only with the result", () => {
  const s = setup();
  const { room, ids } = s;
  room.handle(ids[1], { t: "limits", limits: { allergies: { peanut: "severe" }, custom: [], halal: false, vegetarian: false, budget: 0 } });
  assert.deepEqual(room.view(ids[0]).table.allergies, {});
  toResult(s);
  assert.deepEqual(room.view(ids[0]).table.allergies, { peanut: "severe" });
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
  assert.equal(room.view(ids[0]).winner?.unsafe, false);
  const won = room.st.places.find((p) => p.id === winner)!;
  const allergen = (Object.entries(COMMON_IN).find(([, cs]) => cs!.includes(won.cuisine)) ?? [])[0];
  assert.ok(allergen, `some allergen is common in ${won.cuisine}`);
  room.join("eeeeeeee", "eeeeeeee-key-long-enough", { lang: "zh" });
  room.handle("eeeeeeee", { t: "limits", limits: { allergies: { [allergen!]: "severe" }, custom: [], halal: false, vegetarian: false, budget: 0 } });
  const v = room.view(ids[0]);
  assert.equal(v.winner?.place.id, winner);
  assert.equal(v.winner?.unsafe, "severe");
  room.handle("eeeeeeee", { t: "limits", limits: { allergies: {}, custom: [], halal: false, vegetarian: false, budget: 20 } });
  if (won.price! > 20) assert.equal(room.view(ids[0]).winner?.unsafe, "budget");
});

test("a returning phone needs its key", () => {
  const { room, ids } = setup();
  assert.equal(room.join(ids[0], "wrong-key-but-long-enough", { lang: "zh" }), false);
  assert.equal(room.join(ids[0], `${ids[0]}-key-long-enough`, { lang: "zh" }), true);
});

test("planning ahead: the host sets when in the lobby; the list is what's open then, each card saying until when", () => {
  const { room, ids, places, env } = setup();
  const now = env.now();
  const tomorrow = vancouverDay(now, 1);
  const lunch = vancouverMs(tomorrow, 12 * 60);
  room.handle(ids[1], { t: "when", at: lunch }); // not the host: ignored
  assert.equal(room.view(ids[0]).at, null);
  room.handle(ids[0], { t: "when", at: lunch });
  assert.equal(room.view(ids[1]).at, lunch);
  room.handle(ids[0], { t: "start" });
  // The demo dim sum place (demo-0) closes 15:00–17:00; the rest are open 11:00–22:00, a quarter of them not on Mondays.
  room.found(places());
  room.handle(ids[0], { t: "next" });
  const cards = room.view(ids[0]).cards;
  assert.ok(cards.length > 0);
  for (const c of cards) {
    assert.equal(c.at, lunch);
    assert.equal(c.open, true);
    assert.ok(c.closesAt! > lunch);
    assert.equal(vancouverClock(c.closesAt!).minutes % 60, 0);
    assert.equal("hours" in c.place, false, "the week's hours stay on the server");
  }
  // Tea time: the dim sum place is shut.
  const t = setup();
  t.room.handle(t.ids[0], { t: "when", at: vancouverMs(tomorrow, 16 * 60) });
  t.room.handle(t.ids[0], { t: "start" });
  t.room.found(t.places());
  t.room.handle(t.ids[0], { t: "next" });
  assert.ok(!t.room.view(t.ids[0]).cards.some((c) => c.place.id === "demo-0"));
  // Once the game is under way the time can't change.
  room.handle(ids[0], { t: "when", at: null });
  assert.equal(room.view(ids[0]).at, lunch);
});

test("a planned time that has come is now", () => {
  const { room, ids, env, advance } = setup();
  room.handle(ids[0], { t: "when", at: env.now() + 3600_000 });
  assert.ok(room.view(ids[0]).at);
  advance(3600_000 - 10 * 60_000);
  assert.equal(room.view(ids[0]).at, null);
});


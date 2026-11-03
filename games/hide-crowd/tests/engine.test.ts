import assert from "node:assert/strict";
import test from "node:test";
import {
  ARENA,
  HIDE_AWAY_DISTANCE,
  MATCH_MS,
  CHARACTER_COLLISION_DIAMETER,
  NPC_COUNT,
  PLAYER_SPEED,
  crowdSeparationVelocity,
  SCORE_TO_WIN,
  STUN_MS,
  advanceMatch,
  createMatch,
  normalizeVector,
  roundPenalty,
  startBlend,
  startPunch,
  type MatchState
} from "../src/engine";

const players = [{ id: "player-one", name: "One" }, { id: "player-two", name: "Two" }];

test("match setup puts two to eight players into a deterministic crowd", () => {
  const match = createMatch(players, 10, 42);
  assert.equal(match.characters.filter((character) => character.kind === "player").length, 2);
  assert.equal(match.characters.filter((character) => character.kind === "npc").length, NPC_COUNT);
  assert.equal(match.endsAt, 10 + MATCH_MS);
  assert.deepEqual(createMatch(players, 10, 42), match);
  assert.throws(() => createMatch([{ id: "solo", name: "Solo" }]), RangeError);
});

test("the crowd's order doesn't tell players from passers-by", () => {
  // every screen draws the crowd in this order (each place keeps its look), so the players must not
  // always be first: over many seeds they land all over the list
  const places = new Set<number>();
  let firstTwoArePlayers = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const match = createMatch(players, 0, seed);
    match.characters.forEach((character, index) => character.kind === "player" && places.add(index));
    if (match.characters[0].kind === "player" && match.characters[1].kind === "player") firstTwoArePlayers++;
  }
  assert.ok(places.size >= 18, `players took ${places.size} different places`);
  assert.ok(firstTwoArePlayers < 10, "the players are not simply put first");
  // and the spots on the grid change with the seed too
  const spot = (seed: number) => createMatch(players, 0, seed).characters.find((character) => character.ownerId === "player-one")!;
  assert.notDeepEqual([spot(1).x, spot(1).y], [spot(2).x, spot(2).y]);
});

test("a full lobby fits the expanded crowd grid", () => {
  const full = Array.from({ length: 8 }, (_, index) => ({ id: "p" + index, name: "Player " + index }));
  const match = createMatch(full, 0, 22);
  assert.equal(match.characters.length, 8 + NPC_COUNT);
  for (const character of match.characters) {
    assert.ok(character.x >= ARENA.marginX && character.x <= ARENA.width - ARENA.marginX);
    assert.ok(character.y >= ARENA.marginY && character.y <= ARENA.height - ARENA.marginY);
  }
});

test("movement input is finite, normalized, and stays inside the arena", () => {
  assert.deepEqual(normalizeVector({ x: 8, y: 8 }), { x: 0.7071067811865475, y: 0.7071067811865475 });
  assert.deepEqual(normalizeVector({ x: Number.NaN, y: -Infinity }), { x: 0, y: 0 });
  const match = createMatch(players, 0, 3);
  const before = match.characters.find((character) => character.ownerId === "player-one")!;
  before.x = ARENA.width - ARENA.marginX;
  const next = advanceMatch(match, 100, { "player-one": { x: 1, y: 0 } });
  const moved = next.characters.find((character) => character.ownerId === "player-one")!;
  assert.ok(moved.x <= ARENA.width - ARENA.marginX);
  assert.ok(moved.y >= ARENA.marginY && moved.y <= ARENA.height - ARENA.marginY);
  assert.equal(before.x, ARENA.width - ARENA.marginX);
});



test("player movement accelerates, brakes, and turns without snapping", () => {
  let match: MatchState = createMatch(players, 0, 18);
  const playerId = "player-one";
  const startX = match.characters.find((character) => character.ownerId === playerId)!.x;
  for (let now = 65; now <= 650; now += 65) match = advanceMatch(match, now, { [playerId]: { x: 1, y: 0 } });
  const cruising = match.characters.find((character) => character.ownerId === playerId)!;
  assert.ok(cruising.x - startX > PLAYER_SPEED * 0.45, "a held input should build speed over several server ticks");
  assert.ok(cruising.velocity.x > PLAYER_SPEED * 0.9, "the player should settle near the speed cap");
  assert.equal(cruising.velocity.y, 0);
  const stopped = advanceMatch(match, 715, {});
  const braking = stopped.characters.find((character) => character.ownerId === playerId)!;
  assert.ok(braking.velocity.x < cruising.velocity.x, "releasing the stick should apply braking");
  assert.ok(braking.x > cruising.x, "momentum should carry the player a short distance");
  assert.ok(cruising.velocity.x > PLAYER_SPEED * 0.9, "advancing a snapshot must not mutate the previous state");

  const turning = createMatch(players, 0, 19);
  const faced = advanceMatch(turning, 65, { [playerId]: { x: 0, y: 1 } }).characters.find((character) => character.ownerId === playerId)!;
  assert.ok(faced.facing > 0 && faced.facing < Math.PI / 2, "facing should rotate toward movement rather than snap");
});

test("crowd separation resolves body contact without stacking or NaN motion", () => {
  const match = createMatch(players, 0, 24);
  const first = match.characters.find((character) => character.ownerId === "player-one")!;
  const second = match.characters.find((character) => character.ownerId === "player-two")!;
  first.x = second.x = 50;
  first.y = second.y = 29;
  const firstSeparation = crowdSeparationVelocity(first, match.characters);
  const secondSeparation = crowdSeparationVelocity(second, match.characters);
  assert.ok(Math.hypot(firstSeparation.x, firstSeparation.y) > 0);
  assert.ok(Math.hypot(firstSeparation.x + secondSeparation.x, firstSeparation.y + secondSeparation.y) < 0.001);
  const next = advanceMatch(match, 50, {});
  const movedFirst = next.characters.find((character) => character.ownerId === "player-one")!;
  const movedSecond = next.characters.find((character) => character.ownerId === "player-two")!;
  assert.ok(Math.hypot(movedFirst.x - movedSecond.x, movedFirst.y - movedSecond.y) >= CHARACTER_COLLISION_DIAMETER - 0.02);
  assert.ok(Number.isFinite(movedFirst.velocity.x) && Number.isFinite(movedSecond.velocity.y));
});

test("metro walkways carry idle players and the gallery spotlight boosts movement", () => {
  const players = [{ id: "one", name: "One" }, { id: "two", name: "Two" }];
  const metro = createMatch(players, 0, 20, "metro");
  const metroPlayer = metro.characters.find((character) => character.ownerId === "one")!;
  const metroStart = metroPlayer.x;
  const carried = advanceMatch(metro, 100, {});
  assert.ok(carried.characters.find((character) => character.ownerId === "one")!.x > metroStart);

  const gallery = createMatch(players, 0, 21, "gallery");
  const spotlightPlayer = gallery.characters.find((character) => character.ownerId === "one")!;
  spotlightPlayer.x = 50;
  spotlightPlayer.y = 29;
  const base = createMatch(players, 0, 21, "plaza");
  const basePlayer = base.characters.find((character) => character.ownerId === "one")!;
  basePlayer.x = 50;
  basePlayer.y = 29;
  let galleryMoved = gallery;
  let plazaMoved = base;
  for (let now = 100; now <= 1_000; now += 100) {
    galleryMoved = advanceMatch(galleryMoved, now, { one: { x: 1, y: 0 } });
    plazaMoved = advanceMatch(plazaMoved, now, { one: { x: 1, y: 0 } });
  }
  assert.ok(galleryMoved.characters.find((character) => character.ownerId === "one")!.x > plazaMoved.characters.find((character) => character.ownerId === "one")!.x);
});
test("ambient crowd follows varied, deterministic walking routes", () => {
  const first = createMatch(players, 0, 42);
  const second = createMatch(players, 0, 42);
  const walked = advanceMatch(first, 250, {});
  const repeated = advanceMatch(second, 250, {});
  assert.deepEqual(walked, repeated);
  const npcMoves = walked.characters.filter((character) => character.kind === "npc").map((character) => {
    const before = first.characters.find((item) => item.id === character.id)!;
    return [Math.round((character.x - before.x) * 100), Math.round((character.y - before.y) * 100)].join(":");
  });
  assert.ok(npcMoves.some((move) => move.includes(":") && !move.endsWith(":0")), "some walkers should cross lanes");
  assert.ok(new Set(npcMoves).size > 1, "the crowd should not move as one synchronized line");
});
test("a punch has a wind-up, respects cooldown, and tags only a rival in its front arc", () => {
  const match = createMatch(players, 0, 7);
  const actor = match.characters.find((character) => character.ownerId === "player-one")!;
  const target = match.characters.find((character) => character.ownerId === "player-two")!;
  actor.x = 40;
  actor.y = 28;
  actor.facing = 0;
  target.x = 46;
  target.y = 28;
  for (const npc of match.characters.filter((character) => character.kind === "npc")) {
    npc.x = 8;
    npc.y = 8;
  }

  const windup = startPunch(match, "player-one", 0);
  assert.equal(windup.characters.find((character) => character.ownerId === "player-one")?.pose, "windup");
  assert.equal(startPunch(windup, "player-one", 20), windup);
  const tagged = advanceMatch(windup, 160, {});
  assert.equal(tagged.characters.find((character) => character.ownerId === "player-one")?.score, 1);
  assert.ok((tagged.characters.find((character) => character.ownerId === "player-two")?.stunnedUntil ?? 0) > 160);
  assert.ok((tagged.characters.find((character) => character.ownerId === "player-two")?.recoil.x ?? 0) > 0);
  const knockedBack = advanceMatch(tagged, 260, {});
  assert.ok(knockedBack.characters.find((character) => character.ownerId === "player-two")!.x > 46);
  assert.equal(tagged.events.at(-1)?.t, "tag");
  assert.equal(tagged.characters.find((character) => character.ownerId === "player-one")?.pose, "punch");
  const followThrough = advanceMatch(tagged, 220, {});
  assert.equal(followThrough.characters.find((character) => character.ownerId === "player-one")?.pose, "punch");
  const recovered = advanceMatch(followThrough, 400, {});
  assert.notEqual(recovered.characters.find((character) => character.ownerId === "player-one")?.pose, "punch");
});

test("hitting a passer-by causes a short stun and does not award a tag", () => {
  const match = createMatch(players, 0, 9);
  const actor = match.characters.find((character) => character.ownerId === "player-one")!;
  const target = match.characters.find((character) => character.ownerId === "player-two")!;
  const npc = match.characters.find((character) => character.kind === "npc")!;
  actor.x = 40;
  actor.y = 28;
  actor.facing = 0;
  npc.x = 44;
  npc.y = 28;
  target.x = 48;
  target.y = 28;
  for (const other of match.characters.filter((character) => character.kind === "npc" && character.id !== npc.id)) {
    other.x = 8;
    other.y = 8;
  }

  const result = advanceMatch(startPunch(match, "player-one", 0), 160, {});
  assert.equal(result.characters.find((character) => character.ownerId === "player-one")?.score, 0);
  assert.ok((result.characters.find((character) => character.ownerId === "player-one")?.stunnedUntil ?? 0) > 160);
  assert.equal(result.events.at(-1)?.t, "foul");
});

test("blending has a timed cooldown and does not alter score", () => {
  const match = createMatch(players, 0, 4);
  const blended = startBlend(match, "player-one", 100);
  const player = blended.characters.find((character) => character.ownerId === "player-one")!;
  assert.equal(player.blendUntil, 100 + 1_450);
  assert.equal(startBlend(blended, "player-one", 200), blended);
  const moving = advanceMatch(blended, 300, { "player-one": { x: 1, y: 0 } });
  assert.equal(moving.characters.find((character) => character.ownerId === "player-one")?.pose, "glance");
  assert.equal(player.score, 0);
});

test("the first player to the score target wins; a clock with no tags ends with no winner", () => {
  let match = createMatch(players, 0, 12);
  let at = 0;
  for (let hit = 0; hit < SCORE_TO_WIN; hit++) {
    // let the last tag's victim get up and slip away, then line them up again
    match = advanceMatch(match, at, {});
    const actor = match.characters.find((character) => character.ownerId === "player-one")!;
    const target = match.characters.find((character) => character.ownerId === "player-two")!;
    actor.x = 40;
    actor.y = 28;
    actor.facing = 0;
    target.x = 46;
    target.y = 28;
    for (const npc of match.characters.filter((character) => character.kind === "npc")) {
      npc.x = 8;
      npc.y = 8;
    }
    match = advanceMatch(startPunch(match, "player-one", at), at + 160, {});
    at += 160 + STUN_MS + 100;
  }
  assert.equal(match.phase, "over");
  assert.equal(match.winnerId, "player-one");
  assert.equal(match.characters.find((character) => character.ownerId === "player-one")?.score, SCORE_TO_WIN);
  assert.equal(match.characters.find((character) => character.ownerId === "player-two")?.tagged, SCORE_TO_WIN);

  let quiet = createMatch(players, 0, 13);
  quiet = advanceMatch(quiet, MATCH_MS + 1, {});
  assert.equal(quiet.phase, "over");
  assert.equal(quiet.winnerId, null);
});

test("a tagged player gets up in a passer-by's body far away, and nothing on screen jumps", () => {
  let match = createMatch(players, 0, 31);
  const actor = match.characters.find((character) => character.ownerId === "player-one")!;
  const target = match.characters.find((character) => character.ownerId === "player-two")!;
  actor.x = 20;
  actor.y = 28;
  actor.facing = 0;
  target.x = 26;
  target.y = 28;
  match = advanceMatch(startPunch(match, "player-one", 0), 160, {});
  const tagged = match.characters.findIndex((character) => character.ownerId === "player-two");
  assert.ok(match.characters[tagged].hideAt !== null, "the tagged player is down, waiting to slip away");
  const before = match.characters.map((character) => [character.x, character.y]);
  match = advanceMatch(match, 160 + STUN_MS + 1, {});
  const now = match.characters.findIndex((character) => character.ownerId === "player-two");
  assert.notEqual(now, tagged, "the player is in another body");
  assert.equal(match.characters[tagged].kind, "npc", "a passer-by gets up where they fell");
  const hunter = match.characters.find((character) => character.ownerId === "player-one")!;
  const body = match.characters[now];
  assert.ok(Math.hypot(body.x - hunter.x, body.y - hunter.y) >= HIDE_AWAY_DISTANCE - 1, "far from whoever tagged them");
  // every place in the list moved only a step this frame: no screen sees anyone teleport
  match.characters.forEach((character, index) => {
    assert.ok(Math.hypot(character.x - before[index][0], character.y - before[index][1]) < 2, `place ${index} didn't jump`);
  });
  assert.equal(match.events.at(-1)?.t, "hide");
  assert.equal(body.tagged, 1, "the count goes with the player");
  assert.equal(body.hideAt, null);
});

test("the round's penalty lands on whoever was spotted most, or on everyone when nobody was", () => {
  const match = createMatch([...players, { id: "player-three", name: "Three" }], 0, 5);
  const owner = (id: string) => match.characters.find((character) => character.ownerId === id)!;
  assert.deepEqual(roundPenalty(match), { kind: "everyone", who: [], times: 0 });
  owner("player-two").tagged = 2;
  owner("player-three").tagged = 1;
  assert.deepEqual(roundPenalty(match), { kind: "sip", who: ["player-two"], times: 2 });
  owner("player-three").tagged = 2;
  assert.deepEqual(roundPenalty(match).who.sort(), ["player-three", "player-two"], "a tie: both take it");
});

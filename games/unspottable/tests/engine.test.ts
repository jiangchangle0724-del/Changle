import assert from "node:assert/strict";
import test from "node:test";
import {
  ARENA,
  MATCH_MS,
  NPC_COUNT,
  SCORE_TO_WIN,
  advanceMatch,
  createMatch,
  normalizeVector,
  startBlend,
  startPunch
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

test("movement input is finite, normalized, and stays inside the arena", () => {
  assert.deepEqual(normalizeVector({ x: 8, y: 8 }), { x: 0.7071067811865475, y: 0.7071067811865475 });
  assert.deepEqual(normalizeVector({ x: Number.NaN, y: -Infinity }), { x: 0, y: 0 });
  const match = createMatch(players, 0, 3);
  const before = match.characters.find((character) => character.ownerId === "player-one")!;
  before.x = 94;
  const next = advanceMatch(match, 100, { "player-one": { x: 1, y: 0 } });
  const moved = next.characters.find((character) => character.ownerId === "player-one")!;
  assert.equal(moved.x, ARENA.width - ARENA.marginX);
  assert.equal(moved.y, before.y);
  assert.equal(before.x, 94);
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
  const galleryMoved = advanceMatch(gallery, 100, { one: { x: 1, y: 0 } });
  const plazaMoved = advanceMatch(base, 100, { one: { x: 1, y: 0 } });
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

test("the first player to the score target wins; a tied clock ends in a draw", () => {
  let match = createMatch(players, 0, 12);
  for (const hitAt of [0, 820, 1_640]) {
    match = advanceMatch(match, hitAt === 0 ? 0 : hitAt - 1, {});
    const actor = match.characters.find((character) => character.ownerId === "player-one")!;
    const target = match.characters.find((character) => character.ownerId === "player-two")!;
    actor.x = 40;
    actor.y = 28;
    actor.facing = 0;
    target.x = 46;
    target.y = 28;
    target.stunnedUntil = 0;
    for (const npc of match.characters.filter((character) => character.kind === "npc")) {
      npc.x = 8;
      npc.y = 8;
    }
    match = advanceMatch(startPunch(match, "player-one", hitAt), hitAt + 160, {});
  }
  assert.equal(match.phase, "over");
  assert.equal(match.winnerId, "player-one");
  assert.equal(match.characters.find((character) => character.ownerId === "player-one")?.score, SCORE_TO_WIN);

  let tied = createMatch(players, 0, 13);
  tied = advanceMatch(tied, MATCH_MS + 1, {});
  assert.equal(tied.phase, "over");
  assert.equal(tied.winnerId, null);
});
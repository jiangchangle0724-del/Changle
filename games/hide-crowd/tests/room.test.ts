import assert from "node:assert/strict";
import test from "node:test";
import { ARENA, BITE_MS, MATCH_MS, SIMULATION_STEP_MS, STALLS, STUN_MS, characterForOwner } from "../src/engine";
import { HOST_GRACE, HOST_HOLD, Room } from "../src/room/room";

const first = "player-one";
const second = "player-two";
const third = "player-three";
const screen = "screen-one";

function twoPlayerRoom() {
  const room = Room.create("1234", 0, 1);
  assert.equal(room.join(first, "Ari", "en", "player", 1), "ok");
  assert.equal(room.join(second, "Bo", "zh", "player", 2), "ok");
  return room;
}

/** Put two players face to face, everyone else far away, and let the first punch. */
function tag(room: Room, attacker: string, target: string, at: number) {
  const game = room.st.game!;
  const actor = characterForOwner(game, attacker)!;
  const victim = characterForOwner(game, target)!;
  actor.x = 40;
  actor.y = 28;
  actor.facing = 0;
  victim.x = 46;
  victim.y = 28;
  for (const other of game.characters) if (other !== actor && other !== victim) Object.assign(other, { x: 8, y: 8 });
  room.handle(attacker, { t: "punch" }, at);
  room.advance(at + 170);
}

test("the first player becomes host, and a host who drops hands over after a grace period", () => {
  const room = twoPlayerRoom();
  assert.equal(room.view(first, "player", 3).you.host, true);
  room.presence(first, false, 4);
  assert.equal(room.view(second, "player", 5).you.host, false, "a reload doesn't cost the host the role");
  room.claimHost(4 + HOST_GRACE + 1);
  assert.equal(room.view(second, "player", 5 + HOST_GRACE).you.host, true);
  assert.equal(room.info(5).players, 2);
});

test("a room opened from a changle.ca table keeps the table's host, its code and its own penalty", () => {
  const room = Room.create("5678", 0, 2, { host: "0123456789abcdef01234567", table: "ABCD", penalty: "10 squats" });
  assert.equal(room.join(second, "Bo", "zh", "player", 10), "ok");
  assert.equal(room.view(second, "player", 11).you.host, false, "the table's host has a while to arrive");
  assert.equal(room.join("0123456789abcdef01234567", "Steve", "zh", "player", 20), "ok");
  const view = room.view("0123456789abcdef01234567", "player", 21);
  assert.equal(view.you.host, true);
  assert.equal(view.table, "ABCD");
  assert.equal(view.settings.custom, "10 squats");
  // a host who never comes: after the hold, the next player in
  const late = Room.create("5679", 0, 2, { host: "0123456789abcdef01234567", table: "ABCD" });
  late.join(second, "Bo", "zh", "player", 10);
  late.claimHost(HOST_HOLD + 1);
  assert.equal(late.view(second, "player", HOST_HOLD + 2).you.host, true);
  // and nonsense is ignored
  const odd = Room.create("5680", 0, 2, { host: "<script>", table: "toolong", penalty: 42 });
  assert.equal(odd.st.hostId, null);
  assert.equal(odd.st.table, null);
  assert.equal(odd.st.settings.custom, "");
});

test("only the host starts and the server requires at least two online players", () => {
  const room = Room.create("4321", 0, 2);
  room.join(first, "Ari", "en", "player", 1);
  room.handle(first, { t: "start" }, 2);
  assert.equal(room.st.game, null);
  room.join(second, "Bo", "en", "player", 3);
  room.handle(second, { t: "start" }, 4);
  assert.equal(room.st.game, null);
  room.handle(first, { t: "start" }, 5);
  assert.equal(room.view(first, "player", 6).game?.phase, "playing");
  assert.equal(room.view(first, "player", 6).round, 1);
});

test("movement frames coalesce to simulation ticks and stale input brakes to rest", () => {
  const room = twoPlayerRoom();
  room.handle(first, { t: "start" }, 3);
  const player = characterForOwner(room.st.game!, first)!;
  const startX = player.x;
  room.handle(first, { t: "move", x: 1, y: 0 }, 10);
  assert.equal(room.st.game!.lastTickAt, 3);
  assert.equal(player.x, startX);
  room.advance(3 + SIMULATION_STEP_MS);
  const moving = characterForOwner(room.st.game!, first)!;
  assert.ok(moving.x > startX || moving.velocity.x > 0);
  room.advance(400);
  const stopped = characterForOwner(room.st.game!, first)!;
  assert.equal(room.st.inputs[first], undefined);
  assert.ok(stopped.velocity.x < moving.velocity.x || stopped.velocity.x === 0);
});

test("players vote for an arena and the winning rule starts for every screen; no votes takes turns", () => {
  const room = twoPlayerRoom();
  room.handle(first, { t: "vote", arena: "metro" }, 3);
  room.handle(second, { t: "vote", arena: "metro" }, 4);
  room.handle(first, { t: "vote", arena: "gallery" }, 5);
  assert.deepEqual(room.view(first, "player", 6).arenaVotes, { plaza: 0, metro: 1, gallery: 1, market: 0 });
  assert.equal(room.view(first, "player", 6).you.vote, "gallery");
  room.handle(first, { t: "start" }, 7);
  assert.ok(["metro", "gallery"].includes(room.view(second, "player", 8).game!.arena));
  const quiet = twoPlayerRoom();
  const arenas: string[] = [];
  for (let round = 0; round < 5; round++) {
    quiet.handle(first, { t: "start" }, 10 + round * 100_000);
    arenas.push(quiet.st.game!.arena);
    quiet.advance(10 + round * 100_000 + 80_000);
  }
  assert.deepEqual(arenas, ["plaza", "metro", "gallery", "market", "plaza"]);
});

test("the big screen sees the crowd and the scores but never who is a player", () => {
  const room = twoPlayerRoom();
  assert.equal(room.join(screen, "TV", "en", "screen", 3), "ok");
  room.handle(first, { t: "start" }, 4);
  room.handle(first, { t: "move", x: 1, y: 0 }, 5);
  room.advance(4 + SIMULATION_STEP_MS);
  const tv = room.view(screen, "screen", 60);
  const phone = room.view(first, "player", 60);
  assert.equal(tv.game!.avatars.some((avatar) => avatar.me), false, "no body is marked on the big screen");
  assert.equal([...tv.game!.avatars, ...phone.game!.avatars].some((avatar) => avatar.n !== undefined || avatar.w), false, "nobody is named while the round is on");
  assert.equal(tv.game!.me, null);
  assert.equal(phone.game!.avatars.filter((avatar) => avatar.me).length, 1, "a phone sees its own body");
  const text = JSON.stringify(tv);
  for (const secret of [first, second, "human-", "npc-", "ownerId", "kind", "maxSpeed"]) assert.equal(text.includes(secret), false, `the big screen's view has no ${secret}`);
  // a phone learns nothing about the others either: the same fields for every body, in a shuffled order
  const keys = new Set(phone.game!.avatars.map((avatar) => Object.keys(avatar).filter((key) => key !== "me").sort().join(",")));
  assert.equal(keys.size, 1);
  assert.equal(JSON.stringify(phone).includes(second), false);
  // the order the bodies come in doesn't put the players first
  const playersAt = room.st.game!.characters.map((character, index) => (character.kind === "player" ? index : -1)).filter((index) => index >= 0);
  assert.notDeepEqual(playersAt, [0, 1]);
});

test("a tag scores, the tagged player slips into the crowd, and the round ends in a penalty for the most spotted", () => {
  const room = twoPlayerRoom();
  room.join(third, "Cy", "en", "player", 3);
  room.handle(first, { t: "start" }, 10);
  let at = 20;
  for (let hit = 0; hit < 3; hit++) {
    tag(room, first, second, at);
    at += 170 + STUN_MS + 50;
    room.advance(at);
  }
  const view = room.view(first, "player", at);
  assert.equal(view.phase, "over");
  assert.equal(view.result?.winner, "Ari");
  assert.equal(view.result?.youWon, true);
  assert.deepEqual(view.result?.penalty, { kind: "sip", who: ["Bo"], times: 3 });
  // the titles: the hunter's sharp eye, the one never spotted
  const titles = Object.fromEntries(view.result!.awards.map((item) => [item.name, item.award]));
  assert.equal(titles.Ari, "eagleEye");
  assert.equal(titles.Bo, "punchingBag");
  assert.equal(titles.Cy, "ghost");
  assert.equal(view.result!.awards.find((item) => item.name === "Ari")?.you, true);
  assert.equal(view.players.find((player) => player.name === "Bo")?.tagged, 3);
  // the round is over: every screen finds out who was who (by name, nothing else), and the winner dances
  const named = view.game!.avatars.filter((avatar) => avatar.n !== undefined);
  assert.deepEqual(named.map((avatar) => avatar.n).sort(), ["Ari", "Bo", "Cy"]);
  assert.equal(named.filter((avatar) => avatar.w).length, 1);
  assert.deepEqual([named.find((avatar) => avatar.w)?.n, named.find((avatar) => avatar.w)?.p], ["Ari", "dance"]);
  assert.equal(JSON.stringify(view.game).includes(second), false, "still no ids");
  const events = room.st.game!.events.map((event) => event.t);
  assert.ok(events.includes("hide"), "the tagged player slipped away");
  // the host can switch penalties off for the next round
  room.handle(first, { t: "penalties", on: false }, at + 1);
  room.handle(first, { t: "start" }, at + 2);
  room.advance(at + 2 + 80_000);
  assert.equal(room.view(first, "player", at + 80_003).result?.penalty, null);
});

/** Stand a player still at one of the night market's stalls (everyone else far off) until it's tasted. */
function taste(room: Room, owner: string, stall: number, from: number): number {
  const game = room.st.game!;
  const body = characterForOwner(game, owner)!;
  for (const other of game.characters) if (other !== body) Object.assign(other, { x: 8, y: 50 });
  Object.assign(body, { x: STALLS[stall], y: ARENA.marginY + 2, velocity: { x: 0, y: 0 } });
  let at = from;
  for (; at <= from + BITE_MS + 3 * SIMULATION_STEP_MS; at += SIMULATION_STEP_MS) room.advance(at);
  return at;
}

test("at the night market a bite lights its stall on every screen, but only the taster's phone knows it was them", () => {
  const room = twoPlayerRoom();
  assert.equal(room.join(screen, "TV", "en", "screen", 3), "ok");
  room.handle(first, { t: "vote", arena: "market" }, 4);
  room.handle(second, { t: "vote", arena: "market" }, 4);
  room.handle(first, { t: "start" }, 5);
  assert.equal(room.st.game!.arena, "market");
  // halfway through tasting: your own phone shows it filling
  const body = characterForOwner(room.st.game!, first)!;
  for (const other of room.st.game!.characters) if (other !== body) Object.assign(other, { x: 8, y: 50 });
  Object.assign(body, { x: STALLS[2], y: ARENA.marginY + 2, velocity: { x: 0, y: 0 } });
  room.advance(5 + SIMULATION_STEP_MS);
  room.advance(5 + SIMULATION_STEP_MS + BITE_MS / 2);
  const halfway = room.view(first, "player", 5 + SIMULATION_STEP_MS + BITE_MS / 2).game!.me!;
  assert.equal(halfway.at, 2);
  assert.ok(halfway.tasting > 0.3 && halfway.tasting < 0.7, `tasting ${halfway.tasting}`);
  assert.equal(room.view(second, "player", 600).game!.me!.at, -1);
  const at = taste(room, first, 2, 5 + SIMULATION_STEP_MS + BITE_MS / 2);
  const mine = room.view(first, "player", at).game!;
  const theirs = room.view(second, "player", at).game!;
  const tv = room.view(screen, "screen", at).game!;
  for (const [game, byYou] of [[mine, true], [theirs, false], [tv, false]] as const) {
    const bite = game.events.find((event) => event.t === "bite");
    assert.equal(bite?.stall, 2, "everyone sees which stall lit up");
    assert.equal(bite?.byYou, byYou, "only the taster's phone knows it was them");
  }
  assert.equal(mine.me!.bites, 1 << 2);
  assert.equal(theirs.me!.bites, 0);
  assert.equal(JSON.stringify(tv).includes(first), false, "still no ids");
});

test("all four stalls is a feast: 2 points, a fresh start, and the round's foodie title", () => {
  const room = twoPlayerRoom();
  room.handle(first, { t: "vote", arena: "market" }, 4);
  room.handle(first, { t: "start" }, 5);
  let at = 10;
  for (const stall of [3, 0, 2, 1]) at = taste(room, first, stall, at);
  const view = room.view(first, "player", at);
  assert.deepEqual(view.game!.events.filter((event) => event.t === "bite" || event.t === "feast").map((event) => event.t), ["bite", "bite", "bite", "bite", "feast"]);
  assert.equal(view.game!.me!.bites, 0, "a feast starts the four over");
  assert.equal(view.players.find((player) => player.you)?.score, 2);
  room.advance(5 + MATCH_MS + 10);
  const titles = Object.fromEntries(room.view(first, "player", 5 + MATCH_MS + 20).result!.awards.map((item) => [item.name, item.award]));
  assert.equal(titles.Ari, "foodie");
});

test("someone who joins during a round watches it and plays the next", () => {
  const room = twoPlayerRoom();
  room.handle(first, { t: "start" }, 5);
  assert.equal(room.join(third, "Cy", "en", "player", 6), "ok");
  const watching = room.view(third, "player", 7);
  assert.equal(watching.game!.me, null);
  assert.equal(watching.players.find((player) => player.you)?.inRound, false);
  room.handle(third, { t: "move", x: 1, y: 0 }, 8);
  assert.equal(room.st.inputs[third], undefined, "a watcher can't move anyone");
  room.advance(5 + 80_000);
  room.handle(first, { t: "start" }, 5 + 80_001);
  assert.ok(room.view(third, "player", 5 + 80_002).game!.me, "in the next round");
});

test("the host takes everyone back to the table: the room says so to every page", () => {
  const room = twoPlayerRoom();
  room.join(screen, "TV", "en", "screen", 3);
  room.handle(second, { t: "end" }, 4);
  assert.equal(room.view(second, "player", 5).ended, false, "only the host can");
  room.handle(first, { t: "end" }, 6);
  assert.equal(room.view(second, "player", 7).ended, true);
  assert.equal(room.view(screen, "screen", 7).ended, true);
  assert.equal(room.info(7).phase, "over");
});

test("room rejects invalid identities and limits the game to eight players; a seat left behind frees up", () => {
  const room = Room.create("6789", 0, 3);
  assert.equal(room.join("bad", "Guest", "en", "player", 1), "identity");
  for (let i = 0; i < 8; i++) assert.equal(room.join("player-" + String(i).padStart(2, "0"), "P" + i, "en", "player", i + 2), "ok");
  assert.equal(room.join("player-08", "Extra", "en", "player", 20), "full");
  assert.equal(room.info(20).full, true);
  room.presence("player-03", false, 30);
  assert.equal(room.join("player-08", "Extra", "en", "player", 40), "ok", "someone who left gives up their seat");
});

test("screens don't take player seats, an id can't switch sides, and players can reconnect", () => {
  const room = Room.create("9876", 0, 4);
  assert.equal(room.join(screen, "TV", "en", "screen", 1), "ok");
  assert.equal(room.join(first, "Ari", "en", "player", 2), "ok");
  assert.equal(room.join(screen, "TV", "en", "player", 3), "identity");
  assert.equal(room.info(3).players, 1);
  room.presence(first, false, 4);
  assert.equal(room.join(first, "Ari", "en", "player", 5), "ok");
  assert.equal(room.view(first, "player", 6).you.host, true);
});

test("names are tidied: no markup, no control characters, sixteen characters at most", () => {
  const room = Room.create("1111", 0, 5);
  room.join(first, "  <b>Ari</b>\u0007  the   Great Explorer  ", "en", "player", 1);
  const name = room.view(first, "player", 2).players[0].name;
  assert.ok(!/[<>\u0000-\u001f]/.test(name));
  assert.ok(name.length <= 16);
  room.join(second, "   ", "zh", "player", 3);
  assert.equal(room.view(second, "player", 4).players[1].name, "玩家");
});

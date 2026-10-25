import assert from "node:assert/strict";
import test from "node:test";
import { Room } from "../src/room/room";

const first = "player-one";
const second = "player-two";
const screen = "screen-one";

function twoPlayerRoom() {
  const room = Room.create("1234", 0, 1);
  assert.equal(room.join(first, "Ari", "en", "player", 1), true);
  assert.equal(room.join(second, "Bo", "zh", "player", 2), true);
  return room;
}

test("the first player becomes host and online presence transfers the role", () => {
  const room = twoPlayerRoom();
  assert.equal(room.view(first, "player", 3).you.host, true);
  room.presence(first, false, 4);
  assert.equal(room.view(second, "player", 5).you.host, true);
  assert.equal(room.info(5).players, 2);
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
});


test("players vote for an arena and the winning rule starts for every screen", () => {
  const room = twoPlayerRoom();
  room.handle(first, { t: "vote", arena: "metro" }, 3);
  room.handle(second, { t: "vote", arena: "metro" }, 4);
  room.handle(first, { t: "vote", arena: "gallery" }, 5);
  assert.deepEqual(room.view(first, "player", 6).arenaVotes, { plaza: 0, metro: 1, gallery: 1 });
  assert.equal(room.view(first, "player", 6).you.vote, "gallery");
  room.handle(first, { t: "start" }, 7);
  assert.equal(room.view(second, "player", 8).game?.arena, "metro");
});
test("TV views reveal scores and movement but never mark a real player", () => {
  const room = twoPlayerRoom();
  room.join(screen, "TV", "en", "screen", 3);
  room.handle(first, { t: "start" }, 4);
  const tv = room.view(screen, "screen", 5);
  const phone = room.view(first, "player", 5);
  assert.equal(tv.game?.avatars.some((avatar) => avatar.isMine), false);
  assert.equal(phone.game?.avatars.filter((avatar) => avatar.isMine).length, 1);
  assert.equal("ownerId" in (tv.game?.avatars[0] ?? {}), false);
  assert.equal(JSON.stringify(tv).includes(first), false);
  assert.equal(JSON.stringify(tv).includes(second), false);
});

test("room rejects invalid identities and limits the lobby to eight players", () => {
  const room = Room.create("6789", 0, 3);
  assert.equal(room.join("bad", "Guest", "en", "player", 1), false);
  for (let i = 0; i < 8; i++) {
    const id = "player-" + String(i).padStart(2, "0");
    assert.equal(room.join(id, "P" + i, "en", "player", i + 2), true);
  }
  assert.equal(room.join("player-08", "Extra", "en", "player", 20), false);
  assert.equal(room.info(20).full, true);
});

test("screens do not occupy player seats and disconnected players can reconnect", () => {
  const room = Room.create("9876", 0, 4);
  assert.equal(room.join(screen, "TV", "en", "screen", 1), true);
  assert.equal(room.join(first, "Ari", "en", "player", 2), true);
  assert.equal(room.info(3).players, 1);
  room.presence(first, false, 4);
  assert.equal(room.join(first, "Ari", "en", "player", 5), true);
  assert.equal(room.view(first, "player", 6).you.host, true);
});
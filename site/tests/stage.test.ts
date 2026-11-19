/* 一起跳 · Dance Along and 抓紧了 · Hang On at the table (party/stage): run with `npx tsx tests/stage.test.ts` */
import { GAME_BY_ID } from "../src/games/registry";
import { DANCE } from "../src/party/dance/link";
import { HANGON } from "../src/party/hangon/link";
import { freshRoom, RoomEngine } from "../src/shared/engine/room";
import { GAMES } from "../src/shared/engine/games";
import { ONLINE_GAMES, ONLINE_MIN, type DanceView, type HangOnView } from "../src/shared/protocol";

let clock = 3_000_000;
let seed = 7;
const host = { now: () => clock, rand: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) };
let failures = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  }
}
function test(name: string, fn: () => void) {
  const before = failures;
  try {
    fn();
  } catch (e) {
    failures++;
    console.log("  THREW:", (e as Error).stack);
  }
  console.log(`${failures === before ? "ok  " : "FAIL"} ${name}`);
}
const game = (e: RoomEngine, pid: string) => e.view(pid).game as DanceView | HangOnView | null;

test("一起跳: only the host opens the room, once; the table and the big screen learn its code", () => {
  const e = new RoomEngine(freshRoom("DNCE", clock), host);
  ok(e.screenHello("tv-dance", true) === null, "a screen opens a table");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  e.act("p1", { a: "start", game: "dance" });
  e.flush();
  ok(game(e, "p2")?.id === "dance" && game(e, "p2")?.code === null, "the game is on, no room yet");
  e.act("p2", { a: "g", g: { x: "open", code: "ABCD" } });
  e.flush();
  ok(game(e, "p2")?.code === null, "only the host opens it");
  for (const bad of ["abc", "AB1D", "ABIO", "12345", ""]) {
    e.act("p1", { a: "g", g: { x: "open", code: bad } });
    e.flush();
    ok(game(e, "p1")?.code === null, `a room code is four of the game's letters and digits, not ${JSON.stringify(bad)}`);
  }
  e.act("p1", { a: "g", g: { x: "open", code: "WXY7" } });
  e.flush();
  ok(game(e, "p2")?.code === "WXY7", "every phone gets the code");
  ok(game(e, "tv-dance")?.code === "WXY7", "so does the big screen");
  e.act("p1", { a: "g", g: { x: "open", code: "ZZ99" } });
  e.flush();
  ok(game(e, "p2")?.code === "WXY7", "a second room can't take its place");
  e.act("p1", { a: "end" });
  e.flush();
  ok(e.view("p2").game === null, "the host ends it: back to the lobby");
});

test("抓紧了: the same way in, and the table remembers a phones-only room", () => {
  const e = new RoomEngine(freshRoom("HNGN", clock), host);
  ok(e.hello("p1", "Amy", true) === null, "the host opens the table");
  e.act("p1", { a: "start", game: "hangon" });
  e.flush();
  const v0 = game(e, "p1") as HangOnView | null;
  ok(v0?.id === "hangon" && v0.code === null && v0.phone === false, "one player is enough; no room yet");
  e.act("p1", { a: "g", g: { x: "open", code: "K2M3", phone: true } });
  e.flush();
  const v1 = game(e, "p1") as HangOnView;
  ok(v1.code === "K2M3" && v1.phone === true && v1.at === clock, "the code, and that the host's phone is its stage");
  const e2 = new RoomEngine(freshRoom("HNG2", clock), host);
  e2.hello("p1", "Amy", true);
  e2.act("p1", { a: "start", game: "hangon" });
  e2.act("p1", { a: "g", g: { x: "open", code: "K2M3", phone: "yes" } });
  e2.flush();
  ok((game(e2, "p1") as HangOnView).phone === false, "anything but true is not a phones-only room");
});

test("their places: 一起跳 on the end of the table's list; 抓紧了 ready but not listed until its page can take over a room", () => {
  ok(ONLINE_GAMES.indexOf("dance") === 21 && ONLINE_MIN.dance === 1, "一起跳 went in after every game before it (old tables keep their index), one dancer is enough");
  ok(!ONLINE_GAMES.includes("hangon") && ONLINE_MIN.hangon === 1 && !!GAMES.hangon, "抓紧了 has its engine game and minimum, and no place on the list yet");
  ok(new Set(ONLINE_GAMES).size === ONLINE_GAMES.length, "no game twice");
  for (const id of ["dance", "hangon"] as const) {
    const g = GAME_BY_ID[id];
    ok(!!g.stage && !g.hidden && g.ready, `${id}'s card has a stage of its own and is ready`);
  }
});

test("the way there: each phone's and the stage's addresses, with this table's number for the way back", () => {
  ok(DANCE.phoneUrl("WXY7", "ABCD", { host: true, phone: false }) === "/party/join?code=WXY7&table=ABCD", "a dancer joins at /party/join");
  ok(DANCE.stageUrl("WXY7", "ABCD") === "/party/screen?table=ABCD#WXY7", "the stage is /party/screen with the code in the hash");
  ok(DANCE.hostFirst && !HANGON.hostFirst, "the table's host joins 一起跳 first (its host is whoever joins first)");
  ok(HANGON.phoneUrl("K2M3", "ABCD", { host: false, phone: false }) === "/hang-on/pad/?code=K2M3&auto=1&table=ABCD", "a controller joins at /hang-on/pad by itself");
  ok(HANGON.phoneUrl("K2M3", "ABCD", { host: true, phone: false }) === "/hang-on/pad/?code=K2M3&auto=1&table=ABCD", "the host too, when a big screen is the stage");
  ok(HANGON.phoneUrl("K2M3", "ABCD", { host: true, phone: true }) === "/hang-on/?phone=1&room=K2M3&table=ABCD", "with no big screen, the host's phone is the stage and plays");
  ok(HANGON.stageUrl("K2M3", "ABCD") === "/hang-on/?phone=0&room=K2M3&table=ABCD", "the big screen is the host page");
  for (const link of [DANCE, HANGON])
    for (const text of [link.who.zh, link.who.en, link.stageLead.zh, link.stageLead.en, ...link.rules.flatMap((r) => [r.zh, r.en])])
      ok(!/[—–“”‘’]/.test(text), `no em dashes or curly quotes: ${text.slice(0, 24)}`);
});

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

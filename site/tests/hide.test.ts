/* 藏在人群里 · Hide in the Crowd at the table: run with `npx tsx tests/hide.test.ts` */
import { GAME_BY_ID, GAMES } from "../src/games/registry";
import { freshRoom, RoomEngine } from "../src/shared/engine/room";
import { ONLINE_GAMES, ONLINE_MIN, type HideView } from "../src/shared/protocol";
import { parse } from "../src/router";

let clock = 2_000_000;
let seed = 11;
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
const code = (e: RoomEngine, pid: string) => (e.view(pid).game as HideView | null)?.code ?? null;

test("藏在人群里: only the host opens the room, once; the table and the big screen learn its number", () => {
  const e = new RoomEngine(freshRoom("HIDE", clock), host);
  ok(e.screenHello("tv-hide", true) === null, "a screen opens a table");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  e.act("p1", { a: "start", game: "hide" });
  e.flush();
  ok(e.view("p2").game?.id === "hide" && code(e, "p2") === null, "the game is on, no room yet");
  e.act("p2", { a: "g", g: { x: "open", code: "1234" } });
  e.flush();
  ok(code(e, "p2") === null, "only the host opens it");
  e.act("p1", { a: "g", g: { x: "open", code: "12a4" } });
  e.flush();
  ok(code(e, "p1") === null, "a room number is four digits");
  e.act("p1", { a: "g", g: { x: "open", code: "4072" } });
  e.flush();
  ok(code(e, "p2") === "4072", "every phone gets the number");
  ok(e.view("tv-hide").game?.id === "hide" && code(e, "tv-hide") === "4072", "so does the big screen");
  e.act("p1", { a: "g", g: { x: "open", code: "9999" } });
  e.flush();
  ok(code(e, "p2") === "4072", "a second room can't take its place");
  e.act("p1", { a: "end" });
  e.flush();
  ok(e.view("p2").game === null, "the host ends it: back to the lobby");
});

test("藏在人群里 needs two players at a table", () => {
  const e = new RoomEngine(freshRoom("HID2", clock), host);
  ok(e.hello("p1", "Amy", true) === null, "the host opens the table");
  e.act("p1", { a: "start", game: "hide" });
  e.flush();
  ok(e.view("p1").game === null, "one player can't start it");
  e.hello("p2", "Ben", false);
  e.act("p1", { a: "start", game: "hide" });
  e.flush();
  ok(e.view("p1").game?.id === "hide", "two can");
});

test("its card: an online game at changle.ca/g/hide-in-the-crowd, last on the board, its place in the table's list kept", () => {
  const g = GAME_BY_ID.hide;
  ok(g && g.ready && !g.hidden && g.category === "online", "a ready online game");
  ok(g.slug === "hide-in-the-crowd" && g.name.zh === "藏在人群里" && g.name.en === "Hide in the Crowd", "its name and address");
  // it went in after every game before it, so theirs kept their places; games added since go after it, so its own stays put
  ok(GAMES.findIndex((x) => x.id === "hide") === 19, "its card comes after every game before it, so the others keep their places");
  ok(ONLINE_GAMES.indexOf("hide") === 18 && ONLINE_MIN.hide === 2, "its place in the table's list stays where it went in (old tables keep their index)");
  ok(g.minPlayers === 2 && g.maxPlayers === 8, "2 to 8 players");
  const route = parse("/g/hide-in-the-crowd/play");
  ok(route.kind === "game" && route.id === "hide", "its one-phone address opens the practice page");
  for (const text of [g.name.zh, g.name.en, g.blurb.zh, g.blurb.en, g.how.zh, g.how.en, g.howCustom!.zh, g.howCustom!.en, g.solo!.hint.zh, g.solo!.hint.en])
    ok(!/[—–“”‘’]/.test(text), `no em dashes or curly quotes: ${text.slice(0, 24)}`);
  ok(!/喝|drink|sip/i.test(g.howCustom!.zh + g.howCustom!.en), "with the table's own penalty, nothing says drink");
});

test("its gel is bright enough for night text and unlike any other game's", () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  ok(contrast(GAME_BY_ID.hide.gel, "#0e0c22") >= 4.5, "night text on the gel reads");
  ok(GAMES.filter((g) => g.gel.toLowerCase() === GAME_BY_ID.hide.gel.toLowerCase()).length === 1, "no other game has it");
});

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

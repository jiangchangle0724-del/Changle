/* Engine flow tests: run with `npx tsx tests/engine.test.ts` */
import { countdown, cued, loaded, pressBy, reqOrder } from "../src/shared/dj/deck";
import { ENERGY, FAKE_MIX, heatLean, LEAN, mixFor } from "../src/shared/dj/curve";
import { recapOf } from "../src/party/dj/recap";
import { coaching } from "../src/party/limbo/coach";
import { limboLift, limboStyle } from "../src/party/limbo/music";
import { GROOVES } from "../src/lib/music";
import { styleForRequest, trackFor } from "../src/shared/dj/requests";
import { DECK, MIX_FX, MIXER } from "../src/shared/dj/types";
import { freshRoom, RoomEngine, type Output } from "../src/shared/engine/room";
import { sortHand } from "../src/shared/euchre";
import { headToHeadPoints, nextWriters, presentMs } from "../src/shared/punchline";
import { PUNCH_FINAL, PUNCH_PROMPTS } from "../src/data/punchline";
import { ONLINE_GAMES, timesOf, type Action, type GameView, type PenaltyEvent, type RoomEvent } from "../src/shared/protocol";
import { potStep } from "../src/shared/engine/games/dice";
import { PARTY_KINDS, TILT_SIDES, barAngleAt, steadyMs } from "../src/shared/engine/games/limbo";
import { GROUPS as DRAMA_GROUPS, PK_STYLES as DRAMA_STYLES, SCENES as DRAMA_SCENES, pkSeeUrl, pkStyle } from "../src/data/drama";
import { castSize as dramaCastSize, MAX_CAST as DRAMA_MAX_CAST, sceneSizes as dramaSizes } from "../src/shared/engine/games/drama";
import { FIRST_TIME_TIPS as DRAMA_TIPS, GENERIC_BEATS as DRAMA_GENERIC_BEATS, GUIDES as DRAMA_GUIDES, roleGuide as dramaRoleGuide } from "../src/data/dramaGuide";
import { CLASSICS as DRAMA_CLASSICS, CLASSIC_TIPS as DRAMA_CLASSIC_TIPS, CSET_NAME as DRAMA_CSET_NAME } from "../src/data/dramaClassics";
import { DRAWN_ART as DRAMA_DRAWN_ART } from "../src/data/dramaArt";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COMMANDS as KING_COMMANDS, commandText } from "../src/data/king";
import { guessMatches } from "../src/data/postit";
import { RULES as ROGUE_RULES, ruleWords } from "../src/data/rogue13";
import { DARES, promptText } from "../src/data/truthDare";
import { DECK_GROUPS as HEADS_DECK_GROUPS, HEADS_DECKS, NOTES } from "../src/data/postit";
import { DEFAULT_SLICES, sliceLabel } from "../src/data/wheel";
import { SONG_ROWS } from "../src/data/songs";
import { CAT_BIT, decoysFor, DEFAULT_POOL, fromRow, inPool, moodOf, pickSong, poolSize, samePool, singersOf } from "../src/shared/songs";
import { SPECIALS } from "../src/data/songPools";
import { challengeCode, challengeScore, challengeUrl, readChallenge, seeded } from "../src/party/tune/challenge";
import { canPlay, DECK_SIZE, FACES, faceOf, type LcColor, type LcKind } from "../src/shared/lastcard/cards";
import { LC_AWAY_MS } from "../src/shared/engine/games/lastcard";
import { DRAW_WORDS } from "../src/data/drawGuess";
import { drawMatches } from "../src/shared/engine/games/draw";
import { DRAW_GUESS_MAX, DRAW_ROUND_MS } from "../src/shared/protocol";
import { hintBlanks, hintSay, hintZh } from "../src/online/games/drawHint";

let clock = 1_000_000;
let seed = 7;
const host = { now: () => clock, rand: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) };
let failures = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  }
}

function setup(n: number) {
  const eng = new RoomEngine(freshRoom("ABCD", clock), host);
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  ok(eng.hello(ids[0], "Host", true) === null, "host creates");
  for (const id of ids.slice(1)) ok(eng.hello(id, id.toUpperCase(), false) === null, `${id} joins`);
  eng.flush();
  const events: RoomEvent[] = [];
  const act = (pid: string, a: Action) => {
    eng.act(pid, a);
    const o = eng.flush();
    events.push(...o.events);
    return o;
  };
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => act(pid, { a: "g", g: { x, ...rest } });
  const view = <V extends GameView>(pid: string) => eng.view(pid).game as V;
  const advance = (ms: number) => {
    clock += ms;
    eng.due();
    const o: Output = eng.flush();
    events.push(...o.events);
  };
  const pens = () => events.filter((e): e is PenaltyEvent => e.k === "penalty");
  return { eng, ids, act, g, view, advance, events, pens };
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

test("room basics: join, errors, host transfer, kick", () => {
  const t = setup(3);
  ok(t.eng.hello("x", "late", true) === "exists", "create on busy code refused");
  const e2 = new RoomEngine(freshRoom("ZZZZ", clock), host);
  ok(e2.hello("q", "Q", false) === "no-room", "join missing room refused");
  t.eng.setOnline("p0", false);
  t.eng.flush();
  t.advance(26_000);
  ok(t.eng.d.host === "p1", "host moves to next online player after grace");
  t.act("p1", { a: "kick", pid: "p2" });
  ok(!t.eng.d.seats.some((s) => s.id === "p2"), "kicked removed");
  ok(t.eng.hello("p2", "back", false) === "kicked", "kicked cannot return");
});

test("names: two people at one table never share a name", () => {
  const eng = new RoomEngine(freshRoom("NAME", clock), host);
  const name = (pid: string) => eng.d.seats.find((s) => s.id === pid)?.name;
  eng.hello("a", "Steve", true);
  eng.hello("b", "Steve", false);
  eng.hello("c", " steve ", false);
  eng.hello("d", "Ｓｔｅｖｅ", false);
  ok(name("a") === "Steve" && name("b") === "Steve 2" && name("c") === "steve 3" && name("d") === "Ｓｔｅｖｅ 4", `the same name gets a number (${eng.d.seats.map((s) => s.name).join(", ")})`);
  eng.setOnline("b", false);
  eng.hello("b", "Steve", false);
  eng.hello("a", "Steve", false);
  ok(name("a") === "Steve" && name("b") === "Steve 2", "coming back keeps each one's name");
  eng.act("c", { a: "rename", name: "Steve 2" });
  ok(name("c") === "Steve 2 2", `renaming to a name in use doesn't take it (${name("c")})`);
  eng.act("c", { a: "rename", name: "Cat" });
  eng.act("c", { a: "rename", name: "Cat" });
  ok(name("c") === "Cat", "renaming to your own name keeps it");
  eng.hello("e", "Christopherson", false);
  eng.hello("f", "Christopherson", false);
  ok(name("f") === "Christophers 2" && Array.from(name("f") ?? "").length <= 14, `a long name still fits 14 (${name("f")})`);
  eng.hello("g", "小明", false);
  eng.hello("h", "小明", false);
  ok(name("h") === "小明 2", `Chinese names too (${name("h")})`);
  eng.act("a", { a: "leave" });
  eng.hello("b", "Steve", false);
  ok(name("b") === "Steve", "once the first Steve has gone, the second one is just Steve");
});

test("start: a second tap on Start doesn't deal the game again", () => {
  const t = setup(4);
  const first = t.act("p0", { a: "start", game: "king" });
  ok(first.events.some((e) => e.k === "fx" && e.fx === "start"), "the game starts");
  const dealt = JSON.stringify(t.eng.d.game?.s);
  const again = t.act("p0", { a: "start", game: "king" });
  ok(!again.events.length && JSON.stringify(t.eng.d.game?.s) === dealt, "the same game again: nothing happens");
  t.act("p0", { a: "start", game: "dice" });
  ok(t.eng.d.game?.id === "dice", "another game still takes over");
});

test("skip: the host's second tap on Skip doesn't skip the next player too", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "dice" });
  t.g("p0", "skip", { at: "roll:p0" });
  ok(t.view<V<"dice">>("p0").turn === "p1", "dice: skip moves the turn on");
  t.g("p0", "skip", { at: "roll:p0" });
  ok(t.view<V<"dice">>("p0").turn === "p1", "dice: the same skip again does nothing");
  t.g("p0", "skip");
  ok(t.view<V<"dice">>("p0").turn === "p2", "dice: a skip that names no turn still works");
  t.act("p0", { a: "start", game: "truth" });
  const tv = t.view<V<"truth">>("p0");
  t.g("p0", "skip", { at: `spin:${tv.spinner}` });
  const next = t.view<V<"truth">>("p0").spinner;
  t.g("p0", "skip", { at: `spin:${tv.spinner}` });
  ok(next !== tv.spinner && t.view<V<"truth">>("p0").spinner === next, "truth: one skip, not two");
  t.act("p0", { a: "start", game: "wheel" });
  const wv = t.view<V<"wheel">>("p0");
  t.g("p0", "skip", { at: `${wv.phase}:${wv.turn}` });
  const wt = t.view<V<"wheel">>("p0").turn;
  t.g("p0", "skip", { at: `${wv.phase}:${wv.turn}` });
  ok(wt !== wv.turn && t.view<V<"wheel">>("p0").turn === wt, "wheel: one skip, not two");
  t.act("p0", { a: "start", game: "rogue" });
  const rv = t.view<V<"rogue">>("p0");
  t.g("p0", "skip", { at: `${rv.phase}:${rv.turn}` });
  const rt = t.view<V<"rogue">>("p0").turn;
  t.g("p0", "skip", { at: `${rv.phase}:${rv.turn}` });
  ok(rt !== rv.turn && t.view<V<"rogue">>("p0").turn === rt, "rogue: one skip, not two");
});

test("leave: seat freed, host handed on, game told", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "dice" });
  t.act("p0", { a: "leave" });
  ok(!t.eng.d.seats.some((s) => s.id === "p0"), "seat removed");
  ok(t.eng.d.host === "p1", "host handed to the next seat");
  ok(t.events.some((e) => e.k === "host" && e.pid === "p1"), "host event");
  ok(t.eng.view("p1").game?.id === "dice", "game carries on");
  ok(t.eng.hello("p0", "Back", false) === null, "a player who left may sit again");
  ok(t.eng.d.host === "p1", "returning player is not host again");
});

test("just watching: at the table, out of the game, no turns, no penalties", () => {
  // (the dice use the shared random sequence: put it back afterwards so later tests see the same)
  const s0 = seed;
  const t = setup(3);
  t.act("p2", { a: "watch", on: true });
  ok(t.eng.d.seats.find((x) => x.id === "p2")?.watch === true, "p2 watches");
  ok(t.eng.view("p0").seats.find((x) => x.id === "p2")?.watch === true, "everyone sees p2 is watching");
  t.act("p1", { a: "watch", pid: "p0", on: true });
  ok(!t.eng.d.seats.find((x) => x.id === "p0")?.watch, "only the host can set someone else to watch");
  t.act("p0", { a: "start", game: "dice" });
  // dice: the turn goes round the players only
  for (let i = 0; i < 4; i++) {
    const turn = t.view<{ id: "dice"; turn: string }>("p0").turn;
    ok(turn !== "p2", `the watcher never gets a turn (${turn})`);
    t.g(turn, "roll");
    t.g(turn, "assign", { target: turn === "p0" ? "p1" : "p0" });
    t.g(turn, "next");
  }
  ok(!t.pens().some((e) => e.who.includes("p2")), "and never a penalty");
  t.act("p2", { a: "watch", on: false });
  ok(!t.eng.d.seats.find((x) => x.id === "p2")?.watch, "back to playing");
  const solo = setup(2);
  solo.act("p1", { a: "watch", on: true });
  solo.act("p0", { a: "start", game: "dice" });
  ok(!solo.eng.view("p0").game, "a game that needs two players doesn't start with one player and one watcher");
  seed = s0;
});

test("turns pass over phones that are away", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "dice" });
  t.eng.setOnline("p1", false);
  t.eng.flush();
  t.g("p0", "roll");
  t.g("p0", "assign", { target: "p2" });
  t.g("p0", "next");
  ok(t.view<{ id: "dice"; turn: string }>("p0").turn === "p2", "p1 is away, so p2 rolls next");
  for (const id of ["p0", "p2", "p3"]) t.eng.setOnline(id, false);
  t.eng.flush();
  t.g("p2", "roll");
  t.g("p2", "assign", { target: "p3" });
  t.g("p2", "next");
  ok(t.view<{ id: "dice"; turn: string }>("p0").turn === "p3", "with everyone away, order is plain seat order");
});

test("profiles on seats and game records", () => {
  const eng = new RoomEngine(freshRoom("PROF", clock), host);
  ok(eng.hello("p0", "Steve", true, { uid: "uabc123456789", name: "Steve", av: 2, ac: 3 }) === null, "signed-in host sits");
  ok(eng.hello("p1", "Ann", false) === null, "guest sits");
  eng.flush();
  const v = eng.view("p1");
  ok(v.seats[0].uid === "uabc123456789" && v.seats[0].av === 2 && v.seats[0].ac === 3, "profile shows on the seat");
  ok(v.seats[1].uid === undefined, "a guest seat has no profile");
  eng.act("p0", { a: "start", game: "dice" });
  eng.flush();
  // three rolls by the host; count penalties as they land
  for (let i = 0; i < 6; i++) {
    eng.act("p0", { a: "g", g: { x: "roll" } });
    clock += 2000;
    eng.due();
    eng.act("p0", { a: "g", g: { x: "next" } });
    eng.flush();
  }
  clock += 61_000;
  eng.act("p0", { a: "end" });
  const o = eng.flush();
  ok(o.records.length === 1, "ending a game of a minute or more makes one record");
  const rec = o.records[0];
  ok(rec && rec.game === "dice" && rec.players.length === 2, "the record names the game and both seats");
  ok(rec && rec.players[0].uid === "uabc123456789", "the signed-in seat carries its uid");
  const short = new RoomEngine(freshRoom("SHRT", clock), host);
  short.hello("p0", "S", true, { uid: "uabc123456789", name: "S", av: 0, ac: 0 });
  short.flush();
  short.act("p0", { a: "start", game: "dice" });
  short.flush();
  clock += 5000;
  short.act("p0", { a: "end" });
  ok(short.flush().records.length === 0, "a game under a minute is not recorded");
});

test("lobby spin + start/end", () => {
  const t = setup(4);
  t.act("p1", { a: "spin", scope: "lobby", index: 3, delta: 400, duration: 2 });
  ok(t.eng.d.front === 0, "non-host cannot spin lobby");
  t.act("p0", { a: "spin", scope: "lobby", index: 3, delta: 400, duration: 2 });
  ok(t.eng.d.front === 3, "host spin sets front");
  ok(t.events.some((e) => e.k === "spin"), "spin event emitted");
  t.act("p0", { a: "start", game: "dice" });
  ok(t.eng.view("p1").game?.id === "dice", "dice started");
  t.act("p0", { a: "end" });
  ok(t.eng.view("p1").game === null, "ended");
});

test("rogue: draw cycle, grab collision, nose, sevens", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "rogue" });
  let draws = 0;
  for (let i = 0; i < 60; i++) {
    const v = t.view<Extract<GameView, { id: "rogue" }>>("p0");
    const turn = v.turn;
    if (v.phase === "draw") {
      t.g(turn, "draw");
      draws++;
      continue;
    }
    switch (v.phase) {
      case "pick":
        t.g(v.drawer!, "pick", { target: t.ids.find((x) => x !== v.drawer) });
        break;
      case "garden-pick":
        t.g(v.drawer!, "garden", { kind: 1 });
        t.g(v.garden?.speaker ?? t.view<Extract<GameView, { id: "rogue" }>>("p0").garden!.speaker, "said");
        t.advance(8000);
        break;
      case "grab": {
        const next = v.grab!.next;
        const free = t.ids.filter((id) => v.grab!.claimed[id] === undefined);
        t.g(free[0], "grab", { n: next });
        clock += 100;
        t.g(free[1], "grab", { n: next });
        ok(t.events.some((e) => e.k === "fx" && e.fx === "collide"), "collision detected");
        break;
      }
      case "sevens-start":
        t.g(v.drawer!, "sevens", { start: 5 });
        {
          const s1 = t.view<Extract<GameView, { id: "rogue" }>>("p0").sevens!;
          ok(s1.n === 6, "sevens starts after the chosen number");
          t.g(s1.speaker, "say", { pass: false }); // 6 → say the number: right
          const s2 = t.view<Extract<GameView, { id: "rogue" }>>("p0").sevens!;
          ok(s2.n === 7, "sevens advanced");
          t.g(s2.speaker, "say", { pass: false }); // 7 → must pass: wrong
          ok(t.view<Extract<GameView, { id: "rogue" }>>("p0").phase === "done", "wrong sevens call ends round");
        }
        break;
      case "done":
        t.g(v.drawer ?? turn, "next");
        break;
    }
    t.advance(1500);
  }
  ok(draws > 10, `drew cards (${draws})`);
  ok(t.pens().length > 3, "penalties happened");
  // force a nose holder
  const s = t.eng.d.game!.s as { holders: Record<string, string>; interrupt: unknown };
  s.holders.nose = "p2";
  t.g("p2", "nose");
  ok((t.view<Extract<GameView, { id: "rogue" }>>("p0").interrupt as { kind: string } | null)?.kind === "nose", "nose interrupt");
  const before = t.pens().length;
  t.g("p0", "tap");
  clock += 50;
  t.g("p1", "tap");
  clock += 50;
  t.g("p3", "tap");
  const last = t.pens().slice(before)[0];
  ok(last && last.who[0] === "p3", "slowest nose toucher drinks");
});

test("truth: spin, choose, pass", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "truth" });
  t.act("p0", { a: "spin", scope: "truth", index: 2, delta: 720, duration: 1 });
  let v = t.view<Extract<GameView, { id: "truth" }>>("p1");
  ok(v.chosen === "p2" && v.phase === "choose", "bottle chose p2");
  t.g("p2", "pick", { kind: "dare" });
  ok(t.view<Extract<GameView, { id: "truth" }>>("p1").phase === "choose", "cannot pick before reveal");
  clock += 1200;
  t.g("p2", "pick", { kind: "dare" });
  v = t.view<Extract<GameView, { id: "truth" }>>("p1");
  ok(v.phase === "card" && v.prompt && v.kind === "dare", "dare shown");
  t.g("p2", "pass");
  ok(t.pens().some((p) => p.who.includes("p2")), "pass drinks");
  ok(t.view<Extract<GameView, { id: "truth" }>>("p1").spinner === "p2", "chosen spins next");
});

test("undercover: words private, vote, win", () => {
  const t = setup(6);
  t.act("p0", { a: "start", game: "undercover" });
  t.g("p0", "deal");
  const roles = (t.eng.d.game!.s as { roles: Record<string, string> }).roles;
  const ucId = Object.keys(roles).find((id) => roles[id] === "uc")!;
  const civId = Object.keys(roles).find((id) => roles[id] === "civ")!;
  const vu = t.view<Extract<GameView, { id: "undercover" }>>(ucId);
  const vc = t.view<Extract<GameView, { id: "undercover" }>>(civId);
  ok(vu.myWord && vc.myWord && vu.myWord.zh !== vc.myWord.zh, "undercover gets a different word");
  ok(vc.roles === null && vc.pair === null, "roles hidden mid-game");
  const json = JSON.stringify(t.eng.view(civId));
  ok(!json.includes(`"${vu.myWord!.zh}"`), "civilian payload never contains the undercover word");
  for (const id of t.ids) t.g(id, "ready");
  ok(t.view<Extract<GameView, { id: "undercover" }>>("p0").phase === "talk", "talk starts when all ready");
  t.g("p0", "force");
  ok(t.view<Extract<GameView, { id: "undercover" }>>("p0").phase === "vote", "host forces vote");
  for (const id of t.ids) t.g(id, "vote", { target: id === ucId ? civId : ucId });
  const r = t.view<Extract<GameView, { id: "undercover" }>>("p0");
  ok(r.phase === "reveal" && r.out?.pid === ucId && r.out.role === "uc", "undercover voted out");
  ok(r.winner === "civ", "civilians win");
  t.g("p0", "next");
  ok(t.pens().some((p) => p.who.includes(ucId)), "loser drinks");
  ok(t.view<Extract<GameView, { id: "undercover" }>>(civId).roles !== null, "roles revealed at end");
});

test("draw: word only for drawer, guess scoring, timeout penalty", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "draw" });
  t.g("p0", "pick", { d: 1 });
  const dv = t.view<Extract<GameView, { id: "draw" }>>("p0");
  const gv = t.view<Extract<GameView, { id: "draw" }>>("p1");
  ok(dv.word && !gv.word, "word only visible to drawer");
  ok(!JSON.stringify(t.eng.view("p1")).includes(dv.word!.zh), "guesser payload has no word");
  t.eng.stroke("p1", { o: "b", id: "s1", c: "#1f3f8e", w: 0.01, p: [0.1, 0.1] });
  ok(t.eng.flush().relay.length === 0, "only the drawer may draw");
  t.eng.stroke("p0", { o: "b", id: "s1", c: "#1f3f8e", w: 0.01, p: [0.1, 0.1] });
  ok(t.eng.flush().relay.length === 1, "drawer stroke relayed");
  t.g("p1", "guess", { text: "not it" });
  t.g("p1", "guess", { text: dv.word!.en.toUpperCase() });
  const after = t.view<Extract<GameView, { id: "draw" }>>("p2");
  ok(after.solved.includes("p1") && after.scores.p1 > 0 && after.scores.p0 > 0, "correct guess scores both");
  ok(after.guesses.some((x) => x.ok && x.text === ""), "correct guess text hidden");
  t.g("p0", "next");
  ok(t.view<Extract<GameView, { id: "draw" }>>("p0").phase === "draw", "cannot skip mid-round");
  t.advance(81_000);
  ok(t.view<Extract<GameView, { id: "draw" }>>("p0").phase === "result", "round times out");
  t.g("p0", "next");
  ok(t.view<Extract<GameView, { id: "draw" }>>("p0").drawer === "p1", "next drawer");
  t.g("p1", "pick", { d: 2 });
  t.advance(81_000);
  t.advance(1000);
  ok(t.pens().some((p) => p.who.includes("p1")), "nobody guessed: drawer drinks");
});

test("draw: guesses as people type them: Traditional characters, a or the, a plural; every answer fits the box", () => {
  const word = (zh: string) => DRAW_WORDS.find((w) => w.zh === zh)!;
  const right: [string, string][] = [
    ["汽车", "汽车"],
    ["汽车", "汽車"],
    ["雨伞", "雨傘"],
    ["暧昧", "曖昧"],
    ["钟表", "Clock!"],
    ["钟表", "a clock"],
    ["钟表", "the clocks"],
    ["汽车", "cars"],
    ["筷子", "chopstick"],
    ["眼镜", "glass"],
    ["蝴蝶", "butterflies"],
    ["钥匙", "keys"],
    ["感冒", "A cold"],
    ["感冒", "the cold"],
    ["感冒", "cold"],
    ["深夜emo", "深夜 EMO"],
    ["深夜emo", "late night blues"],
    ["熬夜", "all nighter"],
    ["月光族", "Living paycheck to paycheck"],
    ["猫", "ＣＡＴ"],
  ];
  for (const [zh, guess] of right) ok(drawMatches(guess, word(zh)), `${zh} / ${word(zh).en}: "${guess}" is right`);
  const wrong: [string, string][] = [
    ["汽车", "车"],
    ["钟表", "clo"],
    ["钟表", "the"],
    ["汽车", "a"],
    ["猫", "cats and dogs"],
    ["帽子", "hates"],
    ["电视", "tvs"],
    ["感冒", "a"],
    ["汽车", ""],
  ];
  for (const [zh, guess] of wrong) ok(!drawMatches(guess, word(zh)), `${zh} / ${word(zh).en}: "${guess}" is not`);
  const long = DRAW_WORDS.filter((w) => w.en.length > DRAW_GUESS_MAX || [...w.zh].length > DRAW_GUESS_MAX);
  ok(!long.length, `every answer fits in a guess (${long.map((w) => w.en).join(", ") || "all do"})`);

  // the longest answer, typed in full, through the room
  const t = setup(3);
  t.act("p0", { a: "start", game: "draw" });
  t.g("p0", "pick", { d: 3 });
  (t.eng.d.game!.s as { word: number }).word = DRAW_WORDS.findIndex((w) => w.zh === "月光族");
  t.g("p1", "guess", { text: "Living paycheck to paycheck" });
  t.g("p2", "guess", { text: "月光族" });
  const v = t.view<Extract<GameView, { id: "draw" }>>("p0");
  ok(v.solved.join() === "p1,p2" && v.phase === "result", "the longest English answer counts in full, and the round is over");
});

test("draw: the hint: in English each word's blanks, and hyphens; in Chinese the characters, and any letters", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "draw" });
  t.g("p0", "pick", { d: 3 });
  const s = t.eng.d.game!.s as { word: number };
  const hintOf = (zh: string) => {
    s.word = DRAW_WORDS.findIndex((w) => w.zh === zh);
    return t.view<Extract<GameView, { id: "draw" }>>("p1").hint!;
  };
  const pay = hintOf("月光族");
  ok(pay.en === "______ ________ __ ________" && pay.zh === 3, `four words of blanks (${pay.en})`);
  ok(hintOf("熬夜").en === "___-_______", "a hyphen shows as it is");
  // on the phone: a wide break between words, never one inside a word
  const shown = hintBlanks(pay.en);
  ok(shown.split(" ").length === 4 && !/ /.test(shown), `the phone's hint keeps the four words apart (${JSON.stringify(shown)})`);
  ok(shown.split(" ").every((w) => /^_(?: _)*$/.test(w)), "and each word's blanks together");
  ok(hintSay(pay.en) === "4 words: 6, 8, 2 and 8 letters" && hintSay("___") === "3 letters", `what a screen reader says (${hintSay(pay.en)})`);
  ok(hintSay(hintOf("熬夜").en) === "10 letters", "a hyphenated word is one word");
  // in Chinese: how many characters, and the letters as letters (深夜emo is not five characters)
  ok(pay.latin === 0 && hintZh(pay) === "3 个字", `月光族: three characters (${hintZh(pay)})`);
  const emo = hintOf("深夜emo");
  ok(emo.zh === 2 && emo.latin === 3 && hintZh(emo) === "2 个字加 3 个字母", `深夜emo: two characters and three letters (${hintZh(emo)})`);
  ok(hintZh({ zh: 5 }) === "5 个字", "from a rooms server that doesn't count the letters yet: characters only");
});

test("draw: a drawer who leaves: no penalty for anyone else, the word goes up, the turn goes on round the table", () => {
  type V = Extract<GameView, { id: "draw" }>;
  const t = setup(4);
  t.act("p0", { a: "start", game: "draw" });
  // p0 and p1 draw a round each (nobody gets it), so p2 is drawing when they leave
  for (const d of ["p0", "p1"]) {
    t.g(d, "pick", { d: 1 });
    t.g(d, "giveup");
    t.advance(1000);
    t.g(d, "next");
  }
  ok(t.view<V>("p0").drawer === "p2", "p2 draws the third round");
  t.g("p2", "pick", { d: 1 });
  t.eng.stroke("p2", { o: "b", id: "s1", c: "#1f3f8e", w: 0.01, p: [0.1, 0.1] });
  t.eng.flush();
  const pens = t.pens().length;
  t.act("p2", { a: "leave" });
  let v = t.view<V>("p1");
  ok(v.phase === "result" && v.left === "p2" && !!v.word && !v.solved.length, "the round is over: the word goes up and says who left");
  ok(v.drawer === "p3", `the next one round the table is up (${v.drawer})`);
  t.advance(82_000);
  ok(t.pens().length === pens, "nobody drinks for it, and the round's clock is gone");
  ok(t.eng.d.strokes.length === 1, "the drawing stays up with the word");
  t.g("p1", "next");
  ok(t.view<V>("p1").phase === "result", "only p3 or the host moves on");
  t.g("p3", "next");
  v = t.view<V>("p1");
  ok(v.phase === "pick" && v.drawer === "p3" && v.left === null && v.round === 4, "p3 picks next, not p0 again");
  ok(t.eng.d.strokes.length === 0, "a clean board");

  // the drawer leaves while choosing a word: the turn passes on round the table (back to p0)
  t.act("p3", { a: "leave" });
  v = t.view<V>("p0");
  ok(v.phase === "pick" && v.drawer === "p0" && v.round === 4, `the turn passes on while choosing (${v.drawer})`);

  // a round ends as usual, then its drawer leaves before moving on: straight to the next one's pick
  t.g("p0", "pick", { d: 1 });
  t.g("p1", "guess", { text: DRAW_WORDS[(t.eng.d.game!.s as { word: number }).word].zh });
  v = t.view<V>("p1");
  ok(v.phase === "result" && v.solved.join() === "p1", "p1 got it: the round is over");
  t.act("p0", { a: "leave" });
  v = t.view<V>("p1");
  ok(v.phase === "pick" && v.drawer === "p1" && v.round === 5 && v.left === null, `on to the next drawer's pick (${v.phase}, ${v.drawer})`);
  ok(t.pens().length === pens, "still nobody drinks for anyone who left");

  // a guesser leaves and everyone still guessing has it: the round is done
  const u = setup(4);
  u.act("p0", { a: "start", game: "draw" });
  u.g("p0", "pick", { d: 1 });
  const zh = DRAW_WORDS[(u.eng.d.game!.s as { word: number }).word].zh;
  u.g("p1", "guess", { text: zh });
  u.g("p2", "guess", { text: zh });
  ok(u.view<V>("p0").phase === "draw", "p3 is still guessing");
  u.act("p3", { a: "leave" });
  ok(u.view<V>("p0").phase === "result", "p3 left: the two still here both got it, the round is over");
  ok(!u.pens().length, "no penalty: they got it");

  // the drawer sits out to watch mid-round: the same as leaving
  const w = setup(3);
  w.act("p0", { a: "start", game: "draw" });
  w.g("p0", "pick", { d: 1 });
  w.act("p0", { a: "watch", on: true });
  const wv = w.view<V>("p1");
  ok(wv.phase === "result" && wv.left === "p0" && wv.drawer === "p1", "the drawer who sits out to watch ends the round, and p1 is next");

  // a table saved before this change (no seat order kept) still moves on
  const o = setup(3);
  o.act("p0", { a: "start", game: "draw" });
  const os = o.eng.d.game!.s as { order?: string[]; left?: string | null };
  delete os.order;
  delete os.left;
  o.g("p0", "pick", { d: 1 });
  o.act("p0", { a: "leave" });
  const ov = o.view<V>("p1");
  ok(ov.phase === "result" && ov.left === "p0" && o.eng.d.game !== null && ["p1", "p2"].includes(ov.drawer), "an older saved table: no crash, someone still here is next");
});

test("draw: the drawer taps a guess that's close enough, and it counts; a round is a minute", () => {
  // (the random numbers this test uses are handed back afterwards: the games tested after it, drama's
  // casting for one, deal exactly what they dealt before it was added)
  const keep = seed;
  try {
    closeEnough();
  } finally {
    seed = keep;
  }
});

function closeEnough() {
  type V = Extract<GameView, { id: "draw" }>;
  const t = setup(4);
  t.act("p0", { a: "start", game: "draw" });
  t.g("p0", "pick", { d: 2 });
  const s = t.eng.d.game!.s as { word: number };
  s.word = DRAW_WORDS.findIndex((w) => w.zh === "钟表");
  ok(Math.round((t.view<V>("p0").endsAt - clock) / 1000) === 60, `a round is a minute (${Math.round((t.view<V>("p0").endsAt - clock) / 1000)} s)`);
  t.g("p1", "guess", { text: "时钟" });
  t.g("p2", "guess", { text: "闹钟" });
  t.g("p3", "guess", { text: "时钟！" });
  t.g("p2", "guess", { text: "时钟" });
  let v = t.view<V>("p1");
  ok(!v.solved.length && v.guesses.filter((x) => x.text.startsWith("时钟")).length === 3, "时钟 is not 钟表 by itself");
  // nobody but the drawer can count a guess: not a guesser, not the host who isn't drawing
  t.g("p1", "accept", { text: "时钟" });
  ok(!t.view<V>("p1").solved.length, "a guesser can't count their own guess");
  t.g("p0", "accept", { text: "猫" });
  ok(!t.view<V>("p1").solved.length, "only a guess someone typed can be counted");
  const before = t.events.filter((e) => e.k === "fx" && e.fx === "correct").length;
  t.g("p0", "accept", { text: "时钟" });
  v = t.view<V>("p1");
  ok(v.solved.join() === "p1,p3,p2", `everyone who typed it got it, in the order they typed it (${v.solved.join()})`);
  ok(v.scores.p1 === 4 && v.scores.p3 === 2 && v.scores.p2 === 2 && v.scores.p0 === 4, `scored as right guesses (${JSON.stringify(v.scores)})`);
  ok(!v.guesses.some((x) => x.text.includes("时钟")), "the counted guess no longer shows to anyone");
  ok(v.guesses.filter((x) => x.ok).length === 3 && v.guesses.some((x) => x.pid === "p2" && x.text === "闹钟"), `one 'got it' each, and the other guesses stay (${JSON.stringify(v.guesses)})`);
  ok(t.events.filter((e) => e.k === "fx" && e.fx === "correct").length - before === 3, "the room hears each one");
  ok(v.phase === "result" && !t.pens().length, "all three have it: the round is over, nobody drinks");

  // counted once, typed again by someone else: right straight away
  const u = setup(3);
  u.act("p0", { a: "start", game: "draw" });
  u.g("p0", "pick", { d: 1 });
  (u.eng.d.game!.s as { word: number }).word = DRAW_WORDS.findIndex((w) => w.zh === "飞机");
  u.g("p1", "guess", { text: "plane" });
  u.g("p0", "accept", { text: "plane" });
  ok(u.view<V>("p0").solved.join() === "p1" && u.view<V>("p0").phase === "draw", "plane counts for 飞机 / Airplane");
  u.g("p2", "guess", { text: "Planes" });
  ok(u.view<V>("p0").solved.join() === "p1,p2" && u.view<V>("p0").phase === "result", "and Planes, typed after, is right without a tap");
  u.g("p0", "accept", { text: "plane" });
  ok(u.view<V>("p0").solved.length === 2, "nothing to count once the round is over");
  u.g("p0", "next");
  u.g("p1", "pick", { d: 1 });
  (u.eng.d.game!.s as { word: number }).word = DRAW_WORDS.findIndex((w) => w.zh === "飞机");
  u.g("p2", "guess", { text: "plane" });
  ok(!u.view<V>("p0").solved.length, "a new round starts with nothing counted");
}

test("draw: nobody left to guess: the round ends, and the drawer doesn't drink for it", () => {
  // (hands back the random numbers it uses, as the test above does)
  const keep = seed;
  try {
    nobodyLeft();
  } finally {
    seed = keep;
  }
});

function nobodyLeft() {
  type V = Extract<GameView, { id: "draw" }>;
  // two at the table, and the one guessing leaves mid-round
  const t = setup(2);
  t.act("p0", { a: "start", game: "draw" });
  t.g("p0", "pick", { d: 2 });
  t.act("p1", { a: "leave" });
  let v = t.view<V>("p0");
  ok(v.phase === "result" && v.alone && !!v.word && !v.solved.length && v.left === null, "the round is over at once: the word goes up, and it says nobody was left to guess");
  t.advance(DRAW_ROUND_MS + 1000);
  t.advance(1000);
  ok(!t.pens().length, "nobody drinks for it, then or when the minute would have run out");
  t.g("p0", "next");
  v = t.view<V>("p0");
  ok(v.phase === "pick" && v.drawer === "p0" && !v.alone, "a new round, without the last one's 'nobody left'");
  // drawing with nobody to guess: the minute runs out, or the drawer ends it, and nobody drinks
  t.g("p0", "pick", { d: 1 });
  t.advance(DRAW_ROUND_MS + 1000);
  t.advance(1000);
  v = t.view<V>("p0");
  ok(v.phase === "result" && v.alone && !t.pens().length, "the minute runs out: no penalty");
  t.g("p0", "next");
  t.g("p0", "pick", { d: 1 });
  t.g("p0", "giveup");
  t.advance(1000);
  ok(t.view<V>("p0").alone && !t.pens().length, "the drawer ends it: no penalty");

  // three at the table: one guesser leaves, one is still guessing, so the round goes on; nobody
  // gets it in the minute, and the drawer drinks as ever
  const u = setup(3);
  u.act("p0", { a: "start", game: "draw" });
  u.g("p0", "pick", { d: 1 });
  u.act("p2", { a: "leave" });
  ok(u.view<V>("p0").phase === "draw", "p1 is still guessing");
  u.advance(DRAW_ROUND_MS + 1000);
  u.advance(1000);
  const uv = u.view<V>("p0");
  ok(uv.phase === "result" && !uv.alone && u.pens().some((p) => p.who.includes("p0")), "nobody got it: the drawer drinks");

  // the one guessing sits out to watch: the same as leaving
  const w = setup(2);
  w.act("p0", { a: "start", game: "draw" });
  w.g("p0", "pick", { d: 1 });
  w.act("p1", { a: "watch", on: true });
  w.advance(DRAW_ROUND_MS + 2000);
  ok(w.view<V>("p0").alone && !w.pens().length, "a guesser who sits out to watch leaves nobody to guess: no penalty");
}

test("king: private tokens, crown, called numbers", () => {
  const t = setup(5);
  t.act("p0", { a: "start", game: "king" });
  ok(t.view<Extract<GameView, { id: "king" }>>("p1").myToken === null, "token hidden before pulling");
  for (const id of t.ids) {
    t.g(id, "pull");
    ok(t.view<Extract<GameView, { id: "king" }>>(id).myToken !== null, `${id} sees own token`);
  }
  ok(!JSON.stringify(t.eng.view("p1")).includes('"tokens"'), "no token map in payload");
  for (const id of t.ids) t.g(id, "ready");
  const v = t.view<Extract<GameView, { id: "king" }>>("p0");
  ok(v.phase === "crown" && v.king, "king revealed");
  t.g(v.king!, "command");
  const c = t.view<Extract<GameView, { id: "king" }>>("p0").cmd!;
  ok(c && c.nums.length >= 1 && !c.text.zh.includes("{a}"), "command filled");
  const called = t.ids.find((id) => c.nums.includes(t.view<Extract<GameView, { id: "king" }>>(id).myToken as number))!;
  t.g(called, "step");
  ok(Object.values(t.view<Extract<GameView, { id: "king" }>>("p0").stepped).includes(called), "called player stepped up");
  t.g(v.king!, "refuse", { target: called });
  ok(t.pens().some((p) => p.who.includes(called)), "refuser drinks");
  t.g(v.king!, "next");
  ok(t.view<Extract<GameView, { id: "king" }>>("p0").phase === "deal", "new round dealt");
});

test("prompts: never + likely", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "prompts" });
  t.g("p0", "draw");
  t.g("p0", "ans", { yes: true });
  t.g("p1", "ans", { yes: false });
  ok(t.view<Extract<GameView, { id: "prompts" }>>("p2").result === null, "answers hidden until all in");
  t.g("p2", "ans", { yes: true });
  t.g("p3", "ans", { yes: false });
  const r = t.view<Extract<GameView, { id: "prompts" }>>("p1").result!;
  ok(r.yes?.length === 2, "reveal shows who did it");
  t.advance(2000);
  ok(t.pens().some((p) => p.who.length === 2), "both drink");
  t.g("p0", "mode", { mode: "likely" });
  t.g("p1", "draw");
  t.g("p0", "draw");
  for (const id of t.ids) t.g(id, "vote", { target: id === "p3" ? "p2" : "p3" });
  const r2 = t.view<Extract<GameView, { id: "prompts" }>>("p1").result!;
  ok(r2.top?.[0] === "p3", "most voted is top");
});

test("dice + wheel", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "dice" });
  for (let i = 0; i < 20; i++) {
    const v = t.view<Extract<GameView, { id: "dice" }>>("p0");
    if (v.phase === "roll") t.g(v.turn, "roll");
    else if (v.phase === "assign") t.g(v.turn, "assign", { target: "p2" });
    else t.g(v.turn, "next");
    t.advance(1500);
  }
  ok(t.view<Extract<GameView, { id: "dice" }>>("p0").roll >= 6, "dice rolled");
  t.act("p0", { a: "start", game: "wheel" });
  t.act("p0", { a: "spin", scope: "wheel", index: 4, delta: 900, duration: 2 }); // "all"
  ok(t.view<Extract<GameView, { id: "wheel" }>>("p1").phase === "spinning", "wheel spinning");
  t.advance(2500);
  const last = t.pens().slice(-1)[0];
  ok(last && last.kind === "everyone" && last.who.length === 3, "everyone drinks slice");
});

test("buddy: penalized player calls the 2-holder", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "rogue" });
  const s = t.eng.d.game!.s as { holders: Record<string, string>; phase: string; drawer: string; card: number | null };
  s.holders.buddy = "p2";
  s.holders.trouble = "p0";
  t.g("p0", "trouble", { target: "p1" });
  const pen = t.pens().slice(-1)[0];
  ok(pen.buddy === "p2", "penalty carries buddy");
  t.act("p1", { a: "buddy", pen: pen.id });
  ok(t.pens().slice(-1)[0].who[0] === "p2", "buddy drinks too");
  t.act("p1", { a: "buddy", pen: pen.id });
  ok(t.pens().filter((p) => p.who[0] === "p2").length === 1, "buddy only once");
});


type V<K extends GameView["id"]> = Extract<GameView, { id: K }>;

test("superlatives: secret votes, award, ceremony", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "superlatives" });
  let v = t.view<V<"superlatives">>("p1");
  ok(v.phase === "vote" && v.round === 1, "voting on round 1");
  t.g("p1", "vote", { target: "p1" });
  ok(t.view<V<"superlatives">>("p1").myVote === null, "no voting for yourself");
  t.g("p0", "vote", { target: "p2" });
  t.g("p1", "vote", { target: "p2" });
  t.g("p2", "vote", { target: "p3" });
  ok(t.view<V<"superlatives">>("p3").counts === null, "counts stay hidden while voting");
  t.g("p3", "vote", { target: "p2" });
  v = t.view<V<"superlatives">>("p0");
  ok(v.phase === "reveal" && v.winners[0] === "p2" && v.counts?.p2 === 3, "everyone voted: p2 wins with 3");
  ok(v.awards.p2?.length === 1, "p2 holds the award");
  t.advance(3000);
  ok(t.pens().some((p) => p.who.includes("p2")), "the winner drinks");
  // tie round, then fast-forward to the ceremony
  t.g("p0", "next");
  t.g("p0", "vote", { target: "p1" });
  t.g("p1", "vote", { target: "p0" });
  t.advance(46_000);
  v = t.view<V<"superlatives">>("p0");
  ok(v.phase === "reveal" && v.winners.length === 2, "timer reveals a tie with two winners");
  const s = t.eng.d.game!.s as { round: number; total: number };
  s.round = s.total;
  t.g("p0", "next");
  ok(t.view<V<"superlatives">>("p0").phase === "ceremony", "after the last round: the ceremony");
  t.g("p0", "more");
  ok(t.view<V<"superlatives">>("p0").phase === "vote", "a few more rounds after the ceremony");
  t.g("p0", "custom", { text: "最会点歌" });
  v = t.view<V<"superlatives">>("p0");
  ok(v.custom && v.title.zh === "最会点歌", "the host can write a title");
});

test("punchline: writers and audience, the show's phases, sweep, safety, final picks", () => {
  const t = setup(10);
  t.act("p0", { a: "start", game: "punchline" });
  let v = t.view<V<"punchline">>("p9");
  ok(v.phase === "write" && v.players.length === 8 && v.audience.length === 2 && v.audience.includes("p9"), "eight write, two watch and vote");
  ok(v.mine.length === 0, "the audience gets no prompts");
  ok(t.view<V<"punchline">>("p0").mine.length === 2, "each writer gets two prompts");
  // everyone answers; p1 asks for a stock answer
  for (const pid of t.ids.slice(0, 8))
    for (const m of t.view<V<"punchline">>(pid).mine) t.g(pid, "answer", pid === "p1" ? { k: m.k, safety: true, lang: "en" } : { k: m.k, text: `${pid} answer ${m.k}` });
  v = t.view<V<"punchline">>("p0");
  ok(v.phase === "present" && v.match?.n === 1 && v.match.answers.every((a) => a.text && a.by === null), "all written: the first matchup is presented, names hidden");
  ok(!v.match!.canVote, "no voting during the presentation");
  t.advance(presentMs(2, false) + 50);
  v = t.view<V<"punchline">>("p9");
  ok(v.phase === "vote" && v.match!.canVote && v.match!.voters === 8, "then the vote: six writers and the audience");
  const st = t.eng.d.game!.s as { matches: { authors: string[]; order: number[] }[] };
  const m0 = st.matches[0];
  ok(!t.view<V<"punchline">>(m0.authors[0]).match!.canVote, "writers can't vote on their own matchup");
  // everyone votes for slot 0: a clean sweep
  for (const pid of t.ids) if (t.view<V<"punchline">>(pid).match!.canVote) t.g(pid, "vote", { slot: 0 });
  v = t.view<V<"punchline">>("p0");
  ok(v.phase === "result" && v.match!.sweep === 0, "every vote in: result, clean sweep");
  const w = m0.authors[m0.order[0]];
  const l = m0.authors[m0.order[1]];
  const expect = headToHeadPoints([m0.order[0] === 0 ? 8 : 0, m0.order[0] === 0 ? 0 : 8], 1, [false, false]).points;
  ok(v.match!.answers[0].by === w && v.match!.answers[0].votes === 8 && v.scores[w] === Math.max(...expect), `names and points revealed (${v.scores[w]})`);
  t.advance(5600);
  ok(t.pens().some((p) => p.who[0] === l && p.kind === "two"), "the swept writer drinks two");
  // play the rest out: everyone votes for the first answer they may pick
  let sawSafety = false;
  for (let i = 0; i < 80 && t.view<V<"punchline">>("p0").phase !== "end"; i++) {
    const cur = t.view<V<"punchline">>("p0");
    if (cur.phase === "write") {
      for (const pid of t.ids) for (const m of t.view<V<"punchline">>(pid).mine) if (!m.done) t.g(pid, "answer", { k: m.k, text: `x${i}` });
    } else if (cur.phase === "vote") {
      for (const pid of t.ids) {
        const mv = t.view<V<"punchline">>(pid).match!;
        if (!mv.canVote) continue;
        const picks = mv.answers.map((a, j) => j).filter((j) => j !== mv.mine && mv.answers[j].text).slice(0, mv.maxVotes);
        for (const j of picks) t.g(pid, "vote", { slot: j });
      }
    } else {
      if (cur.phase === "result" && cur.match!.answers.some((a) => a.safety)) sawSafety = true;
      t.advance(15_000);
    }
  }
  v = t.view<V<"punchline">>("p0");
  ok(sawSafety, "a stock answer is marked at its result");
  ok(v.phase === "end" && v.round === 3 && !!v.winners?.length, "three rounds, then a winner");
  ok(!(v.last ?? []).some((p) => v.audience.includes(p)), "the audience is never last");
});

test("punchline: final picks toggle, up to three, never your own", () => {
  const t = setup(5);
  t.act("p0", { a: "start", game: "punchline" });
  const s = t.eng.d.game!.s as { round: number };
  s.round = 3;
  t.g("p0", "next"); // write -> present (empty round 1 ends)
  // jump straight to a final round
  (t.eng.d.game!.s as { phase: string }).phase = "scores";
  t.g("p0", "next");
  let v = t.view<V<"punchline">>("p0");
  ok(v.phase === "write" && v.mine.length === 1, "the final: one prompt for everyone");
  for (const pid of t.ids) t.g(pid, "answer", { k: 0, text: `${pid} final` });
  t.advance(presentMs(5, true) + 50);
  v = t.view<V<"punchline">>("p0");
  ok(v.phase === "vote" && v.match!.final && v.match!.maxVotes === 3, "three picks each");
  const own = v.match!.mine!;
  t.g("p0", "vote", { slot: own });
  ok(t.view<V<"punchline">>("p0").match!.myVotes.length === 0, "can't pick your own");
  const others = [0, 1, 2, 3, 4].filter((j) => j !== own);
  for (const j of others) t.g("p0", "vote", { slot: j });
  ok(t.view<V<"punchline">>("p0").match!.myVotes.length === 3, "a fourth pick is refused");
  t.g("p0", "vote", { slot: others[0] });
  ok(t.view<V<"punchline">>("p0").match!.myVotes.length === 2, "tap again to take a pick back");
});

test("punchline: 再来一局 deals on from the same piles, so a table doesn't get its prompts again", () => {
  type PV = V<"punchline">;
  for (const players of [8, 5]) {
    // two games past the end of the pile, however big the pile grows
    const games = Math.floor(PUNCH_PROMPTS.length / (2 * players)) + 2;
    const t = setup(players);
    t.act("p0", { a: "start", game: "punchline" });
    const played: { h2h: string[]; final: string }[] = [];
    for (let g = 0; g < games; g++) {
      const game = { h2h: [] as string[], final: "" };
      for (let i = 0; i < 200 && t.view<PV>("p0").phase !== "end"; i++) {
        const cur = t.view<PV>("p0");
        if (cur.phase === "write") {
          const prompts = new Map<number, string>();
          for (const pid of t.ids) for (const m of t.view<PV>(pid).mine) prompts.set(m.k, m.prompt.zh);
          if (cur.round < cur.rounds) game.h2h.push(...prompts.values());
          else game.final = [...prompts.values()][0];
          for (const pid of t.ids) for (const m of t.view<PV>(pid).mine) if (!m.done) t.g(pid, "answer", { k: m.k, text: `${pid} ${g}.${i}` });
        } else if (cur.phase === "vote") {
          for (const pid of t.ids) {
            const mv = t.view<PV>(pid).match!;
            if (!mv.canVote) continue;
            const picks = mv.answers.map((_, j) => j).filter((j) => j !== mv.mine && mv.answers[j].text).slice(0, mv.maxVotes);
            for (const j of picks) t.g(pid, "vote", { slot: j });
          }
        } else t.advance(15_000);
      }
      ok(t.view<PV>("p0").phase === "end", `${players} at the table: game ${g + 1} ends`);
      played.push(game);
      t.g("p0", "again", { step: t.view<PV>("p0").step });
    }
    const perGame = 2 * players;
    played.forEach((game, k) => {
      ok(game.h2h.length === perGame && new Set(game.h2h).size === perGame, `${players} at the table: game ${k + 1} has ${perGame} different prompts (${new Set(game.h2h).size})`);
      if (k === 0) return;
      const again = game.h2h.filter((p) => played[k - 1].h2h.includes(p));
      ok(!again.length, `${players} at the table: game ${k + 1} has none of game ${k}'s prompts (${again.join(" / ")})`);
      ok(game.final !== played[k - 1].final, `${players} at the table: game ${k + 1}'s final isn't game ${k}'s (${game.final})`);
    });
    const onePass = Math.floor(PUNCH_PROMPTS.length / perGame);
    ok(played.length > onePass, `${players} at the table: the test plays past the end of the pile`);
    const first = played.slice(0, onePass).flatMap((game) => game.h2h);
    ok(new Set(first).size === first.length, `${players} at the table: the first ${onePass} games never repeat a prompt`);
    const finals = played.slice(0, PUNCH_FINAL.length).map((game) => game.final);
    ok(new Set(finals).size === finals.length, `${players} at the table: ${finals.length} games, ${finals.length} different finals`);
  }
});

test("punchline: past eight at the table, whoever watched a game writes the next one", () => {
  type PV = V<"punchline">;
  const ids = Array.from({ length: 11 }, (_, i) => `p${i}`);
  ok(nextWriters(ids.slice(0, 8), ids.slice(0, 3), {}).join() === ids.slice(0, 8).join(), "eight or fewer: everyone writes");
  ok(nextWriters(ids, null, {}).join() === ids.slice(0, 8).join(), "the first game: the first eight seats");
  const t = setup(11);
  t.act("p0", { a: "start", game: "punchline" });
  const writersOf: string[][] = [];
  for (let g = 0; g < 5; g++) {
    const v = t.view<PV>("p0");
    writersOf.push(v.players);
    ok(v.players.length === 8 && v.audience.length === 3 && v.audience.every((pid) => !v.players.includes(pid)), `game ${g + 1}: eight write, three watch`);
    ok(t.view<PV>(v.audience[0]).mine.length === 0 && t.view<PV>(v.players[0]).mine.length === 2, `game ${g + 1}: the writers get the prompts`);
    // nobody writes: the host moves the show on to the end
    for (let i = 0; i < 20 && t.view<PV>("p0").phase !== "end"; i++) t.g("p0", "next", { step: t.view<PV>("p0").step });
    ok(t.view<PV>("p0").phase === "end", `game ${g + 1} ends`);
    // (a game saved before games written were counted plays on the same way)
    if (g === 3) delete (t.eng.d.game!.s as { written?: unknown }).written;
    t.g("p0", "again", { step: t.view<PV>("p0").step });
  }
  ok(writersOf[0].join() === ids.slice(0, 8).join(), "the first game: the first eight seats write");
  writersOf.slice(1).forEach((ws, k) => {
    const watched = ids.filter((pid) => !writersOf[k].includes(pid));
    ok(watched.every((pid) => ws.includes(pid)), `game ${k + 2}: all three who watched game ${k + 1} write (${watched.join(" ")})`);
  });
  const out = ids.map((pid) => writersOf.slice(0, 4).filter((ws) => !ws.includes(pid)).length);
  ok(Math.max(...out) - Math.min(...out) <= 1, `over four games, everyone watches about as often (${out.join(" ")})`);
});

test("postit: chain of notes, hidden forehead, guesses", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "postit" });
  let v = t.view<V<"postit">>("p0");
  ok(v.phase === "write" && v.myTarget === "p1", "p0 writes for the next seat");
  t.g("p0", "write", { text: "孙悟空" });
  t.g("p1", "write", { text: "Pikachu" });
  ok(t.view<V<"postit">>("p2").notes.p1 === null, "notes stay hidden while writing");
  t.g("p2", "random");
  v = t.view<V<"postit">>("p1");
  ok(v.phase === "play", "all written: play");
  ok(v.notes.p1 === null && v.notes.p2?.zh === "Pikachu", "own note hidden, others visible");
  ok(t.view<V<"postit">>("p2").notes.p1?.zh === "孙悟空", "p2 sees p1's note");
  t.g(v.turn, "ask", { text: "我是动物吗？" });
  t.g("p1", "reply", { r: "no" });
  ok(t.view<V<"postit">>("p0").replies.p1 === "no", "reply counted");
  const turn = t.view<V<"postit">>("p0").turn;
  t.g(turn, "guess", { text: "definitely wrong" });
  t.advance(1000);
  ok(t.pens().some((p) => p.who[0] === turn), "wrong guess drinks");
  t.g("p0", "accept");
  ok(t.view<V<"postit">>("p0").solved.includes(turn), "host accepts a near miss");
  // p1 guesses their own note
  while (t.view<V<"postit">>("p0").turn !== "p1" && t.view<V<"postit">>("p0").phase === "play") t.g(t.view<V<"postit">>("p0").turn, "pass");
  if (t.view<V<"postit">>("p0").phase === "play") t.g("p1", "guess", { text: "是不是孙悟空" });
  v = t.view<V<"postit">>("p1");
  ok(v.solved.includes("p1") || v.phase === "end", "p1 got it in Chinese");
  ok(v.phase === "end" || v.notes.p1?.zh === "孙悟空", "a solved player sees their own note");
});

/**
 * The shared dice (seed) as they were before the test: tests further down rely on the draws they
 * get (who is cast in 戏精大赏's second scene), so a new test here must not move them on.
 */
const sameDice = (fn: () => void) => () => {
  const was = seed;
  try {
    fn();
  } finally {
    seed = was;
  }
};

/** Every note written by hand, so a test knows what is on each forehead: `notes[i]` goes on player i. */
function postitTable(notes: string[]) {
  const t = setup(notes.length);
  t.act("p0", { a: "start", game: "postit" });
  notes.forEach((_, i) => t.g(`p${i}`, "write", { text: notes[(i + 1) % notes.length] }));
  const pv = (pid = "p0") => t.view<V<"postit">>(pid);
  ok(pv().phase === "play", "every note written: play");
  return { ...t, pv };
}

test("postit: a second tap on send leaves the question and the answers alone", sameDice(() => {
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  const t = postitTable(["猫", "狗", "龙"]);
  const turn = t.pv().turn;
  const other = t.ids.find((p) => p !== turn)!;
  t.g(turn, "ask", { text: "我是动物吗？" });
  t.g(other, "reply", { r: "yes" });
  ok(nothing(t.g(turn, "ask", { text: "" })), "an empty question changes nothing");
  ok(nothing(t.g(turn, "ask", { text: "   " })), "nor does one of spaces");
  ok(t.pv().asking === "我是动物吗？" && t.pv().replies[other] === "yes", `the question and its answers are still there (${t.pv().asking}, ${JSON.stringify(t.pv().replies)})`);
  t.g(turn, "ask", { text: "我会飞吗？" });
  ok(t.pv().asking === "我会飞吗？" && !Object.keys(t.pv().replies).length, "a new question starts the answers again");
}));

test("postit: a note of one character or three letters can be guessed in a sentence", sameDice(() => {
  const right = (zh: string, en: string, guess: string, alias: string[] = []) => guessMatches(guess, { zh, en }, alias);
  for (const g of ["猫", "我是猫", "是不是猫", "我是一只猫吗？", "难道我是猫", "我猜是猫吧"]) ok(right("猫", "猫", g), `猫 <- ${g}`);
  for (const g of ["cat", "a cat", "I am a cat", "am I a cat?", "I think I'm a cat, right?", "cats", "The Cat"]) ok(right("Cat", "Cat", g), `Cat <- ${g}`);
  ok(right("龙", "Dragon", "我是龙", ["中国龙"]) && right("龙", "Dragon", "am I a dragon"), "the deck's one-character note too");
  ok(right("The Beatles", "The Beatles", "beatles") && right("A Bug's Life", "A Bug's Life", "bugs life"), "a name's own article is not needed");
  for (const g of ["狗", "我是熊猫", "猫和狗", "我不是猫", "catfish", "I am not a cat", "a cat or a dog", "scat"]) ok(!right("猫", "Cat", g), `猫 / Cat is not ${g}`);
  ok(!right("只狼", "Sekiro", "狼") && right("只狼", "Sekiro", "我是只狼吗"), "a Chinese name is not cut down to fit");
  ok(right("孙悟空", "Sun Wukong", "是不是孙悟空") && right("爱因斯坦", "Albert Einstein", "einstien", ["einstein"]) && !right("超人", "Superman", "蝙蝠侠"), "what counted before still counts");

  const t = postitTable(["猫", "狗", "龙"]);
  const turn = t.pv().turn;
  const mine = ["猫", "狗", "龙"][Number(turn.slice(1))];
  t.g(turn, "guess", { text: `我是${mine}吗？` });
  t.advance(1000);
  ok(t.pv().solved.includes(turn) && !t.pens().length, `at the table: 我是${mine}吗 is right, and nobody drinks`);
}));

test("postit: someone who sits down mid-game is dealt a note and plays", sameDice(() => {
  const t = postitTable(["猫", "狗", "龙"]);
  t.eng.hello("late", "Late", false);
  t.eng.flush();
  let lv = t.view<V<"postit">>("late");
  ok(t.pv().order.join() === "p0,p1,p2,late", `they are on the end of the order (${t.pv().order.join()})`);
  ok(lv.notes.late === null && lv.notes.p0?.zh === "猫" && lv.notes.p1?.zh === "狗" && lv.notes.p2?.zh === "龙", "they see everyone's note but their own");
  ok(!!t.pv("p1").notes.late, "and the others see theirs, from the deck");
  t.g(t.pv().turn, "ask", { text: "Am I famous?" });
  t.g("late", "reply", { r: "no" });
  ok(t.pv().replies.late === "no", "their answer counts now: they can see the note");
  // round the table: their turn comes
  for (let i = 0; i < 3; i++) t.g(t.pv().turn, "pass");
  ok(t.pv().turn === "late", `their turn comes round (${t.pv().turn})`);
  t.g("late", "guess", { text: t.pv("p0").notes.late!.zh });
  ok(t.pv().solved.includes("late"), "and they can guess theirs");

  // written notes: someone who joins while they are being written is on the end of the chain
  const w = setup(3);
  w.act("p0", { a: "start", game: "postit" });
  w.g("p0", "write", { text: "A" });
  w.g("p1", "write", { text: "B" });
  w.g("p2", "write", { text: "C" });
  ok(w.view<V<"postit">>("p0").phase === "play", "three notes: play");
  const w2 = setup(3);
  w2.act("p0", { a: "start", game: "postit" });
  w2.g("p2", "write", { text: "for p0" });
  w2.eng.hello("late", "Late", false);
  w2.eng.flush();
  let wv = w2.view<V<"postit">>("p2");
  ok(wv.phase === "write" && wv.order.join() === "p0,p1,p2,late" && wv.myTarget === "late", `the last writer now writes for them (${wv.myTarget})`);
  ok(w2.view<V<"postit">>("late").myTarget === "p0", "and they write for the first");
  for (const p of ["p0", "p1", "p2"]) w2.g(p, "random");
  wv = w2.view<V<"postit">>("p0");
  ok(wv.phase === "play" && wv.written.length === 4, "everyone has a note: play");

  // a seat that stops just watching mid-game joins the same way; one that starts watching is out
  const s = postitTable(["猫", "狗", "龙"]);
  s.act("p2", { a: "watch", on: true });
  ok(s.pv().order.join() === "p0,p1", "watching: out of the game");
  s.act("p2", { a: "watch", on: false });
  lv = s.view<V<"postit">>("p2");
  ok(s.pv().order.join() === "p0,p1,p2" && lv.notes.p2 === null && !!lv.notes.p0 && !!s.pv().notes.p2, "back at the table: a new note, and the others' in view");
}));

test("postit: everyone gets the same number of turns, and the first to ask moves on", sameDice(() => {
  // two players: the first guesses right at once, and the second still gets a turn
  let t = postitTable(["猫", "狗"]);
  ok(t.pv().turn === "p0" && !t.pv().final, "the first seat asks first, the first game");
  t.g("p0", "guess", { text: "猫" });
  t.advance(3000);
  let v = t.pv();
  ok(v.phase === "play" && v.turn === "p1" && v.final === true && !t.pens().length, `the second player has a last chance (${v.phase}, ${v.turn}, final ${v.final})`);
  t.g("p1", "guess", { text: "狗" });
  t.advance(3000);
  v = t.pv();
  ok(v.phase === "end" && v.solved.length === 2 && !t.pens().length, "both got theirs: nobody drinks the glass");

  // ...and a miss on the last chance is the glass, without a sip first
  t = postitTable(["猫", "狗"]);
  t.g("p0", "guess", { text: "猫" });
  t.g("p1", "guess", { text: "不知道" });
  t.advance(3000);
  ok(t.pv().phase === "end" && t.pens().length === 1 && t.pens()[0].kind === "full" && t.pens()[0].who.join() === "p1", `the glass, once (${t.pens().map((p) => p.kind + ":" + p.who).join()})`);
  ok(t.pv().last === "p1", "and every phone is told who drinks it");
  // the game is over: the host can't count it after all (the glass has been called)
  t.g("p0", "accept");
  ok(!t.pv().solved.includes("p1") && t.pv().guess?.ok === false, "nothing is counted after the end");

  // giving up on the last chance is the glass too
  t = postitTable(["猫", "狗"]);
  t.g("p0", "guess", { text: "猫" });
  t.g("p1", "pass");
  t.advance(3000);
  ok(t.pv().phase === "end" && t.pens().length === 1 && t.pens()[0].kind === "full", "a pass on the last chance ends it");

  // no extra turn for someone who has had as many as the rest
  t = postitTable(["猫", "狗"]);
  t.g("p0", "guess", { text: "错" });
  t.g("p1", "guess", { text: "狗" });
  t.advance(3000);
  v = t.pv();
  ok(v.phase === "end" && t.pens().filter((p) => p.kind === "full").map((p) => p.who.join()).join() === "p0", "the first player had a turn already: the game ends on them");

  // three players: the last in the order hasn't had their turn when the other two get theirs
  t = postitTable(["猫", "狗", "龙"]);
  t.g("p0", "guess", { text: "猫" });
  t.g("p1", "guess", { text: "狗" });
  v = t.pv();
  ok(v.phase === "play" && v.turn === "p2" && v.final === true, "the third player gets their turn, as a last chance");
  t.g("p2", "guess", { text: "龙" });
  ok(t.pv().phase === "end", "and takes it");

  // the host counts a near miss while the one left is mid-turn: that turn becomes their last chance, question and all
  const h = postitTable(["猫", "狗", "龙"]);
  h.g("p0", "guess", { text: "猫" });
  h.g("p1", "guess", { text: "小狗狗呀呀" });
  h.g("p2", "ask", { text: "Am I big?" });
  h.g("p0", "reply", { r: "yes" });
  h.g("p0", "accept");
  const hv = h.pv();
  ok(hv.solved.includes("p1") && hv.turn === "p2" && hv.final === true && hv.asking === "Am I big?" && hv.replies.p0 === "yes", `p2's turn goes on as the last chance (${hv.turn}, ${hv.final}, ${hv.asking})`);

  // the next game, the next seat asks first; and the one after that
  t.g("p0", "again");
  ["猫", "狗", "龙"].forEach((_, i) => t.g(`p${i}`, "write", { text: ["猫", "狗", "龙"][(i + 1) % 3] }));
  ok(t.pv().phase === "play" && t.pv().turn === "p1", `second game: the second seat asks first (${t.pv().turn})`);
  for (const p of ["p1", "p2", "p0"]) t.g(p, "guess", { text: ["猫", "狗", "龙"][Number(p.slice(1))] });
  t.g("p0", "again");
  t.g("p0", "begin");
  ok(t.pv().turn === "p2", `third game: the third (${t.pv().turn})`);
}));

test("postit: when the others leave, nobody is told to drink the glass", sameDice(() => {
  // two guessing, one goes home: the other is not "last"
  let t = postitTable(["猫", "狗"]);
  t.act("p1", { a: "leave" });
  t.advance(3000);
  ok(t.pv().phase === "end" && !t.pens().length && t.pv().last === null && t.pv().order.join() === "p0", "the only one left: the game ends, no glass, and the phones are told nobody drinks it");

  // one has theirs, two are guessing, one of those leaves: the other gets a last chance, not the glass
  t = postitTable(["猫", "狗", "龙"]);
  t.g("p0", "guess", { text: "猫" });
  t.g("p1", "pass");
  t.act("p2", { a: "leave" });
  t.advance(3000);
  let v = t.pv();
  ok(v.phase === "play" && v.turn === "p1" && v.final === true && !t.pens().length, `a last chance for the one still guessing (${v.phase}, ${v.turn}, ${v.final})`);
  // the one who had theirs leaves too: nobody is left who got there first
  t.act("p0", { a: "leave" });
  t.advance(3000);
  ok(t.view<V<"postit">>("p1").phase === "end" && !t.pens().length, "and then alone: over, no glass");

  // someone with their note leaves during another's last chance: the last chance carries on
  t = postitTable(["猫", "狗", "龙"]);
  t.g("p0", "guess", { text: "猫" });
  t.g("p1", "guess", { text: "狗" });
  ok(t.pv().final === true && t.pv().turn === "p2", "p2 on a last chance");
  t.act("p1", { a: "leave" });
  v = t.pv();
  ok(v.phase === "play" && v.turn === "p2" && v.final === true && v.solved.join() === "p0", `still p2's last chance, and the one who left is off the list (${v.solved.join()})`);
  t.g("p2", "guess", { text: "错" });
  t.advance(3000);
  ok(t.pv().phase === "end" && t.pens().length === 1 && t.pens()[0].who.join() === "p2", "missed: the glass");
  // leaving the table at the end screen calls no second glass
  t.act("p2", { a: "leave" });
  t.advance(3000);
  ok(t.pens().length === 1, "nobody drinks twice");
}));

test("postit: the host picks the deck the notes nobody writes come from", sameDice(() => {
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  const japan = HEADS_DECKS.find((d) => d.id === "japan")!.words.map((w) => w.zh);
  const mixed = NOTES.map((n) => n.t.zh);
  const t = setup(3);
  t.act("p0", { a: "start", game: "postit" });
  const pv = (pid = "p0") => t.view<V<"postit">>(pid);
  ok(pv().pick === "mix", "to start with, the mixed bag");
  ok(nothing(t.g("p1", "pick", { id: "japan" })) && pv().pick === "mix", "only the host picks");
  ok(nothing(t.g("p0", "pick", { id: "no-such-deck" })) && pv().pick === "mix", "a deck that isn't there changes nothing");
  t.g("p0", "pick", { id: "japan" });
  ok(pv("p2").pick === "japan", "every phone is told");
  t.g("p0", "random");
  ok(japan.includes(pv("p0").notes.p1!.zh), `Pick for me deals from 日本 (${pv("p0").notes.p1!.zh})`);
  t.g("p0", "begin");
  ok(pv().phase === "play" && japan.includes(pv("p0").notes.p2!.zh) && japan.includes(pv("p1").notes.p0!.zh), "and so does Start now, for the rest");
  ok(nothing(t.g("p0", "pick", { id: "spicy" })) && pv().pick === "japan", "not while they play: the notes are on");
  // to the end (everyone guesses theirs), then the next game: still 日本, unless the host picks again
  const playOut = () => {
    for (let i = 0; i < 12 && pv().phase === "play"; i++) {
      const tn = pv().turn;
      t.g(tn, "guess", { text: pv(tn === "p0" ? "p1" : "p0").notes[tn]!.zh });
    }
    t.advance(3000);
  };
  playOut();
  ok(pv().phase === "end", "over");
  t.g("p0", "pick", { id: "mix" });
  ok(pv().pick === "mix", "at the end the host can pick for the next game");
  t.g("p0", "pick", { id: "spicy" });
  t.g("p0", "again");
  t.g("p0", "begin");
  const spicy = HEADS_DECKS.find((d) => d.id === "spicy")!.words.map((w) => w.zh);
  ok(pv().pick === "spicy" && ["p0", "p1", "p2"].every((p) => spicy.includes(pv(p === "p0" ? "p1" : "p0").notes[p]!.zh)), "the next game deals from the deck picked at the end");
  // back to the mixed bag
  playOut();
  t.g("p0", "pick", { id: "mix" });
  t.g("p0", "again");
  t.g("p0", "begin");
  ok(["p0", "p1", "p2"].every((p) => mixed.includes(pv(p === "p0" ? "p1" : "p0").notes[p]!.zh)), "mix: the mixed bag again");

  // a word from a deck keeps the other names the mixed bag knows it by (孙悟空: 美猴王, monkey king)
  const c = setup(4);
  c.act("p0", { a: "start", game: "postit" });
  c.g("p0", "pick", { id: "people" });
  c.g("p0", "begin");
  const cv = (pid: string) => c.view<V<"postit">>(pid);
  const known = ["p0", "p1", "p2", "p3"].map((p) => ({ p, note: cv(p === "p0" ? "p1" : "p0").notes[p]! })).find(({ note }) => (NOTES.find((n) => n.t.zh === note.zh)?.alias ?? []).length);
  ok(!!known, "someone has a note with another name");
  if (known) {
    const alias = NOTES.find((n) => n.t.zh === known.note.zh)!.alias![0];
    for (let i = 0; i < 8 && cv("p0").turn !== known.p; i++) c.g(cv("p0").turn, "pass");
    c.g(known.p, "guess", { text: alias });
    ok(cv("p0").solved.includes(known.p), `${known.note.zh} is guessed as ${alias}`);
  }
}));

test("freeze: shared stop, motion reports, knockout to a winner", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "freeze" });
  t.g("p0", "go");
  let v = t.view<V<"freeze">>("p1");
  ok(v.phase === "dance" && v.stopAt > v.musicAt, "dancing with a stop scheduled");
  t.g("p1", "moved");
  ok(t.view<V<"freeze">>("p1").moved.length === 0, "moving while the music plays is fine");
  t.advance(v.stopAt - clock + 10);
  ok(t.view<V<"freeze">>("p1").phase === "freeze", "music stopped: freeze");
  t.g("p1", "moved");
  t.g("p0", "catch", { pid: "p2" });
  t.advance(4000);
  t.advance(1000);
  v = t.view<V<"freeze">>("p0");
  ok(v.phase === "end" && v.winner === "p0", "p1 and p2 out: p0 wins");
  ok(t.pens().some((p) => p.who.includes("p1") && p.who.includes("p2")), "both drink");
});

test("limbo: lean to pass, miss and drink, last one wins", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "limbo" });
  t.g("p0", "go");
  let v = t.view<V<"limbo">>("p0");
  ok(v.phase === "go" && v.angle === 20, "first bar at 20 degrees");
  t.advance(3600);
  t.g("p0", "pass", { deg: 24 });
  t.g("p1", "pass", { deg: 31 });
  t.g("p2", "fail");
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "result" && v.out.includes("p2"), "p2 out");
  t.advance(7100);
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "go" && v.angle === 30, "the bar drops");
  t.advance(3600);
  t.g("p0", "best", { deg: 28 });
  t.g("p1", "pass", { deg: 33 });
  t.advance(16_000);
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "end" && v.winner === "p1", "time up: p0 misses, p1 wins");
});

test("limbo: nobody leans at all, nobody wins for it: everyone drinks, same bar again", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "limbo" });
  t.g("p0", "go");
  t.advance(3600);
  t.advance(16_000);
  let v = t.view<V<"limbo">>("p1");
  ok(v.phase === "result" && v.winner === null && v.alive.length === 3 && v.out.length === 0, "time up with no leans: no champion, nobody out");
  t.advance(700);
  ok(t.pens().some((p) => ["p0", "p1", "p2"].every((id) => p.who.includes(id))), "everyone drinks");
  t.advance(6400);
  v = t.view<V<"limbo">>("p1");
  ok(v.phase === "go" && v.angle === 20 && v.failed.length === 0, "the same bar again, from a clean slate");
  t.advance(3600);
  t.g("p0", "best", { deg: 12 });
  t.g("p1", "fail");
  t.g("p2", "fail");
  t.advance(16_000);
  v = t.view<V<"limbo">>("p1");
  ok(v.phase === "end" && v.winner === "p0", "nobody made it, but p0 leaned furthest: p0 wins");
});

test("limbo blind: lean to the target unseen, furthest off drinks and goes, last one wins", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "limbo" });
  t.g("p1", "mode", { mode: "blind" });
  ok(t.view<V<"limbo">>("p0").mode === "classic", "only the host picks the mode");
  t.g("p0", "mode", { mode: "blind" });
  for (const p of ["p0", "p1", "p2"]) t.g(p, "sensor", { on: true });
  t.g("p0", "go");
  let v = t.view<V<"limbo">>("p3");
  ok(v.phase === "go" && v.mode === "blind", "blind round on");
  ok(!v.alive.includes("p3") && v.alive.length === 3, "a phone that can't measure watches this game");
  const target = v.angle;
  ok(target >= 25 && target <= 60, "a moderate target");
  t.advance(3600);
  t.g("p0", "lock", { deg: target - 2 });
  t.g("p1", "lock", { deg: target + 5 });
  v = t.view<V<"limbo">>("p2");
  ok(v.locked.length === 2 && Object.keys(v.locks).length === 0, "who locked shows, how far stays hidden");
  t.g("p0", "lock", { deg: 10 });
  t.g("p2", "lock", { deg: target - 12 });
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "result" && v.out.includes("p2") && v.locks.p0 === target - 2, "furthest off is out; a second lock doesn't count");
  t.advance(700);
  ok(t.pens().some((p) => p.who.includes("p2") && !p.who.includes("p0")), "p2 drinks");
  t.advance(6400);
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "go" && v.angle !== target, "a new target");
  t.advance(3600);
  t.g("p0", "lock", { deg: v.angle + 1 });
  t.advance(16_000);
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "end" && v.winner === "p0", "time up: no lock is the furthest off, p0 wins");
});

test("limbo blind: needs two phones that can measure, and the classic moves don't count", () => {
  const t = setup(2);
  t.act("p0", { a: "start", game: "limbo" });
  t.g("p0", "mode", { mode: "blind" });
  t.g("p0", "sensor", { on: true });
  t.g("p0", "go");
  ok(t.view<V<"limbo">>("p0").phase === "ready", "only one phone can measure: no start");
  t.g("p1", "sensor", { on: true });
  t.g("p0", "go");
  t.advance(3600);
  t.g("p0", "pass", { deg: 80 });
  ok(t.view<V<"limbo">>("p0").phase === "go", "pass is a classic move, ignored in blind");
});

test("limbo steady: reach the bar and hold still, a longer hold every bar", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "limbo" });
  t.g("p1", "mode", { mode: "steady" });
  ok(t.view<V<"limbo">>("p0").mode === "classic", "only the host picks the mode");
  t.g("p0", "mode", { mode: "steady" });
  t.g("p0", "go");
  let v = t.view<V<"limbo">>("p2");
  ok(v.phase === "go" && v.mode === "steady" && v.bar.kind === "steady", "a steady bar on every phone");
  ok(v.angle === 20 && v.bar.hold === 2000, "bar 1: 20 degrees, held still for 2 seconds");
  ok(v.endsAt - v.startAt === 17_000, "the hold's time is added to the bar's");
  t.advance(3600);
  t.g("p0", "pass", { deg: 22 });
  t.g("p1", "pass", { deg: 25 });
  t.g("p2", "fail");
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "result" && v.out.includes("p2"), "a phone that lost the hold: out");
  t.advance(7100);
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "go" && v.angle === 30 && v.bar.kind === "steady" && v.bar.hold === 2500, "bar 2: deeper, and half a second longer");
  ok(steadyMs(4) === 4000 && steadyMs(8) === 6000 && steadyMs(13) === 6000, "the hold grows to six seconds and stays there");
  // a phone without a motion sensor: the host judges it, as in classic
  t.advance(3600);
  t.g("p0", "judge", { pid: "p1", ok: true });
  t.g("p0", "fail");
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "end" && v.winner === "p1", "the host's call counts: p1 wins");
});

test("limbo moving: one path from the start time, kept up with until it stops", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "limbo" });
  t.g("p0", "mode", { mode: "moving" });
  t.g("p0", "go");
  let v = t.view<V<"limbo">>("p1");
  const bar = v.bar;
  ok(bar.kind === "moving" && bar.swing === 12 && bar.period === 6000 && bar.moveMs === 13_500, "bar 1 sways 12 degrees, once every 6 seconds, twice");
  ok(JSON.stringify([t.view<V<"limbo">>("p0").bar, t.view<V<"limbo">>("p0").startAt]) === JSON.stringify([bar, v.startAt]), "every phone gets the same bar and start time");
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  ok(barAngleAt(v.angle, bar, -800) === 8 && barAngleAt(v.angle, bar, 1500) === 8, "it waits at its top (8 degrees) first");
  ok(near(barAngleAt(v.angle, bar, 1500 + 3000), 20) && near(barAngleAt(v.angle, bar, 1500 + 1500), 14), "down to the bar's 20 degrees halfway through a sway");
  ok(near(barAngleAt(v.angle, bar, 1500 + 6000), 8) && near(barAngleAt(v.angle, bar, 1500 + 9000), 20), "back up, and down again");
  ok(near(barAngleAt(v.angle, bar, 13_500), 8) && near(barAngleAt(v.angle, bar, 40_000), 8), "it stops at its top");
  ok(v.endsAt - v.startAt === 18_500, "five seconds after it stops to say how it went");
  t.advance(3600);
  t.g("p0", "pass", { deg: 20 });
  t.g("p0", "judge", { pid: "p2", ok: true });
  v = t.view<V<"limbo">>("p0");
  ok(v.passed.length === 0, "nobody has kept up with it while it still moves, by phone or by the host");
  t.g("p1", "fail", { deg: 9 });
  v = t.view<V<"limbo">>("p0");
  ok(v.failed.includes("p1") && v.best.p1 === 9, "losing it counts at once, with how deep it went while they were with it");
  t.advance(13_500);
  t.g("p0", "pass", { deg: 20 });
  t.g("p0", "judge", { pid: "p2", ok: true });
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "result" && v.out.includes("p1") && v.alive.join() === "p0,p2", "once it stops: kept up, p1 lost it");
  t.advance(7100);
  v = t.view<V<"limbo">>("p0");
  ok(v.bar.kind === "moving" && v.angle === 30 && v.bar.swing === 20 && v.bar.period === 5600, "bar 2: from 10 down to 30 degrees, a little quicker");
  t.advance(3600);
  t.g("p0", "best", { deg: 25 });
  t.advance(v.bar.moveMs + 5000);
  v = t.view<V<"limbo">>("p0");
  ok(v.phase === "end" && v.winner === "p0", "nobody said they kept up: the one who followed it deepest wins");
});

test("limbo tilt: a sideways tilt as well, to a random side each bar", () => {
  const t = setup(2);
  t.act("p0", { a: "start", game: "limbo" });
  t.g("p0", "mode", { mode: "tilt" });
  t.g("p0", "go");
  const sides: number[] = [];
  for (let i = 0; i < 12; i++) {
    const v = t.view<V<"limbo">>("p1");
    ok(v.phase === "go" && v.bar.kind === "tilt" && v.bar.hold === 0 && v.bar.period === 0, `bar ${i + 1} is a tilt`);
    sides.push(v.bar.side);
    t.advance(3600);
    t.g("p0", "pass", { deg: v.angle });
    t.g("p1", "pass", { deg: v.angle });
    t.advance(7100);
  }
  ok(sides.every((d, i) => Math.abs(d) === TILT_SIDES[Math.min(i, TILT_SIDES.length - 1)]), `15 degrees to the side first, then more (${sides.join(" ")})`);
  ok(sides.some((d) => d < 0) && sides.some((d) => d > 0), "both sides come up");
});

test("limbo party: a random variant each bar, never the same twice running, never blind", () => {
  const t = setup(2);
  t.act("p0", { a: "start", game: "limbo" });
  t.g("p0", "mode", { mode: "party" });
  t.g("p0", "go");
  const kinds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const v = t.view<V<"limbo">>("p0");
    const b = v.bar;
    kinds.push(b.kind);
    ok(v.phase === "go" && v.mode === "party", `bar ${i + 1} is on`);
    ok((b.kind === "steady") === (b.hold > 0) && (b.kind === "tilt") === (b.side !== 0) && (b.kind === "moving") === (b.period > 0), `bar ${i + 1} asks what a ${b.kind} bar asks`);
    t.advance(3600 + b.moveMs);
    t.g("p0", "pass", { deg: v.angle });
    t.g("p1", "pass", { deg: v.angle });
    t.advance(7100);
  }
  ok(kinds.every((k, i) => i === 0 || k !== kinds[i - 1]), "never the same twice running");
  ok(kinds.every((k) => (PARTY_KINDS as string[]).includes(k)) && new Set(kinds).size === 4, `all four come up, and only those (${kinds.join(" ")})`);
  const u = setup(2);
  u.act("p0", { a: "start", game: "limbo" });
  u.g("p0", "mode", { mode: "upside-down" });
  ok(u.view<V<"limbo">>("p0").mode === "classic", "a mode the game doesn't know is classic");
});

test("limbo coach: what the phone says to someone who can't see it", () => {
  // a moving bar: with it, below it, above it; the grace second running out makes it urgent
  ok(coaching("moving", { lean: 14, target: 18 }).say === "on", "within the band: a tick");
  ok(coaching("moving", { lean: 2, target: 18 }).say === "down", "short of a moving bar: lean back more");
  const up = coaching("moving", { lean: 54, target: 12, lost: 0.7 });
  ok(up.say === "up" && up.urgency >= 0.7, "past a moving bar: come up, and urgently once the second is running out");
  ok(coaching("moving", { lean: 30, target: 18, lost: 0 }).urgency < 0.5, "just off it, with time: not urgent yet");
  // classic and hold steady: short, then there (the hold is heard)
  const short = coaching("classic", { lean: 5, target: 20, hold: 0 });
  ok(short.say === "down" && short.hold === 0, "short of the bar: lean back more");
  const there = coaching("classic", { lean: 24, target: 20, hold: 0.4 });
  ok(there.say === "on" && there.hold === 0.4, "past the bar: a tick, and the hold's hum");
  ok(coaching("steady", { lean: 24, target: 20, hold: 0, wobbleAt: 1234 }).wobbleAt === 1234, "a wobble is passed on (the buzz)");
  ok(coaching("classic", { lean: 60, target: 20 }).say === "on", "a classic bar never says come up");
  // tilt through: back enough but not tilted enough, to either side
  ok(coaching("tilt", { lean: 25, target: 20, side: 3, want: 15 }).say === "side", "not tilted right enough: tilt further");
  ok(coaching("tilt", { lean: 25, target: 20, side: -10, want: -15 }).say === "side", "not tilted left enough: tilt further");
  ok(coaching("tilt", { lean: 25, target: 20, side: -16, want: -15, hold: 0.2 }).say === "on", "tilted enough: there");
  ok(coaching("tilt", { lean: 10, target: 20, side: 20, want: 15 }).say === "down", "not back enough comes first");
});

test("limbo band: a gear up every bar, the calypso itself untouched", () => {
  const first = GROOVES.calypso.lead!.bars[0].find((n) => n != null)!;
  const bpms = [0, 1, 2, 3, 4, 5, 6, 9].map((l) => limboStyle(l).bpm);
  ok(bpms[0] === 112 && bpms.every((b, i) => i === 0 || b >= bpms[i - 1]) && bpms[5] === bpms[6] && bpms[6] === bpms[7], `quicker every bar up to bar 6, then the same (${bpms.join(" ")})`);
  ok(bpms[5] >= 140 && bpms[5] <= 150, "about a third quicker at the top");
  ok([0, 1, 2].every((l) => limboLift(l) === 0) && limboLift(3) === 1 && limboLift(7) === 5 && limboLift(12) === 5, "a key higher a bar from bar 4, five at most");
  const s3 = limboStyle(3);
  ok(s3.lead!.bars[0].find((n) => n != null) === first + 1 && s3.bass![0].find((n) => n != null) === GROOVES.calypso.bass![0].find((n) => n != null)! + 1 && s3.chords!.prog[0][0] === GROOVES.calypso.chords!.prog[0][0] + 1, "bar 4's lead, bass and chords are all a semitone up");
  ok(!limboStyle(0).hat && !!limboStyle(1).hat && !limboStyle(1).clap && !!limboStyle(2).clap, "hats come in at bar 2, the backbeat at bar 3");
  ok(limboStyle(2).kick === GROOVES.calypso.kick && limboStyle(3).kick !== GROOVES.calypso.kick && !!limboStyle(4).ohat && limboStyle(5).shaker!.every((x) => x === 1), "the kick drives from bar 4, open hats from bar 5, everything from bar 6");
  ok(GROOVES.calypso.bpm === 112 && GROOVES.calypso.lead!.bars[0].find((n) => n != null) === first && !GROOVES.calypso.hat, "the shared calypso is as it was");
});

/**
 * Name That Tune's tests put the shared dice and clock back as they found them: how many draws one
 * takes depends on the song list (which songs come up, how many wrong titles there are to shuffle),
 * and the tests after them are tuned to the draws they get.
 */
const tuneTest = (name: string, fn: () => void) =>
  test(name, () => {
    const seedWas = seed, clockWas = clock;
    try {
      fn();
    } finally {
      seed = seedWas;
      clock = clockWas;
    }
  });

tuneTest("tune: synced clips, buzz, wrong locks out, points by speed", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "tune" });
  t.g("p0", "mode", { mode: "melody" });
  t.g("p0", "total", { n: 5 });
  t.g("p0", "go");
  let v = t.view<V<"tune">>("p1");
  ok(v.phase === "listen" && v.stageAt.length === 3 && v.options === null, "listening, options hidden");
  t.advance(1600);
  t.g("p1", "buzz");
  v = t.view<V<"tune">>("p2");
  ok(v.phase === "answer" && v.buzzer === "p1" && v.options?.length === 4, "p1 buzzed in");
  t.g("p2", "buzz");
  ok(t.view<V<"tune">>("p0").buzzer === "p1", "only one buzzer at a time");
  const right = (t.eng.d.game!.s as { tune: number }).tune;
  ok(v.tune === -1 && !!v.clip?.notes, "phones get the notes, not which tune it is");
  const wrong = v.options!.find((o) => o !== right)!;
  t.g("p1", "answer", { choice: wrong });
  v = t.view<V<"tune">>("p0");
  ok(v.phase === "listen" && v.locked.includes("p1"), "wrong: locked out, music resumes");
  t.g("p1", "buzz");
  ok(t.view<V<"tune">>("p0").phase === "listen", "a locked phone can't buzz again");
  t.g("p2", "buzz");
  t.g("p2", "answer", { choice: right });
  v = t.view<V<"tune">>("p0");
  ok(v.phase === "reveal" && v.correct === "p2" && v.scores.p2 === 3, "right in the first clip: 3 points");
  ok(v.tune === right, "the reveal names the tune");
  t.advance(1000);
  ok(t.pens().some((p) => p.who[0] === "p1"), "the wrong answer drank");
  // DJ mode: host judges
  t.g("p0", "mode", { mode: "dj" });
  t.g("p0", "go");
  t.g("p0", "buzz");
  ok(t.view<V<"tune">>("p0").phase === "listen", "the DJ doesn't buzz");
  t.g("p2", "buzz");
  t.g("p2", "judge", { ok: true });
  ok(t.view<V<"tune">>("p0").phase === "answer", "only the DJ judges");
  t.g("p0", "judge", { ok: true });
  ok(t.view<V<"tune">>("p0").scores.p2 === 4, "DJ said yes: a point");
});

tuneTest("tune: real songs play in sync, never twice, and the reveal names the song", () => {
  type SongS = { song: { id: number; l: number; a: string }; next: { id: number } | null; choices: { id: number; l: number }[]; played: number[]; extra: { id: number }[] };
  const t = setup(3);
  t.act("p0", { a: "start", game: "tune" });
  let v = t.view<V<"tune">>("p1");
  ok(v.mode === "songs" && v.pool === "zh+en:any" && v.quiz === false, "real songs, both languages, buzzers, by default");
  t.g("p1", "pool", { pool: "zh:any" });
  ok(t.view<V<"tune">>("p1").pool === "zh+en:any", "only the host picks the songs");
  t.g("p0", "pool", { pool: "zh" });
  ok(t.view<V<"tune">>("p1").pool === "zh+en:any", "a pool has languages and categories");
  for (const bad of ["zh:nope", "klingon:any", ":any", "zh+:any", 7, "zh:any:rock"]) t.g("p0", "pool", { pool: bad });
  ok(t.view<V<"tune">>("p1").pool === "zh+en:any", "made-up languages and categories are turned away");
  t.g("p0", "pool", { pool: "ko+yue:rock+oldies" });
  ok(t.view<V<"tune">>("p1").pool === "yue+ko:oldies+rock", "several languages and categories at once, always written the same way");
  t.g("p0", "pool", { pool: "mix:any" });
  ok(t.view<V<"tune">>("p1").pool === "zh+en:any", "the first list's words still work");
  t.g("p0", "pool", { pool: "world+global:rock" });
  ok(t.view<V<"tune">>("p1").pool === "world+global:any", "no categories where the picks have none");
  t.g("p0", "pool", { pool: "zh:any" });
  t.g("p0", "total", { n: 5 });
  t.g("p0", "go");
  v = t.view<V<"tune">>("p1");
  let s = t.eng.d.game!.s as SongS;
  ok(v.phase === "listen" && !!v.audio?.startsWith("https://audio-ssl.itunes.apple.com/") && v.song === null && v.choices === null, "phones get the preview, not which song it is");
  ok(v.singer === (s.song as unknown as { g: number }).g, "the stage learns who sings it");
  ok(s.song.l === 0 && s.choices.length === 4 && s.choices.every((c) => c.l === 0) && s.choices.some((c) => c.id === s.song.id), "a Chinese song, four Chinese titles, the right one among them");
  ok(new Set(s.choices.map((c) => (c as unknown as { a: string }).a)).size === 4, "four different artists to pick from");
  ok(!!v.pre && v.pre !== v.audio, "the next song is named early so phones can load it");
  t.g("p1", "buzz");
  ok(t.view<V<"tune">>("p0").phase === "listen", "no buzzing before the song starts");
  t.advance(2600);
  t.g("p1", "buzz");
  v = t.view<V<"tune">>("p2");
  ok(v.phase === "answer" && v.choices?.length === 4 && v.song === null, "buzzed: four titles, still no answer");
  const start0 = v.startAt;
  t.advance(3000);
  const wrong = v.choices!.find((c) => c.id !== s.song.id)!;
  t.g("p1", "answer", { choice: wrong.id });
  v = t.view<V<"tune">>("p0");
  ok(v.phase === "listen" && v.startAt === start0 + 3000 && v.locked.includes("p1"), "wrong: locked out, the song picks up where it stopped");
  t.g("p2", "buzz");
  t.g("p2", "answer", { choice: 123 });
  ok(t.view<V<"tune">>("p0").phase === "answer", "a title that isn't on the list does nothing");
  t.g("p2", "answer", { choice: s.song.id });
  v = t.view<V<"tune">>("p0");
  ok(v.phase === "reveal" && v.song?.id === s.song.id && /^https:\/\/music\.apple\.com\/[a-z]{2}\/song\/\d+$/.test(v.song.url) && v.scores.p2 === 3, "right in the first 8 seconds: 3 points, and the song with its Apple Music link");
  ok(v.revealPos > 0 && v.revealPos <= 22_000, "the reveal picks the song up where it stopped");
  const first = s.song.id;
  const queued = s.next!.id;
  t.advance(10_000);
  s = t.eng.d.game!.s as SongS;
  ok(t.view<V<"tune">>("p0").round === 2 && s.song.id === queued && s.song.id !== first, "the next song comes up by itself: the one phones already loaded");
  // a phone's history keeps its songs off the list
  const heard = s.next!.id;
  t.g("p1", "heard", { ids: [heard, -5, "x"] });
  ok((t.eng.d.game!.s as SongS).next === null, "a queued song a phone heard lately is dropped");
  t.g("p0", "skip");
  t.advance(10_000);
  ok((t.eng.d.game!.s as SongS).song.id !== heard, "and doesn't come up");
  for (let i = 0; i < 2; i++) {
    t.g("p0", "skip");
    t.advance(10_000);
  }
  s = t.eng.d.game!.s as SongS;
  ok(new Set(s.played).size === s.played.length && s.played.length === 5, "five songs, no repeats");
  t.g("p0", "skip");
  t.advance(10_000);
  ok(t.view<V<"tune">>("p0").phase === "end", "after five songs: the end");
});

tuneTest("tune: the host's phone brings today's charts, and only good rows get in", () => {
  const t = setup(2);
  t.act("p0", { a: "start", game: "tune" });
  t.g("p0", "pool", { pool: "en:any" });
  const good = [9_000_000_001, "New Hit", "New Artist", "", 1, 2026, "AudioPreview1/v4/aa/bb/cc/x/mzaf_1", "", "us", 1];
  const good12 = [9_000_000_004, "New Hit 2", "New Artist 2", "", 3, 2026, "AudioPreview1/v4/aa/bb/cc/x/mzaf_4", "", "kr", 1, 0, 0];
  const bad12 = [9_000_000_005, "Odd", "Odd", "", 1, 2026, "AudioPreview1/v4/aa/bb/cc/x/mzaf_5", "", "us", 1, 9999, 7];
  const evil = [9_000_000_002, "Bad", "Bad", "", 1, 2026, "https://evil.example/x.m4a", "", "us", 1];
  const broken = [9_000_000_003, "", "No title", "", 1, 2026, "AudioPreview1/x", "", "us", 1];
  const s = t.eng.d.game!.s as { extra: { id: number }[] };
  t.g("p1", "go", { charts: [good] });
  ok(s.extra.length === 0, "another phone can't start the song or hand in charts");
  t.g("p0", "go", { charts: [good, evil, broken, "nope", good12, bad12] });
  ok(s.extra.length === 2 && s.extra.some((x) => x.id === 9_000_000_001) && s.extra.some((x) => x.id === 9_000_000_004), "the good rows are in (old and new shapes), the rest are dropped");
});

tuneTest("tune: pools by language and category, and the quiz where everyone answers", () => {
  type SongS = { song: { id: number; l: number; y: number; k: number }; choices: { id: number }[]; answers: Record<string, { c: number }> };
  const t = setup(3);
  t.act("p0", { a: "start", game: "tune" });
  t.g("p0", "pool", { pool: "en:oldies" });
  t.g("p0", "quiz", { on: true });
  t.g("p0", "total", { n: 5 });
  t.g("p0", "go");
  let v = t.view<V<"tune">>("p1");
  let s = t.eng.d.game!.s as SongS;
  ok(v.quiz && v.phase === "listen" && v.choices?.length === 4 && v.mine === null && v.answered.length === 0, "a quiz: four titles up from the start, nobody has answered");
  ok(s.song.l === 1 && s.song.y < 2000, "an English song from before 2000");
  t.g("p1", "answer", { choice: s.choices[0].id });
  ok(t.view<V<"tune">>("p1").mine === null, "no answers before the song starts");
  t.advance(2600);
  t.g("p1", "buzz");
  ok(t.view<V<"tune">>("p0").phase === "listen" && t.view<V<"tune">>("p0").buzzer === null, "no buzzer in a quiz");
  t.g("p1", "answer", { choice: s.song.id });
  v = t.view<V<"tune">>("p1");
  ok(v.mine === s.song.id && v.answered.length === 1 && t.view<V<"tune">>("p2").mine === null, "my pick is mine; the others see that I answered, not what");
  t.g("p1", "answer", { choice: s.choices.find((c) => c.id !== s.song.id)!.id });
  ok(t.view<V<"tune">>("p1").mine === s.song.id, "one answer each");
  t.advance(9000);
  const wrong = s.choices.find((c) => c.id !== s.song.id)!.id;
  t.g("p2", "answer", { choice: wrong });
  ok(t.view<V<"tune">>("p0").phase === "listen", "two of three answered: the song plays on");
  t.g("p0", "answer", { choice: s.song.id });
  v = t.view<V<"tune">>("p0");
  ok(v.phase === "reveal" && v.right.join() === "p1,p0" && v.scores.p1 === 3 && v.scores.p0 === 2 && (v.scores.p2 ?? 0) === 0, "everyone in: the reveal; the right ones score by how soon they answered");
  ok(t.view<V<"tune">>("p2").mine === wrong && v.song?.id === s.song.id, "the reveal shows each phone its own pick and the answer");
  t.advance(10_000);
  s = t.eng.d.game!.s as SongS;
  ok(t.view<V<"tune">>("p0").round === 2 && Object.keys(s.answers).length === 0, "next song: fresh answers");
  t.advance(2600 + 20_000);
  ok(t.view<V<"tune">>("p0").phase === "reveal" && t.view<V<"tune">>("p0").right.length === 0, "nobody answered in time: the reveal, nobody scores");
});

tuneTest("tune: hard titles: no singers on them, and the wrong ones by the same singer", () => {
  type Row = { id: number; t: string; a: string; l: number };
  const all = SONG_ROWS.map(fromRow);
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const sameSinger = (a: string, b: string) => singersOf(a).some((n) => singersOf(b).includes(n));
  ok(singersOf("周杰伦 & 五月天 阿信").join("|") === "周杰伦|五月天 阿信" && singersOf("JENNIE (from BLACKPINK)").join() === "jennie" && singersOf("Ed Sheeran feat. Travis Scott").join("|") === "ed sheeran|travis scott", "who sings a song: one name each");
  ok(singersOf("Coldplay X BTS").join("|") === "coldplay|bts" && singersOf(`梅艳芳${String.fromCharCode(0x2028)}`).join() === "梅艳芳", "collaborations split, invisible characters dropped");
  const sunny = all.find((x) => x.t === "晴天" && x.a === "周杰伦")!;
  const easy = decoysFor(sunny, all, rand);
  const hard = decoysFor(sunny, all, rand, true);
  ok(easy.length === 3 && easy.every((x) => !sameSinger(x.a, sunny.a)) && new Set(easy.map((x) => x.a)).size === 3, "easy: three other singers");
  ok(hard.length === 3 && hard.every((x) => sameSinger(x.a, sunny.a) && x.l === sunny.l) && new Set(hard.map((x) => norm(x.t))).size === 3, "hard: three more of 周杰伦's own songs, all different titles");
  // a singer with just one or two other songs: those, and the rest from other singers
  const few = all.find((x) => {
    const own = new Set(all.filter((y) => y.l === x.l && y.id !== x.id && sameSinger(y.a, x.a) && norm(y.t) !== norm(x.t)).map((y) => norm(y.t)));
    return own.size === 1;
  })!;
  const mixed = decoysFor(few, all, rand, true);
  ok(mixed.length === 3 && mixed.filter((x) => sameSinger(x.a, few.a)).length === 1, "a singer with one other song: that one, then two by others");

  const t = setup(3);
  t.act("p0", { a: "start", game: "tune" });
  t.g("p1", "hard", { on: true });
  ok(!t.view<V<"tune">>("p0").hard, "only the host makes it hard");
  t.g("p0", "pool", { pool: "zh:any" });
  t.g("p0", "quiz", { on: true });
  t.g("p0", "hard", { on: true });
  ok(t.view<V<"tune">>("p1").hard, "the host makes it hard: every phone knows");
  t.g("p0", "go");
  const s = t.eng.d.game!.s as { song: Row; choices: Row[] };
  const v = t.view<V<"tune">>("p1");
  ok(v.choices?.length === 4 && v.choices.every((c) => c.a === "" && c.ae === ""), "titles only: no singer on any of the four");
  const avail = new Set(all.filter((x) => x.l === s.song.l && x.id !== s.song.id && sameSinger(x.a, s.song.a) && norm(x.t) !== norm(s.song.t)).map((x) => norm(x.t))).size;
  const own = s.choices.filter((c) => c.id !== s.song.id && sameSinger(c.a, s.song.a)).length;
  ok(own === Math.min(3, avail), `the wrong ones by the same singer as far as there are any (${own} of ${Math.min(3, avail)})`);
  t.advance(2600 + 20_000);
  ok(t.view<V<"tune">>("p0").phase === "reveal" && t.view<V<"tune">>("p0").song?.a === s.song.a, "the reveal still says who sings it");
});

tuneTest("tune: one second: snippets from the spot the host's phone found, 3 2 1 points, a buzz pauses a snippet", () => {
  type S = { song: { id: number }; stageAt: number[]; choices: { id: number }[] };
  const t = setup(3);
  t.act("p0", { a: "start", game: "tune" });
  t.g("p1", "snap", { on: true });
  ok(!t.view<V<"tune">>("p0").snap, "only the host turns it on");
  t.g("p0", "snap", { on: true });
  t.g("p0", "total", { n: 5 });
  let v = t.view<V<"tune">>("p1");
  ok(v.phase === "ready" && !!v.pre && v.audio === null, "one second: the first song is picked already, so every phone loads it during the setup");
  t.g("p0", "hook", { p: v.pre, at: 3300 });
  t.g("p0", "go");
  let s = t.eng.d.game!.s as S;
  v = t.view<V<"tune">>("p1");
  ok(v.snap && v.hook === 3300, "the first song starts from the spot the host's phone found during the setup");
  t.g("p0", "hook", { p: v.audio, at: 1000 });
  ok(v.stageAt[1] - v.stageAt[0] === 6000 && v.stageAt[2] - v.stageAt[0] === 13_000 && v.endsAt - v.stageAt[0] === 25_000, "one second, three seconds at 6 s, the rest from 13 s; 25 s in all");
  t.g("p1", "hook", { p: v.audio, at: 4200 });
  ok(t.view<V<"tune">>("p0").hook === 1000, "only the host's phone says where the snippets start (and it can still change its mind before the song starts)");
  t.g("p0", "hook", { p: v.audio, at: 4200 });
  ok(t.view<V<"tune">>("p1").hook === 4200, "the host's phone says where, before the song starts: every phone plays from there");
  t.g("p0", "hook", { p: v.audio, at: 99_999 });
  t.g("p0", "hook", { p: "https://audio-ssl.itunes.apple.com/itunes-assets/x.m4a", at: 3000 });
  ok(t.view<V<"tune">>("p1").hook === 4200, "a spot past the preview, or for a song that isn't up, is turned away");
  t.g("p0", "hook", { p: v.pre, at: 2500 });
  t.advance(2600);
  t.g("p0", "hook", { p: v.audio, at: 8000 });
  ok(t.view<V<"tune">>("p1").hook === 4200, "once the song has started, its spot stays put");
  t.g("p1", "buzz");
  ok(t.view<V<"tune">>("p0").phase === "answer", "a buzz after the first second");
  t.g("p1", "answer", { choice: s.song.id });
  v = t.view<V<"tune">>("p0");
  ok(v.phase === "reveal" && v.scores.p1 === 3 && v.revealPos === 4200, "3 points in the first stage, and the reveal plays from the spot");
  t.advance(10_000);
  s = t.eng.d.game!.s as S;
  v = t.view<V<"tune">>("p0");
  ok(v.round === 2 && v.hook === 2500, "the next song: the spot the host's phone found while the last one played");
  t.advance(2600 + 6500);
  const before = s.stageAt.slice();
  t.g("p2", "buzz");
  t.advance(4000);
  t.g("p2", "answer", { choice: s.choices.find((c) => c.id !== s.song.id)!.id });
  const after = (t.eng.d.game!.s as S).stageAt;
  ok(after[0] === before[0] && after[1] - before[1] === 4000 && after[2] - before[2] === 4000, "a wrong answer: the snippet that was playing carries on, the next one moves on by the pause");
  t.g("p1", "buzz");
  t.g("p1", "answer", { choice: s.song.id });
  ok(t.view<V<"tune">>("p0").scores.p1 === 5, "right in the three-second stage: 2 more points");
  t.g("p0", "snap", { on: false });
  t.advance(10_000);
  v = t.view<V<"tune">>("p0");
  ok(!v.snap && v.hook === 0 && v.stageAt[1] - v.stageAt[0] === 8000, "turned off between songs: the next one plays whole");
});

tuneTest("tune: a pool of several languages and categories", () => {
  const all = SONG_ROWS.map(fromRow);
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (pool: string, n: number) => Array.from({ length: n }, () => pickSong(all, pool, new Set(), new Set(), rand)!);
  const kj = pick("ko+ja:rock", 40);
  ok(kj.every((x) => x.l === 4 && (x.k & CAT_BIT.rock) !== 0), "Korean and Japanese rock: Korean has none, so Japanese rock only");
  const zy = pick("zh+yue:oldies+folk", 60);
  ok(new Set(zy.map((x) => x.l)).size === 2 && zy.every((x) => inPool(x, "zh+yue:oldies+folk")), "Mandarin and Cantonese oldies and folk: both languages come up");
  const wg = pick("world+global:any", 40);
  ok(wg.every((x) => x.l === 6 || x.c === 1) && wg.some((x) => x.l === 6), "world classics and today's charts");
  ok(moodOf({ t: "后来的我们哭了" }) === "sad" && moodOf({ t: "Dance Monkey" }) === "hype" && moodOf({ t: "月亮代表我的心" }) === "love" && moodOf({ t: "稻香" }) === "", "a song's mood from its title");
});

tuneTest("tune: decades, and a singer special that plays only their songs, then ends", () => {
  const all = SONG_ROWS.map(fromRow);
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  ok(samePool("mix:any") === "zh+en:any" && samePool("en+zh:pop:90s+80s") === "zh+en:pop:80s+90s" && samePool("zh:any:any") === "zh:any", "decades come last and in order, only when there are some (the pools from before read as they did)");
  ok(samePool("world+global:any:90s") === "world+global:any" && samePool("zh:any:70s") === null, "the world classics and the charts have no decades; a decade that isn't one is turned away");
  ok(samePool("@周杰伦") === "@周杰伦" && samePool("@taylor swift") === "@taylor swift" && [samePool("@Taylor Swift"), samePool("@周杰伦 & 五月天"), samePool("@"), samePool("@" + "x".repeat(61))].every((x) => x === null), "a singer special is one singer's folded name, nothing else");
  const nineties = Array.from({ length: 40 }, () => pickSong(all, "zh+yue:any:90s", new Set(), new Set(), rand)!);
  ok(nineties.every((x) => (x.l === 0 || x.l === 2) && x.y >= 1990 && x.y <= 1999) && new Set(nineties.map((x) => x.l)).size === 2, "90s Mandarin and Cantonese: every one from the 90s, both languages");
  const old = Array.from({ length: 30 }, () => pickSong(all, "en:rock:pre80+80s", new Set(), new Set(), rand)!);
  ok(old.every((x) => x.l === 1 && x.y < 1990 && (x.k & CAT_BIT.rock) !== 0), "English rock from before 1990");
  // one singer's songs: all of them, and the wrong titles theirs too
  const jay = all.filter((x) => singersOf(x.a).includes("周杰伦"));
  ok(poolSize(all, "@周杰伦") === jay.length && jay.length >= 20 && all.every((x) => inPool(x, "@周杰伦") === jay.includes(x)), `周杰伦's special: his ${jay.length} songs, nobody else's`);
  const sunny = jay.find((x) => x.t === "晴天")!;
  const dec = decoysFor(sunny, all, rand, false, "@周杰伦");
  ok(dec.length === 3 && dec.every((x) => singersOf(x.a).includes("周杰伦")) && new Set([sunny, ...dec].map((x) => norm(x.t))).size === 4, "the wrong titles: three more of his, all different");
  ok(SPECIALS.every((x) => x[4] >= 15 && poolSize(all, `@${x[0]}`) === x[4] && samePool(`@${x[0]}`) === `@${x[0]}`), `every special on the list (${SPECIALS.length}) has the songs it says`);

  // a singer with fewer songs than the game: it plays every one of them once, then the final scores
  const few = SPECIALS.find((x) => x[4] < 20)!;
  const pool = `@${few[0]}`;
  const t = setup(3);
  t.act("p0", { a: "start", game: "tune" });
  t.g("p1", "pool", { pool });
  ok(t.view<V<"tune">>("p0").pool === DEFAULT_POOL, "only the host picks a singer");
  t.g("p0", "pool", { pool });
  t.g("p0", "total", { n: 20 });
  t.g("p0", "quiz", { on: true });
  ok(t.view<V<"tune">>("p1").pool === pool && t.view<V<"tune">>("p1").total === 20, "the setup shows the host's picks");
  t.g("p0", "go");
  let v = t.view<V<"tune">>("p1");
  ok(v.total === few[4], `the game is as long as their songs (${few[4]})`);
  ok(v.choices?.length === 4 && v.choices.every((c) => c.a === "" && c.ae === ""), "no singer on the four titles: they're all the same one");
  const heard: number[] = [];
  for (let n = 1; n <= 25 && t.view<V<"tune">>("p0").phase !== "end"; n++) {
    const s = t.eng.d.game!.s as { song: { id: number; a: string }; choices: { a: string }[] };
    heard.push(s.song.id);
    ok(singersOf(s.song.a).includes(few[0]) && s.choices.every((c) => singersOf(c.a).includes(few[0])), `song ${n}: theirs, and so are the four titles`);
    t.advance(2600 + 20_000);
    t.advance(10_000);
  }
  v = t.view<V<"tune">>("p0");
  ok(v.phase === "end" && heard.length === few[4] && new Set(heard).size === few[4], `all ${few[4]} of their songs, each once, then the final scores (${heard.length})`);
});

tuneTest("tune: a small pool plays each title once a game, game after game, and a mode change undoes the cap", () => {
  const all = SONG_ROWS.map(fromRow);
  const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const play = (t: ReturnType<typeof setup>) => {
    const ids: number[] = [];
    t.g("p0", "go");
    for (let n = 1; n <= 25 && t.view<V<"tune">>("p0").phase !== "end"; n++) {
      ids.push((t.eng.d.game!.s as { song: { id: number } }).song.id);
      t.advance(2600 + 20_000);
      t.advance(10_000);
    }
    return ids;
  };
  const titles = (ids: number[]) => ids.map((id) => norm(all.find((x) => x.id === id)!.t));
  // 伍佰 has 挪威的森林 twice (credited two ways): a game plays it once
  const wubai = SPECIALS.find((x) => x[0] === "伍佰")!;
  ok(!!wubai && poolSize(all, "@伍佰") === wubai[4] && all.filter((x) => singersOf(x.a).includes("伍佰")).length > wubai[4], `伍佰's special counts titles (${wubai[4]}), not rows`);
  const t = setup(3);
  t.act("p0", { a: "start", game: "tune" });
  t.g("p0", "pool", { pool: "@伍佰" });
  t.g("p0", "total", { n: 20 });
  t.g("p0", "quiz", { on: true });
  const one = play(t);
  ok(one.length === wubai[4] && new Set(titles(one)).size === one.length, `game 1: every title once (${one.length})`);
  t.g("p0", "again");
  const two = play(t);
  ok(two.length === wubai[4] && new Set(titles(two)).size === two.length && t.view<V<"tune">>("p0").phase === "end", `game 2 at the same table: all of them again, each once (${two.length}), then the scores`);
  t.g("p0", "again");
  t.g("p0", "total", { n: 8 });
  const three = play(t);
  ok(three.length === 8 && new Set(titles(three)).size === 8, "game 3, set to 8: 8 titles");
  // a decade in one category can be tiny: the game is as long as it is
  const tiny = "zh:pop:80s";
  const size = poolSize(all, tiny);
  t.g("p0", "again");
  t.g("p0", "pool", { pool: tiny });
  t.g("p0", "total", { n: 8 });
  const small = play(t);
  ok(size < 8 && small.length === size && new Set(titles(small)).size === size, `${tiny} has ${size} titles: the game plays each once and ends (${small.length})`);
  // the cap is for real songs only: the melodies play the game the host picked
  t.g("p0", "again");
  t.g("p0", "mode", { mode: "melody" });
  t.g("p0", "total", { n: 20 });
  t.g("p0", "go");
  ok(t.view<V<"tune">>("p0").total === 20, "melodies after a small pool: 20 songs, as picked");
});

tuneTest("tune: a challenge link carries the songs, the way they play and the score, and nothing else gets in", () => {
  const all = SONG_ROWS.map(fromRow);
  const ids = all.filter((x) => x.l === 0).slice(0, 8).map((x) => x.id);
  const c = { pool: "zh+en:any:90s", quiz: true, hard: false, snap: true, seed: 0xdeadbeef, name: "王小明|Steve\n", pts: [3, 0, 2, 1, 0, 3, 3, 0], ids };
  const code = challengeCode(c);
  const back = readChallenge(code);
  ok(/^[A-Za-z0-9_-]+$/.test(code) && code.length < 200, `the link is short and plain (${code.length} characters for 8 songs)`);
  ok(!!back && back.pool === c.pool && back.quiz && !back.hard && back.snap && back.seed === c.seed && back.ids.join() === ids.join() && back.pts.join() === c.pts.join(), "it reads back the same: songs in order, the way they play, the seed, the points");
  ok(back?.name === "王小明Steve" && challengeScore(back!) === 12, "the name without separators or control characters; 12 points");
  ok(challengeUrl(back!, "https://changle.ca") === `https://changle.ca/g/name-that-tune/play?c=${code}`, "it's played at the game's own address");
  // (made-up links with a good check, so each is turned away for what it says)
  const at = (text: string) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    const full = `${text}|${(h % 46656).toString(36).padStart(3, "0")}`;
    return btoa(String.fromCharCode(...new TextEncoder().encode(full))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  ok(readChallenge(at("1|zh:any|q|1|x|3|1"))?.ids.join() === "1", "a made-up link that is one reads");
  const bad = [code.slice(0, -6), code.slice(0, -1) + (code.endsWith("A") ? "B" : "A"), "!!", at("2|zh:any||1|x|3|1"), at("1|zh:any|x|1|x|3|1"), at("1|nowhere|q|1|x|3|1"), at("1|zh:any|q|1|x|34|1"), at("1|zh:any|q|1|x|33|1.1"), at("1|zh:any|q|1|x|4|1"), at("1|zh:any|q|1|x|3|-1"), at(`1|zh:any|q|1|x|${"3".repeat(21)}|${Array.from({ length: 21 }, (_, i) => (i + 1).toString(36)).join(".")}`)];
  ok(bad.every((x) => readChallenge(x) === null), "cut short, mistyped, not ours, a pool or flag that isn't one, points and songs that don't match, the same song twice, too many songs: all turned away");
  // the same game seed and song give the same four titles on any phone
  const song = all.find((x) => x.t === "晴天" && x.a === "周杰伦")!;
  const one = decoysFor(song, all, seeded(42, song.id), false, "zh:any");
  const two = decoysFor(song, all, seeded(42, song.id), false, "zh:any");
  const other = decoysFor(song, all, seeded(43, song.id), false, "zh:any");
  ok(one.map((x) => x.id).join() === two.map((x) => x.id).join() && one.map((x) => x.id).join() !== other.map((x) => x.id).join(), "the same seed: the same wrong titles; another seed: others");
});

test("drama: a scene with a hidden culprit, secret cards, guesses, stars and a penalty", () => {
  type V = V<"drama">;
  const t = setup(6);
  t.act("p0", { a: "start", game: "drama" });
  let v = t.view<V>("p1");
  ok(v.phase === "setup" && v.mode === "show" && v.pen === "drink", "starts on the setup screen");
  t.g("p1", "config", { level: "spicy" });
  ok(t.view<V>("p0").level === "all", "only the host sets it up");
  t.g("p0", "config", { level: "spicy", diff: "hard", pen: "move", total: 2 });
  v = t.view<V>("p0");
  ok(v.level === "spicy" && v.diff === "hard" && v.pen === "move" && v.total === 2, "level, difficulty, penalty and rounds");
  t.g("p0", "start");
  const s = t.eng.d.game!.s as { cast: string[]; culprit: string; scene: number; votes: Record<string, unknown> };
  v = t.view<V>("p0");
  ok(v.phase === "brief" && v.scene !== null && v.cast.length >= 2 && v.cast.length <= 4, "a scene and a cast");
  const firstScene = DRAMA_SCENES[s.scene];
  ok(firstScene.level === "spicy" && firstScene.diff === "hard", "a spicy table gets a spicy scene first, at its difficulty");
  ok(v.cast.length <= 4 && 6 - v.cast.length >= 2, "a table of six puts up to four on stage, at least two still watching");
  const actors = s.cast;
  const watchers = t.ids.filter((id) => !actors.includes(id));
  ok(actors.every((a) => t.view<V>(a).me !== null) && watchers.every((w) => t.view<V>(w).me === null), "only actors get a card");
  ok(actors.filter((a) => t.view<V>(a).me!.culprit).length === 1 && t.view<V>(s.culprit).me!.culprit, "exactly one culprit, and only they know it");
  ok(watchers.every((w) => JSON.stringify(t.view<V>(w)).indexOf(JSON.stringify(t.view<V>(s.culprit).me!.secret.zh)) < 0), "nobody else sees the culprit's card");
  ok(v.twist === null, "the twist hasn't landed yet");
  for (const a of actors) t.g(a, "ready");
  v = t.view<V>("p0");
  ok(v.phase === "act" && v.actMs === 120_000, "everyone has read their card: the scene starts (hard: two minutes)");
  t.advance(61_000);
  ok(t.view<V>("p0").twist !== null, "halfway: the twist lands on every phone");
  const bystander = watchers.find((w) => w !== "p0");
  if (bystander) t.g(bystander, "cut");
  ok(t.view<V>("p0").phase === "act", "only the host or an actor ends the scene early");
  t.advance(60_000);
  v = t.view<V>("p0");
  ok(v.phase === "vote", "time's up: the audience votes");
  const stars = (good: string) => Object.fromEntries(actors.map((a) => [a, a === good ? 5 : 2]));
  t.g(actors[0], "vote", { guess: actors[1], stars: stars(actors[0]) });
  ok(t.view<V>("p0").voted.length === 0, "actors don't vote on their own scene");
  t.g(watchers[0], "vote", { guess: s.culprit, stars: { [actors[0]]: 5 } });
  ok(t.view<V>("p0").voted.length === 0, "every actor needs stars");
  const innocent = actors.find((a) => a !== s.culprit)!;
  t.g(watchers[0], "vote", { guess: s.culprit, stars: stars(innocent) });
  ok(t.view<V>(watchers[0]).myVote?.guess === s.culprit && t.view<V>(watchers[1]).myVote === null, "my vote is mine");
  for (const w of watchers.slice(1)) t.g(w, "vote", { guess: s.culprit, stars: stars(innocent) });
  v = t.view<V>("p0");
  ok(v.phase === "reveal" && !!v.result, "everyone voted: the reveal");
  ok(v.result!.culprit === s.culprit && v.result!.caught, "the culprit was caught");
  ok(v.result!.best.length === 1 && v.result!.best[0] === innocent && v.awards[innocent] === 1, "most stars: best actor");
  ok(v.result!.losers.includes(s.culprit) && v.result!.right.length === watchers.length, "the caught culprit takes the penalty; every guesser was right");
  ok(Object.keys(v.result!.cards).length === actors.length, "every card is shown at the reveal");
  ok(!!v.result!.penalty && (v.scores[watchers[0]] ?? 0) === 1 && v.scores[innocent] === 5, "an exercise penalty is named; a right guess is a point, stars are points");
  t.advance(8100);
  const pen = t.events.filter((e) => e.k === "penalty").pop() as { who: string[]; say?: { zh: string } } | undefined;
  ok(!!pen && pen.who.includes(s.culprit) && !!pen.say, "the penalty stamp names the exercise");
  t.g("p0", "next");
  v = t.view<V>("p0");
  ok(v.round === 2 && v.phase === "brief", "round two");
  ok(DRAMA_SCENES[s.scene].id !== firstScene.id && DRAMA_SCENES[s.scene].level === "spicy", "a different scene, still spicy");
  const second = (t.eng.d.game!.s as { cast: string[] }).cast;
  ok(watchers.every((w) => second.includes(w)), "those who watched get on stage next");
});

test("drama: an acting duel, and a culprit who fools everyone", () => {
  type V = V<"drama">;
  const t = setup(4);
  t.act("p0", { a: "start", game: "drama" });
  t.g("p0", "config", { mode: "pk", total: 1 });
  t.g("p0", "start");
  let v = t.view<V>("p0");
  const s = t.eng.d.game!.s as { cast: string[] };
  ok(v.cast.length === 2 && !!v.pk && Object.keys(v.pk.styles).length === 2 && v.pk.styles[s.cast[0]].zh !== v.pk.styles[s.cast[1]].zh, "two actors, one line, two styles");
  t.g("p0", "go");
  ok(t.view<V>("p0").phase === "act" && t.view<V>("p0").actMs === 45_000, "the host starts it");
  t.advance(46_000);
  const aud = t.ids.filter((id) => !s.cast.includes(id));
  for (const a of aud) t.g(a, "vote", { stars: { [s.cast[0]]: 4, [s.cast[1]]: 2 } });
  v = t.view<V>("p0");
  ok(v.phase === "reveal" && v.result!.best[0] === s.cast[0] && v.result!.losers.join() === s.cast[1], "more stars wins, fewer drinks");
  t.g("p0", "next");
  ok(t.view<V>("p0").phase === "end", "after the last round: the end");

  const u = setup(3);
  u.act("p0", { a: "start", game: "drama" });
  u.g("p0", "start");
  const s2 = u.eng.d.game!.s as { cast: string[]; culprit: string };
  ok(s2.cast.length === 2, "three at the table: two act, one watches");
  u.g("p0", "go");
  u.advance(91_000);
  const watcher = u.ids.find((id) => !s2.cast.includes(id))!;
  const other = s2.cast.find((c) => c !== s2.culprit)!;
  u.g(watcher, "vote", { guess: other, stars: { [s2.cast[0]]: 3, [s2.cast[1]]: 3 } });
  v = u.view<V>("p0");
  ok(!v.result!.caught && v.scores[s2.culprit] === 6 && v.result!.losers.join() === watcher, "the culprit escapes: three points, and the fooled one takes the penalty");
});

test("drama: scenes written at the table and from the public library", () => {
  type V = V<"drama">;
  const t = setup(5);
  t.act("p0", { a: "start", game: "drama" });
  const draft = {
    title: "冰箱里的蛋糕",
    setup: "生日蛋糕被人从冰箱里偷吃了一半。",
    kind: "family",
    roles: [{ name: "寿星", brief: "今天过生日" }, { name: "室友", alibi: "你昨晚确实开过冰箱，拿的是啤酒" }, { name: "男朋友" }],
    culprit: "偷吃蛋糕的人",
    culpritCard: "蛋糕是你吃的，奶油还在你袖子上。",
  };
  t.g("p3", "write", { scene: draft });
  t.g("p3", "write", { scene: { ...draft, title: "" } });
  t.g("p4", "write", { scene: { ...draft, roles: [{ name: "只有一个人" }] } });
  let v = t.view<V>("p1");
  ok(v.mine.length === 1 && v.mine[0].by === "p3" && v.mine[0].title.zh === "冰箱里的蛋糕" && !v.mine[0].played, "a written scene joins the table; one without a title, or with one role, doesn't");
  ok(!JSON.stringify(v).includes("奶油"), "nobody sees a written scene's cards before it's played");
  t.g("p1", "unwrite", { id: v.mine[0].id });
  ok(t.view<V>("p1").mine.length === 1, "only its writer or the host takes a scene back");
  // the host's phone brings two scenes from the public library (one broken)
  t.g("p0", "lib", { scenes: [{ id: 7, name: "小雨", scene: { ...draft, title: "Library cake", setup: "Someone ate half the cake.", roles: [{ name: "A" }, { name: "B" }], culprit: "The cake thief", culpritCard: "You ate it." } }, { id: 8, scene: {} }] });
  t.g("p2", "lib", { scenes: [{ id: 9, name: "x", scene: draft }] });
  ok(t.view<V>("p0").lib === 1, "the library's scene is in (the broken one and a guest's aren't)");
  t.g("p0", "start");
  v = t.view<V>("p0");
  const s = t.eng.d.game!.s as { cast: string[]; culprit: string; scene: number | null };
  ok(v.scene?.title.zh === "冰箱里的蛋糕" && s.scene === null, "the scene written here is played first");
  ok(s.cast.includes("p3"), "its writer is on stage, so they never guess their own story");
  ok(v.credit?.pid === "p3", "the playbill credits the writer");
  ok(v.scene?.ask.zh === "谁是「偷吃蛋糕的人」？", "no question given: it comes from the culprit's name");
  const blank = s.cast.find((c) => c !== s.culprit && v.cast.find((x) => x.pid === c)?.role.zh === "男朋友");
  if (blank) ok(!!t.view<V>(blank).me?.secret.zh, "a role left blank gets a generic secret");
  for (const c of s.cast) t.g(c, "ready");
  t.advance(46_000);
  ok(!!t.view<V>("p0").twist?.zh, "no twist given: a generic one lands");
  ok(t.view<V>("p0").mine[0].played, "the written scene is marked played");
  t.g("p3", "unwrite", { id: t.view<V>("p0").mine[0].id });
  ok(t.view<V>("p0").mine.length === 1, "a played scene can't be taken back");
  // the rest of the night: the library's scene comes up among the built-in ones
  let seen = false;
  for (let r = 0; r < 30 && !seen; r++) {
    t.g("p0", "skip");
    seen = t.view<V>("p0").scene?.title.en === "Library cake";
  }
  ok(seen && t.view<V>("p0").credit?.name === "小雨", "the library's scene comes up, credited to its writer");
});

test("drama: every acting style explains itself, in Chinese and in English, each written for its own audience", () => {
  type V = V<"drama">;
  const cjk = /[一-鿿]/;
  ok(DRAMA_STYLES.filter((x) => x.level === "all").length >= 2 && DRAMA_STYLES.some((x) => x.level === "spicy"), "styles for an all-ages table and for a spicy one");
  ok(new Set(DRAMA_STYLES.map((x) => x.s.zh)).size === DRAMA_STYLES.length && new Set(DRAMA_STYLES.map((x) => x.s.en)).size === DRAMA_STYLES.length, "no two styles share a name");
  for (const st of DRAMA_STYLES) {
    const name = st.s.zh;
    ok(!!st.how.zh && !!st.how.en && !!st.demo.zh && !!st.demo.en && !!st.see.zh && !!st.see.en, `${name}: what to do, an example and a search, in both languages`);
    ok(cjk.test(st.how.zh) && cjk.test(st.demo.zh) && !cjk.test(st.how.en + st.demo.en + st.see.en), `${name}: the Chinese is Chinese and the English is English`);
    ok(st.demo.zh.includes("下雨") && /rain/i.test(st.demo.en), `${name}: its example says the everyday sentence`);
    ok(pkStyle(st.s) === st, `${name}: found by its name`);
    ok(pkSeeUrl("zh", st.see.zh).startsWith("https://search.bilibili.com/all?keyword=") && pkSeeUrl("en", st.see.en).startsWith("https://www.youtube.com/results?search_query="), `${name}: its videos are a search, not one address that can go dead`);
  }
  // in a duel, each card and the cast list name a style from that list: the phone finds its example by the name
  const t = setup(4);
  t.act("p0", { a: "start", game: "drama" });
  t.g("p0", "config", { mode: "pk", level: "spicy" });
  t.g("p0", "start");
  const s = t.eng.d.game!.s as { cast: string[] };
  ok(s.cast.length === 2 && s.cast.every((c) => !!pkStyle(t.view<V>(c).me?.secret)), "each actor's card names a style with an example");
  ok(t.view<V>("p0").cast.every((c) => !!pkStyle(c.role)), "and so does the cast list the audience reads");
  ok(pkStyle(null) === undefined && pkStyle({ zh: "没有这个演法", en: "No such style" }) === undefined, "a name nobody knows has no example (the card falls back to the plain line)");
});

test("drama: every built-in scene in both languages, and an evening of hard scenes for a table of three or four", () => {
  type V = V<"drama">;
  const cjk = /[㐀-鿿]/;
  ok(new Set(DRAMA_SCENES.map((s) => s.id)).size === DRAMA_SCENES.length, "no two scenes share an id");
  const bad = DRAMA_SCENES.filter((s) => {
    // a monologue: one role (no secret of its own) and three secrets to choose from; a big scene
    // can play with fewer, never with fewer than two
    const solo = s.roles.length === 1;
    const texts = [s.title, s.setup, s.culprit, s.culpritCard, s.ask, s.twist, ...s.roles.flatMap((r) => (solo ? [r.name, r.brief] : [r.name, r.brief, r.alibi])), ...(s.secrets ?? [])];
    const shape = solo ? s.secrets?.length === 3 && s.min === undefined : !s.secrets && s.roles.length <= DRAMA_MAX_CAST && (s.min === undefined || (s.min >= 2 && s.min < s.roles.length));
    return !shape || !texts.every((x) => cjk.test(x.zh) && !!x.en && !cjk.test(x.en));
  });
  ok(!bad.length, `every scene has one to eight roles (a monologue three secrets) and every line in Chinese and in English (${bad.map((s) => s.id).join(", ")})`);
  // three or four at the table put two on stage: on hard, scenes written for two, an evening's worth
  const two = DRAMA_SCENES.filter((s) => s.diff === "hard" && s.roles.length === 2);
  ok(two.filter((s) => s.level === "all").length >= 10 && two.length >= 16, "ten all-ages hard scenes for two actors, sixteen for a spicy table");
  const t = setup(4);
  t.act("p0", { a: "start", game: "drama" });
  t.g("p0", "config", { diff: "hard" });
  t.g("p0", "start");
  const seen = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const v = t.view<V>("p0");
    const sc = DRAMA_SCENES.find((x) => x.id === v.scene?.id);
    ok(v.phase === "brief" && v.cast.length === 2 && sc?.diff === "hard" && sc.level === "all" && sc.roles.length === 2, `four at the table, scene ${i + 1}: hard, all ages, written for two`);
    if (sc) seen.add(sc.id);
    t.g("p0", "skip");
  }
  ok(seen.size === 10, "ten different scenes before one comes round again");
});

test("drama: how to act a scene: every guide fits its scene, in Chinese and in English", () => {
  const cjk = /[㐀-鿿]/;
  const both = (x: { zh: string; en: string }) => cjk.test(x.zh) && !!x.en && !cjk.test(x.en);
  const bad: string[] = [];
  for (const [id, gd] of Object.entries(DRAMA_GUIDES)) {
    const sc = DRAMA_SCENES.find((s) => s.id === id);
    if (!sc) {
      bad.push(`${id}: no such scene`);
      continue;
    }
    if (gd.roles.length !== sc.roles.length) bad.push(`${id}: ${gd.roles.length} role guides for ${sc.roles.length} roles`);
    if (gd.beats.length < 3 || gd.beats.length > 5) bad.push(`${id}: ${gd.beats.length} steps`);
    if (![...gd.beats, ...gd.roles.flatMap((r) => [r.play, r.first])].every(both)) bad.push(`${id}: a line missing or in the wrong language`);
  }
  ok(!bad.length, `every guide matches its scene (${bad.join("; ")})`);
  // every built-in scene has one (a new scene comes with its guide)
  const missing = DRAMA_SCENES.filter((s) => !DRAMA_GUIDES[s.id]).map((s) => s.id);
  ok(!missing.length, `every built-in scene has a guide (${missing.join(", ")})`);
  ok(DRAMA_GENERIC_BEATS.length >= 3 && DRAMA_TIPS.length === 5 && [...DRAMA_GENERIC_BEATS, ...DRAMA_TIPS].every(both), "any other scene still has steps to follow, and a first-timer has five tips");
  // the card and the cast list ask for a role's guide by the role's name
  const sc = DRAMA_SCENES.find((s) => s.id === "family-new-year-dumplings")!;
  ok(dramaRoleGuide(sc.id, sc.roles[1].name) === DRAMA_GUIDES[sc.id].roles[1], "a role's guide is found by its name");
  ok(dramaRoleGuide(sc.id, { zh: "没有这个角色", en: "Nobody" }) === undefined && dramaRoleGuide("w1", sc.roles[0].name) === undefined, "a role that isn't there, or a scene a player wrote, has none");
});

test("drama: who acts: each player says on stage or watching, and the scene fits however many go up", () => {
  type V = V<"drama">;
  const t = setup(10);
  t.act("p0", { a: "start", game: "drama" });
  t.g("p0", "config", { total: 20 });
  const st = () => t.eng.d.game!.s as { cast: string[]; culprit: string; order: number[]; scene: number | null };
  let v = t.view<V>("p4");
  ok(v.next?.ok && v.next.auto && v.next.lo === 2 && v.next.hi === dramaCastSize(10), "nobody has said: two to six of them go up");
  t.g("p1", "want", { want: "act" });
  t.g("p2", "want", { who: "p3", want: "watch" });
  ok(t.view<V>("p4").want?.p1 === "act" && !t.view<V>("p4").want?.p3, "I say for myself; a guest can't say for someone else");
  t.g("p0", "want", { who: "p3", want: "watch" });
  ok(t.view<V>("p4").want?.p3 === "watch", "the host can (the one phone says for everyone)");
  v = t.view<V>("p4");
  ok(v.next?.ok && !v.next.auto && v.next.lo === 1 && v.next.hi === 1, "one volunteer: one goes up");

  // one volunteer: a monologue, and the audience picks the real secret out of three
  t.g("p0", "start");
  v = t.view<V>("p4");
  const sc = DRAMA_SCENES[st().scene!];
  ok(v.phase === "brief" && v.cast.length === 1 && v.cast[0].pid === "p1" && sc.roles.length === 1, "the volunteer, alone on stage");
  ok(v.options?.length === 3 && v.options.some((o) => o.zh === sc.secrets![0].zh), "everyone sees the three secrets");
  ok(t.view<V>("p1").me?.secret.zh === sc.culpritCard.zh && !t.view<V>("p1").me?.culprit, "the actor's card is the real secret and what to do");
  ok(!JSON.stringify(v).includes(sc.culpritCard.zh), "nobody else sees which one it is");
  t.g("p1", "ready");
  ok(t.view<V>("p4").phase === "act" && t.view<V>("p4").actMs === 60_000, "a monologue runs a minute");
  t.advance(61_000);
  const answer = String(st().order.indexOf(0));
  const wrong = answer === "0" ? "1" : "0";
  const crowd = t.ids.filter((id) => id !== "p1");
  t.g("p4", "vote", { guess: "p1", stars: { p1: 4 } });
  ok(t.view<V>("p4").voted.length === 0, "a monologue's guess is one of the secrets");
  t.g("p1", "vote", { guess: answer, stars: {} });
  ok(t.view<V>("p4").voted.length === 0, "the actor doesn't vote");
  crowd.forEach((id, i) => t.g(id, "vote", { guess: i < 6 ? answer : wrong, stars: { p1: 4 } }));
  v = t.view<V>("p4");
  ok(v.phase === "reveal" && v.result!.answer === Number(answer) && v.result!.caught, "most found the secret: caught");
  ok(v.result!.right.length === 6 && v.result!.losers.join() === "p1" && !v.result!.best.length && !v.awards.p1, "six were right; the actor pays, and a monologue has no best actor to beat");

  // eight want to act: a scene for eight, and a longer one
  t.g("p1", "want", { want: "watch" });
  for (const id of ["p2", "p4", "p5", "p6", "p7", "p8", "p9", "p0"]) t.g(id, "want", { want: "act" });
  ok(t.view<V>("p4").next?.lo === 8, "eight volunteers: eight go up");
  t.g("p0", "next");
  v = t.view<V>("p4");
  const big = DRAMA_SCENES[st().scene!];
  const [lo, hi] = dramaSizes(big);
  ok(v.cast.length === 8 && lo <= 8 && hi >= 8 && st().cast.every((c) => t.view<V>("p4").want?.[c] === "act"), "all eight on stage, in a scene written for that many");
  for (const c of st().cast) t.g(c, "ready");
  ok(t.view<V>("p4").actMs === 150_000, "eight actors: a minute more than four");
  t.g("p0", "cut");
  ok(!t.view<V>("p4").peer, "two still watch: they vote");
  // nine volunteers: eight go up, whoever has acted least
  t.g("p3", "want", { want: "act" });
  t.g("p0", "reveal");
  for (const id of ["p1", "p3"]) t.g(id, "vote", { guess: st().cast[0], stars: Object.fromEntries(st().cast.map((c) => [c, 3])) });
  t.g("p0", "next");
  ok(st().cast.length === 8 && st().cast.includes("p3"), "nine want to act: eight go up, and the one who hasn't yet is among them");
  // everyone would rather watch: nobody can go on
  for (const id of t.ids) t.g(id, "want", { want: "watch" });
  t.g("p0", "skip");
  ok(!t.view<V>("p4").next?.ok && st().cast.includes("p3"), "everyone only watching: no new scene");
  for (const id of t.ids) t.g(id, "want", { want: null });
  ok(t.view<V>("p4").next?.auto && !Object.keys(t.view<V>("p4").want ?? {}).length, "and back to anyone");
});

test("drama: nobody watching: the actors vote on each other, never on themselves", () => {
  type V = V<"drama">;
  const t = setup(3);
  t.act("p0", { a: "start", game: "drama" });
  for (const id of t.ids) t.g(id, "want", { want: "act" });
  t.g("p0", "start");
  const s = t.eng.d.game!.s as { cast: string[]; culprit: string };
  ok(s.cast.length === 3 && t.view<V>("p0").peer === true, "all three act: they'll vote on each other");
  for (const c of s.cast) t.g(c, "ready");
  t.g("p0", "cut");
  const innocents = s.cast.filter((c) => c !== s.culprit);
  const others = (me: string) => s.cast.filter((c) => c !== me);
  t.g(innocents[0], "vote", { guess: innocents[0], stars: Object.fromEntries(others(innocents[0]).map((c) => [c, 3])) });
  ok(t.view<V>("p0").voted.length === 0, "nobody suspects themselves");
  t.g(innocents[0], "vote", { guess: s.culprit, stars: { [s.culprit]: 3 } });
  ok(t.view<V>("p0").voted.length === 0, "stars for everyone else");
  t.g(innocents[0], "vote", { guess: s.culprit, stars: { [s.culprit]: 2, [innocents[1]]: 5, [innocents[0]]: 1 } });
  t.g(innocents[1], "vote", { guess: innocents[0], stars: { [s.culprit]: 2, [innocents[0]]: 4 } });
  t.g(s.culprit, "vote", { guess: innocents[0], stars: { [innocents[0]]: 4, [innocents[1]]: 5 } });
  const v = t.view<V>("p0");
  ok(v.phase === "reveal" && v.result!.counts[innocents[0]] === 2 && !v.result!.caught, "the culprit's own vote counts: an innocent takes the blame");
  ok(v.result!.stars[innocents[0]] === 4 && v.result!.stars[innocents[1]] === 5 && v.result!.stars[s.culprit] === 2, "my stars for myself don't count");
  ok(v.result!.losers.includes(innocents[1]) && !v.result!.losers.includes(innocents[0]) && v.scores[s.culprit] === 2 + 3, "the fooled one pays; the culprit isn't 'fooled' by their own vote, and walks off with three");
  ok(v.result!.right.join() === innocents[0] && v.result!.best.join() === innocents[1], "one guessed right; most stars wins");
});

test("drama: a scene written for every number of actors, at every table", () => {
  type V = V<"drama">;
  const missing: string[] = [];
  for (const level of ["all", "spicy"] as const) {
    for (const diff of ["easy", "hard"] as const) {
      for (let k = 1; k <= DRAMA_MAX_CAST; k++) {
        const t = setup(10);
        t.act("p0", { a: "start", game: "drama" });
        t.g("p0", "config", { level, diff });
        t.ids.forEach((id, i) => t.g(id, "want", { want: i < k ? "act" : "watch" }));
        t.g("p0", "start");
        const v = t.view<V>("p9");
        const sc = DRAMA_SCENES.find((x) => x.id === v.scene?.id);
        const [lo, hi] = sc ? dramaSizes(sc) : [0, 0];
        if (!sc || v.cast.length !== k || lo > k || hi < k || (level === "all" && sc.level !== "all")) missing.push(`${level} ${diff} ${k}: ${sc?.id ?? "none"} with ${v.cast.length}`);
      }
    }
  }
  ok(!missing.length, `every table finds a scene for one to eight actors (${missing.join("; ")})`);
  // tables of four to six get choices: several scenes for each of those numbers, on easy
  for (let k = 4; k <= 6; k++) {
    const n = DRAMA_SCENES.filter((s) => s.level === "all" && s.diff === "easy" && dramaSizes(s)[0] <= k && dramaSizes(s)[1] >= k).length;
    ok(n >= 4, `all ages, easy, ${k} actors: ${n} scenes`);
  }
});

test("drama: whose stories: the host's groups come first, everyone's fill in, other groups' stay out", () => {
  type V = V<"drama">;
  const sceneOf = (v: V) => DRAMA_SCENES.find((x) => x.id === v.scene?.id)!;
  // nobody picked: everyone's scenes only
  const t = setup(6);
  t.act("p0", { a: "start", game: "drama" });
  t.g("p0", "config", { total: 20 });
  ok(t.view<V>("p1").groups?.length === 0, "no groups to begin with");
  t.g("p0", "start");
  const seen: string[] = [];
  for (let i = 0; i < 12; i++) {
    seen.push(sceneOf(t.view<V>("p1")).group ?? "-");
    t.g("p0", "skip");
  }
  ok(seen.every((x) => x === "-"), "a table that picks none never gets a group's scene");

  // the host picks the Filipino stories (a guest can't, and a group nobody wrote is ignored)
  const u = setup(6);
  u.act("p0", { a: "start", game: "drama" });
  u.g("p1", "config", { groups: ["jp"] });
  u.g("p0", "config", { groups: ["ph", "xx", "ph"], total: 20 });
  ok(u.view<V>("p1").groups?.join() === "ph", "the host's pick, once, and only real groups");
  u.g("p0", "start");
  const ph = DRAMA_SCENES.filter((x) => x.group === "ph" && x.level === "all" && dramaSizes(x)[0] <= 4).length;
  const got: (string | undefined)[] = [];
  for (let i = 0; i < ph + 2; i++) {
    const v = u.view<V>("p1");
    got.push(v.scene?.group);
    if (i === 0) ok(v.scene?.group === "ph" && sceneOf(v).group === "ph", "the view says whose story it is");
    u.g("p0", "skip");
  }
  ok(got.slice(0, ph).every((x) => x === "ph"), `the ${ph} Filipino scenes for two to four come first`);
  ok(got.slice(ph).every((x) => x === undefined), "then everyone's fill in, never another group's");
  // two groups: theirs before everyone's
  const w = setup(6);
  w.act("p0", { a: "start", game: "drama" });
  w.g("p0", "config", { groups: ["kr", "ca"], total: 20 });
  ok(w.view<V>("p1").groups?.join() === "ca,kr", "in the setup's order");
  w.g("p0", "start");
  const first = sceneOf(w.view<V>("p1")).group;
  ok(first === "ca" || first === "kr", "one of the picked groups' scenes first");
});

test("drama: every picture the backdrops ask for is there", () => {
  const dir = fileURLToPath(new URL("../public/drama/", import.meta.url));
  const known = /^(classic|group-(cn|ca|sa|ph|kr|jp|ir|eu))$/;
  for (const name of DRAMA_DRAWN_ART) ok(known.test(name) && existsSync(`${dir}${name}.webp`), `${name}: a name the backdrop uses, with its file`);
  for (const k of ["family", "love", "office", "crime", "palace", "show"]) ok(existsSync(`${dir}kind-${k}.webp`), `kind-${k}: the first set's picture`);
  ok(existsSync(`${dir}stage.webp`) && existsSync(`${dir}pk.webp`), "the empty stage and the duel");
});

test("drama: every group has scenes for two to five actors, all ages, with guides", () => {
  for (const gr of DRAMA_GROUPS) {
    const list = DRAMA_SCENES.filter((x) => x.group === gr.key);
    ok(list.length >= 3 && list.every((x) => x.level === "all" && !x.secrets), `${gr.key}: ${list.length} scenes, all ages`);
    for (let k = 2; k <= 5; k++) ok(list.some((x) => dramaSizes(x)[0] <= k && dramaSizes(x)[1] >= k), `${gr.key}: a scene for ${k}`);
    ok(list.every((x) => DRAMA_GUIDES[x.id]?.roles.length === x.roles.length), `${gr.key}: every scene has its guide`);
    ok(!!gr.name.zh && !!gr.name.en, `${gr.key}: named in both languages`);
  }
});

test("drama: famous scenes: the host picks the films, every phone shows the parts and their lines, and only stars count", () => {
  type V = V<"drama">;
  const t = setup(5);
  const st = () => t.eng.d.game!.s as { cast: string[]; culprit: string | null; classic: number | null; roles: number[] };
  t.act("p0", { a: "start", game: "drama" });
  ok(t.view<V>("p1").cset === "zh", "Chinese film and TV until the host says otherwise");
  t.g("p0", "config", { mode: "classic", cset: "en", total: 2 });
  t.g("p1", "config", { cset: "zh" });
  let v = t.view<V>("p1");
  ok(v.mode === "classic" && v.cset === "en", "the host picks famous scenes from English film and TV; a guest can't change it");
  ok(v.next?.ok && v.next.auto && v.next.lo === 2 && v.next.hi === 3, "nobody has said: two or three of five go up");
  t.g("p0", "start");
  v = t.view<V>("p4");
  const c = DRAMA_CLASSICS[st().classic!];
  ok(v.phase === "brief" && v.classic?.id === c.id && c.set === "en" && !v.scene && !v.pk && !v.options, "an English famous scene: no culprit, no duel");
  ok(v.classic!.beats.length === c.beats.length && v.classic!.setup.zh === c.setup.zh && v.classic!.year === c.year, "what happens and how it goes, on every phone");
  ok(
    v.cast.length >= 2 && v.cast.length <= 3 && v.cast.every((x, j) => x.role.zh === c.roles[st().roles[j]].name.zh && x.brief.zh === c.roles[st().roles[j]].play.zh && x.first?.zh === c.roles[st().roles[j]].first.zh),
    "every part, how to play it and the line it opens with",
  );
  const lo = Math.min(c.min ?? c.roles.length, c.roles.length);
  ok(st().roles.length === v.cast.length && c.roles.slice(0, Math.min(lo, v.cast.length)).every((_, i) => st().roles.includes(i)), "the parts the moment can't do without come first");
  ok(st().culprit === null && v.cast.every((x) => { const me = t.view<V>(x.pid).me; return !!me && !me.culprit && !me.secret.zh && !me.task.zh; }), "nobody's a culprit, and nothing is secret");
  ok(pkSeeUrl(v.classic!.set, v.classic!.see).startsWith("https://www.youtube.com/results?search_query="), "the original, to find on YouTube");
  for (const x of v.cast) t.g(x.pid, "ready");
  v = t.view<V>("p4");
  ok(v.phase === "act" && v.actMs === 60_000 + (v.cast.length - 2) * 15_000 && !v.twistAt, "a minute, fifteen seconds more for each actor past two, and no plot twist");
  t.advance(v.actMs + 1000);
  ok(t.view<V>("p4").phase === "vote" && !t.view<V>("p4").twist, "time's up: the vote");
  const cast = st().cast;
  const aud = t.ids.filter((id) => !cast.includes(id));
  const stars = Object.fromEntries(cast.map((id, i) => [id, i === 0 ? 5 : 2]));
  t.g(aud[0], "vote", { guess: cast[0], stars });
  ok(t.view<V>(aud[0]).myVote?.guess === null, "there's nobody to guess: only the stars count");
  for (const a of aud.slice(1)) t.g(a, "vote", { stars });
  v = t.view<V>("p4");
  ok(v.phase === "reveal" && v.result!.best.join() === cast[0] && v.result!.losers.join() === cast.slice(1).join() && !v.result!.right.length && !v.result!.caught, "most stars takes best actor; the fewest pay");
  ok(v.scores[cast[0]] === 5 && cast.slice(1).every((id) => v.scores[id] === 2), "each actor scores their stars");
  t.advance(6000);
  const pen = t.pens().at(-1);
  ok(!!pen && pen.note?.zh === c.title.zh && pen.who.join() === cast.slice(1).join(), "the penalty names the moment");
  t.g("p0", "next");
  ok(DRAMA_CLASSICS[st().classic!].id !== c.id && DRAMA_CLASSICS[st().classic!].set === "en", "the next act: another one, from the same films");

  // one volunteer, Chinese film and TV: a moment one person can carry
  const u = setup(4);
  u.act("p0", { a: "start", game: "drama" });
  u.g("p0", "config", { mode: "classic" });
  u.g("p1", "want", { want: "act" });
  ok(u.view<V>("p2").next?.lo === 1, "one volunteer: one goes up");
  u.g("p0", "start");
  const w = u.view<V>("p2");
  ok(w.cast.length === 1 && w.cast[0].pid === "p1" && w.classic?.set === "zh" && !w.options, "a famous scene played solo, from Chinese film and TV");
  ok(pkSeeUrl(w.classic!.set, w.classic!.see).startsWith("https://search.bilibili.com/all?keyword="), "the original, to find on Bilibili");
  u.g("p1", "ready");
  u.g("p1", "cut");
  for (const a of ["p0", "p2", "p3"]) u.g(a, "vote", { stars: { p1: 4 } });
  const r = u.view<V>("p2").result!;
  ok(r.stars.p1 === 4 && !r.best.length && !r.losers.length, "alone on stage: nobody to beat, and nobody pays");
});

test("drama: every famous scene in both languages, with its parts, its steps and a search for the original", () => {
  type V = V<"drama">;
  const bi = (x: { zh: string; en: string }) => !!x.zh.trim() && !!x.en.trim();
  const ids = new Set<string>();
  for (const c of DRAMA_CLASSICS) {
    ok(!ids.has(c.id), `${c.id}: one id`);
    ids.add(c.id);
    ok(bi(c.show) && bi(c.title) && bi(c.setup) && c.year > 1900 && c.year <= 2026, `${c.id}: the show, the moment and what happens, in both languages`);
    ok(c.beats.length >= 3 && c.beats.every(bi), `${c.id}: how it goes, step by step`);
    ok(c.roles.length >= 1 && c.roles.length <= 4 && c.roles.every((r) => bi(r.name) && bi(r.play) && bi(r.first)), `${c.id}: every part says how to play it and what to open with`);
    ok(new Set(c.roles.map((r) => r.name.zh)).size === c.roles.length && new Set(c.roles.map((r) => r.name.en)).size === c.roles.length, `${c.id}: no two parts with the same name`);
    ok(c.min === undefined || (Number.isInteger(c.min) && c.min >= 1 && c.min < c.roles.length), `${c.id}: the parts it can't do without`);
    // the famous line, not the script
    ok(c.roles.every((r) => r.first.zh.length <= 40 && r.first.en.length <= 90), `${c.id}: the opening lines stay short`);
    ok(c.see.trim().length >= 4, `${c.id}: something to search for`);
  }
  ok(DRAMA_CLASSIC_TIPS.length === 5 && DRAMA_CLASSIC_TIPS.every(bi) && bi(DRAMA_CSET_NAME.zh) && bi(DRAMA_CSET_NAME.en), "the tips and the two sets, in both languages");
  for (const set of ["zh", "en"] as const) {
    const list = DRAMA_CLASSICS.filter((c) => c.set === set && c.level === "all");
    ok(list.length >= 12, `${set}: ${list.length} famous scenes`);
    // the exact number who volunteer, one to four, at every table
    for (let k = 1; k <= 4; k++) {
      const t = setup(6);
      t.act("p0", { a: "start", game: "drama" });
      t.g("p0", "config", { mode: "classic", cset: set });
      t.ids.forEach((id, i) => t.g(id, "want", { want: i < k ? "act" : "watch" }));
      t.g("p0", "start");
      const v = t.view<V>("p5");
      ok(v.classic?.set === set && v.cast.length === k && v.cast.every((x) => t.view<V>("p5").want?.[x.pid] === "act"), `${set}: ${k} volunteers, ${k} on stage`);
    }
  }
  // more volunteers than any famous scene has parts: four go up
  const t = setup(6);
  t.act("p0", { a: "start", game: "drama" });
  t.g("p0", "config", { mode: "classic" });
  for (const id of t.ids) t.g(id, "want", { want: "act" });
  ok(t.view<V>("p1").next?.lo === 4, "six volunteers: the biggest famous scene takes four");
  t.g("p0", "start");
  const v = t.view<V>("p1");
  ok(v.cast.length === 4 && !!v.peer === false, "four on stage, two watch and vote");
});

test("euchre: bots fill seats, legal play, hands score", () => {
  const t = setup(2);
  t.act("p0", { a: "start", game: "euchre" });
  let v = t.view<V<"euchre">>("p1");
  ok(v.phase === "setup" && v.seats[0].pid === "p0" && v.seats[2].pid === "p1" && v.seats[1].bot !== null, "two people are partners, bots opposite");
  t.g("p0", "seats", { mode: "rivals" });
  ok(t.view<V<"euchre">>("p1").seats[1].pid === "p1", "rivals: p1 moves next to p0");
  t.g("p0", "start");
  v = t.view<V<"euchre">>("p0");
  ok(v.hand.length === 5 && t.view<V<"euchre">>("p1").hand.length === 5, "five cards each");
  ok(v.hand.every((c) => !t.view<V<"euchre">>("p1").hand.includes(c)), "hands are private");
  // let everything run: humans pass/auto through the "slow" timer, bots play
  let guard = 0;
  while (t.view<V<"euchre">>("p0").phase !== "end" && guard++ < 3000) {
    const cur = t.view<V<"euchre">>("p0");
    const seat = cur.turn;
    const pid = cur.seats[seat].pid;
    if (pid && cur.phase !== "trick" && cur.phase !== "hand") {
      const mine = t.view<V<"euchre">>(pid);
      if (cur.phase === "play") t.g(pid, "move", { mv: { t: "play", card: mine.legal[0] } });
      else if (cur.phase === "discard") t.g(pid, "move", { mv: { t: "discard", card: mine.hand[0] } });
      else if (cur.phase === "bid2" && cur.dealer === seat) t.g(pid, "move", { mv: { t: "call", suit: (["S", "H", "D", "C"] as const).find((s) => !cur.upcard?.endsWith(s)) } });
      else t.g(pid, "move", { mv: { t: "pass" } });
    } else t.advance(7100);
  }
  v = t.view<V<"euchre">>("p0");
  ok(v.phase === "end" && v.winner !== null && Math.max(...v.score) >= 10, "played to ten");
});

test("euchre: moving seats, first to five, sorted hands", () => {
  const t = setup(3);
  t.act("p0", { a: "start", game: "euchre" });
  let v = t.view<V<"euchre">>("p0");
  ok(v.seats[3].pid === null && v.seats[3].bot !== null, "three people, a bot in the last seat");
  t.g("p1", "sit", { seat: 3 });
  v = t.view<V<"euchre">>("p0");
  ok(v.seats[3].pid === "p1" && v.seats[1].pid === null, "p1 moves to the empty seat");
  t.g("p1", "target", { n: 5 });
  ok(t.view<V<"euchre">>("p0").target === 10, "only the host picks the target");
  t.g("p0", "target", { n: 5 });
  ok(t.view<V<"euchre">>("p2").target === 5, "first to five");
  t.g("p2", "stand");
  ok(t.view<V<"euchre">>("p0").seats[2].pid === null && t.view<V<"euchre">>("p2").mySeat === null, "p2 stands up to watch");
  t.g("p0", "start");
  v = t.view<V<"euchre">>("p0");
  ok(v.target === 5 && v.phase === "bid1", "the game keeps the target");
  ok(t.view<V<"euchre">>("p2").hand.length === 0, "a watcher sees no cards");
  ok(sortHand(["9S", "AH", "KC", "QD", "10H", "QS", "JD"], "H").join(" ") === "JD AH 10H QS 9S QD KC", "trump first with the left bower, then colors alternate");
  ok(sortHand(["9D", "AC", "KH", "JS", "QS"], "C").join(" ") === "JS AC KH QS 9D", "black trump: clubs, hearts, spades, diamonds");
});

test("euchre: a phone that drops on its turn gets the computer after 15 s, one that's back gets 75 s", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "euchre" });
  t.g("p0", "start");
  const at = () => {
    const v = t.view<V<"euchre">>("p0");
    return { phase: v.phase, turn: v.turn, pid: v.seats[v.turn].pid };
  };
  const a = at();
  ok(a.phase === "bid1" && a.pid, "a person bids first");
  t.advance(20_000);
  ok(at().turn === a.turn, "an open phone isn't hurried after 20 s");
  t.eng.setOnline(a.pid!, false);
  t.eng.flush();
  t.advance(16_000);
  const b = at();
  ok(b.turn !== a.turn, "dropped on its turn: the computer has played for it within 16 s");
  // the next one drops and comes straight back: the usual time again
  t.eng.setOnline(b.pid!, false);
  t.eng.flush();
  t.advance(5_000);
  ok(t.eng.hello(b.pid!, "Back", false) === null, "back at the table");
  t.eng.flush();
  t.advance(20_000);
  ok(at().turn === b.turn, "back in time: not hurried");
});

test("player ids: plain characters, never an object's own key", () => {
  const e = new RoomEngine(freshRoom("ABCD", clock), host);
  ok(e.hello("constructor", "x", true) === "bad", "constructor refused");
  ok(e.hello("__proto__", "x", true) === "bad", "__proto__ refused");
  ok(e.hello("a b", "x", true) === "bad", "spaces refused");
  ok(e.hello("p1x9z", "x", true) === null, "a phone id is fine");
});

test("big screen: opens a table, phones sit down, first one hosts", () => {
  const e = new RoomEngine(freshRoom("TVTV", clock), host);
  ok(e.screenHello("tv-abc123", true, "punchline") === null, "a screen opens a fresh table");
  e.setScreens(1);
  e.flush();
  ok(e.exists && e.d.seats.length === 0 && e.d.front === ONLINE_GAMES.indexOf("punchline"), "the table exists with the game queued, nobody seated");
  ok(e.hello("p1", "Amy", false) === null && e.d.host === "p1", "the first phone sits down and hosts");
  ok(e.hello("p2", "Ben", false) === null && e.d.host === "p1", "the second one just sits");
  ok(e.view("tv-abc123").screens === 1 && e.view("p2").screens === 1, "everyone knows a screen is watching");
  ok(e.screenHello("tv-other1", true) === "exists", "another screen can't open the same code");
  ok(e.screenHello("tv-abc123", true) === null, "the screen that opened it can say hello again");
  ok(e.screenHello("tv-other1", false) === null, "a second screen can watch");
  e.hello("p3", "Cat", false);
  e.act("p1", { a: "start", game: "punchline" });
  const tv = e.view("tv-abc123").game as V<"punchline">;
  ok(tv.phase === "write" && tv.mine.length === 0 && tv.players.length === 3, "the screen sees the game, writes nothing");
});

test("punchline: a host tap only moves the step it was made on", () => {
  const t = setup(4);
  t.act("p0", { a: "start", game: "punchline" });
  for (const pid of t.ids) for (const m of t.view<V<"punchline">>(pid).mine) t.g(pid, "answer", { k: m.k, text: `${pid} ${m.k}` });
  let v = t.view<V<"punchline">>("p0");
  ok(v.phase === "present", "all written: the first matchup is presented");
  t.g("p0", "next", { step: v.step - 1 });
  ok(t.view<V<"punchline">>("p0").phase === "present", "a tap from an earlier step is ignored");
  t.g("p0", "next", { step: v.step });
  ok(t.view<V<"punchline">>("p0").phase === "vote", "a tap for this step opens the vote");
  t.g("p0", "next", { step: v.step });
  ok(t.view<V<"punchline">>("p0").phase === "vote", "the same tap arriving twice does nothing more");
  t.g("p0", "next");
  ok(t.view<V<"punchline">>("p0").phase === "result", "an older phone's tap with no step still works");
  v = t.view<V<"punchline">>("p0");
  t.g("p0", "again", { step: v.step });
  ok(t.view<V<"punchline">>("p0").phase === "result", "play again only works at the end");
});

test("big screen: sees every game, but nobody's secrets; a kicked id stays out", () => {
  const e = new RoomEngine(freshRoom("TVTW", clock), host);
  ok(e.screenHello("tv-scr1", true) === null, "a screen opens a table");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  e.hello("p3", "Cat", false);
  e.act("p1", { a: "start", game: "postit" });
  e.flush();
  let tv = e.view("tv-scr1");
  ok(tv.game?.id === "postit" && tv.playing === "postit", "the screen watches Post-it");
  ok(e.view("p2").game !== null && e.view("p2").playing === "postit", "a seated phone gets the game");
  for (const p of ["p1", "p2", "p3"]) e.act(p, { a: "g", g: { x: "write", text: `note for ${(e.view(p).game as { myTarget: string }).myTarget}` } });
  e.flush();
  const notes = (e.view("tv-scr1").game as { notes: Record<string, string | null>; phase: string }).notes;
  ok((e.view("p1").game as { phase: string }).phase === "play" && Object.values(notes).every((n) => n === null), "while they play, the screen shows no note (the person it is about might be looking)");
  ok(Object.values((e.view("p2").game as { notes: Record<string, string | null> }).notes).filter((n) => n !== null).length === 2, "a phone sees everyone's note but its own");
  e.act("p1", { a: "end" });
  e.act("p1", { a: "start", game: "king" });
  e.flush();
  tv = e.view("tv-scr1");
  ok(tv.game?.id === "king" && (tv.game as { myToken: unknown }).myToken === null, "King's Game: the screen holds no token");
  e.act("p1", { a: "end" });
  e.act("p1", { a: "end" });
  e.act("p1", { a: "start", game: "punchline" });
  e.flush();
  ok(e.view("tv-scr1").game?.id === "punchline", "Punchline goes to the screen in full");
  e.act("p1", { a: "kick", pid: "p3" });
  e.flush();
  ok(e.screenHello("p3", false) === "kicked", "a kicked id can't come back as a screen");
});

test("到此一游: only the host opens the room, the table and the big screen learn its number", () => {
  const e = new RoomEngine(freshRoom("TRIP", clock), host);
  ok(e.screenHello("tv-trip", true) === null, "a screen opens a table");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  e.act("p1", { a: "start", game: "trip" });
  e.flush();
  ok(e.view("p2").game?.id === "trip" && (e.view("p2").game as { code: string | null }).code === null, "the game is on, no room yet");
  e.act("p2", { a: "g", g: { x: "open", code: "1234" } });
  e.flush();
  ok((e.view("p2").game as { code: string | null }).code === null, "only the host opens it");
  e.act("p1", { a: "g", g: { x: "open", code: "12a4" } });
  e.flush();
  ok((e.view("p1").game as { code: string | null }).code === null, "a room number is four digits");
  e.act("p1", { a: "g", g: { x: "open", code: "4072" } });
  e.flush();
  ok((e.view("p2").game as { code: string | null }).code === "4072", "every phone gets the number");
  ok(e.view("tv-trip").game?.id === "trip" && (e.view("tv-trip").game as { code: string | null }).code === "4072", "so does the big screen");
  e.act("p1", { a: "end" });
  e.flush();
  ok(e.view("p2").game === null, "the host ends it: back to the lobby");
});

test("dj: changle.ca/dj opens the booth, the speaker starts the music, the night moves on by its clock", () => {
  const e = new RoomEngine(freshRoom("DJDJ", clock), host);
  const events: RoomEvent[] = [];
  const run = () => events.push(...e.flush().events);
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    run();
  };
  ok(e.screenHello("tv-dj1", true, "dj") === null, "a screen at /dj opens a table");
  e.setScreens(1);
  const opened = e.flush();
  ok(!opened.events.some((x) => x.k === "fx" && x.fx === "start"), "the booth opens without the table's start sound (the phones stay silent)");
  ok(e.view("tv-dj1").playing === "dj" && dv("tv-dj1").phase === "wait", "the booth is open before anyone sits down, no music yet");
  ok(e.d.front === ONLINE_GAMES.indexOf("dj"), "the booth is the game up");
  ok(e.hello("p1", "Amy", false) === null && e.d.host === "p1", "the first phone sits down and hosts");
  e.hello("p2", "Ben", false);
  run();
  ok(dv("p2").phase === "wait", "a phone that sits down lands in the booth");

  e.act("p1", { a: "g", g: { x: "phase", phase: "peak" } });
  run();
  ok(dv("p1").phase === "wait", "the host can't skip ahead before the music starts");

  e.act("p2", { a: "g", g: { x: "fire" } });
  const fired = e.flush();
  events.push(...fired.events);
  ok(events.some((x) => x.k === "fx" && x.fx === "fire" && x.pid === "p2"), "🔥 tells the room who pressed it");
  ok(fired.light && !fired.changed, "🔥 is a light change: sent at once, stored with the next save");
  e.act("p2", { a: "g", g: { x: "fire" } });
  run();
  ok(dv("p1").total.p2 === 1, "a second 🔥 at once doesn't count");
  advance(310);
  e.act("p2", { a: "g", g: { x: "fire" } });
  run();
  ok(dv("p1").total.p2 === 2 && dv("p1").fires.length === 2, "after the gap it counts again");

  const t0 = clock;
  e.screenAct("tv-dj1", { x: "live", source: "fake" });
  run();
  let v = dv("p1");
  ok(v.phase === "warm" && v.liveAt === t0 && v.capAt === t0 + 4 * 3600_000, "the speaker plays: the warm-up starts and the 4-hour cap with it");
  ok(v.nextAt === t0 + 15 * 60_000 && v.energy > 0 && v.mix.bpm === 125, "the warm-up has a clock, an energy and a tempo");
  ok(!e.screenAct("tv-dj1", { x: "live", source: "fake" }) && !e.flush().changed, "saying it again changes nothing, and costs nothing");
  ok(dv("p1").liveAt === t0, "the set's start stays put");

  advance(15 * 60_000);
  ok(dv("p1").phase === "build" && dv("p1").energy > v.energy, "15 minutes in: the build, harder than the warm-up");
  const built = dv("p1").energy;
  advance(15 * 60_000);
  v = dv("p1");
  ok(v.phase === "peak" && v.nextAt === 0 && v.energy > built, "then the peak, the hardest, which waits for the host");
  advance(60 * 60_000);
  ok(dv("p1").phase === "peak", "an hour later, still the peak");

  e.act("p2", { a: "g", g: { x: "phase", phase: "cool" } });
  run();
  ok(dv("p1").phase === "peak", "only the host moves the night");
  e.act("p1", { a: "g", g: { x: "phase", phase: "warm" } });
  run();
  ok(dv("p1").phase === "warm" && dv("p1").nextAt === clock + 15 * 60_000, "the host drags it back to the warm-up, with a fresh clock");
  e.act("p1", { a: "g", g: { x: "phase", phase: "sideways" } });
  run();
  ok(dv("p1").phase === "warm", "a phase that doesn't exist is ignored");
  e.act("p1", { a: "g", g: { x: "phase", phase: "cool" } });
  run();
  ok(dv("p1").phase === "cool", "the host winds it down");
  advance(15 * 60_000);
  ok(dv("p1").phase === "end", "15 minutes later the set is over");
  e.act("p1", { a: "g", g: { x: "phase", phase: "peak" } });
  run();
  ok(dv("p1").phase === "end", "an ended set stays ended");

  e.act("p2", { a: "g", g: { x: "again" } });
  run();
  ok(dv("p1").phase === "end", "only the host starts another set");
  e.act("p1", { a: "g", g: { x: "again" } });
  run();
  v = dv("p1");
  ok(v.phase === "wait" && v.set === 2 && v.liveAt === 0 && v.total.p2 === 2, "another set: waiting for the speaker again, the night's 🔥 kept");
  const t1 = clock;
  e.screenAct("tv-dj1", { x: "live", source: "fake" });
  run();
  ok(dv("p1").phase === "warm" && dv("p1").capAt === t1 + 4 * 3600_000, "the speaker starts it, with a new cap");
  advance(15 * 60_000);
  advance(15 * 60_000);
  advance(3 * 3600_000 + 14 * 60_000);
  ok(dv("p1").phase === "peak", "3 h 44 in: still the peak");
  advance(60_000);
  ok(dv("p1").phase === "cool", "15 minutes before the cap: the wind-down");
  advance(15 * 60_000);
  ok(dv("p1").phase === "end", "at 4 hours the set ends itself");

  ok(e.hello("p3", "Cat", false) === null && dv("p3").phase === "end", "someone arriving late lands in the booth too");
  e.act("p1", { a: "g", g: { x: "again" } });
  e.screenAct("tv-dj1", { x: "live", source: "fake" });
  run();
  for (const pid of ["p1", "p2", "p3"]) e.act(pid, { a: "leave" });
  run();
  ok(e.d.seats.length === 0 && dv("tv-dj1").phase === "warm", "every phone leaves: the booth plays on for the speaker");
  ok(e.hello("p4", "Dan", false) === null && e.d.host === "p4" && dv("p4").phase === "warm", "the next phone lands in the booth, and hosts");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  run();
  e.act("p4", { a: "end" });
  run();
  ok(e.view("p1").game === null && e.d.front === ONLINE_GAMES.indexOf("dj"), "the host closes the booth: the lobby, with the booth still up front");
  e.act("p4", { a: "start", game: "dj" });
  run();
  ok(dv("p2").phase === "wait" && dv("p2").set === 1, "and can open it again from there");
});

test("dj: the speaker can't play host, a phone can't speak for the speaker", () => {
  const e = new RoomEngine(freshRoom("DJDK", clock), host);
  ok(e.screenHello("tv-dj2", true, "dj") === null, "a screen opens the booth");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  e.act("p1", { a: "g", g: { x: "live", source: "fake" } });
  e.flush();
  ok(dv("p1").phase === "wait", "a phone saying the music started does nothing");
  e.screenAct("p1", { x: "live", source: "fake" });
  e.flush();
  ok(dv("p1").phase === "wait", "a seated id can't talk as a screen");
  e.screenAct("tv-dj2", { x: "phase", phase: "peak" });
  e.screenAct("tv-dj2", { x: "again" });
  e.screenAct("tv-dj2", { x: "fire" });
  e.flush();
  ok(dv("p1").phase === "wait" && Object.keys(dv("p1").total).length === 0, "the screen can't move the night or press 🔥");
  e.screenAct("tv-dj2", { x: "live", source: "lyria" });
  e.flush();
  ok(dv("p1").phase === "warm" && dv("p1").source === "lyria", "the screen starts the music (and says where it comes from)");
  const st = () => (e.d.game?.s as { speaker: { stalls: number; resets: number; seconds: number } }).speaker;
  ok(e.screenAct("tv-dj2", { x: "stats", stalls: 2, resets: 1, seconds: 60 }), "the speaker's minute report is taken");
  ok(!e.screenAct("tv-dj2", { x: "stats", stalls: 9, resets: 0, seconds: 60 }), "another straight after is not (a screen can't be kicked: it can't flood the room)");
  clock += 31_000;
  ok(!e.screenAct("tv-dj2", { x: "stats", stalls: "lots", resets: 0, seconds: 1 }), "a garbled one is dropped");
  e.screenAct("tv-dj2", { x: "stats", stalls: 1, resets: 0, seconds: 99_999 });
  e.flush();
  ok(st().stalls === 3 && st().resets === 1 && st().seconds === 180, "the reports add up, each no more than a report's worth");
  ok(!e.screenAct("tv-dj2", null) && !e.screenAct("tv-dj2", { y: 1 }) && !e.screenAct("tv-dj2", { x: "nonsense" }), "junk from a screen is ignored");
  ok(!e.flush().changed && dv("p1").phase === "warm", "and costs nothing");
  e.act("p1", { a: "g", g: { x: "phase", phase: "end" } });
  e.act("p1", { a: "g", g: { x: "again" } });
  e.flush();
  ok(st().stalls === 3 && dv("p1").set === 2, "another set keeps the speaker's record for the night");

  const p = new RoomEngine(freshRoom("PUNC", clock), host);
  p.screenHello("tv-p1", true, "punchline");
  p.hello("p1", "Amy", false);
  p.hello("p2", "Ben", false);
  p.hello("p3", "Cat", false);
  p.act("p1", { a: "start", game: "punchline" });
  p.flush();
  const before = JSON.stringify(p.d.game?.s);
  p.screenAct("tv-p1", { x: "next" });
  p.flush();
  ok(JSON.stringify(p.d.game?.s) === before, "a game that doesn't listen to screens hears nothing from them");
  const q = new RoomEngine(freshRoom("PUND", clock), host);
  q.screenHello("tv-q1", true, "punchline");
  q.flush();
  ok(q.view("tv-q1").game === null, "only the booth opens by itself; other games wait for the host");
});

test("dj: ❄️, knobs, drops and songs are kept and limited; nobody else reads a song before it's checked", () => {
  const e = new RoomEngine(freshRoom("DJDQ", clock), host);
  const events: RoomEvent[] = [];
  e.screenHello("tv-dj3", true, "dj");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  e.hello("p3", "Cat", false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    const o = e.flush();
    events.push(...o.events);
    return o;
  };
  const fx = (name: string, pid: string) => events.filter((x) => x.k === "fx" && x.fx === name && x.pid === pid).length;

  // ❄️: like 🔥, and one of either per 300 ms a phone
  const cold = g("p2", "cold");
  ok(cold.light && !cold.changed && fx("cold", "p2") === 1 && dv("p1").colds.length === 1, "❄️ is kept, told to the room, and light");
  g("p2", "fire");
  ok(dv("p1").fires.length === 0 && !dv("p1").total.p2, "🔥 straight after a ❄️ from the same phone doesn't count");
  clock += 310;
  g("p2", "fire");
  g("p3", "cold");
  ok(dv("p1").total.p2 === 1 && dv("p1").colds.length === 2, "after the gap both count, and other phones have their own");

  // knobs: on the grid, -1 to 1, a style that exists, 0 takes it back
  const k = g("p1", "knob", { style: "latin", value: 0.6 });
  ok(k.light && dv("p2").knobs.p1?.latin === 0.5, "a knob turned to 0.6 sits on the grid at 0.5, and everyone sees it");
  g("p1", "knob", { style: "techno", value: -7 });
  ok(dv("p2").knobs.p1?.techno === -1, "past the end it stops at -1");
  g("p1", "knob", { style: "polka", value: 1 });
  g("p1", "knob", { style: "house", value: "loud" });
  ok(Object.keys(dv("p1").knobs.p1 ?? {}).sort().join() === "latin,techno", "a style that isn't one of the 12, or a value that isn't a number, is ignored");
  g("p1", "knob", { style: "latin", value: 0.1 });
  g("p1", "knob", { style: "techno", value: 0 });
  ok(!("p1" in dv("p1").knobs), "back to 0 (0.1 rounds there) takes them back, and a player with none is left out");

  // DROP counts only in a drop's countdown (the beginner deck's test has the rest)
  const early = g("p2", "drop");
  ok(dv("p1").drops.length === 0 && !early.changed && !early.light, "no DROP before the music starts, and it costs nothing");
  e.screenAct("tv-dj3", { x: "live", source: "fake" });
  e.flush();
  const d = g("p2", "drop");
  ok(dv("p1").drops.length === 0 && !d.light && fx("drop", "p2") === 0, "nor with no drop on its way");

  // songs: cleaned, limited, and unread by others until the text check passes
  g("p2", "ask", { text: "  a reggaeton for\nJackie's   birthday‮  ", style: "latin" });
  let q = dv("p2").queue;
  ok(q.length === 1 && q[0].ask === "a reggaeton for Jackie's birthday" && q[0].style === "latin" && q[0].status === "queued" && q[0].by === "p2", "a song is kept on one line, without the invisible characters, with its style");
  ok(fx("ask", "p2") === 1, "and the room hears someone asked");
  ok(dv("p3").queue[0].ask === null && dv("tv-dj3").queue[0].ask === null, "another phone and the big screen see that a song is waiting, not what it says");
  ok(dv("p1").queue[0].ask === "a reggaeton for Jackie's birthday", "the host reads it (to take it back if needed)");
  g("p2", "ask", { text: "another one" });
  ok(dv("p2").queue.length === 1, "one song waiting a player");
  g("p3", "ask", { text: "x" });
  g("p3", "ask", { text: "🎉".repeat(300), style: "polka" });
  q = dv("p3").queue;
  ok(q.length === 2 && Array.from(q[1].ask ?? "").length === 120 && q[1].style === null, "too short is ignored; too long is cut at 120 characters (an emoji is one); an unknown style is none");
  for (let i = 4; i <= 14; i++) {
    e.hello(`p${i}`, `P${i}`, false);
    g(`p${i}`, "ask", { text: `song ${i}` });
  }
  ok(dv("p1").queue.length === 12, "12 songs waiting at most, the whole table");

  // the song pipeline's statuses (A5): checked songs show to all, refused ones only to their own
  const st = e.d.game?.s as { queue: { id: string; by: string; status: string; why?: unknown }[] };
  const mine = st.queue.find((t) => t.by === "p2")!;
  mine.status = "making";
  ok(dv("p3").queue.find((t) => t.by === "p2")?.ask === "a reggaeton for Jackie's birthday", "once it passes the check, everyone can read it");
  const theirs = st.queue.find((t) => t.by === "p3")!;
  theirs.status = "refused";
  theirs.why = { zh: "这句不行", en: "Not that line" };
  ok(!dv("p2").queue.some((t) => t.by === "p3") && dv("tv-dj3").queue.every((t) => t.by !== "p3" || t.status !== "refused"), "a refused song is hidden from everyone else");
  ok(dv("p3").queue.find((t) => t.id === theirs.id)?.status === "refused", "its player sees it, with why");

  // taking a song back
  const waiting = st.queue.find((t) => t.by === "p4")!;
  g("p5", "unask", { id: waiting.id });
  ok(st.queue.some((t) => t.id === waiting.id), "only its player (or the host) can take a song back");
  g("p4", "unask", { id: waiting.id });
  ok(!st.queue.some((t) => t.id === waiting.id), "its player can");
  g("p2", "unask", { id: mine.id });
  ok(st.queue.some((t) => t.id === mine.id), "not once it's being made");
  const other = st.queue.find((t) => t.by === "p6")!;
  g("p1", "unask", { id: other.id });
  ok(!st.queue.some((t) => t.id === other.id), "the host can take back anyone's");
  g("p3", "unask", { id: theirs.id });
  ok(!st.queue.some((t) => t.id === theirs.id), "a refused one can be cleared");

  // another set keeps the knobs and the songs, not the moment's ❄️ and drops
  g("p1", "knob", { style: "house", value: 1 });
  g("p1", "phase", { phase: "end" });
  g("p1", "again");
  const v = dv("p1");
  ok(v.knobs.p1?.house === 1 && v.queue.length > 0 && v.colds.length === 0 && v.drops.length === 0, "another set keeps the knobs and the songs, and clears ❄️ and drops");

  // a booth saved before these existed still works
  const old = e.d.game?.s as Record<string, unknown>;
  delete old.colds;
  delete old.knobs;
  delete old.drops;
  ok(Array.isArray(dv("p1").colds) && typeof dv("p1").knobs === "object", "a booth saved before ❄️ and knobs existed gets them empty");
  clock += 400;
  g("p2", "cold");
  ok(dv("p1").colds.length === 1, "and takes them");
});

test("dj: the beginner deck: pads on a leash, the build-up, the countdown, DROP on the cue, picks and the fader", () => {
  const e = new RoomEngine(freshRoom("DJBD", clock), host);
  const events: RoomEvent[] = [];
  e.screenHello("tv-bd", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
    ["p3", "Cat"],
  ])
    e.hello(p, n, false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const deck = () => dv("p2").deck;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    const o = e.flush();
    events.push(...o.events);
    return o;
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    events.push(...e.flush().events);
  };
  const pads = (pid: string) => events.filter((x) => x.k === "fx" && x.fx === "pad" && x.pid === pid);

  ok(deck().a === "house" && deck().b === null && deck().fader === 0 && !("pending" in deck()), "the decks start with house on A, B empty, the fader on A");
  const before = g("p1", "pad", { pad: "echo" });
  ok(!before.light && !before.changed && pads("p1").length === 0, "no pads before the music: nothing sent, nothing stored");
  e.screenAct("tv-bd", { x: "live", source: "fake" });
  e.flush();

  // the speaker's bars: bar 0 starts now, 125 BPM (a beat is 480 ms)
  const beat = 480;
  ok(e.screenAct("tv-bd", { x: "grid", at: clock, bar: 0, bpm: 125 }), "the speaker says where its bars fall");
  e.flush();
  ok(!e.screenAct("tv-bd", { x: "grid", at: clock + 10, bar: 0, bpm: 125 }), "the same bars again (10 ms off) is nothing new");
  ok(!e.screenAct("tv-bd", { x: "grid", at: "soon", bar: 0, bpm: 125 }) && !e.screenAct("tv-bd", { x: "grid", at: clock, bar: 0, bpm: 900 }), "nonsense bars are turned away");
  e.flush();

  // pads: light, named, on a leash
  const p = g("p1", "pad", { pad: "echo" });
  ok(p.light && !p.changed && pads("p1").length === 1 && pads("p1")[0].data?.[0] === 0 && deck().pads.length === 1, "a pad is sent at once and named (echo is pad 0)");
  g("p1", "pad", { pad: "horn" });
  ok(deck().pads.length === 1, "one pad a phone per 600 ms");
  g("p2", "pad", { pad: "echo" });
  ok(deck().pads.length === 1, "the same pad from two phones at the same moment is one");
  g("p2", "pad", { pad: "horn" });
  g("p3", "pad", { pad: "polka" });
  ok(deck().pads.length === 2 && deck().pads[1].pad === "horn" && deck().pads[1].pid === "p2", "another pad from another phone counts at once; a pad that doesn't exist doesn't");
  advance(160);
  advance(700);
  g("p3", "pad", { pad: "brake" });
  advance(700);
  g("p1", "pad", { pad: "brake" });
  ok(deck().pads.filter((x) => x.pad === "brake").length === 1, "one brake per 4 seconds");
  advance(700);
  g("p2", "pad", { pad: "scratch" });
  ok(!deck().pads.some((x) => x.pad === "scratch"), "a scratch or a rewind moves the music too: not within 4 seconds of the brake");
  advance(700);
  g("p1", "pad", { pad: "siren" });
  g("p2", "pad", { pad: "laser" });
  ok(deck().pads.slice(-2).map((x) => x.pad).join() === "siren,laser" && pads("p1").some((x) => x.data?.[0] === 4) && pads("p2").some((x) => x.data?.[0] === 5), "the siren and the laser from two phones at once both play (pads 4 and 5)");
  advance(2600);
  g("p3", "pad", { pad: "rewind" });
  ok(deck().pads[deck().pads.length - 1].pad === "rewind" && pads("p3").some((x) => x.data?.[0] === 7), "4 seconds on, a rewind (pad 7)");

  // picks: the off-air deck takes the floor's choice
  // the fader has nothing to blend into while deck B is empty
  const empty = g("p2", "fader", { value: 0.6 });
  ok(deck().fader === 0 && !empty.light && !empty.changed, "no fader while deck B is empty");
  g("p1", "vote", { style: "latin" });
  ok(deck().b === "latin" && deck().votes.p1 === "latin", "a pick goes on deck B (off the air)");
  g("p2", "vote", { style: "techno" });
  g("p3", "vote", { style: "techno" });
  ok(deck().b === "techno", "the most picked wins");
  const fast = g("p3", "vote", { style: "techno" });
  ok(deck().votes.p3 === "techno" && !fast.changed, "a phone's picks wait 300 ms between them");
  advance(310);
  g("p3", "vote", { style: "techno" });
  ok(!("p3" in deck().votes) && deck().b === "techno", "picking it again takes it back; a tie goes to the one picked last (Ben's techno, after Amy's latin)");
  advance(310);
  g("p3", "vote", { style: "house" });
  ok(deck().b === "techno", "what's on the air already isn't loaded again");
  advance(310);
  g("p3", "vote", { style: "jazz" });
  ok(deck().votes.p3 === "house", "a style that isn't one of the 12 is ignored");
  ok(dv("p1").mix.weights.house === 1 && !dv("p1").mix.weights.latin, "the fader on A: the mix is all house");

  // the fader: whoever moves it holds it
  const f = g("p2", "fader", { value: 0.3 });
  ok(f.light && deck().fader === 0.3 && deck().faderBy === "p2", "the fader moves, light, and says who has it");
  ok(dv("p1").mix.weights.house === 0.7 && dv("p1").mix.weights.techno === 0.3, "the mix follows it");
  g("p3", "fader", { value: 0.9 });
  ok(deck().fader === 0.3, "someone else waits while it's held");
  advance(1300);
  g("p3", "fader", { value: 0.75 });
  ok(deck().fader === 0.75 && deck().faderBy === "p3" && Object.keys(deck().votes).length === 0, "after a moment they can take it; past the middle B is on the air and the picks start over");
  g("p1", "vote", { style: "afro" });
  ok(deck().a === "afro" && deck().b === "techno", "now a pick goes on A, the deck off the air");
  advance(1300);
  g("p3", "fader", { value: 0.2 });
  ok(deck().fader === 0.2 && Object.keys(deck().votes).length === 0, "back past the middle: A on the air (afro), picks start over");
  g("p2", "vote", { style: "bass" });
  ok(deck().b === "bass", "and the next pick loads B");

  // the speaker says what its decks really sound (a new style waits for its next section)
  ok(cued(deck()) === null && loaded(deck()) === "b", "B has the pick loaded, but the speaker hasn't said it plays it yet");
  ok(e.screenAct("tv-bd", { x: "decks", a: "afro", b: "bass" }) && cued(deck()) === "b", "once it does, B is cued");
  ok(!e.screenAct("tv-bd", { x: "decks", a: "afro", b: "bass" }) && !e.screenAct("tv-bd", { x: "decks", a: "afro", b: "polka" }), "the same again, or a style that isn't one, is nothing");
  e.flush();

  // the build-up: taps add up a few times a second, never faster than a quarter a second
  advance(1300);
  const quiet = g("p1", "charge", { n: 5 });
  ok(quiet.light && deck().charge > 0 && deck().charge <= 0.25, "taps fill the build-up, light");
  const held = g("p2", "charge", { n: 8 });
  ok(!held.light && !held.changed, "taps within 200 ms wait, sent with the next");
  const c0 = deck().charge;
  advance(210);
  g("p3", "charge", { n: 8 });
  const c1 = deck().charge;
  ok(Math.abs(c1 - c0 - 0.25 * 0.21) < 1e-9, "the waiting taps go in with the next, no faster than a quarter a second");
  g("p1", "charge", { n: 3 });
  advance(250);
  const nudge = g("p1", "charge", { n: 0 });
  ok(nudge.light && deck().charge > c1, "a phone's last word (0 taps) adds what was waiting");
  advance(3000);
  g("p1", "charge", { n: 1 });
  ok(deck().charge < c1 + 0.03, "left alone it falls back after a moment");
  // fill it
  let armedWith: ReturnType<typeof g> | null = null;
  for (let i = 0; i < 30 && !deck().drop; i++) {
    advance(250);
    armedWith = g(`p${(i % 3) + 1}`, "charge", { n: 8 });
  }
  const dr = deck().drop!;
  ok(!!dr && deck().charge === 1 && dr.hits.length === 0 && !dr.auto, "full: a drop is on its way");
  ok(armedWith?.changed === true, "the tap that fills it is a real change: stored, with the drop's timer");
  const beatNow = (clock - deck().grid!.at) / beat;
  ok(dr.bar % 2 === 0 && dr.bar * 4 >= beatNow + 17 && dr.bar * 4 < beatNow + 17 + 8, "it lands on the next 2-bar line that leaves room for the whole count (8, 7 … 1 two beats each, then DROP: 17 beats)");
  ok(countdown(dr, deck().grid, dr.at - 17 * beat + 1) === "8" && countdown(dr, deck().grid, dr.at - 15 * beat + 1) === "7" && countdown(dr, deck().grid, dr.at - 2 * beat) === "1" && countdown(dr, deck().grid, dr.cue + 1) === "drop" && countdown(dr, deck().grid, dr.at - 17 * beat - 1) === null, "the count: 8 at 17 beats out, 7 two beats on, 1, then DROP on the cue's beat");
  ok(dr.at === deck().grid!.at + dr.bar * 4 * beat && dr.cue === dr.at - beat, "at that bar's time, the cue a beat before");
  ok(dr.to === "b", "B has a new style loaded: the drop swaps to it");
  g("p1", "charge", { n: 8 });
  ok(deck().drop?.bar === dr.bar, "more taps don't move it");
  advance(700);
  g("p3", "pad", { pad: "brake" });
  ok(deck().pads[deck().pads.length - 1].pad !== "brake" || deck().pads.filter((x) => x.pad === "brake").length === 1, "no brake while a drop is on its way");
  advance(600);
  g("p2", "pad", { pad: "scratch" });
  ok(!deck().pads.some((x) => x.pad === "scratch"), "no scratch either");

  // the speaker's clock drifts a little mid-countdown: the same bar, its time corrected, presses kept
  advance(1100);
  const was = deck().drop!;
  ok(e.screenAct("tv-bd", { x: "grid", at: deck().grid!.at + 30, bar: deck().grid!.bar, bpm: 125 }), "the speaker's bars, 30 ms later");
  e.flush();
  const after = deck().drop!;
  ok(after.bar === was.bar && after.at === was.at + 30 && after.cue === was.cue + 30, "the drop keeps its bar, 30 ms later too");
  ok(!e.screenAct("tv-other", { x: "grid", at: clock, bar: 5000, bpm: 64 }) && deck().grid!.bpm === 125, "another screen can't move the bars");
  ok(!e.screenAct("tv-bd", { x: "grid", at: deck().grid!.at + 60, bar: deck().grid!.bar, bpm: 125 }), "nor the speaker itself more than once a second");
  const dr2 = deck().drop!;

  // DROP: too early, on the cue, good, too late
  clock = dr2.at - 5 * beat;
  g("p1", "drop", { c: clock });
  ok(deck().drop!.hits.length === 0, "before the count gets to 1 it doesn't count");
  clock = dr2.cue + 60;
  const hit = g("p2", "drop", { c: dr2.cue + 40 });
  ok(hit.light && deck().drop!.hits[0]?.pid === "p2" && deck().drop!.hits[0].grade === "perfect", "on the cue (40 ms off): perfect");
  ok(events.some((x) => x.k === "fx" && x.fx === "drop" && x.pid === "p2" && x.data?.[0] === 1), "the room hears it, perfect");
  g("p2", "drop", { c: clock });
  ok(deck().drop!.hits.length === 1, "once a phone");
  clock = dr2.at - 2.5 * beat;
  g("p3", "drop", { c: dr2.at - 2.6 * beat });
  ok(deck().drop!.hits[1]?.grade === "good", "on the count's 1: good");
  clock = dr2.at - 100;
  g("p1", "drop", { c: clock });
  ok(deck().drop!.hits.length === 2, "too close to the bar for the speaker: it doesn't count");
  clock = dr2.at - 10;
  g("p1", "drop", { c: clock + 5000 });
  ok(deck().drop!.hits.length === 2, "a phone's clock can't make a late press early");

  // it lands
  advance(20);
  let last = deck().last!;
  ok(!deck().drop && last.bar === dr2.bar && last.hits.length === 2 && !last.auto && last.to === "b" && last.style === "bass", "at the bar it lands on deck B, with who pressed");
  ok(deck().fader === 1 && deck().charge === 0 && Object.keys(deck().votes).length === 0 && deck().perfects.p2 === 1, "the fader jumps to B, the build-up and the picks start over, a perfect is counted");
  ok(dv("p1").mix.weights.bass === 1, "the mix is the new deck");

  // nobody presses: another countdown 4 bars on, then the DJ drops it
  for (let i = 0; i < 30 && !deck().drop; i++) {
    advance(250);
    g(`p${(i % 3) + 1}`, "charge", { n: 8 });
  }
  const d2 = deck().drop!;
  ok(d2.to === "b", "nothing new loaded: the drop stays on the deck that's on");
  advance(d2.at - clock + 5);
  const d3 = deck().drop!;
  ok(d3 && d3.misses === 1 && d3.bar === d2.bar + 6 && d3.at === d2.at + 24 * beat && d3.auto, "nobody pressed: another whole countdown (the next 2-bar line 17 beats on), and this time the DJ will drop it");
  advance(d3.at - clock + 5);
  last = deck().last!;
  ok(!deck().drop && last.auto && last.hits.length === 0, "and does");

  // the speaker's bars move while a drop counts down: it counts down to the new ones
  for (let i = 0; i < 30 && !deck().drop; i++) {
    advance(250);
    g(`p${(i % 3) + 1}`, "charge", { n: 8 });
  }
  e.screenAct("tv-bd", { x: "grid", at: clock + 100, bar: 1000, bpm: 125 });
  e.flush();
  const d5 = deck().drop!;
  ok(d5.bar % 2 === 0 && d5.bar >= 1000 && d5.at === clock + 100 + (d5.bar - 1000) * 4 * beat && d5.at - clock >= 17 * beat, "a new stream's bars: the drop is aimed at them, a whole count away");

  // the end of the set: nothing on its way; another set keeps the decks and the perfects
  g("p1", "phase", { phase: "end" });
  ok(!deck().drop && deck().charge === 0, "the set ends: no drop on its way");
  g("p1", "again");
  ok(deck().a === "afro" && deck().b === "bass" && deck().perfects.p2 === 1 && deck().pads.length === 0, "another set keeps the decks and the perfect drops");
  g("p1", "fader", { value: 0.5 });
  ok(deck().fader === 1, "no fader before the music");
});

test("dj: the beginner deck: picks wait for a drop; one screen speaks, said again until the room has it; corrections keep a drop; turned-away words cost nothing", () => {
  const e = new RoomEngine(freshRoom("DJBE", clock), host);
  e.screenHello("tv-a", true, "dj");
  e.screenHello("tv-b", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
  ])
    e.hello(p, n, false);
  e.flush();
  const deck = () => (e.view("p2").game as V<"dj">).deck;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    return e.flush();
  };
  const sc = (sid: string, x: string, rest: Record<string, unknown> = {}) => {
    const took = e.screenAct(sid, { x, ...rest });
    e.flush();
    return took;
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    e.flush();
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;

  // turned away: nothing to send or store
  ok(nothing(g("p1", "knob", { style: "polka", value: 1 })) && nothing(g("p1", "knob", { style: "house", value: 0 })), "a knob that isn't one, or one turned to where it already is, costs nothing");
  ok(nothing(g("p1", "ask", { text: "x" })) && nothing(g("p1", "unask", { id: "nope" })), "a song too short, or taking back one that isn't there, costs nothing");
  sc("tv-a", "live", { source: "fake" });
  g("p1", "fire");
  ok(nothing(g("p1", "fire")), "a 🔥 too soon after the last costs nothing");

  // one screen speaks for the speaker: the one giving the bars, while it keeps saying them
  ok(sc("tv-a", "grid", { at: clock, bar: 0, bpm: 125 }), "the speaker gives the bars");
  advance(40_000);
  ok(!sc("tv-a", "grid", { at: clock - 40_000, bar: 0, bpm: 125 }), "40 s on, the same bars again: nothing new (it shows it's still there)");
  ok(!sc("tv-b", "grid", { at: clock, bar: 7, bpm: 125 }) && !sc("tv-b", "decks", { a: "house", b: null }) && !sc("tv-b", "src", { source: "lyria" }), "another screen can't speak for it, however long since the bars last moved");
  ok(sc("tv-a", "decks", { a: "house", b: null }) && deck().sounding?.b === null, "the speaker says what its decks sound");
  ok(!sc("tv-a", "decks", { a: "house", b: "latin" }), "and at most once a second");
  advance(1000);
  ok(sc("tv-a", "decks", { a: "house", b: "latin" }) && deck().sounding?.b === "latin", "a second later it's taken");
  ok(sc("tv-a", "src", { source: "lyria" }) && !sc("tv-a", "src", { source: "fake" }), "the source too: once a second");
  advance(1000);
  ok(sc("tv-a", "src", { source: "fake" }), "then again");
  advance(31_000);
  ok(sc("tv-b", "grid", { at: clock, bar: 9, bpm: 125 }) && !sc("tv-a", "grid", { at: clock, bar: 0, bpm: 125 }), "the speaker quiet for 30 s: another screen can take over (and then it speaks)");

  // picks wait while a drop is on its way: it lands on the deck the floor had cued
  advance(1000);
  sc("tv-b", "grid", { at: clock, bar: 0, bpm: 125 });
  g("p1", "vote", { style: "latin" });
  advance(1000);
  sc("tv-b", "decks", { a: "house", b: "latin" });
  ok(cued(deck()) === "b", "latin loaded on B, and the speaker plays it there");
  for (let i = 0; i < 30 && !deck().drop; i++) {
    advance(250);
    g(`p${(i % 2) + 1}`, "charge", { n: 8 });
  }
  const dr = deck().drop!;
  ok(!!dr && dr.to === "b", "a drop on its way, to B");
  const pick = g("p2", "vote", { style: "techno" });
  ok(nothing(pick) && deck().b === "latin" && !deck().votes.p2, "a pick in the countdown waits: B stays latin");

  // a correction moments before it lands leaves the drop where it is, presses and all
  clock = dr.cue + 20;
  g("p2", "drop", { c: clock });
  ok(deck().drop!.hits.length === 1, "Ben pressed on the cue");
  clock = dr.cue + 260;
  g("p1", "drop", { c: clock });
  ok(deck().drop!.hits[1]?.pid === "p1" && deck().drop!.hits[1].grade === "good", "Amy a quarter second after the cue (she saw DROP, then pressed): it counts, good");
  ok(pressBy(dr) === dr.at - 200 && pressBy(dr) - dr.cue === 280, "a phone's press counts until 280 ms after the cue (80 ms to reach the room, 120 ms before the bar)");
  clock = dr.at - 100;
  ok(sc("tv-b", "grid", { at: deck().grid!.at + 40, bar: deck().grid!.bar, bpm: 125 }), "the bars, 40 ms later, 100 ms before the drop");
  ok(deck().drop!.at === dr.at && deck().drop!.bar === dr.bar && deck().drop!.hits.length === 2, "the drop stays where it is, with its presses");
  advance(150);
  const last = deck().last!;
  ok(!deck().drop && last.bar === dr.bar && last.to === "b" && last.style === "latin" && last.hits.length === 2, "and lands on latin");
});

test("dj: songs asked for by name: up next on the deck off the air, the drop plays its remix, the DJ drops it itself; a typed name shows only to its player", () => {
  const e = new RoomEngine(freshRoom("DJRQ", clock), host);
  const events: RoomEvent[] = [];
  e.screenHello("tv-rq", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
    ["p3", "Cat"],
    ["p4", "Dan"],
  ])
    e.hello(p, n, false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const deck = () => dv("p4").deck;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    const o = e.flush();
    events.push(...o.events);
    return o;
  };
  const sc = (x: string, rest: Record<string, unknown> = {}) => {
    const took = e.screenAct("tv-rq", { x, ...rest });
    events.push(...e.flush().events);
    return took;
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    events.push(...e.flush().events);
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  const sunny = SONG_ROWS.find((r) => r[1] === "晴天" && r[2] === "周杰伦")!;
  const humble = SONG_ROWS.find((r) => r[1] === "HUMBLE.")!;
  const beat = 480;

  // before the music: asked for, waiting
  g("p2", "req", { text: "qing tian", song: sunny[0] });
  let r = deck().reqs[0];
  ok(deck().reqs.length === 1 && r.by === "p2" && r.text === "晴天" && r.artist === "周杰伦" && r.song === sunny[0] && r.style === "cpop" && r.track === trackFor("晴天"), "a song picked from the song list: its title and artist (the list's, not what was typed), in its style (Jay Chou: C-pop), its remix's track from its name");
  ok(r.p === undefined && r.yt === undefined, "no clip of it, no video (the phone found none): the remix alone");
  ok(events.some((x) => x.k === "fx" && x.fx === "req" && x.pid === "p2") && deck().up === null, "the room hears it; nothing is up before the music");
  ok(nothing(g("p2", "req", { text: "another" })), "a phone asks at most once every 5 seconds");
  ok(nothing(g("p3", "req", { text: "   " })) && nothing(g("p3", "req", {})), "an empty name isn't a song");
  g("p3", "req", { text: "  reggaeton para\nmi prima‮ ", song: 12 });
  r = deck().reqs[1];
  ok(r.by === "p3" && r.song === undefined && r.style === "latin" && r.text === null, "a name typed in (a number that isn't on the list is ignored): its style from its words; another phone doesn't read it");
  ok(dv("p3").deck.reqs[1].text === "reggaeton para mi prima" && dv("p1").deck.reqs[1].text === "reggaeton para mi prima", "its player reads it, on one line without the invisible characters, and so does the host");
  ok((e.view("tv-rq").game as V<"dj">).deck.reqs[1].text === null && (e.view("tv-rq").game as V<"dj">).deck.reqs[0].text === "晴天", "the big screen shows the listed song by name, the typed one as a song asked for");
  ok(!("reqAt" in deck()), "the room's bookkeeping stays in the room");
  advance(6000);
  g("p4", "req", { text: "流".repeat(80) });
  ok(Array.from(dv("p4").deck.reqs[2].text ?? "").length === 60, "a typed name is cut at 60 characters");
  g("p4", "unreq", { id: dv("p4").deck.reqs[2].id });
  ok(deck().reqs.length === 2, "and taken back");
  ok(nothing(g("p4", "req", { text: "again" })), "a phone asks at most once every 5 seconds");

  // the music starts: the oldest goes on the deck off the air
  sc("live", { source: "fake" });
  sc("grid", { at: clock, bar: 0, bpm: 125 });
  ok(deck().up?.text === "晴天" && deck().b === "cpop" && deck().reqs.length === 1, "the music starts: 晴天 is up next, C-pop on deck B (off the air)");
  ok(dv("p1").mix.weights.house === 1, "the fader is still on A");
  const pick = g("p1", "vote", { style: "techno" });
  ok(nothing(pick) && deck().b === "cpop", "the picks wait for it");
  ok(loaded(deck()) === "b" && cued(deck()) === null, "loaded on B; cued once the speaker plays it there");
  advance(1000);
  sc("decks", { a: "house", b: "cpop" });
  ok(cued(deck()) === "b", "now it does");

  // the table drops into it
  for (let i = 0; i < 30 && !deck().drop; i++) {
    advance(250);
    g(`p${(i % 3) + 1}`, "charge", { n: 8 });
  }
  const dr = deck().drop!;
  ok(dr.to === "b" && !dr.auto, "the build-up full: the drop goes to B");
  clock = dr.cue + 20;
  g("p1", "drop", { c: clock });
  advance(dr.at - clock + 5);
  ok(deck().last?.to === "b" && deck().now?.text === "晴天" && deck().now?.by === "p2", "it lands: 晴天's remix is on the air, named for Ben");
  ok(deck().up?.by === "p3" && deck().a === "latin" && deck().fader === 1, "the next one asked for goes on the deck now off the air (A): latin");

  // nobody drops into it: the DJ does, 40 s on, once A really plays it
  advance(40_000);
  ok(!deck().drop, "40 s on, but A isn't playing latin yet: it waits");
  advance(1000);
  sc("decks", { a: "latin", b: "cpop" });
  advance(5000);
  const auto = deck().drop!;
  ok(auto && auto.auto && auto.to === "a" && auto.hits.length === 0 && deck().charge === 1, "then the DJ starts the countdown into it itself");
  clock = auto.cue + 30;
  g("p4", "drop", { c: clock });
  ok(deck().drop!.hits[0]?.pid === "p4", "anyone can still press DROP for a grade");
  advance(auto.at - clock + 5);
  ok(deck().last?.to === "a" && deck().now?.by === "p3" && deck().up === null && deck().reqs.length === 0, "it lands on A: Cat's song plays, nothing waiting");
  ok(!nothing(g("p1", "vote", { style: "techno" })) && deck().b === "techno", "with nothing up the picks are back");
  advance(DECK.reqPlayMs + 10);
  ok(deck().now === null, "the screens name the remix for a minute and a half");

  // taking back, and the host
  advance(6000);
  g("p2", "req", { song: humble[0] });
  ok(deck().up?.text === "HUMBLE." && deck().up?.style === "hiphop" && deck().b === "hiphop", "Kendrick Lamar: hip-hop, straight up next on B (it replaces the pick)");
  g("p3", "req", { song: sunny[0] });
  ok(nothing(g("p3", "unreq", { id: deck().up!.id })), "only its player or the host takes one back");
  g("p2", "unreq", { id: deck().up!.id });
  ok(deck().up?.by === "p3" && deck().up?.text === "晴天" && deck().reqs.length === 0, "Ben takes his back: the next one comes up");
  g("p1", "unreq", { id: deck().up!.id });
  ok(deck().up === null, "the host can take back anyone's");

  // the fader across the middle plays it too
  advance(6000);
  g("p4", "req", { song: sunny[0] });
  ok(deck().up?.by === "p4" && deck().b === "cpop", "Dan's 晴天 up next on B");
  advance(1300);
  g("p2", "fader", { value: 0.8 });
  ok(deck().now?.by === "p4" && deck().up === null && Object.keys(deck().votes).length === 0, "Ben slides the fader over: it plays now");
  advance(1300);
  g("p2", "fader", { value: 0.1 });
  ok(deck().now === null, "and back: it's off the air");

  // up to 8 waiting; the end of the set keeps them for the next
  for (const [i, pid] of ["p1", "p2", "p3"].entries()) {
    advance(6000);
    g(pid, "req", { text: `song ${i}` });
  }
  ok(deck().up?.by === "p1" && deck().reqs.length === 2, "one up next, two waiting");
  g("p1", "phase", { phase: "end" });
  ok(deck().up === null && deck().now === null && deck().reqs.length === 3 && deck().reqs[0].by === "p1", "the set ends: the one up next goes back to the front of the line");
  ok(nothing(g("p4", "req", { text: "late" })), "no asking after the end");
  g("p1", "again");
  ok(deck().reqs.length === 3 && deck().up === null, "another set keeps them");
  sc("live", { source: "fake" });
  ok(deck().up?.by === "p1" && deck().reqs.length === 2, "and its music starts with the first");
  const e2 = new RoomEngine(freshRoom("DJRM", clock), host);
  e2.screenHello("tv-m", true, "dj");
  // (a full table, 15, three each would be 45)
  for (let i = 1; i <= 15; i++) e2.hello(`q${i}`, `Q${i}`, false);
  e2.flush();
  for (let round = 0; round < 3; round++) {
    for (let i = 1; i <= 15; i++) {
      e2.act(`q${i}`, { a: "g", g: { x: "req", text: `song ${i} ${round}` } });
      e2.flush();
    }
    clock += 6000;
    e2.due();
    e2.flush();
  }
  ok((e2.view("q1").game as V<"dj">).deck.reqs.length === DECK.reqMax, `${DECK.reqMax} waiting at most, the whole table`);
  void beat;
});

test("dj: a song found on YouTube: every field checked, its name only for its player and the host, played whole on the big screen, the deck waiting", () => {
  const e = new RoomEngine(freshRoom("DJYT", clock), host);
  e.screenHello("tv-yt", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
    ["p3", "Cat"],
  ])
    e.hello(p, n, false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    return e.flush();
  };
  const sc = (x: string, rest: Record<string, unknown> = {}) => {
    const took = e.screenAct("tv-yt", { x, ...rest });
    e.flush();
    return took;
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    e.flush();
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  const ID = "kJQP7kiw5Fk";
  ok(nothing(g("p2", "req", { yt: ["not-an-id", "Song", "Chan"] })) && nothing(g("p2", "req", { yt: [ID, "  ", "Chan"] })) && nothing(g("p2", "req", { yt: [ID, "Song"] })), "a video id that isn't one, no title, or not every field: not taken");
  ok(nothing(g("p2", "req", { apple: [1, "Song", "Singer", "x", "us"] })), "Apple's songs aren't taken any more");
  g("p2", "req", { yt: [ID, "Despacito‮", "Luis Fonsi"] });
  const r = dv("p2").deck.reqs[0];
  ok(r.text === "Despacito" && r.artist === "Luis Fonsi" && r.yt === ID && r.ytT === "Despacito" && r.p === undefined, "a song found on YouTube: its title (cleaned), channel and video");
  ok(r.style === styleForRequest("Despacito Luis Fonsi"), `in a style from its title and channel (${r.style})`);
  const other = dv("p3").deck.reqs[0];
  ok(other.text === null && other.artist === undefined && other.ytT === undefined && other.yt === ID, "another phone reads neither its title nor its channel (the video is the big screen's to play)");
  ok(dv("p1").deck.reqs[0].text === "Despacito", "the host reads it");
  // the drop into it: the song plays whole from the drop's bar, the deck waiting
  sc("live", { source: "fake" });
  sc("grid", { at: clock, bar: 0, bpm: 125 });
  ok(dv("p1").deck.up?.yt === ID, "up next");
  advance(1000);
  sc("decks", { a: "house", b: dv("p1").deck.b });
  for (let i = 0; i < 40 && !dv("p1").deck.drop; i++) {
    advance(250);
    g(`p${(i % 3) + 1}`, "charge", { n: 8 });
  }
  const dr = dv("p1").deck.drop!;
  clock = dr.cue + 20;
  g("p1", "drop", { c: clock });
  advance(dr.at - clock + 5);
  const song = dv("p1").deck.song;
  ok(!!song && song.yt === ID && song.by === "p2" && song.at === clock, "it lands: the whole song plays from the drop's bar (the big screen has it ready, the DJ lets go with the boom)");
  ok(nothing(g("p1", "charge", { n: 8 })) && nothing(g("p1", "pad", { pad: "echo" })) && nothing(g("p1", "pad", { pad: "brake" })) && nothing(g("p1", "fader", { value: 0.3 })), "while it plays the deck waits: no build-up, no fader, none of the pads that work the music");
  ok(!nothing(g("p1", "pad", { pad: "horn" })) && !nothing(g("p2", "pad", { pad: "siren" })), "but the pads that are a sound of their own play over it (Steve: the effects to hype the floor)");
  ok(nothing(g("p3", "songskip")), "only its player or the host can skip it");
  ok(!sc("songdone", { id: "other" }), "the big screen's word for another song: not taken");
  ok(sc("songdone", { id: song!.id }) && dv("p1").deck.song === null, "the big screen says it ended: the DJ comes back");
  // and the time limit, and a skip
  g("p3", "req", { yt: ["abcdefghijk", "Another", "Chan"] });
  ok(dv("p1").deck.up?.yt === "abcdefghijk", "the next one is up");
  advance(41_000);
  sc("decks", { a: dv("p1").deck.a, b: dv("p1").deck.b });
  advance(6000);
  const auto = dv("p1").deck.drop;
  ok(!!auto, "nobody drops into it: the DJ does");
  advance(auto!.at - clock + 5);
  ok(dv("p1").deck.song?.by === "p3", "it plays whole");
  ok(!nothing(g("p3", "songskip")) && dv("p1").deck.song === null, "its player skips it: the DJ comes back");
  // a video YouTube won't play here: the big screen finds out while getting it ready
  advance(6000);
  g("p2", "req", { yt: ["zyxwvutsrqp", "Gone song", "Chan"] });
  const dead = dv("p1").deck.up;
  ok(dead?.yt === "zyxwvutsrqp", "Ben's next is up, with its video");
  ok(!e.screenAct("tv-other", { x: "nosong", id: dead!.id }), "another screen can't take it off");
  ok(!sc("nosong", { id: "someone-else" }), "nor a word about a song that isn't up next");
  ok(sc("nosong", { id: dead!.id }), "the speaker's word that it won't play is taken");
  const stripped = dv("p2").deck.up;
  ok(stripped?.id === dead!.id && stripped.yt === undefined && stripped.ytT === undefined && stripped.ytNo === true, "the video comes off it, and its player's phone can say why");
  ok(!sc("nosong", { id: dead!.id }), "said again: nothing more to do");
  advance(70_000);
  sc("decks", { a: dv("p1").deck.a, b: dv("p1").deck.b });
  advance(6000);
  const plain = dv("p1").deck.drop;
  ok(!!plain, "the DJ drops into it");
  advance(plain!.at - clock + 5);
  ok(dv("p1").deck.now?.id === dead!.id && dv("p1").deck.song === null, "it lands as the DJ's remix alone: no whole song to wait for");
});

test("dj: 点歌模式 (the jukebox): the host's switch; no build-up, DROP or picks; the songs asked for one after another, the DJ a few seconds between them; the video over the whole TV on anyone's word", () => {
  const e = new RoomEngine(freshRoom("DJJK", clock), host);
  e.screenHello("tv-jk", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
    ["p3", "Cat"],
  ])
    e.hello(p, n, false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    return e.flush();
  };
  const sc = (x: string, rest: Record<string, unknown> = {}) => {
    const took = e.screenAct("tv-jk", { x, ...rest });
    e.flush();
    return took;
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    e.flush();
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  sc("live", { source: "fake" });
  sc("grid", { at: clock, bar: 0, bpm: 125 });
  ok(dv("p2").juke === false && dv("p2").full === false, "off to start with: the deck as it was, the video in its corner");
  ok(nothing(g("p2", "juke", { on: true })), "only the host switches to 点歌模式");
  ok(!nothing(g("p1", "juke", { on: true })) && dv("p3").juke === true, "the host does, and every phone reads it");
  ok(nothing(g("p1", "juke", { on: true })), "switched on again: nothing more to do");
  ok(nothing(g("p2", "charge", { n: 8 })), "no build-up in 点歌模式");
  ok(nothing(g("p3", "vote", { style: "techno" })), "nor picks");
  // a song asked for, nothing else playing: it starts a few seconds on, with no countdown to press
  g("p2", "req", { yt: ["kJQP7kiw5Fk", "Despacito", "Luis Fonsi"] });
  ok(dv("p1").deck.up?.by === "p2", "Ben's song is up next");
  advance(DECK.jukeWaitMs + 10);
  const sw = dv("p1").deck.drop;
  ok(!!sw && sw.quiet === true && sw.auto === true, "a moment later the switch into it is on its way, without the DJ's deck having the style yet (the song plays whole)");
  const beat = 60_000 / 125;
  ok(!!sw && sw.at - clock >= (DECK.jukeBeats - 0.01) * beat && sw.at - clock <= (DECK.jukeBeats + 4) * beat, `on the first bar ${DECK.jukeBeats} beats on (${Math.round(sw!.at - clock)} ms)`);
  ok(dv("p1").deck.charge === 0, "the build-up stays empty");
  clock = sw!.cue + 10;
  ok(nothing(g("p3", "drop", { c: clock })), "DROP doesn't count on it");
  advance(sw!.at - clock + 5);
  const song = dv("p1").deck.song;
  ok(song?.by === "p2" && song.yt === "kJQP7kiw5Fk" && dv("p1").deck.last?.quiet === true && dv("p1").deck.last?.hits.length === 0, "on its bar the song plays whole, a quiet switch (no boom, no party)");
  // the next one, asked for while it plays, follows a few seconds after it ends
  g("p3", "req", { yt: ["abcdefghijk", "Another", "Chan"] });
  ok(dv("p1").deck.up?.by === "p3" && dv("p1").deck.drop === null, "Cat's is up next, waiting for Ben's to end");
  advance(30_000);
  ok(dv("p1").deck.drop === null && dv("p1").deck.song?.by === "p2", "nothing cuts Ben's song short");
  ok(sc("songdone", { id: song!.id }) && dv("p1").deck.song === null, "it ends: the DJ comes back");
  advance(DECK.jukeGapMs + 10);
  const sw2 = dv("p1").deck.drop;
  ok(!!sw2 && sw2.quiet === true, "a second later the switch into Cat's is on its way");
  advance(sw2!.at - clock + 5);
  ok(dv("p1").deck.song?.by === "p3", "and it plays");
  // the video over the whole TV: anyone's word, back in its corner the same way
  ok(!nothing(g("p2", "full", { on: true })) && dv("p1").full === true && dv("p3").full === true, "Ben puts the video over the whole TV");
  ok(nothing(g("p3", "full", { on: true })), "asked again: nothing more to do");
  ok(!nothing(g("p3", "full", { on: false })) && dv("p1").full === false, "Cat puts it back in its corner");
  // back to the deck as it was: a song up next waits for the table's drop again
  ok(sc("songdone", { id: dv("p1").deck.song!.id }) && dv("p1").deck.song === null, "Cat's ends, nothing else asked for: the DJ plays on");
  advance(DECK.jukeGapMs + 10);
  ok(dv("p1").deck.drop === null, "and no switch is on its way");
  ok(!nothing(g("p1", "juke", { on: false })) && dv("p2").juke === false, "the host switches back");
  g("p2", "req", { yt: ["zyxwvutsrqp", "Third", "Chan"] });
  advance(DECK.jukeWaitMs + 10);
  ok(dv("p1").deck.up?.by === "p2" && dv("p1").deck.drop === null, "a song up next waits for the table's build-up and DROP again");
  ok(!nothing(g("p2", "charge", { n: 8 })), "and the build-up takes taps again");
  // a new set keeps the host's choice
  g("p1", "juke", { on: true });
  g("p1", "phase", { phase: "end" });
  g("p1", "again");
  ok(dv("p2").juke === true && dv("p2").full === false, "another set: still 点歌模式, the video back in its corner");
});

test("dj: the 歌单 (playlist): three songs each, thirty in all; the host's 随机 or 按顺序; after a whole song the DJ plays a minute before the next", () => {
  const room = (code: string) => {
    const e = new RoomEngine(freshRoom(code, clock), host);
    e.screenHello(`tv-${code}`, true, "dj");
    for (const [p, n] of [
      ["p1", "Amy"],
      ["p2", "Ben"],
      ["p3", "Cat"],
      ["p4", "Dan"],
    ])
      e.hello(p, n, false);
    e.flush();
    const dv = (pid: string) => e.view(pid).game as V<"dj">;
    const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
      e.act(pid, { a: "g", g: { x, ...rest } });
      return e.flush();
    };
    const sc = (x: string, rest: Record<string, unknown> = {}) => {
      const took = e.screenAct(`tv-${code}`, { x, ...rest });
      e.flush();
      return took;
    };
    const advance = (ms: number) => {
      clock += ms;
      e.due();
      e.flush();
    };
    return { e, dv, g, sc, advance };
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  const { dv, g, sc, advance } = room("DJPL");
  for (const k of [1, 2, 3]) {
    g("p2", "req", { text: `song ${k} for ben` });
    advance(6000);
  }
  ok(dv("p2").deck.reqs.filter((r) => r.by === "p2").length === 3, "Ben puts three songs on the playlist");
  ok(nothing(g("p2", "req", { text: "song four" })), "a fourth waits till one has played");
  ok(DECK.reqEach === 3 && DECK.reqMax === 30, "three each, thirty in all");
  // the host's switch
  ok(nothing(g("p2", "shuffle", { on: true })) && dv("p1").shuffle === false, "only the host switches 随机: it starts 按顺序");
  ok(!nothing(g("p1", "shuffle", { on: true })) && dv("p3").shuffle === true, "the host turns 随机 on: every phone sees it");
  ok(nothing(g("p1", "shuffle", { on: true })), "on again: nothing");
  g("p1", "shuffle", { on: false });
  // in order: the oldest goes up first
  g("p3", "req", { text: "cat's one" });
  advance(6000);
  sc("live", { source: "fake" });
  sc("grid", { at: clock, bar: 0, bpm: 125 });
  ok(dv("p2").deck.up?.text === "song 1 for ben", "按顺序: the first asked for is up first");

  // 随机: any of the waiting ones (over many rooms, not always the first)
  const firsts = new Set<string>();
  for (let k = 0; k < 24; k++) {
    const r = room(`DJS${k}`);
    r.g("p1", "shuffle", { on: true });
    for (const p of ["p2", "p3", "p4"]) r.g(p, "req", { text: `from ${p}` });
    r.advance(6000);
    r.sc("live", { source: "fake" });
    r.sc("grid", { at: clock, bar: 0, bpm: 125 });
    firsts.add(r.dv("p1").deck.up?.by ?? "none");
  }
  ok(firsts.size >= 2 && !firsts.has("none"), `随机: the first up is any of them (${[...firsts].join(", ")})`);

  // after a whole song, the DJ's turn: a minute before it drops into the next by itself
  const y = room("DJTN");
  y.g("p2", "req", { yt: ["kJQP7kiw5Fk", "Despacito", "Luis Fonsi"] });
  y.advance(6000);
  y.g("p3", "req", { yt: ["abcdefghijk", "Another", "Chan"] });
  y.sc("live", { source: "fake" });
  y.sc("grid", { at: clock, bar: 0, bpm: 125 });
  y.advance(1000);
  y.sc("decks", { a: "house", b: y.dv("p1").deck.b });
  for (let i = 0; i < 40 && !y.dv("p1").deck.drop; i++) {
    y.advance(250);
    y.g(`p${(i % 3) + 1}`, "charge", { n: 8 });
  }
  const dr = y.dv("p1").deck.drop!;
  clock = dr.cue + 20;
  y.g("p1", "drop", { c: clock });
  y.advance(dr.at - clock + 5);
  const song = y.dv("p1").deck.song!;
  ok(song.by === "p2" && y.dv("p1").deck.up?.by === "p3", "Ben's song plays whole, Cat's is up next");
  y.sc("decks", { a: y.dv("p1").deck.a, b: y.dv("p1").deck.b });
  y.advance(30_000);
  ok(!y.dv("p1").deck.drop, "the DJ doesn't drop into Cat's while Ben's plays");
  y.sc("songdone", { id: song.id });
  y.advance(55_000);
  y.sc("decks", { a: y.dv("p1").deck.a, b: y.dv("p1").deck.b });
  ok(y.dv("p1").deck.song === null && !y.dv("p1").deck.drop, "Ben's ended: the DJ plays (55 s on, no drop yet)");
  y.advance(10_000);
  ok(!!y.dv("p1").deck.drop?.auto, "a minute on, the DJ drops into Cat's itself");
});

test("dj: the mixer (混音台): knobs anyone turns (held a moment by whoever moved one), effects on the next beat that go off by themselves, the drop whole", () => {
  const e = new RoomEngine(freshRoom("DJMX", clock), host);
  const events: RoomEvent[] = [];
  e.screenHello("tv-mx", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
    ["p3", "Cat"],
  ])
    e.hello(p, n, false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const mx = () => dv("p3").deck.mixer;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    const o = e.flush();
    events.push(...o.events);
    return o;
  };
  const sc = (x: string, rest: Record<string, unknown> = {}) => {
    const took = e.screenAct("tv-mx", { x, ...rest });
    events.push(...e.flush().events);
    return took;
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    events.push(...e.flush().events);
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  ok(nothing(g("p1", "mix", { knob: "low", value: -1 })) && mx().knobs.low === 0, "before the music: nothing to mix");
  sc("live", { source: "fake" });
  sc("grid", { at: clock, bar: 0, bpm: 125 });
  const o = g("p1", "mix", { knob: "low", value: -1 });
  ok(o.light && !o.persist && mx().knobs.low === -1 && mx().knobBy.low === "p1", "Amy cuts the bass: sent at once, stored later (a knob turns many times a second)");
  ok(nothing(g("p2", "mix", { knob: "low", value: 0.5 })) && mx().knobs.low === -1, "Ben's turn of the same knob waits while she has it");
  g("p2", "mix", { knob: "filter", value: 0.33 });
  ok(mx().knobs.filter === 0.35, "another knob is his to turn (in steps of 0.05)");
  g("p2", "mix", { knob: "high", value: 7 });
  ok(mx().knobs.high === 1, "past the end: the end");
  ok(nothing(g("p2", "mix", { knob: "bass", value: 0 })) && nothing(g("p2", "mix", { knob: "mid", value: "loud" })), "a knob there isn't, a value that isn't one: nothing");
  advance(MIXER.holdMs + 100);
  g("p2", "mix", { knob: "low", value: 0.5 });
  ok(mx().knobs.low === 0.5 && mx().knobBy.low === "p2", "once she lets go, Ben has it");
  ok(!("mixAt" in dv("p1").deck), "the room's bookkeeping stays in the room");

  g("p3", "mixfx", { fx: "pump", on: true });
  ok(mx().fx.pump?.by === "p3", "Cat turns the pump on");
  const said = events.filter((x) => x.k === "fx" && x.fx === "mix");
  ok(said.length === 1 && said[0].k === "fx" && said[0].pid === "p3" && said[0].data?.[0] === MIX_FX.indexOf("pump") && said[0].data?.[1] === 1, "the screens hear who turned what on");
  ok(nothing(g("p3", "mixfx", { fx: "gate", on: true })), "a phone switches one at a time, a moment apart");
  ok(nothing(g("p1", "mixfx", { fx: "pump", on: true })), "on already: nothing");
  advance(3000);
  g("p1", "mixfx", { fx: "gate", on: true });
  g("p2", "mixfx", { fx: "crush", on: true });
  ok(!!mx().fx.gate && !!mx().fx.crush && !mx().fx.flange, "three on");
  advance(MIXER.fxGapMs + 10);
  g("p2", "mixfx", { fx: "crush", on: false });
  ok(!mx().fx.crush, "and off again");

  // the drop hits whole: the knobs back to 0, the effects on
  g("p1", "vote", { style: "latin" });
  advance(1000);
  sc("decks", { a: "house", b: "latin" });
  for (let i = 0; i < 30 && !dv("p1").deck.drop; i++) {
    advance(250);
    g(`p${(i % 3) + 1}`, "charge", { n: 8 });
  }
  const dr = dv("p1").deck.drop!;
  clock = dr.cue + 20;
  g("p1", "drop", { c: clock });
  advance(dr.at - clock + 5);
  ok(dv("p1").deck.last?.bar === dr.bar, "the drop lands");
  ok(Object.values(mx().knobs).every((v) => v === 0) && Object.keys(mx().knobBy).length === 0, "the knobs are back at 0 for it");
  ok(!!mx().fx.pump && !!mx().fx.gate, "the effects stay on");

  // the effects go off by themselves
  const pumpAt = mx().fx.pump!.at;
  clock = pumpAt + MIXER.fxMs - 50;
  e.due();
  e.flush();
  ok(!!mx().fx.pump, "just before its time: still on");
  advance(100);
  ok(!mx().fx.pump && !!mx().fx.gate, "32 bars after it went on, the pump goes off by itself (the gate, turned on later, after it)");
  advance(MIXER.fxMs);
  ok(Object.keys(mx().fx).length === 0, "and the gate");

  // everything back at once
  advance(1000);
  g("p3", "mix", { knob: "mid", value: -0.5 });
  g("p3", "mixfx", { fx: "flange", on: true });
  g("p2", "mixoff");
  ok(Object.values(mx().knobs).every((v) => v === 0) && Object.keys(mx().fx).length === 0, "the reset: every knob at 0, every effect off");
  ok(events.some((x) => x.k === "fx" && x.fx === "mix" && x.pid === "p2" && x.data?.[0] === -1), "the screens hear who reset it");
  ok(nothing(g("p1", "mixoff")), "as it plays already: nothing");
  g("p3", "mixfx", { fx: "flange", on: true });
  g("p1", "phase", { phase: "end" });
  ok(Object.keys(mx().fx).length === 0, "the end of the set: the mixer as the music plays");
});

test("dj: dancing along (跟着跳): each dancer's bars, late or twice turned away, the floor's combo and its fireworks", () => {
  const e = new RoomEngine(freshRoom("DJDN", clock), host);
  e.screenHello("tv-dn", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
  ])
    e.hello(p, n, false);
  e.flush();
  const events: RoomEvent[] = [];
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    const o = e.flush();
    events.push(...o.events);
    return o;
  };
  const sc = (x: string, rest: Record<string, unknown> = {}) => {
    e.screenAct("tv-dn", { x, ...rest });
    e.flush();
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    events.push(...e.flush().events);
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  const BAR = 1920;
  ok(nothing(g("p1", "dance", { bar: 0, n: 4, of: 4 })), "before the music: nothing to dance to");
  sc("live", { source: "fake" });
  const t0 = clock;
  sc("grid", { at: t0, bar: 0, bpm: 125 });
  ok(nothing(g("p1", "dance", { bar: 1, n: 4, of: 4 })), "a bar that hasn't come yet: turned away");
  ok(nothing(g("p1", "dance", { bar: 0, n: 5, of: 4 })) && nothing(g("p1", "dance", { bar: 0, n: 1, of: 9 })) && nothing(g("p1", "dance", { bar: 0.5, n: 1, of: 4 })), "counts that can't be: turned away");
  const o = g("p1", "dance", { bar: 0, n: 4, of: 4 });
  ok(o.light && !o.persist && dv("p2").dance.p1?.hits === 4 && dv("p2").dance.p1?.bars === 1 && dv("p2").dance.p1?.streak === 1, "Amy's first bar, all four beats: light, and everyone sees it");
  ok(nothing(g("p1", "dance", { bar: 0, n: 4, of: 4 })), "the same bar again: turned away");
  g("p2", "dance", { bar: 0, n: 1, of: 4 });
  ok(dv("p1").dance.p2?.streak === 0 && dv("p1").danceBar === undefined, "Ben's: one of four (no streak); the floor's count stays in the room");
  clock = t0 + 2 * BAR + 100;
  g("p1", "dance", { bar: 1, n: 4, of: 4 });
  ok(dv("p1").combo === 0, "bar 0 settles: half the floor danced it, the combo stays down");
  clock = t0 + 9 * BAR + 100;
  ok(nothing(g("p2", "dance", { bar: 4, n: 4, of: 4 })), "five bars late: turned away");
  // eight bars the whole floor dances: fireworks
  for (let k = 2; k <= 10; k++) {
    clock = t0 + (k + 1) * BAR - 300;
    g("p1", "dance", { bar: k, n: 4, of: 4 });
    g("p2", "dance", { bar: k, n: 3, of: 4 });
  }
  ok(events.some((x) => x.k === "fx" && x.fx === "dance"), "eight bars the whole floor danced: fireworks on the big screen");
  ok(dv("p1").combo < 0.5, `and the combo starts again (${dv("p1").combo})`);
  ok(dv("p1").dance.p1?.streak === 11 && dv("p1").dance.p2?.bars === 10, "Amy's eleven in a row; Ben's ten bars");
  g("p1", "phase", { phase: "end" });
  g("p1", "again");
  ok(dv("p1").dance.p1?.hits === 44, "another set: the night's dancing carries on");
});

test("dj: the plan's floor: ❄️ and reading the room (读场), one person's two songs 10 minutes apart, the night's recap (今晚回顾), 报幕's switch", () => {
  const e = new RoomEngine(freshRoom("DJFL", clock), host);
  e.screenHello("tv-fl", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
    ["p3", "Cat"],
  ])
    e.hello(p, n, false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const deck = () => dv("p3").deck;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    return e.flush();
  };
  const sc = (x: string, rest: Record<string, unknown> = {}) => {
    const took = e.screenAct("tv-fl", { x, ...rest });
    e.flush();
    return took;
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    e.flush();
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  // the table drops into what's up next: the speaker plays it there, everyone builds it up, Amy presses on the cue
  const dropIn = () => {
    sc("decks", { a: deck().a, b: deck().b });
    for (let i = 0; i < 40 && !deck().drop; i++) {
      advance(250);
      g(`p${(i % 3) + 1}`, "charge", { n: 8 });
    }
    const dr = deck().drop!;
    clock = dr.cue + 20;
    g("p1", "drop", { c: clock });
    advance(dr.at - clock + 5);
  };

  ok(heatLean([], [], clock) === 0 && heatLean([{ at: clock }], [], clock + 61_000) === 0, "读场: no reactions in the last minute, no lean");
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  ok(mixFor("warm", FAKE_MIX, 1).density === r3(ENERGY.warm.density + LEAN) && mixFor("peak", FAKE_MIX, 1).density === 1 && mixFor("wait", FAKE_MIX, 1).density === 0, "a full lean moves a stretch's energy by LEAN (never past full); no music, none");

  sc("live", { source: "fake" });
  sc("grid", { at: clock, bar: 0, bpm: 125 });
  const warm = ENERGY.warm;
  ok(dv("p1").mix.density === warm.density, "the warm-up's own energy");
  for (let i = 0; i < 6; i++) {
    g(`p${(i % 3) + 1}`, "fire");
    advance(400);
  }
  ok(dv("p1").mix.density === r3(warm.density + LEAN / 2) && dv("p1").mix.brightness === r3(warm.brightness + LEAN / 2), "six 🔥 and no ❄️: the room leans halfway up (Lyria plays denser and brighter)");
  const cold = g("p2", "cold");
  ok(cold.light && cold.events.some((x) => x.k === "fx" && x.fx === "cold" && x.pid === "p2"), "❄️ from a phone: the screens hear it");
  ok(dv("p1").mix.density < r3(warm.density + LEAN / 2), "and it pulls the energy back");
  advance(61_000);
  ok(dv("p1").mix.density === warm.density, "a minute with nothing: back to the stretch's own");
  for (let i = 0; i < 6; i++) {
    g(`p${(i % 3) + 1}`, "cold");
    advance(400);
  }
  ok(dv("p1").mix.density === r3(warm.density - LEAN / 2), "six ❄️: down as far");
  advance(61_000);

  // songs asked for: Ben's comes on the air
  g("p2", "req", { text: "reggaeton uno" });
  ok(deck().up?.by === "p2", "Ben's song is up next");
  dropIn();
  ok(deck().now?.by === "p2" && deck().reqOn.p2 === clock && deck().heard.length === 1, "it lands: on the air, and the night's recap has it");
  advance(6000);
  g("p3", "req", { text: "techno cat" });
  advance(6000);
  g("p2", "req", { text: "trance two" });
  advance(6000);
  g("p1", "req", { text: "afrobeats amy" });
  ok(deck().up?.by === "p3" && deck().reqs.map((r) => r.by).join() === "p2,p1", "Cat's is up; Ben's second waits before Amy's in the line");
  ok(reqOrder(deck().reqs, deck().reqOn, clock).map((r) => r.by).join() === "p1,p2", "but Ben's just had one: for 10 minutes the others' go first");
  dropIn();
  ok(deck().now?.by === "p3" && deck().up?.by === "p1", "Cat's lands, and Amy's comes up ahead of Ben's");
  dropIn();
  ok(deck().up?.by === "p2", "Amy's lands: Ben's is the only one left, and it still plays (nobody's turn is taken)");
  dropIn();

  // the recap: what went on the air and the songs that played
  const aired = deck().aired;
  ok(aired.map((a) => a.style).join() === "house,latin,techno,afro,trance" && aired.every((a, k) => k === 0 || a.style !== aired[k - 1].style), "the styles on the air, as they changed");
  ok(deck().heard.map((r) => r.by).join() === "p2,p3,p1,p2", "the four songs that played, in order");
  ok(dv("p3").deck.heard[0].text === null && dv("p2").deck.heard[0].text === "reggaeton uno" && dv("p1").deck.heard[0].text === "reggaeton uno", "a typed song's name stays its player's (and the host's) in the recap too");
  ok(nothing(g("p2", "voice", { on: false })) && dv("p1").voice === true, "报幕: only the host switches it");
  g("p1", "voice", { on: false });
  ok(dv("p3").voice === false, "the host turns it off");
  g("p1", "phase", { phase: "end" });
  ok(deck().aired.at(-1)!.style === "off", "the set ends: the recap notes the music stopped");
  const r = recapOf(dv("p1"), clock);
  ok(r.minutes >= 2 && r.songs.length === 4 && r.fans[0].n >= 2 && r.perfect[0].pid === "p1" && r.styles.length >= 1, "the recap: minutes of music, the songs, who was most fired up, Amy's perfect drops, the styles");
  g("p1", "again");
  ok(deck().heard.length === 4 && deck().aired.length === aired.length + 1 && dv("p1").voice === false && deck().reqOn.p2 > 0, "another set: tonight's recap, the 10-minute rule and the switch carry on");
});

test("dj: 我的歌 from the host's phone: the switch is the room's (the host's phone or the big screen), and the phone hears how a song it sent went", () => {
  const e = new RoomEngine(freshRoom("DJMN", clock), host);
  const events: RoomEvent[] = [];
  e.screenHello("tv-mn", true, "dj");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    const o = e.flush();
    events.push(...o.events);
    return o;
  };
  const sc = (x: string, rest: Record<string, unknown> = {}) => {
    const took = e.screenAct("tv-mn", { x, ...rest });
    events.push(...e.flush().events);
    return took;
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  ok(dv("p2").mine === false, "the stand-in to start with");
  ok(nothing(g("p2", "mine", { on: true })) && !dv("p1").mine, "only the host switches");
  g("p1", "mine", { on: true });
  ok(dv("p2").mine === true && dv("tv-mn").mine === true, "the host's phone: the night on their songs (the big screen switches once it has some)");
  ok(nothing(g("p1", "mine", { on: true })), "again: nothing");
  ok(sc("mine", { on: false }) && dv("p1").mine === false, "the big screen's own switch");
  ok(!sc("mine", { on: false }), "again: nothing");
  ok(sc("song", { by: "p1", id: 12345, code: 0 }), "the big screen says how a song from the host's phone went");
  const fx = events.filter((x) => x.k === "fx" && x.fx === "song");
  ok(fx.length === 1 && fx[0].k === "fx" && fx[0].pid === "p1" && fx[0].data?.[0] === 0 && fx[0].data?.[1] === 12345, "the phone hears it: added, its file's number");
  ok(!sc("song", { by: "p9", id: 1, code: 0 }) && !sc("song", { by: "p1", id: 1, code: 99 }) && !sc("song", { by: "p1", id: -1, code: 0 }), "not for a phone at the table, a word it doesn't know, a bad number: nothing");
  g("p1", "mine", { on: true });
  sc("live", { source: "fake" });
  g("p1", "phase", { phase: "end" });
  g("p1", "again");
  ok(dv("p2").mine === true, "another set keeps the switch");
});

test("dj: a night of the host's songs: their names from the speaker, a song on each deck, asked for by name, the DJ drops into the next as one ends", () => {
  const e = new RoomEngine(freshRoom("DJLC", clock), host);
  e.screenHello("tv-lc", true, "dj");
  for (const [p, n] of [
    ["p1", "Amy"],
    ["p2", "Ben"],
    ["p3", "Cat"],
  ])
    e.hello(p, n, false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  const deck = () => dv("p3").deck;
  const g = (pid: string, x: string, rest: Record<string, unknown> = {}) => {
    e.act(pid, { a: "g", g: { x, ...rest } });
    return e.flush();
  };
  const sc = (x: string, rest: Record<string, unknown> = {}) => {
    const took = e.screenAct("tv-lc", { x, ...rest });
    e.flush();
    return took;
  };
  const advance = (ms: number) => {
    clock += ms;
    e.due();
    e.flush();
  };
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  const songs = [
    ["s1", "One", "Artist A", 128, 200],
    ["s2", "Two", "", 124, 190],
    ["s3", "Three", "B", 100, 180],
    ["s4", "Four", "", 126.04, 210],
    ["s5", "Five", "", 130, 200],
    ["bad id", "Six", "", 120, 200],
    ["s7", "", "", 120, 200],
    ["s8", "Eight", "", 900, 200],
  ];

  // the speaker's computer has songs: their names reach the room (the files stay there)
  ok(sc("crate", { songs }), "the speaker says which songs it has");
  ok(dv("p1").crateN === 5 && dv("p1").crateV === 1 && !("crate" in dv("p1")), "five of them make sense (a bad id, no title, a tempo that isn't one are left out); the list isn't in the view");
  const data = e.gameData() as { v: number; crate: { id: string; t: string; a: string; bpm: number; s: number }[] };
  ok(data.v === 1 && data.crate.length === 5 && data.crate[3].bpm === 126 && data.crate[0].a === "Artist A", "it's fetched apart from the view (GET /room/CODE/data), tempos to a tenth");
  advance(1100);
  ok(!sc("crate", { songs }), "the same list again is nothing new");

  // the night starts on them
  sc("live", { source: "local" });
  sc("grid", { at: clock, bar: 0, bpm: 128 });
  let d = deck();
  ok(dv("p1").source === "local" && d.local && !!d.songs.a && !!d.songs.b && d.songs.a !== d.songs.b, `a night of the host's songs: one on each deck (${d.songs.a}, ${d.songs.b})`);
  ok(d.played.includes(d.songs.a!) && dv("p2").onDecks.a?.t === data.crate.find((x) => x.id === d.songs.a)?.t, "the one on the air is counted as played, and named for the phones");
  ok(nothing(g("p1", "vote", { style: "techno" })), "no styles to pick");
  ok(nothing(g("p2", "req", { text: "something else" })) && nothing(g("p2", "req", { local: "nope" })), "a name typed in, or a song that isn't there, isn't asked for");

  // asked for by name: it goes on the deck off the air
  const s3on = d.songs.a === "s3" || d.songs.b === "s3";
  const want = s3on ? "s5" : "s3";
  g("p2", "req", { local: want });
  d = deck();
  ok(d.up?.local === want && d.up?.by === "p2" && d.songs.b === want, `Ben asks for ${want}: up next, on deck B`);
  ok(dv("p3").deck.up?.text === data.crate.find((x) => x.id === want)?.t && (e.view("tv-lc").game as V<"dj">).deck.up?.text !== null, "named for everyone, the big screen too (they're the host's songs)");
  ok(cued(deck()) === null, "cued once the speaker says deck B has it");
  advance(1100);
  ok(sc("decks", { a: d.a, b: d.b ?? "house", sa: d.songs.a, sb: want }) && cued(deck()) === "b", "it does: cued");

  // the table drops into it
  for (let i = 0; i < 30 && !deck().drop; i++) {
    advance(250);
    g(`p${(i % 3) + 1}`, "charge", { n: 8 });
  }
  const dr = deck().drop!;
  ok(dr.to === "b", "the build-up full: the drop goes to B");
  clock = dr.cue + 20;
  g("p1", "drop", { c: clock });
  advance(dr.at - clock + 5);
  d = deck();
  ok(d.fader === 1 && d.now?.local === want && d.up === null, `it lands: ${want} on the air, named for Ben`);
  ok(!!d.songs.a && d.songs.a !== want && !d.played.slice(0, -1).includes(d.songs.a) && d.played.includes(want), `the deck now off the air (A) takes the next, one not played yet (${d.songs.a})`);

  // the song on the air nearly over: the DJ drops into the next
  ok(!sc("ending", { id: d.songs.a }), "the speaker can only say the one on the air is ending");
  ok(sc("ending", { id: want }) && deck().ending === want && !deck().drop, "it says so; the deck off the air isn't ready yet: the DJ waits");
  advance(1100);
  sc("decks", { a: d.a, b: d.b ?? "house", sa: d.songs.a, sb: want });
  advance(3000);
  const auto = deck().drop!;
  ok(auto && auto.auto && auto.to === "a", "then it starts the countdown into A itself");
  advance(auto.at - clock + 5);
  d = deck();
  ok(d.fader === 0 && d.ending === null && d.now === null && d.last?.auto === true, "and drops: A on the air, nothing ending");

  // back to the stand-in, and on again
  advance(1100);
  sc("src", { source: "fake" });
  ok(!deck().local && dv("p1").source === "fake", "the speaker goes back to the stand-in: no longer a night of the host's songs");
  ok(!nothing(g("p1", "vote", { style: "techno" })), "the picks are back");
  advance(1100);
  sc("src", { source: "local" });
  ok(deck().local && Object.keys(deck().votes).length === 0, "and on again");
  advance(1300);
  g("p2", "fader", { value: 0.4 });
  ok(deck().fader === 0.4, "the fader works: deck B has a song (no style needed)");
  advance(1300);
  g("p2", "fader", { value: 0 });

  // the speaker's songs change: one on a deck that's gone is replaced
  advance(1100);
  const offId = deck().songs.b!;
  ok(sc("crate", { songs: songs.filter((x) => x[0] !== offId) }), "a song taken off the speaker's list");
  ok(deck().songs.b !== offId && !!deck().songs.b && dv("p1").crateV === 2, "leaves its deck for another");

  // the end of the set keeps the songs for the next
  g("p1", "phase", { phase: "end" });
  g("p1", "again");
  ok(dv("p1").crateN === 4 && (e.gameData() as { crate: unknown[] }).crate.length === 4, "another set keeps the host's songs");
  sc("live", { source: "local" });
  ok(deck().local && !!deck().songs.a, "and plays them again");
  ok(!sc("live", { source: "local" }), "(once)");
  // two songs take turns
  const e3 = new RoomEngine(freshRoom("DJLE", clock), host);
  e3.screenHello("tv-le", true, "dj");
  e3.hello("q1", "Q1", false);
  e3.flush();
  const s3 = (x: string, rest: Record<string, unknown> = {}) => {
    const took = e3.screenAct("tv-le", { x, ...rest });
    e3.flush();
    return took;
  };
  const d3 = () => (e3.view("q1").game as V<"dj">).deck;
  s3("crate", { songs: [["t1", "One", "", 128, 200], ["t2", "Two", "", 126, 200]] });
  s3("live", { source: "local" });
  s3("grid", { at: clock, bar: 0, bpm: 128 });
  const first = d3().songs.a;
  ok(!!first && !!d3().songs.b && d3().songs.b !== first, "two songs: one on each deck");
  clock += 1100;
  s3("decks", { a: d3().a, b: d3().b ?? "house", sa: d3().songs.a, sb: d3().songs.b });
  s3("ending", { id: first });
  const dr3 = d3().drop!;
  clock = dr3.at + 5;
  e3.due();
  e3.flush();
  ok(d3().fader === 1 && d3().songs.a === first, `the next plays, and the one before comes round again on the deck off the air (${d3().songs.a})`);
  const e2 = new RoomEngine(freshRoom("DJLD", clock), host);
  e2.screenHello("tv-ld", true, "dj");
  e2.flush();
  e2.screenAct("tv-ld", { x: "live", source: "local" });
  e2.flush();
  ok((e2.view("tv-ld").game as V<"dj">).source === "fake", "no songs on the speaker: a night of them can't start (the stand-in plays)");
});

test("dj: the private Lyria test: only with one of the owner's accounts at the table, never shown; the speaker says when its music changes hands", () => {
  const e = new RoomEngine(freshRoom("DJLB", clock), host);
  e.screenHello("tv-lb", true, "dj");
  e.hello("p1", "Steve", false, { uid: "u1", name: "Steve", av: 0, ac: 0 });
  e.hello("p2", "Ben", false);
  e.flush();
  const dv = (pid: string) => e.view(pid).game as V<"dj">;
  ok(dv("tv-lb").lab === false, "nobody is the owner: no Lyria");
  e.setOwner("p1", true);
  ok(e.flush().changed && dv("tv-lb").lab === true && dv("p2").lab === true, "the rooms server finds one of the owner's accounts at the table: Lyria may play");
  ok(!e.view("p2").seats.some((x) => "owner" in x), "which seat it is, no phone is told");
  e.setOnline("p1", false);
  e.flush();
  ok(dv("tv-lb").lab === true, "the owner's phone locks: it keeps its seat, and Lyria");
  e.setOnline("p1", true);
  e.setOwner("p1", false);
  e.flush();
  ok(dv("tv-lb").lab === false, "signed out of that account: no more Lyria");
  e.setOwner("p1", true);
  e.hello("p3", "Cat", false, { uid: "u3", name: "Cat", av: 0, ac: 0 });
  e.setOwner("p3", true);
  e.act("p3", { a: "leave" });
  e.flush();
  ok(dv("tv-lb").lab === true && !e.d.seats.some((x) => x.id === "p3"), "another owner's account leaving changes nothing while one is still seated");
  ok(!e.screenAct("tv-lb", { x: "src", source: "lyria" }), "before the music starts there's nothing to hand over");
  e.screenAct("tv-lb", { x: "live", source: "fake" });
  e.flush();
  ok(dv("p2").source === "fake", "the stand-in starts the night");
  ok(e.screenAct("tv-lb", { x: "src", source: "lyria" }) && dv("p2").source === "lyria", "Lyria takes over: every phone sees it");
  ok(!e.screenAct("tv-lb", { x: "src", source: "lyria" }) && !e.screenAct("tv-lb", { x: "src", source: "radio" }), "saying it again, or a source that isn't one, changes nothing");
  e.act("p1", { a: "g", g: { x: "src", source: "fake" } });
  e.flush();
  ok(dv("p2").source === "lyria", "a phone can't say it");
  e.act("p1", { a: "g", g: { x: "phase", phase: "end" } });
  e.flush();
  ok(!e.screenAct("tv-lb", { x: "src", source: "fake" }), "after the set, nothing to say");
});

test("custom penalty: no card, command or note tells anyone to drink", () => {
  // (dice rolls and decks use the shared random sequence: put it back afterwards)
  const s0 = seed;
  // "act out someone drunk" is acting, not a penalty
  const drinks = (x: { zh: string; en: string } | undefined) => !!x && (/喝(?!醉)|酒|干杯/.test(x.zh) || /\b(drinks?|drank|drinking|sips?|glass|downs?)\b/i.test(x.en));
  for (const r of ROGUE_RULES) {
    const w = ruleWords(r, true);
    ok(!drinks(w.title) && !drinks(w.rule) && !drinks(w.badge), `rogue ${r.rank} reads without drinking (${w.rule.zh})`);
    ok(ruleWords(r, false).rule === r.rule, `rogue ${r.rank} unchanged when drinking`);
  }
  for (const c of KING_COMMANDS) ok(!drinks(commandText(c, true)), `king command without drinking (${commandText(c, true).zh})`);
  for (const sl of DEFAULT_SLICES) ok(!drinks(sliceLabel(sl, true)), `wheel slice ${sl.id} without drinking (${sliceLabel(sl, true).zh})`);
  for (const d of DARES) if (d.custom) ok(!drinks(promptText(d, true)), `dare without drinking (${promptText(d, true).zh})`);

  const PEN = "做十个深蹲";
  const notes = (t: ReturnType<typeof setup>, from = 0) => t.pens().slice(from).map((p) => p.note);

  // seven eight nine: every penalty the dice give out, and the shared glass is a pot
  const d = setup(3);
  d.act("p0", { a: "penalty", text: PEN });
  d.act("p0", { a: "start", game: "dice" });
  for (let i = 0; i < 200 && d.pens().length < 3; i++) {
    const v = d.view<V<"dice">>("p0");
    if (v.phase === "roll") d.g(v.turn, "roll");
    else if (v.phase === "assign") d.g(v.turn, "assign", { target: "p2" });
    else d.g(v.turn, "next");
    d.advance(1500);
  }
  ok(d.pens().length >= 3, `the dice gave out penalties (${d.pens().length})`);
  ok(notes(d).every((n) => n && !drinks(n) && /罚/.test(n.zh)), `dice notes speak of the penalty: ${notes(d).map((n) => n?.zh).join(" / ")}`);

  // wheel: the built-in slices read as the penalty, the notes too
  const w = setup(3);
  w.act("p0", { a: "penalty", text: PEN });
  w.act("p0", { a: "start", game: "wheel" });
  w.act("p0", { a: "spin", scope: "wheel", index: 0, delta: 900, duration: 2 }); // "sip"
  w.advance(2500);
  let last = w.pens().slice(-1)[0];
  ok(last?.kind === "sip" && last.note?.zh === "自己罚" && last.note.en === "You", `a sip slice is "you take the penalty" (${last?.note?.zh})`);
  w.g("p0", "next");
  w.act("p1", { a: "spin", scope: "wheel", index: 4, delta: 900, duration: 2 }); // "all"
  w.advance(2500);
  last = w.pens().slice(-1)[0];
  ok(last?.kind === "everyone" && last.note?.zh === "全桌罚", `the whole table slice (${last?.note?.zh})`);
  ok(w.view<V<"wheel">>("p0").slices[0].label.zh === "喝一口", "the slices themselves are kept: each phone words them");

  // rogue: the card's title, the bathroom pass and the buddy
  const r = setup(3);
  r.act("p0", { a: "penalty", text: PEN });
  r.act("p0", { a: "start", game: "rogue" });
  const rs = r.eng.d.game!.s as { deck: number[]; holders: Record<string, string> };
  rs.deck.push(8); // the nine of spades, "drink yourself"
  r.g("p0", "draw");
  r.advance(1200);
  ok(r.pens().slice(-1)[0]?.note?.zh === "自罚", `a nine is 自罚 (${r.pens().slice(-1)[0]?.note?.zh})`);
  r.g("p1", "wc");
  ok(r.pens().slice(-1)[0]?.note?.zh === "没有 WC 票：先受罚再去", "no bathroom pass: penalty first");
  rs.holders.buddy = "p2";
  rs.holders.trouble = "p0";
  r.g("p0", "trouble", { target: "p1" });
  r.act("p1", { a: "buddy", pen: r.pens().slice(-1)[0].id });
  ok(r.pens().slice(-1)[0]?.note?.zh === "陪罚：谢谢老板！", "the buddy takes the penalty too");
  ok(notes(r).every((n) => !drinks(n)), "no rogue note says drink");

  // king: the command on every phone
  const k = setup(4);
  k.act("p0", { a: "penalty", text: PEN });
  k.act("p0", { a: "start", game: "king" });
  const ks = k.eng.d.game!.s as { cmd: { c: number; nums: number[] } | null; phase: string };
  ks.cmd = { c: KING_COMMANDS.findIndex((c) => c.zh.startsWith("{a}号喝一口")), nums: [1, 2] };
  ks.phase = "command";
  ok(k.view<V<"king">>("p1").cmd?.text.zh === "1号受罚一次，2号受罚两次。", `one sip and two sips become once and twice (${k.view<V<"king">>("p1").cmd?.text.zh})`);
  k.act("p0", { a: "penalty", text: "" });
  ok(k.view<V<"king">>("p1").cmd?.text.zh === "1号喝一口，2号喝两口。", "back to drinking, the command drinks again");

  // truth or dare: the one dare that is a drink
  const td = setup(3);
  td.act("p0", { a: "penalty", text: PEN });
  td.act("p0", { a: "start", game: "truth" });
  const ts = td.eng.d.game!.s as { kind: string | null; prompt: number | null; phase: string };
  Object.assign(ts, { kind: "dare", prompt: DARES.findIndex((x) => !!x.custom), phase: "card" });
  ok(!drinks(td.view<V<"truth">>("p1").prompt ?? undefined), `the drinking dare has a dry version (${td.view<V<"truth">>("p1").prompt?.zh})`);

  // superlatives: the ceremony
  const su = setup(4);
  su.act("p0", { a: "penalty", text: PEN });
  su.act("p0", { a: "start", game: "superlatives" });
  for (const [a, b] of [["p0", "p2"], ["p1", "p2"], ["p2", "p3"], ["p3", "p2"]]) su.g(a, "vote", { target: b });
  (su.eng.d.game!.s as { round: number; total: number }).round = (su.eng.d.game!.s as { total: number }).total;
  su.g("p0", "next");
  su.advance(3500);
  last = su.pens().slice(-1)[0];
  ok(last?.kind === "everyone" && last.note?.zh === "颁奖典礼，全场一起来", `the ceremony (${last?.note?.zh})`);

  // punchline: fewer votes
  const pl = setup(5);
  pl.act("p0", { a: "penalty", text: PEN });
  pl.act("p0", { a: "start", game: "punchline" });
  for (const pid of pl.ids) for (const m of pl.view<V<"punchline">>(pid).mine) pl.g(pid, "answer", { k: m.k, text: `${pid} ${m.k}` });
  pl.advance(presentMs(2, false) + 50);
  const voters = pl.ids.filter((pid) => pl.view<V<"punchline">>(pid).match?.canVote);
  voters.forEach((pid, i) => pl.g(pid, "vote", { slot: i === voters.length - 1 ? 1 : 0 }));
  pl.advance(5600);
  last = pl.pens().slice(-1)[0];
  ok(voters.length === 3 && last?.note?.zh === "神回复：票少的受罚", `fewer votes takes the penalty (${last?.note?.zh})`);

  // and with no penalty of the table's own, the same moments still drink
  const plain = setup(3);
  plain.act("p0", { a: "start", game: "wheel" });
  plain.act("p0", { a: "spin", scope: "wheel", index: 0, delta: 900, duration: 2 });
  plain.advance(2500);
  ok(plain.pens().slice(-1)[0]?.note?.zh === "喝一口", "drinking table: a sip");
  plain.act("p0", { a: "start", game: "rogue" });
  plain.g("p1", "wc");
  ok(plain.pens().slice(-1)[0]?.note?.zh === "没有 WC 票：先喝再去", "drinking table: drink first");
  seed = s0;
});

test("seven eight nine: with the table's own penalty the glass is a pot, counted in times", () => {
  // (the dice use the shared random sequence: put it back afterwards)
  const s0 = seed;
  const is = (x: { take: number; pot: number }, take: number, pot: number) => x.take === take && x.pot === pot;
  ok(is(potStep(1, "seven"), 0, 2), "a seven adds one");
  ok(is(potStep(3, "eight"), 2, 1), "an eight takes half, rounded up");
  ok(is(potStep(4, "eight"), 2, 2), "an eight of 4 leaves 2");
  ok(is(potStep(1, "eight"), 1, 1), "an eight of 1 takes it, and the pot is back to 1");
  ok(is(potStep(5, "nine"), 5, 1), "a nine takes it all");
  ok(is(potStep(3, "ones"), 3, 1), "double ones: all of it");
  ok(is(potStep(3, "safe"), 0, 3), "anything else leaves it");
  // how many times the table's own penalty is done
  ok(timesOf({ kind: "sip" }) === 1 && timesOf({ kind: "two" }) === 2 && timesOf({ kind: "full", times: 3 }) === 3 && timesOf({ kind: "two", times: 1 }) === 1, "once, twice for two sips, or as the game says");
  ok(timesOf({ kind: "two", say: { zh: "学一种动物叫三声", en: "Do three animal noises" } }) === 1, "a forfeit the game names is done once");

  // a whole game: every penalty is as many times as the pot held, and every phone sees the pot
  const d = setup(3);
  d.act("p0", { a: "penalty", text: "做十个深蹲" });
  d.act("p0", { a: "start", game: "dice" });
  ok(d.view<V<"dice">>("p1").pot === 1, "the pot starts at 1");
  let pot = 1;
  let given = 0;
  let more = 0;
  for (let i = 0; i < 400 && (given < 6 || more < 1); i++) {
    const v = d.view<V<"dice">>("p0");
    const before = d.pens().length;
    if (v.phase === "roll") d.g(v.turn, "roll");
    else if (v.phase === "assign") d.g(v.turn, "assign", { target: "p2" });
    else d.g(v.turn, "next");
    d.advance(1500);
    const after = d.view<V<"dice">>("p1");
    const fresh = d.pens().slice(before);
    if (v.phase === "roll") {
      const o = after.outcome!;
      const step = potStep(pot, o === "ones" ? "safe" : o);
      if (o === "eight" || o === "nine") {
        ok(fresh.length === 1 && fresh[0].times === step.take, `${o} with ${pot} in the pot: ${step.take} times (${fresh[0]?.times})`);
        given++;
        if (step.take > 1) more++;
      } else ok(fresh.length === 0, `${o}: nobody takes anything yet`);
      pot = step.pot;
    } else if (v.phase === "assign") {
      ok(fresh.length === 1 && fresh[0].kind === "full" && fresh[0].times === pot && fresh[0].who[0] === "p2", `double ones: the whole pot (${pot}) to the one picked (${fresh[0]?.times})`);
      given++;
      if (pot > 1) more++;
      pot = 1;
    }
    ok(after.pot === pot, `the pot reads ${pot} (${after.pot})`);
  }
  ok(given >= 6 && more >= 1, `the dice gave out penalties (${given}, ${more} of them more than once)`);

  // a drinking table: the glass is a glass, and no penalty counts times
  const plain = setup(3);
  plain.act("p0", { a: "start", game: "dice" });
  for (let i = 0; i < 200 && plain.pens().length < 3; i++) {
    const v = plain.view<V<"dice">>("p0");
    if (v.phase === "roll") plain.g(v.turn, "roll");
    else if (v.phase === "assign") plain.g(v.turn, "assign", { target: "p2" });
    else plain.g(v.turn, "next");
    plain.advance(1500);
  }
  ok(plain.pens().length >= 3 && plain.pens().every((p) => p.times === undefined), "drinking: no times on the penalties");
  seed = s0;
});

test("just watching: the players are the ring and every list; a watcher is never picked or voted for, and makes no moves (a watching host still runs the table)", () => {
  // (the games draw from the shared random sequence: put it back afterwards)
  const s0 = seed;
  // four at the table, the third just watching: the players are p0, p1 and p3, in that order
  const t = setup(4);
  t.act("p2", { a: "watch", on: true });
  // a watcher's move reaches no game: nothing changes, nothing is sent or saved
  const nothing = (o: Output) => !o.changed && !o.light && !o.persist && o.events.length === 0;
  const pensFor = (pid: string) => t.pens().filter((p) => p.who.includes(pid)).length;

  // 真心话大冒险: every phone's ring is the three players, so the bottle's slot 2 is p3, not the watcher in seat 2
  t.act("p0", { a: "start", game: "truth" });
  t.act("p0", { a: "spin", scope: "truth", index: 2, delta: 720, duration: 1 });
  ok(t.view<V<"truth">>("p1").chosen === "p3", `truth: slot 2 of the three players is p3 (${t.view<V<"truth">>("p1").chosen})`);
  ok(t.events.some((e) => e.k === "spin" && e.scope === "truth" && e.index === 2), "truth: every phone replays the spin onto slot 2");

  // 命运转盘: the slice that says pick someone: never the watcher
  t.act("p0", { a: "start", game: "wheel" });
  const slot = t.view<V<"wheel">>("p0").slices.findIndex((x) => x.id === "pick");
  t.act("p0", { a: "spin", scope: "wheel", index: slot, delta: 720, duration: 1 });
  t.advance(1500);
  ok(slot >= 0 && t.view<V<"wheel">>("p0").phase === "pick", "wheel: landed on pick someone");
  const p1Before = pensFor("p1");
  t.g("p0", "pick", { target: "p2" });
  ok(t.view<V<"wheel">>("p0").phase === "pick" && pensFor("p2") === 0, "wheel: the watcher can't be picked");
  t.g("p0", "pick", { target: "p1" });
  ok(t.view<V<"wheel">>("p0").phase === "result" && pensFor("p1") === p1Before + 1, "wheel: a player can");

  // 七八九: double ones hands the glass to someone: never the watcher
  t.act("p0", { a: "start", game: "dice" });
  (t.eng.d.game!.s as { phase: string }).phase = "assign";
  t.g("p0", "assign", { target: "p2" });
  ok(t.view<V<"dice">>("p0").phase === "assign" && pensFor("p2") === 0, "dice: the glass can't go to the watcher");
  t.g("p0", "assign", { target: "p3" });
  ok(t.view<V<"dice">>("p0").phase === "result", "dice: it goes to a player");

  // 国王游戏: sticks for the players only, and the king can't punish the watcher
  t.act("p0", { a: "start", game: "king" });
  let kv = t.view<V<"king">>("p0");
  ok(kv.count === 3 && !kv.inRound.includes("p2"), `king: three sticks, none for the watcher (${kv.inRound.join()})`);
  ok(nothing(t.g("p2", "pull")), "king: the watcher draws nothing");
  for (const p of ["p0", "p1", "p3"]) {
    t.g(p, "pull");
    t.g(p, "ready");
  }
  kv = t.view<V<"king">>("p0");
  ok(kv.phase === "crown" && !!kv.king, "king: crowned once the three players are ready");
  const king = kv.king!;
  t.g(king, "command");
  t.g(king, "refuse", { target: "p2" });
  ok(t.view<V<"king">>("p0").refused.length === 0 && pensFor("p2") === 0, "king: the watcher can't have refused");
  const subject = ["p0", "p1", "p3"].find((p) => p !== king)!;
  t.g(king, "refuse", { target: subject });
  ok(t.view<V<"king">>("p0").refused.includes(subject), "king: a player can");

  // 谁最有可能: the watcher neither votes nor gets voted for; the three players' votes decide it
  t.act("p0", { a: "start", game: "prompts" });
  t.g("p0", "mode", { mode: "likely" });
  t.g("p0", "draw");
  ok(nothing(t.g("p2", "vote", { target: "p0" })), "likely: the watcher's vote changes nothing");
  t.g("p0", "vote", { target: "p2" });
  ok(t.view<V<"prompts">>("p0").answered.length === 0, "likely: nobody can vote for the watcher");
  t.g("p0", "vote", { target: "p1" });
  t.g("p1", "vote", { target: "p0" });
  t.g("p3", "vote", { target: "p0" });
  const pv = t.view<V<"prompts">>("p0");
  const counts = pv.result?.counts ?? {};
  ok(pv.phase === "reveal" && !("p2" in counts) && pv.result?.top?.join() === "p0", "likely: in once the three players voted, and only their votes count");
  // 我从来没有: the watcher doesn't answer
  t.g("p0", "next");
  t.g("p0", "mode", { mode: "never" });
  t.g(t.view<V<"prompts">>("p0").reader, "draw");
  ok(nothing(t.g("p2", "ans", { yes: true })) && !t.view<V<"prompts">>("p0").answered.includes("p2"), "never: the watcher doesn't answer");

  // 最佳称号: the three players vote for each other
  t.act("p0", { a: "start", game: "superlatives" });
  ok(nothing(t.g("p2", "vote", { target: "p0" })), "superlatives: the watcher's vote changes nothing");
  t.g("p1", "vote", { target: "p2" });
  ok(t.view<V<"superlatives">>("p0").voted.length === 0, "superlatives: nobody can vote for the watcher");
  t.g("p0", "vote", { target: "p1" });
  t.g("p1", "vote", { target: "p0" });
  t.g("p3", "vote", { target: "p0" });
  let sv = t.view<V<"superlatives">>("p0");
  ok(sv.phase === "reveal" && sv.winners.join() === "p0" && !("p2" in (sv.counts ?? {})), "superlatives: revealed once the three players voted");
  // the host sits down to watch: their buttons still work, their vote doesn't count
  t.act("p0", { a: "watch", on: true });
  t.g("p0", "next");
  sv = t.view<V<"superlatives">>("p1");
  ok(sv.phase === "vote" && sv.round === 2, "a watching host still moves the game on");
  t.g("p0", "custom", { text: "最会点歌" });
  ok(t.view<V<"superlatives">>("p1").title.zh === "最会点歌", "and writes the next award");
  t.g("p0", "vote", { target: "p1" });
  ok(!t.view<V<"superlatives">>("p1").voted.includes("p0"), "but doesn't vote");

  // the host watches too from here: the players are p1 and p3
  // 你画我猜: neither watcher guesses or scores
  t.act("p0", { a: "start", game: "draw" });
  ok(t.view<V<"draw">>("p1").drawer === "p1", "draw: the first player draws");
  t.g("p1", "pick", { d: 1 });
  const word = t.view<V<"draw">>("p1").word!.zh;
  ok(nothing(t.g("p2", "guess", { text: word })), "draw: the watcher's guess changes nothing");
  t.g("p0", "guess", { text: word });
  let dv = t.view<V<"draw">>("p1");
  ok(!dv.solved.includes("p0") && !dv.scores.p0, "draw: nor does the watching host's");
  t.g("p3", "guess", { text: word });
  dv = t.view<V<"draw">>("p1");
  ok(dv.phase === "result" && dv.solved.join() === "p3" && !dv.scores.p2, "draw: the one player guessing got it, and the round is over");

  // 额头便利贴: the watchers don't answer the questions
  t.act("p0", { a: "start", game: "postit" });
  t.g("p0", "begin");
  let pi = t.view<V<"postit">>("p1");
  ok(pi.phase === "play" && pi.order.join() === "p1,p3", `post-it: notes for the players only (${pi.order.join()}), started by the watching host`);
  t.g(pi.turn, "ask", { text: "Am I an animal?" });
  const answerer = pi.turn === "p1" ? "p3" : "p1";
  ok(nothing(t.g("p2", "reply", { r: "yes" })), "post-it: the watcher's answer changes nothing");
  t.g("p0", "reply", { r: "yes" });
  t.g(answerer, "reply", { r: "no" });
  pi = t.view<V<"postit">>("p1");
  ok(Object.keys(pi.replies).join() === answerer, `post-it: only the player's answer is in (${Object.keys(pi.replies).join()})`);

  // 流氓十三张: the watchers can't be picked, take no number and don't touch their nose
  t.act("p0", { a: "start", game: "rogue" });
  const rs = t.eng.d.game!.s as { phase: string; drawer: string | null; holders: Record<string, string>; grab: unknown };
  Object.assign(rs, { phase: "pick", drawer: "p1" });
  t.g("p1", "pick", { target: "p2" });
  t.g("p1", "pick", { target: "p0" });
  ok(t.view<V<"rogue">>("p1").phase === "pick", "rogue: neither watcher can be picked");
  t.g("p1", "pick", { target: "p3" });
  ok(t.view<V<"rogue">>("p1").phase === "done", "rogue: a player can");
  Object.assign(rs, { phase: "grab", drawer: "p1", grab: { next: 2, claimed: { p1: 1 }, endsAt: clock + 15_000, last: null } });
  ok(nothing(t.g("p2", "grab", { n: 2 })), "rogue: the watcher's grab changes nothing");
  t.g("p0", "grab", { n: 2 });
  ok(Object.keys(t.view<V<"rogue">>("p1").grab?.claimed ?? {}).join() === "p1", "rogue: nor does the watching host's");
  t.g("p3", "grab", { n: 2 });
  ok(t.view<V<"rogue">>("p1").phase === "done", "rogue: the last player grabbed: the card is done");
  rs.holders.nose = "p1";
  t.g("p1", "nose");
  t.g("p2", "tap");
  t.g("p0", "tap");
  const it = t.view<V<"rogue">>("p1").interrupt;
  ok(it?.kind === "nose" && it.tapped.length === 0, "rogue: the watchers don't touch their nose");
  t.g("p3", "tap");
  ok(!t.view<V<"rogue">>("p1").interrupt, "rogue: the one player touched theirs: done");

  // 尤克牌: the watchers can't take a computer player's seat
  t.act("p0", { a: "start", game: "euchre" });
  let ev = t.view<V<"euchre">>("p1");
  const free = ev.seats.findIndex((x) => !x.pid);
  ok(free >= 0 && ev.seats.filter((x) => x.pid).length === 2, "euchre: the two players sit, computers fill the rest");
  ok(nothing(t.g("p2", "sit", { seat: free })), "euchre: the watcher's tap changes nothing");
  t.g("p0", "sit", { seat: free });
  ev = t.view<V<"euchre">>("p1");
  ok(!ev.seats.some((x) => x.pid === "p0" || x.pid === "p2") && t.view<V<"euchre">>("p0").mySeat === null, "euchre: nor does the watching host's");

  // 神回复: a writer who sits down to watch doesn't hold the others up
  const pu = setup(4);
  pu.act("p0", { a: "start", game: "punchline" });
  for (const pid of ["p0", "p1", "p2"]) for (const p of pu.view<V<"punchline">>(pid).mine) pu.g(pid, "answer", { k: p.k, text: `${pid} says hi` });
  ok(pu.view<V<"punchline">>("p0").phase === "write", "punchline: one writer still writing");
  pu.act("p3", { a: "watch", on: true });
  const pl = pu.view<V<"punchline">>("p0");
  // (on to the answers: a matchup they were in goes to the other writer without a vote)
  ok(pl.phase !== "write" && !pl.players.includes("p3"), `punchline: they sit down to watch: on with the show, without them (${pl.phase})`);

  // 打碟: a watcher's 🔥 doesn't count; a watching host still hears how their song went
  const e = new RoomEngine(freshRoom("DJWA", clock), host);
  e.screenHello("tv-wa", true, "dj");
  e.hello("p1", "Amy", false);
  e.hello("p2", "Ben", false);
  e.act("p2", { a: "watch", on: true });
  e.act("p1", { a: "watch", on: true });
  e.flush();
  e.act("p2", { a: "g", g: { x: "fire" } });
  ok(nothing(e.flush()) && !(e.view("p1").game as V<"dj">).total.p2, "dj: the watcher's 🔥 doesn't count");
  ok(e.screenAct("tv-wa", { x: "song", by: "p1", id: 5, code: 0 }) && e.flush().events.some((x) => x.k === "fx" && x.fx === "song" && x.pid === "p1"), "dj: the watching host still hears how their song went");
  seed = s0;
});

test("postit: every one-phone deck reads in both languages, on a shelf, with no word twice", () => {
  const shelves = new Set(HEADS_DECK_GROUPS.map((g) => g.id));
  const ids = new Set<string>();
  const seen = new Map<string, string>();
  for (const d of HEADS_DECKS) {
    ok(!ids.has(d.id), `deck ids are different (${d.id})`);
    ids.add(d.id);
    ok(shelves.has(d.group), `${d.id} is on a shelf (${d.group})`);
    ok(!!d.name.zh.trim() && !!d.name.en.trim(), `${d.id} has a name in both languages`);
    ok(d.words.length >= 25, `${d.id} has enough words for a few turns (${d.words.length})`);
    for (const w of d.words) {
      ok(!!w.zh.trim() && !!w.en.trim() && w.zh === w.zh.trim() && w.en === w.en.trim(), `${d.id}: a word in both languages (${JSON.stringify(w)})`);
      // (the same word in two decks would come up twice for a table that plays both)
      for (const k of [w.zh, w.en.toLowerCase()]) {
        const was = seen.get(k);
        ok(!was || was === d.id, `${k} is in one deck only (${was}, ${d.id})`);
        seen.set(k, d.id);
      }
    }
  }
  for (const g of HEADS_DECK_GROUPS) ok(HEADS_DECKS.some((d) => d.group === g.id), `the ${g.id} shelf has decks`);
});

/* ------------------------------------------------------------------ 最后一张 · Last Card */

/** The rooms server's state for 最后一张, as far as these tests reach into it. */
type LcS = {
  phase: string;
  stack: boolean;
  target: number;
  round: number;
  order: string[];
  hands: Record<string, number[]>;
  pile: number[];
  discard: number[];
  color: LcColor;
  turn: string;
  dir: 1 | -1;
  pending: number;
  pendingKind: string | null;
  drawn: number | null;
  called: string[];
  open: string | null;
  tn: number;
};

/** The `n`th card with this face (0: the first). */
function lcId(c: LcColor | null, k: LcKind, n = 0) {
  const ids = FACES.map((f, i) => (f.c === c && f.k === k ? i : -1)).filter((i) => i >= 0);
  if (n >= ids.length) throw new Error(`no card ${c}${k} #${n}`);
  return ids[n];
}

/** A table of `n` dealt in at 最后一张, with a way to set the cards and to move. */
function lcTable(n: number, opts: { stack?: boolean; target?: number } = {}) {
  const t = setup(n);
  t.act("p0", { a: "start", game: "lastcard" });
  if (opts.stack) t.g("p0", "stack", { on: true });
  if (opts.target !== undefined) t.g("p0", "target", { n: opts.target });
  t.g("p0", "deal");
  const s = () => t.eng.d.game!.s as LcS;
  const lv = (pid: string) => t.view<V<"lastcard">>(pid);
  /** the hands given (calls, catches and stacks start afresh), the pile's face-up card, what's drawn next (last first), whose turn */
  const rig = (r: { hands?: Record<string, number[]>; top?: number; color?: LcColor; pile?: number[]; turn?: string; dir?: 1 | -1 }) => {
    const st = s();
    if (r.hands) {
      for (const [p, h] of Object.entries(r.hands)) st.hands[p] = h.slice();
      Object.assign(st, { called: [], open: null, pending: 0, pendingKind: null, drawn: null });
    }
    if (r.top !== undefined) {
      st.discard = [r.top];
      st.color = faceOf(r.top).c ?? "r";
    }
    if (r.color) st.color = r.color;
    if (r.turn) st.turn = r.turn;
    if (r.dir) st.dir = r.dir;
    const used = new Set([...st.discard, ...Object.values(st.hands).flat()]);
    st.pile = st.pile.filter((c) => !used.has(c));
    if (r.pile) st.pile = [...st.pile.filter((c) => !r.pile!.includes(c)), ...r.pile];
  };
  const play = (pid: string, card: number, color?: string) => t.g(pid, "play", { card, color, at: lv(pid).tn });
  const draw = (pid: string) => t.g(pid, "draw", { at: lv(pid).tn });
  const keep = (pid: string) => t.g(pid, "keep", { at: lv(pid).tn });
  const pensOf = (pid: string) => t.pens().filter((e) => e.who.length === 1 && e.who[0] === pid).map((e) => e.kind);
  return { ...t, s, lv, rig, play, draw, keep, pensOf };
}

test("lastcard: the deck: 108 cards, every kind counted, and what goes on what", () => {
  ok(DECK_SIZE === 108, `108 cards (${DECK_SIZE})`);
  const n = (c: LcColor | null, k?: LcKind) => FACES.filter((f) => f.c === c && (!k || f.k === k)).length;
  for (const c of ["r", "y", "g", "b"] as LcColor[])
    ok(n(c) === 25 && n(c, "0") === 1 && n(c, "7") === 2 && n(c, "9") === 2 && n(c, "skip") === 2 && n(c, "rev") === 2 && n(c, "d2") === 2, `${c}: 25 cards, one 0, two of every other`);
  ok(n(null, "wild") === 4 && n(null, "d4") === 4, "four wilds, four +4 wilds");
  const [r5, b5, b7, r9, rSkip, gSkip, w, d4, yd2, bd2] = [lcId("r", "5"), lcId("b", "5"), lcId("b", "7"), lcId("r", "9"), lcId("r", "skip"), lcId("g", "skip"), lcId(null, "wild"), lcId(null, "d4"), lcId("y", "d2"), lcId("b", "d2")];
  ok(canPlay(b5, r5, "r") && canPlay(r9, r5, "r") && !canPlay(b7, r5, "r"), "the same number or the same colour, nothing else");
  ok(canPlay(gSkip, rSkip, "r") && canPlay(w, r5, "r") && canPlay(d4, r5, "r"), "the same symbol; a wild on anything");
  ok(canPlay(b7, w, "b") && !canPlay(lcId("r", "7"), w, "b"), "on a wild, the colour that was picked");
  ok(canPlay(bd2, yd2, "y", "d2") && !canPlay(d4, yd2, "y", "d2") && !canPlay(lcId("y", "3"), yd2, "y", "d2"), "a +2 stack: only another +2");
  ok(canPlay(lcId(null, "d4", 1), d4, "g", "d4") && !canPlay(bd2, d4, "g", "d4"), "a +4 stack: only another +4");
});

test("lastcard: the deal, the host's house rules, secret hands, and a watcher at the table", () => {
  const s0 = seed;
  const t = setup(4);
  t.act("p3", { a: "watch", on: true });
  t.act("p0", { a: "start", game: "lastcard" });
  let v = t.view<V<"lastcard">>("p1");
  ok(v.phase === "setup" && v.order.join() === "p0,p1,p2" && !v.stack && v.target === 3, `setup: the three players (not the watcher), stacking off, first to 3 (${v.order.join()})`);
  t.g("p1", "stack", { on: true });
  t.g("p1", "target", { n: 5 });
  t.g("p1", "deal");
  v = t.view<V<"lastcard">>("p1");
  ok(v.phase === "setup" && !v.stack && v.target === 3, "only the host sets the house rules and deals");
  t.g("p0", "stack", { on: true });
  t.g("p0", "target", { n: 7 });
  ok(t.view<V<"lastcard">>("p2").stack && t.view<V<"lastcard">>("p2").target === 3, "stacking on; a target that isn't on offer is ignored");
  t.g("p0", "target", { n: 0 });
  ok(t.view<V<"lastcard">>("p2").target === 0, "no target: just play rounds");
  t.g("p0", "deal");
  const st = t.eng.d.game!.s as LcS;
  v = t.view<V<"lastcard">>("p0");
  ok(v.phase === "play" && v.round === 1 && v.turn === "p0", "dealt: round 1, p0 moves first");
  ok(["p0", "p1", "p2"].every((p) => v.counts[p] === 7) && v.counts.p3 === undefined, "seven cards each, none for the watcher");
  const all = [...st.pile, ...st.discard, ...Object.values(st.hands).flat()];
  ok(all.length === 108 && new Set(all).size === 108, `all 108 cards accounted for, each once (${all.length})`);
  ok(v.top !== null && /^[0-9]$/.test(faceOf(v.top).k) && v.color === faceOf(v.top).c, "the pile starts on a number card, its colour in force");
  const hands = ["p0", "p1", "p2"].map((p) => t.view<V<"lastcard">>(p).hand);
  ok(hands.every((h, i) => h.length === 7 && h.join() === st.hands[`p${i}`].slice().sort((a, b) => a - b).join()), "each phone gets its own hand, sorted");
  for (const p of ["p0", "p1", "p2"]) {
    const json = JSON.stringify(t.eng.view(p));
    const others = ["p0", "p1", "p2"].filter((q) => q !== p).flatMap((q) => st.hands[q]);
    ok(!json.includes('"hands"') && !/"pile":\[/.test(json) && t.view<V<"lastcard">>(p).hand.every((c) => !others.includes(c)), `${p}'s view: only its own hand, no draw pile`);
  }
  const w = t.view<V<"lastcard">>("p3");
  ok(w.hand.length === 0 && w.legal.length === 0 && w.drawn === null, "the watcher gets no cards");
  const tv = t.eng.view("tv-screen1").game as V<"lastcard">;
  ok(tv.hand.length === 0 && tv.legal.length === 0 && tv.counts.p1 === 7, "a big screen sees how many each holds, never a hand");
  ok(t.view<V<"lastcard">>("p1").legal.length === 0 && v.legal.every((c) => v.hand.includes(c) && canPlay(c, v.top, v.color)), "only the player on turn has cards to play, each one that fits");
  const before = JSON.stringify(st);
  t.g("p3", "call");
  t.g("p3", "draw", { at: v.tn });
  t.g("p3", "catch", { pid: "p0" });
  ok(JSON.stringify(t.eng.d.game!.s) === before, "the watcher makes no moves");
  seed = s0;
});

test("lastcard: numbers, skips and reverses go round three players", () => {
  const s0 = seed;
  const t = lcTable(3);
  const [r5, r7, y7, ySkip, yRev, g3, b9, g8] = [lcId("r", "5"), lcId("r", "7"), lcId("y", "7"), lcId("y", "skip"), lcId("y", "rev"), lcId("g", "3"), lcId("b", "9"), lcId("g", "8")];
  t.rig({ top: r5, turn: "p0", dir: 1, hands: { p0: [r7, g3, b9], p1: [y7, yRev, lcId("g", "4")], p2: [ySkip, lcId("b", "1"), lcId("b", "2")] } });
  const tn = t.lv("p0").tn;
  t.g("p0", "play", { card: r7, at: tn - 1 });
  ok(t.lv("p0").top === r5, "a move that names an old turn lands nowhere");
  t.play("p1", y7);
  ok(t.lv("p0").top === r5, "not your turn: nothing");
  t.play("p0", g3);
  ok(t.lv("p0").top === r5 && t.lv("p0").turn === "p0", "a card that doesn't fit stays in the hand");
  t.play("p0", r7);
  let v = t.lv("p1");
  ok(v.top === r7 && v.color === "r" && v.turn === "p1" && v.counts.p0 === 2, "red 7 on red 5: on to p1");
  t.play("p1", y7);
  v = t.lv("p2");
  ok(v.color === "y" && v.turn === "p2", "yellow 7 on red 7 (the same number): yellow now");
  t.play("p2", ySkip);
  v = t.lv("p1");
  ok(v.turn === "p1" && v.log.some((e) => e.k === "skip" && e.p === "p0"), "a skip: p0 misses out, p1 plays");
  t.play("p1", yRev);
  v = t.lv("p0");
  ok(v.dir === -1 && v.turn === "p0" && v.log.some((e) => e.k === "rev"), "a reverse: play turns the other way, back to p0");
  t.rig({ pile: [g8] });
  t.draw("p0");
  ok(t.lv("p0").turn === "p2", "and on backwards: p0 draws, nothing fits, p2 is next");
  seed = s0;
});

test("lastcard: two players: a reverse is a skip, and so is a +2", () => {
  const s0 = seed;
  const t = lcTable(2);
  const [r5, rRev, rSkip, rd2, r1] = [lcId("r", "5"), lcId("r", "rev"), lcId("r", "skip"), lcId("r", "d2"), lcId("r", "1")];
  t.rig({ top: r5, turn: "p0", hands: { p0: [rRev, rSkip, rd2, r1], p1: [lcId("b", "1"), lcId("b", "2")] } });
  t.play("p0", rRev);
  ok(t.lv("p0").turn === "p0" && t.lv("p0").dir === 1, "a reverse with two players: p0 goes again");
  t.play("p0", rSkip);
  ok(t.lv("p0").turn === "p0", "a skip: p0 again");
  t.play("p0", rd2);
  ok(t.lv("p0").turn === "p0" && t.lv("p1").counts.p1 === 4, "a +2: p1 draws 2, and p0 goes again");
  t.advance(1000);
  ok(t.pensOf("p1").join() === "sip", "p1 takes a sip for the +2");
  seed = s0;
});

test("lastcard: +2 and +4 land at once with stacking off; a wild picks the colour", () => {
  const s0 = seed;
  const t = lcTable(3);
  const [r5, rd2, rd2b, w, d4, b6] = [lcId("r", "5"), lcId("r", "d2"), lcId("r", "d2", 1), lcId(null, "wild"), lcId(null, "d4"), lcId("b", "6")];
  t.rig({ top: r5, turn: "p0", hands: { p0: [rd2, b6, lcId("g", "1")], p1: [rd2b, lcId("y", "1")], p2: [w, d4, lcId("y", "2")] } });
  t.play("p0", rd2);
  let v = t.lv("p2");
  ok(v.turn === "p2" && v.counts.p1 === 4 && v.pending === 0, "a +2: p1 draws 2 at once and misses the turn (their own +2 can't answer it)");
  t.play("p2", w);
  ok(t.lv("p2").top === rd2, "a wild needs a colour picked");
  t.g("p2", "play", { card: w, color: "purple", at: t.lv("p2").tn });
  ok(t.lv("p2").top === rd2, "one of the four");
  t.play("p2", w, "b");
  v = t.lv("p0");
  ok(v.top === w && v.color === "b" && v.turn === "p0" && v.log.some((e) => e.k === "play" && e.c === w && e.col === "b"), "a wild: blue now, and everyone hears it");
  t.play("p0", b6);
  t.rig({ turn: "p2" });
  t.play("p2", d4, "g");
  v = t.lv("p1");
  ok(v.color === "g" && v.counts.p0 === 5 && v.turn === "p1", "a +4: green now, p0 draws 4 and misses the turn");
  t.advance(1000);
  ok(t.pensOf("p1").join() === "sip" && t.pensOf("p0").join() === "two", "a sip for taking the +2, two for the +4");
  seed = s0;
});

test("lastcard: stacking: a +2 answers a +2, a +4 a +4, and whoever can't takes the lot", () => {
  const s0 = seed;
  const t = lcTable(3, { stack: true });
  const [r5, rd2, bd2, d4a, d4b] = [lcId("r", "5"), lcId("r", "d2"), lcId("b", "d2"), lcId(null, "d4"), lcId(null, "d4", 1)];
  t.rig({ top: r5, turn: "p0", hands: { p0: [rd2, d4a, lcId("g", "1")], p1: [bd2, d4b, lcId("y", "1")], p2: [lcId("g", "2"), lcId("g", "3")] } });
  t.play("p0", rd2);
  let v = t.lv("p1");
  ok(v.turn === "p1" && v.pending === 2 && v.pendingKind === "d2" && v.counts.p1 === 3, "a +2 waits on p1: answer it or take 2");
  ok(v.legal.join() === String(bd2), `only a +2 answers it (${v.legal.join()})`);
  t.play("p1", d4b, "y");
  ok(t.lv("p1").turn === "p1" && t.lv("p1").pending === 2, "a +4 doesn't answer a +2");
  t.play("p1", bd2);
  v = t.lv("p2");
  ok(v.turn === "p2" && v.pending === 4 && v.color === "b", "p1 stacks a +2: 4 waiting on p2");
  t.draw("p2");
  v = t.lv("p0");
  ok(v.counts.p2 === 6 && v.pending === 0 && v.turn === "p0", "p2 can't answer: takes all 4 and misses the turn");
  t.play("p0", d4a, "g");
  v = t.lv("p1");
  ok(v.pending === 4 && v.pendingKind === "d4" && v.legal.join() === String(d4b), "a +4 waits on p1, and only a +4 answers");
  t.play("p1", d4b, "r");
  v = t.lv("p2");
  ok(v.pending === 8 && v.color === "r", "8 waiting on p2");
  t.draw("p2");
  ok(t.lv("p0").counts.p2 === 14, "p2 takes all 8");
  t.advance(1000);
  ok(t.pensOf("p2").join() === "two,two", `two sips for each stack of 4 or more (${t.pensOf("p2").join()})`);
  seed = s0;
});

test("lastcard: drawing: a card that fits can be played or kept; one that doesn't passes the turn", () => {
  const s0 = seed;
  const t = lcTable(3);
  const [r5, r8, b2, g9, r1, r2] = [lcId("r", "5"), lcId("r", "8"), lcId("b", "2"), lcId("g", "9"), lcId("r", "1"), lcId("r", "2")];
  t.rig({ top: r5, turn: "p0", hands: { p0: [r1, b2], p1: [lcId("y", "3")], p2: [lcId("y", "4")] }, pile: [g9, r8] });
  t.draw("p0");
  let v = t.lv("p0");
  ok(v.turn === "p0" && v.drawn === r8 && v.legal.join() === String(r8) && v.hand.includes(r8), "p0 draws a red 8, which fits: play it or keep it");
  ok(t.lv("p1").drawn === null && !JSON.stringify(t.lv("p1")).includes(`"c":${r8}`), "nobody else learns what was drawn");
  t.draw("p0");
  ok(t.lv("p0").counts.p0 === 3, "a second draw on the same turn does nothing");
  t.play("p0", r1);
  ok(t.lv("p0").top === r5, "after a draw, only the card drawn can go down");
  t.play("p0", r8);
  ok(t.lv("p1").top === r8 && t.lv("p1").turn === "p1", "the red 8 goes down");
  t.draw("p1");
  v = t.lv("p2");
  ok(v.turn === "p2" && v.counts.p1 === 2, "p1 draws a green 9, which doesn't fit: on to p2");
  t.rig({ pile: [r2] });
  t.draw("p2");
  t.keep("p2");
  ok(t.lv("p0").turn === "p0" && t.lv("p0").counts.p2 === 2, "p2 draws one that fits and keeps it");
  // an empty draw pile is made again from the discards; the face-up card stays
  const st = t.s();
  st.pile = [];
  st.discard = [lcId("y", "5"), lcId("y", "6"), lcId("g", "6"), r8];
  t.draw("p0");
  v = t.lv("p0");
  ok(v.top === r8 && v.under === 1 && v.pile === 2 && v.log.some((e) => e.k === "shuffle"), `the discards are reshuffled into a new pile (${v.pile} left, ${v.under} down)`);
  // nothing at all left to draw: the turn passes
  st.pile = [];
  st.discard = [r8];
  const who = t.lv("p0").turn!;
  t.draw(who);
  ok(t.lv("p0").turn !== who && t.lv("p0").log.some((e) => e.k === "pass"), "no cards left anywhere: pass");
  seed = s0;
});

test("lastcard: calling last card, and catching someone who didn't", () => {
  const s0 = seed;
  const t = lcTable(3);
  const [r3, r7, r8] = [lcId("r", "3"), lcId("r", "7"), lcId("r", "8")];
  const deal = (p0: number[]) => t.rig({ top: r3, turn: "p0", dir: 1, hands: { p0, p1: [lcId("r", "4"), lcId("r", "5"), lcId("b", "1")], p2: [lcId("r", "6"), lcId("g", "1"), lcId("g", "2")] } });
  // no call: caught
  deal([r7, r8]);
  t.play("p0", r7);
  let v = t.lv("p2");
  ok(v.open === "p0" && v.counts.p0 === 1, "p0 is down to one without calling: open to a catch");
  t.g("p0", "catch", { pid: "p0" });
  ok(t.lv("p2").open === "p0", "you can't catch yourself");
  t.g("p2", "catch", { pid: "p0" });
  v = t.lv("p2");
  ok(v.open === null && v.counts.p0 === 3 && v.log.some((e) => e.k === "catch" && e.p === "p0" && e.by === "p2"), "p2 catches p0 first: p0 draws 2");
  t.g("p1", "catch", { pid: "p0" });
  ok(t.lv("p1").counts.p0 === 3, "a second catch finds nothing");
  t.advance(1000);
  ok(t.pensOf("p0").join() === "sip", "and p0 takes a sip");
  // called at two cards, before playing
  deal([r7, r8]);
  t.g("p0", "call");
  ok(t.lv("p1").called.includes("p0"), "p0 calls with two cards, on their turn");
  t.play("p0", r7);
  v = t.lv("p1");
  ok(v.open === null && v.counts.p0 === 1, "down to one, and safe");
  t.g("p1", "catch", { pid: "p0" });
  ok(t.lv("p1").counts.p0 === 1, "nobody can catch p0");
  // called just after playing, before anyone else moves
  deal([r7, r8]);
  t.play("p0", r7);
  ok(t.lv("p1").open === "p0", "open again");
  t.g("p0", "call");
  v = t.lv("p1");
  ok(v.open === null && v.called.includes("p0"), "p0 calls in time");
  t.g("p2", "catch", { pid: "p0" });
  ok(t.lv("p2").counts.p0 === 1, "too late to catch");
  // nobody catches before the next player moves: p0 got away with it
  deal([r7, r8]);
  t.play("p0", r7);
  t.play("p1", lcId("r", "4"));
  v = t.lv("p2");
  t.g("p2", "catch", { pid: "p0" });
  ok(v.open === null && t.lv("p2").counts.p0 === 1, "p1 moved: too late to catch p0");
  // a call means nothing at three cards; a hand that grows has to call again
  deal([r7, r8, lcId("b", "9")]);
  t.g("p0", "call");
  ok(!t.lv("p0").called.includes("p0"), "no call at three cards");
  deal([r7, r8]);
  t.g("p0", "call");
  t.rig({ pile: [lcId("g", "7")] });
  t.draw("p0");
  ok(!t.lv("p0").called.includes("p0") && t.lv("p0").counts.p0 === 3, "p0 called, then drew: the call is gone");
  t.advance(2000);
  ok(t.pensOf("p0").join() === "sip", "one catch, one sip, all along");
  seed = s0;
});

test("lastcard: a round ends when someone goes out; the most cards drink; first to the target wins", () => {
  const s0 = seed;
  const [r3, r7, rd2] = [lcId("r", "3"), lcId("r", "7"), lcId("r", "d2")];
  const t = lcTable(3, { target: 1 });
  t.rig({ top: r3, turn: "p0", hands: { p0: [r7], p1: [lcId("b", "1"), lcId("b", "2"), lcId("b", "3")], p2: [lcId("g", "1"), lcId("g", "2"), lcId("g", "3"), lcId("g", "4"), lcId("g", "5")] } });
  t.play("p0", r7);
  let v = t.lv("p1");
  ok(v.phase === "end" && v.winner === "p0" && v.champ === "p0" && v.wins.p0 === 1, "p0 goes out: first to one round wins the match");
  ok(v.most.join() === "p2" && v.counts.p2 === 5, "p2 is left holding the most");
  t.advance(2000);
  ok(t.pensOf("p2").join() === "sip" && t.events.some((e) => e.k === "fx" && e.fx === "win"), "p2 drinks a sip; the table hears the win");
  t.g("p1", "again");
  ok(t.lv("p1").phase === "end", "only the host starts a new match");
  const tn = t.lv("p0").tn;
  t.g("p0", "again");
  v = t.lv("p0");
  ok(v.phase === "setup" && Object.keys(v.wins).length === 0 && v.target === 1 && v.tn > tn && v.hand.length === 0, "a new match: back to setup, the score cleared, the rules kept");

  const u = lcTable(3, { target: 3 });
  u.rig({ top: r3, turn: "p0", hands: { p0: [r7], p1: [lcId("b", "1"), lcId("b", "2")], p2: [lcId("g", "1"), lcId("g", "2")] } });
  u.play("p0", r7);
  ok(u.lv("p0").phase === "round" && u.lv("p0").wins.p0 === 1, "first to 3: the round is over, not the match");
  ok(u.lv("p1").most.join() === "p1,p2", "a tie for the most: both drink");
  u.eng.hello("p9", "Late", false);
  u.eng.flush();
  ok(!u.lv("p9").order.includes("p9") && u.lv("p9").hand.length === 0, "someone who sits down now waits for the next round");
  u.g("p1", "next");
  ok(u.lv("p0").phase === "round", "only the host deals the next round");
  u.g("p0", "next");
  v = u.lv("p0");
  ok(v.phase === "play" && v.round === 2 && v.turn === "p1" && v.wins.p0 === 1 && ["p0", "p1", "p2", "p9"].every((p) => v.counts[p] === 7), "round 2: everyone dealt in, the late one too; p1 moves first; the score kept");
  u.rig({ top: r3, turn: "p1", dir: 1, hands: { p1: [rd2], p2: [lcId("g", "1")] } });
  u.play("p1", rd2);
  ok(u.lv("p0").phase === "round" && u.lv("p0").winner === "p1" && u.lv("p0").counts.p2 === 3, "going out on a +2: p2 still draws 2");

  const big = lcTable(12);
  const bv = big.lv("p11");
  ok(bv.order.length === 10 && !bv.order.includes("p11") && bv.hand.length === 0 && big.lv("p9").hand.length === 7, "twelve at the table: ten play, the last two sit the round out");
  seed = s0;
});

test("lastcard: an away phone draws after 15 s, the host can skip, and a player who leaves gives their cards back", () => {
  const s0 = seed;
  const t = lcTable(3);
  const r3 = lcId("r", "3");
  t.rig({ top: r3, turn: "p1", hands: { p0: [lcId("b", "1"), lcId("b", "2")], p1: [lcId("g", "1"), lcId("g", "2")], p2: [lcId("y", "1"), lcId("y", "2")] }, pile: [lcId("b", "9")] });
  t.eng.setOnline("p1", false);
  t.eng.flush();
  t.advance(LC_AWAY_MS - 1000);
  ok(t.lv("p0").turn === "p1", "an away phone gets 15 seconds");
  t.eng.setOnline("p2", false);
  t.eng.setOnline("p2", true);
  t.eng.flush();
  t.advance(1500);
  let v = t.lv("p0");
  ok(v.turn === "p2" && v.counts.p1 === 3 && v.log.some((e) => e.k === "auto" && e.p === "p1"), "then it draws one and passes (another phone coming and going doesn't put that off)");
  t.advance(60_000);
  ok(t.lv("p0").turn === "p2", "an open phone isn't hurried");
  const tn = t.lv("p0").tn;
  t.g("p1", "skip", { at: tn });
  ok(t.lv("p0").turn === "p2", "only the host can skip");
  t.g("p0", "skip", { at: tn });
  t.g("p0", "skip", { at: tn });
  v = t.lv("p0");
  ok(v.turn === "p0" && v.counts.p2 === 3, "the host's skip: p2 draws one and passes, and a doubled tap skips only once");
  for (const p of ["p0", "p2"]) t.eng.setOnline(p, false);
  t.eng.flush();
  t.advance(LC_AWAY_MS * 3);
  ok(t.lv("p0").turn === "p0", "with everyone away, the game waits");

  const u = lcTable(3);
  const total = () => {
    const st = u.s();
    return st.pile.length + st.discard.length + Object.values(st.hands).flat().length;
  };
  u.act("p0", { a: "leave" });
  v = u.lv("p1");
  ok(!v.order.includes("p0") && v.turn === "p1" && total() === 108, `p0 leaves on their turn: their cards go back under the pile (${total()}), p1 plays`);
  u.act("p2", { a: "watch", on: true });
  v = u.lv("p1");
  ok(v.phase === "setup" && v.hand.length === 0, "p2 sits down to watch: one player left, back to the deal");
  seed = s0;
});

test("lastcard: random rounds at every size: every card kept, every hand private, every round ends", () => {
  const s0 = seed;
  let rng = 12345;
  const r = () => (rng = (rng * 48271) % 2147483647) / 2147483647;
  const pick = <X>(a: X[]) => a[Math.floor(r() * a.length)];
  const colors: LcColor[] = ["r", "y", "g", "b"];
  let rounds = 0;
  let moves = 0;
  let bad = "";
  for (const [n, stack] of [[2, false], [3, true], [4, false], [6, true], [10, false], [10, true]] as [number, boolean][]) {
    const t = lcTable(n, { stack, target: 0 });
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    for (let round = 0; round < 3 && !bad; round++) {
      if (round > 0) t.g("p0", "next");
      for (let step = 0; step < 4000 && !bad; step++) {
        const st = t.s();
        const all = [...st.pile, ...st.discard, ...Object.values(st.hands).flat()];
        if (all.length !== 108 || new Set(all).size !== 108) bad = `${n} players: ${all.length} cards, ${new Set(all).size} different`;
        const v = t.lv("p0");
        if (v.phase !== "play") break;
        for (const p of ids) {
          const pv = t.lv(p);
          if (pv.hand.join() !== st.hands[p].slice().sort((a, b) => a - b).join() || pv.counts[p] !== st.hands[p].length) bad = `${p}'s view isn't its own hand`;
          if (pv.turn !== p && (pv.legal.length || pv.drawn !== null)) bad = `${p} can move out of turn`;
          if (pv.legal.some((c) => !pv.hand.includes(c) || !canPlay(c, pv.top, pv.color, pv.pendingKind))) bad = `${p} may play a card that doesn't fit`;
        }
        // someone left on one card, uncalled: caught now and then
        if (v.open && r() < 0.4) t.g(pick(ids.filter((p) => p !== v.open)), "catch", { pid: v.open });
        const me = t.lv(v.turn!);
        if (me.hand.length === 2 && r() < 0.6) t.g(me.turn!, "call");
        if (me.legal.length && r() < 0.85) t.play(me.turn!, pick(me.legal), pick(colors));
        else if (me.drawn !== null) t.keep(me.turn!);
        else t.draw(me.turn!);
        if (t.lv("p0").open && r() < 0.5) t.g(t.lv("p0").open!, "call");
        moves++;
      }
      const end = t.lv("p0");
      if (end.phase !== "round") bad = bad || `${n} players: round ${round + 1} never ended (${end.phase})`;
      else rounds++;
    }
  }
  ok(!bad, bad || `${rounds} rounds, ${moves} moves`);
  ok(rounds === 18, `every round ends with someone out (${rounds} of 18)`);
  seed = s0;
});

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

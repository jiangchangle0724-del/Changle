/* Engine flow tests: run with `npx tsx tests/engine.test.ts` */
import { countdown, cued, loaded, pressBy, reqOrder } from "../src/shared/dj/deck";
import { ENERGY, FAKE_MIX, heatLean, LEAN, mixFor } from "../src/shared/dj/curve";
import { recapOf } from "../src/party/dj/recap";
import { styleForRequest, trackFor } from "../src/shared/dj/requests";
import { DECK, MIX_FX, MIXER } from "../src/shared/dj/types";
import { freshRoom, RoomEngine, type Output } from "../src/shared/engine/room";
import { sortHand } from "../src/shared/euchre";
import { headToHeadPoints, presentMs } from "../src/shared/punchline";
import { ONLINE_GAMES, timesOf, type Action, type GameView, type PenaltyEvent, type RoomEvent } from "../src/shared/protocol";
import { potStep } from "../src/shared/engine/games/dice";
import { PARTY_KINDS, TILT_SIDES, barAngleAt, steadyMs } from "../src/shared/engine/games/limbo";
import { SCENES as DRAMA_SCENES } from "../src/data/drama";
import { COMMANDS as KING_COMMANDS, commandText } from "../src/data/king";
import { RULES as ROGUE_RULES, ruleWords } from "../src/data/rogue13";
import { DARES, promptText } from "../src/data/truthDare";
import { DEFAULT_SLICES, sliceLabel } from "../src/data/wheel";
import { SONG_ROWS } from "../src/data/songs";
import { CAT_BIT, fromRow, inPool, moodOf, pickSong } from "../src/shared/songs";

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

test("tune: synced clips, buzz, wrong locks out, points by speed", () => {
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

test("tune: real songs play in sync, never twice, and the reveal names the song", () => {
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

test("tune: the host's phone brings today's charts, and only good rows get in", () => {
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

test("tune: pools by language and category, and the quiz where everyone answers", () => {
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

test("tune: a pool of several languages and categories", () => {
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

test("dj: songs asked for by name: one each, up next on the deck off the air, the drop plays its remix, the DJ drops it itself; a typed name shows only to its player", () => {
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
  ok(nothing(g("p2", "req", { text: "another" })), "one each");
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
  for (let i = 1; i <= 10; i++) e2.hello(`q${i}`, `Q${i}`, false);
  e2.flush();
  for (let i = 1; i <= 10; i++) {
    e2.act(`q${i}`, { a: "g", g: { x: "req", text: `song ${i}` } });
    e2.flush();
  }
  ok((e2.view("q1").game as V<"dj">).deck.reqs.length === 8, "8 waiting at most, the whole table");
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
  // the drop into it: the DJ fades out, then the song plays whole, the deck waiting
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
  ok(!!song && song.yt === ID && song.by === "p2" && song.at === clock + 2 * 4 * 480, "it lands: the whole song plays from two bars on (the DJ fades out first)");
  ok(nothing(g("p1", "charge", { n: 8 })) && nothing(g("p1", "pad", { pad: "horn" })) && nothing(g("p1", "fader", { value: 0.3 })), "while it plays the deck waits: no build-up, no pads, no fader");
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

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

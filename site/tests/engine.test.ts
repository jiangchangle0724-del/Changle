/* Engine flow tests: run with `npx tsx tests/engine.test.ts` */
import { freshRoom, RoomEngine, type Output } from "../src/shared/engine/room";
import { sortHand } from "../src/shared/euchre";
import { headToHeadPoints, presentMs } from "../src/shared/punchline";
import type { Action, GameView, PenaltyEvent, RoomEvent } from "../src/shared/protocol";
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
  ok(e.exists && e.d.seats.length === 0 && e.d.front === ["truth", "rogue", "trip", "superlatives", "king", "postit", "limbo", "prompts", "euchre", "dice", "freeze", "wheel", "undercover", "tune", "punchline", "draw"].indexOf("punchline"), "the table exists with the game queued, nobody seated");
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

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

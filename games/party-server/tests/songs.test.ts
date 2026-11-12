// The songs: a song as a show (its teaching, the video's intro, the count-in, the dance on its
// beats), the thirteen with their own dance laid along their parts, a room playing one (the songbook's
// first beat, 找拍子 for a song nobody has danced yet, none for a measured one, the speaker moving
// the beat to where the video really is), and the songbook's checks of a speaker's taps. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEAD_IN_MS, SONG_SYNC_MS, Session, TAP_GAP_MS, type From } from "../src/server/session";
import { checkTapped, MIN_TAPS } from "../src/server/tapped";
import { anchorsOf, buildShow, danceStart, planRun, songStart, type Show } from "../src/shared/show";
import { moveAnim } from "../src/client/coach/moves";
import { moveById } from "../src/shared/catalog";
import { SONGS, songBeat, songById, songMoves } from "../src/shared/songs";
import { STEPS } from "../src/shared/steps";

const SPEAKER: From = { role: "speaker", playerId: null };
const ANN: From = { role: "player", playerId: "ann-000001" };
/** a song without its own dance (its beat found by 找拍子) */
const SONG = SONGS.find((s) => !s.aligned)!;
const GANGNAM = songById("song-gangnam-style")!;
/**
 * the videos' lengths (ms), as their players gave them (2026-11-11): each dance is over before its
 * video (江南Style's: where its song ends in the video, 218.6 s; the video goes on to 252 s off the beat)
 */
const VIDEO_MS: Record<string, number> = {
  "song-gangnam-style": 218_700,
  "song-apt": 173_401,
  "song-ai-ni": 220_081,
  "song-zui-xuan-min-zu-feng": 284_001,
  "song-yi-xiao-jiang-hu": 230_861,
  "song-macarena": 222_101,
  // (2026-11-12)
  "song-cupid-shuffle": 232_000,
  "song-cha-cha-slide": 253_981,
  "song-ymca": 241_200,
  "song-watch-me": 202_400,
  "song-ketchup": 210_900,
  "song-gee": 240_100,
  "song-hai-cao-wu": 300_200,
};

function ready() {
  let now = 1_000_000;
  const s = new Session(Session.create("ABCD", now, 5_000), () => now);
  s.songbook = { [SONG.id]: SONG.firstBeatMs };
  s.connect(SPEAKER);
  s.handle(SPEAKER, { t: "clock", offsetMs: -995_000, rttMs: 20 });
  s.connect(ANN, "Ann");
  // (the TV's delay measured: the song starts at once, and a beat found here is for every room)
  s.handle(ANN, { t: "act", action: { type: "START_CALIBRATION" } });
  s.handle(SPEAKER, { t: "calibrated", audioOffsetMs: 0 });
  s.flush();
  return { s, advance: (ms: number) => (now += ms) };
}

describe("a song as a show", () => {
  it("every song is in order: its moves are known and the coach dances them, its dance whole 8-counts and halves (a caller's as long as its calls)", () => {
    for (const song of SONGS) {
      const show = buildShow(song.id, "dance")!;
      assert.equal(show.kind, "song", song.id);
      if (!song.calls) assert.equal(song.beats % 4, 0, song.id);
      assert.equal(show.dance.length, song.beats);
      assert.ok(show.dance.every((b) => b.move !== null && b.score && b.count >= 1 && b.count <= 8), song.id);
      assert.ok(show.dance.every((b) => moveAnim(b.move!.id) !== null), `${song.id}: every move animated`);
      assert.ok(song.bpm >= 60 && song.bpm <= 200);
      assert.equal(songById(song.id), song);
      assert.ok(!!song.dance !== !!song.pattern, `${song.id}: its own dance or a pattern`);
    }
  });

  it("the songs with their own dance: measured, laid along the song, over before the video is", () => {
    const own = SONGS.filter((s) => s.aligned);
    assert.deepEqual(own.map((s) => s.id).sort(), Object.keys(VIDEO_MS).sort());
    for (const song of own) {
      const steps = song.dance!;
      assert.equal(steps.reduce((n, [, k]) => n + k, 0), song.beats, song.id);
      for (const [move, n, from = 1] of steps) {
        assert.ok(moveById(move), `${song.id}: ${move}`);
        // whole 8-counts, or half of one counted 5 to 8; a caller's song (or one with 12-beat lines) as long as each part needs
        if (song.calls) assert.ok(n >= 1 && (from === 1 || (n === 4 && from === 5)), `${song.id}: ${move} ${n} from ${from}`);
        else assert.ok((n % 8 === 0 && from === 1) || (n === 4 && from === 5), `${song.id}: ${move} ${n} from ${from}`);
      }
      for (const id of song.teach ?? []) assert.ok(songMoves(song).includes(id), `${song.id} teaches ${id}`);
      assert.ok(song.firstBeatMs + song.beats * (60000 / song.bpm) < VIDEO_MS[song.id]!, `${song.id} ends in time`);
    }
  });

  it("each of a song's own moves is taught step by step: how to stand, counts 1 to 8 each once, in both languages", () => {
    for (const song of SONGS.filter((s) => s.aligned)) {
      for (const id of songMoves(song)) {
        const st = STEPS[id];
        assert.ok(st, `${song.id}: ${id} has its steps`);
        assert.ok(st.ready[0] && st.ready[1], `${id}: how to stand`);
        // (a move only ever danced as a half phrase, 5 to 8, starts at 5)
        const halves = song.dance!.filter(([m]) => m === id);
        let next = halves.every(([, n, from]) => n === 4 && from === 5) ? 5 : 1;
        for (const [from, to, zh, en] of st.counts) {
          assert.equal(from, next, `${id}: count ${next} next`);
          assert.ok(to >= from && zh.length > 0 && en.length > 0, `${id}: ${from}-${to}`);
          next = to + 1;
        }
        assert.equal(next, 9, `${id}: up to 8`);
        if (st.tip) assert.ok(st.tip[0] && st.tip[1]);
      }
    }
  });

  it("the new songs' parts start where their songs do (in each video's beats, from the timed lyrics)", () => {
    /** the move and count on a beat of the video's grid */
    const onVideo = (id: string, videoBeat: number, firstVideoBeat: number) => songBeat(songById(id)!, videoBeat - firstVideoBeat);
    // Cupid Shuffle: "to the right…" on a round's first count
    for (const b of [128, 224, 256, 384, 416]) assert.deepEqual(onVideo("song-cupid-shuffle", b, 32), { move: "cupid-right", count: 1 });
    assert.deepEqual(onVideo("song-cupid-shuffle", 152, 32), { move: "cupid-walk", count: 1 });
    // the Cha-Cha Slide: its calls, each counted from its own first beat
    assert.deepEqual(onVideo("song-cha-cha-slide", 114, 64), { move: "cha-left", count: 1 });
    assert.deepEqual(onVideo("song-cha-cha-slide", 117, 64), { move: "cha-back", count: 2 });
    assert.deepEqual(onVideo("song-cha-cha-slide", 326, 64), { move: "cha-freeze", count: 3 });
    assert.deepEqual(onVideo("song-cha-cha-slide", 346, 64), { move: "cha-low", count: 1 });
    // Y.M.C.A.: the letters on an 8-count's first four beats
    for (const b of [96, 104, 128, 232, 400, 464]) assert.deepEqual(onVideo("song-ymca", b, 8), { move: "ymca-letters", count: 1 });
    // Watch Me: "now watch me whip" on 64, 224, 384; the stanky leg on 128
    for (const b of [64, 224, 384]) assert.deepEqual(onVideo("song-watch-me", b, 32), { move: "wm-whip", count: 1 });
    assert.deepEqual(onVideo("song-watch-me", 128, 32), { move: "wm-stanky", count: 1 });
    // the Ketchup Song: each 12-beat line, the hands 1-8, the forehead 5-8
    for (const b of [54, 66, 78, 145, 157, 169, 215, 299]) assert.deepEqual(onVideo("song-ketchup", b, 14), { move: "ketchup-hands", count: 1 });
    assert.deepEqual(onVideo("song-ketchup", 62, 14), { move: "ketchup-head", count: 5 });
    // Gee: the crab on "Gee gee gee", the chorus' sparkle; the second half half a phrase on
    for (const b of [72, 88, 172, 188]) assert.deepEqual(onVideo("song-gee", b, 40), { move: "gee-crab", count: 1 });
    for (const b of [128, 228, 292, 324]) assert.deepEqual(onVideo("song-gee", b, 40), { move: "gee-sparkle", count: 1 });
    // 海草舞: "人海啊 茫茫啊" on 48, 240, 464
    for (const b of [48, 240, 464]) assert.deepEqual(onVideo("song-hai-cao-wu", b, 16), { move: "hc-look", count: 1 });
  });

  it("the Cha-Cha Slide teaches its basic steps (the song calls the rest as it goes)", () => {
    const song = songById("song-cha-cha-slide")!;
    const show = buildShow(song.id, "learn")!;
    assert.deepEqual([...new Set(show.lead.map((b) => b.move!.id))], song.teach);
    assert.equal(show.lead.length, song.teach!.length * 16);
  });

  it("江南Style: the build's half phrase counted 5 to 8, then the chorus from 1 on the song's beat 156", () => {
    assert.deepEqual(songBeat(GANGNAM, 143), { move: "disco-point", count: 8 });
    assert.deepEqual(songBeat(GANGNAM, 144), { move: "horse-ride", count: 5 });
    assert.deepEqual(songBeat(GANGNAM, 147), { move: "horse-ride", count: 8 });
    assert.deepEqual(songBeat(GANGNAM, 148), { move: "horse-ride", count: 1 });
    assert.deepEqual(songBeat(GANGNAM, 156), { move: "horse-lasso", count: 1 });
    // the dance starts on the video's beat 8 (its grid: beat 0 at 373 ms, 132 BPM)
    assert.ok(Math.abs(GANGNAM.firstBeatMs + 148 * (60000 / 132) - (373 + 156 * (60000 / 132))) < 1);
    assert.deepEqual(songMoves(GANGNAM), ["gangnam-bounce", "horse-ride", "hey-point", "disco-point", "horse-lasso", "sexy-lady", "gangnam-strut", "gangnam-pose"]);
    // the chorus as the video dances it: "Eh~ Sexy Lady" is the hip shake, the line after it the bus's disco
    assert.deepEqual([156, 164, 172, 180, 188, 196, 204, 212].map((b) => songBeat(GANGNAM, b - 8).move), ["horse-ride", "horse-lasso", "horse-ride", "horse-lasso", "sexy-lady", "disco-point", "sexy-lady", "horse-ride"]);
    const show = buildShow(GANGNAM.id, "dance")!;
    assert.equal(show.dance[148]!.move!.id, "horse-ride");
    assert.equal(show.dance[148]!.count, 1);
  });

  it("just dance: no teaching; the video's intro, a count-in on its last 4 beats, the dance on its beats", () => {
    const show = buildShow(SONG.id, "dance")!;
    assert.equal(show.lead.length, 0);
    assert.equal(show.introMs, SONG.firstBeatMs);
    assert.equal(show.tail.length, 0);
    // the pattern round and round, a move for its 8-counts
    show.dance.forEach((b, i) => assert.equal(b.move!.id, songBeat(SONG, i).move));
    assert.ok(show.dance.every((b, i) => b.count === (i % 8) + 1));
    const lead = 10_000;
    const a = anchorsOf("learning", null, { routineId: SONG.id, bpm: SONG.bpm, beatsPerBar: 4, totalBeats: SONG.beats, mode: "dance", leadStartAt: lead, fromBeat: 0, introMs: SONG.firstBeatMs })!;
    const start = danceStart(show, a)!;
    assert.equal(start, lead + SONG.firstBeatMs, "the first beat: the intro after the video starts");
    const run = planRun(show, a);
    const intro = run.filter((b) => b.stage === "intro");
    const count = run.filter((b) => b.stage === "countdown");
    assert.ok(intro.length > 0 && intro.every((b) => b.t >= lead - 0.5 && !b.score));
    assert.deepEqual(count.map((b) => b.count), [4, 3, 2, 1]);
    assert.equal(count[3]!.t + show.beatMs, start);
    // the intro's counts lead into the dance's 1 (…, 3, 4 before the count-in's 4, 3, 2, 1)
    assert.equal(intro.at(-1)!.count, 4);
    assert.equal(run.find((b) => b.stage === "dance")!.t, start);
  });

  it("learn first: each move taught once, 8 to watch and 8 to follow, at 70% of the song's tempo", () => {
    const show = buildShow(SONG.id, "learn")!;
    const moves = songMoves(SONG);
    assert.equal(show.lead.length, moves.length * 16);
    assert.ok(Math.abs(show.lead[0]!.ms - 60000 / (SONG.bpm * 0.7)) < 1e-6);
    assert.deepEqual(show.lead.filter((_, i) => i % 16 === 0).map((b) => b.move!.id), moves);
    assert.ok(show.lead.every((b, i) => b.stage === (i % 16 < 8 ? "watch" : "follow") && b.score === (b.stage === "follow") && b.danceBeat === null));
  });

  it("a room's tapped first beat moves the dance", () => {
    const show = buildShow(SONG.id, "dance")!;
    const a = { leadStartAt: 10_000, danceStartAt: null, fromBeat: 0, introMs: SONG.firstBeatMs + 120 };
    assert.equal(danceStart(show, a), 10_000 + SONG.firstBeatMs + 120);
  });
});

describe("a room playing a song", () => {
  it("waits for the speaker to have the video ready, then starts it after the lead-in; the songbook's first beat; the dance by itself after the intro", () => {
    const { s, advance } = ready();
    s.songbook = { [SONG.id]: SONG.firstBeatMs + 40 };
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "dance" } });
    assert.equal(s.d.routine!.introMs, SONG.firstBeatMs + 40);
    assert.equal(s.d.routine!.leadStartAt, null, "waiting for the video");
    assert.equal(s.d.state.phase, "learning");
    s.handle(ANN, { t: "songReady" });
    assert.equal(s.d.routine!.leadStartAt, null, "only the speaker says so");
    advance(2_000);
    s.flush();
    s.handle(SPEAKER, { t: "songReady" });
    assert.equal(s.d.routine!.leadStartAt, 7_000 + LEAD_IN_MS);
    assert.ok(s.flush().out.some((o) => "msg" in o && o.msg.t === "state"), "every page hears of it");
    advance(LEAD_IN_MS);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    assert.equal(s.d.state.routineStartAt, 7_000 + LEAD_IN_MS + SONG.firstBeatMs + 40);
  });

  it("a song nobody has danced yet: everyone taps along to it first (找拍子), then it starts as any song does", () => {
    const { s, advance } = ready();
    const bob: From = { role: "player", playerId: "bob-000002" };
    s.connect(bob, "Bob");
    s.songbook = {};
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "dance" } });
    assert.equal(s.d.state.phase, "learning");
    assert.equal(s.d.routine!.tapIn, true);
    assert.equal(s.d.routine!.introMs, SONG.firstBeatMs, "the catalogue's guess until then");
    s.flush();
    // anyone's taps go on to the speaker, not faster than a beat could be
    s.handle(bob, { t: "tap", at: 9_000 });
    s.handle(bob, { t: "tap", at: 9_050 });
    advance(TAP_GAP_MS);
    s.handle(ANN, { t: "tap", at: 9_400 });
    s.handle({ role: "player", playerId: "zed-000009" }, { t: "tap", at: 9_500 });
    const taps = s.flush().out.flatMap((o) => ("msg" in o && o.msg.t === "tap" ? [{ to: o.to, ...o.msg }] : []));
    assert.deepEqual(taps, [
      { to: "speaker", t: "tap", at: 9_000, playerId: "bob-000002" },
      { to: "speaker", t: "tap", at: 9_400, playerId: "ann-000001" },
    ]);
    // the song waits for the beat: the video ready isn't enough, and the host can't skip to the dance
    s.handle(SPEAKER, { t: "songReady" });
    assert.equal(s.d.routine!.leadStartAt, null);
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    assert.equal(s.d.state.phase, "learning");
    const err = s.flush().out.find((o) => "msg" in o && o.msg.t === "error");
    assert.ok(err && "msg" in err && err.msg.t === "error" && err.msg.code === "song_tapping");
    // only the speaker's beat counts, and only one that passes the songbook's check
    s.handle(ANN, { t: "songTapped", firstBeatMs: 7_300, taps: 16, spreadMs: 20, durationMs: null });
    assert.equal(s.d.routine!.tapIn, true);
    s.handle(SPEAKER, { t: "songTapped", firstBeatMs: 7_300, taps: 3, spreadMs: 20, durationMs: null });
    assert.equal(s.d.routine!.tapIn, true);
    const bad = s.flush().out.find((o) => "msg" in o && o.msg.t === "error");
    assert.ok(bad && "to" in bad && bad.to === "speaker" && "msg" in bad && bad.msg.t === "error" && bad.msg.code === "bad_taps");
    s.handle(SPEAKER, { t: "songTapped", firstBeatMs: 7_300.4, taps: 18, spreadMs: 22, durationMs: 250_000 });
    assert.equal(s.d.routine!.tapIn, undefined);
    assert.equal(s.d.routine!.introMs, 7_300);
    assert.equal(s.songbook[SONG.id], 7_300);
    const out = s.flush().out;
    const kept = out.find((o) => "songbook" in o);
    assert.ok(kept && "songbook" in kept && kept.songbook.songId === SONG.id && kept.songbook.tapped.firstBeatMs === 7_300 && kept.songbook.tapped.taps === 18);
    assert.ok(kept && "songbook" in kept && kept.songbook.tapped.calibrated === true, "found where the TV's delay was measured");
    assert.ok(out.some((o) => "msg" in o && o.msg.t === "state"), "every page hears of it");
    // taps are for 找拍子 only
    s.handle(ANN, { t: "tap", at: 12_000 });
    assert.ok(!s.flush().out.some((o) => "msg" in o && o.msg.t === "tap"));
    // and the song starts as any song does
    s.handle(SPEAKER, { t: "songReady" });
    assert.ok(s.d.routine!.leadStartAt !== null);
    advance(LEAD_IN_MS);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    assert.equal(s.d.state.routineStartAt, s.d.routine!.leadStartAt! + 7_300);
  });

  it("a room that skipped measuring its TV: the beat it finds is used there, not kept for every room", () => {
    let now = 1_000_000;
    const s = new Session(Session.create("ABCD", now, 5_000), () => now);
    s.connect(SPEAKER);
    s.handle(SPEAKER, { t: "clock", offsetMs: -995_000, rttMs: 20 });
    s.connect(ANN, "Ann");
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "dance" } });
    assert.equal(s.d.state.phase, "calibrating", "the TV's delay first");
    s.handle(ANN, { t: "act", action: { type: "SKIP_CALIBRATION" } });
    assert.equal(s.d.state.phase, "learning");
    assert.equal(s.d.routine!.tapIn, true);
    now += 30_000;
    s.flush();
    s.handle(SPEAKER, { t: "songTapped", firstBeatMs: 7_300, taps: 18, spreadMs: 22, durationMs: 250_000 });
    assert.equal(s.d.routine!.tapIn, undefined);
    assert.equal(s.d.routine!.introMs, 7_300);
    assert.equal(s.songbook[SONG.id], 7_300, "this room dances it again without 找拍子");
    assert.ok(!s.flush().out.some((o) => "songbook" in o), "late by the TV's delay: not for other rooms");
  });

  it("a song whose dance is set to the song's own parts: the tapped beat moves its first beat onto the grid, by less than a beat", () => {
    const fake = { beatMs: 500, song: { aligned: true, firstBeatMs: 10_000 } } as unknown as Show;
    assert.equal(songStart(fake, 10_120), 10_120, "near: the tapped beat");
    assert.equal(songStart(fake, 1_620), 10_120, "a few beats before: the same grid, at the song's part");
    assert.equal(songStart(fake, 17_380), 9_880);
    const loose = { beatMs: 500, song: { firstBeatMs: 10_000 } } as unknown as Show;
    assert.equal(songStart(loose, 1_620), 1_620, "a song without parts starts where it was tapped");
  });

  it("a song with its own dance needs no 找拍子: it starts on its measured beat", () => {
    const { s, advance } = ready();
    s.songbook = {};
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: GANGNAM.id, mode: "dance" } });
    assert.equal(s.d.state.phase, "learning");
    assert.equal(s.d.routine!.tapIn, undefined);
    assert.equal(s.d.routine!.introMs, GANGNAM.firstBeatMs);
    s.handle(SPEAKER, { t: "songReady" });
    advance(LEAD_IN_MS);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    assert.equal(s.d.state.routineStartAt, s.d.routine!.leadStartAt! + GANGNAM.firstBeatMs);
  });

  it("nobody found the beat in time: back to the lobby, and everyone is told", () => {
    const { s } = ready();
    s.songbook = {};
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "learn" } });
    s.flush();
    s.handle(SPEAKER, { t: "songFailed", why: "notap" });
    assert.equal(s.d.state.phase, "lobby");
    assert.equal(s.d.routine!.tapIn, undefined);
    const err = s.flush().out.find((o) => "msg" in o && o.msg.t === "error");
    assert.ok(err && "msg" in err && err.msg.t === "error" && err.msg.code === "song_notap");
  });

  it("YouTube won't play it here: back to the lobby, and everyone is told", () => {
    const { s } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "learn" } });
    s.flush();
    s.handle(SPEAKER, { t: "songFailed", why: "bad" });
    assert.equal(s.d.state.phase, "lobby");
    const err = s.flush().out.find((o) => "msg" in o && o.msg.t === "error");
    assert.ok(err && "msg" in err && err.msg.t === "error" && err.msg.code === "song_blocked");
  });

  it("the speaker moves the beat to where the video really is: off by more than a little, from the speaker only", () => {
    const { s, advance } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "dance" } });
    s.handle(SPEAKER, { t: "songReady" });
    advance(LEAD_IN_MS);
    s.tick();
    s.flush();
    const was = s.d.state.routineStartAt!;
    s.handle(SPEAKER, { t: "songAt", startAt: was + SONG_SYNC_MS - 5 });
    assert.equal(s.d.state.routineStartAt, was, "close enough");
    s.handle(ANN, { t: "songAt", startAt: was + 300 });
    assert.equal(s.d.state.routineStartAt, was, "not from a phone");
    s.handle(SPEAKER, { t: "songAt", startAt: was + 180.4 });
    assert.equal(s.d.state.routineStartAt, was + 180);
    const st = s.flush().out.find((o) => "msg" in o && o.msg.t === "state");
    assert.ok(st, "every page hears of it");
    // (a video a minute and more late, an ad or stopped till someone tapped it: the dance follows it)
    s.handle(SPEAKER, { t: "songAt", startAt: was + 90_000 });
    assert.equal(s.d.state.routineStartAt, was + 90_000, "however late");
  });

  it("the video stops: the dance waits for it (the coach and the phones too), then picks up where the video is", () => {
    const { s, advance } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: GANGNAM.id, mode: "dance" } });
    s.handle(SPEAKER, { t: "songReady" });
    advance(LEAD_IN_MS);
    s.tick();
    s.flush();
    const was = s.d.state.routineStartAt!;
    const r = s.d.routine!;
    assert.ok(anchorsOf(s.d.state.phase, was, r), "playing");
    // only the speaker says the video stopped
    s.handle(ANN, { t: "songStall" });
    assert.equal(s.d.routine!.heldAt, undefined);
    advance(20_000);
    s.handle(SPEAKER, { t: "songStall" });
    const heldAt = s.d.routine!.heldAt!;
    assert.ok(heldAt > 0);
    assert.ok(s.flush().out.some((o) => "msg" in o && o.msg.t === "state" && o.msg.routine?.heldAt === heldAt), "every page hears of it");
    assert.equal(anchorsOf(s.d.state.phase, s.d.state.routineStartAt, s.d.routine), null, "nothing plays while held");
    s.handle(SPEAKER, { t: "songStall" });
    assert.equal(s.d.routine!.heldAt, heldAt, "held once");
    // the dance's end waits: long past where it would have been over, it isn't
    advance(GANGNAM.beats * (60000 / GANGNAM.bpm) + 60_000);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    // the video plays again, a long way behind: the dance picks up from where the video is
    const late = s.d.state.routineStartAt! + 70_000;
    s.handle(SPEAKER, { t: "songAt", startAt: late });
    assert.equal(s.d.routine!.heldAt, undefined);
    assert.equal(s.d.state.routineStartAt, late);
    assert.ok(anchorsOf(s.d.state.phase, s.d.state.routineStartAt, s.d.routine), "playing again");
    assert.ok(s.flush().out.some((o) => "msg" in o && o.msg.t === "state" && o.msg.routine?.heldAt === undefined));
    // and it ends with the song
    advance(late - was + GANGNAM.beats * (60000 / GANGNAM.bpm) + 5_000);
    s.tick();
    assert.equal(s.d.state.phase, "results");
  });

  it("paused while the video was stuck: 继续 tells the video to play again (and a phone can't hold a dance)", () => {
    const { s, advance } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: GANGNAM.id, mode: "dance" } });
    s.handle(SPEAKER, { t: "songReady" });
    advance(LEAD_IN_MS);
    s.tick();
    advance(10_000);
    s.handle(SPEAKER, { t: "songStall" });
    s.handle(ANN, { t: "act", action: { type: "PAUSE" } });
    assert.ok(s.d.routine!.pausedAt !== undefined && s.d.routine!.heldAt !== undefined);
    // (paused: what the video says waits for 继续)
    s.handle(SPEAKER, { t: "songAt", startAt: s.d.state.routineStartAt! + 5_000 });
    assert.ok(s.d.routine!.heldAt !== undefined);
    advance(3_000);
    s.handle(ANN, { t: "act", action: { type: "RESUME" } });
    assert.equal(s.d.routine!.pausedAt, undefined);
    assert.equal(s.d.routine!.heldAt, undefined);
  });

  it("no going back a phrase in a song; the library's dances ignore the speaker's song clock", () => {
    const { s, advance } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "dance" } });
    s.handle(SPEAKER, { t: "songReady" });
    advance(LEAD_IN_MS);
    s.tick();
    s.flush();
    s.handle(ANN, { t: "act", action: { type: "RESTART_SECTION" } });
    const err = s.flush().out.find((o) => "msg" in o && o.msg.t === "error");
    assert.ok(err && "msg" in err && err.msg.t === "error" && err.msg.code === "not_for_songs");
    s.handle(ANN, { t: "act", action: { type: "BACK_TO_LOBBY" } });
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "square-easy", mode: "dance" } });
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    const at = s.d.state.routineStartAt;
    s.handle(SPEAKER, { t: "songAt", startAt: at! + 500 });
    assert.equal(s.d.state.routineStartAt, at);
  });
});

describe("the songbook's check of a speaker's taps", () => {
  const beatMs = 60000 / SONG.bpm;
  it("takes taps that agree, near where the song's beat should start", () => {
    const t = checkTapped(SONG.id, { firstBeatMs: SONG.firstBeatMs + beatMs, taps: 16, spreadMs: 25 }, 123);
    assert.deepEqual(t, { firstBeatMs: Math.round(SONG.firstBeatMs + beatMs), taps: 16, spreadMs: 25, at: 123 });
  });
  it("turns away a song there isn't, too few taps, taps all over, a first beat far off", () => {
    assert.equal(typeof checkTapped("song-nope", { firstBeatMs: 1000, taps: 16, spreadMs: 10 }, 0), "string");
    assert.equal(typeof checkTapped(SONG.id, { firstBeatMs: SONG.firstBeatMs, taps: MIN_TAPS - 1, spreadMs: 10 }, 0), "string");
    assert.equal(typeof checkTapped(SONG.id, { firstBeatMs: SONG.firstBeatMs, taps: 16, spreadMs: beatMs * 0.3 }, 0), "string");
    assert.equal(typeof checkTapped(SONG.id, { firstBeatMs: 30_000, taps: 16, spreadMs: 10, durationMs: 30_000 + SONG.beats * beatMs - 1 }, 0), "string");
    assert.equal(typeof checkTapped(SONG.id, { firstBeatMs: -5, taps: 16, spreadMs: 10 }, 0), "string");
    assert.equal(typeof checkTapped(SONG.id, { firstBeatMs: "7300", taps: 16, spreadMs: 10 }, 0), "string");
    assert.equal(typeof checkTapped(SONG.id, null, 0), "string");
  });
});

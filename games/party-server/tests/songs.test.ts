// The songs: a song as a show (its teaching, the video's intro, the count-in, the dance on its
// beats), every one's beat measured in its video and its dance over before the video is, the
// fourteen with their own dance laid along their parts, a room playing one (straight from a phone's
// pick, on its measured beat; the speaker moving the beat to where the video really is), and the
// coach's look for each. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEAD_IN_MS, SONG_SYNC_MS, Session, type From } from "../src/server/session";
import { anchorsOf, buildShow, danceStart, planRun } from "../src/shared/show";
import { moveAnim } from "../src/client/coach/moves";
import { BASE, exaggerate, over } from "../src/client/coach/pose";
import { PLAIN, faceMoves, faceOf, songOfMove, styleOf } from "../src/client/coach/style";
import { moveById } from "../src/shared/catalog";
import { SONGS, songBeat, songById, songMoves } from "../src/shared/songs";
import { STEPS } from "../src/shared/steps";

const SPEAKER: From = { role: "speaker", playerId: null };
const ANN: From = { role: "player", playerId: "ann-000001" };
/** a song danced to the library's moves, round and round */
const SONG = SONGS.find((s) => !s.aligned)!;
const GANGNAM = songById("song-gangnam-style")!;
/**
 * the videos' lengths (ms), as their players gave them (2026-11-11 and 12): each dance is over before
 * its video (江南Style's: where its song ends in the video, 218.6 s; the video goes on to 252 s off the beat)
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
  "song-gokuraku-jodo": 216_000,
  // (the six danced to the library's moves, 2026-11-12)
  "song-dynamite": 223_381,
  "song-gentleman": 233_081,
  "song-levitating": 230_121,
  "song-waka-waka": 210_701,
  "song-uptown-funk": 270_421,
  "song-cant-stop-the-feeling": 285_861,
};

/** A room with its speaker and Ann (the host) in. */
function ready() {
  let now = 1_000_000;
  const s = new Session(Session.create("ABCD", now, 5_000), () => now);
  s.connect(SPEAKER);
  s.handle(SPEAKER, { t: "clock", offsetMs: -995_000, rttMs: 20 });
  s.connect(ANN, "Ann");
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

  it("every song's beat is measured in its video: its dance over before the video is, a count-in's room before it", () => {
    assert.deepEqual(SONGS.map((s) => s.id).sort(), Object.keys(VIDEO_MS).sort());
    for (const song of SONGS) {
      const beatMs = 60000 / song.bpm;
      assert.ok(song.firstBeatMs + song.beats * beatMs < VIDEO_MS[song.id]!, `${song.id} ends in time`);
      // (the count-in plays over the video's intro: it starts once the video has)
      assert.ok(song.firstBeatMs >= 4 * beatMs, `${song.id}: a count-in before its first beat`);
    }
  });

  it("the songs with their own dance: laid along the song", () => {
    const own = SONGS.filter((s) => s.aligned);
    assert.equal(own.length, 14);
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
    // 極楽浄土: "歌えや歌え" on 136, 264, 396 (its subtitles)
    for (const b of [136, 264, 396]) assert.deepEqual(onVideo("song-gokuraku-jodo", b, 40), { move: "gj-sing", count: 1 });
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
    assert.ok(Math.abs(count[3]!.t + show.beatMs - start) < 1e-6);
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

  it("a room's own intro moves the dance", () => {
    const show = buildShow(SONG.id, "dance")!;
    const a = { leadStartAt: 10_000, danceStartAt: null, fromBeat: 0, introMs: SONG.firstBeatMs + 120 };
    assert.equal(danceStart(show, a), 10_000 + SONG.firstBeatMs + 120);
  });
});

describe("a room playing a song", () => {
  it("waits for the speaker to have the video ready, then starts it after the lead-in; the dance by itself after the intro", () => {
    const { s, advance } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "dance" } });
    assert.equal(s.d.routine!.introMs, SONG.firstBeatMs);
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
    assert.equal(s.d.state.routineStartAt, 7_000 + LEAD_IN_MS + SONG.firstBeatMs);
  });

  it("every song starts straight from the host's pick, on the beat measured in its video: nobody taps along first", () => {
    for (const song of SONGS) {
      const { s, advance } = ready();
      s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: song.id, mode: "dance" } });
      assert.equal(s.d.state.phase, "learning", song.id);
      assert.deepEqual(Object.keys(s.d.routine!).sort(), ["beatsPerBar", "bpm", "fromBeat", "introMs", "leadStartAt", "mode", "routineId", "totalBeats"], `${song.id}: nothing to find first`);
      assert.equal(s.d.routine!.introMs, song.firstBeatMs);
      s.flush();
      // (a phone's taps go nowhere: there's no beat to find)
      s.handle(ANN, { t: "tap", at: 9_000 });
      assert.ok(!s.flush().out.some((o) => "msg" in o && o.msg.t === "tap"), song.id);
      s.handle(SPEAKER, { t: "songReady" });
      advance(LEAD_IN_MS);
      s.tick();
      assert.equal(s.d.state.phase, "dancing", song.id);
      assert.equal(s.d.state.routineStartAt, s.d.routine!.leadStartAt! + song.firstBeatMs, song.id);
    }
  });

  it("the host can start the dance at once, without waiting for the teaching", () => {
    const { s } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: GANGNAM.id, mode: "learn" } });
    s.handle(SPEAKER, { t: "songReady" });
    s.flush();
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    assert.equal(s.d.state.phase, "dancing");
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

describe("the coach's look", () => {
  it("each song dresses the coach its own way, and its moves' faces are its own", () => {
    for (const song of SONGS) {
      const style = styleOf(song.id);
      assert.notEqual(style, PLAIN, `${song.id} has an outfit`);
      assert.ok(style.big >= 1 && style.big <= 1.5, `${song.id}: big ${style.big}`);
      if (song.aligned) for (const id of songMoves(song)) assert.equal(songOfMove(id), song.id, `${id} belongs to ${song.id}`);
    }
    assert.equal(styleOf(null), PLAIN);
    const own = new Set(SONGS.flatMap((s) => songMoves(s)));
    for (const id of faceMoves()) {
      assert.ok(own.has(id), `${id}'s face: a song's move`);
      for (let p = 0; p < 8; p++) assert.ok(faceOf(id, p), `${id} at ${p}`);
    }
  });

  it("dancing bigger keeps the pose a pose: the rest stays put, a clap still meets, an arm reaches no further than straight", () => {
    const rest = exaggerate(BASE, 1.4);
    assert.deepEqual(rest.hR, BASE.hR);
    assert.deepEqual(rest.fL, BASE.fL);
    assert.equal(rest.py, 0);
    const clap = exaggerate(over(BASE, { hR: [0.03, -0.05, 0.3], hL: [-0.03, -0.05, 0.3] }), 1.4);
    assert.ok(clap.hR[0] >= 0 && clap.hL[0] <= 0, `hands met at ${clap.hR[0]}, ${clap.hL[0]}`);
    const up = exaggerate(over(BASE, { hR: [0.4, 0.5, 0.1] }), 1.4);
    assert.ok(Math.hypot(up.hR[0] - 0.19, up.hR[1], up.hR[2]) <= 0.5501);
    const bounce = exaggerate(over(BASE, { py: -0.1, roll: 0.1 }), 1.4);
    assert.ok(Math.abs(bounce.py + 0.14) < 1e-9 && Math.abs(bounce.roll - 0.14) < 1e-9);
  });
});

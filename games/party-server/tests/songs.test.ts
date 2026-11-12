// The songs: a song as a show (its teaching, the video's intro, the count-in, the dance on its
// beats), a room playing one (the songbook's first beat, the speaker moving the beat to where the
// video really is), and the songbook's checks of a speaker's taps. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEAD_IN_MS, SONG_SYNC_MS, Session, type From } from "../src/server/session";
import { checkTapped, MIN_TAPS } from "../src/server/tapped";
import { anchorsOf, buildShow, danceStart, planRun } from "../src/shared/show";
import { SONGS, songById, songMoveAt, songMoves } from "../src/shared/songs";

const SPEAKER: From = { role: "speaker", playerId: null };
const ANN: From = { role: "player", playerId: "ann-000001" };
const SONG = SONGS[0]!;

function ready() {
  let now = 1_000_000;
  const s = new Session(Session.create("ABCD", now, 5_000), () => now);
  s.songbook = { [SONG.id]: SONG.firstBeatMs };
  s.connect(SPEAKER);
  s.handle(SPEAKER, { t: "clock", offsetMs: -995_000, rttMs: 20 });
  s.connect(ANN, "Ann");
  s.flush();
  return { s, advance: (ms: number) => (now += ms) };
}

describe("a song as a show", () => {
  it("every song is in order: its moves are the library's, its dance whole 8-counts", () => {
    for (const song of SONGS) {
      const show = buildShow(song.id, "dance")!;
      assert.equal(show.kind, "song", song.id);
      assert.equal(song.beats % 8, 0, song.id);
      assert.equal(show.dance.length, song.beats);
      assert.ok(show.dance.every((b) => b.move !== null && b.score), song.id);
      assert.ok(song.bpm >= 60 && song.bpm <= 200);
      assert.equal(songById(song.id), song);
    }
  });

  it("just dance: no teaching; the video's intro, a count-in on its last 4 beats, the dance on its beats", () => {
    const show = buildShow(SONG.id, "dance")!;
    assert.equal(show.lead.length, 0);
    assert.equal(show.introMs, SONG.firstBeatMs);
    assert.equal(show.tail.length, 0);
    // the pattern round and round, a move for its 8-counts
    show.dance.forEach((b, i) => assert.equal(b.move!.id, songMoveAt(SONG, Math.floor(i / 8))));
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

  it("a song nobody has tapped along to yet can't be danced", () => {
    const { s } = ready();
    s.songbook = {};
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: SONG.id, mode: "dance" } });
    assert.equal(s.d.state.phase, "lobby");
    const err = s.flush().out.find((o) => "msg" in o && o.msg.t === "error");
    assert.ok(err && "msg" in err && err.msg.t === "error" && err.msg.code === "song_untapped");
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
    s.handle(SPEAKER, { t: "songAt", startAt: was + 90_000 });
    assert.equal(s.d.state.routineStartAt, was + 180, "a minute at most");
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

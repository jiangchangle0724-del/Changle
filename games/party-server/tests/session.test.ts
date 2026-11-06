// The room session, driven directly with a hand-moved clock: joining, the host's actions through
// party-base's state machine, the speaker's clock, calibration taps, the metronome and the dances
// (the warm-up and teaching, the dance after them by itself, the phones' beats, the results),
// pages that drop and come back. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { METRONOME_ID } from "../src/shared/catalog";
import type { ServerMsg } from "../src/shared/protocol";
import { buildShow, cachedShows, danceStart } from "../src/shared/show";
import { COUNT_LEAD_MS, IDLE_MS, LEAD_IN_MS, PLAYER_GRACE_MS, PULSE_GAP_MS, SPEAKER_GRACE_MS, Session, cleanName, makeCode, validPlayerId, type From, type Out } from "../src/server/session";

const SPEAKER: From = { role: "speaker", playerId: null };
const ANN: From = { role: "player", playerId: "ann-000001" };
const BOB: From = { role: "player", playerId: "bob-000002" };

/** A room at room-clock 1,000,000; the speaker page's clock reads 5,000 then (offset -995,000). */
function room() {
  let now = 1_000_000;
  const s = new Session(Session.create("ABCD", now, 5_000), () => now);
  const clock = { advance: (ms: number) => (now += ms), get now() { return now; } };
  return { s, clock };
}

const msgs = (out: Out[], to?: Out extends infer O ? (O extends { to: infer T } ? T : never) : never) =>
  out.flatMap((o) => ("msg" in o && (to === undefined || JSON.stringify(o.to) === JSON.stringify(to)) ? [o.msg] : []));
const last = <T extends ServerMsg["t"]>(out: Out[], t: T) => msgs(out).filter((m): m is Extract<ServerMsg, { t: T }> => m.t === t).at(-1);

/** A room with the speaker connected and synced, Ann (host) and Bob in. */
function ready() {
  const r = room();
  r.s.connect(SPEAKER);
  r.s.handle(SPEAKER, { t: "clock", offsetMs: -995_000, rttMs: 20 });
  r.s.connect(ANN, "Ann");
  r.s.connect(BOB, "  Bob  ");
  r.s.flush();
  return r;
}

describe("joining", () => {
  it("opens in the lobby with a first guess at the speaker's clock", () => {
    const { s } = room();
    assert.equal(s.d.state.phase, "lobby");
    assert.equal(s.d.state.code, "ABCD");
    assert.equal(s.speakerNow(), 5_000);
    assert.equal(s.d.speakerSynced, false);
  });

  it("the speaker connects, the first phone in is the host, names are tidied", () => {
    const { s } = ready();
    assert.equal(s.d.state.speakerConnected, true);
    assert.deepEqual(
      s.d.state.players.map((p) => [p.id, p.name, p.isHost]),
      [
        ["ann-000001", "Ann", true],
        ["bob-000002", "Bob", false],
      ],
    );
    assert.equal(cleanName("   "), "Player");
    assert.equal(cleanName("一二三四五六七八九十一二三四五六七八"), "一二三四五六七八九十一二三四五六");
  });

  it("every change goes to everyone as the new state", () => {
    const { s } = room();
    s.connect(ANN, "Ann");
    const { out, changed } = s.flush();
    assert.equal(changed, true);
    const st = last(out, "state")!;
    assert.equal(st.state.players.length, 1);
    assert.deepEqual(out[0] && "to" in out[0] ? out[0].to : null, "all");
  });
});

describe("the clocks", () => {
  it("a pong carries the room's time, and the speaker's once the speaker has set it", () => {
    const { s, clock } = room();
    s.handle(ANN, { t: "ping", id: 7 });
    let pong = last(s.flush().out, "pong")!;
    assert.deepEqual(pong, { t: "pong", id: 7, serverAt: clock.now, speakerAt: null });
    s.handle(SPEAKER, { t: "clock", offsetMs: -995_010, rttMs: 30 });
    clock.advance(250);
    s.handle(ANN, { t: "ping", id: 8 });
    pong = last(s.flush().out, "pong")!;
    assert.equal(pong.speakerAt, clock.now - 995_010);
  });

  it("only the speaker sets the speaker's clock", () => {
    const { s } = room();
    s.handle(ANN, { t: "clock", offsetMs: 42, rttMs: 1 });
    assert.equal(s.d.speakerSynced, false);
    s.handle(SPEAKER, { t: "clock", offsetMs: Number.NaN, rttMs: 1 });
    assert.equal(s.d.speakerSynced, false);
  });

  it("events are stamped in speaker time", () => {
    const { s, clock } = ready();
    clock.advance(1_000);
    s.handle(ANN, { t: "act", action: { type: "START_CALIBRATION" } });
    assert.equal(s.d.state.updatedAt, clock.now - 995_000);
  });
});

describe("the host's actions", () => {
  it("only the host can, and a refusal goes back to whoever asked", () => {
    const { s } = ready();
    s.handle(BOB, { t: "act", action: { type: "START_CALIBRATION" } });
    const out = s.flush().out;
    assert.equal(s.d.state.phase, "lobby");
    assert.deepEqual(msgs(out, { player: "bob-000002" } as never), [{ t: "error", code: "not_host", message: "player bob-000002 is not the host" }]);
  });

  it("nothing starts without the speaker", () => {
    const { s } = room();
    s.connect(ANN, "Ann");
    s.flush();
    s.handle(ANN, { t: "act", action: { type: "START_CALIBRATION" } });
    assert.equal(last(s.flush().out, "error")?.code, "no_speaker");
  });

  it("calibrating: the host's taps go to the speaker, the speaker's result goes into the room", () => {
    const { s } = ready();
    s.handle(ANN, { t: "tap", at: 123 });
    assert.equal(msgs(s.flush().out).length, 0, "no taps outside calibration");
    s.handle(ANN, { t: "act", action: { type: "START_CALIBRATION" } });
    assert.equal(s.d.state.phase, "calibrating");
    s.flush();
    s.handle(ANN, { t: "tap", at: 6_000.5 });
    s.handle(BOB, { t: "tap", at: 6_001 });
    assert.deepEqual(s.flush().out, [{ to: "speaker", msg: { t: "tap", at: 6_000.5, playerId: "ann-000001" } }]);
    s.handle(ANN, { t: "calibrated", audioOffsetMs: 999 });
    assert.equal(s.d.state.phase, "calibrating", "a phone can't say it's calibrated");
    s.handle(SPEAKER, { t: "calibrated", audioOffsetMs: 182.4 });
    assert.equal(s.d.state.phase, "lobby");
    assert.equal(s.d.state.audioOffsetMs, 182);
  });

  it("the metronome: learning, then dancing after a count-in, then the room finishes it", () => {
    const { s, clock } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "nope" } });
    assert.equal(last(s.flush().out, "error")?.code, "no_routine");
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: METRONOME_ID } });
    assert.equal(s.d.state.phase, "learning");
    assert.equal(s.d.state.bpm, 120, "the routine's tempo");
    assert.deepEqual(last(s.flush().out, "state")?.routine, { routineId: METRONOME_ID, bpm: 120, beatsPerBar: 4, totalBeats: 240, mode: null, leadStartAt: null, fromBeat: 0 });
    // (no warm-up: it waits for the host)
    assert.equal(s.d.danceAt, null);
    clock.advance(60_000);
    s.tick();
    assert.equal(s.d.state.phase, "learning");
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    assert.equal(s.d.state.phase, "dancing");
    const at = clock.now - 995_000;
    assert.equal(s.d.state.routineStartAt, at + COUNT_LEAD_MS + 8 * 500, "a moment, then an 8-beat count-in");
    // over when its last beat has been heard, plus a margin
    const end = s.d.state.routineStartAt! + 240 * 500 + 500;
    assert.equal(s.nextWake(), end + 995_000);
    clock.advance(end - at - 1);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    clock.advance(1);
    s.tick();
    assert.equal(s.d.state.phase, "results");
    assert.equal(s.d.state.routineStartAt, null);
    assert.deepEqual(s.d.results?.players, [], "nobody tapped along");
  });

  it("the end waits for the TV: a calibrated delay moves it later", () => {
    const { s } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_CALIBRATION" } });
    s.handle(SPEAKER, { t: "calibrated", audioOffsetMs: 200 });
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: METRONOME_ID } });
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    assert.equal(s.d.finishAt, s.d.state.routineStartAt! + 120_000 + 200 + 500);
  });

  it("kicking: the host can, the kicked phone is closed, nobody kicks themselves", () => {
    const { s } = ready();
    s.handle(BOB, { t: "act", action: { type: "KICK", playerId: "ann-000001" } });
    assert.equal(last(s.flush().out, "error")?.code, "not_host");
    s.handle(ANN, { t: "act", action: { type: "KICK", playerId: "ann-000001" } });
    assert.equal(last(s.flush().out, "error")?.code, "self_kick");
    s.handle(ANN, { t: "act", action: { type: "KICK", playerId: "bob-000002" } });
    const out = s.flush().out;
    assert.deepEqual(s.d.state.players.map((p) => p.id), ["ann-000001"]);
    assert.ok(out.some((o) => "close" in o && o.close === "bob-000002"));
  });

  it("the room ends for good", () => {
    const { s } = ready();
    s.handle(ANN, { t: "act", action: { type: "END_ROOM" } });
    assert.equal(s.d.state.phase, "ended");
    assert.equal(s.expired(), true);
  });

  it("我在 lights a phone up for everyone (the big screen shows it)", () => {
    const { s } = ready();
    s.handle(BOB, { t: "here" });
    assert.deepEqual(s.flush().out, [{ to: "all", msg: { t: "here", playerId: "bob-000002" } }]);
  });

  it("a phone's pulse goes to the speaker while a dance plays, tidied, not too often, and isn't kept", () => {
    const { s, clock } = ready();
    s.handle(BOB, { t: "pulse", e: 0.5 });
    assert.deepEqual(s.flush().out, [], "not in the lobby");
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "square-easy" } });
    s.flush();
    s.handle(BOB, { t: "pulse", e: 1.7, v: "hit" });
    let { out, changed } = s.flush();
    assert.deepEqual(out, [{ to: "speaker", msg: { t: "pulse", playerId: "bob-000002", e: 1, v: "hit" } }]);
    assert.equal(changed, false, "nothing stored");
    // movement only: one every PULSE_GAP_MS; a verdict always
    clock.advance(PULSE_GAP_MS - 10);
    s.handle(BOB, { t: "pulse", e: 0.333 });
    assert.deepEqual(s.flush().out, []);
    s.handle(BOB, { t: "pulse", e: 0.2, v: "miss" });
    assert.deepEqual(s.flush().out, [{ to: "speaker", msg: { t: "pulse", playerId: "bob-000002", e: 0.2, v: "miss" } }]);
    clock.advance(PULSE_GAP_MS);
    s.handle(BOB, { t: "pulse", e: 0.333, v: "nonsense" as never });
    ({ out } = s.flush());
    assert.deepEqual(out, [{ to: "speaker", msg: { t: "pulse", playerId: "bob-000002", e: 0.33, v: null } }]);
    // not from the speaker, a stranger, or without a number
    clock.advance(PULSE_GAP_MS);
    s.handle(SPEAKER, { t: "pulse", e: 0.5 });
    s.handle({ role: "player", playerId: "cat-000003" }, { t: "pulse", e: 0.5 });
    s.handle(ANN, { t: "pulse", e: Number.NaN });
    s.handle(ANN, { t: "pulse", e: "1" as never });
    assert.deepEqual(s.flush().out, []);
  });
});

/** A room dancing square-easy (96 BPM, 192 beats) from its first beat: the host skipped the warm-up. */
function dancing(routineId = "square-easy") {
  const r = ready();
  r.s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId } });
  r.s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
  r.s.flush();
  /** The room's clock when the speaker's clock reads t. */
  const room = (t: number) => t + 995_000;
  return { ...r, room, start: r.s.d.state.routineStartAt! };
}
const BEAT = 625; // ms, at 96 BPM

describe("a dance", () => {
  it("learn mode: the warm-up a moment after the host's tap, the dance after the lead by itself, the cool-down, the results", () => {
    const { s, clock } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "square-easy" } });
    const at = clock.now - 995_000;
    const show = buildShow("square-easy", "learn")!;
    assert.equal(s.d.state.phase, "learning");
    assert.equal(s.d.state.difficulty, "easy", "the dance's own difficulty");
    assert.equal(s.d.state.bpm, 96);
    assert.deepEqual(s.d.routine, { routineId: "square-easy", bpm: 96, beatsPerBar: 4, totalBeats: 192, mode: "learn", leadStartAt: at + LEAD_IN_MS, fromBeat: 0 });
    const lead = { leadStartAt: at + LEAD_IN_MS, danceStartAt: null, fromBeat: 0 };
    assert.equal(s.d.danceAt, at + LEAD_IN_MS + show.leadMs, "the lead runs out where the count-in begins");
    assert.equal(s.nextWake(), s.d.danceAt! + 995_000);
    // a moment before: still the lead
    clock.advance(s.d.danceAt! - at - 5);
    s.tick();
    assert.equal(s.d.state.phase, "learning");
    clock.advance(10);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    // the dance's beat 0 where the pages already had it from the lead (so nothing they play moves)
    assert.equal(s.d.state.routineStartAt, danceStart(show, lead));
    assert.equal(s.d.state.routineStartAt, s.d.routine!.leadStartAt! + show.leadMs + 4 * BEAT);
    // over after the cool-down
    const end = s.d.state.routineStartAt! + 192 * BEAT + show.tailMs + 500;
    assert.equal(s.d.finishAt, end);
    clock.advance(end - (clock.now - 995_000) - 5);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    clock.advance(10);
    s.tick();
    assert.equal(s.d.state.phase, "results");
    assert.deepEqual(s.d.results, { routineId: "square-easy", difficulty: "easy", beats: 192, players: [], awards: { steady: null, hype: null, effort: null }, bestStreak: 0, bursts: 0, together: 0 });
    assert.equal(last(s.flush().out, "state")?.results?.routineId, "square-easy", "the results go out with the state");
  });

  it("dance mode: no teaching, the lead is the warm-up alone", () => {
    const { s, clock } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "pop-medium", mode: "dance" } });
    const at = clock.now - 995_000;
    assert.equal(s.d.routine?.mode, "dance");
    assert.equal(s.d.state.difficulty, "medium");
    assert.equal(s.d.danceAt, at + LEAD_IN_MS + buildShow("pop-medium", "dance")!.leadMs);
    assert.ok(buildShow("pop-medium", "dance")!.leadMs < buildShow("pop-medium", "learn")!.leadMs);
  });

  it("the host can skip what's left before the dance: a count-in, then beat 0", () => {
    const { s, clock } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "square-easy" } });
    clock.advance(10_000);
    s.handle(BOB, { t: "act", action: { type: "START_DANCING" } });
    assert.equal(s.d.state.phase, "learning", "only the host");
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    const at = clock.now - 995_000;
    assert.equal(s.d.state.phase, "dancing");
    assert.equal(s.d.state.routineStartAt, at + COUNT_LEAD_MS + 4 * BEAT, "a moment for the speaker to hear of it, then the count-in");
    assert.equal(s.d.routine?.leadStartAt, null, "the lead is cut off");
    assert.equal(s.d.danceAt, null);
    assert.equal(s.d.finishAt, at + COUNT_LEAD_MS + 4 * BEAT + 192 * BEAT + buildShow("square-easy", "learn")!.tailMs + 500);
  });

  it("the phones' beats: only while dancing, only beats the room has heard, only from players in the room", () => {
    const { s, clock, room, start } = dancing();
    s.handle(ANN, { t: "beats", from: 0, offs: [10, -20, null, 5] });
    assert.equal(msgs(s.flush().out).length, 0, "not heard yet");
    clock.advance(room(start + 4 * BEAT) - clock.now);
    s.handle(ANN, { t: "beats", from: 0, offs: [10, -20, null, 5] });
    const out = s.flush();
    assert.equal(out.scored, true);
    // beats 0 and 1 hit, 2 not, 3 hit: the floor's run is 1, its best 2
    assert.deepEqual(msgs(out.out, "speaker"), [{ t: "floor", streak: 1, best: 2, bursts: 0, dancers: 1, levels: { "ann-000001": 0.75 } }]);
    s.handle(BOB, { t: "beats", from: 4, offs: [0, 0, 0, 0] });
    s.handle({ role: "player", playerId: "zed-000009" }, { t: "beats", from: 0, offs: [0, 0, 0, 0] });
    s.handle(SPEAKER, { t: "beats", from: 0, offs: [0, 0, 0, 0] });
    s.handle(BOB, { t: "beats", from: 0, offs: new Array(17).fill(0) });
    s.handle(BOB, { t: "beats", from: 0.5, offs: [0] });
    assert.deepEqual(s.flush(), { out: [], changed: false, scored: false }, "a bar not heard yet, a stranger, the speaker, too many, not a beat");
    assert.deepEqual(Object.keys(s.scores.offs), ["ann-000001"]);
  });

  it("看结果: only the host, and only once the whole dance has been heard; the results from the beats sent", () => {
    const { s, clock, room, start } = dancing();
    clock.advance(room(start + 8 * BEAT) - clock.now);
    s.handle(ANN, { t: "beats", from: 0, offs: [0, 0, 0, 0] });
    s.handle(ANN, { t: "beats", from: 4, offs: [0, 0, 0, 0] });
    s.handle(BOB, { t: "beats", from: 0, offs: [200, 200, null, null] });
    s.flush();
    s.handle(ANN, { t: "act", action: { type: "FINISH_NOW" } });
    assert.equal(last(s.flush().out, "error")?.code, "too_early");
    clock.advance(room(start + 192 * BEAT + 1_000) - clock.now);
    s.handle(BOB, { t: "act", action: { type: "FINISH_NOW" } });
    assert.equal(last(s.flush().out, "error")?.code, "not_host");
    s.handle(ANN, { t: "act", action: { type: "FINISH_NOW" } });
    assert.equal(s.d.state.phase, "results");
    const r = s.d.results!;
    assert.deepEqual(
      r.players.map((p) => [p.name, p.participation, p.bestStreak]),
      [
        ["Ann", 4, 8], // moved on 8 of 192 beats
        ["Bob", 1, 0], // moved on 2, close but never on the beat
      ],
    );
    assert.deepEqual(r.awards, { steady: "ann-000001", hype: "ann-000001", effort: "bob-000002" });
    assert.equal(s.d.finishAt, null);
  });

  it("这一段再来: back to the start of the 8-count being heard, after a count-in; the beats from there are danced again", () => {
    const { s, clock, room, start } = dancing();
    clock.advance(room(start + 13.5 * BEAT) - clock.now);
    s.handle(ANN, { t: "beats", from: 0, offs: new Array(12).fill(0) });
    s.flush();
    s.handle(ANN, { t: "act", action: { type: "RESTART_SECTION" } });
    const at = clock.now - 995_000;
    assert.equal(s.d.state.phase, "dancing");
    assert.equal(s.d.routine?.fromBeat, 8, "beat 13 is in the 8-count that starts at 8");
    assert.equal(s.d.state.routineStartAt, Math.round(at + COUNT_LEAD_MS + 4 * BEAT), "beat 8 after a moment and a count-in, on a whole millisecond");
    assert.deepEqual(s.scores.offs["ann-000001"]!.slice(0, 13), [0, 0, 0, 0, 0, 0, 0, 0, 9999, 9999, 9999, 9999, 9999], "beats 8 on are danced again");
    assert.equal(s.d.finishAt, s.d.state.routineStartAt! + (192 - 8) * BEAT + buildShow("square-easy", "learn")!.tailMs + 500);
    assert.equal(last(s.flush().out, "floor")?.best, 8, "the speaker hears of the floor straight away");
    // a bar from before the restart, arriving late, is not taken
    s.handle(ANN, { t: "beats", from: 8, offs: [0, 0, 0, 0] });
    assert.equal(s.flush().scored, false);
  });

  it("stop: from the middle of the dance back to the lobby, the dance cleared", () => {
    const { s, clock, room, start } = dancing();
    clock.advance(room(start + 4 * BEAT) - clock.now);
    s.handle(ANN, { t: "beats", from: 0, offs: [0, 0, 0, 0] });
    s.handle(BOB, { t: "act", action: { type: "BACK_TO_LOBBY" } });
    assert.equal(s.d.state.phase, "dancing", "only the host");
    s.handle(ANN, { t: "act", action: { type: "BACK_TO_LOBBY" } });
    assert.equal(s.d.state.phase, "lobby");
    assert.equal(s.d.finishAt, null);
    assert.equal(s.d.routine?.leadStartAt, null);
    assert.deepEqual(s.scores, { names: {}, offs: {} });
  });

  it("from the results: the same dance again (no warm-up), or another one", () => {
    const { s, clock, room, start } = dancing();
    clock.advance(room(start + 192 * BEAT + 1_000) - clock.now);
    s.handle(ANN, { t: "act", action: { type: "FINISH_NOW" } });
    assert.equal(s.d.state.phase, "results");
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    const at = clock.now - 995_000;
    assert.equal(s.d.state.phase, "dancing");
    assert.equal(s.d.state.routineStartAt, at + COUNT_LEAD_MS + 4 * BEAT);
    assert.equal(s.d.results, null);
    clock.advance(room(s.d.state.routineStartAt! + 192 * BEAT + 1_000) - clock.now);
    s.handle(ANN, { t: "act", action: { type: "FINISH_NOW" } });
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "pop-easy" } });
    assert.equal(s.d.state.phase, "learning");
    assert.equal(s.d.routine?.routineId, "pop-easy");
  });

  it("the short test dance starts only where the local checks run", () => {
    const { s } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "test-short" } });
    assert.equal(last(s.flush().out, "error")?.code, "no_routine");
    const t = new Session(Session.create("WXYZ", 1_000_000, 5_000), () => 1_000_000, undefined, { testRoutines: true });
    t.connect(SPEAKER);
    t.connect(ANN, "Ann");
    t.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "test-short" } });
    assert.equal(t.d.state.phase, "learning");
    assert.equal(t.d.routine?.totalBeats, 16);
  });

  it("a speaker page reloaded mid-dance gets the floor so far", () => {
    const { s, clock, room, start } = dancing();
    clock.advance(room(start + 4 * BEAT) - clock.now);
    s.handle(ANN, { t: "beats", from: 0, offs: [0, 0, 0, 0] });
    s.flush();
    s.disconnect(SPEAKER);
    s.connect(SPEAKER);
    assert.equal(last(s.flush().out, "floor")?.streak, 4);
  });

  it("这一段再来 tapped again during its count-in starts the same 8-count again (and keeps the beats before it)", () => {
    const { s, clock, room, start } = dancing();
    clock.advance(room(start + 13.5 * BEAT) - clock.now);
    s.handle(ANN, { t: "beats", from: 0, offs: new Array(12).fill(0) });
    s.handle(ANN, { t: "act", action: { type: "RESTART_SECTION" } });
    assert.equal(s.d.routine?.fromBeat, 8);
    clock.advance(300);
    s.handle(ANN, { t: "act", action: { type: "RESTART_SECTION" } });
    assert.equal(s.d.routine?.fromBeat, 8, "not back another 8-count");
    assert.deepEqual(s.scores.offs["ann-000001"]!.slice(0, 8), [0, 0, 0, 0, 0, 0, 0, 0], "the beats before it kept");
  });

  it("a bar from before the restart point that comes in late still counts; one past it waits for the new run", () => {
    const { s, clock, room, start } = dancing();
    clock.advance(room(start + 13.5 * BEAT) - clock.now);
    s.handle(ANN, { t: "beats", from: 0, offs: [0, 0, 0, 0] });
    s.handle(ANN, { t: "act", action: { type: "RESTART_SECTION" } });
    s.flush();
    // beats 4 to 7, danced before the restart, arrive after it
    s.handle(ANN, { t: "beats", from: 4, offs: [10, 10, 10, 10] });
    assert.deepEqual(s.scores.offs["ann-000001"]!.slice(0, 8), [0, 0, 0, 0, 10, 10, 10, 10]);
    assert.equal(last(s.flush().out, "floor")?.best, 8);
    // a bar across the restart point: the part before it counts, the rest isn't heard yet in the new run
    s.handle(BOB, { t: "beats", from: 6, offs: [0, 0, 0, 0] });
    assert.deepEqual(s.scores.offs["bob-000002"]!.slice(4, 10), [9999, 9999, 0, 0, 9999, 9999]);
  });

  it("the alarm late: the first message after the lead ran out moves the room into the dance, and the bar counts", () => {
    const { s, clock } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "square-easy" } });
    const danceAt = s.d.danceAt!;
    const zero = danceAt + 4 * BEAT;
    // (no tick: the alarm hasn't fired) beats 0 to 3 heard
    clock.advance(zero + 4 * BEAT - (clock.now - 995_000));
    s.handle(ANN, { t: "beats", from: 0, offs: [0, 0, 0, 0] });
    assert.equal(s.d.state.phase, "dancing");
    assert.equal(s.d.state.routineStartAt, zero, "where the lead put it, not where the message came");
    assert.deepEqual(s.scores.offs["ann-000001"]!.slice(0, 4), [0, 0, 0, 0]);
  });

  it("only real phone ids: never one named like something every object has", () => {
    for (const id of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf1", "short", "has space here"]) assert.equal(validPlayerId(id), id === "valueOf1", id);
    assert.equal(validPlayerId("ann-000001"), true);
    const { s } = ready();
    s.connect({ role: "player", playerId: "constructor" }, "Eve");
    assert.deepEqual(s.d.state.players.map((p) => p.name), ["Ann", "Bob"]);
  });

  it("a dance only the host can start, and only one there is (nothing kept of made-up ids)", () => {
    const { s } = ready();
    const before = cachedShows();
    s.handle(BOB, { t: "act", action: { type: "START_LEARNING", routineId: "pop-easy" } });
    assert.equal(last(s.flush().out, "error")?.code, "not_host");
    for (let i = 0; i < 50; i++) s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: `made-up-${i}`.repeat(20) } });
    assert.equal(last(s.flush().out, "error")?.code, "no_routine");
    assert.equal(cachedShows(), before);
    assert.equal(s.d.state.phase, "lobby");
  });

  it("a room stored before the dances keeps working", () => {
    const d = Session.create("ABCD", 1_000_000, 5_000) as unknown as Record<string, unknown>;
    delete d.results;
    delete d.danceAt;
    d.routine = { routineId: METRONOME_ID, bpm: 120, beatsPerBar: 4, totalBeats: 240 };
    const s = new Session(d as never, () => 1_000_000);
    assert.equal(s.d.results, null);
    assert.equal(s.d.danceAt, null);
    assert.deepEqual(s.d.routine, { routineId: METRONOME_ID, bpm: 120, beatsPerBar: 4, totalBeats: 240, mode: null, leadStartAt: null, fromBeat: 0 });
  });
});

describe("pages that drop", () => {
  it("the speaker gets a moment to come back; after that the room goes back to the lobby", () => {
    const { s, clock } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: METRONOME_ID } });
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    s.disconnect(SPEAKER);
    assert.equal(s.nextWake(), clock.now + SPEAKER_GRACE_MS);
    clock.advance(SPEAKER_GRACE_MS - 1);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    s.connect(SPEAKER); // a reload, in time
    clock.advance(10);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    s.disconnect(SPEAKER);
    clock.advance(SPEAKER_GRACE_MS);
    s.tick();
    assert.equal(s.d.state.phase, "lobby");
    assert.equal(s.d.state.speakerConnected, false);
    assert.equal(s.d.finishAt, null);
  });

  it("a phone keeps its seat for a while; gone for good, the next one in becomes host", () => {
    const { s, clock } = ready();
    s.disconnect(ANN);
    clock.advance(PLAYER_GRACE_MS - 1);
    s.tick();
    assert.equal(s.d.state.players.length, 2);
    s.connect(ANN, "Ann");
    clock.advance(PLAYER_GRACE_MS);
    s.tick();
    assert.equal(s.d.state.players.length, 2, "came back in time");
    s.disconnect(ANN);
    clock.advance(PLAYER_GRACE_MS);
    s.tick();
    assert.deepEqual(
      s.d.state.players.map((p) => [p.id, p.isHost]),
      [["bob-000002", true]],
    );
  });

  it("a room nobody uses is cleared after 12 hours", () => {
    const { s, clock } = ready();
    clock.advance(IDLE_MS - 1);
    assert.equal(s.expired(), false);
    clock.advance(1);
    assert.equal(s.expired(), true);
  });
});

describe("room codes", () => {
  it("4 characters from the alphabet", () => {
    let i = 0;
    assert.equal(makeCode("ABC", () => i++ % 3), "ABCA");
  });
});

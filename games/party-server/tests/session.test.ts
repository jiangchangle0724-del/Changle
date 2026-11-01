// The room session, driven directly with a hand-moved clock: joining, the host's actions through
// party-base's state machine, the speaker's clock, calibration taps, the routine's end, pages that
// drop and come back. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COUNT_IN_BEATS, METRONOME, type ServerMsg } from "../src/shared/protocol";
import { IDLE_MS, PLAYER_GRACE_MS, SPEAKER_GRACE_MS, Session, cleanName, makeCode, type From, type Out } from "../src/server/session";

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
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: "nope", difficulty: "easy", bpm: 120 } });
    assert.equal(last(s.flush().out, "error")?.code, "no_routine");
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: METRONOME.routineId, difficulty: "easy", bpm: 999 } });
    assert.equal(s.d.state.phase, "learning");
    assert.equal(s.d.state.bpm, 120, "the routine's tempo, not the phone's");
    assert.deepEqual(last(s.flush().out, "state")?.routine, METRONOME);
    s.handle(ANN, { t: "act", action: { type: "START_DANCING" } });
    assert.equal(s.d.state.phase, "dancing");
    const at = clock.now - 995_000;
    assert.equal(s.d.state.routineStartAt, at + COUNT_IN_BEATS * 500);
    // over when its last beat has been heard, plus a margin
    const end = s.d.state.routineStartAt! + METRONOME.totalBeats * 500 + 500;
    assert.equal(s.nextWake(), end + 995_000);
    clock.advance(end - at - 1);
    s.tick();
    assert.equal(s.d.state.phase, "dancing");
    clock.advance(1);
    s.tick();
    assert.equal(s.d.state.phase, "results");
    assert.equal(s.d.state.routineStartAt, null);
  });

  it("the end waits for the TV: a calibrated delay moves it later", () => {
    const { s } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_CALIBRATION" } });
    s.handle(SPEAKER, { t: "calibrated", audioOffsetMs: 200 });
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: METRONOME.routineId, difficulty: "easy", bpm: 120 } });
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
});

describe("pages that drop", () => {
  it("the speaker gets a moment to come back; after that the room goes back to the lobby", () => {
    const { s, clock } = ready();
    s.handle(ANN, { t: "act", action: { type: "START_LEARNING", routineId: METRONOME.routineId, difficulty: "easy", bpm: 120 } });
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

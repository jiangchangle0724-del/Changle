// A dance as a room plays it (src/shared/show.ts): every dance in both modes cut into its lead
// (warm-up, teaching), count-in, dance and cool-down; the beats a page plans from the room's
// anchors, end to end with no gap; the same beats whether the lead runs into the dance by itself or
// the room says where the dance is; a skip, a restart; the preview of the next move. Run: npm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { METRONOME_ID, ROUTINES, TEST_ROUTINE, routineById } from "../src/shared/catalog";
import { PREVIEW_BEATS, anchorsOf, buildShow, cachedShows, danceStart, nextChange, phraseStart, planRun, runEnd, runKey, spotAt, type RunBeat } from "../src/shared/show";

const close = (a: number, b: number, why?: string) => assert.ok(Math.abs(a - b) < 1e-6, `${why ?? ""} ${a} vs ${b}`);
/** Each beat starts where the one before it ends: no gap, no overlap. */
function joined(run: readonly RunBeat[]) {
  for (let i = 1; i < run.length; i++) close(run[i]!.t, run[i - 1]!.t + run[i - 1]!.ms, `beat ${i}`);
}

describe("the shows", () => {
  for (const r of ROUTINES) {
    it(`${r.id}: lead, count-in, dance and cool-down`, () => {
      const learn = buildShow(r.id, "learn")!;
      const dance = buildShow(r.id, "dance")!;
      const beats = r.sections.reduce((n, s) => n + 8 * s.repeat, 0);
      const taught = new Set(r.sections.map((s) => s.move)).size;
      for (const sh of [learn, dance]) {
        assert.equal(sh.difficulty, r.difficulty);
        assert.equal(sh.bpm, r.bpm);
        assert.equal(sh.countIn, 4);
        assert.equal(sh.dance.length, beats);
        close(sh.danceMs, (beats * 60000) / r.bpm);
        // the dance on its exact grid, every beat counted and scored
        sh.dance.forEach((b, i) => {
          assert.equal(b.stage, "dance");
          assert.equal(b.danceBeat, i);
          assert.equal(b.score, true);
          close(b.at, (i * 60000) / r.bpm);
        });
        // the cool-down: the routine's move, at least a minute, nothing scored
        assert.ok(sh.tail.length >= 8 && sh.tail.every((b) => b.stage === "cooldown" && b.move?.id === r.cooldown && !b.score));
        assert.ok(sh.tailMs >= 60_000);
        // the lead's beats end to end, and leadMs where the last one ends
        const last = sh.lead.at(-1)!;
        close(sh.leadMs, last.at + last.ms);
      }
      // learn: the warm-up, then each move once, 8 beats to watch and 8 to follow (scored, not counted)
      const warm = dance.lead.length;
      assert.ok(dance.lead.every((b) => b.stage === "warmup" && b.move?.id === r.warmup && !b.score));
      assert.equal(learn.lead.length, warm + 16 * taught);
      const teach = learn.lead.slice(warm);
      assert.deepEqual([...new Set(teach.map((b) => b.move!.id))], [...new Set(r.sections.map((s) => s.move))], "taught in the order they first come");
      assert.ok(teach.every((b) => (b.stage === "watch" ? !b.score : b.stage === "follow" && b.score && b.danceBeat === null)));
      // the teaching at 70% speed
      close(teach[0]!.ms, 60000 / (r.bpm * 0.7));
    });
  }

  it("the metronome: no lead, an 8-beat count-in, 240 beats at 120, no cool-down", () => {
    const m = buildShow(METRONOME_ID, null)!;
    assert.deepEqual([m.lead.length, m.countIn, m.dance.length, m.tail.length, m.bpm, m.mode, m.routine], [0, 8, 240, 0, 120, null, null]);
    assert.deepEqual(planRun(m, { leadStartAt: null, danceStartAt: null, fromBeat: 0 }), [], "nothing plays until the host starts it");
  });

  it("unknown dances have no show, and nothing is kept of them; the test dance has one", () => {
    const kept = cachedShows();
    for (let i = 0; i < 100; i++) assert.equal(buildShow(`nope-${i}`, "learn"), null);
    assert.equal(cachedShows(), kept);
    assert.equal(buildShow(TEST_ROUTINE.id, "dance")?.dance.length, 16);
    assert.equal(routineById(TEST_ROUTINE.id), TEST_ROUTINE);
  });
});

describe("the beats a page plans", () => {
  const show = buildShow("square-easy", "learn")!;
  const lead = { leadStartAt: 10_000, danceStartAt: null, fromBeat: 0 };

  it("from the lead's start: every beat to the end of the cool-down, end to end", () => {
    const run = planRun(show, lead);
    assert.equal(run.length, show.lead.length + 4 + show.dance.length + show.tail.length);
    joined(run);
    close(run[0]!.t, 10_000);
    // the count-in right before the dance's beat 0
    const zero = run.findIndex((b) => b.danceBeat === 0);
    assert.deepEqual(run.slice(zero - 4, zero).map((b) => [b.stage, b.count]), [["countdown", 4], ["countdown", 3], ["countdown", 2], ["countdown", 1]]);
    close(run[zero]!.t, danceStart(show, lead)!);
    close(runEnd(run), danceStart(show, lead)! + show.danceMs + show.tailMs);
  });

  it("the room taking the dance over from the lead changes nothing a page plays", () => {
    const start = danceStart(show, lead)!;
    // what the room's LEARNING_DONE sets: the lead's end, then the count-in
    const after = { ...lead, danceStartAt: lead.leadStartAt + show.leadMs + show.countIn * show.beatMs };
    assert.equal(after.danceStartAt, start);
    assert.equal(runKey(show, after), runKey(show, lead));
    assert.deepEqual(planRun(show, after), planRun(show, lead));
  });

  it("skipping ahead cuts the lead at the count-in", () => {
    const skip = { leadStartAt: 10_000, danceStartAt: 30_000, fromBeat: 0 };
    const run = planRun(show, skip);
    joined(run);
    const firstCount = run.findIndex((b) => b.stage === "countdown");
    close(run[firstCount]!.t, 30_000 - 4 * show.beatMs);
    assert.ok(run.slice(0, firstCount).every((b) => b.stage === "warmup"));
    assert.notEqual(runKey(show, skip), runKey(show, lead));
  });

  it("a restart from beat 8: a count-in, then beats 8 on, then the cool-down", () => {
    const again = { leadStartAt: null, danceStartAt: 50_000, fromBeat: 8 };
    const run = planRun(show, again);
    joined(run);
    assert.deepEqual(run.slice(0, 5).map((b) => [b.stage, b.danceBeat]), [["countdown", null], ["countdown", null], ["countdown", null], ["countdown", null], ["dance", 8]]);
    close(run[4]!.t, 50_000);
    assert.equal(run.filter((b) => b.stage === "dance").length, show.dance.length - 8);
  });

  it("as the room hears it: every beat moved by the TV's delay", () => {
    const a = planRun(show, lead);
    const b = planRun(show, lead, 180);
    a.forEach((x, i) => close(b[i]!.t, x.t + 180));
  });

  it("the anchors from a room's state: nothing in the lobby or the results", () => {
    const info = { routineId: "square-easy", bpm: 96, beatsPerBar: 4, totalBeats: 192, mode: "learn" as const, leadStartAt: 10_000, fromBeat: 0 };
    assert.deepEqual(anchorsOf("learning", null, info), { ...lead, introMs: null });
    assert.deepEqual(anchorsOf("dancing", 40_000, info), { leadStartAt: 10_000, danceStartAt: 40_000, fromBeat: 0, introMs: null });
    assert.deepEqual(anchorsOf("learning", null, { ...info, introMs: 2500 }), { ...lead, introMs: 2500 });
    assert.equal(anchorsOf("results", null, info), null);
    assert.equal(anchorsOf("lobby", null, info), null);
    assert.equal(anchorsOf("learning", null, null), null);
  });

  it("which beat is sounding, and the next move shown in the last 2 beats before it", () => {
    const run = planRun(show, lead);
    assert.equal(spotAt(run, 9_999), null);
    assert.deepEqual(spotAt(run, 10_000), { i: 0, frac: 0 });
    assert.equal(spotAt(run, runEnd(run)), null);
    // the warm-up's last beat: the teaching's first move is next
    const firstWatch = run.findIndex((b) => b.stage === "watch");
    const nx = nextChange(run, firstWatch - 1, 0.5)!;
    assert.equal(nx.beat.stage, "watch");
    assert.equal(nx.beats, 0.5);
    assert.ok(nx.beats <= PREVIEW_BEATS);
    // in the middle of a move's 8 beats, its next change is further off
    assert.ok(nextChange(run, firstWatch + 2)!.beats > PREVIEW_BEATS);
    // the cool-down's last beat: nothing after it
    assert.equal(nextChange(run, run.length - 1), null);
  });

  it("这一段再来 picks the start of the 8-count being heard", () => {
    const at = { leadStartAt: null, danceStartAt: 50_000, fromBeat: 0 };
    assert.equal(phraseStart(show, at, 50_000 + 13.5 * show.beatMs), 8);
    assert.equal(phraseStart(show, at, 50_000 + 7.9 * show.beatMs), 0);
    assert.equal(phraseStart(show, at, 49_000), 0, "in the count-in: the top");
    assert.equal(phraseStart(show, at, 50_000 + 500 * show.beatMs), 184, "in the cool-down: the last 8-count");
    // after a restart from 8, the dance's beats are still counted from its beat 0
    assert.equal(phraseStart(show, { leadStartAt: null, danceStartAt: 60_000, fromBeat: 8 }, 60_000 + 9 * show.beatMs), 16);
    // and in that restart's count-in, another tap goes back to the same 8-count, not the one before
    assert.equal(phraseStart(show, { leadStartAt: null, danceStartAt: 60_000, fromBeat: 8 }, 60_000 - 2 * show.beatMs), 8);
  });
});

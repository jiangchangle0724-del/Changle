/* 打碟 · DJ Booth: the speaker's player and the stand-in DJ, without a sound card.
   Run with `npx tsx tests/dj.test.ts`. The booth's room rules are in engine.test.ts. */
import { beatOf, beatTime, DANCE_MOVES, danced, moveAt } from "../src/shared/dj/dance";
import { BY_PHASE, nextSection, renderOrder } from "../src/party/dj/fake/arrange";
import { FakeDj, pack } from "../src/party/dj/fake/FakeDj";
import type { Rendered } from "../src/party/dj/fake/render";
import { beatFrames, SECTIONS, sectionFrames, type Section } from "../src/party/dj/fake/sections";
import { ALL_SECTIONS, ANY_SECTION, BED, KITS, sectionById, sectionOf } from "../src/party/dj/fake/styles";
import { CLIP_DB, ClipDeck, clipOf, loadClip, type Clip } from "../src/party/dj/clip/clip";
import { danceBpm, hitsOf, songQuery, trackOf, unescape, ytIdOf } from "../src/shared/dj/youtube";
import { previewOk } from "../src/shared/songs";
import { decodePiece, encodePiece, fileNumber, PIECE_BYTES, SONG_BYTES } from "../src/shared/dj/songwire";
import { eqDb, filterOf, GATE_STEPS } from "../src/party/dj/speaker/mixer";
import { line } from "../src/lib/music";
import { pcm16ToFloat } from "../src/party/dj/speaker/pcm";
import type { Speaker } from "../src/party/dj/speaker/speaker";
import { KickClock } from "../src/party/dj/lyria/beat";
import { LyriaDj, pcmChunk } from "../src/party/dj/lyria/LyriaDj";
import { FALLBACK_PROMPTS, lyriaFor } from "../src/party/dj/lyria/prompts";
import { FAKE_MIX, mixFor } from "../src/shared/dj/curve";
import { toGoogle } from "../worker/lyria";
import { Tube } from "../src/party/dj/tube";
import WORDS from "./fixtures/dj/lyria-prompt-words.json";

let failures = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  }
}
async function test(name: string, fn: () => void | Promise<void>) {
  const before = failures;
  try {
    await fn();
  } catch (e) {
    failures++;
    console.log("  THREW:", (e as Error).stack);
  }
  console.log(`${failures === before ? "ok  " : "FAIL"} ${name}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ the player, on a pretend audio thread */

type Msg = { t: string; pos: number; written: number; time: number; state: string; stalls: number; drops: number };
type Proc = { port: { onmessage: ((e: { data: unknown }) => void) | null; posted: Msg[] }; process: (i: unknown[], o: Float32Array[][], p?: Record<string, Float32Array>) => boolean };
const g = globalThis as unknown as Record<string, unknown>;
const procs: Record<string, new (o: unknown) => Proc> = {};
g.sampleRate = 48000;
g.currentTime = 0;
g.AudioWorkletProcessor = class {
  port = {
    onmessage: null as ((e: { data: unknown }) => void) | null,
    posted: [] as Msg[],
    postMessage(m: Msg) {
      this.posted.push(m);
    },
  };
};
g.registerProcessor = (name: string, cls: new (o: unknown) => Proc) => {
  procs[name] = cls;
};
await import("../src/party/dj/speaker/player.worklet.js");

function player(opts: Record<string, number>, sr = 48000) {
  g.sampleRate = sr;
  g.currentTime = 0;
  const p = new procs["dj-player"]({ processorOptions: opts });
  const send = (m: unknown) => p.port.onmessage?.({ data: m });
  const push = (l: Float32Array, r?: Float32Array) => send({ t: "pcm", l, r: r ?? l });
  /** the crossfader, as the page would set it (0 all deck A, 1 all deck B) */
  let xfade = 0;
  const setX = (x: number) => {
    xfade = x;
  };
  /** run `frames` (a multiple of 128) through the player */
  const run = (frames: number) => {
    const l = new Float32Array(frames);
    const r = new Float32Array(frames);
    for (let k = 0; k < frames; k += 128) {
      const ol = new Float32Array(128);
      const or = new Float32Array(128);
      p.process([], [[ol, or]], { xfade: new Float32Array([xfade]) });
      l.set(ol, k);
      r.set(or, k);
      g.currentTime = (g.currentTime as number) + 128 / sr;
    }
    return { l, r };
  };
  const last = () => p.port.posted[p.port.posted.length - 1];
  return { p, push, run, send, last, setX };
}

const sine = (n: number, hz: number, rate: number, from = 0, amp = 0.5) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * hz * (from + i)) / rate));
const maxJump = (a: Float32Array) => {
  let m = 0;
  for (let i = 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1]));
  return m;
};

await test("player: nothing until the prebuffer, then the stream exactly as sent", () => {
  const P = player({ rate: 48000, prebuffer: 0.5, resume: 0.25, seconds: 4 });
  const src = sine(36000, 440, 48000);
  P.push(src.slice(0, 12000));
  const quiet = P.run(1280);
  ok(quiet.l.every((x) => x === 0), "a quarter second waiting: silence");
  P.push(src.slice(12000));
  const out = P.run(12800);
  // a 40 ms fade in, then sample for sample
  let diff = 0;
  for (let i = 1920; i < 12800; i++) diff = Math.max(diff, Math.abs(out.l[i] - src[i]));
  ok(diff < 1e-6, `after the fade in, every sample is the one sent (off by ${diff})`);
  ok(out.l[0] < 0.001 && Math.abs(out.l[960]) <= Math.abs(src[960]) * 0.51 + 1e-6, "the first 40 ms rise from nothing");
  ok(out.r.every((x, i) => i < 1920 || Math.abs(x - src[i]) < 1e-6), "both channels play");
});

await test("player: running dry fades out instead of clicking, then waits, then fades back in", () => {
  const P = player({ rate: 48000, prebuffer: 0.25, resume: 0.25, seconds: 4 });
  P.push(sine(24000, 440, 48000));
  const out = P.run(28160);
  ok(P.last().stalls === 1 && P.last().state === "buffering", "it ran dry once and says so");
  ok(maxJump(out.l) < 0.04, `no jump bigger than the wave's own (biggest ${maxJump(out.l).toFixed(4)})`);
  ok(out.l.slice(24000).every((x) => x === 0), "then silence");
  P.push(sine(6000, 440, 48000, 24000));
  ok(P.run(2560).l.every((x) => x === 0), "an eighth of a second back isn't enough to start again");
  P.push(sine(12000, 440, 48000, 30000));
  const back = P.run(6400);
  ok(back.l.some((x) => Math.abs(x) > 0.3) && Math.abs(back.l[0]) < 0.001 && maxJump(back.l) < 0.04, "a quarter second back: it fades in again");
  ok(P.last().stalls === 1, "still one stall");
});

await test("player: a stream at another rate is resampled cleanly", () => {
  const P = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 4 }, 44100);
  P.push(sine(48000, 1000, 48000));
  const out = P.run(22016);
  let err = 0;
  for (let k = 2000; k < 22016; k++) err = Math.max(err, Math.abs(out.l[k] - 0.5 * Math.sin((2 * Math.PI * 1000 * k) / 44100)));
  ok(err < 2e-3, `48 kHz played at 44.1 kHz is the same 1 kHz tone (worst ${err.toExponential(2)})`);
});

await test("player: flush drops what is waiting; too much at once drops the oldest", () => {
  const P = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 1 });
  P.push(new Float32Array(9600).fill(0.25));
  P.run(1280);
  P.send({ t: "flush" });
  ok(P.run(1280).l.every((x) => x === 0), "after a flush: silence");
  P.push(new Float32Array(2400).fill(0.5));
  ok(P.run(1280).l.every((x) => x === 0), "a new stream waits for its own prebuffer");
  P.push(new Float32Array(2400).fill(0.5));
  ok(P.run(3840).l.some((x) => x > 0.49), "then plays");
  const Q = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 1 });
  Q.push(new Float32Array(48000).fill(0.1));
  Q.push(new Float32Array(24000).fill(0.7));
  const out = Q.run(26880);
  const old = out.l.filter((x) => Math.abs(x - 0.1) < 1e-6).length;
  ok(Q.last().drops >= 24000 && old < 24000 && Math.abs(out.l[26879] - 0.7) < 1e-6, `a second and a half into a one-second ring: the oldest half second goes (${old} old frames played), the newest plays`);
});

await test("player: every report says which frame plays when", () => {
  const P = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 2 });
  P.push(new Float32Array(48000).fill(0.2));
  P.run(128 * 32);
  const a = P.p.port.posted[0];
  const b = P.p.port.posted[1];
  ok(P.p.port.posted.length === 2, "one report every 16 blocks");
  ok(Math.abs(b.pos - a.pos - 16 * 128) < 1e-9 && Math.abs(b.time - a.time - (16 * 128) / 48000) < 1e-9, "position and time move together");
  ok(b.written === 48000 && b.state === "playing", "and it says how much has arrived");
});

await test("player: two decks in step; the crossfader blends them at equal power, at once", () => {
  const P = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 4 });
  const a = new Float32Array(48000).fill(0.4);
  const b = new Float32Array(48000).fill(-0.3);
  P.send({ t: "pcm", l: a, r: a, l2: b, r2: b });
  const allA = P.run(12800);
  ok(Math.abs(allA.l[12000] - 0.4) < 1e-6, "the fader on A: deck A alone");
  P.setX(1);
  const toB = P.run(2560);
  ok(Math.abs(toB.l[2000] + 0.3) < 1e-3, "on B: deck B alone, within a few milliseconds");
  ok(maxJump(toB.l) < 0.02, `the move is smoothed: no click (biggest step ${maxJump(toB.l).toFixed(4)})`);
  P.setX(0.5);
  const mid = P.run(2560);
  ok(Math.abs(mid.l[2400] - (0.4 + -0.3) * Math.SQRT1_2) < 1e-3, "in the middle: both at equal power");
  P.send({ t: "pcm", l: new Float32Array(9600).fill(0.4) });
  P.setX(1);
  const none = P.run(128 * 260);
  ok(Math.abs(none.l[128 * 260 - 1] - 0.4) < 1e-3 && Math.abs(none.l[128 * 200] + 0.3) < 1e-3, "a chunk without deck B plays deck A alone, even with the fader on B");
});

await test("player: deck B with nothing of its own is never silence; its start and its ring-out are smoothed", () => {
  const P = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 4 });
  const n = 9600;
  const a = (k: number) => sine(n, 220, 48000, k * n, 0.4);
  const b = () => new Float32Array(n).fill(-0.3);
  // the fader on B all along: A alone, then B's own music, then only B's ring-out, then A alone
  P.send({ t: "pcm", l: a(0), r: a(0) });
  P.send({ t: "pcm", l: a(1), r: a(1), l2: b(), r2: b() });
  P.send({ t: "pcm", l: a(2), r: a(2), l2: b(), r2: b(), own: false });
  P.send({ t: "pcm", l: a(3), r: a(3) });
  P.setX(1);
  const out = P.run(128 * 300).l;
  const peak = (from: number, to: number) => Math.max(...Array.from(out.subarray(from, to), Math.abs));
  ok(peak(4000, 9000) > 0.38, `no deck B yet: deck A plays, not silence (peak ${peak(4000, 9000).toFixed(3)})`);
  ok(Math.abs(out[n + 4000] + 0.3) < 1e-3, "B's own music starts: the fader's blend from that frame");
  ok(peak(2 * n + 4000, 3 * n - 100) > 0.38 && Math.abs(out[2 * n + 4000] - a(2)[4000]) < 1e-3, "only its ring-out: deck A again, the tail faded under it");
  ok(maxJump(out.subarray(2000)) < 0.02, `no clicks where B comes and goes (biggest step ${maxJump(out.subarray(2000)).toFixed(4)})`);
});

await test("player: the brake slows the music to a stop, waits, and comes back where the stream has got to", () => {
  const P = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 8 });
  // a ramp: each frame's value is its place in the stream
  const ramp = Float32Array.from({ length: 4 * 48000 }, (_, i) => i / 1e6);
  P.push(ramp);
  P.run(128 * 100);
  const t0 = g.currentTime as number;
  P.send({ t: "brake", at: t0 + 0.1, dur: 0.4, until: t0 + 1 });
  const out = P.run(128 * 400);
  const at = (sec: number) => out.l[Math.round(sec * 48000)];
  const s0 = 128 * 100;
  const before = at(0.05) * 1e6 - s0;
  ok(Math.abs(before - 0.05 * 48000) < 2, "before it: the stream at full speed");
  const slow = (at(0.32) - at(0.3)) * 1e6;
  ok(slow > 0 && slow < 0.02 * 48000 * 0.6, `halfway down it plays slower (${slow.toFixed(0)} frames in 20 ms)`);
  ok(Math.abs(at(0.6)) < 1e-9 && Math.abs(at(0.95)) < 1e-9, "stopped: quiet until it comes back");
  const back = at(1.05) * 1e6 - s0;
  ok(Math.abs(back - 1.05 * 48000) < 4, `then exactly where the stream would have been (${back.toFixed(0)} vs ${1.05 * 48000})`);
  const tick = P.last();
  ok(Math.abs(tick.pos - (s0 + 400 * 128 - 16 * 128)) <= 16 * 128, "and its clock never stopped");
});

await test("player: a rewind spins the music back, goes quiet, and comes back where the stream has got to", () => {
  const P = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 8 });
  const ramp = Float32Array.from({ length: 4 * 48000 }, (_, i) => i / 1e6);
  P.push(ramp);
  // (well into the stream: a rewind goes back over a second of it)
  P.run(128 * 700);
  const t0 = g.currentTime as number;
  P.send({ t: "move", kind: "rewind", at: t0 + 0.1, dur: 0.48, until: t0 + 1 });
  const out = P.run(128 * 400);
  const at = (sec: number) => out.l[Math.round(sec * 48000)];
  const s0 = 128 * 700;
  ok(Math.abs(at(0.05) * 1e6 - s0 - 0.05 * 48000) < 2, "before it: the stream at full speed");
  const back = (at(0.4) - at(0.38)) * 1e6;
  ok(back < -0.02 * 48000 * 2, `then backwards, fast (${back.toFixed(0)} frames in 20 ms)`);
  ok(Math.abs(at(0.7)) < 1e-9 && Math.abs(at(0.95)) < 1e-9, "spun out: quiet until it comes back");
  const again = at(1.05) * 1e6 - s0;
  ok(Math.abs(again - 1.05 * 48000) < 4, `then exactly where the stream would have been (${again.toFixed(0)} vs ${1.05 * 48000})`);
  ok(Math.abs(P.last().pos - (s0 + 400 * 128 - 16 * 128)) <= 16 * 128, "and its clock never stopped");
});

await test("player: a scratch goes back and forth over a beat and comes back on the next one", () => {
  const P = player({ rate: 48000, prebuffer: 0.1, resume: 0.1, seconds: 8 });
  const ramp = Float32Array.from({ length: 4 * 48000 }, (_, i) => i / 1e6);
  P.push(ramp);
  P.run(128 * 100);
  const t0 = g.currentTime as number;
  P.send({ t: "move", kind: "scratch", at: t0 + 0.1, dur: 0.48, until: t0 + 0.58 });
  const out = P.run(128 * 300);
  const at = (sec: number) => out.l[Math.round(sec * 48000)] * 1e6;
  const s0 = 128 * 100;
  // the hand: forwards fast, then back, then forwards, then back (two strokes in the beat)
  const fwd = at(0.14) - at(0.12);
  const rev = at(0.26) - at(0.24);
  ok(fwd > 0.02 * 48000 * 1.5 && rev < -0.02 * 48000 * 1.5, `back and forth, faster than the music (${fwd.toFixed(0)}, ${rev.toFixed(0)} frames in 20 ms)`);
  const start = s0 + 0.1 * 48000;
  // (where it turns the sound is cut, so those moments read low: the farthest it gets is the top)
  const top = Math.max(...Array.from({ length: 40 }, (_, k) => at(0.1 + (k * 0.48) / 40)));
  ok(top - start > 0.1 * 48000 && top - start < 0.3 * 48000 && Math.abs(at(0.33) - start) < 1500 && Math.abs(at(0.57) - start) < 1500, `around the place it began: a fifth of a second ahead at most, back to it between strokes (${Math.round(top - start)} frames)`);
  const again = at(0.65) - s0;
  ok(Math.abs(again - 0.65 * 48000) < 4, `then on the next beat exactly where the stream would have been (${again.toFixed(0)} vs ${0.65 * 48000})`);
});

await test("speaker: Lyria's 16-bit chunks become two channels of floats", () => {
  const buf = new Int16Array([32767, -32768, 0, 16384]).buffer;
  const { l, r } = pcm16ToFloat(buf);
  ok(l.length === 2 && Math.abs(l[0] - 32767 / 32768) < 1e-9 && r[0] === -1 && l[1] === 0 && r[1] === 0.5, "interleaved left/right, scaled to ±1");
});

/* ------------------------------------------------------------------ the stand-in DJ */

await test("fake DJ: exact sizes, music for every stretch of the night, the peak opens with the drop", () => {
  ok(beatFrames(48000) === 23040 && sectionFrames(48000) === 737280, "at 48 kHz a beat is 23,040 samples, a section 737,280");
  ok(sectionFrames(44100) === 677376, "and whole at 44.1 kHz too");
  ok(SECTIONS.every((s) => s.style.bass?.length === 4 && s.style.chords?.prog.length === 4 && s.style.bpm === 125), "every section: four bars of bass and chords at 125");
  ok(nextSection("wait", null) === null && nextSection("end", "peak1") === null, "no music before the start or after the end");
  ok(nextSection("warm", null) === "warm1" && nextSection("warm", "warm1") === "warm2" && nextSection("warm", "warm2") === "warm1", "the warm-up takes its sections in turn");
  ok(nextSection("peak", "build1") === "peak1" && nextSection("peak", "peak1") === "peak2", "the peak opens with the drop, then moves on");
  ok(nextSection("cool", "peak2") === "cool1" && nextSection("build", "build1") === "build1", "one section repeats");
  ok(renderOrder("peak")[0] === "peak1" && renderOrder("peak").length === SECTIONS.length && new Set(renderOrder("peak")).size === SECTIONS.length, "the peak's first section is made first when the peak is on, and every section once");
  ok(renderOrder("warm").slice(0, 4).join() === "warm1,build1,peak1,cool1", "then every stretch's first, so the host can go anywhere early");
  ok(Object.values(BY_PHASE).every((list) => list.length > 0), "every stretch has music");
});

await test("fake DJ: its recordings kept in 16 bits (half the memory, for a phone playing the speaker): the loudest sample exact, the rest within a 32767th of it, silence silent", () => {
  const n = 48000;
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = 0.8 * Math.sin(i / 7);
    r[i] = -0.5 * Math.sin(i / 11);
  }
  l[1234] = -0.95;
  const k = pack({ id: "x", frames: n - 100, tail: 100, l, r });
  ok(k.l instanceof Int16Array && k.l.byteLength * 2 === l.byteLength && k.frames === n - 100 && k.tail === 100, "16 bits: half the memory, the same frames");
  let worst = 0;
  for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs((k.l[i] * k.k) / 32767 - l[i]), Math.abs((k.r[i] * k.k) / 32767 - r[i]));
  ok((k.l[1234] * k.k) / 32767 === l[1234], "the loudest sample exact");
  ok(worst <= 0.95 / 32767, `the rest within a 32767th of it (${worst.toExponential(2)})`);
  const z = pack({ id: "z", frames: 10, tail: 0, l: new Float32Array(10), r: new Float32Array(10) });
  ok(z.l.every((x) => x === 0) && z.r.every((x) => x === 0), "silence stays silent");
  const into = { l: new Int16Array(n), r: new Int16Array(n) };
  ok(pack({ id: "y", frames: n, tail: 0, l, r }, into).l === into.l, "kept in a recording that went, when it's the same length");
});

/** The stand-in keeps its recordings in 16 bits: a sample is within a 30-thousandth of the loudest. */
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));

/** Sections that sound like their number: the body at n, the ring-out at n / 10 (other styles' from 100). */
const NUM: Record<string, number> = Object.fromEntries(ALL_SECTIONS.map((s, i) => [s.id, i < SECTIONS.length ? i + 1 : 100 + i]));
const TAIL = 96000;
async function fakeRender(sec: Section, rate: number): Promise<Rendered> {
  const frames = sectionFrames(rate);
  const l = new Float32Array(frames + TAIL);
  l.fill(NUM[sec.id], 0, frames);
  l.fill(NUM[sec.id] / 10, frames);
  return { id: sec.id, frames, tail: TAIL, l, r: l.slice() };
}

function mockSpeaker() {
  const got: number[][] = [];
  /** deck B's frames beside each chunk (empty: none), and whether they're B's own music (false: only its ring-out) */
  const gotB: number[][] = [];
  const ownB: boolean[] = [];
  let tick: (() => void) | null = null;
  const m = {
    sent: 0,
    played: 0,
    flushes: 0,
    fades: 0,
    chunks: got,
    chunksB: gotB,
    ownB,
    get sentFrames() {
      return m.sent;
    },
    push(l: Float32Array, _r?: Float32Array, l2?: Float32Array, _r2?: Float32Array, own = true) {
      got.push(Array.from(l));
      gotB.push(l2 ? Array.from(l2) : []);
      ownB.push(!!l2 && own);
      m.sent += l.length;
    },
    buffered: () => Math.max(0, m.sent - m.played) / 48000,
    flush() {
      m.flushes++;
      m.played = m.sent;
    },
    restore() {},
    fadeOut() {
      m.fades++;
    },
    onTick(fn: () => void) {
      tick = fn;
      return () => (tick = null);
    },
    heardFrame: () => m.played,
    /** play `frames` more, then let the DJ top up */
    play(frames: number) {
      m.played += frames;
      tick?.();
    },
  };
  return m;
}

await test("fake DJ: sections in turn on the bar, the ring-out over the next, the end fades, a new set starts over", async () => {
  g.window = globalThis;
  const F = sectionFrames(48000);
  const dj = new FakeDj(fakeRender);
  dj.prepare("warm");
  await sleep(400);
  ok(dj.ready, "the sections are made before anyone taps");
  const sp = mockSpeaker();
  dj.attach(sp as unknown as Speaker);
  ok(sp.sent === 0, "nothing plays while the booth waits");
  dj.setPhase("warm");
  ok(sp.sent >= 5 * 48000 && sp.sent <= 5.25 * 48000 && sp.flushes === 1, "the warm-up starts: five seconds go straight into the speaker");
  const all = () => sp.chunks.flat();
  ok(all().every((x) => x === NUM.warm1), "all of it from the first warm-up section");
  for (let k = 0; k < 80; k++) sp.play(12000);
  let s = all();
  ok(s[F - 1] === NUM.warm1 && near(s[F], NUM.warm2 + NUM.warm1 / 10) && s[F + TAIL] === NUM.warm2, "on the bar: the second section, with the first one's ring-out laid over its start");
  dj.setPhase("peak");
  for (let k = 0; k < 80; k++) sp.play(12000);
  s = all();
  ok(s[2 * F - 1] === NUM.warm2 && near(s[2 * F], NUM.peak1 + NUM.warm2 / 10), "the peak waits for the end of the phrase, then drops");
  ok(Math.abs(dj.beat() - (sp.played - 0) / 23040) < 1e-9, "the beat clock counts from the stream's first downbeat");
  const before = sp.sent;
  dj.setPhase("end");
  sp.play(12000 * 30);
  ok(sp.sent === before && sp.fades === 1, "the end: a fade and nothing more sent");
  await sleep(3700);
  ok(sp.flushes === 2, "then what was left goes");
  dj.setPhase("wait");
  dj.setPhase("warm");
  const fresh = sp.chunks.slice(-1)[0];
  ok(sp.flushes === 3 && fresh.every((x) => x === NUM.warm1), "a new set starts from the first section again");
  ok(Math.abs(dj.beat()) < 1e-9, "and its own first downbeat");
  dj.stop();
});

await test("fake DJ: two decks in step: B in its own style on the same bars, a new style from the next section", async () => {
  ok(KITS.length === 11 && ALL_SECTIONS.length === 72, "eleven more styles, six sections each, house's as it was");
  ok(ALL_SECTIONS.every((s) => s.style.bpm === 125 && s.style.bass?.length === 4 && (s.style.chords?.prog.length ?? 0) === 4), "every style at 125, over the same four bars");
  ok(sectionOf("house", "peak1") === "peak1" && sectionOf("latin", "peak1") === "latin:peak1" && !!ANY_SECTION["bhangra:cool1"], "a style's take on a section of the night");
  const F = sectionFrames(48000);
  const dj = new FakeDj(fakeRender);
  dj.setDecks("house", "latin");
  dj.prepare("warm");
  await sleep(600);
  const sp = mockSpeaker();
  dj.attach(sp as unknown as Speaker);
  dj.setPhase("warm");
  const flat = (k: "chunks" | "chunksB") => sp[k].flat();
  ok(flat("chunks").every((x) => x === NUM.warm1) && flat("chunksB").every((x) => x === NUM["latin:warm1"]), "deck A house, deck B latin: the same section, frame for frame");
  ok(sp.chunks.every((c, i) => sp.chunksB[i].length === c.length), "every chunk carries both decks");
  dj.setDecks("house", "techno");
  await sleep(600);
  for (let k = 0; k < 80; k++) sp.play(12000);
  const A = flat("chunks");
  const B = flat("chunksB");
  ok(B[F - 1] === NUM["latin:warm1"] && near(B[F], NUM["techno:warm2"] + NUM["latin:warm1"] / 10), "B's new style waits for the next section, with the old one's ring-out over its start");
  ok(A[F] !== undefined && near(A[F], NUM.warm2 + NUM.warm1 / 10), "A carries on as before");
  dj.setDecks("house", null);
  for (let k = 0; k < 80; k++) sp.play(12000);
  const B2 = flat("chunksB");
  const lastB = sp.chunksB[sp.chunksB.length - 1];
  const tailChunk = sp.chunks.findIndex((_, i) => sp.chunks.slice(0, i + 1).reduce((x, c) => x + c.length, 0) > 2 * F);
  ok(near(B2[2 * F], NUM["techno:warm2"] / 10) && sp.ownB[tailChunk] === false && lastB.length === 0, "B emptied: only its ring-out, under deck A (not B's own music), then no deck B at all");
  ok(dj.beatFrame(8) === 8 * 23040 && dj.decks, "beat 8 is 8 beats into the stream");
  dj.stop();
});

await test("fake DJ: a deck whose first style isn't recorded yet has nothing of its own (the player plays A alone), and says so", async () => {
  const F = sectionFrames(48000);
  const dj = new FakeDj(fakeRender);
  dj.prepare("warm");
  await sleep(500);
  const sp = mockSpeaker();
  dj.attach(sp as unknown as Speaker);
  dj.setPhase("warm");
  ok(dj.heardDecks()?.a === "house" && dj.heardDecks()?.b === null, "house on A, nothing on B");
  // a pick lands moments before the section's end: no time to record it
  for (let k = 0; k < 40; k++) sp.play(12000);
  dj.setDecks("house", "trance");
  for (let k = 0; k < 30; k++) sp.play(12000);
  // deck B frame for frame beside A (0 where a chunk has none)
  const B = sp.chunks.flatMap((c, i) => (sp.chunksB[i].length ? sp.chunksB[i] : c.map(() => 0)));
  const second = sp.chunks.map((_, i) => i).filter((i) => sp.chunks.slice(0, i).reduce((x, c) => x + c.length, 0) >= F);
  ok(B.length > F + TAIL + 1000 && B[F - 1] === 0 && B[F + TAIL + 100] === 0 && second.length > 0 && second.every((i) => !sp.ownB[i]), "B not recorded in time: nothing of its own that section (the player plays deck A alone there)");
  ok(dj.heardDecks()?.b === null, "and doesn't claim trance yet");
  await sleep(500);
  for (let k = 0; k < 70; k++) sp.play(12000);
  ok(dj.heardDecks()?.b === "trance", `the next section: trance, and it says so (${JSON.stringify(dj.heardDecks())})`);
  dj.stop();
});

await test("fake DJ: a new pick is recorded first for the section after the one going out", async () => {
  const order: string[] = [];
  const dj = new FakeDj(async (sec: Section, rate: number) => {
    order.push(sec.id);
    return fakeRender(sec, rate);
  });
  dj.prepare("warm");
  await sleep(500);
  const sp = mockSpeaker();
  dj.attach(sp as unknown as Speaker);
  dj.setPhase("warm");
  for (let k = 0; k < 20; k++) sp.play(12000);
  const from = order.length;
  dj.setDecks("house", "trance");
  await sleep(400);
  ok(order[from] === "trance:warm2", `warm1 is going out: trance's warm2 first (${order.slice(from, from + 3).join(", ")})`);
  dj.stop();
});

await test("tracks: each its own chords in A minor, every part moved onto them, both decks on the same chords", async () => {
  const { PROGS, asTrack, shiftNote, stepTo, trackFor, trackOf, newTrack } = await import("../src/party/dj/fake/tracks");
  const M = (n: string) => line(n)[0]!;
  ok(shiftNote(M("A4"), 3) === M("D5") && shiftNote(M("C5"), 3) === M("F5") && shiftNote(M("G4"), -3) === M("D4") && shiftNote(M("E4"), 0) === M("E4"), "a note moves along A minor: A up three steps is D, C is F, G down three is D");
  ok(stepTo(0, 5) === -2 && stepTo(5, 2) === -3 && stepTo(2, 6) === -3 && stepTo(6, 0) === 1, "the shortest way between two chords: Am to F is two steps down, G to Am one up");
  ok(trackOf(0).prog.join() === "0,5,2,6" && trackOf(123).prog.join() === trackOf(123).prog.join() && new Set(Array.from({ length: 60 }, (_, i) => trackOf(i + 1).prog.join())).size >= 8, "track 0 is the night as written; a track number is always the same track; sixty tracks use most of the progressions");
  ok(trackFor("Despacito") === trackFor("  despacito ") && trackFor("Despacito") !== trackFor("See You Again") && trackFor("x") >= 1, "a song asked for by name: the same words, the same remix");
  ok(newTrack(5, () => 0.5) !== 5 && newTrack(0, () => 0) === 1, "a new track is any but the one playing");
  const minor = (m: number | null) => m === null || [9, 11, 0, 2, 4, 5, 7].includes(m % 12);
  for (const n of [7, 31, 4242, 99999]) {
    const t = trackOf(n);
    for (const base of ALL_SECTIONS) {
      const s = asTrack(base, t, `${base.id}~${n}`);
      const notes = [...(s.style.bass ?? []).flat(), ...(s.style.chords?.prog ?? []).flat(), ...(s.style.lead?.bars ?? []).flat()];
      if (!notes.every(minor)) ok(false, `${s.id}: everything in A minor`);
      if (!(s.style.bass ?? []).flat().every((m) => m === null || (m >= 28 && m <= 52))) ok(false, `${s.id}: the bass between E1 and E3`);
      // each bar's chord is the same kind of chord as written (the same steps above its root, however
      // it's voiced), now on the track's chord for that bar
      const deg = (m: number) => [9, 11, 0, 2, 4, 5, 7].indexOf(m % 12);
      const shape = (c: number[], root: number) => c.map((m) => (deg(m) - root + 7) % 7).sort().join();
      const was = base.style.chords?.prog ?? [];
      const now = s.style.chords?.prog ?? [];
      if (!now.every((c, i) => shape(c, t.prog[i]) === shape(was[i], [0, 5, 2, 6][i]))) ok(false, `${s.id}: its chords are the written ones moved onto the track's`);
    }
  }
  ok(true, "every style's every section, as four different tracks: in A minor, the bass in range, the chords the track's");
  // latin and techno both voice their chords from the root: the same track gives both the same roots
  const two = ["latin:peak1", "techno:peak1"].map((id) => asTrack(ANY_SECTION[id], trackOf(31), `${id}~31`).style.chords!.prog.map((c) => Math.min(...c) % 12).join());
  ok(two[0] === two[1] && two[0] === trackOf(31).prog.map((d) => [9, 11, 0, 2, 4, 5, 7][d]).join(), `two decks in different styles, the same track: the same chords bar for bar (${two[0]})`);
  ok(asTrack(ANY_SECTION.peak1, trackOf(0), "peak1") === ANY_SECTION.peak1, "track 0 is left as it is");
});

await test("fake DJ: a new song every eight sections, both decks in it together; a song asked for comes in next", async () => {
  const F = sectionFrames(48000);
  const dj = new FakeDj(fakeRender);
  dj.setDecks("house", "latin");
  dj.prepare("warm");
  await sleep(500);
  const sp = mockSpeaker();
  dj.attach(sp as unknown as Speaker);
  dj.setPhase("warm");
  const at: { id: string; track: number; b: boolean }[] = [];
  // a section's worth of playing, then a look at what's heard: from the middle of one section to the middle of the next
  const play = async (frames: number) => {
    for (let left = frames, k = 0; left > 0; left -= 12000, k++) {
      sp.play(Math.min(12000, left));
      if (k % 20 === 0) await sleep(2);
    }
    await sleep(10);
  };
  const section = async () => {
    await play(F);
    const h = dj.heardSection();
    at.push({ id: h?.id ?? "", track: h?.track ?? -1, b: sp.ownB[sp.ownB.length - 1] });
  };
  await play(F / 2);
  at.push({ id: dj.heardSection()?.id ?? "", track: dj.heardSection()?.track ?? -1, b: false });
  for (let i = 0; i < 9; i++) await section();
  ok(at.slice(0, 8).every((x) => x.track === 0 && !x.id.includes("~")), `the first song is the night as written, eight sections (${at.slice(0, 8).map((x) => x.id)})`);
  const song = at[8].track;
  ok(song > 0 && at[8].id === `warm1~${song}` && at[9].id === `warm2~${song}`, `then the next song, from its first section (${at[8].id}, ${at[9].id})`);
  ok(at[8].b && at[9].b, "deck B in it too, its own music: the same song, the same chords");
  ok(at.slice(1, 8).every((x) => x.b), "(and in the first song)");
  dj.playTrack(777);
  await section();
  await section();
  ok(at[11].track === 777 && at[11].id.endsWith("~777"), `a song asked for comes in at the next section (${at[10].id}, ${at[11].id})`);
  dj.stop();
});

/* ------------------------------------------------------------------ the host's own songs */

await test("your songs: the beat of a made-up song, to a hundredth of a beat a minute; its bar and its loud part", async () => {
  const { analyzeSong, matchRate } = await import("../src/party/dj/local/beats");
  // a made-up song: a kick (heavier on the bar's first beat), a snare on 2 and 4, hats, a bass in the loud part
  const song = (bpm: number, first: number, downAt: number, bars: number, loudFrom: number, rate = 44100) => {
    const beat = 60 / bpm;
    const len = Math.ceil((first + bars * 4 * beat + 2) * rate);
    const x = new Float32Array(len);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const add = (t: number, dur: number, f: (u: number) => number) => {
      const s0 = Math.floor(t * rate);
      for (let i = 0; i < dur * rate && s0 + i < len; i++) x[s0 + i] += f(i / rate);
    };
    for (let k = 0; k < bars * 4; k++) {
      const t = first + k * beat;
      const inBar = (((k - downAt) % 4) + 4) % 4;
      const bar = Math.floor((k - downAt) / 4);
      const loud = bar >= loudFrom;
      if (bar >= 0) add(t, 0.18, (u) => (inBar === 0 ? 1 : 0.7) * (loud ? 1 : 0.5) * Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-u * 30)) * u) * Math.exp(-u * 18));
      if (inBar === 1 || inBar === 3) add(t, 0.12, (u) => (loud ? 0.4 : 0.2) * rnd() * Math.exp(-u * 30));
      for (const h of [0, 0.5]) add(t + h * beat, 0.03, (u) => 0.08 * rnd() * Math.exp(-u * 120));
      if (loud && bar >= 0) add(t, beat * 0.9, (u) => 0.25 * Math.sin(2 * Math.PI * 49 * u) * Math.exp(-u * 3));
    }
    return { x, rate };
  };
  const wrap = (a: number, m: number) => Math.min(((a % m) + m) % m, m - (((a % m) + m) % m));
  for (const [bpm, first, downAt, bars, loudFrom] of [
    [128, 0.37, 2, 96, 32],
    [95, 1.1, 0, 64, 16],
    [140, 0.05, 1, 110, 24],
  ] as const) {
    const s = song(bpm, first, downAt, bars, loudFrom);
    const r = analyzeSong(s.x, s.rate)!;
    const beat = 60 / bpm;
    const down = first + downAt * beat;
    ok(Math.abs(r.bpm - bpm) < 0.02, `${bpm} BPM: found ${r.bpm.toFixed(3)}`);
    ok(wrap(r.first - first, beat) < 0.012 && wrap(r.down - down, 4 * beat) < 0.02, `  its beats within 12 ms (${r.first.toFixed(3)} s) and its bar (${r.down.toFixed(3)} s)`);
    ok(Math.abs(r.cue - (down + loudFrom * 4 * beat)) < 0.05, `  where it gets loud: ${r.cue.toFixed(2)} s`);
    ok(r.sure > 0.3, `  a clear beat (${r.sure.toFixed(2)})`);
  }
  const noise = new Float32Array(22050 * 60);
  let seed = 7;
  for (let i = 0; i < noise.length; i++) noise[i] = ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.3;
  ok(analyzeSong(noise, 22050)!.sure < 0.3, "noise has no clear beat");
  ok(analyzeSong(new Float32Array(44100 * 10), 44100) === null, "under 20 seconds: can't tell");
  ok(Math.abs(matchRate(124, 128)! - 128 / 124) < 1e-9 && matchRate(64, 128) === 1 && matchRate(100, 128) === null, "matched a little faster; half-time counts double; too far off isn't matched");
});

await test("your songs: names from tags or the file name", async () => {
  const { nameOfFile, tagsOf, songId } = await import("../src/party/dj/local/crate");
  ok(JSON.stringify(nameOfFile("01 Jay Chou - 晴天.mp3")) === JSON.stringify({ artist: "Jay Chou", title: "晴天" }) && nameOfFile("07. Dynamite.m4a").title === "Dynamite" && nameOfFile("track_one.wav").title === "track one", "from the file name: a track number and the ending go, \"Artist - Title\" splits");
  // an MP3's ID3v2.3 title and artist (latin-1 and UTF-16)
  const frame = (id: string, body: number[]) => [...Array.from(id, (c) => c.charCodeAt(0)), 0, 0, 0, body.length, 0, 0, ...body];
  const utf16 = (s: string) => [1, 0xff, 0xfe, ...Array.from(s).flatMap((c) => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])];
  const frames = [...frame("TIT2", [0, ...Array.from("Shape of You", (c) => c.charCodeAt(0))]), ...frame("TPE1", utf16("周杰伦"))];
  const id3 = new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, frames.length, ...frames, 0xff, 0xfb]);
  const t = tagsOf(id3, "x.mp3");
  ok(t.title === "Shape of You" && t.artist === "周杰伦", `an MP3's tags (${t.title}, ${t.artist})`);
  // an M4A's: moov › udta › meta › ilst › ©nam / ©ART › data
  const atom = (type: string, body: number[]) => {
    const n = 8 + body.length;
    return [n >> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255, ...Array.from(type, (c) => c.charCodeAt(0)), ...body];
  };
  const text = (s: string) => atom("data", [0, 0, 0, 1, 0, 0, 0, 0, ...new TextEncoder().encode(s)]);
  const ilst = atom("ilst", [...atom("©nam", text("夜曲")), ...atom("©ART", text("Jay"))]);
  const m4a = new Uint8Array([...atom("ftyp", Array.from("M4A ", (c) => c.charCodeAt(0))), ...atom("moov", atom("udta", atom("meta", [0, 0, 0, 0, ...ilst])))]);
  const m = tagsOf(m4a, "01 Track.m4a");
  ok(m.title === "夜曲" && m.artist === "Jay", `an M4A's tags (${m.title}, ${m.artist})`);
  ok(tagsOf(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "Artist - Song.wav").artist === "Artist", "no tags: the file name");
  ok(songId({ name: "a.mp3", size: 10, lastModified: 1 }) === songId({ name: "a.mp3", size: 10, lastModified: 1 }) && songId({ name: "a.mp3", size: 11, lastModified: 1 }) !== songId({ name: "a.mp3", size: 10, lastModified: 1 }), "the same file is the same song");
});

await test("your songs: the local DJ plays the song on the air from its top, starts the next on a bar line, cues a drop on its loud part, follows a song too far off the beat", async () => {
  const { LocalDj, ENDING_S } = await import("../src/party/dj/local/LocalDj");
  const R = 48000;
  // a song's samples say where in it they are: sample i is i / 1e8
  const pcm = (seconds: number) => {
    const l = new Float32Array(Math.round(seconds * R));
    for (let i = 0; i < l.length; i++) l[i] = i / 1e8;
    return { l, r: l };
  };
  const beat = (bpm: number, down: number, cue: number, end: number) => ({ bpm, first: down % (60 / bpm), down, cue, end, sure: 1 });
  const songs = [
    { id: "s1", title: "One", artist: "", file: { name: "s1" } as File, beat: beat(128, 0.1, 30.1, 200), seconds: 210 },
    { id: "s2", title: "Two", artist: "", file: { name: "s2" } as File, beat: beat(124, 0.2, 60.2, 180), seconds: 190 },
    { id: "s3", title: "Three", artist: "", file: { name: "s3" } as File, beat: beat(100, 0.3, 40.3, 150), seconds: 160 },
  ];
  const decoded: Record<string, ReturnType<typeof pcm>> = { s1: pcm(210), s2: pcm(190), s3: pcm(160) };
  const dj = new LocalDj(async (f) => decoded[f.name]);
  const endings: string[] = [];
  dj.onEnding = (id) => endings.push(id);
  dj.setCrate(songs);
  dj.setPhase("warm");
  dj.setDecks("s1", "s2", "a", 0);
  await sleep(20);
  ok(dj.ready && JSON.stringify(dj.sounding()) === JSON.stringify({ a: "s1", b: "s2" }), "both songs decoded: it says so");
  const sp = mockSpeaker();
  dj.attach(sp as unknown as Speaker);
  const at = (chunks: number[][], f: number) => chunks[Math.floor(f / 12000)][f % 12000] * 1e8;
  // play on, a chunk at a time (the DJ tops up as the speaker plays)
  const run = (frames: number) => {
    for (let left = frames; left > 0; left -= 12000) sp.play(Math.min(12000, left));
  };
  ok(Math.abs(dj.bpm - 128) < 1e-9 && dj.beatFrame(0) === 0.1 * R, "the first song sets the night's bars: its tempo, its first downbeat beat 0");
  ok(Math.abs(at(sp.chunks, 0)) < 1e-3 && Math.abs(at(sp.chunks, 30000) - 30000) < 3, "deck A plays it from the top at its own speed");
  ok(sp.ownB.every((x) => !x), "deck B waits at its start (the player plays A alone)");
  // the fader towards B: it starts on the next bar line, a little faster to fall on the night's beat
  run(48000);
  dj.setDecks("s1", "s2", "a", 0.3);
  const from = sp.sent;
  run(48000 * 2);
  const k = sp.ownB.findIndex((x, i) => x && i * 12000 >= from);
  ok(k >= 0, "the fader leans towards B: B plays");
  const barF = 4 * (60 / 128) * R;
  // where B's first downbeat (0.2 s into it) is heard: on a bar line
  let downAt = -1;
  for (let f = k * 12000; f < sp.chunksB.length * 12000; f++) {
    const v = sp.chunksB[Math.floor(f / 12000)][f % 12000] * 1e8;
    if (v >= 0.2 * R) {
      downAt = f;
      break;
    }
  }
  ok(downAt > 0 && Math.abs(((downAt - 0.1 * R) / barF) % 1) * barF < 2, `its first downbeat on a bar line (frame ${downAt})`);
  const f2 = downAt + 48000;
  while (sp.sent < f2 + 12000) run(12000);
  const step = (at(sp.chunksB, f2) - at(sp.chunksB, downAt)) / 48000;
  ok(Math.abs(step - 128 / 124) < 1e-4, `a little faster: ${step.toFixed(4)} (128/124)`);
  // a drop on its way into B at beat 64: B's loud part lands on it
  dj.cue("b", 64);
  run(48000 * 4);
  const dropF = 0.1 * R + 64 * (60 / 128) * R;
  run(Math.max(0, dropF + 24000 - sp.played));
  const v = at(sp.chunksB, dropF);
  ok(Math.abs(v - 60.2 * R) < 3, `the drop's bar plays B's loud part (${(v / R).toFixed(3)} s in)`);
  // the drop lands: B on the air; A gets the next song, too far off the beat to match (100 BPM)
  dj.setDecks("s3", "s2", "b", 1);
  await sleep(20);
  ok(dj.bpm === 128 && JSON.stringify(dj.sounding()) === JSON.stringify({ a: "s3", b: "s2" }), "B on the air (matched: the bars stay), A has the next");
  const epoch = dj.epoch;
  dj.cue("a", 128);
  dj.setDecks("s3", "s2", "a", 0);
  ok(dj.epoch === epoch + 1 && Math.abs(dj.bpm - 100) < 1e-9, "dropped into a song too far off the beat: the night's bars become its bars");
  ok(endings.length === 0, "nothing ending yet");
  // play on to its drop, then to near its end: the room hears it's ending, once
  run(Math.max(0, 0.1 * R + 128 * (60 / 128) * R - sp.played));
  ok(endings.length === 0, "not before");
  run((150 - 40.3 - ENDING_S + 2) * R);
  ok(endings.join() === "s3", `the song on the air nearly over: the room hears once (${endings})`);
  dj.stop();
});

/* ------------------------------------------------------------------ Lyria (A2), without Google */

await test("songs asked for: the style of a song's remix, from the song list or from its name", async () => {
  const { hintOf, styleForRequest } = await import("../src/shared/dj/requests");
  const { SONG_ROWS } = await import("../src/data/songs");
  const { fromRow } = await import("../src/shared/songs");
  const row = (t: string, a?: string) => fromRow(SONG_ROWS.find((r) => r[1] === t && (!a || r[2] === a))!);
  const of = (t: string, a?: string) => {
    const s = row(t, a);
    return styleForRequest(`${s.t} ${s.a} ${s.ae}`, hintOf(s));
  };
  ok(of("晴天", "周杰伦") === "cpop" && of("HUMBLE.") === "hiphop", "from the song list: Jay Chou is C-pop, Kendrick Lamar hip-hop");
  ok(styleForRequest("Despacito") === "latin" && styleForRequest("some techno please") === "techno" && styleForRequest("drum and bass") === "dnb" && styleForRequest("BLACKPINK") === "kpop", "a genre or an artist in the name says it outright");
  ok(styleForRequest("사랑") === "kpop" && styleForRequest("夜に駆ける") === "kpop" && styleForRequest("月亮代表我的心") === "cpop" && styleForRequest("canción de mi niñez") === "latin", "otherwise the script it's written in: Korean and Japanese K-pop, Chinese C-pop, Spanish latin");
  ok(styleForRequest("some song") === "house" && styleForRequest("x", { lang: "en", cats: 16 }) === "hiphop" && styleForRequest("x", { lang: "ko", cats: 0 }) === "kpop", "nothing to go on: house; the list's language and kinds when it has them");
  ok(hintOf({ l: 3, k: 2 }).lang === "ko" && hintOf({ l: 99, k: 0 }).lang === "other", "a list row's language by its index");
});

await test("lyria relay: only Lyria's own controls get through, inside its ranges", () => {
  const p = toGoogle({ prompts: [{ text: "Deep House", weight: 1 }, { text: "Chill", weight: 0.5 }] }) as { clientContent: { weightedPrompts: { text: string; weight: number }[] } };
  ok(p?.clientContent.weightedPrompts.length === 2 && p.clientContent.weightedPrompts[0].text === "Deep House", "prompts pass as Lyria's clientContent");
  const many = toGoogle({ prompts: Array.from({ length: 12 }, (_, i) => ({ text: `p${i}`, weight: 1 })) }) as typeof p;
  ok(many.clientContent.weightedPrompts.length === 8, "at most 8");
  const odd = toGoogle({ prompts: [{ text: "  a\nb\u0000c  ", weight: 2 }, { text: "x".repeat(300), weight: 99 }, { text: "zero", weight: 0 }, { text: "", weight: 1 }, { text: "nan", weight: "1" }] }) as typeof p;
  const w = odd.clientContent.weightedPrompts;
  ok(w.length === 2 && w[0].text === "a b c" && w[1].text.length === 120 && w[1].weight === 10, "cleaned to one line, cut at 120, weights inside ±10; a 0, an empty or a non-number weight is dropped");
  ok(toGoogle({ prompts: [{ text: "x", weight: 0 }] }) === null, "nothing left: nothing sent");
  const c = toGoogle({ config: { bpm: 300, density: -1, brightness: 0.5, scale: "H_MAJOR", muteDrums: true, guidance: 9, topK: 0.4, seed: -5, temperature: "hot", evil: 1 } }) as { musicGenerationConfig: Record<string, unknown> };
  const m = c.musicGenerationConfig;
  ok(m.bpm === 200 && m.density === 0 && m.brightness === 0.5 && m.guidance === 6 && m.topK === 1 && m.seed === 0, "every setting kept inside Lyria's range");
  ok(!("scale" in m) && !("temperature" in m) && !("evil" in m) && m.muteDrums === true, "an unknown key, a scale that isn't one, a setting that isn't a number: dropped");
  ok((toGoogle({ config: { bpm: 59.6, scale: "C_MAJOR_A_MINOR" } }) as typeof c).musicGenerationConfig.bpm === 60, "the tempo is a whole number");
  ok(toGoogle({ config: { nothing: true } }) === null, "a config with nothing in it isn't sent");
  ok((toGoogle({ play: "PAUSE" }) as { playbackControl: string }).playbackControl === "PAUSE", "the four playback controls pass");
  ok(toGoogle({ play: "EXPLODE" }) === null && toGoogle({ setup: { model: "models/other" } }) === null && toGoogle(null) === null && toGoogle("PLAY") === null, "anything else (another model above all: the relay sets it) is dropped");
});

/** Seconds of a four-on-the-floor at `bpm`, its first kick `offMs` in, as 16-bit stereo. */
function kicks(seconds: number, bpm: number, offMs: number, from = 0, kick = true) {
  const n = Math.round(seconds * 48000);
  const beat = (48000 * 60) / bpm;
  const off = (offMs / 1000) * 48000;
  const out = new Int16Array(n * 2);
  let seed = 3;
  for (let i = 0; i < n; i++) {
    const f = from + i;
    const t = ((((f - off) % beat) + beat) % beat) / 48000;
    const k = kick && f >= off ? Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * 0.8 : 0;
    seed = (seed * 16807) % 2147483647;
    const noise = (seed / 2147483647 - 0.5) * 0.1;
    const pad = Math.sin(2 * Math.PI * 220 * (f / 48000)) * 0.08;
    const v = Math.round((k + noise + pad) * 30000);
    out[i * 2] = v;
    out[i * 2 + 1] = v;
  }
  return out.buffer;
}

await test("lyria beat: the kick gives the beat's place in the stream; no kick, no answer", () => {
  const clock = new KickClock(48000, 125);
  for (let k = 0; k < 10; k++) {
    const { l, r } = pcmChunk(kicks(2, 125, 137, k * 96000), 48000);
    clock.feed(l, r, k * 96000);
  }
  const off = clock.offset();
  ok(off !== null && Math.abs(off - 0.137 * 48000) < 0.02 * 23040, `the first beat 137 ms in (${off === null ? "none" : ((off / 48000) * 1000).toFixed(1)} ms)`);
  ok(clock.sure() > 0.8, `and sure of it (${clock.sure().toFixed(2)})`);
  const quiet = new KickClock(48000, 125);
  const { l, r } = pcmChunk(kicks(10, 125, 137, 0, false), 48000);
  quiet.feed(l, r, 0);
  ok(quiet.offset() === null, "a stretch with no kick gives no answer");
  const half = pcmChunk(kicks(1, 125, 0), 24000);
  ok(half.l.length === 96000, "a chunk at another rate comes out at 48 kHz");
});

await test("lyria prompts: each stretch's mood, the curve's energy, the mix's tempo and key, words from the guide", () => {
  const all = new Set([...Object.values(WORDS.genres).flat(), ...Object.values(WORDS.instruments).flat(), ...WORDS.moods]);
  const warm = lyriaFor("warm", mixFor("warm", FAKE_MIX));
  ok(warm.prompts[0].text === "Deep House" && warm.prompts[0].weight === 1 && warm.prompts.some((p) => p.text === "Chill"), "the warm-up: deep house, chill");
  ok(warm.config.bpm === 125 && warm.config.scale === "C_MAJOR_A_MINOR" && warm.config.density === 0.35, "at the stand-in's tempo and key, the warm-up's density");
  const peak = lyriaFor("peak", mixFor("peak", FAKE_MIX));
  ok(peak.prompts.some((p) => p.text === "Euphoric") && peak.config.density === 0.9 && peak.config.brightness === 0.8, "the peak: euphoric, dense and bright");
  ok(lyriaFor("end", mixFor("end", FAKE_MIX)).prompts.every((p) => p.text !== "Chill" && p.text !== "Euphoric"), "no mood when no music plays");
  const used = [...Object.values(FALLBACK_PROMPTS).flat().map((p) => p!.text), ...["warm", "build", "peak", "cool"].flatMap((ph) => lyriaFor(ph as "warm", mixFor(ph as "warm", FAKE_MIX)).prompts.map((p) => p.text))];
  ok(used.every((t) => all.has(t)), `every prompt word is in Google's guide (${used.filter((t) => !all.has(t)).join(", ") || "all"})`);
});

/** A WebSocket the test drives: what LyriaDj sends, and the relay's messages delivered by hand. */
class MockWS {
  static OPEN = 1;
  static made: MockWS[] = [];
  readyState = 1;
  sent: Record<string, unknown>[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    MockWS.made.push(this);
  }
  send(s: string) {
    this.sent.push(JSON.parse(s));
  }
  close() {
    this.readyState = 3;
  }
  say(m: unknown) {
    this.onmessage?.({ data: typeof m === "string" ? m : JSON.stringify(m) });
  }
  audio(seconds: number, from: number) {
    const data = Buffer.from(kicks(seconds, 125, 137, from)).toString("base64");
    this.say({ serverContent: { audioChunks: [{ data, mimeType: "audio/l16;rate=48000;channels=2" }] } });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
}

await test("lyria DJ: gathers, hands over, keeps a few seconds ahead, holds Lyria back when it races, follows the night, says why it stops", async () => {
  g.window = globalThis;
  g.WebSocket = MockWS;
  const dj = new LyriaDj("ws://relay/room/ABCD/lyria?sid=tv1");
  let ready = 0;
  const fails: string[] = [];
  dj.onReady = () => ready++;
  dj.onFail = (why) => fails.push(why);
  dj.begin("warm", mixFor("warm", FAKE_MIX));
  const ws = MockWS.made[0];
  ok(ws?.url.endsWith("/lyria?sid=tv1"), "it asks the table's relay, as this screen");
  ok(ws.sent.length === 0, "nothing is sent before the relay says Lyria is ready");
  ws.say({ t: "ready" });
  const kinds = ws.sent.map((m) => Object.keys(m)[0]);
  ok(kinds.join() === "config,prompts,play" && (ws.sent[2] as { play: string }).play === "PLAY", "then the stretch's config, its prompts, and play");
  ws.audio(2, 0);
  ok(ready === 0 && dj.inHand === 2, "two seconds in hand: not enough to start");
  ws.audio(2, 96000);
  ok(ready === 1, "four: enough, it says so (the booth hands over from the stand-in)");
  const sp = mockSpeaker();
  sp.push(new Float32Array(12000)); // the stand-in's last quarter second, still waiting to play
  dj.go(sp as unknown as Speaker);
  ok(sp.sent >= 12000 + 4 * 48000 - 12000 && sp.buffered() <= 4.26, `it keeps four seconds waiting in the speaker, after what's there (${sp.buffered().toFixed(2)} s)`);
  for (let k = 0; k < 4; k++) ws.audio(2, (2 + k) * 96000);
  ok(ws.sent.some((m) => (m as { play?: string }).play === "PAUSE"), `more than 8 seconds in hand: Lyria is paused (${dj.inHand.toFixed(1)} s)`);
  for (let k = 0; k < 40 && !ws.sent.slice(3).some((m) => (m as { play?: string }).play === "PLAY"); k++) sp.play(12000);
  ok(dj.inHand < 3 && ws.sent.slice(3).some((m) => (m as { play?: string }).play === "PLAY"), "under 3: played again");
  const b = dj.beat();
  ok(Math.abs(b - (sp.played - 12000 - 0.137 * 48000) / 23040) < 0.02, `the beat from the kick, counted from where Lyria's music starts (${b.toFixed(3)})`);
  const before = ws.sent.length;
  dj.setPhase("peak", mixFor("peak", FAKE_MIX));
  const asked = ws.sent.slice(before);
  ok(asked.some((m) => JSON.stringify(m).includes("Euphoric")) && asked.some((m) => (m as { config?: { density: number } }).config?.density === 0.9), "the peak: new prompts and config at once");
  ok(dj.heardSection()?.phase === "warm", "the speakers still sound the warm-up");
  await sleep(1600);
  const at = sp.sent + Math.round(dj.inHand * 48000);
  ws.audio(2, 12 * 96000);
  while (sp.played < at + 1000) sp.play(12000);
  ok(dj.heardSection()?.phase === "peak", "once Lyria's music after the change reaches the speakers, they sound the peak");
  ws.drop();
  await sleep(600);
  ok(MockWS.made.length === 2, "the relay's socket drops: it comes straight back");
  MockWS.made[1].say({ t: "ready" });
  ok(MockWS.made[1].sent.some((m) => JSON.stringify(m).includes("Euphoric")), "and sets Lyria up for the stretch it's in");
  MockWS.made[1].say({ t: "end", why: "cap" });
  ok(fails.join() === "cap" && MockWS.made[1].sent.some((m) => (m as { play?: string }).play === "STOP"), "the relay ends it (the month's cap): it stops and says why");
  const n = sp.sent;
  sp.play(48000 * 6);
  ok(sp.sent === n, "and sends nothing more");
});

/* ------------------------------------------------------------------ a song asked for, played for real */

/** Seconds of a song at `bpm` (48 kHz mono): a kick on every beat (heavier on each bar's first), its first `first` seconds in, hats, a held note. */
function song(seconds: number, bpm: number, first: number, loud = 0.6) {
  const n = Math.round(seconds * 48000);
  const x = new Float32Array(n);
  const beat = 60 / bpm;
  let seed = 7;
  for (let k = 0; first + k * beat < seconds; k++) {
    const s0 = Math.round((first + k * beat) * 48000);
    const amp = k % 4 === 0 ? 1 : 0.55;
    for (let i = 0; i < 0.2 * 48000 && s0 + i < n; i++) {
      const t = i / 48000;
      x[s0 + i] += Math.sin(2 * Math.PI * (55 + 90 * Math.exp(-t * 30)) * t) * Math.exp(-t * 14) * amp * loud;
    }
    const h = Math.round((first + (k + 0.5) * beat) * 48000);
    for (let i = 0; i < 0.03 * 48000 && h + i < n; i++) {
      seed = (seed * 16807) % 2147483647;
      x[h + i] += (seed / 2147483647 - 0.5) * 0.2 * Math.exp((-i / 48000) * 120) * loud;
    }
  }
  for (let i = 0; i < n; i++) x[i] += Math.sin((2 * Math.PI * 220 * i) / 48000) * 0.05 * loud;
  return x;
}
const rmsDb = (x: Float32Array, a: number, b: number, k = 1) => {
  let sum = 0;
  for (let i = a; i < b; i++) sum += (x[i] * k) ** 2;
  return 10 * Math.log10(sum / (b - a));
};

await test("clip: a song's 30 seconds, listened to: its beat, its first downbeat after the fade-in, where it ends, how loud", () => {
  const x = song(30, 128, 0.3);
  const c = clipOf("u", x, x)!;
  ok(!!c && !!c.beat && Math.abs(c.beat.bpm - 128) < 0.05, `its tempo (${c?.beat?.bpm.toFixed(3)})`);
  const beat = 60 / 128;
  const k = (c.start - 0.3) / beat;
  ok(c.start >= 1 && c.start < 1 + 4 * beat && Math.abs(k - Math.round(k)) < 0.02 && Math.round(k) % 4 === 0, `it starts on a downbeat a second or more in, the first there is (${c.start.toFixed(3)} s, beat ${k.toFixed(2)})`);
  ok(c.end <= 29.75 && c.end > 25, `and plays to near its end (${c.end.toFixed(2)} s)`);
  const level = rmsDb(x, Math.round(c.start * 48000), Math.round(c.end * 48000), c.gain);
  ok(Math.abs(level - CLIP_DB) < 0.3, `as loud as the night at its peak (${level.toFixed(2)} dBFS)`);
  ok(clipOf("u", x.subarray(0, 5 * 48000), x.subarray(0, 5 * 48000)) === null, "five seconds of something isn't worth it");
  const hum = new Float32Array(30 * 48000).map((_, i) => Math.sin((2 * Math.PI * 220 * i) / 48000) * 0.1);
  const h = clipOf("u", hum, hum)!;
  ok(!!h && h.beat === null && h.start === 1, "no beat: it starts a second in, at its own speed");
});

await test("clip: fetched once a URL, and nothing (the remix alone) when it can't be had", async () => {
  let asked = 0;
  const x = song(30, 124, 0.5);
  const get = async () => {
    asked++;
    return { l: x, r: x };
  };
  const a = await loadClip("https://audio-ssl.itunes.apple.com/itunes-assets/a.m4a", get);
  const b = await loadClip("https://audio-ssl.itunes.apple.com/itunes-assets/a.m4a", get);
  ok(!!a && a === b && asked === 1, "the same clip, fetched once");
  const bad = await loadClip("https://audio-ssl.itunes.apple.com/itunes-assets/gone.m4a", async () => {
    throw new Error("404");
  });
  ok(bad === null, "one that can't be fetched: none");
});

/** A clip by hand: every sample `v`, on the beat at `bpm`, from 1 s to 29 s. */
const handClip = (v: number, bpm: number | null, gain = 1): Clip => {
  const l = new Float32Array(30 * 48000).fill(v);
  return { url: `hand-${v}-${bpm}`, l, r: l, beat: bpm ? { bpm, first: 1, down: 1, cue: 1, end: 29, sure: 1 } : null, start: 1, end: 29, gain };
};

await test("clip deck: on the drop's bar, moved by a new count until it sounds, over the deck's drums alone, back to the deck's own sound on a bar line", () => {
  const BAR = 4 * 23040;
  const cd = new ClipDeck();
  const clip = handClip(1, 125, 0.5);
  cd.set(clip, 0);
  ok(cd.waiting && cd.matches(125) && !cd.matches(100) && cd.wantsBed(125) && !cd.wantsBed(100), "set: waiting; on the beat at 125 (its drums alone wanted), not at 100");
  cd.start(100000, 125, 0);
  cd.start(200000, 125, 50000);
  ok(cd.playing.length === 1 && cd.playing[0].at === 200000, "a new count before any of it was sent: it moves to the new bar");
  cd.start(300000, 125, 199600);
  ok(cd.playing[0].at === 200000 && !cd.waiting, "once it sounds, it stays");
  const to = 200000 + 14 * BAR;
  ok(cd.playing[0].to === to && cd.playing[0].bed && cd.playing[0].step === 1, `it ends on a bar line (${cd.playing[0].to}), over the drums alone`);
  const chunk = (f0: number) => {
    const l = new Float32Array(1000).fill(2);
    const r = new Float32Array(1000).fill(2);
    if (cd.live(f0, 1000)) cd.mix(l, r, f0, [new Float32Array(1000).fill(10), new Float32Array(1000).fill(10)]);
    return l;
  };
  ok(chunk(150000).every((v) => v === 2), "before its bar: the deck's own sound");
  ok(chunk(250000).every((v) => Math.abs(v - 10.5) < 1e-6), "from its bar: the clip (at its level) over the drums alone, the deck's own sound gone");
  const mid = chunk(to - BAR / 2 - 500)[500];
  ok(Math.abs(mid - (2 * 0.5 + 0.5 * 0.5 + 10 * 0.5)) < 1e-3, `over its last bar the deck's own sound comes back (${mid.toFixed(3)})`);
  ok(chunk(to + 10).every((v) => v === 2) && cd.playing.length === 0, "then only the deck's own sound, and it's done");
  cd.start(to + 50000, 125, to + 20000);
  ok(cd.playing.length === 0, "it plays once");

  const off = new ClipDeck();
  off.set(handClip(1, 100), 0);
  off.start(100000, 125, 0);
  const l = new Float32Array(1000).fill(2);
  off.mix(l, l.slice(), 150000, [new Float32Array(1000).fill(10), new Float32Array(1000).fill(10)]);
  ok(!off.playing[0].bed && off.playing[0].step === 1 && l.every((v) => v === 1), "too far off the beat (100 against 125): alone, at its own speed, no drums under it");

  const cut = new ClipDeck();
  cut.set(handClip(1, 125), 0);
  cut.start(100000, 125, 0);
  cut.set(null, 300000);
  ok(cut.playing[0].to === 300000 + 19200, "taken back while it plays: it fades out over the next 0.4 s");
  const early = new ClipDeck();
  early.set(handClip(1, 125), 0);
  early.start(100000, 125, 0);
  early.set(null, 50000);
  const e2 = new Float32Array(1000).fill(2);
  if (early.live(100000, 1000)) early.mix(e2, e2.slice(), 100000, null);
  ok(e2.every((v) => v === 2), "taken back before any of it was sent: none of it plays");
});

await test("fake DJ: a song asked for: its clip on its deck from the drop's bar, over that deck's drums alone, then the deck's own sound; the other deck untouched", async () => {
  const VAL: Record<string, number> = { house: 1, latin: 2 };
  const render = async (sec: Section, rate: number): Promise<Rendered> => {
    const frames = sectionFrames(rate);
    const bed = sec.id.endsWith(BED);
    const style = sec.id.includes(":") ? sec.id.split(":")[0] : "house";
    const l = new Float32Array(frames + 4800);
    l.fill(VAL[style] * (bed ? 10 : 1), 0, frames);
    return { id: sec.id, frames, tail: 4800, l, r: l.slice() };
  };
  ok(sectionById(`latin:peak1~7${BED}`)?.style.chords === undefined && sectionById(`latin:peak1~7${BED}`)?.style.kick !== undefined && sectionById(`latin:peak1~7${BED}`)!.level === sectionById("latin:peak1~7")!.level - 4, "a section's drums alone: no bass, chords or melody, 4 dB under the whole");
  const dj = new FakeDj(render);
  dj.setDecks("house", "latin");
  dj.prepare("peak");
  await sleep(500);
  const sp = mockSpeaker();
  dj.attach(sp as unknown as Speaker);
  dj.setPhase("peak");
  const clip = handClip(100, 125);
  dj.setClip("b", clip);
  await sleep(400);
  const at = 16 * 23040;
  dj.cueClip("b", 16);
  for (let k = 0; k < 160; k++) sp.play(12000);
  const A = sp.chunks.flat();
  const B = sp.chunksB.flat();
  const to = at + 14 * 4 * 23040;
  ok(B[at - 2000] === 2, "deck B before the drop's bar: its own sound (latin)");
  ok(B[at + 2000] === 120 && B[sectionFrames(48000) + 5000] === 120, `from the bar: the clip over latin's drums alone, into the next section too (${B[at + 2000]}, ${B[sectionFrames(48000) + 5000]})`);
  ok(Math.abs(B[to - 46080] - (2 * 0.5 + 100 * 0.5 + 20 * 0.5)) < 1e-3, `over its last bar the deck's own sound comes back (${B[to - 46080]})`);
  ok(B[to + 2000] === 2, "then deck B's own sound");
  ok(A.slice(0, to + 5000).every((v) => v === 1), "deck A untouched");
  ok(sp.ownB.every(Boolean), "deck B's own all along");

  // late: the clip arrives after the count started; taken back before its bar: none of it
  const late = handClip(50, 125);
  const bar2 = Math.ceil((sp.sent + 2 * 48000) / (4 * 23040)) * 4;
  dj.cueClip("a", bar2);
  dj.setClip("a", late);
  await sleep(400);
  for (let k = 0; k < 20; k++) sp.play(12000);
  const A2 = sp.chunks.flat();
  ok(A2[bar2 * 23040 + 2000] === 60, `a clip that arrives after the count started begins on the drop's bar all the same (${A2[bar2 * 23040 + 2000]})`);
  dj.setClip("a", null);
  dj.setClip("b", handClip(70, 125));
  const bar3 = Math.ceil((sp.sent + 2 * 48000) / (4 * 23040)) * 4;
  dj.cueClip("b", bar3);
  dj.setClip("b", null);
  for (let k = 0; k < 40; k++) sp.play(12000);
  const B3 = sp.chunksB.flat();
  ok(B3[bar3 * 23040 + 2000] === 2, "one taken back before its bar: none of it plays");
  dj.stop();
});

await test("lyria DJ: a song asked for: its clip over the stream from the next bar line, Lyria quiet under it", async () => {
  g.window = globalThis;
  g.WebSocket = MockWS;
  MockWS.made = [];
  const dj = new LyriaDj("ws://relay/room/ABCD/lyria?sid=tv2");
  dj.begin("peak", mixFor("peak", FAKE_MIX));
  const ws = MockWS.made[0];
  ws.say({ t: "ready" });
  for (let k = 0; k < 3; k++) ws.audio(2, k * 96000);
  const sp = mockSpeaker();
  dj.go(sp as unknown as Speaker);
  const sentAt = sp.sent;
  dj.setClip(handClip(100, null));
  for (let k = 0; k < 6; k++) ws.audio(2, (3 + k) * 96000);
  for (let k = 0; k < 40; k++) sp.play(12000);
  const all = sp.chunks.flat();
  const bar = 4 * 23040;
  const b0 = dj.beatFrame(0)!;
  const at = b0 + Math.ceil((sentAt + 0.05 * 48000 - b0) / bar) * bar;
  ok(all.slice(0, at - 600).every((v) => Math.abs(v) < 2), "before the bar line: Lyria's music");
  ok(all.slice(at + 10, at + 48000).every((v) => v === 100), `from it: the clip alone (${all[at + 10]})`);
  dj.setClip(null);
  const cutAt = sp.sent;
  for (let k = 0; k < 4; k++) ws.audio(2, (9 + k) * 96000);
  for (let k = 0; k < 20; k++) sp.play(12000);
  const after = sp.chunks.flat();
  ok(after.slice(cutAt + 19200, cutAt + 40000).every((v) => Math.abs(v) < 2), "taken off the air: Lyria again, after a short fade");
  dj.stop();
});

await test("mixer: the knobs' EQ and filter, the gate's pattern, the lo-fi on the audio thread", () => {
  ok(eqDb(-1) === -36 && eqDb(0) === 0 && eqDb(1) === 6 && eqDb(-0.5) === -18, "the EQ: -1 cuts a band by 36 dB (out), 1 lifts it 6 dB");
  const shut = filterOf(-1);
  const thin = filterOf(1);
  const open = filterOf(0);
  ok(Math.round(shut.lp) === 300 && shut.hp === 20 && shut.q > 3.5, "the filter all the way left: a resonant low-pass at 300 Hz");
  ok(thin.lp === 20000 && Math.round(thin.hp) === 2500 && thin.q > 3.5, "all the way right: a resonant high-pass at 2.5 kHz");
  ok(open.lp === 20000 && open.hp === 20 && open.q === 0.7, "in the middle: open, as the music plays");
  const half = filterOf(-0.5);
  ok(half.lp > 2000 && half.lp < 3000, `halfway: in between, on a curve the ear hears as even (${Math.round(half.lp)} Hz)`);
  ok(GATE_STEPS.length === 16 && GATE_STEPS.filter((x) => x === 1).length >= 8 && GATE_STEPS[0] === 1, "the gate: a bar of sixteenths, open on the downbeat");
  const crush = new procs["dj-crush"]({});
  const inL = new Float32Array(128).map((_, i) => Math.sin(i / 7) * 0.9);
  const out = [new Float32Array(128), new Float32Array(128)];
  crush.process([[inL, inL]], [out], { bits: new Float32Array([6]), hold: new Float32Array([6]) });
  const held = out[0].every((v, i) => v === out[0][i - (i % 6)]);
  const steps = out[0].every((v) => Math.abs(v * 32 - Math.round(v * 32)) < 1e-6);
  ok(held && steps && out[0][0] === Math.round(inL[0] * 32) / 32, "the lo-fi: each sample held for 6 (8 kHz) and cut to 6 bits");
  const quiet = [new Float32Array(128).fill(1), new Float32Array(128).fill(1)];
  crush.process([[]], [quiet], { bits: new Float32Array([6]), hold: new Float32Array([6]) });
  ok(quiet[0].every((v) => v === 0), "nothing coming in: quiet");
});

await test("songwire: a song file in pieces, every piece checked; the rooms server marks whose it is", () => {
  const size = PIECE_BYTES * 2 + 1000;
  const file = new Uint8Array(size).map((_, i) => i % 251);
  const n = Math.ceil(size / PIECE_BYTES);
  const pieces = Array.from({ length: n }, (_, i) => encodePiece({ id: "abc123xyz", i, n, size, name: "Alpha - First\u0007 Song.mp3", type: "audio/mpeg" }, file.subarray(i * PIECE_BYTES, Math.min(size, (i + 1) * PIECE_BYTES))));
  const back = pieces.map((b) => decodePiece(b));
  ok(back.every((p, i) => p && p.h.i === i && p.h.n === 3 && p.h.size === size && p.h.by === undefined), "three pieces, each read back");
  ok(back[0]!.h.name === "Alpha - First Song.mp3", "the name without control characters");
  const whole = new Uint8Array(back.reduce((k, p) => k + p!.bytes.length, 0));
  back.reduce((at, p) => (whole.set(p!.bytes, at), at + p!.bytes.length), 0);
  ok(whole.length === size && whole.every((v, i) => v === i % 251), "and put back together, byte for byte");
  const marked = decodePiece(encodePiece({ ...back[2]!.h, by: "p1" }, back[2]!.bytes));
  ok(marked?.h.by === "p1", "the rooms server says whose it is");
  const bad = (h: Record<string, unknown>, bytes = new Uint8Array(1000)) => decodePiece(encodePiece(h as never, bytes)) === null;
  ok(bad({ id: "abc123xyz", i: 0, n: 1, size: 999, name: "a.mp3", type: "" }), "bytes that don't match the size: no");
  ok(bad({ id: "abc123xyz", i: 0, n: 2, size: 1000, name: "a.mp3", type: "" }), "a count of pieces that doesn't match the size: no");
  ok(bad({ id: "abc123xyz", i: 1, n: 1, size: 1000, name: "a.mp3", type: "" }), "a piece past the last: no");
  ok(bad({ id: "AB", i: 0, n: 1, size: 1000, name: "a.mp3", type: "" }) && bad({ id: "abc123xyz", i: 0, n: 1, size: 1000, name: "", type: "" }), "a bad id, no name: no");
  ok(bad({ id: "abc123xyz", i: 0, n: Math.ceil((SONG_BYTES + 1) / PIECE_BYTES), size: SONG_BYTES + 1, name: "a.mp3", type: "" }), "a file over 30 MB: no");
  const junk = new Uint8Array(pieces[0]);
  junk[0] = 0x58;
  ok(decodePiece(junk.buffer) === null && decodePiece(new ArrayBuffer(4)) === null, "not a piece at all: no");
  ok(fileNumber("abc123xyz") === parseInt("abc123xy", 36) && Number.isSafeInteger(fileNumber("zzzzzzzzzzzz")), "a file's number for the word back");
});

await test("youtube: a song's tempo for the floor: what to look its video up by, the catalogue's track that's it, a tempo to dance to (Steve on Nov 12: the robots dance to the music)", () => {
  ok(songQuery("YoungBoy Never Broke Again - Untouchable [Official Video]", "YoungBoyNeverBrokeAgain") === "YoungBoy Never Broke Again - Untouchable", `"Artist - Title": the title alone, less [Official Video] (${songQuery("YoungBoy Never Broke Again - Untouchable [Official Video]", "YoungBoyNeverBrokeAgain")})`);
  ok(songQuery("Shape of You (Official Music Video)", "Ed Sheeran") === "Ed Sheeran Shape of You", `the singer from the channel when the title doesn't say (${songQuery("Shape of You (Official Music Video)", "Ed Sheeran")})`);
  ok(songQuery("Levitating", "Dua Lipa - Topic") === "Dua Lipa Levitating" && songQuery("Bad Romance", "LadyGagaVEVO") === "LadyGaga Bad Romance", `a channel's - Topic and VEVO come off (${songQuery("Levitating", "Dua Lipa - Topic")}, ${songQuery("Bad Romance", "LadyGagaVEVO")})`);
  const qt = songQuery("周杰伦 Jay Chou【晴天 Sunny Day】Official MV", "周杰倫 Jay Chou");
  ok(qt.includes("晴天") && qt.includes("周杰伦") && !/official|mv/i.test(qt), `a Chinese title: the song in its 【】 kept, its Official MV gone (${qt})`);
  ok(songQuery("Despacito &amp; more (Lyrics)", "Luis Fonsi") === "Luis Fonsi Despacito & more", `YouTube's escapes, its (Lyrics) (${songQuery("Despacito &amp; more (Lyrics)", "Luis Fonsi")})`);
  const found = { data: [{ id: 1, title: "Untouchable (Remix)", title_short: "Untouchable", artist: { name: "Someone Else" } }, { id: 2, title: "Untouchable", title_short: "Untouchable", artist: { name: "YoungBoy Never Broke Again" } }] };
  ok(trackOf(found, "YoungBoy Never Broke Again - Untouchable [Official Video]") === 2, "the track that's the song itself (not a remix of it), its name in the video's title");
  const two = { data: [{ id: 7, title: "Hello", artist: { name: "Lionel Richie" } }, { id: 8, title: "Hello", artist: { name: "Adele" } }] };
  ok(trackOf(two, "Hello (Official Music Video)", "AdeleVEVO") === 8 && trackOf(two, "Hello", "") === 7, "two songs of that name: the singer the video names, else the first");
  ok(trackOf({ data: [{ id: 3, title: "Something Else", title_short: "Something Else" }] }, "Untouchable") === null, "none whose name is: nothing (no wrong tempo)");
  ok(trackOf({ data: [{ id: 4, title: "晴天", title_short: "晴天" }] }, "周杰伦 Jay Chou【晴天 Sunny Day】Official MV") === 4, "a Chinese name too");
  ok(trackOf(null, "x") === null && trackOf({ data: "x" }, "x") === null && trackOf({ data: [{ id: "5", title: "x y" }] }, "x y") === null, "an answer that isn't one: nothing");
  ok(trackOf({ data: [{ id: 6, title: "I", title_short: "I" }] }, "I Like It") === null, "a one-letter name matches nothing");
  ok(danceBpm(128) === 128 && danceBpm(170) === 85 && danceBpm(60) === 120 && danceBpm(300) === 75, `folded into 70 to 140 (${danceBpm(170)}, ${danceBpm(60)}, ${danceBpm(300)})`);
  ok(danceBpm(0) === 120 && danceBpm(NaN) === 120 && danceBpm(-5) === 120, "no tempo: 120");
});

await test("youtube: a link's video id, the search answer's videos, YouTube's escapes", () => {
  const id = "dQw4w9WgXcQ";
  const links = [`https://www.youtube.com/watch?v=${id}&t=42`, `youtu.be/${id}`, `https://m.youtube.com/watch?v=${id}`, `https://music.youtube.com/watch?v=${id}&list=x`, `https://www.youtube.com/shorts/${id}`, `https://www.youtube-nocookie.com/embed/${id}`];
  ok(links.every((l) => ytIdOf(l) === id), "every kind of link gives its video");
  ok(ytIdOf(id) === null && ytIdOf("晴天 周杰伦") === null && ytIdOf("https://example.com/watch?v=" + id) === null && ytIdOf("https://youtu.be/short") === null, "words, a bare id, another site, a broken id: no video");
  ok(unescape("Rock &amp; Roll &#39;76 &quot;live&quot; &#x4e2d;") === `Rock & Roll '76 "live" 中`, "YouTube's escapes undone");
  const ans = { items: [{ id: { videoId: id }, snippet: { title: "Song &amp; Dance", channelTitle: "Band" } }, { id: { videoId: "bad" }, snippet: { title: "x" } }, { id: { videoId: "abcdefghijk" }, snippet: { title: "" } }, { id: { channelId: "c" }, snippet: { title: "A channel" } }] };
  const hits = hitsOf(ans);
  ok(hits.length === 1 && hits[0].id === id && hits[0].t === "Song & Dance" && hits[0].a === "Band", "only videos with an id and a title, cleaned");
  ok(hitsOf(null).length === 0 && hitsOf({ items: "x" }).length === 0, "an answer that isn't one: nothing");
});


await test("dance along: the routine on the beat count, a beat danced near it, the speaker's bars as times", () => {
  ok(moveAt(0).move.id === "stepClap" && moveAt(15).left === 1 && moveAt(16).move.id === "raiseRoof" && moveAt(15).next.id === "raiseRoof", "a move for 16 beats, then the next");
  ok(moveAt(-1).move.id === DANCE_MOVES[DANCE_MOVES.length - 1].id && moveAt(16 * DANCE_MOVES.length).move.id === "stepClap", "the routine goes round (before the first beat too)");
  const gr = { at: 10_000, bar: 5, bpm: 125 };
  ok(beatTime(gr, 20) === 10_000 && beatTime(gr, 21) === 10_480 && Math.abs(beatOf(gr, 10_240) - 20.5) < 1e-9, "beats as server times, and back");
  const near = [{ t: 10_000 + 120, a: 4 }, { t: 10_480 - 200, a: 9 }, { t: 10_960, a: 1.5 }];
  ok(danced(near, [10_000, 10_480, 10_960]).join() === "true,false,false", "a beat is danced with a real move within 150 ms of it (too far, or too gentle, isn't)");
});

/* ------------------------------------------------------------------ 真歌时间: the TV's YouTube player (tube.ts), against a stand-in */

/** YouTube's IFrame player, standing in (scripts/dj_youtube_check.py has the same in a browser): it
 *  loads, buffers a video's start the first time it plays, plays an ad first, refuses a video its
 *  owner keeps on YouTube, and (sound off) wants a tap before it plays with sound. */
type YtEv = { onReady?: (e: { target: unknown }) => void; onStateChange?: (e: { data: number }) => void; onError?: (e: { data: number }) => void; onAutoplayBlocked?: () => void };
class FakeYt {
  static conf = { readyMs: 20, bufferMs: 60, againMs: 25, ads: {} as Record<string, number>, bad: {} as Record<string, number>, sound: true };
  static last: FakeYt | null = null;
  video: string;
  state = -1;
  t = 0;
  muted = false;
  activated = false;
  heard: { video: string; at: number }[] = [];
  private loaded: Record<string, boolean> = {};
  private adLeft: Record<string, number>;
  private tick: ReturnType<typeof setInterval> | 0 = 0;
  private pend: ReturnType<typeof setTimeout> | 0 = 0;
  private lastT = 0;
  constructor(
    _el: unknown,
    private o: { videoId: string; events: YtEv },
  ) {
    this.video = o.videoId;
    this.adLeft = { ...FakeYt.conf.ads };
    FakeYt.last = this;
    setTimeout(() => o.events.onReady?.({ target: this }), FakeYt.conf.readyMs);
  }
  private set(st: number) {
    if (this.state === st) return;
    this.state = st;
    this.o.events.onStateChange?.({ data: st });
  }
  private halt() {
    if (this.tick) clearInterval(this.tick);
    if (this.pend) clearTimeout(this.pend);
    this.tick = this.pend = 0;
  }
  private inAd() {
    return (this.adLeft[this.video] ?? 0) > 0;
  }
  private hear() {
    this.heard.push({ video: this.video, at: performance.now() });
  }
  private run() {
    this.lastT = performance.now();
    this.tick = setInterval(() => {
      const now = performance.now();
      const dt = now - this.lastT;
      this.lastT = now;
      if (this.inAd()) {
        this.adLeft[this.video] -= dt;
        if (!this.inAd() && !this.muted) this.hear();
        return;
      }
      this.t += dt / 1000;
    }, 5);
  }
  private go(byUser: boolean) {
    const C = FakeYt.conf;
    if (C.bad[this.video]) {
      setTimeout(() => this.o.events.onError?.({ data: C.bad[this.video] }), 10);
      return;
    }
    if (!this.muted && !C.sound && !this.activated && !byUser) {
      this.o.events.onAutoplayBlocked?.();
      return;
    }
    if (byUser) this.activated = true;
    if (this.state === 1) return;
    this.halt();
    this.set(3);
    this.pend = setTimeout(
      () => {
        this.pend = 0;
        this.loaded[this.video] = true;
        // (its sound came on while it was getting going, with no tap: the browser won't have it)
        if (!this.muted && !C.sound && !this.activated) return this.set(2);
        this.set(1);
        if (!this.muted && !this.inAd()) this.hear();
        this.run();
      },
      this.loaded[this.video] ? C.againMs : C.bufferMs,
    );
  }
  playVideo() {
    this.go(false);
  }
  pauseVideo() {
    this.halt();
    if (this.state === 1 || this.state === 3) this.set(2);
  }
  seekTo(s: number) {
    this.t = s;
  }
  mute() {
    this.muted = true;
  }
  unMute() {
    if (!this.muted) return;
    this.muted = false;
    // like Safari: playing muted, its sound coming on with no tap pauses it
    if (this.state === 1 && !FakeYt.conf.sound && !this.activated) {
      this.halt();
      this.set(2);
      return;
    }
    if (this.state === 1 && !this.inAd()) this.hear();
  }
  isMuted() {
    return this.muted;
  }
  setVolume() {}
  cueVideoById(id: string) {
    this.halt();
    this.video = id;
    this.t = 0;
    this.set(-1);
    setTimeout(() => this.set(5), 10);
  }
  loadVideoById(id: string) {
    this.cueVideoById(id);
    setTimeout(() => this.go(false), 15);
  }
  getPlayerState() {
    return this.state;
  }
  getCurrentTime() {
    return this.inAd() ? 0 : this.t;
  }
  destroy() {
    this.halt();
  }
  end() {
    this.halt();
    this.set(0);
  }
  tap() {
    this.go(true);
  }
}
const gw = globalThis as unknown as Record<string, unknown>;
gw.window ??= globalThis;
gw.document ??= { createElement: () => ({ remove() {} }), head: { appendChild() {} } };
gw.YT = { Player: FakeYt };
const until = async (fn: () => boolean, ms = 3000) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (fn()) return true;
    await sleep(4);
  }
  return fn();
};
/** A TV's player: what it said (in order), and when it set a start and said the song was heard. */
function tvTube() {
  const said: string[] = [];
  const at: { timed?: number; playing?: number } = {};
  const t = new Tube({
    now: () => Date.now(),
    status: (s) => said.push(`status:${s}`),
    timed: (v, when) => {
      said.push(`timed:${v}`);
      at.timed = when;
    },
    playing: (v) => {
      said.push(`playing:${v}`);
      at.playing = performance.now();
    },
    blocked: (v) => said.push(`blocked:${v}`),
    ended: (v) => said.push(`ended:${v}`),
    bad: (v) => said.push(`bad:${v}`),
  });
  t.attach({ appendChild() {} } as unknown as HTMLElement);
  return { t, said, at };
}
/** Get a video ready on a fresh player; its lead set to the stand-in's start time (what the TV learns). */
async function readied(video: string) {
  const tv = tvTube();
  tv.t.prepare(video);
  const ready = await until(() => tv.t.status === "ready");
  tv.t.lead = FakeYt.conf.againMs;
  return { ...tv, p: FakeYt.last!, ready };
}

await test("tube: the song up next waits ready (loaded, its start buffered, held at 0:00 with its sound on, never heard), then starts on its moment", async () => {
  const { t, said, at, p, ready } = await readied("aaaaaaaaaa1");
  ok(ready, `ready (${said.join(" ")})`);
  ok(p.state === 2 && p.t < 0.5 && !p.muted && p.heard.length === 0, `buffered, held at its start, its sound on, never heard (state ${p.state}, ${p.t.toFixed(2)} s, muted ${p.muted})`);
  const when = performance.now() + 400;
  t.play("aaaaaaaaaa1", Date.now() + 400, when);
  ok(said.includes("timed:aaaaaaaaaa1") && at.timed === when, "its start set for its moment: the DJ lets go then");
  ok(await until(() => p.heard.length > 0, 2000), "heard");
  const off = p.heard[0].at - when;
  ok(Math.abs(off) < 40, `heard on its moment (${off.toFixed(0)} ms)`);
  ok(await until(() => said.includes("playing:aaaaaaaaaa1")), "and says so");
  p.end();
  ok(await until(() => said.includes("ended:aaaaaaaaaa1")), "it ends: says so");
  t.dispose();
});

await test("tube: a drop that may come into it rolls the video muted just before the bar; the word arriving late still starts it on the bar; no word, it goes back to its start", async () => {
  const { t, p } = await readied("bbbbbbbbbb1");
  const when = performance.now() + 300;
  t.expect("bbbbbbbbbb1", Date.now() + 300, when);
  await sleep(290);
  ok((p.state === 1 || p.state === 3) && p.muted && p.heard.length === 0, `rolling, muted, as the bar comes (state ${p.state}, muted ${p.muted})`);
  // the press reaches the TV 10 ms before the bar: too late to start a video then, not to unmute it
  t.play("bbbbbbbbbb1", Date.now() + 10, when);
  ok(await until(() => p.heard.length > 0, 1000), "heard");
  const off = p.heard[0].at - when;
  ok(Math.abs(off) < 40, `on the bar all the same (${off.toFixed(0)} ms)`);
  t.dispose();
  const b = await readied("bbbbbbbbbb2");
  const when2 = performance.now() + 150;
  b.t.expect("bbbbbbbbbb2", Date.now() + 150, when2);
  await sleep(150 + 700 + 400);
  ok(b.t.status === "ready" && b.p.state === 2 && b.p.t < 0.5 && !b.p.muted && b.p.heard.length === 0, `nobody pressed: back at its start, ready, never heard (state ${b.p.state}, ${b.p.t.toFixed(2)} s)`);
  b.t.dispose();
});

await test("tube: an ad first plays out muted, then it's ready; a video YouTube won't play here says so", async () => {
  FakeYt.conf.ads.ccccccccccc = 1900;
  const tv = tvTube();
  tv.t.prepare("ccccccccccc");
  ok(await until(() => tv.t.status === "ad", 4000), `an ad: said (${tv.said.join(" ")})`);
  ok(await until(() => tv.t.status === "ready", 4000), "then ready");
  ok(FakeYt.last!.heard.length === 0, "the ad never heard");
  tv.t.dispose();
  delete FakeYt.conf.ads.ccccccccccc;
  FakeYt.conf.bad.ddddddddddd = 150;
  const bad = tvTube();
  bad.t.prepare("ddddddddddd");
  ok(await until(() => bad.said.includes("bad:ddddddddddd"), 3000) && bad.t.status === "bad", `won't play here: said (${bad.said.join(" ")})`);
  bad.t.play("ddddddddddd", Date.now(), performance.now());
  ok(bad.said.filter((x) => x === "bad:ddddddddddd").length === 2, "asked to play it anyway: said again, nothing starts");
  bad.t.dispose();
  delete FakeYt.conf.bad.ddddddddddd;
});

await test("tube: a browser that wants a tap: one tap on it while it waits ready, and it starts by itself; untapped, it asks for a tap instead of starting (the DJ plays on)", async () => {
  gw.__tubeTapFirst = true;
  FakeYt.conf.sound = false;
  const a = await readied("eeeeeeeeee1");
  ok(a.ready && !a.t.armed, "ready, not yet allowed to start by itself");
  a.p.tap();
  ok(await until(() => a.t.tapped && a.t.armed && a.p.state === 2 && a.p.t < 0.5, 2000), "tapped: held back at its start, and now it may");
  a.t.lead = FakeYt.conf.againMs;
  const when = performance.now() + 300;
  a.t.play("eeeeeeeeee1", Date.now() + 300, when);
  ok(await until(() => a.said.includes("timed:eeeeeeeeee1"), 500), "its start set");
  ok(await until(() => a.p.heard.length > 1, 2000) && Math.abs(a.p.heard[1].at - when) < 40, `heard on its moment (${a.p.heard[1] ? (a.p.heard[1].at - when).toFixed(0) : "?"} ms)`);
  a.t.dispose();
  const b = await readied("eeeeeeeeee2");
  b.t.play("eeeeeeeeee2", Date.now() + 200, performance.now() + 200);
  ok(!b.said.includes("timed:eeeeeeeeee2"), "untapped: no start set for the DJ to let go on");
  ok(await until(() => b.said.includes("blocked:eeeeeeeeee2") && b.t.status === "tap", 4000), `it won't start by itself: it asks for a tap (${b.said.slice(-3).join(" ")})`);
  ok(b.p.heard.length === 0, "nothing heard meanwhile");
  b.p.tap();
  ok(await until(() => b.said.includes("playing:eeeeeeeeee2"), 2000), "tapped: the song is heard");
  b.t.dispose();
  delete gw.__tubeTapFirst;
  FakeYt.conf.sound = true;
});

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

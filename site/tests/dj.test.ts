/* 打碟 · DJ Booth: the speaker's player and the stand-in DJ, without a sound card.
   Run with `npx tsx tests/dj.test.ts`. The booth's room rules are in engine.test.ts. */
import { BY_PHASE, nextSection, renderOrder } from "../src/party/dj/fake/arrange";
import { FakeDj } from "../src/party/dj/fake/FakeDj";
import type { Rendered } from "../src/party/dj/fake/render";
import { beatFrames, SECTIONS, sectionFrames, type Section } from "../src/party/dj/fake/sections";
import { pcm16ToFloat } from "../src/party/dj/speaker/pcm";
import type { Speaker } from "../src/party/dj/speaker/speaker";

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
type Proc = { port: { onmessage: ((e: { data: unknown }) => void) | null; posted: Msg[] }; process: (i: unknown[], o: Float32Array[][]) => boolean };
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
  /** run `frames` (a multiple of 128) through the player */
  const run = (frames: number) => {
    const l = new Float32Array(frames);
    const r = new Float32Array(frames);
    for (let k = 0; k < frames; k += 128) {
      const ol = new Float32Array(128);
      const or = new Float32Array(128);
      p.process([], [[ol, or]]);
      l.set(ol, k);
      r.set(or, k);
      g.currentTime = (g.currentTime as number) + 128 / sr;
    }
    return { l, r };
  };
  const last = () => p.port.posted[p.port.posted.length - 1];
  return { p, push, run, send, last };
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

/** Sections that sound like their number: the body at n, the ring-out at n / 10. */
const NUM: Record<string, number> = Object.fromEntries(SECTIONS.map((s, i) => [s.id, i + 1]));
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
  let tick: (() => void) | null = null;
  const m = {
    sent: 0,
    played: 0,
    flushes: 0,
    fades: 0,
    chunks: got,
    get sentFrames() {
      return m.sent;
    },
    push(l: Float32Array) {
      got.push(Array.from(l));
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
  ok(s[F - 1] === NUM.warm1 && Math.abs(s[F] - (NUM.warm2 + NUM.warm1 / 10)) < 1e-6 && s[F + TAIL] === NUM.warm2, "on the bar: the second section, with the first one's ring-out laid over its start");
  dj.setPhase("peak");
  for (let k = 0; k < 80; k++) sp.play(12000);
  s = all();
  ok(s[2 * F - 1] === NUM.warm2 && Math.abs(s[2 * F] - (NUM.peak1 + NUM.warm2 / 10)) < 1e-6, "the peak waits for the end of the phrase, then drops");
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

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

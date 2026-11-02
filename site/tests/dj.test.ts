/* 打碟 · DJ Booth: the speaker's player and the stand-in DJ, without a sound card.
   Run with `npx tsx tests/dj.test.ts`. The booth's room rules are in engine.test.ts. */
import { BY_PHASE, nextSection, renderOrder } from "../src/party/dj/fake/arrange";
import { FakeDj } from "../src/party/dj/fake/FakeDj";
import type { Rendered } from "../src/party/dj/fake/render";
import { beatFrames, SECTIONS, sectionFrames, type Section } from "../src/party/dj/fake/sections";
import { ALL_SECTIONS, ANY_SECTION, KITS, sectionOf } from "../src/party/dj/fake/styles";
import { line } from "../src/lib/music";
import { pcm16ToFloat } from "../src/party/dj/speaker/pcm";
import type { Speaker } from "../src/party/dj/speaker/speaker";
import { KickClock } from "../src/party/dj/lyria/beat";
import { LyriaDj, pcmChunk } from "../src/party/dj/lyria/LyriaDj";
import { FALLBACK_PROMPTS, lyriaFor } from "../src/party/dj/lyria/prompts";
import { FAKE_MIX, mixFor } from "../src/shared/dj/curve";
import { toGoogle } from "../worker/lyria";
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
  ok(B[F - 1] === NUM["latin:warm1"] && Math.abs(B[F] - (NUM["techno:warm2"] + NUM["latin:warm1"] / 10)) < 1e-4, "B's new style waits for the next section, with the old one's ring-out over its start");
  ok(A[F] !== undefined && Math.abs(A[F] - (NUM.warm2 + NUM.warm1 / 10)) < 1e-6, "A carries on as before");
  dj.setDecks("house", null);
  for (let k = 0; k < 80; k++) sp.play(12000);
  const B2 = flat("chunksB");
  const lastB = sp.chunksB[sp.chunksB.length - 1];
  const tailChunk = sp.chunks.findIndex((_, i) => sp.chunks.slice(0, i + 1).reduce((x, c) => x + c.length, 0) > 2 * F);
  ok(Math.abs(B2[2 * F] - NUM["techno:warm2"] / 10) < 1e-4 && sp.ownB[tailChunk] === false && lastB.length === 0, "B emptied: only its ring-out, under deck A (not B's own music), then no deck B at all");
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

/* ------------------------------------------------------------------ Lyria (A2), without Google */

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

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

/* Name That Tune's performers, their bodies: run with `npx tsx tests/performer.test.ts`
 *
 * Every dance move, every singer's gesture, the cheer and the shrug and the idle fidgets, for him and
 * for her (she stands on the right and leads mirrored), at slow, middle and fast tempos, frame by frame
 * at 60 a second on a made-up clock. Each frame checks what is actually drawn: nothing is NaN; elbows
 * and knees bend no further than a body does, and the way a body does (knees outward, elbows never
 * poking into the body); wrists stay within a wrist's reach; and no joint jumps between frames. Then the
 * solver on its own: points out of reach, at the shoulder or not numbers at all; the short way round;
 * left and right mirror each other.
 */
import { gsap } from "../src/lib/anim";
import { Choreo, GESTURES, MOVES, POOLS, type Gesture, type Mood, type Role } from "../src/party/tune/moves";
import { ARM_SPEED, LEG_SPEED, ELBOW_FOLD, elbowRoom, elbowSide, KNEE_FOLD, PELVIS, Performer, reach, SHOULDER_Y, WRIST_TIP, wrap, type Kind } from "../src/party/tune/performer";

let failures = 0;
const seen = new Map<string, number>();
function ok(cond: unknown, msg: string) {
  if (cond) return;
  failures++;
  // the same kind of failure many frames running: say it a few times, then count
  const key = msg.replace(/-?\d+(\.\d+)?/g, "#");
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  if (n <= 3) console.log("  FAIL:", msg);
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

/* ------------------------------------------------------------------ a page without a browser */

class FakeEl {
  attrs = new Map<string, string>();
  style: Record<string, string> = {};
  children: FakeEl[] = [];
  parentNode: FakeEl | null = null;
  id = "";
  textContent = "";
  opacity = 1;
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  append(...els: FakeEl[]) {
    for (const e of els) {
      e.parentNode = this;
      this.children.push(e);
    }
  }
  remove() {
    const c = this.parentNode?.children;
    if (c?.includes(this)) c.splice(c.indexOf(this), 1);
    this.parentNode = null;
  }
  get childElementCount() {
    return this.children.length;
  }
}
/** An <svg> that hands out one element per class name in its markup. */
class FakeSvg extends FakeEl {
  parts = new Map<string, FakeEl>();
  private html = "";
  set innerHTML(v: string) {
    this.html = v;
    this.parts.clear();
  }
  querySelector(sel: string): FakeEl | null {
    if (sel.startsWith("linearGradient")) return Object.assign(new FakeEl(), { id: "pf-tear" });
    const name = /^\.([\w-]+)$/.exec(sel)?.[1];
    if (!name || !this.html.includes(`class="${name}"`)) return null;
    let el = this.parts.get(name);
    if (!el) {
      el = new FakeEl();
      new FakeEl().append(el);
      this.parts.set(name, el);
    }
    return el;
  }
}
(globalThis as unknown as { document: unknown }).document = { createElementNS: () => new FakeEl() };

// one clock for GSAP, performance.now() and the song: frames are stepped by hand
let clock = 0;
Object.defineProperty(performance, "now", { value: () => clock * 1000, configurable: true });
gsap.ticker.remove(gsap.updateRoot);
gsap.ticker.lagSmoothing(0);
clock = gsap.globalTimeline.time() + 1;
gsap.updateRoot(clock);
let rs = 12345;
Math.random = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);

const LOOK: Record<Kind, { sx: number; upper: number; fore: number; hip: number }> = {
  m: { sx: 27, upper: 30, fore: 28, hip: 10 },
  f: { sx: 23, upper: 29, fore: 27, hip: 9 },
};
const FPS = 60;
/** The most a joint may turn in one frame: an arm's, and a leg's. */
const ARM_STEP = ARM_SPEED / FPS + 0.05;
const LEG_STEP = LEG_SPEED / FPS + 0.05;

/* ------------------------------------------------------------------ what is drawn */

const rot = (el: FakeEl | undefined) => {
  const m = /rotate\((-?[\d.e+-]+)/.exec(el?.getAttribute("transform") ?? "");
  return m ? Number(m[1]) : NaN;
};
type Body = { arm: Record<"L" | "R", { sh: number; el: number; wrist: number; elbow: [number, number]; hand: [number, number] }>; leg: Record<"L" | "R", { hip: number; knee: number; ankleY: number }> };
function drawn(svg: FakeSvg, kind: Kind): Body {
  const L = LOOK[kind];
  const part = (n: string) => svg.parts.get(n);
  const arm = (side: "L" | "R") => {
    const dir = side === "L" ? -1 : 1;
    const sh = rot(part("upper" + side)), el = rot(part("fore" + side)), wrist = rot(part("hand" + side));
    const sx = PELVIS.x + dir * L.sx, r1 = sh / (180 / Math.PI), r2 = (sh + el) / (180 / Math.PI);
    const elbow: [number, number] = [sx - L.upper * Math.sin(r1), SHOULDER_Y + L.upper * Math.cos(r1)];
    const hand: [number, number] = [elbow[0] - L.fore * Math.sin(r2), elbow[1] + L.fore * Math.cos(r2)];
    return { sh, el, wrist, elbow, hand };
  };
  const leg = (side: "L" | "R") => {
    const hip = rot(part("thigh" + side)), knee = rot(part("shin" + side));
    const hipY = Number(/translate\(\S+ (-?[\d.]+)\)/.exec(part("thigh" + side)?.getAttribute("transform") ?? "")?.[1]);
    const a = hip / (180 / Math.PI), b2 = (hip + knee) / (180 / Math.PI);
    return { hip, knee, ankleY: hipY + 38 * Math.cos(a) + 36 * Math.cos(b2) };
  };
  return { arm: { L: arm("L"), R: arm("R") }, leg: { L: leg("L"), R: leg("R") } };
}

const stats = { sink: 0, arm: 0, leg: 0, fold: 0, knee: 0, wrist: 0, inside: 0, flips: 0, strain: 0, frames: 0 };

/** Everything that must hold for one performer on one frame (and against the frame before). */
function check(where: string, svg: FakeSvg, kind: Kind, b: Body, prev: Body | null) {
  stats.frames++;
  for (const [name, el] of svg.parts) {
    const t = el.getAttribute("transform") ?? "", d = el.getAttribute("d") ?? "";
    if (/NaN|Infinity/.test(t + d)) ok(false, `${where}: ${name} is drawn with ${t || d}`);
  }
  const L = LOOK[kind];
  for (const side of ["L", "R"] as const) {
    const dir = side === "L" ? -1 : 1;
    const a = b.arm[side], sx = PELVIS.x + dir * L.sx;
    ok(Math.abs(a.el) <= ELBOW_FOLD + 0.01, `${where}: ${side} elbow folds ${a.el.toFixed(1)} degrees`);
    ok(Math.abs(a.wrist) <= WRIST_TIP + 0.01, `${where}: ${side} wrist bends ${a.wrist.toFixed(1)} degrees`);
    // the elbow never pokes into the body: not well inside both the shoulder and the hand
    const inside = -dir * (a.elbow[0] - (dir > 0 ? Math.min(sx, a.hand[0]) : Math.max(sx, a.hand[0])));
    const room = elbowRoom(dir * (a.hand[0] - sx));
    ok(inside <= room + 2, `${where}: ${side} elbow ${inside.toFixed(1)} inside the body (${room.toFixed(1)} allowed)`);
    stats.fold = Math.max(stats.fold, Math.abs(a.el));
    stats.wrist = Math.max(stats.wrist, Math.abs(a.wrist));
    stats.inside = Math.max(stats.inside, inside - room);
    const g = b.leg[side];
    // knees bend outward: the right one one way, the left the other
    ok(g.knee * dir >= -0.01 && Math.abs(g.knee) <= KNEE_FOLD + 0.01, `${where}: ${side} knee bends ${g.knee.toFixed(1)}`);
    stats.knee = Math.max(stats.knee, Math.abs(g.knee));
    // feet stay on the floor: never drawn into it (the ankle sits 280 down when a foot is planted)
    ok(g.ankleY <= 280 + 1.5, `${where}: ${side} foot ${(g.ankleY - 280).toFixed(1)} into the floor`);
    stats.sink = Math.max(stats.sink, g.ankleY - 280);
    if (!prev) continue;
    const p = prev.arm[side];
    const step = Math.max(Math.abs(wrap(a.sh - p.sh)), Math.abs(a.el - p.el), Math.abs(a.wrist - p.wrist));
    ok(step <= ARM_STEP, `${where}: ${side} arm jumps ${step.toFixed(1)} degrees in a frame`);
    stats.arm = Math.max(stats.arm, step);
    if (Math.sign(a.el) !== Math.sign(p.el) && Math.abs(a.el) > 1 && Math.abs(p.el) > 1) stats.flips++;
    const q = prev.leg[side];
    const lstep = Math.max(Math.abs(wrap(g.hip - q.hip)), Math.abs(g.knee - q.knee));
    ok(lstep <= LEG_STEP, `${where}: ${side} leg jumps ${lstep.toFixed(1)} degrees in a frame`);
    stats.leg = Math.max(stats.leg, lstep);
  }
}

/* ------------------------------------------------------------------ a song on the made-up clock */

type Cast = { svg: FakeSvg; kind: Kind; p: Performer; c: Choreo; prev: Body | null };
function cast(): Cast[] {
  const mk = (kind: Kind, inward: number): Cast => {
    const svg = new FakeSvg();
    const p = new Performer(svg as unknown as SVGSVGElement, kind, inward);
    return { svg, kind, p, c: new Choreo(p), prev: null };
  };
  const both = [mk("m", 1), mk("f", -1)];
  both[0].c.pairWith(() => both[1].c);
  both[1].c.pairWith(() => both[0].c);
  return both;
}

/**
 * Play `seconds` of a song at `bpm`: beats, a drum that hits on them and a voice that sings in
 * phrases (with a long quiet stretch, and big held notes), `cues` (seconds) for a cheer or a shrug.
 */
function play(where: string, all: Cast[], seconds: number, bpm: number, cues: [number, "right" | "wrong"][] = []) {
  const period = 60 / bpm, start = clock;
  for (let f = 0; f < seconds * FPS; f++) {
    clock += 1 / FPS;
    gsap.updateRoot(clock);
    const pos = clock - start;
    const idx = Math.floor(pos / period);
    const drum = Math.max(0, 1 - (pos % period) / (period * 0.4));
    const cyc = pos % 9;
    const voice = cyc < 1.8 ? 0.05 : cyc < 5 ? 0.45 + 0.3 * Math.abs(Math.sin(pos * 3)) : cyc < 6.4 ? 0.93 : cyc < 8.2 ? 0.55 : 0.1;
    for (const [at, kind] of cues) if (pos >= at && pos - 1 / FPS < at) for (const x of all) x.c.cue(kind);
    for (const x of all) {
      x.c.frame(1 / FPS, clock * 1000, pos, idx, period, drum, voice);
      const b = drawn(x.svg, x.kind);
      check(`${where} [${x.kind} ${pos.toFixed(2)}s]`, x.svg, x.kind, b, x.prev);
      x.prev = b;
    }
  }
  for (const x of all) stats.strain = Math.max(stats.strain, x.p.strain);
}

function songOn(all: Cast[], roles: [Role, Role], mood: Mood, seed: number, bpm: number) {
  all.forEach((x, i) => x.c.set(roles[i], mood, seed, bpm));
}

/* ------------------------------------------------------------------ the tests */

test("solver: out of reach, at the shoulder, and not numbers at all", () => {
  for (const kind of ["m", "f"] as const) {
    const L = LOOK[kind];
    const far = reach(127, 149, 1e6, 149, L.upper, L.fore, 1, ELBOW_FOLD);
    ok(Math.abs(far.bend) < 0.01 && Math.abs(far.turn + 90) < 0.01, `${kind}: a point far out to the side: the arm straight out (${far.turn}, ${far.bend})`);
    const at = reach(127, 149, 127, 149, L.upper, L.fore, -1, ELBOW_FOLD);
    ok(Number.isFinite(at.turn) && Math.abs(Math.abs(at.bend) - ELBOW_FOLD) < 0.01, `${kind}: a point on the shoulder folds the arm no further than it goes (${at.bend})`);
    for (const [tx, ty] of [[NaN, 100], [100, NaN], [Infinity, 0], [-Infinity, Infinity], [undefined as unknown as number, 3]]) {
      const r = reach(127, 149, tx, ty, L.upper, L.fore, 1, ELBOW_FOLD);
      ok(Number.isFinite(r.turn) && Number.isFinite(r.bend), `${kind}: no NaN out of (${tx}, ${ty}): ${r.turn}, ${r.bend}`);
    }
    for (let i = 0; i < 400; i++) {
      const tx = 40 + Math.random() * 120, ty = 60 + Math.random() * 200;
      for (const bend of [1, -1] as const) {
        const r = reach(127, 149, tx, ty, L.upper, L.fore, bend, ELBOW_FOLD);
        ok(Math.abs(r.bend) <= ELBOW_FOLD + 1e-9 && r.bend * bend >= 0, `${kind}: bend ${r.bend} for ${bend}`);
        // where the bones end is where the hand was sent, when it can get there
        const a = r.turn / (180 / Math.PI), b2 = (r.turn + r.bend) / (180 / Math.PI);
        const hx = 127 - L.upper * Math.sin(a) - L.fore * Math.sin(b2), hy = 149 + L.upper * Math.cos(a) + L.fore * Math.cos(b2);
        const d = Math.hypot(tx - 127, ty - 149);
        if (d > 16 && d < L.upper + L.fore - 0.5) ok(Math.hypot(hx - tx, hy - ty) < 0.01, `${kind}: the hand reaches (${tx.toFixed(1)}, ${ty.toFixed(1)}), not (${hx.toFixed(1)}, ${hy.toFixed(1)})`);
      }
    }
  }
});

test("solver: left and right mirror each other", () => {
  for (const kind of ["m", "f"] as const) {
    const L = LOOK[kind];
    for (let i = 0; i < 400; i++) {
      const dx = -70 + Math.random() * 140, dy = -70 + Math.random() * 140, now = Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 200;
      const sR = elbowSide(100 + L.sx, 149, 100 + L.sx + dx, 149 + dy, L.upper, L.fore, 1, now);
      const sL = elbowSide(100 - L.sx, 149, 100 - L.sx - dx, 149 + dy, L.upper, L.fore, -1, -now);
      ok(sL === -sR, `${kind}: the left elbow bends as the right one mirrored (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
      const r = reach(100 + L.sx, 149, 100 + L.sx + dx, 149 + dy, L.upper, L.fore, sR, ELBOW_FOLD);
      const l = reach(100 - L.sx, 149, 100 - L.sx - dx, 149 + dy, L.upper, L.fore, sL, ELBOW_FOLD);
      ok(Math.abs(wrap(l.turn + r.turn)) < 1e-6 && Math.abs(l.bend + r.bend) < 1e-6, `${kind}: mirrored joints (${l.turn}, ${l.bend}) vs (${r.turn}, ${r.bend})`);
    }
  }
});

test("joints turn the short way round, and never past what they can do", () => {
  const [m] = cast();
  // the right upper arm turned to +179: a hand that needs -179 is 2 degrees away, not 358
  m.p.pose.shR = 179;
  m.p.pose.elR = 0;
  const L = LOOK.m, sx = 100 + L.sx;
  // a point straight up and a hair to the right, out of reach: the arm points at it straight, at -179
  const turn = -179, a = turn / (180 / Math.PI);
  const tx = sx - 500 * Math.sin(a), ty = SHOULDER_Y + 500 * Math.cos(a);
  gsap.to(m.p.pose, { ...m.p.aim({ hRx: tx, hRy: ty }), duration: 0.5, ease: "none" });
  let lo = Infinity, hi = -Infinity;
  for (let f = 0; f < 40; f++) {
    clock += 1 / FPS;
    gsap.updateRoot(clock);
    lo = Math.min(lo, m.p.pose.shR);
    hi = Math.max(hi, m.p.pose.shR);
    m.p.render(1 / FPS);
  }
  ok(lo >= 178.9 && hi <= 181.1, `the shoulder turned from 179 the short way (${lo.toFixed(1)}..${hi.toFixed(1)})`);
  ok(Math.abs(wrap(rot(m.svg.parts.get("upperR")) - turn)) < 3, `and arrived at -179 (${rot(m.svg.parts.get("upperR"))})`);
  // fingers asked to point straight up from an arm hanging down: the wrist bends as far as a wrist goes
  m.p.place({ hRx: sx + 3, hRy: 200, fingR: 180 });
  ok(Math.abs(m.p.pose.wristR) <= WRIST_TIP, `the wrist stops at ${WRIST_TIP} (${m.p.pose.wristR})`);
  // nonsense in, a person out
  m.p.place({ hLx: NaN, hLy: Infinity, px: NaN, lean: NaN, fRx: NaN, headTurn: NaN, spin: NaN });
  m.p.render(1 / FPS);
  check("nonsense pose", m.svg, "m", drawn(m.svg, "m"), null);
  gsap.killTweensOf(m.p.pose);
});

const BPMS = [72, 112, 150];

test("every dance move, both performers, slow to fast", () => {
  for (const id of Object.keys(MOVES)) {
    for (const bpm of BPMS) {
      const all = cast();
      for (const x of all) x.c.pinMove = id;
      // a calm mood dances half time on a fast song: try both
      songOn(all, ["dance", "dance"], bpm >= 110 && id.length % 2 ? "tender" : "happy", 1000 + bpm, bpm);
      play(`${id} @${bpm}`, all, Math.min(30, (32 * 60) / bpm), bpm);
      for (const x of all) x.c.destroy();
    }
  }
});

test("every singer's gesture, him singing and her singing", () => {
  const gestures = [...new Set(Object.values(GESTURES).flat())] as Gesture[];
  for (const g of gestures) {
    for (const singer of [0, 1]) {
      const all = cast();
      all[singer].c.pinGesture = g;
      songOn(all, singer ? ["dance", "sing"] : ["sing", "dance"], "love", 77, 104);
      play(`sing ${g}`, all, 20, 104);
      for (const x of all) x.c.destroy();
    }
  }
});

test("whole songs in every mood: moves picked as on stage, cheers and shrugs mid-move, rounds starting and ending", () => {
  const moods = Object.keys(POOLS) as Mood[];
  for (const mood of moods) {
    for (const seed of [3, 41, 977]) {
      const all = cast();
      const bpm = 70 + ((seed * 7) % 90);
      const roles: [Role, Role][] = [["sing", "dance"], ["dance", "sing"], ["sing", "sing"], ["dance", "dance"]];
      songOn(all, roles[seed % 4], mood, seed, bpm);
      play(`${mood} #${seed}`, all, 26, bpm, [[7.3, "wrong"], [13.1, "right"], [13.9, "wrong"]]);
      // the reveal: the music stops, they go idle, then the next song starts
      songOn(all, ["idle", "idle"], mood, seed, bpm);
      play(`${mood} #${seed} idle`, all, 4, bpm, [[0.5, "right"]]);
      songOn(all, roles[(seed + 1) % 4], mood, seed + 1, bpm);
      play(`${mood} #${seed + 1}`, all, 12, bpm);
      for (const x of all) x.c.destroy();
    }
  }
});

test("standing about between songs: waves, hands on hips, stretches, foot taps", () => {
  const all = cast();
  songOn(all, ["idle", "idle"], "happy", 5, 100);
  play("idle", all, 90, 100, [[20, "right"], [44, "wrong"]]);
  for (const x of all) x.c.destroy();
});

console.log(
  `\n${stats.frames} frames: arm joints turn at most ${stats.arm.toFixed(1)} and legs ${stats.leg.toFixed(1)} degrees a frame; ` +
    `elbows fold up to ${stats.fold.toFixed(0)}, knees ${stats.knee.toFixed(0)}, wrists bend ${stats.wrist.toFixed(0)} (asked ${stats.strain.toFixed(1)} past that); ` +
    `elbows at most ${stats.inside.toFixed(1)} past tucked in; feet at most ${stats.sink.toFixed(1)} into the floor; ${stats.flips} elbow changes of side (each through a straight arm)`,
);
const repeats = [...seen].filter(([, n]) => n > 3);
for (const [k, n] of repeats) console.log(`  (${n} times: ${k})`);
gsap.ticker.sleep();
console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);

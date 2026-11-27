// The camera's judge (src/client/camera): pretend players made from the coach's own poses, as a camera
// would see them, danced on time, late, small, shaky, wrong, mirrored or not at all.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Euler, Object3D, Quaternion, Vector3 } from "three";
import type { Difficulty } from "../../party-base/src/index";
import { coachBody, coachJoints, coachLandmarks, likeness, playerBody, type Landmark } from "../src/client/camera/body";
import { ALIKE, CameraJudge, decidedAfter, targetOf } from "../src/client/camera/match";
import { poseOf, type Doing } from "../src/client/coach/moves";
import { BASE, type Pose } from "../src/client/coach/pose";
import { ANKLE_Y, CHEST_Y, HIP_W, HIP_Y, SHOULDER_W, SHOULDER_Y, SPINE_Y } from "../src/client/coach/sizes";
import { buildShow, planRun, runEnd, spotAt, type RunBeat } from "../src/shared/show";
import { BeatJudge, type Verdict } from "../src/shared/taps";

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Player {
  lagMs?: number;
  scale?: number;
  /** metres of shake on every landmark */
  noise?: number;
  /** dances this all along instead */
  wrong?: Doing;
  still?: boolean;
  /** copies the coach as if it weren't a mirror: left for right */
  mirrored?: boolean;
  /** stops showing (walked off) */
  gone?: boolean;
}

const SWAP: [number, number][] = [
  [11, 12],
  [13, 14],
  [15, 16],
  [23, 24],
  [25, 26],
  [27, 28],
  [31, 32],
];

function seenAt(run: readonly RunBeat[], t: number, p: Player, rnd: () => number): Landmark[] | null {
  if (p.gone) return null;
  const spot = spotAt(run, t - (p.lagMs ?? 0));
  if (!spot) return null;
  const b = run[spot.i]!;
  const doing: Doing = p.wrong ?? (b.move ? { kind: "move", id: b.move.id } : { kind: "clap" });
  const at = b.move ? b.count - 1 + spot.frac : spot.frac;
  let lm = coachLandmarks(p.still ? BASE : poseOf(doing, at, 0));
  if (p.mirrored) {
    lm = lm.map((l) => ({ ...l, x: -l.x }));
    for (const [a, c] of SWAP) [lm[a], lm[c]] = [lm[c]!, lm[a]!];
  }
  const k = p.scale ?? 1;
  const n = p.noise ?? 0;
  return lm.map((l) => ({ ...l, x: l.x * k + n * (rnd() - 0.5) * 2, y: l.y * k + n * (rnd() - 0.5) * 2, z: l.z * k + n * (rnd() - 0.5) * 2 }));
}

/** A dance, danced by `p` in front of a camera at `fps`: the beat judge's verdicts. */
function dance(p: Player, d: Difficulty = "easy", fps = 30, id = "pop-medium") {
  const show = buildShow(id, "dance")!;
  const run = planRun(show, { leadStartAt: null, danceStartAt: 10_000, fromBeat: 0 });
  const judge = new BeatJudge(run, d, 0);
  const cam = new CameraJudge((i, t) => judge.decide(i, t));
  const rnd = random(7);
  const verdicts: Verdict[] = [];
  const offs: number[] = [];
  const end = runEnd(run) + 1000;
  for (let t = run[0]!.t - 500; t < end; t += 1000 / fps) {
    const lm = seenAt(run, t, p, rnd);
    cam.push(t, lm && playerBody(lm));
    cam.decide(run, d);
    for (const j of judge.settle(t - decidedAfter(d, 500) - 100)) {
      verdicts.push(j.verdict);
      if (j.off !== null) offs.push(j.off);
    }
  }
  for (const j of judge.settle(Infinity)) verdicts.push(j.verdict);
  const share = (v: Verdict) => verdicts.filter((x) => x === v).length / verdicts.length;
  offs.sort((a, b) => a - b);
  return { beats: verdicts.length, hit: share("hit"), moved: share("hit") + share("close"), median: offs[offs.length >> 1] ?? null, alike: cam.alike };
}

/** The rig's own way (three.js Object3Ds, as coach/rig.ts apply): its shoulders, hips and where the wrists, ankles and toes are put. */
function rigJoints(p: Pose) {
  const root = new Object3D();
  const hips = new Object3D();
  const spine = new Object3D();
  const chest = new Object3D();
  root.add(hips);
  hips.add(spine);
  spine.add(chest);
  root.position.set(p.rx, 0, p.rz);
  root.rotation.set(0, p.turn, 0);
  hips.position.set(p.px, HIP_Y + p.py, p.pz);
  hips.rotation.set(p.pitch, p.yaw, p.roll);
  spine.position.set(0, SPINE_Y, 0);
  spine.rotation.set(p.cPitch * 0.4, p.cYaw * 0.4, p.cRoll * 0.4);
  chest.position.set(0, CHEST_Y, 0);
  chest.rotation.set(p.cPitch * 0.6, p.cYaw * 0.6, p.cRoll * 0.6);
  root.updateMatrixWorld(true);
  const w = (o: Object3D, x: number, y: number, z: number) => o.localToWorld(new Vector3(x, y, z)).toArray();
  const ankle = w(root, p.fR.x, ANKLE_Y + p.fR.lift, p.fR.z);
  const foot = new Quaternion().setFromEuler(new Euler(-p.fR.pitch, p.fR.yaw, 0, "YXZ")).premultiply(root.getWorldQuaternion(new Quaternion()));
  const toes = new Vector3(0, -0.05, 0.17).applyQuaternion(foot).add(new Vector3(...ankle)).toArray();
  return { sR: w(chest, SHOULDER_W, SHOULDER_Y + p.sR[0], p.sR[1]), wR: w(chest, p.hR[0], SHOULDER_Y + p.hR[1] + p.sR[0], p.hR[2] + p.sR[1]), hL: w(hips, -HIP_W, -0.04, 0), ankle, toes };
}

const near = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) < 1e-6;

describe("camera: bodies", () => {
  it("the coach's joints are where its rig puts them", () => {
    let n = 0;
    for (const id of ["yangge-twist", "grapevine-turn", "squat-reach", "heel-tap", "side-lunge-punch", "kemusan-hand-twirl"]) {
      for (let q = 0; q < 8; q += 0.75) {
        const pose = poseOf({ kind: "move", id }, q, 0);
        const mine = coachJoints(pose);
        const rig = rigJoints(pose);
        assert.ok(near(mine.shoulderR, rig.sR) && near(mine.hipL, rig.hL), `${id} at ${q}: shoulders, hips`);
        // (the wrist and ankle land on their targets when those are in reach)
        if (Math.hypot(rig.wR[0]! - rig.sR[0]!, rig.wR[1]! - rig.sR[1]!, rig.wR[2]! - rig.sR[2]!) < 0.55) assert.ok(near(mine.wristR, rig.wR), `${id} at ${q}: wrist`);
        if (near(mine.ankleR, rig.ankle)) {
          assert.ok(near(mine.toesR, rig.toes), `${id} at ${q}: toes`);
          n++;
        }
      }
    }
    assert.ok(n > 20, "the feet were checked");
  });


  it("a camera's landmarks of the coach give back the coach's body", () => {
    for (const id of ["raise-arms", "side-step-touch", "step-knee-lift", "squat-reach", "alternating-reach"]) {
      for (const p of [0, 1, 2, 3]) {
        const pose = poseOf({ kind: "move", id }, p, 0);
        const seen = playerBody(coachLandmarks(pose))!;
        assert.ok(likeness(seen, coachBody(pose)) > 0.99, `${id} at ${p}`);
      }
    }
  });

  it("left for right is not the move: the coach is a mirror", () => {
    // (one arm up, the other down: a player lifting the wrong one)
    const pose = poseOf({ kind: "move", id: "alternating-reach" }, 0, 0);
    let lm = coachLandmarks(pose).map((l) => ({ ...l, x: -l.x }));
    for (const [a, c] of SWAP) [lm[a], lm[c]] = [lm[c]!, lm[a]!];
    const { weight } = targetOf({ move: { id: "alternating-reach" } as RunBeat["move"], count: 1 });
    const right = likeness(playerBody(coachLandmarks(pose))!, coachBody(pose), weight);
    const wrong = likeness(playerBody(lm)!, coachBody(pose), weight);
    assert.ok(right > 0.99 && wrong < ALIKE.easy, `right ${right.toFixed(2)}, wrong ${wrong.toFixed(2)}`);
  });

  it("nobody, or too little of them, is no body", () => {
    const lm = coachLandmarks(BASE).map((l) => ({ ...l, visibility: 0.1 }));
    assert.equal(playerBody(lm), null);
    assert.equal(playerBody([]), null);
  });

  it("a move's weights favour the parts it moves", () => {
    const { weight: steps } = targetOf({ move: { id: "side-step-touch" } as RunBeat["move"], count: 1 });
    const { weight: arms } = targetOf({ move: { id: "raise-arms" } as RunBeat["move"], count: 1 });
    // (PARTS: the arms 0 to 3, the legs 4 to 7)
    assert.ok(steps[5]! > arms[5]!, "shins count more in a step");
    assert.ok(arms[0]! > arms[5]!, "upper arms more than shins in raise-arms");
  });
});

describe("camera: a dance", () => {
  it("the coach's own moves, on time, are on the beat", () => {
    const r = dance({});
    assert.ok(r.hit >= 0.9, JSON.stringify(r));
    assert.ok(Math.abs(r.median!) <= 40, JSON.stringify(r));
  });

  it("late by 120 ms: still there, and the judge sees it late", () => {
    const r = dance({ lagMs: 120 });
    assert.ok(r.moved >= 0.9, JSON.stringify(r));
    assert.ok(r.median! >= 70 && r.median! <= 170, JSON.stringify(r));
  });

  it("a child, with a shaky camera, at 15 frames a second", () => {
    const r = dance({ scale: 0.7, noise: 0.025 }, "easy", 15);
    assert.ok(r.hit >= 0.8, JSON.stringify(r));
  });

  it("standing still, or another dance all along, is not dancing", () => {
    const still = dance({ still: true });
    const wrong = dance({ wrong: { kind: "move", id: "squat-reach" } });
    assert.ok(still.moved <= 0.35, `still ${JSON.stringify(still)}`);
    assert.ok(wrong.moved <= 0.45, `wrong ${JSON.stringify(wrong)}`);
  });

  it("nobody in the picture: every beat missed", () => {
    const r = dance({ gone: true });
    assert.equal(r.moved, 0);
  });

  it("hard asks for more than easy", () => {
    const easy = dance({ noise: 0.04 }, "easy");
    const hard = dance({ noise: 0.04 }, "hard");
    assert.ok(hard.moved <= easy.moved, `easy ${easy.moved} hard ${hard.moved}`);
  });
});

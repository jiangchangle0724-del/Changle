/**
 * 跟着跳's coach on the big screen (Steve on Nov 14: "优化一下机器人的形象，要更拟人真实细腻一些"): a
 * humanlike robot built here from rounded shapes (nothing to download): a glossy white shell over dark
 * metal joints, a black glass visor with eyes that glow in the room's light, DJ headphones, a light on
 * its chest that beats with the music, and a stool for the moves danced sitting down. Its joints are
 * plain nodes: a pose (poses.ts) sets where the hips are and how the spine and head lean, and puts the
 * hands and feet somewhere; the arms and legs reach there by themselves (two bones each, elbows out
 * and down, knees forward).
 */
import type { BufferGeometry, Material, Mesh, Object3D, Vector3 } from "three";
import type { Pose } from "./poses";

type Three = typeof import("three");

/** Its measures (metres: about 1.8 standing). */
export const DIMS = {
  /** the ankle joint over the floor */
  ankle: 0.085,
  shin: 0.42,
  thigh: 0.43,
  /** a hip joint: out from the middle, down from the pelvis's centre */
  hipX: 0.1,
  hipDown: 0.045,
  /** the pelvis's centre standing easy (knees soft) */
  stand: 0.94,
  /** the pelvis's centre to where the chest starts */
  waist: 0.17,
  chest: 0.37,
  /** a shoulder joint: out from the middle, up from where the chest starts */
  shoulderX: 0.215,
  shoulderUp: 0.29,
  upper: 0.285,
  fore: 0.265,
  neck: 0.075,
  head: 0.155,
  /** the stool's top, and the pelvis's centre sitting on it */
  seat: 0.47,
  sit: 0.545,
} as const;

/** The joints a pose drives, and the bits that light up. [left, right]: the robot's own (+x). */
export type Rig = {
  root: Object3D;
  hips: Object3D;
  spine: Object3D;
  chest: Object3D;
  neck: Object3D;
  head: Object3D;
  shoulder: [Object3D, Object3D];
  elbow: [Object3D, Object3D];
  hip: [Object3D, Object3D];
  knee: [Object3D, Object3D];
  ankle: [Object3D, Object3D];
  eyes: [Mesh, Mesh];
  smile: [Mesh, Mesh];
  chestLight: Mesh;
  stool: Object3D;
  shadow: Mesh;
  /** the materials in the room's light */
  lit: Material[];
  /** everything made here, let go of */
  dispose: () => void;
};

/**
 * A capsule hanging down from where it's put: `r1` round at its top, narrowing to `r2` round at its
 * bottom, `len` between the two centres.
 */
function taper(T: Three, r1: number, r2: number, len: number): BufferGeometry {
  const pts: InstanceType<Three["Vector2"]>[] = [];
  const steps = 5;
  // from the bottom's tip up the side to the top's tip (a lathe turns the line round the y axis)
  for (let i = 0; i <= steps; i++) {
    const a = (Math.PI / 2) * (i / steps);
    pts.push(new T.Vector2(Math.sin(a) * r2, -len - Math.cos(a) * r2));
  }
  for (let i = 0; i <= steps; i++) {
    const a = Math.PI / 2 + (Math.PI / 2) * (i / steps);
    pts.push(new T.Vector2(Math.sin(a) * r1, -Math.cos(a) * r1));
  }
  return new T.LatheGeometry(pts, 20);
}

/** A soft round shadow under its feet, drawn once on a small canvas. */
function blob(T: Three) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(0.5, "rgba(0,0,0,0.2)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

/** The robot, its lights in `gel` (the room's light: `setGlow` changes it). */
export function buildRobot(T: Three, gel: string): Rig {
  const made: { dispose: () => void }[] = [];
  const own = <X extends { dispose: () => void }>(x: X) => {
    made.push(x);
    return x;
  };
  // (standard materials: a clear coat looked the same at this size and cost a fifth more to draw)
  const shell = own(new T.MeshStandardMaterial({ color: 0xf2eef7, roughness: 0.24, metalness: 0 }));
  const metal = own(new T.MeshStandardMaterial({ color: 0x2c2937, roughness: 0.34, metalness: 0.72 }));
  const rubber = own(new T.MeshStandardMaterial({ color: 0x1e1c26, roughness: 0.62, metalness: 0.15 }));
  const glass = own(new T.MeshStandardMaterial({ color: 0x07060c, roughness: 0.12, metalness: 0.3 }));
  const glow = own(new T.MeshBasicMaterial({ color: new T.Color(gel), toneMapped: false }));
  const accent = own(new T.MeshStandardMaterial({ color: new T.Color(gel), roughness: 0.45, metalness: 0.1, emissive: new T.Color(gel), emissiveIntensity: 0.3 }));

  const at = (o: Object3D, p: [number, number, number], s?: [number, number, number], r?: [number, number, number]) => {
    o.position.set(...p);
    if (s) o.scale.set(...s);
    if (r) o.rotation.set(...r);
    return o;
  };
  const mesh = (g: BufferGeometry, m: Material) => new T.Mesh(own(g), m);
  const node = (parent: Object3D | null, p: [number, number, number] = [0, 0, 0]) => {
    const n = at(new T.Group(), p);
    parent?.add(n);
    return n;
  };
  const ball = (r: number, m: Material, seg = 16) => mesh(new T.SphereGeometry(r, seg, Math.round(seg * 0.7)), m);
  const D = DIMS;

  const root = node(null);
  const shadow = mesh(new T.PlaneGeometry(1, 1), own(new T.MeshBasicMaterial({ map: own(blob(T)), transparent: true, depthWrite: false })));
  at(shadow, [0, 0.002, 0], [0.9, 0.7, 1], [-Math.PI / 2, 0, 0]);
  root.add(shadow);

  // the stool (out of sight while it stands)
  const stool = node(root, [0, 0, -0.05]);
  stool.add(
    at(mesh(new T.CylinderGeometry(0.2, 0.185, 0.055, 28), metal), [0, D.seat - 0.035, 0]),
    at(mesh(new T.CylinderGeometry(0.188, 0.2, 0.028, 28), accent), [0, D.seat - 0.004, 0]),
    at(mesh(new T.CylinderGeometry(0.028, 0.034, D.seat - 0.06, 16), metal), [0, (D.seat - 0.06) / 2 + 0.02, 0]),
    at(mesh(new T.CylinderGeometry(0.16, 0.185, 0.035, 28), metal), [0, 0.018, 0]),
    at(mesh(new T.TorusGeometry(0.12, 0.011, 6, 28), metal), [0, 0.19, 0], undefined, [Math.PI / 2, 0, 0]),
  );
  stool.visible = false;

  // the pelvis (and a belt), the waist (ribbed), the chest (turned on a lathe)
  const hips = node(root, [0, D.stand, 0]);
  hips.add(at(mesh(new T.SphereGeometry(0.155, 28, 16), shell), [0, -0.012, 0], [1, 0.6, 0.78]));
  hips.add(at(mesh(new T.TorusGeometry(0.136, 0.017, 8, 36), metal), [0, 0.046, 0], [1, 0.78, 1], [Math.PI / 2, 0, 0]));
  const spine = node(hips, [0, 0.06, 0]);
  spine.add(at(mesh(new T.CylinderGeometry(0.1, 0.113, 0.13, 24), rubber), [0, 0.05, 0], [1, 1, 0.8]));
  for (const y of [0.025, 0.075]) spine.add(at(mesh(new T.TorusGeometry(0.106, 0.009, 6, 28), metal), [0, y, 0], [1, 0.8, 1], [Math.PI / 2, 0, 0]));
  const chest = node(spine, [0, D.waist - 0.06, 0]);
  {
    const prof = [
      [0.0, 0.0],
      [0.116, 0.0],
      [0.138, 0.05],
      [0.168, 0.13],
      [0.188, 0.21],
      [0.19, 0.27],
      [0.172, 0.32],
      [0.13, 0.352],
      [0.068, 0.368],
      [0.0, 0.37],
    ].map(([r, y]) => new T.Vector2(r, y));
    chest.add(at(mesh(new T.LatheGeometry(prof, 36), shell), [0, 0, 0], [1, 1, 0.72]));
    chest.add(at(mesh(new T.BoxGeometry(0.15, 0.19, 0.05), metal), [0, 0.2, -0.112]));
    chest.add(at(mesh(new T.TorusGeometry(0.046, 0.011, 8, 28), metal), [0, 0.215, 0.127]));
  }
  const chestLight = at(mesh(new T.CircleGeometry(0.037, 28), glow), [0, 0.215, 0.129]) as Mesh;
  chest.add(chestLight);

  // the neck and the head: a white shell, a band of black glass across the face, glowing eyes
  const neck = node(chest, [0, D.chest, 0]);
  neck.add(at(mesh(new T.CylinderGeometry(0.036, 0.044, D.neck + 0.03, 16), metal), [0, D.neck / 2, 0]));
  const head = node(neck, [0, D.neck, 0]);
  const h = D.head;
  const skull = node(head, [0, h * 0.96, 0]);
  skull.add(at(mesh(new T.SphereGeometry(h, 36, 24), shell), [0, 0, 0], [1, 1.03, 0.97]));
  // (a slice of a slightly bigger sphere: its front, from a bit above the eyes to below them)
  skull.add(at(mesh(new T.SphereGeometry(h * 1.014, 32, 14, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.3, Math.PI * 0.36), glass), [0, 0, 0], [1, 1.03, 0.97]));
  const eye = (x: number) => {
    const e = at(mesh(new T.CapsuleGeometry(0.0165, 0.022, 4, 12), glow), [x, 0.005, h * 0.955], undefined, [-0.12, 0, 0]) as Mesh;
    skull.add(e);
    return e;
  };
  const eyes: [Mesh, Mesh] = [eye(0.05), eye(-0.05)];
  const arc = (x: number) => {
    const a = at(mesh(new T.TorusGeometry(0.021, 0.0062, 6, 16, Math.PI), glow), [x, -0.004, h * 0.958], undefined, [-0.12, 0, 0]) as Mesh;
    a.visible = false;
    skull.add(a);
    return a;
  };
  const smile: [Mesh, Mesh] = [arc(0.05), arc(-0.05)];
  // DJ headphones: a band over the top, a cup on each ear with a glowing rim
  skull.add(at(mesh(new T.TorusGeometry(h * 1.09, 0.014, 8, 32, Math.PI), metal), [0, 0.01, -0.012]));
  for (const s of [1, -1]) {
    skull.add(at(mesh(new T.CylinderGeometry(0.057, 0.057, 0.05, 24), metal), [s * h * 1.04, -0.03, -0.01], undefined, [0, 0, Math.PI / 2]));
    skull.add(at(mesh(new T.TorusGeometry(0.041, 0.0075, 6, 24), glow), [s * (h * 1.04 + 0.026), -0.03, -0.01], undefined, [0, Math.PI / 2, 0]));
  }

  // the arms: a pad over each shoulder; the upper arm, the elbow, the forearm, a mitten of a hand
  const arm = (s: 1 | -1) => {
    chest.add(at(mesh(new T.SphereGeometry(0.084, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), shell), [s * D.shoulderX, D.shoulderUp + 0.008, 0], [1.08, 1, 1.02]));
    const shoulder = node(chest, [s * D.shoulderX, D.shoulderUp, 0]);
    shoulder.add(ball(0.055, metal));
    shoulder.add(at(mesh(taper(T, 0.052, 0.045, D.upper - 0.075), shell), [0, -0.035, 0]));
    const elbow = node(shoulder, [0, -D.upper, 0]);
    elbow.add(ball(0.043, metal));
    elbow.add(at(mesh(taper(T, 0.046, 0.036, D.fore - 0.065), shell), [0, -0.03, 0]));
    const wrist = node(elbow, [0, -D.fore, 0]);
    wrist.add(ball(0.029, metal, 12));
    wrist.add(at(mesh(new T.SphereGeometry(1, 16, 12), rubber), [0, -0.052, 0.004], [0.041, 0.06, 0.024]));
    wrist.add(at(mesh(new T.CapsuleGeometry(0.0125, 0.03, 4, 8), rubber), [s * -0.02, -0.03, 0.028], undefined, [0.7, 0, s * 0.35]));
    return { shoulder, elbow };
  };
  const aL = arm(1);
  const aR = arm(-1);

  // the legs: the hip joint, the thigh, the knee (a cap over it), the shin, a rounded shoe
  const leg = (s: 1 | -1) => {
    const hip = node(hips, [s * D.hipX, -D.hipDown, 0]);
    hip.add(ball(0.062, metal));
    hip.add(at(mesh(taper(T, 0.074, 0.057, D.thigh - 0.085), shell), [0, -0.04, 0]));
    const knee = node(hip, [0, -D.thigh, 0]);
    knee.add(ball(0.051, metal));
    knee.add(at(mesh(new T.SphereGeometry(0.05, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), shell), [0, 0.004, 0.024], [0.95, 0.85, 0.7], [Math.PI / 2, 0, 0]));
    knee.add(at(mesh(taper(T, 0.057, 0.044, D.shin - 0.075), shell), [0, -0.035, 0]));
    const ankle = node(knee, [0, -D.shin, 0]);
    ankle.add(ball(0.039, metal, 12));
    ankle.add(at(mesh(new T.SphereGeometry(1, 20, 12), shell), [0, -0.035, 0.05], [0.058, 0.046, 0.125]));
    ankle.add(at(mesh(new T.CylinderGeometry(1, 1, 1, 20), accent), [0, -0.076, 0.05], [0.06, 0.018, 0.128]));
    return { hip, knee, ankle };
  };
  const lL = leg(1);
  const lR = leg(-1);

  return {
    root,
    hips,
    spine,
    chest,
    neck,
    head,
    shoulder: [aL.shoulder, aR.shoulder],
    elbow: [aL.elbow, aR.elbow],
    hip: [lL.hip, lR.hip],
    knee: [lL.knee, lR.knee],
    ankle: [lL.ankle, lR.ankle],
    eyes,
    smile,
    chestLight,
    stool,
    shadow,
    lit: [glow, accent],
    dispose: () => made.forEach((x) => x.dispose()),
  };
}

/** The room's light changed: the eyes, the chest, the rims, the soles and the cushion follow it. */
export function setGlow(T: Three, rig: Rig, gel: string) {
  const c = new T.Color(gel);
  for (const m of rig.lit) {
    const x = m as Material & { color: InstanceType<Three["Color"]>; emissive?: InstanceType<Three["Color"]> };
    x.color.copy(c);
    x.emissive?.copy(c);
  }
}

/* ------------------------------------------------------------------ reaching: two bones */

/** Turn `o` so its −y points along `dir` (world), its +z towards `front` (world) as near as that allows. */
function aim(T: Three, o: Object3D, dir: Vector3, front: Vector3) {
  const y = dir.clone().normalize().negate();
  const x = new T.Vector3().crossVectors(y, front);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const z = new T.Vector3().crossVectors(x, y).normalize();
  const world = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
  const parent = o.parent!.getWorldQuaternion(new T.Quaternion());
  o.quaternion.copy(parent.invert().multiply(world));
  o.updateMatrixWorld(true);
}

/**
 * The two bones from `upper`'s joint through `lower`'s reach `target` (world), the middle joint bending
 * out towards `pole` (a world direction); `len1`, `len2` their lengths. Too far: as far as they go.
 * `face`: 1, the bones' fronts face the way the middle joint points (a knee's cap); −1, away from it
 * (an arm: the elbow points back, the hand's thumb forward).
 */
export function reach(T: Three, upper: Object3D, lower: Object3D, len1: number, len2: number, target: Vector3, pole: Vector3, face: 1 | -1) {
  const start = upper.getWorldPosition(new T.Vector3());
  const v = new T.Vector3().subVectors(target, start);
  const d = Math.max(Math.abs(len1 - len2) + 1e-3, Math.min(len1 + len2 - 1e-3, v.length()));
  const dir = v.lengthSq() > 1e-10 ? v.normalize() : new T.Vector3(0, -1, 0);
  // the bend's plane holds the line to the target and the pole; the middle joint goes out towards the pole
  const bendDir = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (bendDir.lengthSq() < 1e-8) bendDir.set(0, 0, 1).addScaledVector(dir, -dir.z);
  bendDir.normalize();
  const a = Math.acos(Math.max(-1, Math.min(1, (len1 * len1 + d * d - len2 * len2) / (2 * len1 * d))));
  const upperDir = dir.clone().multiplyScalar(Math.cos(a)).addScaledVector(bendDir, Math.sin(a));
  const mid = start.clone().addScaledVector(upperDir, len1);
  const end = start.clone().addScaledVector(dir, d);
  const lowerDir = end.sub(mid).normalize();
  const front = bendDir.clone().multiplyScalar(face);
  aim(T, upper, upperDir, front);
  aim(T, lower, lowerDir, front);
}

/** Put the robot in `p` (poses.ts): the body by its angles, the arms and legs reaching. `blink` 0 to 1. */
export function applyPose(T: Three, rig: Rig, p: Pose, blink: number) {
  const D = DIMS;
  const turn = (o: Object3D, l: { pitch: number; roll: number; yaw: number }) => o.rotation.set(l.pitch, l.yaw, l.roll, "YXZ");
  rig.hips.position.set(p.hips[0], p.hips[1], p.hips[2]);
  turn(rig.hips, p.pelvis);
  turn(rig.spine, p.spine);
  turn(rig.chest, p.chest);
  rig.neck.rotation.set(p.head.pitch * 0.35, p.head.yaw * 0.35, p.head.roll * 0.35, "YXZ");
  rig.head.rotation.set(p.head.pitch * 0.65, p.head.yaw * 0.65, p.head.roll * 0.65, "YXZ");
  rig.root.updateMatrixWorld(true);
  const rootQ = rig.root.getWorldQuaternion(new T.Quaternion());

  // the legs: feet on the floor where the pose puts them, knees forward (a little out)
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const f = p.feet[i];
    const target = rig.root.localToWorld(new T.Vector3(f[0], D.ankle + f[2], f[1]));
    const knee = new T.Vector3(s * 0.12, 0.05, 1).applyEuler(new T.Euler(0, p.pelvis.yaw * 0.6, 0)).applyQuaternion(rootQ).normalize();
    reach(T, rig.hip[i], rig.knee[i], D.thigh, D.shin, target, knee, 1);
    // the shoe flat on the floor, turned a little with the hips
    const want = rootQ.clone().multiply(new T.Quaternion().setFromEuler(new T.Euler(0, p.pelvis.yaw * 0.35 + s * 0.08, 0)));
    const parent = rig.ankle[i].parent!.getWorldQuaternion(new T.Quaternion());
    rig.ankle[i].quaternion.copy(parent.invert().multiply(want));
  }

  // the arms: hands where the pose puts them (the chest's space), elbows out and down, back
  const chestQ = rig.chest.getWorldQuaternion(new T.Quaternion());
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    const hd = p.hands[i];
    const target = rig.chest.localToWorld(new T.Vector3(hd[0], hd[1], hd[2]));
    // (raised: the elbows go out to the sides; low: down and back, as an arm hangs)
    const up = Math.max(0, Math.min(1, (hd[1] - D.shoulderUp) / 0.35));
    const pole = new T.Vector3(s * (0.55 + 0.4 * up), -0.55 * (1 - up), -0.55 + 0.2 * up).normalize().applyQuaternion(chestQ);
    reach(T, rig.shoulder[i], rig.elbow[i], D.upper, D.fore, target, pole, -1);
  }

  // the eyes: ovals, or happy arcs; a blink squeezes the ovals shut
  const happy = p.happy >= 0.5;
  for (let i = 0; i < 2; i++) {
    rig.eyes[i].visible = !happy;
    rig.smile[i].visible = happy;
    rig.eyes[i].scale.y = Math.max(0.1, 1 - blink);
  }
  rig.chestLight.scale.setScalar(0.8 + 0.35 * Math.max(0, Math.min(1, p.glow)));
  // the stool there while it sits, coming in under it as it sits down
  rig.stool.visible = p.sit > 0.02;
  rig.stool.scale.setScalar(0.5 + 0.5 * Math.min(1, p.sit * 1.4));
  // its shadow under the hips
  rig.shadow.position.x = p.hips[0] * 0.6;
  rig.shadow.position.z = p.hips[2] * 0.6 + p.sit * 0.1;
}

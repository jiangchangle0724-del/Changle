// The coach's body: a cartoon dance teacher built from rounded shapes (no model file to download,
// nothing to license), on a skeleton named like Mixamo's, so a modelled character can take its place
// later. Each frame a Pose (pose.ts) goes on it: the hips, chest and head are turned directly; the
// arms and legs bend by two-bone IK so the wrists and ankles land where the pose says.
import {
  BackSide,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Euler,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RedFormat,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import type { Pose, V3 } from "./pose";

// ---------- sizes (metres)
const HIP_Y = 0.875;
const HIP_W = 0.1;
const THIGH = 0.4;
const SHIN = 0.4;
export const ANKLE_Y = 0.075;
const SHOULDER_W = 0.19;
const SHOULDER_Y = 0.26;
const UPPER_ARM = 0.29;
const FOREARM = 0.27;

export const COLORS = {
  skin: "#efbe9c",
  hair: "#2a1d3a",
  top: "#8f7bff",
  topLight: "#cfc6ff",
  pants: "#3a3f8f",
  waist: "#ffd84a",
  shoe: "#f7f6ff",
  sole: "#ffcc4d",
  band: "#ffd84a",
  headband: "#ff5fa2",
  eye: "#1b1230",
  mouth: "#7a2448",
  cheek: "#ff8fb0",
  hanky: "#ff4f7b",
  outline: "#0b0720",
};

/** Three tones of light and shade: the cartoon look. */
function toonRamp(): DataTexture {
  const t = new DataTexture(new Uint8Array([90, 170, 255]), 3, 1, RedFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** The dark outline round each part: its back faces, pushed out along the normals. */
function outlineMaterial(color: string, thickness: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(color) }, thickness: { value: thickness } },
    vertexShader: "uniform float thickness; void main() { vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
    fragmentShader: "uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }",
    side: BackSide,
  });
}

const DOWN = new Vector3(0, -1, 0);

export class Rig {
  readonly root = new Group();
  private readonly ramp = toonRamp();
  private readonly mats = new Map<string, MeshToonMaterial>();
  private readonly line = outlineMaterial(COLORS.outline, 0.011);
  private readonly owned: (BufferGeometry | Material)[] = [];

  readonly hips = new Group();
  private readonly spine = new Group();
  readonly chest = new Group();
  private readonly neck = new Group();
  readonly head = new Group();
  private readonly arm = { R: this.limbGroups(), L: this.limbGroups() };
  private readonly leg = { R: this.limbGroups(), L: this.limbGroups() };
  private readonly shoulder = { R: new Group(), L: new Group() };
  private readonly hipJoint = { R: new Group(), L: new Group() };
  private readonly hanky = { R: new Group(), L: new Group() };
  private readonly eyes: Mesh[] = [];
  private readonly tail: { pos: Vector3[]; prev: Vector3[]; balls: Mesh[]; anchor: Object3D; ready: boolean };
  /** what lights up (the parts the move is about) */
  private readonly glowHands: MeshToonMaterial;
  private readonly glowFeet: MeshToonMaterial;

  constructor() {
    this.glowHands = this.mat("band");
    this.glowFeet = this.mat("sole");
    this.build();
    this.tail = this.buildTail();
  }

  private limbGroups() {
    return { upper: new Group(), lower: new Group(), end: new Group() };
  }

  private mat(name: keyof typeof COLORS): MeshToonMaterial {
    let m = this.mats.get(name);
    if (!m) {
      m = new MeshToonMaterial({ color: new Color(COLORS[name]), gradientMap: this.ramp });
      this.mats.set(name, m);
      this.owned.push(m);
    }
    return m;
  }

  /** A part, with its outline unless it's too small to need one. */
  private part(geo: BufferGeometry, color: keyof typeof COLORS, parent: Object3D, at?: V3, outline = true, material?: Material): Mesh {
    this.owned.push(geo);
    const m = new Mesh(geo, material ?? this.mat(color));
    if (at) m.position.set(...at);
    parent.add(m);
    if (outline) {
      const o = new Mesh(geo, this.line);
      m.add(o);
    }
    return m;
  }

  private build() {
    const { root, hips, spine, chest, neck, head } = this;
    root.add(hips);
    hips.rotation.order = "YXZ";
    // the shorts
    const pelvis = new LatheGeometry([new Vector2(0, -0.1), new Vector2(0.135, -0.095), new Vector2(0.16, -0.03), new Vector2(0.155, 0.05), new Vector2(0.13, 0.1), new Vector2(0, 0.11)], 24);
    this.part(pelvis, "pants", hips).scale.set(1, 1, 0.78);
    const belt = new Mesh(new TorusGeometry(0.135, 0.016, 6, 36), this.mat("waist"));
    this.owned.push(belt.geometry);
    belt.rotation.x = Math.PI / 2;
    belt.position.set(0, 0.085, 0);
    belt.scale.set(1, 0.78, 1);
    hips.add(belt);
    // the waist and the chest
    spine.position.set(0, 0.08, 0);
    spine.rotation.order = "YXZ";
    hips.add(spine);
    this.part(new SphereGeometry(0.135, 24, 16), "top", spine, [0, 0.03, 0]).scale.set(1, 1.05, 0.74);
    chest.position.set(0, 0.14, 0);
    chest.rotation.order = "YXZ";
    spine.add(chest);
    const torso = new LatheGeometry(
      [new Vector2(0, -0.04), new Vector2(0.14, -0.03), new Vector2(0.165, 0.06), new Vector2(0.19, 0.17), new Vector2(0.2, 0.25), new Vector2(0.175, 0.31), new Vector2(0.09, 0.345), new Vector2(0, 0.35)],
      28,
    );
    this.part(torso, "top", chest).scale.set(1, 1, 0.64);
    // a stripe across the chest
    const stripe = new Mesh(new TorusGeometry(0.188, 0.012, 6, 40), this.mat("topLight"));
    this.owned.push(stripe.geometry);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.set(0, 0.2, 0);
    stripe.scale.set(1, 0.64, 1);
    chest.add(stripe);
    // the neck and the head
    neck.position.set(0, SHOULDER_Y + 0.04, 0);
    neck.rotation.order = "YXZ";
    chest.add(neck);
    this.part(new CapsuleGeometry(0.05, 0.05, 4, 12), "skin", neck, [0, 0.02, 0], false);
    head.position.set(0, 0.05, 0);
    head.rotation.order = "YXZ";
    neck.add(head);
    this.buildHead();
    // arms
    for (const s of ["R", "L"] as const) {
      const side = s === "R" ? 1 : -1;
      const sh = this.shoulder[s];
      sh.position.set(side * SHOULDER_W, SHOULDER_Y, 0);
      chest.add(sh);
      // the shoulder's round top, in the shirt
      this.part(new SphereGeometry(0.07, 16, 12), "top", sh, [side * -0.01, 0, 0]);
      const a = this.arm[s];
      sh.add(a.upper);
      this.part(new CapsuleGeometry(0.068, 0.07, 4, 14), "top", a.upper, [0, -0.05, 0]);
      this.part(new CapsuleGeometry(0.05, UPPER_ARM - 0.06, 4, 14), "skin", a.upper, [0, -UPPER_ARM / 2 - 0.02, 0]);
      a.lower.position.set(0, -UPPER_ARM, 0);
      a.upper.add(a.lower);
      this.part(new CapsuleGeometry(0.044, FOREARM, 4, 14), "skin", a.lower, [0, -FOREARM / 2, 0]);
      const band = this.part(new CapsuleGeometry(0.052, 0.035, 4, 14), "band", a.lower, [0, -FOREARM + 0.035, 0], true, this.glowHands);
      band.scale.set(1, 1, 1);
      a.end.position.set(0, -FOREARM, 0);
      a.lower.add(a.end);
      // a mitten: the palm faces the hand's +z, the thumb sits on its inner side
      this.part(new SphereGeometry(0.052, 18, 14), "skin", a.end, [0, -0.06, 0]).scale.set(0.92, 1.3, 0.62);
      this.part(new CapsuleGeometry(0.018, 0.04, 4, 8), "skin", a.end, [side * -0.042, -0.04, 0.01], false).rotation.z = side * -0.5;
      // the handkerchief, out of the fingers
      const hk = this.hanky[s];
      hk.position.set(0, -0.11, 0);
      a.end.add(hk);
      const cloth = new Mesh(new PlaneGeometry(0.2, 0.2, 1, 1), new MeshBasicMaterial({ color: new Color(COLORS.hanky), side: DoubleSide }));
      this.owned.push(cloth.geometry, cloth.material as Material);
      cloth.position.set(0.08, -0.08, 0);
      cloth.rotation.z = Math.PI / 4;
      hk.add(cloth);
      hk.visible = false;
    }
    // legs
    for (const s of ["R", "L"] as const) {
      const side = s === "R" ? 1 : -1;
      const hj = this.hipJoint[s];
      hj.position.set(side * HIP_W, -0.04, 0);
      hips.add(hj);
      const l = this.leg[s];
      hj.add(l.upper);
      this.part(new CapsuleGeometry(0.08, THIGH, 4, 14), "pants", l.upper, [0, -THIGH / 2, 0]);
      l.lower.position.set(0, -THIGH, 0);
      l.upper.add(l.lower);
      this.part(new CapsuleGeometry(0.064, SHIN, 4, 14), "pants", l.lower, [0, -SHIN / 2, 0]);
      l.end.position.set(0, -SHIN, 0);
      l.lower.add(l.end);
      // a trainer: toes along the foot's +z
      const shoe = this.part(new CapsuleGeometry(0.052, 0.13, 4, 14), "shoe", l.end, [0, -0.035, 0.055]);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1.12, 1, 0.78);
      const sole = this.part(new CapsuleGeometry(0.054, 0.14, 4, 14), "sole", l.end, [0, -0.068, 0.055], false, this.glowFeet);
      sole.rotation.x = Math.PI / 2;
      sole.scale.set(1.16, 1, 0.3);
    }
  }

  private buildHead() {
    const h = this.head;
    const c: V3 = [0, 0.13, 0];
    this.part(new SphereGeometry(0.165, 32, 24), "skin", h, c).scale.set(0.95, 1, 0.93);
    // hair: a cap over the top and back, a fringe
    const cap = this.part(new SphereGeometry(0.173, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), "hair", h, [0, 0.135, -0.008]);
    cap.rotation.x = -0.42;
    cap.scale.set(0.97, 1, 0.97);
    for (const [x, rz] of [
      [-0.06, 0.5],
      [0.0, 0.05],
      [0.06, -0.5],
    ] as const) {
      const f = this.part(new SphereGeometry(0.055, 12, 10), "hair", h, [x, 0.25, 0.095], false);
      f.scale.set(1, 0.55, 0.7);
      f.rotation.z = rz;
    }
    const band = this.part(new TorusGeometry(0.163, 0.018, 8, 40), "headband", h, [0, 0.215, 0.0], false);
    band.rotation.x = Math.PI / 2 - 0.42;
    // eyes, a smile, cheeks
    for (const x of [-0.052, 0.052]) {
      const e = this.part(new SphereGeometry(0.025, 14, 12), "eye", h, [x * 1.08, 0.15, 0.145], false);
      e.scale.set(0.82, 1.25, 0.5);
      this.eyes.push(e);
      const shine = new Mesh(new SphereGeometry(0.007, 8, 6), new MeshBasicMaterial({ color: 0xffffff }));
      this.owned.push(shine.geometry, shine.material as Material);
      shine.position.set(0.25, 0.35, 0.8);
      e.add(shine);
      const ch = this.part(new SphereGeometry(0.024, 12, 8), "cheek", h, [x * 1.7, 0.098, 0.13], false);
      ch.scale.set(1.3, 0.75, 0.4);
    }
    const smile = this.part(new TorusGeometry(0.038, 0.009, 8, 16, Math.PI), "mouth", h, [0, 0.088, 0.152], false);
    smile.rotation.z = Math.PI;
    this.part(new SphereGeometry(0.014, 10, 8), "skin", h, [0, 0.118, 0.162], false);
  }

  /** A ponytail that swings: three balls on a chain, in the world (it lags behind the head). */
  private buildTail() {
    const anchor = new Object3D();
    anchor.position.set(0, 0.27, -0.13);
    this.head.add(anchor);
    const tie = this.part(new TorusGeometry(0.03, 0.012, 8, 16), "headband", anchor, [0, 0, 0], false);
    tie.rotation.x = 0.6;
    const balls: Mesh[] = [];
    for (const r of [0.055, 0.05, 0.042, 0.032]) {
      const b = this.part(new SphereGeometry(r, 14, 10), "hair", this.root, undefined, true);
      balls.push(b);
    }
    return { pos: balls.map(() => new Vector3()), prev: balls.map(() => new Vector3()), balls, anchor, ready: false };
  }

  // ---------- each frame

  private readonly v = { a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3(), e: new Vector3(), n: new Vector3() };
  private readonly q = { a: new Quaternion(), b: new Quaternion(), c: new Quaternion(), d: new Quaternion() };
  /** (kept apart from the scratch ones above: the IK and the hands use those) */
  private readonly qChest = new Quaternion();
  private readonly qHip = new Quaternion();
  private readonly qRoot = new Quaternion();
  private readonly m4 = new Matrix4();
  private readonly eul = new Euler(0, 0, 0, "YXZ");

  /** Put the body in a pose. `dt` (seconds) moves the ponytail; `glow` lights the hands or the feet. */
  apply(p: Pose, dt: number, glow: { hands: number; feet: number }, secs: number) {
    const { root, hips, spine, chest, neck, head } = this;
    root.position.set(p.rx, 0, p.rz);
    root.rotation.set(0, p.turn, 0);
    hips.position.set(p.px, HIP_Y + p.py, p.pz);
    hips.rotation.set(p.pitch, p.yaw, p.roll);
    spine.rotation.set(p.cPitch * 0.4, p.cYaw * 0.4, p.cRoll * 0.4);
    chest.rotation.set(p.cPitch * 0.6, p.cYaw * 0.6, p.cRoll * 0.6);
    neck.rotation.set(p.hPitch * 0.3, p.hYaw * 0.3, p.hRoll * 0.3);
    head.rotation.set(p.hPitch * 0.7, p.hYaw * 0.7, p.hRoll * 0.7);
    this.shoulder.R.position.set(SHOULDER_W, SHOULDER_Y + p.sR[0], p.sR[1]);
    this.shoulder.L.position.set(-SHOULDER_W, SHOULDER_Y + p.sL[0], p.sL[1]);
    root.updateMatrixWorld(true);
    const chestQ = chest.getWorldQuaternion(this.qChest);
    for (const s of ["R", "L"] as const) {
      const hand = s === "R" ? p.hR : p.hL;
      const sh = s === "R" ? p.sR : p.sL;
      // the wrist: between the shoulders plus the pose's offset, in the chest's frame
      const target = this.v.e.set(hand[0], SHOULDER_Y + hand[1] + sh[0], hand[2] + sh[1]);
      chest.localToWorld(target);
      const pole = this.v.n.set(...(s === "R" ? p.eR : p.eL)).applyQuaternion(chestQ);
      const a = this.arm[s];
      const foreWorld = this.twoBone(a.upper, a.lower, UPPER_ARM, FOREARM, target, pole);
      // the hand faces where the pose says, around the forearm
      const palm = this.v.c.set(...(s === "R" ? p.pR : p.pL)).applyQuaternion(chestQ);
      this.orient(a.end, foreWorld, palm);
      const hk = this.hanky[s];
      hk.visible = p.hankyOn > 0.05;
      if (hk.visible) {
        hk.rotation.set(0, (s === "R" ? 1 : -1) * p.hanky, 0);
        hk.scale.setScalar(p.hankyOn);
      }
    }
    const hipQ = hips.getWorldQuaternion(this.qHip);
    const rootQ = root.getWorldQuaternion(this.qRoot);
    for (const s of ["R", "L"] as const) {
      const f = s === "R" ? p.fR : p.fL;
      const side = s === "R" ? 1 : -1;
      const target = root.localToWorld(this.v.e.set(f.x, ANKLE_Y + f.lift, f.z));
      // knees over the toes: forward, a little out
      const pole = this.v.n.set(side * 0.18, 0, 1).applyQuaternion(hipQ);
      const l = this.leg[s];
      const shinWorld = this.twoBone(l.upper, l.lower, THIGH, SHIN, target, pole);
      // the foot flat (or tipped by its pitch), turned by its yaw
      this.eul.set(-f.pitch, f.yaw, 0, "YXZ");
      const footWorld = this.q.a.setFromEuler(this.eul).premultiply(rootQ);
      l.end.quaternion.copy(shinWorld).invert().multiply(footWorld);
    }
    this.root.updateMatrixWorld(true);
    // blink every few seconds
    const blink = secs % 3.7 < 0.12 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = 1.25 * blink;
    // glow on what the move is about
    this.glowHands.emissive.set(COLORS.band).multiplyScalar(0.55 * glow.hands);
    this.glowFeet.emissive.set(COLORS.sole).multiplyScalar(0.55 * glow.feet);
    this.swingTail(dt);
  }

  /**
   * Two-bone IK: turn `upper` (its segment along its own -y, `l1` long) and `lower` (at its end, `l2`
   * long) so the end of `lower` is at `target`, bending towards `pole`. Returns lower's world turn.
   */
  private twoBone(upper: Object3D, lower: Object3D, l1: number, l2: number, target: Vector3, pole: Vector3): Quaternion {
    const A = upper.getWorldPosition(this.v.a);
    const to = this.v.b.copy(target).sub(A);
    let d = to.length();
    const reach = l1 + l2 - 0.002;
    if (d < 1e-5) to.set(0, -1, 0);
    to.normalize();
    d = Math.min(reach, Math.max(Math.abs(l1 - l2) + 0.01, d));
    const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    // the bend's side: the pole, square to the line to the target
    const n = this.v.c.copy(pole).addScaledVector(to, -pole.dot(to));
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1).addScaledVector(to, -to.z);
    n.normalize();
    const upperDir = this.v.d.copy(to).multiplyScalar(cosA).addScaledVector(n, sinA);
    const elbow = this.v.c.copy(A).addScaledVector(upperDir, l1);
    const end = this.v.a.copy(A).addScaledVector(to, d);
    const lowerDir = end.sub(elbow).normalize();
    // upper: its -y onto upperDir, in its parent's frame
    const upperWorld = this.q.a.setFromUnitVectors(DOWN, upperDir);
    const parentQ = upper.parent!.getWorldQuaternion(this.q.b);
    upper.quaternion.copy(parentQ).invert().multiply(upperWorld);
    // lower: lowerDir in upper's frame
    const local = lowerDir.applyQuaternion(this.q.b.copy(upperWorld).invert());
    lower.quaternion.setFromUnitVectors(DOWN, local.normalize());
    return this.q.c.copy(upperWorld).multiply(lower.quaternion);
  }

  /** A hand along its forearm (its -y away from the elbow), its palm (+z) turned towards `palm`. */
  private orient(hand: Object3D, foreWorld: Quaternion, palm: Vector3) {
    const y = this.v.a.set(0, 1, 0).applyQuaternion(foreWorld);
    const z = this.v.b.copy(palm).addScaledVector(y, -palm.dot(y));
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
    z.normalize();
    const x = this.v.d.crossVectors(y, z).normalize();
    this.m4.makeBasis(x, y, z);
    const world = this.q.d.setFromRotationMatrix(this.m4);
    hand.quaternion.copy(foreWorld).invert().multiply(world);
  }

  private swingTail(dt: number) {
    const t = this.tail;
    const anchor = t.anchor.getWorldPosition(this.v.a);
    const seg = 0.075;
    if (!t.ready || dt <= 0 || dt > 0.25) {
      // (the first frame, or the page was away: hang straight)
      for (let i = 0; i < t.pos.length; i++) {
        t.pos[i]!.set(anchor.x, anchor.y - seg * (i + 1) * 0.8, anchor.z - seg * (i + 1) * 0.6);
        t.prev[i]!.copy(t.pos[i]!);
      }
      t.ready = true;
    } else {
      const g = -9.8 * dt * dt;
      for (let i = 0; i < t.pos.length; i++) {
        const p = t.pos[i]!;
        const v = this.v.b.copy(p).sub(t.prev[i]!).multiplyScalar(0.9);
        t.prev[i]!.copy(p);
        p.add(v);
        p.y += g;
      }
      // keep the links their length, and the tail off the back of the head
      const headC = this.head.localToWorld(this.v.c.set(0, 0.13, 0));
      for (let k = 0; k < 3; k++) {
        let prev = anchor;
        for (let i = 0; i < t.pos.length; i++) {
          const p = t.pos[i]!;
          const d = this.v.d.copy(p).sub(prev);
          const len = d.length() || 1e-6;
          p.copy(prev).addScaledVector(d, seg / len);
          const fromHead = this.v.e.copy(p).sub(headC);
          const r = 0.19;
          if (fromHead.lengthSq() < r * r) p.copy(headC).addScaledVector(fromHead.normalize(), r);
          prev = p;
        }
      }
    }
    for (let i = 0; i < t.balls.length; i++) {
      const b = t.balls[i]!;
      b.position.copy(t.pos[i]!);
      this.root.worldToLocal(b.position);
    }
  }

  /** Where a wrist or an ankle is (world), for the trails and the footprints. */
  wrist(s: "R" | "L", out: Vector3): Vector3 {
    return this.arm[s].end.getWorldPosition(out);
  }
  ankle(s: "R" | "L", out: Vector3): Vector3 {
    return this.leg[s].end.getWorldPosition(out);
  }

  dispose() {
    for (const o of this.owned) o.dispose();
    this.line.dispose();
    this.ramp.dispose();
  }
}

/** A soft round spot (a glow or a shadow), drawn once. */
export function radialTexture(inner: string, outer: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

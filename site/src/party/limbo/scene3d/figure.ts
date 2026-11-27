import * as THREE from "three";

/**
 * Someone going under the bar, built from capsules at ball joints (no model to download): feet,
 * shins, thighs, hips, chest, arms, head. Posed every frame from a handful of joint angles, so the
 * phone's live lean drives the body directly: the knees go forward, the hips drop, the chest and
 * the head arch back, the arms come out for balance. Pass: through the bar and up with a cheer.
 * Fail: the bar catches the chest, a stumble back, and down on the floor.
 *
 * Units are metres; the figure stands 1.8 m, facing +z (toward the camera). Everything is leaning
 * about x: a positive rotation tips a hanging limb's end (its -y) toward -z, back, and an upright
 * part's top (its +y) toward +z, forward; so the legs fold forward with negative angles and the
 * body arches back with negative ones too.
 */

export type FigurePose = "idle" | "lean" | "pass" | "fail";

/** What the game wants of this figure: the pose, and for a lean, how far back and to which side (degrees). */
export type FigureState = { pose: FigurePose; lean: number; side: number };

/** The materials every figure shares (skin, trousers and hair, shoes) and its own (the shirt, in its colour). */
export type Wardrobe = { skin: THREE.Material; dark: THREE.Material; shoe: THREE.Material; shirt: THREE.Material };

const RAD = Math.PI / 180;

/** Leg bones (metres), and the ankle's height off the floor. */
const THIGH = 0.46;
const SHIN = 0.44;
const ANKLE = 0.08;
/** Hips to shoulders, and shoulders to the top of the head. */
const CHEST = 0.52;
const HEAD_UP = 0.3;

/** Where the hips are, feet planted, for this much knee bend: `t` the thigh's and `s` the shin's angle from vertical (radians). */
function hips(t: number, s: number) {
  return { y: ANKLE + SHIN * Math.cos(s) + THIGH * Math.cos(t), z: SHIN * Math.sin(s) - THIGH * Math.sin(t) };
}

/** How the legs fold for a lean of `k` (0 upright, 1 flat): the knees go far forward, the shins tilt. */
const legsFor = (k: number) => ({ t: k * 80 * RAD, s: k * 50 * RAD });

/**
 * How high the bar sits for a lean of `deg` degrees: where the top of the body passes when leaning
 * that far (the head at a small lean, the chest and chin at a deep one). The poles' pegs sit here too.
 */
export function barHeight(deg: number) {
  const k = Math.max(0, Math.min(1, deg / 90));
  const { t, s } = legsFor(k);
  const a = deg * RAD;
  return hips(t, s).y + (CHEST + HEAD_UP) * Math.cos(a) + 0.11 * Math.sin(a);
}

/** The joint angles and offsets of one pose (radians and metres). */
export type Joints = {
  x: number; // the whole figure, sideways
  z: number; // the whole figure, forward (+) or back
  hipY: number;
  hipZ: number;
  pelvisX: number;
  chestX: number;
  chestZ: number;
  neckX: number;
  headY: number;
  shoulderX: [number, number]; // left, right
  shoulderZ: [number, number];
  elbow: [number, number];
  thigh: [number, number];
  knee: [number, number];
  ankle: [number, number];
  scale: number; // 1, or shrinking when leaving
};

const JOINT_KEYS = ["x", "z", "hipY", "hipZ", "pelvisX", "chestX", "chestZ", "neckX", "headY", "scale"] as const;
const PAIR_KEYS = ["shoulderX", "shoulderZ", "elbow", "thigh", "knee", "ankle"] as const;

export function standing(): Joints {
  const { y, z } = hips(0, 0);
  return { x: 0, z: 0, hipY: y, hipZ: z, pelvisX: 0, chestX: 0, chestZ: 0, neckX: 0, headY: 0, shoulderX: [0, 0], shoulderZ: [-6 * RAD, 6 * RAD], elbow: [-14 * RAD, -14 * RAD], thigh: [0, 0], knee: [0, 0], ankle: [0, 0], scale: 1 };
}

/** The limbo pose: leaning back `deg` degrees, tilted `side` degrees to the right (negative: left). */
export function leaning(deg: number, side: number): Joints {
  const k = Math.max(0, Math.min(1, deg / 90));
  const a = deg * RAD;
  const { t, s } = legsFor(k);
  const h = hips(t, s);
  const j = standing();
  j.hipY = h.y;
  j.hipZ = h.z;
  // the pelvis tips back a little, the chest the rest of the way, the head a touch more
  j.pelvisX = -a * 0.22;
  j.chestX = -a * 0.78;
  j.chestZ = -side * RAD * 0.8;
  j.neckX = -a * 0.12;
  // arms out for balance, higher the deeper the lean, and a little forward
  const out = (24 + 58 * k) * RAD;
  j.shoulderZ = [-out, out];
  j.shoulderX = [-18 * RAD * k, -18 * RAD * k];
  j.elbow = [-(22 + 18 * k) * RAD, -(22 + 18 * k) * RAD];
  // legs: knees forward, shins tilted, feet flat on the floor
  j.thigh = [-t, -t];
  j.knee = [t + s, t + s];
  j.ankle = [-s, -s];
  return j;
}

/** Down on the floor after a miss: knees up, propped on the hands behind, head hanging. */
export function sitting(): Joints {
  const j = standing();
  j.hipY = 0.2;
  j.hipZ = -0.1;
  j.pelvisX = -24 * RAD;
  j.chestX = 14 * RAD;
  j.neckX = 22 * RAD;
  j.headY = 0;
  j.shoulderX = [50 * RAD, 50 * RAD];
  j.shoulderZ = [-24 * RAD, 24 * RAD];
  j.elbow = [-6 * RAD, -6 * RAD];
  // thighs up and forward, shins back down to the feet
  const t = 68 * RAD;
  const s = 10 * RAD;
  j.thigh = [-t, -t];
  j.knee = [t + s, t + s];
  j.ankle = [-s, -s];
  return j;
}

/** Arms up, straight: through the bar. */
export function cheering(): Joints {
  const j = standing();
  j.shoulderZ = [-150 * RAD, 150 * RAD];
  j.shoulderX = [-10 * RAD, -10 * RAD];
  j.elbow = [-30 * RAD, -30 * RAD];
  j.chestX = -4 * RAD;
  j.neckX = -10 * RAD;
  return j;
}

/** `a` toward `b` by `u` (0..1), every joint. */
export function mix(a: Joints, b: Joints, u: number): Joints {
  const o = { ...a } as Joints;
  for (const k of JOINT_KEYS) o[k] = a[k] + (b[k] - a[k]) * u;
  for (const k of PAIR_KEYS) o[k] = [a[k][0] + (b[k][0] - a[k][0]) * u, a[k][1] + (b[k][1] - a[k][1]) * u];
  return o;
}

/** `cur` eased toward `target`, frame-rate independent (`lambda` per second). */
export function approach(cur: Joints, target: Joints, lambda: number, dt: number) {
  const u = 1 - Math.exp(-lambda * dt);
  for (const k of JOINT_KEYS) cur[k] += (target[k] - cur[k]) * u;
  for (const k of PAIR_KEYS) {
    cur[k][0] += (target[k][0] - cur[k][0]) * u;
    cur[k][1] += (target[k][1] - cur[k][1]) * u;
  }
}

const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const easeInOut = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

/** Where the figure stands: behind the bar before it, in front of it once through, back from it after a miss. */
export const Z_BEFORE = -0.3;
const Z_AFTER = 0.62;
const Z_FALLEN = -0.5;

/**
 * The pose the body is heading for, from the game's state and how long it has been in it. `phase`
 * is this figure's own offset, so a row of them never moves in step.
 */
export function targetFor(st: FigureState, since: number, t: number, phase: number): Joints {
  switch (st.pose) {
    case "lean": {
      const j = leaning(st.lean, st.side);
      j.z = Z_BEFORE;
      // a shuffle on the spot while leaning: the weight goes from foot to foot
      const w = Math.sin(t * 2.6 + phase) * Math.min(1, st.lean / 30);
      j.thigh[0] += w * 3 * RAD;
      j.thigh[1] -= w * 3 * RAD;
      j.x = w * 0.012;
      return j;
    }
    case "pass": {
      // under and through: still leaning while moving forward, then up with a cheer
      if (since < 0.75) {
        const j = leaning(st.lean, st.side);
        const u = easeInOut(clamp01(since / 0.75));
        j.z = Z_BEFORE + (Z_AFTER - Z_BEFORE) * u;
        // stepping through
        const step = Math.sin(since * 11) * 9 * RAD;
        j.thigh[0] += step;
        j.thigh[1] -= step;
        j.knee[0] -= Math.max(0, step) * 1.2;
        j.knee[1] -= Math.max(0, -step) * 1.2;
        return j;
      }
      const j = cheering();
      j.z = Z_AFTER;
      const u = since - 0.75;
      // a little hop as the arms go up, then waving
      j.hipY += Math.max(0, Math.sin(Math.min(u, 0.45) * Math.PI / 0.45)) * 0.07;
      const wave = Math.sin(u * 5.5 + phase) * 14 * RAD;
      j.shoulderZ = [j.shoulderZ[0] - wave, j.shoulderZ[1] - wave];
      j.headY = Math.sin(u * 2.2 + phase) * 10 * RAD;
      return j;
    }
    case "fail": {
      // the bar catches the chest: a jolt forward, a stumble back, down on the floor
      if (since < 0.14) {
        const j = leaning(st.lean, st.side);
        j.z = Z_BEFORE;
        j.chestX += 14 * RAD * easeOut(clamp01(since / 0.14));
        return j;
      }
      const u = clamp01((since - 0.14) / 0.6);
      const j = mix(leaning(Math.max(12, st.lean * 0.5), 0), sitting(), easeInOut(u));
      j.z = Z_BEFORE + (Z_FALLEN - Z_BEFORE) * easeOut(u);
      if (since > 0.74) {
        // sitting there: a slow sag, a shake of the head
        const s = since - 0.74;
        j.neckX += Math.min(1, s / 1.5) * 8 * RAD;
        j.headY = Math.sin(s * 3.1) * Math.max(0, 1 - s / 2.2) * 9 * RAD;
      }
      return j;
    }
    default: {
      const j = standing();
      j.z = Z_BEFORE;
      // weight from foot to foot, a breath, a look around
      const w = Math.sin(t * 1.3 + phase);
      j.x = w * 0.018;
      j.chestZ = -w * 1.6 * RAD;
      j.pelvisX = Math.sin(t * 2.1 + phase) * 0.6 * RAD;
      j.shoulderX = [Math.sin(t * 1.3 + phase) * 4 * RAD, -Math.sin(t * 1.3 + phase) * 4 * RAD];
      j.headY = Math.sin(t * 0.7 + phase * 1.7) * 9 * RAD;
      return j;
    }
  }
}

/** One built figure: its root in the scene, and the joints to pose it by. */
export type Rig = {
  root: THREE.Group;
  pelvis: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulders: [THREE.Group, THREE.Group];
  elbows: [THREE.Group, THREE.Group];
  thighs: [THREE.Group, THREE.Group];
  knees: [THREE.Group, THREE.Group];
  ankles: [THREE.Group, THREE.Group];
  chestMesh: THREE.Mesh;
  shadow: THREE.Mesh;
  meshes: THREE.Mesh[];
};

/** The geometries every figure shares. */
export type Parts = ReturnType<typeof makeParts>;

export function makeParts() {
  const cap = (r: number, len: number, seg = 10) => new THREE.CapsuleGeometry(r, len, 4, seg);
  const chest = cap(0.165, 0.3, 12);
  chest.scale(1.08, 1, 0.68);
  const pelvis = cap(0.1, 0.17, 10);
  pelvis.rotateZ(Math.PI / 2);
  pelvis.scale(1, 1, 0.85);
  const head = new THREE.SphereGeometry(0.115, 18, 14);
  head.scale(0.94, 1.06, 1);
  // hair: a cap over the back and top of the head
  const hair = new THREE.SphereGeometry(0.123, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58);
  hair.scale(0.96, 1, 1.02);
  hair.rotateX(-0.55);
  hair.translate(0, 0.012, -0.012);
  const eye = new THREE.SphereGeometry(0.014, 8, 6);
  const eyes = eye.clone().translate(-0.038, 0.012, 0.106);
  const eyeR = eye.clone().translate(0.038, 0.012, 0.106);
  eye.dispose();
  const foot = new THREE.CapsuleGeometry(0.045, 0.14, 3, 8);
  foot.rotateX(Math.PI / 2);
  foot.scale(1.05, 0.72, 1);
  foot.translate(0, 0.045, 0.05);
  return {
    chest,
    pelvis,
    head,
    hair,
    eyes: mergeTwo(eyes, eyeR),
    neck: new THREE.CylinderGeometry(0.042, 0.048, 0.09, 10),
    upperArm: cap(0.047, 0.24),
    forearm: cap(0.042, 0.23),
    hand: new THREE.SphereGeometry(0.048, 10, 8),
    thigh: cap(0.072, THIGH - 0.1),
    shin: cap(0.056, SHIN - 0.08),
    foot,
    shadow: new THREE.PlaneGeometry(0.62, 0.62),
    dispose() {
      for (const g of [this.chest, this.pelvis, this.head, this.hair, this.eyes, this.neck, this.upperArm, this.forearm, this.hand, this.thigh, this.shin, this.foot, this.shadow]) g.dispose();
    },
  };
}

/** Two small geometries as one (the eyes), without pulling in the utils. */
function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const pa = a.getAttribute("position");
  const pb = b.getAttribute("position");
  const na = a.getAttribute("normal");
  const nb = b.getAttribute("normal");
  const pos = new Float32Array((pa.count + pb.count) * 3);
  const nor = new Float32Array((pa.count + pb.count) * 3);
  pos.set(pa.array as Float32Array, 0);
  pos.set(pb.array as Float32Array, pa.count * 3);
  nor.set(na.array as Float32Array, 0);
  nor.set(nb.array as Float32Array, pa.count * 3);
  const ia = a.index!.array;
  const ib = b.index!.array;
  const idx = new Uint16Array(ia.length + ib.length);
  idx.set(ia, 0);
  for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + pa.count;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  a.dispose();
  b.dispose();
  return g;
}

/**
 * Build one figure. `shadowMat` is the soft blob under its feet (shared texture, its own opacity).
 * Meshes: 15 (the eyes are one), all low-poly, so a crowd stays cheap.
 */
export function buildFigure(parts: Parts, w: Wardrobe, shadowMat: THREE.Material): Rig {
  const meshes: THREE.Mesh[] = [];
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, y = 0, z = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(0, y, z);
    o.matrixAutoUpdate = true;
    parent.add(o);
    meshes.push(o);
    return o;
  };
  const joint = (parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const root = new THREE.Group();
  const pelvis = joint(root, 0, hips(0, 0).y);
  mesh(parts.pelvis, w.dark, pelvis, 0.02);
  const chest = joint(pelvis, 0, 0.08);
  const chestMesh = mesh(parts.chest, w.shirt, chest, 0.26);
  const neck = joint(chest, 0, CHEST - 0.02);
  mesh(parts.neck, w.skin, neck, 0.04);
  const head = joint(neck, 0, 0.09);
  mesh(parts.head, w.skin, head, 0.1);
  mesh(parts.hair, w.dark, head, 0.1);
  mesh(parts.eyes, w.dark, head, 0.1);
  const side = (sgn: -1 | 1): [THREE.Group, THREE.Group, THREE.Group, THREE.Group, THREE.Group] => {
    const shoulder = joint(chest, sgn * 0.215, CHEST - 0.1);
    mesh(parts.upperArm, w.shirt, shoulder, -0.13);
    const elbow = joint(shoulder, 0, -0.26);
    mesh(parts.forearm, w.skin, elbow, -0.12);
    mesh(parts.hand, w.skin, elbow, -0.26);
    const thigh = joint(pelvis, sgn * 0.1, -0.02);
    mesh(parts.thigh, w.dark, thigh, -THIGH / 2);
    const knee = joint(thigh, 0, -THIGH);
    mesh(parts.shin, w.dark, knee, -SHIN / 2);
    const ankle = joint(knee, 0, -SHIN);
    mesh(parts.foot, w.shoe, ankle, -ANKLE + 0.01);
    return [shoulder, elbow, thigh, knee, ankle];
  };
  const L = side(-1);
  const R = side(1);
  const shadow = new THREE.Mesh(parts.shadow, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  shadow.renderOrder = -1;
  root.add(shadow);
  return { root, pelvis, chest, neck, head, shoulders: [L[0], R[0]], elbows: [L[1], R[1]], thighs: [L[2], R[2]], knees: [L[3], R[3]], ankles: [L[4], R[4]], chestMesh, shadow, meshes };
}

/**
 * Put the rig in this pose (where it stands, `x` and `z`, is the world's to place). `breath` (0..1)
 * swells the chest. `tremor` (−1..1, the world's noise) is the strain of a deep lean: the chest, arms
 * and head shake with it and the hips dip a hair, the feet stay planted.
 */
export function applyJoints(rig: Rig, j: Joints, breath: number, tremor = 0) {
  rig.root.scale.setScalar(j.scale);
  rig.pelvis.position.set(0, j.hipY - Math.abs(tremor) * 0.004, j.hipZ);
  rig.pelvis.rotation.x = j.pelvisX;
  rig.chest.rotation.set(j.chestX + tremor * 1.8 * RAD, 0, j.chestZ + tremor * 0.8 * RAD);
  rig.chestMesh.scale.set(1 + breath * 0.025, 1 + breath * 0.012, 1 + breath * 0.04);
  rig.neck.rotation.x = j.neckX + tremor * 1.2 * RAD;
  rig.head.rotation.set(0, j.headY, tremor * 0.9 * RAD);
  for (let i = 0; i < 2; i++) {
    rig.shoulders[i].rotation.set(j.shoulderX[i] + tremor * 1.5 * RAD, 0, j.shoulderZ[i] + (i ? -1 : 1) * tremor * 2.6 * RAD);
    rig.elbows[i].rotation.x = j.elbow[i];
    rig.thighs[i].rotation.x = j.thigh[i];
    rig.knees[i].rotation.x = j.knee[i];
    rig.ankles[i].rotation.x = j.ankle[i];
  }
  // the blob under the feet: bigger and fainter the higher the hips
  const lift = Math.max(0, Math.min(1, (j.hipY - 0.2) / 0.8));
  rig.shadow.scale.setScalar((0.75 + 0.45 * lift) * j.scale);
  rig.shadow.position.z = j.hipZ * 0.5 + 0.02;
  (rig.shadow.material as THREE.MeshBasicMaterial).opacity = 0.5 - 0.22 * lift;
}

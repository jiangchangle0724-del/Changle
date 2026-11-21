/**
 * Her feet when one dance hands over to the next (Nov 21; Steve: 换舞时脚滑). The page blends the two
 * dances' turns for a moment (Dancer3D's BLEND_S), and blended, her feet would skate from where the
 * last dance had them to where the new one does. Instead they stay where they stand, then step, one
 * and then the other, a little off the floor, to where the new dance has them: each leg reaching its
 * ankle there (two bones, the knee bending the way it bends), the foot turned as the dance turns it.
 */
import * as THREE from "three";

type Leg = { up: THREE.Object3D; knee: THREE.Object3D; foot: THREE.Object3D; len: number };
/** `start`: when through the hand-over each foot steps (sooner when her hips go further than her leg reaches) */
export type Feet = { legs: Leg[]; was: THREE.Vector3[] | null; plant: THREE.Vector3[] | null; first: number; start: number[]; blend: object | null };

/** Her legs' bones (null when her skeleton hasn't them). */
export function feetOf(root: THREE.Object3D): Feet | null {
  const legs: Leg[] = [];
  for (const s of ["Left", "Right"]) {
    const up = root.getObjectByName(`${s}UpLeg`), knee = root.getObjectByName(`${s}Leg`), foot = root.getObjectByName(`${s}Foot`);
    if (!up || !knee || !foot) return null;
    legs.push({ up, knee, foot, len: pos(up).distanceTo(pos(knee)) + pos(knee).distanceTo(pos(foot)) });
  }
  return { legs, was: null, plant: null, first: 0, start: [0.05, 0.5], blend: null };
}

const pos = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

function setWorldTurn(o: THREE.Object3D, w: THREE.Quaternion) {
  const p = o.parent ? o.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  o.quaternion.copy(p.invert().multiply(w));
  o.updateMatrixWorld(true);
}

function turnToward(o: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  setWorldTurn(o, new THREE.Quaternion().setFromUnitVectors(from, to).multiply(o.getWorldQuaternion(new THREE.Quaternion())));
}

/** One leg reaching its ankle to `to` (world): the knee bending as it bends now, the foot turned as it was. */
export function reach(l: Leg, to: THREE.Vector3) {
  const hip = pos(l.up), kn = pos(l.knee), an = pos(l.foot);
  const footTurn = l.foot.getWorldQuaternion(new THREE.Quaternion());
  const a = kn.distanceTo(hip), b = an.distanceTo(kn);
  const dir = to.clone().sub(hip);
  const d = Math.min(Math.max(dir.length(), 1e-4), (a + b) * 0.999);
  dir.normalize();
  const along = (a * a - b * b + d * d) / (2 * d);
  const pole = kn.clone().sub(hip);
  pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
  if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1);
  pole.normalize();
  const knee = hip.clone().addScaledVector(dir, along).addScaledVector(pole, Math.sqrt(Math.max(0, a * a - along * along)));
  turnToward(l.up, kn.clone().sub(hip).normalize(), knee.clone().sub(hip).normalize());
  const kn2 = pos(l.knee);
  turnToward(l.knee, pos(l.foot).sub(kn2).normalize(), hip.clone().addScaledVector(dir, d).sub(kn2).normalize());
  setWorldTurn(l.foot, footTurn);
}

/**
 * After the page has posed her (her root where it stands): `blend` the hand-over under way (any object,
 * a new one for each), `k` how far through it (0 to 1, not eased), null when none is.
 */
export function plantFeet(f: Feet, blend: object | null, k: number) {
  const now = f.legs.map((l) => pos(l.foot));
  if (blend && blend !== f.blend && f.was) {
    f.plant = f.was.map((v) => v.clone());
    // (the foot further from where the new dance has it steps first)
    f.first = now[1].distanceTo(f.plant[1]) > now[0].distanceTo(f.plant[0]) ? 1 : 0;
    f.start = f.first ? [0.5, 0.05] : [0.05, 0.5];
  }
  f.blend = blend;
  if (blend && f.plant && k < 1) {
    for (let i = 0; i < 2; i++) {
      // (out of her leg's reach where it stands: it steps now)
      if (k < f.start[i] && pos(f.legs[i].up).distanceTo(f.plant[i]) > f.legs[i].len * 0.995) f.start[i] = k;
      const p = Math.min(1, Math.max(0, (k - f.start[i]) / Math.max(1e-3, Math.min(0.45, 1 - f.start[i]))));
      const e = p * p * (3 - 2 * p);
      const to = f.plant[i].clone().lerp(now[i], e);
      to.y += Math.sin(Math.PI * p) * Math.min(0.05, now[i].distanceTo(f.plant[i]) * 0.5);
      reach(f.legs[i], to);
    }
  } else f.plant = null;
  f.was = f.legs.map((l) => pos(l.foot));
}

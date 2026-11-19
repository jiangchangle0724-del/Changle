/**
 * Her hair and her skirt swinging as she moves (Steve on Nov 18: "头发，看起来还有点僵硬…跳动时裙子和衣服的
 * 物理逻辑惯性"): the bones site/scripts/dj-dancer/real/springs.py gave them, swung by springs the way
 * three-vrm's spring bones are (each bone's tip carried on by how it was moving, pulled back towards
 * where it rests on her, pulled down a little, kept its length, and pushed out of the round shapes on
 * her bones: her head, neck, back and shoulders for the hair, her thighs and hips for a skirt). The
 * dance sets her other bones first; these follow, a sixtieth of a second at a time.
 */
import * as THREE from "three";

type V3 = [number, number, number];
/** What the model's file says (its scene's extras): build_glb.mjs writes it. */
export type SpringData = {
  /** each group's bones (`k`: its own stiffness, times the group's), how they swing, at most how far
   *  from rest (`max`, radians), and the shapes they're kept off */
  groups: { name: string; bones: { name: string; tail: V3; k?: number }[]; stiffness: number; gravity: number; drag: number; hit: number; max?: number; colliders: string[] }[];
  colliders: Record<string, { bone: string; a: V3; b?: V3; r: number }>;
};

type Collider = { bone: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3 | null; r: number; wa: THREE.Vector3; wb: THREE.Vector3 };
type Joint = {
  bone: THREE.Object3D;
  /** where it starts, from its parent (its rest: never turned) */
  at: THREE.Vector3;
  /** its tip, from where it starts, at rest */
  tail: THREE.Vector3;
  len: number;
  cur: THREE.Vector3;
  prev: THREE.Vector3;
  stiffness: number;
  gravity: number;
  drag: number;
  hit: number;
  /** the cosine of the most it swings from rest */
  maxCos: number;
  colliders: Collider[];
};

const STEP = 1 / 60;
const DOWN = new THREE.Vector3(0, -1, 0);
const _pw = new THREE.Matrix4();
const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _head = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _next = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

/** The nearest point to `p` on the segment a-b. */
function closest(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, out: THREE.Vector3) {
  out.subVectors(b, a);
  const l2 = out.lengthSq();
  const t = l2 > 1e-12 ? Math.min(1, Math.max(0, _v.subVectors(p, a).dot(out) / l2)) : 0;
  return out.multiplyScalar(t).add(a);
}

export type Springs = {
  /** after the dance has posed her: the springs move on `dt` seconds (her world matrices are worked out here) */
  update(root: THREE.Object3D, dt: number): void;
  /** the swinging bones back where they rest (a new model, or she was away) */
  reset(): void;
};

export function makeSprings(data: SpringData | undefined, bones: Map<string, THREE.Object3D>): Springs | null {
  if (!data?.groups?.length) return null;
  const cols = new Map<string, Collider>();
  for (const [k, c] of Object.entries(data.colliders)) {
    const bone = bones.get(c.bone);
    if (!bone) continue;
    cols.set(k, { bone, a: new THREE.Vector3(...c.a), b: c.b ? new THREE.Vector3(...c.b) : null, r: c.r, wa: new THREE.Vector3(), wb: new THREE.Vector3() });
  }
  const joints: Joint[] = [];
  for (const g of data.groups)
    for (const b of g.bones) {
      const bone = bones.get(b.name);
      if (!bone || !bone.parent) continue;
      const tail = new THREE.Vector3(...b.tail);
      joints.push({
        bone,
        at: bone.position.clone(),
        tail,
        len: tail.length(),
        cur: new THREE.Vector3(),
        prev: new THREE.Vector3(),
        stiffness: g.stiffness * (b.k ?? 1),
        gravity: g.gravity,
        drag: g.drag,
        hit: g.hit,
        maxCos: Math.cos(g.max ?? Math.PI),
        colliders: g.colliders.map((k) => cols.get(k)).filter((c): c is Collider => !!c),
      });
    }
  if (!joints.length) return null;
  const used = [...new Set(joints.flatMap((j) => j.colliders))];
  let fresh = true;
  let left = 0;

  /** one joint's rest, now: where it starts and where its tip would be, in the world */
  const rest = (j: Joint) => {
    _pw.copy(j.bone.parent!.matrixWorld);
    _head.copy(j.at).applyMatrix4(_pw);
    _pw.decompose(_v, _pq, _s);
    _rest.copy(j.tail).applyQuaternion(_pq).add(_head);
  };
  /** the joint turned so its tip points at `cur` (its parent's turn, then the swing) */
  const aim = (j: Joint) => {
    const from = _v.subVectors(_rest, _head).normalize();
    const to = _next.subVectors(j.cur, _head).normalize();
    _q.setFromUnitVectors(from, to);
    _pqi.copy(_pq).invert();
    j.bone.quaternion.copy(_pqi).multiply(_q).multiply(_pq);
    j.bone.position.copy(j.at);
    j.bone.updateMatrix();
    j.bone.matrixWorld.multiplyMatrices(j.bone.parent!.matrixWorld, j.bone.matrix);
  };

  const step = (h: number) => {
    for (const c of used) {
      c.wa.copy(c.a).applyMatrix4(c.bone.matrixWorld);
      if (c.b) c.wb.copy(c.b).applyMatrix4(c.bone.matrixWorld);
    }
    for (const j of joints) {
      rest(j);
      if (fresh) {
        j.cur.copy(_rest);
        j.prev.copy(_rest);
      }
      // carried on, pulled back towards its rest, and down
      _next.copy(j.cur).sub(j.prev).multiplyScalar(1 - j.drag).add(j.cur);
      _next.addScaledVector(_v.subVectors(_rest, _head).normalize(), j.stiffness * h);
      _next.addScaledVector(DOWN, j.gravity * h);
      // its length kept, and never further from rest than it may swing
      _next.sub(_head).setLength(j.len);
      const restDir = _v.subVectors(_rest, _head).normalize();
      const c = _next.dot(restDir) / j.len;
      if (c < j.maxCos) {
        // (back along the arc to the limit: what's left of it across the rest direction, shortened)
        const side = _s.copy(_next).addScaledVector(restDir, -_next.dot(restDir));
        const sl = side.length();
        const sin = Math.sqrt(1 - j.maxCos * j.maxCos);
        _next.copy(restDir).multiplyScalar(j.maxCos * j.len);
        if (sl > 1e-9) _next.addScaledVector(side, (sin * j.len) / sl);
      }
      _next.add(_head);
      // out of her (pushed out of one shape into another next to it: again, a few times)
      for (let pass = 0; pass < 3; pass++) {
        let pushed = false;
        for (const c of j.colliders) {
          const at = c.b ? closest(_next, c.wa, c.wb, _s) : _s.copy(c.wa);
          const d = _v.subVectors(_next, at);
          const min = c.r + j.hit;
          const l = d.length();
          if (l < min) {
            _next.copy(at).addScaledVector(l > 1e-6 ? d.divideScalar(l) : DOWN, min);
            pushed = true;
          }
        }
        if (!pushed) break;
        _next.sub(_head).setLength(j.len).add(_head);
      }
      j.prev.copy(j.cur);
      j.cur.copy(_next);
      aim(j);
    }
    fresh = false;
  };

  return {
    update(root, dt) {
      root.updateMatrixWorld(true);
      // (a long gap, a tab put away: she starts again from rest rather than flinging her hair)
      if (!(dt > 0) || dt > 0.25) {
        fresh = true;
        left = 0;
      }
      left = Math.min(left + Math.max(0, Math.min(dt, 0.25)), STEP * 4);
      if (fresh) {
        step(STEP);
        return;
      }
      while (left >= STEP) {
        step(STEP);
        left -= STEP;
      }
      // (between steps: the joints as the last step left them)
      for (const j of joints) {
        rest(j);
        aim(j);
      }
    },
    reset() {
      fresh = true;
    },
  };
}

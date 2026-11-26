/**
 * Her hands kept out of her (Nov 25; Steve: "帮我查这个舞蹈，手会穿身体"). The dances were danced by other
 * bodies: on hers a hand went up to 15 cm into her hips or thighs (the dances learned from videos,
 * itsme and gnarly, most), a forearm into her waist. Her shape is read once from her model (bodyOf,
 * from her skin's bind, whatever pose she's in): around each bone of her trunk and thighs, how far her
 * skin is from it each way, slice by slice along it (a skirt as it hangs goes with her hips). Each
 * frame, after the dance has posed her (keepHands), an arm with its hand, forearm or elbow in that
 * shape, or nearer it than its own thickness, is turned out of it at the shoulder (or its forearm at
 * the elbow, about the elbow's hinge), as little as takes it out, softly: a hand comes to rest on her.
 */
import * as THREE from "three";

/** directions around a bone, and the slices' height (m) */
const A = 24;
const DY = 0.015;
/** how many slices each part rounds off over at its ends */
const ROUND = 2;
/** her trunk and thighs (and a skirt): what a hand mustn't go into */
// (not her head: her hair is soft, a hand can go in it)
const PARTS = ["Hips", "Spine", "Spine1", "Spine2", "LeftUpLeg", "RightUpLeg"];

type Part = { bone: THREE.Object3D; y0: number; n: number; cx: Float32Array; cz: Float32Array; r: Float32Array; inv: THREE.Matrix4 };
type Arm = {
  /** her upper arm, forearm and hand */
  up: THREE.Object3D; knee: THREE.Object3D; foot: THREE.Object3D;
  /** her hand's middle finger's bone, and her fingertip where it is on it */
  tip: THREE.Object3D; tipAt: THREE.Vector3;
  /** her elbow's hinge, on her upper arm (bending it the positive way brings her forearm forward) */
  hinge: THREE.Vector3;
};
export type Body = { parts: Part[]; arms: Arm[] };

/** Her shape and her arms, from her model at rest (whatever pose she's in now: her skin's bind). */
export function bodyOf(root: THREE.Object3D): Body | null {
  let mesh: THREE.SkinnedMesh | undefined;
  root.traverse((o) => {
    if (!mesh && (o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh;
  });
  if (!mesh) return null;
  const sk = mesh.skeleton;
  const idx = (n: string) => sk.bones.findIndex((b) => b.name === n);
  const g = mesh.geometry;
  const P = g.getAttribute("position");
  const SI = g.getAttribute("skinIndex");
  const SW = g.getAttribute("skinWeight");
  // each point of her skin goes with the bone that moves it most, and with that bone's part of her
  // (a skirt as it hangs at rest goes with her hips: a hand stays on it, not in it)
  const names = PARTS.filter((n) => idx(n) >= 0);
  const partOf = new Int8Array(sk.bones.length).fill(-1);
  names.forEach((n, j) => (partOf[idx(n)] = j));
  sk.bones.forEach((bone, i) => {
    if (/^Skirt\d/.test(bone.name) && idx("Hips") >= 0) partOf[i] = names.indexOf("Hips");
  });
  const inv = names.map((n) => sk.boneInverses[idx(n)]);
  const all: number[][] = names.map(() => []);
  const hand = new Set(["LeftHand", "LeftHandMiddle1", "RightHand", "RightHandMiddle1"].map(idx));
  const hands: number[] = [];
  const own = new Int16Array(P.count);
  const v3 = new THREE.Vector3();
  for (let v = 0; v < P.count; v++) {
    let best = -1;
    let w = 0;
    for (let c = 0; c < 4; c++) {
      const wc = SW.getComponent(v, c);
      if (wc > w) {
        w = wc;
        best = SI.getComponent(v, c);
      }
    }
    own[v] = best;
    if (hand.has(best)) hands.push(v);
    const j = best >= 0 ? partOf[best] : -1;
    if (j < 0) continue;
    v3.fromBufferAttribute(P, v).applyMatrix4(inv[j]);
    all[j].push(v3.x, v3.y, v3.z);
  }
  const parts: Part[] = [];
  for (let j = 0; j < names.length; j++) {
    const i = idx(names[j]);
    const pts = all[j];
    if (pts.length < 3 * 60) continue;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = 1; k < pts.length; k += 3) {
      y0 = Math.min(y0, pts[k]);
      y1 = Math.max(y1, pts[k]);
    }
    const n = Math.max(2, Math.ceil((y1 - y0) / DY) + 1);
    const cx = new Float32Array(n);
    const cz = new Float32Array(n);
    const r = new Float32Array(n * A);
    // (each slice with the points a slice above and below it: smoother; each point in the three slices it's near)
    const slices = (k: number, f: (s: number) => void) => {
      const at = (pts[k + 1] - y0) / DY;
      for (let s = Math.max(0, Math.ceil(at - 1)); s <= Math.min(n - 1, Math.floor(at + 1)); s++) f(s);
    };
    // each slice's middle, between its furthest points each way, eased with the slices beside it
    const has = new Uint8Array(n);
    const x0 = new Float32Array(n).fill(Infinity), x1 = new Float32Array(n).fill(-Infinity);
    const z0 = new Float32Array(n).fill(Infinity), z1 = new Float32Array(n).fill(-Infinity);
    for (let k = 0; k < pts.length; k += 3) slices(k, (s) => {
      x0[s] = Math.min(x0[s], pts[k]); x1[s] = Math.max(x1[s], pts[k]);
      z0[s] = Math.min(z0[s], pts[k + 2]); z1[s] = Math.max(z1[s], pts[k + 2]);
    });
    for (let s = 0; s < n; s++) if (x1[s] > x0[s]) {
      has[s] = 1;
      cx[s] = (x0[s] + x1[s]) / 2;
      cz[s] = (z0[s] + z1[s]) / 2;
    }
    const ease = (f: Float32Array) => {
      const g = f.slice();
      for (let s = 0; s < n; s++) if (has[s]) {
        const a = has[s - 1] ? s - 1 : s, b = has[s + 1] ? s + 1 : s;
        f[s] = (g[a] + 2 * g[s] + g[b]) / 4;
      }
    };
    ease(cx);
    ease(cz);
    for (let k = 0; k < pts.length; k += 3) slices(k, (s) => {
      const dx = pts[k] - cx[s], dz = pts[k + 2] - cz[s];
      const a = Math.min(A - 1, Math.floor(((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * A));
      r[s * A + a] = Math.max(r[s * A + a], Math.hypot(dx, dz));
    });
    for (let s = 0; s < n; s++) {
      if (!has[s]) continue;
      // (a direction no point of her fell in: between the ones on either side; a slice with too few, none)
      let filled = 0;
      for (let a = 0; a < A; a++) if (r[s * A + a] > 0) filled++;
      if (filled < A / 3) {
        r.fill(0, s * A, s * A + A);
        continue;
      }
      for (let a = 0; a < A; a++) if (!(r[s * A + a] > 0)) {
        let lo = a, hi = a;
        while (!(r[s * A + ((lo + A) % A)] > 0)) lo--;
        while (!(r[s * A + (hi % A)] > 0)) hi++;
        const t = (a - lo) / (hi - lo);
        r[s * A + a] = r[s * A + ((lo + A) % A)] * (1 - t) + r[s * A + (hi % A)] * t;
      }
      // (eased round, a little out for what easing takes off her bumps)
      const g = r.slice(s * A, s * A + A);
      for (let a = 0; a < A; a++) r[s * A + a] = (g[(a + A - 1) % A] + 2 * g[a] + g[(a + 1) % A]) / 4 + 0.003;
    }
    parts.push({ bone: sk.bones[i], y0, n, cx, cz, r, inv: new THREE.Matrix4() });
  }
  const arms: Arm[] = [];
  for (const s of ["Left", "Right"]) {
    const [iu, ik, ih, it] = ["Arm", "ForeArm", "Hand", "HandMiddle1"].map((b) => idx(s + b));
    if (Math.min(iu, ik, ih, it) < 0) return null;
    const at = (i: number) => v3.set(0, 0, 0).applyMatrix4(new THREE.Matrix4().copy(sk.boneInverses[i]).invert()).clone();
    const wrist = at(ih), knuckle = at(it);
    const along = knuckle.clone().sub(wrist).normalize();
    // her fingertip: the furthest point of her fingers along her hand
    let far = 0;
    const tip = knuckle.clone();
    for (const v of hands) if (own[v] === it || own[v] === ih) {
      const d = v3.fromBufferAttribute(P, v).sub(knuckle).dot(along);
      if (d > far) {
        far = d;
        tip.copy(knuckle).addScaledVector(along, d);
      }
    }
    const up = sk.bones[iu], knee = sk.bones[ik], foot = sk.bones[ih];
    // (her bones' rest turns are none: her forearm's way at rest is her hand's place on it)
    const hinge = foot.position.clone().normalize().cross(new THREE.Vector3(0, 0, 1)).normalize();
    arms.push({ up, knee, foot, tip: sk.bones[it], tipAt: tip.applyMatrix4(sk.boneInverses[it]), hinge });
  }
  return { parts, arms };
}

const _l = new THREE.Vector3();
/** the part depthAt last found deepest (for the checks' words) */
let deepest = "";

/** Her parts' places as she stands now (after the dance has posed her and her matrices are worked out). */
function posed(b: Body) {
  for (const p of b.parts) p.inv.copy(p.bone.matrixWorld).invert();
}

/**
 * How deep `p` (world) is in her: positive inside her skin, or nearer it than `rad` (the thing's own
 * thickness, m), negative clear of it; `out` set to the way out (world, a unit vector).
 */
function depthAt(b: Body, p: THREE.Vector3, rad: number, out: THREE.Vector3): number {
  let best = -Infinity;
  for (const part of b.parts) {
    _l.copy(p).applyMatrix4(part.inv);
    const fs = (_l.y - part.y0) / DY;
    if (fs < 0 || fs > part.n - 1) continue;
    const s0 = Math.min(part.n - 2, Math.floor(fs));
    const ts = fs - s0;
    const s1 = s0 + 1;
    if (!(part.r[s0 * A] > 0) || !(part.r[s1 * A] > 0)) continue;
    const cx = part.cx[s0] * (1 - ts) + part.cx[s1] * ts;
    const cz = part.cz[s0] * (1 - ts) + part.cz[s1] * ts;
    const dx = _l.x - cx, dz = _l.z - cz;
    const rho = Math.hypot(dx, dz);
    const fa = ((Math.atan2(dx, dz) + Math.PI) / (2 * Math.PI)) * A - 0.5;
    const af = Math.floor(fa);
    const ta = fa - af;
    const a0 = ((af % A) + A) % A, a1 = (a0 + 1) % A;
    // (rounded off at its ends, so nothing coming from above or below it jumps out)
    const end = Math.min(fs, part.n - 1 - fs) / ROUND;
    const R = ((part.r[s0 * A + a0] * (1 - ta) + part.r[s0 * A + a1] * ta) * (1 - ts) + (part.r[s1 * A + a0] * (1 - ta) + part.r[s1 * A + a1] * ta) * ts) * (end >= 1 ? 1 : Math.sqrt(1 - (1 - end) * (1 - end)));
    const d = R + rad - rho;
    if (d > best) {
      best = d;
      deepest = part.bone.name;
      if (rho > 1e-6) out.set(dx, 0, dz).transformDirection(part.bone.matrixWorld);
      else out.set(0, 0, 1).transformDirection(part.bone.matrixWorld);
    }
  }
  return best;
}

/** Along one arm, from the elbow to the fingertip: each place, how far along it is and how thick there (m). */
const ALONG: readonly [number, number][] = [[0, 0.022], [0.5, 0.03], [1, 0.024], [1.5, 0.016], [2, 0.012], [2.6, 0.008]];
const _e = new THREE.Vector3(), _w = new THREE.Vector3(), _k = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();

/** One arm's place `i` along ALONG (world; 0 her elbow, 1 mid forearm ... 5 her fingertip). */
function place(arm: Arm, i: number, to: THREE.Vector3): THREE.Vector3 {
  arm.knee.getWorldPosition(_e);
  arm.foot.getWorldPosition(_w);
  arm.tip.getWorldPosition(_k);
  _t.copy(arm.tipAt).applyMatrix4(arm.tip.matrixWorld);
  const f = ALONG[i][0];
  // (0 to 1 elbow to wrist, 1 to 2 wrist to knuckles, 2 to 3 knuckles to fingertip, scaled to fit)
  if (f <= 1) return to.copy(_e).lerp(_w, f);
  if (f <= 2) return to.copy(_w).lerp(_k, f - 1);
  return to.copy(_k).lerp(_t, Math.min(1, (f - 2) / 0.6));
}

const PLACES = ["elbow", "forearm", "wrist", "palm", "knuckles", "fingertip"];

/**
 * The deepest any of her hands or forearms goes in her now (m; 0 clear), and where ("Left fingertip in
 * Hips"): what the checks measure.
 */
export function handDepth(b: Body): { depth: number; where: string } {
  posed(b);
  let depth = 0;
  let where = "";
  b.arms.forEach((arm, s) => {
    for (let i = 0; i < ALONG.length; i++) {
      const d = depthAt(b, place(arm, i, _p), ALONG[i][1], _n);
      if (d > depth) {
        depth = d;
        where = `${s ? "Right" : "Left"} ${PLACES[i]} in ${deepest}`;
      }
    }
  });
  return { depth, where };
}

const _r = new THREE.Vector3(), _v = new THREE.Vector3();
const _s = new THREE.Vector3(), _a = new THREE.Vector3(), _dir = new THREE.Vector3(), _to = new THREE.Vector3(), _h = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qk = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _keep = new THREE.Quaternion();
const ONE = new THREE.Quaternion();
/** how much of a turn each try takes: as far as it should, half, twice, three times, a quarter */
const TRIES = [1, 0.5, 2, 3, 0.25];

/** How far a place `d` deep in her (or that much nearer her than its thickness) is moved out: softly, so a hand comes to rest on her. */
function push(d: number): number {
  const gap = -d;
  const s = 0.01;
  if (gap >= s) return 0;
  return s * Math.exp(gap / s - 1) - gap;
}

/**
 * How far the arm's place deepest in her has to go out (m, 0 none), that place in `_a` (its index
 * returned in `scanned`) and in `_dir` the way out of her for all its places in her, the deeper the more.
 */
let scanned = -1;
function scan(b: Body, arm: Arm): number {
  let worst = 0;
  scanned = -1;
  _dir.set(0, 0, 0);
  for (let i = 0; i < ALONG.length; i++) {
    place(arm, i, _p);
    const d = push(depthAt(b, _p, ALONG[i][1], _n));
    if (d <= 1e-5) continue;
    _dir.addScaledVector(_n, d);
    if (d > worst) {
      worst = d;
      scanned = i;
      _a.copy(_p);
    }
  }
  if (worst > 0) _dir.normalize();
  return worst;
}

/** `o` turned by `q` more, in the world. */
function turnBy(o: THREE.Object3D, q: THREE.Quaternion) {
  o.parent!.getWorldQuaternion(_pq);
  o.getWorldQuaternion(_wq);
  o.quaternion.copy(_pq.invert().multiply(_qk.copy(q).multiply(_wq)));
  o.updateMatrixWorld(true);
}

/** How far her elbow bends (the sine of it about its hinge: below 0, bent the wrong way). */
function bend(arm: Arm): number {
  arm.up.getWorldPosition(_s);
  arm.knee.getWorldPosition(_e);
  arm.foot.getWorldPosition(_w);
  _u.subVectors(_e, _s).normalize();
  _f.subVectors(_w, _e).normalize();
  _h.copy(arm.hinge).applyQuaternion(arm.up.getWorldQuaternion(_wq));
  return _u.cross(_f).dot(_h);
}

/**
 * After the dance has posed her and her matrices are worked out (her feet too: her thighs are where
 * they stand): each arm with its hand, forearm or elbow in her moved out, a few times over, the place
 * deepest in her each time: her whole arm turned at the shoulder, or, when that won't take it out, her
 * forearm at the elbow (about its hinge, never bending it back). A turn that would take any of it
 * further in is taken back and tried at half, twice, three times or a quarter of it.
 */
export function keepHands(b: Body) {
  posed(b);
  for (const arm of b.arms) {
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (const joint of [arm.up, arm.knee]) {
        // (where it's deepest in her now, and the way out)
        const worst = scan(b, arm);
        if (worst <= 1e-4 || (joint === arm.knee && scanned < 1)) break;
        joint.getWorldPosition(_s);
        if (joint === arm.up) {
          _r.subVectors(_a, _s);
          _to.copy(_a).addScaledVector(_dir, worst).sub(_s);
          _q.setFromUnitVectors(_r.normalize(), _to.normalize());
        } else {
          // (about her elbow's hinge, as far as moves the place that far out)
          _h.copy(arm.hinge).applyQuaternion(arm.up.getWorldQuaternion(_wq));
          const along = _v.crossVectors(_h, _r.subVectors(_a, _s)).dot(_dir);
          if (Math.abs(along) < 0.04) break;
          _q.setFromAxisAngle(_h, Math.max(-0.6, Math.min(0.6, worst / along)));
        }
        const was = joint === arm.knee ? bend(arm) : 0;
        _keep.copy(joint.quaternion);
        for (const k of TRIES) {
          turnBy(joint, k <= 1 ? _qk.copy(ONE).slerp(_q, k) : _qk.copy(_q).multiply(k > 2 ? _q : ONE).multiply(_q));
          const fine = joint !== arm.knee || bend(arm) >= Math.min(was, 0) - 0.02;
          if (fine && scan(b, arm) < worst - 1e-5) {
            moved = true;
            break;
          }
          joint.quaternion.copy(_keep);
          joint.updateMatrixWorld(true);
        }
        if (moved) break;
      }
      if (!moved) break;
    }
  }
}

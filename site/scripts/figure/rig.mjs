// Poses a Mixamo-named skeleton (Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm,
// LeftForeArm, LeftHand, fingers, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, and Right…) from a
// pose written in the character's own terms: where the hands and feet go, which way the body bends,
// where the head looks. The same pose solves on any such skeleton, so moves written once carry over
// to another figure.
//
// Character space: metres, the ground at y = 0, x = the character's left, y = up, z = forward (the
// way it faces at rest). Angles in degrees.
import * as THREE from "three";

const deg = Math.PI / 180;
const v3 = (a) => (a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const qAxis = (axis, rad) => new THREE.Quaternion().setFromAxisAngle(axis.clone().normalize(), rad);
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** yaw (turn left +), pitch (lean forward +), roll (lean to its right +), about the character's own axes */
export function qBody(yaw = 0, pitch = 0, roll = 0) {
  return qAxis(Y, yaw * deg).multiply(qAxis(X, pitch * deg)).multiply(qAxis(Z, roll * deg));
}

/** the rotation taking a1 to b1, and a2 (as near as it can) to b2 */
function align(a1, a2, b1, b2) {
  const basis = (p, s) => {
    const x = p.clone().normalize();
    const y = s.clone().sub(x.clone().multiplyScalar(s.dot(x))).normalize();
    const z = x.clone().cross(y);
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const A = basis(a1, a2);
  const B = basis(b1, b2);
  const m = B.multiply(A.transpose());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** the twist part of q about axis (swing-twist split) */
function twistAngle(q, axis) {
  const r = new THREE.Vector3(q.x, q.y, q.z);
  const p = axis.clone().multiplyScalar(r.dot(axis));
  const t = new THREE.Quaternion(p.x, p.y, p.z, q.w);
  if (t.lengthSq() < 1e-12) return 0;
  t.normalize();
  let a = 2 * Math.atan2(new THREE.Vector3(t.x, t.y, t.z).dot(axis), t.w);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

const MAIN = {
  Hips: "Spine", Spine: "Spine1", Spine1: "Spine2", Spine2: "Neck", Neck: "Head",
  LeftShoulder: "LeftArm", LeftArm: "LeftForeArm", LeftForeArm: "LeftHand", LeftHand: "LeftHandMiddle1",
  RightShoulder: "RightArm", RightArm: "RightForeArm", RightForeArm: "RightHand", RightHand: "RightHandMiddle1",
  LeftUpLeg: "LeftLeg", LeftLeg: "LeftFoot", LeftFoot: "LeftToeBase", LeftToeBase: "LeftToe_End",
  RightUpLeg: "RightLeg", RightLeg: "RightFoot", RightFoot: "RightToeBase", RightToeBase: "RightToe_End",
};
const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];

/** Finger shapes: curl of joints 1, 2, 3 (into the palm +), spread of joint 1 (away from the middle finger +). */
export const HANDS = {
  relaxed: { Index: [8, 14, 8, 2], Middle: [12, 18, 10, 0], Ring: [16, 20, 12, -2], Pinky: [20, 24, 14, -4], Thumb: { across: 10, curl: [4, 8, 6], spread: 4 } },
  open: { Index: [0, 0, 0, 4], Middle: [0, 0, 0, 0], Ring: [0, 0, 0, -4], Pinky: [0, 0, 0, -8], Thumb: { across: 0, curl: [0, 0, 0], spread: 14 } },
  flat: { Index: [0, 0, 0, 0], Middle: [0, 0, 0, 0], Ring: [0, 0, 0, 0], Pinky: [0, 0, 0, 0], Thumb: { across: 6, curl: [0, 0, 0], spread: 0 } },
  fist: { Index: [80, 95, 60, 0], Middle: [85, 95, 60, 0], Ring: [88, 95, 60, 0], Pinky: [90, 95, 60, 0], Thumb: { across: 40, curl: [20, 40, 30], spread: -6 } },
  grip: { Index: [62, 70, 40, 0], Middle: [68, 72, 42, 0], Ring: [72, 72, 42, 0], Pinky: [76, 72, 42, 0], Thumb: { across: 34, curl: [14, 26, 20], spread: -4 } },
  cup: { Index: [38, 40, 24, 2], Middle: [42, 42, 26, 0], Ring: [46, 44, 26, -2], Pinky: [50, 46, 28, -4], Thumb: { across: 30, curl: [6, 14, 10], spread: 4 } },
  point: { Index: [0, 0, 0, 0], Middle: [85, 95, 60, 0], Ring: [88, 95, 60, 0], Pinky: [90, 95, 60, 0], Thumb: { across: 38, curl: [16, 34, 26], spread: -6 } },
  v: { Index: [0, 0, 0, 10], Middle: [0, 0, 0, -8], Ring: [88, 95, 60, 0], Pinky: [90, 95, 60, 0], Thumb: { across: 40, curl: [18, 36, 28], spread: -6 } },
  thumbsup: { Index: [80, 95, 60, 0], Middle: [85, 95, 60, 0], Ring: [88, 95, 60, 0], Pinky: [90, 95, 60, 0], Thumb: { across: -8, curl: [0, 0, 0], spread: 18 } },
  phone: { Index: [18, 24, 12, 0], Middle: [30, 30, 18, 0], Ring: [40, 36, 20, 0], Pinky: [48, 40, 22, 0], Thumb: { across: 20, curl: [4, 10, 6], spread: 6 } },
};

export class Rig {
  /** nodes: [{ name, parent, t: [x, y, z], r: [x, y, z, w] }], parents before children */
  constructor(nodes) {
    this.bones = new Map();
    this.order = [];
    for (const n of nodes) {
      const parent = n.parent ? this.bones.get(n.parent) ?? null : null;
      const t = v3(n.t);
      const r = new THREE.Quaternion(...n.r);
      const Wr = parent ? parent.Wr.clone().multiply(r) : r.clone();
      const Pr = parent ? parent.Pr.clone().add(t.clone().applyQuaternion(parent.Wr)) : t.clone();
      const b = { name: n.name, parent, t, r, Wr, Pr, off: parent ? Pr.clone().sub(parent.Pr) : new THREE.Vector3() };
      this.bones.set(n.name, b);
      this.order.push(b);
    }
    for (const b of this.order) {
      const main = this.bones.get(MAIN[b.name] ?? "") ?? this.order.find((c) => c.parent === b && /\d$/.test(c.name) && c.name.replace(/\d$/, "") === b.name.replace(/\d$/, ""));
      b.dir = main ? main.off.clone().normalize() : Y.clone().applyQuaternion(b.Wr);
      b.len = main ? main.off.length() : 0.05;
    }
    // each hand's rest frame: fingers along, palm normal out of the palm
    this.hand = {};
    for (const side of ["Left", "Right"]) {
      const h = this.bones.get(`${side}Hand`);
      const idx = this.bones.get(`${side}HandIndex1`).Pr.clone().sub(h.Pr);
      const pky = this.bones.get(`${side}HandPinky1`).Pr.clone().sub(h.Pr);
      const fingers = this.bones.get(`${side}HandMiddle1`).Pr.clone().sub(h.Pr).normalize();
      let palm = idx.clone().cross(pky).normalize();
      if (side === "Left") palm.negate();
      palm = palm.sub(fingers.clone().multiplyScalar(palm.dot(fingers))).normalize();
      // the thumb's side of the hand
      const thumbSide = this.bones.get(`${side}HandThumb1`).Pr.clone().sub(h.Pr);
      thumbSide.sub(fingers.clone().multiplyScalar(thumbSide.dot(fingers))).sub(palm.clone().multiplyScalar(thumbSide.dot(palm))).normalize();
      // where a held handle runs through the closed hand: along the fingers, out from the palm
      const grip = fingers.clone().multiplyScalar(0.085).add(palm.clone().multiplyScalar(0.032));
      this.hand[side] = { fingers, palm, thumbSide, grip };
    }
    // the elbows' and knees' hinge at rest
    this.hinge = {};
    for (const side of ["Left", "Right"]) {
      const s = side === "Left" ? 1 : -1;
      // a rest arm along ±x bends its forearm forward (+z) about -y (left) or +y (right)
      this.hinge[`${side}Arm`] = new THREE.Vector3(0, -s, 0);
      this.hinge[`${side}UpLeg`] = new THREE.Vector3(1, 0, 0);
    }
    this.eyes = this.bones.get("LeftEye") && this.bones.get("RightEye") ? this.bones.get("LeftEye").Pr.clone().add(this.bones.get("RightEye").Pr).multiplyScalar(0.5) : this.bones.get("Head").Pr.clone().add(new THREE.Vector3(0, 0.09, 0.08));
  }

  handShape(h) {
    return typeof h === "string" ? HANDS[h] : h;
  }

  /** Solves a pose: returns { local: Map(name → Quaternion), hips: Vector3 (the Hips translation) } and keeps the world state for drawing and checks. */
  solve(pose) {
    const D = new Map();
    const P = new Map();
    const local = new Map();
    const E = new Map();
    const get = (n) => this.bones.get(n);
    const setE = (b, e) => {
      const dp = b.parent ? D.get(b.parent.name) : new THREE.Quaternion();
      const d = dp.clone().multiply(e);
      D.set(b.name, d);
      const p = b.parent ? P.get(b.parent.name).clone().add(b.off.clone().applyQuaternion(dp)) : b.Pr.clone();
      P.set(b.name, p);
      E.set(b.name, e);
    };
    const frame = (f) => {
      if (!f || f === "char") return { p: new THREE.Vector3(), q: new THREE.Quaternion() };
      const name = { hips: "Hips", chest: "Spine2", head: "Head", spine: "Spine1" }[f] ?? f;
      return { p: P.get(name).clone(), q: D.get(name).clone() };
    };
    const point = (spec) => {
      if (!spec) return null;
      const fr = frame(spec.frame);
      return v3(spec.p).applyQuaternion(fr.q).add(fr.p);
    };
    const dirOf = (spec, fallbackFrame) => {
      if (!spec) return null;
      const arr = Array.isArray(spec) ? spec : spec.d;
      const fr = frame(Array.isArray(spec) ? fallbackFrame : spec.frame ?? fallbackFrame);
      return v3(arr).normalize().applyQuaternion(fr.q);
    };
    const swingTo = (b, worldDir) => {
      const dp = b.parent ? D.get(b.parent.name) : new THREE.Quaternion();
      const want = worldDir.clone().applyQuaternion(dp.clone().invert()).normalize();
      return new THREE.Quaternion().setFromUnitVectors(b.dir, want);
    };

    // ---- hips
    const hipsB = get("Hips");
    const hp = pose.hips ?? {};
    const hq = qBody(hp.yaw, hp.pitch, hp.roll);
    D.set("Hips", hq.clone());
    E.set("Hips", hq.clone());
    P.set("Hips", hipsB.Pr.clone().add(v3(hp.pos ?? [0, 0, 0])));

    // ---- spine: bend forward, to the side (its left +), twist (to its left +)
    const sp = pose.spine ?? {};
    const share = { Spine: 0.25, Spine1: 0.35, Spine2: 0.4 };
    for (const n of ["Spine", "Spine1", "Spine2"]) {
      const w = share[n];
      setE(get(n), qBody((sp.twist ?? 0) * w, (sp.bend ?? 0) * w, -(sp.side ?? 0) * w));
    }

    // ---- neck and head: look at a point, then nod (chin down +), turn (its left +), tilt (to its left shoulder +)
    const hd = pose.head ?? {};
    let turn = hd.turn ?? 0;
    let nod = hd.nod ?? 0;
    if (hd.look) {
      // the look's direction, in the chest's own terms
      const neckB = get("Neck");
      const pNeck = P.get("Spine2").clone().add(neckB.off.clone().applyQuaternion(D.get("Spine2")));
      const eyes = this.eyes.clone().sub(neckB.Pr).applyQuaternion(D.get("Spine2")).add(pNeck);
      const want = point(hd.look).sub(eyes).normalize().applyQuaternion(D.get("Spine2").clone().invert());
      turn += Math.atan2(want.x, want.z) / deg;
      nod += Math.atan2(-want.y, Math.hypot(want.x, want.z)) / deg;
    }
    setE(get("Neck"), qBody(turn * 0.4, nod * 0.4, -(hd.tilt ?? 0) * 0.4));
    setE(get("Head"), qBody(turn * 0.6, nod * 0.6, -(hd.tilt ?? 0) * 0.6));
    for (const n of ["LeftEye", "RightEye", "HeadTop_End"]) if (get(n)) setE(get(n), new THREE.Quaternion());

    // ---- arms
    for (const side of ["Left", "Right"]) {
      const s = side === "Left" ? 1 : -1;
      const a = (side === "Left" ? pose.L : pose.R) ?? {};
      const sh = get(`${side}Shoulder`);
      const up = get(`${side}Arm`);
      const fo = get(`${side}ForeArm`);
      const ha = get(`${side}Hand`);
      // collarbone: up (shrug) and forward
      const cl = a.clav ?? {};
      setE(sh, qAxis(Z, s * (cl.up ?? 0) * deg).multiply(qAxis(Y, -s * (cl.fwd ?? 0) * deg)));
      const S = P.get(sh.name).clone().add(up.off.clone().applyQuaternion(D.get(sh.name)));
      // the hand's wanted directions (world): from fingers + palm, or the thumb's side + palm
      let want = null;
      if (a.orient) {
        const fr = a.orient.frame ?? "chest";
        const p0 = dirOf(a.orient.palm, fr);
        if (a.orient.thumb) {
          const ts = dirOf(a.orient.thumb, fr);
          const pw = p0.clone().sub(ts.clone().multiplyScalar(p0.dot(ts))).normalize();
          const fw = side === "Right" ? pw.clone().cross(ts) : ts.clone().cross(pw);
          want = { f: fw.normalize(), p: pw };
        } else want = { f: dirOf(a.orient.fingers, fr), p: p0 };
      }
      let uDir;
      let fDir;
      if (a.hand || a.grip) {
        // two-bone reach: the wrist to the point (or the palm's grip to it), the elbow toward the pole
        let T;
        if (a.grip) {
          const R = align(this.hand[side].fingers, this.hand[side].palm, want.f, want.p);
          T = point(a.grip).sub(this.hand[side].grip.clone().applyQuaternion(R));
        } else T = point(a.hand);
        const la = up.len;
        const lb = fo.len;
        const toT = T.clone().sub(S);
        let d = toT.length();
        const u = toT.normalize();
        d = Math.min(Math.max(d, Math.abs(la - lb) + 1e-3), la + lb - 1e-4);
        const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
        const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        const pole = dirOf(a.pole ?? { frame: "chest", d: [s * 0.35, -0.55, -0.75] }, "chest");
        const pPerp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
        if (pPerp.lengthSq() < 1e-8) pPerp.copy(new THREE.Vector3(0, -1, 0).sub(u.clone().multiplyScalar(-u.y)));
        pPerp.normalize();
        const Epos = S.clone().add(u.clone().multiplyScalar(la * cosA)).add(pPerp.clone().multiplyScalar(la * sinA));
        uDir = Epos.clone().sub(S).normalize();
        fDir = S.clone().add(u.clone().multiplyScalar(d)).sub(Epos).normalize();
      } else {
        uDir = dirOf(a.arm ?? [s * 0.12, -1, 0.02], "chest");
        fDir = dirOf(a.fore ?? a.arm ?? [s * 0.08, -1, 0.12], "chest");
      }
      // upper arm: point it, then turn it so its hinge lies across the bend
      let eU = swingTo(up, uDir);
      {
        const dPar = D.get(sh.name);
        const hingeNow = this.hinge[`${side}Arm`].clone().applyQuaternion(dPar.clone().multiply(eU));
        const want = uDir.clone().cross(fDir);
        if (want.lengthSq() > 0.02) {
          want.normalize();
          const hn = hingeNow.sub(uDir.clone().multiplyScalar(hingeNow.dot(uDir))).normalize();
          const ang = Math.atan2(hn.clone().cross(want).dot(uDir), hn.dot(want));
          eU = qAxis(uDir.clone().applyQuaternion(dPar.clone().invert()), ang).multiply(eU);
        }
      }
      setE(up, eU);
      let eF = swingTo(fo, fDir);
      setE(fo, eF);
      // hand: a direction for the fingers and the palm, or follow the forearm
      if (want) {
        const dF = D.get(fo.name);
        const wantQ = align(this.hand[side].fingers, this.hand[side].palm, want.f, want.p);
        // in the forearm's undone frame
        let eH = dF.clone().invert().multiply(wantQ);
        // give part of the wrist's twist to the forearm, as a real forearm turns
        const ang = twistAngle(eH, fo.dir) * (a.twistShare ?? 0.6);
        const tw = qAxis(fo.dir, ang);
        eF = eF.clone().multiply(tw);
        setE(fo, eF);
        eH = tw.clone().invert().multiply(eH);
        setE(ha, eH);
      } else {
        setE(ha, qAxis(this.hand[side].palm.clone().cross(this.hand[side].fingers), (a.wrist ?? 0) * deg));
      }
      // fingers: curl into the palm, spread toward the thumb's side (+) or the little finger's (-)
      const shape = typeof a.fingers === "string" ? HANDS[a.fingers] : a.fingers ?? HANDS.relaxed;
      const { fingers: hf, palm: pn, thumbSide: ts } = this.hand[side];
      const spreadAxis = hf.clone().cross(ts).normalize();
      for (const F of FINGERS) {
        const j = [1, 2, 3, 4].map((i) => get(`${side}Hand${F}${i}`)).filter(Boolean);
        if (!j.length) continue;
        if (F === "Thumb") {
          const t = shape.Thumb ?? {};
          // across: in front of the palm; spread: away from the index finger; curl: its joints bend toward the palm
          const acrossAxis = ts.clone().cross(pn).normalize();
          for (let i = 0; i < j.length; i++) {
            const curlAxis = j[i].dir.clone().cross(pn).normalize();
            let e = qAxis(curlAxis, (t.curl?.[i] ?? 0) * deg);
            if (i === 0) e = qAxis(acrossAxis, (t.across ?? 0) * deg).multiply(qAxis(spreadAxis, (t.spread ?? 0) * deg)).multiply(e);
            setE(j[i], e);
          }
          continue;
        }
        const c = shape[F] ?? [0, 0, 0, 0];
        for (let i = 0; i < j.length; i++) {
          if (i > 2) {
            setE(j[i], new THREE.Quaternion());
            continue;
          }
          const curlAxis = j[i].dir.clone().cross(pn).normalize();
          let e = qAxis(curlAxis, (c[i] ?? 0) * deg);
          if (i === 0) e = qAxis(spreadAxis, (c[3] ?? 0) * deg).multiply(e);
          setE(j[i], e);
        }
      }
    }

    // ---- legs: the ankle to a point (feet stay where they stood unless told), the knee toward the pole
    for (const side of ["Left", "Right"]) {
      const s = side === "Left" ? 1 : -1;
      const l = (side === "Left" ? pose.legL : pose.legR) ?? {};
      const th = get(`${side}UpLeg`);
      const sh = get(`${side}Leg`);
      const ft = get(`${side}Foot`);
      const toe = get(`${side}ToeBase`);
      const H = P.get("Hips").clone().add(th.off.clone().applyQuaternion(D.get("Hips")));
      const T = l.foot ? point(l.foot) : ft.Pr.clone();
      const la = th.len;
      const lb = sh.len;
      const toT = T.clone().sub(H);
      let d = toT.length();
      const u = toT.normalize();
      d = Math.min(Math.max(d, Math.abs(la - lb) + 1e-3), la + lb - 1e-4);
      const cosA = (la * la + d * d - lb * lb) / (2 * la * d);
      const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
      const pole = dirOf(l.pole ?? { frame: "hips", d: [s * 0.12, 0, 1] }, "hips");
      const pPerp = pole.clone().sub(u.clone().multiplyScalar(pole.dot(u)));
      if (pPerp.lengthSq() < 1e-8) pPerp.set(0, 0, 1);
      pPerp.normalize();
      const K = H.clone().add(u.clone().multiplyScalar(la * cosA)).add(pPerp.clone().multiplyScalar(la * sinA));
      const uDir = K.clone().sub(H).normalize();
      const fDir = H.clone().add(u.clone().multiplyScalar(d)).sub(K).normalize();
      let eT = swingTo(th, uDir);
      {
        const dPar = D.get("Hips");
        const hingeNow = this.hinge[`${side}UpLeg`].clone().applyQuaternion(dPar.clone().multiply(eT));
        const want = uDir.clone().cross(fDir);
        if (want.lengthSq() > 0.02) {
          want.normalize();
          const hn = hingeNow.sub(uDir.clone().multiplyScalar(hingeNow.dot(uDir))).normalize();
          const ang = Math.atan2(hn.clone().cross(want).dot(uDir), hn.dot(want));
          eT = qAxis(uDir.clone().applyQuaternion(dPar.clone().invert()), ang).multiply(eT);
        } else {
          // a straight leg: its knee faces the pole
          const hn = hingeNow.sub(uDir.clone().multiplyScalar(hingeNow.dot(uDir))).normalize();
          const wantH = uDir.clone().cross(pPerp).negate().normalize();
          const ang = Math.atan2(hn.clone().cross(wantH).dot(uDir), hn.dot(wantH));
          eT = qAxis(uDir.clone().applyQuaternion(dPar.clone().invert()), ang).multiply(eT);
        }
      }
      setE(th, eT);
      setE(sh, swingTo(sh, fDir));
      // the foot: flat on the ground and facing as it stood, unless told
      const fo = l.footDir ? dirOf(l.footDir, "char") : ft.dir.clone().applyQuaternion(qAxis(Y, (l.footYaw ?? 0) * deg)).applyQuaternion(qAxis(X, (l.footPitch ?? 0) * deg));
      const dLeg = D.get(sh.name);
      const eFoot = dLeg.clone().invert().multiply(new THREE.Quaternion().setFromUnitVectors(ft.dir, fo.clone().normalize()));
      setE(ft, eFoot);
      setE(toe, qAxis(X, (l.toe ?? 0) * deg));
      const toeEnd = get(`${side}Toe_End`);
      if (toeEnd) setE(toeEnd, new THREE.Quaternion());
    }

    // every other bone follows its parent
    for (const b of this.order) if (!E.has(b.name)) setE(b, new THREE.Quaternion());

    // local rotations: L = Wr(parent)^-1 · E · Wr
    for (const b of this.order) {
      const e = E.get(b.name);
      const l = b.parent ? b.parent.Wr.clone().invert().multiply(e).multiply(b.Wr) : e.clone().multiply(b.Wr);
      local.set(b.name, l.normalize());
    }
    this.D = D;
    this.P = P;
    return { local, hips: b0(P.get("Hips"), hipsB) };
  }
}

function b0(p, hipsB) {
  // the Hips node's translation (its parent is the armature, at the origin)
  return p.clone().sub(hipsB.Pr).add(hipsB.t);
}

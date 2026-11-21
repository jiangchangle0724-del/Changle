/**
 * A dance learnt from a video (Nov 21; Steve: "我给你youtube舞蹈你可以照着学吗", then two links): the
 * dancer's body as MediaPipe's pose landmarker found it in each frame (pose.py), put on her skeleton.
 * Her hips, chest and head turn as the dancer's; each arm and leg points the way the dancer's did, at
 * her own lengths, its elbow or knee bending the dancer's way; hands and feet turn as the dancer's.
 * Where she stands comes from her feet: a foot standing still in the picture stays where it is on the
 * floor and her hips follow it (so her feet don't slide), the lowest of it on the floor.
 * Writes the same files as retarget.ts, for loop.ts.
 *
 * usage (from site/): npx tsx <this> <her .glb.gz> <landmarks .json, pose.py> <out dir> <name> [from s] [to s]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type Marks = { fps: number; size: [number, number]; world: number[][][]; image: number[][][] };

function withoutTextures(glb: Uint8Array): ArrayBuffer {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture;
      delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    }
    delete m.normalTexture;
  }
  let text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (text.length % 4)) % 4;
  text = Uint8Array.from([...text, ...new Array(pad).fill(0x20)]);
  const rest = glb.subarray(20 + jsonLen);
  const out = new Uint8Array(12 + 8 + text.length + rest.length);
  const o = new DataView(out.buffer);
  out.set(glb.subarray(0, 12));
  o.setUint32(8, out.length, true);
  o.setUint32(12, text.length, true);
  o.setUint32(16, 0x4e4f534a, true);
  out.set(text, 20);
  out.set(rest, 20 + text.length);
  return out.buffer;
}

// MediaPipe's points
const NOSE = 0, L_EAR = 7, R_EAR = 8, L_SH = 11, R_SH = 12, L_EL = 13, R_EL = 14, L_WR = 15, R_WR = 16;
const L_PINKY = 17, R_PINKY = 18, L_INDEX = 19, R_INDEX = 20, L_HIP = 23, R_HIP = 24, L_KNEE = 25, R_KNEE = 26;
const L_ANK = 27, R_ANK = 28, L_HEEL = 29, R_HEEL = 30, L_TOE = 31, R_TOE = 32;

/** Each point's track with the gaps filled in and smoothed (a gaussian over `sigma` frames). */
function tracks(frames: number[][][], sigma: number): THREE.Vector3[][] {
  const n = frames.length;
  const out: THREE.Vector3[][] = [];
  const r = Math.ceil(sigma * 3);
  const w = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigma * sigma)));
  for (let j = 0; j < 33; j++) {
    const raw = frames.map((f) => (f[j] && Number.isFinite(f[j][0]) ? f[j] : null));
    // (a frame without her: the nearest frames' either side, in between)
    const filled = raw.map((p, k) => {
      if (p) return p;
      let a = k - 1;
      while (a >= 0 && !raw[a]) a--;
      let b = k + 1;
      while (b < n && !raw[b]) b++;
      if (a < 0 && b >= n) return [0, 0, 0, 0];
      if (a < 0) return raw[b]!;
      if (b >= n) return raw[a]!;
      const t = (k - a) / (b - a);
      return raw[a]!.map((v, c) => v + (raw[b]![c] - v) * t);
    });
    out.push(
      filled.map((_, k) => {
        let s = 0;
        const v = new THREE.Vector3();
        for (let i = -r; i <= r; i++) {
          const q = filled[Math.min(n - 1, Math.max(0, k + i))];
          v.x += q[0] * w[i + r];
          v.y += q[1] * w[i + r];
          v.z += q[2] * w[i + r];
          s += w[i + r];
        }
        return v.divideScalar(s);
      }),
    );
  }
  return out;
}

/** The turn taking (a, b) at rest onto (c, d) (each pair made square: a's and c's direction kept). */
function turnBetween(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): THREE.Quaternion {
  const frame = (x: THREE.Vector3, y: THREE.Vector3) => {
    const X = x.clone().normalize();
    const Y = y.clone().sub(X.clone().multiplyScalar(y.dot(X))).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    return new THREE.Matrix4().makeBasis(X, Y, Z);
  };
  const m = frame(c, d).multiply(frame(a, b).transpose());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

async function main() {
  const [bodyPath, marksPath, outDir, name, fromS, toS] = process.argv.slice(2);
  mkdirSync(outDir, { recursive: true });
  const gl = new GLTFLoader();
  gl.setMeshoptDecoder(MeshoptDecoder);
  const body = (await gl.parseAsync(withoutTextures(new Uint8Array(gunzipSync(readFileSync(bodyPath)))), "")).scene;
  body.updateMatrixWorld(true);
  const bones = new Map<string, THREE.Object3D>();
  body.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name, o);
  });
  const order = [...bones.keys()];
  const B = (n: string) => bones.get(n)!;
  const restPos = new Map<string, THREE.Vector3>();
  const restRot = new Map<string, THREE.Quaternion>();
  const restLocal = new Map<string, THREE.Quaternion>();
  for (const [n, b] of bones) {
    restPos.set(n, b.getWorldPosition(new THREE.Vector3()));
    restRot.set(n, b.getWorldQuaternion(new THREE.Quaternion()));
    restLocal.set(n, b.quaternion.clone());
  }
  const hipsBone = B("Hips");
  const hipsRest = hipsBone.position.clone();
  const len = (a: string, b: string) => restPos.get(a)!.distanceTo(restPos.get(b)!);
  const dirRest = (a: string, b: string) => restPos.get(b)!.clone().sub(restPos.get(a)!).normalize();

  const marks = JSON.parse(readFileSync(marksPath, "utf8")) as Marks;
  const fps = marks.fps;
  const f0 = fromS ? Math.round(Number(fromS) * fps) : 0;
  const f1 = toS ? Math.min(marks.world.length, Math.round(Number(toS) * fps)) : marks.world.length;
  // the dancer in three.js's axes (x to her left as she faces the camera is the picture's right: y up, z to the camera)
  const world = marks.world.slice(f0, f1).map((f) => f.map((p) => [p[0], -p[1], -p[2], p[3]]));
  const P = tracks(world, 2);
  const img = tracks(marks.image.slice(f0, f1).map((f) => f.map((p) => [p[0] * marks.size[0], p[1] * marks.size[1], 0, p[3]])), 1.0);
  const N = P[0].length;
  const at = (j: number, k: number) => P[j][k];
  const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);

  // where her feet stand: a foot still in the picture (for its size there, her torso's length), and
  // no higher than the other one
  const torsoPx = (k: number) => mid(img[L_SH][k], img[R_SH][k]).distanceTo(mid(img[L_HIP][k], img[R_HIP][k])) || 1;
  const footPx = (s: "L" | "R", k: number) => {
    const [a, h, t] = s === "L" ? [L_ANK, L_HEEL, L_TOE] : [R_ANK, R_HEEL, R_TOE];
    return { y: Math.max(img[h][k].y, img[t][k].y), p: mid(img[h][k], img[t][k]), a: img[a][k] };
  };
  const stands = (s: "L" | "R", k: number) => {
    const a = footPx(s, Math.max(0, k - 1));
    const b = footPx(s, Math.min(N - 1, k + 1));
    const speed = (b.p.distanceTo(a.p) / (Math.min(N - 1, k + 1) - Math.max(0, k - 1))) * fps / torsoPx(k);
    const other = footPx(s === "L" ? "R" : "L", k);
    return speed < 0.9 && footPx(s, k).y >= other.y - 0.12 * torsoPx(k);
  };

  const q = new Int16Array(N * order.length * 4);
  const hips = new Int16Array(N * 3);
  const put = (f: number, i: number, local: THREE.Quaternion) => {
    local.normalize();
    const s = local.w < 0 ? -1 : 1;
    const o = (f * order.length + i) * 4;
    q[o] = Math.round(local.x * s * 32767);
    q[o + 1] = Math.round(local.y * s * 32767);
    q[o + 2] = Math.round(local.z * s * 32767);
    q[o + 3] = Math.round(local.w * s * 32767);
  };
  const W = new Map<string, THREE.Quaternion>();
  const setWorld = (n: string, delta: THREE.Quaternion) => W.set(n, delta.clone().multiply(restRot.get(n)!));
  const localOf = (n: string) => {
    const b = B(n);
    const pw = b.parent && (W.get(b.parent.name) ?? b.parent.getWorldQuaternion(new THREE.Quaternion()));
    return pw ? pw.clone().invert().multiply(W.get(n)!) : W.get(n)!.clone();
  };
  const apply = (names: string[]) => {
    for (const n of names) B(n).quaternion.copy(localOf(n));
    body.updateMatrixWorld(true);
  };
  const posOf = (n: string) => B(n).getWorldPosition(new THREE.Vector3());

  // the elbows' and knees' bend: the way each bends at rest, then as the dancer's did (kept from the
  // frame before when the limb is straight)
  const bendRest: Record<string, THREE.Vector3> = {
    LeftArm: new THREE.Vector3(-1, -1, 0).normalize(),
    RightArm: new THREE.Vector3(-1, 1, 0).normalize(),
    LeftUpLeg: new THREE.Vector3(1, 0, 0),
    RightUpLeg: new THREE.Vector3(1, 0, 0),
  };
  const bendWas: Record<string, THREE.Vector3> = {};
  const feet: { L: THREE.Vector3[]; R: THREE.Vector3[]; Lt: THREE.Vector3[]; Rt: THREE.Vector3[] } = { L: [], R: [], Lt: [], Rt: [] };
  const restAnkle = restPos.get("LeftFoot")!.y;
  const restToe = restPos.get("LeftToeBase")!.y;

  for (let k = 0; k < N; k++) {
    W.clear();
    hipsBone.position.copy(hipsRest);
    for (const n of order) B(n).quaternion.copy(restLocal.get(n)!);
    body.updateMatrixWorld(true);
    // hips, chest, head: their turn from the dancer's hips, shoulders and ears
    const hipM = mid(at(L_HIP, k), at(R_HIP, k));
    const shM = mid(at(L_SH, k), at(R_SH, k));
    const up = shM.clone().sub(hipM);
    const pelvis = turnBetween(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), at(L_HIP, k).clone().sub(at(R_HIP, k)), up);
    const chest = turnBetween(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), at(L_SH, k).clone().sub(at(R_SH, k)), up);
    const earM = mid(at(L_EAR, k), at(R_EAR, k));
    const headSide = at(L_EAR, k).clone().sub(at(R_EAR, k));
    const headFwd = at(NOSE, k).clone().sub(earM);
    const head = turnBetween(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), headSide, headFwd);
    setWorld("Hips", pelvis);
    const rel = chest.clone().multiply(pelvis.clone().invert());
    const I = new THREE.Quaternion();
    setWorld("Spine", I.clone().slerp(rel, 1 / 3).multiply(pelvis));
    setWorld("Spine1", I.clone().slerp(rel, 2 / 3).multiply(pelvis));
    setWorld("Spine2", chest);
    setWorld("Neck", chest.clone().slerp(head, 0.5));
    setWorld("Head", head);
    for (const n of ["LeftShoulder", "RightShoulder"]) setWorld(n, chest);
    apply(["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "RightShoulder"]);
    // arms and legs: pointing the dancer's way, bending the dancer's way, at her lengths
    const limb = (top: string, midB: string, end: string, a: number, b: number, c: number, fallback: THREE.Vector3) => {
      const d1 = at(b, k).clone().sub(at(a, k)).normalize();
      const d2 = at(c, k).clone().sub(at(b, k)).normalize();
      let bend = new THREE.Vector3().crossVectors(d1, d2);
      const was = bendWas[top] ?? fallback.clone();
      if (bend.length() < 0.15) bend = was.clone();
      else if (bend.dot(was) < -0.2 && bend.length() < 0.4) bend = was.clone();
      bend.normalize();
      bendWas[top] = bend.clone();
      const r1 = turnBetween(dirRest(top, midB), bendRest[top], d1, bend);
      const r2 = turnBetween(dirRest(midB, end), bendRest[top], d2, bend);
      setWorld(top, r1);
      setWorld(midB, r2);
      return { r1, r2, bend };
    };
    const pelvisX = new THREE.Vector3(1, 0, 0).applyQuaternion(pelvis);
    const la = limb("LeftArm", "LeftForeArm", "LeftHand", L_SH, L_EL, L_WR, new THREE.Vector3(-1, -1, 0).applyQuaternion(chest).normalize());
    const ra = limb("RightArm", "RightForeArm", "RightHand", R_SH, R_EL, R_WR, new THREE.Vector3(-1, 1, 0).applyQuaternion(chest).normalize());
    const ll = limb("LeftUpLeg", "LeftLeg", "LeftFoot", L_HIP, L_KNEE, L_ANK, pelvisX);
    const rl = limb("RightUpLeg", "RightLeg", "RightFoot", R_HIP, R_KNEE, R_ANK, pelvisX);
    // hands: from the wrist to the knuckles, the index's side; feet: ankle to toe, the knee's bend for the side
    const hand = (n: string, wr: number, pk: number, ix: number, fore: THREE.Quaternion) => {
      const dir = mid(at(pk, k), at(ix, k)).sub(at(wr, k));
      const side = at(ix, k).clone().sub(at(pk, k));
      if (dir.length() < 1e-3 || side.length() < 1e-3) return setWorld(n, fore);
      setWorld(n, turnBetween(dirRest(n, `${n}Middle1`), new THREE.Vector3(0, 0, 1), dir, side));
    };
    hand("LeftHand", L_WR, L_PINKY, L_INDEX, la.r2);
    hand("RightHand", R_WR, R_PINKY, R_INDEX, ra.r2);
    const foot = (n: string, an: number, to: number, leg: { bend: THREE.Vector3 }) => {
      const dir = at(to, k).clone().sub(at(an, k));
      setWorld(n, turnBetween(dirRest(n, n.replace("Foot", "ToeBase")), new THREE.Vector3(1, 0, 0), dir, leg.bend));
    };
    foot("LeftFoot", L_ANK, L_TOE, ll);
    foot("RightFoot", R_ANK, R_TOE, rl);
    // the rest (fingers, toes, hair) as their parents turn
    for (const n of order) if (!W.has(n)) {
      const p = B(n).parent;
      const pw = p && W.get(p.name);
      if (pw) W.set(n, pw.clone().multiply(restRot.get(p!.name)!.clone().invert()).multiply(restRot.get(n)!));
    }
    for (let i = 0; i < order.length; i++) {
      if (!W.has(order[i])) W.set(order[i], restRot.get(order[i])!.clone());
      put(k, i, localOf(order[i]));
    }
    apply(order);
    // her feet with her hips where they rest: for her place below
    const h0 = posOf("Hips");
    feet.L.push(posOf("LeftFoot").sub(h0));
    feet.R.push(posOf("RightFoot").sub(h0));
    feet.Lt.push(posOf("LeftToeBase").sub(h0));
    feet.Rt.push(posOf("RightToeBase").sub(h0));
  }

  // where she stands: a standing foot keeps its place, her hips follow; both up, her hips carry on
  const hp: THREE.Vector3[] = [];
  const anchor: { L: THREE.Vector3 | null; R: THREE.Vector3 | null } = { L: null, R: null };
  const hipsY0 = restPos.get("Hips")!.y;
  let vel = new THREE.Vector3();
  for (let k = 0; k < N; k++) {
    const prev = k ? hp[k - 1] : new THREE.Vector3(0, hipsY0, 0);
    const guesses: THREE.Vector3[] = [];
    for (const s of ["L", "R"] as const) {
      const rel = feet[s][k];
      const toe = feet[`${s}t` as "Lt" | "Rt"][k];
      if (!stands(s, k)) {
        anchor[s] = null;
        continue;
      }
      // (the lowest of the foot on the floor: heel or toe)
      const lift = Math.min(rel.y - (restAnkle - hipsY0), toe.y - (restToe - hipsY0));
      if (!anchor[s]) anchor[s] = prev.clone().add(rel).setY(0);
      const g = anchor[s]!.clone().sub(rel);
      g.y = hipsY0 - lift;
      guesses.push(g);
    }
    let h: THREE.Vector3;
    if (guesses.length) h = guesses.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(guesses.length);
    else h = prev.clone().add(vel.clone().divideScalar(fps)).setY(prev.y);
    if (k) vel = h.clone().sub(prev).multiplyScalar(fps).multiplyScalar(0.9);
    hp.push(h);
  }
  for (let k = 0; k < N; k++) {
    // (a little smoothing: a jump between two guesses)
    const s = new THREE.Vector3();
    let n = 0;
    for (let i = -2; i <= 2; i++) {
      const j = Math.min(N - 1, Math.max(0, k + i));
      s.add(hp[j]);
      n++;
    }
    s.divideScalar(n);
    hips[k * 3] = Math.round(s.x * 1000);
    hips[k * 3 + 1] = Math.round((s.y - hipsY0) * 1000);
    hips[k * 3 + 2] = Math.round(s.z * 1000);
  }
  // her standing feet held where they stand (what's left of a slide: her hips smoothed, two feet's
  // guesses averaged), never below the floor: each leg bent to reach (as retarget.ts), easing back
  // to its own way over a few frames when the foot lifts
  const lock: Record<string, THREE.Vector3 | null> = { L: null, R: null };
  const let_go: Record<string, { from: THREE.Vector3; k: number } | null> = { L: null, R: null };
  const floorAnkle = restPos.get("LeftFoot")!.y - 0.005;
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < order.length; i++) {
      const o = (k * order.length + i) * 4;
      B(order[i]).quaternion.set(q[o] / 32767, q[o + 1] / 32767, q[o + 2] / 32767, q[o + 3] / 32767).normalize();
    }
    hipsBone.position.set(hipsRest.x + hips[k * 3] / 1000, hipsRest.y + hips[k * 3 + 1] / 1000, hipsRest.z + hips[k * 3 + 2] / 1000);
    body.updateMatrixWorld(true);
    for (const s of ["L", "R"] as const) {
      const side = s === "L" ? "Left" : "Right";
      const up = B(`${side}UpLeg`);
      const leg = B(`${side}Leg`);
      const foot = B(`${side}Foot`);
      const j1 = up.getWorldPosition(new THREE.Vector3());
      const j2 = leg.getWorldPosition(new THREE.Vector3());
      const j3 = foot.getWorldPosition(new THREE.Vector3());
      let goal: THREE.Vector3;
      if (stands(s, k)) {
        if (!lock[s]) lock[s] = j3.clone().setY(Math.max(j3.y, floorAnkle));
        goal = lock[s]!.clone();
        let_go[s] = null;
      } else {
        if (lock[s]) {
          let_go[s] = { from: lock[s]!.clone(), k };
          lock[s] = null;
        }
        goal = j3.clone();
        const r = let_go[s];
        if (r && k - r.k < 5) goal = r.from.clone().lerp(j3, (k - r.k + 1) / 5);
      }
      goal.y = Math.max(goal.y, floorAnkle);
      if (goal.distanceTo(j3) < 1e-4) continue;
      const a = j2.distanceTo(j1);
      const b = j3.distanceTo(j2);
      const to = goal.clone().sub(j1);
      const c = Math.max(Math.abs(a - b) + 1e-4, Math.min((a + b) * 0.9999, to.length()));
      const dir = to.normalize();
      const along = (a * a - b * b + c * c) / (2 * c);
      const pole = j2.clone().sub(j1);
      pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
      if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1).applyQuaternion(hipsBone.getWorldQuaternion(new THREE.Quaternion()));
      pole.normalize();
      const knee = j1.clone().add(dir.clone().multiplyScalar(along)).add(pole.multiplyScalar(Math.sqrt(Math.max(0, a * a - along * along))));
      const end = j1.clone().add(dir.clone().multiplyScalar(c));
      const turn1 = new THREE.Quaternion().setFromUnitVectors(j2.clone().sub(j1).normalize(), knee.clone().sub(j1).normalize());
      const shin = j3.clone().sub(j2).normalize().applyQuaternion(turn1);
      const turn2 = new THREE.Quaternion().setFromUnitVectors(shin, end.sub(knee).normalize());
      const R1 = up.getWorldQuaternion(new THREE.Quaternion());
      const R2 = leg.getWorldQuaternion(new THREE.Quaternion());
      const R3 = foot.getWorldQuaternion(new THREE.Quaternion());
      const r1 = turn1.clone().multiply(R1);
      const r2 = turn2.multiply(turn1).multiply(R2);
      put(k, order.indexOf(up.name), up.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(r1));
      put(k, order.indexOf(leg.name), r1.clone().invert().multiply(r2));
      put(k, order.indexOf(foot.name), r2.clone().invert().multiply(R3));
    }
  }
  const head = { name, frames: N, fps, bones: order, seconds: (N - 1) / fps, sHipH: 1, tHipH: hipsY0 };
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(head));
  writeFileSync(join(outDir, `${name}.q.bin`), Buffer.from(q.buffer));
  writeFileSync(join(outDir, `${name}.hips.bin`), Buffer.from(hips.buffer));
  console.log(name, N, "frames", ((N - 1) / fps).toFixed(2), "s");
}

await main();

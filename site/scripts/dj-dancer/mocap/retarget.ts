/**
 * Mixamo dances (FBX, without skin) onto the DJ dancer's skeleton (MPFB2's Mixamo rig, every bone's
 * rest turn none): each bone's turn away from its own rest, in world space, on hers, after lining
 * up where each bone points at rest (Mixamo's T-pose, her A-pose). Writes one file per clip: 30
 * frames a second, each bone's local turn as four 16-bit numbers, the hips' place in millimetres,
 * and what the motion says of its beat (the period, where the beats fall).
 *
 * usage (from site/): npx tsx <this> <body.glb.gz> <out dir> <a.fbx> [b.fbx …]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const FPS = 30;

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

/** which child a bone points at (for lining up the rests) */
const AIM: Record<string, string> = {
  Hips: "Spine",
  Spine: "Spine1",
  Spine1: "Spine2",
  Spine2: "Neck",
  Neck: "Head",
  LeftShoulder: "LeftArm",
  LeftArm: "LeftForeArm",
  LeftForeArm: "LeftHand",
  LeftHand: "LeftHandMiddle1",
  RightShoulder: "RightArm",
  RightArm: "RightForeArm",
  RightForeArm: "RightHand",
  RightHand: "RightHandMiddle1",
  LeftUpLeg: "LeftLeg",
  LeftLeg: "LeftFoot",
  LeftFoot: "LeftToeBase",
  RightUpLeg: "RightLeg",
  RightLeg: "RightFoot",
  RightFoot: "RightToeBase",
};
for (const side of ["Left", "Right"])
  for (const f of ["Index", "Middle", "Ring", "Pinky", "Thumb"]) {
    AIM[`${side}Hand${f}1`] = `${side}Hand${f}2`;
    AIM[`${side}Hand${f}2`] = `${side}Hand${f}3`;
  }

const clean = (n: string) => n.replace(/^mixamorig\d*[:_]?/, "");

export type Retargeted = { name: string; frames: number; fps: number; bones: string[]; q: Int16Array; hips: Int16Array; seconds: number };

async function main() {
  const [bodyPath, outDir, ...fbxs] = process.argv.slice(2);
  mkdirSync(outDir, { recursive: true });
  const gl = new GLTFLoader();
  gl.setMeshoptDecoder(MeshoptDecoder);
  const body = (await gl.parseAsync(withoutTextures(new Uint8Array(gunzipSync(readFileSync(bodyPath)))), "")).scene;
  body.updateMatrixWorld(true);
  const tBones = new Map<string, THREE.Object3D>();
  body.traverse((o) => {
    if ((o as THREE.Bone).isBone) tBones.set(o.name, o);
  });
  const order = [...tBones.keys()];
  // her rest: every bone's world place and turn (the turns are none, the places her A-pose)
  const tPos = new Map<string, THREE.Vector3>();
  const tRot = new Map<string, THREE.Quaternion>();
  for (const [n, b] of tBones) {
    tPos.set(n, b.getWorldPosition(new THREE.Vector3()));
    tRot.set(n, b.getWorldQuaternion(new THREE.Quaternion()));
  }
  const tHipH = tPos.get("Hips")!.y - Math.min(tPos.get("LeftToeBase")!.y, tPos.get("RightToeBase")!.y);
  const hipsBone = tBones.get("Hips")!;
  const hipsRest = hipsBone.position.clone();

  for (const file of fbxs) {
    const buf = readFileSync(file);
    const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
    const clip = fbx.animations[0];
    if (!clip) {
      console.log("no animation in", file);
      continue;
    }
    const sBones = new Map<string, THREE.Object3D>();
    fbx.traverse((o) => {
      if ((o as THREE.Bone).isBone || o.type === "Bone") sBones.set(clean(o.name), o);
    });
    fbx.updateMatrixWorld(true);
    // its rest (Mixamo's T-pose): before any frame plays
    const sPos0 = new Map<string, THREE.Vector3>();
    const sRot0 = new Map<string, THREE.Quaternion>();
    for (const [n, b] of sBones) {
      sPos0.set(n, b.getWorldPosition(new THREE.Vector3()));
      sRot0.set(n, b.getWorldQuaternion(new THREE.Quaternion()));
    }
    const sToe = Math.min(sPos0.get("LeftToeBase")?.y ?? 0, sPos0.get("RightToeBase")?.y ?? 0);
    const sHipH = sPos0.get("Hips")!.y - sToe;
    const k = tHipH / sHipH;
    // lining up: the turn that takes each of her bones' rest aim onto Mixamo's
    const align = new Map<string, THREE.Quaternion>();
    for (const n of order) {
      const c = AIM[n];
      if (!c || !sBones.has(n) || !sBones.has(c) || !tBones.has(c)) {
        align.set(n, new THREE.Quaternion());
        continue;
      }
      const dt = tPos.get(c)!.clone().sub(tPos.get(n)!).normalize();
      const ds = sPos0.get(c)!.clone().sub(sPos0.get(n)!).normalize();
      align.set(n, new THREE.Quaternion().setFromUnitVectors(dt, ds));
    }
    const mixer = new THREE.AnimationMixer(fbx);
    const action = mixer.clipAction(clip);
    action.play();
    const frames = Math.max(2, Math.round(clip.duration * FPS) + 1);
    const q = new Int16Array(frames * order.length * 4);
    const hips = new Int16Array(frames * 3);
    const world = new Map<string, THREE.Quaternion>();
    const inv = new THREE.Quaternion();
    let miss = 0;
    const put = (f: number, i: number, local: THREE.Quaternion) => {
      local.normalize();
      // (one hemisphere, so the 16-bit numbers interpolate the short way)
      const s = local.w < 0 ? -1 : 1;
      const o = (f * order.length + i) * 4;
      q[o] = Math.round(local.x * s * 32767);
      q[o + 1] = Math.round(local.y * s * 32767);
      q[o + 2] = Math.round(local.z * s * 32767);
      q[o + 3] = Math.round(local.w * s * 32767);
    };
    for (let f = 0; f < frames; f++) {
      mixer.setTime(Math.min(clip.duration, f / FPS));
      fbx.updateMatrixWorld(true);
      world.clear();
      for (let i = 0; i < order.length; i++) {
        const n = order[i];
        const tb = tBones.get(n)!;
        const sb = sBones.get(n);
        let w: THREE.Quaternion;
        if (sb) {
          const rs = sb.getWorldQuaternion(new THREE.Quaternion());
          // her world turn: Mixamo's turn away from its rest, applied after lining up
          w = rs.multiply(inv.copy(sRot0.get(n)!).invert()).multiply(align.get(n)!).multiply(tRot.get(n)!);
        } else {
          // (a bone Mixamo hasn't: as its parent turns, its own rest)
          const p = tb.parent && world.get(tb.parent.name);
          w = p ? p.clone().multiply(inv.copy(tRot.get(tb.parent!.name)!).invert()).multiply(tRot.get(n)!) : tRot.get(n)!.clone();
        }
        world.set(n, w);
        const pw = tb.parent && world.get(tb.parent.name);
        const local = pw ? inv.copy(pw).invert().multiply(w) : w.clone();
        local.normalize();
        tb.quaternion.copy(local);
        put(f, i, local);
      }
      const hp = sBones.get("Hips")!.getWorldPosition(new THREE.Vector3());
      const d = hp.sub(sPos0.get("Hips")!).multiplyScalar(k);
      hips[f * 3] = Math.round(d.x * 1000);
      hips[f * 3 + 1] = Math.round(d.y * 1000);
      hips[f * 3 + 2] = Math.round(d.z * 1000);
      // her feet where the dancer's were (Nov 21): her legs aren't the dancer's legs (longer or shorter
      // thighs, wider hips), so the same turns put her feet a little elsewhere, and a foot standing
      // still on the floor slides. Her ankles go where the dancer's went (from the dancer's rest, the
      // dancer's size to hers), each leg bent to reach (its knee the way the dancer's pointed), each
      // foot turned as the dancer's.
      hipsBone.position.copy(hipsRest).add(d);
      body.updateMatrixWorld(true);
      for (const side of ["Left", "Right"]) {
        const up = tBones.get(`${side}UpLeg`);
        const leg = tBones.get(`${side}Leg`);
        const foot = tBones.get(`${side}Foot`);
        const sFoot = sBones.get(`${side}Foot`);
        if (!up || !leg || !foot || !sFoot || !up.parent) continue;
        const goal = tPos.get(foot.name)!.clone().add(sFoot.getWorldPosition(new THREE.Vector3()).sub(sPos0.get(foot.name)!).multiplyScalar(k));
        const j1 = up.getWorldPosition(new THREE.Vector3());
        const j2 = leg.getWorldPosition(new THREE.Vector3());
        const j3 = foot.getWorldPosition(new THREE.Vector3());
        const a = j2.distanceTo(j1);
        const b = j3.distanceTo(j2);
        const to = goal.clone().sub(j1);
        const c = Math.max(Math.abs(a - b) + 1e-4, Math.min((a + b) * 0.9999, to.length()));
        const dir = to.normalize();
        const along = (a * a - b * b + c * c) / (2 * c);
        const pole = j2.clone().sub(j1);
        pole.sub(dir.clone().multiplyScalar(pole.dot(dir)));
        if (pole.lengthSq() < 1e-8) pole.set(0, 0, 1).applyQuaternion(world.get(up.parent.name)!);
        pole.normalize();
        const knee = j1.clone().add(dir.clone().multiplyScalar(along)).add(pole.multiplyScalar(Math.sqrt(Math.max(0, a * a - along * along))));
        const end = j1.clone().add(dir.clone().multiplyScalar(c));
        const turn1 = new THREE.Quaternion().setFromUnitVectors(j2.clone().sub(j1).normalize(), knee.clone().sub(j1).normalize());
        const shin = j3.clone().sub(j2).normalize().applyQuaternion(turn1);
        const turn2 = new THREE.Quaternion().setFromUnitVectors(shin, end.sub(knee).normalize());
        const r1 = turn1.clone().multiply(world.get(up.name)!);
        const r2 = turn2.multiply(turn1).multiply(world.get(leg.name)!);
        up.quaternion.copy(inv.copy(world.get(up.parent.name)!).invert().multiply(r1));
        leg.quaternion.copy(r1.clone().invert().multiply(r2));
        foot.quaternion.copy(r2.clone().invert().multiply(world.get(foot.name)!));
        put(f, order.indexOf(up.name), up.quaternion.clone());
        put(f, order.indexOf(leg.name), leg.quaternion.clone());
        put(f, order.indexOf(foot.name), foot.quaternion.clone());
        up.updateMatrixWorld(true);
        // (how far off it ended up: a goal out of her leg's reach)
        miss = Math.max(miss, foot.getWorldPosition(new THREE.Vector3()).distanceTo(goal));
      }
    }
    const name = basename(file).replace(/\.fbx$/i, "");
    const head = { name, frames, fps: FPS, bones: order, seconds: clip.duration, sHipH, tHipH };
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(head));
    writeFileSync(join(outDir, `${name}.q.bin`), Buffer.from(q.buffer));
    writeFileSync(join(outDir, `${name}.hips.bin`), Buffer.from(hips.buffer));
    console.log(name, frames, "frames", clip.duration.toFixed(2), "s", "source bones", sBones.size, "k", k.toFixed(3), "feet off by", (miss * 100).toFixed(1), "cm at most");
  }
}
await main();

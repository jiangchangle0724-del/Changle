/*
 * The big screen's dancer since Nov 18 (src/party/dj/dancer/, made by scripts/dj-dancer/): her file
 * and her dances, read as the TV page reads them. Run with `npx tsx tests/dancer.test.ts`
 *  1. Her model loads (three.js, like the page, without its picture): one skinned mesh on the
 *     Mixamo-named skeleton the dances are made for, every vertex on four bones at most that add up to
 *     one, standing on the floor, about as tall as she was designed.
 *  2. Every dance and idle the page picks has its file; each reads, turns only bones she has, loops
 *     whole bars, and its own tempo is the one the page plans with (dances.ts).
 *  3. Played as the page plays it (three.js clips, time in beats): her feet stay near the floor and
 *     her hips over her feet, nothing flies off.
 *  4. Which dance when: the same on every screen, from those for the night's stretch, near the song's
 *     tempo when one is, eight bars each, the next one different when it can be.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { danceAt, DANCE_BEATS, DANCES, IDLES, idleAt, readDance } from "../src/party/dj/dancer/dances";
import { danceClip } from "../src/party/dj/dancer/her";
import type { Mood } from "../src/shared/dj/dance";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}

const here = fileURLToPath(new URL("..", import.meta.url));
const dir = join(here, "public/models/dancer");

/** the file without its picture (three.js would need a browser to read it) */
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
  json.extensionsUsed = (json.extensionsUsed ?? []).filter((e: string) => e !== "EXT_texture_webp");
  json.extensionsRequired = (json.extensionsRequired ?? []).filter((e: string) => e !== "EXT_texture_webp");
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

const unzip = (f: string) => {
  const u = gunzipSync(readFileSync(f));
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
};

const BONES = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head"];
for (const s of ["Left", "Right"]) BONES.push(...["Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot"].map((n) => s + n));

async function main() {
  await MeshoptDecoder.ready;
  // 1. her model
  const herPath = join(dir, "her.glb.gz");
  ok(existsSync(herPath), "her model's file is there");
  const raw = gunzipSync(readFileSync(herPath));
  const json = JSON.parse(new TextDecoder().decode(raw.subarray(20, 20 + new DataView(raw.buffer, raw.byteOffset).getUint32(12, true))));
  ok(json.images?.length === 1 && json.images[0].mimeType === "image/webp", "with her picture, one WebP");
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(withoutTextures(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)), "");
  const meshes: THREE.SkinnedMesh[] = [];
  const bones = new Map<string, THREE.Object3D>();
  gltf.scene.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(x as THREE.SkinnedMesh);
    if ((x as THREE.Bone).isBone) bones.set(x.name, x);
  });
  ok(meshes.length === 1, "one skinned mesh");
  for (const b of BONES) ok(bones.has(b), `her skeleton has ${b}`);
  const unturned = [...bones.values()].every((b) => b.quaternion.angleTo(new THREE.Quaternion()) < 1e-4);
  ok(unturned, "every bone's rest turn is none (the dances are made for that)");
  const m = meshes[0];
  const pos = m.geometry.getAttribute("position");
  const w = m.geometry.getAttribute("skinWeight");
  let sumOff = 0;
  for (let i = 0; i < w.count; i++) sumOff = Math.max(sumOff, Math.abs(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i) - 1));
  ok(sumOff < 0.01, `every vertex's weights add up to one (out by ${sumOff.toFixed(4)} at most)`);
  // (the positions are quantized: at rest every bone's matrix times its inverse bind is the same
  // matrix, the one back to metres)
  gltf.scene.updateMatrixWorld(true);
  const toMetres = m.skeleton.bones[0].matrixWorld.clone().multiply(m.skeleton.boneInverses[0]);
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute).applyMatrix4(toMetres);
  const tall = box.max.y - box.min.y;
  ok(Math.abs(box.min.y) < 0.01 && tall > 1.65 && tall < 1.8, `standing on the floor, ${tall.toFixed(2)} m tall in her boots`);
  ok(m.geometry.index && m.geometry.index.count / 3 < 80000, `${m.geometry.index ? m.geometry.index.count / 3 : 0} triangles: light enough for a TV`);
  const hips = bones.get("Hips") as THREE.Object3D;
  const hipsRest = hips.position.clone();

  // 2 and 3. her dances
  m.updateMatrixWorld(true);
  for (const d of [...DANCES, ...IDLES]) {
    const f = join(dir, "dance", `${d.id}.bin.gz`);
    if (!existsSync(f)) {
      ok(false, `${d.id}: its file is there`);
      continue;
    }
    const dance = readDance(unzip(f));
    const h = dance.head;
    ok(h.id === d.id && h.bones.every((b) => bones.has(b)), `${d.id}: reads, turns only her bones (${h.bones.length})`);
    ok(h.beats > 0 && (h.beats % 4 === 0 || h.beats === 2) && h.frames > 10, `${d.id}: a loop of whole bars (${h.beats} beats, ${h.frames} frames)`);
    ok(Math.abs(60 / h.beat - d.bpm) < 0.5, `${d.id}: its own tempo is the planned one (${(60 / h.beat).toFixed(1)} bpm)`);
    // played as the page plays it
    const clip = danceClip(dance, hipsRest);
    ok(Math.abs(clip.duration - h.beats) < 1e-6, `${d.id}: a clip ${h.beats} beats long`);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const a = mixer.clipAction(clip);
    a.play();
    let lowFoot = 0;
    let far = 0;
    const lf = bones.get("LeftFoot") as THREE.Object3D;
    const rf = bones.get("RightFoot") as THREE.Object3D;
    const v = new THREE.Vector3();
    for (let k = 0; k < 24; k++) {
      a.time = (k / 24) * h.beats;
      mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      const fy = Math.min(lf.getWorldPosition(v).y, rf.getWorldPosition(new THREE.Vector3()).y);
      lowFoot = Math.max(lowFoot, Math.abs(fy - 0.19));
      const hp = hips.getWorldPosition(new THREE.Vector3());
      far = Math.max(far, Math.hypot(hp.x, hp.z));
    }
    ok(lowFoot < 0.3, `${d.id}: a foot near the floor all through (ankle off its rest height by ${lowFoot.toFixed(2)} m at most)`);
    ok(far < 0.45, `${d.id}: her hips stay over her spot (${far.toFixed(2)} m out at most)`);
    a.stop();
    mixer.uncacheRoot(gltf.scene);
  }

  // 4. which dance when
  const moods: Mood[] = ["warm", "build", "peak", "cool", "slow"];
  ok(danceAt(40, "peak", 125) === danceAt(40, "peak", 125), "the same beat, the same dance (on every screen)");
  ok(danceAt(0, "peak", 125) === danceAt(DANCE_BEATS - 1, "peak", 125), `one dance for ${DANCE_BEATS} beats`);
  for (const mood of moods)
    for (const bpm of [80, 100, 125, 140]) {
      const seen = new Set<string>();
      let wrong = 0;
      let last = "";
      let repeats = 0;
      for (let k = 0; k < 12; k++) {
        const id = danceAt(k * DANCE_BEATS, mood, bpm);
        seen.add(id);
        const d = DANCES.find((x) => x.id === id);
        if (!d || !d.moods.includes(mood)) wrong++;
        if (id === last) repeats++;
        last = id;
      }
      ok(wrong === 0, `${mood} at ${bpm}: only its stretch's dances`);
      if (seen.size > 1) ok(repeats === 0, `${mood} at ${bpm}: never the same dance twice running (${seen.size} of them)`);
    }
  const near = (bpm: number) => Math.abs(Math.log(bpm / (DANCES.find((d) => d.id === danceAt(0, "peak", bpm)) as { bpm: number }).bpm));
  ok(near(118) < Math.log(1.25), "a song at 118: a dance near its tempo");
  ok(IDLES.some((i) => i.id === idleAt(5).id) && idleAt(5).id !== idleAt(65).id, "with no song, one idle, then the other");
}

main()
  .then(() => {
    if (failed) {
      console.log(`\n${failed} failed`);
      process.exit(1);
    }
    console.log("\nall passed");
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

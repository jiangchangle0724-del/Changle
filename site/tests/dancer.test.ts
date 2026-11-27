/*
 * The big screen's dancer since Nov 18 (src/party/dj/dancer/, made by scripts/dj-dancer/): her
 * outfits' files and her dances, read as the TV page reads them. Run with `npx tsx tests/dancer.test.ts`
 *  1. Each outfit's model loads (three.js, like the page, without its picture): one skinned mesh on
 *     the Mixamo-named skeleton the dances are made for, every vertex on four bones at most that add up
 *     to one, standing on the floor, about as tall as she was designed; her hair's swinging bones (and
 *     a skirt's) there, with the shapes they're kept off; her lids' colour for her blink.
 *  2. Every dance and idle the page picks has its file; each reads, turns only bones she has, loops
 *     whole bars, and its own tempo is the one the page plans with (dances.ts).
 *  3. Played as the page plays it (three.js clips, time in beats), in each outfit: her feet stay near
 *     the floor and her hips over her feet, nothing flies off; her hair and skirt swing (springs.ts)
 *     and stay out of her, and come to rest when she stands still.
 *  4. What she wears and dances when (Nov 18): a song's look by its tempo, the night's stretch's with
 *     the DJ; the same dance on every screen, from the look's, near the song's tempo when one is, eight
 *     bars each, the next one different.
 *  5. Her walks across the stage (Nov 20), one a look: checked like her dances (2 and 3), and a step
 *     takes her as far as her planted foot slides back in it (her `stride`), so her feet keep still on
 *     the stage going by; a step on each beat, or on every other on a much faster song.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { danceAt, DANCE_BEATS, danceRate, DANCES, herFile, IDLES, idleAt, lookOf, LOOKS, OUTFITS, outfitFor, readDance, stepsPerBeat, WALKS, type Look } from "../src/party/dj/dancer/dances";
import { danceClip } from "../src/party/dj/dancer/her";
import { makeSprings, type SpringData } from "../src/party/dj/dancer/springs";
import { feetOf, plantFeet, standFeet } from "../src/party/dj/dancer/plant";
import { entryOf } from "../src/party/dj/dancer/entry";
import { bodyOf, handDepth, keepHands } from "../src/party/dj/dancer/hands";
import { CAPTURED_SKATE } from "./support/captured";
import { LIMITS, motionFacts } from "./support/motion";

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

/** One outfit: its model (1), the dances on it (2 and 3, each dance's file read once), its springs (3). */
async function oneOutfit(outfit: string, checkedDances: Set<string>) {
  const at = `${outfit}:`;
  // 1. her model
  const herPath = join(here, "public", herFile(outfit));
  ok(existsSync(herPath), `${at} her model's file is there`);
  if (!existsSync(herPath)) return;
  const raw = gunzipSync(readFileSync(herPath));
  const json = JSON.parse(new TextDecoder().decode(raw.subarray(20, 20 + new DataView(raw.buffer, raw.byteOffset).getUint32(12, true))));
  ok(json.images?.length === 1 && json.images[0].mimeType === "image/webp", `${at} with her picture, one WebP`);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(withoutTextures(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)), "");
  const meshes: THREE.SkinnedMesh[] = [];
  const bones = new Map<string, THREE.Object3D>();
  gltf.scene.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(x as THREE.SkinnedMesh);
    if ((x as THREE.Bone).isBone) bones.set(x.name, x);
  });
  ok(meshes.length === 1, `${at} one skinned mesh`);
  const missing = BONES.filter((b) => !bones.has(b));
  ok(!missing.length, `${at} her skeleton has the dances' bones${missing.length ? ` (not ${missing.join(", ")})` : ""}`);
  const unturned = [...bones.values()].every((b) => b.quaternion.angleTo(new THREE.Quaternion()) < 1e-4);
  ok(unturned, `${at} every bone's rest turn is none (the dances are made for that)`);
  const m = meshes[0];
  const pos = m.geometry.getAttribute("position");
  const w = m.geometry.getAttribute("skinWeight");
  let sumOff = 0;
  for (let i = 0; i < w.count; i++) sumOff = Math.max(sumOff, Math.abs(w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i) - 1));
  ok(sumOff < 0.01, `${at} every vertex's weights add up to one (out by ${sumOff.toFixed(4)} at most)`);
  // (the positions are quantized: at rest every bone's matrix times its inverse bind is the same
  // matrix, the one back to metres)
  gltf.scene.updateMatrixWorld(true);
  const toMetres = m.skeleton.bones[0].matrixWorld.clone().multiply(m.skeleton.boneInverses[0]);
  const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute).applyMatrix4(toMetres);
  const tall = box.max.y - box.min.y;
  ok(Math.abs(box.min.y) < 0.01 && tall > 1.65 && tall < 1.8, `${at} standing on the floor, ${tall.toFixed(2)} m tall`);
  ok(m.geometry.index && m.geometry.index.count / 3 < 80000, `${at} ${m.geometry.index ? m.geometry.index.count / 3 : 0} triangles: light enough for a TV`);
  // her blink: the colour of her lids (where her eyes are is in her picture's alpha, eyes.py)
  const lid = (gltf.scene.userData as { dancer?: { lid?: number[] } }).dancer?.lid;
  ok(Array.isArray(lid) && lid.length === 3 && lid.every((v) => v > 0.3 && v < 1), `${at} her lids' colour, for her blink (${lid?.join(", ")})`);
  // her expressions (Nov 21; Steve: "表情可以做但要很细致"): a smile and her brows up, as morph targets, each
  // moving only her face (her head's front, above her chin) and by under 4 mm (3 as made, the file's
  // compression rounding it a little)
  {
    const m = meshes[0];
    const d = m.morphTargetDictionary ?? {};
    const tg = m.geometry.morphAttributes.position ?? [];
    const top = m.geometry.boundingBox ? m.geometry.boundingBox.max.y : (m.geometry.computeBoundingBox(), m.geometry.boundingBox!.max.y);
    const pos = m.geometry.attributes.position;
    for (const name of ["smile", "brows"]) {
      const a = tg[d[name]];
      let most = 0;
      let off = 0;
      let moved = 0;
      for (let i = 0; a && i < a.count; i++) {
        const v = Math.hypot(a.getX(i), a.getY(i), a.getZ(i));
        if (v < 1e-5) continue;
        moved++;
        most = Math.max(most, v);
        if (pos.getY(i) < top - 0.32 || pos.getZ(i) < 0) off++;
      }
      ok(!!a && moved > 20 && most < 0.004 && off === 0, `${at} her ${name}: ${moved} points of her face, ${(most * 1000).toFixed(1)} mm at most, none elsewhere`);
    }
  }
  // her springs: the hair's bones (and a skirt's), each in her skeleton, the shapes they're kept off on her bones
  const sp = (gltf.scene.userData as { dancer?: { springs?: SpringData } }).dancer?.springs;
  const groups = sp?.groups.map((g) => g.name) ?? [];
  ok(groups.includes("hair"), `${at} her hair swings (${groups.join(", ") || "nothing swings"})`);
  if (outfit !== "club") ok(groups.includes("skirt"), `${at} and her skirt`);
  const springBones = sp?.groups.flatMap((g) => g.bones.map((b) => b.name)) ?? [];
  ok(springBones.every((b) => bones.has(b)) && m.skeleton.bones.filter((b) => springBones.includes(b.name)).length === springBones.length, `${at} the ${springBones.length} swinging bones are hers, in the skin`);
  ok(Object.values(sp?.colliders ?? {}).every((c) => bones.has(c.bone) && c.r > 0.02 && c.r < 0.2), `${at} the shapes they're kept off sit on her bones`);
  const hips = bones.get("Hips") as THREE.Object3D;
  const hipsRest = hips.position.clone();
  const lf = bones.get("LeftFoot") as THREE.Object3D;
  const rf = bones.get("RightFoot") as THREE.Object3D;
  const ankle = lf.getWorldPosition(new THREE.Vector3()).y;
  const toe = (bones.get("LeftToeBase") as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y;

  // 2 and 3. her dances
  m.updateMatrixWorld(true);
  const springs = makeSprings(sp, bones);
  // her shape, that her hands are kept out of (Nov 25; dancer/hands.ts)
  const body = bodyOf(gltf.scene);
  ok(body && body.parts.length === 6 && body.arms.length === 2, `${at} her trunk's and thighs' shape read from her, for her hands (${body?.parts.map((p) => p.bone.name).join(", ")})`);
  const walks: readonly { id: string; bpm: number; stride?: number }[] = Object.values(WALKS);
  let lastClip: THREE.AnimationClip | null = null;
  for (const d of [...DANCES, ...IDLES, ...walks]) {
    const f = join(dir, "dance", `${d.id}.bin.gz`);
    if (!existsSync(f)) {
      ok(false, `${d.id}: its file is there`);
      continue;
    }
    const dance = readDance(unzip(f));
    const h = dance.head;
    if (!checkedDances.has(d.id)) {
      checkedDances.add(d.id);
      ok(h.id === d.id && h.bones.every((b) => bones.has(b)), `${d.id}: reads, turns only her bones (${h.bones.length})`);
      ok(h.beats > 0 && (h.beats % 4 === 0 || h.beats === 2) && h.frames > 10, `${d.id}: a loop of whole bars (${h.beats} beats, ${h.frames} frames)`);
      ok(Math.abs(60 / h.beat - d.bpm) < 0.5, `${d.id}: its own tempo is the planned one (${(60 / h.beat).toFixed(1)} bpm)`);
    }
    // played as the page plays it
    const clip = danceClip(dance, hipsRest);
    ok(Math.abs(clip.duration - h.beats) < 1e-6, `${at} ${d.id}: a clip ${h.beats} beats long`);
    const mixer = new THREE.AnimationMixer(gltf.scene);
    const a = mixer.clipAction(clip);
    a.play();
    let lowFoot = 0;
    let far = 0;
    const v = new THREE.Vector3();
    for (let k = 0; k < 24; k++) {
      a.time = (k / 24) * h.beats;
      mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      const fy = Math.min(lf.getWorldPosition(v).y, rf.getWorldPosition(new THREE.Vector3()).y);
      lowFoot = Math.max(lowFoot, Math.abs(fy - ankle));
      const hp = hips.getWorldPosition(new THREE.Vector3());
      far = Math.max(far, Math.hypot(hp.x, hp.z));
    }
    ok(lowFoot < 0.3, `${at} ${d.id}: a foot near the floor all through (ankle off its rest height by ${lowFoot.toFixed(2)} m at most)`);
    // 5. a walk: how far a step takes her, from how fast her planted foot (the lower one) slides back
    if (d.stride && !checkedDances.has(`${d.id} stride`)) {
      checkedDances.add(`${d.id} stride`);
      const n = h.frames;
      const at2 = (k: number) => {
        a.time = (k / n) * h.beats;
        mixer.update(0);
        gltf.scene.updateMatrixWorld(true);
        return [lf.getWorldPosition(new THREE.Vector3()), rf.getWorldPosition(new THREE.Vector3())];
      };
      const speeds: number[] = [];
      for (let k = 0; k < n; k++) {
        const [l0, r0] = at2(k);
        const [l1, r1] = at2(k + 1);
        if (Math.abs(l0.y - r0.y) < 0.01) continue;
        const [p0, p1] = l0.y < r0.y ? [l0, l1] : [r0, r1];
        speeds.push(((p0.z - p1.z) / (h.beats / n)) * (1 / h.beat));
      }
      speeds.sort((x, y) => x - y);
      const step = speeds[speeds.length >> 1] * h.beat;
      ok(Math.abs(step - d.stride) < 0.06, `${d.id}: a step takes her ${d.stride} m (her planted foot slides back ${step.toFixed(2)} m in one)`);
    }
    ok(far < 0.45, `${at} ${d.id}: her hips stay over her spot (${far.toFixed(2)} m out at most)`);
    // 6. the common mistakes in motion (Nov 21), on her first outfit: every frame as the page plays it,
    // her hands kept out of her as the page keeps them (Nov 25; Steve: "帮我查这个舞蹈，手会穿身体")
    if (!checkedDances.has(`${d.id} motion`)) {
      checkedDances.add(`${d.id} motion`);
      const n = h.frames;
      const pose = (k: number) => {
        a.time = (k / n) * h.beats;
        mixer.update(0);
        gltf.scene.updateMatrixWorld(true);
        if (body) keepHands(body);
        return { at: (b: string) => (bones.get(b) as THREE.Object3D).getWorldPosition(new THREE.Vector3()), turn: (b: string) => (bones.get(b) as THREE.Object3D).quaternion, inside: body ? handDepth(body).depth : undefined };
      };
      const f = motionFacts(n, n / (h.beats * h.beat), pose, { ankle, toe }, !!d.stride);
      if (process.env.MOTION_TABLE) console.log("MOTION", d.id, JSON.stringify(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Math.round(v * 1000) / 1000]))));
      // (her feet may slide as much as the real dancer's did there: support/motion.ts, LIMITS)
      const limit = { ...LIMITS, skate: Math.max(LIMITS.skate, (CAPTURED_SKATE[d.id] ?? 0) + 0.1) };
      const bad = (Object.keys(limit) as (keyof typeof limit)[]).filter((k) => f[k] > limit[k]);
      ok(!bad.length, `${d.id}: moves like a person (${bad.length ? bad.map((k) => `${k} ${f[k].toFixed(2)} over ${limit[k].toFixed(2)}`).join(", ") : "no skating, sinking, floating, knees bending back, hands in her, falling off a foot, jerks or seam"})`);
    }
    // 7. the hand-over into it from the dance before (Nov 21; Steve: 换舞时脚滑), blended as the page
    // blends them, her feet planted (dancer/plant.ts): the foot waiting stays where it stood, the one
    // stepping comes off the floor on the way, and at the end she stands as the new dance has her
    if (lastClip && !checkedDances.has(`${d.id} handover`)) {
      checkedDances.add(`${d.id} handover`);
      const mx = new THREE.AnimationMixer(gltf.scene);
      const a1 = mx.clipAction(lastClip), a2 = mx.clipAction(clip);
      a1.play();
      a2.play();
      const feet = feetOf(gltf.scene)!;
      const token = {};
      const N = 20;
      let wait = 0;
      let lifted = true;
      let end = 0;
      const anim = [new THREE.Vector3(), new THREE.Vector3()];
      for (let s = -1; s <= N; s++) {
        const k = Math.max(0, s / N);
        const e = k * k * (3 - 2 * k);
        a1.time = (lastClip.duration / 2 + (s + 1) * 0.06) % lastClip.duration;
        a2.time = ((s + 1) * 0.06) % clip.duration;
        a1.setEffectiveWeight(s < 0 ? 1 : 1 - e);
        a2.setEffectiveWeight(s < 0 ? 0 : e);
        mx.update(0);
        gltf.scene.updateMatrixWorld(true);
        feet.legs.forEach((l, i) => l.foot.getWorldPosition(anim[i]));
        plantFeet(feet, s < 0 ? null : token, k);
        if (s < 0 || !feet.plant) continue;
        // (a foot waiting for its step, along the floor: its heel may rise, when the new dance stands her
        // taller than her leg reaches)
        for (let j = 0; j < 2; j++) {
          const w = feet.legs[j].foot.getWorldPosition(new THREE.Vector3()).sub(feet.plant[j]);
          if (k < feet.start[j]) wait = Math.max(wait, Math.hypot(w.x, w.z));
        }
        const i = feet.first;
        const p = (k - feet.start[i]) / 0.45;
        if (p > 0.3 && p < 0.7 && anim[i].distanceTo(feet.plant[i]) > 0.04) {
          const y = feet.legs[i].foot.getWorldPosition(new THREE.Vector3()).y;
          lifted &&= y > Math.min(feet.plant[i].y, anim[i].y) + 0.005;
        }
      }
      feet.legs.forEach((l, i) => (end = Math.max(end, l.foot.getWorldPosition(new THREE.Vector3()).distanceTo(anim[i]))));
      ok(wait < 0.005 && lifted && end < 0.001, `${at} ${lastClip.name || "before"} into ${d.id}: her feet stay where they stand, then step (waiting foot off ${(wait * 1000).toFixed(1)} mm, at the end ${(end * 1000).toFixed(1)} mm off)`);
      mx.stopAllAction();
      mx.uncacheRoot(gltf.scene);
    }
    // 8. her standing feet as the page keeps them (Nov 23; Steve: "跳舞的动作太多问题了，仔细核查"; plant.ts
    // standFeet; not her walks, which the page doesn't hold): seven seconds of the dance, and a foot on the floor doesn't slide (nine in ten of its
    // moments under 0.15 m a second, as the motion checks ask of a dance), and no foot ever jumps
    if (!checkedDances.has(`${d.id} stand`) && !walks.some((w) => w.id === d.id)) {
      checkedDances.add(`${d.id} stand`);
      const mx = new THREE.AnimationMixer(gltf.scene);
      const act = mx.clipAction(clip);
      act.play();
      const feet = feetOf(gltf.scene)!;
      const fps = 60;
      const slides: number[] = [];
      let fastest = 0;
      const last: (THREE.Vector3 | null)[] = [null, null];
      for (let s = 0; s < fps * 7; s++) {
        act.time = (s / fps) % clip.duration;
        mx.update(0);
        gltf.scene.updateMatrixWorld(true);
        standFeet(feet, 1 / fps, true);
        feet.legs.forEach((l, i) => {
          const p = l.foot.getWorldPosition(new THREE.Vector3());
          const was = last[i];
          if (was && s > fps) {
            if (p.y < feet.low[i] + 0.02 && was.y < feet.low[i] + 0.02) slides.push(Math.hypot(p.x - was.x, p.z - was.z) * fps);
            fastest = Math.max(fastest, p.distanceTo(was) * fps);
          }
          last[i] = p;
        });
      }
      slides.sort((a, b) => a - b);
      const slide = slides.length ? slides[Math.floor(slides.length * 0.9)] : 0;
      ok(slide < 0.15 && fastest < 7, `${at} ${d.id}: her standing feet stay put (${slide.toFixed(2)} m/s, fastest ${fastest.toFixed(1)} m/s)`);
      mx.stopAllAction();
      mx.uncacheRoot(gltf.scene);
    }
    // 9. where it starts when it comes in (Nov 25; dancer/entry.ts): on a whole bar, and the bar where her hips
    // face nearest the room through its first beats (or the first bar, unless another is much nearer)
    if (!checkedDances.has(`${d.id} entry`) && DANCES.some((x) => x.id === d.id)) {
      checkedDances.add(`${d.id} entry`);
      const tr = clip.tracks.find((x) => x.name === "Hips.quaternion")!;
      const it = new THREE.QuaternionLinearInterpolant(tr.times, tr.values, 4, new Float32Array(4));
      const turns = {
        beats: () => clip.duration,
        facing: (_: string, t: number) => {
          const v = it.evaluate(((t % clip.duration) + clip.duration) % clip.duration);
          const f = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(v[0], v[1], v[2], v[3]));
          return Math.atan2(f.x, f.z);
        },
      };
      const off = (skip: number) => Math.max(...[0, 0.5, 1, 1.5].map((s) => Math.abs(turns.facing("", skip + s))));
      const skip = entryOf(turns, d.id, 0, 0);
      const bars = Array.from({ length: Math.ceil(clip.duration / 4) }, (_, i) => off(i * 4));
      ok(skip % 4 === 0 && skip < clip.duration && off(skip) <= Math.min(...bars) + 0.3 + 1e-6,
        `${at} ${d.id} comes in ${skip / 4} bars in, her hips ${Math.round((off(skip) * 180) / Math.PI)} degrees from the room at most`);
    }
    lastClip = clip;
    // her hair and skirt swinging through it, as the page swings them: never nowhere, never inside her
    if (springs && sp) {
      springs.reset();
      let bad = 0;
      let inside = 0;
      let moved = 0;
      const tips = sp.groups.flatMap((g) => g.bones.map((b) => ({ bone: bones.get(b.name)!, tail: new THREE.Vector3(...b.tail), cols: g.colliders.map((c) => sp.colliders[c]).filter(Boolean) })));
      const before = tips.map(() => new THREE.Vector3());
      const fps = 60;
      const beatS = 60 / d.bpm;
      for (let k = 0; k < fps * 4; k++) {
        a.time = ((k / fps / beatS) % h.beats + h.beats) % h.beats;
        mixer.update(0);
        springs.update(gltf.scene, 1 / fps);
        gltf.scene.updateMatrixWorld(true);
        tips.forEach((t, i) => {
          const p = t.tail.clone().applyMatrix4(t.bone.matrixWorld);
          if (!Number.isFinite(p.x + p.y + p.z)) bad++;
          if (k > 0 && p.distanceTo(before[i]) > 1e-4) moved++;
          before[i].copy(p);
          for (const c of t.cols) {
            const cb = bones.get(c.bone)!;
            const ca = new THREE.Vector3(...c.a).applyMatrix4(cb.matrixWorld);
            const cc = c.b ? new THREE.Line3(ca, new THREE.Vector3(...c.b).applyMatrix4(cb.matrixWorld)).closestPointToPoint(p, true, new THREE.Vector3()) : ca;
            if (p.distanceTo(cc) < c.r - 0.005) inside++;
          }
        });
      }
      ok(bad === 0, `${at} ${d.id}: her hair${groups.includes("skirt") ? " and skirt" : ""} swing, never off to nowhere`);
      ok(moved > tips.length * 10, `${at} ${d.id}: and do move (${moved} moves)`);
      ok(inside === 0, `${at} ${d.id}: and stay out of her (${inside} tips inside)`);
    }
    a.stop();
    mixer.uncacheRoot(gltf.scene);
  }
  // standing still a while: they come to rest, hanging
  if (springs && sp) {
    gltf.scene.traverse((x) => {
      if ((x as THREE.Bone).isBone && !sp.groups.some((g) => g.bones.some((b) => b.name === x.name))) x.quaternion.identity();
    });
    hips.position.copy(hipsRest);
    springs.reset();
    for (let k = 0; k < 600; k++) springs.update(gltf.scene, 1 / 60);
    const hairTip = bones.get(sp.groups[0].bones[sp.groups[0].bones.length - 1].name)!;
    const p0 = new THREE.Vector3().setFromMatrixPosition(hairTip.matrixWorld);
    for (let k = 0; k < 60; k++) springs.update(gltf.scene, 1 / 60);
    const p1 = new THREE.Vector3().setFromMatrixPosition(hairTip.matrixWorld);
    ok(p0.distanceTo(p1) < 0.002, `${at} standing still, her hair comes to rest (${(p0.distanceTo(p1) * 1000).toFixed(1)} mm in a second)`);
  }
}

async function main() {
  await MeshoptDecoder.ready;
  const outfits = [...new Set(Object.values(OUTFITS).flat())];
  // (Nov 21, Steve: "直接用第一个人物的模型脸，只给她换几套衣服": the first one, Nov 14's, in every look)
  ok(outfits.includes("club"), `her outfits: ${outfits.join(", ")}`);
  const checkedDances = new Set<string>();
  for (const outfit of outfits) await oneOutfit(outfit, checkedDances);

  // 4. what she wears and dances when
  ok(lookOf(75, "peak") === "sweet" && lookOf(100, "warm") === "party" && lookOf(128, "warm") === "club", "a song's look by its own tempo: a ballad sweet, one in between party, a fast one club");
  ok(lookOf(null, "cool") === "sweet" && lookOf(null, "slow") === "sweet" && lookOf(null, "warm") === "party" && lookOf(null, "build") === "club" && lookOf(null, "peak") === "club", "no song's tempo: the night's stretch's look");
  ok(LOOKS.every((l) => OUTFITS[l].length > 0), "every look has an outfit to wear");
  // (a song wears the same outfit every time; songs spread over the look's outfits)
  ok(outfitFor("party", "abc") === outfitFor("party", "abc") && outfitFor("sweet", null) === OUTFITS.sweet[0], "a song's outfit is its own");
  const worn = new Set(Array.from({ length: 40 }, (_, i) => outfitFor("club", `song${i}`)));
  ok(worn.size === OUTFITS.club.length, `songs wear all of a look's outfits (${[...worn].join(", ")})`);
  ok(LOOKS.every((l) => WALKS[l].stride > 0.4 && WALKS[l].stride < 0.9), "every look has a walk, a step of half a metre or so");
  ok(stepsPerBeat(87.8, 90) === 1 && stepsPerBeat(124.1, 72) === 1 && stepsPerBeat(87.8, 128) === 0.5, "a step on each beat, on every other when the song is much faster than her walk");
  ok(danceAt(40, "club", 125) === danceAt(40, "club", 125), "the same beat, the same dance (on every screen)");
  ok(danceAt(0, "club", 125) === danceAt(DANCE_BEATS - 1, "club", 125), `one dance for ${DANCE_BEATS} beats`);
  for (const look of LOOKS as readonly Look[])
    for (const bpm of [72, 80, 100, 125, 140]) {
      const seen = new Set<string>();
      let wrong = 0;
      let last = "";
      let repeats = 0;
      for (let k = 0; k < 12; k++) {
        const id = danceAt(k * DANCE_BEATS, look, bpm);
        seen.add(id);
        const d = DANCES.find((x) => x.id === id);
        if (!d || !d.looks.includes(look)) wrong++;
        if (id === last) repeats++;
        last = id;
      }
      ok(wrong === 0, `${look} at ${bpm}: only its look's dances`);
      ok(seen.size > 1 && repeats === 0, `${look} at ${bpm}: never the same dance all song, nor twice running (${seen.size} of them)`);
    }
  const near = (bpm: number) => Math.abs(Math.log(bpm / (DANCES.find((d) => d.id === danceAt(0, "club", bpm)) as { bpm: number }).bpm));
  ok(near(118) < Math.log(1.25), "a song at 118: a dance near its tempo");
  // (Nov 25: never hurried: in every look and at every tempo with dances enough, each dance chosen goes at
  // most 12% faster than it was danced, or half-time)
  {
    let hurried = 0;
    let checked = 0;
    for (const look of LOOKS)
      for (let bpm = 70; bpm <= 175; bpm += 5)
        for (let k = 0; k < 8; k++) {
          const id = danceAt(k * DANCE_BEATS, look, bpm);
          const r = danceRate(id, bpm);
          const d = DANCES.find((x) => x.id === id)!;
          const pool = DANCES.filter((x) => x.looks.includes(look) && danceRate(x.id, bpm) !== null);
          if (pool.length < 2) continue;
          checked++;
          if (r === null || (bpm * r) / d.bpm > 1.1201) hurried++;
        }
    ok(checked > 200 && hurried === 0, `no dance hurried: ${checked} choices, ${hurried} more than 12% faster than it was danced`);
  }
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

/*
 * 跟着跳's dancer (src/party/dj/dancer/, made by scripts/dj-dancer/): her files and her moves, as
 * the TV page reads and solves them. Run with `npx tsx tests/dancer.test.ts`
 *  1. Every move of the routine (shared/dj/dance.ts) has its clip, and standing and sitting theirs.
 *  2. Her body loads (read with three.js like the page, without the textures): its parts, the
 *     expressions the page plays, which skin vertex each of its points is (to leave the covered out).
 *  3. Every outfit the page picks has its file, named the same, with its hair, its pieces hung on her
 *     own bones; and each covers her breasts and between her legs (nothing shows, whatever she wears).
 *  4. Every clip, solved for her body, keeps her hands and arms out of it: at most 2.5 cm into the
 *     shapes fitted to her (the solver's `inside.after`, as the accounts' figure is checked).
 *  5. A song's outfit: the same for everyone, from the night's stretch, never the one just worn.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { restNodes, rigFor } from "../src/account/figure/body";
import { bake } from "../src/account/figure/pose/anim";
import { OUTFITS, STYLES_FOR, outfitFor } from "../src/party/dj/dancer/files";
import { BASE, CLIPS, SITTING } from "../src/party/dj/dancer/moves";
import { DANCE_MOVES } from "../src/shared/dj/dance";

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
/** how far a clip may reach into her shapes (metres) */
const DEEPEST = 0.025;

// 1. the moves
const names = new Set(CLIPS.map((c) => c.name));
ok(names.size === CLIPS.length, `${CLIPS.length} clips, all named differently`);
for (const [id, m] of Object.entries(DANCE_MOVES)) ok(names.has(id) && SITTING.has(id) === m.sit, `${id} (${m.zh}) has its clip, danced ${m.sit ? "sitting" : "standing"}`);
ok(names.has("stand") && names.has("sit"), "and standing and sitting have theirs (between moves, before the music)");

/** the file without its pictures (three.js would need a browser to read them) */
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

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
async function load(rel: string) {
  const gltf = await loader.parseAsync(withoutTextures(new Uint8Array(gunzipSync(readFileSync(join(dir, rel))))), "");
  const meshes: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(x as THREE.SkinnedMesh);
  });
  return { root: gltf.scene, meshes };
}

/** a mesh's points at rest, in metres (the files pack them small and keep the way back in the bind matrices) */
function restPoints(m: THREE.SkinnedMesh, heads: Map<string, THREE.Vector3>) {
  const h0 = heads.get(m.skeleton.bones[0].name) ?? new THREE.Vector3();
  const M = new THREE.Matrix4().makeTranslation(h0.x, h0.y, h0.z).multiply(m.skeleton.boneInverses[0]);
  const p = m.geometry.attributes.position;
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(M));
  return out;
}

// 2. her body
const body = await load("body.glb.gz");
const parts = body.meshes.map((m) => m.name);
ok(["Body", "Eyes", "Eyebrows", "Eyelashes"].every((n) => parts.includes(n)), `her body, eyes, brows and lashes (${parts.join(", ")})`);
const skin = body.meshes.find((m) => m.name === "Body") as THREE.SkinnedMesh;
const targets = Object.keys(skin.morphTargetDictionary ?? {});
ok(["X_blinkL", "X_blinkR", "X_smile"].every((t) => targets.includes(t)), `her blinks and smile (${targets.join(", ")})`);
ok(!!skin.geometry.getAttribute("_weld"), "each point of her skin says which vertex it is (an outfit leaves out what it covers by them)");
const nodes = restNodes(body.root);
const heads = new Map<string, THREE.Vector3>();
{
  const at = new Map<string, THREE.Vector3>();
  for (const n of nodes) at.set(n.name, (n.parent ? (at.get(n.parent) as THREE.Vector3).clone() : new THREE.Vector3()).add(new THREE.Vector3(n.t[0], n.t[1], n.t[2])));
  for (const [k, v] of at) heads.set(k, v);
}
ok(nodes.length >= 54 && heads.has("LeftEye") && heads.has("Hips"), `her skeleton (${nodes.length} bones, Mixamo's names and her eyes)`);
const skinPts = restPoints(skin, heads);
const top = skinPts.reduce((m, p) => Math.max(m, p.y), 0);
ok(top > 1.6 && top < 1.75, `her height, soles to crown: ${top.toFixed(2)} m`);

// where nothing may show: each breast's most forward point, and between her legs
const spine1 = heads.get("Spine1") as THREE.Vector3;
const neck = heads.get("Neck") as THREE.Vector3;
const bust = [1, -1].map((s) => skinPts.filter((p) => s * p.x > 0.03 && s * p.x < 0.16 && p.y > spine1.y && p.y < neck.y).reduce((a, b) => (b.z > a.z ? b : a)));
const hips = heads.get("Hips") as THREE.Vector3;
const crotch = skinPts.filter((p) => Math.abs(p.x) < 0.004 && p.y > 0.4 && p.y < hips.y).reduce((a, b) => (b.y < a.y ? b : a));
// (and the front, just above: the skin's most forward point there)
const mound = skinPts.filter((p) => Math.abs(p.x) < 0.01 && Math.abs(p.y - crotch.y - 0.04) < 0.01).reduce((a, b) => (b.z > a.z ? b : a));
const private_ = [...bust, crotch, mound];

// 3. the outfits
const hairs = new Set<string>();
const bones = new Set(nodes.map((n) => n.name));
for (const o of OUTFITS) {
  const rel = `outfit/${o.id}.glb.gz`;
  if (!existsSync(join(dir, rel))) {
    ok(false, `${o.id}: no file ${rel}`);
    continue;
  }
  const f = await load(rel);
  const info = f.root.userData.outfit as { id: string; zh: string; en: string; style: string; hair: string; hairColor: string; lift: number; hide: [number, number][] };
  ok(info && info.id === o.id && info.zh === o.zh && info.en === o.en && info.style === o.style, `${o.id} (${o.zh}, ${o.en}): its file, named as the page names it`);
  ok(info && existsSync(join(dir, `hair/${info.hair}.glb.gz`)) && /^#[0-9a-f]{6}$/i.test(info.hairColor), `${o.id}: its hair (${info?.hair}, ${info?.hairColor})`);
  hairs.add(info?.hair);
  ok(info && info.lift >= 0 && info.lift < 0.05 && info.hide.every(([a, b]) => Number.isInteger(a) && Number.isInteger(b) && a <= b), `${o.id}: lifts her ${((info?.lift ?? 0) * 100).toFixed(1)} cm, leaves ${info?.hide.reduce((s, [a, b]) => s + b - a + 1, 0)} of her skin's vertices out`);
  ok(f.meshes.length > 0 && f.meshes.every((m) => m.skeleton.bones.every((b) => bones.has(b.name))), `${o.id}: ${f.meshes.map((m) => m.name).join(", ")}, all on her own bones`);
  // how near its opaque surface comes to the places nothing may show (a sheer piece doesn't count)
  const near = private_.map(() => Infinity);
  const tri = new THREE.Triangle();
  const at = new THREE.Vector3();
  for (const m of f.meshes.filter((x) => !(x.material as THREE.Material).transparent)) {
    const pts = restPoints(m, heads);
    const idx = m.geometry.index;
    if (!idx) continue;
    for (let t = 0; t < idx.count; t += 3) {
      tri.set(pts[idx.getX(t)], pts[idx.getX(t + 1)], pts[idx.getX(t + 2)]);
      private_.forEach((p, k) => {
        near[k] = Math.min(near[k], tri.closestPointToPoint(p, at).distanceTo(p));
      });
    }
  }
  ok(near.every((d) => d < 0.03), `${o.id}: covers her breasts and between her legs (nearest piece ${near.map((d) => (d * 100).toFixed(1)).join(", ")} cm off)`);
}
for (const h of hairs) {
  const f = await load(`hair/${h}.glb.gz`);
  ok(f.meshes.length === 1 && f.meshes[0].skeleton.bones.every((b) => bones.has(b.name)), `hair ${h}: on her own bones`);
}

// 4. every clip, out of her body
{
  const rig = rigFor(nodes, [skin]);
  let worst = { cm: 0, clip: "" };
  const t0 = performance.now();
  for (const clip of CLIPS) {
    const b = bake(rig, clip, BASE);
    const cm = b.inside.after * 100;
    if (cm > worst.cm) worst = { cm, clip: clip.name };
    if (b.inside.after > DEEPEST) ok(false, `${clip.name}: ${cm.toFixed(1)} cm into her (as written ${(b.inside.before * 100).toFixed(1)})`);
  }
  ok(worst.cm <= DEEPEST * 100, `all ${CLIPS.length} clips keep her arms out of her body (deepest ${worst.cm.toFixed(1)} cm, ${worst.clip || "none"}), solved in ${(performance.now() - t0).toFixed(0)} ms`);
}

// 5. a song's outfit
{
  const ids = new Set(OUTFITS.map((o) => o.id));
  ok(outfitFor(null) === OUTFITS[0].id, "no song yet: the first outfit");
  ok(outfitFor("song-a", null, "peak") === outfitFor("song-a", null, "peak"), "the same song, the same outfit (on every screen)");
  let repeats = 0;
  let outOfStyle = 0;
  for (const mood of Object.keys(STYLES_FOR) as (keyof typeof STYLES_FOR)[]) {
    let last: string | null = null;
    for (let i = 0; i < 60; i++) {
      const id = outfitFor(`song-${i}`, last, mood);
      if (!ids.has(id)) outOfStyle++;
      if (id === last) repeats++;
      if (!STYLES_FOR[mood].includes((OUTFITS.find((o) => o.id === id) as { style: (typeof OUTFITS)[number]["style"] }).style)) outOfStyle++;
      last = id;
    }
  }
  ok(repeats === 0, "never the outfit she just had on");
  ok(outOfStyle === 0, "always one of the looks for the night's stretch");
  const seen = new Set(Array.from({ length: 200 }, (_, i) => outfitFor(`s${i}`, null, "build")));
  ok(seen.size >= 4, `the build's songs bring ${seen.size} different looks`);
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");

/*
 * The 3D figure's moves (src/account/figure/): solved for each body the way the page does it, and
 * kept out of the body. Run with `npx tsx tests/figure.test.ts`
 *  1. Every move the page offers has its clips, a Chinese and an English name.
 *  2. Both figures load (their files, read with three.js like the page, without the textures).
 *  3. Every clip, solved for each body, keeps the hands and arms out of the body: at most a couple
 *     of centimetres into the shapes fitted to it (they're a little fuller than the skin), the
 *     depth the solver reports as `inside.after`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { restNodes, rigFor } from "../src/account/figure/body";
import { MOVES } from "../src/account/figure/moves";
import { bake } from "../src/account/figure/pose/anim";
import { BASE, CLIPS } from "../src/account/figure/pose/keys";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}

const here = fileURLToPath(new URL("..", import.meta.url));
/** how far a clip may reach into the body's shapes (metres) */
const DEEPEST = 0.025;

// 1. the moves and their clips
const clipNames = new Set(CLIPS.map((c) => c.name));
ok(clipNames.size === CLIPS.length, `${CLIPS.length} clips, all named differently`);
ok(new Set(MOVES.map((m) => m.id)).size === MOVES.length, `${MOVES.length} moves, all different`);
for (const m of MOVES as readonly { id: string; zh: string; en: string; clip?: string; intro?: string }[]) {
  const need = [m.clip ?? m.id, ...(m.intro ? [m.intro] : [])];
  ok(need.every((n) => clipNames.has(n)) && m.zh.trim() && m.en.trim(), `${m.id} (${m.zh}, ${m.en}) has its clips: ${need.join(", ")}`);
}

/** the file without its pictures (three.js would need a browser to read them) */
function withoutTextures(glb: Uint8Array): ArrayBuffer {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLen)));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    if (m.pbrMetallicRoughness) delete m.pbrMetallicRoughness.baseColorTexture;
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

async function load(sex: string) {
  const gz = readFileSync(join(here, `public/models/figure/${sex}.glb.gz`));
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(withoutTextures(new Uint8Array(gunzipSync(gz))), "");
  const meshes: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(x as THREE.SkinnedMesh);
  });
  return { root: gltf.scene, meshes };
}

for (const sex of ["male", "female"]) {
  // 2. the figure, as the page reads it
  const { root, meshes } = await load(sex);
  const names = meshes.map((m) => m.name);
  ok(["Body", "Clothes", "Shoes", "Eyes"].every((n) => names.includes(n)), `${sex}: the file has its body, clothes, shoes and eyes (${names.join(", ")})`);
  const rig = rigFor(restNodes(root), meshes.filter((m) => m.name === "Body" || m.name === "Clothes"));
  ok(Math.abs(rig.k - 1) < 0.02, `${sex}: drawn at the size the moves were written for (eyes at ${rig.k.toFixed(3)} of it)`);
  // 3. every clip, out of the body
  for (const clip of CLIPS) {
    const t0 = performance.now();
    const b = bake(rig, clip, BASE);
    const ms = performance.now() - t0;
    const cm = (x: number) => (x * 100).toFixed(1);
    ok(b.inside.after <= DEEPEST, `${sex} ${clip.name}: ${cm(b.inside.after)} cm into the body at most (as written ${cm(b.inside.before)}), solved in ${ms.toFixed(0)} ms`);
  }
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");

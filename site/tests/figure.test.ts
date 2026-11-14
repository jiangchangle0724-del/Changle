/*
 * The 3D figure's moves (src/account/figure/): solved for each body the way the page does it, and
 * kept out of the body. Run with `npx tsx tests/figure.test.ts`
 *  1. Every move the page offers has its clips, a Chinese and an English name.
 *  2. Both figures load (their files, read with three.js like the page, without the textures).
 *  3. Every clip, solved for each body, keeps the hands and arms out of the body: at most a couple
 *     of centimetres into the shapes fitted to it (they're a little fuller than the skin), the
 *     depth the solver reports as `inside.after`. For the bodies as they come, and at the ends of
 *     the body sliders (高矮胖瘦 and muscle, alone and together), reshaped the way the page does it.
 *  4. The body sliders move the skeleton: taller is taller (the eyes higher, the feet on the floor),
 *     and the looks kept on phones or accounts are checked (look.ts checkLook).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { bodyHeads, packOf, restBones, restHeads, restMesh, restNodes, rigFor, type BodyJoints } from "../src/account/figure/body";
import { EYE_COLORS, PANTS_COLORS, SHIRT_COLORS, checkLook, defaultLook, shapeWeights, type Look } from "../src/account/figure/look";
import { MOVES } from "../src/account/figure/moves";
import { bake } from "../src/account/figure/pose/anim";
import { BASE, CLIPS } from "../src/account/figure/pose/keys";
import { applyShapes, prepMesh, type Shaped } from "../src/account/figure/shape";

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

/** the bodies the moves are checked on: as they come, each body slider at its ends, and a few together */
const BODIES: [string, Look["shape"]][] = [
  ["as it comes", {}],
  ["tall", { height: 1 }],
  ["short", { height: -1 }],
  ["heavy", { weight: 1 }],
  ["thin", { weight: -1 }],
  ["muscular", { muscle: 1 }],
  ["soft", { muscle: -1 }],
  ["short and heavy", { height: -1, weight: 1, muscle: -1 }],
  ["tall, heavy, muscular", { height: 1, weight: 1, muscle: 1 }],
  ["tall and thin", { height: 1, weight: -1 }],
];

for (const sex of ["male", "female"] as const) {
  // 2. the figure, as the page reads it
  const { root, meshes } = await load(sex);
  const names = meshes.map((m) => m.name);
  ok(["Body", "Shirt", "Pants", "Shoes", "Eyes"].every((n) => names.includes(n)), `${sex}: the file has its body, shirt, trousers, shoes and eyes (${names.join(", ")})`);
  const shaped = meshes.map(prepMesh).filter((x): x is Shaped => !!x);
  const nodes = restNodes(root);
  const base = restHeads(nodes);
  const joints = root.userData.body as BodyJoints | undefined;
  ok(joints && ["height", "weight", "muscle"].every((id) => joints.targets[`S_${id}_incr`] && joints.targets[`S_${id}_decr`]), `${sex}: the file says where the body sliders move the joints`);
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((x) => {
    if ((x as THREE.Bone).isBone) bones.set(x.name, x);
  });
  const packs = new Map(meshes.map((m) => [m, packOf(m, base)]));
  const bodyMeshes = meshes.filter((m) => m.name === "Body" || m.name === "Shirt" || m.name === "Pants");
  const feet = (m: THREE.SkinnedMesh) => {
    // the lowest point of the shoes at rest, through the skeleton as bound
    const p = m.geometry.attributes.position;
    const v = new THREE.Vector3();
    let lo = Infinity;
    const at = new THREE.Matrix4().makeTranslation(...(heads.get(m.skeleton.bones[0].name) as THREE.Vector3).toArray()).multiply(m.skeleton.boneInverses[0]);
    for (let i = 0; i < p.count; i++) lo = Math.min(lo, v.fromBufferAttribute(p, i).applyMatrix4(at).y);
    return lo;
  };
  let heads = base;
  for (const [what, shape] of BODIES) {
    // reshaped as the page does: the sliders' targets mixed in, the skeleton moved, every mesh bound to it
    const w = shapeWeights({ ...defaultLook(sex), shape });
    for (const s of shaped) applyShapes(s, w);
    heads = bodyHeads(base, joints, w);
    const rest = restBones(nodes, heads, bones);
    for (const m of meshes) restMesh(m, packs.get(m) as THREE.Matrix4, heads);
    const rig = rigFor(rest, bodyMeshes);
    const shoes = meshes.find((m) => m.name === "Shoes");
    const eye = (heads.get("LeftEye") as THREE.Vector3).y;
    if (what === "as it comes") ok(Math.abs(rig.k - 1) < 0.02, `${sex}: drawn at the size the moves were written for (eyes at ${rig.k.toFixed(3)} of it)`);
    else if (shape.height) ok(Math.abs(eye / (base.get("LeftEye") as THREE.Vector3).y - 1 - 0.12 * shape.height) < 0.03, `${sex} ${what}: the eyes at ${eye.toFixed(2)} m (${shape.height > 0 ? "taller" : "shorter"} by about 12%)`);
    if (shoes) ok(Math.abs(feet(shoes)) < 0.01, `${sex} ${what}: the shoes on the floor (${(feet(shoes) * 100).toFixed(1)} cm)`);
    // 3. every clip, out of the body
    let worst = { cm: 0, clip: "" };
    const t0 = performance.now();
    for (const clip of CLIPS) {
      const b = bake(rig, clip, BASE);
      const cm = b.inside.after * 100;
      if (cm > worst.cm) worst = { cm, clip: clip.name };
      if (b.inside.after > DEEPEST) ok(false, `${sex} ${what} ${clip.name}: ${cm.toFixed(1)} cm into the body (as written ${(b.inside.before * 100).toFixed(1)})`);
    }
    ok(worst.cm <= DEEPEST * 100, `${sex} ${what}: all ${CLIPS.length} clips keep out of the body (deepest ${worst.cm.toFixed(1)} cm, ${worst.clip || "none"}), solved in ${(performance.now() - t0).toFixed(0)} ms`);
  }
}

// 4. looks from anywhere, checked
{
  const d = defaultLook("female");
  ok(JSON.stringify(checkLook(null)) === JSON.stringify(defaultLook("male")), "nothing kept: the man as he comes");
  ok(JSON.stringify(checkLook({ v: 1, sex: "female" })) === JSON.stringify(d), "an old look without colours or body: hers as she comes (blue T-shirt, jeans, brown eyes)");
  const odd = checkLook({ v: 1, sex: "female", shape: { height: 3, weight: -0.5, nope: 1, round: -1 }, eyes: 99, shirt: -4, pants: "x", skin: 2.6, hair: "mohawk" });
  ok(odd.shape.height === 1 && odd.shape.weight === -0.5 && !("nope" in odd.shape) && !("round" in odd.shape), `sliders kept in their range, unknown ones dropped (${JSON.stringify(odd.shape)})`);
  ok(odd.eyes === EYE_COLORS.length - 1 && odd.shirt === 0 && odd.pants === d.pants && odd.skin === 3 && odd.hair === d.hair, "colours kept in range, a wrong one takes the default");
  ok(SHIRT_COLORS.length === 12 && PANTS_COLORS.length === 6 && EYE_COLORS.length === 7, "12 shirt colours, 6 for trousers, 7 for eyes");
}

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");

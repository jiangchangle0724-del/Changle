/**
 * The big screen's dancer in three.js: her body (files.ts), dressed in an outfit (its garments and hair
 * hung on her own skeleton, the skin under them left out), dancing the routine's moves. The moves are
 * solved here for her body by the accounts' pose solver (src/account/figure/pose: the arms kept out
 * of the body), a few clips a frame, and played set from the speaker's beat: a clip's time is in beats.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { restNodes, rigFor } from "../../../account/figure/body";
import { baking, toClip, type Baked } from "../../../account/figure/pose/anim";
import type { Rig } from "../../../account/figure/pose/rig";
import { bodyFile, hairFile, outfitFile } from "./files";
import { BASE, CLIPS } from "./moves";

/** an outfit's file says: its names, its hair and colour, how far its shoes lift her, the skin it covers */
type OutfitInfo = { id: string; zh: string; en: string; style: string; hair: string; hairColor: string; lift: number; hide: [number, number][] };
type Worn = { info: OutfitInfo; meshes: THREE.SkinnedMesh[]; hair: THREE.SkinnedMesh | null };

/** The files come gzipped (Cloudflare doesn't compress .glb): unzipped by the browser's own stream (or fflate). */
async function fetchModel(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model ${res.status}`);
  const raw = new Uint8Array(await res.arrayBuffer());
  if (raw[0] !== 0x1f || raw[1] !== 0x8b) return raw.buffer;
  if (typeof DecompressionStream !== "undefined") {
    const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(out).arrayBuffer();
  }
  const { gunzipSync } = await import("three/examples/jsm/libs/fflate.module.js");
  const u = gunzipSync(raw);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const load = async (url: string) => loader.parseAsync(await fetchModel(url), url.slice(0, url.lastIndexOf("/") + 1));

/** a material made right for her: skin soft, cloth by its kind, hair smoothed at its cut edges */
function dress(m: THREE.Mesh, hairColor: string | null) {
  const old = m.material as THREE.MeshStandardMaterial;
  const ex = (old.userData ?? {}) as { kind?: string; tint?: string; mean?: number[]; sheen?: number };
  let mat: THREE.MeshStandardMaterial = old;
  if (ex.kind === "skin" || ex.kind === "velvet" || ex.sheen) {
    const p = new THREE.MeshPhysicalMaterial();
    THREE.MeshStandardMaterial.prototype.copy.call(p, old);
    if (ex.kind === "skin") {
      // skin: a soft sheen at the edges (light through the skin, near enough), not shiny
      p.sheen = 0.35;
      p.sheenRoughness = 0.55;
      p.sheenColor = new THREE.Color(1, 0.74, 0.66);
      p.roughness = 0.52;
    } else {
      p.sheen = ex.sheen ?? 0.8;
      p.sheenRoughness = 0.4;
      p.sheenColor = old.color.clone().lerp(new THREE.Color(1, 1, 1), 0.35);
    }
    old.dispose();
    mat = p;
    m.material = p;
  }
  if (ex.tint === "hair" || ex.tint === "brow") {
    const c = new THREE.Color(hairColor ?? "#20160f");
    const mean = ex.mean ?? [0.5, 0.5, 0.5];
    const k = ex.tint === "brow" ? 0.9 : 1;
    mat.color.setRGB((c.r * k) / mean[0], (c.g * k) / mean[1], (c.b * k) / mean[2], THREE.LinearSRGBColorSpace);
  }
  if (ex.kind === "hair") {
    mat.alphaToCoverage = true;
    mat.roughness = 0.62;
    mat.envMapIntensity = 0.35;
  }
  if (ex.kind === "eyes") mat.roughness = 0.12;
  if (mat.alphaTest > 0) mat.alphaToCoverage = true;
  m.castShadow = false;
  m.frustumCulled = false;
}

export type Dancer = {
  root: THREE.Group;
  /** her eyes' height, for framing */
  eyes: number;
  /** puts an outfit on her (and its hair): the one she had stays till it's in */
  wear(id: string): Promise<void>;
  wearing(): string | null;
  /** solves the next few moves; true when all are ready */
  bake(budgetMs: number): boolean;
  /** the pose for a beat: `move` at `b` beats into it, eased in from `from` (k of the way) */
  pose(move: string, b: number, from?: { move: string; b: number } | null, k?: number): void;
  /** blinks, the eyes on the camera, a smile */
  live(dt: number, camera: THREE.Camera): void;
  /** what's been solved, by name: for the checks (how deep the arms went into her) */
  solved(): Map<string, Baked>;
  dispose(): void;
};

export async function loadDancer(): Promise<Dancer> {
  const gltf = await load(bodyFile());
  const root = new THREE.Group();
  const body = gltf.scene;
  root.add(body);
  const bones = new Map<string, THREE.Object3D>();
  const meshes: THREE.SkinnedMesh[] = [];
  body.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(x as THREE.SkinnedMesh);
    else if (x.name) bones.set(x.name, x);
  });
  for (const m of meshes) dress(m, null);
  const skin = meshes.find((m) => m.name === "Body") as THREE.SkinnedMesh;
  const fullIndex = skin.geometry.index?.array.slice() as Uint16Array | Uint32Array;
  const weld = skin.geometry.getAttribute("_weld");
  const nodes = restNodes(body);
  const rig: Rig = rigFor(nodes, [skin]);
  const mixer = new THREE.AnimationMixer(body);
  const actions = new Map<string, THREE.AnimationAction>();
  const baked = new Map<string, Baked>();
  const todo = [...CLIPS];
  let solving: { name: string; gen: Generator<void, Baked> } | null = null;
  const eyesY = ((bones.get("LeftEye") as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y + (bones.get("RightEye") as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y) / 2;

  let worn: Worn | null = null;
  let want: string | null = null;
  const hairs = new Map<string, Promise<THREE.SkinnedMesh>>();
  const outfits = new Map<string, Promise<Worn>>();

  /** a mesh and all it holds (geometry, materials, textures) let go of */
  const drop = (o: THREE.Object3D) =>
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) {
        for (const v of Object.values(mt)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
        mt.dispose();
      }
    });

  /** a skinned mesh from another file onto her bones, by name (the files share one rest pose) */
  const adopt = (m: THREE.SkinnedMesh) => {
    const own = m.skeleton.bones.map((b) => bones.get(b.name) as THREE.Bone | undefined);
    if (own.some((b) => !b)) throw new Error("bones");
    m.bind(new THREE.Skeleton(own as THREE.Bone[], m.skeleton.boneInverses), m.bindMatrix);
    m.removeFromParent();
    return m;
  };
  const skinned = (scene: THREE.Object3D) => {
    const out: THREE.SkinnedMesh[] = [];
    scene.traverse((x) => (x as THREE.SkinnedMesh).isSkinnedMesh && out.push(x as THREE.SkinnedMesh));
    return out;
  };
  const hairOf = (h: string) => {
    let p = hairs.get(h);
    if (!p) {
      p = load(hairFile(h)).then((g) => adopt(skinned(g.scene)[0]));
      hairs.set(h, p);
    }
    return p;
  };
  const outfitOf = (id: string) => {
    let p = outfits.get(id);
    if (!p) {
      p = (async () => {
        const g = await load(outfitFile(id));
        const info = (g.scene.userData as { outfit: OutfitInfo }).outfit;
        const ms = skinned(g.scene).map(adopt);
        for (const m of ms) dress(m, null);
        const hair = await hairOf(info.hair);
        return { info, meshes: ms, hair };
      })();
      outfits.set(id, p);
      // a file that failed may be tried again later
      p.catch(() => outfits.delete(id));
    }
    return p;
  };
  /** the skin under an outfit left out of the drawing: the triangles kept moved to the front of the
   *  same index buffer (written again, not a new one each outfit), and only they drawn */
  const cover = (hide: [number, number][]) => {
    const index = skin.geometry.index;
    if (!fullIndex || !weld || !index) return;
    const hidden = new Set<number>();
    for (const [a, b] of hide) for (let v = a; v <= b; v++) hidden.add(v);
    const out = index.array as Uint16Array | Uint32Array;
    let n = 0;
    for (let t = 0; t < fullIndex.length; t += 3) {
      const a = fullIndex[t], b = fullIndex[t + 1], c = fullIndex[t + 2];
      if (hidden.has(weld.getX(a)) || hidden.has(weld.getX(b)) || hidden.has(weld.getX(c))) continue;
      out[n++] = a;
      out[n++] = b;
      out[n++] = c;
    }
    index.needsUpdate = true;
    skin.geometry.setDrawRange(0, n);
  };

  const wear = async (id: string) => {
    want = id;
    const w = await outfitOf(id);
    if (want !== id) return;
    const old = worn;
    if (old) {
      for (const m of old.meshes) m.removeFromParent();
      old.hair?.removeFromParent();
    }
    for (const m of w.meshes) body.add(m);
    if (w.hair) {
      dress(w.hair, w.info.hairColor);
      body.add(w.hair);
    }
    for (const m of meshes) if (m.name === "Eyebrows") dress(m, w.info.hairColor);
    cover(w.info.hide);
    body.position.y = w.info.lift;
    worn = w;
    // what she had on, let go of (its textures are most of what the graphics memory holds; a phone
    // or tablet playing the speaker has little: #559); fetched again if she wears it again
    if (old && old !== w) {
      outfits.delete(old.info.id);
      for (const m of old.meshes) drop(m);
    }
  };

  const bake = (budgetMs: number) => {
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (!solving) {
        const c = todo.shift();
        if (!c) return true;
        solving = { name: c.name, gen: baking(rig, c, BASE) };
      }
      const r = solving.gen.next();
      if (r.done) {
        baked.set(solving.name, r.value);
        const a = mixer.clipAction(toClip(r.value));
        a.play();
        a.setEffectiveWeight(0);
        actions.set(solving.name, a);
        solving = null;
      }
    }
    return !todo.length && !solving;
  };

  const pose = (move: string, b: number, from: { move: string; b: number } | null = null, k = 1) => {
    const a = actions.get(move) ?? actions.get("stand");
    const f = from ? actions.get(from.move) : null;
    // only the one or two playing are worked out (the rest skipped, not just weighed at nothing)
    for (const x of actions.values()) {
      x.enabled = x === a || (x === f && k < 1);
      x.setEffectiveWeight(0);
    }
    if (!a) return;
    const at = (x: THREE.AnimationAction, beat: number) => {
      const d = x.getClip().duration;
      x.time = ((beat % d) + d) % d;
    };
    at(a, b);
    if (f && f !== a && k < 1) {
      at(f, from!.b);
      f.setEffectiveWeight(1 - k);
      a.setEffectiveWeight(k);
    } else a.setEffectiveWeight(1);
    mixer.update(0);
  };

  // ---- alive: blinks, a smile, eyes on whoever's watching (the camera)
  const faces = meshes.filter((m) => m.morphTargetDictionary);
  let blinkIn = 1.5;
  let blinkT = -1;
  const eyeBones = ["LeftEye", "RightEye"].map((n) => bones.get(n) as THREE.Object3D);
  const head = bones.get("Head") as THREE.Object3D;
  const tmp = new THREE.Vector3();
  const qHead = new THREE.Quaternion();
  const live = (dt: number, camera: THREE.Camera) => {
    blinkIn -= dt;
    if (blinkIn <= 0 && blinkT < 0) {
      blinkT = 0;
      blinkIn = 2 + Math.random() * 3.5;
    }
    let blink = 0;
    if (blinkT >= 0) {
      blinkT += dt;
      const d = 0.16;
      blink = blinkT < d * 0.4 ? blinkT / (d * 0.4) : Math.max(0, 1 - (blinkT - d * 0.4) / (d * 0.6));
      if (blinkT > d) blinkT = -1;
    }
    for (const m of faces) {
      const dict = m.morphTargetDictionary as Record<string, number>;
      const inf = m.morphTargetInfluences as number[];
      if (dict.X_blinkL !== undefined) inf[dict.X_blinkL] = blink;
      if (dict.X_blinkR !== undefined) inf[dict.X_blinkR] = blink;
      if (dict.X_smile !== undefined) inf[dict.X_smile] = 0.45;
    }
    // the eyes turn to the camera, as far as eyes can
    head.getWorldQuaternion(qHead);
    for (const e of eyeBones) {
      e.getWorldPosition(tmp);
      const dir = camera.getWorldPosition(new THREE.Vector3()).sub(tmp).normalize().applyQuaternion(qHead.clone().invert());
      const yaw = Math.max(-0.45, Math.min(0.45, Math.atan2(dir.x, dir.z)));
      const pitch = Math.max(-0.3, Math.min(0.3, Math.atan2(-dir.y, Math.hypot(dir.x, dir.z))));
      // the bone's rest turn is none (the files'), so its own turn is the look
      e.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
    }
  };

  const dispose = () => {
    mixer.stopAllAction();
    drop(root);
    for (const p of outfits.values()) void p.then((w) => w.meshes.forEach(drop)).catch(() => {});
    for (const p of hairs.values()) void p.then(drop).catch(() => {});
  };

  return { root, eyes: eyesY, wear, wearing: () => worn?.info.id ?? null, bake, pose, live, solved: () => baked, dispose };
}

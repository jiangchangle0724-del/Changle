/**
 * The big screen's dancer in three.js (dances.ts says what she dances when): her model, skinned to a
 * Mixamo-named skeleton, and her dances, each fetched when it's first wanted and kept, played as
 * three.js clips whose time is in beats (a loop `beats` long), set from the speaker's beat every frame.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { danceFile, herFile, readDance, type DanceHead } from "./dances";

/** The files come gzipped (Cloudflare doesn't compress .glb or .bin): unzipped by the browser's own stream (or fflate). */
async function fetchZipped(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} ${res.status}`);
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

/**
 * A dance as a three.js clip, its time in beats (a loop `beats` long): each bone's turn, and the hips'
 * place over where they stand (`hipsRest`, her rest's). One more key than the file has, the first
 * again, so the loop closes.
 */
export function danceClip(d: { head: DanceHead; q: Int16Array; hips: Int16Array }, hipsRest: THREE.Vector3): THREE.AnimationClip {
  const { head, q, hips } = d;
  const B = head.bones.length;
  const N = head.frames;
  const times = new Float32Array(N + 1);
  for (let j = 0; j <= N; j++) times[j] = (j / N) * head.beats;
  const tracks: THREE.KeyframeTrack[] = [];
  for (let i = 0; i < B; i++) {
    const vals = new Float32Array((N + 1) * 4);
    for (let j = 0; j <= N; j++) {
      const o = ((j % N) * B + i) * 4;
      for (let c = 0; c < 4; c++) vals[j * 4 + c] = q[o + c] / 32767;
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${head.bones[i]}.quaternion`, times, vals));
  }
  const hv = new Float32Array((N + 1) * 3);
  for (let j = 0; j <= N; j++) {
    const o = (j % N) * 3;
    hv[j * 3] = hipsRest.x + hips[o] / 1000;
    hv[j * 3 + 1] = hipsRest.y + hips[o + 1] / 1000;
    hv[j * 3 + 2] = hipsRest.z + hips[o + 2] / 1000;
  }
  tracks.push(new THREE.VectorKeyframeTrack("Hips.position", times, hv));
  return new THREE.AnimationClip(head.id, head.beats, tracks);
}

export type Her = {
  root: THREE.Group;
  /** her eyes' height, for framing */
  eyes: number;
  /** fetches a dance (once); resolves when it can be danced */
  learn(id: string): Promise<void>;
  knows(id: string): boolean;
  /** her pose: `dance` at `t` beats into it, eased in from `from` (k of the way) */
  pose(dance: string, t: number, from?: { dance: string; t: number } | null, k?: number): void;
  dispose(): void;
};

export async function loadHer(): Promise<Her> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const url = herFile();
  const gltf = await loader.parseAsync(await fetchZipped(url), url.slice(0, url.lastIndexOf("/") + 1));
  const root = new THREE.Group();
  root.add(gltf.scene);
  let hipsBone: THREE.Object3D | null = null;
  gltf.scene.traverse((x) => {
    if (x.name === "Hips") hipsBone = x;
    const m = x as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.frustumCulled = false;
    const mat = m.material as THREE.MeshStandardMaterial;
    // her colours are a photo's, its light in them already: the room's light on top, kept soft
    mat.roughness = 0.6;
    mat.envMapIntensity = 0.5;
  });
  if (!hipsBone) throw new Error("no hips");
  const hipsRest = (hipsBone as THREE.Object3D).position.clone();
  const extras = (gltf.scene.userData as { dancer?: { eyes?: number } }).dancer;
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const actions = new Map<string, THREE.AnimationAction>();
  const learning = new Map<string, Promise<void>>();

  const learn = (id: string) => {
    let p = learning.get(id);
    if (!p) {
      p = (async () => {
        const clip = danceClip(readDance(await fetchZipped(danceFile(id))), hipsRest);
        const a = mixer.clipAction(clip);
        a.play();
        a.setEffectiveWeight(0);
        actions.set(id, a);
      })();
      learning.set(id, p);
      // a file that failed may be tried again later
      p.catch(() => learning.delete(id));
    }
    return p;
  };

  const pose = (dance: string, t: number, from: { dance: string; t: number } | null = null, k = 1) => {
    const a = actions.get(dance);
    const f = from ? actions.get(from.dance) : null;
    // only the one or two dancing are worked out (the rest skipped, not just weighed at nothing)
    for (const x of actions.values()) {
      x.enabled = x === a || (x === f && k < 1);
      x.setEffectiveWeight(0);
    }
    if (!a) return;
    const at = (x: THREE.AnimationAction, beat: number) => {
      const d = x.getClip().duration;
      x.time = ((beat % d) + d) % d;
    };
    at(a, t);
    if (f && f !== a && k < 1) {
      at(f, from!.t);
      f.setEffectiveWeight(1 - k);
      a.setEffectiveWeight(k);
    } else a.setEffectiveWeight(1);
    mixer.update(0);
  };

  const dispose = () => {
    mixer.stopAllAction();
    root.traverse((x) => {
      const m = x as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) {
        for (const v of Object.values(mt)) if ((v as THREE.Texture)?.isTexture) (v as THREE.Texture).dispose();
        mt.dispose();
      }
    });
  };

  return { root, eyes: extras?.eyes ?? 1.6, learn, knows: (id) => actions.has(id), pose, dispose };
}

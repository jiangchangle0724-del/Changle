/**
 * The big screen's dancer in three.js (dances.ts says what she wears and dances when): one of her
 * outfits' models, skinned to a Mixamo-named skeleton, her hair and skirt on springs of their own
 * (springs.ts), and her dances, each fetched when it's first wanted and kept, played as three.js clips
 * whose time is in beats (a loop `beats` long), set from the speaker's beat every frame.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { danceFile, herFile, readDance, type DanceHead } from "./dances";
import { makeSprings, type SpringData } from "./springs";

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
  /** which outfit this is (dances.ts OUTFITS) */
  outfit: string;
  /** her eyes' height, for framing */
  eyes: number;
  /** fetches a dance (once); resolves when it can be danced */
  learn(id: string): Promise<void>;
  knows(id: string): boolean;
  /** her pose: `dance` at `t` beats into it, eased in from `from` (k of the way) */
  pose(dance: string, t: number, from?: { dance: string; t: number } | null, k?: number): void;
  /** which way `dance` has her hips facing `t` beats into it (radians round her up axis, 0 the room), or
   * null before it's learnt; and its loop's length in beats */
  facing(dance: string, t: number): number | null;
  beats(dance: string): number | null;
  /** after `pose`: her hair and skirt swing on `dt` seconds */
  swing(dt: number): void;
  /** her eyes closed this much (0 open, 1 shut): her lids come down them (a blink) */
  blink(k: number): void;
  /** her face (0 to 1 each): a smile, her brows up; a few millimetres at most (expressions.py) */
  face(smile: number, brows: number): void;
  /** her hair and skirt back at rest (she was away a while) */
  still(): void;
  dispose(): void;
};

export async function loadHer(outfit = "club"): Promise<Her> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const url = herFile(outfit);
  const gltf = await loader.parseAsync(await fetchZipped(url), url.slice(0, url.lastIndexOf("/") + 1));
  const root = new THREE.Group();
  root.add(gltf.scene);
  let hipsBone: THREE.Object3D | null = null;
  const bones = new Map<string, THREE.Object3D>();
  const faces: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse((x) => {
    if (x.name === "Hips") hipsBone = x;
    if ((x as THREE.Bone).isBone) bones.set(x.name, x);
    const m = x as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.frustumCulled = false;
    if (m.morphTargetDictionary && m.morphTargetInfluences) faces.push(m);
    const mat = m.material as THREE.MeshStandardMaterial;
    // her colours are a photo's, its light in them already: the room's light on top, kept soft
    mat.roughness = 0.6;
    mat.envMapIntensity = 0.5;
  });
  if (!hipsBone) throw new Error("no hips");
  const hipsRest = (hipsBone as THREE.Object3D).position.clone();
  const extras = (gltf.scene.userData as { dancer?: { eyes?: number; springs?: SpringData; lid?: [number, number, number] } }).dancer;
  const springs = makeSprings(extras?.springs, bones);
  // her blink (Steve on Nov 18: her face looked stiff): her texture's alpha says where her eyes are and
  // how far down each texel is (scripts/dj-dancer/real/eyes.py); a lid the colour of the skin above
  // them comes down that far, a darker line at its edge (her lashes). The texture stays opaque
  const blinkU = { value: 0 };
  const lidU = { value: new THREE.Color().setRGB(...(extras?.lid ?? [0.64, 0.5, 0.47]), THREE.SRGBColorSpace) };
  gltf.scene.traverse((x) => {
    const m = x as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || !extras?.lid) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uBlink = blinkU;
      sh.uniforms.uLid = lidU;
      sh.fragmentShader = sh.fragmentShader
        .replace("void main() {", "uniform float uBlink;\nuniform vec3 uLid;\nvoid main() {")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
#ifdef USE_MAP
  if ( uBlink > 0.0 && sampledDiffuseColor.a < 0.9 ) {
    float t = sampledDiffuseColor.a / 0.8;
    float lid = smoothstep( t - 0.12, t + 0.04, uBlink );
    float lash = 1.0 - 0.3 * smoothstep( 0.15, 0.0, abs( t - uBlink ) ) * step( 0.05, uBlink );
    diffuseColor.rgb = mix( diffuseColor.rgb, uLid * lash, lid );
  }
#endif`,
        );
    };
    mat.customProgramCacheKey = () => "dancer-blink";
  });
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const actions = new Map<string, THREE.AnimationAction>();
  const learning = new Map<string, Promise<void>>();

  // a file that didn't come is tried again, but not every frame: after half a minute
  const failed = new Map<string, number>();
  const learn = (id: string) => {
    let p = learning.get(id);
    const at = failed.get(id);
    if (!p && at !== undefined && performance.now() - at < 30_000) return Promise.reject(new Error(`${id} not here`));
    if (!p) {
      p = (async () => {
        const clip = danceClip(readDance(await fetchZipped(danceFile(id))), hipsRest);
        const a = mixer.clipAction(clip);
        a.play();
        a.setEffectiveWeight(0);
        actions.set(id, a);
      })();
      learning.set(id, p);
      p.catch(() => {
        learning.delete(id);
        failed.set(id, performance.now());
      });
    }
    return p;
  };

  const facingOf = new Map<string, THREE.Interpolant>();
  const facing = (dance: string, t: number) => {
    const a = actions.get(dance);
    if (!a) return null;
    let f = facingOf.get(dance);
    if (!f) {
      const tr = a.getClip().tracks.find((x) => x.name === "Hips.quaternion");
      if (!tr) return null;
      f = new THREE.QuaternionLinearInterpolant(tr.times, tr.values, 4, new Float32Array(4));
      facingOf.set(dance, f);
    }
    const d = a.getClip().duration;
    const v = f.evaluate((((t % d) + d) % d));
    const q = new THREE.Quaternion(v[0], v[1], v[2], v[3]);
    const ahead = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    return Math.atan2(ahead.x, ahead.z);
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

  return {
    root,
    outfit,
    eyes: extras?.eyes ?? 1.6,
    learn,
    knows: (id) => actions.has(id),
    pose,
    swing: (dt) => springs?.update(root, dt),
    facing,
    beats: (dance) => actions.get(dance)?.getClip().duration ?? null,
    face: (smile, brows) => {
      for (const m of faces) {
        const d = m.morphTargetDictionary!, w = m.morphTargetInfluences!;
        if (d.smile !== undefined) w[d.smile] = smile;
        if (d.brows !== undefined) w[d.brows] = brows;
      }
    },
    blink: (k) => {
      blinkU.value = k;
    },
    still: () => springs?.reset(),
    dispose,
  };
}

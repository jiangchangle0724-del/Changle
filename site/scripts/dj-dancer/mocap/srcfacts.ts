/**
 * What the real dancer's own capture scores on the motion checks (tests/support/motion.ts), over the
 * stretch each loop was cut from: how much her feet may slide is how much the dancer's did there (Nov
 * 21: a house dancer's shuffles and a samba's quick steps brush the floor fast; a check that counted
 * those would fail a real person). Mixamo's skeleton scaled to her size as retarget.ts scales it, its
 * heights from its own rest as hers are. Writes tests/support/captured.ts.
 *
 * usage (from site/): npx tsx <this> <retarget.ts's output dir> <loop.ts's output dir> <fbx …>  (each
 * named as its dance)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { motionFacts } from "../../../tests/support/motion";

const clean = (n: string) => n.replace(/^mixamorig\d*[:_]?/, "");
const [rt, loops, ...fbxs] = process.argv.slice(2);
const out: Record<string, number> = {};
for (const file of fbxs) {
  const id = basename(file, ".fbx");
  const cut = JSON.parse(readFileSync(join(loops, `${id}.json`), "utf8")) as { from: number; fps: number; frames: number };
  const buf = readFileSync(file);
  const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), "");
  const bones = new Map<string, THREE.Object3D>();
  fbx.traverse((o) => {
    if ((o as THREE.Bone).isBone || o.type === "Bone") bones.set(clean(o.name), o);
  });
  fbx.updateMatrixWorld(true);
  const at = (n: string) => bones.get(n)!.getWorldPosition(new THREE.Vector3());
  const floor = Math.min(at("LeftToeBase").y, at("RightToeBase").y);
  const k = (JSON.parse(readFileSync(join(rt, `${id}.json`), "utf8")) as { tHipH: number }).tHipH / (at("Hips").y - floor);
  const rest = { ankle: (at("LeftFoot").y - floor) * k, toe: (at("LeftToeBase").y - floor) * k };
  const mixer = new THREE.AnimationMixer(fbx);
  const clip = fbx.animations[0];
  mixer.clipAction(clip).play();
  const set = (f: number) => {
    mixer.setTime(Math.min(clip.duration, cut.from + f / cut.fps));
    fbx.updateMatrixWorld(true);
  };
  const pose = (f: number) => {
    set(f);
    return { at: (b: string) => at(b).sub(new THREE.Vector3(0, floor, 0)).multiplyScalar(k), turn: (b: string) => bones.get(b)!.quaternion };
  };
  const m = motionFacts(cut.frames, cut.fps, pose, rest, false);
  out[id] = +m.skate.toFixed(2);
  console.log(id.padEnd(12), "skate", m.skate.toFixed(2));
}
const lines = Object.entries(out).map(([id, s]) => `  ${id}: ${s},`);
writeFileSync(
  "tests/support/captured.ts",
  `/** What the real dancer's own capture scores for skating over each loop's stretch (scripts/dj-dancer/mocap/srcfacts.ts writes this). */\nexport const CAPTURED_SKATE: Record<string, number> = {\n${lines.join("\n")}\n};\n`,
);

// The people in the crowd, read the way the game reads them (three.js, the real files): every clip
// is there, planted feet keep still at the crowd's walking speed, a punch's fist is out when the rules
// land it, a tagged body goes down and is up again when the stun ends, and a foul doesn't floor anyone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { NPC_FOUL_STUN_MS, NPC_SPEED, PUNCH_WINDUP_MS, STUN_MS, type Pose } from "../src/engine";
import { CELLS, kitFrom, LOOKS, SCENE_PER_WORLD, type Person } from "../src/client/people";

const parse = (name: string) => {
  const data = readFileSync(new URL(`../src/client/art/${name}`, import.meta.url));
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return new Promise<GLTF>((resolve, reject) => new GLTFLoader().parse(buffer, "", resolve, reject));
};
const files = Promise.all([parse("crowd-people.glb"), parse("crowd-people-f.glb")]);
const spot = new THREE.Vector3();
const at = (person: Person, bone: string) => {
  person.root.updateMatrixWorld(true);
  return person.root.getObjectByName(bone)!.getWorldPosition(spot).clone();
};

test("both bodies load with the clips, the bones and the gear the crowd uses", async () => {
  const [man, woman] = await files;
  const clips = man.animations.map((clip) => clip.name).sort();
  assert.deepEqual(clips, ["flinch", "getup", "hit", "idle", "idle_arms", "idle_phone", "jog", "punch", "walk", "walk_brisk"]);
  for (const gltf of [man, woman]) {
    const meshes: string[] = [];
    let bones = 0;
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Bone) bones++;
      else if (object instanceof THREE.Mesh) meshes.push(object.name);
    });
    assert.equal(bones, 23);
    for (const gear of ["hair_short", "hair_bun", "hair_tail", "cap", "cap_peak", "backpack", "straps", "satchel"]) assert.ok(meshes.includes(gear), gear);
    const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
    assert.ok(size.y > 1.75 && size.y < 1.95, `stands ${size.y.toFixed(2)} m tall`);
  }
});

test("every look colours every part, and the flat arena wears the same tops", () => {
  assert.equal(LOOKS.length, 6);
  const css = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");
  LOOKS.forEach((look, index) => {
    for (const cell of CELLS) assert.match(look.colors[cell], /^#[0-9a-f]{6}$/i, `${index} ${cell}`);
    assert.ok(css.includes(`--look-${index}: ${look.colors.top};`), `--look-${index} is ${look.colors.top}`);
  });
});

/** Walk a body straight ahead at a speed (the rules' units a second); how its toes move while they're down. */
async function walk(index: number, speed: number) {
  const kit = kitFrom(...(await files));
  const person = kit.spawn(index);
  person.root.rotation.y = Math.PI / 2; // facing +x
  const fps = 60;
  const toes: THREE.Vector3[][] = [];
  for (let frame = 0; frame < 5 * fps; frame++) {
    person.root.position.x += (speed * SCENE_PER_WORLD) / fps;
    person.update(1 / fps, (frame * 1000) / fps, speed, "walk", "over");
    if (frame >= fps) toes.push([at(person, "ball_l"), at(person, "ball_r")]);
  }
  person.dispose();
  let along = 0;
  let down = 0;
  for (const side of [0, 1]) {
    const floor = Math.min(...toes.map((pair) => pair[side].y));
    for (let i = 1; i < toes.length; i++) {
      if (toes[i][side].y < floor + 0.012 && toes[i - 1][side].y < floor + 0.012) {
        along += toes[i][side].x - toes[i - 1][side].x;
        down += 1 / fps;
      }
    }
  }
  const body = speed * SCENE_PER_WORLD;
  return { slide: along / down / body, down: down / (2 * (toes.length / fps)) };
}

test("at the crowd's walking speed, a planted foot keeps still", async () => {
  for (const index of [0, 1]) {
    const { slide, down } = await walk(index, NPC_SPEED);
    assert.ok(Math.abs(slide) < 0.06, `body ${index}: a planted toe slides ${(slide * 100).toFixed(0)}% of the walking speed`);
    assert.ok(down > 0.35, `body ${index}: each foot is down ${(down * 100).toFixed(0)}% of the time`);
  }
});

/** One body standing still, driven through a script of poses (ms from the start). */
async function act(index: number, script: [number, Pose][], kind: "tag" | "foul", until: number) {
  const kit = kitFrom(...(await files));
  const person = kit.spawn(index);
  const fps = 60;
  const frames: { t: number; head: number; hand: THREE.Vector3 }[] = [];
  for (let frame = 0; frame <= (until / 1000) * fps; frame++) {
    const t = (frame * 1000) / fps;
    let pose: Pose = "idle";
    for (const [from, next] of script) if (t >= from) pose = next;
    person.update(1 / fps, t, 0, pose, kind);
    frames.push({ t, head: at(person, "Head").y, hand: at(person, "hand_r") });
  }
  person.dispose();
  return frames;
}

test("a punch's fist is out when the rules land it", async () => {
  const start = 500;
  const frames = await act(2, [[start, "windup"], [start + PUNCH_WINDUP_MS, "punch"], [start + PUNCH_WINDUP_MS + 220, "idle"]], "tag", 1400);
  const before = frames.find((frame) => frame.t >= start - 20)!.hand.z;
  const lands = frames.filter((frame) => Math.abs(frame.t - (start + PUNCH_WINDUP_MS)) <= 34);
  const reach = Math.max(...lands.map((frame) => frame.hand.z)) - before;
  assert.ok(reach > 0.35, `the fist is ${reach.toFixed(2)} out when the punch lands`);
});

test("tagged, a body goes down and is up again when the stun ends", async () => {
  const start = 500;
  const frames = await act(4, [[start, "stunned"], [start + STUN_MS, "walk"]], "tag", start + STUN_MS + 600);
  const standing = frames.find((frame) => frame.t >= start - 20)!.head;
  const lowest = Math.min(...frames.filter((frame) => frame.t > start && frame.t < start + 700).map((frame) => frame.head));
  const after = frames.find((frame) => frame.t >= start + STUN_MS + 300)!.head;
  assert.ok(lowest < standing * 0.4, `down: the head at ${lowest.toFixed(2)} (standing ${standing.toFixed(2)})`);
  assert.ok(after > standing * 0.92, `up again: the head at ${after.toFixed(2)}`);
});

test("a foul knocks the puncher back but not down", async () => {
  const start = 500;
  const frames = await act(5, [[start, "windup"], [start + PUNCH_WINDUP_MS, "stunned"], [start + PUNCH_WINDUP_MS + NPC_FOUL_STUN_MS, "idle"]], "foul", 2000);
  const standing = frames.find((frame) => frame.t >= start - 20)!.head;
  const lowest = Math.min(...frames.map((frame) => frame.head));
  assert.ok(lowest > standing * 0.85, `the head stays up: ${lowest.toFixed(2)} (standing ${standing.toFixed(2)})`);
});

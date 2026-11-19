// The people in the crowd, read the way the game reads them (three.js, the real files): every clip
// is there, a person is one draw with every part where it sat on its bone, planted feet keep still at
// the crowd's walking speed, a punch's fist is out when the rules land it, a tagged body goes down and
// is up again when the stun ends, and a foul doesn't floor anyone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { NPC_FOUL_STUN_MS, NPC_SPEED, PUNCH_WINDUP_MS, STUN_MS, type Pose } from "../src/engine";
import { CELLS, FACE, kitFrom, LOOKS, PERSON_SCALE, SCENE_PER_WORLD, wornBy, type Person } from "../src/client/people";

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
  assert.deepEqual(clips, ["dance", "flinch", "getup", "hit", "idle", "idle_arms", "idle_phone", "jog", "punch", "walk", "walk_brisk"]);
  for (const gltf of [man, woman]) {
    const meshes: string[] = [];
    let bones = 0;
    gltf.scene.traverse((object) => {
      if (object instanceof THREE.Bone) bones++;
      else if (object instanceof THREE.Mesh) meshes.push(object.name);
    });
    assert.equal(bones, 23);
    for (const gear of ["hair_short", "hair_bun", "hair_tail", "cap", "cap_peak", "backpack", "straps", "satchel", "eyes"]) assert.ok(meshes.includes(gear), gear);
    const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
    assert.ok(size.y > 1.75 && size.y < 1.95, `stands ${size.y.toFixed(2)} m tall`);
  }
});

test("every look colours every part, and the flat arena wears the same tops", () => {
  assert.equal(LOOKS.length, 12);
  const css = readFileSync(new URL("../src/client/styles.css", import.meta.url), "utf8");
  // (the flat arena counts the looks itself, to keep three.js out of its download)
  assert.ok(readFileSync(new URL("../src/client/ui/ArenaFallback.tsx", import.meta.url), "utf8").includes(`look-\${index % ${LOOKS.length}}`));
  LOOKS.forEach((look, index) => {
    for (const cell of CELLS) assert.match(look.colors[cell], /^#[0-9a-f]{6}$/i, `${index} ${cell}`);
    assert.ok(css.includes(`--look-${index}: ${look.colors.top};`), `--look-${index} is ${look.colors.top}`);
  });
});

test("a person is one draw, and every part it wears moves just as it did on its bone", async () => {
  const [man, woman] = await files;
  const kit = kitFrom(man, woman);
  LOOKS.forEach((look, index) => {
    const person = kit.spawn(index);
    // a moment into a walk and a punch, so the bones are well away from where they were made
    for (let frame = 0; frame < 40; frame++) person.update(1 / 60, (frame * 1000) / 60, 3, frame < 20 ? "walk" : "windup", "over");
    person.root.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    person.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.visible) meshes.push(object);
    });
    assert.equal(meshes.length, 1, `look ${index} draws ${meshes.length} times`);
    const body = meshes[0] as THREE.SkinnedMesh;
    // the same pose on a copy of the file as it was: the parts still on their bones
    const copy = SkeletonUtils.clone(look.body === "m" ? man.scene : woman.scene);
    copy.scale.setScalar(PERSON_SCALE * person.size);
    const bones = new Map<string, THREE.Object3D>();
    body.skeleton.bones.forEach((bone) => bones.set(bone.name, bone));
    copy.traverse((object) => {
      const posed = bones.get(object.name);
      if (object instanceof THREE.Bone && posed) {
        object.position.copy(posed.position);
        object.quaternion.copy(posed.quaternion);
        object.scale.copy(posed.scale);
      }
    });
    copy.position.copy(person.root.position);
    copy.updateMatrixWorld(true);
    let offset = 0;
    const worn = wornBy(look);
    copy.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) offset += object.geometry.getAttribute("position").count;
    });
    let parts = 0;
    let furthest = 0;
    const was = new THREE.Vector3();
    const now = new THREE.Vector3();
    copy.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || !worn.has(object.name)) return;
      parts++;
      const positions = object.geometry.getAttribute("position");
      const placed = body.geometry.getAttribute("position");
      for (let vertex = 0; vertex < positions.count; vertex += 7) {
        was.fromBufferAttribute(positions, vertex).applyMatrix4(object.matrixWorld);
        now.fromBufferAttribute(placed, offset + vertex);
        body.applyBoneTransform(offset + vertex, now).applyMatrix4(body.matrixWorld);
        furthest = Math.max(furthest, was.distanceTo(now));
      }
      offset += positions.count;
    });
    assert.equal(parts, worn.size, `look ${index} wears ${parts} of ${worn.size} parts`);
    // (after the file's parts come the ones made here: the face and the gear, tested below)
    assert.equal(offset, body.geometry.userData.filed, `look ${index}: every vertex from the files accounted for`);
    assert.ok(furthest < 0.002, `look ${index}: a part is ${(furthest * 1000).toFixed(1)} mm from where it sat on its bone`);
    person.dispose();
  });
});

test("the parts made here (the face, the gear) each ride one bone: the face and hats the head, a phone the right hand, a coffee the left", async () => {
  const [man, woman] = await files;
  const kit = kitFrom(man, woman);
  LOOKS.forEach((look, index) => {
    const person = kit.spawn(index);
    let body: THREE.SkinnedMesh | null = null;
    person.root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) body = object;
    });
    const mesh = body as unknown as THREE.SkinnedMesh;
    const bones = new Set<string>();
    const skin = mesh.geometry.getAttribute("skinIndex");
    const weight = mesh.geometry.getAttribute("skinWeight");
    for (let vertex = mesh.geometry.userData.filed; vertex < skin.count; vertex++) {
      assert.equal(weight.getX(vertex), 1, `look ${index}: a made part leans on one bone`);
      bones.add(mesh.skeleton.bones[skin.getX(vertex)].name);
    }
    assert.ok(bones.has("Head"), `look ${index}: a face`);
    if (look.gear.includes("phone")) assert.ok(bones.has("hand_r"), `look ${index}: the phone in the right hand`);
    if (look.gear.includes("cup")) assert.ok(bones.has("hand_l"), `look ${index}: the coffee in the left`);
    if (look.gear.includes("tote")) assert.ok(bones.has("pelvis") && bones.has("spine_03"), `look ${index}: the tote at the hip, its strap on the shoulder`);
    assert.equal(mesh.morphTargetInfluences?.length, Object.keys(FACE).length, `look ${index}: the face's shapes`);
    person.dispose();
  });
});

test("a face follows the body: a blink now and then, a shout as it punches, a gasp when it's knocked down, a grin as it dances, eyes up at the fireworks", async () => {
  const kit = kitFrom(...(await files));
  const faceOf = (person: Person) => {
    let body: THREE.SkinnedMesh | null = null;
    person.root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) body = object;
    });
    return (body as unknown as THREE.SkinnedMesh).morphTargetInfluences!;
  };
  const run = (index: number, pose: Pose, kind: "tag" | "over", mood: "calm" | "sky", ms: number) => {
    const person = kit.spawn(index);
    let blinked = 0;
    for (let frame = 0; frame * (1000 / 60) < ms; frame++) {
      person.update(1 / 60, (frame * 1000) / 60, 0, pose, kind, mood);
      blinked = Math.max(blinked, faceOf(person)[FACE.blink]);
    }
    const face = Array.from(faceOf(person));
    person.dispose();
    return { face, blinked };
  };
  const calm = run(2, "idle", "over", "calm", 6_000);
  assert.ok(calm.blinked > 0.8, "a blink within six seconds");
  assert.ok(calm.face[FACE.open] < 0.1 && calm.face[FACE.angry] < 0.1, "a calm face");
  const punching = run(2, "windup", "over", "calm", 300);
  assert.ok(punching.face[FACE.angry] > 0.8 && punching.face[FACE.open] > 0.3, "a shout");
  const knocked = run(2, "stunned", "tag", "calm", 250);
  assert.ok(knocked.face[FACE.open] > 0.8 && knocked.face[FACE.up] > 0.8, "a gasp");
  const dancing = run(2, "dance", "over", "calm", 600);
  assert.ok(dancing.face[FACE.smile] > 0.9, "a grin");
  const fireworks = run(2, "idle", "over", "sky", 600);
  assert.ok(fireworks.face[FACE.smile] > 0.6 && fireworks.face[FACE.up] > 0.5, "ooh");
});

test("every body has a height of its own (6 % either way), the same on every screen", async () => {
  const kit = kitFrom(...(await files));
  const sizes = Array.from({ length: 24 }, (_, index) => kit.spawn(index).size);
  assert.deepEqual(sizes, Array.from({ length: 24 }, (_, index) => kit.spawn(index).size));
  assert.ok(Math.min(...sizes) >= 0.94 && Math.max(...sizes) <= 1.06);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) > 0.08, "some taller, some shorter");
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

test("while the busker plays a body dances, and stops when the music does", async () => {
  const start = 500;
  const frames = await act(1, [[start, "dance"], [start + 2_700, "idle"]], "tag", start + 4_200);
  const still = frames.filter((frame) => frame.t < start);
  const dancing = frames.filter((frame) => frame.t > start + 500 && frame.t < start + 2_600);
  const after = frames.filter((frame) => frame.t > start + 3_700);
  const spread = (list: typeof frames) => Math.max(...list.map((frame) => frame.hand.y)) - Math.min(...list.map((frame) => frame.hand.y));
  assert.ok(spread(dancing) > spread(still) + 0.1, `the hands move ${spread(dancing).toFixed(2)} dancing, ${spread(still).toFixed(2)} standing`);
  assert.ok(spread(after) < spread(dancing) / 2, `and settle again (${spread(after).toFixed(2)})`);
});

test("a foul knocks the puncher back but not down", async () => {
  const start = 500;
  const frames = await act(5, [[start, "windup"], [start + PUNCH_WINDUP_MS, "stunned"], [start + PUNCH_WINDUP_MS + NPC_FOUL_STUN_MS, "idle"]], "foul", 2000);
  const standing = frames.find((frame) => frame.t >= start - 20)!.head;
  const lowest = Math.min(...frames.map((frame) => frame.head));
  assert.ok(lowest > standing * 0.85, `the head stays up: ${lowest.toFixed(2)} (standing ${standing.toFixed(2)})`);
});

test("the twelve looks are built in a blink (the lobby builds them while it's up: a slow build froze it)", async () => {
  // (fresh files: each body's face is laid on its skin once, the first time it's built)
  const fresh = await Promise.all([parse("crowd-people.glb"), parse("crowd-people-f.glb")]);
  kitFrom(...(await files));
  const started = performance.now();
  kitFrom(...fresh);
  const took = performance.now() - started;
  // (it took about 500 ms here before 2026-11-19, about 25 ms after; a slow machine has room to spare)
  assert.ok(took < 250, `${took.toFixed(0)} ms`);
});

test("a blow lands: the body flashes white for a moment and squashes, then springs back; with reduced motion, neither", async () => {
  const kit = kitFrom(...(await files));
  const bodyOf = (person: Person) => {
    let body: THREE.SkinnedMesh | null = null;
    person.root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) body = object;
    });
    return body as unknown as THREE.SkinnedMesh;
  };
  for (const reduced of [false, true]) {
    const person = kit.spawn(3);
    const normal = bodyOf(person).material as THREE.MeshStandardMaterial;
    person.update(1 / 60, 0, 0, "idle", "tag", "calm", reduced);
    // knocked down at 1000 ms
    person.update(1 / 60, 1_000, 0, "stunned", "tag", "calm", reduced);
    const lit = bodyOf(person).material as THREE.MeshStandardMaterial;
    const squashed = person.root.scale.y;
    if (reduced) {
      assert.equal(lit, normal, "reduced motion: no flash");
      assert.equal(squashed, 1, "reduced motion: no squash");
    } else {
      assert.notEqual(lit, normal, "a flash");
      assert.ok(lit.emissive.r > 0.9 && lit.emissiveIntensity > 0.5, "lit white");
      assert.equal(lit.map, normal.map, "the same look under the light (no program of its own)");
      assert.ok(squashed < 0.9 && person.root.scale.x > 1.05, `squashed (${squashed.toFixed(2)})`);
    }
    // a moment later: its own material again; once the landing's squash is over too, its own size
    person.update(1 / 60, 1_120, 0, "stunned", "tag", "calm", reduced);
    assert.equal(bodyOf(person).material, normal, "the flash is over in a tenth of a second");
    for (let ms = 1_120; ms <= 1_800; ms += 1000 / 60) person.update(1 / 60, ms, 0, "stunned", "tag", "calm", reduced);
    assert.equal(person.root.scale.y, 1);
    assert.equal(person.root.scale.x, 1);
    person.dispose();
  }
});

test("a fist going out stretches the body a little, and it springs back", async () => {
  const kit = kitFrom(...(await files));
  const person = kit.spawn(5);
  person.update(1 / 60, 0, 0, "windup", "over");
  person.update(1 / 60, PUNCH_WINDUP_MS, 0, "punch", "over");
  assert.ok(person.root.scale.y > 1.03 && person.root.scale.x < 1, `stretched (${person.root.scale.y.toFixed(3)})`);
  for (let ms = PUNCH_WINDUP_MS; ms <= PUNCH_WINDUP_MS + 400; ms += 1000 / 60) person.update(1 / 60, ms, 0, "punch", "over");
  assert.equal(person.root.scale.y, 1);
  person.dispose();
});

const withMoves = Promise.all([parse("crowd-people.glb"), parse("crowd-people-f.glb"), parse("crowd-moves.glb")]);

test("the extra moves come with the people: a nod, a shake of the head, eating, a rail to lean on, a lantern", async () => {
  const [man, woman, moves] = await withMoves;
  assert.deepEqual(moves.animations.map((clip) => clip.name).sort(), ["eat", "lantern", "no", "nod", "rail"]);
  const kit = kitFrom(man, woman, moves);
  for (const move of ["rail", "lantern", "eat"]) assert.ok(kit.spawn(30).hold(move), move);
  // (without the file, the crowd still plays)
  assert.equal(kitFrom(...(await files)).spawn(30).hold("rail"), false);
});

test("standing at a night market stall, anyone eats (the hand comes up to the mouth); walking, nobody does", async () => {
  const [man, woman, moves] = await withMoves;
  const kit = kitFrom(man, woman, moves);
  // (a look that stands with its hands down: not the phone, not the folded arms)
  const plainIdle = LOOKS.findIndex((look) => look.idle === "idle");
  const hands = (atStall: boolean, speed: number) => {
    const person = kit.spawn(plainIdle);
    let highest = -Infinity;
    for (let frame = 0; frame < 120; frame++) {
      person.update(1 / 60, (frame * 1000) / 60, speed, speed > 0 ? "walk" : "idle", "over", "calm", false, atStall);
      if (frame > 60) highest = Math.max(highest, at(person, "hand_l").y, at(person, "hand_r").y);
    }
    person.dispose();
    return highest;
  };
  assert.ok(hands(true, 0) > hands(false, 0) + 0.15, `a hand at the mouth (${hands(true, 0).toFixed(2)} against ${hands(false, 0).toFixed(2)})`);
  assert.ok(Math.abs(hands(true, NPC_SPEED) - hands(false, NPC_SPEED)) < 0.01, "walking past a stall eats nothing");
});

test("standing about, a body nods or shakes its head now and then; walking, never", async () => {
  const [man, woman, moves] = await withMoves;
  const plain = kitFrom(...(await files));
  const lively = kitFrom(man, woman, moves);
  const difference = (pose: Pose, speed: number) => {
    const a = plain.spawn(6);
    const b = lively.spawn(6);
    let most = 0;
    for (let frame = 0; frame < 60 * 25; frame++) {
      const now = (frame * 1000) / 60;
      a.update(1 / 60, now, speed, pose, "over");
      b.update(1 / 60, now, speed, pose, "over");
      most = Math.max(most, at(a, "Head").distanceTo(at(b, "Head")), at(a, "hand_r").distanceTo(at(b, "hand_r")));
    }
    a.dispose();
    b.dispose();
    return most;
  };
  assert.ok(difference("idle", 0) > 0.05, "a gesture within 25 seconds of standing about");
  assert.ok(difference("walk", NPC_SPEED) < 0.001, "none while walking");
});

test("in the transit hall's dark, anyone standing looks at their phone (its hand comes up, its phone lit); walking, nobody does", async () => {
  const kit = kitFrom(...(await files));
  // (a look that stands with its hands down, and one whose own idle is the phone: both light one)
  for (const look of [LOOKS.findIndex((item) => item.idle === "idle"), LOOKS.findIndex((item) => item.idle === "idle_phone")]) {
    const phone = (mood: "calm" | "dark", speed: number) => {
      const person = kit.spawn(look);
      let highest = -Infinity;
      for (let frame = 0; frame < 90; frame++) {
        person.update(1 / 60, (frame * 1000) / 60, speed, speed > 0 ? "walk" : "idle", "over", mood);
        if (frame > 60) highest = Math.max(highest, at(person, "hand_r").y);
      }
      const lit = person.phoneLit;
      person.dispose();
      return { hand: highest, lit };
    };
    assert.ok(phone("dark", 0).lit > 0.9, `look ${look}: standing in the dark, its phone is lit`);
    assert.ok(phone("calm", 0).lit < 0.01, `look ${look}: in the light, no phone`);
    assert.ok(phone("dark", NPC_SPEED).lit < 0.01, `look ${look}: walking in the dark, no phone`);
    if (LOOKS[look].idle === "idle") assert.ok(phone("dark", 0).hand > phone("calm", 0).hand + 0.1, "the hand comes up with it");
  }
});

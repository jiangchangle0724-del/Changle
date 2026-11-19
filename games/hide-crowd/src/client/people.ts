// The people in the crowd: real 3D bodies on a skeleton (a man's and a woman's, from Quaternius's CC0
// mannequins; tools/blender/build_crowd_people.py makes the files), dressed in twelve looks, moving with
// eleven clips blended by what each body is doing: standing three ways, walking two ways and jogging
// at any speed without the feet sliding, a punch that lands when the rules land it, knocked down and
// up again when tagged, a recoil after a foul, dancing when the busker plays (and the winner, at the
// end), and a glance around (the head, by hand).
// Made here, on top of the files (2026-11-18, the big upgrade): a face (a mouth and brows beside the
// file's eyes, with five shapes it moves between: a blink, an open mouth, a smile, brows up, brows
// down), the gear some looks wear (a beanie, a bucket hat, sunglasses, a scarf, a phone, a coffee, a
// tote), and a height a little different for each body. The face follows what the body is doing and
// what's happening around it (a shout as it punches, a gasp when it's knocked down, a grin as it
// dances, a look up at the fireworks), the same for every body.
// Every body is made the same way whoever steers it: what gives a player away is what they do.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { ARENA, PUNCH_WINDUP_MS, STUN_MS, type Pose } from "../engine";
import { BASE } from "./base";

/** the rules' floor (100 x 58) in scene units, the same both ways (Arena3D draws everything with it) */
export const SCENE_PER_WORLD = 17.5 / ARENA.width;
const UP = new THREE.Vector3(0, 1, 0);

export const PEOPLE_FILES = { m: `${BASE}/art/crowd-people.glb`, f: `${BASE}/art/crowd-people-f.glb`, moves: `${BASE}/art/crowd-moves.glb` } as const;

/** the palette's cells, left to right, as the build script lays out the bodies' UVs */
export const CELLS = ["head", "neck", "top", "forearm", "hand", "pants", "shin", "shoes", "hair", "bag", "accent", "strap", "eyes", "mouth", "brows", "gear"] as const;
export type Cell = (typeof CELLS)[number];
const PALETTE_WIDTH = 16;

export type Hair = "hair_short" | "hair_bun" | "hair_tail" | "cap";
export type Bag = "backpack" | "satchel";
/** what a look wears that the files don't have: made here, in code (see `gearShapes`) */
export type Gear = "beanie" | "bucket" | "shades" | "scarf" | "phone" | "cup" | "tote";

export interface Look {
  body: "m" | "f";
  hair: Hair;
  bag: Bag | null;
  idle: "idle" | "idle_arms" | "idle_phone";
  walk: "walk" | "walk_brisk";
  gear: readonly Gear[];
  colors: Record<Cell, string>;
}

const skin = { light: "#f1c9a5", warm: "#e8b48c", tan: "#c68e64", brown: "#a8714a", deep: "#8d5a3b" };
const EYES = "#1c1820";
/** a mouth a deeper, redder shade of the skin around it */
const mouthOf = (tone: string) => `#${new THREE.Color(tone).lerp(new THREE.Color("#5c1f24"), 0.55).getHexString()}`;
/** brows a little darker than the hair, so fair and grey hair still frames the eyes */
const browsOf = (hair: string) => `#${new THREE.Color(hair).lerp(new THREE.Color("#2a1d16"), 0.4).getHexString()}`;
const dress = (body: Look["body"], hair: Hair, bag: Bag | null, idle: Look["idle"], walk: Look["walk"], tone: string, parts: Partial<Record<Cell, string>>, gear: readonly Gear[] = []): Look => ({
  body,
  hair,
  bag,
  idle,
  walk,
  gear,
  colors: {
    head: tone,
    neck: tone,
    hand: tone,
    top: parts.top!,
    forearm: parts.forearm ?? parts.top!,
    pants: parts.pants!,
    shin: parts.shin ?? parts.pants!,
    shoes: parts.shoes!,
    hair: parts.hair!,
    bag: parts.bag ?? parts.top!,
    accent: parts.accent ?? parts.hair!,
    strap: parts.strap ?? parts.bag ?? parts.top!,
    eyes: parts.eyes ?? EYES,
    mouth: parts.mouth ?? mouthOf(tone),
    brows: parts.brows ?? browsOf(parts.hair!),
    gear: parts.gear ?? parts.accent ?? parts.hair!
  }
});

/**
 * Twelve looks: the first three are the people of the old drawn crowd (the mustard jacket and backpack,
 * the mint hoodie, the teal vest over a red shirt), three more for a Vancouver crowd, and six with gear
 * made here (a beanie and scarf, sunglasses and a phone, a bucket hat, a coffee, a cap and tote). The
 * game's own art colours, as the design rules allow for a game's props (DESIGN.md).
 */
export const LOOKS: readonly Look[] = [
  dress("m", "hair_short", "backpack", "idle", "walk", skin.deep, { top: "#d9962a", pants: "#2b3550", shoes: "#ece7dc", hair: "#2a1c14", bag: "#2e6f73", strap: "#1f4d50" }),
  dress("f", "hair_bun", "backpack", "idle_phone", "walk_brisk", skin.warm, { top: "#5cc79b", pants: "#6b3a5e", shoes: "#f2c14e", hair: "#1f1612", bag: "#a98bd8" }),
  dress("m", "hair_short", null, "idle_arms", "walk", skin.warm, { top: "#3f8f94", forearm: "#c4473a", pants: "#6d6f78", shoes: "#4a3426", hair: "#bdb9b0" }),
  dress("f", "hair_tail", "satchel", "idle", "walk", skin.light, { top: "#c8402f", pants: "#1d1f2a", shoes: "#2a2321", hair: "#3b2416", bag: "#7a4a2a", strap: "#5a361e" }),
  dress("m", "cap", null, "idle_phone", "walk_brisk", skin.brown, { top: "#44599a", pants: "#c2a878", shin: skin.brown, shoes: "#ece7dc", hair: "#d36b2a", accent: "#b4541c" }),
  dress("f", "hair_bun", "backpack", "idle_arms", "walk", skin.tan, { top: "#f0c419", pants: "#3d5a80", shoes: "#ece7dc", hair: "#1a1210", bag: "#1f4e5f" }),
  dress("m", "hair_short", null, "idle_arms", "walk_brisk", skin.light, { top: "#2c4a7c", pants: "#5e6670", shoes: "#8a5a3b", hair: "#5a3a22", accent: "#d1495b", gear: "#e8e1cf" }, ["beanie", "scarf"]),
  dress("f", "hair_tail", null, "idle_phone", "walk", skin.deep, { top: "#e07a5f", pants: "#efe9dc", shoes: "#f2c14e", hair: "#1a1210" }, ["shades", "phone"]),
  dress("m", "hair_short", "satchel", "idle", "walk", skin.tan, { top: "#81b29a", pants: "#a08a62", shoes: "#ece7dc", hair: "#2a1c14", accent: "#efe6cf", bag: "#6b4a2f", strap: "#4a321f" }, ["bucket"]),
  dress("f", "hair_bun", "backpack", "idle", "walk_brisk", skin.brown, { top: "#8c5cc7", pants: "#2b2d42", shoes: "#ece7dc", hair: "#2a1810", bag: "#e05a9a", gear: "#f4efe4" }, ["cup"]),
  dress("m", "cap", null, "idle_phone", "walk", skin.warm, { top: "#e2536a", pants: "#4a6fa5", shoes: "#e9c46a", hair: "#f1eee6", brows: "#3b2416", accent: "#2b2d42", gear: "#e9d8a6", strap: "#c9b88a" }, ["phone", "tote"]),
  dress("f", "hair_short", null, "idle_arms", "walk", skin.light, { top: "#f4a261", pants: "#2a2d34", shoes: "#3a2e2a", hair: "#c69c6d", brows: "#8a6542", accent: "#2a9d8f", gear: "#e76f51" }, ["beanie", "scarf"])
];

/** A body's look, by its place in the crowd's (shuffled) order: players get whatever their body has. */
export const lookOf = (index: number): Look => LOOKS[((index % LOOKS.length) + LOOKS.length) % LOOKS.length];

// how the clips were made (the mannequins are 1.83 m; the scene draws a person 2.15 units tall, seen
// from above, with a head a little bigger than life so it reads from across the room)
const PERSON_HEIGHT = 2.15;
export const PERSON_SCALE = PERSON_HEIGHT / 1.83;
const HEAD_SCALE = 1.2;
/** metres a second the walk covers at its own speed (its planted toes, measured: tests/people.test.ts) */
export const WALK_SPEED = 0.92;
/**
 * The jog is a bounding run; the rules' top speed (about 2 m/s in the clips' metres) is a slow jog, so
 * from a brisk walk up the legs blend the walk into it, on one stride clock (the jog's cycle covers
 * this many metres a second, and the blend makes the stride in between).
 */
export const JOG_SPEED = 2.55;
const JOG_FROM = 1.3;
const JOG_FULL = 3.2;
/** the punch's fist is furthest out this far into its clip (s): it gets there when the rules land the punch */
const PUNCH_REACH = 0.26;
const PUNCH_RATE = PUNCH_REACH / (PUNCH_WINDUP_MS / 1000);
/** a knocked-down body's back hits the floor this far into the fall (s) */
const FALL_LANDS = 0.27;
/** a blow's flash (ms) */
const FLASH_MS = 90;
/**
 * Squash and stretch, by what happened: how much wider and shorter the body goes (a fist going out
 * stretches it: shorter is negative), and how long it takes to spring back (ms).
 */
const SQUASH = {
  hit: { wide: 0.09, tall: 0.16, ms: 260 },
  land: { wide: 0.07, tall: 0.12, ms: 220 },
  snap: { wide: -0.03, tall: -0.06, ms: 170 }
} as const;
/** out past the end and back: 1 at the end, about 1.1 on the way */
const backOut = (value: number) => {
  const t = Math.min(1, Math.max(0, value)) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
};

const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const damp = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));

export interface PeopleKit {
  spawn(index: number): Person;
}

function palette(look: Look): THREE.DataTexture {
  const data = new Uint8Array(PALETTE_WIDTH * 4);
  CELLS.forEach((cell, index) => {
    const color = new THREE.Color(look.colors[cell]);
    data[index * 4] = Math.round(color.r * 255);
    data[index * 4 + 1] = Math.round(color.g * 255);
    data[index * 4 + 2] = Math.round(color.b * 255);
    data[index * 4 + 3] = 255;
  });
  const texture = new THREE.DataTexture(data, PALETTE_WIDTH, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** What a look wears on top of its body: its hair (a cap has a peak), its bag (a backpack has straps), and its eyes. */
export function wornBy(look: Look): Set<string> {
  return new Set([look.hair, ...(look.hair === "cap" ? ["cap_peak"] : []), ...(look.bag ? [look.bag] : []), ...(look.bag === "backpack" ? ["straps"] : []), "eyes"]);
}

/** the five shapes a face moves between: morph targets on the whole body, where only the face's points move */
export const FACE = { blink: 0, open: 1, smile: 2, up: 3, angry: 4 } as const;
const FACES = Object.keys(FACE).length;

/** where a cell's colour sits in the palette (the body's UVs are each cell's middle) */
const cellU = (cell: Cell) => (CELLS.indexOf(cell) + 0.5) / PALETTE_WIDTH;

/**
 * A shape made here, ready to go into a body: in the body's numbers (the file keeps normals and UVs in
 * small integers), every point on one cell of the palette and skinned to one bone.
 */
function ready(shape: THREE.BufferGeometry, cell: Cell, bone: number, like: THREE.BufferGeometry, whole: number): THREE.BufferGeometry {
  const count = shape.getAttribute("position").count;
  const out = new THREE.BufferGeometry();
  out.setIndex(shape.index ? Array.from(shape.index.array) : Array.from({ length: count }, (_, i) => i));
  out.setAttribute("position", new THREE.Float32BufferAttribute(Array.from(shape.getAttribute("position").array as Float32Array), 3));
  for (const name of ["normal", "uv"] as const) {
    const pattern = like.getAttribute(name) as THREE.BufferAttribute;
    const size = pattern.itemSize;
    const target = new THREE.BufferAttribute(new (pattern.array.constructor as new (length: number) => Int8Array)(count * size), size, pattern.normalized);
    // (the file's normals come interleaved, with no GPU type of their own: the same here, so they merge)
    (target as { gpuType: number | undefined }).gpuType = (pattern as { gpuType?: number }).gpuType;
    const source = shape.getAttribute("normal");
    for (let vertex = 0; vertex < count; vertex++) {
      if (name === "normal") target.setXYZ(vertex, source.getX(vertex), source.getY(vertex), source.getZ(vertex));
      else target.setXY(vertex, cellU(cell), 0.5);
    }
    out.setAttribute(name, target);
  }
  const indexes = like.getAttribute("skinIndex") as THREE.BufferAttribute;
  const weights = like.getAttribute("skinWeight") as THREE.BufferAttribute;
  const index = new (indexes.array.constructor as new (length: number) => Uint8Array)(count * 4);
  const weight = new (weights.array.constructor as new (length: number) => Uint8Array)(count * 4);
  for (let vertex = 0; vertex < count; vertex++) {
    index[vertex * 4] = bone;
    weight[vertex * 4] = whole;
  }
  out.setAttribute("skinIndex", new THREE.BufferAttribute(index, 4, indexes.normalized));
  out.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4, weights.normalized));
  return out;
}

/** a box, a cylinder, a ball: placed, turned and stretched in a frame (all numbers in metres, as the files are) */
function piece(geometry: THREE.BufferGeometry, at: [number, number, number], turn: [number, number, number] = [0, 0, 0], stretch: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...turn)), new THREE.Vector3(...stretch));
  return geometry.applyMatrix4(matrix);
}

interface Made {
  shape: THREE.BufferGeometry;
  cell: Cell;
  bone: string;
  /** for the face's shapes: which part of the face it is */
  face?: "mouth" | "brows";
}

/**
 * The gear a look wears that the files don't have, in the frame of the bone it moves with (each bone's
 * own: +y up the head, along the fingers, +z ahead), and the head's measurements from its eyes and hair.
 */
function gearShapes(look: Look, head: { top: number; brow: number; back: number; front: number; eyes: THREE.Box3 }): Made[] {
  const made: Made[] = [];
  const middle = (head.back + head.front) / 2;
  // (a hat sits on the hair, its rim clear of the brows)
  const crown = Math.max(head.brow + 0.02, head.top - 0.104);
  for (const gear of look.gear) {
    if (gear === "beanie") {
      made.push({ shape: piece(new THREE.SphereGeometry(0.106, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, crown, middle], [0, 0, 0], [1, 1, 1.14]), cell: "accent", bone: "Head" });
      made.push({ shape: piece(new THREE.CylinderGeometry(0.109, 0.109, 0.03, 14, 1, true), [0, crown + 0.008, middle], [0, 0, 0], [1, 1, 1.14]), cell: "accent", bone: "Head" });
      made.push({ shape: piece(new THREE.SphereGeometry(0.026, 8, 6), [0, crown + 0.122, middle]), cell: "gear", bone: "Head" });
    } else if (gear === "bucket") {
      made.push({ shape: piece(new THREE.CylinderGeometry(0.088, 0.104, 0.08, 14), [0, head.top - 0.02, middle], [0, 0, 0], [1, 1, 1.1]), cell: "accent", bone: "Head" });
      made.push({ shape: piece(new THREE.CylinderGeometry(0.16, 0.172, 0.014, 16), [0, head.top - 0.058, middle], [0, 0, 0], [1, 1, 1.08]), cell: "accent", bone: "Head" });
    } else if (gear === "shades") {
      const y = (head.eyes.min.y + head.eyes.max.y) / 2;
      const z = head.eyes.max.z + 0.006;
      const half = (head.eyes.max.x - head.eyes.min.x) / 2;
      for (const side of [-1, 1]) made.push({ shape: piece(new THREE.BoxGeometry(half * 0.82, 0.03, 0.008), [side * half * 0.56, y, z]), cell: "eyes", bone: "Head" });
      made.push({ shape: piece(new THREE.BoxGeometry(0.02, 0.006, 0.006), [0, y + 0.006, z]), cell: "eyes", bone: "Head" });
      for (const side of [-1, 1]) made.push({ shape: piece(new THREE.BoxGeometry(0.006, 0.006, 0.11), [side * half * 1.02, y + 0.004, z - 0.058]), cell: "eyes", bone: "Head" });
    } else if (gear === "scarf") {
      made.push({ shape: piece(new THREE.TorusGeometry(0.082, 0.032, 8, 18), [0, 0.18, 0.012], [Math.PI / 2 - 0.12, 0, 0]), cell: "gear", bone: "spine_03" });
      made.push({ shape: piece(new THREE.BoxGeometry(0.055, 0.17, 0.026), [0.045, 0.08, 0.13], [0.12, 0, 0.08]), cell: "gear", bone: "spine_03" });
    } else if (gear === "phone") {
      made.push({ shape: piece(new THREE.BoxGeometry(0.014, 0.075, 0.038), [0, 0.085, 0.022]), cell: "eyes", bone: "hand_r" });
    } else if (gear === "cup") {
      // (the fingers point down when the arm hangs: the cup's open end, and its lid, toward the wrist)
      made.push({ shape: piece(new THREE.CylinderGeometry(0.024, 0.03, 0.085, 10), [0, 0.07, 0.035]), cell: "gear", bone: "hand_l" });
      made.push({ shape: piece(new THREE.CylinderGeometry(0.032, 0.032, 0.012, 10), [0, 0.024, 0.035]), cell: "accent", bone: "hand_l" });
    } else if (gear === "tote") {
      made.push({ shape: piece(new THREE.BoxGeometry(0.2, 0.23, 0.05), [-0.21, -0.03, 0.02], [0, 0, 0.05]), cell: "gear", bone: "pelvis" });
      made.push({ shape: piece(new THREE.BoxGeometry(0.022, 0.48, 0.014), [-0.17, -0.085, 0.01], [0, 0, -0.17]), cell: "strap", bone: "spine_03" });
    }
  }
  return made;
}

/**
 * A look's body in one piece, so a person is one draw (it was two to six: the body, the eyes, the hair,
 * the bag, the straps): each worn part sits on a bone in the file, and here it is moved into the body's
 * bind pose and skinned to that bone alone, so it moves exactly as it did on the bone. After them come
 * the parts made here (the face's mouth and brows, the look's gear), each on its bone; and the face's
 * five shapes, as morph targets that move only the eyes, the mouth and the brows.
 */
/** The face's made parts (a mouth, two brows) for each body, laid on its skin once (oneShape). */
const facesMade = new WeakMap<THREE.Object3D, { mouth: THREE.BufferGeometry; brows: THREE.BufferGeometry[] }>();

/**
 * Only the skin a face part could lie on: the triangles at the front of the body (z of 0 or more) and
 * from `low` up. Feeling for the skin through these is a few hundred tests a point, not thousands
 * (2026-11-19: the twelve looks took half a second to build, and froze the lobby while they did).
 */
function faceSkin(geometry: THREE.BufferGeometry, low: number): THREE.BufferGeometry {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const kept: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let corner = 0; corner + 2 < count; corner += 3) {
    a.fromBufferAttribute(position, index ? index.getX(corner) : corner);
    b.fromBufferAttribute(position, index ? index.getX(corner + 1) : corner + 1);
    c.fromBufferAttribute(position, index ? index.getX(corner + 2) : corner + 2);
    if (Math.max(a.y, b.y, c.y) < low || Math.max(a.z, b.z, c.z) < 0) continue;
    kept.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const skin = new THREE.BufferGeometry();
  skin.setAttribute("position", new THREE.Float32BufferAttribute(kept, 3));
  return skin;
}

function oneShape(source: THREE.Object3D, look: Look): THREE.BufferGeometry {
  source.updateMatrixWorld(true);
  let body: THREE.SkinnedMesh | null = null;
  source.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) body = object;
  });
  if (!body) throw new Error("no body in the people file");
  const { geometry, skeleton, bindMatrix } = body as THREE.SkinnedMesh;
  const unbind = bindMatrix.clone().invert();
  const indexes = geometry.getAttribute("skinIndex") as THREE.BufferAttribute;
  const weights = geometry.getAttribute("skinWeight") as THREE.BufferAttribute;
  // a whole weight in the file's own number type (a normalised byte is 255)
  const whole = weights.normalized ? (weights.array instanceof Uint8Array ? 255 : weights.array instanceof Uint16Array ? 65_535 : 1) : 1;
  const parts: THREE.BufferGeometry[] = [geometry];
  const worn = wornBy(look);
  const eyeSpans: Array<{ start: number; count: number }> = [];
  let filed = geometry.getAttribute("position").count;
  // the head's measurements, from any hair in the file (worn or not) and the eyes
  const head = { top: -Infinity, back: Infinity, front: -Infinity, eyes: new THREE.Box3() };
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh) return;
    const bone = skeleton.bones.indexOf(object.parent as THREE.Bone);
    if (bone < 0) {
      if (worn.has(object.name)) throw new Error(`${object.name} is not on a bone`);
      return;
    }
    const part = object.geometry.clone();
    part.applyMatrix4(unbind.clone().multiply(skeleton.boneInverses[bone].clone().invert()).multiply(object.matrix));
    part.normalizeNormals();
    part.computeBoundingBox();
    const box = part.boundingBox!;
    if (object.name === "hair_short") {
      head.top = box.max.y;
      head.back = box.min.z;
    }
    if (object.name === "eyes") {
      head.eyes.copy(box);
      head.front = box.max.z;
    }
    if (!worn.has(object.name)) return;
    const count = part.getAttribute("position").count;
    if (object.name === "eyes") eyeSpans.push({ start: filed, count });
    filed += count;
    const index = new (indexes.array.constructor as new (length: number) => Uint8Array)(count * 4);
    const weight = new (weights.array.constructor as new (length: number) => Uint8Array)(count * 4);
    for (let vertex = 0; vertex < count; vertex++) {
      index[vertex * 4] = bone;
      weight[vertex * 4] = whole;
    }
    part.setAttribute("skinIndex", new THREE.BufferAttribute(index, 4, indexes.normalized));
    part.setAttribute("skinWeight", new THREE.BufferAttribute(weight, 4, weights.normalized));
    parts.push(part);
  });
  // the parts made here: the face (a mouth below the eyes, two brows above), in the body's own frame,
  // and the gear, each built in its bone's frame and carried into the body's
  const boneAt = (name: string) => {
    const index = skeleton.bones.findIndex((bone) => bone.name === name);
    if (index < 0) throw new Error(`no bone ${name}`);
    return index;
  };
  const toBody = (bone: number) => unbind.clone().multiply(skeleton.boneInverses[bone].clone().invert());
  const fromBody = (bone: number) => toBody(bone).invert();
  const headBone = boneAt("Head");
  const eyeWidth = head.eyes.max.x - head.eyes.min.x;
  const eyeHeight = head.eyes.max.y - head.eyes.min.y;
  const eyeMiddle = head.eyes.getCenter(new THREE.Vector3());
  // (each laid on the face: its points pushed out to the skin, wherever the face curves away; the same
  // for every look on this body, so worked out once a body: feeling for the skin is the slow part)
  let face = facesMade.get(source);
  if (!face) {
    const skin = new THREE.Mesh(faceSkin(geometry, head.eyes.min.y - eyeHeight * 4), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const feel = new THREE.Raycaster();
    const surface = (x: number, y: number, fallback: number) => {
      feel.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1));
      return feel.intersectObject(skin)[0]?.point.z ?? fallback;
    };
    const onFace = (shape: THREE.BufferGeometry, lift: number) => {
      const positions = shape.getAttribute("position");
      shape.computeBoundingBox();
      const back = shape.boundingBox!.min.z;
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const x = positions.getX(vertex);
        const y = positions.getY(vertex);
        positions.setZ(vertex, surface(x, y, head.front) + lift + (positions.getZ(vertex) - back));
      }
      return shape;
    };
    face = {
      mouth: onFace(piece(new THREE.BoxGeometry(eyeWidth * 0.44, eyeHeight * 0.3, 0.004, 6, 1, 1), [eyeMiddle.x, head.eyes.min.y - eyeHeight * 1.4, 0]), -0.0015),
      brows: [-1, 1].map((side) => onFace(piece(new THREE.BoxGeometry(eyeWidth * 0.3, eyeHeight * 0.24, 0.004, 3, 1, 1), [eyeMiddle.x + side * eyeWidth * 0.3, head.eyes.max.y + eyeHeight * 0.4, 0], [0, 0, side * -0.08]), -0.0015))
    };
    skin.geometry.dispose();
    facesMade.set(source, face);
  }
  const made: Made[] = [
    { shape: face.mouth.clone(), cell: "mouth", bone: "", face: "mouth" },
    ...face.brows.map((brow): Made => ({ shape: brow.clone(), cell: "brows", bone: "", face: "brows" }))
  ];
  // (the head's measurements in the head bone's own frame, for the gear on it)
  const local = fromBody(headBone);
  const top = new THREE.Vector3(0, head.top, 0).applyMatrix4(local).y;
  const back = new THREE.Vector3(0, head.eyes.min.y, head.back).applyMatrix4(local).z;
  const front = new THREE.Vector3(0, head.eyes.min.y, head.front).applyMatrix4(local).z;
  const localEyes = head.eyes.clone().applyMatrix4(local);
  const brow = localEyes.max.y + eyeHeight * 0.5;
  for (const gear of gearShapes(look, { top, brow, back, front, eyes: localEyes })) made.push(gear);
  const ranges: Record<"mouth" | "brows", Array<{ start: number; count: number }>> = { mouth: [], brows: [] };
  let next = filed;
  for (const part of made) {
    const bone = part.bone ? boneAt(part.bone) : headBone;
    // (the face is built in the body's frame; the gear in its bone's)
    if (part.bone) part.shape.applyMatrix4(toBody(bone));
    part.shape.normalizeNormals();
    const shape = ready(part.shape, part.cell, bone, geometry, whole);
    const count = shape.getAttribute("position").count;
    if (part.face) ranges[part.face].push({ start: next, count });
    next += count;
    parts.push(shape);
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("the parts of a look don't fit together");
  merged.userData.filed = filed;
  // the face's five shapes: how far each of its points moves (in the body's frame, before the bones)
  const positions = merged.getAttribute("position");
  const shapes = Array.from({ length: FACES }, () => new Float32Array(positions.count * 3));
  const box = (spans: Array<{ start: number; count: number }>) => {
    const bounds = new THREE.Box3();
    const point = new THREE.Vector3();
    for (const span of spans) for (let vertex = span.start; vertex < span.start + span.count; vertex++) bounds.expandByPoint(point.fromBufferAttribute(positions, vertex));
    return bounds;
  };
  const eyeBox = box(eyeSpans);
  const mouthBox = box(ranges.mouth);
  const mouthMiddle = mouthBox.getCenter(new THREE.Vector3());
  const mouthHalf = (mouthBox.max.x - mouthBox.min.x) / 2;
  const mouthTall = mouthBox.max.y - mouthBox.min.y;
  const eyeLine = (eyeBox.min.y + eyeBox.max.y) / 2;
  for (const span of eyeSpans)
    for (let vertex = span.start; vertex < span.start + span.count; vertex++) shapes[FACE.blink][vertex * 3 + 1] = (eyeLine - positions.getY(vertex)) * 0.88;
  for (const span of ranges.mouth)
    for (let vertex = span.start; vertex < span.start + span.count; vertex++) {
      const x = positions.getX(vertex) - mouthMiddle.x;
      const y = positions.getY(vertex) - mouthMiddle.y;
      const along = Math.min(1, Math.abs(x) / mouthHalf);
      // open: taller and narrower, an O; a smile: wider, the corners up and the middle down a little
      // (the corners open less than the middle: an oval, not a box)
      shapes[FACE.open][vertex * 3] = -x * 0.32;
      shapes[FACE.open][vertex * 3 + 1] = (y * 3.4 - mouthTall * 0.6) * (1 - 0.6 * along * along);
      shapes[FACE.smile][vertex * 3] = x * 0.24;
      shapes[FACE.smile][vertex * 3 + 1] = along * along * mouthTall * 1.9 - (1 - along * along) * mouthTall * 0.35;
    }
  for (const span of ranges.brows)
    for (let vertex = span.start; vertex < span.start + span.count; vertex++) {
      const x = positions.getX(vertex) - mouthMiddle.x;
      const inner = 1 - Math.min(1, Math.abs(x) / (eyeWidth * 0.48));
      shapes[FACE.up][vertex * 3 + 1] = eyeHeight * 0.42;
      // cross: the inner ends down, the outer up
      shapes[FACE.angry][vertex * 3 + 1] = -inner * eyeHeight * 0.55 + (1 - inner) * eyeHeight * 0.15;
    }
  merged.morphAttributes.position = shapes.map((shape) => new THREE.BufferAttribute(shape, 3));
  merged.morphTargetsRelative = true;
  return merged;
}

/** The clips, kept to what moves: every bone's turn, and the hips' height (so the woman keeps her own shoulders). */
function clipsOf(gltf: GLTF): Map<string, THREE.AnimationClip> {
  const clips = new Map<string, THREE.AnimationClip>();
  for (const clip of gltf.animations) {
    const tracks = clip.tracks.filter((track) => track.name.endsWith(".quaternion") || track.name === "pelvis.position");
    clips.set(clip.name, new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  return clips;
}

/** The people from the two loaded files (the man's carries the clips; the woman moves with them too). */
export function kitFrom(man: GLTF, woman: GLTF, moves?: GLTF): PeopleKit {
  const clips = clipsOf(man);
  // (the extra moves: a nod, a shake of the head, eating, leaning on a rail, a lantern held out)
  if (moves) for (const [name, clip] of clipsOf(moves)) clips.set(name, clip);
  // (one material per look, for the body, the hair and the bag alike: the UVs pick the cell)
  const materials = LOOKS.map((look) => new THREE.MeshStandardMaterial({ map: palette(look), roughness: 0.82, metalness: 0 }));
  // (each look's flash when a blow lands: the same material lit white, so it needs no program of its own)
  const flashes = materials.map((material) => {
    const flash = material.clone();
    flash.emissive.setRGB(1, 1, 1);
    flash.emissiveIntensity = 0.9;
    return flash;
  });
  const sources = { m: man.scene, f: woman.scene };
  const shapes = LOOKS.map((look) => oneShape(sources[look.body], look));
  return { spawn: (index) => new Person(sources, clips, materials, shapes, index, flashes) };
}

export async function loadPeople(loader = new GLTFLoader()): Promise<PeopleKit> {
  // (without the extra moves the crowd still plays: they're the little things)
  const [man, woman, moves] = await Promise.all([loader.loadAsync(PEOPLE_FILES.m), loader.loadAsync(PEOPLE_FILES.f), loader.loadAsync(PEOPLE_FILES.moves).catch(() => undefined)]);
  return kitFrom(man, woman, moves);
}

type Kind = "tag" | "foul" | "swing" | "hide" | "blast" | "bike" | "over";
/**
 * What's happening around a body, for its face and head (the arena works it out, the same for every
 * body): fireworks overhead (it looks up, "ooh"), a bang close by (a start), something to watch (the
 * horn, the gong: brows up a little).
 */
export type Mood = "calm" | "sky" | "fright" | "watch";
const RIGHT = new THREE.Vector3(1, 0, 0);

/** A one-off clip over the legs: its share of the body, and until when it holds (ms; Infinity while stunned). */
interface Shot {
  action: THREE.AnimationAction;
  weight: number;
  until: number;
  /** how fast it lets go: slowly back to walking, quickly when another clip takes over */
  out: number;
}

export class Person {
  readonly root: THREE.Object3D;
  readonly look: Look;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly jog: THREE.AnimationAction;
  private readonly punch: THREE.AnimationAction;
  private readonly hit: THREE.AnimationAction;
  private readonly getup: THREE.AnimationAction;
  private readonly flinch: THREE.AnimationAction;
  private readonly dance: THREE.AnimationAction;
  /** the extra moves, when their file is in: a nod and a shake of the head now and then, eating at a stall */
  private readonly nod: THREE.AnimationAction | null;
  private readonly shake: THREE.AnimationAction | null;
  private readonly eat: THREE.AnimationAction | null;
  private readonly clips: Map<string, THREE.AnimationClip>;
  /** a clip this body holds for good (someone beside the place: leaning on the railing, a lantern held out) */
  private held: THREE.AnimationAction | null = null;
  private eating = 0;
  private stillSince = 0;
  private nextGesture: number;
  private gestures = 0;
  private readonly head: THREE.Object3D | null;
  private readonly neck: THREE.Object3D | null;
  private readonly body: THREE.SkinnedMesh | null = null;
  private readonly seed: number;
  /** this body's height against the crowd's (0.94 to 1.06), the same on every screen */
  readonly size: number;
  /** how readily this face smiles when nothing much is happening */
  private readonly temper: number;
  private readonly face = new Float32Array(FACES);
  private readonly faceAim = new Float32Array(FACES);
  private sky = 0;
  private stunnedAt = 0;
  private mood: Mood = "calm";
  private phase: number;
  private moving = 0;
  private jogging = 0;
  private dancing = 0;
  private shots: Shot[] = [];
  /** the get-up, once the fall is over */
  private next: { action: THREE.AnimationAction; rate: number; at: number } | null = null;
  private pose: Pose = "idle";
  private glance = 0;
  /** for the arena: a burst where this body was knocked off its feet, and when it hits the floor (ms) */
  hitFx = false;
  landAt: number | null = null;
  private yawKick = new THREE.Quaternion();
  /** a blow's flash: this body's look lit white for a moment */
  private readonly material: THREE.Material | null = null;
  private readonly flash: THREE.Material | null = null;
  private flashUntil = 0;
  /** squash and stretch: since when, and what (a blow landing, the floor coming up, a fist going out) */
  private squashAt = -Infinity;
  private squashKind: keyof typeof SQUASH = "hit";
  private fallLandsAt = Infinity;

  constructor(sources: { m: THREE.Object3D; f: THREE.Object3D }, clips: Map<string, THREE.AnimationClip>, materials: THREE.Material[], shapes: THREE.BufferGeometry[], index: number, flashes?: THREE.Material[]) {
    const lookIndex = ((index % LOOKS.length) + LOOKS.length) % LOOKS.length;
    this.look = LOOKS[lookIndex];
    this.seed = (index * 2.39996) % (Math.PI * 2);
    this.phase = (index * 0.618) % 1;
    this.size = 0.94 + ((Math.abs(index) * 0.6180339887 + 0.31) % 1) * 0.12;
    this.temper = ((Math.abs(index) * 0.4142 + 0.17) % 1) * 0.32;
    const model = SkeletonUtils.clone(sources[this.look.body]);
    // the body becomes the look in one piece; the separate parts go
    const loose: THREE.Object3D[] = [];
    let body: THREE.SkinnedMesh | null = null;
    model.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) {
        object.geometry = shapes[lookIndex];
        object.material = materials[lookIndex];
        object.frustumCulled = false;
        // (the face's five shapes, each body its own)
        object.updateMorphTargets();
        body = object;
      } else if (object instanceof THREE.Mesh) loose.push(object);
    });
    this.body = body;
    this.material = materials[lookIndex];
    this.flash = flashes?.[lookIndex] ?? null;
    for (const part of loose) part.removeFromParent();
    model.scale.setScalar(PERSON_SCALE * this.size);
    this.root = new THREE.Group();
    this.root.add(model);
    this.head = model.getObjectByName("Head") ?? null;
    // (the clips only turn bones, so the head keeps this size; its hair and cap grow with it)
    this.head?.scale.setScalar(HEAD_SCALE);
    this.neck = model.getObjectByName("neck_01") ?? null;
    this.mixer = new THREE.AnimationMixer(model);
    const action = (name: string) => {
      const clip = clips.get(name);
      if (!clip) throw new Error(`no clip ${name}`);
      return this.mixer.clipAction(clip);
    };
    this.idle = action(this.look.idle);
    this.walk = action(this.look.walk);
    this.jog = action("jog");
    this.punch = action("punch");
    this.hit = action("hit");
    this.getup = action("getup");
    this.flinch = action("flinch");
    this.dance = action("dance");
    this.clips = clips;
    const extra = (name: string) => (clips.has(name) ? action(name) : null);
    this.nod = extra("nod");
    this.shake = extra("no");
    this.eat = extra("eat");
    // (the first gesture somewhere in the first quarter of a minute, each body on its own beat)
    this.nextGesture = 4_000 + ((index * 0.7548776662 + 0.21) % 1) * 12_000;
    // locomotion always plays: its weights follow the speed, its time follows the stride (a body that
    // isn't dancing has its dance at no weight, which costs nothing)
    for (const loop of [this.idle, this.walk, this.jog, this.dance]) {
      loop.play();
      loop.setEffectiveWeight(0);
    }
    this.idle.time = (this.seed / (Math.PI * 2)) * this.idle.getClip().duration;
    // nobody dances quite in step with anyone else
    this.dance.time = this.phase * this.dance.getClip().duration;
    this.dance.timeScale = 0.9 + ((index * 0.37) % 1) * 0.2;
    this.walk.timeScale = 0;
    this.jog.timeScale = 0;
    for (const once of [this.punch, this.hit, this.getup, this.flinch, this.nod, this.shake]) {
      if (!once) continue;
      once.setLoop(THREE.LoopOnce, 1);
      once.clampWhenFinished = true;
    }
    if (this.eat) {
      this.eat.play();
      this.eat.setEffectiveWeight(0);
      this.eat.time = this.phase * this.eat.getClip().duration;
    }
  }

  /** Start a one-off clip (a punch, a fall) over whatever the legs are doing; the one before hands over to it. */
  private play(action: THREE.AnimationAction, rate: number, now: number, until: number): void {
    for (const shot of this.shots) {
      shot.until = Math.min(shot.until, now);
      shot.out = 18;
    }
    this.shots = this.shots.filter((shot) => shot.action !== action);
    action.reset();
    action.timeScale = rate;
    action.setEffectiveWeight(0);
    action.play();
    this.shots.push({ action, weight: 0, until, out: 7 });
  }

  /**
   * One frame: `speed` is the body's speed on the floor (the rules' units a second), `pose` what the
   * rules say it's doing, `kind` the latest thing that happened in the round (a foul or a tag).
   */
  update(dt: number, now: number, speed: number, pose: Pose, kind: Kind, mood: Mood = "calm", reduced = false, atStall = false): void {
    const step = Math.min(0.05, Math.max(0, dt));
    if (pose === "stunned" && this.pose !== "stunned") this.stunnedAt = now;
    if (pose !== this.pose) {
      if (this.pose === "stunned") {
        // back on their feet: the fall (or the recoil) lets go, back to walking
        for (const shot of this.shots) shot.until = Math.min(shot.until, now);
        this.next = null;
      }
      if (pose === "windup" || (pose === "punch" && this.pose !== "windup")) {
        this.play(this.punch, PUNCH_RATE, now, now + (this.punch.getClip().duration / PUNCH_RATE) * 1000 - 120);
      }
      // the fist going out: the body snaps up a little
      if (pose === "punch") this.squash("snap", now);
      // a foul (the puncher, stopped mid-punch): the punch bounces back, then the body stands its ground
      // until the rules let it go; anyone else stunned was tagged
      const fouled = kind === "foul" && (this.pose === "windup" || this.pose === "punch");
      if (pose === "stunned" && fouled) this.play(this.flinch, 1, now, now + this.flinch.getClip().duration * 1000 - 60);
      else if (pose === "stunned") {
        // knocked down, then up again by the time the rules let go (the fall at its own speed)
        const fall = this.hit.getClip().duration;
        this.play(this.hit, 1, now, Infinity);
        this.hitFx = true;
        this.landAt = now + FALL_LANDS * 1000;
        this.fallLandsAt = this.landAt;
        this.flashUntil = now + FLASH_MS;
        this.squash("hit", now);
        this.next = { action: this.getup, rate: this.getup.getClip().duration / Math.max(0.3, STUN_MS / 1000 - fall), at: now + fall * 1000 };
      }
      this.pose = pose;
    }
    if (this.next && now >= this.next.at) {
      this.play(this.next.action, this.next.rate, now, Infinity);
      this.next = null;
    }
    // a bang close by: a start (the foul's recoil, quicker), for anyone on their feet and not mid-punch
    if (mood === "fright" && this.mood !== "fright" && (pose === "idle" || pose === "walk" || pose === "glance")) {
      this.play(this.flinch, 1.4, now, now + (this.flinch.getClip().duration / 1.4) * 1000 - 80);
    }
    this.mood = mood;
    // the one-off clips' shares: in fast, out at their end (a stun holds the last frame while it lasts)
    let overlay = 0;
    for (const shot of this.shots) {
      const holding = now < shot.until;
      shot.weight = damp(shot.weight, holding ? 1 : 0, holding ? 18 : shot.out, step);
      overlay += shot.weight;
    }
    for (const shot of this.shots) if (shot.weight < 0.01 && now >= shot.until) shot.action.stop();
    this.shots = this.shots.filter((shot) => shot.weight >= 0.01 || now < shot.until);
    const share = overlay > 1 ? 1 / overlay : 1;
    for (const shot of this.shots) shot.action.setEffectiveWeight(shot.weight * share);
    // the legs: standing, walking or jogging, by speed (in the clips' metres a second, for this body's
    // own legs: a taller body takes longer strides)
    const metres = (speed * SCENE_PER_WORLD) / (PERSON_SCALE * this.size);
    this.moving = damp(this.moving, smoothstep(0.1, 0.4, metres), 10, step);
    this.jogging = damp(this.jogging, smoothstep(JOG_FROM, JOG_FULL, metres), 6, step);
    const walkCycle = WALK_SPEED * this.walk.getClip().duration;
    const jogCycle = JOG_SPEED * this.jog.getClip().duration;
    // one stride clock for both, so their feet agree while they blend and nothing slides
    this.phase = (this.phase + (metres * step) / (walkCycle + (jogCycle - walkCycle) * this.jogging)) % 1;
    this.walk.time = this.phase * this.walk.getClip().duration;
    this.jog.time = this.phase * this.jog.getClip().duration;
    const legs = 1 - Math.min(1, overlay);
    // dancing takes the whole body (in over a third of a second, out a little slower)
    this.dancing = damp(this.dancing, pose === "dance" ? 1 : 0, pose === "dance" ? 9 : 6, step);
    // standing at a night market stall, anyone eats (a player tasting, or a passer-by: the same)
    const eats = !!this.eat && atStall && pose === "idle" && metres < 0.2;
    this.eating = damp(this.eating, eats ? 1 : 0, eats ? 5 : 8, step);
    const holding = this.held ? 1 : 0;
    const free = legs * (1 - this.dancing) * (1 - this.eating) * (1 - holding);
    this.idle.setEffectiveWeight((1 - this.moving) * free);
    this.walk.setEffectiveWeight(this.moving * (1 - this.jogging) * free);
    this.jog.setEffectiveWeight(this.moving * this.jogging * free);
    this.dance.setEffectiveWeight(this.dancing * legs * (1 - holding));
    this.eat?.setEffectiveWeight(this.eating * legs * (1 - this.dancing) * (1 - holding));
    this.held?.setEffectiveWeight(holding * legs);
    this.gesture(now, pose, mood, eats);
    this.mixer.update(step);
    // a glance: the head looks one way, then the other (by hand, after the clips have had their say)
    this.glance = damp(this.glance, pose === "glance" ? 1 : 0, 5, step);
    if (this.glance > 0.01 && this.head && this.neck) {
      const look = Math.tanh(Math.sin((now / 1000) * 1.7 + this.seed) * 2.6) * 0.85 * this.glance;
      this.neck.quaternion.multiply(this.yawKick.setFromAxisAngle(UP, look * 0.35));
      this.head.quaternion.multiply(this.yawKick.setFromAxisAngle(UP, look * 0.65));
    }
    // fireworks overhead: the head tips back to watch (standing or walking, not while down or dancing)
    const watching = mood === "sky" && pose !== "stunned" && pose !== "dance" ? 1 : 0;
    this.sky = damp(this.sky, watching, watching ? 4 : 6, step);
    if (this.sky > 0.01 && this.head && this.neck) {
      this.neck.quaternion.multiply(this.yawKick.setFromAxisAngle(RIGHT, -0.32 * this.sky));
      this.head.quaternion.multiply(this.yawKick.setFromAxisAngle(RIGHT, -0.42 * this.sky));
    }
    this.express(now, step, pose, kind, mood);
    // the floor coming up to meet a fallen body
    if (now >= this.fallLandsAt) {
      this.fallLandsAt = Infinity;
      this.squash("land", now);
    }
    this.feel(now, reduced);
  }

  /**
   * Now and then someone standing about nods or shakes their head: after a second and a half standing
   * still, on its own beat (nine to eighteen seconds apart), never while busy, watching or eating. The
   * same for every body (a player standing still nods like anyone).
   */
  private gesture(now: number, pose: Pose, mood: Mood, eats: boolean): void {
    if (!this.nod || !this.shake) return;
    const standing = pose === "idle" && this.moving < 0.05 && mood === "calm" && !eats && !this.held && this.shots.length === 0;
    if (!standing) {
      this.stillSince = now;
      return;
    }
    if (now - this.stillSince < 1_500 || now < this.nextGesture) return;
    this.gestures++;
    const action = (this.gestures + Math.floor(this.seed * 3)) % 3 === 0 ? this.shake : this.nod;
    this.play(action, 1.1, now, now + (action.getClip().duration / 1.1) * 1000 - 200);
    this.nextGesture = now + 9_000 + ((this.seed * 1.31 + this.gestures * 0.618) % 1) * 9_000;
  }

  /** Hold a clip for good: someone beside the place, not in the crowd (ui/extras.ts). */
  hold(name: string): boolean {
    const clip = this.clips.get(name);
    if (!clip) return false;
    this.held = this.mixer.clipAction(clip);
    this.held.play();
    this.held.time = this.phase * clip.duration;
    this.held.setEffectiveWeight(1);
    return true;
  }

  private squash(kind: keyof typeof SQUASH, now: number): void {
    this.squashAt = now;
    this.squashKind = kind;
  }

  /** The blow's flash and the squash and stretch (none with reduced motion), the same for every body. */
  private feel(now: number, reduced: boolean): void {
    if (this.body && this.flash && this.material) this.body.material = !reduced && now < this.flashUntil ? this.flash : this.material;
    const shape = SQUASH[this.squashKind];
    const age = (now - this.squashAt) / shape.ms;
    // (from the squash past rest and back: the body springs)
    const amount = reduced || age >= 1 || age < 0 ? 0 : 1 - backOut(age);
    this.root.scale.set(1 + shape.wide * amount, 1 - shape.tall * amount, 1 + shape.wide * amount);
  }

  /** The face: where its five shapes are headed by what the body is doing and what's around it, and a blink now and then. */
  private express(now: number, step: number, pose: Pose, kind: Kind, mood: Mood): void {
    const influences = this.body?.morphTargetInfluences;
    if (!influences) return;
    const aim = this.faceAim;
    aim.fill(0);
    aim[FACE.smile] = this.temper;
    if (pose === "windup" || pose === "punch") {
      // a punch: brows down, a shout
      aim[FACE.angry] = 1;
      aim[FACE.open] = 0.55;
      aim[FACE.smile] = 0;
    } else if (pose === "stunned") {
      const fouled = kind === "foul";
      // knocked down: a gasp, then eyes shut while on the floor; a foul's recoil: a wince
      const down = !fouled && now - this.stunnedAt > 450;
      aim[FACE.open] = fouled ? 0.55 : down ? 0.25 : 1;
      aim[FACE.up] = fouled ? 0.3 : 1;
      aim[FACE.angry] = fouled ? 0.6 : 0;
      aim[FACE.blink] = down ? 0.9 : fouled ? 0.5 : 0;
      aim[FACE.smile] = 0;
    } else if (pose === "dance") {
      aim[FACE.smile] = 1;
      aim[FACE.up] = 0.45;
    } else if (mood === "sky") {
      aim[FACE.smile] = 0.75;
      aim[FACE.up] = 0.7;
      aim[FACE.open] = 0.3;
    } else if (mood === "fright") {
      aim[FACE.open] = 0.8;
      aim[FACE.up] = 1;
      aim[FACE.smile] = 0;
    } else if (pose === "glance" || mood === "watch") aim[FACE.up] = 0.35;
    for (let shape = 0; shape < FACES; shape++) {
      this.face[shape] = damp(this.face[shape], aim[shape], shape === FACE.blink ? 22 : 14, step);
      influences[shape] = this.face[shape];
    }
    // a blink every three to five seconds, each body on its own beat (not while the eyes are wide)
    if (aim[FACE.up] < 0.9) {
      const every = 3 + ((this.seed * 0.7) % 2);
      const into = ((now / 1000 + this.seed * 3.1) % every) / 0.14;
      if (into < 1) influences[FACE.blink] = Math.max(influences[FACE.blink], Math.sin(into * Math.PI));
    }
  }

  /** Where the head is this frame, in the scene, once its clips have moved it (what floats over it: the dizzy stars). */
  headPosition(target: THREE.Vector3): THREE.Vector3 {
    if (this.head) return this.head.getWorldPosition(target);
    return target.copy(this.root.position).setY(PERSON_HEIGHT * this.size * 0.92);
  }

  /** This body's own parts go (its clock and its skeleton); the shared shapes and looks stay for the next round. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
    this.root.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
    });
  }
}

let kit: Promise<PeopleKit> | null = null;
/**
 * The people, loaded once and kept for every round after (the lobby starts it, so a round begins with
 * them); a failed load is tried again next time.
 */
export function peopleKit(): Promise<PeopleKit> {
  kit ??= loadPeople().catch((error) => {
    kit = null;
    throw error;
  });
  return kit;
}

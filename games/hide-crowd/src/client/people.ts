// The people in the crowd: real 3D bodies on a skeleton (a man's and a woman's, from Quaternius's CC0
// mannequins; tools/blender/build_crowd_people.py makes the files), dressed in six looks, moving with
// eleven clips blended by what each body is doing: standing three ways, walking two ways and jogging
// at any speed without the feet sliding, a punch that lands when the rules land it, knocked down and
// up again when tagged, a recoil after a foul, dancing when the busker plays (and the winner, at the
// end), and a glance around (the head, by hand).
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

export const PEOPLE_FILES = { m: `${BASE}/art/crowd-people.glb`, f: `${BASE}/art/crowd-people-f.glb` } as const;

/** the palette's cells, left to right, as the build script lays out the bodies' UVs */
export const CELLS = ["head", "neck", "top", "forearm", "hand", "pants", "shin", "shoes", "hair", "bag", "accent", "strap", "eyes"] as const;
export type Cell = (typeof CELLS)[number];
const PALETTE_WIDTH = 16;

export type Hair = "hair_short" | "hair_bun" | "hair_tail" | "cap";
export type Bag = "backpack" | "satchel";

export interface Look {
  body: "m" | "f";
  hair: Hair;
  bag: Bag | null;
  idle: "idle" | "idle_arms" | "idle_phone";
  walk: "walk" | "walk_brisk";
  colors: Record<Cell, string>;
}

const skin = { light: "#f1c9a5", warm: "#e8b48c", tan: "#c68e64", brown: "#a8714a", deep: "#8d5a3b" };
const EYES = "#1c1820";
const dress = (body: Look["body"], hair: Hair, bag: Bag | null, idle: Look["idle"], walk: Look["walk"], tone: string, parts: Partial<Record<Cell, string>>): Look => ({
  body,
  hair,
  bag,
  idle,
  walk,
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
    eyes: parts.eyes ?? EYES
  }
});

/**
 * Six looks: the first three are the people of the old drawn crowd (the mustard jacket and backpack,
 * the mint hoodie, the teal vest over a red shirt), three more for a Vancouver crowd. The game's own
 * art colours, as the design rules allow for a game's props (DESIGN.md).
 */
export const LOOKS: readonly Look[] = [
  dress("m", "hair_short", "backpack", "idle", "walk", skin.deep, { top: "#d9962a", pants: "#2b3550", shoes: "#ece7dc", hair: "#2a1c14", bag: "#2e6f73", strap: "#1f4d50" }),
  dress("f", "hair_bun", "backpack", "idle_phone", "walk_brisk", skin.warm, { top: "#5cc79b", pants: "#6b3a5e", shoes: "#f2c14e", hair: "#1f1612", bag: "#a98bd8" }),
  dress("m", "hair_short", null, "idle_arms", "walk", skin.warm, { top: "#3f8f94", forearm: "#c4473a", pants: "#6d6f78", shoes: "#4a3426", hair: "#bdb9b0" }),
  dress("f", "hair_tail", "satchel", "idle", "walk", skin.light, { top: "#c8402f", pants: "#1d1f2a", shoes: "#2a2321", hair: "#3b2416", bag: "#7a4a2a", strap: "#5a361e" }),
  dress("m", "cap", null, "idle_phone", "walk_brisk", skin.brown, { top: "#44599a", pants: "#c2a878", shin: skin.brown, shoes: "#ece7dc", hair: "#d36b2a", accent: "#b4541c" }),
  dress("f", "hair_bun", "backpack", "idle_arms", "walk", skin.tan, { top: "#f0c419", pants: "#3d5a80", shoes: "#ece7dc", hair: "#1a1210", bag: "#1f4e5f" })
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

/**
 * A look's body in one piece, so a person is one draw (it was two to six: the body, the eyes, the hair,
 * the bag, the straps): each worn part sits on a bone in the file, and here it is moved into the body's
 * bind pose and skinned to that bone alone, so it moves exactly as it did on the bone.
 */
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
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || !worn.has(object.name)) return;
    const bone = skeleton.bones.indexOf(object.parent as THREE.Bone);
    if (bone < 0) throw new Error(`${object.name} is not on a bone`);
    const part = object.geometry.clone();
    part.applyMatrix4(unbind.clone().multiply(skeleton.boneInverses[bone].clone().invert()).multiply(object.matrix));
    part.normalizeNormals();
    const count = part.getAttribute("position").count;
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
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error("the parts of a look don't fit together");
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
export function kitFrom(man: GLTF, woman: GLTF): PeopleKit {
  const clips = clipsOf(man);
  // (one material per look, for the body, the hair and the bag alike: the UVs pick the cell)
  const materials = LOOKS.map((look) => new THREE.MeshStandardMaterial({ map: palette(look), roughness: 0.82, metalness: 0 }));
  const sources = { m: man.scene, f: woman.scene };
  const shapes = LOOKS.map((look) => oneShape(sources[look.body], look));
  return { spawn: (index) => new Person(sources, clips, materials, shapes, index) };
}

export async function loadPeople(loader = new GLTFLoader()): Promise<PeopleKit> {
  const [man, woman] = await Promise.all([loader.loadAsync(PEOPLE_FILES.m), loader.loadAsync(PEOPLE_FILES.f)]);
  return kitFrom(man, woman);
}

type Kind = "tag" | "foul" | "swing" | "hide" | "over";

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
  private readonly head: THREE.Object3D | null;
  private readonly neck: THREE.Object3D | null;
  private readonly seed: number;
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

  constructor(sources: { m: THREE.Object3D; f: THREE.Object3D }, clips: Map<string, THREE.AnimationClip>, materials: THREE.Material[], shapes: THREE.BufferGeometry[], index: number) {
    const lookIndex = ((index % LOOKS.length) + LOOKS.length) % LOOKS.length;
    this.look = LOOKS[lookIndex];
    this.seed = (index * 2.39996) % (Math.PI * 2);
    this.phase = (index * 0.618) % 1;
    const model = SkeletonUtils.clone(sources[this.look.body]);
    // the body becomes the look in one piece; the separate parts go
    const loose: THREE.Object3D[] = [];
    model.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) {
        object.geometry = shapes[lookIndex];
        object.material = materials[lookIndex];
        object.frustumCulled = false;
      } else if (object instanceof THREE.Mesh) loose.push(object);
    });
    for (const part of loose) part.removeFromParent();
    model.scale.setScalar(PERSON_SCALE);
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
    for (const once of [this.punch, this.hit, this.getup, this.flinch]) {
      once.setLoop(THREE.LoopOnce, 1);
      once.clampWhenFinished = true;
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
  update(dt: number, now: number, speed: number, pose: Pose, kind: Kind): void {
    const step = Math.min(0.05, Math.max(0, dt));
    if (pose !== this.pose) {
      if (this.pose === "stunned") {
        // back on their feet: the fall (or the recoil) lets go, back to walking
        for (const shot of this.shots) shot.until = Math.min(shot.until, now);
        this.next = null;
      }
      if (pose === "windup" || (pose === "punch" && this.pose !== "windup")) {
        this.play(this.punch, PUNCH_RATE, now, now + (this.punch.getClip().duration / PUNCH_RATE) * 1000 - 120);
      }
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
        this.next = { action: this.getup, rate: this.getup.getClip().duration / Math.max(0.3, STUN_MS / 1000 - fall), at: now + fall * 1000 };
      }
      this.pose = pose;
    }
    if (this.next && now >= this.next.at) {
      this.play(this.next.action, this.next.rate, now, Infinity);
      this.next = null;
    }
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
    // the legs: standing, walking or jogging, by speed (in the clips' metres a second)
    const metres = (speed * SCENE_PER_WORLD) / PERSON_SCALE;
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
    const free = legs * (1 - this.dancing);
    this.idle.setEffectiveWeight((1 - this.moving) * free);
    this.walk.setEffectiveWeight(this.moving * (1 - this.jogging) * free);
    this.jog.setEffectiveWeight(this.moving * this.jogging * free);
    this.dance.setEffectiveWeight(this.dancing * legs);
    this.mixer.update(step);
    // a glance: the head looks one way, then the other (by hand, after the clips have had their say)
    this.glance = damp(this.glance, pose === "glance" ? 1 : 0, 5, step);
    if (this.glance > 0.01 && this.head && this.neck) {
      const look = Math.tanh(Math.sin((now / 1000) * 1.7 + this.seed) * 2.6) * 0.85 * this.glance;
      this.neck.quaternion.multiply(this.yawKick.setFromAxisAngle(UP, look * 0.35));
      this.head.quaternion.multiply(this.yawKick.setFromAxisAngle(UP, look * 0.65));
    }
  }

  /** Where the head is this frame, in the scene, once its clips have moved it (what floats over it: the dizzy stars). */
  headPosition(target: THREE.Vector3): THREE.Vector3 {
    if (this.head) return this.head.getWorldPosition(target);
    return target.copy(this.root.position).setY(PERSON_HEIGHT * 0.92);
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

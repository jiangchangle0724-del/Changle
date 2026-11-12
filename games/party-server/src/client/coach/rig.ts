// The coach's body: a cartoon dance teacher built from rounded shapes (no model file to download,
// nothing to license), on a skeleton named like Mixamo's, so a modelled character can take its place
// later. Each frame a Pose (pose.ts) goes on it: the hips, chest and head are turned directly; the
// arms and legs bend by two-bone IK so the wrists and ankles land where the pose says.
import {
  BackSide,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  DataTexture,
  DoubleSide,
  Euler,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RedFormat,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";
import type { Pose, V3 } from "./pose";
import type { Face, Outfit, Wear } from "./style";

// ---------- sizes (metres)
const HIP_Y = 0.875;
const HIP_W = 0.1;
const THIGH = 0.4;
const SHIN = 0.4;
export const ANKLE_Y = 0.075;
const SHOULDER_W = 0.19;
const SHOULDER_Y = 0.26;
const UPPER_ARM = 0.29;
const FOREARM = 0.27;

export const COLORS = {
  skin: "#efbe9c",
  hair: "#2a1d3a",
  top: "#8f7bff",
  topLight: "#cfc6ff",
  pants: "#3a3f8f",
  waist: "#ffd84a",
  shoe: "#f7f6ff",
  sole: "#ffcc4d",
  band: "#ffd84a",
  headband: "#ff5fa2",
  eye: "#1b1230",
  mouth: "#7a2448",
  cheek: "#ff8fb0",
  hanky: "#ff4f7b",
  outline: "#0b0720",
  // what an outfit puts on (style.ts)
  hat: "#16141f",
  skirt: "#ffffff",
  sleeve: "#9a5fd6",
  flower: "#ff5fa2",
  lapel: "#16141f",
  shades: "#14121c",
  brow: "#2a1d3a",
  mouthIn: "#5a1530",
  teeth: "#ffffff",
  tongue: "#ff7d98",
};
/** the colours an outfit can't change (the face's insides, the outline) */
const FIXED = new Set(["eye", "mouth", "cheek", "outline", "shades", "brow", "mouthIn", "teeth", "tongue", "band", "sole", "hanky"]);
/** shells seen from inside too (a skirt, a sleeve, a hat's brim) */
const TWO_SIDED = new Set(["skirt", "sleeve", "hat", "lapel", "flower"]);

/** Three tones of light and shade: the cartoon look. */
function toonRamp(): DataTexture {
  const t = new DataTexture(new Uint8Array([90, 170, 255]), 3, 1, RedFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** The dark outline round each part: its back faces, pushed out along the normals. */
function outlineMaterial(color: string, thickness: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { color: { value: new Color(color) }, thickness: { value: thickness } },
    vertexShader: "uniform float thickness; void main() { vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
    fragmentShader: "uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }",
    side: BackSide,
  });
}

const DOWN = new Vector3(0, -1, 0);

export class Rig {
  readonly root = new Group();
  private readonly ramp = toonRamp();
  private readonly mats = new Map<string, MeshToonMaterial>();
  private readonly line = outlineMaterial(COLORS.outline, 0.011);
  private readonly owned: (BufferGeometry | Material)[] = [];

  readonly hips = new Group();
  private readonly spine = new Group();
  readonly chest = new Group();
  private readonly neck = new Group();
  readonly head = new Group();
  private readonly arm = { R: this.limbGroups(), L: this.limbGroups() };
  private readonly leg = { R: this.limbGroups(), L: this.limbGroups() };
  private readonly shoulder = { R: new Group(), L: new Group() };
  private readonly hipJoint = { R: new Group(), L: new Group() };
  private readonly hanky = { R: new Group(), L: new Group() };
  private readonly eyes: Mesh[] = [];
  /** the face's other parts, shown by the face it makes */
  private readonly face = {
    arcs: [] as Mesh[],
    brows: [] as Mesh[],
    cheeks: [] as Mesh[],
    smile: null as Mesh | null,
    grin: new Group(),
    tongue: null as Mesh | null,
    o: new Group(),
    smirk: null as Mesh | null,
    flat: null as Mesh | null,
  };
  /** what an outfit can put on or take off */
  private readonly extras = new Map<Wear, Object3D[]>();
  private readonly hairOn: Object3D[] = [];
  private faceNow: Face = "smile";
  private readonly tail: { pos: Vector3[]; prev: Vector3[]; balls: Mesh[]; anchor: Object3D; ready: boolean };
  /** what lights up (the parts the move is about) */
  private readonly glowHands: MeshToonMaterial;
  private readonly glowFeet: MeshToonMaterial;

  constructor() {
    this.glowHands = this.mat("band");
    this.glowFeet = this.mat("sole");
    this.build();
    this.tail = this.buildTail();
    this.buildExtras();
    this.dress({ dye: {}, wear: [] });
  }

  private limbGroups() {
    return { upper: new Group(), lower: new Group(), end: new Group() };
  }

  private mat(name: keyof typeof COLORS): MeshToonMaterial {
    let m = this.mats.get(name);
    if (!m) {
      m = new MeshToonMaterial({ color: new Color(COLORS[name]), gradientMap: this.ramp, side: TWO_SIDED.has(name) ? DoubleSide : undefined });
      this.mats.set(name, m);
      this.owned.push(m);
    }
    return m;
  }

  /** A part, with its outline unless it's too small to need one. */
  private part(geo: BufferGeometry, color: keyof typeof COLORS, parent: Object3D, at?: V3, outline = true, material?: Material): Mesh {
    this.owned.push(geo);
    const m = new Mesh(geo, material ?? this.mat(color));
    if (at) m.position.set(...at);
    parent.add(m);
    if (outline) {
      const o = new Mesh(geo, this.line);
      m.add(o);
    }
    return m;
  }

  private build() {
    const { root, hips, spine, chest, neck, head } = this;
    root.add(hips);
    hips.rotation.order = "YXZ";
    // the shorts
    const pelvis = new LatheGeometry([new Vector2(0, -0.1), new Vector2(0.135, -0.095), new Vector2(0.16, -0.03), new Vector2(0.155, 0.05), new Vector2(0.13, 0.1), new Vector2(0, 0.11)], 24);
    this.part(pelvis, "pants", hips).scale.set(1, 1, 0.78);
    const belt = new Mesh(new TorusGeometry(0.135, 0.016, 6, 36), this.mat("waist"));
    this.owned.push(belt.geometry);
    belt.rotation.x = Math.PI / 2;
    belt.position.set(0, 0.085, 0);
    belt.scale.set(1, 0.78, 1);
    hips.add(belt);
    // the waist and the chest
    spine.position.set(0, 0.08, 0);
    spine.rotation.order = "YXZ";
    hips.add(spine);
    this.part(new SphereGeometry(0.135, 24, 16), "top", spine, [0, 0.03, 0]).scale.set(1, 1.05, 0.74);
    chest.position.set(0, 0.14, 0);
    chest.rotation.order = "YXZ";
    spine.add(chest);
    const torso = new LatheGeometry(
      [new Vector2(0, -0.04), new Vector2(0.14, -0.03), new Vector2(0.165, 0.06), new Vector2(0.19, 0.17), new Vector2(0.2, 0.25), new Vector2(0.175, 0.31), new Vector2(0.09, 0.345), new Vector2(0, 0.35)],
      28,
    );
    this.part(torso, "top", chest).scale.set(1, 1, 0.64);
    // a stripe across the chest
    const stripe = new Mesh(new TorusGeometry(0.188, 0.012, 6, 40), this.mat("topLight"));
    this.owned.push(stripe.geometry);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.set(0, 0.2, 0);
    stripe.scale.set(1, 0.64, 1);
    chest.add(stripe);
    // the neck and the head
    neck.position.set(0, SHOULDER_Y + 0.04, 0);
    neck.rotation.order = "YXZ";
    chest.add(neck);
    this.part(new CapsuleGeometry(0.05, 0.05, 4, 12), "skin", neck, [0, 0.02, 0], false);
    head.position.set(0, 0.05, 0);
    head.rotation.order = "YXZ";
    neck.add(head);
    this.buildHead();
    // arms
    for (const s of ["R", "L"] as const) {
      const side = s === "R" ? 1 : -1;
      const sh = this.shoulder[s];
      sh.position.set(side * SHOULDER_W, SHOULDER_Y, 0);
      chest.add(sh);
      // the shoulder's round top, in the shirt
      this.part(new SphereGeometry(0.07, 16, 12), "top", sh, [side * -0.01, 0, 0]);
      const a = this.arm[s];
      sh.add(a.upper);
      this.part(new CapsuleGeometry(0.068, 0.07, 4, 14), "top", a.upper, [0, -0.05, 0]);
      this.part(new CapsuleGeometry(0.05, UPPER_ARM - 0.06, 4, 14), "skin", a.upper, [0, -UPPER_ARM / 2 - 0.02, 0]);
      a.lower.position.set(0, -UPPER_ARM, 0);
      a.upper.add(a.lower);
      this.part(new CapsuleGeometry(0.044, FOREARM, 4, 14), "skin", a.lower, [0, -FOREARM / 2, 0]);
      const band = this.part(new CapsuleGeometry(0.052, 0.035, 4, 14), "band", a.lower, [0, -FOREARM + 0.035, 0], true, this.glowHands);
      band.scale.set(1, 1, 1);
      a.end.position.set(0, -FOREARM, 0);
      a.lower.add(a.end);
      // a mitten: the palm faces the hand's +z, the thumb sits on its inner side
      this.part(new SphereGeometry(0.052, 18, 14), "skin", a.end, [0, -0.06, 0]).scale.set(0.92, 1.3, 0.62);
      this.part(new CapsuleGeometry(0.018, 0.04, 4, 8), "skin", a.end, [side * -0.042, -0.04, 0.01], false).rotation.z = side * -0.5;
      // the handkerchief, out of the fingers
      const hk = this.hanky[s];
      hk.position.set(0, -0.11, 0);
      a.end.add(hk);
      const cloth = new Mesh(new PlaneGeometry(0.2, 0.2, 1, 1), new MeshBasicMaterial({ color: new Color(COLORS.hanky), side: DoubleSide }));
      this.owned.push(cloth.geometry, cloth.material as Material);
      cloth.position.set(0.08, -0.08, 0);
      cloth.rotation.z = Math.PI / 4;
      hk.add(cloth);
      hk.visible = false;
    }
    // legs
    for (const s of ["R", "L"] as const) {
      const side = s === "R" ? 1 : -1;
      const hj = this.hipJoint[s];
      hj.position.set(side * HIP_W, -0.04, 0);
      hips.add(hj);
      const l = this.leg[s];
      hj.add(l.upper);
      this.part(new CapsuleGeometry(0.08, THIGH, 4, 14), "pants", l.upper, [0, -THIGH / 2, 0]);
      l.lower.position.set(0, -THIGH, 0);
      l.upper.add(l.lower);
      this.part(new CapsuleGeometry(0.064, SHIN, 4, 14), "pants", l.lower, [0, -SHIN / 2, 0]);
      l.end.position.set(0, -SHIN, 0);
      l.lower.add(l.end);
      // a trainer: toes along the foot's +z
      const shoe = this.part(new CapsuleGeometry(0.052, 0.13, 4, 14), "shoe", l.end, [0, -0.035, 0.055]);
      shoe.rotation.x = Math.PI / 2;
      shoe.scale.set(1.12, 1, 0.78);
      const sole = this.part(new CapsuleGeometry(0.054, 0.14, 4, 14), "sole", l.end, [0, -0.068, 0.055], false, this.glowFeet);
      sole.rotation.x = Math.PI / 2;
      sole.scale.set(1.16, 1, 0.3);
    }
  }

  private buildHead() {
    const h = this.head;
    const c: V3 = [0, 0.13, 0];
    this.part(new SphereGeometry(0.165, 32, 24), "skin", h, c).scale.set(0.95, 1, 0.93);
    // hair: a cap over the top and back, a fringe
    const cap = this.part(new SphereGeometry(0.173, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), "hair", h, [0, 0.135, -0.008]);
    cap.rotation.x = -0.42;
    cap.scale.set(0.97, 1, 0.97);
    for (const [x, rz] of [
      [-0.06, 0.5],
      [0.0, 0.05],
      [0.06, -0.5],
    ] as const) {
      const f = this.part(new SphereGeometry(0.055, 12, 10), "hair", h, [x, 0.25, 0.095], false);
      f.scale.set(1, 0.55, 0.7);
      f.rotation.z = rz;
    }
    const band = this.part(new TorusGeometry(0.163, 0.018, 8, 40), "headband", h, [0, 0.215, 0.0], false);
    band.rotation.x = Math.PI / 2 - 0.42;
    this.hairOn.push(band);
    // eyes (open, or shut happy arcs), eyebrows, cheeks
    const f = this.face;
    for (const x of [-0.052, 0.052]) {
      const e = this.part(new SphereGeometry(0.025, 14, 12), "eye", h, [x * 1.08, 0.15, 0.145], false);
      e.scale.set(0.82, 1.25, 0.5);
      this.eyes.push(e);
      const shine = new Mesh(new SphereGeometry(0.007, 8, 6), new MeshBasicMaterial({ color: 0xffffff }));
      this.owned.push(shine.geometry, shine.material as Material);
      shine.position.set(0.25, 0.35, 0.8);
      e.add(shine);
      const arc = this.part(new TorusGeometry(0.021, 0.0065, 6, 14, Math.PI), "eye", h, [x * 1.08, 0.142, 0.15], false);
      f.arcs.push(arc);
      const brow = this.part(new CapsuleGeometry(0.009, 0.036, 4, 8), "brow", h, [x * 1.08, 0.2, 0.142], false);
      brow.rotation.z = Math.PI / 2;
      f.brows.push(brow);
      const ch = this.part(new SphereGeometry(0.024, 12, 8), "cheek", h, [x * 1.7, 0.098, 0.13], false);
      ch.scale.set(1.3, 0.75, 0.4);
      f.cheeks.push(ch);
    }
    // mouths: a smile, an open grin (teeth, a tongue), an "O", a lopsided smirk, a straight line
    const smile = this.part(new TorusGeometry(0.038, 0.009, 8, 16, Math.PI), "mouth", h, [0, 0.088, 0.152], false);
    smile.rotation.z = Math.PI;
    f.smile = smile;
    f.grin.position.set(0, 0.101, 0.153);
    h.add(f.grin);
    this.part(new CircleGeometry(0.05, 20, Math.PI, Math.PI), "mouthIn", f.grin);
    this.part(new PlaneGeometry(0.08, 0.014), "teeth", f.grin, [0, -0.008, 0.001], false);
    f.tongue = this.part(new CircleGeometry(0.019, 14), "tongue", f.grin, [0, -0.03, 0.001], false);
    f.tongue.scale.set(1.3, 0.8, 1);
    f.o.position.set(0, 0.083, 0.153);
    h.add(f.o);
    this.part(new CircleGeometry(0.019, 16), "mouthIn", f.o).scale.set(0.95, 1.3, 1);
    this.part(new TorusGeometry(0.019, 0.006, 8, 18), "mouth", f.o, [0, 0, 0.001], false).scale.set(0.95, 1.3, 1);
    f.smirk = this.part(new TorusGeometry(0.032, 0.008, 8, 16, Math.PI * 0.62), "mouth", h, [0.014, 0.096, 0.152], false);
    f.smirk.rotation.z = Math.PI + 0.25;
    f.flat = this.part(new CapsuleGeometry(0.0065, 0.036, 4, 8), "mouth", h, [0, 0.09, 0.153], false);
    f.flat.rotation.z = Math.PI / 2;
    this.part(new SphereGeometry(0.014, 10, 8), "skin", h, [0, 0.118, 0.162], false);
  }

  /** The outfits' extras, made once and shown when worn. */
  private buildExtras() {
    const h = this.head;
    const add = (w: Wear, ...o: Object3D[]) => this.extras.set(w, [...(this.extras.get(w) ?? []), ...o]);
    // sunglasses: two dark lenses with a shine, a bridge
    const shades = new Group();
    shades.position.set(0, 0.153, 0.158);
    h.add(shades);
    for (const x of [-0.058, 0.058]) {
      this.part(new SphereGeometry(0.036, 16, 10), "shades", shades, [x, 0, 0], false).scale.set(1.3, 0.85, 0.32);
      const glint = new Mesh(new PlaneGeometry(0.018, 0.007), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
      this.owned.push(glint.geometry, glint.material as Material);
      glint.position.set(x - 0.012, 0.012, 0.013);
      glint.rotation.z = 0.5;
      shades.add(glint);
    }
    this.part(new CapsuleGeometry(0.005, 0.03, 4, 6), "shades", shades, [0, 0.006, 0.004], false).rotation.z = Math.PI / 2;
    add("shades", shades);
    // a bow tie at the collar
    const bow = new Group();
    bow.position.set(0, SHOULDER_Y + 0.02, 0.105);
    this.chest.add(bow);
    for (const x of [-0.03, 0.03]) this.part(new SphereGeometry(0.026, 12, 8), "lapel", bow, [x, 0, 0], false).scale.set(1.3, 0.85, 0.5);
    this.part(new SphereGeometry(0.012, 8, 6), "lapel", bow, [0, 0, 0.006], false);
    add("bowtie", bow);
    // a jacket's lapels down the chest
    const lapels = new Group();
    this.chest.add(lapels);
    const shirt = this.part(new CircleGeometry(0.075, 3), "teeth", lapels, [0, 0.235, 0.124], false);
    shirt.rotation.z = -Math.PI / 2;
    shirt.scale.set(1.5, 0.9, 1);
    for (const side of [-1, 1]) {
      const l = this.part(new PlaneGeometry(0.045, 0.2), "lapel", lapels, [side * 0.075, 0.2, 0.122], false);
      l.rotation.set(-0.1, side * 0.45, side * 0.28);
    }
    add("lapels", lapels);
    // a cowboy hat: a brim curling up at the edge, a dented crown
    const cowboy = new Group();
    cowboy.position.set(0, 0.255, -0.012);
    cowboy.rotation.x = -0.14;
    h.add(cowboy);
    this.part(new LatheGeometry([new Vector2(0.0, 0), new Vector2(0.27, 0), new Vector2(0.31, 0.04)], 32), "hat", cowboy, undefined, false).scale.set(1, 1, 0.86);
    this.part(new LatheGeometry([new Vector2(0, 0.15), new Vector2(0.09, 0.155), new Vector2(0.13, 0.11), new Vector2(0.14, 0.0)], 24), "hat", cowboy, undefined, false).scale.set(1, 1, 0.86);
    this.part(new TorusGeometry(0.138, 0.012, 6, 30), "topLight", cowboy, [0, 0.022, 0], false).rotation.x = Math.PI / 2;
    add("cowboy", cowboy);
    // a cap: the crown over the head, the peak out front (or turned round)
    const cap = new Group();
    h.add(cap);
    this.part(new SphereGeometry(0.178, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), "hat", cap, [0, 0.16, -0.005], false).scale.set(0.98, 0.78, 0.98);
    const peak = this.part(new CircleGeometry(0.12, 20, 0, Math.PI), "hat", cap, [0, 0.19, 0.13], false);
    peak.rotation.x = Math.PI / 2 + 0.18;
    peak.scale.set(1, 0.85, 1);
    add("cap", cap);
    const capBack = cap.clone();
    capBack.rotation.y = Math.PI;
    h.add(capBack);
    add("capBack", capBack);
    // headphones: the band over the top, a cup on each ear
    const phones = new Group();
    phones.position.set(0, 0.13, -0.01);
    h.add(phones);
    this.part(new TorusGeometry(0.185, 0.013, 8, 32, Math.PI), "hat", phones, undefined, false);
    for (const x of [-0.172, 0.172]) this.part(new SphereGeometry(0.05, 14, 10), "hat", phones, [x, 0, 0], true).scale.set(0.55, 1, 0.9);
    add("headphones", phones);
    // a flower over one ear
    const flower = new Group();
    flower.position.set(0.13, 0.245, 0.06);
    flower.rotation.set(0, 0.9, -0.3);
    h.add(flower);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      this.part(new SphereGeometry(0.024, 10, 8), "flower", flower, [Math.cos(a) * 0.026, Math.sin(a) * 0.026, 0], false).scale.set(1, 1, 0.45);
    }
    this.part(new SphereGeometry(0.014, 8, 6), "waist", flower, [0, 0, 0.008], false);
    add("flower", flower);
    // a hair bow where the ponytail's tied
    const hairBow = new Group();
    hairBow.position.set(0, 0.29, -0.11);
    h.add(hairBow);
    for (const x of [-0.045, 0.045]) this.part(new SphereGeometry(0.035, 12, 8), "flower", hairBow, [x, 0, 0], false).scale.set(1.3, 0.8, 0.5);
    this.part(new SphereGeometry(0.015, 8, 6), "flower", hairBow, [0, 0, 0.006], false);
    add("bow", hairBow);
    // a skirt, flaring out from the waist
    const skirt = this.part(new LatheGeometry([new Vector2(0.145, 0.07), new Vector2(0.175, -0.04), new Vector2(0.245, -0.2), new Vector2(0.29, -0.32)], 32), "skirt", this.hips, undefined, false);
    skirt.scale.set(1, 1, 0.82);
    add("skirt", skirt);
    // a kimono's long, wide sleeves, hanging off the upper arms
    for (const s of ["R", "L"] as const) {
      const sleeve = this.part(new LatheGeometry([new Vector2(0.07, 0.02), new Vector2(0.11, -0.1), new Vector2(0.155, -0.22), new Vector2(0.165, -0.32)], 20), "sleeve", this.arm[s].upper, [0, -0.04, 0], false);
      sleeve.scale.set(1, 1, 0.45);
      add("kimono", sleeve);
    }
  }

  /** Put on an outfit: its colours over the coach's own, its extras, the hair tied back or short. */
  dress(outfit: Outfit) {
    for (const [name, m] of this.mats) {
      if (FIXED.has(name)) continue;
      m.color.set((outfit.dye as Record<string, string | undefined>)[name] ?? COLORS[name as keyof typeof COLORS]);
    }
    const worn = new Set(outfit.wear);
    for (const [w, objs] of this.extras) for (const o of objs) o.visible = worn.has(w);
    const longHair = !outfit.short;
    for (const o of this.hairOn) o.visible = longHair && !worn.has("cowboy") && !worn.has("cap") && !worn.has("capBack");
    if (this.tail) {
      for (const b of this.tail.balls) b.visible = longHair;
      this.tail.anchor.visible = longHair;
    }
  }

  /** Make a face (the eyes still blink while they're open). */
  setFace(face: Face, secs: number) {
    this.faceNow = face;
    const f = this.face;
    const arcs = face === "grin" || face === "laugh" || face === "shy";
    // eyes: open, half shut (cool, smug), wide (wow), or shut happy arcs (one, for a wink)
    const blink = secs % 3.7 < 0.12 ? 0.15 : 1;
    const lid = face === "cool" ? 0.55 : face === "smug" ? 0.62 : face === "wow" ? 1.6 : face === "focus" ? 0.95 : 1.25;
    for (let i = 0; i < 2; i++) {
      const winkHere = face === "wink" && i === 1;
      const shut = arcs || winkHere;
      const e = this.eyes[i]!;
      e.visible = !shut;
      e.scale.set(face === "wow" ? 0.95 : 0.82, lid * blink, 0.5);
      f.arcs[i]!.visible = shut;
    }
    // eyebrows: up (wow, laughing), knitted (focus, cool), worried (shy), one up (smug, wink)
    const side = [-1, 1];
    for (let i = 0; i < 2; i++) {
      const b = f.brows[i]!;
      const s = side[i]!;
      let y = 0.2;
      let tilt = 0;
      if (face === "wow") y = 0.218;
      else if (face === "laugh" || face === "grin") y = 0.21;
      else if (face === "focus" || face === "cool") { y = 0.195; tilt = 0.32; }
      else if (face === "shy") { y = 0.205; tilt = -0.3; }
      else if (face === "smug" || face === "wink") { y = i === 0 ? 0.214 : 0.197; tilt = i === 0 ? -0.15 : 0.2; }
      b.position.y = y;
      // (a positive tilt drops the brow's inner end: cross)
      b.rotation.z = Math.PI / 2 + s * tilt;
    }
    for (const c of f.cheeks) c.scale.set(face === "shy" ? 1.7 : 1.3, face === "shy" ? 1.05 : 0.75, 0.4);
    // the mouth
    f.smile!.visible = face === "smile" || face === "shy";
    f.smile!.scale.setScalar(face === "shy" ? 0.7 : 1);
    f.grin.visible = face === "grin" || face === "laugh";
    f.grin.scale.set(face === "laugh" ? 1.15 : 1, face === "laugh" ? 1.25 : 1, 1);
    f.tongue!.visible = face === "laugh";
    f.o.visible = face === "wow";
    f.smirk!.visible = face === "cool" || face === "smug" || face === "wink";
    f.flat!.visible = face === "focus";
  }

  /** A ponytail that swings: three balls on a chain, in the world (it lags behind the head). */
  private buildTail() {
    const anchor = new Object3D();
    anchor.position.set(0, 0.27, -0.13);
    this.head.add(anchor);
    const tie = this.part(new TorusGeometry(0.03, 0.012, 8, 16), "headband", anchor, [0, 0, 0], false);
    tie.rotation.x = 0.6;
    this.hairOn.push(tie);
    const balls: Mesh[] = [];
    for (const r of [0.055, 0.05, 0.042, 0.032]) {
      const b = this.part(new SphereGeometry(r, 14, 10), "hair", this.root, undefined, true);
      balls.push(b);
    }
    return { pos: balls.map(() => new Vector3()), prev: balls.map(() => new Vector3()), balls, anchor, ready: false };
  }

  // ---------- each frame

  private readonly v = { a: new Vector3(), b: new Vector3(), c: new Vector3(), d: new Vector3(), e: new Vector3(), n: new Vector3() };
  private readonly q = { a: new Quaternion(), b: new Quaternion(), c: new Quaternion(), d: new Quaternion() };
  /** (kept apart from the scratch ones above: the IK and the hands use those) */
  private readonly qChest = new Quaternion();
  private readonly qHip = new Quaternion();
  private readonly qRoot = new Quaternion();
  private readonly m4 = new Matrix4();
  private readonly eul = new Euler(0, 0, 0, "YXZ");

  /** Put the body in a pose. `dt` (seconds) moves the ponytail; `glow` lights the hands or the feet. */
  apply(p: Pose, dt: number, glow: { hands: number; feet: number }, secs: number) {
    const { root, hips, spine, chest, neck, head } = this;
    root.position.set(p.rx, 0, p.rz);
    root.rotation.set(0, p.turn, 0);
    hips.position.set(p.px, HIP_Y + p.py, p.pz);
    hips.rotation.set(p.pitch, p.yaw, p.roll);
    spine.rotation.set(p.cPitch * 0.4, p.cYaw * 0.4, p.cRoll * 0.4);
    chest.rotation.set(p.cPitch * 0.6, p.cYaw * 0.6, p.cRoll * 0.6);
    neck.rotation.set(p.hPitch * 0.3, p.hYaw * 0.3, p.hRoll * 0.3);
    head.rotation.set(p.hPitch * 0.7, p.hYaw * 0.7, p.hRoll * 0.7);
    this.shoulder.R.position.set(SHOULDER_W, SHOULDER_Y + p.sR[0], p.sR[1]);
    this.shoulder.L.position.set(-SHOULDER_W, SHOULDER_Y + p.sL[0], p.sL[1]);
    root.updateMatrixWorld(true);
    const chestQ = chest.getWorldQuaternion(this.qChest);
    for (const s of ["R", "L"] as const) {
      const hand = s === "R" ? p.hR : p.hL;
      const sh = s === "R" ? p.sR : p.sL;
      // the wrist: between the shoulders plus the pose's offset, in the chest's frame
      const target = this.v.e.set(hand[0], SHOULDER_Y + hand[1] + sh[0], hand[2] + sh[1]);
      chest.localToWorld(target);
      const pole = this.v.n.set(...(s === "R" ? p.eR : p.eL)).applyQuaternion(chestQ);
      const a = this.arm[s];
      const foreWorld = this.twoBone(a.upper, a.lower, UPPER_ARM, FOREARM, target, pole);
      // the hand faces where the pose says, around the forearm
      const palm = this.v.c.set(...(s === "R" ? p.pR : p.pL)).applyQuaternion(chestQ);
      this.orient(a.end, foreWorld, palm);
      const hk = this.hanky[s];
      hk.visible = p.hankyOn > 0.05;
      if (hk.visible) {
        hk.rotation.set(0, (s === "R" ? 1 : -1) * p.hanky, 0);
        hk.scale.setScalar(p.hankyOn);
      }
    }
    const hipQ = hips.getWorldQuaternion(this.qHip);
    const rootQ = root.getWorldQuaternion(this.qRoot);
    for (const s of ["R", "L"] as const) {
      const f = s === "R" ? p.fR : p.fL;
      const side = s === "R" ? 1 : -1;
      const target = root.localToWorld(this.v.e.set(f.x, ANKLE_Y + f.lift, f.z));
      // knees over the toes: forward, a little out
      const pole = this.v.n.set(side * 0.18, 0, 1).applyQuaternion(hipQ);
      const l = this.leg[s];
      const shinWorld = this.twoBone(l.upper, l.lower, THIGH, SHIN, target, pole);
      // the foot flat (or tipped by its pitch), turned by its yaw
      this.eul.set(-f.pitch, f.yaw, 0, "YXZ");
      const footWorld = this.q.a.setFromEuler(this.eul).premultiply(rootQ);
      l.end.quaternion.copy(shinWorld).invert().multiply(footWorld);
    }
    this.root.updateMatrixWorld(true);
    // the face (blinking now and then)
    this.setFace(this.faceNow, secs);
    // glow on what the move is about
    this.glowHands.emissive.set(COLORS.band).multiplyScalar(0.55 * glow.hands);
    this.glowFeet.emissive.set(COLORS.sole).multiplyScalar(0.55 * glow.feet);
    this.swingTail(dt);
  }

  /**
   * Two-bone IK: turn `upper` (its segment along its own -y, `l1` long) and `lower` (at its end, `l2`
   * long) so the end of `lower` is at `target`, bending towards `pole`. Returns lower's world turn.
   */
  private twoBone(upper: Object3D, lower: Object3D, l1: number, l2: number, target: Vector3, pole: Vector3): Quaternion {
    const A = upper.getWorldPosition(this.v.a);
    const to = this.v.b.copy(target).sub(A);
    let d = to.length();
    const reach = l1 + l2 - 0.002;
    if (d < 1e-5) to.set(0, -1, 0);
    to.normalize();
    d = Math.min(reach, Math.max(Math.abs(l1 - l2) + 0.01, d));
    const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    // the bend's side: the pole, square to the line to the target
    const n = this.v.c.copy(pole).addScaledVector(to, -pole.dot(to));
    if (n.lengthSq() < 1e-8) n.set(0, 0, 1).addScaledVector(to, -to.z);
    n.normalize();
    const upperDir = this.v.d.copy(to).multiplyScalar(cosA).addScaledVector(n, sinA);
    const elbow = this.v.c.copy(A).addScaledVector(upperDir, l1);
    const end = this.v.a.copy(A).addScaledVector(to, d);
    const lowerDir = end.sub(elbow).normalize();
    // upper: its -y onto upperDir, in its parent's frame
    const upperWorld = this.q.a.setFromUnitVectors(DOWN, upperDir);
    const parentQ = upper.parent!.getWorldQuaternion(this.q.b);
    upper.quaternion.copy(parentQ).invert().multiply(upperWorld);
    // lower: lowerDir in upper's frame
    const local = lowerDir.applyQuaternion(this.q.b.copy(upperWorld).invert());
    lower.quaternion.setFromUnitVectors(DOWN, local.normalize());
    return this.q.c.copy(upperWorld).multiply(lower.quaternion);
  }

  /** A hand along its forearm (its -y away from the elbow), its palm (+z) turned towards `palm`. */
  private orient(hand: Object3D, foreWorld: Quaternion, palm: Vector3) {
    const y = this.v.a.set(0, 1, 0).applyQuaternion(foreWorld);
    const z = this.v.b.copy(palm).addScaledVector(y, -palm.dot(y));
    if (z.lengthSq() < 1e-6) z.set(0, 0, 1).addScaledVector(y, -y.z);
    z.normalize();
    const x = this.v.d.crossVectors(y, z).normalize();
    this.m4.makeBasis(x, y, z);
    const world = this.q.d.setFromRotationMatrix(this.m4);
    hand.quaternion.copy(foreWorld).invert().multiply(world);
  }

  private swingTail(dt: number) {
    const t = this.tail;
    const anchor = t.anchor.getWorldPosition(this.v.a);
    const seg = 0.075;
    if (!t.ready || dt <= 0 || dt > 0.25) {
      // (the first frame, or the page was away: hang straight)
      for (let i = 0; i < t.pos.length; i++) {
        t.pos[i]!.set(anchor.x, anchor.y - seg * (i + 1) * 0.8, anchor.z - seg * (i + 1) * 0.6);
        t.prev[i]!.copy(t.pos[i]!);
      }
      t.ready = true;
    } else {
      const g = -9.8 * dt * dt;
      for (let i = 0; i < t.pos.length; i++) {
        const p = t.pos[i]!;
        const v = this.v.b.copy(p).sub(t.prev[i]!).multiplyScalar(0.9);
        t.prev[i]!.copy(p);
        p.add(v);
        p.y += g;
      }
      // keep the links their length, and the tail off the back of the head
      const headC = this.head.localToWorld(this.v.c.set(0, 0.13, 0));
      for (let k = 0; k < 3; k++) {
        let prev = anchor;
        for (let i = 0; i < t.pos.length; i++) {
          const p = t.pos[i]!;
          const d = this.v.d.copy(p).sub(prev);
          const len = d.length() || 1e-6;
          p.copy(prev).addScaledVector(d, seg / len);
          const fromHead = this.v.e.copy(p).sub(headC);
          const r = 0.19;
          if (fromHead.lengthSq() < r * r) p.copy(headC).addScaledVector(fromHead.normalize(), r);
          prev = p;
        }
      }
    }
    for (let i = 0; i < t.balls.length; i++) {
      const b = t.balls[i]!;
      b.position.copy(t.pos[i]!);
      this.root.worldToLocal(b.position);
    }
  }

  /** Where a wrist or an ankle is (world), for the trails and the footprints. */
  wrist(s: "R" | "L", out: Vector3): Vector3 {
    return this.arm[s].end.getWorldPosition(out);
  }
  ankle(s: "R" | "L", out: Vector3): Vector3 {
    return this.leg[s].end.getWorldPosition(out);
  }

  dispose() {
    for (const o of this.owned) o.dispose();
    this.line.dispose();
    this.ramp.dispose();
  }
}

/** A soft round spot (a glow or a shadow), drawn once. */
export function radialTexture(inner: string, outer: string): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// The seawall's bike on screen (2026-11-19, the big upgrade's events): a city bike with a wicker basket
// and its rider pedalling, coming in from out past a side of the floor as its bell rings and riding
// straight through the crowd along its line. Where it is comes from the rules (engine/rideBike, bikeX:
// the same line and the same clock on every screen). While it comes, its line shows on the floor:
// chevrons running the way it rides, from its front wheel to the far side, so a phone sees where not to
// stand. When it knocks someone down it wobbles. The rider is one of the crowd's bodies (people.ts) sat
// on the saddle by hand: their legs reach for the pedals and their hands for the grips (two-bone reaches
// worked out each frame after the body's own clips). With reduced motion the chevrons and the wobble
// hold still; the bike still rides (it's the rules' bike).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ARENA, BIKE_REACH, BIKE_SPEED, bikeX, type BikeRide } from "../../engine";
import { PERSON_SCALE, SCENE_PER_WORLD, type PeopleKit, type Person } from "../people";

export interface BikeColors {
  /** the frame, the tyres, the steel (rims, spokes, bars), the leather saddle and grips, the basket */
  frame: string;
  tyre: string;
  steel: string;
  saddle: string;
  wicker: string;
  /** what lies in the basket: a baguette */
  bread: string;
  /** its line on the floor, and the dark under its chevrons (so they read on a bright lawn) */
  lane: string;
  laneEdge: string;
}

export interface Bike {
  /** this frame's bike (its line, which way, and when it set off on this page's clock), or null: none */
  see(ride: BikeRide | null): void;
  /** it knocked someone down: a wobble */
  bump(now: number): void;
  update(now: number, dt: number, reduced: boolean): void;
  /** the people are in: the rider gets on */
  mount(kit: PeopleKit): void;
  dispose(): void;
}

/**
 * the rider: one of the crowd's looks (the mustard jacket and backpack), past the crowd's own indexes,
 * in a helmet the colour of the bike, so nobody takes them for someone in the crowd
 */
const RIDER_LOOK = 36;
/** how far the bike's front wheel reaches past its middle (metres): the rules' bikeX is the front wheel */
const NOSE = 0.97;
/** the wheels' radius and the cranks' length (metres), and how many turns of the wheel to one of the cranks */
const WHEEL = 0.34;
const CRANK = 0.17;
const GEAR = 2.8;
/** the line on the floor: chevrons this long (scene units), and how fast they run the way it rides */
const CHEVRON = 0.9;
const RUN = 1.6;
const LANE_Y = 0.014;
/** the bike's shadow lies with the people's (Arena3D's SHADOW_Y) */
const SHADOW_Y = 0.016;
/** the wobble when it hits someone: how far it rolls (radians) and for how long (ms) */
const WOBBLE = 0.16;
const WOBBLE_MS = 700;

const sceneX = (x: number) => (x - ARENA.width / 2) * SCENE_PER_WORLD;
const sceneZ = (y: number) => (y - ARENA.height / 2) * SCENE_PER_WORLD;

/** A shape in one colour (its vertices carry it), for merging with others into one draw. */
function painted(geometry: THREE.BufferGeometry, color: THREE.Color): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const count = flat.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) colors.set([color.r, color.g, color.b], index * 3);
  flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  flat.deleteAttribute("uv");
  return flat;
}

const UP = new THREE.Vector3(0, 1, 0);

/** A tube from one point to another (metres). */
function tube(from: THREE.Vector3, to: THREE.Vector3, radius: number, color: THREE.Color, sides = 8): THREE.BufferGeometry {
  const length = from.distanceTo(to);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, sides, 1);
  const turn = new THREE.Quaternion().setFromUnitVectors(UP, to.clone().sub(from).normalize());
  geometry.applyQuaternion(turn);
  geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return painted(geometry, color);
}

const at = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

/** Where the bike's parts are (metres; x forward, y up, z to the rider's right; the bottom bracket at the middle). */
const FRAME = {
  bb: at(0, 0.28),
  rear: at(-0.45, WHEEL),
  front: at(0.62, WHEEL),
  seat: at(-0.17, 0.8),
  saddle: at(-0.215, 0.95),
  headTop: at(0.46, 0.88),
  headBottom: at(0.51, 0.72),
  stem: at(0.44, 0.99),
  grip: at(0.31, 1.0, 0.27)
} as const;

/** The frame, the fork, the bars, the saddle, the chain and the basket: one shape, painted. */
function frameShape(colors: Record<keyof BikeColors, THREE.Color>): THREE.BufferGeometry {
  const { bb, rear, front, seat, saddle, headTop, headBottom, stem, grip } = FRAME;
  const parts: THREE.BufferGeometry[] = [];
  const frame = colors.frame;
  const steel = colors.steel;
  // the diamond: top tube, down tube, seat tube, and the stays both sides of the back wheel
  parts.push(tube(seat, headTop.clone().add(at(0, -0.03)), 0.019, frame));
  parts.push(tube(bb, headBottom, 0.022, frame));
  parts.push(tube(bb, seat, 0.02, frame));
  parts.push(tube(headBottom.clone().add(at(-0.01, -0.03)), headTop.clone().add(at(0, 0.02)), 0.025, frame));
  for (const side of [-1, 1]) {
    parts.push(tube(at(bb.x, bb.y, side * 0.03), at(rear.x, rear.y, side * 0.06), 0.012, frame));
    parts.push(tube(at(seat.x + 0.01, seat.y - 0.02, side * 0.02), at(rear.x, rear.y, side * 0.06), 0.011, frame));
    // the fork's blades down to the front axle
    parts.push(tube(at(headBottom.x, headBottom.y, side * 0.035), at(front.x, front.y, side * 0.05), 0.013, frame));
    // the mudguards' stays (steel)
    parts.push(tube(at(rear.x, rear.y, side * 0.06), at(rear.x - 0.2, rear.y + 0.2, side * 0.055), 0.004, steel));
  }
  // the fork's crown
  parts.push(painted(new THREE.BoxGeometry(0.05, 0.03, 0.09).translate(headBottom.x, headBottom.y - 0.02, 0), frame));
  // the mudguards: arcs over the wheels, in the frame's colour
  for (const [axle, from, to] of [
    [rear, Math.PI * 0.08, Math.PI * 0.78],
    [front, Math.PI * 0.05, Math.PI * 0.72]
  ] as const) {
    const guard = new THREE.TorusGeometry(WHEEL + 0.04, 0.018, 4, 18, to - from);
    guard.rotateZ(from);
    guard.scale(1, 1, 2.2);
    guard.translate(axle.x, axle.y, 0);
    parts.push(painted(guard, frame));
  }
  // the seat post and the saddle (narrow at its nose)
  parts.push(tube(seat, saddle.clone().add(at(0.01, -0.03)), 0.013, steel));
  const seatShape = new THREE.BoxGeometry(0.27, 0.055, 0.17, 3, 1, 1);
  const position = seatShape.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    position.setZ(index, position.getZ(index) * (x > 0 ? 0.42 : x > -0.05 ? 0.8 : 1));
    if (position.getY(index) > 0) position.setY(index, position.getY(index) + (x < -0.08 ? 0.008 : 0));
  }
  seatShape.computeVertexNormals();
  seatShape.translate(saddle.x - 0.01, saddle.y - 0.01, 0);
  parts.push(painted(seatShape, colors.saddle));
  // the stem, and city bars swept back to the grips
  parts.push(tube(headTop.clone().add(at(0, 0.02)), stem, 0.014, steel));
  for (const side of [-1, 1]) {
    const out = at(stem.x - 0.02, stem.y + 0.005, side * 0.17);
    parts.push(tube(at(stem.x, stem.y, 0), out, 0.011, steel));
    parts.push(tube(out, at(grip.x + 0.05, grip.y, side * grip.z), 0.011, steel));
    parts.push(tube(at(grip.x + 0.07, grip.y, side * grip.z), at(grip.x - 0.06, grip.y + 0.004, side * grip.z), 0.018, colors.saddle));
  }
  // the chainring, the cog and the chain (on the right)
  const ring = new THREE.CylinderGeometry(0.1, 0.1, 0.008, 18).rotateX(Math.PI / 2).translate(bb.x, bb.y, 0.065);
  parts.push(painted(ring, steel));
  const cog = new THREE.CylinderGeometry(0.045, 0.045, 0.008, 12).rotateX(Math.PI / 2).translate(rear.x, rear.y, 0.065);
  parts.push(painted(cog, steel));
  for (const [high, low] of [
    [0.1, 0.045],
    [-0.1, -0.045]
  ] as const) {
    parts.push(tube(at(bb.x, bb.y + high, 0.066), at(rear.x, rear.y + low, 0.066), 0.006, colors.tyre, 4));
  }
  // the wicker basket on the front, a baguette in it, and a little lamp under it
  const basketAt = at(front.x + 0.08, 0.98);
  parts.push(painted(new THREE.BoxGeometry(0.3, 0.2, 0.34).translate(basketAt.x, basketAt.y, 0), colors.wicker));
  parts.push(painted(new THREE.BoxGeometry(0.32, 0.03, 0.36).translate(basketAt.x, basketAt.y + 0.1, 0), colors.wicker.clone().multiplyScalar(0.8)));
  parts.push(tube(at(headTop.x + 0.02, 0.9), at(basketAt.x - 0.12, basketAt.y - 0.08), 0.008, steel, 4));
  const bread = new THREE.CapsuleGeometry(0.035, 0.32, 3, 8);
  bread.rotateZ(-0.95);
  bread.translate(basketAt.x - 0.02, basketAt.y + 0.16, -0.06);
  parts.push(painted(bread, colors.bread));
  parts.push(painted(new THREE.CylinderGeometry(0.03, 0.025, 0.05, 10).rotateZ(Math.PI / 2).translate(front.x + 0.25, 0.86, 0), colors.bread));
  const merged = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return merged;
}

/** A wheel, round its axle (z): the tyre, the rim, a dozen spokes and the hub. */
function wheelShape(colors: Record<keyof BikeColors, THREE.Color>): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(painted(new THREE.TorusGeometry(WHEEL - 0.015, 0.03, 8, 28), colors.tyre));
  parts.push(painted(new THREE.TorusGeometry(WHEEL - 0.05, 0.012, 5, 28), colors.steel));
  for (let spoke = 0; spoke < 12; spoke++) {
    const angle = (spoke / 12) * Math.PI * 2;
    const side = spoke % 2 ? 0.02 : -0.02;
    parts.push(tube(at(0, 0, side), at(Math.cos(angle) * (WHEEL - 0.055), Math.sin(angle) * (WHEEL - 0.055), 0), 0.0045, colors.steel, 3));
  }
  parts.push(painted(new THREE.CylinderGeometry(0.03, 0.03, 0.11, 10).rotateX(Math.PI / 2), colors.steel));
  const merged = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return merged;
}

/** The cranks and pedals, round the bottom bracket (z): the right crank points along +x at no turn. */
function crankShape(colors: Record<keyof BikeColors, THREE.Color>): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    // (the left crank points the other way)
    const tip = at(side * CRANK, 0, side * 0.085);
    parts.push(tube(at(0, 0, side * 0.08), tip, 0.012, colors.steel, 5));
    parts.push(painted(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8).rotateX(Math.PI / 2).translate(tip.x, tip.y, side * 0.14), colors.tyre));
  }
  parts.push(painted(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 8).rotateX(Math.PI / 2), colors.steel));
  const merged = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return merged;
}

/**
 * A cycling helmet, in the head bone's frame (its +y runs up through the head and +z out of the face,
 * as in the people's files; metres, before the head's own scale): over the hair, tipped back a little
 * so its front rim sits above the brows.
 */
function helmetShape(colors: Record<keyof BikeColors, THREE.Color>): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const dome = new THREE.SphereGeometry(0.175, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.54);
  dome.scale(1, 0.92, 1.08);
  parts.push(painted(dome, colors.frame));
  const rim = new THREE.TorusGeometry(0.173, 0.015, 5, 22);
  rim.rotateX(Math.PI / 2);
  rim.scale(1, 1, 1.08);
  rim.translate(0, -0.012, 0);
  parts.push(painted(rim, colors.tyre));
  // three vents along the top
  for (const side of [-0.06, 0, 0.06]) {
    const vent = new THREE.BoxGeometry(0.022, 0.016, 0.21);
    vent.translate(side, 0.158, 0);
    parts.push(painted(vent, colors.tyre));
  }
  const merged = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  merged.rotateX(-0.2);
  merged.translate(0, 0.122, 0.012);
  return merged;
}

/** The line's chevrons: a canvas, tiled along the line (pointing along +u), with its two edges dashed, each on a dark rim. */
function chevronTexture(color: string, edge: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, 128, 128);
    context.lineCap = "round";
    context.lineJoin = "round";
    // a faint wash between the edges
    context.fillStyle = color;
    context.globalAlpha = 0.2;
    context.fillRect(0, 14, 128, 100);
    const chevron = () => {
      context.beginPath();
      context.moveTo(44, 34);
      context.lineTo(80, 64);
      context.lineTo(44, 94);
      context.stroke();
    };
    // the dark rims first, then the colour over them
    context.globalAlpha = 0.45;
    context.strokeStyle = edge;
    context.fillStyle = edge;
    context.lineWidth = 24;
    chevron();
    context.fillRect(4, 1, 80, 15);
    context.fillRect(4, 112, 80, 15);
    context.globalAlpha = 1;
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 15;
    chevron();
    context.fillRect(8, 4, 72, 9);
    context.fillRect(8, 115, 72, 9);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const temp = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  d: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  parent: new THREE.Quaternion(),
  turn: new THREE.Quaternion()
};

/** Turn a bone by a turn in the world's frame (its parent stays where it is). */
function turnInWorld(bone: THREE.Object3D, turn: THREE.Quaternion): void {
  if (!bone.parent) return;
  bone.parent.getWorldQuaternion(temp.parent);
  // (local' = parent⁻¹ · turn · parent · local)
  temp.q.copy(temp.parent).invert().multiply(turn).multiply(temp.parent);
  bone.quaternion.premultiply(temp.q);
  bone.updateMatrixWorld(true);
}

/** Point a bone (the line from it to its child) at a spot in the world. */
function aim(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3): void {
  const from = bone.getWorldPosition(temp.a);
  const now = child.getWorldPosition(temp.b).sub(from).normalize();
  const want = temp.c.copy(target).sub(from).normalize();
  if (now.lengthSq() < 1e-8 || want.lengthSq() < 1e-8) return;
  turnInWorld(bone, temp.turn.setFromUnitVectors(now, want));
}

interface Limb {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  end: THREE.Object3D;
  tip: THREE.Object3D | null;
  lengths: [number, number];
}

/** Two bones reaching for a spot, the joint between them bending towards `bend` (a world direction). */
function reach(limb: Limb, target: THREE.Vector3, bend: THREE.Vector3): void {
  const root = limb.upper.getWorldPosition(temp.d).clone();
  const [a, b] = limb.lengths;
  const toward = target.clone().sub(root);
  const distance = THREE.MathUtils.clamp(toward.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const u = toward.normalize();
  const v = bend.clone().addScaledVector(u, -bend.dot(u)).normalize();
  const cos = (a * a + distance * distance - b * b) / (2 * a * distance);
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const joint = root.addScaledVector(u, a * cos).addScaledVector(v, a * sin);
  aim(limb.upper, limb.lower, joint);
  aim(limb.lower, limb.end, target);
}

export function addBike(scene: THREE.Scene, colors: BikeColors, shadow: THREE.Material): Bike {
  const palette = Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, new THREE.Color(value)])) as Record<keyof BikeColors, THREE.Color>;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
  const root = new THREE.Group();
  root.name = "the seawall's bike";
  root.visible = false;
  // (the bike in metres, at the scale of the people: its rider's size decides it once they get on)
  const body = new THREE.Group();
  body.scale.setScalar(PERSON_SCALE);
  root.add(body);
  const frameGeometry = frameShape(palette);
  const wheelGeometry = wheelShape(palette);
  const crankGeometry = crankShape(palette);
  const helmetGeometry = helmetShape(palette);
  body.add(new THREE.Mesh(frameGeometry, material));
  const rearWheel = new THREE.Mesh(wheelGeometry, material);
  rearWheel.position.copy(FRAME.rear);
  const frontWheel = new THREE.Mesh(wheelGeometry, material);
  frontWheel.position.copy(FRAME.front);
  const cranks = new THREE.Mesh(crankGeometry, material);
  cranks.position.copy(FRAME.bb);
  body.add(rearWheel, frontWheel, cranks);
  // its shadow on the floor (the people's soft shadow, long)
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  shadowGeometry.rotateX(-Math.PI / 2);
  const shade = new THREE.Mesh(shadowGeometry, shadow);
  shade.position.set(0.1 * PERSON_SCALE, SHADOW_Y, -0.06);
  shade.scale.set(2.25 * PERSON_SCALE, 1, 0.72 * PERSON_SCALE);
  shade.renderOrder = -1;
  root.add(shade);
  scene.add(root);

  // its line on the floor, from its front wheel to the far side of the floor
  const laneTexture = chevronTexture(colors.lane, colors.laneEdge);
  const laneMaterial = new THREE.MeshBasicMaterial({ map: laneTexture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const laneGeometry = new THREE.PlaneGeometry(1, 1);
  laneGeometry.rotateX(-Math.PI / 2);
  // (from 0 to 1 along x: it's stretched from the front wheel on)
  laneGeometry.translate(0.5, 0, 0);
  const lane = new THREE.Mesh(laneGeometry, laneMaterial);
  lane.renderOrder = -1;
  lane.visible = false;
  lane.frustumCulled = false;
  scene.add(lane);

  let ride: BikeRide | null = null;
  let rider: Person | null = null;
  let size = 1;
  let limbs: { legs: [Limb, Limb]; arms: [Limb, Limb] } | null = null;
  let bones: Record<string, THREE.Object3D> = {};
  /** the bones the seat turns, and how each stood before (put back before the clips each frame, so nothing adds up) */
  let posed: Array<{ bone: THREE.Object3D; rest: THREE.Quaternion }> = [];
  let spin = 0;
  let pedal = 0;
  let bumpAt = -Infinity;
  let seenAt = -Infinity;

  /** (metres along the bike, in the world: where the bike's middle is for a front wheel at world x) */
  const middleAt = (front: number) => front - (ride!.dir * NOSE * PERSON_SCALE * size) / SCENE_PER_WORLD;

  const seat = () => {
    if (!rider || !limbs) return;
    const forward = temp.a.set(1, 0, 0).applyQuaternion(root.quaternion).clone();
    const right = new THREE.Vector3(0, 0, 1).applyQuaternion(root.quaternion);
    const onBike = (point: THREE.Vector3) => body.localToWorld(point.clone());
    // the hips on the saddle (the body's own clips sway them: put them back)
    const pelvis = bones.pelvis;
    turnInWorld(pelvis, temp.turn.setFromAxisAngle(new THREE.Vector3().crossVectors(UP, forward).normalize(), 0.32));
    const hips = bones.thigh_l.getWorldPosition(new THREE.Vector3()).add(bones.thigh_r.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5);
    const want = onBike(at(FRAME.saddle.x - 0.02, FRAME.saddle.y + 0.085));
    const shift = want.sub(hips);
    rider.root.position.add(shift.applyQuaternion(root.quaternion.clone().invert()));
    rider.root.updateMatrixWorld(true);
    // leaning on the bars, the head up to see the way
    const lean = new THREE.Vector3().crossVectors(UP, forward).normalize();
    for (const [name, angle] of [
      ["spine_01", 0.12],
      ["spine_02", 0.1],
      ["spine_03", 0.06],
      ["neck_01", -0.22],
      ["Head", -0.2]
    ] as const) {
      if (bones[name]) turnInWorld(bones[name], temp.turn.setFromAxisAngle(lean, angle));
    }
    // the feet on the pedals (the right crank at `pedal`, the left opposite), knees forward
    const bend = forward.clone().addScaledVector(UP, 0.35).normalize();
    limbs.legs.forEach((leg, side) => {
      const angle = pedal + (side === 0 ? Math.PI : 0);
      const sign = side === 0 ? -1 : 1;
      const pedalAt = at(FRAME.bb.x + Math.cos(angle) * CRANK, FRAME.bb.y + Math.sin(angle) * CRANK, sign * 0.14);
      const ankle = onBike(pedalAt.clone().add(at(-0.04, 0.075, -sign * 0.02)));
      reach(leg, ankle, bend.clone().addScaledVector(right, sign * 0.15));
      if (leg.tip) aim(leg.end, leg.tip, onBike(pedalAt.clone().add(at(0.13, 0.03, 0))));
    });
    // the hands on the grips, elbows out a little and down
    limbs.arms.forEach((arm, side) => {
      const sign = side === 0 ? -1 : 1;
      const grip = onBike(at(FRAME.grip.x, FRAME.grip.y + 0.02, sign * FRAME.grip.z));
      reach(arm, grip, right.clone().multiplyScalar(sign * 0.7).addScaledVector(UP, -0.5).addScaledVector(forward, -0.3));
    });
  };

  return {
    see(next) {
      if (!next) {
        ride = null;
        return;
      }
      ride = next;
    },
    bump(now) {
      bumpAt = now;
    },
    update(now, dt, reduced) {
      const live = ride;
      const front = live ? bikeX(live, now) : 0;
      const onFloor = !!live && Math.abs(middleAt(front) - ARENA.width / 2) < ARENA.width / 2 + 60;
      root.visible = onFloor;
      if (live && seenAt < live.startsAt) seenAt = live.startsAt;
      // the line: from the front wheel to the far side of the floor, while the bike has some of it to come
      const far = live ? (live.dir > 0 ? ARENA.width + 2 : -2) : 0;
      const ahead = live ? (far - front) * live.dir : 0;
      lane.visible = !!live && ahead > 0;
      if (live && lane.visible) {
        const start = live.dir > 0 ? Math.max(front, -2) : Math.min(front, ARENA.width + 2);
        const length = Math.abs(far - start) * SCENE_PER_WORLD;
        lane.position.set(sceneX(start), LANE_Y, sceneZ(live.y));
        lane.rotation.set(0, live.dir > 0 ? 0 : Math.PI, 0);
        lane.scale.set(length, 1, BIKE_REACH * 2 * SCENE_PER_WORLD);
        // (the chevrons stay put on the floor as the line shortens, and run the way it rides)
        const along = (live.dir > 0 ? sceneX(start) : -sceneX(start)) / CHEVRON;
        laneTexture.repeat.set(length / CHEVRON, 1);
        laneTexture.offset.set(along - (reduced ? 0 : (now / 1000) * RUN) / CHEVRON, 0);
        const since = now - live.startsAt;
        laneMaterial.opacity = Math.min(1, since / 260) * (reduced ? 0.92 : 0.8 + 0.18 * Math.sin(now / 130));
      }
      if (!live || !onFloor) return;
      const step = Math.max(0, Math.min(0.05, dt));
      // where it is, which way it faces, its wheels and cranks going round
      root.position.set(sceneX(middleAt(front)), 0, sceneZ(live.y));
      const metres = (BIKE_SPEED * SCENE_PER_WORLD) / (PERSON_SCALE * size);
      spin -= (metres / WHEEL) * step;
      pedal -= (metres / WHEEL / GEAR) * step;
      rearWheel.rotation.z = spin;
      frontWheel.rotation.z = spin;
      cranks.rotation.z = pedal;
      const age = now - bumpAt;
      const wobble = !reduced && age >= 0 && age < WOBBLE_MS ? Math.sin((age / WOBBLE_MS) * Math.PI * 4) * (1 - age / WOBBLE_MS) * WOBBLE : 0;
      root.rotation.set(wobble, live.dir > 0 ? 0 : Math.PI, 0, "YXZ");
      root.updateMatrixWorld(true);
      if (rider) {
        for (const item of posed) item.bone.quaternion.copy(item.rest);
        rider.update(step, now, 0, "idle", "over", "calm", reduced);
        rider.root.updateMatrixWorld(true);
        seat();
      }
    },
    mount(kit) {
      if (rider) return;
      const person = kit.spawn(RIDER_LOOK);
      rider = person;
      size = person.size;
      body.scale.setScalar(PERSON_SCALE * size);
      // (it faces +z: the bike's way is +x)
      person.root.rotation.set(0, Math.PI / 2, 0);
      root.add(person.root);
      root.updateMatrixWorld(true);
      person.update(0, 0, 0, "idle", "over", "calm", true);
      person.root.updateMatrixWorld(true);
      const find = (name: string) => person.root.getObjectByName(name) ?? null;
      find("Head")?.add(new THREE.Mesh(helmetGeometry, material));
      for (const name of ["pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head", "thigh_l", "thigh_r"]) {
        const bone = find(name);
        if (bone) bones[name] = bone;
      }
      const limb = (upper: string, lower: string, end: string, tip: string | null): Limb | null => {
        const [a, b, c] = [find(upper), find(lower), find(end)];
        if (!a || !b || !c) return null;
        const p = (bone: THREE.Object3D) => bone.getWorldPosition(new THREE.Vector3());
        return { upper: a, lower: b, end: c, tip: tip ? find(tip) : null, lengths: [p(a).distanceTo(p(b)), p(b).distanceTo(p(c))] };
      };
      const legs = [limb("thigh_l", "calf_l", "foot_l", "ball_l"), limb("thigh_r", "calf_r", "foot_r", "ball_r")];
      const arms = [limb("upperarm_l", "lowerarm_l", "hand_l", null), limb("upperarm_r", "lowerarm_r", "hand_r", null)];
      if (legs.every(Boolean) && arms.every(Boolean) && bones.pelvis && bones.thigh_l && bones.thigh_r) {
        limbs = { legs: legs as [Limb, Limb], arms: arms as [Limb, Limb] };
        const turned = new Set<THREE.Object3D>(Object.values(bones));
        for (const item of [...limbs.legs, ...limbs.arms]) for (const bone of [item.upper, item.lower, item.end]) turned.add(bone);
        posed = [...turned].map((bone) => ({ bone, rest: bone.quaternion.clone() }));
      } else {
        // (a body without the bones it needs: no rider)
        root.remove(person.root);
        person.dispose();
        rider = null;
        bones = {};
      }
    },
    dispose() {
      if (rider) {
        root.remove(rider.root);
        rider.dispose();
        rider = null;
      }
      scene.remove(root, lane);
      for (const item of [frameGeometry, wheelGeometry, crankGeometry, helmetGeometry, laneGeometry, shadowGeometry, material, laneMaterial, laneTexture]) item.dispose();
    }
  };
}

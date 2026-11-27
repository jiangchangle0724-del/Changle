// The side quest's four spots in the seawall, the transit hall and the theatre (the night market's are
// its stalls, market.ts): photo frames along the back of the lawn, a lamp over each of the train's
// doors, lanterns hung before the stage. Each in its spot's colour (the stalls' four, as on the phone's
// chip). When a player does one (the room's `flash`), it flares on every screen and fades back; the
// seawall's frames with a camera's white flash first. Three draws for the four (two for the lamps).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ARENA, STALLS, type ArenaId } from "../../engine";
import { SCENE_PER_WORLD } from "../people";
import { glowTexture } from "./lights";

export interface QuestSpotsPalette {
  /** the four spots' colours, left to right */
  spots: readonly string[];
  /** the frames' and lanterns' trim (wood, gold), the lamps' housing */
  trim: string;
  /** a spot not lit: the lamps' and lanterns' own colour */
  idle: string;
  /** the camera's flash */
  flash: string;
}

export interface QuestSpots {
  flash(spot: number, time: number): void;
  update(time: number, camera: THREE.Camera, reduced: boolean): void;
  dispose(): void;
}

const sceneX = (x: number) => (x - ARENA.width / 2) * SCENE_PER_WORLD;
/** a lit spot glows this long, fading */
const GLOW_MS = 1_600;
/** the seawall's camera flash, before its colour */
const FLASH_MS = 180;

interface Shape {
  /** what's drawn in the spot's colour, and what's drawn in the trim */
  body: THREE.BufferGeometry;
  trim: THREE.BufferGeometry | null;
  /** where each spot stands (its x is the spot's), and where its glow is, from there */
  x: (spot: number) => number;
  y: number;
  z: number;
  glow: { y: number; z: number; size: number };
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const result = mergeGeometries(flat) ?? flat[0];
  for (const part of [...parts, ...flat]) if (part !== result) part.dispose();
  return result;
}

function shapeFor(arena: ArenaId): Shape | null {
  if (arena === "plaza") {
    // a photo frame on two legs at the back edge of the lawn: you stand in front of it
    const bar = (width: number, height: number, x: number, y: number) => new THREE.BoxGeometry(width, height, 0.06).translate(x, y, 0);
    const frame = merged([bar(1.24, 0.08, 0, 1.66), bar(1.24, 0.08, 0, 0.62), bar(0.08, 1.12, -0.58, 1.14), bar(0.08, 1.12, 0.58, 1.14)]);
    const legs = merged([bar(0.07, 0.62, -0.5, 0.31), bar(0.07, 0.62, 0.5, 0.31)]);
    return { body: frame, trim: legs, x: (spot) => sceneX(STALLS[spot]), y: 0, z: -4.62, glow: { y: 1.14, z: 0.06, size: 1.5 } };
  }
  if (arena === "metro") {
    // a lamp strip over each of the train's doors (the dressing's doors: x ±1.8 and ±5.4, their tops at 2.57)
    const strip = new THREE.BoxGeometry(0.46, 0.09, 0.05);
    const doors = [-5.4, -1.8, 1.8, 5.4];
    return { body: strip, trim: null, x: (spot) => doors[spot], y: 2.74, z: -5.31, glow: { y: 0, z: 0.05, size: 1.1 } };
  }
  if (arena === "gallery") {
    // a red paper lantern hung before the stage (the set sits 0.65 back: the curtain is at -5.8)
    const body = new THREE.SphereGeometry(0.3, 14, 10).scale(1, 1.25, 1);
    const gold = merged([
      new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10).translate(0, 0.4, 0),
      new THREE.CylinderGeometry(0.17, 0.13, 0.07, 10).translate(0, -0.4, 0),
      new THREE.CylinderGeometry(0.012, 0.012, 0.55, 4).translate(0, 0.7, 0),
      new THREE.CylinderGeometry(0.03, 0.01, 0.28, 6).translate(0, -0.58, 0)
    ]);
    return { body, trim: gold, x: (spot) => sceneX(STALLS[spot]), y: 2.62, z: -4.85, glow: { y: 0, z: 0.1, size: 1.6 } };
  }
  return null;
}

export function addQuestSpots(scene: THREE.Scene, arena: ArenaId, palette: QuestSpotsPalette): QuestSpots | null {
  const shape = shapeFor(arena);
  if (!shape) return null;
  const count = STALLS.length;
  const keep: { dispose(): void }[] = [];
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    keep.push(geometry, material);
    scene.add(mesh);
    return mesh;
  };
  const colors = palette.spots.map((value) => new THREE.Color(value));
  const idle = new THREE.Color(palette.idle);
  const white = new THREE.Color(palette.flash);
  // the frames and the lanterns wear their spot's colour; the lamps are dark until lit
  const lamps = arena === "metro";
  const bodies = instanced(shape.body, lamps ? new THREE.MeshBasicMaterial({ toneMapped: false }) : new THREE.MeshStandardMaterial({ roughness: 0.6 }));
  const trims = shape.trim ? instanced(shape.trim, new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.5, metalness: arena === "gallery" ? 0.5 : 0 })) : null;
  const glowMap = glowTexture();
  keep.push(glowMap);
  const glows = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ alphaMap: glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  glows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let index = 0; index < count; index++) {
    dummy.position.set(shape.x(index), shape.y, shape.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    bodies.setMatrixAt(index, dummy.matrix);
    trims?.setMatrixAt(index, dummy.matrix);
    // (the colours from the start: one added later would make three build the shaders again, mid-round)
    bodies.setColorAt(index, lamps ? idle : colors[index % colors.length]);
    glows.setColorAt(index, idle);
  }
  const litAt = new Array<number>(count).fill(-Infinity);

  return {
    flash(spot, time) {
      if (spot >= 0 && spot < count) litAt[spot] = time;
    },
    update(time, camera, reduced) {
      for (let index = 0; index < count; index++) {
        const age = time - litAt[index];
        const glow = age >= 0 && age < GLOW_MS ? Math.exp(-age / 480) : 0;
        const flash = arena === "plaza" && !reduced && age >= 0 && age < FLASH_MS ? 1 - age / FLASH_MS : 0;
        const spotColor = colors[index % colors.length];
        // the lamps light in their spot's colour; the lanterns and frames keep theirs and glow
        if (lamps) bodies.setColorAt(index, color.copy(idle).lerp(spotColor, Math.min(1, glow * 1.6)));
        const size = shape.glow.size * (glow > 0 ? 0.7 + glow * (reduced ? 0.5 : 0.9) : 0.001) + flash * 2.2;
        dummy.position.set(shape.x(index), shape.y + shape.glow.y, shape.z + shape.glow.z);
        dummy.quaternion.copy(camera.quaternion);
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        glows.setMatrixAt(index, dummy.matrix);
        glows.setColorAt(index, color.copy(spotColor).multiplyScalar(glow).lerp(white, flash));
      }
      glows.instanceMatrix.needsUpdate = true;
      if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
      if (lamps && bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [bodies, trims, glows]) if (mesh) scene.remove(mesh);
      for (const item of keep) item.dispose();
    }
  };
}

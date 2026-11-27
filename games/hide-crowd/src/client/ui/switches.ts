// The transit hall's two light switches (engine LIGHT_SWITCHES), on the front of the route signs just
// off the floor's sides: a grey box with a red lever and a lamp. Every screen sees one go: its lever
// drops, its lamp turns from green to red with a flash, and stays red (lit in the dark too) until the
// switches reset (the room stops sending `lights`), when the lever springs back up. Four draws for both.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ARENA, LIGHT_SWITCHES } from "../../engine";
import { SCENE_PER_WORLD } from "../people";
import { glowTexture } from "./lights";

export interface SwitchPalette {
  /** the box */
  box: string;
  /** the lever */
  lever: string;
  /** the lamp, ready to pull, and pulled */
  ready: string;
  pulled: string;
}

export interface Switches {
  /** `lights`: the room's GameView.lights (null: both ready); `ago` adds the time since that frame came */
  update(lights: { box: number; sinceMs: number } | null, ago: number, camera: THREE.Camera, reduced: boolean): void;
  dispose(): void;
}

/** the route sign's front face (the dressing's totem is 0.38 deep, at z -1.1) */
const FACE_Z = -1.1 + 0.19;
const PANEL = { width: 0.44, height: 0.58, depth: 0.08, y: 1.06 };
const LEVER_Y = 0.94;
const LAMP_Y = 1.45;
/** the lever's throw, and how long it takes */
const THROW = Math.PI * 0.82;
const THROW_MS = 140;
/** the lamp's flash as the switch goes */
const FLASH_MS = 320;

export function addSwitches(scene: THREE.Scene, palette: SwitchPalette): Switches {
  const count = LIGHT_SWITCHES.length;
  const at = LIGHT_SWITCHES.map((spot) => new THREE.Vector3((spot.x - ARENA.width / 2) * SCENE_PER_WORLD, 0, FACE_Z));
  const keep: { dispose(): void }[] = [];
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    keep.push(geometry, material);
    scene.add(mesh);
    return mesh;
  };
  const panels = instanced(new THREE.BoxGeometry(PANEL.width, PANEL.height, PANEL.depth), new THREE.MeshStandardMaterial({ color: palette.box, roughness: 0.55, metalness: 0.35 }));
  // the lever: a handle up from its pivot, a knob on top (one shape)
  const handle = new THREE.BoxGeometry(0.05, 0.24, 0.05).translate(0, 0.12, 0);
  const knob = new THREE.SphereGeometry(0.05, 10, 8).translate(0, 0.25, 0);
  const leverShape = mergeGeometries([handle.toNonIndexed(), knob.toNonIndexed()]) ?? handle;
  handle.dispose();
  knob.dispose();
  const levers = instanced(leverShape, new THREE.MeshStandardMaterial({ color: palette.lever, roughness: 0.4 }));
  const lamps = instanced(new THREE.SphereGeometry(0.065, 12, 8), new THREE.MeshBasicMaterial({ toneMapped: false }));
  const glowMap = glowTexture();
  keep.push(glowMap);
  const glows = instanced(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ alphaMap: glowMap, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
  );
  const dummy = new THREE.Object3D();
  const ready = new THREE.Color(palette.ready);
  const pulled = new THREE.Color(palette.pulled);
  const color = new THREE.Color();
  for (let index = 0; index < count; index++) {
    dummy.position.set(at[index].x, PANEL.y, at[index].z + PANEL.depth / 2);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    panels.setMatrixAt(index, dummy.matrix);
    // (the colours from the start: one added later would make three build the lamps' shaders again, mid-round)
    lamps.setColorAt(index, ready);
    glows.setColorAt(index, ready);
  }
  panels.instanceMatrix.needsUpdate = true;

  return {
    update(lights, ago, camera, reduced) {
      for (let index = 0; index < count; index++) {
        const since = lights && lights.box === index ? lights.sinceMs + Math.max(0, ago) : null;
        const down = since === null ? 0 : reduced ? 1 : Math.min(1, since / THROW_MS);
        dummy.position.set(at[index].x, LEVER_Y, at[index].z + PANEL.depth + 0.01);
        dummy.rotation.set(down * THROW, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        levers.setMatrixAt(index, dummy.matrix);
        dummy.position.set(at[index].x, LAMP_Y, at[index].z + 0.06);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        lamps.setMatrixAt(index, dummy.matrix);
        lamps.setColorAt(index, since === null ? ready : pulled);
        // the glow: faint while ready, bright once pulled, with a flash as it goes (none with reduced motion)
        const flash = since !== null && !reduced && since < FLASH_MS ? Math.sin((since / FLASH_MS) * Math.PI) : 0;
        const size = 0.62 * (1 + flash * 1.5);
        dummy.position.set(at[index].x, LAMP_Y, at[index].z + 0.1);
        dummy.quaternion.copy(camera.quaternion);
        dummy.scale.set(size, size, size);
        dummy.updateMatrix();
        glows.setMatrixAt(index, dummy.matrix);
        glows.setColorAt(index, color.copy(since === null ? ready : pulled).multiplyScalar(since === null ? 0.4 : 0.9 + flash * 0.4));
      }
      for (const mesh of [levers, lamps, glows]) mesh.instanceMatrix.needsUpdate = true;
      if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
      if (glows.instanceColor) glows.instanceColor.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [panels, levers, lamps, glows]) scene.remove(mesh);
      for (const item of keep) item.dispose();
    }
  };
}

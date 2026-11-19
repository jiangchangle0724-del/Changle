// The transit hall's lights going out, on screen (2026-11-19, the big upgrade's events): the hall's
// lights flicker and go out, and back on (`blackoutDark`, by how far into the moment this screen is);
// in the dark, everyone standing still looks at their phone (people.ts: the same for every body, a
// player too), and here each lit phone gets its screen and a cool glow on the face over it. Two draws
// for the whole crowd. With reduced motion the lights fade instead of flickering.
import * as THREE from "three";
import { BLACKOUT_MS } from "../../engine";

/** How dark it is this far into the lights out (0: lit, 1: out), as [from ms, darkness] steps. */
const GOING: readonly (readonly [number, number])[] = [
  [0, 0.7],
  [70, 0.1],
  [150, 0.85],
  [215, 0.35],
  [300, 1]
];
const COMING: readonly (readonly [number, number])[] = [
  [BLACKOUT_MS - 560, 0.45],
  [BLACKOUT_MS - 480, 0.95],
  [BLACKOUT_MS - 360, 0.25],
  [BLACKOUT_MS - 280, 0.75],
  [BLACKOUT_MS - 150, 0]
];

/** How dark the hall is `ms` into its lights out (0: lit, 1: out): a flicker going out, a flicker coming back. */
export function blackoutDark(ms: number, reduced: boolean): number {
  if (!(ms >= 0) || ms >= BLACKOUT_MS) return 0;
  if (reduced) return Math.max(0, Math.min(1, ms / 300, (BLACKOUT_MS - ms) / 300));
  let dark = 0;
  for (const [from, value] of [...GOING, ...COMING]) if (ms >= from) dark = value;
  return dark;
}

/** How much of each light stays on in the dark: a little of the sky's blue, nearly none of the lamps. */
export const DARK_KEEPS = { ambient: 0.13, key: 0.03, fill: 0.08 } as const;

export interface Phones {
  /** before the people: none lit */
  begin(): void;
  /** a lit phone: in the hand at `hand`, held by a body facing `facing` (yaw), `lit` how far it's lit (0 to 1) */
  add(hand: THREE.Vector3, facing: number, lit: number, camera: THREE.Camera): void;
  /** after the people: hand them to the graphics chip */
  end(): void;
  dispose(): void;
}

/** A soft round glow, white in the middle: the screen's light on a face. */
function glowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgb(255,255,255)");
    gradient.addColorStop(0.35, "rgb(150,150,150)");
    gradient.addColorStop(1, "rgb(0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

export function addPhones(scene: THREE.Scene, color: string, count: number): Phones {
  const screenGeometry = new THREE.BoxGeometry(0.1, 0.012, 0.18);
  const screenMaterial = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const screens = new THREE.InstancedMesh(screenGeometry, screenMaterial, count);
  const glowGeometry = new THREE.PlaneGeometry(1, 1);
  const glowMap = glowTexture();
  const glowMaterial = new THREE.MeshBasicMaterial({ color, alphaMap: glowMap, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const glows = new THREE.InstancedMesh(glowGeometry, glowMaterial, count);
  for (const mesh of [screens, glows]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
  }
  const dummy = new THREE.Object3D();
  const turn = new THREE.Euler();
  let used = 0;
  return {
    begin() {
      used = 0;
    },
    add(hand, facing, lit, camera) {
      if (used >= count || lit <= 0.02) return;
      // the screen: in the hand, tipped up towards the face
      dummy.position.copy(hand);
      dummy.position.x += Math.sin(facing) * 0.06;
      dummy.position.z += Math.cos(facing) * 0.06;
      dummy.rotation.copy(turn.set(-0.85, facing, 0, "YXZ"));
      dummy.scale.setScalar(lit);
      dummy.updateMatrix();
      screens.setMatrixAt(used, dummy.matrix);
      // its light: a glow over it, up to the face, turned to the camera
      dummy.position.y += 0.32;
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(0.95 * lit);
      dummy.updateMatrix();
      glows.setMatrixAt(used, dummy.matrix);
      used++;
    },
    end() {
      screens.count = used;
      glows.count = used;
      // (no phones lit: nothing to draw)
      screens.visible = used > 0;
      glows.visible = used > 0;
      if (used > 0) {
        screens.instanceMatrix.needsUpdate = true;
        glows.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(screens, glows);
      for (const item of [screenGeometry, screenMaterial, glowGeometry, glowMaterial, glowMap]) item.dispose();
    }
  };
}

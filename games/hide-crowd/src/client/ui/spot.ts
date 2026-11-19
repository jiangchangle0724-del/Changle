// The theatre's follow spot on screen (2026-11-19, the big upgrade's events): from the rigging over the
// stage a beam sweeps across the courtyard's floor along the rules' path (engine/sweepSpot, spotAt: the
// same sweep on every screen), with a bright pool where it lands and a real spotlight in it, so whoever
// it lands on is lit (and the house lights go down meanwhile: Arena3D). Three draws while it sweeps (the beam, the pool, and the light the floor and the
// people take), none otherwise. With reduced motion it doesn't flare in or out.
import * as THREE from "three";
import { ARENA, SPOT_MS, SPOT_RADIUS, spotAt, type SpotSweep } from "../../engine";
import { SCENE_PER_WORLD } from "../people";

export interface Spot {
  /** this frame's sweep (when it began, on this page's clock), or null: none */
  see(sweep: SpotSweep | null): void;
  update(now: number, reduced: boolean): void;
  dispose(): void;
}

/** where the lamp hangs: over the stage's front, high in the rigging (scene units) */
const LAMP = new THREE.Vector3(0, 7.2, -6.6);
const FADE_MS = 220;

/** A disc of light, solid in the middle and soft at its rim. */
function poolTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgb(255,255,255)");
    gradient.addColorStop(0.72, "rgb(235,235,235)");
    gradient.addColorStop(0.86, "rgb(120,120,120)");
    gradient.addColorStop(1, "rgb(0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}

export function addSpot(scene: THREE.Scene, color: string): Spot {
  const radius = SPOT_RADIUS * SCENE_PER_WORLD;
  // the beam: an open cone from the lamp, its tip at the origin, one unit long down -y
  const beamGeometry = new THREE.CylinderGeometry(0.05, 1, 1, 28, 1, true);
  beamGeometry.translate(0, -0.5, 0);
  const beamMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.frustumCulled = false;
  beam.visible = false;
  // the pool on the floor
  const poolGeometry = new THREE.CircleGeometry(1, 40);
  poolGeometry.rotateX(-Math.PI / 2);
  const poolMap = poolTexture();
  const poolMaterial = new THREE.MeshBasicMaterial({ color, alphaMap: poolMap, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const pool = new THREE.Mesh(poolGeometry, poolMaterial);
  pool.scale.set(radius * 1.08, 1, radius * 1.08);
  pool.renderOrder = -1;
  pool.visible = false;
  // and the light itself, on whoever is in it (always there, dark between sweeps, so nothing recompiles)
  const light = new THREE.SpotLight(color, 0, 0, Math.atan(radius / LAMP.y), 0.4, 0);
  light.position.copy(LAMP);
  scene.add(beam, pool, light, light.target);

  let sweep: SpotSweep | null = null;
  const down = new THREE.Vector3(0, -1, 0);
  const toward = new THREE.Vector3();
  const floor = new THREE.Vector3();
  return {
    see(next) {
      sweep = next;
    },
    update(now, reduced) {
      const into = sweep ? now - sweep.startsAt : -1;
      const on = sweep !== null && into >= 0 && into < SPOT_MS;
      beam.visible = on;
      pool.visible = on;
      if (!on || !sweep) {
        light.intensity = 0;
        return;
      }
      // (it flares up as it opens, and closes at the end)
      const level = reduced ? 1 : Math.min(1, into / FADE_MS, (SPOT_MS - into) / FADE_MS);
      const at = spotAt(sweep, now);
      floor.set((at.x - ARENA.width / 2) * SCENE_PER_WORLD, 0, (at.y - ARENA.height / 2) * SCENE_PER_WORLD);
      pool.position.set(floor.x, 0.022, floor.z);
      toward.copy(floor).sub(LAMP);
      const length = toward.length();
      beam.position.copy(LAMP);
      beam.quaternion.setFromUnitVectors(down, toward.normalize());
      beam.scale.set(radius * 0.92, length, radius * 0.92);
      beamMaterial.opacity = 0.1 * level;
      poolMaterial.opacity = 0.6 * level;
      light.target.position.copy(floor);
      light.target.updateMatrixWorld();
      light.angle = Math.atan(radius / length) * 1.05;
      light.intensity = 16 * level;
    },
    dispose() {
      scene.remove(beam, pool, light, light.target);
      light.dispose();
      for (const item of [beamGeometry, beamMaterial, poolGeometry, poolMaterial, poolMap]) item.dispose();
    }
  };
}

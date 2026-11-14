// The night market's firecrackers on screen: each is thrown in from behind the stalls, tumbles
// through the air, lands, and hisses on the asphalt with sparks spitting from its fuse, a ring on the
// floor showing how far it will knock people down and a glow filling it as the fuse burns down; then
// it bangs: a flash, a ring of shock going out, red paper flying (as real firecrackers leave), and the
// arena adds sparks, smoke and the camera's jolt. With reduced motion: nothing flies or flashes (a
// firecracker is there once it has landed, its ring holds still), and the paper lies where it falls.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { easeOut, fading, fadingMaterial, puff } from "./effects";

/** a firecracker as the arena sees it: where it lands (scene units), and when it is thrown, lands and bangs (this page's clock, ms) */
export interface CrackerShot {
  x: number;
  z: number;
  flyAt: number;
  landAt: number;
  bangAt: number;
}

export interface CrackerColors {
  /** the paper's red, the gold band, the fuse */
  red: string;
  gold: string;
  fuse: string;
  /** the warning ring and the glow filling it, the flash */
  ring: string;
  glow: string;
  flash: string;
}

export interface Crackers {
  /** this frame's firecrackers (the same ones every frame of a moment; a new one starts its throw) */
  see(shots: readonly CrackerShot[]): void;
  /** play them all for this frame; what banged this frame comes back, for the arena's sparks, smoke and jolt */
  update(now: number, delta: number, camera: THREE.Camera, reduced: boolean): { x: number; z: number }[];
  dispose(): void;
}

const MAX = 8;
const SPARKS = 96;
const PAPER = 260;
/** where they are thrown from: over the stalls, at the back of the lot */
const THROWN_FROM_Z = -5.6;

/** A firecracker lying along x: a red tube with a gold band round its middle and a dark fuse at one end. */
function crackerShape(red: THREE.Color, gold: THREE.Color, fuse: THREE.Color): THREE.BufferGeometry {
  const painted = (geometry: THREE.BufferGeometry, color: THREE.Color) => {
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) colors.set([color.r, color.g, color.b], index * 3);
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  };
  const tube = painted(new THREE.CylinderGeometry(0.075, 0.075, 0.36, 10), red);
  const band = painted(new THREE.CylinderGeometry(0.079, 0.079, 0.07, 10), gold);
  const wick = painted(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 4).translate(0, 0.24, 0), fuse);
  const merged = mergeGeometries([tube, band, wick], false)!;
  // (lying down, its fuse towards +x)
  merged.rotateZ(-Math.PI / 2);
  return merged;
}

/** A flat ring round +y (a floor marking), radius 1. */
function ringShape(width: number): THREE.BufferGeometry {
  const ring = new THREE.RingGeometry(1 - width, 1, 48);
  ring.rotateX(-Math.PI / 2);
  const count = ring.getAttribute("position").count;
  ring.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 4).fill(1), 4));
  return ring;
}

/** A flat disc on the floor, radius 1, solid to its edge and soft at it. */
function discShape(): THREE.BufferGeometry {
  const disc = puff().scale(2, 2, 2);
  disc.rotateX(-Math.PI / 2);
  return disc;
}

export function addCrackers(scene: THREE.Scene, colors: CrackerColors, blastRadius: number): Crackers {
  const red = new THREE.Color(colors.red);
  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  const bodies = new THREE.InstancedMesh(crackerShape(red, new THREE.Color(colors.gold), new THREE.Color(colors.fuse)), bodyMaterial, MAX);
  const rings = fading(ringShape(0.11), fadingMaterial(colors.ring), MAX, scene);
  const glows = fading(discShape(), fadingMaterial(colors.glow), MAX, scene);
  const flashes = fading(puff(), fadingMaterial(colors.flash), MAX, scene);
  const shocks = fading(ringShape(0.16), fadingMaterial(colors.flash), MAX, scene);
  flashes.mesh.material.blending = THREE.AdditiveBlending;
  // (the floor markings under everything standing on them; the flash over it all)
  for (const mesh of [rings.mesh, glows.mesh, shocks.mesh]) mesh.renderOrder = -1;
  flashes.mesh.renderOrder = 3;
  const sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: colors.flash, toneMapped: false }), SPARKS);
  const paperMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.075, 0.12), new THREE.MeshStandardMaterial({ color: red, roughness: 0.8, side: THREE.DoubleSide }), PAPER);
  for (const mesh of [bodies, sparkMesh, paperMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.visible = false;
    scene.add(mesh);
  }

  interface Live extends CrackerShot { key: string; yaw: number; spin: number; banged: boolean }
  interface Bit { x: number; y: number; z: number; vx: number; vy: number; vz: number; born: number; life: number; turn: number; rate: number; axis: THREE.Vector3; size: number }
  const live = new Map<string, Live>();
  const sparks: Bit[] = [];
  const paper: Bit[] = [];
  const dummy = new THREE.Object3D();
  const marking = new THREE.Object3D();
  const flash = new THREE.Object3D();
  const shock = new THREE.Object3D();
  const facingCamera = new THREE.Quaternion();
  const keyOf = (shot: CrackerShot) => `${shot.x.toFixed(2)},${shot.z.toFixed(2)}`;

  const spit = (cracker: Live, now: number) => {
    // a spark or two off the fuse's end
    for (let index = 0; index < 2 && sparks.length < SPARKS; index++) {
      const angle = Math.random() * Math.PI * 2;
      sparks.push({
        x: cracker.x + Math.cos(cracker.yaw) * 0.3,
        y: 0.1,
        z: cracker.z - Math.sin(cracker.yaw) * 0.3,
        vx: Math.cos(angle) * (0.4 + Math.random() * 0.8),
        vy: 0.8 + Math.random() * 1.2,
        vz: Math.sin(angle) * (0.4 + Math.random() * 0.8),
        born: now,
        life: 180 + Math.random() * 160,
        turn: 0,
        rate: 0,
        axis: new THREE.Vector3(0, 1, 0),
        size: 0.6 + Math.random() * 0.6
      });
    }
  };

  const shred = (cracker: Live, now: number, reduced: boolean) => {
    // the paper it was wrapped in, torn to bits and thrown up, fluttering down over the spot
    for (let index = 0; index < 34 && paper.length < PAPER; index++) {
      const angle = Math.random() * Math.PI * 2;
      const out = reduced ? 0 : 0.5 + Math.random() * 1.8;
      paper.push({
        x: cracker.x + (reduced ? Math.cos(angle) * Math.random() * blastRadius * 0.6 : 0),
        y: reduced ? 0.02 : 0.2,
        z: cracker.z + (reduced ? Math.sin(angle) * Math.random() * blastRadius * 0.6 : 0),
        vx: Math.cos(angle) * out,
        vy: reduced ? 0 : 2.2 + Math.random() * 2.6,
        vz: Math.sin(angle) * out,
        born: now,
        life: 1_700 + Math.random() * 900,
        turn: Math.random() * Math.PI * 2,
        rate: reduced ? 0 : 6 + Math.random() * 10,
        axis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        size: 0.7 + Math.random() * 0.6
      });
    }
  };

  return {
    see(shots) {
      for (const shot of shots) {
        const key = keyOf(shot);
        if (live.has(key)) continue;
        // (its times as first seen: the room's frames come with a little jitter)
        live.set(key, { ...shot, key, yaw: Math.random() * Math.PI * 2, spin: (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 6), banged: false });
      }
    },
    update(now, delta, camera, reduced) {
      const step = delta / 1000;
      const banged: { x: number; z: number }[] = [];
      camera.getWorldQuaternion(facingCamera);
      let count = 0;
      let markings = 0;
      let flashCount = 0;
      for (const cracker of live.values()) {
        const afterBang = now - cracker.bangAt;
        // (gone a moment after its bang, once its flash and shock ring are over)
        if (afterBang > 600) {
          live.delete(cracker.key);
          continue;
        }
        if (now >= cracker.bangAt && !cracker.banged) {
          cracker.banged = true;
          banged.push({ x: cracker.x, z: cracker.z });
          shred(cracker, now, reduced);
        }
        if (now < cracker.bangAt) {
          // thrown, tumbling through the air (with reduced motion it's simply there once it has landed)
          if (now < cracker.landAt) {
            if (reduced) continue;
            const k = Math.max(0, (now - cracker.flyAt) / Math.max(1, cracker.landAt - cracker.flyAt));
            dummy.position.set(cracker.x, 1.4 * (1 - k) + 3.2 * 4 * k * (1 - k) + 0.08, THROWN_FROM_Z + (cracker.z - THROWN_FROM_Z) * k);
            dummy.rotation.set(0, cracker.yaw, (now - cracker.flyAt) * 0.001 * cracker.spin);
          } else {
            // on the ground, rolling to a stop
            const rolled = Math.min(1, (now - cracker.landAt) / 220);
            dummy.position.set(cracker.x, 0.08, cracker.z);
            dummy.rotation.set(0, cracker.yaw, (1 - rolled) * 0.6);
            if (!reduced) spit(cracker, now);
            // the ring: how far it reaches, beating faster as the fuse burns down; the glow filling it
            const burnt = Math.min(1, (now - cracker.landAt) / Math.max(1, cracker.bangAt - cracker.landAt));
            const beat = reduced ? 0.75 : 0.6 + 0.4 * Math.abs(Math.sin((now - cracker.landAt) * 0.004 * (1 + burnt * 3)));
            marking.position.set(cracker.x, 0.025, cracker.z);
            marking.scale.setScalar(blastRadius);
            marking.updateMatrix();
            rings.mesh.setMatrixAt(markings, marking.matrix);
            rings.fade.setX(markings, beat * Math.min(1, rolled * 3));
            marking.scale.setScalar(blastRadius * Math.max(0.05, burnt));
            marking.position.y = 0.02;
            marking.updateMatrix();
            glows.mesh.setMatrixAt(markings, marking.matrix);
            glows.fade.setX(markings, 0.35 + burnt * 0.25);
            markings++;
          }
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          bodies.setMatrixAt(count++, dummy.matrix);
        } else if (!reduced) {
          // the bang: a flash, and a ring of shock going out over the floor
          const k = afterBang / 600;
          flash.position.set(cracker.x, 0.55, cracker.z);
          flash.quaternion.copy(facingCamera);
          flash.scale.setScalar(0.6 + easeOut(Math.min(1, afterBang / 160)) * 2.6);
          flash.updateMatrix();
          flashes.mesh.setMatrixAt(flashCount, flash.matrix);
          flashes.fade.setX(flashCount, Math.max(0, 1 - afterBang / 220));
          shock.position.set(cracker.x, 0.04, cracker.z);
          shock.scale.setScalar(blastRadius * (0.2 + easeOut(Math.min(1, afterBang / 320)) * 1.1));
          shock.updateMatrix();
          shocks.mesh.setMatrixAt(flashCount, shock.matrix);
          shocks.fade.setX(flashCount, Math.max(0, 0.9 * (1 - k * 1.7)));
          flashCount++;
        }
      }

      // the fuse's sparks: up, out, and gone
      let sparkCount = 0;
      for (const bit of sparks) {
        const age = (now - bit.born) / bit.life;
        if (age >= 1) continue;
        bit.vy -= 6 * step;
        bit.x += bit.vx * step;
        bit.y = Math.max(0.02, bit.y + bit.vy * step);
        bit.z += bit.vz * step;
        dummy.position.set(bit.x, bit.y, bit.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(bit.size * (1 - age));
        dummy.updateMatrix();
        sparkMesh.setMatrixAt(sparkCount, dummy.matrix);
        sparks[sparkCount++] = bit;
      }
      sparks.length = sparkCount;

      // the paper: up, out, and fluttering down to lie on the floor a while
      let paperCount = 0;
      for (const bit of paper) {
        const age = now - bit.born;
        if (age >= bit.life) continue;
        if (bit.y > 0.02) {
          bit.vy = Math.max(-1.1, bit.vy - 5.5 * step);
          const drag = Math.max(0, 1 - step * 2.6);
          bit.vx *= drag;
          bit.vz *= drag;
          bit.x += (bit.vx + Math.sin(age * 0.005 + bit.rate) * 0.35) * step;
          bit.y = Math.max(0.02, bit.y + bit.vy * step);
          bit.z += bit.vz * step;
          bit.turn += bit.rate * step;
          dummy.quaternion.setFromAxisAngle(bit.axis, bit.turn);
        } else {
          // (down: flat on the asphalt)
          dummy.rotation.set(-Math.PI / 2, 0, bit.turn);
        }
        dummy.position.set(bit.x, bit.y, bit.z);
        dummy.scale.setScalar(bit.size * (age > bit.life - 400 ? (bit.life - age) / 400 : 1));
        dummy.updateMatrix();
        paperMesh.setMatrixAt(paperCount, dummy.matrix);
        paper[paperCount++] = bit;
      }
      paper.length = paperCount;

      const show = (mesh: THREE.InstancedMesh, n: number) => {
        mesh.count = n;
        mesh.visible = n > 0;
        if (n) mesh.instanceMatrix.needsUpdate = true;
      };
      show(bodies, count);
      show(rings.mesh, markings);
      show(glows.mesh, markings);
      show(flashes.mesh, flashCount);
      show(shocks.mesh, flashCount);
      show(sparkMesh, sparkCount);
      show(paperMesh, paperCount);
      for (const fade of [rings.fade, glows.fade, flashes.fade, shocks.fade]) fade.needsUpdate = true;
      return banged;
    },
    dispose() {
      for (const mesh of [bodies, rings.mesh, glows.mesh, flashes.mesh, shocks.mesh, sparkMesh, paperMesh]) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}

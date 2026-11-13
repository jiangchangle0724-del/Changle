// The little things over the people, the way the big party games draw them: a swoosh where every
// punch goes (a passer-by's too, so a swoosh gives nobody away), stars circling the head of anyone
// knocked silly, and dust kicked up behind a run. One draw each, however many there are. With
// reduced motion: no swooshes and no dust (both fly), and the stars hold still.
import * as THREE from "three";

const SWOOSHES = 32;
const SWOOSH_MS = 260;
const STARS = 3;
const HEADS = 26;
const PUFFS = 72;
const PUFF_MS = 640;
/** a body this fast (the rules' units a second) is running: a passer-by's run, or a player's top speed */
const RUN_FROM = 10.5;

export interface EffectColors {
  /** the punch's swoosh */
  swoosh: string;
  /** the stars, and the dark rim that keeps them and the swoosh clear on a bright floor */
  star: string;
  rim: string;
  /** the dust a run kicks up */
  dust: string;
}

export interface Effects {
  /** a punch thrown, its fist out: from a body at (x, z) turned `facing` (its yaw: it looks along sin, cos) */
  punch(x: number, z: number, facing: number, now: number): void;
  /** this frame, a stunned head at (x, y, z), stunned since `since` */
  dizzy(x: number, y: number, z: number, since: number): void;
  /** this frame, the body in place `slot` at (x, z), turned `facing`, moving at `speed` (the rules' units a second) */
  run(slot: number, x: number, z: number, facing: number, speed: number, now: number): void;
  /** draw them all for this frame, once the camera is placed (the stars and the dust face it) */
  update(now: number, delta: number, camera: THREE.Camera, reduced: boolean): void;
  dispose(): void;
}

const easeOut = (value: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, value)), 3);

/**
 * A flat material whose every copy fades on its own: a per-copy `fade` multiplies the alpha (three.js
 * gives copies their own colour, not their own opacity).
 */
function fadingMaterial(color?: string): THREE.MeshBasicMaterial {
  // (with no colour of its own, its vertices' colours show as they are)
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  if (color) material.color.set(color);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float fade;\nvarying float vFade;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n\tvFade = fade;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFade;")
      .replace("#include <alphamap_fragment>", "#include <alphamap_fragment>\n\tdiffuseColor.a *= vFade;");
  };
  return material;
}

function shape(positions: number[], colors: number[], size: number, index: number[]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, size));
  geometry.setIndex(index);
  return geometry;
}

/**
 * A crescent lying flat ahead of a body (round +z): a bright core between two dark edges (so it reads
 * on the theatre's pale stone as on the night market's asphalt), fading to its tips.
 */
function crescent(core: THREE.Color, edge: THREE.Color): THREE.BufferGeometry {
  const segments = 18;
  const arc = THREE.MathUtils.degToRad(124);
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const RINGS = 5;
  for (let segment = 0; segment <= segments; segment++) {
    const u = segment / segments;
    const angle = -arc / 2 + arc * u;
    // (thick in the middle, a point at each tip)
    const along = Math.sin(Math.PI * u);
    const inner = 0.12 * along + 0.01;
    const outer = 0.15 * along + 0.01;
    const rings: readonly [number, THREE.Color, number][] = [
      [0.5 - inner * 1.35, edge, 0],
      [0.5 - inner * 0.75, edge, 0.55 * along],
      [0.5, core, along],
      [0.5 + outer * 0.75, edge, 0.55 * along],
      [0.5 + outer * 1.35, edge, 0]
    ];
    for (const [radius, color, alpha] of rings) {
      positions.push(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      colors.push(color.r, color.g, color.b, alpha);
    }
  }
  for (let segment = 0; segment < segments; segment++) {
    for (let ring = 0; ring < RINGS - 1; ring++) {
      const a = segment * RINGS + ring;
      index.push(a, a + RINGS, a + 1, a + 1, a + RINGS, a + RINGS + 1);
    }
  }
  return shape(positions, colors, 4, index);
}

/** A five-pointed star facing +z, its fill over a darker rim. */
function star(fill: THREE.Color, rim: THREE.Color): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const fan = (outer: number, inner: number, z: number, color: THREE.Color) => {
    const centre = positions.length / 3;
    positions.push(0, 0, z);
    colors.push(color.r, color.g, color.b);
    for (let point = 0; point < 10; point++) {
      const angle = Math.PI / 2 + (point * Math.PI) / 5;
      const radius = point % 2 === 0 ? outer : inner;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
      colors.push(color.r, color.g, color.b);
    }
    for (let point = 0; point < 10; point++) index.push(centre, centre + 1 + point, centre + 1 + ((point + 1) % 10));
  };
  fan(0.26, 0.125, 0, rim);
  fan(0.195, 0.088, 0.008, fill);
  return shape(positions, colors, 3, index);
}

/** A soft round puff facing +z: nearly solid most of the way out, then thinning to nothing at its edge. */
function puff(): THREE.BufferGeometry {
  const positions = [0, 0, 0];
  const colors = [1, 1, 1, 1];
  const index: number[] = [];
  const rim = 18;
  for (const [radius, alpha] of [[0.3, 0.85], [0.5, 0]] as const) {
    for (let point = 0; point < rim; point++) {
      const angle = (point / rim) * Math.PI * 2;
      positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
      colors.push(1, 1, 1, alpha);
    }
  }
  for (let point = 0; point < rim; point++) {
    const next = (point + 1) % rim;
    index.push(0, 1 + point, 1 + next);
    index.push(1 + point, 1 + rim + point, 1 + next, 1 + next, 1 + rim + point, 1 + rim + next);
  }
  return shape(positions, colors, 4, index);
}

function fading(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, scene: THREE.Scene) {
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  fade.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("fade", fade);
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { mesh, fade };
}

export function addEffects(scene: THREE.Scene, colors: EffectColors): Effects {
  const swooshes = fading(crescent(new THREE.Color(colors.swoosh), new THREE.Color(colors.rim)), fadingMaterial(), SWOOSHES, scene);
  // (a swoosh is over in a blink: drawn over the bodies, or the one ahead of a body facing away is lost behind it)
  swooshes.mesh.material.depthTest = false;
  swooshes.mesh.renderOrder = 2;
  const dust = fading(puff(), fadingMaterial(colors.dust), PUFFS, scene);
  const starMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
  const stars = new THREE.InstancedMesh(star(new THREE.Color(colors.star), new THREE.Color(colors.rim)), starMaterial, HEADS * STARS);
  stars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stars.count = 0;
  stars.frustumCulled = false;
  scene.add(stars);

  interface Swoosh { x: number; z: number; facing: number; born: number }
  interface Puff { x: number; y: number; z: number; vx: number; vy: number; vz: number; born: number; life: number; size: number; spin: number }
  const flying: Swoosh[] = [];
  const puffs: Puff[] = [];
  const heads: { x: number; y: number; z: number; since: number }[] = [];
  const nextPuff = new Map<number, number>();
  const dummy = new THREE.Object3D();
  const facingCamera = new THREE.Quaternion();
  const roll = new THREE.Quaternion();
  const FORWARD = new THREE.Vector3(0, 0, 1);
  let reducedNow = false;

  return {
    punch(x, z, facing, now) {
      if (reducedNow) return;
      if (flying.length >= SWOOSHES) flying.shift();
      flying.push({ x, z, facing, born: now });
    },
    dizzy(x, y, z, since) {
      if (heads.length < HEADS) heads.push({ x, y, z, since });
    },
    run(slot, x, z, facing, speed, now) {
      if (reducedNow || speed < RUN_FROM) {
        nextPuff.delete(slot);
        return;
      }
      const due = nextPuff.get(slot);
      if (due !== undefined && now < due) return;
      // a puff every few strides, more often the faster (none on the first: a run has only just begun)
      nextPuff.set(slot, now + Math.max(80, 170 - (speed - RUN_FROM) * 24) + Math.random() * 60);
      if (due === undefined || puffs.length >= PUFFS) return;
      const back = { x: -Math.sin(facing), z: -Math.cos(facing) };
      const side = (Math.random() - 0.5) * 0.36;
      puffs.push({
        x: x + back.x * 0.32 + back.z * side,
        y: 0.1,
        z: z + back.z * 0.32 - back.x * side,
        vx: back.x * (0.35 + Math.random() * 0.3) + (Math.random() - 0.5) * 0.25,
        vy: 0.28 + Math.random() * 0.3,
        vz: back.z * (0.35 + Math.random() * 0.3) + (Math.random() - 0.5) * 0.25,
        born: now,
        life: PUFF_MS * (0.8 + Math.random() * 0.4),
        size: 0.78 + Math.random() * 0.3,
        spin: Math.random() * Math.PI * 2
      });
    },
    update(now, delta, camera, reduced) {
      reducedNow = reduced;
      if (reduced) {
        flying.length = 0;
        puffs.length = 0;
      }
      const step = delta / 1000;
      camera.getWorldQuaternion(facingCamera);

      // the swooshes: out from the fist and gone in a quarter of a second
      let live = 0;
      for (const swoosh of flying) {
        const age = (now - swoosh.born) / SWOOSH_MS;
        if (age >= 1) continue;
        const grow = easeOut(age);
        dummy.position.set(swoosh.x + Math.sin(swoosh.facing) * 0.2, 1.42, swoosh.z + Math.cos(swoosh.facing) * 0.2);
        dummy.rotation.set(0, swoosh.facing, 0);
        dummy.scale.set(0.85 + grow * 0.75, 1, 0.85 + grow * 0.75);
        dummy.updateMatrix();
        swooshes.mesh.setMatrixAt(live, dummy.matrix);
        swooshes.fade.setX(live, Math.min(1, age * 7) * Math.pow(1 - age, 0.8));
        flying[live++] = swoosh;
      }
      flying.length = live;
      swooshes.mesh.count = live;
      // (nothing to draw: no draw at all)
      swooshes.mesh.visible = live > 0;
      if (live) {
        swooshes.mesh.instanceMatrix.needsUpdate = true;
        swooshes.fade.needsUpdate = true;
      }

      // the dust: a soft puff that swells, drifts back and up, and thins away
      live = 0;
      for (const bit of puffs) {
        const age = (now - bit.born) / bit.life;
        if (age >= 1) continue;
        bit.x += bit.vx * step;
        bit.y += bit.vy * step;
        bit.z += bit.vz * step;
        bit.vx *= 1 - Math.min(1, step * 2.2);
        bit.vz *= 1 - Math.min(1, step * 2.2);
        bit.vy *= 1 - Math.min(1, step * 1.4);
        dummy.position.set(bit.x, bit.y, bit.z);
        dummy.quaternion.copy(facingCamera).multiply(roll.setFromAxisAngle(FORWARD, bit.spin));
        dummy.scale.setScalar(bit.size * (0.45 + easeOut(age) * 0.75));
        dummy.updateMatrix();
        dust.mesh.setMatrixAt(live, dummy.matrix);
        dust.fade.setX(live, Math.min(1, age * 8) * Math.pow(1 - age, 1.4) * 0.8);
        puffs[live++] = bit;
      }
      puffs.length = live;
      dust.mesh.count = live;
      dust.mesh.visible = live > 0;
      if (live) {
        dust.mesh.instanceMatrix.needsUpdate = true;
        dust.fade.needsUpdate = true;
      }

      // the stars: three round each stunned head, popping in, circling and turning
      let count = 0;
      for (const head of heads) {
        const pop = reduced ? 1 : easeOut((now - head.since) / 180);
        for (let index = 0; index < STARS; index++) {
          const angle = (index * Math.PI * 2) / STARS + (reduced ? 0.5 : (now / 1000) * 5.2);
          const bob = reduced ? 0 : Math.sin((now / 1000) * 7 + index * 2.1) * 0.04;
          dummy.position.set(head.x + Math.cos(angle) * 0.36, head.y + 0.38 + bob, head.z + Math.sin(angle) * 0.36);
          dummy.quaternion.copy(facingCamera).multiply(roll.setFromAxisAngle(FORWARD, reduced ? 0 : (now / 1000) * 3 + index));
          dummy.scale.setScalar(pop);
          dummy.updateMatrix();
          stars.setMatrixAt(count++, dummy.matrix);
        }
      }
      heads.length = 0;
      stars.count = count;
      stars.visible = count > 0;
      if (count) stars.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [swooshes.mesh, dust.mesh, stars]) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}

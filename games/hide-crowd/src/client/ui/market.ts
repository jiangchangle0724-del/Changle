// The night market's own 3D, beside the Blender set (market-dressing.glb): the parking lot's asphalt
// and its paint, the warm pools of light before the four stalls (the rules' marks: stand in one, still,
// to taste that stall; it flashes when someone does), the glow round the bulbs and the lanterns, the
// night's light, and the fireworks over the stalls in the crowd's moment. With reduced motion the
// rockets don't fly and the light doesn't flicker: the bursts open where they are and fade.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ARENA, STALLS, STALL_REACH } from "../../engine";
import { FIREWORK_RISE_MS, FIREWORK_SHOTS } from "../fireworks";
import { SCENE_PER_WORLD } from "../people";

export interface MarketPalette {
  asphalt: string;
  asphalt2: string;
  paint: string;
  bulb: string;
  dusk: string;
  stalls: readonly [string, string, string, string];
  /** the fireworks' five colours */
  sparks: readonly string[];
  ink: string;
}

const sceneX = (x: number) => (x - ARENA.width / 2) * SCENE_PER_WORLD;
const sceneZ = (y: number) => (y - ARENA.height / 2) * SCENE_PER_WORLD;

/** where the Blender set's bulbs and lanterns are (tools/blender/generate_arena_dressing.py), for their glow */
function bulbSpots(): { bulbs: THREE.Vector3[]; lanterns: THREE.Vector3[] } {
  const bulbs: THREE.Vector3[] = [];
  for (const middle of STALLS) {
    const x = sceneX(middle);
    for (let count = 0; count < 7; count++) bulbs.push(new THREE.Vector3(x - 1.35 + count * 0.45, 2.27, -4.28));
  }
  const poles = [-8.9, -3.5, 0, 3.5, 8.9];
  for (let span = 0; span < poles.length - 1; span++) {
    for (let step = 1; step < 7; step++) {
      const t = step / 7;
      bulbs.push(new THREE.Vector3(poles[span] + (poles[span + 1] - poles[span]) * t, 4.75 - Math.sin(Math.PI * t) * 0.6, -6.85));
    }
  }
  const lanterns = [-3.5, 0, 3.5].map((x) => new THREE.Vector3(x, 3.15, -4.75));
  return { bulbs, lanterns };
}

/** a soft round pool, as an alpha map (grey: white in the middle, black at the rim) */
function createPoolTexture(): THREE.DataTexture {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const reach = Math.min(1, Math.hypot(dx, dy) * 2);
      const value = Math.round(255 * (1 - reach * reach * (3 - 2 * reach)));
      data.set([value, value, value, 255], (y * size + x) * 4);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** a soft round dot, white in the middle, for glows and sparks */
function createDotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.22, "rgba(255,255,255,0.85)");
    glow.addColorStop(0.5, "rgba(255,255,255,0.25)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The parking lot under the market, drawn once on the floor's repeating canvas: worn asphalt flecked
 * with grit, a few dark stains, and the lot's painted lines showing through.
 */
export function paintAsphalt(context: CanvasRenderingContext2D, size: number, palette: MarketPalette, random: () => number): void {
  const tint = (value: string, alpha: number) => {
    const color = new THREE.Color(value);
    return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
  };
  context.fillStyle = palette.asphalt;
  context.fillRect(0, 0, size, size);
  // the grit
  for (let fleck = 0; fleck < 16_000; fleck++) {
    const light = random() < 0.42;
    context.fillStyle = light ? tint(palette.asphalt2, 0.55 + random() * 0.4) : tint(palette.dusk, 0.25 + random() * 0.3);
    const grain = 1 + random() * 1.8;
    context.fillRect(random() * size, random() * size, grain, grain);
  }
  // a few stains where cars stood (drawn again across the edges they touch: the floor repeats without a seam)
  for (let stain = 0; stain < 5; stain++) {
    const radius = 40 + random() * 60;
    const x = random() * size;
    const y = random() * size;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const cx = x + dx;
        const cy = y + dy;
        if (cx + radius < 0 || cx - radius > size || cy + radius < 0 || cy - radius > size) continue;
        const spot = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
        spot.addColorStop(0, tint(palette.dusk, 0.28));
        spot.addColorStop(1, tint(palette.dusk, 0));
        context.fillStyle = spot;
        context.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }
    }
  }
  // the lot's parking lines, worn almost away
  for (let column = 0; column < 4; column++) {
    const x = column * (size / 4) + size / 8 - 3;
    for (let at = 0; at < size; at += 6) {
      context.fillStyle = tint(palette.paint, 0.06 + random() * 0.12);
      context.fillRect(x, at, 6, 6);
    }
  }
}

export interface Market {
  /** a stall was tasted (its pool flashes in its colour); a feast also sends up a rocket from it */
  flash: (stall: number, feast: boolean, time: number) => void;
  /** the crowd's moment began (seen now): the rockets go up on their schedule */
  fireworks: (time: number) => void;
  /** the set has arrived: its bulbs and lanterns glow */
  showGlow: () => void;
  /** `pointScale`: 1 / tan(half the camera's field of view), so the glows keep their size in the scene */
  update: (time: number, delta: number, reduced: boolean, pointScale: number) => void;
  dispose: () => void;
}

/**
 * The market's lights and marks, added to the scene. `ambient` is the scene's sky light: the night
 * tints it, and the bursts light it up in their colours for a moment.
 */
export function addMarket(scene: THREE.Scene, palette: MarketPalette, ambient: THREE.HemisphereLight, key: THREE.DirectionalLight, fill: THREE.DirectionalLight): Market {
  const owned: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(value: T): T => {
    owned.push(value);
    return value;
  };
  // the night: a dusk-blue sky light, a cool moon from the front, the stalls' warm light from behind
  const dusk = new THREE.Color(palette.dusk).lerp(new THREE.Color(palette.ink), 0.62);
  ambient.color.copy(dusk);
  ambient.groundColor.set(palette.asphalt2);
  ambient.intensity = 3.1;
  const ambientBase = { color: dusk.clone(), intensity: ambient.intensity };
  key.color.copy(new THREE.Color(palette.ink).lerp(new THREE.Color(palette.dusk), 0.12));
  key.intensity = 3.0;
  fill.color.set(palette.bulb);
  fill.intensity = 2.4;
  fill.position.set(0, 7, -13);

  // the pools of the stalls' light on the lot, spilling out from each counter (where the rules let you taste)
  const zoneWidth = STALL_REACH.halfWidth * 2 * SCENE_PER_WORLD;
  const zoneDepth = STALL_REACH.depth * SCENE_PER_WORLD;
  const zoneZ = sceneZ(ARENA.marginY + STALL_REACH.depth / 2);
  const poolTexture = keep(createPoolTexture());
  const poolGeometry = keep(new THREE.PlaneGeometry(3.4, 3.0));
  const stallColors = palette.stalls.map((value) => new THREE.Color(value));
  const bulb = new THREE.Color(palette.bulb);
  const POOL = 0.3;
  const pools = STALLS.map((middle) => {
    const material = keep(new THREE.MeshBasicMaterial({ color: bulb.clone(), alphaMap: poolTexture, transparent: true, opacity: POOL, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    const pool = new THREE.Mesh(poolGeometry, material);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(sceneX(middle), 0.021, zoneZ - 0.35);
    scene.add(pool);
    return { material, flashAt: -Infinity };
  });
  // and a painted box round each, like a queue's on the lot
  const edges: THREE.BufferGeometry[] = [];
  const line = 0.05;
  for (const middle of STALLS) {
    const x = sceneX(middle);
    for (const [cx, cz, width, depth] of [
      [x, zoneZ - zoneDepth / 2, zoneWidth, line],
      [x, zoneZ + zoneDepth / 2, zoneWidth, line],
      [x - zoneWidth / 2, zoneZ, line, zoneDepth],
      [x + zoneWidth / 2, zoneZ, line, zoneDepth]
    ] as const) {
      const edge = new THREE.PlaneGeometry(width, depth);
      edge.rotateX(-Math.PI / 2);
      edge.translate(cx, 0.024, cz);
      edges.push(edge);
    }
  }
  const frameGeometry = keep(mergeGeometries(edges));
  for (const edge of edges) edge.dispose();
  const frame = new THREE.Mesh(frameGeometry, keep(new THREE.MeshBasicMaterial({ color: palette.paint, transparent: true, opacity: 0.42, depthWrite: false })));
  scene.add(frame);

  // the glow round the set's bulbs and lanterns (once the set is in)
  const dot = keep(createDotTexture());
  const spots = bulbSpots();
  /** points sized in scene units (three.js sizes them as if the view were 90 degrees tall: `pointScale` fixes that) */
  const sized: { material: THREE.PointsMaterial; size: number }[] = [];
  const glowFor = (points: THREE.Vector3[], size: number, color: string, opacity: number) => {
    const geometry = keep(new THREE.BufferGeometry().setFromPoints(points));
    const material = keep(new THREE.PointsMaterial({ color, map: dot, size, sizeAttenuation: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sized.push({ material, size });
    const glow = new THREE.Points(geometry, material);
    glow.visible = false;
    glow.frustumCulled = false;
    scene.add(glow);
    return glow;
  };
  const bulbGlow = glowFor(spots.bulbs, 0.5, palette.bulb, 0.7);
  const lanternGlow = glowFor(spots.lanterns, 1.5, palette.stalls[0], 0.6);

  // the fireworks: rockets and their sparks, all one set of points
  const MAX = 1_400;
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const sparkGeometry = keep(new THREE.BufferGeometry());
  sparkGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeometry.setDrawRange(0, 0);
  const sparkMaterial = keep(new THREE.PointsMaterial({ map: dot, size: 0.3, sizeAttenuation: true, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  sized.push({ material: sparkMaterial, size: 0.3 });
  const sparkPoints = new THREE.Points(sparkGeometry, sparkMaterial);
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  const sparkColors = palette.sparks.map((value) => new THREE.Color(value));
  const white = new THREE.Color(palette.ink);
  /** the rockets' trail: the bulbs' gold, dimmer (the trail's sparks overlap at its head) */
  const trail = new THREE.Color(palette.bulb).multiplyScalar(0.55);
  interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; born: number; life: number; color: THREE.Color; twinkle: boolean; fall: number }
  const sparks: Spark[] = [];
  /** a rocket: from where it goes up (behind a stall) to where it bursts */
  interface Launch { at: number; from: THREE.Vector3; to: THREE.Vector3; color: THREE.Color }
  interface Rocket extends Launch { done: boolean; trailAt: number }
  const rockets: Rocket[] = [];
  const queue: Launch[] = [];
  let lightAt = -Infinity;
  let lightColor = new THREE.Color();
  let reducedNow = false;

  const burst = (x: number, y: number, z: number, color: THREE.Color, time: number) => {
    const count = 130;
    for (let index = 0; index < count && sparks.length < MAX; index++) {
      // even round a ball, a little ragged
      const up = 1 - (2 * (index + 0.5)) / count;
      const around = index * 2.39996;
      const ring = Math.sqrt(1 - up * up);
      const speed = reducedNow ? 0 : 4.2 + Math.random() * 1.3;
      const spread = reducedNow ? 1.6 : 0.22;
      sparks.push({
        x: x + ring * Math.cos(around) * spread,
        y: y + up * spread,
        z: z + ring * Math.sin(around) * spread,
        vx: ring * Math.cos(around) * speed,
        vy: up * speed + (reducedNow ? 0 : 0.5),
        vz: ring * Math.sin(around) * speed,
        born: time,
        life: 1_500 + Math.random() * 800,
        color: index % 6 === 0 ? white : color,
        twinkle: index % 3 === 0,
        fall: reducedNow ? 0 : 2.2
      });
    }
    lightAt = time;
    lightColor = color;
  };

  const launch = (shot: Launch) => {
    if (reducedNow) burst(shot.to.x, shot.to.y, shot.to.z, shot.color, shot.at + FIREWORK_RISE_MS);
    else rockets.push({ ...shot, done: false, trailAt: shot.at });
  };

  return {
    flash(stall, feast, time) {
      const pool = pools[stall];
      if (!pool) return;
      pool.flashAt = time;
      // a feast: a rocket of its own, up from the stall's counter
      const x = sceneX(STALLS[stall]);
      if (feast) queue.push({ at: time + 250, from: new THREE.Vector3(x, 1.2, -4.6), to: new THREE.Vector3(x, 4.2, -2.4), color: sparkColors[0] ?? bulb });
    },
    fireworks(time) {
      for (const shot of FIREWORK_SHOTS) {
        queue.push({ at: time + shot.at, from: new THREE.Vector3(shot.x * 0.8, 1.0, -6.6), to: new THREE.Vector3(shot.x, shot.height, shot.z), color: sparkColors[shot.color % sparkColors.length] ?? bulb });
      }
    },
    showGlow() {
      bulbGlow.visible = true;
      lanternGlow.visible = true;
    },
    update(time, delta, reduced, pointScale) {
      reducedNow = reduced;
      const step = delta / 1000;
      for (const item of sized) item.material.size = item.size * pointScale;
      // the pools: a flash of the stall's colour, fading back to the bulbs' warm light
      pools.forEach((pool, index) => {
        const age = time - pool.flashAt;
        const glow = age >= 0 && age < 1_600 ? Math.exp(-age / 420) : 0;
        pool.material.opacity = POOL + glow * 0.7;
        pool.material.color.copy(bulb).lerp(stallColors[index], Math.min(1, glow * 1.4));
      });
      // the bulbs breathe a little
      if (!reduced) {
        (bulbGlow.material as THREE.PointsMaterial).opacity = 0.74 + Math.sin(time * 0.0023) * 0.06;
        (lanternGlow.material as THREE.PointsMaterial).opacity = 0.52 + Math.sin(time * 0.0017 + 1) * 0.05;
      }
      // launches that are due
      for (let index = queue.length - 1; index >= 0; index--) {
        if (time < queue[index].at) continue;
        launch(queue[index]);
        queue.splice(index, 1);
      }
      // the rockets climb, slowing, trailing gold, and burst at the top
      for (const rocket of rockets) {
        if (rocket.done) continue;
        const progress = Math.min(1, (time - rocket.at) / FIREWORK_RISE_MS);
        const eased = 1 - (1 - progress) * (1 - progress);
        const x = rocket.from.x + (rocket.to.x - rocket.from.x) * progress;
        const y = rocket.from.y + (rocket.to.y - rocket.from.y) * eased;
        const z = rocket.from.z + (rocket.to.z - rocket.from.z) * progress;
        while (rocket.trailAt <= time && sparks.length < MAX) {
          sparks.push({ x, y, z, vx: (Math.random() - 0.5) * 0.3, vy: -0.4, vz: 0, born: rocket.trailAt, life: 300, color: trail, twinkle: false, fall: 0.5 });
          rocket.trailAt += 36;
        }
        if (progress >= 1) {
          rocket.done = true;
          burst(x, y, z, rocket.color, time);
        }
      }
      for (let index = rockets.length - 1; index >= 0; index--) if (rockets[index].done) rockets.splice(index, 1);
      // the sparks fly out, slow, fall and fade
      let live = 0;
      for (const spark of sparks) {
        const age = time - spark.born;
        if (age >= spark.life || age < 0) {
          if (age < 0) sparks[live++] = spark;
          continue;
        }
        spark.vy -= spark.fall * step;
        const drag = Math.max(0, 1 - step * 1.5);
        spark.vx *= drag;
        spark.vy *= drag;
        spark.vz *= drag;
        spark.x += spark.vx * step;
        spark.y += spark.vy * step;
        spark.z += spark.vz * step;
        sparks[live++] = spark;
      }
      sparks.length = live;
      let drawn = 0;
      for (const spark of sparks) {
        const age = time - spark.born;
        if (age < 0) continue;
        const left = 1 - age / spark.life;
        const flicker = spark.twinkle && !reduced ? 0.55 + 0.45 * Math.sin(age * 0.06 + spark.x * 9) : 1;
        const strength = left * left * flicker;
        positions[drawn * 3] = spark.x;
        positions[drawn * 3 + 1] = spark.y;
        positions[drawn * 3 + 2] = spark.z;
        colors[drawn * 3] = spark.color.r * strength;
        colors[drawn * 3 + 1] = spark.color.g * strength;
        colors[drawn * 3 + 2] = spark.color.b * strength;
        drawn++;
      }
      sparkGeometry.setDrawRange(0, drawn);
      if (drawn > 0) {
        sparkGeometry.attributes.position.needsUpdate = true;
        sparkGeometry.attributes.color.needsUpdate = true;
      }
      // a burst lights the whole lot in its colour for a moment (not with reduced motion: no flicker)
      const lightAge = time - lightAt;
      const lit = !reduced && lightAge >= 0 && lightAge < 900 ? Math.exp(-lightAge / 260) : 0;
      ambient.intensity = ambientBase.intensity + lit * 1.6;
      ambient.color.copy(ambientBase.color).lerp(lightColor, lit * 0.55);
    },
    dispose() {
      for (const value of owned) value.dispose();
    }
  };
}

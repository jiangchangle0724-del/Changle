import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { verticalFovForWidth } from "../camera";
import { pixelRatioForQuality, INITIAL_RENDER_QUALITY, observeRenderQuality, percentile95, type RenderQuality } from "../renderQuality";
import { PLAYER_ACCELERATION, PLAYER_BRAKING, steerVelocity } from "../../engine";
import type { ArenaId, Pose } from "../../engine";
import type { AvatarView } from "../../room/protocol";
import { BASE } from "../base";
import { t } from "../i18n";
import { reducedNow } from "../prefs";
import { spriteBatchIndex, spriteDirectionRow, spritePoseColumn, SPRITE_ARCHETYPES, SPRITE_DIRECTIONS, SPRITE_FRAMES } from "../spriteAtlas";
import { addEnvironmentalLandmarks } from "./landmarks";

interface Props {
  avatars: AvatarView[];
  arena: ArenaId;
  drift: { x: number; y: number };
  localVector: { x: number; y: number };
  /** this phone's top speed (for predicting its own body between frames) */
  maxSpeed: number;
  receivedAt: number;
  impactId: number;
  impactType: "tag" | "foul" | "swing" | "hide" | "over";
  label: string;
  youLabel: string;
  fallback: ComponentChildren;
}

interface Visual { x: number; z: number; facing: number; stridePhase: number; speed: number; pose: Pose; poseStartedAt: number }
type FrameMetrics = { fps: number; avg: number; p95: number; slow: number; quality: RenderQuality; dpr: number };
interface SpriteBatch { archetype: number; direction: number; frame: number; mesh: THREE.InstancedMesh }
interface Palette {
  bg: string;
  sky: string;
  land: string;
  foliage: string;
  surface: string;
  surface2: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  warn: string;
  danger: string;
  /** the "you" marker: the game's gel, night-colored text */
  me: string;
  onMe: string;
  font: string;
}

const MAX_CHARACTERS = 26;
export const ARENA_PANORAMAS: Record<ArenaId, string> = {
  plaza: `${BASE}/art/plaza-seawall.webp`,
  metro: `${BASE}/art/metro-station.webp`,
  gallery: `${BASE}/art/gallery-courtyard.webp`
};
const ARENA_DRESSING: Record<ArenaId, string> = {
  plaza: `${BASE}/art/seawall-dressing.glb`,
  metro: `${BASE}/art/transit-dressing.glb`,
  gallery: `${BASE}/art/courtyard-dressing.glb`
};
const CROWD_ATLAS = `${BASE}/art/crowd-atlas.webp`;
const SPRITE_ATLAS_COLUMNS = SPRITE_ARCHETYPES * SPRITE_FRAMES;
const SPRITE_ATLAS_CELL = 192;
const SPRITE_ATLAS_PITCH = 200;
const SPRITE_ATLAS_INSET = 4;
const SPRITE_ATLAS_WIDTH = SPRITE_ATLAS_COLUMNS * SPRITE_ATLAS_PITCH;
const SPRITE_ATLAS_HEIGHT = SPRITE_DIRECTIONS * SPRITE_ATLAS_PITCH;

function backgroundIntensity(palette: Palette): number {
  const color = new THREE.Color(palette.bg);
  return color.r + color.g + color.b < 1.2 ? 0.46 : 0.94;
}

function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) materials.add(material);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function createSpriteCellGeometry(column: number, row: number): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1.82, 2.35);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  const uStart = (column * SPRITE_ATLAS_PITCH + SPRITE_ATLAS_INSET) / SPRITE_ATLAS_WIDTH;
  const vStart = 1 - (row * SPRITE_ATLAS_PITCH + SPRITE_ATLAS_INSET + SPRITE_ATLAS_CELL) / SPRITE_ATLAS_HEIGHT;
  const uSize = SPRITE_ATLAS_CELL / SPRITE_ATLAS_WIDTH;
  const vSize = SPRITE_ATLAS_CELL / SPRITE_ATLAS_HEIGHT;
  for (let index = 0; index < uv.count; index++) uv.setXY(index, uStart + uv.getX(index) * uSize, vStart + uv.getY(index) * vSize);
  uv.needsUpdate = true;
  return geometry;
}

/** The arena's own colors (the --arena-* art colors at the top of styles.css), and the gel for the marker. */
function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    bg: read("--arena-bg", "#121628"),
    sky: read("--arena-sky", "#16203a"),
    land: read("--arena-land", "#3c4669"),
    foliage: read("--arena-foliage", "#5fc48a"),
    surface: read("--arena-surface", "#1c2238"),
    surface2: read("--arena-surface-2", "#242b47"),
    ink: read("--arena-ink", "#f1e6cf"),
    muted: read("--arena-muted", "#b4ad9b"),
    line: read("--arena-line", "#303a5a"),
    accent: read("--arena-accent", "#ff8a6b"),
    warn: read("--arena-warn", "#ffb36b"),
    danger: read("--arena-danger", "#ff8a7f"),
    me: read("--gel", "#7be55c"),
    onMe: read("--night", "#0e0c22"),
    font: read("--font-display", "sans-serif")
  };
}

function lightTint(palette: Palette): string {
  const surface = new THREE.Color(palette.surface);
  return surface.r + surface.g + surface.b < 1.2 ? palette.ink : palette.surface;
}

function darkTint(palette: Palette): string {
  const ink = new THREE.Color(palette.ink);
  return ink.r + ink.g + ink.b > 1.35 ? palette.surface : palette.ink;
}

function makeMaterial(color: string, roughness = 0.82, token?: keyof Palette): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
  if (token) material.userData.paletteToken = token;
  return material;
}

function makeBox(scene: THREE.Scene, size: [number, number, number], position: [number, number, number], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  scene.add(mesh);
  return mesh;
}

function makeCylinder(scene: THREE.Scene, radius: number, height: number, position: [number, number, number], material: THREE.Material, sides = 8): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, sides), material);
  mesh.position.set(...position);
  scene.add(mesh);
  return mesh;
}

function paintGroundTexture(texture: THREE.CanvasTexture, arena: ArenaId, palette: Palette): void {
  const canvas = texture.image as HTMLCanvasElement;
  const context = canvas.getContext("2d");
  if (!context) return;
  const rgba = (value: string, alpha: number) => {
    const color = new THREE.Color(value);
    return "rgba(" + Math.round(color.r * 255) + "," + Math.round(color.g * 255) + "," + Math.round(color.b * 255) + "," + alpha + ")";
  };
  const base = arena === "plaza" ? palette.foliage : arena === "gallery" ? palette.land : palette.surface;
  const mid = arena === "plaza" ? palette.land : arena === "gallery" ? palette.surface2 : palette.surface2;
  const seam = arena === "metro" ? palette.line : palette.ink;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (arena === "plaza") {
    for (let index = 0; index < 420; index++) {
      const x = (index * 73) % 512;
      const y = (index * 137) % 512;
      const radius = 2 + index % 7;
      context.fillStyle = rgba(index % 3 === 0 ? palette.surface : mid, 0.10 + (index % 4) * 0.025);
      context.beginPath();
      context.ellipse(x, y, radius * 1.5, radius, (index % 9) * 0.2, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = rgba(palette.surface, 0.2);
    context.lineWidth = 1;
    for (let index = 0; index < 260; index++) {
      const x = (index * 97) % 512;
      const y = (index * 151) % 512;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + ((index % 5) + 2), y - 3 - index % 4);
      context.stroke();
    }
  } else if (arena === "gallery") {
    for (let y = 0; y < 512; y += 36) {
      context.fillStyle = rgba(seam, 0.18);
      context.fillRect(0, y, 512, 2);
      const offset = (Math.floor(y / 36) % 2) * 42;
      for (let x = offset; x < 512; x += 84) context.fillRect(x, y, 1, 36);
      context.strokeStyle = rgba(palette.surface, 0.18);
      context.lineWidth = 1;
      for (let grain = 0; grain < 3; grain++) {
        const x = (Math.floor(y / 36) * 61 + grain * 103) % 512;
        context.beginPath();
        context.moveTo(x, y + 9 + grain * 7);
        context.bezierCurveTo(x + 22, y + 7 + grain * 7, x + 34, y + 11 + grain * 7, x + 55, y + 8 + grain * 7);
        context.stroke();
      }
    }
  } else {
    for (let x = 0; x <= 512; x += 64) {
      context.fillStyle = rgba(seam, x % 128 === 0 ? 0.24 : 0.16);
      context.fillRect(x, 0, 2, 512);
    }
    for (let y = 0; y <= 512; y += 64) {
      context.fillStyle = rgba(seam, y % 128 === 0 ? 0.24 : 0.16);
      context.fillRect(0, y, 512, 2);
    }
    for (let index = 0; index < 120; index++) {
      const x = (index * 89) % 512;
      const y = (index * 157) % 512;
      context.fillStyle = rgba(palette.surface, 0.28);
      context.fillRect(x, y, 9 + index % 12, 1);
    }
  }
  texture.needsUpdate = true;
}

function createGroundTexture(arena: ArenaId, palette: Palette, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.anisotropy = Math.min(4, maxAnisotropy);
  texture.generateMipmaps = true;
  paintGroundTexture(texture, arena, palette);
  return texture;
}

function createSoftShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const center = canvas.width / 2;
    const gradient = context.createRadialGradient(center, center, 2, center, center, center);
    gradient.addColorStop(0, "rgb(255,255,255)");
    gradient.addColorStop(0.42, "rgb(212,212,212)");
    gradient.addColorStop(0.76, "rgb(88,88,88)");
    gradient.addColorStop(1, "rgb(0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function addVenue(scene: THREE.Scene, arena: ArenaId, palette: Palette, maxAnisotropy: number): THREE.CanvasTexture {
  const floor = makeMaterial(palette.surface, 0.9, "surface");
  const detail = makeMaterial(palette.surface2, 0.86, "surface2");
  const accent = makeMaterial(palette.accent, 0.78, "accent");
  const muted = makeMaterial(palette.muted, 0.86, "muted");
  const warm = makeMaterial(palette.warn, 0.75, "warn");
  const trim = makeMaterial(palette.line, 0.86, "line");
  const grass = makeMaterial(palette.foliage, 1, "foliage");
  const water = makeMaterial(palette.sky, 0.52, "sky");
  const wood = makeMaterial(palette.land, 0.9, "land");
  const dark = makeMaterial(darkTint(palette), 0.9);
  const groundSourceMaterial = arena === "plaza" ? grass : arena === "gallery" ? wood : floor;
  const groundMaterial = groundSourceMaterial.clone();
  groundMaterial.userData = { ...groundSourceMaterial.userData };
  const groundTexture = createGroundTexture(arena, palette, maxAnisotropy);
  groundMaterial.map = groundTexture;
  groundMaterial.bumpMap = groundTexture;
  groundMaterial.bumpScale = arena === "plaza" ? 0.035 : arena === "gallery" ? 0.022 : 0.012;
  groundMaterial.needsUpdate = true;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(25, 0.35, 17), groundMaterial);
  ground.position.y = -0.19;
  scene.add(ground);

  if (arena === "plaza") {
    // Vancouver seawall park: lawn, water, a mountain horizon, cedar-like trees and a boardwalk.
    makeBox(scene, [18.6, 0.025, 1.35], [0, 0.012, -5.48], water);
    makeBox(scene, [18.6, 0.025, 0.82], [0, 0.014, 4.5], wood);
    for (let x = -9; x <= 9; x += 2.25) {
      makeBox(scene, [0.1, 0.9, 0.12], [x, 0.47, -4.82], wood);
      makeBox(scene, [0.1, 0.9, 0.12], [x, 0.47, 4.82], wood);
    }
    makeBox(scene, [18.3, 0.12, 0.14], [0, 0.88, -4.82], wood);
    makeBox(scene, [18.3, 0.12, 0.14], [0, 0.88, 4.82], wood);
    for (const x of [-8.8, 8.8]) {
      makeBox(scene, [0.12, 0.9, 9.5], [x, 0.47, 0], wood);
      makeBox(scene, [0.12, 0.12, 9.5], [x, 0.88, 0], wood);
    }
    for (const [x, height, width] of [[-7.4, 2.2, 2.2], [-4.6, 1.55, 2.8], [0, 2.7, 3.3], [4.8, 1.8, 2.7], [7.4, 2.4, 2.2]] as const) {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(width, height, 5), detail);
      peak.position.set(x, height * 0.5 - 0.08, -6.55);
      peak.rotation.y = Math.PI / 5;
      scene.add(peak);
    }
    const treeTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1.1, 7), wood, 8);
    const treeCrowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.72, 1), grass, 16);
    const dummy = new THREE.Object3D();
    let trunkIndex = 0;
    let crownIndex = 0;
    for (const x of [-8.0, -6.0, 6.0, 8.0]) {
      for (const z of [-3.7, 3.75]) {
        dummy.position.set(x, 0.66, z);
        dummy.scale.set(1, 1 + (trunkIndex % 2) * 0.16, 1);
        dummy.updateMatrix();
        treeTrunks.setMatrixAt(trunkIndex++, dummy.matrix);
        for (const [dx, dy, dz, size] of [[0, 1.62, 0, 1], [-0.34, 1.84, 0.08, 0.72], [0.34, 1.78, -0.08, 0.74]] as const) {
          dummy.position.set(x + dx, dy, z + dz);
          dummy.scale.set(size, size * 0.88, size);
          dummy.updateMatrix();
          treeCrowns.setMatrixAt(crownIndex++, dummy.matrix);
        }
      }
    }
    scene.add(treeTrunks, treeCrowns);
    const grassGeometry = new THREE.ConeGeometry(0.028, 0.12, 3);
    const grassFlecks = new THREE.InstancedMesh(grassGeometry, water, 420);
    for (let index = 0; index < 420; index++) {
      const x = ((index * 73) % 1760) / 100 - 8.8;
      const z = ((index * 137) % 900) / 100 - 4.5;
      dummy.position.set(x, 0.035, z);
      dummy.rotation.set(0, (index % 17) * 0.37, (index % 5) * 0.025);
      const size = 0.55 + (index % 6) * 0.1;
      dummy.scale.set(size, size, size);
      dummy.updateMatrix();
      grassFlecks.setMatrixAt(index, dummy.matrix);
    }
    grassFlecks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    scene.add(grassFlecks);
    const flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.055, 0), warm, 28);
    for (let index = 0; index < 28; index++) {
      const x = ((index * 89) % 1600) / 100 - 8;
      const z = ((index * 151) % 760) / 100 - 3.8;
      dummy.position.set(x, 0.06, z);
      dummy.scale.set(1.25, 0.42, 1.25);
      dummy.updateMatrix();
      flowers.setMatrixAt(index, dummy.matrix);
    }
    scene.add(flowers);
    const cloud = new THREE.InstancedMesh(new THREE.SphereGeometry(0.72, 9, 7), makeMaterial(lightTint(palette), 0.95), 18);
    let cloudIndex = 0;
    for (let group = 0; group < 6; group++) {
      const x = -9 + group * 3.6;
      for (const [dx, dy, scale] of [[-0.72, 0, 0.82], [0, 0.3, 1.06], [0.76, 0.02, 0.78]] as const) {
        dummy.position.set(x + dx, 4.35 + dy + (group % 2) * 0.2, -6.65);
        dummy.scale.set(scale * 1.15, scale * 0.64, scale * 0.56);
        dummy.updateMatrix();
        cloud.setMatrixAt(cloudIndex++, dummy.matrix);
      }
    }
    scene.add(cloud);
    for (const x of [-4.8, 4.8]) {
      makeBox(scene, [1.35, 0.24, 0.34], [x, 0.34, 4.12], wood);
      makeBox(scene, [0.1, 0.4, 0.12], [x - 0.5, 0.2, 4.12], muted);
      makeBox(scene, [0.1, 0.4, 0.12], [x + 0.5, 0.2, 4.12], muted);
    }
    const center = new THREE.Mesh(new THREE.RingGeometry(1.22, 1.29, 40), makeMaterial(lightTint(palette), 0.9));
    center.rotation.x = -Math.PI / 2;
    center.position.y = 0.015;
    scene.add(center);
    return groundTexture;
  }

  if (arena === "metro") {
    // Vancouver-style transit concourse: glass, tiled floor, columns and a platform edge.
    makeBox(scene, [18.5, 4.8, 0.25], [0, 2.2, -5.7], detail);
    makeBox(scene, [19, 0.28, 0.5], [0, 4.55, -5.38], dark);
    makeBox(scene, [17.6, 0.76, 0.18], [0, 3.9, -5.42], accent);
    makeBox(scene, [5.6, 0.12, 0.2], [0, 3.9, -5.28], warm);
    for (const x of [-8.4, -5.6, -2.8, 0, 2.8, 5.6, 8.4]) {
      makeBox(scene, [0.23, 4.45, 0.32], [x, 2.2, -5.2], muted);
      makeBox(scene, [0.48, 0.12, 0.45], [x, 4.42, -5.2], accent);
    }
    for (const x of [-7.0, -3.5, 0, 3.5, 7.0]) {
      const window = makeBox(scene, [2.45, 1.55, 0.07], [x, 2.15, -5.53], water);
      window.material = water;
      makeBox(scene, [2.46, 0.05, 0.11], [x, 2.15, -5.44], trim);
      makeBox(scene, [0.05, 1.57, 0.11], [x, 2.15, -5.44], trim);
    }
    for (const z of [-2.85, 2.85]) {
      makeBox(scene, [17.5, 0.08, 0.92], [0, 0.04, z], detail);
      makeBox(scene, [17.5, 0.035, 0.1], [0, 0.105, z - 0.42], warm);
      for (let x = -8; x <= 8; x += 1.8) makeBox(scene, [0.06, 0.025, 0.92], [x, 0.1, z], accent);
    }
    for (const x of [-7.6, -5.2, 5.2, 7.6]) {
      makeBox(scene, [1.1, 0.56, 1.6], [x, 0.3, 0], detail);
      makeBox(scene, [1.12, 0.1, 1.66], [x, 0.62, 0], accent);
    }
    for (const x of [-6, -2, 2, 6]) makeBox(scene, [0.85, 0.06, 0.52], [x, 3.48, -5.22], warm);
    return groundTexture;
  }

  // Chinese courtyard theatre: tiled timber stage, lattice panels, lanterns and red curtains.
  for (let z = -5; z <= 5; z += 1) makeBox(scene, [19.2, 0.018, 0.026], [0, 0.012, z], detail);
  makeBox(scene, [18.5, 4.7, 0.22], [0, 2.15, -5.72], dark);
  makeBox(scene, [15.7, 2.5, 0.12], [0, 2.3, -5.55], muted);
  makeBox(scene, [9.6, 1.4, 0.16], [0, 2.25, -5.42], dark);
  makeBox(scene, [18.7, 0.74, 0.75], [0, 4.7, -5.18], accent);
  makeBox(scene, [18.3, 0.16, 0.83], [0, 5.1, -5.12], warm);
  for (const side of [-1, 1]) {
    makeBox(scene, [2.05, 4.6, 0.66], [side * 8.25, 2.25, -5.12], accent);
    for (let fold = 0; fold < 5; fold++) {
      const x = side * (7.48 + fold * 0.38);
      makeBox(scene, [0.17, 4.15, 0.72], [x, 2.22, -4.86], fold % 2 === 0 ? accent : muted);
    }
    makeBox(scene, [0.22, 2.3, 0.26], [side * 9.15, 1.15, -4.62], wood);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), warm);
    lantern.position.set(side * 7.15, 3.65, -4.85);
    lantern.scale.set(0.82, 1.1, 0.82);
    scene.add(lantern);
    makeCylinder(scene, 0.045, 0.42, [side * 7.15, 4.05, -4.85], wood, 6);
  }
  for (const x of [-5.9, -3.0, 3.0, 5.9]) {
    makeBox(scene, [0.09, 1.85, 0.13], [x, 2.15, -5.26], warm);
    makeBox(scene, [1.55, 0.09, 0.13], [x, 2.15, -5.26], warm);
  }
  const platform = makeBox(scene, [17.5, 0.34, 1.0], [0, 0.18, -4.35], detail);
  platform.position.z = -4.35;
  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.86, 1), warm);
  sun.position.set(0, 3.25, -5.05);
  scene.add(sun);
  const rays = new THREE.InstancedMesh(new THREE.ConeGeometry(0.17, 0.58, 5), warm, 10);
  const rayDummy = new THREE.Object3D();
  for (let i = 0; i < 10; i++) {
    const angle = i * Math.PI / 5;
    rayDummy.position.set(Math.cos(angle) * 1.08, 3.25 + Math.sin(angle) * 1.08, -5.04);
    rayDummy.rotation.set(0, 0, -angle);
    rayDummy.updateMatrix();
    rays.setMatrixAt(i, rayDummy.matrix);
  }
  scene.add(rays);
  const spotlight = new THREE.Mesh(new THREE.CircleGeometry(2.45, 40), Object.assign(new THREE.MeshBasicMaterial({ color: palette.warn, transparent: true, opacity: 0.24, depthWrite: false, userData: { paletteToken: "warn" } }), { userData: { paletteToken: "warn" } }));
  spotlight.rotation.x = -Math.PI / 2;
  spotlight.position.set(0, 0.04, 0);
  scene.add(spotlight);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.4, 20, 1, true), Object.assign(new THREE.MeshBasicMaterial({ color: palette.warn, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false, userData: { paletteToken: "warn" } }), { userData: { paletteToken: "warn" } }));
  beam.position.set(0, 3.25, -1.3);
  scene.add(beam);
  for (const z of [5.05, 5.7]) {
    for (let x = -7.8; x <= 7.8; x += 2.6) {
      makeBox(scene, [1.6, 0.48, 0.46], [x, 0.25, z], dark);
      makeBox(scene, [1.64, 0.08, 0.5], [x, 0.5, z], accent);
    }
  }
  return groundTexture;
}
function writeInstance(mesh: THREE.InstancedMesh, index: number, dummy: THREE.Object3D, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, tilt = 0, roll = 0): void {
  dummy.position.set(x, y, z);
  dummy.rotation.set(tilt, yaw, roll, "YXZ");
  dummy.scale.set(sx, sy, sz);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

export function Arena3D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targets = useRef(props.avatars);
  const vector = useRef(props.localVector);
  const maxSpeed = useRef(props.maxSpeed);
  const drift = useRef(props.drift);
  const receivedAt = useRef(props.receivedAt);
  const impact = useRef(props.impactId);
  const impactType = useRef(props.impactType);
  const youLabel = useRef(props.youLabel);
  const [supported, setSupported] = useState(true);
  const [frameMetrics, setFrameMetrics] = useState<FrameMetrics | null>(null);
  const showFps = new URLSearchParams(window.location.search).get("fps") === "1";
  targets.current = props.avatars;
  vector.current = props.localVector;
  maxSpeed.current = props.maxSpeed;
  drift.current = props.drift;
  receivedAt.current = props.receivedAt;
  impact.current = props.impactId;
  impactType.current = props.impactType;
  youLabel.current = props.youLabel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    let frame = 0;
    let resizeObserver: ResizeObserver | undefined;
    let lost = false;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
    } catch {
      setSupported(false);
      return;
    }
    let qualityState = { ...INITIAL_RENDER_QUALITY };
    renderer.setPixelRatio(pixelRatioForQuality(window.devicePixelRatio || 1, qualityState.level));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = false;

    const palette = readPalette();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.bg);
    scene.backgroundIntensity = backgroundIntensity(palette);
    scene.fog = new THREE.Fog(palette.bg, 34, 58);
    let disposed = false;
    const panorama = new THREE.TextureLoader().load(ARENA_PANORAMAS[props.arena], () => {
      if (disposed) return;
      scene.background = panorama;
      scene.backgroundIntensity = backgroundIntensity(palette);
    });
    panorama.colorSpace = THREE.SRGBColorSpace;
    panorama.mapping = THREE.EquirectangularReflectionMapping;
    panorama.generateMipmaps = true;
    panorama.minFilter = THREE.LinearMipmapLinearFilter;
    panorama.magFilter = THREE.LinearFilter;
    panorama.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    const crowdAtlas = new THREE.TextureLoader().load(CROWD_ATLAS);
    crowdAtlas.colorSpace = THREE.SRGBColorSpace;
    crowdAtlas.generateMipmaps = true;
    crowdAtlas.minFilter = THREE.LinearMipmapLinearFilter;
    crowdAtlas.magFilter = THREE.LinearFilter;
    crowdAtlas.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
    camera.position.set(0, 17, 18);
    camera.lookAt(0, 0, 0);
    const ambient = new THREE.HemisphereLight(lightTint(palette), palette.bg, 2.6);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(lightTint(palette), 3.1);
    key.position.set(-7, 16, 10);
    scene.add(key);
    const fill = new THREE.DirectionalLight(lightTint(palette), 0.72);
    fill.position.set(8, 9, -11);
    scene.add(fill);

    const environmentStart = new Set(scene.children);
    const groundTexture = addVenue(scene, props.arena, palette, renderer.capabilities.getMaxAnisotropy());
    addEnvironmentalLandmarks(scene, props.arena, palette);
    const fallbackVenue = new THREE.Group();
    fallbackVenue.name = "procedural venue fallback";
    for (const object of [...scene.children]) {
      if (!environmentStart.has(object)) {
        scene.remove(object);
        fallbackVenue.add(object);
      }
    }
    scene.add(fallbackVenue);
    let loadedVenue: THREE.Object3D | null = null;
    const venueLoader = new GLTFLoader();
    venueLoader.setMeshoptDecoder(MeshoptDecoder);
    venueLoader.load(ARENA_DRESSING[props.arena], (gltf) => {
      if (disposed) {
        disposeTree(gltf.scene);
        return;
      }
      loadedVenue = gltf.scene;
      loadedVenue.name = "original Blender arena dressing";
      loadedVenue.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = false;
          object.frustumCulled = true;
        }
      });
      scene.remove(fallbackVenue);
      disposeTree(fallbackVenue);
      scene.add(loadedVenue);
    }, undefined, () => {
      // Keep the procedural venue visible if an asset fails to load.
    });
    const impactRingGeometry = new THREE.RingGeometry(0.42, 0.51, 24);
    impactRingGeometry.rotateX(-Math.PI / 2);
    const shadowGeometry = new THREE.PlaneGeometry(1.8, 1.25);
    shadowGeometry.rotateX(-Math.PI / 2);
    const impactRingMat = Object.assign(new THREE.MeshBasicMaterial({ color: palette.warn, transparent: true, opacity: 0.82, depthWrite: false }), { userData: { paletteToken: "warn" } });
    const shadowTexture = createSoftShadowTexture();
    const shadowMat = Object.assign(new THREE.MeshBasicMaterial({ color: darkTint(palette), alphaMap: shadowTexture, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false }), { userData: { paletteToken: "ink" } });
    const impactRings = new THREE.InstancedMesh(impactRingGeometry, impactRingMat, MAX_CHARACTERS);
    const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMat, MAX_CHARACTERS);
    for (const mesh of [impactRings, shadows]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    const spriteMaterial = new THREE.MeshBasicMaterial({
      map: crowdAtlas,
      transparent: true,
      alphaTest: 0.18,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const spriteBatches: SpriteBatch[] = [];
    for (let archetype = 0; archetype < SPRITE_ARCHETYPES; archetype++) {
      for (let direction = 0; direction < SPRITE_DIRECTIONS; direction++) {
        for (let spriteFrame = 0; spriteFrame < SPRITE_FRAMES; spriteFrame++) {
          const geometry = createSpriteCellGeometry(archetype * SPRITE_FRAMES + spriteFrame, direction);
          const mesh = new THREE.InstancedMesh(geometry, spriteMaterial, MAX_CHARACTERS);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.count = 0;
          mesh.frustumCulled = false;
          scene.add(mesh);
          spriteBatches.push({ archetype, direction, frame: spriteFrame, mesh });
        }
      }
    }
    const activeSpriteBatches: SpriteBatch[] = [];
    const dummy = new THREE.Object3D();
    const markerCanvas = document.createElement("canvas");
    markerCanvas.width = 512;
    markerCanvas.height = 128;
    const markerContext = markerCanvas.getContext("2d");
    const markerTexture = new THREE.CanvasTexture(markerCanvas);
    markerTexture.colorSpace = THREE.SRGBColorSpace;
    const markerMaterial = new THREE.SpriteMaterial({ map: markerTexture, depthTest: false, transparent: true });
    const marker = new THREE.Sprite(markerMaterial);
    const paintMarker = () => {
      if (!markerContext) return;
      markerContext.clearRect(0, 0, markerCanvas.width, markerCanvas.height);
      markerContext.fillStyle = palette.me;
      // a pill (drawn by hand: older iPhones have no roundRect)
      markerContext.beginPath();
      markerContext.moveTo(60, 14);
      markerContext.arcTo(502, 14, 502, 114, 50);
      markerContext.arcTo(502, 114, 10, 114, 50);
      markerContext.arcTo(10, 114, 10, 14, 50);
      markerContext.arcTo(10, 14, 502, 14, 50);
      markerContext.closePath();
      markerContext.fill();
      markerContext.fillStyle = palette.onMe;
      markerContext.font = "700 68px " + palette.font;
      markerContext.textAlign = "center";
      markerContext.textBaseline = "middle";
      markerContext.fillText(youLabel.current, 256, 64, 450);
      markerTexture.needsUpdate = true;
    };
    paintMarker();
    let paintedLabel = props.youLabel;
    marker.scale.set(1.18, 0.3, 1);
    marker.visible = false;
    scene.add(marker);
    const visuals: Visual[] = [];
    // (the room is night only, like changle.ca: the colors are read once)

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.fov = verticalFovForWidth(24.5, camera.aspect, Math.hypot(17, 18));
      camera.updateProjectionMatrix();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      lost = true;
      setSupported(false);
    });

    let previous = 0;
    let fpsStartedAt = 0;
    let fpsSamples = 0;
    let fpsTotalMs = 0;
    let fpsSlowestMs = 0;
    let frameTimes: number[] = [];
    let shakeAt = 0;
    let shakeStrength = 0;
    let lastImpact = props.impactId;
    const animate = (time: number) => {
      frame = requestAnimationFrame(animate);
      if (lost) return;
      if (document.hidden) {
        previous = 0;
        fpsStartedAt = 0;
        fpsSamples = 0;
        fpsTotalMs = 0;
        fpsSlowestMs = 0;
        frameTimes = [];
        return;
      }
      const frameMs = previous ? time - previous : 16;
      const delta = Math.min(50, frameMs);
      previous = time;
      if (fpsStartedAt === 0) fpsStartedAt = time;
      fpsSamples++;
      fpsTotalMs += frameMs;
      fpsSlowestMs = Math.max(fpsSlowestMs, frameMs);
      frameTimes.push(frameMs);
      const elapsed = time - fpsStartedAt;
      if (elapsed >= 1_000 && fpsSamples > 0) {
        const p95 = percentile95(frameTimes);
        const previousQuality = qualityState.level;
        qualityState = observeRenderQuality(qualityState, p95);
        if (qualityState.level !== previousQuality) {
          renderer.setPixelRatio(pixelRatioForQuality(window.devicePixelRatio || 1, qualityState.level));
          resize();
        }
        if (showFps) {
          setFrameMetrics({
            fps: Math.round(fpsSamples * 1_000 / elapsed),
            avg: Math.round(fpsTotalMs / fpsSamples * 10) / 10,
            p95: Math.round(p95 * 10) / 10,
            slow: Math.round(fpsSlowestMs * 10) / 10,
            quality: qualityState.level,
            dpr: Math.round(renderer.getPixelRatio() * 100) / 100
          });
        }
        fpsStartedAt = time;
        fpsSamples = 0;
        fpsTotalMs = 0;
        fpsSlowestMs = 0;
        frameTimes = [];
      }
      if (impact.current !== lastImpact) {
        lastImpact = impact.current;
        shakeAt = time;
        shakeStrength = impactType.current === "tag" ? 0.28 : impactType.current === "foul" ? 0.16 : impactType.current === "swing" ? 0.08 : impactType.current === "hide" ? 0 : 0.12;
      }
      if (paintedLabel !== youLabel.current) { paintedLabel = youLabel.current; paintMarker(); }
      const reduced = reducedNow();
      const ease = reduced ? 1 : 1 - Math.exp(-delta / 46);
      const snapshot = targets.current;
      for (const batch of activeSpriteBatches) batch.mesh.count = 0;
      activeSpriteBatches.length = 0;
      shadows.count = snapshot.length;
      let activeImpactRings = 0;
      const input = vector.current;
      const prediction = Math.min(125, Math.max(0, Date.now() - receivedAt.current));
      const predictionSeconds = prediction / 1000;
      const clock = reduced ? 0 : time / 1000;
      let localVisual: Visual | undefined;
      for (let index = 0; index < snapshot.length; index++) {
        const avatar = snapshot[index];
        let worldX = avatar.x;
        let worldY = avatar.y;
        let velocityX = avatar.vx;
        let velocityY = avatar.vy;
        if (avatar.me && prediction > 0) {
          const top = maxSpeed.current;
          const predicted = steerVelocity(
            { x: avatar.vx, y: avatar.vy },
            { x: input.x * top + drift.current.x, y: input.y * top + drift.current.y },
            predictionSeconds,
            PLAYER_ACCELERATION,
            PLAYER_BRAKING
          );
          worldX += (avatar.vx + predicted.x) * 0.5 * predictionSeconds;
          worldY += (avatar.vy + predicted.y) * 0.5 * predictionSeconds;
          velocityX = predicted.x;
          velocityY = predicted.y;
        }
        worldX = Math.max(5, Math.min(95, worldX));
        worldY = Math.max(6, Math.min(52, worldY));
        const targetX = (worldX / 100 - 0.5) * 17.5;
        const targetZ = (worldY / 58 - 0.5) * 9.1;
        const targetSpeed = Math.hypot(velocityX, velocityY);
        const visual = visuals[index] ?? (visuals[index] = {
          x: targetX,
          z: targetZ,
          facing: Math.PI / 2 - avatar.f,
          stridePhase: index * 1.71,
          speed: targetSpeed,
          pose: avatar.p,
          poseStartedAt: time
        });
        visual.x += (targetX - visual.x) * ease;
        visual.z += (targetZ - visual.z) * ease;
        if (visual.pose !== avatar.p) {
          visual.pose = avatar.p;
          visual.poseStartedAt = time;
        }
        const poseElapsed = Math.max(0, time - visual.poseStartedAt);
        const loading = !reduced && avatar.p === "windup" ? Math.min(1, poseElapsed / 150) : 0;
        const strike = !reduced && avatar.p === "punch" ? Math.sin(Math.min(1, poseElapsed / 210) * Math.PI) : 0;
        const yaw = Math.PI / 2 - avatar.f;
        if (!reduced) {
          const angularDelta = Math.atan2(Math.sin(yaw - visual.facing), Math.cos(yaw - visual.facing));
          visual.facing += angularDelta * (1 - Math.exp(-delta / 82));
          const phaseGait = avatar.p === "stunned" ? 0 : Math.min(1, targetSpeed / 7);
          visual.stridePhase += delta / 1000 * (4 + targetSpeed * 0.72) * phaseGait;
        } else visual.facing = yaw;
        const gait = !reduced && avatar.p !== "stunned" ? Math.min(1, targetSpeed / 7) : 0;
        const staggered = avatar.p === "stunned";
        const recoil = staggered ? Math.sin(clock * 27 + index) * 0.48 : 0;
        const tumble = staggered && !reduced ? Math.sin(clock * 19 + index) * 0.64 : 0;
        const bounce = gait > 0.05
          ? Math.abs(Math.sin(visual.stridePhase * 2)) * 0.055 * gait
          : reduced ? 0 : Math.sin(clock * 2.4 + index) * 0.018;
        const accelerationLean = !reduced && delta > 0
          ? Math.max(-0.1, Math.min(0.12, (targetSpeed - visual.speed) / (delta / 1000) * 0.003))
          : 0;
        visual.speed += (targetSpeed - visual.speed) * (reduced ? 1 : 1 - Math.exp(-delta / 90));
        const yawNow = visual.facing;
        const bodyTilt = staggered ? tumble : recoil + loading * 0.08 - strike * 0.16 + gait * 0.075 + accelerationLean;
        const ringPulse = staggered && !reduced ? 1 + Math.abs(Math.sin(clock * 12 + index)) * 0.55 : 0;
        if (ringPulse > 0) writeInstance(impactRings, activeImpactRings++, dummy, visual.x, 0.055, visual.z, 0, ringPulse, ringPulse, ringPulse);
        const shadowSpread = (staggered ? 1.08 : 0.82) + bounce * 0.7;
        writeInstance(shadows, index, dummy, visual.x + 0.2, 0.005, visual.z - 0.15, 0, shadowSpread, 1, staggered ? 0.92 : 0.72);
        const spriteDirection = spriteDirectionRow(yawNow);
        const spriteFrame = spritePoseColumn(avatar.p, gait, visual.stridePhase);
        const spriteBatch = spriteBatches[spriteBatchIndex(index, spriteDirection, spriteFrame)];
        if (spriteBatch.mesh.count === 0) activeSpriteBatches.push(spriteBatch);
        const spriteSlot = spriteBatch.mesh.count;
        writeInstance(spriteBatch.mesh, spriteSlot, dummy, visual.x, 1.16 + bounce, visual.z, 0, 1, 1, 1, bodyTilt * 0.28, staggered ? Math.cos(clock * 19 + index) * 0.16 : accelerationLean * 0.2);
        spriteBatch.mesh.count = spriteSlot + 1;
        if (avatar.me) localVisual = visual;
      }
      impactRings.count = activeImpactRings;
      impactRings.instanceMatrix.needsUpdate = activeImpactRings > 0;
      shadows.instanceMatrix.needsUpdate = true;
      for (const batch of activeSpriteBatches) batch.mesh.instanceMatrix.needsUpdate = true;
      if (localVisual) {
        marker.position.set(localVisual.x, 2.68, localVisual.z);
        marker.visible = true;
      } else marker.visible = false;
      const impactAge = time - shakeAt;
      const shake = shakeAt && impactAge < 280 && !reduced ? Math.sin(impactAge * 0.095) * (1 - impactAge / 280) * shakeStrength : 0;
      camera.position.x = shake;
      camera.position.y = 17 + Math.abs(shake) * 0.34;
      camera.lookAt(shake, -shake * 0.22, 0);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      marker.material.dispose();
      markerTexture.dispose();
      groundTexture.dispose();
      shadowTexture.dispose();
      panorama.dispose();
      crowdAtlas.dispose();
      renderer.dispose();
    };
  }, [props.arena]);

  const qualityLabel = frameMetrics?.quality === "high" ? t("qualityHigh") : frameMetrics?.quality === "balanced" ? t("qualityBalanced") : t("qualityEfficient");
  const fpsBadge = showFps && frameMetrics && <output class="arena__fps" aria-live="off">{t("fpsStats", { ...frameMetrics, quality: qualityLabel })}</output>;
  if (!supported) return <div class={"arena arena--" + props.arena} role={showFps ? "group" : "img"} aria-label={props.label}>{props.fallback}{fpsBadge}</div>;
  return <div class={"arena arena--" + props.arena + " arena--3d"} role={showFps ? "group" : "img"} aria-label={props.label}>
    <canvas class="arena__canvas" ref={canvasRef} aria-hidden="true"></canvas>
    {fpsBadge}
  </div>;
}





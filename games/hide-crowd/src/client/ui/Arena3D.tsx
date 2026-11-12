import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { frameFloor, type FloorBox, type ScreenMargins } from "../camera";
import { pixelRatioForQuality, INITIAL_RENDER_QUALITY, observeRenderQuality, percentile95, type RenderQuality } from "../renderQuality";
import { ARENA, PLAYER_ACCELERATION, PLAYER_BRAKING, steerVelocity } from "../../engine";
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
  /** the floors, in daylight: lawn, the station's tiles, the courtyard's flagstones, and what lies on them */
  lawn: string;
  lawn2: string;
  lawnLight: string;
  tile: string;
  tile2: string;
  inlay: string;
  stone: string;
  stone2: string;
  petal: string;
  daisy: string;
  sea: string;
  /** the "you" marker: the game's gel, night-colored text */
  me: string;
  onMe: string;
  font: string;
}

const MAX_CHARACTERS = 26;
/** the rules' floor (100 x 58) in scene units: the same scale both ways, so a step looks as long across as it does deep */
const SCENE_PER_WORLD = 17.5 / ARENA.width;
const sceneX = (x: number) => (x - ARENA.width / 2) * SCENE_PER_WORLD;
const sceneZ = (y: number) => (y - ARENA.height / 2) * SCENE_PER_WORLD;
/** where anyone can stand (the rules keep everyone inside the margins), and how tall a person stands */
const FLOOR_BOX: FloorBox = {
  halfWidth: sceneX(ARENA.width - ARENA.marginX) + 0.95,
  near: sceneZ(ARENA.height - ARENA.marginY),
  far: sceneZ(ARENA.marginY),
  // (the top of the "you" marker over a head: the back row's has to be on screen too)
  height: 3.1
};
const MARKER_Y = 2.82;
/** the floor reaches past every edge of the screen (the camera sees about 12 units behind the crowd on a big screen) */
const GROUND_SIZE = { x: 48, z: 36, centerZ: -4 };
/** the seawall's stone edge, just beyond the set's railing; the sea lies past it */
const SEAWALL_Z = -7.85;
/** the courtyard's set sits this much further back, so the front row stands before the stage, not in it */
const SET_OFFSET_Z: Record<ArenaId, number> = { plaza: 0, metro: 0, gallery: -0.65 };
/** one repeat of the floor's pattern, in scene units */
const GROUND_TILE = 12;
/** the screen kept clear of the crowd: the top bar, the bottom edge, the sides */
const PHONE_MARGINS: ScreenMargins = { top: 0.12, bottom: 0.07, side: 0.02 };
const TV_MARGINS: ScreenMargins = { top: 0.15, bottom: 0.1, side: 0.04 };
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
    lawn: read("--arena-lawn", "#6aaf45"),
    lawn2: read("--arena-lawn-2", "#4f9135"),
    lawnLight: read("--arena-lawn-light", "#8fca5c"),
    tile: read("--arena-tile", "#d3c8b8"),
    tile2: read("--arena-tile-2", "#b9aa94"),
    inlay: read("--arena-inlay", "#b8694b"),
    stone: read("--arena-stone", "#d9c19c"),
    stone2: read("--arena-stone-2", "#c0a37a"),
    petal: read("--arena-petal", "#ee9fb6"),
    daisy: read("--arena-daisy", "#fbf4e2"),
    sea: read("--arena-sea", "#3b8db5"),
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

/** A fixed sequence of numbers between 0 and 1, so the floor is drawn the same on every screen. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const FLOOR_PX = 1024;

/**
 * The three floors, in daylight like the places in the pictures, drawn once on a canvas that repeats
 * every GROUND_TILE units: the seawall's mown lawn, the transit hall's stone tiles, the courtyard's
 * flagstones with a few blossom petals.
 */
function paintFloor(context: CanvasRenderingContext2D, arena: ArenaId, palette: Palette): void {
  const random = seeded(arena === "plaza" ? 11 : arena === "metro" ? 23 : 37);
  const size = FLOOR_PX;
  const mix = (a: string, b: string, amount: number) => "#" + new THREE.Color(a).lerp(new THREE.Color(b), amount).getHexString();
  const tint = (value: string, alpha: number) => {
    const color = new THREE.Color(value);
    return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
  };
  // a small mark drawn again across the edges it touches, so the floor repeats without a seam
  const wrapped = (x: number, y: number, reach: number, draw: (x: number, y: number) => void) => {
    const xs = x < reach ? [x, x + size] : x > size - reach ? [x, x - size] : [x];
    const ys = y < reach ? [y, y + size] : y > size - reach ? [y, y - size] : [y];
    for (const px of xs) for (const py of ys) draw(px, py);
  };

  if (arena === "plaza") {
    context.fillStyle = palette.lawn;
    context.fillRect(0, 0, size, size);
    // mown stripes, as a park's lawn has
    const stripe = size / 8;
    for (let band = 0; band < 8; band++) {
      context.fillStyle = band % 2 === 0 ? tint(palette.lawnLight, 0.32) : tint(palette.lawn2, 0.22);
      context.fillRect(band * stripe, 0, stripe, size);
    }
    // blades: short strokes, darker and lighter
    context.lineWidth = 1.4;
    context.lineCap = "round";
    for (let blade = 0; blade < 14_000; blade++) {
      const x = random() * size;
      const y = random() * size;
      const length = 3 + random() * 6;
      const lean = (random() - 0.5) * 0.9;
      context.strokeStyle = random() < 0.55 ? tint(palette.lawn2, 0.32 + random() * 0.3) : tint(palette.lawnLight, 0.24 + random() * 0.28);
      wrapped(x, y, 10, (px, py) => {
        context.beginPath();
        context.moveTo(px, py);
        context.lineTo(px + lean * length, py - length);
        context.stroke();
      });
    }
    // clover and daisies, here and there
    for (let flower = 0; flower < 90; flower++) {
      const x = random() * size;
      const y = random() * size;
      context.fillStyle = flower % 5 === 0 ? tint(palette.petal, 0.85) : tint(palette.daisy, 0.8);
      wrapped(x, y, 4, (px, py) => {
        context.beginPath();
        context.arc(px, py, 1.6 + random() * 1.2, 0, Math.PI * 2);
        context.fill();
      });
    }
    return;
  }

  if (arena === "metro") {
    // large stone tiles with thin grout, each a shade apart, flecked like terrazzo
    context.fillStyle = mix(palette.tile2, palette.bg, 0.22);
    context.fillRect(0, 0, size, size);
    const tiles = 8;
    const step = size / tiles;
    for (let row = 0; row < tiles; row++) {
      for (let column = 0; column < tiles; column++) {
        const x = column * step;
        const y = row * step;
        context.fillStyle = mix(palette.tile, palette.tile2, random() * 0.45);
        context.fillRect(x + 2, y + 2, step - 4, step - 4);
        for (let fleck = 0; fleck < 70; fleck++) {
          context.fillStyle = random() < 0.5 ? tint(palette.tile2, 0.5) : tint(palette.daisy, 0.45);
          context.fillRect(x + 4 + random() * (step - 10), y + 4 + random() * (step - 10), 1.5 + random() * 1.5, 1.5 + random() * 1.5);
        }
      }
    }
    // a terracotta inlay line every four tiles, as the station's floor has
    context.fillStyle = palette.inlay;
    for (const y of [0, size / 2]) {
      context.fillRect(0, y + step * 2 - 7, size, 14);
    }
    return;
  }

  // the courtyard: flagstones in rows, a few petals from the blossom trees
  context.fillStyle = mix(palette.stone2, palette.bg, 0.24);
  context.fillRect(0, 0, size, size);
  const rows = 8;
  const height = size / rows;
  for (let row = 0; row < rows; row++) {
    let x = random() * 96;
    const end = x + size;
    while (x < end) {
      const width = [96, 128, 160, 192][Math.floor(random() * 4)];
      const fill = mix(palette.stone, palette.stone2, random() * 0.55);
      const top = row * height;
      for (const offset of [0, -size]) {
        context.fillStyle = fill;
        context.fillRect(x + offset + 3, top + 3, Math.min(width, end - x) - 6, height - 6);
        context.fillStyle = tint(palette.daisy, 0.16);
        context.fillRect(x + offset + 3, top + 3, Math.min(width, end - x) - 6, 3);
      }
      x += width;
    }
  }
  for (let speck = 0; speck < 2_600; speck++) {
    context.fillStyle = random() < 0.5 ? tint(palette.stone2, 0.35) : tint(palette.daisy, 0.25);
    context.fillRect(random() * size, random() * size, 1.5, 1.5);
  }
  for (let petal = 0; petal < 46; petal++) {
    const x = random() * size;
    const y = random() * size;
    const turn = random() * Math.PI;
    context.fillStyle = tint(palette.petal, 0.85);
    wrapped(x, y, 8, (px, py) => {
      context.beginPath();
      context.ellipse(px, py, 4.5, 2.6, turn, 0, Math.PI * 2);
      context.fill();
    });
  }
}

function createGroundTexture(arena: ArenaId, palette: Palette, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = FLOOR_PX;
  canvas.height = FLOOR_PX;
  const context = canvas.getContext("2d");
  if (context) paintFloor(context, arena, palette);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, maxAnisotropy);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
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

/**
 * The floor everyone walks on. It stays when the Blender set arrives (the sets have no floor of their
 * own), and it reaches past every edge of the screen, so no part of the screen is left without one.
 */
function addGround(scene: THREE.Scene, arena: ArenaId, palette: Palette, maxAnisotropy: number): THREE.CanvasTexture {
  // (white: the floor's colors are the drawn ones)
  const groundMaterial = makeMaterial("#ffffff", arena === "metro" ? 0.62 : 0.95);
  const groundTexture = createGroundTexture(arena, palette, maxAnisotropy);
  groundTexture.repeat.set(GROUND_SIZE.x / GROUND_TILE, GROUND_SIZE.z / GROUND_TILE);
  groundMaterial.map = groundTexture;
  groundMaterial.bumpMap = groundTexture;
  groundMaterial.bumpScale = arena === "plaza" ? 0.004 : arena === "gallery" ? 0.02 : 0.012;
  groundMaterial.needsUpdate = true;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(GROUND_SIZE.x, 0.35, GROUND_SIZE.z), groundMaterial);
  ground.name = "floor";
  ground.position.set(0, -0.19, GROUND_SIZE.centerZ);
  scene.add(ground);
  return groundTexture;
}

/** A soft-edged patch (a canvas of white fading out at its rim), for the spotlight's pool of light. */
function createSoftRectTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    const fade = context.createLinearGradient(0, 0, 256, 0);
    fade.addColorStop(0, "rgba(255,255,255,0)");
    fade.addColorStop(0.3, "rgba(255,255,255,1)");
    fade.addColorStop(0.7, "rgba(255,255,255,1)");
    fade.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = fade;
    context.fillRect(0, 0, 256, 256);
    context.globalCompositeOperation = "destination-in";
    const down = context.createLinearGradient(0, 0, 0, 256);
    down.addColorStop(0, "rgba(255,255,255,0)");
    down.addColorStop(0.3, "rgba(255,255,255,1)");
    down.addColorStop(0.7, "rgba(255,255,255,1)");
    down.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = down;
    context.fillRect(0, 0, 256, 256);
  }
  return new THREE.CanvasTexture(canvas);
}

/** The moving walkway's belt: dark ridged rubber, drawn once and slid along as the walkway runs. */
function createBeltTexture(palette: Palette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#" + new THREE.Color(palette.surface2).lerp(new THREE.Color(palette.tile2), 0.18).getHexString();
    context.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 16) {
      context.fillStyle = palette.line;
      context.fillRect(x, 0, 5, 256);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** How far a walkway's belt has slid, so the frame loop can move it with the room's drift. */
interface RuleMarks {
  belt: THREE.CanvasTexture | null;
  /** scene units of the belt's pattern per repeat */
  beltRepeat: number;
  dispose: () => void;
}

/**
 * What each place's rule looks like, kept whichever set is showing: the transit hall's moving
 * walkways under the whole crowd (the room carries everyone along; they slide the same way), the
 * courtyard's spotlight where the rules make you faster, and the sea beyond the seawall's railing.
 */
function addRuleMarks(scene: THREE.Scene, arena: ArenaId, palette: Palette): RuleMarks {
  const owned: { dispose: () => void }[] = [];
  const keep = <T extends { dispose: () => void }>(value: T): T => {
    owned.push(value);
    return value;
  };
  const marks: RuleMarks = { belt: null, beltRepeat: 1, dispose: () => owned.forEach((value) => value.dispose()) };
  if (arena === "metro") {
    // four walkways side by side, edge to edge with the crowd's floor
    const lanes = 4;
    const depth = FLOOR_BOX.near - FLOOR_BOX.far + 0.6;
    const laneDepth = depth / lanes;
    const width = 2 * (FLOOR_BOX.halfWidth + 0.9);
    const belt = keep(createBeltTexture(palette));
    marks.belt = belt;
    marks.beltRepeat = 1.2;
    belt.repeat.set(width / marks.beltRepeat, 1);
    const beltMaterial = keep(new THREE.MeshStandardMaterial({ color: "#ffffff", map: belt, roughness: 0.7, metalness: 0.05 }));
    const railMaterial = keep(new THREE.MeshStandardMaterial({ color: palette.muted, roughness: 0.35, metalness: 0.6 }));
    const laneGeometry = keep(new THREE.PlaneGeometry(width, laneDepth - 0.16));
    const railGeometry = keep(new THREE.BoxGeometry(width + 0.3, 0.06, 0.14));
    for (let lane = 0; lane < lanes; lane++) {
      const z = FLOOR_BOX.far - 0.3 + laneDepth * (lane + 0.5);
      const mesh = new THREE.Mesh(laneGeometry, beltMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.012, z);
      scene.add(mesh);
      for (const edge of [-1, 1]) {
        const rail = new THREE.Mesh(railGeometry, railMaterial);
        rail.position.set(0, 0.03, z + edge * (laneDepth / 2 - 0.04));
        scene.add(rail);
      }
    }
  } else if (arena === "gallery") {
    // the rules' spotlight: 28 x 34 of the floor's 100 x 58, in the middle
    const glow = keep(createSoftRectTexture());
    const pool = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(28 * SCENE_PER_WORLD + 2.2, 34 * SCENE_PER_WORLD + 2.2)),
      keep(new THREE.MeshBasicMaterial({ color: palette.warn, alphaMap: glow, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.02;
    scene.add(pool);
  } else {
    // the sea beyond the railing, and the seawall's stone edge
    const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(GROUND_SIZE.x, 16)), keep(new THREE.MeshStandardMaterial({ color: palette.sea, roughness: 0.28, metalness: 0.1 })));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, 0.03, SEAWALL_Z - 8.15);
    scene.add(sea);
    const edge = new THREE.Mesh(keep(new THREE.BoxGeometry(GROUND_SIZE.x, 0.2, 0.42)), keep(new THREE.MeshStandardMaterial({ color: palette.tile, roughness: 0.9 })));
    edge.position.set(0, 0.06, SEAWALL_Z);
    scene.add(edge);
  }
  return marks;
}

function addVenue(scene: THREE.Scene, arena: ArenaId, palette: Palette): void {
  const detail = makeMaterial(palette.surface2, 0.86, "surface2");
  const accent = makeMaterial(palette.accent, 0.78, "accent");
  const muted = makeMaterial(palette.muted, 0.86, "muted");
  const warm = makeMaterial(palette.warn, 0.75, "warn");
  const trim = makeMaterial(palette.line, 0.86, "line");
  const grass = makeMaterial(palette.foliage, 1, "foliage");
  const water = makeMaterial(palette.sky, 0.52, "sky");
  const wood = makeMaterial(palette.land, 0.9, "land");
  const dark = makeMaterial(darkTint(palette), 0.9);

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
    return;
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
    // (the walkways are the rule's marks: addRuleMarks)
    for (const x of [-7.6, -5.2, 5.2, 7.6]) {
      makeBox(scene, [1.1, 0.56, 1.6], [x, 0.3, 0], detail);
      makeBox(scene, [1.12, 0.1, 1.66], [x, 0.62, 0], accent);
    }
    for (const x of [-6, -2, 2, 6]) makeBox(scene, [0.85, 0.06, 0.52], [x, 3.48, -5.22], warm);
    return;
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
  // (the spotlight is the rule's mark: addRuleMarks)
  for (const z of [5.05, 5.7]) {
    for (let x = -7.8; x <= 7.8; x += 2.6) {
      makeBox(scene, [1.6, 0.48, 0.46], [x, 0.25, z], dark);
      makeBox(scene, [1.64, 0.08, 0.5], [x, 0.5, z], accent);
    }
  }
  return;
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
    scene.fog = new THREE.Fog(palette.bg, 42, 80);
    let disposed = false;
    const crowdAtlas = new THREE.TextureLoader().load(CROWD_ATLAS);
    crowdAtlas.colorSpace = THREE.SRGBColorSpace;
    crowdAtlas.generateMipmaps = true;
    crowdAtlas.minFilter = THREE.LinearMipmapLinearFilter;
    crowdAtlas.magFilter = THREE.LinearFilter;
    crowdAtlas.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());
    const camera = new THREE.PerspectiveCamera(24, 1, 0.5, 120);
    const eye = new THREE.Vector3(0, 19, 15);
    const look = new THREE.Vector3(0, 0, -1);
    camera.position.copy(eye);
    camera.lookAt(look);
    const ambient = new THREE.HemisphereLight(lightTint(palette), palette.bg, 2.6);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(lightTint(palette), 3.1);
    key.position.set(-7, 16, 10);
    scene.add(key);
    const fill = new THREE.DirectionalLight(lightTint(palette), 0.72);
    fill.position.set(8, 9, -11);
    scene.add(fill);

    const groundTexture = addGround(scene, props.arena, palette, renderer.capabilities.getMaxAnisotropy());
    const ruleMarks = addRuleMarks(scene, props.arena, palette);
    const environmentStart = new Set(scene.children);
    addVenue(scene, props.arena, palette);
    addEnvironmentalLandmarks(scene, props.arena, palette);
    const fallbackVenue = new THREE.Group();
    fallbackVenue.name = "procedural venue fallback";
    for (const object of [...scene.children]) {
      if (!environmentStart.has(object)) {
        scene.remove(object);
        fallbackVenue.add(object);
      }
    }
    fallbackVenue.position.z = SET_OFFSET_Z[props.arena];
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
      loadedVenue.position.z += SET_OFFSET_Z[props.arena];
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
    // big enough to find at a glance on a phone held sideways
    marker.scale.set(2.4, 0.6, 1);
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
      // the whole floor as big as the screen allows, clear of the bars over it
      const framing = frameFloor(camera.aspect, FLOOR_BOX, document.documentElement.classList.contains("is-tv") ? TV_MARGINS : PHONE_MARGINS);
      camera.fov = framing.fov;
      eye.set(...framing.position);
      look.set(...framing.target);
      camera.position.copy(eye);
      camera.lookAt(look);
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
      if (ruleMarks.belt) ruleMarks.belt.offset.x -= (drift.current.x * SCENE_PER_WORLD * delta) / 1000 / ruleMarks.beltRepeat;
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
        worldX = Math.max(ARENA.marginX, Math.min(ARENA.width - ARENA.marginX, worldX));
        worldY = Math.max(ARENA.marginY, Math.min(ARENA.height - ARENA.marginY, worldY));
        const targetX = sceneX(worldX);
        const targetZ = sceneZ(worldY);
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
        marker.position.set(localVisual.x, MARKER_Y, localVisual.z);
        marker.visible = true;
      } else marker.visible = false;
      const impactAge = time - shakeAt;
      const shake = shakeAt && impactAge < 280 && !reduced ? Math.sin(impactAge * 0.095) * (1 - impactAge / 280) * shakeStrength : 0;
      camera.position.set(eye.x + shake, eye.y + Math.abs(shake) * 0.34, eye.z);
      camera.lookAt(look.x + shake, look.y - shake * 0.22, look.z);
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
      ruleMarks.dispose();
      shadowTexture.dispose();
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





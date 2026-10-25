import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import * as THREE from "three";
import { PLAYER_SPEED } from "../../engine";
import type { ArenaId, Pose } from "../../engine";
import type { AvatarView } from "../../room/protocol";
import { t } from "../i18n";

interface Props {
  avatars: AvatarView[];
  arena: ArenaId;
  localVector: { x: number; y: number };
  receivedAt: number;
  impactId: number;
  impactType: "tag" | "foul" | "swing" | "over";
  label: string;
  youLabel: string;
  fallback: ComponentChildren;
}

interface Visual { x: number; z: number; facing: number }
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
  me: string;
  onAccent: string;
  font: string;
}

const MAX_CHARACTERS = 20;

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return {
    bg: read("--bg"),
    sky: read("--map-sea"),
    land: read("--map-land"),
    foliage: read("--house"),
    surface: read("--surface"),
    surface2: read("--surface-2"),
    ink: read("--ink"),
    muted: read("--muted"),
    line: read("--line"),
    accent: read("--accent"),
    warn: read("--warn"),
    danger: read("--danger"),
    me: read("--me"),
    onAccent: read("--on-accent"),
    font: read("--font")
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

function addVenue(scene: THREE.Scene, arena: ArenaId, palette: Palette): void {
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
  const groundMaterial = arena === "plaza" ? grass : arena === "gallery" ? wood : floor;
  const ground = new THREE.Mesh(new THREE.BoxGeometry(20, 0.35, 12), groundMaterial);
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
}
function writeInstance(mesh: THREE.InstancedMesh, index: number, dummy: THREE.Object3D, position: THREE.Vector3, yaw: number, scale: THREE.Vector3, tilt = 0, roll = 0): void {
  dummy.position.copy(position);
  dummy.rotation.set(tilt, yaw, roll, "YXZ");
  dummy.scale.copy(scale);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

export function Arena3D(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targets = useRef(props.avatars);
  const vector = useRef(props.localVector);
  const receivedAt = useRef(props.receivedAt);
  const impact = useRef(props.impactId);
  const impactType = useRef(props.impactType);
  const youLabel = useRef(props.youLabel);
  const [supported, setSupported] = useState(true);
  const [frameMetrics, setFrameMetrics] = useState<{ fps: number; avg: number; slow: number } | null>(null);
  const showFps = new URLSearchParams(window.location.search).get("fps") === "1";
  targets.current = props.avatars;
  vector.current = props.localVector;
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = false;

    let palette = readPalette();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.bg);
    scene.fog = new THREE.Fog(palette.bg, 29, 48);
    const camera = new THREE.OrthographicCamera(-11.25, 11.25, 6, -6, 0.1, 60);
    camera.position.set(0, 11, 23);
    camera.lookAt(0, 0, 0);
    const ambient = new THREE.HemisphereLight(lightTint(palette), palette.bg, 2.6);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(lightTint(palette), 3.1);
    key.position.set(-7, 16, 10);
    scene.add(key);

    addVenue(scene, props.arena, palette);
    const bodyGeometry = new THREE.SphereGeometry(0.34, 14, 12);
    const headGeometry = new THREE.SphereGeometry(0.305, 18, 14);
    const neckGeometry = new THREE.CylinderGeometry(0.1, 0.12, 0.18, 8);
    const eyeGeometry = new THREE.SphereGeometry(0.095, 11, 9);
    const pupilGeometry = new THREE.SphereGeometry(0.044, 9, 7);
    const mouthGeometry = new THREE.SphereGeometry(0.07, 10, 8);
    const impactRingGeometry = new THREE.RingGeometry(0.42, 0.51, 24);
    impactRingGeometry.rotateX(-Math.PI / 2);
    const capGeometry = new THREE.SphereGeometry(0.26, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2);
    const shirtGeometry = new THREE.CylinderGeometry(0.29, 0.39, 0.68, 10);
    const shoulderGeometry = new THREE.SphereGeometry(0.16, 9, 7);
    const handGeometry = new THREE.SphereGeometry(0.125, 9, 7);
    const backpackGeometry = new THREE.BoxGeometry(0.36, 0.42, 0.2);
    const badgeGeometry = new THREE.BoxGeometry(0.15, 0.16, 0.045);
    const armGeometry = new THREE.CylinderGeometry(0.105, 0.135, 0.52, 8);
    const legGeometry = new THREE.CylinderGeometry(0.11, 0.125, 0.49, 8);
    const shoeGeometry = new THREE.SphereGeometry(0.14, 10, 8);
    const shadowGeometry = new THREE.CircleGeometry(0.34, 16);
    shadowGeometry.rotateX(-Math.PI / 2);
    const bodyMat = makeMaterial(lightTint(palette), 0.66);
    const headMat = makeMaterial(lightTint(palette), 0.42);
    const limbMat = makeMaterial(lightTint(palette), 0.72);
    const neckMat = makeMaterial(palette.surface2, 0.72, "surface2");
    const eyeMat = makeMaterial(lightTint(palette), 0.38);
    const pupilMat = makeMaterial(darkTint(palette), 0.42);
    const mouthMat = makeMaterial(darkTint(palette), 0.54);
    const impactRingMat = Object.assign(new THREE.MeshBasicMaterial({ color: palette.warn, transparent: true, opacity: 0.82, depthWrite: false }), { userData: { paletteToken: "warn" } });
    const capMat = makeMaterial(lightTint(palette), 0.62);
    const shirtMat = makeMaterial(lightTint(palette), 0.74);
    const handMat = makeMaterial(lightTint(palette), 0.62);
    const backpackMat = makeMaterial(palette.surface2, 0.8, "surface2");
    const badgeMat = makeMaterial(palette.onAccent, 0.52, "onAccent");
    const legMat = makeMaterial(palette.ink, 0.82, "ink");
    const shoeMat = makeMaterial(palette.danger, 0.58, "danger");
    const shadowMat = Object.assign(new THREE.MeshBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.16, depthWrite: false }), { userData: { paletteToken: "ink" } });
    const body = new THREE.InstancedMesh(bodyGeometry, bodyMat, MAX_CHARACTERS);
    const head = new THREE.InstancedMesh(headGeometry, headMat, MAX_CHARACTERS);
    const neck = new THREE.InstancedMesh(neckGeometry, neckMat, MAX_CHARACTERS);
    const shirts = new THREE.InstancedMesh(shirtGeometry, shirtMat, MAX_CHARACTERS);
    const eyes = new THREE.InstancedMesh(eyeGeometry, eyeMat, MAX_CHARACTERS * 2);
    const pupils = new THREE.InstancedMesh(pupilGeometry, pupilMat, MAX_CHARACTERS * 2);
    const mouths = new THREE.InstancedMesh(mouthGeometry, mouthMat, MAX_CHARACTERS);
    const impactRings = new THREE.InstancedMesh(impactRingGeometry, impactRingMat, MAX_CHARACTERS);
    const caps = new THREE.InstancedMesh(capGeometry, capMat, MAX_CHARACTERS);
    const shoulders = new THREE.InstancedMesh(shoulderGeometry, shirtMat, MAX_CHARACTERS * 2);
    const hands = new THREE.InstancedMesh(handGeometry, handMat, MAX_CHARACTERS * 2);
    const backpacks = new THREE.InstancedMesh(backpackGeometry, backpackMat, MAX_CHARACTERS);
    const badges = new THREE.InstancedMesh(badgeGeometry, badgeMat, MAX_CHARACTERS);
    const arms = new THREE.InstancedMesh(armGeometry, limbMat, MAX_CHARACTERS * 2);
    const legs = new THREE.InstancedMesh(legGeometry, legMat, MAX_CHARACTERS * 2);
    const shoes = new THREE.InstancedMesh(shoeGeometry, shoeMat, MAX_CHARACTERS * 2);
    const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMat, MAX_CHARACTERS);
    shadows.position.y = 0.025;
    for (const mesh of [body, head, neck, shirts, eyes, pupils, mouths, impactRings, caps, shoulders, hands, backpacks, badges, arms, legs, shoes, shadows]) {
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
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
      markerContext.fillStyle = palette.accent;
      markerContext.fillRect(10, 14, 492, 100);
      markerContext.strokeStyle = palette.ink;
      markerContext.lineWidth = 8;
      markerContext.strokeRect(10, 14, 492, 100);
      markerContext.fillStyle = palette.onAccent;
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
    const tones = [palette.accent, palette.warn, palette.danger, palette.muted, palette.me, palette.surface2, palette.onAccent];
    const applyTones = () => {
      const headTones = [palette.surface, palette.surface2, palette.muted, palette.warn];
      const capTones = [palette.warn, palette.accent, palette.danger, palette.muted, palette.me];
      for (let index = 0; index < MAX_CHARACTERS; index++) {
        const color = new THREE.Color(tones[index % tones.length]);
        body.setColorAt(index, color);
        shirts.setColorAt(index, new THREE.Color(tones[(index + 1) % tones.length]));
        arms.setColorAt(index * 2, color);
        arms.setColorAt(index * 2 + 1, color);
        shoulders.setColorAt(index * 2, new THREE.Color(tones[(index + 1) % tones.length]));
        shoulders.setColorAt(index * 2 + 1, new THREE.Color(tones[(index + 1) % tones.length]));
        hands.setColorAt(index * 2, new THREE.Color(palette.surface));
        hands.setColorAt(index * 2 + 1, new THREE.Color(palette.surface));
        head.setColorAt(index, new THREE.Color(headTones[index % headTones.length]));
        caps.setColorAt(index, new THREE.Color(capTones[index % capTones.length]));
        backpacks.setColorAt(index, new THREE.Color(tones[(index + 3) % tones.length]));
        legs.setColorAt(index * 2, new THREE.Color(index % 2 === 0 ? palette.ink : palette.surface2));
        legs.setColorAt(index * 2 + 1, new THREE.Color(index % 2 === 0 ? palette.ink : palette.surface2));
        badges.setColorAt(index, new THREE.Color(index % 2 === 0 ? palette.onAccent : palette.surface));
        const shoeColor = new THREE.Color(index % 3 === 0 ? palette.danger : palette.ink);
        shoes.setColorAt(index * 2, shoeColor);
        shoes.setColorAt(index * 2 + 1, shoeColor);
      }
      for (const mesh of [body, shirts, head, caps, shoulders, hands, backpacks, badges, arms, legs, shoes]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    applyTones();
    const updatePalette = () => {
      const next = readPalette();
      if (JSON.stringify(next) === JSON.stringify(palette)) return;
      palette = next;
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          const token = material.userData.paletteToken as keyof Palette | undefined;
          if (token && "color" in material) (material as THREE.MeshStandardMaterial).color.set(palette[token]);
        }
      });
      scene.background = new THREE.Color(palette.bg);
      if (scene.fog) scene.fog.color.set(palette.bg);
      bodyMat.color.set(lightTint(palette));
      shirtMat.color.set(lightTint(palette));
      handMat.color.set(lightTint(palette));
      backpackMat.color.set(palette.surface2);
      headMat.color.set(lightTint(palette));
      limbMat.color.set(lightTint(palette));
      neckMat.color.set(palette.surface2);
      eyeMat.color.set(lightTint(palette));
      pupilMat.color.set(darkTint(palette));
      mouthMat.color.set(darkTint(palette));
      capMat.color.set(lightTint(palette));
      badgeMat.color.set(palette.onAccent);
      legMat.color.set(palette.ink);
      shoeMat.color.set(palette.danger);
      shadowMat.color.set(palette.ink);
      ambient.color.set(lightTint(palette));
      ambient.groundColor.set(palette.bg);
      key.color.set(lightTint(palette));
      paintMarker();
      tones.splice(0, tones.length, palette.accent, palette.warn, palette.danger, palette.muted, palette.me, palette.surface2, palette.onAccent);
      applyTones();
    };
    const themeObserver = new MutationObserver(updatePalette);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    colorScheme.addEventListener("change", updatePalette);

    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height, false);
      const viewWidth = 22.5;
      const viewHeight = Math.max(5.8, viewWidth * height / width);
      camera.left = -viewWidth / 2;
      camera.right = viewWidth / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
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
    let lastPaletteCheck = 0;
    let shakeAt = 0;
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
        return;
      }
      const frameMs = previous ? time - previous : 16;
      const delta = Math.min(50, frameMs);
      previous = time;
      if (showFps) {
        if (fpsStartedAt === 0) fpsStartedAt = time;
        fpsSamples++;
        fpsTotalMs += frameMs;
        fpsSlowestMs = Math.max(fpsSlowestMs, frameMs);
        const elapsed = time - fpsStartedAt;
        if (elapsed >= 1_000 && fpsSamples > 0) {
          setFrameMetrics({
            fps: Math.round(fpsSamples * 1_000 / elapsed),
            avg: Math.round(fpsTotalMs / fpsSamples * 10) / 10,
            slow: Math.round(fpsSlowestMs * 10) / 10
          });
          fpsStartedAt = time;
          fpsSamples = 0;
          fpsTotalMs = 0;
          fpsSlowestMs = 0;
        }
      }
      if (time - lastPaletteCheck > 1_000) { lastPaletteCheck = time; updatePalette(); }
      if (impact.current !== lastImpact && impactType.current === "tag") { shakeAt = time; lastImpact = impact.current; }
      if (paintedLabel !== youLabel.current) { paintedLabel = youLabel.current; paintMarker(); }
      const reduced = document.documentElement.dataset.reduced === "1" || (document.documentElement.dataset.reduced !== "0" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const ease = reduced ? 1 : 1 - Math.exp(-delta / 46);
      const snapshot = targets.current.slice(0, MAX_CHARACTERS);
      body.count = snapshot.length;
      head.count = snapshot.length;
      neck.count = snapshot.length;
      shirts.count = snapshot.length;
      shoulders.count = snapshot.length * 2;
      hands.count = snapshot.length * 2;
      backpacks.count = snapshot.length;
      eyes.count = snapshot.length * 2;
      pupils.count = snapshot.length * 2;
      mouths.count = snapshot.length;
      impactRings.count = snapshot.length;
      caps.count = snapshot.length;
      badges.count = snapshot.length;
      shadows.count = snapshot.length;
      arms.count = snapshot.length * 2;
      legs.count = snapshot.length * 2;
      shoes.count = snapshot.length * 2;
      const input = vector.current;
      const prediction = Math.min(125, Math.max(0, Date.now() - receivedAt.current));
      const clock = reduced ? 0 : time / 1000;
      let local: AvatarView | undefined;
      for (let index = 0; index < snapshot.length; index++) {
        const avatar = snapshot[index];
        if (avatar.isMine) local = avatar;
        let worldX = avatar.x;
        let worldY = avatar.y;
        if (avatar.isMine && prediction > 0) {
          worldX += input.x * PLAYER_SPEED * prediction / 1000;
          worldY += input.y * PLAYER_SPEED * prediction / 1000;
        }
        worldX = Math.max(5, Math.min(95, worldX));
        worldY = Math.max(6, Math.min(52, worldY));
        const targetX = (worldX / 100 - 0.5) * 17.5;
        const targetZ = (worldY / 58 - 0.5) * 9.1;
        const visual = visuals[index] ?? (visuals[index] = { x: targetX, z: targetZ, facing: avatar.facing });
        visual.x += (targetX - visual.x) * ease;
        visual.z += (targetZ - visual.z) * ease;
        const yaw = Math.PI / 2 - avatar.facing;
        visual.facing += (yaw - visual.facing) * ease;
        const phase = clock * 8.2 + index * 1.71;
        const walking = avatar.pose === "walk";
        const staggered = avatar.pose === "stunned";
        const swinging = avatar.pose === "punch" || avatar.pose === "windup";
        const stride = walking ? Math.sin(phase) * 0.46 : 0;
        const recoil = staggered ? Math.sin(clock * 27 + index) * 0.48 : 0;
        const tumble = staggered && !reduced ? Math.sin(clock * 19 + index) * 0.64 : 0;
        const bounce = walking ? Math.abs(Math.sin(phase)) * 0.055 : reduced ? 0 : Math.sin(clock * 2.4 + index) * 0.018;
        const yawNow = visual.facing;
        const bodyTilt = staggered ? tumble : recoil + (swinging ? -0.22 : 0);
        const center = new THREE.Vector3(visual.x, (staggered ? 0.9 : 0.96) + bounce, visual.z);
        writeInstance(body, index, dummy, center, yawNow, new THREE.Vector3(0.84, staggered ? 1.2 : 1.32, 0.74), bodyTilt, staggered ? Math.cos(clock * 19 + index) * 0.26 : 0);
      writeInstance(shirts, index, dummy, new THREE.Vector3(visual.x, 1.02 + bounce, visual.z), yawNow, new THREE.Vector3(0.94, staggered ? 1.12 : 1, 0.92), bodyTilt * 0.82, staggered ? Math.cos(clock * 19 + index) * 0.18 : 0);
        const headTurn = avatar.pose === "glance" && !reduced ? Math.sin(clock * 5 + index) * 0.22 : 0;
        const headPosition = new THREE.Vector3(visual.x, 1.78 + bounce, visual.z);
        const headYaw = yawNow + headTurn;
        writeInstance(head, index, dummy, headPosition, headYaw, new THREE.Vector3(1, 1.04, 0.92), staggered ? tumble * 0.72 : recoil * 0.4, staggered ? Math.cos(clock * 19 + index) * 0.4 : 0);
        writeInstance(neck, index, dummy, new THREE.Vector3(visual.x, 1.51 + bounce, visual.z), yawNow, new THREE.Vector3(1, 1, 1), bodyTilt * 0.22);
        const forwardX = Math.sin(headYaw);
        const forwardZ = Math.cos(headYaw);
        const sideX = Math.cos(headYaw);
        const sideZ = -Math.sin(headYaw);
        const blinkPhase = (clock * 1.25 + index * 0.83) % 5;
        const blinkScale = !reduced && blinkPhase > 4.84 ? 0.14 : 1;
        for (let eyeSide = 0; eyeSide < 2; eyeSide++) {
          const side = eyeSide === 0 ? -1 : 1;
          const eyePosition = new THREE.Vector3(visual.x + forwardX * 0.264 + sideX * side * 0.105, 1.84 + bounce, visual.z + forwardZ * 0.264 + sideZ * side * 0.105);
          const pupilPosition = new THREE.Vector3(visual.x + forwardX * 0.337 + sideX * side * 0.105, 1.84 + bounce, visual.z + forwardZ * 0.337 + sideZ * side * 0.105);
          writeInstance(eyes, index * 2 + eyeSide, dummy, eyePosition, headYaw, new THREE.Vector3(1, blinkScale, 1), recoil * 0.3);
          writeInstance(pupils, index * 2 + eyeSide, dummy, pupilPosition, headYaw, new THREE.Vector3(1, blinkScale * 0.82, 1), recoil * 0.3);
        }
        const mouthPosition = new THREE.Vector3(visual.x + forwardX * 0.286, 1.68 + bounce, visual.z + forwardZ * 0.286);
        writeInstance(mouths, index, dummy, mouthPosition, headYaw, new THREE.Vector3(0.82, 0.48, 0.34), recoil * 0.3);
        const ringPulse = staggered && !reduced ? 1 + Math.abs(Math.sin(clock * 12 + index)) * 0.55 : 0;
        writeInstance(impactRings, index, dummy, new THREE.Vector3(visual.x, 0.055, visual.z), 0, new THREE.Vector3(ringPulse, ringPulse, ringPulse));
        const wearingCap = index % 3 === 0 || index % 7 === 0;
        writeInstance(caps, index, dummy, new THREE.Vector3(visual.x, 2.03 + bounce, visual.z), yawNow, new THREE.Vector3(wearingCap ? 1 : 0, wearingCap ? 1 : 0, wearingCap ? 1 : 0));
        const wearingPack = index % 4 === 0 || index % 7 === 2;
        writeInstance(backpacks, index, dummy, new THREE.Vector3(visual.x - forwardX * 0.31, 1.02 + bounce, visual.z - forwardZ * 0.31), yawNow, new THREE.Vector3(wearingPack ? 1 : 0, wearingPack ? 1 : 0, wearingPack ? 1 : 0), bodyTilt * 0.4);
        const badgePosition = new THREE.Vector3(visual.x + Math.sin(yawNow) * 0.31, 1.02 + bounce, visual.z + Math.cos(yawNow) * 0.31);
        writeInstance(badges, index, dummy, badgePosition, yawNow, new THREE.Vector3(index % 4 === 0 ? 1.15 : 0.72, 1, 1), bodyTilt * 0.35);
        writeInstance(shadows, index, dummy, new THREE.Vector3(visual.x, 0.03, visual.z), 0, new THREE.Vector3(staggered ? 1.28 : 1, 1, staggered ? 0.72 : 0.8));
        for (let side = 0; side < 2; side++) {
          const sign = side === 0 ? -1 : 1;
          const armSwing = stride * (side === 0 ? -1 : 1) + (swinging && side === 1 ? -1.16 : 0) + recoil * sign;
          const legSwing = stride * (side === 0 ? 1 : -1) + recoil * sign;
          const localX = sign * 0.32;
          const rotatedX = visual.x + localX * Math.cos(yawNow);
          const rotatedZ = visual.z - localX * Math.sin(yawNow);
          const armPos = new THREE.Vector3(rotatedX, 1.14 + bounce, rotatedZ);
          const legPos = new THREE.Vector3(visual.x + sign * 0.14 * Math.cos(yawNow), 0.43, visual.z - sign * 0.14 * Math.sin(yawNow));
          const shoePos = new THREE.Vector3(legPos.x + Math.sin(yawNow) * 0.12, 0.18, legPos.z + Math.cos(yawNow) * 0.12);
          const shoulderPos = new THREE.Vector3(rotatedX, 1.36 + bounce, rotatedZ);
          const handPos = new THREE.Vector3(rotatedX + Math.sin(yawNow) * armSwing * 0.08, 0.87 + bounce, rotatedZ + Math.cos(yawNow) * armSwing * 0.08);
          writeInstance(shoulders, index * 2 + side, dummy, shoulderPos, yawNow, new THREE.Vector3(1, 1, 1), bodyTilt * 0.3);
          writeInstance(arms, index * 2 + side, dummy, armPos, yawNow, new THREE.Vector3(1, 0.96, 1), armSwing);
          writeInstance(hands, index * 2 + side, dummy, handPos, yawNow, new THREE.Vector3(1, 0.96, 1), armSwing);
          writeInstance(legs, index * 2 + side, dummy, legPos, yawNow, new THREE.Vector3(0.82, 0.92, 0.82), legSwing);
          writeInstance(shoes, index * 2 + side, dummy, shoePos, yawNow, new THREE.Vector3(1.05, 0.56, 1.5), 0);
        }
      }
      for (const mesh of [body, head, neck, shirts, eyes, pupils, mouths, impactRings, caps, shoulders, hands, backpacks, badges, arms, legs, shoes, shadows]) mesh.instanceMatrix.needsUpdate = true;
      if (local) {
        const localVisual = visuals[snapshot.indexOf(local)];
        marker.position.set(localVisual.x, 2.68, localVisual.z);
        marker.visible = true;
      } else marker.visible = false;
      const shake = shakeAt && time - shakeAt < 280 && !reduced ? Math.sin((time - shakeAt) * 0.095) * (1 - (time - shakeAt) / 280) * 0.28 : 0;
      camera.position.x = shake;
      camera.lookAt(shake, 0, 0);
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      themeObserver.disconnect();
      colorScheme.removeEventListener("change", updatePalette);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
      marker.material.dispose();
      markerTexture.dispose();
      renderer.dispose();
    };
  }, [props.arena]);

  const fpsBadge = showFps && frameMetrics && <output class="arena__fps" aria-live="off">{t("fpsStats", frameMetrics)}</output>;
  if (!supported) return <div class={"arena arena--" + props.arena} role={showFps ? "group" : "img"} aria-label={props.label}>{props.fallback}{fpsBadge}</div>;
  return <div class={"arena arena--" + props.arena + " arena--3d"} role={showFps ? "group" : "img"} aria-label={props.label}>
    <canvas class="arena__canvas" ref={canvasRef} aria-hidden="true"></canvas>
    {fpsBadge}
  </div>;
}


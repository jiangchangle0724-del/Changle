import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import * as THREE from "three";
import { PLAYER_SPEED } from "../../engine";
import type { ArenaId, Pose } from "../../engine";
import type { AvatarView } from "../../room/protocol";

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
  const floor = makeMaterial(palette.surface, 0.82, "surface");
  const detail = makeMaterial(palette.surface2, 0.82, "surface2");
  const accent = makeMaterial(palette.accent, 0.82, "accent");
  const muted = makeMaterial(palette.muted, 0.82, "muted");
  const warm = makeMaterial(palette.warn, 0.82, "warn");
  const trim = makeMaterial(palette.line, 0.82, "line");
  const ground = new THREE.Mesh(new THREE.BoxGeometry(20, 0.35, 12), floor);
  ground.position.y = -0.19;
  scene.add(ground);
  const rail = 0.055;
  makeBox(scene, [18, 0.025, rail], [0, 0.012, -4.9], muted);
  makeBox(scene, [18, 0.025, rail], [0, 0.012, 4.9], muted);
  makeBox(scene, [rail, 0.025, 9.8], [-9, 0.012, 0], muted);
  makeBox(scene, [rail, 0.025, 9.8], [9, 0.012, 0], muted);
  makeBox(scene, [0.035, 0.02, 9.8], [0, 0.015, 0], detail);
  for (let x = -8; x <= 8; x += 4) makeBox(scene, [0.018, 0.012, 9.6], [x, 0.013, 0], detail);
  for (let z = -4; z <= 4; z += 2) makeBox(scene, [17.8, 0.012, 0.018], [0, 0.013, z], detail);

  // An open stage frame adds depth while leaving the whole crowd visible.
  makeBox(scene, [18.4, 0.12, 0.18], [0, 2.95, -5.48], accent);
  makeBox(scene, [18.4, 0.09, 0.18], [0, 0.16, -5.48], trim);
  for (const x of [-8.7, -4.35, 0, 4.35, 8.7]) {
    makeBox(scene, [0.12, 2.72, 0.16], [x, 1.52, -5.48], detail);
    makeBox(scene, [0.2, 0.12, 0.24], [x, 2.92, -5.48], warm);
  }

  const center = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.28, 36), makeMaterial(palette.line, 0.82, "line"));
  center.rotation.x = -Math.PI / 2;
  center.position.y = 0.02;
  scene.add(center);
  for (const side of [-1, 1]) {
    const circle = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.52, 36), makeMaterial(palette.line, 0.82, "line"));
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(side * 6.7, 0.02, 0);
    scene.add(circle);
  }

  if (arena === "metro") {
    makeBox(scene, [17.5, 0.22, 0.34], [0, 3.38, -4.95], detail);
    makeBox(scene, [8.4, 0.48, 0.15], [0, 3.03, -5.34], warm);
    for (const x of [-6.2, -3.1, 3.1, 6.2]) {
      makeBox(scene, [0.22, 3.2, 0.3], [x, 1.65, -4.72], muted);
      makeBox(scene, [0.52, 0.12, 0.42], [x, 3.25, -4.72], accent);
    }
    for (const z of [-2.85, 2.85]) {
      makeBox(scene, [17.5, 0.06, 0.84], [0, 0.05, z], detail);
      for (let x = -8; x <= 8; x += 1.3) {
        makeBox(scene, [0.075, 0.025, 0.86], [x, 0.09, z], accent);
      }
      for (let x = -8; x <= 8; x += 2.6) {
        makeBox(scene, [0.025, 0.012, 0.68], [x + 0.06, 0.105, z], warm);
      }
    }
    for (const x of [-7.9, 7.9]) {
      makeBox(scene, [1.1, 0.54, 2.0], [x, 0.31, 0], detail);
      makeBox(scene, [1.12, 0.08, 2.02], [x, 0.61, 0], warm);
    }
    for (const z of [-4.2, 4.2]) {
      makeBox(scene, [0.62, 1.1, 0.48], [0, 0.55, z], accent);
      makeBox(scene, [0.72, 0.08, 0.58], [0, 1.12, z], warm);
    }
  } else if (arena === "gallery") {
    for (const x of [-6.4, -2.15, 2.15, 6.4]) {
      makeBox(scene, [2.2, 1.52, 0.12], [x, 1.68, -5.37], detail);
      makeBox(scene, [2.32, 0.09, 0.18], [x, 2.5, -5.31], accent);
      makeBox(scene, [2.32, 0.09, 0.18], [x, 0.86, -5.31], warm);
      makeBox(scene, [0.09, 1.72, 0.18], [x - 1.15, 1.68, -5.31], muted);
      makeBox(scene, [0.09, 1.72, 0.18], [x + 1.15, 1.68, -5.31], muted);
      const art = new THREE.Mesh(new THREE.IcosahedronGeometry(0.48 + (Math.abs(x) % 3) * 0.08, 1), x < 0 ? warm : accent);
      art.position.set(x, 1.66, -5.18);
      art.scale.set(1, 1.18, 0.32);
      scene.add(art);
    }
    for (const x of [-8.2, -5.4, 5.4, 8.2]) {
      for (const z of [-4.2, 4.2]) {
        makeCylinder(scene, 0.24, 2.45, [x, 1.22, z], detail, 10);
        makeCylinder(scene, 0.39, 0.14, [x, 0.12, z], accent, 10);
        makeCylinder(scene, 0.32, 0.12, [x, 2.46, z], warm, 10);
      }
    }
    const spotlight = new THREE.Mesh(new THREE.CircleGeometry(2.5, 40), Object.assign(new THREE.MeshBasicMaterial({ color: palette.warn, transparent: true, opacity: 0.15, depthWrite: false, userData: { paletteToken: "warn" } }), { userData: { paletteToken: "warn" } }));
    spotlight.rotation.x = -Math.PI / 2;
    spotlight.position.y = 0.035;
    scene.add(spotlight);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5.4, 20, 1, true), Object.assign(new THREE.MeshBasicMaterial({ color: palette.warn, transparent: true, opacity: 0.055, side: THREE.DoubleSide, depthWrite: false, userData: { paletteToken: "warn" } }), { userData: { paletteToken: "warn" } }));
    beam.position.set(0, 3.3, 0);
    scene.add(beam);
    const plinth = makeBox(scene, [1.3, 0.7, 1.3], [0, 0.36, 0], detail);
    plinth.rotation.y = Math.PI / 4;
    const sculpture = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), makeMaterial(palette.warn, 0.35, "warn"));
    sculpture.position.set(0, 1.2, 0);
    scene.add(sculpture);
  } else {
    makeBox(scene, [4.4, 0.16, 0.5], [0, 2.55, -5.2], warm);
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 1.12, 0.34, 12), detail);
    fountain.position.set(0, 0.18, -3.65);
    scene.add(fountain);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.84, 20), Object.assign(new THREE.MeshBasicMaterial({ color: palette.me, transparent: true, opacity: 0.42, depthWrite: false, userData: { paletteToken: "me" } }), { userData: { paletteToken: "me" } }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.36, -3.65);
    scene.add(water);
    for (const x of [-8.2, 8.2]) {
      for (const z of [-4.1, 4.1]) {
        makeBox(scene, [1.45, 0.38, 1.2], [x, 0.18, z], detail);
        makeCylinder(scene, 0.12, 0.58, [x, 0.62, z], muted, 7);
        for (const [dx, dy, dz, scale] of [[0, 1.2, 0, 0.7], [-0.3, 1.45, 0.12, 0.48], [0.3, 1.38, -0.12, 0.48]] as const) {
          const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(0.68, 1), warm);
          tree.position.set(x + dx, dy, z + dz);
          tree.scale.set(scale, scale * 1.18, scale);
          scene.add(tree);
        }
      }
    }
    for (const x of [-4.8, 4.8]) {
      makeBox(scene, [1.3, 0.32, 0.42], [x, 0.18, -4.15], detail);
      makeBox(scene, [1.3, 0.32, 0.42], [x, 0.18, 4.15], detail);
      makeBox(scene, [1.36, 0.1, 0.48], [x, 0.38, -4.15], accent);
      makeBox(scene, [1.36, 0.1, 0.48], [x, 0.38, 4.15], accent);
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
    const headGeometry = new THREE.SphereGeometry(0.235, 14, 12);
    const neckGeometry = new THREE.CylinderGeometry(0.1, 0.12, 0.18, 8);
    const visorGeometry = new THREE.BoxGeometry(0.29, 0.1, 0.055);
    const eyeGeometry = new THREE.SphereGeometry(0.032, 7, 6);
    const capGeometry = new THREE.ConeGeometry(0.22, 0.23, 7);
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
    const visorMat = makeMaterial(palette.ink, 0.48, "ink");
    const eyeMat = makeMaterial(palette.onAccent, 0.4, "onAccent");
    const capMat = makeMaterial(lightTint(palette), 0.62);
    const badgeMat = makeMaterial(palette.onAccent, 0.52, "onAccent");
    const legMat = makeMaterial(palette.ink, 0.82, "ink");
    const shoeMat = makeMaterial(palette.danger, 0.58, "danger");
    const shadowMat = Object.assign(new THREE.MeshBasicMaterial({ color: palette.ink, transparent: true, opacity: 0.16, depthWrite: false }), { userData: { paletteToken: "ink" } });
    const body = new THREE.InstancedMesh(bodyGeometry, bodyMat, MAX_CHARACTERS);
    const head = new THREE.InstancedMesh(headGeometry, headMat, MAX_CHARACTERS);
    const neck = new THREE.InstancedMesh(neckGeometry, neckMat, MAX_CHARACTERS);
    const visors = new THREE.InstancedMesh(visorGeometry, visorMat, MAX_CHARACTERS);
    const eyes = new THREE.InstancedMesh(eyeGeometry, eyeMat, MAX_CHARACTERS * 2);
    const caps = new THREE.InstancedMesh(capGeometry, capMat, MAX_CHARACTERS);
    const badges = new THREE.InstancedMesh(badgeGeometry, badgeMat, MAX_CHARACTERS);
    const arms = new THREE.InstancedMesh(armGeometry, limbMat, MAX_CHARACTERS * 2);
    const legs = new THREE.InstancedMesh(legGeometry, legMat, MAX_CHARACTERS * 2);
    const shoes = new THREE.InstancedMesh(shoeGeometry, shoeMat, MAX_CHARACTERS * 2);
    const shadows = new THREE.InstancedMesh(shadowGeometry, shadowMat, MAX_CHARACTERS);
    shadows.position.y = 0.025;
    for (const mesh of [body, head, neck, visors, eyes, caps, badges, arms, legs, shoes, shadows]) {
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
        arms.setColorAt(index * 2, color);
        arms.setColorAt(index * 2 + 1, color);
        head.setColorAt(index, new THREE.Color(headTones[index % headTones.length]));
        caps.setColorAt(index, new THREE.Color(capTones[index % capTones.length]));
        badges.setColorAt(index, new THREE.Color(index % 2 === 0 ? palette.onAccent : palette.surface));
        const shoeColor = new THREE.Color(index % 3 === 0 ? palette.danger : palette.ink);
        shoes.setColorAt(index * 2, shoeColor);
        shoes.setColorAt(index * 2 + 1, shoeColor);
      }
      for (const mesh of [body, head, caps, badges, arms, shoes]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
      headMat.color.set(lightTint(palette));
      limbMat.color.set(lightTint(palette));
      neckMat.color.set(palette.surface2);
      visorMat.color.set(palette.ink);
      eyeMat.color.set(palette.onAccent);
      capMat.color.set(lightTint(palette));
      badgeMat.color.set(palette.onAccent);
      legMat.color.set(palette.ink);
      shoeMat.color.set(palette.danger);
      shadowMat.color.set(palette.ink);
      ambient.color.set(lightTint(palette));
      ambient.groundColor.set(palette.bg);
      key.color.set(lightTint(palette));
      paintMarker();
      tones.splice(0, tones.length, palette.accent, palette.warn, palette.danger, palette.muted);
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
    let lastPaletteCheck = 0;
    let shakeAt = 0;
    let lastImpact = props.impactId;
    const animate = (time: number) => {
      frame = requestAnimationFrame(animate);
      if (lost || document.hidden) return;
      const delta = previous ? Math.min(50, time - previous) : 16;
      previous = time;
      if (time - lastPaletteCheck > 1_000) { lastPaletteCheck = time; updatePalette(); }
      if (impact.current !== lastImpact && impactType.current === "tag") { shakeAt = time; lastImpact = impact.current; }
      if (paintedLabel !== youLabel.current) { paintedLabel = youLabel.current; paintMarker(); }
      const reduced = document.documentElement.dataset.reduced === "1" || (document.documentElement.dataset.reduced !== "0" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const ease = reduced ? 1 : 1 - Math.exp(-delta / 46);
      const snapshot = targets.current.slice(0, MAX_CHARACTERS);
      body.count = snapshot.length;
      head.count = snapshot.length;
      neck.count = snapshot.length;
      visors.count = snapshot.length;
      eyes.count = snapshot.length * 2;
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
        const bodyTilt = staggered ? tumble : recoil + (swinging ? -0.13 : 0);
        const center = new THREE.Vector3(visual.x, (staggered ? 0.9 : 0.96) + bounce, visual.z);
        writeInstance(body, index, dummy, center, yawNow, new THREE.Vector3(0.84, staggered ? 1.2 : 1.32, 0.74), bodyTilt, staggered ? Math.cos(clock * 19 + index) * 0.26 : 0);
        const headTurn = avatar.pose === "glance" && !reduced ? Math.sin(clock * 5 + index) * 0.22 : 0;
        const headPosition = new THREE.Vector3(visual.x, 1.78 + bounce, visual.z);
        const headYaw = yawNow + headTurn;
        writeInstance(head, index, dummy, headPosition, headYaw, new THREE.Vector3(1, 1.04, 0.92), staggered ? tumble * 0.72 : recoil * 0.4, staggered ? Math.cos(clock * 19 + index) * 0.4 : 0);
        writeInstance(neck, index, dummy, new THREE.Vector3(visual.x, 1.51 + bounce, visual.z), yawNow, new THREE.Vector3(1, 1, 1), bodyTilt * 0.22);
        const forwardX = Math.sin(headYaw);
        const forwardZ = Math.cos(headYaw);
        const sideX = Math.cos(headYaw);
        const sideZ = -Math.sin(headYaw);
        writeInstance(visors, index, dummy, new THREE.Vector3(visual.x + forwardX * 0.204, 1.8 + bounce, visual.z + forwardZ * 0.204), headYaw, new THREE.Vector3(1, 1, 1), recoil * 0.3);
        for (let eyeSide = 0; eyeSide < 2; eyeSide++) {
          const side = eyeSide === 0 ? -1 : 1;
          const eyePosition = new THREE.Vector3(visual.x + forwardX * 0.239 + sideX * side * 0.071, 1.8 + bounce, visual.z + forwardZ * 0.239 + sideZ * side * 0.071);
          writeInstance(eyes, index * 2 + eyeSide, dummy, eyePosition, headYaw, new THREE.Vector3(1, 1, 1), recoil * 0.3);
        }
        const wearingCap = index % 3 === 0 || index % 7 === 0;
        writeInstance(caps, index, dummy, new THREE.Vector3(visual.x, 2.02 + bounce, visual.z), yawNow, new THREE.Vector3(wearingCap ? 1 : 0, wearingCap ? 1 : 0, wearingCap ? 1 : 0));
        const badgePosition = new THREE.Vector3(visual.x + Math.sin(yawNow) * 0.31, 1.02 + bounce, visual.z + Math.cos(yawNow) * 0.31);
        writeInstance(badges, index, dummy, badgePosition, yawNow, new THREE.Vector3(index % 4 === 0 ? 1.15 : 0.72, 1, 1), bodyTilt * 0.35);
        writeInstance(shadows, index, dummy, new THREE.Vector3(visual.x, 0.03, visual.z), 0, new THREE.Vector3(staggered ? 1.28 : 1, 1, staggered ? 0.72 : 0.8));
        for (let side = 0; side < 2; side++) {
          const sign = side === 0 ? -1 : 1;
          const armSwing = stride * (side === 0 ? -1 : 1) + (swinging && side === 1 ? -0.82 : 0) + recoil * sign;
          const legSwing = stride * (side === 0 ? 1 : -1) + recoil * sign;
          const localX = sign * 0.32;
          const rotatedX = visual.x + localX * Math.cos(yawNow);
          const rotatedZ = visual.z - localX * Math.sin(yawNow);
          const armPos = new THREE.Vector3(rotatedX, 1.14 + bounce, rotatedZ);
          const legPos = new THREE.Vector3(visual.x + sign * 0.14 * Math.cos(yawNow), 0.43, visual.z - sign * 0.14 * Math.sin(yawNow));
          const shoePos = new THREE.Vector3(legPos.x + Math.sin(yawNow) * 0.12, 0.18, legPos.z + Math.cos(yawNow) * 0.12);
          writeInstance(arms, index * 2 + side, dummy, armPos, yawNow, new THREE.Vector3(1, 0.96, 1), armSwing);
          writeInstance(legs, index * 2 + side, dummy, legPos, yawNow, new THREE.Vector3(0.82, 0.92, 0.82), legSwing);
          writeInstance(shoes, index * 2 + side, dummy, shoePos, yawNow, new THREE.Vector3(1.05, 0.56, 1.5), 0);
        }
      }
      for (const mesh of [body, head, neck, visors, eyes, caps, badges, arms, legs, shoes, shadows]) mesh.instanceMatrix.needsUpdate = true;
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

  if (!supported) return <>{props.fallback}</>;
  return <div class={"arena arena--" + props.arena + " arena--3d"} role="img" aria-label={props.label}>
    <canvas class="arena__canvas" ref={canvasRef} aria-hidden="true"></canvas>
  </div>;
}


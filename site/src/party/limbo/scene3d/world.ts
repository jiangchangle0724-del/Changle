import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { LIMBO_ANGLES } from "../../../shared/engine/games/limbo";
import { applyJoints, approach, barHeight, buildFigure, makeParts, standing, targetFor, type FigureState, type Joints, type Parts, type Rig, type Wardrobe, Z_BEFORE } from "./figure";

/**
 * The limbo stage in 3D: two stands with a peg for every bar, the striped bar glowing in the game's
 * colour, a pool of light on the floor, and the players under the bar (figure.ts). Built here from
 * geometry, nothing downloaded but three.js itself. The React side (Scene3D.tsx) owns the canvas and
 * the frame loop; it tells this world what the game wants (the bar's angle, who stands where in
 * which pose) and this world animates toward it: the bar drops with a bounce, a miss knocks it, a
 * pass lights it up.
 */

export type Palette = { night: string; dusk: string; dusk2: string; dusk3: string; line: string; haze: string; moon: string };

export type FigureSpec = { id: string; color: string; name: string };

export type Stats = { calls: number; tris: number; figures: number; bar: number; fps: number; people: { id: string; pose: string; since: number; lean: number; z: number; hipY: number }[] };

export type World = {
  resize(w: number, h: number, dpr: number): void;
  setGel(hex: string): void;
  /** The bar for this angle; it drops (or rises) into place unless `snap`. */
  setBar(angle: number, side: number, snap?: boolean): void;
  /** A moving bar: this frame's angle, straight to it. */
  swayBar(angle: number): void;
  /** Who stands under the bar, left to right. */
  sync(figs: FigureSpec[]): void;
  /** What one of them is doing. A new "fail" knocks the bar (`full`: off its pegs), a new "pass" lights it. */
  pose(id: string, st: FigureState, full?: boolean): void;
  /** One frame at `t` seconds. */
  frame(t: number): Stats;
  dispose(): void;
};

const RAD = Math.PI / 180;
/** The stands: how far apart, how tall. */
const POLE_X = 1.18;
const POLE_H = 2.0;
const BAR_LEN = 2.5;
/** Where the players stand along the bar. */
const ROW = 0.85;
/**
 * Which way the players face: a little to the left of straight at the camera. A lean straight away
 * from the camera can't be seen (it only shortens the body); turned like this, with the camera off
 * to the right, leaning back reads as the body tipping sideways, the way a limbo picture does.
 */
const FACE = -24 * RAD;
const FWD = { x: Math.sin(FACE), z: Math.cos(FACE) };

const bounceOut = (u: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
  return n * (u -= 2.625 / d) * u + 0.984375;
};
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

/** A soft radial blob on a canvas (the floor's pool, the shadows, the bar's halo). */
function radial(size: number, stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The bar's stripes: dark bands on the gel. */
function stripes(gel: string, night: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = gel;
  g.fillRect(0, 0, 512, 16);
  g.fillStyle = night;
  g.globalAlpha = 0.42;
  for (let i = 0; i < 10; i++) g.fillRect(28 + i * 48, 0, 20, 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** A name over a head. */
function nameTag(name: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 72;
  const g = c.getContext("2d")!;
  g.font = "600 36px system-ui, -apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const text = name.length > 8 ? name.slice(0, 7) + "…" : name;
  const w = Math.min(248, g.measureText(text).width + 40);
  g.fillStyle = "rgba(14,12,34,0.72)";
  g.beginPath();
  if (typeof g.roundRect === "function") g.roundRect(128 - w / 2, 10, w, 52, 26);
  else g.rect(128 - w / 2, 10, w, 52);
  g.fill();
  g.fillStyle = color;
  g.fillText(text, 128, 37);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

type Figure = {
  spec: FigureSpec;
  rig: Rig;
  shirt: THREE.MeshStandardMaterial;
  tag: THREE.Sprite | null;
  state: FigureState;
  since: number; // when the pose began (seconds, frame time)
  phase: number;
  cur: Joints;
  slot: number; // x along the bar
  depth: number; // z: a second row when it's crowded
  leaving: boolean;
};

type Spark = { life: number; max: number; v: THREE.Vector3; p: THREE.Vector3; color: THREE.Color; size: number };

export function createWorld(canvas: HTMLCanvasElement, opts: { gel: string; palette: Palette; reduced: boolean }): World {
  const { palette, reduced } = opts;
  let gel = opts.gel;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  // soft reflections from a room made here (nothing downloaded)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.42;

  // ---- light: a warm key from the front, the room's gel from behind, a hemisphere of night
  const hemi = new THREE.HemisphereLight(0xd8d4ff, 0x14112a, 0.85);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
  key.position.set(2.6, 4.2, 3.8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(gel, 1.9);
  rim.position.set(-2.4, 2.6, -3.2);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xb8c4ff, 0.5);
  fill.position.set(-3, 1.5, 3);
  scene.add(fill);

  // ---- the floor: a pool of the gel's light fading into the night, and a faint ring
  const poolTex = radial(256, [
    [0, "rgba(255,255,255,0.2)"],
    [0.45, "rgba(255,255,255,0.07)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.9, 48), new THREE.MeshBasicMaterial({ map: poolTex, color: gel, transparent: true, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.001;
  scene.add(pool);
  const mat = new THREE.Mesh(new THREE.CircleGeometry(1.95, 64), new THREE.MeshStandardMaterial({ color: palette.dusk, roughness: 0.55, metalness: 0.15 }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = 0.0005;
  scene.add(mat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 1.94, 64), new THREE.MeshBasicMaterial({ color: gel, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  scene.add(ring);
  // a glow in the air behind the bar
  const glowTex = radial(256, [
    [0, "rgba(255,255,255,0.16)"],
    [0.5, "rgba(255,255,255,0.045)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.2), new THREE.MeshBasicMaterial({ map: glowTex, color: gel, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.set(0, 1.2, -1.6);
  scene.add(glow);

  // ---- the stands: a base, a post, a cap, and a peg for every bar (the bar rests on this level's)
  const steel = new THREE.MeshStandardMaterial({ color: palette.dusk3, roughness: 0.35, metalness: 0.75 });
  const steelDark = new THREE.MeshStandardMaterial({ color: palette.dusk2, roughness: 0.5, metalness: 0.6 });
  const baseGeo = new THREE.CylinderGeometry(0.24, 0.27, 0.045, 28);
  const postGeo = new THREE.CylinderGeometry(0.034, 0.04, POLE_H, 16);
  const capGeo = new THREE.SphereGeometry(0.05, 14, 10);
  const pegGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.11, 8);
  pegGeo.rotateZ(Math.PI / 2);
  const pegs = new THREE.InstancedMesh(pegGeo, steel, LIMBO_ANGLES.length * 2);
  const m4 = new THREE.Matrix4();
  LIMBO_ANGLES.forEach((a, i) => {
    const y = barHeight(a);
    m4.makeTranslation(-POLE_X + 0.06, y - 0.036, 0);
    pegs.setMatrixAt(i * 2, m4);
    m4.makeTranslation(POLE_X - 0.06, y - 0.036, 0);
    pegs.setMatrixAt(i * 2 + 1, m4);
  });
  pegs.instanceMatrix.needsUpdate = true;
  scene.add(pegs);
  for (const x of [-POLE_X, POLE_X]) {
    const base = new THREE.Mesh(baseGeo, steelDark);
    base.position.set(x, 0.0225, 0);
    scene.add(base);
    const post = new THREE.Mesh(postGeo, steel);
    post.position.set(x, POLE_H / 2 + 0.04, 0);
    scene.add(post);
    const cap = new THREE.Mesh(capGeo, steel);
    cap.position.set(x, POLE_H + 0.05, 0);
    scene.add(cap);
  }

  // ---- the bar, striped, glowing in the gel
  const barGroup = new THREE.Group();
  const stripeTex = stripes(gel, palette.night);
  const barMat = new THREE.MeshStandardMaterial({ map: stripeTex, color: 0xffffff, emissive: new THREE.Color(gel), emissiveMap: stripeTex, emissiveIntensity: 0.55, roughness: 0.45, metalness: 0.1 });
  const barGeo = new THREE.CylinderGeometry(0.034, 0.034, BAR_LEN, 14, 1);
  barGeo.rotateZ(Math.PI / 2);
  const bar = new THREE.Mesh(barGeo, barMat);
  barGroup.add(bar);
  const haloTex = radial(128, [
    [0, "rgba(255,255,255,0.55)"],
    [0.35, "rgba(255,255,255,0.18)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const haloMat = new THREE.MeshBasicMaterial({ map: haloTex, color: gel, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(BAR_LEN + 0.3, 0.42), haloMat);
  halo.position.z = -0.02;
  barGroup.add(halo);
  // the bar's end caps
  const endGeo = new THREE.SphereGeometry(0.036, 12, 8);
  for (const x of [-BAR_LEN / 2, BAR_LEN / 2]) {
    const e = new THREE.Mesh(endGeo, steel);
    e.position.x = x;
    barGroup.add(e);
  }
  scene.add(barGroup);

  // the bar's state: where it should be, where it is, and what it's doing
  let barAngle = 20;
  let barSide = 0;
  let barY = barHeight(barAngle);
  let barFrom = barY;
  let barAt = -1; // when the drop began (frame time), -1 at rest
  let barSway = false;
  let swayY = barY; // a moving bar, gliding to where its path says
  let knockAt = -1;
  let knockFull = false;
  let fallen = false;
  let litAt = -10;
  let shakeTrauma = 0;
  const fall = { y: 0, vy: 0, rz: 0, vrz: 0, x: 0 };
  /** The bar back on its pegs (dropped in from above) after it was knocked off. */
  const restore = () => {
    if (!fallen && knockAt < 0) return;
    if (fallen && !reduced) {
      barFrom = barY + 0.6;
      barAt = lastT < 0 ? 0 : lastT;
    }
    fallen = false;
    knockAt = -1;
  };

  // ---- the players
  const parts: Parts = makeParts();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b89a, roughness: 0.62, metalness: 0 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24213f, roughness: 0.7, metalness: 0.05 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf0eefb, roughness: 0.5, metalness: 0.05 });
  const shadowTex = radial(128, [
    [0, "rgba(0,0,0,0.9)"],
    [0.5, "rgba(0,0,0,0.35)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  const figures: Figure[] = [];
  const figureOf = (id: string) => figures.find((f) => f.spec.id === id);

  const addFigure = (spec: FigureSpec, t: number) => {
    const shirt = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.58, metalness: 0.04 });
    const wardrobe: Wardrobe = { skin, dark, shoe, shirt };
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.45 });
    const rig = buildFigure(parts, wardrobe, shadowMat);
    rig.root.rotation.y = FACE;
    scene.add(rig.root);
    const cur = standing();
    cur.z = Z_BEFORE;
    cur.scale = 0.001;
    const f: Figure = { spec, rig, shirt, tag: null, state: { pose: "idle", lean: 0, side: 0 }, since: t, phase: Math.random() * Math.PI * 2, cur, slot: 0, depth: 0, leaving: false };
    figures.push(f);
    return f;
  };
  const removeFigure = (f: Figure) => {
    scene.remove(f.rig.root);
    f.shirt.dispose();
    (f.rig.shadow.material as THREE.Material).dispose();
    if (f.tag) {
      (f.tag.material as THREE.SpriteMaterial).map?.dispose();
      f.tag.material.dispose();
    }
    figures.splice(figures.indexOf(f), 1);
  };
  const placeTags = () => {
    // names over heads when a few play together (a crowd's would pile up; one needs none)
    const n = figures.filter((f) => !f.leaving).length;
    const want = n > 1 && n <= 4;
    for (const f of figures) {
      if (want && !f.tag) {
        const tex = nameTag(f.spec.name, f.spec.color);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
        s.center.set(0.5, 0);
        f.rig.root.add(s);
        f.tag = s;
      }
      if (f.tag) f.tag.scale.set(0.44, 0.124, 1);
      if (!want && f.tag) {
        f.rig.root.remove(f.tag);
        (f.tag.material as THREE.SpriteMaterial).map?.dispose();
        f.tag.material.dispose();
        f.tag = null;
      }
    }
  };
  const reslot = () => {
    const live = figures.filter((f) => !f.leaving);
    const n = live.length;
    const span = n <= 1 ? 0 : n === 2 ? 0.9 : Math.min(ROW * 2, 0.55 * (n - 1));
    live.forEach((f, i) => {
      // (a little to the left of the middle: leaning back carries the head toward the near stand)
      f.slot = -0.1 + (n <= 1 ? 0 : -span / 2 + (span * i) / (n - 1));
      f.depth = n > 5 && i % 2 === 1 ? -0.32 : 0;
    });
  };

  // ---- sparks: a burst when the bar is cleared, dust when it isn't
  const SPARKS = 48;
  const sparkGeo = new THREE.OctahedronGeometry(0.034, 0);
  const sparkMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const sparks = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARKS);
  sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparks.count = 0;
  // (its bounds would be worked out once, from no sparks, and never again)
  sparks.frustumCulled = false;
  scene.add(sparks);
  const live: Spark[] = [];
  const burst = (at: THREE.Vector3, color: string, n: number, up: number, spread: number, size = 1) => {
    if (reduced) return;
    for (let i = 0; i < n && live.length < SPARKS; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      live.push({ life: 0, max: 0.7 + Math.random() * 0.6, p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread * 0.4)), v: new THREE.Vector3(Math.cos(a) * r * spread * 1.6, up * (0.5 + Math.random()), Math.sin(a) * r * spread * 1.2), color: new THREE.Color(color), size: size * (0.6 + Math.random() * 0.8) });
    }
  };
  const sparkM = new THREE.Matrix4();
  const sparkQ = new THREE.Quaternion();
  const sparkS = new THREE.Vector3();
  const stepSparks = (dt: number) => {
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i];
      s.life += dt;
      if (s.life >= s.max) {
        live.splice(i, 1);
        continue;
      }
      s.v.y -= 2.6 * dt;
      s.v.multiplyScalar(1 - 1.4 * dt);
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < 0.01) {
        s.p.y = 0.01;
        s.v.y = Math.abs(s.v.y) * 0.3;
      }
    }
    live.forEach((s, i) => {
      const k = 1 - s.life / s.max;
      sparkQ.setFromEuler(new THREE.Euler(s.life * 6, s.life * 4, 0));
      sparkS.setScalar(s.size * (0.4 + 0.6 * k));
      sparkM.compose(s.p, sparkQ, sparkS);
      sparks.setMatrixAt(i, sparkM);
      sparks.setColorAt(i, s.color);
    });
    sparks.count = live.length;
    if (live.length) {
      sparks.instanceMatrix.needsUpdate = true;
      if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
    }
  };

  // ---- the camera: three-quarters from the front, a little above, framing the stands
  const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 40);
  const look = new THREE.Vector3(0, 0.92, -0.05);
  // (the checks can look from elsewhere: window.__limboCam = { yaw, pitch } in degrees; 90, 0 is straight from the side)
  const dbg = import.meta.env.DEV ? (window as unknown as { __limboCam?: { yaw: number; pitch: number } }).__limboCam : undefined;
  const yaw = (dbg?.yaw ?? 48) * RAD;
  const pitch = (dbg?.pitch ?? 4) * RAD;
  let camDist = 6;
  const placeCamera = () => {
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * camDist, Math.sin(pitch) * camDist + look.y, Math.cos(yaw) * Math.cos(pitch) * camDist + look.z);
    camera.lookAt(look);
  };
  const resize = (w: number, h: number, dpr: number) => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tanV = Math.tan((camera.fov * RAD) / 2);
    const tanH = tanV * camera.aspect;
    // the stands and a step either side across, the stands' height down
    camDist = Math.max(1.62 / tanH, 1.13 / tanV) * 1.02;
    camera.updateProjectionMatrix();
    placeCamera();
  };

  // ---- colour: the game's gel, which the room light can change
  const setGel = (hex: string) => {
    if (hex === gel) return;
    gel = hex;
    rim.color.set(gel);
    (pool.material as THREE.MeshBasicMaterial).color.set(gel);
    (ring.material as THREE.MeshBasicMaterial).color.set(gel);
    (glow.material as THREE.MeshBasicMaterial).color.set(gel);
    haloMat.color.set(gel);
    barMat.emissive.set(gel);
    const tex = stripes(gel, palette.night);
    barMat.map?.dispose();
    barMat.map = tex;
    barMat.emissiveMap = tex;
    barMat.needsUpdate = true;
  };

  let lastT = -1;
  let fps = 60;
  const stats: Stats = { calls: 0, tris: 0, figures: 0, bar: barAngle, fps, people: [] };
  const tmp = new THREE.Vector3();

  const frame = (t: number) => {
    const dt = lastT < 0 ? 1 / 60 : Math.min(0.1, Math.max(0.001, t - lastT));
    lastT = t;
    fps += (1 / dt - fps) * 0.05;

    // the bar
    let y = barY;
    let rz = 0;
    let x = 0;
    if (barSway) {
      // a moving bar: close behind its path (it glides over from wherever the last bar left it)
      swayY += (barY - swayY) * (1 - Math.exp(-16 * dt));
      y = swayY;
    } else if (barAt >= 0) {
      const u = clamp01((t - barAt) / (barFrom > barY ? 0.95 : 0.7));
      // down with a bounce onto the pegs, up with an ease
      y = barFrom + (barY - barFrom) * (barFrom > barY ? bounceOut(u) : 1 - (1 - u) ** 3);
      if (u >= 1) barAt = -1;
    }
    if (knockAt >= 0) {
      const k = t - knockAt;
      if (!knockFull || k < 0.22) {
        // rattled on its pegs
        const decay = Math.exp(-k * 3.2);
        rz = Math.sin(k * 26) * 0.045 * decay;
        y += Math.abs(Math.sin(k * 26)) * 0.02 * decay;
        if (!knockFull && decay < 0.03) knockAt = -1;
      } else {
        // off the pegs: one end slips, it drops, bounces, lies there
        if (!fallen) {
          fallen = true;
          fall.y = y;
          fall.vy = 0.2;
          fall.rz = 0.03;
          fall.vrz = 0.9;
          fall.x = 0;
        }
        fall.vy -= 9.8 * dt;
        fall.y += fall.vy * dt;
        fall.rz += fall.vrz * dt;
        // it slides a little toward the stand it came off, while it's still in the air
        if (fall.vy !== 0) fall.x = Math.min(0.18, fall.x + 0.3 * dt);
        const floor = 0.035 + Math.abs(Math.sin(fall.rz)) * (BAR_LEN / 2);
        if (fall.y < floor && fall.vy < 0) {
          fall.y = floor;
          fall.vy = -fall.vy * 0.32;
          fall.vrz = -fall.vrz * 0.45;
          if (Math.abs(fall.vy) < 0.25) fall.vy = 0;
        }
        if (fall.y <= floor + 0.001 && fall.vy === 0) {
          // settling flat
          fall.rz += (0 - fall.rz) * Math.min(1, dt * 4);
          fall.y = 0.035;
        }
        y = fall.y;
        rz = fall.rz;
        x = fall.x;
      }
    }
    barGroup.position.set(x, y, 0);
    barGroup.rotation.set(0, 0, rz + (fallen ? 0 : -barSide * RAD * 0.5));
    // lit up for a moment when someone clears it
    const lit = Math.max(0, 1 - (t - litAt) / 1.1);
    barMat.emissiveIntensity = 0.55 + lit * 1.6;
    haloMat.opacity = 0.8 + lit * 0.9;
    halo.scale.y = 1 + lit * 0.7;

    // the people
    for (let i = figures.length - 1; i >= 0; i--) {
      const f = figures[i];
      const since = t - f.since;
      const target = f.leaving ? { ...f.cur, scale: 0 } : targetFor(f.state, since, t, f.phase);
      if (!f.leaving) target.scale = 1;
      // the live lean is quick to follow; a pose change flows
      const lambda = f.state.pose === "lean" ? 11 : f.leaving ? 9 : 7;
      approach(f.cur, target, lambda, dt);
      if (f.leaving && f.cur.scale < 0.02) {
        removeFigure(f);
        continue;
      }
      const breath = 0.5 + 0.5 * Math.sin(t * 2.3 + f.phase);
      applyJoints(f.rig, f.cur, breath);
      // where it stands: its place along the bar, then its own steps along the way it faces
      const along = f.cur.z - Z_BEFORE;
      f.rig.root.position.set(f.slot + along * FWD.x + f.cur.x * FWD.z, 0, Z_BEFORE + f.depth + along * FWD.z - f.cur.x * FWD.x);
      if (f.tag) f.tag.position.set(0, f.rig.pelvis.position.y + 0.98 + Math.min(0, 0.3 + f.cur.chestX) * 0.25, Math.min(0, f.cur.chestX) * 0.4);
    }

    stepSparks(dt);

    // a shudder when the bar is knocked (none with reduced motion)
    if (shakeTrauma > 0) {
      const s = shakeTrauma * shakeTrauma;
      placeCamera();
      camera.position.x += Math.sin(t * 57) * 0.035 * s;
      camera.position.y += Math.sin(t * 71 + 1) * 0.03 * s;
      camera.lookAt(look);
      shakeTrauma = Math.max(0, shakeTrauma - dt * 1.4);
      if (shakeTrauma === 0) placeCamera();
    }

    renderer.render(scene, camera);
    stats.calls = renderer.info.render.calls;
    stats.tris = renderer.info.render.triangles;
    stats.figures = figures.length;
    stats.bar = barAngle;
    stats.fps = Math.round(fps);
    stats.people = figures.map((f) => ({ id: f.spec.id, pose: f.state.pose, since: Math.round((t - f.since) * 100) / 100, lean: Math.round(f.state.lean), z: Math.round(f.cur.z * 100) / 100, hipY: Math.round(f.cur.hipY * 100) / 100 }));
    return stats;
  };

  return {
    resize,
    setGel,
    setBar(angle, side, snap) {
      barSide = side;
      const to = barHeight(angle);
      if (angle === barAngle && !fallen && !snap) return;
      barAngle = angle;
      const was = fallen ? barHeight(angle) + 0.6 : barSway ? swayY : barY;
      barSway = false;
      fallen = false;
      knockAt = -1;
      barY = to;
      if (snap || reduced) {
        barAt = -1;
        return;
      }
      barFrom = was;
      barAt = lastT < 0 ? 0 : lastT;
    },
    swayBar(angle) {
      if (!barSway) swayY = fallen ? barHeight(angle) + 0.6 : barGroup.position.y;
      barSway = true;
      barAt = -1;
      fallen = false;
      knockAt = knockAt >= 0 && !knockFull ? knockAt : -1;
      barAngle = angle;
      barY = barHeight(angle);
    },
    sync(specs) {
      const t = lastT < 0 ? 0 : lastT;
      for (const f of figures) {
        if (!f.leaving && !specs.some((s) => s.id === f.spec.id)) {
          f.leaving = true;
          f.since = t;
          if (f.state.pose === "fail") restore();
        }
      }
      for (const s of specs) {
        const f = figureOf(s.id);
        if (f && f.leaving) {
          f.leaving = false;
          f.since = t;
        } else if (!f) addFigure(s, t);
        if (f && f.spec.color !== s.color) f.shirt.color.set(s.color);
        if (f) f.spec = s;
      }
      reslot();
      placeTags();
    },
    pose(id, st, full = false) {
      const f = figureOf(id);
      if (!f) return;
      const t = lastT < 0 ? 0 : lastT;
      const was = f.state.pose;
      f.state = st;
      if (st.pose === was) return;
      f.since = t;
      if (was === "fail") restore();
      if (st.pose === "fail") {
        knockAt = t;
        knockFull = full;
        if (!reduced) shakeTrauma = full ? 0.75 : 0.45;
        tmp.set(f.slot, 0.05, Z_BEFORE + f.depth);
        burst(tmp, palette.haze, 10, 0.9, 0.5, 0.8);
      } else if (st.pose === "pass") {
        litAt = t;
        tmp.set(f.slot, barY, 0);
        burst(tmp, gel, 22, 1.7, 0.7);
        burst(tmp, palette.moon, 8, 1.3, 0.5, 0.7);
      }
    },
    frame,
    dispose() {
      for (const f of figures.slice()) removeFigure(f);
      parts.dispose();
      for (const m of [skin, dark, shoe, steel, steelDark, barMat, haloMat, sparkMat, pool.material, mat.material, ring.material, glow.material]) (m as THREE.Material).dispose();
      for (const g of [baseGeo, postGeo, capGeo, pegGeo, barGeo, endGeo, sparkGeo, pool.geometry, mat.geometry, ring.geometry, glow.geometry, halo.geometry]) g.dispose();
      for (const tx of [poolTex, glowTex, haloTex, shadowTex, stripeTex]) tx.dispose();
      barMat.map?.dispose();
      env.dispose();
      renderer.dispose();
      // the graphics context back at once (a phone keeps few)
      renderer.forceContextLoss();
    },
  };
}

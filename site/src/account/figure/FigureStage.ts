import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { bodyHeads, bodyKey, packOf, restBones, restHeads, restMesh, restNodes, rigFor, type BodyJoints, type RestNode } from "./body";
import { Floaters, Trail } from "./fx";
import { EYE_COLORS, HAIR_COLORS, PANTS_COLORS, SHIRT_COLORS, SKINS, shapeWeights, type HairId, type Look, type Sex } from "./look";
import { ANCHOR, disposeProp, makeProp } from "./props";
import { MOVES, eyeFile, figureFile, hairFile, moveOf, type Expr, type Move, type PropId } from "./moves";
import { baking, toClip, type Baked } from "./pose/anim";
import { BASE, CLIPS } from "./pose/keys";
import type { Rig } from "./pose/rig";
import { applyShapes, prepMesh, type Shaped } from "./shape";

export type StageStats = { kb: number; tris: number; fps: number };
/** the whole figure, its face up close (for sculpting), or its head and shoulders (for hair) */
export type View = "body" | "face" | "bust";
export type Stage = { play(id: string): void; setLook(look: Look): void; view(v: View): void; dispose(): void };

/**
 * The files come gzipped (Cloudflare doesn't compress .glb files, and the moves' JSON shrinks a
 * lot): unzipped here, by the browser's own DecompressionStream, or fflate (which three.js ships)
 * where that's missing. A server that already unzipped it is fine too. kb: what came down.
 */
async function fetchModel(url: string): Promise<{ bytes: ArrayBuffer; kb: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model ${res.status}`);
  const raw = new Uint8Array(await res.arrayBuffer());
  // what came over the network (a server may have sent it as gzip and the browser unzipped it already)
  let sent = raw.byteLength;
  try {
    const e = performance.getEntriesByName(new URL(url, location.href).href).pop() as PerformanceResourceTiming | undefined;
    if (e?.encodedBodySize) sent = e.encodedBodySize;
  } catch {
    // no timing: the bytes in hand
  }
  const kb = Math.round(sent / 1024);
  if (raw[0] !== 0x1f || raw[1] !== 0x8b) return { bytes: raw.buffer, kb };
  if (typeof DecompressionStream !== "undefined") {
    const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
    return { bytes: await new Response(out).arrayBuffer(), kb };
  }
  const { gunzipSync } = await import("three/examples/jsm/libs/fflate.module.js");
  const u = gunzipSync(raw);
  return { bytes: u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer, kb };
}

/** a material's colour so its texture's average comes out as `hex` (times k); the file says the average */
function tint(mat: THREE.MeshStandardMaterial, hex: string, k = 1) {
  const c = new THREE.Color(hex);
  const mean = mat.userData.mean as number[] | undefined;
  if (mean) c.setRGB((c.r * k) / mean[0], (c.g * k) / mean[1], (c.b * k) / mean[2], THREE.LinearSRGBColorSpace);
  mat.color.copy(c);
}

// ---------------------------------------------------------------- one figure (a body, with its moves)

type Held = { obj: THREE.Object3D; k: number; going: boolean };
const EXPRS: readonly Expr[] = ["blinkL", "blinkR", "squint", "smile", "sadMouth", "kiss", "browsUp", "browsSad", "browsDown"];

type Figure = {
  sex: Sex;
  root: THREE.Object3D;
  kb: number;
  mixer: THREE.AnimationMixer;
  /** each move's clip, solved for this body: a few milliseconds a frame from the start, or at once when played */
  actions: Map<string, THREE.AnimationAction>;
  solving: Map<string, Generator<void, Baked>>;
  /** the clips still to solve, in the order of the moves on the page */
  toSolve: string[];
  bones: Map<string, THREE.Object3D>;
  meshes: THREE.SkinnedMesh[];
  shaped: Shaped[];
  hairs: Map<HairId, THREE.SkinnedMesh>;
  /** the skeleton at rest as the file has it; where the body sliders move its joints */
  nodes: RestNode[];
  base: Map<string, THREE.Vector3>;
  joints: BodyJoints | undefined;
  /** the skeleton at rest for the body on show, and the body sliders' weights it was moved for */
  heads: Map<string, THREE.Vector3>;
  bodyKey: string;
  /** each mesh's packing (its positions to the world at rest) */
  packs: Map<THREE.SkinnedMesh, THREE.Matrix4>;
  rig: Rig;
};

/** every clip a move plays, in the order of the moves on the page */
const ALL_CLIPS = [...new Set((MOVES as readonly Move[]).flatMap((m) => [m.intro, m.clip ?? m.id].filter((x): x is string => !!x)))];
/** the meshes the arms keep out of */
const bodyMeshes = (fig: Figure) => fig.meshes.filter((m) => m.name === "Body" || m.name === "Shirt" || m.name === "Pants");

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/** a skinned mesh joins a figure: its sliders' targets split off, bound to the body on show, hair edges smoothed */
function adopt(fig: Figure, m: THREE.SkinnedMesh) {
  m.frustumCulled = false;
  fig.meshes.push(m);
  const pack = packOf(m, fig.base);
  fig.packs.set(m, pack);
  if (fig.bodyKey) restMesh(m, pack, fig.heads);
  const s = prepMesh(m);
  if (s) fig.shaped.push(s);
  const mat = m.material as THREE.MeshStandardMaterial;
  // hair is cut out of its texture: smooth the cut edges where the screen can
  if (mat.userData.tint === "hair") mat.alphaToCoverage = true;
  return s;
}

async function loadFigure(sex: Sex): Promise<Figure> {
  const url = figureFile(sex);
  const { bytes, kb } = await fetchModel(url);
  const gltf = await loader.parseAsync(bytes, url.slice(0, url.lastIndexOf("/") + 1));
  const root = gltf.scene;
  // the moves aren't in the file: they're solved here, for this body (pose/)
  const nodes = restNodes(root);
  const base = restHeads(nodes);
  const fig: Figure = {
    sex,
    root,
    kb,
    mixer: new THREE.AnimationMixer(root),
    actions: new Map(),
    solving: new Map(),
    toSolve: [...ALL_CLIPS],
    bones: new Map(),
    meshes: [],
    shaped: [],
    hairs: new Map(),
    nodes,
    base,
    joints: root.userData.body as BodyJoints | undefined,
    heads: base,
    bodyKey: "",
    packs: new Map(),
    rig: null as unknown as Rig,
  };
  const skinned: THREE.SkinnedMesh[] = [];
  root.traverse((x) => {
    if ((x as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(x as THREE.SkinnedMesh);
    else if (x.name) fig.bones.set(x.name, x);
  });
  for (const m of skinned) {
    adopt(fig, m);
    const hair = m.userData.hair as HairId | undefined;
    if (hair) fig.hairs.set(hair, m);
  }
  fig.rig = rigFor(nodes, bodyMeshes(fig));
  anchor(fig);
  return fig;
}

/**
 * The body sliders (height, weight, muscle): the skeleton moved to the body they make, every mesh
 * bound to it again, and the solver and the props' anchors made for it. The meshes must have their
 * shapes already. True if the skeleton moved (the moves must then be solved again).
 */
function shapeBody(fig: Figure, w: Map<string, number>): boolean {
  const key = bodyKey(fig.joints, w);
  if (key === fig.bodyKey) return false;
  fig.bodyKey = key;
  fig.heads = bodyHeads(fig.base, fig.joints, w);
  const nodes = restBones(fig.nodes, fig.heads, fig.bones);
  for (const m of fig.meshes) {
    const pack = fig.packs.get(m);
    if (pack) restMesh(m, pack, fig.heads);
  }
  fig.rig = rigFor(nodes, bodyMeshes(fig));
  anchor(fig);
  return true;
}

/**
 * Empty nodes for props to hang on: Grip_R and Grip_L in each palm (x along the fingers, y toward
 * the thumb's side), Head_Anchor at the head (the figure's own axes). Placed from the solver's
 * idea of each hand, and moved when the body changes.
 */
function anchor(fig: Figure) {
  const put = (name: string, bone: string, at: THREE.Vector3, q: THREE.Quaternion) => {
    const b = fig.bones.get(bone);
    const rb = fig.rig.bones.get(bone);
    if (!b || !rb) return;
    let o = fig.bones.get(name);
    if (!o) {
      o = new THREE.Object3D();
      o.name = name;
      b.add(o);
      fig.bones.set(name, o);
    }
    // the bones turn nothing at rest: an offset in the world is an offset in the bone
    const inv = rb.Wr.clone().invert();
    o.position.copy(at.clone().sub(rb.Pr).applyQuaternion(inv));
    o.quaternion.copy(inv.multiply(q));
  };
  for (const side of ["Left", "Right"]) {
    const h = fig.rig.hand[side];
    const hb = fig.rig.bones.get(`${side}Hand`);
    if (!h || !hb) continue;
    const x = h.fingers.clone();
    const y = h.thumbSide.clone();
    const z = x.clone().cross(y);
    put(`Grip_${side[0]}`, `${side}Hand`, hb.Pr.clone().add(h.grip), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)));
  }
  const head = fig.rig.bones.get("Head");
  if (head) put("Head_Anchor", "Head", head.Pr.clone(), new THREE.Quaternion());
}

/** a clip's solving, started if it hasn't been */
function solvingOf(fig: Figure, name: string) {
  let g = fig.solving.get(name);
  if (!g) {
    const def = CLIPS.find((c) => c.name === name);
    if (!def) return null;
    g = baking(fig.rig, def, BASE);
    fig.solving.set(name, g);
  }
  return g;
}

/** a move's clip for this body: solved now if it isn't yet */
function actionFor(fig: Figure, name: string): THREE.AnimationAction | null {
  const a = fig.actions.get(name);
  if (a) return a;
  const g = solvingOf(fig, name);
  if (!g) return null;
  for (;;) {
    const r = g.next();
    if (r.done) return done(fig, name, r.value);
  }
}

function done(fig: Figure, name: string, b: Baked) {
  const a = fig.mixer.clipAction(toClip(b));
  fig.actions.set(name, a);
  fig.solving.delete(name);
  fig.toSolve = fig.toSolve.filter((n) => n !== name);
  return a;
}

/** the next clips solved, for up to `ms` milliseconds (so a move starts at once when picked) */
function solveSome(fig: Figure, ms: number) {
  const until = performance.now() + ms;
  while (fig.toSolve.length && performance.now() < until) {
    const name = fig.toSolve[0];
    if (fig.actions.has(name)) {
      fig.toSolve.shift();
      continue;
    }
    const g = solvingOf(fig, name);
    if (!g) {
      fig.toSolve.shift();
      continue;
    }
    for (;;) {
      const r = g.next();
      if (r.done) {
        done(fig, name, r.value);
        break;
      }
      if (performance.now() >= until) return;
    }
  }
}

function disposeFigure(fig: Figure) {
  fig.mixer.stopAllAction();
  const textures = new Set<THREE.Texture>();
  for (const m of fig.meshes) {
    m.geometry.dispose();
    const mat = m.material as THREE.MeshStandardMaterial;
    // (the eyes may be wearing a colour the stage keeps: their own texture goes)
    const own = (mat.userData.ownMap as THREE.Texture | undefined) ?? mat.map;
    if (own) textures.add(own);
    mat.dispose();
  }
  for (const t of textures) t.dispose();
  fig.root.removeFromParent();
}

/**
 * The figure's little 3D room, with three.js (this module and three.js load only once a page asks
 * for the figure): the model, its moves cross-faded, its face (the sliders' shapes, expressions,
 * blinking), what it holds, what floats off it, and a drag sideways to turn it. Separate from
 * React so another game can mount the same figure.
 */
export async function mountStage(
  el: HTMLElement,
  o: { ratio: number; first: string; look: Look; view?: View; onFirstFrame(): void; onStats(s: StageStats): void; onMove?(id: string): void; flash?(): void },
): Promise<Stage> {
  let look = o.look;
  let fig = await loadFigure(look.sex);
  /** the look's shapes on a figure, and its skeleton moved to that body (before its moves are solved) */
  const fitLook = (f: Figure) => {
    const w8 = shapeWeights(look);
    for (const s of f.shaped) applyShapes(s, w8);
    shapeBody(f, w8);
  };
  fitLook(fig);
  let kbTotal = fig.kb;
  let gone = false;
  let cur: { move: Move; loop: THREE.AnimationAction; intro: THREE.AnimationAction | null; looping: boolean } | null = null;
  const held = new Map<PropId, Held>();
  let lastFps = 0;

  const w = el.clientWidth || 300;
  const h = el.clientHeight || 400;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(o.ratio);
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.touchAction = "pan-y";
  renderer.domElement.setAttribute("aria-label", "3D");
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // the turn the drag gives, kept when the figure is swapped for the other body
  const turn = new THREE.Group();
  scene.add(turn);
  turn.add(fig.root);
  turn.updateMatrixWorld(true);
  const bone = (n: string) => fig.bones.get(n);

  // every figure's eyes are drawn at the same height (site/scripts/figure/human.mjs), so the camera
  // stands where that body fits: the whole of it, feet on the floor, with room for the tallest the
  // sliders make (12% taller), so a taller or shorter body shows as one
  const tall = ((fig.base.get("LeftEye")?.y ?? 1.7257) + 0.13) * 1.06;
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.05, 50);
  const bodyCam = { at: new THREE.Vector3(), look: new THREE.Vector3() };
  const fit = () => {
    const half = Math.tan((camera.fov * Math.PI) / 360);
    const vertical = tall / 2 / half;
    // a person's moves reach about 3/4 of their height across
    const horizontal = (tall * 0.75) / 2 / half / camera.aspect;
    const dist = Math.max(vertical, horizontal) * 1.2;
    bodyCam.at.set(0, tall * 0.55, dist);
    bodyCam.look.set(0, tall * 0.5, 0);
  };
  fit();
  // up close: the head (about 0.34 m with the hair) filling most of the height, or 0.3 m across;
  // for hair, twice as far and a little lower, to see the head and shoulders
  const faceCam = { at: new THREE.Vector3(), look: new THREE.Vector3(), seen: false };
  const bustCam = { at: new THREE.Vector3(), look: new THREE.Vector3() };
  const faceDist = () => {
    const half = Math.tan((camera.fov * Math.PI) / 360);
    return Math.max(0.155 / half, 0.14 / half / camera.aspect);
  };
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let viewNow: View = o.view ?? "body";
  const camAt = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camSet = false;
  const tmpE = new THREE.Vector3();
  const tmpM = new THREE.Vector3();
  const placeCamera = (dt: number) => {
    // the face: between the eyes, followed softly as the head moves
    const l = bone("LeftEye");
    const r = bone("RightEye");
    if (l && r) {
      l.getWorldPosition(tmpE);
      r.getWorldPosition(tmpM).add(tmpE).multiplyScalar(0.5);
      tmpM.y -= 0.035;
      faceCam.look.lerp(tmpM, faceCam.seen ? 1 - Math.exp(-dt / 0.15) : 1);
      faceCam.seen = true;
      const d = faceDist();
      faceCam.at.copy(faceCam.look).add(tmpE.set(0, 0.02, d));
      bustCam.look.copy(faceCam.look).add(tmpE.set(0, -0.13, 0));
      bustCam.at.copy(bustCam.look).add(tmpE.set(0, 0.05, d * 2.3));
    }
    const want = viewNow === "face" && faceCam.seen ? faceCam : viewNow === "bust" && faceCam.seen ? bustCam : bodyCam;
    const k = still || !camSet ? 1 : 1 - Math.exp(-dt / 0.2);
    camSet = true;
    camAt.lerp(want.at, k);
    camLook.lerp(want.look, k);
    camera.position.copy(camAt);
    camera.lookAt(camLook);
  };

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1840, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(2.5, 5, 4);
  scene.add(key);
  // a soft light from the other side, so a face up close isn't half in shadow
  const fill = new THREE.DirectionalLight(0xfff1e6, 0.7);
  fill.position.set(-2, 2, 5);
  scene.add(fill);
  // the room light of /me, from behind
  const rim = new THREE.DirectionalLight(0xff9cc5, 1.6);
  rim.position.set(-4, 3, -3);
  scene.add(rim);
  // a soft shadow under the feet, so it stands on something
  const pad = document.createElement("canvas");
  pad.width = pad.height = 128;
  const g = pad.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(0,0,0,0.6)");
    grd.addColorStop(0.6, "rgba(0,0,0,0.25)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }
  const shadowTex = new THREE.CanvasTexture(pad);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(tall * 0.9, tall * 0.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.005;
  scene.add(shadow);

  const tris = () => {
    let n = 0;
    for (const m of fig.meshes) if (m.visible) n += Math.round((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3);
    return n;
  };

  // ---- the look: the sliders' shapes (mixed at most once a frame), skin and hair colours, the hairstyle
  let shapeDirty = true;
  let hairWanted: HairId = look.hair;
  const loadingHair = new Set<string>();
  const paint = () => {
    const skin = SKINS[look.skin] ?? SKINS[3];
    const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[1];
    const shirt = SHIRT_COLORS[look.shirt] ?? SHIRT_COLORS[0];
    const pants = PANTS_COLORS[look.pants] ?? PANTS_COLORS[0];
    for (const m of fig.meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      const t = mat.userData.tint;
      if (t === "skin") tint(mat, skin);
      else if (t === "hair") tint(mat, hair);
      // eyebrows a shade darker than the hair
      else if (t === "brow") tint(mat, hair, 0.55);
      else if (t === "shirt") tint(mat, shirt);
      else if (t === "pants") tint(mat, pants);
    }
    wantEyes(look.eyes);
  };
  // the eyes: their own texture, or another colour's, loaded once when picked (kept for the other body too)
  const eyeMaps = new Map<string, Promise<THREE.Texture | null>>();
  const eyeLoader = new THREE.TextureLoader();
  const wantEyes = (i: number) => {
    const id = EYE_COLORS[i]?.id ?? "brown";
    const eyes = fig.meshes.find((m) => m.name === "Eyes");
    if (!eyes) return;
    const mat = eyes.material as THREE.MeshStandardMaterial;
    if (!mat.userData.ownMap) mat.userData.ownMap = mat.map;
    if (mat.userData.eyes === id) return;
    mat.userData.eyes = id;
    if (i <= 0) {
      mat.map = mat.userData.ownMap;
      return;
    }
    let p = eyeMaps.get(id);
    if (!p) {
      p = eyeLoader
        .loadAsync(eyeFile(id))
        .then((t) => {
          // as the model's own textures are read: not flipped, in sRGB
          t.flipY = false;
          t.colorSpace = THREE.SRGBColorSpace;
          return t;
        })
        .catch((e) => {
          if (import.meta.env.DEV) console.error("eyes", e);
          eyeMaps.delete(id);
          return null;
        });
      eyeMaps.set(id, p);
    }
    void p.then((t) => {
      if (t && !gone && mat.userData.eyes === id) mat.map = t;
    });
  };
  // the hair on show: the wanted one once it's here (until then the one before stays on)
  let hairShown: HairId = look.hair;
  const showHair = () => {
    if (hairWanted === "none" || fig.hairs.has(hairWanted)) hairShown = hairWanted;
    else if (!fig.hairs.has(hairShown)) hairShown = "none";
    for (const [id, m] of fig.hairs) m.visible = id === hairShown;
  };
  const wantHair = (id: HairId) => {
    hairWanted = id;
    showHair();
    if (id === "none" || fig.hairs.has(id)) return;
    const f = fig;
    const k = `${f.sex}:${id}`;
    if (loadingHair.has(k)) return;
    loadingHair.add(k);
    void (async () => {
      try {
        const url = hairFile(id, f.sex);
        const { bytes, kb } = await fetchModel(url);
        const gltf = await loader.parseAsync(bytes, url.slice(0, url.lastIndexOf("/") + 1));
        let found: THREE.SkinnedMesh | null = null;
        gltf.scene.traverse((x) => {
          if ((x as THREE.SkinnedMesh).isSkinnedMesh) found = x as THREE.SkinnedMesh;
        });
        const hm = found as THREE.SkinnedMesh | null;
        if (!hm || f !== fig || gone) return;
        // onto this figure's own bones, by name (the file's bind matrices: the same rest pose)
        const bones = hm.skeleton.bones.map((b) => f.bones.get(b.name) as THREE.Bone | undefined);
        if (bones.some((b) => !b)) return;
        hm.bind(new THREE.Skeleton(bones as THREE.Bone[], hm.skeleton.boneInverses), hm.bindMatrix);
        hm.removeFromParent();
        f.root.add(hm);
        const s = adopt(f, hm);
        if (s) applyShapes(s, shapeWeights(look));
        f.hairs.set(id, hm);
        kbTotal += kb;
        paint();
        showHair();
      } catch (e) {
        if (import.meta.env.DEV) console.error("hair", e);
      } finally {
        loadingHair.delete(k);
      }
    })();
  };
  let swapping: Sex | null = null;
  const setLook = (next: Look) => {
    const before = look;
    look = next;
    if (next.sex !== fig.sex) {
      void swap(next.sex);
      return;
    }
    if (JSON.stringify(before.shape) !== JSON.stringify(next.shape)) shapeDirty = true;
    paint();
    wantHair(next.hair);
  };
  // the other body: loaded, then swapped in where this one stood, doing the same move
  const swap = async (sex: Sex) => {
    if (swapping === sex) return;
    swapping = sex;
    try {
      const next = await loadFigure(sex);
      if (gone || look.sex !== sex) {
        disposeFigure(next);
        return;
      }
      for (const x of held.values()) {
        x.obj.removeFromParent();
        disposeProp(x.obj);
      }
      held.clear();
      fitLook(next);
      const old = fig;
      fig = next;
      listen(next);
      kbTotal += next.kb;
      turn.add(next.root);
      disposeFigure(old);
      shapeDirty = true;
      paint();
      wantHair(look.hair);
      const id = cur?.move.id ?? o.first;
      cur = null;
      play(id);
      o.onStats({ kb: kbTotal, tris: tris(), fps: lastFps });
    } catch (e) {
      if (import.meta.env.DEV) console.error("figure", e);
    } finally {
      if (swapping === sex) swapping = null;
    }
  };

  // ---- moves
  const FADE = 0.35;
  const play = (id: string) => {
    const move = moveOf(id);
    if (cur?.move === move) return;
    const loop = actionFor(fig, move.clip ?? move.id) ?? actionFor(fig, "stand");
    if (!loop) return;
    const intro = move.intro ? actionFor(fig, move.intro) : null;
    for (const a of fig.actions.values()) if (a.isRunning() && a.getEffectiveWeight() > 0) a.fadeOut(FADE);
    const first = intro ?? loop;
    first.reset();
    first.setLoop(intro ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    first.clampWhenFinished = !!intro;
    first.fadeIn(FADE).play();
    cur = { move, loop, intro, looping: !intro };
    // the flash counts from this move's start (not where the last one's loop had got to)
    lastT = -1;
    floaters.fadeAll();
    holding(move.props ?? []);
    o.onMove?.(move.id);
  };
  function listen(f: Figure) {
    f.mixer.addEventListener("finished", (e) => {
      if (cur?.intro && e.action === cur.intro && !cur.looping) {
        cur.looping = true;
        cur.loop.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
        cur.intro.fadeOut(0.2);
      }
    });
  }
  listen(fig);

  // ---- the face: each move's expression, eased in; a blink every few seconds unless the eyes are shut
  const face = new Map<Expr, number>(EXPRS.map((x) => [x, 0]));
  let blinkIn = 1.5 + Math.random() * 2;
  let blinkT = -1;
  const faceFrame = (dt: number) => {
    const m = cur?.move;
    const want = (m && cur && !cur.looping && cur.intro ? (m.introFace ?? m.face) : m?.face) ?? {};
    const k = 1 - Math.exp(-dt / 0.14);
    for (const x of EXPRS) face.set(x, (face.get(x) ?? 0) + ((want[x] ?? 0) - (face.get(x) ?? 0)) * k);
    let blink = 0;
    if ((want.blinkL ?? 0) < 0.5) {
      blinkIn -= dt;
      if (blinkIn <= 0 && blinkT < 0) {
        blinkT = 0;
        blinkIn = 2 + Math.random() * 3.5;
        if (import.meta.env.DEV) {
          const win = window as unknown as { __figBlinks?: number };
          win.__figBlinks = (win.__figBlinks ?? 0) + 1;
        }
      }
      if (blinkT >= 0) {
        blinkT += dt;
        const d = 0.17;
        blink = blinkT < d * 0.4 ? blinkT / (d * 0.4) : Math.max(0, 1 - (blinkT - d * 0.4) / (d * 0.6));
        if (blinkT > d) blinkT = -1;
      }
    }
    for (const m2 of fig.meshes) {
      const dict = m2.morphTargetDictionary;
      const inf = m2.morphTargetInfluences;
      if (!dict || !inf) continue;
      for (const x of EXPRS) {
        const i = dict[`X_${x}`];
        if (i === undefined) continue;
        let v = face.get(x) ?? 0;
        if (x === "blinkL" || x === "blinkR") v = Math.max(v, blink);
        inf[i] = v;
      }
    }
  };

  // ---- props: they grow into the hand as a move starts, and shrink away when it ends
  const holding = (ids: readonly PropId[]) => {
    for (const [id, x] of held) if (!ids.includes(id)) x.going = true;
    for (const id of ids) {
      const anchor = bone(ANCHOR[id]);
      if (!anchor) continue;
      let x = held.get(id);
      if (!x) {
        x = { obj: makeProp(id), k: 0, going: false };
        x.obj.scale.setScalar(0.001);
        anchor.add(x.obj);
        held.set(id, x);
      }
      x.going = false;
    }
  };
  const growProps = (dt: number) => {
    for (const [id, x] of held) {
      x.k = Math.min(1, Math.max(0, x.k + (x.going ? -dt / 0.2 : dt / 0.25)));
      x.obj.scale.setScalar(Math.max(0.001, x.going ? x.k : 1 - Math.pow(1 - x.k, 3)));
      if (x.going && x.k === 0) {
        x.obj.removeFromParent();
        disposeProp(x.obj);
        held.delete(id);
      }
    }
  };

  // ---- what floats off it, the sword's streak, the phone's flash
  const floaters = new Floaters(scene);
  const trail = new Trail(scene);
  const flashLight = new THREE.PointLight(0xffffff, 0, 2.5);
  scene.add(flashLight);
  let flashK = 0;
  let since = 0;
  let lastT = 0;
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const effects = (dt: number) => {
    if (!cur) return;
    const m = cur.move;
    const t = cur.looping ? cur.loop.time : -1;
    const gripR = bone("Grip_R");
    const head = bone("Head");
    const headAnchor = bone("Head_Anchor") ?? head;
    // the flash: when the loop passes one of its times
    if (m.flash && cur.looping && gripR) {
      for (const f of m.flash) {
        const passed = lastT <= t ? lastT < f && f <= t : lastT < f || f <= t;
        if (passed) {
          flashK = 1;
          o.flash?.();
          if (import.meta.env.DEV) {
            const win = window as unknown as { __figFlashes?: number };
            win.__figFlashes = (win.__figFlashes ?? 0) + 1;
          }
        }
      }
    }
    lastT = t;
    if (flashK > 0 && gripR) {
      gripR.getWorldPosition(flashLight.position);
      flashLight.intensity = 30 * flashK;
      flashK = Math.max(0, flashK - dt / 0.18);
    } else flashLight.intensity = 0;
    // floaters, every so often while the loop runs (not during an intro)
    const fx = m.fx;
    if (fx && cur.looping && (!fx.during || (t >= fx.during[0] && t <= fx.during[1]))) {
      since += dt;
      while (since >= fx.every) {
        since -= fx.every;
        if (fx.from === "eyes") {
          for (const [i, n] of ["LeftEye", "RightEye"].entries()) {
            const e = bone(n);
            if (!e) continue;
            e.getWorldPosition(tmp);
            // outward from each eye, in the head's own sideways direction
            const out = new THREE.Vector3(i === 0 ? 1 : -1, 0, 0).transformDirection(headAnchor?.matrixWorld ?? new THREE.Matrix4());
            floaters.spawn(fx.kind, tmp, out);
          }
        } else if (fx.from === "hand" && gripR) floaters.spawn(fx.kind, gripR.getWorldPosition(tmp).add(new THREE.Vector3(0, 0.08, 0)));
        else if (head) floaters.spawn(fx.kind, head.getWorldPosition(tmp).add(new THREE.Vector3(fx.kind === "z" ? 0.04 : 0, fx.kind === "z" ? 0.2 : 0.3, 0)));
      }
    } else since = 0;
    floaters.update(dt);
    // the sword's streak, from the guard to the tip
    const sw = held.get("sword");
    if (m.trail && sw && !sw.going) {
      sw.obj.updateWorldMatrix(true, false);
      trail.push(dt, tmp.set(0, 0.25, 0).applyMatrix4(sw.obj.matrixWorld), tmp2.set(0, 0.82, 0).applyMatrix4(sw.obj.matrixWorld));
    } else trail.push(dt, null);
  };

  // ---- dragging sideways turns the figure; it keeps turning a little after (not with reduced motion)
  let dragging = false;
  let lastX = 0;
  let spin = 0;
  const canvas = renderer.domElement;
  // turned back to face the camera (for sculpting), unless a drag takes over
  let turnTo: number | null = null;
  const down = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    spin = 0;
    turnTo = null;
    canvas.setPointerCapture(e.pointerId);
  };
  const moved = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    spin = dx * 0.012;
    turn.rotation.y += spin;
  };
  const up = () => {
    dragging = false;
    if (still) spin = 0;
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", moved);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);

  const ro = new ResizeObserver(() => {
    const nw = el.clientWidth || w;
    const nh = el.clientHeight || h;
    renderer.setSize(nw, nh);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    fit();
  });
  ro.observe(el);

  // the sliders' shapes, mixed at most once a frame; the skeleton follows the body sliders a moment
  // after they stop (the moves are solved again for it), not on every step of a drag
  let bodyAt = 0;
  const reshape = () => {
    if (shapeDirty) {
      const w8 = shapeWeights(look);
      for (const s of fig.shaped) applyShapes(s, w8);
      shapeDirty = false;
      if (bodyKey(fig.joints, w8) !== fig.bodyKey) bodyAt = performance.now();
    }
    if (bodyAt && performance.now() - bodyAt > 150) {
      bodyAt = 0;
      if (shapeBody(fig, shapeWeights(look))) resolveMoves();
    }
  };
  // every move solved again for the body on show: the one playing at once, from where it was
  const resolveMoves = () => {
    const was = cur;
    const t = was ? (was.intro && !was.looping ? was.intro : was.loop).time : 0;
    fig.mixer.stopAllAction();
    for (const a of fig.actions.values()) fig.mixer.uncacheClip(a.getClip());
    fig.actions.clear();
    fig.solving.clear();
    fig.toSolve = [...ALL_CLIPS];
    if (!was) return;
    const loop = actionFor(fig, was.move.clip ?? was.move.id) ?? actionFor(fig, "stand");
    if (!loop) return;
    const intro = was.move.intro ? actionFor(fig, was.move.intro) : null;
    const now = intro && !was.looping ? intro : loop;
    now.reset();
    now.setLoop(now === intro ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    now.clampWhenFinished = now === intro;
    now.time = t;
    now.setEffectiveWeight(1).play();
    cur = { move: was.move, loop, intro, looping: was.looping };
  };

  // the checks hold a move still at a time, to look at it (development builds only)
  let paused = false;
  if (import.meta.env.DEV) {
    const win = window as unknown as Record<string, unknown>;
    win.__figSeek = (id: string, t: number, yaw = 0, intro = false) => {
      paused = true;
      const m = moveOf(id);
      fig.mixer.stopAllAction();
      const a = actionFor(fig, intro && m.intro ? m.intro : m.clip ?? m.id);
      if (!a) return false;
      a.reset().setEffectiveWeight(1).play();
      a.time = t;
      fig.mixer.update(0);
      holding(m.props ?? []);
      for (const x of held.values()) {
        x.k = x.going ? 0 : 1;
        x.obj.scale.setScalar(x.going ? 0.001 : 1);
      }
      floaters.clear();
      trail.push(0, null);
      reshape();
      cur = { move: m, loop: a, intro: intro ? a : null, looping: !intro };
      faceFrame(10);
      turn.rotation.y = (yaw * Math.PI) / 180;
      turn.updateMatrixWorld(true);
      placeCamera(10);
      renderer.render(scene, camera);
      return true;
    };
    // a closer look for the checks: the camera at (x, y, z) looking at (tx, ty, tz); nothing given puts it back
    win.__figCam = (x?: number, y?: number, z?: number, tx = 0, ty = 1, tz = 0) => {
      if (x === undefined || y === undefined || z === undefined) placeCamera(10);
      else {
        camera.position.set(x, y, z);
        camera.lookAt(tx, ty, tz);
      }
      renderer.render(scene, camera);
    };
    // a mesh shown or hidden (to see what's under the clothes)
    win.__figShow = (name: string, on: boolean) => {
      for (const m of fig.meshes) if (m.name === name) m.visible = on;
      renderer.render(scene, camera);
    };
    // where a bone is in the world (for the checks' cameras)
    win.__figBone = (name: string) => {
      const b = bone(name);
      return b ? b.getWorldPosition(new THREE.Vector3()).toArray().map((x) => Math.round(x * 1000) / 1000) : null;
    };
    win.__figResume = () => {
      paused = false;
      cur = null;
    };
  }

  paint();
  wantHair(look.hair);
  play(o.first);
  const clock = new THREE.Clock();
  let frames = 0;
  let since1 = performance.now();
  let told = false;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta());
    if (paused) return;
    if (!dragging && spin !== 0) {
      turn.rotation.y += spin;
      spin *= 0.9;
      if (Math.abs(spin) < 0.0005) spin = 0;
    }
    if (turnTo !== null && !dragging) {
      const d = turnTo - turn.rotation.y;
      turn.rotation.y = still || Math.abs(d) < 0.002 ? turnTo : turn.rotation.y + d * (1 - Math.exp(-dt / 0.2));
      if (turn.rotation.y === turnTo) turnTo = null;
    }
    reshape();
    fig.mixer.update(dt);
    growProps(dt);
    faceFrame(dt);
    turn.updateMatrixWorld(true);
    placeCamera(dt);
    effects(dt);
    renderer.render(scene, camera);
    // the moves not picked yet, solved a little each frame
    solveSome(fig, 3);
    if (import.meta.env.DEV) {
      const win = window as unknown as Record<string, unknown>;
      win.__figTurn = turn.rotation.y;
      win.__figToSolve = fig.toSolve.length;
      win.__figBody = fig.bodyKey;
      win.__figEyeY = Math.round((fig.heads.get("LeftEye")?.y ?? 0) * 1000) / 1000;
      win.__figEyes = ((fig.meshes.find((m) => m.name === "Eyes")?.material as THREE.MeshStandardMaterial | undefined)?.userData.eyes as string | undefined) ?? "brown";
      const shirtMat = fig.meshes.find((m) => m.name === "Shirt")?.material as THREE.MeshStandardMaterial | undefined;
      win.__figShirt = shirtMat ? shirtMat.color.getHexString() : null;
      win.__figHeld = [...held].filter(([, x]) => !x.going && x.k === 1).map(([id]) => id);
      win.__figFloaters = floaters.count;
      win.__figLooping = cur?.looping ?? false;
      win.__figSex = fig.sex;
      win.__figHair = [...fig.hairs].find(([, m]) => m.visible)?.[0] ?? "none";
      win.__figFace = Object.fromEntries([...face].map(([k, v]) => [k, Math.round(v * 100) / 100]));
      win.__figView = viewNow;
      win.__figCamZ = Math.round(camera.position.z * 1000) / 1000;
      win.__figClips = CLIPS.map((c) => [c.name, c.dur]);
      win.__figInside = fig.rig.inside;
      const body = fig.meshes.find((m) => m.name === "Body");
      win.__figSkin = body ? (body.material as THREE.MeshStandardMaterial).color.getHexString() : null;
      // a number that changes when the sliders reshape the face
      const p = body?.geometry.attributes.position.array as ArrayLike<number> | undefined;
      let sum = 0;
      if (p) for (let i = 0; i < p.length; i += 7) sum += p[i];
      win.__figShapeSum = Math.round(sum * 1000) / 1000;
    }
    frames++;
    const now = performance.now();
    if (!told) {
      told = true;
      o.onFirstFrame();
      o.onStats({ kb: kbTotal, tris: tris(), fps: 0 });
    }
    if (now - since1 >= 1000) {
      lastFps = Math.round((frames * 1000) / (now - since1));
      frames = 0;
      since1 = now;
      o.onStats({ kb: kbTotal, tris: tris(), fps: lastFps });
      if (import.meta.env.DEV) (window as unknown as { __figFps?: number }).__figFps = lastFps;
    }
  });

  return {
    play,
    setLook,
    view(v) {
      if (v !== viewNow && v !== "body") {
        // the face to the camera: the nearest whole turn
        spin = 0;
        turnTo = Math.round(turn.rotation.y / (Math.PI * 2)) * Math.PI * 2;
      }
      viewNow = v;
    },
    dispose() {
      gone = true;
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", moved);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      floaters.dispose();
      trail.dispose();
      for (const x of held.values()) disposeProp(x.obj);
      disposeFigure(fig);
      for (const p of eyeMaps.values()) void p.then((t) => t?.dispose());
      shadow.geometry.dispose();
      (shadow.material as THREE.Material).dispose();
      shadowTex.dispose();
      renderer.dispose();
      // the graphics context back at once (a phone keeps few)
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

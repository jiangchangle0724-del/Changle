import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { Floaters, Trail } from "./fx";
import { ANCHOR, disposeProp, makeProp } from "./props";
import { MODEL, moveOf, type Move, type PropId } from "./moves";

export type StageStats = { kb: number; tris: number; fps: number };

/**
 * The model comes gzipped (Cloudflare doesn't compress .glb files, and the moves' JSON shrinks a
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
export type Stage = { play(id: string): void; dispose(): void };

type Held = { obj: THREE.Object3D; k: number; going: boolean };

/**
 * The figure's little 3D room, with three.js (this module and three.js load only once a page asks
 * for the figure): the model, its moves cross-faded, what it holds, what floats off it, and a drag
 * sideways to turn it. Separate from React so another game can mount the same figure.
 */
export async function mountStage(
  el: HTMLElement,
  o: { ratio: number; first: string; onFirstFrame(): void; onStats(s: StageStats): void; onMove?(id: string): void; flash?(): void },
): Promise<Stage> {
  const { bytes, kb } = await fetchModel(MODEL);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(bytes, MODEL.slice(0, MODEL.lastIndexOf("/") + 1));

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
  const figure = gltf.scene;
  scene.add(figure);
  // the figure's size decides where the camera stands: the whole body in view, feet on the floor
  const bounds = new THREE.Box3().setFromObject(figure);
  const size = bounds.getSize(new THREE.Vector3());
  figure.position.y -= bounds.min.y;
  const tall = size.y || 1.8;
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
  // (the model's own width is its T-pose, arms out; a person's moves reach about 3/4 of their height)
  const fit = () => {
    const vertical = tall / 2 / Math.tan((camera.fov * Math.PI) / 360);
    const horizontal = (tall * 0.75) / 2 / Math.tan((camera.fov * Math.PI) / 360) / camera.aspect;
    const dist = Math.max(vertical, horizontal) * 1.2;
    camera.position.set(0, tall * 0.55, dist);
    camera.lookAt(0, tall * 0.5, 0);
  };
  fit();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1840, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.5, 5, 4);
  scene.add(key);
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

  let tris = 0;
  figure.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) {
      const geo = m.geometry;
      tris += Math.round((geo.index ? geo.index.count : geo.attributes.position.count) / 3);
      m.frustumCulled = false;
    }
  });
  const bone = (n: string) => figure.getObjectByName(n);
  const head = bone("Head");
  const headAnchor = bone("Head_Anchor") ?? head;
  const eyes = [bone("LeftEye"), bone("RightEye")].filter(Boolean) as THREE.Object3D[];
  const gripR = bone("Grip_R");

  // ---- moves
  const mixer = new THREE.AnimationMixer(figure);
  const actions = new Map(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
  const FADE = 0.35;
  let cur: { move: Move; loop: THREE.AnimationAction; intro: THREE.AnimationAction | null; looping: boolean } | null = null;
  const play = (id: string) => {
    const move = moveOf(id);
    if (cur?.move === move) return;
    const loop = actions.get(move.clip ?? move.id) ?? actions.get("stand");
    if (!loop) return;
    const intro = move.intro ? actions.get(move.intro) ?? null : null;
    for (const a of actions.values()) if (a.isRunning() && a.getEffectiveWeight() > 0) a.fadeOut(FADE);
    const first = intro ?? loop;
    first.reset();
    first.setLoop(intro ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    first.clampWhenFinished = !!intro;
    first.fadeIn(FADE).play();
    cur = { move, loop, intro, looping: !intro };
    floaters.fadeAll();
    holding(move.props ?? []);
    o.onMove?.(move.id);
  };
  mixer.addEventListener("finished", (e) => {
    if (cur?.intro && e.action === cur.intro && !cur.looping) {
      cur.looping = true;
      cur.loop.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
      cur.intro.fadeOut(0.2);
    }
  });

  // ---- props: they grow into the hand as a move starts, and shrink away when it ends
  const held = new Map<PropId, Held>();
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
          for (const [i, e] of eyes.entries()) {
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
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let dragging = false;
  let lastX = 0;
  let spin = 0;
  const canvas = renderer.domElement;
  const down = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    spin = 0;
    canvas.setPointerCapture(e.pointerId);
  };
  const moved = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    spin = dx * 0.012;
    figure.rotation.y += spin;
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

  // the checks hold a move still at a time, to look at it (development builds only)
  let paused = false;
  if (import.meta.env.DEV) {
    const win = window as unknown as Record<string, unknown>;
    win.__figSeek = (id: string, t: number, yaw = 0, intro = false) => {
      paused = true;
      const m = moveOf(id);
      mixer.stopAllAction();
      const a = actions.get(intro && m.intro ? m.intro : m.clip ?? m.id);
      if (!a) return false;
      a.reset().setEffectiveWeight(1).play();
      a.time = t;
      mixer.update(0);
      holding(m.props ?? []);
      for (const x of held.values()) {
        x.k = x.going ? 0 : 1;
        x.obj.scale.setScalar(x.going ? 0.001 : 1);
      }
      floaters.clear();
      trail.push(0, null);
      figure.rotation.y = (yaw * Math.PI) / 180;
      renderer.render(scene, camera);
      return true;
    };
    // a closer look for the checks: the camera at (x, y, z) looking at (tx, ty, tz); nothing given puts it back
    win.__figCam = (x?: number, y?: number, z?: number, tx = 0, ty = 1, tz = 0) => {
      if (x === undefined || y === undefined || z === undefined) fit();
      else {
        camera.position.set(x, y, z);
        camera.lookAt(tx, ty, tz);
      }
      renderer.render(scene, camera);
    };
    win.__figResume = () => {
      paused = false;
      cur = null;
    };
    win.__figClips = gltf.animations.map((c) => [c.name, c.duration]);
  }

  play(o.first);
  const clock = new THREE.Clock();
  let frames = 0;
  let since1 = performance.now();
  let told = false;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta());
    if (paused) return;
    if (!dragging && spin !== 0) {
      figure.rotation.y += spin;
      spin *= 0.9;
      if (Math.abs(spin) < 0.0005) spin = 0;
    }
    mixer.update(dt);
    growProps(dt);
    effects(dt);
    renderer.render(scene, camera);
    if (import.meta.env.DEV) {
      const win = window as unknown as Record<string, unknown>;
      win.__figTurn = figure.rotation.y;
      win.__figHeld = [...held].filter(([, x]) => !x.going && x.k === 1).map(([id]) => id);
      win.__figFloaters = floaters.count;
      win.__figLooping = cur?.looping ?? false;
    }
    frames++;
    const now = performance.now();
    if (!told) {
      told = true;
      o.onFirstFrame();
      o.onStats({ kb, tris, fps: 0 });
    }
    if (now - since1 >= 1000) {
      const fps = Math.round((frames * 1000) / (now - since1));
      frames = 0;
      since1 = now;
      o.onStats({ kb, tris, fps });
      if (import.meta.env.DEV) (window as unknown as { __figFps?: number }).__figFps = fps;
    }
  });

  return {
    play,
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", moved);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      mixer.stopAllAction();
      floaters.dispose();
      trail.dispose();
      for (const x of held.values()) disposeProp(x.obj);
      scene.traverse((x) => {
        const m = x as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
            (mat as THREE.MeshStandardMaterial).map?.dispose();
            mat.dispose();
          }
        }
      });
      shadowTex.dispose();
      renderer.dispose();
      // the graphics context back at once (a phone keeps few)
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}

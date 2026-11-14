import { useEffect, useRef } from "react";
import { glOf, ratioFor } from "../../party/dj/robot3d";
import { MODEL, type MoveId } from "./moves";

/** How the figure turned out, for the page and the checks (figure_check.py). */
export type FigureIs = "loading" | "on" | "none" | "software" | "failed";
/** What the page shows under the figure: the file's size, the model's triangles, frames a second, the engine's download. */
export type FigureStats = { kb: number; tris: number; fps: number; engineKb: number };

/** The checks' browsers draw WebGL in software only: they take the figure anyway. */
const anyGl = () => import.meta.env.DEV && (window as unknown as { __figAnyGl?: boolean }).__figAnyGl === true;
const tell = (is: FigureIs, move?: string) => {
  if (import.meta.env.DEV) {
    const w = window as unknown as { __figIs?: FigureIs; __figMove?: string };
    w.__figIs = is;
    if (move) w.__figMove = move;
  }
};

/** How much of three.js and the loader came down for this page (the files are named after their modules). */
function engineKb(): number {
  try {
    const rs = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const mine = rs.filter((r) => /three\.module|GLTFLoader|meshopt|FigurePage|Figure3D/i.test(r.name) && /\.js(\?|$)/.test(r.name));
    return Math.round(mine.reduce((n, r) => n + (r.transferSize || r.encodedBodySize || 0), 0) / 1024);
  } catch {
    return 0;
  }
}

/**
 * The 3D figure (the prototype, Steve on Nov 13): one stand-in model with its moves, drawn with
 * three.js, which loads only here, after the page. Drag sideways to turn it round; swiping up and
 * down still scrolls the page (touch-action: pan-y), and two fingers still zoom the page. No
 * graphics chip, or the model can't load: `onIs` says so and the page explains.
 */
export function Figure3D({ move, onIs, onStats }: { move: MoveId; onIs: (is: FigureIs) => void; onStats: (s: FigureStats) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const is = useRef(onIs);
  const stats = useRef(onStats);
  is.current = onIs;
  stats.current = onStats;
  const wanted = useRef<MoveId>(move);
  wanted.current = move;
  /** set once the scene is up: plays a move, cross-faded from the one before */
  const apply = useRef<((id: MoveId) => void) | null>(null);

  useEffect(() => {
    apply.current?.(move);
  }, [move]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const gl = glOf();
    if (gl === "none" || (gl === "software" && !anyGl())) {
      tell(gl);
      is.current(gl);
      return;
    }
    tell("loading");
    let gone = false;
    let stop = () => {};
    void (async () => {
      try {
        const THREE = await import("three");
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js")]);
        const res = await fetch(MODEL);
        if (!res.ok) throw new Error(`model ${res.status}`);
        const bytes = await res.arrayBuffer();
        if (gone) return;
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        const gltf = await loader.parseAsync(bytes, MODEL.slice(0, MODEL.lastIndexOf("/") + 1));
        if (gone) return;

        const w = el.clientWidth || 300;
        const h = el.clientHeight || 400;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(ratioFor(el));
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
          const aspect = camera.aspect;
          const vertical = tall / 2 / Math.tan((camera.fov * Math.PI) / 360);
          const horizontal = (tall * 0.75) / 2 / Math.tan((camera.fov * Math.PI) / 360) / aspect;
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
        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(tall * 0.9, tall * 0.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pad), transparent: true, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.005;
        scene.add(shadow);

        let tris = 0;
        figure.traverse((o) => {
          const m = o as import("three").Mesh;
          if (m.isMesh) {
            const geo = m.geometry;
            tris += Math.round((geo.index ? geo.index.count : geo.attributes.position.count) / 3);
            m.frustumCulled = false;
          }
        });

        const mixer = new THREE.AnimationMixer(figure);
        const actions = new Map(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
        let on: import("three").AnimationAction | null = null;
        const play = (id: MoveId) => {
          const next = actions.get(id) ?? actions.get("stand");
          if (!next || next === on) return;
          next.reset().fadeIn(0.3).play();
          on?.fadeOut(0.3);
          on = next;
          tell("on", id);
        };
        apply.current = play;
        play(wanted.current);

        // dragging sideways turns the figure; it keeps turning a little after (not with reduced motion)
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

        const clock = new THREE.Clock();
        let frames = 0;
        let since = performance.now();
        let fps = 0;
        const kb = Math.round(bytes.byteLength / 1024);
        let told = false;
        renderer.setAnimationLoop(() => {
          const dt = Math.min(0.1, clock.getDelta());
          if (!dragging && spin !== 0) {
            figure.rotation.y += spin;
            spin *= 0.9;
            if (Math.abs(spin) < 0.0005) spin = 0;
          }
          mixer.update(dt);
          renderer.render(scene, camera);
          if (import.meta.env.DEV) (window as unknown as { __figTurn?: number }).__figTurn = figure.rotation.y;
          frames++;
          const now = performance.now();
          if (!told) {
            told = true;
            is.current("on");
            stats.current({ kb, tris, fps: 0, engineKb: engineKb() });
          }
          if (now - since >= 1000) {
            fps = Math.round((frames * 1000) / (now - since));
            frames = 0;
            since = now;
            stats.current({ kb, tris, fps, engineKb: engineKb() });
            if (import.meta.env.DEV) (window as unknown as { __figFps?: number }).__figFps = fps;
          }
        });

        stop = () => {
          renderer.setAnimationLoop(null);
          ro.disconnect();
          canvas.removeEventListener("pointerdown", down);
          canvas.removeEventListener("pointermove", moved);
          canvas.removeEventListener("pointerup", up);
          canvas.removeEventListener("pointercancel", up);
          mixer.stopAllAction();
          scene.traverse((o) => {
            const m = o as import("three").Mesh;
            if (m.isMesh) {
              m.geometry.dispose();
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              for (const mat of mats) {
                const t = (mat as import("three").MeshStandardMaterial).map;
                t?.dispose();
                mat.dispose();
              }
            }
          });
          renderer.dispose();
          // the graphics context back at once (a phone keeps few)
          renderer.forceContextLoss();
          canvas.remove();
          apply.current = null;
        };
      } catch (e) {
        if (import.meta.env.DEV) console.error("figure", e);
        if (!gone) {
          tell("failed");
          is.current("failed");
        }
      }
    })();
    return () => {
      gone = true;
      stop();
    };
  }, []);

  return <div className="fig-canvas" ref={box} />;
}

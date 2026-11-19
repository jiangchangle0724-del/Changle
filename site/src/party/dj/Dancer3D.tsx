import { useEffect, useRef } from "react";
import type { Mood } from "../../shared/dj/dance";
import { danceAt, danceNext, IDLES, idleAt } from "./dancer/dances";
import { anyGl, glOf, ratioFor, SLOW_MS, WATCH_FRAMES, WATCH_MS, watchFrames } from "./robot3d";

type Clock = { beat: () => number; energy: () => number; bpm: () => number };

/** How the dancer turned out (`watching`: her first seconds), for the checks. */
type Is = "trying" | "watching" | "on" | "software" | "none" | "slow" | "failed";
const tell = (is: Is) => {
  if (import.meta.env.DEV) (window as unknown as { __coach3dIs?: Is }).__coach3dIs = is;
};

/** One dance flowing into the next, in seconds. */
const BLEND_S = 0.6;

/**
 * The dancer on the big screen in 3D (Steve on Nov 14: "我要跟真人看起来一样，要达到我给你照片这个水平…
 * 包括动作这些方面都需要去深度优化"; a bar's dancer lifting the room, standing): since Nov 18 the design he
 * chose (a TRELLIS.2 model with the design's photos on it, dancer/her.ts) dancing real dancers' motion
 * capture (dancer/dances.ts): the dance set from the speaker's beat every frame, a beat of the song a
 * beat of the dance; with no song, standing easy. Her rim lights take the room's colour. No graphics
 * chip, her frames too slow, or her files can't load: `onFail` (the robot, then the drawn dancer).
 */
export function Dancer3D({ clock, mood, onReady, onFail }: { clock: Clock; mood: () => Mood; onReady: () => void; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const fail = useRef(onFail);
  const moodNow = useRef(mood);
  ready.current = onReady;
  fail.current = onFail;
  moodNow.current = mood;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const any = anyGl();
    const gl = glOf();
    if (gl === "none" || (gl === "software" && !any)) {
      tell(gl);
      fail.current();
      return;
    }
    tell("trying");
    let gone = false;
    let raf = 0;
    let stop = () => {};
    void (async () => {
      try {
        const [T, { RoomEnvironment }, { loadHer }] = await Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js"), import("./dancer/her")]);
        if (gone) return;
        const her = await loadHer();
        // standing easy before she's shown at all
        const firstIdle = idleAt(0).id;
        await her.learn(firstIdle);
        if (gone) {
          her.dispose();
          return;
        }
        const w = el.clientWidth || 300;
        const h = el.clientHeight || 340;
        const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(ratioFor(el));
        renderer.setSize(w, h);
        renderer.outputColorSpace = T.SRGBColorSpace;
        // (neutral: skin keeps its warmth; the filmic curve the robot uses makes it pale)
        renderer.toneMapping = T.NeutralToneMapping;
        renderer.toneMappingExposure = 1.0;
        el.appendChild(renderer.domElement);
        const scene = new T.Scene();
        // soft reflections, from a room made here (nothing downloaded)
        const pmrem = new T.PMREMGenerator(renderer);
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        scene.environment = env;
        scene.environmentIntensity = 0.35;
        // her colours are a photo's (its studio light in them): mostly an even light, a soft key from the
        // front, and the room's colour from behind on her edges
        scene.add(new T.HemisphereLight(0xfff4f8, 0x2a1d3a, 1.25));
        const key = new T.DirectionalLight(0xfff2e8, 0.9);
        key.position.set(1.6, 3.2, 5);
        scene.add(key);
        const fill = new T.DirectionalLight(0xffeef4, 0.3);
        fill.position.set(-3, 1.5, 4);
        scene.add(fill);
        // the room's light from behind, both sides (the stage's --gel), looked at again now and then
        const stage = el.closest(".dj-stage") ?? document.documentElement;
        const gelNow = () => getComputedStyle(stage).getPropertyValue("--gel").trim() || "#b072ff";
        let gel = gelNow();
        const rim = new T.DirectionalLight(gel, 2.2);
        rim.position.set(-3, 3, -4);
        const rim2 = new T.DirectionalLight(gel, 1.4);
        rim2.position.set(3, 2, -3);
        scene.add(rim, rim2);
        scene.add(her.root);
        // a soft shadow under her, so she stands on something
        const pad = document.createElement("canvas");
        pad.width = pad.height = 64;
        const g2 = pad.getContext("2d");
        if (g2) {
          const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
          grd.addColorStop(0, "rgba(0,0,0,0.55)");
          grd.addColorStop(1, "rgba(0,0,0,0)");
          g2.fillStyle = grd;
          g2.fillRect(0, 0, 64, 64);
        }
        const shadowTex = new T.CanvasTexture(pad);
        const shadow = new T.Mesh(new T.PlaneGeometry(1.1, 0.8), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(0, 0.003, 0);
        scene.add(shadow);

        const camera = new T.PerspectiveCamera(24, w / h, 0.1, 50);
        const tan = Math.tan((camera.fov * Math.PI) / 360);
        // framed to how she dances: her feet to her hands up high, as wide as her arms reach out, turned
        // a little to the room
        const top = 2.0;
        const bottom = -0.04;
        const mid = (top + bottom) / 2;
        camera.position.set(0, mid + 0.1, Math.max(((top - bottom) / 2 / tan) * 1.04, 0.6 / tan / camera.aspect));
        camera.lookAt(0, mid, 0);
        her.root.rotation.y = 0.05;

        let cur = firstIdle;
        let curT = 0;
        let from: { dance: string; t: number; at: number; rate: number } | null = null;
        let gelAt = 0;
        let prev = performance.now();
        const start = prev;
        let watch = watchFrames();
        let watchFrom = 0;
        const gaps: number[] = [];
        const frame = () => {
          const t = performance.now();
          const gap = t - prev;
          const dt = Math.min(0.1, gap / 1000);
          prev = t;
          if (watch) {
            if (!watchFrom) watchFrom = t;
            else if (gap < 1000) gaps.push(gap);
            if (t - watchFrom >= WATCH_MS && gaps.length >= WATCH_FRAMES) {
              watch = false;
              const mid = gaps.sort((x, y) => x - y)[gaps.length >> 1];
              if (mid > SLOW_MS) {
                tell("slow");
                fail.current();
                return;
              }
              tell("on");
            }
          }
          raf = requestAnimationFrame(frame);
          if (t - gelAt > 1000) {
            gelAt = t;
            const g = gelNow();
            if (g !== gel) {
              gel = g;
              rim.color.set(gel);
              rim2.color.set(gel);
            }
          }
          const b = clock.beat();
          const on = Number.isFinite(b) && b >= 0;
          const bpm = clock.bpm() || 120;
          const sec = (t - start) / 1000;
          // the dance for this beat (and the next one fetched ahead); with no song, standing easy at her
          // own tempo
          const idle = idleAt(sec);
          let want = on ? danceAt(Math.floor(b), moodNow.current(), bpm) : idle.id;
          if (on) void her.learn(danceNext(Math.floor(b), moodNow.current(), bpm)).catch(() => {});
          if (!her.knows(want)) {
            void her.learn(want).catch(() => {});
            // (not here yet: what she's dancing goes on)
            want = cur;
          }
          // a dance's time is the song's beat; an idle's, the seconds at its own tempo
          const rateOf = (id: string) => (idleBpm(id) ?? bpm) / 60;
          const tWant = on && idleBpm(want) === undefined ? b : sec * rateOf(want);
          if (want !== cur) {
            // the new one flows in from wherever the last one is
            from = { dance: cur, t: curT, at: t, rate: rateOf(cur) };
            cur = want;
          }
          curT = tWant;
          const k = from ? Math.min(1, (t - from.at) / 1000 / BLEND_S) : 1;
          const ease = k * k * (3 - 2 * k);
          if (from) from.t += dt * from.rate;
          her.pose(cur, curT, from && k < 1 ? from : null, ease);
          if (k >= 1) from = null;
          her.root.updateMatrixWorld(true);
          renderer.render(scene, camera);
          // (the checks read what she dances, and what drawing her costs: dj_dancer_check.py)
          if (import.meta.env.DEV) (window as unknown as { __coach3d?: unknown }).__coach3d = { move: cur, dancing: on, beat: b, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
        };
        tell(watch ? "watching" : "on");
        frame();
        stop = () => {
          cancelAnimationFrame(raf);
          her.dispose();
          shadow.geometry.dispose();
          (shadow.material as import("three").Material).dispose();
          shadowTex.dispose();
          env.dispose();
          renderer.dispose();
          // the graphics context back at once (a phone keeps few)
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        ready.current();
      } catch (e) {
        if (import.meta.env.DEV) console.error("dancer", e);
        if (!gone) {
          tell("failed");
          fail.current();
        }
      }
    })();
    return () => {
      gone = true;
      cancelAnimationFrame(raf);
      stop();
    };
  }, [clock]);
  return <div className="dj-coach-3d" ref={box} aria-hidden="true" />;
}

/** an idle's own tempo (none: a dance, danced on the song's) */
const idleBpm = (id: string) => IDLES.find((i) => i.id === id)?.bpm;

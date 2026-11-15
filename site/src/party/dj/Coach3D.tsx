import { useEffect, useRef } from "react";
import { moveAt, type Mood, type MoveId } from "../../shared/dj/dance";
import { applyPose, buildRobot, setGlow, type Rig } from "./coach/robot";
import { blend, idlePose, POSES, type Pose } from "./coach/poses";
import { anyGl, glOf, ratioFor, SLOW_MS, WATCH_FRAMES, WATCH_MS, watchFrames } from "./robot3d";

type Clock = { beat: () => number; energy: () => number; bpm: () => number };

/** How the coach turned out (`watching`: the robot's first seconds), for the checks. */
type Is = "trying" | "watching" | "on" | "software" | "none" | "slow" | "failed";
const tell = (is: Is) => {
  if (import.meta.env.DEV) (window as unknown as { __coach3dIs?: Is }).__coach3dIs = is;
};

/** One move flowing into the next, in seconds. */
const BLEND_S = 0.55;
/** a blink, and the gaps between blinks */
const BLINK_S = 0.14;

/**
 * The robot in 3D (Steve on Nov 2: "3D 舞者"; Nov 14: "更拟人真实细腻一些"), where the dancer can't be
 * shown (it was 跟着跳's coach till that was taken out on Nov 14): built in coach/robot.ts, dancing the
 * routine's move (coach/poses.ts), set from where the speaker's beat is every frame, so it lands on
 * the beat however the frames fall; one move flows into the next. Its lights take the room's colour.
 * Three.js loads only here, after the page. No graphics chip for it, its frames too slow, or three.js
 * can't load: `onFail`, the drawn dancer. A phone playing the speaker gets it too when its chip keeps
 * up (his TV is an iPhone shown over AirPlay).
 */
export function Coach3D({ clock, mood, onReady, onFail }: { clock: Clock; mood: () => Mood; onReady: () => void; onFail: () => void }) {
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
        const [T, { RoomEnvironment }] = await Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js")]);
        if (gone) return;
        const w = el.clientWidth || 300;
        const h = el.clientHeight || 340;
        const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(ratioFor(el));
        renderer.setSize(w, h);
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        el.appendChild(renderer.domElement);
        const scene = new T.Scene();
        // soft reflections on its shell, from a room made here (nothing downloaded)
        const pmrem = new T.PMREMGenerator(renderer);
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        scene.environment = env;
        scene.environmentIntensity = 0.55;
        scene.add(new T.HemisphereLight(0xfff0ff, 0x281a3a, 0.9));
        const key = new T.DirectionalLight(0xffffff, 2.2);
        key.position.set(2.5, 4, 5);
        scene.add(key);
        const rim = new T.DirectionalLight(0xb072ff, 2.6);
        rim.position.set(-3, 3, -4);
        scene.add(rim);
        // its colour: the room's light (the stage's --gel), looked at again now and then
        const stage = el.closest(".dj-stage") ?? document.documentElement;
        const gelNow = () => getComputedStyle(stage).getPropertyValue("--gel").trim() || "#b072ff";
        let gel = gelNow();
        const rig: Rig = buildRobot(T, gel);
        rim.color.set(gel);
        scene.add(rig.root);
        const camera = new T.PerspectiveCamera(26, w / h, 0.1, 50);
        const tan = Math.tan((camera.fov * Math.PI) / 360);
        // framed to how it dances: its feet to its hands up high, as wide as its arms reach out
        {
          const top = 2.12;
          const bottom = -0.04;
          const mid = (top + bottom) / 2;
          camera.position.set(0, mid + 0.08, Math.max(((top - bottom) / 2 / tan) * 1.03, 0.62 / tan / camera.aspect));
          camera.lookAt(0, mid, 0);
          rig.root.rotation.y = 0.06;
        }

        let cur: MoveId | null = null;
        let from: Pose | null = null;
        let fromAt = 0;
        let last: Pose = idlePose(0);
        let nextBlink = performance.now() + 2500;
        let gelAt = 0;
        let prev = performance.now();
        let watch = watchFrames();
        let watchFrom = 0;
        const gaps: number[] = [];
        const frame = () => {
          const t = performance.now();
          const gap = t - prev;
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
              setGlow(T, rig, gel);
              rim.color.set(gel);
            }
          }
          const b = clock.beat();
          const on = Number.isFinite(b) && b >= 0;
          const want: MoveId | null = on ? moveAt(Math.floor(b), moodNow.current()).move.id : null;
          if (want !== cur) {
            // the new one flows in from wherever it is now
            from = last;
            fromAt = t;
            cur = want;
          }
          const target = cur && on ? POSES[cur](b) : idlePose(t / 1000);
          const k = from ? Math.min(1, (t - fromAt) / 1000 / BLEND_S) : 1;
          const pose = from && k < 1 ? blend(from, target, k * k * (3 - 2 * k)) : target;
          if (k >= 1) from = null;
          last = pose;
          // a blink now and then
          let blink = 0;
          if (t > nextBlink) {
            const u = (t - nextBlink) / 1000 / BLINK_S;
            blink = u < 1 ? Math.sin(Math.PI * u) : 0;
            if (u >= 1) nextBlink = t + 2200 + Math.random() * 3200;
          }
          applyPose(T, rig, pose, blink);
          renderer.render(scene, camera);
          // (the checks read what it dances, and what drawing it costs: dj_dance_check.py)
          if (import.meta.env.DEV) (window as unknown as { __coach3d?: unknown }).__coach3d = { move: cur, beat: b, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
        };
        tell(watch ? "watching" : "on");
        frame();
        stop = () => {
          cancelAnimationFrame(raf);
          rig.dispose();
          env.dispose();
          renderer.dispose();
          // the graphics context back at once (a phone keeps few)
          renderer.forceContextLoss();
          renderer.domElement.remove();
        };
        ready.current();
      } catch {
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

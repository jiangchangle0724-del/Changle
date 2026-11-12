import { useEffect, useRef } from "react";
import { moveAt, type DanceMove } from "../../shared/dj/dance";
import { anyGl, glOf, loadRobot, ratioFor, SLOW_MS, WATCH_FRAMES, WATCH_MS, watchFrames } from "./robot3d";

type Clock = { beat: () => number; energy: () => number; bpm: () => number };

/**
 * Which of the robot's own animations each of the routine's moves is danced with, and how many
 * beats one loop of it takes (it's sped up or slowed down to fit, on the speaker's tempo).
 */
const CLIPS: Record<DanceMove["id"], { clip: string; beats: number }> = {
  stepClap: { clip: "Dance", beats: 4 },
  raiseRoof: { clip: "ThumbsUp", beats: 2 },
  hipSway: { clip: "Dance", beats: 4 },
  fistPump: { clip: "Punch", beats: 2 },
  discoPoint: { clip: "Wave", beats: 4 },
  bounce: { clip: "Jump", beats: 2 },
  waveBoth: { clip: "Wave", beats: 4 },
  twist: { clip: "Dance", beats: 4 },
  runningMan: { clip: "Running", beats: 2 },
  shimmy: { clip: "Yes", beats: 2 },
};

/** How the coach turned out (`watching`: the robot's first seconds), for the checks. */
type Is = "trying" | "watching" | "on" | "software" | "none" | "slow" | "failed";
const tell = (is: Is) => {
  if (import.meta.env.DEV) (window as unknown as { __coach3dIs?: Is }).__coach3dIs = is;
};

/**
 * 跟着跳's coach in 3D (Steve on Nov 2: "3D 舞者", the plan's dancers): a robot dancing the routine's
 * move, each animation stretched to whole beats and set to where the speaker's beat is every frame,
 * so it lands on the beat however the frames fall. Three.js loads only here, after the page. No
 * graphics chip for it, its frames too slow, or the model can't load: `onFail`, the drawn coach.
 * A phone playing the speaker gets it too when its chip keeps up (Steve on Nov 5: his TV is an
 * iPhone shown on a computer over AirPlay, and the robot should dance there).
 */
export function Coach3D({ clock, onReady, onFail }: { clock: Clock; onReady: () => void; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const fail = useRef(onFail);
  ready.current = onReady;
  fail.current = onFail;
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
        const { THREE, gltf, clone } = await loadRobot();
        if (gone) return;
        const w = el.clientWidth || 300;
        const h = el.clientHeight || 330;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(ratioFor(el));
        renderer.setSize(w, h);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        el.appendChild(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
        camera.position.set(0, 3.1, 11.5);
        camera.lookAt(0, 2.4, 0);
        scene.add(new THREE.HemisphereLight(0xffe9ff, 0x2a1840, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.4);
        key.position.set(3, 8, 6);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xb072ff, 2.0);
        rim.position.set(-5, 4, -4);
        scene.add(rim);
        // its own copy: the floor's robots are copied from the same model
        const robot = clone(gltf.scene);
        scene.add(robot);
        const mixer = new THREE.AnimationMixer(robot);
        const actions = new Map(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
        let on: string | null = null;
        const idle = actions.get("Idle");
        idle?.play();
        let last = performance.now();
        let watch = watchFrames();
        let watchFrom = 0;
        const gaps: number[] = [];
        const frame = () => {
          const t = performance.now();
          const gap = t - last;
          last = t;
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
          const dt = Math.min(0.1, gap / 1000);
          const b = clock.beat();
          if (!Number.isFinite(b) || b < 0) {
            // no music: stand by
            if (on) {
              actions.get(on)?.fadeOut(0.4);
              idle?.reset().fadeIn(0.4).play();
              on = null;
            }
            mixer.update(dt);
          } else {
            const c = CLIPS[moveAt(Math.floor(b)).move.id];
            const a = actions.get(c.clip) ?? actions.get("Dance");
            if (a && c.clip !== on) {
              const was = on ? actions.get(on) : idle;
              a.reset().play();
              if (was && was !== a) a.crossFadeFrom(was, 0.25, false);
              on = c.clip;
            }
            if (a) {
              // where in its loop the beat is: the animation set right there, every frame
              const loop = (((b % c.beats) + c.beats) % c.beats) / c.beats;
              a.time = loop * a.getClip().duration;
              a.timeScale = 0;
              // (the checks read what it dances, and where: dj_dance_check.py)
              if (import.meta.env.DEV) (window as unknown as { __coach3d?: unknown }).__coach3d = { clip: on, at: a.time, beat: b };
            }
            mixer.update(dt);
          }
          renderer.render(scene, camera);
        };
        tell(watch ? "watching" : "on");
        frame();
        stop = () => {
          cancelAnimationFrame(raf);
          mixer.stopAllAction();
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

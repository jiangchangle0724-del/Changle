import { useEffect, useRef } from "react";
import { moveAt, type Mood } from "../../shared/dj/dance";
import { outfitFor } from "./dancer/files";
import { anyGl, glOf, ratioFor, SLOW_MS, WATCH_FRAMES, WATCH_MS, watchFrames } from "./robot3d";

type Clock = { beat: () => number; energy: () => number; bpm: () => number };

/** How the dancer turned out (`watching`: her first seconds), for the checks. */
type Is = "trying" | "watching" | "on" | "software" | "none" | "slow" | "failed";
const tell = (is: Is) => {
  if (import.meta.env.DEV) (window as unknown as { __coach3dIs?: Is }).__coach3dIs = is;
};

/** One move flowing into the next (sitting down or standing up included), in seconds. */
const BLEND_S = 0.55;
/** The flash of an outfit changing, in seconds. */
const CHANGE_S = 0.45;

/**
 * 跟着跳's coach as a dancer (Steve on Nov 14: "真人亚洲美女跳舞…很多件衣服和装饰…变装…不能有ai错觉"):
 * MakeHuman's realistic woman (dancer/, site/scripts/dj-dancer/) dancing the routine's move, set from
 * the speaker's beat every frame; a new outfit each song (`song`, the same one for that song
 * everywhere), changed with a flash of light; a stool behind her for the moves danced sitting. The
 * moves are solved here for her body (the accounts' pose solver: her arms never go through her). Her
 * rim lights take the room's colour. No graphics chip, her frames too slow, or her files can't load:
 * `onFail` (the robot, then the drawn coach).
 */
export function Dancer3D({ clock, mood, song, onReady, onFail }: { clock: Clock; mood: () => Mood; song: string | null; onReady: () => void; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const fail = useRef(onFail);
  const moodNow = useRef(mood);
  const songNow = useRef(song);
  ready.current = onReady;
  fail.current = onFail;
  moodNow.current = mood;
  songNow.current = song;
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
        const [T, { RoomEnvironment }, { loadDancer }, { SITTING }] = await Promise.all([
          import("three"),
          import("three/examples/jsm/environments/RoomEnvironment.js"),
          import("./dancer/stage"),
          import("./dancer/moves"),
        ]);
        if (gone) return;
        const dancer = await loadDancer();
        if (gone) {
          dancer.dispose();
          return;
        }
        // her first outfit on, and standing solved, before she's shown at all
        let wearing = outfitFor(songNow.current, null, moodNow.current());
        await dancer.wear(wearing);
        while (!gone && !dancer.solved().has("stand")) dancer.bake(8);
        if (gone) {
          dancer.dispose();
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
        renderer.toneMappingExposure = 0.9;
        el.appendChild(renderer.domElement);
        const scene = new T.Scene();
        // soft reflections, from a room made here (nothing downloaded)
        const pmrem = new T.PMREMGenerator(renderer);
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();
        scene.environment = env;
        scene.environmentIntensity = 0.45;
        scene.add(new T.HemisphereLight(0xfff0ff, 0x281a3a, 0.55));
        const key = new T.DirectionalLight(0xfff4ea, 1.7);
        key.position.set(2.2, 4, 5);
        scene.add(key);
        const fill = new T.DirectionalLight(0xffe8f0, 0.55);
        fill.position.set(-3, 2, 4);
        scene.add(fill);
        // the room's light from behind, both sides (the stage's --gel), looked at again now and then
        const stage = el.closest(".dj-stage") ?? document.documentElement;
        const gelNow = () => getComputedStyle(stage).getPropertyValue("--gel").trim() || "#b072ff";
        let gel = gelNow();
        const rim = new T.DirectionalLight(gel, 2.3);
        rim.position.set(-3, 3, -4);
        const rim2 = new T.DirectionalLight(gel, 1.4);
        rim2.position.set(3, 2, -3);
        scene.add(rim, rim2);
        scene.add(dancer.root);
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
        shadow.position.set(0, 0.003, -0.06);
        scene.add(shadow);

        const camera = new T.PerspectiveCamera(24, w / h, 0.1, 50);
        const tan = Math.tan((camera.fov * Math.PI) / 360);
        // framed to how she dances: standing, her feet to her hands up high; sitting, closer, a little
        // from above and turned a little, so the stool and her knees read
        const frameFor = (sit: number) => {
          const top = 2.0 - 0.38 * sit;
          const bottom = -0.04;
          const mid = (top + bottom) / 2;
          const dist = Math.max(((top - bottom) / 2 / tan) * 1.04, 1.0 / tan / camera.aspect);
          camera.position.set(0, mid + 0.1 + 0.22 * sit, dist);
          camera.lookAt(0, mid, 0);
          dancer.root.rotation.y = 0.05 + 0.34 * sit;
        };

        let cur: string | null = null;
        let from: { move: string; b: number; at: number } | null = null;
        let lastB = 0;
        let sit = 0;
        let gelAt = 0;
        let prev = performance.now();
        let watch = watchFrames();
        let watchFrom = 0;
        let changeAt = -1;
        let songShown = songNow.current;
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
          // the rest of her moves, a few milliseconds a frame
          dancer.bake(4);
          if (t - gelAt > 1000) {
            gelAt = t;
            const g = gelNow();
            if (g !== gel) {
              gel = g;
              rim.color.set(gel);
              rim2.color.set(gel);
            }
          }
          // a new song: her next outfit (never the one she has on), with a flash as it goes on
          if (songNow.current !== songShown) {
            songShown = songNow.current;
            const next = outfitFor(songShown, wearing, moodNow.current());
            dancer
              .wear(next)
              .then(() => {
                if (gone || dancer.wearing() !== next) return;
                wearing = next;
                changeAt = performance.now();
              })
              // (its file didn't come: she keeps on what she has, and tries again next song)
              .catch(() => {});
          }
          const b = clock.beat();
          const on = Number.isFinite(b) && b >= 0;
          const want = on ? moveAt(Math.floor(b), moodNow.current()).move.id : "stand";
          // (a move not solved yet: standing, or sitting, till it is)
          const ready2 = dancer.solved().has(want) ? want : SITTING.has(want) && dancer.solved().has("sit") ? "sit" : "stand";
          const beatNow = on ? b : t / 600;
          if (ready2 !== cur) {
            // the new one flows in from wherever it is now
            if (cur) from = { move: cur, b: lastB, at: t };
            cur = ready2;
          }
          const k = from ? Math.min(1, (t - from.at) / 1000 / BLEND_S) : 1;
          const ease = k * k * (3 - 2 * k);
          if (from) from.b += dt * (on ? clock.bpm() / 60 : 1 / 0.6);
          dancer.pose(cur, beatNow, from && k < 1 ? from : null, ease);
          lastB = beatNow;
          if (k >= 1) from = null;
          const sitWant = SITTING.has(cur) ? 1 : 0;
          sit += (sitWant - sit) * Math.min(1, dt / 0.35);
          dancer.stool(sit);
          frameFor(sit);
          // the outfit's flash: bright, fading
          const c = changeAt >= 0 ? (t - changeAt) / 1000 / CHANGE_S : 1;
          renderer.toneMappingExposure = 0.9 + (c < 1 ? 1.0 * (1 - c) * (1 - c) : 0);
          dancer.root.updateMatrixWorld(true);
          camera.updateMatrixWorld(true);
          dancer.live(dt, camera);
          renderer.render(scene, camera);
          // (the checks read what she dances and wears, and what drawing her costs: dj_dance_check.py)
          if (import.meta.env.DEV) (window as unknown as { __coach3d?: unknown }).__coach3d = { move: on ? want : null, beat: b, sit: Math.round(sit), outfit: wearing, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
        };
        tell(watch ? "watching" : "on");
        frame();
        stop = () => {
          cancelAnimationFrame(raf);
          dancer.dispose();
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

import { useEffect, useRef, useState, type RefObject } from "react";
import { AV_COLORS, Avatar, colorFor } from "../../account/Avatar";
import { reduced } from "../../lib/anim";
import type { SeatView } from "../../shared/protocol";
import type { Flame } from "./Floor";
import { anyGl, glOf, loadRobot, ratioFor, SLOW_MS, WATCH_FRAMES, WATCH_MS, watchFrames } from "./robot3d";

type Clock = {
  /** beats since the stream's first downbeat at what the speakers sound now (NaN: no music) */
  beat: () => number;
};

/**
 * What a dancer does, two bars at a time, each move's loop stretched to whole beats and set to where
 * the speaker's beat is every frame (as the coach does), so it lands on the beat however the frames
 * fall. Everyone dances on the same beat; each starts at a different place in the list. The night's
 * energy picks the list: the easy ones in the warm-up and the wind-down, all of them in the build,
 * the big ones at the peak.
 */
const EASY: { clip: string; beats: number }[] = [
  { clip: "Dance", beats: 4 },
  { clip: "Yes", beats: 2 },
  { clip: "Dance", beats: 4 },
  { clip: "Wave", beats: 4 },
  { clip: "Dance", beats: 4 },
  { clip: "ThumbsUp", beats: 2 },
];
const MOVES: { clip: string; beats: number }[] = [
  { clip: "Dance", beats: 4 },
  { clip: "Yes", beats: 2 },
  { clip: "Dance", beats: 4 },
  { clip: "Jump", beats: 2 },
  { clip: "Dance", beats: 4 },
  { clip: "Wave", beats: 4 },
  { clip: "Dance", beats: 4 },
  { clip: "Punch", beats: 2 },
  { clip: "Dance", beats: 4 },
  { clip: "ThumbsUp", beats: 2 },
];
/** the peak, and anyone keeping up with the coach (跟着跳, two bars in a row or more): the big moves */
const HOT: { clip: string; beats: number }[] = [
  { clip: "Jump", beats: 2 },
  { clip: "Dance", beats: 4 },
  { clip: "Punch", beats: 2 },
  { clip: "Dance", beats: 4 },
];

/** How tall a dancer stands on the stage, by how many there are (as the drawn floor). */
const tallFor = (n: number) => (n <= 4 ? 250 : n <= 6 ? 215 : n <= 8 ? 185 : n <= 12 ? 160 : 140);

/**
 * Where a dancer's tag goes, in the floor's own pixels: over its head, or under its feet for the front
 * row of a crowded floor (the back row stands over their heads). `px`: how tall the robot shows;
 * `up`: from an underfoot tag to the top of the head (its flames and notes go up from there).
 */
type Tag = { id: string; x: number; y: number; px: number; under: boolean; up: number };

/** How the floor turned out, for the checks (dj_floor3d_check.py). */
type Is = "trying" | "watching" | "on" | "software" | "none" | "slow" | "failed";
const tell = (is: Is) => {
  if (import.meta.env.DEV) (window as unknown as { __floor3dIs?: Is }).__floor3dIs = is;
};

/**
 * The floor in 3D (Steve on Nov 5: "要把人玩家物的3d animation 做的更丝滑与机器人同样的设计感", and he
 * chose little robots): everyone at the table is the coach's robot in their own colour, their face
 * and name over its head, dancing on the speaker's beat. While a whole song plays they sing to it,
 * a microphone in hand (the page can't hear YouTube, so the mouths move to a singer's rhythm, not
 * the words). Someone away sits down; a 🔥 makes its owner jump. No graphics chip, frames too slow,
 * or the model can't load: `onFail`, and the drawn floor.
 */
export function Floor3D({
  seats,
  flames,
  host,
  dance,
  clock,
  level,
  singing,
  fires,
  shown,
  onReady,
  onFail,
}: {
  seats: SeatView[];
  flames: Flame[];
  host?: string;
  dance?: Record<string, { share: number; hot: boolean }>;
  clock: Clock;
  /** the night's energy, 0 to 1: how much the moves fill out */
  level: number;
  /** a whole song from YouTube plays now */
  singing: boolean;
  /** who pressed 🔥, and when (performance.now) */
  fires: RefObject<Map<string, number>>;
  /** in sight (the drawn floor stays until the robots are dancing) */
  shown: boolean;
  onReady: () => void;
  onFail: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const fail = useRef(onFail);
  fail.current = onFail;
  const ready = useRef(onReady);
  ready.current = onReady;
  // what the frames read without a render of their own
  const live = useRef({ seats, dance, level, singing });
  live.current = { seats, dance, level, singing };
  // the scene's own place, set once it's built: lays the dancers out again when the table changes
  const relay = useRef<(() => void) | null>(null);
  const seatKey = seats.map((s) => `${s.id}:${s.uid ? (s.ac ?? 0) : ""}`).join(",");

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
    const calm = reduced();
    let gone = false;
    let raf = 0;
    let stop = () => {};
    void (async () => {
      try {
        const { THREE, gltf, clone } = await loadRobot();
        if (gone) return;
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(ratioFor(el));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        const W = () => el.clientWidth || 780;
        const H = () => el.clientHeight || 460;
        renderer.setSize(W(), H());
        el.prepend(renderer.domElement);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(30, W() / H(), 0.1, 200);
        scene.add(new THREE.HemisphereLight(0xffe9ff, 0x2a1840, 2.2));
        const key = new THREE.DirectionalLight(0xffffff, 2.3);
        key.position.set(3, 8, 6);
        scene.add(key);
        // the club's own colours from behind: the beams' violet one side, cyan the other
        const rimL = new THREE.DirectionalLight(0xb072ff, 2.2);
        rimL.position.set(-6, 4, -4);
        scene.add(rimL);
        const rimR = new THREE.DirectionalLight(0x31b9ff, 1.4);
        rimR.position.set(6, 3, -4);
        scene.add(rimR);

        // the robot's size, from the model itself (standing, arms down)
        const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3());
        const tall = size.y;
        const gap = Math.max(size.x, tall * 0.5) * 1.22;
        // its shadow on the floor, one texture for all
        const shade = (() => {
          const c = document.createElement("canvas");
          c.width = c.height = 64;
          const g = c.getContext("2d")!;
          const r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
          r.addColorStop(0, "rgba(0,0,0,0.55)");
          r.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = r;
          g.fillRect(0, 0, 64, 64);
          return new THREE.CanvasTexture(c);
        })();
        const shadeMat = new THREE.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false });
        const shadeGeo = new THREE.PlaneGeometry(gap * 0.9, gap * 0.9);

        type Bot = {
          id: string;
          root: import("three").Object3D;
          mixer: import("three").AnimationMixer;
          acts: Map<string, import("three").AnimationAction>;
          on: string | null;
          face: { mesh: import("three").Mesh; open: number; feel: number }[];
          body: import("three").MeshStandardMaterial[];
          mic: import("three").Object3D;
          shadow: import("three").Mesh;
          /** the floor under it: the stage, or the step at the back */
          base: number;
          /** its tag under its feet (it stays put when it jumps); the screen's pixels in one of the
           * model's units, where it stands */
          under: boolean;
          ppu: number;
          /** its tag lifted with a jump, to put back */
          tagUp: boolean;
          /** its microphone, 0 (gone) to 1 (up) */
          micK: number;
          away: boolean;
          k: number;
          seed: number;
        };
        const bots = new Map<string, Bot>();
        // what the last frame and layout did, for the checks
        const seen = { sing: false, beat: NaN, rows: 1 };

        // a microphone on a stand in front of each of them while a song plays (the robot has no
        // mouth to sing with: it sways at the mic, brows up on the long notes, notes going up)
        const micGeo = {
          foot: new THREE.CylinderGeometry(tall * 0.1, tall * 0.11, tall * 0.015, 24),
          pole: new THREE.CylinderGeometry(tall * 0.009, tall * 0.009, tall * 0.6, 10),
          head: new THREE.CapsuleGeometry(tall * 0.032, tall * 0.05, 6, 14),
        };
        const micMat = {
          dark: new THREE.MeshStandardMaterial({ color: 0x1e1b2e, roughness: 0.45, metalness: 0.4 }),
          head: new THREE.MeshStandardMaterial({ color: 0xd9dbe6, roughness: 0.3, metalness: 0.85 }),
        };
        const micOf = () => {
          const g = new THREE.Group();
          const foot = new THREE.Mesh(micGeo.foot, micMat.dark);
          foot.position.y = tall * 0.0075;
          const pole = new THREE.Mesh(micGeo.pole, micMat.dark);
          pole.position.y = tall * 0.3;
          const head = new THREE.Mesh(micGeo.head, micMat.head);
          // tipped toward the singer, at the height of its face
          head.position.set(0, tall * 0.64, -tall * 0.02);
          head.rotation.x = -0.55;
          g.add(foot, pole, head);
          return g;
        };

        // when it's crowded, a step at the back of the stage for the back row, its edge lit in the
        // booth's own pink
        const stepGeo = new THREE.BoxGeometry(1, 1, 1);
        const stepMat = new THREE.MeshStandardMaterial({ color: 0x0b0815, roughness: 1, metalness: 0 });
        const edgeMat = new THREE.MeshBasicMaterial({ color: 0xff5ad8 });
        const step = new THREE.Mesh(stepGeo, stepMat);
        const edge = new THREE.Mesh(stepGeo, edgeMat);
        step.visible = edge.visible = false;
        scene.add(step, edge);

        const colorOf = (s: SeatView) => AV_COLORS[(s.uid ? (s.ac ?? 0) : colorFor(s.id)) % AV_COLORS.length];
        // their colour, greyed while they're away (as the drawn floor greys them)
        const AWAY = new THREE.Color(0x45414f);
        const paint = (b: { body: import("three").MeshStandardMaterial[]; away: boolean }, s: SeatView) =>
          b.body.forEach((m) => {
            m.color.set(colorOf(s));
            if (b.away) m.color.lerp(AWAY, 0.75);
          });

        const make = (s: SeatView, k: number): Bot => {
          const root = clone(gltf.scene);
          const mixer = new THREE.AnimationMixer(root);
          const acts = new Map(gltf.animations.map((a) => [a.name, mixer.clipAction(a)]));
          const body: import("three").MeshStandardMaterial[] = [];
          const face: Bot["face"] = [];
          root.traverse((o) => {
            const m = o as import("three").Mesh;
            if (!m.isMesh) return;
            // its own body colour: the model's orange "Main" is theirs
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            const mine = mats.map((mt) => {
              if (mt.name !== "Main") return mt;
              const c = (mt as import("three").MeshStandardMaterial).clone();
              c.color.set(colorOf(s));
              body.push(c);
              return c;
            });
            m.material = Array.isArray(m.material) ? mine : mine[0];
            if (m.morphTargetDictionary && "Surprised" in m.morphTargetDictionary) face.push({ mesh: m, open: m.morphTargetDictionary.Surprised, feel: m.morphTargetDictionary.Sad ?? -1 });
          });
          const mic = micOf();
          mic.visible = false;
          const shadow = new THREE.Mesh(shadeGeo, shadeMat);
          shadow.rotation.x = -Math.PI / 2;
          shadow.position.y = 0.01;
          scene.add(root, shadow, mic);
          const idle = acts.get("Idle");
          idle?.play();
          return { id: s.id, root, mixer, acts, on: "Idle", face, body, mic, shadow, base: 0, under: false, ppu: 0, tagUp: false, micK: 0, away: false, k, seed: (k * 0.618) % 1 };
        };

        const drop = (b: Bot) => {
          b.mixer.stopAllAction();
          b.mixer.uncacheRoot(b.root);
          scene.remove(b.root, b.shadow, b.mic);
          b.body.forEach((m) => m.dispose());
        };

        // the dancers in a row, as tall as the drawn floor's, the camera far enough back to fit them all.
        // Crowded (more than 8): two rows, the back one on a step behind, between the front row's and
        // up enough to show over their heads; the front row's tags go under their feet
        const lay = () => {
          const list = live.current.seats;
          for (const [id, b] of bots) if (!list.some((s) => s.id === id)) (drop(b), bots.delete(id));
          list.forEach((s, k) => {
            const had = bots.get(s.id);
            if (!had) bots.set(s.id, make(s, k));
            else {
              had.k = k;
              paint(had, s);
            }
          });
          const n = list.length;
          const two = n > 8;
          const back = two ? list.slice(Math.ceil(n / 2)) : [];
          const front = two ? list.slice(0, Math.ceil(n / 2)) : list;
          const rise = two ? tall * 0.78 : 0;
          const depth = gap * 1.05;
          const place = (row: SeatView[], y: number, z: number, dx: number) =>
            row.forEach((s, j) => {
              const b = bots.get(s.id)!;
              b.base = y;
              b.root.position.set((j - (row.length - 1) / 2) * gap + dx, y, z);
              b.shadow.position.set(b.root.position.x, y + 0.01, z);
              b.mic.position.set(b.root.position.x, y, z + tall * 0.3);
            });
          place(front, 0, 0, 0);
          place(back, rise, -depth, back.length === front.length ? gap / 2 : 0);
          seen.rows = two ? 2 : 1;
          step.visible = edge.visible = two;
          if (two) {
            const wide = (front.length + 0.8) * gap;
            step.scale.set(wide, rise, depth);
            step.position.set(0, rise / 2, -depth);
            edge.scale.set(wide, tall * 0.014, tall * 0.014);
            edge.position.set(0, rise, -depth / 2);
          }
          // the camera: each dancer as tall as the drawn floor's (in the floor's pixels), further
          // back if a row wouldn't fit across
          const w = W();
          const h = H();
          camera.aspect = w / h;
          const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
          const across = (Math.max(1, front.length) - 1) * gap + gap * 1.2;
          let dist = Math.max((tall * h) / (2 * tallFor(n) * tan), across / (2 * tan * camera.aspect * 0.92));
          let look = two ? (rise + tall) * 0.5 : tall * 0.62;
          const aim = () => {
            camera.position.set(0, look + dist * 0.12, dist);
            camera.lookAt(0, look, two ? -depth * 0.5 : 0);
            camera.updateMatrixWorld();
            camera.updateProjectionMatrix();
          };
          const v = new THREE.Vector3();
          const sy = (x: number, y: number, z: number) => ((1 - v.set(x, y, z).project(camera).y) / 2) * h;
          aim();
          if (two) {
            // the whole crowd, tags and all, fitted top to bottom and in the middle
            const TAG = 72;
            for (let i = 0; i < 2; i++) {
              const top = sy(0, rise + tall * 1.13, -depth) - TAG;
              const bottom = sy(0, 0, tall * 0.25) + TAG;
              if (bottom - top > h * 0.94) dist *= (bottom - top) / (h * 0.94);
              aim();
              const mid = (sy(0, rise + tall * 1.13, -depth) - TAG + sy(0, 0, tall * 0.25) + TAG) / 2;
              look += (h / 2 - mid) / (h / (2 * dist * tan));
              aim();
            }
          }
          renderer.setSize(w, h);
          // where each tag goes
          const out: Tag[] = [];
          for (const s of list) {
            const b = bots.get(s.id)!;
            const { x, z } = b.root.position;
            const head = sy(x, b.base + tall * 1.05, z);
            const px = sy(x, b.base, z) - sy(x, b.base + tall, z);
            const under = two && !back.includes(s);
            b.under = under;
            b.ppu = px / tall;
            v.set(x, under ? 0 : b.base + tall * 1.13, under ? z + tall * 0.25 : z).project(camera);
            const y = ((1 - v.y) / 2) * h;
            out.push({ id: s.id, x: ((v.x + 1) / 2) * w, y, px, under, up: under ? y - head : 0 });
          }
          setTags(out);
        };
        lay();
        relay.current = lay;
        const onResize = () => {
          renderer.setPixelRatio(ratioFor(el));
          lay();
        };
        window.addEventListener("resize", onResize);

        // one move at a time, crossfaded in a quarter of a second
        const play = (b: Bot, clip: string) => {
          if (b.on === clip) return b.acts.get(clip) ?? null;
          const a = b.acts.get(clip);
          if (!a) return null;
          const was = b.on ? b.acts.get(b.on) : null;
          a.reset().play();
          if (was && was !== a) a.crossFadeFrom(was, 0.25, false);
          b.on = clip;
          return a;
        };

        // what the checks read (dj_floor3d_check.py), only when they ask
        if (import.meta.env.DEV)
          (window as unknown as { __floor3d?: () => unknown }).__floor3d = () => ({
            n: bots.size,
            tall,
            level: live.current.level,
            rows: seen.rows,
            singing: seen.sing,
            beat: seen.beat,
            bots: Object.fromEntries(
              [...bots.values()].map((x) => {
                const a = x.on ? x.acts.get(x.on) : undefined;
                const m = (x.on && [...EASY, ...MOVES, ...HOT].find((mv) => mv.clip === x.on)) || null;
                const f = x.face[0];
                return [
                  x.id,
                  {
                    color: `#${x.body[0]?.color.getHexString() ?? ""}`,
                    clip: x.on,
                    away: x.away,
                    at: a?.time ?? 0,
                    dur: a?.getClip().duration ?? 0,
                    beats: m?.beats ?? 0,
                    y: x.root.position.y,
                    base: x.base,
                    mic: x.mic.visible,
                    brows: f?.mesh.morphTargetInfluences?.[f.open] ?? 0,
                  },
                ];
              }),
            ),
          });
        let last = performance.now();
        let watch = watchFrames();
        let watchFrom = 0;
        const gaps: number[] = [];
        const frame = () => {
          const t = performance.now();
          const step = t - last;
          last = t;
          if (watch) {
            if (!watchFrom) watchFrom = t;
            else if (step < 1000) gaps.push(step);
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
          const dt = Math.min(0.1, step / 1000);
          const { seats: list, dance: hot } = live.current;
          // (local runs: the checks can have them sing without a song, dj_floor3d_check.py)
          const sing = live.current.singing || (import.meta.env.DEV && (window as unknown as { __floor3dSing?: boolean }).__floor3dSing === true);
          const b = clock.beat();
          const beat = !sing && !calm && Number.isFinite(b) && b >= 0;
          const sec = t / 1000;
          for (const s of list) {
            const bot = bots.get(s.id);
            if (!bot) continue;
            // the microphone rises in front of each of them as a song starts, and goes as it ends
            const want = sing && s.on ? 1 : 0;
            bot.micK = calm || Math.abs(want - bot.micK) < 0.01 ? want : bot.micK + (want - bot.micK) * Math.min(1, dt * 9);
            bot.mic.visible = bot.micK > 0;
            bot.mic.scale.setScalar(Math.max(0.001, bot.micK));
            // away from the table: sits down where they are, greyed
            if (!s.on) {
              if (!bot.away) {
                bot.away = true;
                paint(bot, s);
                const a = play(bot, "Sitting");
                if (a) {
                  a.setLoop(THREE.LoopOnce, 1);
                  a.clampWhenFinished = true;
                  a.timeScale = 1;
                }
              }
              bot.mixer.update(dt);
              continue;
            }
            if (bot.away) {
              bot.away = false;
              paint(bot, s);
            }
            let lift = 0;
            if (beat) {
              const lv = live.current.level;
              const list2 = hot?.[s.id]?.hot || lv >= 0.8 ? HOT : lv >= 0.5 ? MOVES : EASY;
              const m = list2[(bot.k * 3 + Math.floor(b / 8)) % list2.length];
              const a = play(bot, m.clip) ?? play(bot, "Dance");
              if (a) {
                const loop = (((b % m.beats) + m.beats) % m.beats) / m.beats;
                a.setLoop(THREE.LoopRepeat, Infinity);
                a.time = loop * a.getClip().duration;
                a.timeScale = 0;
              }
              bot.root.rotation.y = 0;
              bot.root.rotation.z = 0;
            } else {
              // no beat to dance on (no music yet, or a song the page can't hear): standing easy,
              // swaying while it sings, turned a little to the room
              const a = play(bot, "Idle");
              if (a) {
                a.setLoop(THREE.LoopRepeat, Infinity);
                a.timeScale = 1;
              }
              bot.root.rotation.y = sing && !calm ? Math.sin(sec * 0.7 + bot.seed * 6) * 0.28 : 0;
              bot.root.rotation.z = sing && !calm ? Math.sin(sec * 1.4 + bot.seed * 6) * 0.05 : 0;
            }
            // the face while it sings: brows up as a line opens out, knitted (all feeling) as it
            // holds a long note, at ease for the breath between lines, every few seconds
            for (const f of bot.face) {
              const inf = f.mesh.morphTargetInfluences;
              if (!inf) continue;
              let up = 0;
              let feel = 0;
              if (sing && !calm) {
                const line = (sec * 0.3 + bot.seed) % 1;
                up = line < 0.45 ? 0.75 : 0;
                feel = line >= 0.45 && line < 0.82 ? 0.8 : 0;
              }
              inf[f.open] += (up - inf[f.open]) * Math.min(1, dt * 7);
              if (f.feel >= 0) inf[f.feel] += (feel - inf[f.feel]) * Math.min(1, dt * 5);
            }
            // a 🔥 makes its owner jump
            const fireAt = fires.current?.get(s.id);
            if (fireAt !== undefined && !calm) {
              const k = (t - fireAt) / 420;
              if (k >= 0 && k < 1) lift = tall * 0.22 * 4 * k * (1 - k);
            }
            bot.root.position.y = bot.base + lift;
            if (!bot.under && (lift > 0 || bot.tagUp)) {
              const t2 = el.querySelector<HTMLElement>(`[data-tag="${CSS.escape(s.id)}"]`);
              if (t2) t2.style.transform = lift > 0 ? `translateY(${(-lift * bot.ppu).toFixed(1)}px)` : "";
              bot.tagUp = lift > 0;
            }
            bot.shadow.scale.setScalar(1 - Math.min(0.4, lift / tall));
            bot.mixer.update(dt);
          }
          renderer.render(scene, camera);
          seen.sing = sing;
          seen.beat = b;
        };
        tell(watch ? "watching" : "on");
        frame();
        ready.current();
        stop = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener("resize", onResize);
          relay.current = null;
          for (const b of bots.values()) drop(b);
          bots.clear();
          shade.dispose();
          shadeMat.dispose();
          shadeGeo.dispose();
          micGeo.foot.dispose();
          micGeo.pole.dispose();
          micGeo.head.dispose();
          micMat.dark.dispose();
          micMat.head.dispose();
          stepGeo.dispose();
          stepMat.dispose();
          edgeMat.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
          renderer.domElement.remove();
          if (import.meta.env.DEV) delete (window as unknown as { __floor3d?: unknown }).__floor3d;
        };
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
  }, [clock, fires]);

  // the table changed: the dancers laid out again
  useEffect(() => {
    relay.current?.();
  }, [seatKey]);

  // (local runs: the checks can have them sing without a song, as the frames do)
  const sings = singing || (import.meta.env.DEV && (window as unknown as { __floor3dSing?: boolean }).__floor3dSing === true);
  return (
    <div className={`dj-floor3d ${shown ? "" : "is-hidden"}`} ref={box} aria-hidden="true">
      {tags.map((tg) => {
        const s = seats.find((x) => x.id === tg.id);
        if (!s) return null;
        const av = Math.round(Math.max(26, Math.min(46, tg.px * 0.17)));
        return (
          <div
            key={tg.id}
            data-tag={tg.id}
            className={`dj-f3-tag ${tg.under ? "is-under" : ""} ${s.on ? "" : "is-away"} ${sings && s.on ? "is-singing" : ""}`}
            style={{
              left: tg.x,
              top: tg.y,
              ["--fig-h" as string]: `${tg.px}px`,
              ["--up" as string]: `${tg.up}px`,
              ["--tc" as string]: AV_COLORS[(s.uid ? (s.ac ?? 0) : colorFor(s.id)) % AV_COLORS.length],
              ["--k" as string]: tags.indexOf(tg),
            }}
          >
            <Avatar uid={s.uid} name={s.name} av={s.av ?? 0} ac={s.uid ? s.ac : colorFor(s.id)} size={av} frame={s.fr} />
            <span className={`dj-name ${s.id === host ? "is-host" : ""}`}>{s.name}</span>
            {dance?.[s.id] && (
              <span className={`dj-dance-meter ${dance[s.id].hot ? "is-hot" : ""}`} style={{ ["--share" as string]: dance[s.id].share }}>
                <span />
              </span>
            )}
            {flames
              .filter((f) => f.pid === s.id)
              .map((f) => (
                <span key={f.id} className="dj-flame">
                  🔥
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
}

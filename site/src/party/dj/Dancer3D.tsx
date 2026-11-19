import { useEffect, useRef } from "react";
import type { Mood } from "../../shared/dj/dance";
import { DANCE_BEATS, danceAt, danceNext, IDLES, idleAt, OUTFIT, WALK, type Look } from "./dancer/dances";
import type { Her } from "./dancer/her";
import { anyGl, glOf, ratioFor, SLOW_MS, WATCH_FRAMES, WATCH_MS, watchFrames } from "./robot3d";

type Clock = { beat: () => number; energy: () => number; bpm: () => number };

/** How the dancer turned out (`watching`: her first seconds), for the checks. */
type Is = "trying" | "watching" | "on" | "software" | "none" | "slow" | "failed";
const tell = (is: Is) => {
  if (import.meta.env.DEV) (window as unknown as { __coach3dIs?: Is }).__coach3dIs = is;
};

/** One dance flowing into the next, in seconds. */
const BLEND_S = 0.6;
/** Changing outfits: a flash of light over her this long, the new one in at its brightest. */
const CHANGE_S = 0.5;
/**
 * Walking the stage: her place when she stays put (the left of the TV, her box's middle, in the
 * stage's pixels), how near its edges she goes, how fast she turns (a quarter turn in about a third
 * of a second), and how often, at a new dance, she walks somewhere else.
 */
const HOME_PX = 194;
const EDGE_PX = 140;
const TURN_RAD_S = 4.5;
const WALK_CHANCE = 0.5;
/** facing the room, turned a little */
const FACE = 0.05;

/**
 * The dancer on the big screen in 3D (Steve on Nov 14: "我要跟真人看起来一样，要达到我给你照片这个水平…
 * 包括动作这些方面都需要去深度优化"; a bar's dancer lifting the room, standing): since Nov 18 the design he
 * chose (a TRELLIS.2 model with the design's photos on it, dancer/her.ts) dancing real dancers' motion
 * capture (dancer/dances.ts): the dance set from the speaker's beat every frame, a beat of the song a
 * beat of the dance; with no song, standing easy. Her hair and skirt swing as she moves (springs);
 * she blinks.
 * Her look follows the music (Nov 18): its outfit fetched when it's first wanted, changed in a flash
 * of light; its dances. Her rim lights take the room's colour. No graphics chip, her frames too slow,
 * or her files can't load: `onFail` (the robot, then the drawn dancer). `light` (an iPhone or iPad as
 * the speaker): one outfit kept at a time. `roam` (Nov 18): whether she may walk the whole stage now (no
 * song's video in the middle): now and then, at a new dance, she walks somewhere else on it (her own
 * canvas the stage's width, she behind the floor); otherwise back to her place on the left.
 */
export function Dancer3D({ clock, mood, look, roam, light = false, onReady, onFail }: { clock: Clock; mood: () => Mood; look: () => Look; roam: () => boolean; light?: boolean; onReady: () => void; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const fail = useRef(onFail);
  const moodNow = useRef(mood);
  const lookNow = useRef(look);
  const roamNow = useRef(roam);
  roamNow.current = roam;
  ready.current = onReady;
  fail.current = onFail;
  moodNow.current = mood;
  lookNow.current = look;
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
        // her outfits, each loaded the first time it's wanted (with the dances she's on at the time)
        const outfits = new Map<string, Her>();
        const loading = new Map<string, Promise<Her | null>>();
        const firstIdle = idleAt(0).id;
        const fetchOutfit = (outfit: string, dances: string[]) => {
          let p = loading.get(outfit);
          if (!p) {
            p = (async () => {
              const h = await loadHer(outfit);
              await Promise.all(dances.map((d) => h.learn(d).catch(() => {})));
              if (gone) {
                h.dispose();
                return null;
              }
              outfits.set(outfit, h);
              return h;
            })().catch(() => null);
            loading.set(outfit, p);
          }
          return p;
        };
        // standing easy before she's shown at all, in the look the music has now
        let her = await fetchOutfit(OUTFIT[lookNow.current()], [firstIdle]);
        // (that outfit's file didn't come: her first one)
        if (!her && OUTFIT[lookNow.current()] !== "club") {
          loading.delete("club");
          her = await fetchOutfit("club", [firstIdle]);
        }
        if (!her) throw new Error("no outfit");
        if (!her.knows(firstIdle)) await her.learn(firstIdle);
        if (gone) return;
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
        // a soft shadow under her, so she stands on something; and the flash she changes outfits in
        const glow = (inner: string, outer: string) => {
          const c = document.createElement("canvas");
          c.width = c.height = 64;
          const g2 = c.getContext("2d");
          if (g2) {
            const grd = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
            grd.addColorStop(0, inner);
            grd.addColorStop(1, outer);
            g2.fillStyle = grd;
            g2.fillRect(0, 0, 64, 64);
          }
          return new T.CanvasTexture(c);
        };
        const shadowTex = glow("rgba(0,0,0,0.55)", "rgba(0,0,0,0)");
        const shadow = new T.Mesh(new T.PlaneGeometry(1.1, 0.8), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(0, 0.003, 0);
        scene.add(shadow);
        const flashTex = glow("rgba(255,255,255,1)", "rgba(255,255,255,0)");
        const flash = new T.Sprite(new T.SpriteMaterial({ map: flashTex, transparent: true, depthTest: false, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
        flash.scale.set(1.6, 2.4, 1);
        flash.position.set(0, 0.95, 0.3);
        flash.renderOrder = 10;
        scene.add(flash);

        const camera = new T.PerspectiveCamera(24, w / h, 0.1, 50);
        const tan = Math.tan((camera.fov * Math.PI) / 360);
        // framed to how she dances: her feet to her hands up high, as wide as her arms reach out, turned
        // a little to the room
        const top = 2.0;
        const bottom = -0.04;
        const mid = (top + bottom) / 2;
        camera.position.set(0, mid + 0.1, Math.max(((top - bottom) / 2 / tan) * 1.04, 0.6 / tan / camera.aspect));
        camera.lookAt(0, mid, 0);
        her.root.rotation.y = FACE;
        // the canvas changing size (a full song's video: down in the corner): the camera keeps her height
        let cw = w;
        const resize = new ResizeObserver(() => {
          const nw = el.clientWidth || cw;
          const nh = el.clientHeight || h;
          if (nw === cw && nh === renderer.domElement.height / renderer.getPixelRatio()) return;
          cw = nw;
          renderer.setSize(nw, nh);
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
        });
        resize.observe(el);
        // where she is on the stage, and where she's going: her canvas's pixels to her floor's metres
        const toX = (px: number) => (px / cw - 0.5) * 2 * camera.position.z * tan * camera.aspect;
        const homeX = () => toX(Math.min(HOME_PX, cw / 2));
        let x = homeX();
        let goal = x;
        let rot = FACE;
        let block = -1;
        let walking = false;
        const walkId = WALK?.id ?? (import.meta.env.DEV ? ((window as unknown as { __djWalk?: string }).__djWalk ?? null) : null);

        let cur = firstIdle;
        let curT = 0;
        let from: { dance: string; t: number; at: number; rate: number } | null = null;
        let gelAt = 0;
        let prev = performance.now();
        const start = prev;
        let watch = watchFrames();
        let watchFrom = 0;
        const gaps: number[] = [];
        // changing outfits: the new one, and when the flash began
        let change: { to: Her; at: number; swapped: boolean } | null = null;
        // her blinks: every two to six seconds, now and then twice running
        let blinkAt = prev + 1500;
        let twice = false;
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
          const lk = lookNow.current();
          // walking the stage: at a new dance, now and then, somewhere else on it; with a song's video
          // in the middle (or no beat), back to her place
          const free = !!walkId && on && roamNow.current() && cw > 600;
          const blk = on ? Math.floor(b / DANCE_BEATS) : -1;
          if (blk !== block) {
            block = blk;
            if (free && Math.random() < WALK_CHANCE) {
              const lo = toX(EDGE_PX);
              const hi = toX(cw - EDGE_PX);
              // (far enough to be a walk, not a shuffle)
              let to = x;
              for (let tries = 0; tries < 6 && Math.abs(to - x) < 1; tries++) to = lo + Math.random() * (hi - lo);
              if (Math.abs(to - x) >= 1) goal = to;
            }
          }
          if (!free) goal = homeX();
          const gap2 = goal - x;
          if (Math.abs(gap2) > 0.02 && walkId && her!.knows(walkId)) {
            // turned to where she's going, then walking, a stride a beat
            const face = Math.sign(gap2) * (Math.PI / 2);
            rot += Math.max(-TURN_RAD_S * dt, Math.min(TURN_RAD_S * dt, face - rot));
            if (Math.abs(face - rot) < 0.25) {
              const v = (WALK?.stride ?? 0.5) * ((on ? bpm : 110) / 60);
              x += Math.sign(gap2) * Math.min(Math.abs(gap2), v * dt);
            }
            walking = true;
          } else {
            // there (or nowhere to walk to): turned back to the room
            if (Math.abs(gap2) > 0.02 && walkId) void her!.learn(walkId).catch(() => {});
            rot += Math.max(-TURN_RAD_S * dt, Math.min(TURN_RAD_S * dt, FACE - rot));
            walking = Math.abs(FACE - rot) > 0.3;
          }
          her!.root.position.x = x;
          her!.root.rotation.y = rot;
          shadow.position.x = x;
          flash.position.x = x;
          // the dance for this beat (and the next one fetched ahead); with no song, standing easy at her
          // own tempo; walking, her walk
          const idle = idleAt(sec);
          let want = walking && walkId && her!.knows(walkId) ? walkId : on ? danceAt(Math.floor(b), lk, bpm) : idle.id;
          if (on) void her!.learn(danceNext(Math.floor(b), lk, bpm)).catch(() => {});
          if (!her!.knows(want)) {
            void her!.learn(want).catch(() => {});
            // (not here yet: what she's dancing goes on)
            want = cur;
          }
          // her look's outfit: fetched the first time, then changed into in a flash
          const outfit = OUTFIT[lk];
          if (!change && outfit !== her!.outfit) {
            const next = outfits.get(outfit);
            // (in it once it has the dance she's on: the change mid-step, not back to standing)
            if (next && next.knows(cur)) {
              change = { to: next, at: t, swapped: false };
              next.still();
            } else if (next) void next.learn(cur).catch(() => {});
            else if (!loading.has(outfit)) void fetchOutfit(outfit, [cur, want]);
          }
          if (change) {
            const k = (t - change.at) / 1000 / CHANGE_S;
            flash.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.95;
            if (!change.swapped && k >= 0.5) {
              change.swapped = true;
              const old = her!;
              scene.remove(old.root);
              her = change.to;
              her.root.rotation.y = rot;
              her.root.position.x = x;
              scene.add(her.root);
              // (an iPhone or iPad keeps one: the old one let go, fetched again if it's wanted again)
              if (light) {
                outfits.delete(old.outfit);
                loading.delete(old.outfit);
                old.dispose();
              }
            }
            if (k >= 1) {
              change = null;
              flash.material.opacity = 0;
            }
          }
          // with the music on, her time is its beat (a sway a ballad's dances include too); standing easy
          // with none, the seconds at the idle's own tempo
          const rateOf = (id: string) => (on ? bpm : id === walkId ? 110 : (idleBpm(id) ?? bpm)) / 60;
          const tWant = on ? b : sec * rateOf(want);
          if (want !== cur) {
            // the new one flows in from wherever the last one is
            from = { dance: cur, t: curT, at: t, rate: rateOf(cur) };
            cur = want;
          }
          curT = tWant;
          const k = from ? Math.min(1, (t - from.at) / 1000 / BLEND_S) : 1;
          const ease = k * k * (3 - 2 * k);
          if (from) from.t += dt * from.rate;
          her!.pose(cur, curT, from && k < 1 ? from : null, ease);
          if (k >= 1) from = null;
          // her hair and skirt follow
          her!.swing(dt);
          // (a blink: shutting in 70 ms, shut 40, opening in 120)
          const bt = (t - blinkAt) / 1000;
          her!.blink(bt < 0 ? 0 : bt < 0.07 ? bt / 0.07 : bt < 0.11 ? 1 : bt < 0.23 ? 1 - (bt - 0.11) / 0.12 : 0);
          if (bt >= 0.23) {
            blinkAt = t + (twice ? 160 : 2000 + Math.random() * 4000);
            twice = !twice && Math.random() < 0.2;
          }
          her!.root.updateMatrixWorld(true);
          renderer.render(scene, camera);
          // (the checks read what she dances and wears, and what drawing her costs: dj_dancer_check.py)
          if (import.meta.env.DEV) (window as unknown as { __coach3d?: unknown }).__coach3d = { move: cur, dancing: on, beat: b, look: lk, outfit: her!.outfit, outfits: [...outfits.keys()], x: Math.round(((x / (camera.position.z * tan * camera.aspect)) / 2 + 0.5) * cw), walking, calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
        };
        tell(watch ? "watching" : "on");
        frame();
        stop = () => {
          cancelAnimationFrame(raf);
          resize.disconnect();
          for (const o of outfits.values()) o.dispose();
          outfits.clear();
          shadow.geometry.dispose();
          (shadow.material as import("three").Material).dispose();
          shadowTex.dispose();
          flash.material.dispose();
          flashTex.dispose();
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
  }, [clock, light]);
  // (as wide as the stage once she can walk it)
  return <div className={`dj-coach-3d ${WALK || (import.meta.env.DEV && (window as unknown as { __djWalk?: string }).__djWalk) ? "is-wide" : ""}`} ref={box} aria-hidden="true" />;
}

/** an idle's own tempo (none: a dance, danced on the song's) */
const idleBpm = (id: string) => IDLES.find((i) => i.id === id)?.bpm;

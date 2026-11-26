import { useEffect, useRef } from "react";
import type { Mood } from "../../shared/dj/dance";
import { DANCE_BEATS, danceAt, danceNext, IDLES, idleAt, stepsPerBeat, WALKS, type Look } from "./dancer/dances";
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
/** Facing the room, turned a little. */
const FACE = 0.05;
/**
 * Walking the stage (Nov 20): how often, at a new dance, she walks somewhere else on it; the least a
 * walk is (stage pixels: a few steps, not a shuffle); how fast she turns (a quarter turn in about a
 * third of a second); how far her middle stays from the stage's right edge (its buttons) and from the
 * left of a song file's card there.
 */
const WALK_CHANCE = 0.5;
const WALK_MIN_PX = 300;
const TURN_RAD_S = 4.5;
const RIGHT_PX = 180;
const CARD_PX = 90;
/** How far her middle keeps from a floor dancer's edge when she picks a spot (not stood behind one). */
const BODY_PX = 70;

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
 * the speaker): one outfit kept at a time. `roam` (Nov 20, Steve on Nov 18: "她是可以在整个舞台从左到右
 * 走动的"): whether she may walk the stage now (no song's video in the middle, someone on the floor):
 * now and then, at a new dance, she walks somewhere else on it, her look's walk on the beat (her canvas
 * slides along, she walks in place in it, behind the floor's dancers); back to her place on the left
 * when she may not. With reduced motion, or over a video in the corner, she stays in her place.
 */
export function Dancer3D({ clock, mood, look, outfit, roam, light = false, onReady, onFail }: { clock: Clock; mood: () => Mood; look: () => Look; outfit: () => string; roam: () => boolean; light?: boolean; onReady: () => void; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady);
  const fail = useRef(onFail);
  const moodNow = useRef(mood);
  const lookNow = useRef(look);
  const outfitNow = useRef(outfit);
  ready.current = onReady;
  fail.current = onFail;
  moodNow.current = mood;
  lookNow.current = look;
  outfitNow.current = outfit;
  const roamNow = useRef(roam);
  roamNow.current = roam;
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
        const [T, { RoomEnvironment }, { loadHer }, { feetOf, plantFeet, standFeet }] = await Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js"), import("./dancer/her"), import("./dancer/plant")]);
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
        let her = await fetchOutfit(outfitNow.current(), [firstIdle]);
        // (that outfit's file didn't come: her first one)
        if (!her && outfitNow.current() !== "club") {
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
        // walking the stage: her canvas's place (stage pixels from her own), where it's going, which
        // way she faces; a metre where she stands, in the stage's pixels
        const coach = el.closest(".dj-coach") as HTMLElement | null;
        const still = matchMedia("(prefers-reduced-motion: reduce)");
        const pxPerM = () => el.clientWidth / (2 * camera.position.z * tan * camera.aspect);
        let x = 0;
        let goal = 0;
        let rot = FACE;
        let block = -1;
        let walking = false;
        let far = 0;
        let farAt = 0;
        let slid = "";
        const hipsOf = new WeakMap<Her, InstanceType<typeof T.Object3D>>();
        const feetOfHer = new WeakMap<Her, ReturnType<typeof feetOf>>();
        const mood = { smile: 0, brows: 0 };
        const headOf = new WeakMap<Her, { head?: InstanceType<typeof T.Object3D>; neck?: InstanceType<typeof T.Object3D>; yaw: number; pitch: number }>();
        const at = new T.Vector3();
        // her middle at her own place on the stage; how far right she may go (her middle clear of the
        // stage's edge, and of a song file's card); the floor's dancers' middles and half widths (none
        // on a 3D floor), all in the stage's pixels
        const st = stage as HTMLElement;
        const homeAt = () => (coach?.offsetLeft ?? 0) + el.clientWidth / 2;
        const reach = () => {
          const card = st.querySelector<HTMLElement>(".dj-file");
          const right = Math.min(st.clientWidth - RIGHT_PX, card ? card.offsetLeft - CARD_PX : Infinity);
          return Math.max(0, right - homeAt());
        };
        const taken = () => {
          const sr = st.getBoundingClientRect();
          const k = sr.width / (st.clientWidth || 1) || 1;
          return [...st.querySelectorAll<HTMLElement>(".dj-floor .dj-dancer")].map((d) => {
            const r = d.getBoundingClientRect();
            return [(r.left + r.width / 2 - sr.left) / k, r.width / 2 / k] as const;
          });
        };

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
          // the dance for this beat (and the next one fetched ahead); with no song, standing easy at her
          // own tempo
          const idle = idleAt(sec);
          // walking the stage: now and then, at a new dance, somewhere else on it
          const walk = WALKS[lk];
          const stay = still.matches || !!coach?.classList.contains("is-over");
          const test = import.meta.env.DEV ? (window as unknown as { __djWalkTo?: number }).__djWalkTo : undefined;
          const blk = on ? Math.floor(b / DANCE_BEATS) : -1;
          if (t - farAt > 500) {
            far = reach();
            farAt = t;
          }
          if (stay) x = goal = 0;
          else if (typeof test === "number") goal = Math.max(0, Math.min(far, test));
          else if (!roamNow.current()) goal = 0;
          else if (!on) goal = x;
          else if (blk !== block && Math.random() < WALK_CHANCE) {
            // (a few steps away, not stood behind someone on the floor; nowhere like that: she stays)
            const home = homeAt();
            const floor = taken();
            for (let tries = 0; tries < 12; tries++) {
              const to = Math.random() * far;
              if (Math.abs(to - x) >= WALK_MIN_PX && floor.every(([c, hw]) => Math.abs(home + to - c) > hw + BODY_PX)) {
                goal = to;
                break;
              }
            }
          }
          block = blk;
          goal = Math.min(goal, far);
          const gapPx = goal - x;
          // (the time since the last frame, as it was: a slow screen's frames still get her there on time)
          const wdt = Math.min(1, gap / 1000);
          const steps = on ? stepsPerBeat(walk.bpm, bpm) : 1;
          if (Math.abs(gapPx) > 1 && !her!.knows(walk.id)) void her!.learn(walk.id).catch(() => {});
          if (Math.abs(gapPx) > 1 && her!.knows(walk.id)) {
            // turned to where she's going, then walking, a step a beat (or every other)
            const face = Math.sign(gapPx) * (Math.PI / 2);
            rot += Math.max(-TURN_RAD_S * wdt, Math.min(TURN_RAD_S * wdt, face - rot));
            if (Math.abs(face - rot) < 0.25) {
              const v = walk.stride * steps * ((on ? bpm : walk.bpm) / 60) * pxPerM();
              x += Math.sign(gapPx) * Math.min(Math.abs(gapPx), v * wdt);
            }
            walking = true;
          } else {
            // there (or her walk not here yet): turned back to the room, stepping till she faces it
            if (Math.abs(gapPx) <= 1) x = goal;
            rot += Math.max(-TURN_RAD_S * wdt, Math.min(TURN_RAD_S * wdt, FACE - rot));
            walking = Math.abs(FACE - rot) > 0.3 && her!.knows(walk.id);
          }
          her!.root.rotation.y = rot;
          const aim = walking ? walk.id : on ? danceAt(Math.floor(b), lk, bpm) : idle.id;
          let want = aim;
          if (on) void her!.learn(danceNext(Math.floor(b), lk, bpm)).catch(() => {});
          if (!her!.knows(want)) {
            void her!.learn(want).catch(() => {});
            // (not here yet: what she's dancing goes on)
            want = cur;
          }
          // the song's outfit: fetched the first time, then changed into in a flash
          const outfit = outfitNow.current();
          if (!change && outfit !== her!.outfit) {
            const next = outfits.get(outfit);
            // (in it once it has the dance she's on: the change mid-step, not back to standing)
            if (next && next.knows(cur)) {
              change = { to: next, at: t, swapped: false };
              next.still();
            } else if (next) void next.learn(cur).catch(() => {});
            // (taught the dance she's about to be on too, so the change needn't wait to learn it)
            else if (!loading.has(outfit)) void fetchOutfit(outfit, [cur, aim]);
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
          // (walking: her walk's beats on the song's, a step on each, or on every other)
          const rateOf = (id: string) => (id === walk.id ? (on ? bpm * steps : walk.bpm) : on ? bpm : (idleBpm(id) ?? bpm)) / 60;
          const tWant = on ? b * (want === walk.id ? steps : 1) : sec * rateOf(want);
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
          const handing = from && k < 1 ? from : null;
          if (k >= 1) from = null;
          // where the dance takes her (Nov 21: her feet stay where they stand, so she moves about as
          // she dances): her canvas goes with her across the stage and she stays in its middle (her
          // canvas is about her arms' width: moving in it, an arm out would be cut off at its edge)
          let hips = hipsOf.get(her!);
          if (!hips) hipsOf.set(her!, (hips = her!.root.getObjectByName("Hips") ?? her!.root));
          her!.root.position.x = 0;
          her!.root.updateMatrixWorld(true);
          // (Nov 21; Steve: 换舞时脚滑) through a hand-over her feet stay where they stand, then step to
          // where the new dance has them, one and then the other (dancer/plant.ts)
          let feet = feetOfHer.get(her!);
          if (feet === undefined) feetOfHer.set(her!, (feet = feetOf(her!.root)));
          if (feet) {
            plantFeet(feet, handing, k);
            // (and between hand-overs, a foot on the floor stays where it came down: plant.ts standFeet)
            standFeet(feet, dt, !handing && !walking && !still.matches);
          }
          const travel = stay ? 0 : hips.getWorldPosition(at).x;
          her!.root.position.x = -travel;
          const slide = x || travel ? `translate3d(${(x + travel * pxPerM()).toFixed(1)}px, 0, 0)` : "";
          if (slide !== slid) el.style.transform = slid = slide;
          // her head to the room (Nov 21; Steve: "人物面部和头部表情僵硬"): turned a good way toward
          // the camera when the dance turns it away (not all the way: the dance's own turns stay),
          // settling there smoothly, and a small nod on each beat while she dances
          let head = headOf.get(her!);
          if (!head) headOf.set(her!, (head = { head: her!.root.getObjectByName("Head"), neck: her!.root.getObjectByName("Neck"), yaw: 0, pitch: 0 }));
          if (head.head && head.neck) {
            her!.root.updateMatrixWorld(true);
            const hq = head.head.getWorldQuaternion(new T.Quaternion());
            const fwd = new T.Vector3(0, 0, 1).applyQuaternion(hq);
            const to = camera.position.clone().sub(head.head.getWorldPosition(new T.Vector3())).normalize();
            const yawTo = Math.atan2(to.x, to.z) - Math.atan2(fwd.x, fwd.z);
            const wrap = Math.atan2(Math.sin(yawTo), Math.cos(yawTo));
            // (Nov 21, Steve: "侧面人脸看起来还是很怪异": her face kept to the room as much as her neck lets it)
            const yawWant = still.matches || walking ? 0 : Math.max(-1.0, Math.min(1.0, wrap * 0.85));
            const pitchWant = still.matches || walking ? 0 : Math.max(-0.2, Math.min(0.2, (Math.asin(to.y) - Math.asin(fwd.y)) * 0.5));
            const ease = 1 - Math.exp(-dt * 4);
            head.yaw += (yawWant - head.yaw) * ease;
            head.pitch += (pitchWant - head.pitch) * ease;
            const nod = on && !walking && !still.matches ? 0.05 * Math.pow(Math.max(0, Math.cos(2 * Math.PI * (b - Math.floor(b)))), 4) : 0;
            const turn = (bone: InstanceType<typeof T.Object3D>, part: number, extra: number) => {
              const parent = bone.parent!.getWorldQuaternion(new T.Quaternion());
              const world = bone.getWorldQuaternion(new T.Quaternion());
              const d = new T.Quaternion().setFromEuler(new T.Euler(-(head!.pitch * part) + extra, head!.yaw * part, 0, "YXZ"));
              bone.quaternion.copy(parent.invert().multiply(d.multiply(world)));
              bone.updateMatrixWorld(true);
            };
            turn(head.neck, 0.4, nod * 0.4);
            turn(head.head, 0.6, nod * 0.6);
          }
          // her hair and skirt follow
          her!.swing(dt);
          // her face (Nov 21; Steve: "表情可以做但要很细致"): a soft smile while she dances, a little more
          // and less over a phrase, fainter standing easy; her brows lift a moment as each new dance
          // starts; every change eased over a good part of a second (dancer/her.ts face, expressions.py)
          {
            const phrase = on ? b / 32 : sec / 20;
            const smileWant = walking ? 0.3 : on ? 0.55 + 0.25 * Math.sin(phrase * Math.PI * 2) : 0.3;
            const browsWant = handing ? Math.sin(Math.min(1, k * 1.6) * Math.PI) * 0.7 : 0;
            const ease = 1 - Math.exp(-dt * 3);
            mood.smile += (smileWant - mood.smile) * ease;
            mood.brows += (browsWant - mood.brows) * Math.min(1, ease * 2);
            her!.face(mood.smile, mood.brows);
          }
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
          if (import.meta.env.DEV) (window as unknown as { __coach3d?: unknown }).__coach3d = { move: cur, dancing: on, beat: b, look: lk, outfit: her!.outfit, outfits: [...outfits.keys()], x: Math.round(x), walking, roam: roamNow.current(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
        };
        tell(watch ? "watching" : "on");
        frame();
        stop = () => {
          cancelAnimationFrame(raf);
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
  return <div className="dj-coach-3d" ref={box} aria-hidden="true" />;
}

/** an idle's own tempo (none: a dance, danced on the song's) */
const idleBpm = (id: string) => IDLES.find((i) => i.id === id)?.bpm;

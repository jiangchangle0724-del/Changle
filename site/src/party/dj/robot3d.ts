/**
 * The robot (CC0, LICENSES.md) for the booth's 3D: the coach on the left (Coach3D) and the floor's
 * dancers (Floor3D). What they share: whether a graphics chip draws WebGL here, the model loaded once
 * for both, and how sharp to draw on a stage the page scales to fit the screen.
 */
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/** The robot, in the site's own files. */
export const MODEL = "/models/robot.glb";

/** In its first seconds, frames mostly slower than this (under 20 a second): a chip too weak for it
 * next to everything else the TV does, and the drawn version instead. */
export const SLOW_MS = 50;
/** How long the frames are watched, and at least how many (a hidden tab's pause left out). */
export const WATCH_MS = 2500;
export const WATCH_FRAMES = 10;

/** The checks' browsers draw WebGL in software only: they take the robots anyway (dj_dance_check.py,
 * dj_floor3d_check.py). */
export const anyGl = () => import.meta.env.DEV && (window as unknown as { __djAnyGl?: boolean }).__djAnyGl === true;

/** Whether the robots' first frames are watched for speed: always, but in the checks' browsers only
 * when they ask (dj_floor3d_check.py slows one down on purpose, to see the drawn floor come back). */
export const watchFrames = () => !anyGl() || (import.meta.env.DEV && (window as unknown as { __djWatch?: boolean }).__djWatch === true);

/**
 * The WebGL 2 three.js needs, and whether a graphics chip draws it. Drawn in software (no chip, or
 * one the browser won't use), the robots would take the TV's processor from the music and the page:
 * the drawn versions stay, and three.js isn't even downloaded.
 */
export function glOf(): "chip" | "software" | "none" {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "none";
    let name = String(gl.getParameter(gl.RENDERER) ?? "");
    if (/^webkit webgl$/i.test(name)) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? name);
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    const strict = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    strict?.getExtension("WEBGL_lose_context")?.loseContext();
    return !strict || /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(name) ? "software" : "chip";
  } catch {
    return "none";
  }
}

type Three = typeof import("three");
export type Robot = { THREE: Three; gltf: GLTF; clone: (o: import("three").Object3D) => import("three").Object3D };

let loading: Promise<Robot> | null = null;

/** three.js, the loader and the robot, fetched once for the coach and the floor together. */
export function loadRobot(): Promise<Robot> {
  loading ??= (async () => {
    const THREE = await import("three");
    const [{ GLTFLoader }, { clone }] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/utils/SkeletonUtils.js")]);
    const gltf = await new GLTFLoader().loadAsync(MODEL);
    return { THREE, gltf, clone };
  })();
  // a failed load (offline a moment) can be tried again later
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

/**
 * How sharp to draw in `el`: the screen's pixels it really covers (the stage is scaled to fit the
 * screen, so a phone's 1600-wide stage is drawn far smaller than its layout says), at most 2.
 */
export function ratioFor(el: HTMLElement): number {
  const shown = el.getBoundingClientRect().width;
  const laid = el.clientWidth || shown || 1;
  const scale = shown > 0 ? shown / laid : 1;
  return Math.max(0.75, Math.min(2, (window.devicePixelRatio || 1) * scale));
}

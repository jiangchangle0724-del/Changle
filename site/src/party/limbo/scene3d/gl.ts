/**
 * Whether this browser draws WebGL 2 with a graphics chip (after the booth's robot3d.ts). Drawn in
 * software, three.js would take the phone's processor from the music and the sensor: the drawn
 * scene stays, and three.js isn't downloaded. The checks' browsers draw in software only, and ask
 * for the 3D anyway (limbo3d_check.py sets `window.__limboGl`).
 */
export function wants3d(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV && (window as unknown as { __limboGl?: boolean }).__limboGl === true) return true;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    let name = String(gl.getParameter(gl.RENDERER) ?? "");
    if (/^webkit webgl$/i.test(name)) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? name);
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    const strict = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    strict?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!strict && !/swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/** Whether the first frames are timed (the checks' browsers are slow on purpose, and skip it unless they ask). */
export const watchFrames = () => !(import.meta.env.DEV && (window as unknown as { __limboGl?: boolean }).__limboGl === true) || (import.meta.env.DEV && (window as unknown as { __limboWatch?: boolean }).__limboWatch === true);

/** How sharp to draw: the screen's pixels, at most 2 (the scene is small; a phone keeps up). */
export const ratio = () => Math.max(1, Math.min(2, window.devicePixelRatio || 1));

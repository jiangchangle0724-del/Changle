// The 3D coach for the pages: whether this device can draw it, and what it dances at a beat of a run.
// Drawn in software (no graphics chip, or one the browser won't use) it would take the speaker's
// processor from the music and the timing, so then the page keeps the coach in words.
import type { Move } from "../../shared/catalog";
import type { RunBeat } from "../../shared/show";
import type { Doing } from "./moves";
import type { CoachInput } from "./stage";

export type GlKind = "chip" | "software" | "none";

export function glKind(): GlKind {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "none";
    let name = String(gl.getParameter(gl.RENDERER) ?? "");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? name);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    const strict = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true });
    strict?.getExtension("WEBGL_lose_context")?.loseContext();
    return !strict || /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render/i.test(name) ? "software" : "chip";
  } catch {
    return "none";
  }
}

/** The checks' browsers draw in software: `?gl=any` lets them have the coach anyway. */
export const anyGl = () => new URLSearchParams(location.search).get("gl") === "any";

/** Whether to draw the coach in 3D here. */
export function canCoach(): boolean {
  const k = glKind();
  return k === "chip" || (k === "software" && anyGl());
}

/** What the hands and feet light up for: arms moves the hands, steps both, full-body moves both. */
export function glowOf(move: Move | null): CoachInput["glow"] {
  if (!move) return { hands: 0.6, feet: 0 };
  if (move.body === "arms") return { hands: 1, feet: 0 };
  return { hands: 0.7, feet: 1 };
}

/** What the coach dances on a beat of a run: the move (where in its 8-count), or a clap on the beat. */
export function doingAt(b: RunBeat, frac: number): { doing: Doing; p: number } {
  if (b.move) return { doing: { kind: "move", id: b.move.id }, p: b.count - 1 + frac };
  return { doing: { kind: "clap" }, p: frac };
}

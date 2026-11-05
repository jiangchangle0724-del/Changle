/**
 * Motion for the home page and the frame every screen shares, with what the browser already has
 * (UI plan A6): the room light as a CSS transition, the house eases as CSS timing functions, and a
 * small helper over the browser's own animations (WAAPI). GSAP is no longer in the first download:
 * it comes with the games that use it (lib/anim.ts).
 */

/** The house eases as CSS timing functions (the same curves as --ease-out and --ease-pop in tokens.css). */
export const EASE = {
  /** quick out, long settle: GSAP's "settle" and expo.out */
  settle: "cubic-bezier(0.16, 1, 0.3, 1)",
  /** a little overshoot: GSAP's back.out */
  pop: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  /** a bigger overshoot, for the dot on the wordmark */
  popBig: "cubic-bezier(0.3, 2.2, 0.6, 1)",
  /** leaving: GSAP's power2.in */
  leave: "cubic-bezier(0.55, 0.06, 0.68, 0.19)",
  /** the room light crossing over: GSAP's power2.inOut */
  cross: "cubic-bezier(0.65, 0.05, 0.36, 1)",
} as const;

export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Play keyframes on an element, unless the phone asks for reduced motion. Nothing stays on the
 * element afterwards (a transform left behind would pin every full-screen layer inside it), unless
 * the options say `fill: "forwards"` for something about to leave the page.
 */
export function play(el: Element | null | undefined, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (!el || reduced() || typeof el.animate !== "function") return null;
  return el.animate(keyframes, options);
}

let currentLight = "";

/**
 * Turn the room light to a color (a game's gel, or a section's tone). It glides because --light
 * is registered as a color (@property in styles/global.css); a browser without that just switches.
 */
export function setLight(color: string, seconds = 0.9) {
  if (typeof document === "undefined" || color === currentLight) return;
  currentLight = color;
  const root = document.documentElement;
  root.style.transition = reduced() ? "" : `--light ${seconds}s ${EASE.cross}`;
  root.style.setProperty("--light", color);
}

/** Section tones for screens that are not a game. */
export const LIGHTS = {
  party: "#b072ff",
  tools: "#9fc3ff",
  wish: "#ffb82e",
  me: "#ff9cc5",
};

/**
 * GSAP setup shared by every screen: plugins registered once, house eases, and the room light
 * (the colored wash at the top of the screen) that crossfades as you move between games.
 */
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(CustomEase, useGSAP);

CustomEase.create("settle", "0.16, 1, 0.3, 1");
CustomEase.create("swing", "0.65, 0, 0.35, 1");

gsap.defaults({ ease: "settle", duration: 0.5 });

export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let lightTween: gsap.core.Tween | null = null;
let currentLight = "";

/** Turn the room light to a color (a game's gel, or a section's tone). */
export function setLight(color: string, seconds = 0.9) {
  if (typeof document === "undefined" || color === currentLight) return;
  currentLight = color;
  const root = document.documentElement;
  lightTween?.kill();
  if (reduced()) {
    root.style.setProperty("--light", color);
    return;
  }
  lightTween = gsap.to(root, { "--light": color, duration: seconds, ease: "power2.inOut" });
}

/** Section tones for screens that are not a game. */
export const LIGHTS = {
  party: "#b072ff",
  tools: "#9fc3ff",
  wish: "#ffb82e",
  me: "#ff9cc5",
};

export { gsap, useGSAP };

// (import.meta.env is Vite's; the tests import this under plain Node, where it isn't there)
if (import.meta.env?.DEV && typeof window !== "undefined") (window as unknown as { gsap: typeof gsap }).gsap = gsap;

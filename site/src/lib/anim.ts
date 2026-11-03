/**
 * GSAP for the games that use it: plugins registered once and the house eases. It loads with those
 * games, never with the home page (UI plan A6); the room light, the section tones and reduced()
 * live in lib/motion.ts and are passed on from here so games can keep importing them from one place.
 */
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(CustomEase, useGSAP);

CustomEase.create("settle", "0.16, 1, 0.3, 1");
CustomEase.create("swing", "0.65, 0, 0.35, 1");

gsap.defaults({ ease: "settle", duration: 0.5 });

export { reduced, setLight, LIGHTS } from "./motion";

export { gsap, useGSAP };

// (import.meta.env is Vite's; the tests import this under plain Node, where it isn't there)
if (import.meta.env?.DEV && typeof window !== "undefined") (window as unknown as { gsap: typeof gsap }).gsap = gsap;

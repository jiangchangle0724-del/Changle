// The big screen's 3D globe over the map in the middle of the round board. It loads globe.js (three.js,
// built separately) only here, so phones never download it, and quietly keeps the flat map if WebGL
// isn't available or motion is reduced. Colours come from the page, so it follows light and dark.
import { useEffect, useRef, useState } from "preact/hooks";
import type { GlobeApi, GlobeColors, mountGlobe } from "../globe/main";
import { COORDS } from "../art/geo";
import { GROUP_DOT, type Flight } from "../art/RouteMap";
import { CITIES } from "../../engine";
import { reducedMotion } from "./Board";

type GlobeModule = { mountGlobe: typeof mountGlobe };
let loading: Promise<GlobeModule> | null = null;

function loadGlobe(): Promise<GlobeModule> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/globe.js";
    s.async = true;
    s.onload = () => {
      const m = (window as unknown as { BeenThereGlobe?: GlobeModule }).BeenThereGlobe;
      if (m) resolve(m);
      else reject(new Error("globe.js loaded without the globe"));
    };
    s.onerror = () => reject(new Error("globe.js failed to load"));
    document.head.appendChild(s);
  });
  return loading;
}

function webgl() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function colors(): GlobeColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    sea: v("--map-sea"),
    land: v("--map-land"),
    line: v("--map-line"),
    ink: v("--board-ink"),
    flight: v("--flight"),
    dots: Object.fromEntries(CITIES.map((c) => [c.id, GROUP_DOT[c.group]])),
  };
}

export function GlobeLayer({ flight, focus }: { flight: Flight | null; focus: string | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useRef<GlobeApi | null>(null);
  const [on, setOn] = useState(false);
  // A flight from before this page opened isn't replayed.
  const before = useRef(flight?.key);
  useEffect(() => {
    if (reducedMotion() || !webgl()) return;
    let gone = false;
    loadGlobe()
      .then((m) => {
        if (gone || !ref.current) return;
        api.current = m.mountGlobe(ref.current, { cities: COORDS, colors: colors() });
        setOn(true);
      })
      .catch(() => {});
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const recolor = () => api.current?.recolor(colors());
    scheme.addEventListener("change", recolor);
    return () => {
      gone = true;
      scheme.removeEventListener("change", recolor);
      api.current?.destroy();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    if (on && focus) api.current?.focus(focus);
  }, [on, focus]);
  useEffect(() => {
    if (on && flight && flight.key !== before.current) api.current?.fly(flight.from, flight.to);
  }, [on, flight?.key]);
  return <canvas ref={ref} class={`globe${on ? " on" : ""}`} aria-hidden="true" />;
}

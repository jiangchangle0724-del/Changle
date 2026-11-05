// The big screen's 3D globe under the map in the middle of the round board. It loads globe.js (three.js,
// built separately) only here, so phones never download it, and quietly keeps the flat map if WebGL
// isn't available or motion is reduced. It wears the real world (NASA's pictures, art/satellite.ts) and
// comes up once those are in, or after a few seconds as painted paper if they're slow; colours for the
// paper and the cities come from the page. A flight is flown by the team's own token.
import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { GlobeApi, GlobeColors, mountGlobe } from "../globe/main";
import { CharacterArt } from "../art/characters";
import { COORDS } from "../art/geo";
import { GROUP_DOT, type Flight } from "../art/RouteMap";
import { MAP_FILES, lightDevice, loadPicture, mapUrl } from "../art/satellite";
import { CITIES } from "../../engine";
import { BASE } from "../base";
import { reducedMotion } from "../motion";

type GlobeModule = { mountGlobe: typeof mountGlobe };
let loading: Promise<GlobeModule> | null = null;

function loadGlobe(): Promise<GlobeModule> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${BASE}/globe.js`;
    s.async = true;
    // A failed load is forgotten, so the next game tries again (a network hiccup isn't for good).
    const fail = (why: string) => {
      loading = null;
      s.remove();
      reject(new Error(why));
    };
    s.onload = () => {
      const m = (window as unknown as { BeenThereGlobe?: GlobeModule }).BeenThereGlobe;
      if (m) resolve(m);
      else fail("globe.js loaded without the globe");
    };
    s.onerror = () => fail("globe.js failed to load");
    document.head.appendChild(s);
  });
  return loading;
}

let gl: boolean | null = null;
function webgl() {
  if (gl !== null) return gl;
  try {
    const c = document.createElement("canvas");
    gl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    gl = false;
  }
  return gl;
}

/** Whether a big screen shows the globe (else its board draws the world flat, as a phone's does). */
export const globeWanted = () => !reducedMotion() && webgl();

/** How long the globe waits for the real world before it comes up as paper. */
const WAIT_FOR_WORLD = 6000;

function colors(): GlobeColors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    sea: v("--map-sea"),
    land: v("--map-land"),
    line: v("--map-line"),
    ink: v("--board-ink"),
    flight: v("--flight"),
    night: v("--night-shade"),
    dots: Object.fromEntries(CITIES.map((c) => [c.id, GROUP_DOT[c.group]])),
  };
}

/**
 * A team's token as a picture for the globe to fly: its character, happy, with the paper edge it wears on
 * the board. Null if the browser can't draw it (then a little plane flies instead).
 */
async function tokenPicture(kind: number): Promise<HTMLCanvasElement | null> {
  const host = document.createElement("div");
  let url = "";
  try {
    render(
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="240" height="240">
        <CharacterArt kind={kind} mood="happy" />
      </svg>,
      host,
    );
    url = URL.createObjectURL(new Blob([host.innerHTML], { type: "image/svg+xml" }));
    const img = await loadPicture(url);
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    if (!g) return null;
    // (the paper edge: the drawing's outline, lit cream, then the drawing over it)
    g.shadowColor = "#f1e6cf";
    g.shadowBlur = 3;
    for (let i = 0; i < 3; i++) g.drawImage(img, 8, 8, 240, 240);
    g.shadowBlur = 0;
    g.drawImage(img, 8, 8, 240, 240);
    // (a browser that won't let a drawing made from an SVG picture go to the graphics card says so
    // here, before the globe tries: then the little plane flies)
    g.getImageData(0, 0, 1, 1);
    return c;
  } catch {
    return null;
  } finally {
    render(null, host);
    if (url) URL.revokeObjectURL(url);
  }
}

export function GlobeLayer({
  flight,
  focus,
  onOn,
  busy,
}: {
  flight: Flight | null;
  focus: string | null;
  onOn?: (on: boolean) => void;
  /** A move is playing on the board: the globe doesn't put its pictures on now (ui/Ride.tsx). */
  busy?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useRef<GlobeApi | null>(null);
  const [on, setOn] = useState(false);
  // The real world's pictures are in, waiting for a quiet moment to be put on.
  const [loaded, setLoaded] = useState(false);
  const waitRef = useRef(0);
  // A flight from before this page opened isn't replayed.
  const before = useRef(flight?.key);
  useEffect(() => {
    if (!globeWanted()) return;
    let gone = false;
    loadGlobe()
      .then((m) => {
        if (gone || !ref.current) return;
        const [day4, night4] = MAP_FILES.globe[4096];
        const [day2, night2] = MAP_FILES.globe[2048];
        api.current = m.mountGlobe(ref.current, {
          cities: COORDS,
          colors: colors(),
          world: { big: [mapUrl(day4), mapUrl(night4)], small: [mapUrl(day2), mapUrl(night2)], light: lightDevice() },
        });
        // (up once it wears the real world; as paper if that takes too long, the world following)
        waitRef.current = window.setTimeout(() => !gone && setOn(true), WAIT_FOR_WORLD);
        void api.current.ready.then((ok) => {
          if (gone) return;
          if (ok) setLoaded(true);
          else {
            clearTimeout(waitRef.current);
            setOn(true);
          }
        });
      })
      .catch(() => {});
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    const recolor = () => api.current?.recolor(colors());
    scheme.addEventListener("change", recolor);
    return () => {
      gone = true;
      clearTimeout(waitRef.current);
      scheme.removeEventListener("change", recolor);
      api.current?.destroy();
      api.current = null;
    };
  }, []);
  // The pictures go on between moves (the first time takes the page a moment).
  useEffect(() => {
    if (!loaded || busy || !api.current?.wear()) return;
    clearTimeout(waitRef.current);
    setOn(true);
  }, [loaded, busy]);
  useEffect(() => {
    if (on && focus) api.current?.focus(focus);
  }, [on, focus]);
  // (the board shows its tokens on the globe, rather than its flat map, once the globe is up)
  useEffect(() => onOn?.(on), [on]);
  useEffect(() => {
    if (!on || !flight || flight.key === before.current) return;
    // (once: a flight held back while a token walks, then handed back, isn't flown twice)
    before.current = flight.key;
    const { from, to, kind } = flight;
    // (the token's picture takes a moment to make; the flight waits for it, never long, even if the next
    // move has begun meanwhile: api.current is gone only with the globe)
    const pic = kind === undefined ? Promise.resolve(null) : tokenPicture(kind);
    void pic.then((c) => api.current?.fly(from, to, c));
  }, [on, flight?.key]);
  return <canvas ref={ref} class={`globe${on ? " on" : ""}`} aria-hidden="true" />;
}

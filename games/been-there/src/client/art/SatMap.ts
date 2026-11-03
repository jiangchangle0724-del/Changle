// Paints the satellite map (art/satellite.ts) into the canvas under the round board, on a phone or a
// laptop (the big screen wraps the same pictures round its globe). The board is drawn first, with the
// drawn map in the middle; the pictures are fetched once the page has settled after that, decoded off
// the page's own thread, and painted: the day picture where the sun is up, the night picture under it
// where it has set, through a small picture of the daylight stretched smooth over the map (the soft line
// between them). Painted again every minute as the night moves on (every five on a light device), and
// never while a move plays, so a ride's frames are the ride's alone. A canvas is a layer of its own: the
// board over it is drawn again without drawing the world again.
import type { RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { MAP_FILES, dayMask, lightDevice, loadPicture, mapUrl, sunNow } from "./satellite";

/** The daylight picture's size: each cell is about 6 px of a 1024 map, and the dusk about six cells wide. */
const MASK_N = 160;

export function useSatMap(canvas: RefObject<HTMLCanvasElement>, on: boolean, busy: () => boolean): boolean {
  const [ready, setReady] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!on) return;
    let gone = false;
    let timer = 0;
    let idle = 0;
    const light = lightDevice();
    const size = light ? 512 : 1024;
    const [dayFile, nightFile] = MAP_FILES.disc[size];
    let pics: [HTMLImageElement, HTMLImageElement] | null = null;
    let drawn = false;
    let paintedAt = 0;
    const mask = document.createElement("canvas");
    mask.width = mask.height = MASK_N;

    const paint = (): boolean => {
      const c = canvas.current;
      const g = c?.getContext("2d");
      const m = mask.getContext("2d");
      if (!c || !g || !m || !pics) return false;
      const [day, night] = pics;
      if (c.width !== size) c.width = c.height = size;
      m.putImageData(new ImageData(dayMask(sunNow(), MASK_N), MASK_N, MASK_N), 0, 0);
      g.save();
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      // the day where the sun is up…
      g.globalCompositeOperation = "copy";
      g.drawImage(day, 0, 0, size, size);
      g.globalCompositeOperation = "destination-in";
      g.drawImage(mask, 0, 0, size, size);
      // …and the night under it where it isn't
      g.globalCompositeOperation = "destination-over";
      g.drawImage(night, 0, 0, size, size);
      // a little shade toward the edge, where the globe curves away
      g.globalCompositeOperation = "source-over";
      const shade = g.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size / 2);
      shade.addColorStop(0, "rgba(6, 8, 24, 0)");
      shade.addColorStop(1, "rgba(6, 8, 24, 0.42)");
      g.fillStyle = shade;
      g.fillRect(0, 0, size, size);
      // round: the corners cut away (with a solid fill: only its shape counts)
      g.globalCompositeOperation = "destination-in";
      g.fillStyle = "#000";
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      g.fill();
      g.restore();
      paintedAt = sunNow();
      c.dataset.at = String(Math.round(paintedAt));
      return true;
    };
    const tick = () => {
      if (gone) return;
      // (not while a move plays or nobody can see it: in a moment)
      if (busyRef.current() || document.hidden || !paint()) {
        timer = window.setTimeout(tick, drawn ? 2000 : 400);
        return;
      }
      if (!drawn) {
        drawn = true;
        setReady(true);
      }
      timer = window.setTimeout(tick, light ? 300_000 : 60_000);
    };
    const start = () => {
      if (gone) return;
      Promise.all([loadPicture(mapUrl(dayFile)), loadPicture(mapUrl(nightFile))])
        .then((p) => {
          if (gone) return;
          pics = p;
          tick();
        })
        // (no pictures: offline, or a page opened from a file: the drawn map stays)
        .catch(() => {});
    };
    // After the first paint, once the page has a quiet moment: the board never waits for the world.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) idle = w.requestIdleCallback(start, { timeout: 1200 });
    else timer = window.setTimeout(start, 200);
    // (back on the page after a while: the night has moved on meanwhile)
    const back = () => {
      if (!document.hidden && drawn && Math.abs(sunNow() - paintedAt) > 60_000) {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      gone = true;
      clearTimeout(timer);
      w.cancelIdleCallback?.(idle);
      document.removeEventListener("visibilitychange", back);
    };
  }, [on]);
  return ready;
}

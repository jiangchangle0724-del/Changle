// Full screen. Android phones, iPads and computers have the browser's own (a button in the top bar
// and the menu). An iPhone doesn't let a web page go full screen (Safari keeps that for video), so
// there the button explains how to add changle.ca to the Home Screen: opened from there it's a web
// app with no address bar or tabs (the game page's manifest makes it start at changle.ca).
type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

const doc = () => document as FsDoc;

export const canFullscreen = () => typeof document !== "undefined" && !!(doc().fullscreenEnabled || doc().webkitFullscreenEnabled);
export const isFullscreen = () => typeof document !== "undefined" && !!(doc().fullscreenElement || doc().webkitFullscreenElement);

/** Opened from the Home Screen as a web app: no browser bars to hide. */
export const isStandalone = () =>
  (typeof matchMedia === "function" && (matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches)) ||
  (typeof navigator !== "undefined" && (navigator as { standalone?: boolean }).standalone === true);

/** An iPhone (or iPod): no full screen and no vibration for web pages. */
export const isIPhone = () => typeof navigator !== "undefined" && /iPhone|iPod/.test(navigator.userAgent);

/** What the full screen button does here: the browser's own, the iPhone's way, or nothing (already). */
export function fullscreenOffer(): "toggle" | "iphone" | null {
  if (typeof document === "undefined" || isStandalone()) return null;
  if (canFullscreen()) return "toggle";
  return isIPhone() ? "iphone" : null;
}

type Lockable = ScreenOrientation & { lock?: (o: "landscape" | "portrait") => Promise<void>; unlock?: () => void };
const orientation = () => (typeof screen !== "undefined" ? (screen.orientation as Lockable | undefined) : undefined);

export async function toggleFullscreen() {
  try {
    if (isFullscreen()) {
      orientation()?.unlock?.();
      if (document.exitFullscreen) await document.exitFullscreen();
      else doc().webkitExitFullscreen?.();
      return;
    }
    const el = document.documentElement as FsEl;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else el.webkitRequestFullscreen?.();
  } catch {
    // the browser said no (it wants a tap, or the page isn't allowed)
    return;
  }
  // A phone keeps the way it was held when it went full screen (Android): one put down flat on the
  // table between turns doesn't flip its board round. Leaving full screen lets it turn again.
  const o = orientation();
  if (o?.lock && typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches)
    await o.lock(o.type.startsWith("landscape") ? "landscape" : "portrait").catch(() => {});
}

/** Call `then` when full screen starts or ends (the button, Escape, the back gesture). */
export function onFullscreenChange(then: () => void): () => void {
  document.addEventListener("fullscreenchange", then);
  document.addEventListener("webkitfullscreenchange", then);
  return () => {
    document.removeEventListener("fullscreenchange", then);
    document.removeEventListener("webkitfullscreenchange", then);
  };
}

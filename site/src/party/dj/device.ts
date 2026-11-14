/**
 * An iPhone or iPad as the speaker (iPadOS says it's a Mac, with a touch screen): a page there has
 * little memory to spare, and Safari reloads one that takes too much (Steve on Nov 14: pressing 切歌
 * or putting the video over the whole TV, the shared phone reloaded and wanted a tap again). The
 * booth draws lighter there: its 3D at one pixel per point, YouTube's player kept small inside and
 * drawn bigger, so it never streams in 4K. (The checks' browsers can ask for it: `__djLight`.)
 */
export function appleTouch(): boolean {
  if (typeof navigator === "undefined") return false;
  if (import.meta.env.DEV) {
    const ask = (window as unknown as { __djLight?: boolean }).__djLight;
    if (typeof ask === "boolean") return ask;
  }
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

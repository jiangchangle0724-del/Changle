// Keep the screen on while a game is open: a phone set down on the table between turns, or the TV
// showing the board, shouldn't go dark mid-game. The browser lets the lock go when the page is
// hidden, so it's asked for again when the page comes back, and on the next tap if a browser
// wanted one first. (Screen Wake Lock: Chrome 84, Safari 16.4, iPhone Home Screen apps iOS 18.4.)
import { useEffect } from "preact/hooks";

interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}
type WakeNav = Navigator & { wakeLock?: { request(type: "screen"): Promise<Sentinel> } };

export function useWakeLock(on: boolean) {
  useEffect(() => {
    const nav = navigator as WakeNav;
    if (!on || !nav.wakeLock) return;
    let lock: Sentinel | null = null;
    let asking = false;
    let gone = false;
    const ask = () => {
      if (gone || asking || document.visibilityState !== "visible" || (lock && !lock.released)) return;
      asking = true;
      nav
        .wakeLock!.request("screen")
        .then((l) => {
          if (gone) void l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {
          // not allowed here (no tap yet, a frame that may not, battery saver): screens dim as usual
        })
        .finally(() => (asking = false));
    };
    ask();
    document.addEventListener("visibilitychange", ask);
    document.addEventListener("pointerdown", ask, { passive: true });
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", ask);
      document.removeEventListener("pointerdown", ask);
      void lock?.release().catch(() => {});
    };
  }, [on]);
}

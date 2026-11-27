import { useEffect } from "react";

/**
 * 林波舞 is played with the phone upright on the chest, and a tilt-through bar asks for it to be
 * tilted sideways: on a phone that rotates, the page turned to landscape mid-lean (Steve,
 * 2026-11-26: 「只支持竖屏，手机怎么转都是影响游戏内的动作，不会影响屏幕方向」). A web page can't
 * lock the orientation (iPhone Safari has no lock at all, Android's wants full screen), so while this
 * game is on, `<html data-portrait>` says the page is portrait only (the hints that say to turn the
 * phone stay away: ui/ScreenHints.tsx), and when the phone has turned, `data-turned="ccw|cw"` says
 * which way: party.css then draws the body portrait-sized and rotated back against the phone, and
 * the sideways layouts (styles/landscape.css, games/GameShell.css, ui/GameHeader.tsx) stand aside.
 * The sensors are read in the phone's own frame, so the game itself never noticed the turn. Only this
 * game: both go when it unmounts.
 */
export function usePortrait() {
  useEffect(() => {
    const html = document.documentElement;
    html.dataset.portrait = "";
    const apply = () => {
      // how far the screen is turned from the phone's natural way up: 90 when its top went left
      // (turned counter-clockwise), 270 (or -90, older iPhones) when it went right; 0 on a desktop
      const o = screen.orientation;
      const angle = o ? o.angle : ((window as unknown as { orientation?: number }).orientation ?? 0);
      // (a phone: a tablet on its side is left as it is)
      const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
      const turn = !phone ? "" : angle === 90 ? "ccw" : angle === 270 || angle === -90 ? "cw" : "";
      if (turn) html.dataset.turned = turn;
      else delete html.dataset.turned;
    };
    apply();
    const o = screen.orientation;
    o?.addEventListener("change", apply);
    window.addEventListener("orientationchange", apply);
    window.addEventListener("resize", apply);
    return () => {
      o?.removeEventListener("change", apply);
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("resize", apply);
      delete html.dataset.turned;
      delete html.dataset.portrait;
    };
  }, []);
}

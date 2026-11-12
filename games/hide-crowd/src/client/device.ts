// What kind of phone this is, for the two things that depend on it: the game is played sideways
// (a phone held upright is asked to turn), and an iPhone can't make a web page full screen, so it is
// shown how to put changle.ca on its Home Screen, where the game opens without Safari's bars.

const query = (text: string) => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(text).matches;
const agent = () => (typeof navigator === "undefined" ? "" : navigator.userAgent);

/** A phone or a tablet: fingers, not a mouse. */
export const touchScreen = () => query("(pointer: coarse)");

/** Held upright on a touch screen (a computer's narrow window is left alone). */
export const UPRIGHT = "(orientation: portrait) and (pointer: coarse)";

/** An iPhone, an iPod or an iPad (which may call itself a Mac). */
export function appleTouch(): boolean {
  if (/iPhone|iPad|iPod/i.test(agent())) return true;
  return typeof navigator !== "undefined" && /Macintosh/i.test(agent()) && navigator.maxTouchPoints > 1;
}

/** Opened from the Home Screen: no browser bars around the game. */
export function homeScreenApp(): boolean {
  const standalone = typeof navigator !== "undefined" && (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || query("(display-mode: standalone)") || query("(display-mode: fullscreen)");
}

/** Inside another app's browser (WeChat, Instagram, Facebook, LINE, Weibo, QQ): it has to go to Safari first. */
export const inAppBrowser = () => /MicroMessenger|Instagram|FBAN|FBAV|Line\/|Weibo|QQ\//i.test(agent());

/** An iPhone (or iPad) that would get the whole screen for the game by opening it from the Home Screen. */
export const wantsHomeScreen = () => appleTouch() && !homeScreenApp();

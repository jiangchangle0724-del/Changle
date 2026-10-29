// Whether to keep motion down: the player's own choice in the menu, or the phone's setting.
import { prefs } from "./prefs";

export const reducedMotion = () => prefs.reduced || (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

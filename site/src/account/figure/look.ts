/**
 * The 3D figure's look on this phone (localStorage), and everything about a look
 * (src/shared/figureLook.ts: the account keeps the same thing).
 */
import { checkLook, type Look } from "../../shared/figureLook";

export * from "../../shared/figureLook";

const KEY = "figure.look";

/** what's kept on this phone, checked (an old or broken one gives the default) */
export function readLook(): Look {
  let raw: unknown = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    raw = null;
  }
  return checkLook(raw);
}

export function saveLook(look: Look) {
  try {
    localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // private mode or full: it just won't be remembered
  }
}


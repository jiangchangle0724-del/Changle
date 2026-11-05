// What this phone remembers, in its own storage. changle.ca is the same site, so the table writes
// the player's name and language here before sending the phone in (site/src/party/hide/link.ts
// writes the same keys): hc.name, hc.lang, hc.cid. Nothing breaks without storage (private mode):
// the game asks again.

import type { Lang } from "../room/protocol";

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: forgotten next time
  }
}

function hex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

/** This device's id in the game (it keeps the seat across reloads); a big screen has its own. */
export function identity(screen = false): string {
  const key = screen ? "hc.cid.tv" : "hc.cid";
  let id = get(key);
  if (!id || !/^[0-9a-f]{24}$/.test(id)) {
    id = hex(12);
    set(key, id);
  }
  return id;
}

export const savedName = () => (get("hc.name") ?? "").slice(0, 16);
export const saveName = (value: string) => set("hc.name", value.replace(/\s+/g, " ").trim().slice(0, 16));

export function savedLang(): Lang {
  const saved = get("hc.lang");
  if (saved === "zh" || saved === "en") return saved;
  try {
    return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  } catch {
    return "zh";
  }
}
export const saveLang = (value: Lang) => set("hc.lang", value);

/** The game's own reduced-motion switch: "on", "off", or follow the phone's setting. */
export function savedReduced(): "on" | "off" | "system" {
  const saved = get("hc.reduced");
  return saved === "1" ? "on" : saved === "0" ? "off" : "system";
}
export const saveReduced = (value: "on" | "off" | "system") => set("hc.reduced", value === "on" ? "1" : value === "off" ? "0" : "");

/** Reduced motion right now: the game's switch, else the phone's setting. */
export function reducedNow(): boolean {
  const flag = typeof document !== "undefined" ? document.documentElement.dataset.reduced : undefined;
  if (flag === "1") return true;
  if (flag === "0") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

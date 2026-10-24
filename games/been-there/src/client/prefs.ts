// What this phone remembers: who it is (to get back to the same seat), name, language, sound.
import type { Lang } from "../room/protocol";

const memory = new Map<string, string>();
function get(k: string): string | null {
  try {
    return localStorage.getItem(k) ?? memory.get(k) ?? null;
  } catch {
    return memory.get(k) ?? null;
  }
}
function set(k: string, v: string) {
  memory.set(k, v);
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: keep it for this visit only
  }
}

function randomId(bytes = 16) {
  const a = new Uint8Array(bytes);
  if (typeof globalThis.crypto?.getRandomValues === "function") crypto.getRandomValues(a);
  else for (let i = 0; i < bytes; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This device's id and secret key. The key proves to the server that the seat is ours after a reconnect. */
export function identity(scope = "") {
  let cid = get(`bt.cid${scope}`);
  let key = get(`bt.key${scope}`);
  if (!cid || !key) {
    cid = randomId(12);
    key = randomId(24);
    set(`bt.cid${scope}`, cid);
    set(`bt.key${scope}`, key);
  }
  return { cid, key };
}

const prefersReduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export const prefs = {
  get name() {
    return get("bt.name") ?? "";
  },
  set name(v: string) {
    set("bt.name", v);
  },
  get lang(): Lang {
    const v = get("bt.lang");
    if (v === "zh" || v === "en") return v;
    return typeof navigator !== "undefined" && /^zh/i.test(navigator.language) ? "zh" : navigator?.language ? "en" : "zh";
  },
  set lang(v: Lang) {
    set("bt.lang", v);
  },
  get muted() {
    return get("bt.muted") === "1";
  },
  set muted(v: boolean) {
    set("bt.muted", v ? "1" : "0");
  },
  get reduced() {
    const v = get("bt.reduced");
    return v === null ? prefersReduced() : v === "1";
  },
  set reduced(v: boolean) {
    set("bt.reduced", v ? "1" : "0");
  },
};

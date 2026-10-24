// What this phone remembers: who it is (to get back to the same seat), name, language, last start.
import type { Center, Lang, RangeId } from "../engine";

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
export function identity() {
  let cid = get("sb.cid");
  let key = get("sb.key");
  if (!cid || !key) {
    cid = randomId(12);
    key = randomId(24);
    set("sb.cid", cid);
    set("sb.key", key);
  }
  return { cid, key };
}

function json<T>(k: string): T | null {
  try {
    return JSON.parse(get(k) ?? "null") as T | null;
  } catch {
    return null;
  }
}

export const prefs = {
  get name() {
    return get("sb.name") ?? "";
  },
  set name(v: string) {
    set("sb.name", v);
  },
  get lang(): Lang {
    const v = get("sb.lang");
    if (v === "zh" || v === "en") return v;
    return typeof navigator !== "undefined" && navigator.language && !/^zh/i.test(navigator.language) ? "en" : "zh";
  },
  set lang(v: Lang) {
    set("sb.lang", v);
  },
  /** The last starting point and range, so the host doesn't pick them every time. */
  get start(): { center: Center; range: RangeId } | null {
    return json("sb.start");
  },
  set start(v: { center: Center; range: RangeId } | null) {
    set("sb.start", JSON.stringify(v));
  },
  /** Tables this phone has rated (so the home page stops asking). */
  rated(code: string): boolean {
    return (json<string[]>("sb.rated") ?? []).includes(code);
  },
  markRated(code: string) {
    set("sb.rated", JSON.stringify([...(json<string[]>("sb.rated") ?? []), code].slice(-30)));
  },
};

export const inWeChat = () => typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);
